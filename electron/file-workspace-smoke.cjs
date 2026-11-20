// Synthetic, disposable-profile GUI journey for the separate static editor.
module.exports.fileWorkspaceJourneyScript=`(async()=>{
 const wait=async(fn,label)=>{const end=Date.now()+45000;while(Date.now()<end){const skip=[...document.querySelectorAll('button')].find(b=>b.textContent==='Skip tour');skip?.click();const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,80));}throw Error('File workspace timed out: '+label);};
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text&&!b.disabled);
 await wait(()=>document.querySelector('.library-file-bar'),'browser library controls');
 if(window.orgChartDesktop)throw Error('File workspace received the privileged desktop bridge.');
 if(document.querySelector('.chart-switcher select').value)throw Error('File workspace was not an empty isolated library.');
 button('New chart').click();
 const input=await wait(()=>document.querySelector('input[name="dialogName"]'),'new-chart name');
 const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'Synthetic Portable Native Workspace');input.dispatchEvent(new Event('input',{bubbles:true}));
 input.form.requestSubmit();
 const chartId=await wait(()=>document.querySelector('.chart-switcher select')?.value,'created chart');
 await wait(()=>document.querySelector('.library-file-bar')?.dataset.editorState==='saved','saved working state');
 const options=await wait(()=>document.querySelector('.library-file-options summary'),'more file options');options.click();
 (await wait(()=>button('Prepare download')||button('Prepare library download'),'prepare download action')).click();
 const download=await wait(()=>document.querySelector('.library-file-bar a[download]'),'prepared library file');
 const text=await fetch(download.href).then(r=>r.text());const file=JSON.parse(text);
 if(file.format!=='orgchart-studio-workspace'||file.library.charts[0].id!==chartId)throw Error('Portable file lost chart identity.');
 button('I saved this download').click();
 await wait(()=>document.querySelector('.library-file-bar').dataset.unsavedFile==='false','download confirmation');
 const picker=document.querySelector('.library-file-bar input[type="file"]'),transfer=new DataTransfer();
 transfer.items.add(new File([text],'Synthetic-Native-Library.orgchart-workspace',{type:'application/json'}));picker.files=transfer.files;picker.dispatchEvent(new Event('change',{bubbles:true}));
 await wait(()=>document.querySelector('.library-file-bar')?.textContent.includes('Synthetic-Native-Library.orgchart-workspace'),'working file open');
 if(!document.querySelector('.library-file-summary').textContent.includes('Opened library file · no changes'))throw Error('A file opened from disk was incorrectly labeled as recovery-only.');
 if(document.querySelector('.chart-switcher select').value!==chartId)throw Error('Open cloned chart IDs instead of continuing the file.');
 return {chartId,fileText:text,workspaceId:file.workspace.id};
})()`;
