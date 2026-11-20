import {useState, useSyncExternalStore} from "react";
import {interfaceMode, readInterfaceMode, writeInterfaceMode, INTERFACE_MODE_KEY, type InterfaceMode} from "../lib/interface-mode";

let sessionMode: InterfaceMode | undefined;
const listeners = new Set<() => void>();
function snapshot(): InterfaceMode {
  if (sessionMode) return sessionMode;
  try { return readInterfaceMode(window.localStorage); } catch { return "simple"; }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const changed = (event: StorageEvent) => {
    if (event.key === INTERFACE_MODE_KEY || event.key === null) {sessionMode = undefined; listener();}
  };
  window.addEventListener("storage", changed);
  return () => {listeners.delete(listener); window.removeEventListener("storage", changed);};
}
const serverSnapshot = (): InterfaceMode => "simple";
export function useInterfaceMode() {
  const mode = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [preferenceError, setPreferenceError] = useState("");
  const chooseInterfaceMode = (value: string) => {
    sessionMode = interfaceMode(value);
    try { writeInterfaceMode(window.localStorage, value); setPreferenceError(""); }
    catch { setPreferenceError("Mode changed for this session; this browser could not remember your choice."); }
    for (const listener of listeners) listener();
  };
  return {interfaceMode: mode, advanced: mode === "advanced", chooseInterfaceMode, preferenceError};
}
