// Capture public tool definitions only. No chart library is opened or read.
import {writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {registerTools,runWithWriteActivity} from '../mcp/core-tools.mjs';
import {registerHistoryTools} from '../mcp/history-tools.mjs';
import {registerEditHistoryTools} from '../mcp/edit-history-tools.mjs';
import {registerInsightTools} from '../mcp/insight-tools.mjs';
import {registerSupplementTools} from '../mcp/supplement-tools.mjs';
import {version} from '../package.json';
interface Definition{name:string;description:string;inputSchema:unknown;annotations?:unknown}
const target=process.argv[2];if(!target)throw Error('Supply the private plugin reference output directory.');
const tools:Definition[]=[];
const server={registerTool:(name:string,config:{description:string;inputSchema:Record<string,z.ZodType>;annotations?:unknown})=>tools.push({...config,name,inputSchema:z.toJSONSchema(z.object(config.inputSchema).strict(),{io:'input'})})};
registerTools(server,{});registerHistoryTools(server,{});registerEditHistoryTools(server,{});registerInsightTools(server,{});registerSupplementTools(server,{},runWithWriteActivity);
const browser:Definition[]=[];
Object.defineProperty(globalThis,'document',{value:{modelContext:{registerTool:(tool:Definition)=>{browser.push(tool);}}},configurable:true});
const {browserSession}=await import('../web/client');
browserSession.getSnapshot=()=>({id:'catalogue-only',connectionId:'catalogue-only',revision:0,fileRevision:0,fileName:null,lastFileSavedAt:null,recoveredAt:'',protection:'unencrypted'});
const {registerBrowserTools}=await import('../web/browser-tools');const cleanup=registerBrowserTools();
mkdirSync(target,{recursive:true});
for(const [file,definitions] of [['mcp-tools.json',tools],['browser-tools.json',browser]] as const){
 const plain=definitions.map(({name,description,inputSchema,annotations})=>({name,description,inputSchema,annotations}));
 writeFileSync(path.join(target,file),JSON.stringify({appSourceVersion:version,capture:'generated from candidate registrations; definitions only',tools:plain},null,2)+'\n');
}
cleanup();console.log(JSON.stringify({desktop:tools.length,browser:browser.length}));
