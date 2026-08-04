import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  OrgChartAppClient,
  OrgChartAppUnavailableError,
} from "./orgchart-app-client.mjs";

const SERVER_NAME = "orgchart-studio-local";
const SERVER_VERSION = "0.1.0";

function chartSummary(chart) {
  return {
    id: chart.id,
    name: chart.name,
    description: chart.description,
    status: chart.status,
    version: chart.version,
    updatedAt: chart.updatedAt,
    unitCount: Array.isArray(chart.nodes) ? chart.nodes.length : 0,
    relationshipCount: Array.isArray(chart.edges) ? chart.edges.length : 0,
    sourceCount: Array.isArray(chart.sources) ? chart.sources.length : 0,
  };
}

function success(structuredContent, message) {
  return {
    structuredContent,
    content: [{ type: "text", text: message }],
  };
}

function toolFailure(error) {
  const message =
    error instanceof OrgChartAppUnavailableError
      ? error.message
      : error instanceof Error
        ? error.message
        : "OrgChart Studio could not complete the tool request.";
  return {
    isError: true,
    content: [{ type: "text", text: message.slice(0, 700) }],
  };
}

async function runWithWriteActivity(client, details, operation) {
  await client.authorizeTool({
    toolName: details.operation,
    chartId: details.chartId,
    mode: "write",
  });
  const activityId = crypto.randomUUID();
  await client
    .reportMcpActivity({
      action: "begin",
      activityId,
      operation: details.operation,
      label: details.label,
      chartId: details.chartId,
      chartName: details.chartName,
    })
    .catch(() => undefined);
  try {
    const result = await operation();
    const proposal = result?.proposal;
    await client
      .reportMcpActivity({
        action: "complete",
        activityId,
        operation: details.operation,
        label: details.label,
        chartId: result?.chart?.id ?? proposal?.chartId ?? details.chartId,
        chartName: result?.chart?.name ?? proposal?.chartName ?? details.chartName,
        succeeded: true,
        completionKind: proposal ? "review_ready" : "saved",
        proposalId: proposal?.id,
      })
      .catch(() => undefined);
    return result;
  } catch (error) {
    await client
      .reportMcpActivity({
        action: "complete",
        activityId,
        operation: details.operation,
        label: details.label,
        chartId: details.chartId,
        chartName: details.chartName,
        succeeded: false,
        message:
          error instanceof Error
            ? error.message.slice(0, 240)
            : "The local chart update did not complete.",
      })
      .catch(() => undefined);
    throw error;
  }
}

