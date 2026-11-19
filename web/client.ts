import type { WorkspaceMetadata } from '../runtime/browser/recovery';
import type { WorkspacePackage } from '../lib/workspace-format';
import { installStudioRequester, type StudioRequester } from '../runtime/request';
let worker:Worker;
let metadata:WorkspaceMetadata & {connectionId:string};
let counter=0;
const pending=new Map<number,{resolve:(value:unknown)=>void;reject:(error:Error)=>void}>();
const listeners=new Set<()=>void>();
interface BrowserSession {
 getSnapshot:()=>WorkspaceMetadata & {connectionId:string};
 subscribe:(listener:()=>void)=>()=>void;
 rpc:<T>(action:string,payload?:unknown)=>Promise<T>;
 init:()=>Promise<void>;
 unlock:(passphrase:string)=>Promise<void>;
 request:StudioRequester;
 export:()=>Promise<WorkspacePackage>;
 open:(document:unknown,fileName:string|null,protection:'encrypted'|'unencrypted',passphrase?:string)=>Promise<WorkspaceMetadata>;
 saved:(revision:number,fileName:string,protection:'encrypted'|'unencrypted',passphrase?:string,fileSaveEvidence?:'verified-write'|'user-confirmed-download')=>Promise<WorkspaceMetadata>;
}
export const browserSession:BrowserSession={
  getSnapshot:()=>metadata,
  subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  async rpc<T>(action:string,payload?:unknown):Promise<T>{
    const id=++counter;
    return new Promise<T>((resolve,reject)=>{pending.set(id,{resolve:resolve as (v:unknown)=>void,reject});worker.postMessage({id,action,payload});});
  },
  async init(){
    worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=event=>{
      const {id,result,error,metadata:next}=event.data;
      const request=pending.get(id);if(!request)return;pending.delete(id);
      if(next&&JSON.stringify(metadata)!==JSON.stringify(next)){metadata=next;for(const listener of listeners)listener();}
      if(error)request.reject(Error(error));else request.resolve(result);
    };
    worker.onerror=()=>{for(const p of pending.values())p.reject(Error('Browser workspace stopped. Reload to recover the last saved state.'));pending.clear();};
    installStudioRequester(browserSession.request);await browserSession.rpc('status');
    void navigator.storage?.persist?.();
  },
  unlock:async(passphrase:string)=>{await browserSession.rpc('unlock',{passphrase});},
  request:(async(input,init)=>{
    const request=new Request(input instanceof Request?input:new URL(input,'https://orgchart.local'),init);
    const url=new URL(request.url);
    if(url.origin!=='https://orgchart.local'||!url.pathname.startsWith('/api/'))return fetch(input,init);
    request.signal.throwIfAborted();
    const response=await browserSession.rpc<{status:number;statusText:string;headers:[string,string][];body:ArrayBuffer}>('request',{
      expectedConnectionId:metadata.connectionId,path:url.pathname+url.search,method:request.method,headers:[...request.headers],body:await request.arrayBuffer()});
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers:response.headers});
  }) satisfies StudioRequester,
  export:()=>browserSession.rpc<WorkspacePackage>('export'),
  open:(document:unknown,fileName:string|null,protection:'encrypted'|'unencrypted',passphrase?:string)=>browserSession.rpc<WorkspaceMetadata>('open',{document,fileName,protection,passphrase}),
  saved:(revision:number,fileName:string,protection:'encrypted'|'unencrypted',passphrase?:string,fileSaveEvidence?:'verified-write'|'user-confirmed-download')=>browserSession.rpc<WorkspaceMetadata>('saved',{revision,fileName,protection,passphrase,fileSaveEvidence}),
};
