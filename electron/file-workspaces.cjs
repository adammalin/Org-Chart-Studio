/* eslint-disable @typescript-eslint/no-require-imports */
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
async function startFileWorkspaceServer({publicDirectory,port=0}){
 const root=fs.realpathSync(publicDirectory);
 if(!fs.existsSync(path.join(root,'index.html')))throw Error('Build the static file workspace with npm run web:build first.');
 let origin;
 const server=http.createServer((request,response)=>{
  const deny=(status)=>{response.writeHead(status,{'cache-control':'no-store'});response.end();};
  if(request.headers.host!==new URL(origin).host)return deny(403);
  if(request.headers.origin&&request.headers.origin!==origin)return deny(403);
  if(!['GET','HEAD'].includes(request.method))return deny(405);
  let pathname;try{pathname=decodeURIComponent(new URL(request.url,origin).pathname);}catch{return deny(400);}
  if(pathname.startsWith('/api/'))return deny(404);
  const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!target.startsWith(root+path.sep)||!fs.existsSync(target))return deny(404);
  const resolved=fs.realpathSync(target);
  if(!resolved.startsWith(root+path.sep)||!fs.statSync(resolved).isFile())return deny(403);
  response.writeHead(200,{'content-type':MIME[path.extname(resolved)]??'application/octet-stream','cache-control':'no-store',
   'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
   'content-security-policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});
  if(request.method==='HEAD')response.end();else fs.createReadStream(resolved).on('error',()=>response.destroy()).pipe(response);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 origin='http://127.0.0.1:'+server.address().port;server.unref();return {server,origin};
}
module.exports={startFileWorkspaceServer};
