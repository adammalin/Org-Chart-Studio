// Synthetic fixtures are used only by the explicit disposable-profile smoke test.
function visualFixture(base) {
 const chart=structuredClone(base);
 chart.name='Synthetic Wrapping and Connectors';
 const url='https://example.invalid/orgcharts/'+('A-Long-Encoded%20Source-Filename-'.repeat(10))+'.pptx';
 chart.description='Synthetic source-linked description: '+url+' All source text must remain readable inside this card.';
 const root=structuredClone(chart.nodes[0]);root.id='synthetic-wrap-root';root.position={x:0,y:0};root.style={width:248,height:132};root.data.pinned=true;
 root.data.unit={...root.data.unit,id:root.id,name:'Synthetic Research and Advanced Engineering Division',shortName:'Synthetic Research and Advanced Engineering Division',positionTitle:'Director',assignmentLabel:'Sample Director',positionStatus:'filled',sourceCertainty:'confirmed'};
 const child=structuredClone(root);child.id='synthetic-wrap-child';child.position={x:9,y:176};child.data.unit={...root.data.unit,id:child.id,name:'Synthetic Materials Research',shortName:'Synthetic Materials Research',type:'group',positionTitle:'Group Leader',assignmentLabel:'Sample Group Leader'};
 const grandchild=structuredClone(child);grandchild.id='synthetic-wrap-grandchild';grandchild.position={x:9,y:352};grandchild.data.unit={...child.data.unit,id:grandchild.id,name:'Synthetic Advanced Modeling',shortName:'Synthetic Advanced Modeling',type:'team',positionTitle:'Team Leader',assignmentLabel:'Sample Team Leader'};
 chart.nodes=[root,child,grandchild];chart.edges=[{id:'synthetic-aligned-edge',source:root.id,target:child.id},{id:'synthetic-straight-edge',source:child.id,target:grandchild.id}];
 chart.sourceLayout={referenceUrl:'https://example.invalid/fixture.pptx',sourceLocator:'Synthetic slide 1; '+url,capturedAt:'2026-11-19T12:00:00Z',width:960,height:680};
 return chart;
}
function sourceSpineFixture(base,createVisualFixture=visualFixture) {
 const chart=createVisualFixture(base),section=chart.nodes[0];section.id='synthetic-section';section.data.unit.id=section.id;section.data.unit.name=section.data.unit.shortName='Synthetic Section';section.position={x:0,y:0};section.style={width:300,height:90};
 const children=['a','b','c'].map((id,i)=>{const n=structuredClone(section);n.id='synthetic-spine-'+id;n.data.unit={...n.data.unit,id:n.id,name:'Synthetic Group '+id,shortName:'Synthetic Group '+id,type:'other',positionTitle:'Assignment shown in source',assignmentLabel:'Sample Holder '+id};n.position={x:30,y:120+i*100};n.style={width:270,height:80};return n;});
 chart.name='Synthetic Source Spine';chart.nodes=[section,...children];chart.edges=children.map(n=>({id:n.id+'-edge',source:section.id,target:n.id}));
 const bounds=n=>({...n.position,width:n.style.width,height:n.style.height});
 chart.edges[2].data={sourceRoute:{sourceBounds:bounds(section),targetBounds:bounds(children[2]),points:[{x:15,y:90},{x:15,y:360},{x:30,y:360}]}};
 chart.sourceLayout={...chart.sourceLayout,width:600,height:500,cardFills:Object.fromEntries(chart.nodes.map((n,i)=>[n.id,i===0?'FFFFFF':'FAEEDA']))};return chart;
}
module.exports.sourceSpineFixture=sourceSpineFixture;
module.exports.visualFixture=visualFixture;
module.exports.visualJourneyScript=`(${async function(createFixture,createSpineFixture){
 const assert=(value,message)=>{if(!value)throw Error(message);};
 const wait=async(fn,label)=>{const until=Date.now()+30000;while(Date.now()<until){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,80));}throw Error('Visual regression timed out: '+label);};
 const post=async body=>{const r=await fetch('/api/charts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error);return d.chart;};
 const created=await post({action:'create',name:'Synthetic Wrapping and Connectors'});const fixture=createFixture(created);const baseline=await post({action:'save',chart:fixture});
 await fetch('/api/ai-activity',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'complete',activityId:'synthetic-visual-library-refresh',operation:'create_chart_draft',label:'Preparing synthetic visual fixture',chartId:created.id,chartName:fixture.name,succeeded:true,completionKind:'saved'})});
 await wait(()=>[...document.querySelector('.chart-switcher select').options].find(o=>o.value===created.id),'fixture in refreshed library');
 const switcher=document.querySelector('.chart-switcher select');switcher.value=created.id;switcher.dispatchEvent(new Event('change',{bubbles:true}));
 await wait(()=>document.querySelector('.react-flow__node[data-id="synthetic-wrap-root"]'),'fixture editor');
 const fits=element=>element.scrollWidth<=element.clientWidth+1;
 const bar=await wait(()=>document.querySelector('.source-layout-toolbar'),'source metadata toolbar');
 assert(fits(bar)&&[...bar.children].every(fits),'Source metadata must wrap inside the editor');
 assert(bar.getBoundingClientRect().height<180,'Source metadata should use the full row rather than crowding out the chart');
 document.querySelector('.react-flow__node[data-id="synthetic-wrap-child"]').click();
 await wait(()=>document.querySelector('.detail-panel'),'detail drawer');
 assert(fits(bar)&&[...bar.children].every(fits),'Source metadata must fit with the detail drawer open');
 const path=await wait(()=>document.querySelector('.react-flow__edge[data-id="synthetic-aligned-edge"] path.org-relationship-edge'),'aligned connector');
 assert((path.getAttribute('d').match(/L /g)||[]).length===1,'Nearly aligned cards must have one straight segment');
 const close=document.querySelector('.detail-panel [aria-label*="Close"]');close?.click();
 [...document.querySelectorAll('.sidebar button')].find(b=>b.getAttribute('aria-label')==='Chart library').click();
 const card=await wait(()=>[...document.querySelectorAll('.chart-card')].find(c=>c.querySelector('h2')?.textContent===fixture.name),'library card');
 assert(card.querySelector('p').textContent===fixture.description,'Wrapping must preserve the complete source description');
 assert(fits(card)&&fits(card.querySelector('p'))&&fits(card.querySelector('h2')),'Long source URLs and headings must fit library cards');
 const library=document.querySelector('.library-panel');library.scrollTop=library.scrollHeight;
 [...document.querySelectorAll('.sidebar button')].find(b=>b.getAttribute('aria-label')==='Chart editor').click();
 await wait(()=>document.querySelector('.canvas-panel'),'return to editor after scrolling');
 assert(document.querySelector('.canvas-panel').scrollTop===0,'Editor must not inherit library scroll offset');
 const current=(await fetch('/api/charts').then(r=>r.json())).charts.find(c=>c.id===created.id);
 assert(JSON.stringify(current.nodes)===JSON.stringify(baseline.nodes)&&JSON.stringify(current.edges)===JSON.stringify(baseline.edges),'Presentation checks must not rewrite chart geometry or routes');
 const spineCreated=await post({action:'create',name:'Synthetic Source Spine'}),spineFixture=createSpineFixture(spineCreated,createFixture);const spineBaseline=await post({action:'save',chart:spineFixture});
 await fetch('/api/ai-activity',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'complete',activityId:'synthetic-spine-refresh',operation:'create_chart_draft',label:'Preparing synthetic source spine',chartId:spineCreated.id,chartName:spineFixture.name,succeeded:true,completionKind:'saved'})});
 await wait(()=>[...document.querySelector('.chart-switcher select').options].some(o=>o.value===spineCreated.id),'source spine chart');const spineSelect=document.querySelector('.chart-switcher select');spineSelect.value=spineCreated.id;spineSelect.dispatchEvent(new Event('change',{bubbles:true}));
 await wait(()=>document.querySelector('.react-flow__node[data-id="synthetic-spine-a"]'),'source spine drawing');
 for(const id of ['a','b','c']){const n=document.querySelector('.react-flow__node[data-id="synthetic-spine-'+id+'"]');const rect=await wait(()=>n.querySelector('.official-card-drawing rect'),'source cream rect');assert(rect.getAttribute('fill')==='#FAEEDA','Source-observed cream fill applies to generic units');const p=await wait(()=>document.querySelector('.react-flow__edge[data-id="synthetic-spine-'+id+'-edge"] path.org-relationship-edge'),'source branch path');assert(/^M 15 90 L 15 (160|260|360) L 30 (160|260|360)$/.test(p.getAttribute('d')),'Source branches use the captured left spine');}
 const spineSaved=(await fetch('/api/charts').then(r=>r.json())).charts.find(c=>c.id===spineCreated.id);assert(JSON.stringify(spineSaved.sourceLayout.cardFills)===JSON.stringify(spineBaseline.sourceLayout.cardFills),'Source fills survive save/read');
 return {nativeLibraryTextWrapping:true,nativeSourceMetadataWrapping:true,nativeStraightConnectorRouting:true,nativeVisualGeometryPreserved:true,nativeWorkspaceScrollReset:true,nativeSourceSpineRoutes:true,nativeSourceCardFills:true,nativeSourceFillPersistence:true};
}.toString()})(${visualFixture.toString()},${sourceSpineFixture.toString()})`;
