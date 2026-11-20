import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorialSteps,tutorialDestination} from '../lib/studio-tutorial';

test('tutorial navigation uses the library for chart-only topics in an empty workspace',()=>{
  for(const mode of ['simple','advanced'] as const) for(const runtime of ['browser','desktop'] as const) {
    for(const step of tutorialSteps(mode,runtime)) {
      assert.equal(tutorialDestination(step,true),step.view);
      assert.equal(tutorialDestination(step,false),step.needsChart ? 'library' : step.view);
    }
  }
});
test('Advanced retains all essential topics while adding its specialist destinations',()=>{
  const simple=tutorialSteps('simple','browser'), advanced=tutorialSteps('advanced','browser');
  assert.equal(new Set(advanced.map(s=>s.id)).size,advanced.length);
  for(const step of simple) assert.deepEqual(advanced.find(s=>s.id===step.id),step);
  for(const view of ['sources','table','consistency']) assert.ok(advanced.some(s=>s.view===view));
  assert.ok(!simple.some(s=>['sources','table','consistency'].includes(s.view)));
});
test('file and AI guidance follows the actual runtime rather than desktop-only controls on web',()=>{
  const web=tutorialSteps('simple','browser'), desktop=tutorialSteps('simple','desktop');
  assert.equal(web[0].target,'.library-file-bar');
  assert.equal(desktop[0].target,'.library-heading');
  assert.match(web.find(s=>s.id==='ai')!.body,/this browser library/);
  assert.match(desktop.find(s=>s.id==='ai')!.body,/desktop MCP connection/);
});
