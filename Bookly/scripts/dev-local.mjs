import {spawn} from 'node:child_process';
try{process.loadEnvFile(new URL('../.env.local',import.meta.url));}catch(error){if(error.code!=='ENOENT')throw error;}
const key=process.env.OPENROUTER_API_KEY?.trim();
if(!key||key==='your_openrouter_key_here'){
 console.error('Bookly setup: copy .env.example to .env.local, set OPENROUTER_API_KEY to your own OpenRouter key, then run npm run dev again. See README.md → Quick start.');
 process.exit(1);
}
const children=[spawn(process.execPath,['server/server.mjs'],{stdio:'inherit'}),spawn(process.execPath,['scripts/run-framework.mjs','dev'],{stdio:'inherit'})];
let stopping=false;
const stop=()=>{if(stopping)return;stopping=true;for(const c of children)c.kill('SIGTERM');};
for(const c of children){
 c.on('error',error=>{console.error(`Bookly could not start a local process: ${error.message}`);stop();process.exitCode=1;});
 c.on('exit',code=>{stop();process.exitCode=code??process.exitCode??0;});
}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
