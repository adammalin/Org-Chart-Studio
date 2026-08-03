import type { ChartDocument, ChartVersion } from "./chart-library";

export const LIBRARY_BACKUP_FORMAT = "orgchart-studio-library-backup" as const;
export const LIBRARY_BACKUP_VERSION = 2 as const;
export const ENCRYPTED_BACKUP_FORMAT = "orgchart-studio-encrypted-backup" as const;
export const ENCRYPTED_BACKUP_VERSION = 1 as const;

export type LibraryBackupScope = "all" | "selected";

export interface BackupSelection {
  scope: LibraryBackupScope;
  chartIds: string[];
  missingChartIds: string[];
}

export interface BackupSourceFile {
  sourceId: string;
  fileName: string;
  contentType: string;
  checksum: string;
  dataBase64: string;
}

export interface LibraryBackup {
  format: typeof LIBRARY_BACKUP_FORMAT;
  schemaVersion: 1 | typeof LIBRARY_BACKUP_VERSION;
  scope?: LibraryBackupScope;
  exportedAt: string;
  chartCount: number;
  sourceFileCount: number;
  versionCount?: number;
  charts: ChartDocument[];
  chartVersions?: ChartVersion[];
  sourceFiles: BackupSourceFile[];
}

export function resolveBackupSelection(
  availableChartIds: string[],
  requestedChartIds: string[],
): BackupSelection {
  const availableIds = [...new Set(availableChartIds.map((id) => id.trim()).filter(Boolean))];
  const availableIdSet = new Set(availableIds);
  const requestedIds = [
    ...new Set(requestedChartIds.map((id) => id.trim()).filter(Boolean)),
  ];

  if (!requestedIds.length) {
    return { scope: "all", chartIds: availableIds, missingChartIds: [] };
  }

  return {
    scope: "selected",
    chartIds: requestedIds.filter((id) => availableIdSet.has(id)),
    missingChartIds: requestedIds.filter((id) => !availableIdSet.has(id)),
  };
}

export interface EncryptedLibraryBackup {
  format: typeof ENCRYPTED_BACKUP_FORMAT;
  version: typeof ENCRYPTED_BACKUP_VERSION;
  createdAt: string;
  encryption: {
    cipher: "AES-GCM";
    keyLength: 256;
    kdf: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    saltBase64: string;
    ivBase64: string;
  };
  ciphertextBase64: string;
}

export function isLibraryBackup(value: unknown): value is LibraryBackup {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LibraryBackup>;
  return (
    candidate.format === LIBRARY_BACKUP_FORMAT &&
    (candidate.schemaVersion === 1 ||
      candidate.schemaVersion === LIBRARY_BACKUP_VERSION) &&
    typeof candidate.exportedAt === "string" &&
    (candidate.scope === undefined ||
      candidate.scope === "all" ||
      candidate.scope === "selected") &&
    Array.isArray(candidate.charts) &&
    Array.isArray(candidate.sourceFiles) &&
    (candidate.schemaVersion === 1 || Array.isArray(candidate.chartVersions))
  );
}

export function isEncryptedLibraryBackup(value: unknown): value is EncryptedLibraryBackup {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EncryptedLibraryBackup>;
  return (
    candidate.format === ENCRYPTED_BACKUP_FORMAT &&
    candidate.version === ENCRYPTED_BACKUP_VERSION &&
    candidate.encryption?.cipher === "AES-GCM" &&
    candidate.encryption?.kdf === "PBKDF2" &&
    candidate.encryption?.hash === "SHA-256" &&
    typeof candidate.encryption?.iterations === "number" &&
    typeof candidate.encryption?.saltBase64 === "string" &&
    typeof candidate.encryption?.ivBase64 === "string" &&
    typeof candidate.ciphertextBase64 === "string"
  );
}
