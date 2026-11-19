import type {WorkspaceContinuity} from "./workspace-continuity";
import { isLibraryBackup, type LibraryBackup } from './backup-format';
import type { AiChartProposal } from './ai-change-review';
export interface WorkspacePackage {
  format: 'orgchart-studio-workspace'; schemaVersion: 1;
  workspace: { id: string; revision: number };
  library: LibraryBackup;
  pendingProposals: AiChartProposal[];
  continuity?:WorkspaceContinuity;
}
export function isWorkspacePackage(value: unknown): value is WorkspacePackage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<WorkspacePackage>;
  return v.format === 'orgchart-studio-workspace' && v.schemaVersion === 1 &&
    !!v.workspace && typeof v.workspace.id === 'string' && /^workspace-[a-zA-Z0-9-]{1,160}$/.test(v.workspace.id) &&
    Number.isSafeInteger(v.workspace.revision) && v.workspace.revision >= 0 && isLibraryBackup(v.library) &&
    Array.isArray(v.pendingProposals) && v.pendingProposals.length <= 200;
}
export type PortableDocument = LibraryBackup | WorkspacePackage;
export const isPortableDocument = (value: unknown): value is PortableDocument => isLibraryBackup(value) || isWorkspacePackage(value);