function registerTools(server, client) {
  server.registerTool(
    "list_charts",
    {
      title: "List local org charts",
      description:
        "List chart summaries in the running local OrgChart Studio library. Use this before requesting or changing a chart so you have its stable ID and current version.",
      inputSchema: {
        includeArchived: z.boolean().optional().default(false),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ includeArchived }) => {
      try {
        await client.authorizeTool({ toolName: "list_charts", mode: "read" });
        const { charts } = await client.listCharts();
        const summaries = charts
          .filter((chart) => includeArchived || chart.status !== "archived")
          .map(chartSummary);
        return success(
          { charts: summaries },
          `Found ${summaries.length} local organizational chart${summaries.length === 1 ? "" : "s"}.`,
        );
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "get_chart",
    {
      title: "Read a local org chart",
      description:
        "Read one complete working chart by stable ID, including its nodes, relationships, layout, saved connector pins, and source metadata. Only call this when the user has asked to work with that chart because returned data enters the AI conversation.",
      inputSchema: { chartId: z.string().min(1).max(200) },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ chartId }) => {
      try {
        await client.authorizeTool({ toolName: "get_chart", chartId, mode: "read" });
        const { charts } = await client.listCharts();
        const chart = charts.find((candidate) => candidate.id === chartId);
        if (!chart) throw new Error("The requested chart was not found.");
        return success(
          { chart },
          `Loaded ${chart.name}, version ${chart.version}, with ${chart.nodes.length} units and ${chart.edges.length} relationships.`,
        );
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "validate_chart",
    {
      title: "Validate a local org chart",
      description:
        "Run OrgChart Studio's authoritative hierarchy validation on the current saved working chart without changing it.",
      inputSchema: { chartId: z.string().min(1).max(200) },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ chartId }) => {
      try {
        await client.authorizeTool({ toolName: "validate_chart", chartId, mode: "read" });
        const result = await client.validateChart(chartId);
        return success(
          result,
          result.valid
            ? `Chart ${chartId} passed structural validation.`
            : `Chart ${chartId} has ${result.findings.length} validation finding${result.findings.length === 1 ? "" : "s"}.`,
        );
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "list_chart_versions",
    {
      title: "List saved chart versions",
      description:
        "List the immutable saved versions of one local chart before comparing, updating, or creating a new version.",
      inputSchema: { chartId: z.string().min(1).max(200) },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ chartId }) => {
      try {
        await client.authorizeTool({ toolName: "list_chart_versions", chartId, mode: "read" });
        const { versions } = await client.listVersions(chartId);
        const summaries = versions.map((version) => ({
          id: version.id,
          chartId: version.chartId,
          version: version.version,
          label: version.label,
          createdAt: version.createdAt,
          restoredFromVersion: version.restoredFromVersion,
        }));
        return success(
          { versions: summaries },
          `Found ${summaries.length} saved version${summaries.length === 1 ? "" : "s"}.`,
        );
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "validate_normalized_import",
    {
      title: "Validate normalized chart data",
      description:
        "Validate AI- or human-normalized CSV or JSON with the app's import pipeline without creating a chart. Use this before import_normalized_chart.",
      inputSchema: {
        chartName: z.string().min(1).max(160),
        format: z.enum(["csv", "json"]),
        contents: z.string().min(1).max(4_500_000),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        await client.authorizeTool({ toolName: "validate_normalized_import", mode: "read" });
        const result = await client.importNormalized({ ...input, validateOnly: true });
        return success(
          result,
          `Validated ${result.preview.rowCount} normalized rows without creating a chart.`,
        );
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "list_import_intakes",
    {
      title: "List pending source intakes",
      description:
        "List local pending source-evidence intakes by name and file metadata. File bytes are not returned. Use an intake ID when staging normalized data so the reviewed chart retains the originals locally.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        await client.authorizeTool({ toolName: "list_import_intakes", mode: "read" });
        const { intakes } = await client.listImportIntakes();
        const pending = intakes
          .filter((intake) => intake.status === "pending")
          .map((intake) => ({
            id: intake.id,
            name: intake.name,
            createdAt: intake.createdAt,
            files: intake.files.map((file) => ({
              fileName: file.fileName,
              contentType: file.contentType,
              fileSize: file.fileSize,
              checksum: file.checksum,
            })),
          }));
        return success(
          { intakes: pending },
          `Found ${pending.length} pending source intake${pending.length === 1 ? "" : "s"}.`,
        );
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "create_chart_draft",
    {
      title: "Create a blank chart draft",
      description:
        "Create a new blank local chart draft. This changes the local library and should be used only after the user approves the chart name.",
      inputSchema: { name: z.string().min(1).max(160) },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ name }) => {
      try {
        const result = await runWithWriteActivity(
          client,
          {
            operation: "create_chart_draft",
            label: "Creating chart draft",
            chartName: name,
          },
          () => client.postJson({ action: "create", name }),
        );
        return success(
          { chart: result.chart },
          `Created the local draft ${result.chart.name}.`,
        );
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "import_normalized_chart",
    {
      title: "Import a normalized chart draft",
      description:
        "Create a new local chart from normalized CSV or JSON after validate_normalized_import succeeds and the user approves creation. This never overwrites an existing chart.",
      inputSchema: {
        chartName: z.string().min(1).max(160),
        format: z.enum(["csv", "json"]),
        contents: z.string().min(1).max(4_500_000),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const result = await runWithWriteActivity(
          client,
          {
            operation: "import_normalized_chart",
            label: "Importing normalized chart",
            chartName: input.chartName,
          },
          () => client.importNormalized({ ...input, validateOnly: false }),
        );
        return success(
          { chart: result.chart, findings: result.findings },
          `Imported ${result.chart.name} as a new local draft with ${result.chart.nodes.length} units.`,
        );
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "stage_normalized_import",
    {
      title: "Stage a normalized chart import",
      description:
        "Preferred AI import path. Stage validated normalized CSV or JSON as a temporary new-chart proposal for field, source, uncertainty, and quality review inside OrgChart Studio. Nothing is added to the chart library until a person chooses Create chart. Optionally associate a pending source intake so its original files remain local evidence.",
      inputSchema: {
        chartName: z.string().min(1).max(160),
        format: z.enum(["csv", "json"]),
        contents: z.string().min(1).max(4_500_000),
        intakeId: z.string().min(1).max(200).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const result = await runWithWriteActivity(
          client,
          {
            operation: "stage_normalized_import",
            label: "Preparing chart import for review",
            chartName: input.chartName,
          },
          () => client.stageImportProposal(input),
        );
        return success(
          { proposal: result.proposal },
          `Staged ${result.proposal.proposed.nodes.length} units for in-app import review. No chart has been created.`,
        );
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "replace_chart_draft",
    {
      title: "Propose changes to a working chart",
      description:
        "Stage a complete ChartDocument for field-by-field human review in OrgChart Studio. The saved chart is not changed until a person applies the proposal. The chart ID, version, and updatedAt must still match, so stale proposals are rejected. Use changeSummary only to restate the human-supplied reason for the change; never infer one.",
      inputSchema: {
        chart: z.record(z.string(), z.unknown()),
        changeSummary: z.string().min(3).max(500).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ chart, changeSummary }) => {
      try {
        const result = await runWithWriteActivity(
          client,
          {
            operation: "replace_chart_draft",
            label: changeSummary || "Preparing chart changes for review",
            chartId: chart.id,
            chartName: chart.name,
          },
          () => client.stageChartProposal(chart, changeSummary),
        );
        return success(
          { proposal: result.proposal },
          `Staged ${result.proposal.summary.total} proposed change${result.proposal.summary.total === 1 ? "" : "s"} for human review in OrgChart Studio. The saved chart has not changed.`,
        );
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "save_chart_version",
    {
      title: "Save an immutable chart version",
      description:
        "Save the current matching working chart as a new immutable local version with a human-readable change summary. This does not apply fields from the supplied document; it uses the ID, version, and updatedAt as a stale-write guard.",
      inputSchema: {
        chart: z.record(z.string(), z.unknown()),
        label: z.string().min(3).max(160),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ chart, label }) => {
      try {
        const result = await runWithWriteActivity(
          client,
          {
            operation: "save_chart_version",
            label: "Saving named chart version",
            chartId: chart.id,
            chartName: chart.name,
          },
          () =>
            client.postJson({
              action: "snapshot_current",
              chartId: chart.id,
              expectedVersion: chart.version,
              expectedUpdatedAt: chart.updatedAt,
              label,
            }),
        );
        return success(
          { chart: result.chart, version: result.version },
          `Saved ${result.chart.name} as version ${result.chart.version}: ${label}.`,
        );
      } catch (error) {
        return toolFailure(error);
      }
    },
  );
}

export function createOrgChartMcpServer(options = {}) {
  const client = options.client ?? new OrgChartAppClient();
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "OrgChart Studio data is local and user-controlled. Respect the app's MCP pause and selected-chart scope. Call list_charts before get_chart or any existing-chart write. Only read a complete chart when the user identifies it and understands that returned fields enter the AI conversation. For new legacy charts, list pending source intakes when relevant, validate normalized data, and prefer stage_normalized_import so a person reviews it in the app before creation. Before existing-chart writes, read the current chart and preserve its id, version, and updatedAt. Preserve source locators, certainty labels, review notes, and planned/current state. Never invent reporting relationships or source facts. Do not delete charts, restore backups, download source files, or change storage settings; this server exposes no such tools.",
    },
  );
  registerTools(server, client);
  return server;
}

async function main() {
  const server = createOrgChartMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "OrgChart Studio MCP could not start.",
    );
    process.exitCode = 1;
  });
}
