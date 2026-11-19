// Runs only in the disposable ORGCHART_ELECTRON_SMOKE profile.
module.exports.editHistoryJourneyScript = `
(async()=>{
 const assert=(v,m)=>{if(!v)throw Error(m);};
 const wait=async(fn,label,timeout=30000)=>{const end=Date.now()+timeout;while(Date.now()<end){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+label);};
 const post=async(url,body)=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d;};
 const read=async id=>(await fetch('/api/edit-history?chartId='+encodeURIComponent(id)+'&includeChart=1',{cache:'no-store'}).then(r=>r.json()));
 const activity=async(id,chartId)=>{await post('/api/ai-activity',{action:'begin',activityId:id,operation:'undo_chart_edit',label:'Synthetic edit history refresh',chartId});await post('/api/ai-activity',{action:'complete',activityId:id,operation:'undo_chart_edit',label:'Synthetic edit history refresh',succeeded:true,completionKind:'saved',chartId});};
 let chart=(await post('/api/charts',{action:'create',name:'Synthetic Durable History'})).chart;
 chart.nodes[0].data.unit.assignmentLabel='Synthetic Original Holder';chart=(await post('/api/charts',{action:'save',chart,label:'Synthetic original holder'})).chart;
 const changed=structuredClone(chart);changed.nodes[0].data.unit.assignmentLabel='Synthetic Agent Holder';const staged=await post('/api/ai-proposals',{action:'stage',chart:changed,changeSummary:'Synthetic durable agent change'});chart=(await post('/api/ai-proposals',{action:'accept',proposalId:staged.proposal.id})).chart;
 const other=(await post('/api/charts',{action:'create',name:'Synthetic History Switch Target'})).chart;
 await activity('synthetic-history-refresh',chart.id);
 const choose=async id=>{const select=await wait(()=>{const s=document.querySelector('.chart-switcher select');return s&&[...s.options].some(o=>o.value===id)&&!s.disabled?s:null;},'history chart selector');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));await wait(()=>document.querySelector('.chart-switcher select')?.value===id,'selected history chart');};
 const history=async()=>{const b=await wait(()=>[...document.querySelectorAll('.sidebar button')].find(b=>b.textContent.includes('History / Timeline')),'history navigation');b.click();await wait(()=>document.querySelector('.edit-history-panel'),'durable history panel');};
 await choose(chart.id);await history();
 const undo=await wait(()=>{const b=document.querySelector('.edit-history-actions button');return b&&!b.disabled&&b.textContent.includes('Synthetic durable agent change')?b:null;},'saved agent undo button');undo.click();
 await wait(async()=>{const d=await read(chart.id);return d.chart.nodes[0].data.unit.assignmentLabel==='Synthetic Original Holder';},'UI undo saved');
 const redo=await wait(()=>{const b=document.querySelectorAll('.edit-history-actions button')[1];return b&&!b.disabled?b:null;},'redo button');redo.click();
 await wait(async()=>{const d=await read(chart.id);return d.chart.nodes[0].data.unit.assignmentLabel==='Synthetic Agent Holder';},'UI redo saved');
 await choose(other.id);await choose(chart.id);await history();await wait(()=>{const b=document.querySelector('.edit-history-actions button');return b&&!b.disabled&&b.textContent.includes('Synthetic durable agent change');},'undo after chart switching');
 const previousAttempt=(await window.orgChartDesktop.getServiceState()).attempt;await window.orgChartDesktop.testInterruptService();await wait(async()=>{const s=await window.orgChartDesktop.getServiceState();return s.phase==='ready'&&s.attempt>previousAttempt;},'history service recovery',90000);
 const saved=await read(chart.id);assert(saved.undo.actor==='agent'&&saved.events.some(e=>e.action==='undo')&&saved.events.some(e=>e.action==='redo'),'Durable mixed user/agent receipts after service restart');
 const request={action:'undo',chartId:chart.id,operationId:saved.undo.id,expectedRevision:saved.revision,expectedVersion:saved.expectedVersion,expectedUpdatedAt:saved.expectedUpdatedAt,requestId:'history-request-synthetic-native-retry'};
 await post('/api/edit-history',request);const retried=await post('/api/edit-history',request);assert(retried.alreadyApplied&&retried.chart.nodes[0].data.unit.assignmentLabel==='Synthetic Original Holder','Native idempotent retry');
 await activity('synthetic-history-final-refresh',chart.id);await history();await wait(()=>{const b=document.querySelectorAll('.edit-history-actions button')[1];return b&&!b.disabled&&b.textContent.includes('Synthetic durable agent change');},'history UI reconciles the saved external undo');
 const detail=await wait(()=>[...document.querySelectorAll('.edit-history-list button')].find(b=>b.textContent.includes('Synthetic durable agent change')),'operation list');detail.click();await wait(()=>document.querySelector('.edit-history-detail')?.textContent.includes('Synthetic Agent Holder'),'field-level history differences');
 // Hold real server responses to reproduce refresh and chart-switch races.
 const originalFetch=window.fetch.bind(window);let held=null,release=null;
 const holdNext=(predicate)=>{held=null;release=null;window.fetch=async(input,init)=>{const response=await originalFetch(input,init);if(!held&&predicate(String(input))){held=String(input);await new Promise(resolve=>{release=resolve;});}return response;};};
 try {
   holdNext(url=>url.includes('/api/edit-history?')&&url.includes('operationId='));
   detail.click();await wait(()=>release,'delayed operation response');
   const refresh=[...document.querySelectorAll('.edit-history-panel button')].find(b=>b.textContent.includes('Refresh edit history'));refresh.click();
   await wait(()=>{const b=document.querySelector('.edit-history-list button');return b&&!b.disabled;},'refresh clears stale loading');
   release();await new Promise(r=>setTimeout(r,150));
   assert(!document.querySelector('.edit-history-detail'),'Stale operation detail must stay cleared after refresh');
   window.fetch=originalFetch;
   const current=(await read(chart.id)).chart;current.description='Synthetic late-read race fixture';await post('/api/charts',{action:'save',chart:current,label:'Synthetic delayed read'});
   holdNext(url=>url.includes('/api/edit-history?')&&url.includes('chartId='+encodeURIComponent(chart.id))&&!url.includes('operationId='));
   await activity('synthetic-history-race-refresh',chart.id);await wait(()=>release,'delayed chart history response');
   await choose(other.id);await history();
   await wait(()=>document.querySelector('.edit-history-panel')?.textContent.includes('No saved edits yet.'),'other chart history loaded');
   release();await new Promise(r=>setTimeout(r,200));
   assert(document.querySelector('.edit-history-panel')?.textContent.includes('No saved edits yet.'),'Old chart response must not overwrite the selected chart history');
 } finally { if(release)release();window.fetch=originalFetch; }
 await choose(chart.id);await history();
 const backup=await fetch('/api/backups?chartId='+encodeURIComponent(chart.id)).then(r=>r.json());assert(backup.schemaVersion===7&&backup.editHistory.operations.length>=2&&backup.editHistory.events.some(e=>e.action==='undo'),'Native portable edit journal');
 return {nativeHistoryRefreshRace:true,nativeHistoryChartReadRace:true,durableHistoryPanel:true,nativeUserAgentUndoRedo:true,nativeHistoryChartSwitch:true,nativeHistoryServiceRestart:true,nativeHistoryRetryReceipt:true,nativeHistoryFieldDiff:true,nativeEditJournalBackup:true};
})()
`;
