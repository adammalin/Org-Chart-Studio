export type McpActivityPhase = "idle" | "working" | "succeeded" | "failed";
export type McpActivityCompletionKind = "saved" | "review_ready";

export interface McpActivitySnapshot {
  revision: number;
  phase: McpActivityPhase;
  activityId: string | null;
  operation: string | null;
  label: string | null;
  chartId: string | null;
  chartName: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string | null;
  activeCount: number;
  message: string | null;
  completionKind: McpActivityCompletionKind | null;
  proposalId: string | null;
}

export interface McpActivityResponse {
  activity: McpActivitySnapshot;
}

export const IDLE_MCP_ACTIVITY: McpActivitySnapshot = {
  revision: 0,
  phase: "idle",
  activityId: null,
  operation: null,
  label: null,
  chartId: null,
  chartName: null,
  startedAt: null,
  finishedAt: null,
  expiresAt: null,
  activeCount: 0,
  message: null,
  completionKind: null,
  proposalId: null,
};
