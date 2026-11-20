import {ensureSchema,getBindings} from '../../../db';
import {exportWorkingLibrary} from '../../../lib/export-workspace';
// Point-in-time continuation file for the conventional desktop database.
// Opening files happens in the isolated file workspace, never over this database.
export async function GET(){
 const {DB}=getBindings();await ensureSchema(DB);
 await DB.prepare("INSERT OR IGNORE INTO app_settings(key,payload) VALUES('portable-workspace-id',?)").bind(JSON.stringify('workspace-'+crypto.randomUUID())).run();
 const row=await DB.prepare("SELECT payload FROM app_settings WHERE key='portable-workspace-id'").first<{payload:string}>();
 return Response.json(await exportWorkingLibrary({id:JSON.parse(row!.payload),revision:Date.now()}));
}
