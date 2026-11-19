import 'fake-indexeddb/auto';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {browserSession} from '../web/client';import {saveFile,type LinkedFile,openFile,unlinkFile} from '../web/files';
import type {WorkspacePackage} from '../lib/workspace-format';
const document:WorkspacePackage={format:'orgchart-studio-workspace',schemaVersion:1,workspace:{id:'workspace-synthetic-files',revision:4},library:{format:'orgchart-studio-library-backup',schemaVersion:7,scope:'all',exportedAt:new Date().toISOString(),chartCount:0,sourceFileCount:0,charts:[],sourceFiles:[],chartVersions:[],aiActivities:[],checkpoints:[],monthlyUpdates:[],editHistory:{operations:[],events:[]}},pendingProposals:[]};
const metadata={id:document.workspace.id,connectionId:'synthetic',revision:4,fileRevision:0,fileName:null,lastFileSavedAt:null,recoveredAt:new Date().toISOString(),protection:'unencrypted' as const};
(globalThis as unknown as {window:unknown}).window={showSaveFilePicker:undefined,dispatchEvent:()=>true};
let saved=0,exports=0;browserSession.getSnapshot=()=>metadata;
browserSession.export=async()=>{exports++;return structuredClone(document);};
browserSession.saved=async()=>{saved++;return metadata;};browserSession.open=async()=>metadata;
function picker(file:LinkedFile){(window as unknown as {showSaveFilePicker:unknown}).showSaveFilePicker=async()=>file;}
function linked(initial:string){let contents=initial,writes=0;const handle:LinkedFile={name:'synthetic.orgchart-workspace',getFile:async()=>new File([contents],'synthetic.orgchart-workspace'),createWritable:async()=>({write:async blob=>{writes++;contents=await blob.text();},close:async()=>{}})};return {handle,get writes(){return writes;},change:(next:string)=>{contents=next;}};}
test('save picker cancellation does not export or report a file save',async()=>{
 await unlinkFile();const before=exports;(window as unknown as {showSaveFilePicker:unknown}).showSaveFilePicker=async()=>{throw new DOMException('Canceled','AbortError');};await assert.rejects(()=>saveFile({encrypted:false,passphrase:''}),{name:'AbortError'});assert.equal(exports,before);assert.equal(saved,0);
});
test('linked-file save verifies bytes, detects an external change, and does not overwrite it',async()=>{
 const file=linked(JSON.stringify(document));picker(file.handle);await openFile(await file.handle.getFile(),'',file.handle);
 const result=await saveFile({encrypted:false,passphrase:''});assert.equal(result.kind,'file_written');assert.equal(saved,1);assert.equal(file.writes,1);
 file.change('Synthetic external writer');await assert.rejects(()=>saveFile({encrypted:false,passphrase:''}),/changed outside/);assert.equal(file.writes,1);assert.equal(saved,1);
});
test('a prepared download is not a verified file save and uses the captured revision',async()=>{
 await unlinkFile();const count=saved;const result=await saveFile({download:true,encrypted:false,passphrase:''});assert.equal(result.kind,'download_ready');assert.equal(saved,count);if(result.kind==='download_ready'){assert.equal(result.revision,4);assert.equal(JSON.parse(await result.blob.text()).workspace.id,document.workspace.id);}
});
test('failed file readback does not mark a library saved',async()=>{
 await unlinkFile();const count=saved;const file=linked('synthetic');file.handle.createWritable=async()=>({write:async()=>{},close:async()=>{}});picker(file.handle);
 await assert.rejects(()=>saveFile({encrypted:false,passphrase:''}),/readback/);assert.equal(saved,count);
});

test('an external change during serialization also blocks overwrite',async()=>{
 await unlinkFile();const file=linked(JSON.stringify(document));picker(file.handle);await openFile(await file.handle.getFile(),'',file.handle);
 const original=browserSession.export;browserSession.export=async()=>{file.change('Synthetic concurrent external change');return structuredClone(document);};
 try{await assert.rejects(()=>saveFile({encrypted:false,passphrase:''}),/changed while/);assert.equal(file.writes,0);}finally{browserSession.export=original;}
});
