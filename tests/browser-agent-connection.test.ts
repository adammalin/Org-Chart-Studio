import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserSession} from '../web/client';
import {startBrowserToolConnection} from '../web/agent-connection';
interface FakeRegistry {registerTool:(tool:unknown,options:{signal:AbortSignal})=>unknown}
const surface=Object.assign(new EventTarget(),{modelContext:undefined as FakeRegistry|undefined,visibilityState:'visible'}),win=new EventTarget();
Object.defineProperty(globalThis,'document',{value:surface,configurable:true});Object.defineProperty(globalThis,'window',{value:win,configurable:true});
let connection='synthetic-a';browserSession.getSnapshot=()=>({id:'workspace-synthetic-reconnect',connectionId:connection,revision:0,fileRevision:0,fileName:null,lastFileSavedAt:null,recoveredAt:'',protection:'unencrypted'});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('late host injection connects; healthy focus keeps handles; workspace changes abort previous registrations',async()=>{
 let count=0;const signals:AbortSignal[]=[];const stop=startBrowserToolConnection();
 surface.modelContext={registerTool:(_tool,options)=>{count++;signals.push(options.signal);}};win.dispatchEvent(new Event('focus'));await flush();assert.equal(count,42);
 win.dispatchEvent(new Event('focus'));win.dispatchEvent(new Event('pageshow'));await flush();assert.equal(count,42);
 connection='synthetic-b';win.dispatchEvent(new Event('focus'));await flush();assert.equal(count,84);assert.equal(signals[0].aborted,true);assert.equal(signals[42].aborted,false);
 stop();assert.equal(signals[42].aborted,true);
});
test('registration failure is handled and a later focus retries without changing user data',async()=>{
 let count=0;surface.modelContext={registerTool:()=>{throw Error('Synthetic host reconnect');}};const stop=startBrowserToolConnection();await flush();
 surface.modelContext={registerTool:()=>{count++;}};win.dispatchEvent(new Event('focus'));await flush();assert.equal(count,42);stop();
});

test('hosts with unstable registry wrappers do not reconnect healthy tools on focus',async()=>{
 let count=0;Object.defineProperty(surface,'modelContext',{get:()=>({registerTool:()=>{count++;}}),configurable:true});const stop=startBrowserToolConnection();await flush();assert.equal(count,42);
 win.dispatchEvent(new Event('focus'));win.dispatchEvent(new Event('pageshow'));await flush();assert.equal(count,42);stop();
});
