// Synthetic storage-engine measurement; not a browser/device performance guarantee.
import 'fake-indexeddb/auto';
import '../tests/helpers/test-db';
import {writeFileSync} from 'node:fs';
import {loadSqlite} from '../runtime/browser/sqlite';
import {BrowserRecovery} from '../runtime/browser/recovery';
const {BrowserWorkspace}=await import('../runtime/browser/workspace');
const SQLite=await loadSqlite();const recovery=await BrowserRecovery.open('synthetic-benchmark-'+crypto.randomUUID());const ws=await BrowserWorkspace.open(SQLite,recovery);
const start=performance.now();
for(let i=0;i<82;i++){
 const form=new FormData();form.set('chartName','Synthetic Performance Org '+i);
 const csv=['id,name,type,parentId,positionTitle,assignmentLabel,positionStatus','root,Synthetic Root,laboratory,,Director,Synthetic Holder,filled',...Array.from({length:39},(_,j)=>`group-${j},Synthetic Group ${j},group,root,Group Leader,Synthetic Person ${j},filled`)].join('\n');
 form.set('file',new File([csv],'synthetic.csv',{type:'text/csv'}));
 const r=await ws.request(new Request('https://orgchart.local/api/charts',{method:'POST',body:form}));if(!r.ok)throw Error(await r.text());
}
const imported=performance.now();const file=await ws.export();const exported=performance.now();
const target=await BrowserWorkspace.open(SQLite,await BrowserRecovery.open('synthetic-benchmark-restore-'+crypto.randomUUID()));
await target.openDocument(file,'synthetic.orgchart-workspace','unencrypted');const restored=performance.now();const again=await target.export();
if(again.library.charts.length!==82||again.library.charts.some((c,i)=>c.id!==file.library.charts[i].id))throw Error('Synthetic benchmark restore lost identities.');
const result={scope:'Node sql.js and fake IndexedDB; synthetic storage-engine measurement only',charts:82,nodes:file.library.charts.reduce((n,c)=>n+c.nodes.length,0),checkpointCount:file.library.checkpoints?.length,portableBytes:Buffer.byteLength(JSON.stringify(file)),sqlBytes:ws.engine.exportDatabase().length,importMs:Math.round(imported-start),exportMs:Math.round(exported-imported),restoreMs:Math.round(restored-exported)};
console.log(JSON.stringify(result));if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');recovery.close();
