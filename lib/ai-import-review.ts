import type { Edge } from "@xyflow/react";
import type { ChartQualityReport } from "./chart-governance";
import type { ChartDocument } from "./chart-library";
import type { OrgFlowNode, ValidationFinding } from "./org-chart";

export interface AiImportProposal {
  id: string;
  chartName: string;
  operation: "stage_normalized_import";
  status: "pending";
  createdAt: string;
  expiresAt: string;
  format: "csv" | "json";
  intakeId: string | null;
  intakeName: string | null;
  evidenceFileNames: string[];
  proposed: {
    nodes: OrgFlowNode[];
    edges: Edge[];
  };
  findings: ValidationFinding[];
  quality: ChartQualityReport;
}

export interface AiImportProposalResponse {
  proposal?: AiImportProposal;
  chart?: ChartDocument;
  rejected?: string;
  error?: string;
}
