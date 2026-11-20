import type { BrowserDatabase, EngineSnapshot } from "./sqlite";

export interface WorkspaceMetadata {
  id: string; revision: number; fileRevision: number; fileName: string | null;
  lastFileSavedAt: string | null; fileSaveEvidence?:'verified-write'|'user-confirmed-download'|'agent-reported-download'; recoveredAt: string; protection: "encrypted" | "unencrypted";
}
export interface RecoveryRecord { metadata: WorkspaceMetadata; database: Uint8Array; salt?: Uint8Array }
const encode=(bytes:Uint8Array)=>bytes.slice().buffer as ArrayBuffer;
async function deriveRecoveryKey(passphrase:string,salt:Uint8Array){
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:encode(salt),iterations:250000},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function protectBytes(bytes:Uint8Array,key:CryptoKey){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const value=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:encode(iv)},key,encode(bytes)));
 const result=new Uint8Array(12+value.length);result.set(iv);result.set(value,12);return result;
}
async function openBytes(bytes:Uint8Array,key:CryptoKey){
 return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:encode(bytes.slice(0,12))},key,encode(bytes.slice(12))));
}
export class BrowserRecovery {
  key:CryptoKey|undefined;
  salt:Uint8Array|undefined;
  private constructor(readonly db: IDBDatabase) {}
  async setProtection(passphrase?:string){
    if(!passphrase){this.key=undefined;this.salt=undefined;return;}
    if(passphrase.length<12)throw Error('Use a passphrase containing at least 12 characters.');
    this.salt=crypto.getRandomValues(new Uint8Array(16));this.key=await deriveRecoveryKey(passphrase,this.salt);
  }
  static async open(name = "orgchart-studio-workspaces-v1") {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore("workspace"); request.result.createObjectStore("sources"); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    return new BrowserRecovery(db);
  }
  async load(passphrase?:string): Promise<{ metadata: WorkspaceMetadata; snapshot: EngineSnapshot } | null> {
    const saved=await new Promise<{record:RecoveryRecord|undefined;sources:{key:string;bytes:Uint8Array}[]}>((resolve,reject)=>{
      const tx=this.db.transaction(['workspace','sources'],'readonly');
      const record=tx.objectStore('workspace').get('active'),sources=tx.objectStore('sources').getAll();
      tx.oncomplete=()=>resolve({record:record.result,sources:sources.result});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    if(!saved.record)return null;
    const {record,sources}=saved;
    if(record.salt){
      if(!passphrase)throw Error('Encrypted browser recovery is locked. Enter its passphrase to reopen it.');
      try{
        this.salt=record.salt;this.key=await deriveRecoveryKey(passphrase,record.salt);
        return {metadata:record.metadata,snapshot:{database:await openBytes(record.database,this.key),sources:await Promise.all(sources.map(async s=>({key:s.key,bytes:await openBytes(s.bytes,this.key!)})))}};
      }catch{this.key=undefined;throw Error('Encrypted browser recovery is locked. Check the passphrase and try again.');}
    }
    return {metadata:record.metadata,snapshot:{database:record.database,sources}};
  }
  async commit(engine: BrowserDatabase, metadata: WorkspaceMetadata, replace = false) {
    const raw=engine.exportDatabase();
    const key=metadata.protection==='encrypted'?this.key:undefined;
    if(metadata.protection==='encrypted'&&!key)throw Error('Unlock encrypted recovery before saving changes.');
    const database=key?await protectBytes(raw,key):raw;
    const changes=await Promise.all([...(replace?engine.files.keys():engine.changedFiles)].map(async name=>{
      const bytes=engine.files.get(name);return {key:name,bytes:bytes&&key?await protectBytes(bytes,key):bytes};
    }));
    await new Promise<void>((resolve, reject) => {
      const tx = this.db.transaction(["workspace", "sources"], "readwrite");
      tx.objectStore("workspace").put({ metadata, database, ...(key?{salt:this.salt}:{}) } satisfies RecoveryRecord, "active");
      const sources = tx.objectStore("sources");
      if (replace) sources.clear();
      for (const {key,bytes} of changes) {
        if (bytes) sources.put({ key, bytes }, key); else sources.delete(key);
      }
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? Error("Browser storage could not save this change. Your previous recovery copy is intact."));
    });
    engine.changedFiles.clear();
  }
  close() { this.db.close(); }
}
