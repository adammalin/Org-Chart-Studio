import {prepareLibraryDownload,confirmPreparedDownload,downloadEncryptionRequested} from './prepared-download';
import {registerAgentWorkflowTools} from '../mcp/agent-workflow-tools.mjs';
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
 const registry=browserToolRegistry();if(!registry)return Object.assign(()=>{},{ready:Promise.resolve()});
 const lifecycle=new AbortController(),workspaceId=browserSession.getSnapshot().id,connectionId=browserSession.getSnapshot().connectionId,client=new BrowserAgentClient(workspaceId,connectionId);
 const registrations:{tool:BrowserTool}[]=[];
 const register=(tool:BrowserTool)=>{registrations.push({tool});};
 const status=()=>({...browserSession.getSnapshot(),runtime:'browser',appVersion,libraryFileNeedsSaving:browserSession.getSnapshot().revision>browserSession.getSnapshot().fileRevision,
  linkedFilePermission:'User-selected file permission is required for direct writes.',cloudSyncConfirmed:false});
 const server={registerTool(name:string,config:{description:string;inputSchema:Record<string,z.ZodType>;annotations?:Record<string,unknown>},handler:(args:Record<string,unknown>)=>Promise<BrowserToolResult>){
   const schema=z.object({...config.inputSchema,expectedWorkspaceId:z.string().min(1)}).strict();
   const tool:BrowserTool={name:'orgchart_'+name,description:config.description+' Read orgchart_get_workspace_status first and use its workspace ID.',
    inputSchema:z.toJSONSchema(schema,{io:'input'}),annotations:{...config.annotations,untrustedContentHint:true},execute:async input=>{
     try {
      const {expectedWorkspaceId,...args}=schema.parse(input);
      if(expectedWorkspaceId!==workspaceId||browserSession.getSnapshot().id!==workspaceId||browserSession.getSnapshot().connectionId!==connectionId)throw Error('The active library changed. Read workspace status and discover tools again.');
      const result=await handler(args);
      return {...result,structuredContent:{...(result.structuredContent??{}),workspace:status()},content:[...(result.content??[]),{type:'text',text:'Working-state changes use browser recovery. Check workspace.libraryFileNeedsSaving before reporting a portable file save.'}]};
     }catch(error){return {isError:true,content:[{type:'text',text:(error as Error).message}]};}
    }};
   register(tool);
 }};
 const plain={type:'object',properties:{},additionalProperties:false};
 register({name:'orgchart_get_workspace_status',description:'Read metadata-only runtime, workspace ID, revision and portable-file save status. Does not read chart data.',inputSchema:plain,annotations:{readOnlyHint:true},execute:async()=>({content:[{type:'text',text:JSON.stringify(status())}]})});
 register({name:'orgchart_prepare_library_save',description:'Show the library save controls. A file picker or download may require the user to click. This does not claim a file was written.',inputSchema:{type:'object',properties:{expectedWorkspaceId:{type:'string'}},required:['expectedWorkspaceId'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async input=>{
  const value=z.object({expectedWorkspaceId:z.literal(workspaceId)}).strict().parse(input);
  if(value.expectedWorkspaceId!==browserSession.getSnapshot().id||browserSession.getSnapshot().connectionId!==connectionId)throw Error('The active library changed.');
  window.dispatchEvent(new Event('orgchart-prepare-save'));return {content:[{type:'text',text:JSON.stringify({kind:'interaction_required',...status()})}]};
 }});
 server.registerTool('prepare_library_download',{description:'Prepare a full working-library download and show a visible link. Returns the exact revision, byte count and SHA-256 receipt; does not claim a disk write. Requires unpaused all-chart scope and retained-source permission because portable files include evidence/history. For encrypted libraries or selected encryption, use the visible passphrase controls; never sends a passphrase through MCP.',inputSchema:{},annotations:{readOnlyHint:false}},async()=>{
  await client.authorizeTool({toolName:'prepare_library_download',chartId:undefined,mode:'read',sourceAccess:true});
  const {control}=await client.request('/api/mcp-control');if(control.chartScope!=='all')throw Error('A full library download requires all-chart scope. Use the visible UI for a user-controlled export.');
  if(downloadEncryptionRequested()){window.dispatchEvent(new Event('orgchart-prepare-save'));return {structuredContent:{kind:'interaction_required',message:'Prepare an encrypted download using the visible file controls and passphrase.'}};}
  const receipt=await prepareLibraryDownload(false,'',true);window.dispatchEvent(new Event('orgchart-download-prepared'));return {structuredContent:{...receipt,appVerifiedDiskWrite:false,cloudSyncConfirmed:false},content:[{type:'text',text:'Use Download prepared library. Verify the downloaded file before reporting success.'}]};
 });
 server.registerTool('confirm_library_download',{description:'After actually downloading the prepared file and checking its byte count and SHA-256, record an agent-reported download receipt. Does not claim app-verified disk contents or cloud sync. Stale or mismatched receipts are rejected; later edits remain unsaved.',inputSchema:{receiptId:z.string().min(1).max(150),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().positive().max(512000000)},annotations:{readOnlyHint:false}},async(input)=>{
  await client.authorizeTool({toolName:'confirm_library_download',chartId:undefined,mode:'read',sourceAccess:true});const {control}=await client.request('/api/mcp-control');if(control.chartScope!=='all')throw Error('A full-library receipt requires all-chart scope.');
  return {structuredContent:await confirmPreparedDownload(input.receiptId as string,'agent-reported-download',{sha256:input.sha256 as string,bytes:input.bytes as number})};
 });
 registerTools(server,client);registerAgentWorkflowTools(server,client);registerHistoryTools(server,client);registerEditHistoryTools(server,client);registerInsightTools(server,client);registerSupplementTools(server,client,runWithWriteActivity);
 const registration=(async()=>{for(const {tool} of registrations){if(lifecycle.signal.aborted)return;await registry.registerTool(tool,{signal:lifecycle.signal});}})();
 const ready=Promise.race([registration,new Promise<void>(resolve=>lifecycle.signal.addEventListener('abort',()=>resolve(),{once:true}))]);
 return Object.assign(()=>lifecycle.abort(),{ready});
}
