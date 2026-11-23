/* eslint-disable @typescript-eslint/no-explicit-any -- Synthetic request fixtures. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {PDFDocument} from 'pdf-lib';
import {testDatabase} from './helpers/test-db';
import {supportFixture} from './helpers/support-fixture';
import {officialCard,officialAssignment,officialSupport,officialTextWidth,officialWrap,OFFICIAL_COLORS} from '../lib/chart-appearance';
import {buildChartExportScene,buildChartSvg} from '../lib/chart-export';
import {buildChartPdf} from '../lib/chart-export-pdf';
import {buildChartPptx} from '../lib/chart-export-pptx';
const preferences = await import('../app/api/preferences/route');

test('official defaults preserve positions and content while omitting editor embellishments',async()=>{
 const chart=supportFixture(),before=structuredClone(chart);
 chart.nodes[0].data.unit.assignmentLabel='Synthetic Director, Director · Synthetic Deputy, COO · Synthetic Assistant, Assistant';
 const scene=buildChartExportScene(chart,'internal','2026-11-18T12:00:00Z');
 assert.equal(scene.appearance,'official');
 const root=scene.nodes[0];assert.ok(root.official);assert.equal(root.official.fill,'FFFFFF');
 assert.ok(root.official.lines.some(l=>l.bold));assert.ok(root.official.lines.some(l=>!l.bold&&l.text.includes('Synthetic Deputy')));
 const dx=root.x-chart.nodes[0].position.x,dy=root.y-chart.nodes[0].position.y;
 for(const n of scene.nodes){const original=chart.nodes.find(v=>v.id===n.id)!;assert.equal(n.x-original.position.x,dx);assert.equal(n.y-original.position.y,dy);assert.equal(n.width,Number(original.style!.width));}
 const svg=buildChartSvg(scene);
 assert.match(svg,/Century Gothic/);assert.match(svg,/font-weight="400"/);assert.match(svg,/fill="#D9D9D9"/);
 assert.doesNotMatch(svg,/status-marker|Needs review|Assignment shown in source|org-connection-point|letter-spacing/);
 assert.match(svg,/INTERNAL.*DRAFT/);assert.match(svg,/data-support-panel-id=/);
 assert.deepEqual(chart.nodes.map(n=>n.position),before.nodes.map(n=>n.position));
 const pptx=await buildChartPptx(scene);const xml=strFromU8(unzipSync(pptx)['ppt/slides/slide1.xml']);
 assert.match(xml,/Century Gothic/);assert.match(xml,/595959/);assert.doesNotMatch(xml,/Connection point target|Aptos Display/);
 const pdf=await buildChartPdf(scene);assert.equal((await PDFDocument.load(pdf)).getPageCount(),1);
});

test('official card wrapping fits dense content, preserves acting names and leaves unspecified labels blank',()=>{
 const unit=supportFixture().nodes[0].data.unit;
 unit.assignmentLabel='Synthetic Temporary Holder';unit.positionStatus='acting';
 assert.equal(officialAssignment(unit),'Synthetic Temporary Holder, Interim');
 unit.assignmentLabel='';unit.positionStatus='not_specified';assert.equal(officialAssignment(unit),'');
 unit.assignmentLabel='Synthetic very long assignment and leadership responsibility with additional detail';
 const c=officialCard(unit,248,132,2,1.2);
 for(const l of c.lines){assert.ok(l.y<132&&l.y>0);assert.ok(officialTextWidth(l.text,l.size,l.bold)<=248-15);}
 assert.equal(officialWrap('Averylongwordwithoutspaces',30,12).join(''),'Averylongwordwithoutspaces');
 assert.equal(OFFICIAL_COLORS.division,'D2E4BB');
});

test('appearance persists globally without changing the library view or chart records',async()=>{
 const db=testDatabase();try {
  assert.deepEqual(await preferences.GET().then(r=>r.json()),{libraryView:'flat',chartAppearance:'official'});
  const post=async(body:any)=>preferences.POST(new Request('http://localhost/api/preferences',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
  await post({libraryView:'tree'});await post({chartAppearance:'annotated'});
  assert.deepEqual(await preferences.GET().then(r=>r.json()),{libraryView:'tree',chartAppearance:'annotated'});
  assert.equal((await post({chartAppearance:'invalid'})).status,422);
  assert.equal((await post(null)).status,422);
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM charts').get()!.n,0);
 } finally{db.sql.close();}
});

test('official public appearance does not leak private assignments into visual exports',async()=>{
 const chart=supportFixture();chart.nodes.forEach(n=>{n.data.unit.publicationVisibility='public';n.data.unit.assignmentLabel='SYNTHETIC PRIVATE HOLDER';});
 chart.supportPanels!.forEach(p=>{p.publicationVisibility='public';p.entries.forEach(e=>{e.publicationVisibility='public';e.person='SYNTHETIC PRIVATE SUPPORT';});});
 const scene=buildChartExportScene(chart,'public');const svg=buildChartSvg(scene);
 assert.doesNotMatch(svg,/SYNTHETIC PRIVATE/);
 const bytes=await buildChartPptx(scene);assert.doesNotMatch(strFromU8(unzipSync(bytes)['ppt/slides/slide1.xml']),/SYNTHETIC PRIVATE/);
});

test('acting qualifiers already in a role are not appended to the person again',()=>{
 const unit=supportFixture().nodes[0].data.unit;
 unit.positionStatus='acting';unit.assignmentLabel='Synthetic Temporary Holder';
 for(const role of ['Director (Interim)','Acting Director','Director (INTERIM)']){
  unit.positionTitle=role;
  assert.equal(officialAssignment(unit),'Synthetic Temporary Holder');
  const text=officialCard(unit,320,200,2,1).lines.map(l=>l.text).join(' ');
  assert.equal(text.match(/\b(?:interim|acting)\b/gi)?.length,1);
 }
 unit.positionTitle='Director';assert.equal(officialAssignment(unit),'Synthetic Temporary Holder, Interim');
 unit.assignmentLabel='Synthetic Actingston';assert.equal(officialAssignment(unit),'Synthetic Actingston, Interim');
 unit.assignmentLabel='Synthetic Holder (Interim)';assert.equal(officialAssignment(unit),'Synthetic Holder (Interim)');
 const support=officialSupport('Synthetic support',[{role:'Acting Manager',person:'Synthetic Holder',positionStatus:'acting'}],320,200,1);
 assert.equal(support.lines.map(l=>l.text).join(' ').match(/\b(?:interim|acting)\b/gi)?.length,1);
});

test('public acting cards retain one role qualifier without revealing the person',()=>{
 const unit=supportFixture().nodes[0].data.unit;
 unit.positionStatus='acting';unit.positionTitle='Director (Interim)';unit.assignmentLabel='SYNTHETIC PRIVATE HOLDER';
 const text=officialCard(unit,320,200,2,1,true).lines.map(l=>l.text).join(' ');
 assert.doesNotMatch(text,/SYNTHETIC PRIVATE/);assert.equal(text.match(/\bInterim\b/g)?.length,1);
});

test('SVG and editable PowerPoint share the single-qualifier card without changing data',async()=>{
 const chart=supportFixture(),unit=chart.nodes[0].data.unit;
 unit.positionStatus='acting';unit.positionTitle='Director (Interim)';unit.assignmentLabel='Synthetic Temporary Holder';
 const before=structuredClone(chart),scene=buildChartExportScene(chart,'internal');
 const card=scene.nodes.find(n=>n.id===chart.nodes[0].id)!.official!;
 assert.equal(card.lines.map(l=>l.text).join(' ').match(/\bInterim\b/g)?.length,1);
 const svg=buildChartSvg(scene);assert.doesNotMatch(svg,/Holder, Interim/);
 const xml=strFromU8(unzipSync(await buildChartPptx(scene))['ppt/slides/slide1.xml']);
 assert.doesNotMatch(xml,/Holder, Interim/);assert.match(xml,/Director \(Interim\)/);
 assert.deepEqual(chart,before);
});

test('official drawing keeps compact selection and support assignments accessible',async()=>{
 const React=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
 const {OfficialCardDrawing}=await import('../app/official-card');
 const {SupportPanelsCanvas}=await import('../app/support-panels');
 const c=supportFixture(),root=c.nodes[0];
 const card=officialCard(root.data.unit,720,400,1,1,false,[{id:'synthetic-entry',title:'Synthetic Group',assignment:'Synthetic Holder'}]);
 const svg=renderToStaticMarkup(React.createElement(OfficialCardDrawing,{card,width:720,height:400,onEntry:()=>undefined}));
 assert.match(svg,/role="button"/);assert.match(svg,/Open Synthetic Group, Synthetic Holder/);
 assert.doesNotMatch(svg,/<svg[^>]*aria-hidden="true"/);
 const support=renderToStaticMarkup(React.createElement(SupportPanelsCanvas,{chart:c}));
 assert.match(support,/aria-label="[^"]*Sample Support Person/);
});
