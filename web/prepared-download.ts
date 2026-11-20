import {browserSession} from './client';
import {saveFile,unlinkFile} from './files';
export interface DownloadReceipt {receiptId:string;workspaceId:string;connectionId:string;revision:number;fileName:string;bytes:number;sha256:string;protection:'encrypted'|'unencrypted';kind:'download_ready'}
export interface PreparedDownload {receipt:DownloadReceipt;url:string;passphrase:string}
let prepared:PreparedDownload|null=null;
let encryptionPreference:boolean|undefined;
export const setDownloadEncryptionPreference=(value:boolean)=>{encryptionPreference=value;};
export const downloadEncryptionRequested=()=>encryptionPreference===true||browserSession.getSnapshot().protection==='encrypted';
const listeners=new Set<()=>void>();
export const subscribePreparedDownload=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const getPreparedDownload=()=>prepared;
export function clearPreparedDownload(){if(prepared)URL.revokeObjectURL(prepared.url);prepared=null;for(const listener of listeners)listener();}
export function assertDownloadConnection(receipt:Pick<DownloadReceipt,'workspaceId'|'connectionId'>){const current=browserSession.getSnapshot();if(current.id!==receipt.workspaceId||current.connectionId!==receipt.connectionId)throw Error('The active library connection changed. Prepare a new download.');}
export async function prepareLibraryDownload(encrypted:boolean,passphrase:string,agentAccess=false){
 const start={...browserSession.getSnapshot()},result=await saveFile({download:true,encrypted,passphrase,agentAccess});
 if(result.kind!=='download_ready')throw Error('The library download was not prepared.');
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await result.blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
 const receipt:DownloadReceipt={receiptId:'download-'+crypto.randomUUID(),workspaceId:start.id,connectionId:start.connectionId,revision:result.revision,fileName:'OrgChart-Library-Revision-'+result.revision+'.orgchart-workspace',bytes:result.blob.size,sha256,protection:result.protection,kind:'download_ready'};
 if(agentAccess&&downloadEncryptionRequested())throw Error('Encryption was selected. Prepare an encrypted download using the visible file controls.');
 assertDownloadConnection(receipt);clearPreparedDownload();prepared={receipt,url:URL.createObjectURL(result.blob),passphrase};for(const listener of listeners)listener();return receipt;
}
export async function confirmPreparedDownload(receiptId:string,evidence:'user-confirmed-download'|'agent-reported-download',observed?:{sha256:string;bytes:number}){
 const value=prepared;if(!value||value.receipt.receiptId!==receiptId)throw Error('This prepared download expired. Prepare another.');
 assertDownloadConnection(value.receipt);
 if(evidence==='agent-reported-download'&&(!observed||observed.sha256!==value.receipt.sha256||observed.bytes!==value.receipt.bytes))throw Error('The reported file checksum or byte count does not match this download.');
 await browserSession.saved(value.receipt.revision,value.receipt.fileName,value.receipt.protection,value.passphrase,evidence,{expectedWorkspaceId:value.receipt.workspaceId,expectedConnectionId:value.receipt.connectionId});
 assertDownloadConnection(value.receipt);await unlinkFile();if(prepared===value)clearPreparedDownload();
 return {...value.receipt,kind:evidence,appVerifiedDiskWrite:false,cloudSyncConfirmed:false,libraryFileNeedsSaving:browserSession.getSnapshot().revision>value.receipt.revision};
}
