// Runs only inside the isolated ORGCHART_ELECTRON_SMOKE library. Never invoked
// against the user's live database; the smoke profile is removed on exit.
module.exports.monthlyJourneyScript = `
(async()=>{
 const assert=(value,message)=>{if(!value)throw Error(message);};
 const wait=async(fn,label,timeout=90000)=>{const end=Date.now()+timeout;while(Date.now()<end){try{const result=await fn();if(result)return result;}catch{}await new Promise(r=>setTimeout(r,150));}throw Error('Timed out: '+label);};
 const post=async(url,body)=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d;};
 const library=()=>fetch('/api/charts',{cache:'no-store'}).then(r=>r.json());
 const created=[];
 for(let i=0;i<2;i++){const {chart}=await post('/api/charts',{action:'create',name:'Synthetic Monthly Physics '+i});chart.nodes[0].data.unit.name='Synthetic Monthly Physics Division';chart.nodes[0].data.unit.assignmentLabel='Synthetic Previous Director';chart.nodes[0].data.unit.positionTitle='Director';chart.nodes[0].data.unit.sourceCertainty='confirmed';created.push((await post('/api/charts',{action:'save',chart})).chart);}
 const month=new Date().toISOString().slice(0,7);const begun=await post('/api/history',{action:'begin',month,label:'Synthetic packaged monthly journey',changeList:'Replace Synthetic Previous Director with Synthetic Next Director in related charts.',chartIds:created.map(c=>c.id)});
 const proposalIds=[];
 for(const chart of created){chart.nodes[0].data.unit.assignmentLabel='Synthetic Next Director';chart.nodes[0].data.unit.sourceCertainty='needs_review';proposalIds.push((await post('/api/ai-proposals',{action:'stage',chart,changeSummary:'Synthetic monthly leadership change'})).proposal.id);}
 const pendingCompletion=await fetch('/api/history',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'complete',batchId:begun.batch.id,summary:'Must not complete yet'})});assert(pendingCompletion.status===409,'Monthly completion must block pending proposals');
 await post('/api/monthly-workspace',{action:'review_batch',batchId:begun.batch.id,proposalIds,decision:'accept'});
 const before=await fetch('/api/monthly-workspace?batchId='+begun.batch.id).then(r=>r.json());assert(before.report.changedCharts===2&&before.report.pendingCount===0,'Saved monthly progress');
 const current=(await library()).charts.find(c=>c.id===created[0].id);
 await window.orgChartDesktop.saveRecoveryDraft({chartId:current.id,chartName:current.name,version:current.version,updatedAt:current.updatedAt,nodes:current.nodes,edges:current.edges});
 await window.orgChartDesktop.testInterruptService();
 await wait(async()=>{const state=await window.orgChartDesktop.getServiceState();return state.phase==='ready'&&state.attempt>0;},'automatic local-service recovery');
 const recovered=await fetch('/api/monthly-workspace?batchId='+begun.batch.id).then(r=>r.json());assert(recovered.report.changedCharts===2&&recovered.report.batch.status==='open','Monthly progress survives actual service restart');assert((await window.orgChartDesktop.getRecoveryDraft()).chartId===current.id,'Private editor recovery copy survives service restart');
 for(const id of created.map(c=>c.id)){const c=(await library()).charts.find(c=>c.id===id);const marked=await post('/api/charts',{action:'transition_status',chartId:c.id,targetStatus:'current',expectedVersion:c.version,expectedUpdatedAt:c.updatedAt,currentBy:'Synthetic packaged reviewer',acknowledgeReview:true});assert(marked.chart.status==='current'&&marked.chart.nodes[0].data.unit.sourceCertainty==='needs_review','Current designation preserves source notes');}
 await post('/api/history',{action:'complete',batchId:begun.batch.id,summary:'Synthetic packaged monthly update complete; source notes remain'});
 const result=await post('/api/history/answers',{chartId:current.id,mode:'roles',asOf:new Date().toISOString().slice(0,10)});assert(result.roles.some(r=>r.person==='Synthetic Next Director'),'Dated role answer links to recorded evidence');
 const query=created.map(c=>'chartId='+encodeURIComponent(c.id)).join('&'),backup=await fetch('/api/backups?'+query).then(r=>r.json());assert(backup.schemaVersion===5&&backup.monthlyUpdates.some(b=>b.id===begun.batch.id&&b.status==='completed'),'Backup contains completed monthly history');
 const saved=await window.orgChartDesktop.saveBackup('orgchart-studio-backup-monthly-journey.orgchart-backup',JSON.stringify(backup),false);assert(saved.bytes>0,'Desktop history-enabled unencrypted backup saved');
 const restored=await post('/api/backups',backup);assert(restored.restoredChartCount===2&&restored.restoredCheckpointCount===backup.checkpoints.length&&restored.restoredCharts.every(c=>c.status==='current'),'Full history round trip preserves current designation');
 await post('/api/ai-activity',{action:'begin',activityId:'synthetic-monthly-refresh',operation:'save_chart_version',label:'Refresh monthly journey'});
 await post('/api/ai-activity',{action:'complete',activityId:'synthetic-monthly-refresh',operation:'save_chart_version',label:'Refresh monthly journey',succeeded:true,completionKind:'saved',chartId:current.id});
 const navigation=await wait(()=>[...document.querySelectorAll('.sidebar button')].find(b=>b.textContent.includes('Monthly updates')),'Monthly updates sidebar');navigation.click();await wait(()=>document.body.textContent.includes('Synthetic packaged monthly journey'),'Monthly workspace displays completed batch');
 return {monthlyWorkflow:true,actualServiceRecovery:true,monthlyProgressAfterRestart:true,currentWithNotes:true,datedHistoryAnswers:true,historyBackupRoundTrip:true,monthlySidebar:true};
})()
`;
