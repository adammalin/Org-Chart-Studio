import 'fake-indexeddb/auto';
import './helpers/test-db';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadSqlite} from '../runtime/browser/sqlite';
import {BrowserRecovery} from '../runtime/browser/recovery';
import {applyChartPatches} from '../lib/chart-patch';
import {supportFixture} from './helpers/support-fixture';
import type {ChartDocument} from '../lib/chart-library';
const {BrowserWorkspace}=await import('../runtime/browser/workspace');
const SQLite=await loadSqlite();
async function fixture(){const name='synthetic-agent-'+crypto.randomUUID(),recovery=await BrowserRecovery.open(name);return {name,recovery,ws:await BrowserWorkspace.open(SQLite,recovery)};}
type WS=InstanceType<typeof BrowserWorkspace>;
async function request(ws:WS,path:string,body?:unknown,expected=(body as {action?:string})?.action==='create'?201:200){const r=await ws.request(new Request('https://orgchart.local/api/'+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined));const data=await r.json() as {chart:ChartDocument;proposalId:string;digest:string;replayed?:boolean;remaining:number;completed:number;failures:number};assert.equal(r.status,expected,JSON.stringify(data));return data;}
const patch=(c:ChartDocument,id:string,value='Synthetic New Holder')=>({action:'stage_patch',requestId:id,chartId:c.id,expectedVersion:c.version,expectedUpdatedAt:c.updatedAt,changeSummary:'Synthetic requested correction',patches:[{kind:'unit',unitId:c.nodes[0].id,fields:{assignmentLabel:value}}]});
test('field patches preserve source geometry and reject protected, unknown and duplicate edits',()=>{
 const c=supportFixture(),next=applyChartPatches(c,[{kind:'unit',unitId:c.nodes[0].id,fields:{assignmentLabel:'Synthetic Changed'}},{kind:'support_entry',panelId:c.supportPanels![0].id,entryId:c.supportPanels![0].entries[0].id,fields:{person:'Synthetic Support Changed'}}]);
 assert.deepEqual(next.edges,c.edges);assert.deepEqual(next.nodes.map(n=>({id:n.id,position:n.position,style:n.style})),c.nodes.map(n=>({id:n.id,position:n.position,style:n.style})));assert.deepEqual(next.sourceLayout,c.sourceLayout);assert.notEqual(next.nodes[0].data.unit.assignmentLabel,c.nodes[0].data.unit.assignmentLabel);
 for(const fields of [{id:'bad'},{position:{x:0,y:0}},{__proto__:null,unknown:'bad'}])assert.throws(()=>applyChartPatches(c,[{kind:'unit',unitId:c.nodes[0].id,fields}]));
 assert.throws(()=>applyChartPatches(c,[{kind:'unit',unitId:'missing',fields:{name:'x'}}]),/does not exist/);
 assert.throws(()=>applyChartPatches(c,[{kind:'chart',fields:{name:'x'}},{kind:'chart',fields:{name:'y'}}]),/Duplicate/);
});
test('patch retries return the same proposal; exact reviewed set applies once with checkpoints and undo history',async()=>{
 const {ws,recovery}=await fixture();const c=(await request(ws,'charts',{action:'create',name:'Synthetic Agent Patch'})).chart;
 const input=patch(c,'agent-patch-once'),p=await request(ws,'agent-workflows',input,201);const again=await request(ws,'agent-workflows',input);assert.equal(again.proposalId,p.proposalId);assert.equal(again.replayed,true);
 await request(ws,'agent-workflows',{...input,changeSummary:'Synthetic different input'},409);
 assert.equal((await ws.export()).library.charts[0].nodes[0].data.unit.assignmentLabel,c.nodes[0].data.unit.assignmentLabel);
 const reviewed={action:'prepare_apply',requestId:'agent-apply-once',proposals:[{proposalId:p.proposalId,digest:p.digest}]};await request(ws,'agent-workflows',reviewed,201);
 await request(ws,'agent-workflows',{action:'apply_reviewed',requestId:reviewed.requestId});const after=await ws.export();assert.equal(after.library.charts[0].nodes[0].data.unit.assignmentLabel,'Synthetic New Holder');assert.ok(after.library.editHistory!.operations.length);assert.ok(after.library.checkpoints!.length>=2);
 assert.equal((await request(ws,'agent-workflows',{action:'apply_reviewed',requestId:reviewed.requestId})).replayed,true);assert.deepEqual((await ws.export()).library.editHistory,after.library.editHistory);
 recovery.close();
});
test('batch progress and idempotent source checks survive recovery and portable reopen',async()=>{
 const {ws,recovery,name}=await fixture();const a=(await request(ws,'charts',{action:'create',name:'Synthetic Batch A'})).chart,b=(await request(ws,'charts',{action:'create',name:'Synthetic Batch B'})).chart;
 await request(ws,'agent-workflows',{action:'start_source_check_batch',requestId:'agent-source-batch',label:'Synthetic comparison receipts',checks:[a,b].map(c=>({chartId:c.id,expectedVersion:c.version,expectedUpdatedAt:c.updatedAt,checkedBy:'Synthetic test agent',sourceUrl:'https://example.invalid/chart',sourceLocator:'Synthetic slide 1',result:'matches',scope:'full_chart',findings:'Synthetic fixture compared in test only.'}))},201);
 const partial=await request(ws,'agent-workflows',{action:'continue_batch',requestId:'agent-source-batch',maxItems:1});assert.equal(partial.remaining,1);assert.equal(partial.completed,1);assert.equal(partial.failures,0);assert.ok(!('input' in (partial as unknown as {items:object[]}).items[0]));
 const resumed=await BrowserWorkspace.open(SQLite,await BrowserRecovery.open(name));const complete=await request(resumed,'agent-workflows',{action:'continue_batch',requestId:'agent-source-batch'});assert.equal(complete.remaining,0);assert.equal(complete.completed,2);
 // Simulate a response lost after the record committed but before batch progress did.
 const file=await resumed.export();const operations=file.continuity!.agentOperations!;const batch=operations.find(x=>x.id==='agent-source-batch')!;const job=JSON.parse(batch.payload);job.items[0].state='pending';delete job.items[0].receipt;job.status='paused';batch.payload=JSON.stringify(job);
 const copy=await fixture();await copy.ws.openDocument(file,'synthetic-agent.orgchart-workspace','unencrypted');const replay=await request(copy.ws,'agent-workflows',{action:'continue_batch',requestId:'agent-source-batch'});assert.equal(replay.failures,0);assert.equal(replay.completed,2);
 const after=await copy.ws.export();assert.equal(after.library.charts.flatMap(c=>c.sourceChecks??[]).length,2);assert.equal(after.continuity!.agentOperations!.length,3);
 recovery.close();copy.recovery.close();
});
test('stale review set applies nothing and scope or Pause blocks resumed operations',async()=>{
 const {ws,recovery}=await fixture();const a=(await request(ws,'charts',{action:'create',name:'Synthetic Atomic A'})).chart,b=(await request(ws,'charts',{action:'create',name:'Synthetic Atomic B'})).chart;
 const pa=await request(ws,'agent-workflows',patch(a,'agent-atomic-a'),201),pb=await request(ws,'agent-workflows',patch(b,'agent-atomic-b'),201);
 await request(ws,'agent-workflows',{action:'prepare_apply',requestId:'agent-atomic-apply',proposals:[pa,pb].map(p=>({proposalId:p.proposalId,digest:p.digest}))},201);
 b.description='Synthetic manual change';await request(ws,'charts',{action:'save',chart:b});await request(ws,'agent-workflows',{action:'apply_reviewed',requestId:'agent-atomic-apply'},409);assert.equal((await ws.export()).library.charts.find(c=>c.id===a.id)!.nodes[0].data.unit.assignmentLabel,a.nodes[0].data.unit.assignmentLabel);
 await request(ws,'agent-workflows',{action:'start_validation_batch',requestId:'agent-scope-batch',label:'Synthetic structural checks',chartIds:[a.id,b.id]},201);
 await request(ws,'mcp-control',{action:'configure',paused:false,chartScope:'selected',allowedChartIds:[a.id],sourceAccessEnabled:true});await request(ws,'agent-workflows',{action:'continue_batch',requestId:'agent-scope-batch'},409);
 await request(ws,'mcp-control',{action:'configure',paused:true,chartScope:'all',allowedChartIds:[],sourceAccessEnabled:true});await request(ws,'agent-workflows?requestId=agent-scope-batch',undefined,409);recovery.close();
});
test('import rejects batch scope spoofing before replacing the current workspace',async()=>{
 const {ws,recovery}=await fixture();const a=(await request(ws,'charts',{action:'create',name:'Synthetic Import Guard A'})).chart,b=(await request(ws,'charts',{action:'create',name:'Synthetic Import Guard B'})).chart;
 await request(ws,'agent-workflows',{action:'start_validation_batch',requestId:'agent-import-guard',label:'Synthetic guard',chartIds:[a.id]},201);
 const file=await ws.export(),row=file.continuity!.agentOperations![0],job=JSON.parse(row.payload);job.items[0].chartId=b.id;row.payload=JSON.stringify(job);
 await assert.rejects(()=>ws.openDocument(file,'synthetic-spoofed.orgchart-workspace','unencrypted'),/chart references differ/);assert.equal((await ws.export()).library.charts.length,2);recovery.close();
});


