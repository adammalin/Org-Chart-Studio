/* eslint-disable @typescript-eslint/no-explicit-any -- SDK result payloads span all tool schemas. */
import {testDatabase} from './helpers/test-db';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {OrgChartAppClient} from '../mcp/orgchart-app-client.mjs';
import {createOrgChartMcpServer} from '../mcp/server.mjs';
const routeNames=['charts','ai-activity','ai-proposals','ai-import-proposals','mcp-control','history','edit-history','consistency','monthly-workspace','history/answers','source-extractions','import-intakes'];
const routes=new Map(await Promise.all(routeNames.map(async name=>[name,await import(`../app/api/${name}/route.ts`)] as const)));
class ApiClient extends OrgChartAppClient {
 async rawRequest(path:string,init:RequestInit={}) {
  const url=new URL(path,'http://127.0.0.1');const route=routes.get(url.pathname.replace('/api/',''));
  assert.ok(route,'Unexpected route '+path);const request=new Request(url,init);
  const response=await (init.method==='POST'?route.POST(request):route.GET(request));
  const data=await response.json() as any;
  if(!response.ok)throw Error(data.error??'API request failed');
  return data;
 }
}
test('MCP tools complete a synthetic monthly lifecycle through actual APIs, including reversible agent edits and source checks',async()=>{
 const {sql}=testDatabase();const app=new ApiClient();const server=createOrgChartMcpServer({client:app});
 const client=new Client({name:'Synthetic integration client',version:'1.0.0'});
 const [a,b]=InMemoryTransport.createLinkedPair();const invoked=new Set<string>();
 async function tool(name:string,args:Record<string,unknown>={}){
  const result=await client.callTool({name,arguments:args}) as any;
  assert.notEqual(result.isError,true,`${name}: ${JSON.stringify(result.content)}`);invoked.add(name);return result.structuredContent as any;
 }
 try{
  await server.connect(a);await client.connect(b);assert.equal((await client.listTools()).tools.length,30);
  await app.request('/api/mcp-control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'configure',chartScope:'all',sourceAccessEnabled:true})});
  let c=(await tool('create_chart_draft',{name:'Synthetic MCP release chart'})).chart;
  assert.equal((await tool('list_charts')).charts.length,1);
  assert.equal((await tool('get_chart',{chartId:c.id})).chart.id,c.id);
  assert.equal((await tool('validate_chart',{chartId:c.id})).valid,true);
  assert.equal((await tool('list_chart_versions',{chartId:c.id})).versions.length,1);
  const contents='id,name,shortName,type,parentId,positionTitle,assignmentLabel,positionStatus,effectiveDate,publicationVisibility\nroot,Synthetic Science,Synthetic,division,,Director,Synthetic Example,filled,Current,internal';
  const normalized={chartName:'Synthetic MCP import',format:'csv',contents};
  assert.equal((await tool('validate_normalized_import',normalized)).preview.rowCount,1);
  const imported=(await tool('import_normalized_chart',normalized)).chart;
  assert.equal((await tool('extract_chart_sources',{chartId:imported.id})).extractions.length,1);
  const importedChange=structuredClone(imported);importedChange.description='Synthetic retained-source proposal';
  const importEdit=await tool('replace_chart_draft',{chart:importedChange,changeSummary:'Synthetic retained-source update'});
  await app.request('/api/ai-proposals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'reject',proposalId:importEdit.proposal.id})});
  const form=new FormData();form.set('name','Synthetic retained source');form.set('evidence',new File(['Synthetic source only'],'evidence.csv',{type:'text/csv'}));
  const intake=(await app.request('/api/import-intakes',{method:'POST',body:form})).intake;
  assert.equal((await tool('list_import_intakes')).intakes.length,1);
  assert.equal((await tool('extract_import_intake',{intakeId:intake.id})).extractions[0].data.text,'Synthetic source only');
  const stagedImport=await tool('stage_normalized_import',{...normalized,intakeId:intake.id});
  assert.equal((await app.request('/api/ai-import-proposals?proposalId='+stagedImport.proposal.id)).proposal.id,stagedImport.proposal.id);
  const acceptedImport=await app.request('/api/ai-import-proposals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'accept',proposalId:stagedImport.proposal.id})});
  assert.equal(acceptedImport.chart.sources.length,2);
  c=(await tool('save_chart_version',{chart:c,label:'Synthetic initial checkpoint'})).chart;
  const begun=await tool('begin_monthly_update',{month:'2026-11',label:'Synthetic November',changeList:'Change the synthetic description',chartIds:[c.id]});
  assert.equal((await tool('list_monthly_updates')).batches.length,1);
  assert.equal((await tool('get_monthly_update_status',{batchId:begun.batch.id})).report.batch.id,begun.batch.id);
  c=(await tool('get_chart',{chartId:c.id})).chart;const next=structuredClone(c);next.description='Synthetic reviewed monthly change';
  const staged=await tool('replace_chart_draft',{chart:next,changeSummary:'Synthetic user-authorized description update'});
  await app.request('/api/ai-proposals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'accept',proposalId:staged.proposal.id})});
  assert.equal((await tool('complete_monthly_update',{batchId:begun.batch.id,summary:'Synthetic complete'})).batch.status,'completed');
  const history=await tool('list_history',{chartId:c.id});assert.ok(history.checkpoints.length>=4);
  assert.equal((await tool('get_history_checkpoint',{chartId:c.id,checkpointId:history.checkpoints[0].id})).checkpoint.chartId,c.id);
  let edits=await tool('list_edit_history',{chartId:c.id});const op=edits.undo.id;
  assert.ok((await tool('preview_edit_operation',{chartId:c.id,operationId:op})).operation.changes.length);
  await tool('undo_chart_edit',{chartId:c.id,operationId:op,expectedRevision:edits.revision,expectedVersion:edits.expectedVersion,expectedUpdatedAt:edits.expectedUpdatedAt,requestId:'history-request-synthetic-mcp-undo'});
  edits=await tool('list_edit_history',{chartId:c.id});
  await tool('redo_chart_edit',{chartId:c.id,operationId:edits.redo.id,expectedRevision:edits.revision,expectedVersion:edits.expectedVersion,expectedUpdatedAt:edits.expectedUpdatedAt,requestId:'history-request-synthetic-mcp-redo'});
  edits=await tool('list_edit_history',{chartId:c.id});
  const revert=await tool('stage_history_revert',{chartId:c.id,operationId:op,expectedRevision:edits.revision});
  await app.request('/api/ai-proposals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'reject',proposalId:revert.proposal.id})});
  assert.ok((await tool('search_library',{query:'synthetic',includeArchived:false})).matches.length);
  await tool('check_chart_consistency',{chartId:c.id});
  await tool('answer_saved_history',{chartId:c.id,question:'Who led this chart?',referenceDate:'2026-11-19',includeArchived:false});
  c=(await tool('get_chart',{chartId:c.id})).chart;
  await tool('record_source_check',{chartId:c.id,expectedVersion:c.version,expectedUpdatedAt:c.updatedAt,checkedBy:'Synthetic test agent',sourceUrl:'https://example.invalid/synthetic-source',sourceLocator:'Synthetic fixture',scope:'full_chart',result:'differences',findings:'Synthetic test: no official source comparison is claimed.'});
  const checks=await tool('get_source_checks',{chartId:c.id});assert.equal(checks.checks.at(-1).reviewerType,'ai');assert.equal(checks.checks.at(-1).stale,false);
  // The retained-source recheck tool has a separate STDIO/rollback-package test.
  assert.equal(invoked.size,29);
 }finally{await client.close();await server.close();sql.close();}
});
