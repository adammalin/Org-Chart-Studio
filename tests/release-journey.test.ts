/* eslint-disable @typescript-eslint/no-explicit-any -- Test response payloads and malicious request fields. */
import {testDatabase} from './helpers/test-db';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {nextSavedTimestamp} from '../lib/save-timestamp';
const charts=await import('../app/api/charts/route');
const intakes=await import('../app/api/import-intakes/route');
const extractions=await import('../app/api/source-extractions/route');
const backups=await import('../app/api/backups/route');
const proposals=await import('../app/api/ai-proposals/route');
const getRequest=(path:string)=>new Request('http://127.0.0.1/api/'+path);
async function post(route:{POST:(r:Request)=>Promise<Response>},body:unknown){
 const response=await route.POST(new Request('http://127.0.0.1/api/test',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
 return {status:response.status,data:await response.json() as any};
}
async function create(){const r=await post(charts,{action:'create',name:'Synthetic release chart'});assert.equal(r.status,201);return r.data.chart;}
test('same-millisecond saves advance their guard and reject the preceding chart state',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-19T12:00:00.000Z')});
 const {sql}=testDatabase();try{
  const c=await create();const edited=structuredClone(c);edited.description='Synthetic first save';
  const first=await post(charts,{action:'save',chart:edited});assert.equal(first.status,200);
  assert.ok(first.data.chart.updatedAt>c.updatedAt);
  assert.equal((await post(charts,{action:'save',chart:c})).status,409);
  const second=await post(charts,{action:'save',chart:first.data.chart});assert.equal(second.status,200);assert.ok(second.data.chart.updatedAt>first.data.chart.updatedAt);
  const future='2099-01-01T00:00:00.000Z';assert.equal(nextSavedTimestamp(future,0),'2099-01-01T00:00:00.001Z');
 }finally{sql.close();t.mock.timers.reset();}
});
test('named versions cannot bypass Current approval, change directory parents, or forge approval evidence',async()=>{
 const {sql}=testDatabase();try{
  const c=await create();
  const forged=structuredClone(c);forged.status='current';forged.lifecycle.lastCurrentBy='Forged reviewer';
  assert.equal((await post(charts,{action:'snapshot',chart:forged})).status,422);
  const parent=structuredClone(c);parent.libraryParentId=c.id;
  assert.equal((await post(charts,{action:'snapshot',chart:parent})).status,422);
  const metadata=structuredClone(c);metadata.lifecycle.lastCurrentBy='Forged reviewer';
  const saved=await post(charts,{action:'save',chart:metadata});assert.equal(saved.status,200);
  assert.equal(saved.data.chart.lifecycle.lastCurrentBy,c.lifecycle.lastCurrentBy);
  const snap=await post(charts,{action:'snapshot',chart:{...saved.data.chart,lifecycle:forged.lifecycle}});
  assert.equal(snap.status,201);assert.equal(snap.data.chart.lifecycle.lastCurrentBy,c.lifecycle.lastCurrentBy);
 }finally{sql.close();}
});
test('chart save, duplicate, proposal listing, named restore, archive and isolated deletion preserve their contracts',async()=>{
 const {sql}=testDatabase();try{
  let c=await create();const initial=structuredClone(c);
  c.nodes[0].data.unit.assignmentLabel='Synthetic New Leader';
  const r=await post(charts,{action:'save',chart:c});assert.equal(r.status,200);c=r.data.chart;
  assert.equal((await post(charts,{action:'save',chart:initial})).status,409);
  const snap=await post(charts,{action:'snapshot',chart:c,label:'Synthetic saved point'});assert.equal(snap.status,201);c=snap.data.chart;
  const versions=await charts.GET(getRequest('charts?resource=versions&chartId='+c.id)).then(r=>r.json()) as any;
  assert.equal(versions.versions.length,2);
  const duplicate=await post(charts,{action:'duplicate',chartId:c.id});assert.equal(duplicate.status,201);
  assert.notEqual(duplicate.data.chart.id,c.id);assert.equal(duplicate.data.chart.status,'draft');
  const next=structuredClone(c);next.description='Synthetic proposed change';
  const staged=await post(proposals,{action:'stage',chart:next,changeSummary:'Synthetic review'});assert.equal(staged.status,201);
  const pending=await proposals.GET(getRequest('ai-proposals?status=pending')).then(r=>r.json()) as any;
  assert.equal(pending.proposals.length,1);
  assert.equal((await proposals.GET(getRequest('ai-proposals?proposalId='+staged.data.proposal.id))).status,200);
  assert.equal((await post(proposals,{action:'reject',proposalId:staged.data.proposal.id})).status,200);
  const activities=await proposals.GET(getRequest('ai-proposals?chartId='+c.id)).then(r=>r.json()) as any;
  assert.equal(activities.activities[0].status,'rejected');
  const restored=await post(charts,{action:'restore_version',chartId:c.id,versionId:versions.versions.at(-1).id});assert.equal(restored.status,200);c=restored.data.chart;
  assert.equal(c.status,'draft');assert.equal(c.nodes[0].data.unit.assignmentLabel,initial.nodes[0].data.unit.assignmentLabel);
  assert.equal((await post(charts,{action:'delete',chartId:c.id})).status,423);
  const archived=await post(charts,{action:'transition_status',chartId:c.id,targetStatus:'archived',expectedVersion:c.version,expectedUpdatedAt:c.updatedAt});assert.equal(archived.status,200);
  assert.equal((await post(charts,{action:'delete',chartId:c.id})).status,200);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM charts').get()?.n,1);
 }finally{sql.close();}
});
test('a concurrent save cannot leave a phantom named version or checkpoints after a stale snapshot',async()=>{
 const {sql,db}=testDatabase();try{
  const c=await create();const batch=db.batch.bind(db);let inject=true;
  db.batch=(async(statements:any[])=>{
    if(inject){inject=false;sql.prepare('UPDATE charts SET updated_at=? WHERE id=?').run('2099-01-01T00:00:00.000Z',c.id);}
    return batch(statements);
  }) as typeof db.batch;
  const result=await post(charts,{action:'snapshot',chart:c,label:'Should not exist'});
  assert.equal(result.status,409);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM chart_versions WHERE chart_id=?').get(c.id)?.n,1);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM chart_checkpoints WHERE chart_id=?').get(c.id)?.n,0);
 }finally{sql.close();}
});
test('retained source upload, extraction, portable export/restore and integrity failures are exercised end to end',async()=>{
 const {sql,files}=testDatabase();try{
  const evidence='Synthetic source facts';
  const form=new FormData();form.set('name','Synthetic evidence');form.append('evidence',new File([evidence],'source.csv',{type:'text/csv'}));
  const uploaded=await intakes.POST(new Request('http://127.0.0.1/api/import-intakes',{method:'POST',body:form}));assert.equal(uploaded.status,201);
  const intake=(await uploaded.json() as any).intake;
  const listed=await intakes.GET().then(r=>r.json()) as any;assert.equal(listed.intakes[0].files.length,1);
  let extracted=await post(extractions,{scope:'intake',id:intake.id});assert.equal(extracted.status,200);assert.equal(extracted.data.extractions[0].data.text,evidence);
  const file=intake.files[0];files.set(file.storageKey,new TextEncoder().encode('tampered'));
  assert.equal((await post(extractions,{scope:'intake',id:intake.id})).status,409);
  files.set(file.storageKey,new TextEncoder().encode(evidence));
  const csv='id,name,shortName,type,parentId,positionTitle,assignmentLabel,positionStatus,effectiveDate,publicationVisibility\nroot,Synthetic Org,Synthetic,division,,Director,Synthetic Person,filled,Current,internal';
  const importedForm=new FormData();importedForm.set('chartName','Synthetic retained chart');importedForm.set('intakeId',intake.id);importedForm.set('file',new File([csv],'synthetic.csv',{type:'text/csv'}));
  const imported=await charts.POST(new Request('http://127.0.0.1/api/charts',{method:'POST',body:importedForm}));assert.equal(imported.status,201);
  const c=(await imported.json() as any).chart;
  assert.equal(c.sources.length,2);
  extracted=await post(extractions,{scope:'chart',id:c.id});assert.equal(extracted.status,200);
  const source=c.sources.find((s:any)=>s.fileName==='source.csv');
  const downloaded=await charts.GET(getRequest('charts?resource=source&sourceId='+source.id));assert.equal(downloaded.status,200);assert.equal(await downloaded.text(),evidence);
  const backup=await backups.GET(getRequest('backups?chartId='+c.id)).then(r=>r.json()) as any;
  assert.equal(backup.scope,'selected');assert.equal(backup.sourceFiles.length,2);
  for(const f of backup.sourceFiles)assert.equal(createHash('sha256').update(Buffer.from(f.dataBase64,'base64')).digest('hex'),f.checksum);
  const restored=await post(backups,backup);assert.equal(restored.status,201);assert.equal(restored.data.restoredCharts[0].sources.length,2);
  const corrupt=structuredClone(backup);corrupt.sourceFiles[0].dataBase64=btoa('tampered');assert.equal((await post(backups,corrupt)).status,422);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM charts').get()?.n,2);
  assert.equal((await post(intakes,{action:'discard',intakeId:intake.id})).status,409);
 }finally{sql.close();}
});
