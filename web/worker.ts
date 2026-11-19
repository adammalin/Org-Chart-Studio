/// <reference lib="webworker" />
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { loadSqlite } from '../runtime/browser/sqlite';
import { BrowserRecovery } from '../runtime/browser/recovery';
import { BrowserWorkspace } from '../runtime/browser/workspace';
const ownership=new Promise<void>((resolve,reject)=>{
 if(!navigator.locks){reject(Error('This browser cannot safely coordinate workspace writes. Use a supported browser or desktop.'));return;}
 void navigator.locks.request('orgchart-studio-browser-writer-v1',{ifAvailable:true},async lock=>{
   if(!lock){reject(Error('This browser library is open in another tab. Close that tab, then retry.'));return;}
   resolve();await new Promise<void>(()=>{});
 }).catch(reject);
});
const initialize=async(passphrase?:string)=>{await ownership;return BrowserWorkspace.open(await loadSqlite(()=>new URL(wasmUrl,self.location.href).href),await BrowserRecovery.open(),passphrase);};
let ready = initialize();
void ready.catch(()=>{});
let queue:Promise<unknown>=Promise.resolve();
self.onmessage=event=>{
  const {id,action,payload}=event.data;
  queue=queue.then(async()=>{
    try {
      if(action==='unlock')ready=initialize(payload.passphrase);
      const workspace=await ready;
      let result:unknown;
      if(action==='status'||action==='unlock')result=workspace.metadata;
      else if(action==='export')result=await workspace.export();
      else if(action==='open')result=await workspace.openDocument(payload.document,payload.fileName,payload.protection,payload.passphrase);
      else if(action==='saved')result=await workspace.markFileSaved(payload.revision,payload.fileName,payload.protection,payload.passphrase,payload.fileSaveEvidence);
      else if(action==='rollback')result=await workspace.saveRollback(payload.backup,payload.expectedConnectionId);
      else if(action==='request'){
        if(payload.expectedConnectionId&&payload.expectedConnectionId!==workspace.connectionId)throw Error('The active library connection changed. Discover tools again.');
        if(payload.expectedWorkspaceId&&payload.expectedWorkspaceId!==workspace.metadata.id)throw Error('The active library changed. Read workspace status again.');
        const r=await workspace.request(new Request('https://orgchart.local'+payload.path,{method:payload.method,
          headers:payload.headers,body:['GET','HEAD'].includes(payload.method)?undefined:payload.body}));
        result={status:r.status,statusText:r.statusText,headers:[...r.headers],body:await r.arrayBuffer()};
      }else throw Error('Unknown workspace operation.');
      self.postMessage({id,result,metadata:{...workspace.metadata,connectionId:workspace.connectionId}});
    }catch(error){self.postMessage({id,error:error instanceof Error?error.message:'Workspace operation failed.'});}
  });
};
