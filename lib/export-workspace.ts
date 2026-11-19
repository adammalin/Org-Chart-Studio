import {GET as exportBackup} from '../commands/routes/backups/route';
import {getBindings} from '../db';
import {exportContinuity} from './workspace-continuity';
import type {LibraryBackup} from './backup-format';
import type {WorkspacePackage} from './workspace-format';
export async function exportWorkingLibrary(workspace:{id:string;revision:number}):Promise<WorkspacePackage>{
 const {DB,SOURCE_FILES}=getBindings();
 const response=await exportBackup(new Request('https://orgchart.local/api/backups'));
 let library:LibraryBackup;
 if(response.ok)library=await response.json() as LibraryBackup;
 else if(!(await DB.prepare('SELECT id FROM charts LIMIT 1').first()))library={format:'orgchart-studio-library-backup',schemaVersion:7,scope:'all',exportedAt:new Date().toISOString(),chartCount:0,sourceFileCount:0,charts:[],sourceFiles:[],chartVersions:[],aiActivities:[],checkpoints:[],monthlyUpdates:[],editHistory:{operations:[],events:[]}};
 else throw Error(((await response.json()) as {error:string}).error);
 const proposals=await DB.prepare("SELECT payload FROM ai_chart_proposals WHERE status='pending'").all<{payload:string}>();
 return {format:'orgchart-studio-workspace',schemaVersion:1,workspace:{...workspace},library,continuity:await exportContinuity({DB,SOURCE_FILES}),
  pendingProposals:proposals.results.map(p=>{const proposal=JSON.parse(p.payload);for(const chart of [proposal.current,proposal.proposed])chart.sources=chart.sources.map((s:Record<string,unknown>)=>({...s,storageKey:''}));return proposal;})};
}
