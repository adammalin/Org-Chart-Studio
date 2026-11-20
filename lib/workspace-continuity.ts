import {agentOperationSchema,exportAgentOperations,importAgentOperations} from "./agent-workflows";
import {listPendingImports,savePendingImport,deletePendingImport} from "./pending-import-store";
import {z} from 'zod';
import type {AppBindings} from '../db';
interface IntakeRow{id:string;name:string;status:'pending'|'imported';created_at:string;updated_at:string;chart_id:string|null}
interface IntakeFileRow{id:string;intake_id:string;file_name:string;content_type:string;file_size:number;checksum:string;storage_key:string;created_at:string}
const date=z.string().max(50).refine(v=>Number.isFinite(Date.parse(v)));
const id=z.string().min(1).max(200);
const file=z.object({id,intakeId:id,fileName:z.string().min(1).max(500),contentType:z.string().max(200),fileSize:z.number().int().min(0).max(250_000_000),checksum:z.string().regex(/^[a-f0-9]{64}$/),createdAt:date,dataBase64:z.string().max(340_000_000)}).strict();
const intake=z.object({id,name:z.string().min(1).max(500),status:z.enum(['pending','imported']),createdAt:date,updatedAt:date,chartId:id.nullable(),files:z.array(file).max(1000)}).strict();
export const continuitySchema=z.object({agentOperations:z.array(agentOperationSchema).max(20000).optional(),intakes:z.array(intake).max(200),importProposals:z.array(z.object({proposal:z.record(z.string(),z.unknown()),contents:z.string().max(4_500_000)})).max(20),appearance:z.enum(['official','annotated']).optional(),libraryView:z.enum(['flat','tree']).optional()}).strict();
export type WorkspaceContinuity=z.infer<typeof continuitySchema>;
const base64=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);};
export async function exportContinuity(bindings:AppBindings):Promise<WorkspaceContinuity>{
 const rows=await bindings.DB.prepare('SELECT * FROM import_intakes').all<IntakeRow>();
 const files=await bindings.DB.prepare('SELECT * FROM import_intake_files').all<IntakeFileRow>();
 const intakes:WorkspaceContinuity['intakes']=[];
 for(const row of rows.results){
  const evidence:WorkspaceContinuity['intakes'][number]['files']=[];
  for(const f of files.results.filter(f=>f.intake_id===row.id)){
   const object=await bindings.SOURCE_FILES.get(f.storage_key);if(!object)throw Error('Retained intake evidence is missing: '+f.file_name);
   evidence.push({id:f.id,intakeId:row.id,fileName:f.file_name,contentType:f.content_type,fileSize:f.file_size,checksum:f.checksum,createdAt:f.created_at,dataBase64:base64(new Uint8Array(await object.arrayBuffer()))});
  }
  intakes.push({id:row.id,name:row.name,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,chartId:row.chart_id,files:evidence});
 }
 const preferences=await bindings.DB.prepare("SELECT key,payload FROM app_settings WHERE key IN ('chart-appearance','library-view')").all<{key:string;payload:string}>();const values=new Map(preferences.results.map(r=>[r.key,r.payload]));
 const agentOperations=await exportAgentOperations(bindings.DB);
 return {...(agentOperations.length?{agentOperations}:{}),intakes,importProposals:(await listPendingImports(bindings.DB)).map(s=>({...s,proposal:{...s.proposal}})),appearance:values.get('chart-appearance')==='annotated'?'annotated':'official',libraryView:values.get('library-view')==='tree'?'tree':'flat'};
}
export async function importContinuity(value:unknown,bindings:AppBindings,chartIds:Set<string>){
 const state=continuitySchema.parse(value);let total=0;
 if(state.agentOperations)await importAgentOperations(bindings.DB,state.agentOperations,chartIds);
 for(const [key,entry] of [['chart-appearance',state.appearance],['library-view',state.libraryView]])if(entry)await bindings.DB.prepare('INSERT INTO app_settings(key,payload) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload').bind(key!,entry).run();
 const ids=new Set<string>();
 for(const intake of state.intakes){
  if(ids.has(intake.id)||intake.chartId&&!chartIds.has(intake.chartId))throw Error('Invalid intake reference.');ids.add(intake.id);
  await bindings.DB.prepare('INSERT INTO import_intakes(id,name,status,created_at,updated_at,chart_id) VALUES(?,?,?,?,?,?)').bind(intake.id,intake.name,intake.status,intake.createdAt,intake.updatedAt,intake.chartId).run();
  for(const f of intake.files){
   if(ids.has(f.id)||f.intakeId!==intake.id)throw Error('Invalid intake file reference.');ids.add(f.id);
   total+=f.fileSize;if(total>250_000_000)throw Error('Retained intake sources exceed 250 MB.');
   const bytes=Uint8Array.from(atob(f.dataBase64),c=>c.charCodeAt(0));
   const checksum=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   if(checksum!==f.checksum||bytes.length!==f.fileSize)throw Error('Intake source checksum mismatch.');
   const key='workspace-intake/'+intake.id+'/'+f.id;await bindings.SOURCE_FILES.put(key,bytes);
   await bindings.DB.prepare('INSERT INTO import_intake_files(id,intake_id,file_name,content_type,file_size,checksum,storage_key,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(f.id,intake.id,f.fileName,f.contentType,f.fileSize,f.checksum,key,f.createdAt).run();
  }
 }
 // Rebuild pending imports through the actual application stage validator.
 const {POST}=await import('../commands/routes/ai-import-proposals/route');
 for(const stored of state.importProposals){
  const p=stored.proposal;
  if(typeof p.id!=='string'||typeof p.chartName!=='string'||!['csv','json'].includes(String(p.format))||typeof p.createdAt!=='string'||!Number.isFinite(Date.parse(p.createdAt))||p.intakeId&&!ids.has(String(p.intakeId)))throw Error('Invalid pending import.');
  const response=await POST(new Request('https://orgchart.local/api/ai-import-proposals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'stage',chartName:p.chartName,format:p.format,contents:stored.contents,intakeId:p.intakeId??undefined})}));
  const result=await response.json() as {error?:string;proposal:import('./ai-import-review').AiImportProposal};
  if(!response.ok)throw Error(result.error??'Invalid pending normalized import.');
  await deletePendingImport(bindings.DB,result.proposal.id);
  await savePendingImport(bindings.DB,{contents:stored.contents,proposal:{...result.proposal,id:p.id,createdAt:p.createdAt}});
 }
}
