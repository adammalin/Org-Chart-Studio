import {z} from 'zod';
import {validateHierarchy} from '../../../lib/org-chart';
import {ensureSchema,getBindings} from '../../../db';
import {applyChartPatches,chartPatchesSchema} from '../../../lib/chart-patch';
import {agentDigest,operationId,operationStatement,proposalDigest,readAgentOperation,replayOperation,scopedAgentAccess,sourceCheckInput,chartIdSchema} from '../../../lib/agent-workflows';
import {getPendingProposal} from '../../../lib/pending-proposal-store';
import {decideProposals} from '../../../lib/proposal-decisions';
import type {AiChartProposal} from '../../../lib/ai-change-review';
import {POST as chartsPOST} from '../charts/route';
import {stageReviewedChart,loadCurrentChart} from '../ai-proposals/route';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
const proposalInput=z.object({proposalId:z.string().min(1).max(200),digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const stageSchema=z.object({action:z.literal('stage_patch'),requestId:operationId,chartId:chartIdSchema,expectedVersion:z.number().int().positive(),expectedUpdatedAt:z.string().min(1).max(60),patches:chartPatchesSchema,changeSummary:z.string().min(3).max(500)}).strict();
const startSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('start_validation_batch'),requestId:operationId,label:z.string().min(1).max(160),chartIds:z.array(chartIdSchema).min(1).max(200)}).strict(),
 z.object({action:z.literal('start_source_check_batch'),requestId:operationId,label:z.string().min(1).max(160),checks:z.array(sourceCheckInput).min(1).max(200)}).strict(),
]);
interface Item {chartId:string;state:'pending'|'succeeded'|'failed';input?:z.infer<typeof sourceCheckInput>;receipt?:unknown;error?:string}
interface Job {leaseUntil?:string;id:string;label:string;status:'pending'|'running'|'paused'|'complete'|'complete_with_errors';items:Item[]}
const compactProposal=async(p:AiChartProposal)=>({proposalId:p.id,chartId:p.chartId,chartName:p.chartName,digest:await proposalDigest(p),summary:p.summary,changes:p.changes,expectedVersion:p.current.version,expectedUpdatedAt:p.current.updatedAt,kind:'review_required'});
async function chart(id:string){const value=await loadCurrentChart(getBindings().DB,id);if(!value)throw Error('Chart not found.');return value;}
async function proposals(inputs:z.infer<typeof proposalInput>[]){const {DB}=getBindings();const result=[];for(const input of inputs){const p=await getPendingProposal(DB,input.proposalId);if(!p||await proposalDigest(p)!==input.digest)throw Error('The reviewed proposal changed or is no longer pending. Review it again.');result.push(p);}return result;}
function jobProgress(job:Job){return {...job,items:job.items.map(({chartId,state,receipt,error})=>({chartId,state,...(receipt?{receipt}:{}),...(error?{error}:{})})),completed:job.items.filter(i=>i.state!=='pending').length,remaining:job.items.filter(i=>i.state==='pending').length,failures:job.items.filter(i=>i.state==='failed').length};}
export async function GET(request:Request){
 const {DB}=getBindings();await ensureSchema(DB);const url=new URL(request.url);
 try{
  const proposalId=url.searchParams.get('proposalId');
  if(proposalId){const p=await getPendingProposal(DB,proposalId);if(!p)return json({error:'The proposal is no longer pending.'},404);await scopedAgentAccess(DB,[p.chartId],'read');return json(await compactProposal(p));}
  if(url.searchParams.get('resource')==='operations'){
   await scopedAgentAccess(DB,[],'read');const {GET}=await import('../mcp-control/route');const {control}=await (await GET()).json() as {control:{chartScope:string;allowedChartIds:string[]}};
   const rows=await DB.prepare('SELECT * FROM agent_operations ORDER BY updated_at DESC,id').all<import('../../../lib/agent-workflows').AgentOperation>();
   return json({operations:rows.results.filter(row=>JSON.parse(row.chart_ids).every((id:string)=>control.chartScope==='all'||control.allowedChartIds.includes(id))).slice(0,20).map(row=>{const p=JSON.parse(row.payload);return {requestId:row.id,kind:row.kind,status:p.status??'recorded',label:p.label,chartIds:JSON.parse(row.chart_ids),updatedAt:row.updated_at,...(row.kind.endsWith('_batch')?{completed:p.items.filter((i:Item)=>i.state!=='pending').length,remaining:p.items.filter((i:Item)=>i.state==='pending').length}:{})};})});
  }
  const id=url.searchParams.get('requestId');
  if(id){const row=await readAgentOperation(DB,id);if(!row)return json({error:'Agent operation not found.'},404);await scopedAgentAccess(DB,JSON.parse(row.chart_ids),'read');const value=JSON.parse(row.payload);return json({kind:row.kind,...(row.kind.endsWith('_batch')?jobProgress(value):value)});}
  const rows=await DB.prepare("SELECT * FROM agent_operations WHERE kind='apply_request' AND json_extract(payload,'$.status')='pending' ORDER BY created_at DESC LIMIT 20").all<import('../../../lib/agent-workflows').AgentOperation>();
  const requests=[];for(const row of rows.results){const p=JSON.parse(row.payload);if(p.status!=='pending')continue;const ps=await proposals(p.proposals).catch(()=>[]);requests.push({...p,valid:ps.length===p.proposals.length,summaries:await Promise.all(ps.map(compactProposal))});}
  return json({requests});
 }catch(error){return json({error:(error as Error).message},409);}
}
export async function POST(request:Request){
 const {DB}=getBindings();await ensureSchema(DB);let raw:Record<string,unknown>;
 try{const contents=await request.text();if(contents.length>4000000)return json({error:'Agent requests are limited to 4 MB.'},413);raw=JSON.parse(contents);if(!raw||typeof raw!=='object'||Array.isArray(raw))return json({error:'Expected an object.'},422);}catch{return json({error:'The request is not valid JSON.'},400);}
 try{
  if(raw.action==='stage_patch'){
   const input=stageSchema.parse(raw);await scopedAgentAccess(DB,[input.chartId],'write');const hash=await agentDigest(input);const replay=await replayOperation(DB,input.requestId,hash);if(replay)return json({...replay,replayed:true});
   const current=await chart(input.chartId);if(current.version!==input.expectedVersion||current.updatedAt!==input.expectedUpdatedAt)return json({error:'The chart changed. Read the current chart and prepare a fresh patch.'},409);
   const next=applyChartPatches(current,input.patches);let receipt:unknown;
   // Build the digest before the shared stage validator commits the proposal.
   const response=await stageReviewedChart(DB,next,input.changeSummary, async p=>{receipt=await compactProposal(p);return [operationStatement(DB,input.requestId,'patch',hash,[input.chartId],receipt)];});
   // stageReviewedChart invokes an async receipt factory before its atomic save.
   if(!response.ok)return response;
   const data=await response.json() as {proposal:AiChartProposal};receipt=await compactProposal(data.proposal);
   return json(receipt,201);
  }
  if(raw.action==='start_validation_batch'||raw.action==='start_source_check_batch'){
   const input=startSchema.parse(raw),ids=input.action==='start_validation_batch'?input.chartIds:input.checks.map(c=>c.chartId);
   if(new Set(ids).size!==ids.length)return json({error:'Use each chart only once per batch.'},422);await scopedAgentAccess(DB,ids,input.action==='start_validation_batch'?'read':'write');
   const hash=await agentDigest(input),prior=await replayOperation(DB,input.requestId,hash);if(prior)return json(jobProgress(prior));
   // Validate references before creating durable work.
   for(const id of ids)if(!await DB.prepare('SELECT id FROM charts WHERE id=?').bind(id).first())throw Error('Chart not found.');
   const job:Job={id:input.requestId,label:input.label,status:'pending',items:ids.map((chartId,i)=>({chartId,state:'pending',...(input.action==='start_source_check_batch'?{input:input.checks[i]}:{})}))};
   await operationStatement(DB,input.requestId,input.action==='start_validation_batch'?'validation_batch':'source_check_batch',hash,ids,job).run();return json(jobProgress(job),201);
  }
  if(raw.action==='continue_batch'){
   const input=z.object({action:z.literal('continue_batch'),requestId:operationId,maxItems:z.number().int().min(1).max(25).default(10)}).strict().parse(raw);
   const row=await readAgentOperation(DB,input.requestId);if(!row||!['validation_batch','source_check_batch'].includes(row.kind))return json({error:'Batch not found.'},404);const job=JSON.parse(row.payload) as Job;
   await scopedAgentAccess(DB,JSON.parse(row.chart_ids),row.kind==='validation_batch'?'read':'write');
   if(!job.items.some(i=>i.state==='pending'))return json(jobProgress(job));
   if(job.leaseUntil&&Date.parse(job.leaseUntil)>Date.now())return json({...jobProgress(job),kind:'batch_busy',retryAfterMs:Math.min(5000,Date.parse(job.leaseUntil)-Date.now())});
   const priorPayload=row.payload;job.leaseUntil=new Date(Date.now()+90000).toISOString();job.status='running';
   const claim=await DB.prepare('UPDATE agent_operations SET payload=?,updated_at=? WHERE id=? AND payload=?').bind(JSON.stringify(job),new Date().toISOString(),row.id,priorPayload).run();
   if(!claim.meta.changes)return json({kind:'batch_busy',requestId:row.id,retryAfterMs:5000});
   let count=0;for(let i=0;i<job.items.length&&count<input.maxItems;i++){const item=job.items[i];if(item.state!=='pending')continue;count++;
    try{
     if(row.kind==='validation_batch'){const c=await chart(item.chartId);const findings=validateHierarchy(c.nodes,c.edges),blockingCount=findings.filter(f=>f.severity==='blocking').length;item.receipt={version:c.version,updatedAt:c.updatedAt,valid:blockingCount===0,blockingCount,findingCount:findings.length,findingsTruncated:findings.length>10,findings:findings.slice(0,10).map(f=>({...f,message:f.message.slice(0,350)}))};}
     else {const {chartId,expectedVersion,expectedUpdatedAt,...check}=item.input!;const response=await chartsPOST(new Request('https://orgchart.local/api/charts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'record_source_check',chartId,expectedVersion,expectedUpdatedAt,requestId:'agent-check-'+await agentDigest({batch:input.requestId,item:i}),sourceCheck:{...check,sourceRevision:check.sourceRevision??'',reviewerType:'ai'}})}));const data=await response.json() as {sourceCheck:unknown;error?:string};if(!response.ok)throw Error(data.error??'Source check failed.');const recorded=data.sourceCheck as {id:string;checkedAt:string;contentFingerprint:string;result:string;scope:string};item.receipt={sourceCheck:{id:recorded.id,checkedAt:recorded.checkedAt,contentFingerprint:recorded.contentFingerprint,result:recorded.result,scope:recorded.scope}};}
     item.state='succeeded';
    }catch(error){item.state='failed';item.error=(error as Error).message.slice(0,700);}
    job.status=job.items.some(i=>i.state==='pending')?'paused':job.items.some(i=>i.state==='failed')?'complete_with_errors':'complete';
    if(count===input.maxItems||!job.items.some(i=>i.state==='pending'))delete job.leaseUntil;
    await DB.prepare('UPDATE agent_operations SET payload=?,updated_at=? WHERE id=?').bind(JSON.stringify(job),new Date().toISOString(),input.requestId).run();
   }
   return json(jobProgress(job));
  }
  if(raw.action==='prepare_apply'){
   const input=z.object({action:z.literal('prepare_apply'),requestId:operationId,proposals:z.array(proposalInput).min(1).max(10)}).strict().parse(raw);const hash=await agentDigest(input);const prior=await readAgentOperation(DB,input.requestId);
   if(prior){await scopedAgentAccess(DB,JSON.parse(prior.chart_ids),'write');if(prior.request_hash!==hash)throw Error('Request ID reused with different proposals.');return json(JSON.parse(prior.payload));}
   const ps=await proposals(input.proposals);const ids=ps.map(p=>p.chartId);if(new Set(ids).size!==ids.length)throw Error('Select one proposal per chart.');await scopedAgentAccess(DB,ids,'write');
   const receipt={requestId:input.requestId,status:'pending',kind:'interaction_required',proposals:input.proposals,message:'Review the proposed changes and choose Apply reviewed set in Studio. Preparing this request has not changed any chart.'};
   await operationStatement(DB,input.requestId,'apply_request',hash,ids,receipt).run();return json(receipt,201);
  }
  if(raw.action==='apply_reviewed'||raw.action==='dismiss_apply'){
   const input=z.object({action:z.enum(['apply_reviewed','dismiss_apply']),requestId:operationId}).strict().parse(raw);const row=await readAgentOperation(DB,input.requestId);if(!row||row.kind!=='apply_request')return json({error:'Apply request not found.'},404);
   const state=JSON.parse(row.payload);await scopedAgentAccess(DB,JSON.parse(row.chart_ids),'write');if(state.status!=='pending')return json({...state,replayed:true});
   if(input.action==='dismiss_apply'){state.status='dismissed';await DB.prepare('UPDATE agent_operations SET payload=?,updated_at=? WHERE id=?').bind(JSON.stringify(state),new Date().toISOString(),row.id).run();return json(state);}
   const ps=await proposals(state.proposals);await scopedAgentAccess(DB,ps.map(p=>p.chartId),'write');const receipt={...state,status:'applied',kind:'applied_with_checkpoints',message:'The exact reviewed set was applied with before/after checkpoints and undo history.',appliedAt:new Date().toISOString()};
   await decideProposals(DB,ps.map(p=>p.id),'accept',undefined,[DB.prepare('UPDATE agent_operations SET payload=?,updated_at=? WHERE id=?').bind(JSON.stringify(receipt),receipt.appliedAt,row.id)]);
   return json(receipt);
  }
  return json({error:'Unknown agent workflow action.'},400);
 }catch(error){return json({error:error instanceof z.ZodError?'Invalid agent workflow input.':(error as Error).message},error instanceof z.ZodError?422:409);}
}
