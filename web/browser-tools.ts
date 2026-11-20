import {version as appVersion} from "../package.json";
import {z} from 'zod';
import {OrgChartOperations} from '../mcp/app-operations.mjs';
import {registerTools,runWithWriteActivity} from '../mcp/core-tools.mjs';
import {registerHistoryTools} from '../mcp/history-tools.mjs';
import {registerEditHistoryTools} from '../mcp/edit-history-tools.mjs';
import {registerInsightTools} from '../mcp/insight-tools.mjs';
import {registerSupplementTools} from '../mcp/supplement-tools.mjs';
import {browserSession} from './client';
interface BrowserToolResult{structuredContent?:Record<string,unknown>;content?:unknown[];isError?:boolean}
interface BrowserTool {name:string;description:string;inputSchema:unknown;annotations:Record<string,unknown>;execute:(input:unknown)=>Promise<unknown>}
interface Registry {registerTool:(tool:BrowserTool,options:{signal:AbortSignal})=>unknown}
export function browserToolRegistry():Registry|undefined {
 return (document as unknown as {modelContext?:Registry}).modelContext??(navigator as unknown as {modelContext?:Registry}).modelContext;
}
class BrowserAgentClient extends OrgChartOperations {
 constructor(readonly workspaceId:string,readonly connectionId:string){super();}
 async request(pathname:string,init:RequestInit={}){
  const request=new Request('https://orgchart.local'+pathname,init);
  const data=await browserSession.rpc<{status:number;body:ArrayBuffer}>('request',{
   path:pathname,method:request.method,headers:[...request.headers],body:await request.arrayBuffer(),expectedWorkspaceId:this.workspaceId,expectedConnectionId:this.connectionId});
  const body=JSON.parse(new TextDecoder().decode(data.body));
  if(data.status<200||data.status>=300)throw Error(body.error??'The browser command failed.');return body;
 }
 async listCharts(){const result=await this.request('/api/charts');const {control}=await this.request('/api/mcp-control');return {...result,charts:result.charts.filter((c:{id:string})=>control.chartScope==='all'||control.allowedChartIds.includes(c.id))};}
 writeSourceRecheckBackup(backup:unknown,chartId:string){return browserSession.rpc('rollback',{backup,chartId,expectedWorkspaceId:this.workspaceId,expectedConnectionId:this.connectionId});}
}
export function registerBrowserTools(){
 const registry=browserToolRegistry();if(!registry)return ()=>{};
 const lifecycle=new AbortController(),workspaceId=browserSession.getSnapshot().id,client=new BrowserAgentClient(workspaceId,browserSession.getSnapshot().connectionId);
 const status=()=>({...browserSession.getSnapshot(),runtime:'browser',appVersion,libraryFileNeedsSaving:browserSession.getSnapshot().revision>browserSession.getSnapshot().fileRevision,
  linkedFilePermission:'User-selected file permission is required for direct writes.',cloudSyncConfirmed:false});
 const server={registerTool(name:string,config:{description:string;inputSchema:Record<string,z.ZodType>;annotations?:Record<string,unknown>},handler:(args:Record<string,unknown>)=>Promise<BrowserToolResult>){
   const schema=z.object({...config.inputSchema,expectedWorkspaceId:z.string().min(1)}).strict();
   const tool:BrowserTool={name:'orgchart_'+name,description:config.description+' Read orgchart_get_workspace_status first and use its workspace ID.',
    inputSchema:z.toJSONSchema(schema,{io:'input'}),annotations:{...config.annotations,untrustedContentHint:true},execute:async input=>{
     try {
      const {expectedWorkspaceId,...args}=schema.parse(input);
      if(expectedWorkspaceId!==workspaceId||browserSession.getSnapshot().id!==workspaceId)throw Error('The active library changed. Read workspace status and discover tools again.');
      const result=await handler(args);
      return {...result,structuredContent:{...(result.structuredContent??{}),workspace:status()},content:[...(result.content??[]),{type:'text',text:'Working-state changes use browser recovery. Check workspace.libraryFileNeedsSaving before reporting a portable file save.'}]};
     }catch(error){return {isError:true,content:[{type:'text',text:(error as Error).message}]};}
    }};
   void Promise.resolve(registry.registerTool(tool,{signal:lifecycle.signal})).catch(error=>window.dispatchEvent(new CustomEvent('orgchart-agent-error',{detail:String(error)})));
 }};
 const plain={type:'object',properties:{},additionalProperties:false};
 void registry.registerTool({name:'orgchart_get_workspace_status',description:'Read metadata-only runtime, workspace ID, revision and portable-file save status. Does not read chart data.',inputSchema:plain,annotations:{readOnlyHint:true},execute:async()=>({content:[{type:'text',text:JSON.stringify(status())}]})},{signal:lifecycle.signal});
 void registry.registerTool({name:'orgchart_prepare_library_save',description:'Show the library save controls. A file picker or download may require the user to click. This does not claim a file was written.',inputSchema:{type:'object',properties:{expectedWorkspaceId:{type:'string'}},required:['expectedWorkspaceId'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async input=>{
  const value=z.object({expectedWorkspaceId:z.literal(workspaceId)}).strict().parse(input);
  if(value.expectedWorkspaceId!==browserSession.getSnapshot().id)throw Error('The active library changed.');
  window.dispatchEvent(new Event('orgchart-prepare-save'));return {content:[{type:'text',text:JSON.stringify({kind:'interaction_required',...status()})}]};
 }},{signal:lifecycle.signal});
 registerTools(server,client);registerHistoryTools(server,client);registerEditHistoryTools(server,client);registerInsightTools(server,client);registerSupplementTools(server,client,runWithWriteActivity);
 return ()=>lifecycle.abort();
}
