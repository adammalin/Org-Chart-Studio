import {browserSession} from './client';
import {decryptPortableDocument,encryptPortableDocument} from '../lib/encrypted-backup';
import {isEncryptedLibraryBackup} from '../lib/backup-format';
import {isPortableDocument} from '../lib/workspace-format';
export interface LinkedFile {
 name:string;getFile():Promise<File>;createWritable():Promise<{write:(data:Blob)=>Promise<void>;close:()=>Promise<void>;abort?:()=>Promise<void>}>;
 queryPermission?:(d:{mode:'readwrite'})=>Promise<PermissionState>;
 requestPermission?:(d:{mode:'readwrite'})=>Promise<PermissionState>;
}
export const fileSupport=()=>typeof (window as unknown as {showSaveFilePicker?:unknown}).showSaveFilePicker==='function';
let handle:LinkedFile|null=null, fingerprint:string|null=null;
export const linkedFile=()=>handle;
const digest=async(file:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
export async function readLibrary(file:File,passphrase:string){
 if(file.size>512_000_000)throw Error('Library files are limited to 512 MB.');
 const raw=JSON.parse(await file.text());
 const protection=isEncryptedLibraryBackup(raw)?'encrypted':'unencrypted';
 const document=protection==='encrypted'?await decryptPortableDocument(raw,passphrase):raw;
 if(!isPortableDocument(document))throw Error('This is not a supported library file.');
 return {document,protection:protection as 'encrypted'|'unencrypted'};
}
export async function openFile(file:File,passphrase:string,next:LinkedFile|null=null){
 const opened=await readLibrary(file,passphrase);
 await browserSession.open(opened.document,file.name,opened.protection,passphrase);
 handle=next;fingerprint=next?await digest(file):null;await rememberLink().catch(()=>{});
 window.dispatchEvent(new Event('orgchart-workspace-opened'));
}
export async function pickOpen(passphrase:string){
 const picker=(window as unknown as {showOpenFilePicker:()=>Promise<LinkedFile[]>}).showOpenFilePicker;
 const [next]=await picker();await openFile(await next.getFile(),passphrase,next);
}
export async function saveFile(options:{copy?:boolean;download?:boolean;agentAccess?:boolean;encrypted:boolean;passphrase:string}){
 const start={...browserSession.getSnapshot()},guard={expectedWorkspaceId:start.id,expectedConnectionId:start.connectionId};
 const checkConnection=()=>{const now=browserSession.getSnapshot();if(now.id!==start.id||now.connectionId!==start.connectionId)throw Error('The active library changed while preparing this file. Retry in the current library.');};
 // Pick before any awaited serialization to retain the trusted user gesture.
 let next=options.copy||options.download?null:handle;
 if(!options.download&&!next&&fileSupport())next=await (window as unknown as {showSaveFilePicker:(o:unknown)=>Promise<LinkedFile>}).showSaveFilePicker({suggestedName:'OrgChart-Library.orgchart-workspace'});
 if(next?.queryPermission && await next.queryPermission({mode:'readwrite'})!=='granted'){
  if(await next.requestPermission?.({mode:'readwrite'})!=='granted')throw Error('File permission is required. Your browser recovery copy is intact.');
 }
 if(next===handle&&fingerprint&&await digest(await next!.getFile())!==fingerprint)throw Error('This file changed outside Studio. Open the newer file or use Save a copy.');
 checkConnection();const document=await browserSession.export({...guard,agentAccess:options.agentAccess});checkConnection();
 const value=options.encrypted?await encryptPortableDocument(document,options.passphrase):document;
 const blob=new Blob([JSON.stringify(value)],{type:'application/json'});
 if(blob.size>512_000_000)throw Error('This library exceeds the supported 512 MB file limit. Keep recovery intact and export smaller scoped backups; no data has been dropped.');
 checkConnection();if(!next)return {kind:'download_ready' as const,blob,revision:document.workspace.revision,protection:options.encrypted?'encrypted' as const:'unencrypted' as const};
 if(next===handle&&fingerprint&&await digest(await next.getFile())!==fingerprint)throw Error('This file changed while Studio prepared the save. Open the newer file or use Save a copy.');
 checkConnection();const writer=await next.createWritable();
 try {checkConnection();await writer.write(blob);checkConnection();await writer.close();}catch(error){await writer.abort?.().catch(()=>{});throw error;}
 const check=await next.getFile();
 if(await digest(check)!==await digest(blob))throw Error('The saved file did not pass readback verification. Save a copy and keep this browser recovery session.');
 checkConnection();if(!options.copy){const savedFingerprint=await digest(check);checkConnection();await browserSession.saved(document.workspace.revision,next.name,options.encrypted?'encrypted':'unencrypted',options.passphrase,'verified-write',guard);checkConnection();handle=next;fingerprint=savedFingerprint;await rememberLink().catch(()=>{});}
 return {kind:'file_written' as const,fileName:next.name,revision:document.workspace.revision};
}
async function handleDatabase(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('orgchart-studio-file-links-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('links');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function rememberLink(){
 const id=browserSession.getSnapshot().id,value={handle,fingerprint};
 const db=await handleDatabase();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('links','readwrite');
 tx.objectStore('links').put(value,id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
}
export async function resumeFileLink(){
 const db=await handleDatabase();const value=await new Promise<{handle:LinkedFile|null;fingerprint:string|null}|undefined>((resolve,reject)=>{const tx=db.transaction('links');const r=tx.objectStore('links').get(browserSession.getSnapshot().id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();
 handle=value?.handle??null;fingerprint=value?.fingerprint??null;
}
export async function unlinkFile(){handle=null;fingerprint=null;await rememberLink().catch(()=>{});}
