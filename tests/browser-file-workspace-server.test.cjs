/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {startFileWorkspaceServer}=require('../electron/file-workspaces.cjs');
test('isolated desktop file workspace serves static assets only, with no source directory or API access',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'orgchart-static-synthetic-'));fs.writeFileSync(path.join(folder,'index.html'),'<h1>Synthetic file workspace</h1>');fs.writeFileSync(path.join(folder,'engine.wasm'),'synthetic');
 const {server,origin}=await startFileWorkspaceServer({publicDirectory:folder});
 try{
  const home=await fetch(origin);assert.equal(home.status,200);assert.match(await home.text(),/Synthetic/);assert.match(home.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal((await fetch(origin+'/api/charts')).status,404);
  assert.equal((await fetch(origin,{method:'POST',body:'synthetic'})).status,405);
  assert.equal((await fetch(origin,{headers:{Origin:'https://example.invalid'}})).status,403);
  const wrongHost=await new Promise((resolve,reject)=>{require('node:http').get(origin,{headers:{Host:'example.invalid'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject);});assert.equal(wrongHost,403);
  assert.equal((await fetch(origin+'/engine.wasm')).headers.get('content-type'),'application/wasm');
  assert.equal((await fetch(origin+'/%2e%2e%2fpackage.json')).status,404);
  assert.equal((await fetch(origin+'/does-not-exist')).status,404);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(folder,{recursive:true,force:true});}
});
