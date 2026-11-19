import { testDatabase } from './helpers/test-db';
import test from 'node:test';
import assert from 'node:assert/strict';

const routes = await Promise.all([
  'ai-activity','ai-import-proposals','ai-proposals','backups','charts',
  'edit-history','history','history/answers','import-intakes','mcp-control',
  'monthly-workspace','preferences','source-extractions',
].map(async name => ({name, route:await import(`../app/api/${name}/route.ts`)})));
const rawRequest = (raw:string) => new Request('http://127.0.0.1/api/test', {
  method:'POST',headers:{'content-type':'application/json'},body:raw,
});

for (const {name,route} of routes) {
  test(`${name} rejects malformed JSON and non-object bodies without throwing or writing`, async () => {
    const {sql} = testDatabase();
    try {
      for (const raw of ['{', 'null','[]','42','"unexpected"']) {
        const response = await route.POST(rawRequest(raw));
        assert.ok(response.status >= 400 && response.status < 500, `${name}: ${raw} returned ${response.status}`);
        assert.equal(typeof (await response.json()).error,'string');
      }
      assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM charts').get()?.n,0);
      assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM monthly_updates').get()?.n,0);
    } finally {sql.close();}
  });
}

test('wrongly typed action fields are rejected before database writes', async () => {
  const {sql}=testDatabase();
  try {
    const cases:Record<string,unknown[]>={
      charts:[{action:'create',name:7},{action:'save',chart:{id:'x',name:7}},{action:'create',name:{}}],
      'ai-import-proposals':[{action:'stage',chartName:7,contents:'x',format:'csv'}],
      history:[{action:'begin',month:'2026-11',label:7,changeList:'Synthetic'},{action:'begin',month:'2026-11',label:'Synthetic',changeList:'Synthetic',chartIds:5}],
      'history/answers':[{question:'Who led this chart?',chartId:'x',scopeIds:5}],
      'source-extractions':[{scope:'chart',id:7}],
      'import-intakes':[{action:'discard',intakeId:7}],
      'monthly-workspace':[{action:'review_batch',batchId:'x',proposalIds:'not-an-array',decision:'accept'}],
    };
    for (const [name,bodies] of Object.entries(cases)) for(const body of bodies) {
      const response=await routes.find(x=>x.name===name)!.route.POST(rawRequest(JSON.stringify(body)));
      assert.ok(response.status>=400&&response.status<500,`${name}: ${JSON.stringify(body)}`);
    }
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM charts').get()?.n,0);
  } finally {sql.close();}
});
