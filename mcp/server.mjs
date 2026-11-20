import { registerEditHistoryTools } from "./edit-history-tools.mjs";
import { registerSupplementTools } from "./supplement-tools.mjs";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { registerInsightTools } from "./insight-tools.mjs";
import { registerHistoryTools } from "./history-tools.mjs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools, runWithWriteActivity } from "./core-tools.mjs";
import {
  OrgChartAppClient,
} from "./orgchart-app-client.mjs";

const SERVER_NAME = "orgchart-studio-local";
const SERVER_VERSION = "0.1.0";

export function createOrgChartMcpServer(options = {}) {
  const client = options.client ?? new OrgChartAppClient();
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "OrgChart Studio data is local and user-controlled. Respect the app's MCP pause, selected-chart scope, and retained-source extraction toggle. Call list_charts before get_chart or any existing-chart write. Only read a complete chart or extracted retained source when the user identifies it and understands that returned content enters the AI conversation. Raw retained files are never returned. For new legacy charts, list pending source intakes when relevant, extract only while that control is enabled, validate normalized data, and prefer stage_normalized_import so a person reviews it in the app before creation. When a source card names a person and role, map them to assignmentLabel and positionTitle rather than a vacant unit. Treat adjacent shaded strips, portfolios, coverage areas, specialties, and service lists as descriptive content unless an explicit connector or source statement establishes a separate reporting unit. A shared line across staff cards indicates siblings, not a chain. Keep card and reporting-line provenance separate. For an existing source audit, call extract_chart_sources, preserve the returned checksums, and use stage_source_recheck; it creates a private rollback package and permits only review-queued semantic corrections while preserving layout and reporting endpoints. For monthly changes, use begin_monthly_update to preserve all previous states and capture the change list, then stage reviewed changes and complete_monthly_update after review. Applied changes automatically preserve before/after checkpoints and durable per-chart edit history. For an explicitly requested undo or redo, call list_edit_history and preview_edit_operation, then use the exact operation ID, history revision and saved chart guard with undo_chart_edit or redo_chart_edit. Reuse the same requestId after an uncertain response. To reverse an earlier operation while preserving later changes, stage_history_revert prepares a normal review proposal and blocks conflicts; it does not Apply or mark Current. Before any other existing-chart write, read the current chart and preserve its id, version, updatedAt, layout, pins, and sources. Never invent reporting relationships or source facts. Do not delete charts, restore backups, download raw source files, or change storage settings; this server exposes no such tools.",
    },
  );
  registerTools(server, client);
  registerHistoryTools(server, client);
  registerEditHistoryTools(server, client);
  registerInsightTools(server, client);
  registerSupplementTools(server, client, runWithWriteActivity);
  return server;
}

async function main() {
  const server = createOrgChartMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function isCommandLineEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return (
      fs.realpathSync(fileURLToPath(import.meta.url)) ===
      fs.realpathSync(process.argv[1])
    );
  } catch {
    return false;
  }
}

if (isCommandLineEntryPoint()) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "OrgChart Studio MCP could not start.",
    );
    process.exitCode = 1;
  });
}
