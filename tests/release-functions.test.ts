import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createBlankChart} from '../lib/chart-library';
import {supportFixture} from './helpers/support-fixture';
import {auditChartQuality,compareChartDocuments} from '../lib/chart-governance';
import {currentReadiness,lifecycleTransitionError,sourceReviewItemCount} from '../lib/chart-lifecycle';
import {chartMatches,searchLibrary} from '../lib/library-navigation';
import {auditPortfolio,nodeReviewPriority,prioritizedReview} from '../lib/portfolio-consistency';
import {buildOrthogonalEdgeRoutes,edgeRoutePath} from '../lib/edge-routing';
import {parseImportBytes} from '../lib/import-org-chart-file';
import {importTemplateCsv} from '../lib/import-org-chart';
import {loadChartFonts} from '../lib/chart-fonts';
import {editableChartShapeError} from '../lib/editable-chart-shape';
import {buildChartExportScene,estimateExportTextWidth} from '../lib/chart-export';
const require=createRequire(import.meta.url);
const fonts=require('../electron/chart-fonts.cjs');

test('quality, comparison and lifecycle handle changed shared IDs, inferred relationships and invalid hierarchies',()=>{
 const c=supportFixture();c.nodes[0].data.unit.sourceCertainty='inferred';c.nodes[1].data.unit.positionStatus='vacant';c.nodes[1].data.unit.effectiveDate='';
 c.edges[0].data!.sourceCertainty='inferred';
 const other=structuredClone(c);other.id='other';
 const quality=auditChartQuality(c.nodes,c.edges,[other],c.id);
 for(const code of ['INFERRED_SOURCE_FACT','INFERRED_RELATIONSHIP','VACANCY_WITHOUT_EFFECTIVE_DATE','EXISTING_LIBRARY_MATCH'])assert.ok(quality.findings.some(f=>f.code===code),code);
 other.nodes[1].position.x+=100;other.edges[0].data!.relationshipType='secondary supervisory';
 const comparison=compareChartDocuments(c,other);assert.deepEqual(comparison.changedNodeIds,[c.nodes[1].id]);assert.deepEqual(comparison.changedEdgeIds,[c.edges[0].id]);
 c.edges[0].data!.sourceCertainty='needs_review';assert.equal(sourceReviewItemCount(c.nodes,c.edges),1);
 c.edges.push({id:'cycle',source:c.nodes[1].id,target:c.nodes[0].id});assert.equal(currentReadiness(c).ready,false);assert.match(lifecycleTransitionError(c,'current')!,/blocking structure/);
 c.status='archived';assert.match(lifecycleTransitionError(c,'current')!,/cannot move/);
});
test('search and prioritization include support roles, accents, compound fields and unresolved sources',()=>{
 const c=supportFixture();c.nodes[0].data.unit.name='Synthetic Physical Sciences Directorate';c.nodes[0].data.unit.assignmentLabel='Zoë Example';c.nodes[0].data.unit.reviewNote='Conflicts with another official file';
 assert.equal(chartMatches(c,'zoe director'),true);assert.equal(chartMatches(c,'procurement'),true);assert.equal(chartMatches(c,'absent'),false);
 assert.ok(searchLibrary([c],'sample partner').some(x=>x.role==='HR Business Partner'));
 assert.equal(nodeReviewPriority(c.nodes[0],c.id,[]),1);c.nodes[0].data.unit.reviewNote='';assert.equal(nodeReviewPriority(c.nodes[0],c.id,[]),2);
 const other=structuredClone(c);other.id='synthetic-other';other.nodes[0].data.unit.assignmentLabel='Different Synthetic Person';other.nodes[0].data.unit.positionTitle='Acting Director';
 const issues=auditPortfolio([c,other]);assert.ok(issues.some(i=>i.category==='assignment'));assert.ok(issues.some(i=>i.category==='role'));
 assert.equal(nodeReviewPriority(c.nodes[0],c.id,issues),0);assert.ok(prioritizedReview([c,other]).some(t=>t.category==='conflicts'));
});
test('binary import dispatch and orthogonal path serialization retain usable chart records',()=>{
 const preview=parseImportBytes('SYNTHETIC.CSV',new TextEncoder().encode(importTemplateCsv()));assert.ok(preview.nodes.length>0);
 const c=supportFixture();const routes=buildOrthogonalEdgeRoutes(c.nodes.map(n=>({id:n.id,x:n.position.x,y:n.position.y,width:Number(n.style!.width),height:Number(n.style!.height)})),c.edges);
 for(const r of routes.values()){const path=edgeRoutePath(r);assert.match(path,/^M /);assert.doesNotMatch(path,/NaN|undefined|Infinity/);assert.equal((path.match(/L /g)??[]).length,r.points.length-1);}
});
test('font functions disclose fallback and never accept renderer-controlled paths',async()=>{
 assert.equal(await loadChartFonts(),null);assert.equal(fonts.readChartFonts({platform:'linux'}),null);
 const native=fonts.readChartFonts({platform:process.platform});if(native){assert.equal(native.family,'Century Gothic');assert.equal(fonts.embeddingAllowed(Buffer.from(native.regular,'base64')),true);assert.equal(fonts.embeddingAllowed(Buffer.from(native.bold,'base64')),true);}
});
test('editable chart validation rejects malformed unit values without coercing or mutating them',()=>{
 const c=createBlankChart('Synthetic shape validation','synthetic-shape');assert.equal(editableChartShapeError(c),null);
 const original=JSON.stringify(c);const bad=structuredClone(c);(bad.nodes[0].data.unit as unknown as Record<string,unknown>).assignmentLabel={unexpected:true};assert.match(editableChartShapeError(bad)!,/unit is malformed/);assert.equal(JSON.stringify(c),original);
});
test('extremely long annotated card names retain every word inside the available width',()=>{
 const c=createBlankChart('Synthetic dense name','synthetic-dense');c.nodes[0].data.unit.shortName=Array.from({length:50},(_,i)=>'Synthetic'+i).join(' ');
 const before=JSON.stringify(c);const scene=buildChartExportScene(c,'internal','2026-11-19T12:00:00Z','separate','individual','vertical','annotated');
 const n=scene.nodes[0];assert.equal(n.name,c.nodes[0].data.unit.shortName);
 assert.ok(n.nameLines.every(line=>estimateExportTextWidth(line,n.nameFontSize,true)<=n.width-40));
 assert.ok(n.nameLines.length*n.nameLineHeight<=54);assert.equal(JSON.stringify(c),before);
});
