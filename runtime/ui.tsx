import {createContext,useContext,type ComponentType,type ReactNode} from 'react';
export interface StudioEnvironment {kind:'desktop'|'browser'; BrowserAgentControls?:ComponentType; LibraryControls?:ComponentType<{editorSaveState:string}>; browserAgentAvailable:boolean}
const environment=createContext<StudioEnvironment>({kind:'desktop',browserAgentAvailable:false});
export const StudioEnvironmentProvider=({value,children}:{value:StudioEnvironment;children:ReactNode})=><environment.Provider value={value}>{children}</environment.Provider>;
export const useStudioEnvironment=()=>useContext(environment);
export function RuntimeLibraryControls({editorSaveState}:{editorSaveState:string}){const Controls=useStudioEnvironment().LibraryControls;return Controls?<Controls editorSaveState={editorSaveState}/>:null;}
