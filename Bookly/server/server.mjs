import http from 'node:http';
import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync} from 'node:fs';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {makeSeed,policyMarkdown,toolCatalog} from './seed.mjs';
import {newSession,runAgent,executeTool,confirmAction,audit,inferIntent} from './engine.mjs';
import {demoFlows,createDemoSession} from './demo.mjs';
import {runDemoSuite} from './evaluations.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
try{process.loadEnvFile(`${root}.env.local`);}catch{}
const port=Number(process.env.API_PORT||4311);
const statePath=`${root}.local/state.json`;
mkdirSync(`${root}.local`,{recursive:true});
let state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):makeSeed();
const save=()=>{writeFileSync(`${statePath}.tmp`,JSON.stringify(state,null,2),{mode:0o600});renameSync(`${statePath}.tmp`,statePath);};
save();
const busy=new Set();const rates=new Map();let suiteRunning=false;
const key=()=>process.env.OPENROUTER_API_KEY;
const json=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
async function body(req){let b='';for await(const c of req){b+=c;if(b.length>32000)throw new Error('Request too large.');}return b?JSON.parse(b):{};}
function sessionFor(req,res){
 const raw=req.headers.cookie?.match(/(?:^|;\s*)chapter_session=([^;]+)/)?.[1];
 const s=raw&&Object.hasOwn(state.sessions,raw)&&state.sessions[raw];if(s)return s;
 const created=newSession();state.sessions[created.id]=created;
 res.setHeader('Set-Cookie',`chapter_session=${created.id}; HttpOnly; SameSite=Strict; Path=/`);return created;
}
function publicSession(s){
 let intent=null;
 const messages=s.messages.map(m=>{
  if(m.role==='user')intent=inferIntent(m.text,intent);
  return m.role==='assistant'&&intent==='discovery'?{...m,ui:m.ui?.filter(c=>!(c.type==='form'&&c.kind==='isbn'))}:m;
 });
 return {id:s.id,messages,status:s.status,verified:!!s.verifiedOrder,verifiedOrder:s.verifiedOrder,demoFlow:s.demoFlow??null,demoOrder:s.demoOrder??null,intent:s.intent??intent};
}
const safeEqual=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
function checkRate(id){const now=Date.now();const values=(rates.get(id)||[]).filter(t=>now-t<60000);if(values.length>=15)return false;values.push(now);rates.set(id,values);return true;}

