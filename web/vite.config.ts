import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..',import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL('.',import.meta.url)), base:'./', publicDir:false,
  plugins:[react()],
  resolve:{alias:[{find:root+'/db/platform',replacement:root+'/runtime/browser/platform.ts'},
    {find:'cloudflare:workers',replacement:root+'/runtime/browser/platform.ts'}]},
  build:{outDir:root+'/public',emptyOutDir:true,sourcemap:false},
  worker:{format:'es'},server:{host:'127.0.0.1',port:4188,strictPort:true},
});
