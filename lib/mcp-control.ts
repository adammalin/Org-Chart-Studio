export type McpChartScope = "all" | "selected";

export interface McpAccessEvent {
  id: string;
  toolName: string;
  chartId: string | null;
  mode: "read" | "write";
  sourceAccess: boolean;
  allowed: boolean;
  createdAt: string;
  message: string;
}

export interface McpControlState {
  paused: boolean;
  chartScope: McpChartScope;
  allowedChartIds: string[];
  sourceAccessEnabled: boolean;
  revision: number;
  events: McpAccessEvent[];
}

export interface McpControlResponse {
  control: McpControlState;
}
