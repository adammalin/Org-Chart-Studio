import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {browserSession} from './client';
import {fileSupport,linkedFile,openFile,pickOpen,saveFile} from './files';
import {prepareLibraryDownload,subscribePreparedDownload,getPreparedDownload,clearPreparedDownload,confirmPreparedDownload,setDownloadEncryptionPreference} from './prepared-download';
export function LibraryControls({editorSaveState}:{editorSaveState:string}){
 const state=useSyncExternalStore(browserSession.subscribe,browserSession.getSnapshot);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[encrypted,setEncrypted]=useState(state.protection==='encrypted');
 const [passphrase,setPassphrase]=useState('');
 const download=useSyncExternalStore(subscribePreparedDownload,getPreparedDownload);
 const [autosave,setAutosave]=useState(false),[reminder,setReminder]=useState(false);
 const input=useRef<HTMLInputElement>(null);
 const dirty=state.revision>state.fileRevision;
 const waiting=editorSaveState==="saving"||editorSaveState==="error";
 useEffect(()=>{setDownloadEncryptionPreference(encrypted);},[encrypted]);
 useEffect(()=>{clearPreparedDownload();},[state.connectionId]);
 useEffect(()=>{if(!dirty)return;const timer=setTimeout(()=>setReminder(true),15*60_000);return()=>clearTimeout(timer);},[dirty]);
 useEffect(()=>{const before=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[dirty]);
 const run=async(operation:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await operation();}catch(error){if((error as Error).name!=='AbortError'){setMessage((error as Error).message);setAutosave(false);}}finally{setBusy(false);}};
 const save=async(copy=false,download=false)=>{
  if(download||!fileSupport()){await prepareLibraryDownload(encrypted,passphrase);setMessage('Download ready. Save it, then confirm below; Studio cannot verify a browser download.');return;}
  const result=await saveFile({copy,encrypted,passphrase});
  if(result.kind==='file_written'){setMessage((copy?'Copy written: ':'Library file saved: ')+result.fileName);setReminder(false);}
 };
 useEffect(()=>{if(!autosave||!dirty||!linkedFile()||busy)return;const timer=setTimeout(()=>void run(()=>save()),3000);return()=>clearTimeout(timer);});
 useEffect(()=>{const prepare=()=>{setMessage('Your assistant prepared a save request. Choose Save library to write the file.');document.querySelector('.library-file-bar')?.scrollIntoView({block:'start'});};window.addEventListener('orgchart-prepare-save',prepare);return()=>window.removeEventListener('orgchart-prepare-save',prepare);},[]);
 useEffect(()=>{const prepared=()=>{setMessage('Your assistant prepared a library download. Save it using the link below.');document.querySelector('.library-file-bar')?.scrollIntoView({block:'start'});};window.addEventListener('orgchart-download-prepared',prepared);return()=>window.removeEventListener('orgchart-download-prepared',prepared);},[]);
 useEffect(()=>{const failed=(event:Event)=>setMessage('Browser AI tools could not register: '+String((event as CustomEvent).detail));window.addEventListener('orgchart-agent-error',failed);return()=>window.removeEventListener('orgchart-agent-error',failed);},[]);
 const guardOpen=()=>!waiting&&(!dirty||window.confirm('Your library file has unsaved changes. Continue only if you have saved a copy. Open a different library?'));
 return <section className="library-file-bar" aria-label="Library file and recovery" data-editor-state={editorSaveState} data-unsaved-file={dirty} data-workspace-id={state.id} data-revision={state.revision}>
  <div className="library-file-summary"><div><strong title={state.fileName??'New browser library'}>{state.fileName??'New browser library'}</strong><span className={dirty?'file-needs-save':''}>{dirty?'Library file needs saving':state.fileSaveEvidence==='verified-write'?'Library file saved':state.fileSaveEvidence==='agent-reported-download'?'Download reported by assistant':state.fileSaveEvidence==='user-confirmed-download'?'Download confirmed by you':state.fileName?'Opened library file · no changes':'Recovery copy only · save a library file'}</span></div>
   <div className="library-file-actions">
    <button disabled={busy||waiting} onClick={()=>{if(!guardOpen())return;if(fileSupport())void run(()=>pickOpen(passphrase));else input.current?.click();}}>Open library</button>
    <button className="library-file-save" disabled={busy||waiting} onClick={()=>void run(()=>save())}>{busy?'Working…':fileSupport()?'Save library':'Prepare library download'}</button>
   </div>
  </div>
  <input ref={input} type="file" accept=".json,.orgchart-backup,.orgchart-workspace" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void run(()=>openFile(file,passphrase));event.target.value='';}}/>
  <details className="library-file-options"><summary>More file options</summary><div className="library-file-actions">
    <button disabled={busy||waiting} onClick={()=>void run(()=>save(true))}>Save a copy</button>
    {fileSupport()&&<><button disabled={busy||waiting} onClick={()=>{if(guardOpen())input.current?.click();}}>Open with standard file chooser</button><button disabled={busy||waiting} onClick={()=>void run(()=>save(false,true))}>Prepare download</button></>}
    <label><input type="checkbox" checked={encrypted} onChange={e=>setEncrypted(e.target.checked)}/>Encrypt file</label>
    <label>File passphrase<input type="password" autoComplete="off" value={passphrase} placeholder="For encrypted open/save" onChange={e=>setPassphrase(e.target.value)}/></label>
    {fileSupport()&&<label><input type="checkbox" checked={autosave} disabled={!linkedFile()} onChange={e=>setAutosave(e.target.checked)}/>Autosave linked file while open</label>}
   </div>
   <p>Choose a file in your synced OneDrive or Dropbox folder if desired. Studio confirms file writes; your sync client handles uploading. Use Backup &amp; restore to merge copies. For an encrypted library, enter its passphrase here before opening it.</p>
   <small>Revision {state.revision}{state.lastFileSavedAt&&<> · {state.fileSaveEvidence==='agent-reported-download'?'Download reported by assistant:':state.fileSaveEvidence==='user-confirmed-download'?'Download confirmed by you:':'Last file save:'} {new Date(state.lastFileSavedAt).toLocaleString()}</>}</small>
  </details>
  {(message||reminder)&&<p role="status">{message||'Your library file has unsaved changes. Save it to preserve work outside this browser.'}{reminder&&<button onClick={()=>setReminder(false)}>Dismiss reminder</button>}</p>}
  {download&&<div className="prepared-library-download"><a href={download.url} download={download.receipt.fileName}>Download prepared library</a> <button disabled={busy} onClick={()=>void run(async()=>{await confirmPreparedDownload(download.receipt.receiptId,'user-confirmed-download');setMessage('Download confirmed by you; disk contents were not verified.');})}>I saved this download</button><small>Revision {download.receipt.revision} · {download.receipt.bytes.toLocaleString()} bytes · SHA-256 <code>{download.receipt.sha256}</code> · {download.receipt.protection}</small></div>}
 </section>;
}
