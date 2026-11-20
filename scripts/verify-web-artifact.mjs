import {readdirSync,readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../public/',import.meta.url));
const files=[];
function visit(dir){for(const name of readdirSync(dir)){const file=path.join(dir,name);if(statSync(file).isDirectory())visit(file);else files.push(file);}}
visit(root);
const allowed=new Set(['.html','.js','.css','.wasm','.svg','.woff2','.ico']);
for(const file of files){
 const relative=path.relative(root,file),ext=path.extname(file);
 if(!allowed.has(ext)||relative.split(path.sep).some(p=>['api','backups','chart-data','node_modules'].includes(p)))throw Error('Unexpected deployment artifact: '+relative);
 if(ext!=='.wasm'){
  const text=readFileSync(file,'utf8');
  if(/\/Users\/[^/\s"']+|[A-Za-z0-9._%+-]+@ornl\.gov|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}/.test(text))throw Error('Private value in deployment output: '+relative);
  if(/(?:from\s*|import\s*\()\s*["'](?:node:|cloudflare:workers)/.test(text))throw Error('Server import in browser output: '+relative);
 }
}
const html=readFileSync(path.join(root,'index.html'),'utf8');
for(const [,url] of html.matchAll(/(?:src|href)="([^"]+)"/g)){
 if(!url.startsWith('./'))throw Error('Static entry assets must be relative for GitHub Pages: '+url);
 if(!files.includes(path.resolve(root,url)))throw Error('Missing entry asset: '+url);
}
if(!files.some(f=>f.endsWith('.wasm')))throw Error('SQLite worker runtime is missing.');
console.log(JSON.stringify({verified:true,files:files.length,bytes:files.reduce((n,f)=>n+statSync(f).size,0),relativeEntryAssets:true,sourceMaps:false}));