test('exact proposal digests survive portable reopen with retained source storage remapping',async()=>{
 const {ws,recovery}=await fixture();const form=new FormData();form.set('chartName','Synthetic Source Digest');form.set('file',new File(['id,name,type,parentId,positionTitle,assignmentLabel,positionStatus\nroot,Synthetic Root,laboratory,,Director,Synthetic Original,filled'],'synthetic.csv',{type:'text/csv'}));
 const imported=await ws.request(new Request('https://orgchart.local/api/charts',{method:'POST',body:form}));assert.equal(imported.status,201);const c=((await imported.json()) as {chart:ChartDocument}).chart;
 const p=await request(ws,'agent-workflows',patch(c,'agent-source-digest'),201);await request(ws,'agent-workflows',{action:'prepare_apply',requestId:'agent-source-apply',proposals:[{proposalId:p.proposalId,digest:p.digest}]},201);
 const file=await ws.export(),copy=await fixture();await copy.ws.openDocument(file,'synthetic-retained.orgchart-workspace','unencrypted');
 const opened=await request(copy.ws,'agent-workflows?proposalId='+p.proposalId);assert.equal(opened.digest,p.digest);await request(copy.ws,'agent-workflows',{action:'apply_reviewed',requestId:'agent-source-apply'});
 const after=await copy.ws.export();assert.equal(after.library.charts[0].nodes[0].data.unit.assignmentLabel,'Synthetic New Holder');assert.equal(after.library.sourceFiles.length,1);recovery.close();copy.recovery.close();
});

