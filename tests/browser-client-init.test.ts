import {test} from 'node:test';import assert from 'node:assert/strict';
import {browserSession} from '../web/client';
test('repeated browser mounting shares one initialization and one workspace worker',async()=>{
 let count=0;class FakeWorker {onmessage:((e:{data:unknown})=>void)|undefined;onerror:unknown;constructor(){count++;}postMessage(request:{id:number}){queueMicrotask(()=>this.onmessage?.({data:{id:request.id,result:{},metadata:{id:'workspace-synthetic-init',connectionId:'synthetic',revision:0,fileRevision:0,protection:'unencrypted'}}}));}}
 Object.defineProperty(globalThis,'Worker',{value:FakeWorker,configurable:true});const first=browserSession.init(),second=browserSession.init();assert.equal(first,second);await Promise.all([first,second]);assert.equal(count,1);assert.equal(browserSession.getSnapshot().id,'workspace-synthetic-init');
});
