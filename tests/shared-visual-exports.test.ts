import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createBlankChart,type ChartDocument} from '../lib/chart-library';
import {buildChartExportScene,buildChartSvg} from '../lib/chart-export';
const {visualFixture}=createRequire(import.meta.url)('../electron/visual-regression-smoke.cjs') as {visualFixture:(base:ChartDocument)=>ChartDocument};
test('official and annotated exports share the straight route without changing saved geometry',()=>{
 const chart=visualFixture(createBlankChart('Synthetic shared visual fixture','synthetic-visual-export'));const before=structuredClone(chart);
 for(const appearance of ['official','annotated'] as const){
  const scene=buildChartExportScene(chart,'internal','2026-11-19T12:00:00Z','separate','individual','horizontal',appearance);
  const edge=scene.edges.find(e=>e.id==='synthetic-aligned-edge')!;assert.equal(edge.points.length,2);assert.equal(edge.points[0].x,edge.points[1].x);
  assert.ok(buildChartSvg(scene,'natural').includes('Synthetic'));
 }
 assert.deepEqual(chart,before,'exporting never rewrites saved card positions or source routes');
});

test('source colors and side spines reach official exports without changing unit types',async()=>{
 const {sourceSpineFixture}=createRequire(import.meta.url)('../electron/visual-regression-smoke.cjs');
 const chart=sourceSpineFixture(createBlankChart('Synthetic source spine','synthetic-spine-export')) as ChartDocument,before=structuredClone(chart);
 const {normalizeSupplements}=await import('../lib/chart-supplements');
 const normalized=normalizeSupplements(chart);assert.deepEqual(normalized.sourceLayout!.cardFills,chart.sourceLayout!.cardFills);
 const scene=buildChartExportScene(chart,'internal','2026-11-19T18:00:00Z','separate','individual','horizontal','official');
 for(const n of scene.nodes.filter(n=>n.id!=='synthetic-section'))assert.equal(n.official!.fill,'FAEEDA');
 for(const e of scene.edges){assert.equal(e.points.length,3);assert.equal(e.points[0].x,e.points[1].x);assert.ok(e.points[1].x<e.points[2].x);}
 const svg=buildChartSvg(scene);assert.equal((svg.match(/fill="#FAEEDA"/g)||[]).length,3);
 const {buildChartPptx}=await import('../lib/chart-export-pptx');const {unzipSync,strFromU8}=await import('fflate');const xml=strFromU8(unzipSync(await buildChartPptx(scene))['ppt/slides/slide1.xml']);assert.match(xml,/FAEEDA/);
 assert.deepEqual(chart,before);
 const invalid=structuredClone(chart);invalid.sourceLayout!.cardFills!['missing']='FFFFFF';assert.throws(()=>normalizeSupplements(invalid),/fills/);
 const unsafe=structuredClone(chart);unsafe.sourceLayout!.cardFills!['synthetic-spine-a']='url(invalid)';assert.throws(()=>normalizeSupplements(unsafe),/RGB/);
});
