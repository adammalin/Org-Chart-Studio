import {useSyncExternalStore} from 'react';
import {browserSession} from './client';
import {browserToolRegistry,registerBrowserTools} from './browser-tools';
interface Health {phase:'connecting'|'ready'|'unavailable'|'error';message:string}
let health:Health={phase:'unavailable',message:'Checking browser tool support…'};
const listeners=new Set<()=>void>();
const setHealth=(next:Health)=>{health=next;for(const listener of listeners)listener();};
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
let reconnect=()=>{};
/** Re-register on a changed host/workspace, late host injection, or an explicit retry.
 * A healthy connection is left intact on focus. Never retries a chart mutation. */
export function startBrowserToolConnection(){
 let stopped=false,active:ReturnType<typeof registerBrowserTools>|undefined,connection='',generation=0;
 const ensure=(force=false)=>{
  const id=browserSession.getSnapshot().connectionId;
  // Some hosts return a new registry wrapper on each read. Comparing object
  // identity would invalidate every tool on focus, including the next agent call.
  if(!force&&id===connection&&(health.phase==='ready'||health.phase==='connecting'))return;
  const next=browserToolRegistry();
  const turn=++generation;active?.();active=undefined;connection=id;
  if(!next){setHealth({phase:'unavailable',message:'This browser has not provided page tools. Use a supported agent browser or choose desktop.'});return;}
  setHealth({phase:'connecting',message:'Connecting browser AI tools…'});
  const registration=registerBrowserTools();active=registration;
  let timeout:ReturnType<typeof setTimeout>;
  const deadline=new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Error('Browser tool registration timed out.')),10000);});
  void Promise.race([registration.ready,deadline]).then(()=>{if(!stopped&&turn===generation)setHealth({phase:'ready',message:'Browser AI tools connected. Reconnection keeps your Pause and chart access settings.'});}).catch(error=>{registration();if(!stopped&&turn===generation)setHealth({phase:'error',message:String(error?.message??error).slice(0,300)+' Choose Reconnect tools, then rediscover tools in your agent.'});}).finally(()=>clearTimeout(timeout));
 };
 reconnect=()=>ensure(true);
 const wake=()=>ensure();
 const visible=()=>{if(document.visibilityState==='visible')ensure();};
 window.addEventListener('focus',wake);window.addEventListener('pageshow',wake);document.addEventListener('visibilitychange',visible);
 const unsubscribe=browserSession.subscribe(wake);
 const timers=[500,2000,5000,15000].map(ms=>setTimeout(wake,ms));const interval=setInterval(wake,30000);ensure();
 return ()=>{stopped=true;generation++;active?.();unsubscribe();timers.forEach(clearTimeout);clearInterval(interval);window.removeEventListener('focus',wake);window.removeEventListener('pageshow',wake);document.removeEventListener('visibilitychange',visible);reconnect=()=>{};};
}
export function BrowserAgentControls(){
 const state=useSyncExternalStore(subscribe,()=>health);
 return <section className="browser-agent-health" aria-label="Browser AI connection" data-phase={state.phase}><p role="status">{state.message}</p><button className="button button--secondary" onClick={()=>reconnect()}>Reconnect tools</button></section>;
}
