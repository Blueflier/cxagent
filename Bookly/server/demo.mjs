import {randomUUID} from 'node:crypto';
import {makeSeed} from './seed.mjs';
import {newSession} from './engine.mjs';

export const demoFlows=[
 {id:'discovery',title:'Find a new favorite',value:'Make money',starter:'Heop me find a good book.',steps:['Ask for a book','Share your taste','Explore book cards'],hint:'Try: “Hopeful sci-fi about unlikely friendships, under $25.”'},
 {id:'isbn',title:'Find the exact edition',value:'Save time',starter:'I have an ISBN. Can you find the exact book?',steps:['Ask for an ISBN lookup','Submit the ISBN form','See edition, stock & price'],hint:'Demo ISBN: 9780593135204 · Project Hail Mary'},
 {id:'delivery',title:'Make a delivery right',value:'Reduce risk',starter:'My book hasn’t arrived, and it was a gift. Could you send a replacement?',steps:['Describe the missing delivery','Verify the demo order','Review & confirm replacement'],hint:'A fresh fictional order is created each time. No real shipment is sent.'},
];

export function createDemoSession(state,flowId){
 const flow=demoFlows.find(f=>f.id===flowId);if(!flow)throw new Error('Unknown demo flow.');
 const session=newSession();session.demoFlow=flow.id;
 if(flow.id==='delivery'){
  const order={...makeSeed().orders[0],id:`CH-D${randomUUID().slice(0,6).toUpperCase()}`,ownerSession:session.id};
  state.orders.push(order);session.demoOrder={id:order.id,email:order.email};
 }
 state.sessions[session.id]=session;return session;
}
