import {resumeFileLink} from "./files";
import {createRoot} from 'react-dom/client';
import {useEffect,useState} from 'react';
import {StudioEnvironmentProvider} from '../runtime/ui';
import {LibraryControls} from './library-controls';
import {OrgChartStudio} from '../app/orgchart-studio';
import {browserSession} from './client';
import {registerBrowserTools,browserToolRegistry} from './browser-tools';
import '../app/globals.css';
function BrowserEditor(){
 const [epoch,setEpoch]=useState(0);
 useEffect(()=>{const opened=()=>setEpoch(n=>n+1);window.addEventListener('orgchart-workspace-opened',opened);return()=>window.removeEventListener('orgchart-workspace-opened',opened);},[]);
 useEffect(()=>registerBrowserTools(),[epoch]);
 return <StudioEnvironmentProvider value={{kind:'browser',LibraryControls,browserAgentAvailable:!!browserToolRegistry()}}><OrgChartStudio key={epoch}/></StudioEnvironmentProvider>;
}
function App(){
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[passphrase,setPassphrase]=useState('');
 useEffect(()=>{void browserSession.init().then(async()=>{await resumeFileLink().catch(()=>{});setReady(true);}).catch(e=>setError(e.message));},[]);
 if(ready)return <BrowserEditor/>;
 return <main className="browser-unlock"><h1>OrgChart Studio</h1><p>{error||'Opening browser recovery…'}</p>{error&&!error.toLowerCase().includes('locked')&&<button onClick={()=>location.reload()}>Retry opening workspace</button>}{error&&error.toLowerCase().includes('locked')&&<form onSubmit={event=>{event.preventDefault();void browserSession.unlock(passphrase).then(async()=>{await resumeFileLink().catch(()=>{});setPassphrase('');setReady(true);}).catch(e=>setError(e.message));}}><label>Recovery passphrase<input type="password" value={passphrase} onChange={e=>setPassphrase(e.target.value)} autoComplete="off"/></label><button>Unlock recovery</button></form>}</main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
