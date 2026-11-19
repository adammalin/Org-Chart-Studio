import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('Mac setup configures only its own Git repository and preserves an ancestor repository', {skip:process.platform!=='darwin'},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'orgchart-hook-scope-'));
 const parent=path.join(root,'parent'),project=path.join(parent,'nested-app'),bin=path.join(root,'bin');
 try{
  fs.mkdirSync(path.join(project,'scripts'),{recursive:true});fs.mkdirSync(bin);
  execFileSync('git',['init','-q',parent]);execFileSync('git',['-C',parent,'config','core.hooksPath','synthetic-parent-hooks']);
  const config=fs.readFileSync(path.join(parent,'.git','config'),'utf8');
  fs.copyFileSync(new URL('../scripts/setup-mac-source-test.zsh',import.meta.url),path.join(project,'scripts/setup-mac-source-test.zsh'));
  fs.symlinkSync(process.execPath,path.join(bin,'node'));
  // Stub dependency/build commands; the real fresh-install test runs those.
  fs.writeFileSync(path.join(bin,'npm'),'#!/bin/sh\nexit 0\n',{mode:0o755});
  const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,CODEX_HOME:path.join(root,'synthetic-codex'),ORGCHART_SETUP_MCP:'skip',ORGCHART_SETUP_STAGE_ONLY:'1'};
  execFileSync('/bin/zsh',[path.join(project,'scripts/setup-mac-source-test.zsh')],{env,stdio:'pipe'});
  assert.equal(fs.readFileSync(path.join(parent,'.git','config'),'utf8'),config);
  execFileSync('git',['init','-q',project]);
  execFileSync('/bin/zsh',[path.join(project,'scripts/setup-mac-source-test.zsh')],{env,stdio:'pipe'});
  assert.equal(execFileSync('git',['-C',project,'config','--get','core.hooksPath'],{encoding:'utf8'}).trim(),'.githooks');
  assert.equal(fs.readFileSync(path.join(parent,'.git','config'),'utf8'),config);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
