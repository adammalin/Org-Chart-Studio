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
