import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {supportFixture} from './helpers/support-fixture';
import {sourceCardPresentation,unitPresentationKey,panelPresentationKey,sourcePresentationActive,normalizeSourcePresentation} from '../lib/source-presentation';
import {normalizeSupplements} from '../lib/chart-supplements';
import {buildChartExportScene,buildChartSvg} from '../lib/chart-export';
import {buildChartPptx} from '../lib/chart-export-pptx';
import {buildChartPdf} from '../lib/chart-export-pdf';
import {PDFDocument} from 'pdf-lib';
import type {OfficialCard} from '../lib/chart-appearance';
function fixture(){
 const c=supportFixture();const card:OfficialCard={fill:'FAEED9',border:'555555',borderWidth:.75,noBorder:true,lines:[{text:'SYNTHETIC PRIVATE SOURCE',x:8,y:20,size:12,bold:false,italic:true,anchor:'start'}]};
 c.sourceLayout!.presentation={cards:Object.fromEntries(c.nodes.map(n=>[n.id,{bounds:{...n.position,width:Number(n.style!.width),height:Number(n.style!.height)},contentKey:unitPresentationKey(n.data.unit),card}])),panels:Object.fromEntries(c.supportPanels!.map(p=>[p.id,{bounds:structuredClone(p.geometry!),contentKey:panelPresentationKey(p),card}])),relationships:c.edges.map(e=>({id:e.id,source:e.source,target:e.target,type:String(e.data?.relationshipType??'primary supervisory')})),strokes:[{points:[{x:30,y:40},{x:60,y:40}],width:.75,color:'555555',dash:[1,2]}],annotations:[{bounds:{x:0,y:0,width:100,height:40},card}]};return c;
}
test('source drawing survives normalization and all export types without changing semantic records',async()=>{
 const c=fixture(),before=structuredClone(c),normalized=normalizeSupplements(c);assert.deepEqual(normalized.sourceLayout!.presentation,c.sourceLayout!.presentation);assert.equal(sourcePresentationActive(c),true);
 const scene=buildChartExportScene(c,'internal');assert.ok(scene.sourcePresentation);assert.equal(scene.nodes[0].official!.fill,'FAEED9');assert.equal(scene.nodes[0].official!.lines[0].anchor,'start');
 const svg=buildChartSvg(scene);assert.match(svg,/stroke-dasharray="1 2"/);assert.match(svg,/text-anchor="start"/);assert.match(svg,/font-style="italic"/);assert.match(svg,/stroke="none"/);
 const pptx=strFromU8(unzipSync(await buildChartPptx(scene))['ppt/slides/slide1.xml']);assert.match(pptx,/Source connector/);assert.match(pptx,/sysDot/);assert.match(pptx,/SYNTHETIC PRIVATE SOURCE/);assert.equal((await PDFDocument.load(await buildChartPdf(scene))).getPageCount(),1);assert.deepEqual(c,before);
});
test('each independent content, geometry and relationship edit invalidates captured source drawing',()=>{
 const edits=[
  (c:ReturnType<typeof fixture>)=>{c.nodes[0].data.unit.assignmentLabel='Synthetic New Holder';},
  (c:ReturnType<typeof fixture>)=>{c.nodes[0].position.x+=10;},
  (c:ReturnType<typeof fixture>)=>{c.nodes[0].style!.width=Number(c.nodes[0].style!.width)+10;},
  (c:ReturnType<typeof fixture>)=>{c.supportPanels![0].entries[0].person='Synthetic New Support Holder';},
  (c:ReturnType<typeof fixture>)=>{c.supportPanels![0].geometry!.y+=10;},
  (c:ReturnType<typeof fixture>)=>{c.edges[0].data={...c.edges[0].data,relationshipType:'secondary supervisory'};},
  (c:ReturnType<typeof fixture>)=>{c.edges[0].data={...c.edges[0].data,manualRoute:{synthetic:true}};},
 ];
 for(const edit of edits){const c=fixture();assert.equal(sourcePresentationActive(c),true);edit(c);assert.equal(sourcePresentationActive(c),false);}
 const c=fixture(),n=c.nodes[0],s=c.sourceLayout!.presentation!.cards[n.id];assert.ok(sourceCardPresentation(s,unitPresentationKey(n.data.unit),s.bounds.width,s.bounds.height));n.data.unit.assignmentLabel='Synthetic New Holder';assert.equal(sourceCardPresentation(s,unitPresentationKey(n.data.unit),s.bounds.width,s.bounds.height),undefined);
});
test('source drawings and annotations never bypass public audience filtering or compact mode',async()=>{
 const c=fixture();c.nodes.forEach(n=>n.data.unit.publicationVisibility='public');c.supportPanels!.forEach(p=>{p.publicationVisibility='public';p.entries.forEach(e=>e.publicationVisibility='public');});
 const scene=buildChartExportScene(c,'public');assert.equal(scene.sourcePresentation,undefined);assert.doesNotMatch(buildChartSvg(scene),/SYNTHETIC PRIVATE SOURCE/);assert.doesNotMatch(strFromU8(unzipSync(await buildChartPptx(scene))['ppt/slides/slide1.xml']),/SYNTHETIC PRIVATE SOURCE/);
 assert.equal(buildChartExportScene(c,'internal',undefined,'separate','compact').sourcePresentation,undefined);
});
test('source metadata rejects unknown identities, malformed primitives, unbounded values and duplicate relationships',()=>{
 const c=fixture(),p=c.sourceLayout!.presentation!,args=[new Set(c.nodes.map(n=>n.id)),new Set(c.supportPanels!.map(p=>p.id)),new Set(c.edges.map(e=>e.id))] as const;
 const bad=structuredClone(p);bad.strokes[0].color='url(x)';assert.throws(()=>normalizeSourcePresentation(bad,...args));bad.strokes[0].color='555555';bad.strokes[0].points[0].x=Infinity;assert.throws(()=>normalizeSourcePresentation(bad,...args));
 const unknown=structuredClone(p);unknown.cards.unknown=unknown.cards[c.nodes[0].id];assert.throws(()=>normalizeSourcePresentation(unknown,...args));
 const duplicate=structuredClone(p);duplicate.relationships.push(duplicate.relationships[0]);assert.throws(()=>normalizeSourcePresentation(duplicate,...args));
});
