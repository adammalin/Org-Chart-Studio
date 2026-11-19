// Disposable native profile only; never runs against the user's chart database.
module.exports.appearanceJourneyScript=`
(async()=>{
 const assert=(v,m)=>{if(!v)throw Error(m);};
 const wait=async(fn,label)=>{const end=Date.now()+30000;while(Date.now()<end){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+label);};
 const later=[...document.querySelectorAll('.ai-review-panel button')].find(b=>b.textContent.includes('Review later'));if(later)later.click();
 [...document.querySelectorAll('.sidebar button')].find(b=>b.textContent.includes('Chart editor')).click();
 const selectedId=document.querySelector('.chart-switcher select').value;
 const saved=(await fetch('/api/charts').then(r=>r.json())).charts.find(c=>c.id===selectedId);
 assert(saved&&saved.nodes.every(n=>document.querySelector('.react-flow__node[data-id="'+n.id+'"]')),'Review later keeps the selected chart paired with its own saved cards');
 const chartSelect=document.querySelector('.chart-switcher select'),sourceOption=[...chartSelect.options].find(o=>o.textContent==='Synthetic Source Layout Pilot');
 assert(sourceOption,'source fixture available');chartSelect.value=sourceOption.value;chartSelect.dispatchEvent(new Event('change',{bubbles:true}));
 await wait(()=>document.querySelector('.react-flow__node[data-id="synthetic-source-root"]'),'saved source fixture');
 const close=document.querySelector('.detail-panel [aria-label*="Close"]');if(close)close.click();
 const select=await wait(()=>document.querySelector('select[aria-label="Chart appearance"]'),'appearance preference');
 assert(select.value==='official','Official appearance is the initial global default');
 const choose=async value=>{select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));await wait(async()=>{const p=await fetch('/api/preferences').then(r=>r.json());return p.chartAppearance===value;},'appearance saved');};
 await choose('official');await wait(()=>document.querySelector('.org-node.is-official .official-card-drawing text'),'official cards');
 assert(!document.querySelector('.org-node.is-official .org-node__source-review'),'No review badges on official cards');
 assert(!document.querySelector('.org-node.is-official .status-marker'),'No invented status dots');
 const fonts=await window.orgChartDesktop.getChartFonts();
 if(fonts){await document.fonts.load('400 16px "OrgChart Century Gothic"');await document.fonts.load('700 16px "OrgChart Century Gothic"');assert(document.fonts.check('400 16px "OrgChart Century Gothic"')&&document.fonts.check('700 16px "OrgChart Century Gothic"'),'Native installed font loaded in both weights');}
 else assert(document.querySelector('.chart-appearance-toolbar').textContent.includes('fallback'),'Missing font is disclosed');
 const heading=[...document.querySelectorAll('.org-node.is-official svg text')].find(t=>t.getAttribute('font-weight')==='700');
 const person=[...document.querySelectorAll('.org-node.is-official svg text')].find(t=>t.getAttribute('font-weight')==='400');
 assert(heading&&person,'Bold organization and regular assignment typography');
 for(const text of document.querySelectorAll('.official-card-drawing text')){const box=text.getBBox(),svg=text.ownerSVGElement;assert(box.x>=-1&&box.x+box.width<=svg.viewBox.baseVal.width+1&&box.y>=-1&&box.y+box.height<=svg.viewBox.baseVal.height+1,'Official text remains inside its card');}
 await choose('annotated');await wait(()=>document.querySelector('.org-node:not(.is-official) .org-node__eyebrow'),'optional editing annotations');
 await choose('official');await wait(()=>document.querySelector('.org-node.is-official'),'official preference restored');
 return {proposalDeferralChartIdentity:true,officialAppearanceDefault:true,nativeFontOrDisclosedFallback:true,officialTypographyWeights:true,officialTextBounds:true,appearancePreferenceRoundTrip:true,optionalEditorAnnotations:true};
})()
`;
