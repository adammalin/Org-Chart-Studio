/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("orgChartDesktop", {
  isDesktop: true,
  platform: process.platform,
  versions: Object.freeze({
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  }),
  getStorageSettings: () => ipcRenderer.invoke("storage:get-settings"),
  chooseDataDirectory: () => ipcRenderer.invoke("storage:choose-data-directory"),
  chooseBackupDirectory: () => ipcRenderer.invoke("storage:choose-backup-directory"),
  restartForStorageChange: () => ipcRenderer.invoke("storage:restart"),
  saveEncryptedBackup: (fileName, encryptedJson) =>
    ipcRenderer.invoke("backup:save-encrypted", { fileName, encryptedJson }),
  saveBackup: (fileName, backupJson, encrypted) =>
    ipcRenderer.invoke("backup:save", { fileName, backupJson, encrypted }),
  reportSaveState: (state) => ipcRenderer.send("app:save-state", state),
  requestQuit: () => ipcRenderer.invoke("app:request-quit"),
});
