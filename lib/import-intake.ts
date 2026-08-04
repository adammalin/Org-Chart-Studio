export type ImportIntakeStatus = "pending" | "imported";

export interface ImportIntakeFile {
  id: string;
  intakeId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  checksum: string;
  storageKey: string;
  createdAt: string;
}

export interface ImportIntake {
  id: string;
  name: string;
  status: ImportIntakeStatus;
  createdAt: string;
  updatedAt: string;
  chartId: string | null;
  files: ImportIntakeFile[];
}

export interface ImportIntakesResponse {
  intakes: ImportIntake[];
}
