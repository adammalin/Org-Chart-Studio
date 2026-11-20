import assert from 'node:assert/strict';
import test from 'node:test';
import { supportFixture } from './helpers/support-fixture';
import { SOURCE_CONNECTION_TYPE, deriveCompactPresentation, descendantIds, hierarchyLevels, validateHierarchy } from '../lib/org-chart';
import { buildAccessibleTableCsv, buildChartExportScene } from '../lib/chart-export';
import { contentFingerprint } from '../lib/chart-supplements';
import { parseCsv, parseImportFile } from '../lib/import-org-chart';

function fixture() {
  const chart = supportFixture('synthetic-neutral-chart');
  chart.nodes[1].data.unit.reportingPlacement = 'standalone';
  chart.edges[0].data = {...chart.edges[0].data, relationshipType:SOURCE_CONNECTION_TYPE};
  return chart;
}

test('an explicitly standalone source card and neutral connection do not assert supervision', () => {
  const chart = fixture();
  assert.deepEqual(validateHierarchy(chart.nodes,chart.edges),[]);
  assert.deepEqual([...descendantIds(chart.nodes[0].id,chart.edges)],[chart.nodes[0].id]);
  assert.equal(hierarchyLevels(chart.nodes,chart.edges).get(chart.nodes[1].id),1);
  const compact = deriveCompactPresentation(chart.nodes,chart.edges);
  assert.equal(compact.parentById.has(chart.nodes[1].id),false);
  assert.equal(compact.listedNodeIds.has(chart.nodes[1].id),false);
  const scene = buildChartExportScene(chart,'internal');
  assert.equal(scene.nodes.length,2);
  assert.equal(scene.edges.length,1);
});

test('explicit standalone support keeps extra-root, cyclic, missing-endpoint and contradictory-parent protections', () => {
  const chart=fixture();
  delete chart.nodes[1].data.unit.reportingPlacement;
  assert.ok(validateHierarchy(chart.nodes,chart.edges).some(f=>f.code==='INVALID_ROOT_COUNT'));
  chart.nodes[1].data.unit.reportingPlacement='standalone';
  chart.edges[0].data!.relationshipType='primary supervisory';
  assert.ok(validateHierarchy(chart.nodes,chart.edges).some(f=>f.code==='STANDALONE_HAS_PRIMARY_PARENT'));
  delete chart.nodes[1].data.unit.reportingPlacement;
  assert.ok(validateHierarchy(chart.nodes,[...chart.edges,{id:'synthetic-cycle',source:chart.nodes[1].id,target:chart.nodes[0].id}]).some(f=>f.code==='REPORTING_CYCLE'));
  assert.ok(validateHierarchy(chart.nodes,[{id:'synthetic-missing',source:chart.nodes[0].id,target:'missing'}]).some(f=>f.code==='MISSING_ENDPOINT'));
});

test('a source card with no connector round-trips through canonical and normalized imports', () => {
  const chart=fixture();chart.edges=[];
  const restored=parseImportFile('synthetic-chart.json',JSON.stringify(chart));
  assert.deepEqual(restored.findings.filter(f=>f.severity==='blocking'),[]);
  assert.equal(restored.nodes[1].data.unit.reportingPlacement,'standalone');
  const normalized=chart.nodes.map(n=>({...n.data.unit,parentId:''}));
  const normalizedPreview=parseImportFile('synthetic-normalized.json',JSON.stringify(normalized));
  assert.deepEqual(normalizedPreview.findings.filter(f=>f.severity==='blocking'),[]);
  assert.equal(normalizedPreview.nodes[1].data.unit.reportingPlacement,'standalone');
});

test('normalized imports preserve a neutral connection instead of converting it to a primary parent', () => {
  const chart=fixture();
  const rows=chart.nodes.map((n,i)=>({...n.data.unit,parentId:i?chart.nodes[0].id:'',relationshipType:i?SOURCE_CONNECTION_TYPE:'',relationshipSourceLocator:'Synthetic line',relationshipSourceCertainty:'confirmed'}));
  const preview=parseImportFile('synthetic-neutral.json',JSON.stringify(rows));
  assert.deepEqual(preview.findings.filter(f=>f.severity==='blocking'),[]);
  assert.equal(preview.edges[0].data?.relationshipType,SOURCE_CONNECTION_TYPE);
});

test('accessible exports distinguish no-parent-shown cards and filter internal-only connection endpoints', () => {
  const chart=fixture();
  const table=buildAccessibleTableCsv(chart,'internal');
  assert.match(table,/reportingPlacement,sourceConnections/);
  assert.match(table,/No parent shown in source/);
  assert.match(table,/source connection — authority unspecified/);
  // A public standalone card has no private supervisory ancestor to disclose.
  chart.nodes[0].data.unit.publicationVisibility='internal';
  const publicTable=buildAccessibleTableCsv(chart,'public');
  assert.doesNotMatch(publicTable,/Synthetic Directorate/);
  assert.equal(buildChartExportScene(chart,'public').nodes.length,1);
  const parsed=parseCsv(table);
  assert.equal(parsed.length,chart.nodes.length+chart.supportPanels!.reduce((sum,p)=>sum+p.entries.length,0));
});

test('source checks distinguish standalone placement while retaining existing hierarchy fingerprints',async()=>{
  const chart=supportFixture();const old=await contentFingerprint(chart);
  chart.nodes[1].data.unit.reportingPlacement='hierarchy';
  assert.equal(await contentFingerprint(chart),old);
  chart.nodes[1].data.unit.reportingPlacement='standalone';
  assert.notEqual(await contentFingerprint(chart),old);
});