test('pending batch leases report busy; expired crash leases resume without losing progress',async()=>{
 const {ws,recovery}=await fixture();const c=(await request(ws,'charts',{action:'create',name:'Synthetic Crash Lease'})).chart;
 await request(ws,'agent-workflows',{action:'start_validation_batch',requestId:'agent-crash-lease',label:'Synthetic interrupted batch',chartIds:[c.id]},201);
 const file=await ws.export(),row=file.continuity!.agentOperations![0],job=JSON.parse(row.payload);job.status='running';job.leaseUntil=new Date(Date.now()+60000).toISOString();row.payload=JSON.stringify(job);const copy=await fixture();await copy.ws.openDocument(file,'synthetic-lease.orgchart-workspace','unencrypted');
 const busy=await request(copy.ws,'agent-workflows',{action:'continue_batch',requestId:'agent-crash-lease'});assert.equal(busy.completed,0);assert.equal(busy.remaining,1);
 job.leaseUntil='2026-01-01T00:00:00.000Z';row.payload=JSON.stringify(job);await copy.ws.openDocument(file,'synthetic-expired-lease.orgchart-workspace','unencrypted');
 const resumed=await request(copy.ws,'agent-workflows',{action:'continue_batch',requestId:'agent-crash-lease'});assert.equal(resumed.completed,1);assert.equal(resumed.remaining,0);assert.equal(resumed.failures,0);recovery.close();copy.recovery.close();
});
