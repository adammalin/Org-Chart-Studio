import type {WorkspacePackage} from '../lib/workspace-format';
import type {ChartDocument} from '../lib/chart-library';
import type {RecoveryRecord} from '../runtime/browser/recovery';
import type {ImportIntake} from '../lib/import-intake';
interface ApiResult{chart:ChartDocument;proposal:{id:string;proposed:ChartDocument};undo:{id:string};redo:{id:string};revision:string;expectedVersion:number;expectedUpdatedAt:string;batch:{id:string}}
import 'fake-indexeddb/auto';
import './helpers/test-db';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadSqlite} from '../runtime/browser/sqlite';
import {BrowserRecovery} from '../runtime/browser/recovery';
const {BrowserWorkspace}=await import('../runtime/browser/workspace');
type BrowserWorkspace=InstanceType<typeof BrowserWorkspace>;
const SQLite=await loadSqlite();
async function fixture(name='synthetic-'+crypto.randomUUID()){
 const recovery=await BrowserRecovery.open(name);
 return {recovery,ws:await BrowserWorkspace.open(SQLite,recovery),name};
}
async function call(ws:BrowserWorkspace,path:string,body?:unknown){
 const response=await ws.request(new Request('https://orgchart.local/api/'+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined));
 const data=await response.json() as ApiResult;assert.ok(response.ok,JSON.stringify(data));return data;
}
test('browser commands preserve exact working library, monthly batch and undo/redo across file open and recovery',async()=>{
 const {ws,recovery}=await fixture();
 let chart=(await call(ws,'charts',{action:'create',name:'Synthetic browser workspace'})).chart;
 await call(ws,'history',{action:'begin',month:'2026-11',label:'Synthetic monthly batch',changeList:'Synthetic change',chartIds:[chart.id]});
 chart.nodes[0].data.unit.assignmentLabel='Synthetic Original';chart=(await call(ws,'charts',{action:'save',chart})).chart;
 chart.nodes[0].data.unit.assignmentLabel='Synthetic Changed';chart=(await call(ws,'charts',{action:'save',chart})).chart;
 const before=await ws.export();assert.equal(before.library.monthlyUpdates![0].status,'open');
 const copy=await fixture();await copy.ws.openDocument(before,'synthetic.orgchart-workspace','unencrypted');
 const after=await copy.ws.export();
 assert.deepEqual(after.library.charts,before.library.charts);
 assert.deepEqual(after.library.editHistory,before.library.editHistory);
 assert.deepEqual(after.library.monthlyUpdates,before.library.monthlyUpdates);
 assert.deepEqual(after.library.checkpoints,before.library.checkpoints);
 assert.equal(after.workspace.id,before.workspace.id);
 let history=await call(copy.ws,'edit-history?chartId='+chart.id);
 await call(copy.ws,'edit-history',{action:'undo',chartId:chart.id,operationId:history.undo.id,expectedRevision:history.revision,expectedVersion:history.expectedVersion,expectedUpdatedAt:history.expectedUpdatedAt,requestId:'history-request-synthetic-browser-undo'});
 history=await call(copy.ws,'edit-history?chartId='+chart.id);
 assert.ok(history.redo);await call(copy.ws,'edit-history',{action:'redo',chartId:chart.id,operationId:history.redo.id,expectedRevision:history.revision,expectedVersion:history.expectedVersion,expectedUpdatedAt:history.expectedUpdatedAt,requestId:'history-request-synthetic-browser-redo'});
 const resumed=await BrowserWorkspace.open(SQLite,await BrowserRecovery.open(copy.name));
 assert.equal((await resumed.export()).library.charts[0].nodes[0].data.unit.assignmentLabel,'Synthetic Changed');
 assert.equal((await resumed.export()).library.monthlyUpdates![0].status,'open');
 recovery.close();copy.recovery.close();
});
test('failed browser recovery transaction rolls back working data and file revision',async()=>{
 const {ws,recovery}=await fixture();await call(ws,'charts',{action:'create',name:'Synthetic retained before quota'});const before=await ws.export();const metadata={...ws.metadata};
 const commit=recovery.commit.bind(recovery);recovery.commit=async()=>{throw Error('Synthetic quota failure');};
 await assert.rejects(()=>call(ws,'charts',{action:'create',name:'Synthetic quota rollback'}),/quota/);
 recovery.commit=commit;assert.equal((await ws.export()).library.charts.length,before.library.charts.length);assert.deepEqual(ws.metadata,metadata);recovery.close();
});
test('Open validates an invalid file before replacing the browser workspace; Merge retains copy semantics',async()=>{
 const {ws,recovery}=await fixture();const chart=(await call(ws,'charts',{action:'create',name:'Synthetic protected original'})).chart;
 const file=await ws.export();const bad=structuredClone(file);bad.library.charts[0].nodes[0].data.unit.type='invalid' as never;
 await assert.rejects(()=>ws.openDocument(bad,'bad.json','unencrypted'));
 assert.equal((await ws.export()).library.charts[0].id,chart.id);
 const other=await fixture();await call(other.ws,'backups',file.library);
 const merged=await other.ws.export();assert.notEqual(merged.library.charts[0].id,chart.id);
 assert.match(merged.library.charts[0].name,/Restored/);recovery.close();other.recovery.close();
});
test('encrypted working library recovery never stores plaintext SQL or sources and requires unlocking after reload',async()=>{
 const {ws,recovery,name}=await fixture();await call(ws,'charts',{action:'create',name:'Synthetic Confidential Marker'});
 const document=await ws.export();const phrase='Synthetic recovery phrase 123';
 await ws.openDocument(document,'synthetic-encrypted.orgchart-workspace','encrypted',phrase);
 const raw=await new Promise<RecoveryRecord>((resolve,reject)=>{const tx=recovery.db.transaction('workspace');const r=tx.objectStore('workspace').get('active');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 assert.ok(raw.salt);assert.ok(!new TextDecoder().decode(raw.database).includes('Synthetic Confidential Marker'));assert.ok(!new TextDecoder().decode(raw.database.slice(0,16)).includes('SQLite'));
 const locked=await BrowserRecovery.open(name);await assert.rejects(()=>BrowserWorkspace.open(SQLite,locked),/locked/);
 const wrong=await BrowserRecovery.open(name);await assert.rejects(()=>BrowserWorkspace.open(SQLite,wrong,'wrong password'),/locked/);
 const unlocked=await BrowserWorkspace.open(SQLite,await BrowserRecovery.open(name),phrase);
 assert.equal((await unlocked.export()).library.charts[0].name,'Synthetic Confidential Marker');
 recovery.close();locked.close();wrong.close();
});
test('full working libraries retain pending reviews, source-intake bytes, appearance and unfinished import work',async()=>{
 const {ws,recovery}=await fixture();const chart=(await call(ws,'charts',{action:'create',name:'Synthetic pending review'})).chart;
 const changed=structuredClone(chart);changed.nodes[0].data.unit.assignmentLabel='Synthetic Proposed Holder';
 const staged=await call(ws,'ai-proposals',{action:'stage',chart:changed,changeSummary:'Synthetic saved pending work'});
 const form=new FormData();form.set('name','Synthetic retained source');form.append('evidence',new File(['name,role\nSynthetic Source,Director'],'synthetic-source.csv',{type:'text/csv'}));
 const response=await ws.request(new Request('https://orgchart.local/api/import-intakes',{method:'POST',body:form}));const intake=await response.json() as {intake:ImportIntake};assert.ok(response.ok,JSON.stringify(intake));
 const contents='id,name,type,parentId,positionTitle,assignmentLabel,positionStatus\nsynthetic-root,Synthetic Imported Org,laboratory,,Director,Synthetic Holder,filled';
 const imported=await call(ws,'ai-import-proposals',{action:'stage',chartName:'Synthetic pending import',format:'csv',contents,intakeId:intake.intake.id});
 await call(ws,'preferences',{libraryView:'tree',chartAppearance:'annotated'});
 const file=await ws.export();assert.equal(file.pendingProposals.length,1);assert.equal(file.continuity!.intakes.length,1);assert.equal(file.continuity!.importProposals.length,1);
 const copy=await fixture();await copy.ws.openDocument(file,'synthetic-pending.orgchart-workspace','unencrypted');
 const again=await copy.ws.export();assert.deepEqual(again.pendingProposals,file.pendingProposals);assert.deepEqual(again.continuity,file.continuity);
 const preview=await call(copy.ws,'ai-import-proposals?proposalId='+imported.proposal.id);assert.equal(preview.proposal.id,imported.proposal.id);
 const pending=await call(copy.ws,'ai-proposals?proposalId='+staged.proposal.id);assert.equal(pending.proposal.proposed.nodes[0].data.unit.assignmentLabel,'Synthetic Proposed Holder');
 const bad=structuredClone(file);bad.continuity!.intakes[0].files[0].dataBase64=btoa('Synthetic tampered source');
 await assert.rejects(()=>copy.ws.openDocument(bad,'bad.json','unencrypted'),/checksum/);assert.equal((await copy.ws.export()).library.charts[0].id,chart.id);
 recovery.close();copy.recovery.close();
});
test('browser recovery snapshots are reused for reads and invalidated after a committed mutation',async()=>{
 const {ws,recovery}=await fixture();const a=ws.engine.exportDatabase();await call(ws,'charts');const b=ws.engine.exportDatabase();assert.equal(a,b);
 await call(ws,'charts',{action:'create',name:'Synthetic cache mutation'});assert.notEqual(ws.engine.exportDatabase(),b);recovery.close();
});
test('conventional desktop continuation export includes pending work and opens with exact chart identity',async()=>{
 const {ws,recovery}=await fixture();const chart=(await call(ws,'charts',{action:'create',name:'Synthetic desktop handoff'})).chart;
 const changed=structuredClone(chart);changed.nodes[0].data.unit.assignmentLabel='Synthetic pending handoff';await call(ws,'ai-proposals',{action:'stage',chart:changed});
 const response=await ws.request(new Request('https://orgchart.local/api/workspace'));assert.ok(response.ok);const file=await response.json() as WorkspacePackage;
 assert.equal(file.pendingProposals.length,1);assert.equal(file.library.charts[0].id,chart.id);
 const target=await fixture();await target.ws.openDocument(file,'Synthetic-Desktop.orgchart-workspace','unencrypted');assert.deepEqual((await target.ws.export()).library.charts,file.library.charts);
 recovery.close();target.recovery.close();
});
