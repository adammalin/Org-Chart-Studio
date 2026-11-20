import test from 'node:test';
import assert from 'node:assert/strict';
import {interfaceMode, readInterfaceMode, writeInterfaceMode, INTERFACE_MODE_KEY} from '../lib/interface-mode';

test('new and invalid interface preferences fall back to Simple',()=>{
 for(const value of [null, undefined, '', 'expert', {}, 1]) assert.equal(interfaceMode(value),'simple');
 assert.equal(interfaceMode('simple'),'simple');
 assert.equal(interfaceMode('advanced'),'advanced');
 assert.equal(readInterfaceMode({getItem:()=>null}),'simple');
 assert.equal(readInterfaceMode({getItem:()=>{throw Error('Storage blocked');}}),'simple');
});
test('mode persistence only writes its device preference, and reports storage failures',()=>{
 const values=new Map<string,string>([['unrelated-chart-recovery','preserved']]);
 const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
 assert.equal(writeInterfaceMode(storage,'advanced'),'advanced');
 assert.equal(readInterfaceMode(storage),'advanced');
 assert.equal(values.get(INTERFACE_MODE_KEY),'advanced');
 assert.equal(values.get('unrelated-chart-recovery'),'preserved');
 assert.equal(values.size,2);
 writeInterfaceMode(storage,'simple');assert.equal(readInterfaceMode(storage),'simple');
 assert.throws(()=>writeInterfaceMode({setItem:()=>{throw Error('Quota');}},'advanced'),/Quota/);
});
