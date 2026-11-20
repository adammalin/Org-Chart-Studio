import type {AiImportProposal} from './ai-import-review';
export interface StoredImportProposal {proposal:AiImportProposal;contents:string}
export async function listPendingImports(db:D1Database){
 const rows=await db.prepare('SELECT payload,contents FROM ai_import_proposals ORDER BY created_at').all<{payload:string;contents:string}>();
 return rows.results.map(r=>({proposal:JSON.parse(r.payload) as AiImportProposal,contents:r.contents}));
}
export async function getPendingImport(db:D1Database,id:string):Promise<StoredImportProposal|null>{
 const row=await db.prepare('SELECT payload,contents FROM ai_import_proposals WHERE id=?').bind(id).first<{payload:string;contents:string}>();
 return row?{proposal:JSON.parse(row.payload) as AiImportProposal,contents:row.contents}:null;
}
export async function savePendingImport(db:D1Database,stored:StoredImportProposal){
 const r=await db.prepare('INSERT INTO ai_import_proposals(id,created_at,payload,contents) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM ai_import_proposals)<20').bind(stored.proposal.id,stored.proposal.createdAt,JSON.stringify(stored.proposal),stored.contents).run();
 if(!r.meta.changes)throw Error('Review or reject an existing pending import before staging another (limit 20).');
}
export const deletePendingImport=(db:D1Database,id:string)=>db.prepare('DELETE FROM ai_import_proposals WHERE id=?').bind(id).run();
