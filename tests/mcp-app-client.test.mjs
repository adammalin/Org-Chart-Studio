import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { OrgChartAppClient, defaultRuntimeFilePath } from '../mcp/orgchart-app-client.mjs';

test('MCP client refuses redirects without forwarding its desktop token to another service', async () => {
  const root = mkdtempSync(join(tmpdir(), 'orgchart-redirect-'));
  let forwarded = 0;
  const receiver = http.createServer((_req, res) => { forwarded++; res.end('{}'); });
  receiver.listen(0, '127.0.0.1'); await once(receiver, 'listening');
  const app = http.createServer((req, res) => {
    assert.equal(req.headers['x-orgchart-desktop-token'], 'synthetic-token-'.repeat(5));
    if (req.url === '/missing') {res.writeHead(404,{'content-type':'application/json'});res.end('{}');return;}
    if (req.url === '/redirect') { res.writeHead(302, { location: `http://127.0.0.1:${receiver.address().port}/capture` }); res.end(); }
    else { res.setHeader('content-type', 'application/json'); res.end('{"ok":true}'); }
  });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  const runtimePath = join(root, 'runtime.json');
  writeFileSync(runtimePath, JSON.stringify({ version: 1, pid: process.pid, baseUrl: `http://127.0.0.1:${app.address().port}/`, token: 'synthetic-token-'.repeat(5) }), {mode: 0o600});
  try {
    const client = new OrgChartAppClient({runtimePath});
    assert.deepEqual(await client.request('/normal'), {ok: true});
    assert.match(defaultRuntimeFilePath(), /mcp-runtime\.json$/);
    await assert.rejects(client.request('/missing'), /requested chart record was not found/);
    await assert.rejects(client.request('/redirect'), /Open the ORNL OrgChart Studio/);
    await assert.rejects(client.request(`http://127.0.0.1:${receiver.address().port}/capture`), /non-local/);
    assert.equal(forwarded, 0);
  } finally {
    await Promise.all([new Promise(resolve => app.close(resolve)), new Promise(resolve => receiver.close(resolve))]);
    rmSync(root, {recursive: true, force: true});
  }
});
