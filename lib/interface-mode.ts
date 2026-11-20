/** Interface preferences are device-local, never part of a chart or its history. */
export type InterfaceMode = "simple" | "advanced";
export const INTERFACE_MODE_KEY = "orgchart-studio-interface-mode-v1";
export function interfaceMode(value: unknown): InterfaceMode {
  return value === "advanced" ? "advanced" : "simple";
}
export function readInterfaceMode(storage: Pick<Storage, "getItem">): InterfaceMode {
  try { return interfaceMode(storage.getItem(INTERFACE_MODE_KEY)); }
  catch { return "simple"; }
}
export function writeInterfaceMode(storage: Pick<Storage, "setItem">, value: unknown): InterfaceMode {
  const mode = interfaceMode(value);
  storage.setItem(INTERFACE_MODE_KEY, mode);
  return mode;
}
