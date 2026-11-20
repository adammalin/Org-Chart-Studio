import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserSession} from '../web/client';
import {registerBrowserTools} from '../web/browser-tools';
interface Tool{name:string;inputSchema:{required?:string[]};execute:(args:unknown)=>Promise<{isError?:boolean;content:{text:string}[]}>}
const tools:Tool[]=[];let saveRequests=0;
Object.defineProperty(globalThis,'document',{value:{modelContext:{registerTool:(tool:Tool)=>tools.push(tool)}},configurable:true});
Object.defineProperty(globalThis,'window',{value:{dispatchEvent:()=>{saveRequests++;}},configurable:true});
const metadata={id:'workspace-synthetic-tools',connectionId:'connection-synthetic-tools',revision:3,fileRevision:2,fileName:'Synthetic.orgchart-workspace',lastFileSavedAt:null,recoveredAt:'',protection:'unencrypted' as const};
browserSession.getSnapshot=()=>metadata;
registerBrowserTools();
test('browser tool definitions share all 30 operations and require an explicit workspace',()=>{
 assert.equal(tools.length,32);assert.equal(new Set(tools.map(t=>t.name)).size,32);
 for(const tool of tools.filter(t=>!['orgchart_get_workspace_status','orgchart_prepare_library_save'].includes(t.name)))assert.ok(tool.inputSchema.required?.includes('expectedWorkspaceId'),tool.name);
});
test('wrong workspace and malformed input cannot reach chart commands',async()=>{
 let calls=0;browserSession.rpc=async()=>{calls++;throw Error('Should not execute');};
 const tool=tools.find(t=>t.name==='orgchart_get_chart')!;
 assert.equal((await tool.execute({expectedWorkspaceId:'wrong',chartId:'synthetic'})).isError,true);
 assert.equal((await tool.execute({expectedWorkspaceId:metadata.id,chartId:'',unexpected:true})).isError,true);assert.equal(calls,0);
});
test('save preparation requests a visible action and never reports a completed disk write',async()=>{
 const tool=tools.find(t=>t.name==='orgchart_prepare_library_save')!;
 const result=await tool.execute({expectedWorkspaceId:metadata.id});assert.equal(saveRequests,1);
 const status=JSON.parse(result.content[0].text);assert.equal(status.kind,'interaction_required');assert.equal(status.libraryFileNeedsSaving,true);assert.equal(status.cloudSyncConfirmed,false);
});
