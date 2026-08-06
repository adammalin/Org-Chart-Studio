interface DesktopStorageMigration {
  completedAt: string;
  from: string;
  to: string;
  sourceRetained: boolean;
}

interface DesktopStorageSettings {
  dataDirectory: string;
  backupDirectory: string | null;
  pendingDataDirectory: string | null;
  restartRequired: boolean;
  dataDirectoryIsDefault: boolean;
  dataDirectoryIsCloudSynced: boolean;
  backupIsCloudSynced: boolean;
  dataDirectoryIsOutsideRepository: boolean;
  lastMigration: DesktopStorageMigration | null;
}

interface DesktopBackupSaveResult {
  path: string;
  fileName: string;
  bytes: number;
}

interface DesktopMcpConfigurationStatus {
  configPath: string;
  installed: boolean;
  needsRepair: boolean;
  changed?: boolean;
  backupPath?: string | null;
}

interface Window {
  orgChartDesktop?: {
    isDesktop: true;
    platform: string;
    versions: Readonly<{ chrome: string; electron: string }>;
    getStorageSettings(): Promise<DesktopStorageSettings>;
    chooseDataDirectory(): Promise<DesktopStorageSettings>;
    chooseBackupDirectory(): Promise<DesktopStorageSettings>;
    restartForStorageChange(): Promise<boolean>;
    getMcpConfigurationStatus(): Promise<DesktopMcpConfigurationStatus>;
    configureMcp(
      action: "install" | "remove",
    ): Promise<DesktopMcpConfigurationStatus>;
    saveEncryptedBackup(
      fileName: string,
      encryptedJson: string,
    ): Promise<DesktopBackupSaveResult>;
    saveBackup(
      fileName: string,
      backupJson: string,
      encrypted: boolean,
    ): Promise<DesktopBackupSaveResult>;
    reportSaveState(state: "saved" | "saving" | "proposal" | "error"): void;
    requestQuit(): Promise<boolean>;
  };
}
