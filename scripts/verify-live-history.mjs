import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const client=new Client({name:'orgchart-history-verification',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('mcp/server.mjs')],cwd:process.cwd(),stderr:'pipe'});
try{
 await client.connect(transport);
 const {tools}=await client.listTools();
 for(const name of ['search_library','list_history','get_history_checkpoint','list_monthly_updates','begin_monthly_update','complete_monthly_update'])assert.ok(tools.some(t=>t.name===name));
 async function call(name,args){const r=await client.callTool({name,arguments:args});if(r.isError)throw Error(r.content?.[0]?.text||'MCP read failed');return r.structuredContent;}
 const {charts}=await call('list_charts',{includeArchived:true});
 const chart=charts.find(c=>c.status!=='archived');assert.ok(chart);
 const {checkpoints}=await call('list_history',{chartId:chart.id});assert.ok(checkpoints.length);
 const {checkpoint}=await call('get_history_checkpoint',{chartId:chart.id,checkpointId:checkpoints[0].id});assert.equal(checkpoint.chart.id,chart.id);
 const {batches}=await call('list_monthly_updates',{});
 const person=checkpoint.chart.nodes[0]?.data.unit.assignmentLabel;
 const found=person?await call('search_library',{query:person,includeArchived:false}):{matches:[],total:0};
 if(person)assert.ok(found.total>0);
 const report={verifiedAt:new Date().toISOString(),toolCount:tools.length,historyToolsAvailable:true,charts:charts.length,activeCharts:charts.filter(c=>c.status!=='archived').length,archivedCharts:charts.filter(c=>c.status==='archived').length,sampleHistoryRead:true,sampleSnapshotCards:checkpoint.chart.nodes.length,searchMatches:found.total,monthlyBatches:batches.length};
 if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}finally{await client.close();}
