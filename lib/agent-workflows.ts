import {z} from 'zod';
import type {AiChartProposal} from './ai-change-review';
import {operationId,chartIdSchema} from '../shared/agent-schemas.mjs';
export {operationId,chartIdSchema,sourceCheckInput} from '../shared/agent-schemas.mjs';
import {sourceCheckInput} from '../shared/agent-schemas.mjs';
export type AgentOperation=z.infer<typeof agentOperationSchema>;
export const agentOperationSchema=z.object({id:operationId,kind:z.enum(['patch','source_check','validation_batch','source_check_batch','apply_request']),request_hash:z.string().regex(/^[a-f0-9]{64}$/),chart_ids:z.string().max(50000),payload:z.string().max(4000000),created_at:z.string().max(60),updated_at:z.string().max(60)}).strict();
export const canonicalJson=(value:unknown):string=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)):v);
export async function agentDigest(value:unknown){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(value)))),b=>b.toString(16).padStart(2,'0')).join('');}
const portableChart=(chart:AiChartProposal['current'])=>({...chart,sources:chart.sources.map(source=>({...source,storageKey:''}))});
// Storage keys are runtime locations, not reviewed content; portable Open remaps them.
export const proposalDigest=(p:AiChartProposal)=>agentDigest({id:p.id,chartId:p.chartId,current:portableChart(p.current),proposed:portableChart(p.proposed),changeSummary:p.changeSummary});

export function validateAgentOperation(row:AgentOperation){
 agentOperationSchema.parse(row);
 const ids=z.array(chartIdSchema).min(1).max(200).parse(JSON.parse(row.chart_ids));
 if(new Set(ids).size!==ids.length)throw Error('Duplicate agent workflow chart reference.');
 const p=JSON.parse(row.payload);
 if(row.kind==='validation_batch'||row.kind==='source_check_batch'){
  const job=z.object({id:operationId,label:z.string().min(1).max(160),status:z.enum(['pending','running','paused','complete','complete_with_errors']),leaseUntil:z.string().datetime().optional(),items:z.array(z.object({chartId:chartIdSchema,state:z.enum(['pending','succeeded','failed']),input:sourceCheckInput.optional(),receipt:z.unknown().optional(),error:z.string().max(700).optional()}).strict()).min(1).max(200)}).strict().parse(p);
  if(job.id!==row.id||canonicalJson([...ids].sort())!==canonicalJson(job.items.map(i=>i.chartId).sort()))throw Error('Agent batch chart references differ.');
  for(const item of job.items){if(row.kind==='source_check_batch'&&(!item.input||item.input.chartId!==item.chartId))throw Error('Invalid source-check batch item.');if(row.kind==='validation_batch'&&item.input)throw Error('Invalid validation batch item.');}
 }else if(row.kind==='apply_request'){
  const value=z.object({requestId:operationId,status:z.enum(['pending','applied','dismissed']),kind:z.enum(['interaction_required','applied_with_checkpoints']),proposals:z.array(z.object({proposalId:z.string().min(1).max(200),digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1).max(10),message:z.string().max(1000),appliedAt:z.string().max(60).optional()}).strict().parse(p);
  if(value.requestId!==row.id)throw Error('Apply request identity differs.');
 }else if(row.kind==='patch'){
  if(!p||typeof p!=='object'||!ids.includes(p.chartId)||typeof p.proposalId!=='string'||typeof p.digest!=='string'||!Array.isArray(p.changes))throw Error('Invalid patch receipt.');
 }else if(!p||typeof p!=='object'||!p.sourceCheck||typeof p.sourceCheck.id!=='string')throw Error('Invalid source-check receipt.');
 return row;
}

export async function readAgentOperation(db:D1Database,id:string){const row=await db.prepare('SELECT * FROM agent_operations WHERE id=?').bind(operationId.parse(id)).first<AgentOperation>();return row?validateAgentOperation(row):null;}
export function operationStatement(db:D1Database,id:string,kind:string,hash:string,chartIds:string[],payload:unknown){const at=new Date().toISOString();validateAgentOperation({id,kind,request_hash:hash,chart_ids:JSON.stringify(chartIds),payload:JSON.stringify(payload),created_at:at,updated_at:at} as AgentOperation);return db.prepare('INSERT INTO agent_operations(id,kind,request_hash,chart_ids,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,kind,hash,JSON.stringify(chartIds),JSON.stringify(payload),at,at);}
export async function replayOperation(db:D1Database,id:string,hash:string){const old=await readAgentOperation(db,id);if(!old)return null;if(old.request_hash!==hash)throw Error('This request ID was already used for different input. Use a new request ID.');return JSON.parse(old.payload);}
export async function scopedAgentAccess(db:D1Database,ids:string[],mode:'read'|'write'){
 const {POST}=await import('../commands/routes/mcp-control/route');
 for(const id of ids.length?new Set(ids):[undefined]){const r=await POST(new Request('https://orgchart.local/api/mcp-control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'authorize',toolName:'agent_workflow',chartId:id,mode})}));if(!r.ok)throw Error(((await r.json()) as {error:string}).error);}
}
export async function exportAgentOperations(db:D1Database){return (await db.prepare('SELECT * FROM agent_operations ORDER BY created_at,id').all<AgentOperation>()).results;}
export async function importAgentOperations(db:D1Database,raw:unknown,ids:Set<string>){
 const rows=z.array(agentOperationSchema).max(20000).parse(raw);let total=0;const seen=new Set<string>();
 for(const row of rows){validateAgentOperation(row);total+=row.payload.length;if(total>100000000)throw Error('Agent workflow history exceeds 100 MB.');if(seen.has(row.id))throw Error('Duplicate agent workflow.');seen.add(row.id);const charts=z.array(chartIdSchema).min(1).max(200).parse(JSON.parse(row.chart_ids));if(charts.some(c=>!ids.has(c)))throw Error('Agent workflow references an unknown chart.');const payload=JSON.parse(row.payload);if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Invalid agent workflow state.');await db.prepare('INSERT INTO agent_operations(id,kind,request_hash,chart_ids,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(row.id,row.kind,row.request_hash,row.chart_ids,row.payload,row.created_at,row.updated_at).run();}
}
