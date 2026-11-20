import {exportWorkingLibrary} from '../../lib/export-workspace';
import {POST as stageChartReview} from "../../commands/routes/ai-proposals/route";
import {importContinuity} from "../../lib/workspace-continuity";
import { editableChartShapeError } from "../../lib/editable-chart-shape";
import type { SqlJsStatic } from 'sql.js';
import { BrowserDatabase } from './sqlite';
import { BrowserRecovery, type WorkspaceMetadata } from './recovery';
import { installWorkspaceBindings } from '../../db';
import { dispatchCommand } from '../../commands/dispatch';
import { restoreLibrary } from '../../commands/routes/backups/route';
import { isLibraryBackup, type LibraryBackup } from '../../lib/backup-format';
import { isWorkspacePackage } from '../../lib/workspace-format';
import { diffChartDocuments } from '../../lib/ai-change-review';
import { savePendingProposal } from '../../lib/pending-proposal-store';

function resetSession() {
  for (const key of ['__orgChartMcpControlStore','__orgChartMcpActivityStore','__orgChartAiImportProposalStore'])
    delete (globalThis as unknown as Record<string,unknown>)[key];
}
export class BrowserWorkspace {
  engine: BrowserDatabase;
  metadata: WorkspaceMetadata;
  connectionId=crypto.randomUUID();
  private sessionState:Record<string,unknown>={};
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly SQLite: SqlJsStatic, readonly recovery: BrowserRecovery, engine: BrowserDatabase, metadata: WorkspaceMetadata) {
    this.engine = engine; this.metadata = metadata; this.bind();
  }
  static async open(SQLite: SqlJsStatic, recovery: BrowserRecovery, passphrase?:string) {
    const saved = await recovery.load(passphrase);
    const metadata = saved?.metadata ?? {id:`workspace-${crypto.randomUUID()}`, revision:0,fileRevision:0,
      fileName:null,lastFileSavedAt:null,recoveredAt:new Date().toISOString(), protection:'unencrypted' as const};
    const workspace = new BrowserWorkspace(SQLite,recovery,new BrowserDatabase(SQLite,saved?.snapshot),metadata);
    await recovery.commit(workspace.engine,metadata,true); return workspace;
  }
  private bind() {
    const globals=globalThis as unknown as Record<string,unknown>;
    for(const key of ['__orgChartMcpControlStore','__orgChartMcpActivityStore']){
      if(this.sessionState[key])globals[key]=this.sessionState[key];else delete globals[key];
    }
    installWorkspaceBindings({DB:this.engine.db,SOURCE_FILES:this.engine.bucket});
  }
  private captureSession(){const globals=globalThis as unknown as Record<string,unknown>;this.sessionState={__orgChartMcpControlStore:globals.__orgChartMcpControlStore,__orgChartMcpActivityStore:globals.__orgChartMcpActivityStore};}
  serial<T>(operation:()=>Promise<T>):Promise<T> {
    const pending=this.queue.then(operation); this.queue=pending.catch(()=>{}); return pending;
  }
  request(request:Request) { return this.serial(async()=>{
    this.bind();
    const before=this.engine.snapshot(), changes=this.engine.changeCount(), old={...this.metadata};
    try {
      const response=await dispatchCommand(request);
      if (this.engine.changeCount()!==changes || this.engine.changedFiles.size) {
        this.metadata={...this.metadata,revision:this.metadata.revision+1};
        await this.recovery.commit(this.engine,this.metadata);
      }
      return response;
    } catch(error) { this.engine.restore(before);this.metadata=old;resetSession();throw error; } finally {this.captureSession();}
  }); }
  export() { return this.serial(async()=>{
    this.bind();
    const before=this.engine.snapshot(), changes=this.engine.changeCount(), old={...this.metadata};
    try {
    const file=await exportWorkingLibrary(this.metadata);
    if(this.engine.changeCount()!==changes||this.engine.changedFiles.size){
      this.metadata={...this.metadata,revision:this.metadata.revision+1};
      await this.recovery.commit(this.engine,this.metadata);
    }
    file.workspace.revision=this.metadata.revision;
    return file;
    } catch(error){this.engine.restore(before);this.metadata=old;resetSession();throw error;} finally {this.captureSession();}
  }); }
  openDocument(value:unknown,fileName:string|null,protection:'encrypted'|'unencrypted',passphrase?:string) { return this.serial(async()=>{
    const file=isWorkspacePackage(value)?value:null;
    if(!file&&!isLibraryBackup(value))throw Error('This is not a supported library file.');
    const library=file?.library??value as LibraryBackup;
    const prior=this.engine,old={...this.metadata},oldKey=this.recovery.key,oldSalt=this.recovery.salt,oldSession=this.sessionState;
    const candidate=new BrowserDatabase(this.SQLite);this.engine=candidate;this.sessionState={};this.bind();resetSession();
    try {
      const response=await restoreLibrary(new Request('https://orgchart.local/api/backups',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(library)}),true);
      if(!response.ok)throw Error(((await response.json()) as {error:string}).error);
      if(file?.continuity)await importContinuity(file.continuity,{DB:candidate.db,SOURCE_FILES:candidate.bucket},new Set(library.charts.map(c=>c.id)));
      const pendingIds=new Set<string>(),pendingCharts=new Set<string>();
      for(const proposal of file?.pendingProposals??[]) {
        if (!proposal || typeof proposal.id!=='string' || !proposal.current || !proposal.proposed || proposal.chartId!==proposal.current.id || proposal.chartId!==proposal.proposed.id ||pendingIds.has(proposal.id)||pendingCharts.has(proposal.chartId))
          throw Error('Invalid or duplicate pending review in library.');
        pendingIds.add(proposal.id);pendingCharts.add(proposal.chartId);
        const current=library.charts.find(c=>c.id===proposal.chartId);
        if(!current||editableChartShapeError(proposal.current)||editableChartShapeError(proposal.proposed)||proposal.status!=='pending')throw Error('Invalid review document.');
        let rebuilt={...proposal,...diffChartDocuments(proposal.current,proposal.proposed)};
        if(current.version===proposal.current.version&&current.updatedAt===proposal.current.updatedAt){
          const response=await stageChartReview(new Request('https://orgchart.local/api/ai-proposals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'stage',chart:proposal.proposed,changeSummary:proposal.changeSummary??undefined})}));
          const result=await response.json() as {error?:string;proposal:typeof proposal};
          if(!response.ok)throw Error(result.error??'Invalid pending review.');
          await candidate.db.prepare('DELETE FROM ai_chart_proposals WHERE id=?').bind(result.proposal.id).run();
          rebuilt=result.proposal;
        }
        await savePendingProposal(candidate.db,{...rebuilt,id:proposal.id,createdAt:proposal.createdAt});
      }
      this.metadata={id:file?.workspace.id??`workspace-${crypto.randomUUID()}`,revision:file?.workspace.revision??0,
        fileRevision:file?.workspace.revision??0,fileName,lastFileSavedAt:new Date().toISOString(),recoveredAt:new Date().toISOString(),protection};
      await this.recovery.setProtection(protection==='encrypted'?passphrase:undefined);
      await this.recovery.commit(candidate,this.metadata,true);this.connectionId=crypto.randomUUID();prior.close();return this.metadata;
    } catch(error) { this.recovery.key=oldKey;this.recovery.salt=oldSalt;candidate.close();this.engine=prior;this.metadata=old;this.sessionState=oldSession;this.bind();throw error; }
  }); }
  saveRollback(backup:unknown,expectedConnectionId:string){return this.serial(async()=>{
    if(expectedConnectionId!==this.connectionId||!isLibraryBackup(backup)||backup.charts.length!==1)throw Error('Invalid rollback workspace or scope.');
    const before=this.engine.snapshot();const id='source-recheck-'+crypto.randomUUID();
    try{await this.engine.db.prepare('INSERT INTO app_settings(key,payload) VALUES(?,?)').bind(id,JSON.stringify(backup)).run();
      await this.recovery.commit(this.engine,this.metadata);return {id,fileName:id+'.orgchart-backup',path:'Browser recovery / '+id,storage:'browser-recovery'};
    }catch(error){this.engine.restore(before);throw error;}
  });}
  markFileSaved(revision:number,fileName:string,protection:'encrypted'|'unencrypted',passphrase?:string,fileSaveEvidence:'verified-write'|'user-confirmed-download'|'agent-reported-download'='verified-write') { return this.serial(async()=>{
    if(revision>this.metadata.revision)throw Error('Invalid file revision.');
    const next={...this.metadata,fileRevision:revision,fileName,fileSaveEvidence,lastFileSavedAt:new Date().toISOString(),protection};
    const priorKey=this.recovery.key,priorSalt=this.recovery.salt;
    try {await this.recovery.setProtection(protection==='encrypted'?passphrase:undefined);await this.recovery.commit(this.engine,next,true);this.metadata=next;return this.metadata;}
    catch(error){this.recovery.key=priorKey;this.recovery.salt=priorSalt;throw error;}
  }); }
}
