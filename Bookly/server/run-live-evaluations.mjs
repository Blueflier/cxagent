import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {defaultConfig} from './seed.mjs';
import {runDemoSuite} from './evaluations.mjs';
try{process.loadEnvFile(new URL('../.env.local',import.meta.url));}catch{}
const stateURL=new URL('../.local/state.json',import.meta.url);
const config=existsSync(stateURL)?JSON.parse(readFileSync(stateURL,'utf8')).config:defaultConfig;
if(!process.env.OPENROUTER_API_KEY)throw new Error('Configure OPENROUTER_API_KEY before running live evaluations.');
const result=await runDemoSuite(config,{key:process.env.OPENROUTER_API_KEY,onProgress:r=>console.log(`${r.passed?'PASS':'FAIL'} ${r.name}${r.passed?'':`: ${r.detail}`}`)});
mkdirSync(new URL('../.local/',import.meta.url),{recursive:true});
writeFileSync(new URL('../.local/live-evaluation.json',import.meta.url),JSON.stringify(result,null,2));
console.log(`${result.results.filter(r=>r.passed).length}/${result.results.length} checks passed.`);
if(result.results.some(r=>!r.passed))process.exitCode=1;