function summary(){
 const sessions=Object.values(state.sessions).filter(s=>!s.evaluation);
 const active=sessions.filter(s=>s.turns>0);const resolved=active.filter(s=>s.resolved&&s.status!=='escalated');
 const traces=active.flatMap(s=>s.traces);const replies=active.flatMap(s=>s.messages.filter(m=>m.role==='assistant'&&m.ms));
 return {conversations:active.length,resolved:resolved.length,resolutionRate:active.length?Math.round(resolved.length/active.length*100):0,
  toolCalls:traces.length,blocked:state.audit.filter(a=>['action.blocked','tool.blocked','guardrail.blocked'].includes(a.event)).length,
  handoffs:state.tickets.length,completedActions:active.reduce((n,s)=>n+s.completedActions,0),
  avgResponseMs:replies.length?Math.round(replies.reduce((n,r)=>n+r.ms,0)/replies.length):0,
  estimatedBenefit:resolved.length*(state.config.economics.humanCost-state.config.economics.aiCost),
  minutesSaved:resolved.length*state.config.economics.minutesSaved};
}
function guardrailTests(){
 const tests=[];const t=(name,fn)=>{try{const detail=fn();tests.push({name,passed:true,detail});}catch(e){tests.push({name,passed:false,detail:e.message});}};
 const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
 t('Order data requires verification',()=>{const x=executeTool(makeSeed(),newSession(),'lookup_order',{},[]);assert(!!x.error,'Unverified access was allowed');return 'Unverified session receives no order data.';});
 t('Model cannot execute a write',()=>{const s=makeSeed(),c=newSession();c.verifiedOrder='CH-1043';c.policyReadVersion=s.config.version;const u=[];executeTool(s,c,'request_action',{action:'cancel'},u);assert(s.orders.find(o=>o.id==='CH-1043').status==='processing','Order changed before confirmation');return 'Tool stages a pending action; order remains processing.';});
 t('Confirmation tokens cannot be reused',()=>{const s=makeSeed(),c=newSession();c.verifiedOrder='CH-1043';c.policyReadVersion=s.config.version;executeTool(s,c,'request_action',{action:'cancel'},[]);const token=c.pending.token;assert(!confirmAction(s,c,token).error,'First confirmation failed');assert(!!confirmAction(s,c,token).error,'Replay was accepted');return 'First confirmation succeeds; replay is rejected.';});
 t('Shipped orders cannot be cancelled',()=>{const s=makeSeed(),c=newSession();c.verifiedOrder='CH-1042';c.policyReadVersion=s.config.version;assert(!!executeTool(s,c,'request_action',{action:'cancel'},[]).error,'Shipped cancellation allowed');return 'Server enforces the processing-only rule.';});
 t('Policy changes invalidate confirmations',()=>{const s=makeSeed(),c=newSession();c.verifiedOrder='CH-1043';c.policyReadVersion=s.config.version;executeTool(s,c,'request_action',{action:'cancel'},[]);const token=c.pending.token;s.config.version++;assert(!!confirmAction(s,c,token).error,'Stale confirmation allowed');return 'Action must be proposed again under the current policy.';});
 t('Disabled tools cannot run',()=>{const s=makeSeed(),c=newSession();s.config.enabledTools=[];assert(!!executeTool(s,c,'recommend_books',{query:'fiction',max_price:50},[]).error,'Disabled tool ran');return 'Tool allowlist is checked in the executor.';});
 t('Replacement is idempotent',()=>{const s=makeSeed(),c=newSession();c.verifiedOrder='CH-1042';c.policyReadVersion=s.config.version;executeTool(s,c,'request_action',{action:'replacement'},[]);assert(!confirmAction(s,c,c.pending.token).error,'Replacement failed');assert(!!executeTool(s,c,'request_action',{action:'replacement'},[]).error,'Duplicate replacement allowed');return 'Only one replacement can be created per original order.';});
 return tests;
}
const server=http.createServer(async(req,res)=>{
 try{
   const host=req.headers.host??'';
   if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))return json(res,403,{error:'Local demo only.'});
   const origin=req.headers.origin;
   if(origin&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))return json(res,403,{error:'Cross-origin requests are not allowed.'});
   const url=new URL(req.url,'http://localhost');const path=url.pathname;
   if(path==='/api/health')return json(res,200,{ok:true,provider:'OpenRouter',configured:!!key(),model:state.config.model,demo:true});
   if(path==='/api/catalog')return json(res,200,{books:state.books,policy:state.config.policy});
   if(path==='/api/demo/flows')return json(res,200,demoFlows);
   if(path==='/api/demo/start'&&req.method==='POST'){
     const b=await body(req);const s=createDemoSession(state,b.flowId);
     res.setHeader('Set-Cookie',`chapter_session=${s.id}; HttpOnly; SameSite=Strict; Path=/`);
     audit(state,s,'demo.started',{flow:s.demoFlow});save();return json(res,200,publicSession(s));
   }
   if(path==='/api/admin'&&req.method==='GET')return json(res,200,{config:state.config,books:state.books,tools:toolCatalog,policyMarkdown:policyMarkdown(state.config),metrics:summary(),sessions:Object.values(state.sessions).filter(s=>!s.evaluation&&s.turns).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(s=>({id:s.id,createdAt:s.createdAt,updatedAt:s.updatedAt,status:s.status,resolved:s.resolved,turns:s.turns,completedActions:s.completedActions,messages:s.messages,traces:s.traces,errors:s.errors,tokens:s.tokens})),tickets:state.tickets,audit:state.audit.slice(0,100),evaluations:state.evaluations,configured:!!key()});
   if(path==='/api/admin/config'&&req.method==='POST'){
     const b=await body(req);const c=b.config;
     if(!c||typeof c.prompt!=='string'||c.prompt.length>15000)return json(res,400,{error:'Prompt must be text, up to 15,000 characters.'});
     if(typeof c.model!=='string'||!/^[\w.-]+\/[\w.:/-]+$/.test(c.model))return json(res,400,{error:'Use a valid provider/model ID.'});
     if(!Array.isArray(c.enabledTools)||c.enabledTools.some(t=>!toolCatalog.some(x=>x.name===t)))return json(res,400,{error:'Unknown tool.'});
     const p=c.policy,e=c.economics;
     if(!p||![p.returnDays,p.freeShipping,p.shippingFee,p.replacementAfterDays].every(n=>Number.isFinite(n)&&n>=0)||p.returnDays>365||p.replacementAfterDays>90||typeof p.shippingDays!=='string'||p.shippingDays.length>100||typeof p.notes!=='string'||p.notes.length>3000)return json(res,400,{error:'Invalid policy fields.'});
     if(!e||![e.humanCost,e.aiCost,e.minutesSaved].every(n=>Number.isFinite(n)&&n>=0&&n<=10000))return json(res,400,{error:'Invalid economics assumptions.'});
     state.config={version:state.config.version+1,model:c.model,prompt:c.prompt,enabledTools:c.enabledTools,guardrails:{scope:!!c.guardrails?.scope,catalogOnly:!!c.guardrails?.catalogOnly,policyGrounding:!!c.guardrails?.policyGrounding},policy:p,economics:e};
     audit(state,null,'config.published',{version:state.config.version});save();return json(res,200,{ok:true,version:state.config.version});
   }
   if(path==='/api/admin/inventory'&&req.method==='POST'){
     const b=await body(req);const book=state.books.find(x=>x.id===b.id);
     if(!book||!Number.isInteger(b.stock)||b.stock<0||b.stock>9999||!Number.isFinite(b.price)||b.price<0||b.price>1000)return json(res,400,{error:'Invalid inventory update.'});
     book.stock=b.stock;book.price=b.price;audit(state,null,'inventory.updated',{bookId:book.id,stock:book.stock,price:book.price});save();return json(res,200,{ok:true});
   }
   if(path==='/api/admin/ticket'&&req.method==='POST'){
     const b=await body(req);const ticket=state.tickets.find(t=>t.id===b.id);if(!ticket)return json(res,404,{error:'Ticket not found.'});ticket.status=b.status==='closed'?'closed':'open';audit(state,null,'ticket.updated',{id:ticket.id,status:ticket.status});save();return json(res,200,{ok:true});
   }
   if(path==='/api/admin/evaluate'&&req.method==='POST'){
     const results=guardrailTests();const run={id:randomUUID(),time:new Date().toISOString(),type:'Deterministic server checks',results};state.evaluations.unshift(run);state.evaluations=state.evaluations.slice(0,10);audit(state,null,'evaluation.completed',{passed:results.filter(x=>x.passed).length,total:results.length});save();return json(res,200,run);
   }
   if(path==='/api/admin/redteam'&&req.method==='POST'){
     if(suiteRunning)return json(res,409,{error:'An evaluation suite is already running.'});
     if(!checkRate('eval'))return json(res,429,{error:'Please wait before running another evaluation.'});
     suiteRunning=true;
     try{const run=await runDemoSuite(state.config,{key:key()});state.evaluations.unshift(run);state.evaluations=state.evaluations.slice(0,10);save();return json(res,200,run);}finally{suiteRunning=false;}
   }
   const session=sessionFor(req,res);
   if(path==='/api/session'&&req.method==='GET')return json(res,200,publicSession(session));
   if(path==='/api/session/new'&&req.method==='POST'){
     const s=newSession();state.sessions[s.id]=s;res.setHeader('Set-Cookie',`chapter_session=${s.id}; HttpOnly; SameSite=Strict; Path=/`);save();return json(res,200,publicSession(s));
   }
   if(path==='/api/cart'&&req.method==='POST'){
     const {bookId}=await body(req);const b=state.books.find(x=>x.id===bookId);if(!b||b.stock<1)return json(res,409,{error:'This book is out of stock.'});
     audit(state,session,'cart.added',{bookId,price:b.price,attributedToChat:session.traces.some(t=>['recommend_books','lookup_isbn'].includes(t.name))});save();return json(res,200,{ok:true,book:b});
   }
   if(['/api/chat','/api/form','/api/confirm'].includes(path)&&req.method==='POST'){
     if(busy.has(session.id))return json(res,409,{error:'Please wait for the current response.'});
     if(!checkRate(session.id))return json(res,429,{error:'Please wait a moment before sending more messages.'});
     busy.add(session.id);
     try{
       const b=await body(req);let message,displayMessage;
       if(path==='/api/chat'){
         if(typeof b.message!=='string'||!b.message.trim()||b.message.length>3000)return json(res,400,{error:'Enter a message of up to 3,000 characters.'});
         if(session.status==='closed')return json(res,409,{error:'This conversation is closed. Start a new conversation.'});
         message=b.message.trim();
       }else if(path==='/api/form'){
         if(b.kind==='isbn'){
           if(typeof b.isbn!=='string'||b.isbn.length>30)return json(res,400,{error:'Enter a valid ISBN.'});
           message=`[ISBN form submitted] Please look up this ISBN: ${b.isbn}`;
           displayMessage=`Look up ISBN ${b.isbn}`;
         }else if(b.kind==='order_verification'){
           const order=state.orders.find(o=>o.id===String(b.orderId??'').trim().toUpperCase());
           if(!order||(order.ownerSession&&order.ownerSession!==session.id)||!safeEqual(order.email,String(b.email??'').trim().toLowerCase())){audit(state,session,'guardrail.blocked','Order verification did not match.');save();return json(res,400,{error:`Those details don’t match a demo order. Try ${session.demoOrder?.id??'CH-1042'} and alex@example.com.`});}
           session.verifiedOrder=order.id;session.pending=null;
           audit(state,session,'order.verified',{orderId:order.id});
           message=`[Server verified order form] This session is now verified for ${order.id}. Please use lookup_order and help me with the issue I described.`;
           displayMessage=`Verified demo order ${order.id}`;
         }else return json(res,400,{error:'Unknown form.'});
       }else{
         const result=confirmAction(state,session,b.token);if(result.error){audit(state,session,'action.blocked',result.error);save();return json(res,409,result);}
         const reply={id:randomUUID(),role:'assistant',text:result.message,primitives:['Act','Answer'],ui:[{type:'success',label:result.action==='cancel'?'Cancellation confirmed':'Replacement confirmed'}],traces:[],time:new Date().toISOString()};
         session.messages.push({id:randomUUID(),role:'user',text:`Confirmed ${result.action} for ${result.orderId}`,time:new Date().toISOString()},reply);
         session.apiMessages.push({role:'user',content:`[Server-confirmed action result] ${JSON.stringify(result)}`},{role:'assistant',content:result.message});session.updatedAt=new Date().toISOString();save();return json(res,200,{reply,session:publicSession(session)});
       }
       const reply=await runAgent(state,session,message,{key:key(),displayMessage});save();return json(res,200,{reply,session:publicSession(session)});
     }finally{busy.delete(session.id);save();}
   }
   return json(res,404,{error:'Not found.'});
 }catch(e){return json(res,500,{error:String(e.message||'Request failed.').replace(/sk-[\w-]+/g,'[redacted]')});}
});
server.listen(port,'127.0.0.1',()=>console.log(`Bookly API: http://127.0.0.1:${port} (local demo)`));
