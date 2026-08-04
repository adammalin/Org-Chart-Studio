export type McpChartScope = "all" | "selected";

export interface McpAccessEvent {
  id: string;
  toolName: string;
  chartId: string | null;
  mode: "read" | "write";
  allowed: boolean;
  createdAt: string;
  message: string;
}

export interface McpControlState {
  paused: boolean;
  chartScope: McpChartScope;
  allowedChartIds: string[];
  revision: number;
  events: McpAccessEvent[];
}

export interface McpControlResponse {
  control: McpControlState;
}
