/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("orgChartDesktop", {
  isDesktop: true,
  ...(process.argv.includes("--orgchart-smoke")?{testInterruptService:()=>ipcRenderer.invoke("app:test-interrupt-service")}:{}),
  platform: process.platform,
  versions: Object.freeze({
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  }),
  getStorageSettings: () => ipcRenderer.invoke("storage:get-settings"),
  chooseDataDirectory: () => ipcRenderer.invoke("storage:choose-data-directory"),
  chooseBackupDirectory: () => ipcRenderer.invoke("storage:choose-backup-directory"),
  restartForStorageChange: () => ipcRenderer.invoke("storage:restart"),
  getMcpConfigurationStatus: () => ipcRenderer.invoke("mcp:configuration-status"),
  configureMcp: (action) => ipcRenderer.invoke("mcp:configure", action),
  saveEncryptedBackup: (fileName, encryptedJson) =>
    ipcRenderer.invoke("backup:save-encrypted", { fileName, encryptedJson }),
  saveBackup: (fileName, backupJson, encrypted) =>
    ipcRenderer.invoke("backup:save", { fileName, backupJson, encrypted }),
  getServiceState:()=>ipcRenderer.invoke("app:service-state"),
  onServiceState:(callback)=>{const listener=(_event,state)=>callback(state);ipcRenderer.on("app:service-state",listener);return()=>ipcRenderer.removeListener("app:service-state",listener);},
  retryService:()=>ipcRenderer.invoke("app:retry-service"),
  reopenWorkspace:()=>ipcRenderer.invoke("app:reopen-workspace"),
  openDiagnostics:()=>ipcRenderer.invoke("app:open-diagnostics"),
  getRecoveryDraft:()=>ipcRenderer.invoke("app:recovery-draft"),
  saveRecoveryDraft:(draft)=>ipcRenderer.invoke("app:save-recovery-draft",draft),
  reportLastSaved:(at)=>ipcRenderer.send("app:last-saved",at),
  reportSaveState: (state) => ipcRenderer.send("app:save-state", state),
  requestQuit: () => ipcRenderer.invoke("app:request-quit"),
});
