import { z } from "zod";
import { validateSourceRecheckProposal } from "./source-recheck.mjs";
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
    supportPanelCount: chart.supportPanels?.length ?? 0,
    supportAssignmentCount: (chart.supportPanels ?? []).reduce(
      (n, p) => n + p.entries.length,
      0,
    ),
    sourceCheckCount: chart.sourceChecks?.length ?? 0,
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
    error instanceof Error
        ? error.message
        : "OrgChart Studio could not complete the tool request.";
  return {
    isError: true,
    content: [{ type: "text", text: message.slice(0, 700) }],
  };
}

export async function runWithWriteActivity(client, details, operation) {
  await client.authorizeTool({
    toolName: details.operation,
    chartId: details.chartId,
    mode: "write",
    sourceAccess: details.sourceAccess === true,
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
        chartName:
          result?.chart?.name ?? proposal?.chartName ?? details.chartName,
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

export function registerTools(server, client) {
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
        await client.authorizeTool({
          toolName: "get_chart",
          chartId,
          mode: "read",
        });
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
        await client.authorizeTool({
          toolName: "validate_chart",
          chartId,
          mode: "read",
        });
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
        await client.authorizeTool({
          toolName: "list_chart_versions",
          chartId,
          mode: "read",
        });
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
        "Validate AI- or human-normalized CSV or JSON with the app's import pipeline without creating a chart. Use this before import_normalized_chart. Before validation, split visible person-and-role cards into assignmentLabel and positionTitle, and do not turn adjacent portfolio, coverage, specialty, or service labels into vacant child units unless the source explicitly establishes that hierarchy.",
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
        await client.authorizeTool({
          toolName: "validate_normalized_import",
          mode: "read",
        });
        const result = await client.importNormalized({
          ...input,
          validateOnly: true,
        });
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
        await client.authorizeTool({
          toolName: "list_import_intakes",
          mode: "read",
        });
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
    "extract_import_intake",
    {
      title: "Extract one retained source intake",
      description:
        "Read a pending local source intake through OrgChart Studio's bounded extractor. This requires retained-source extraction to be enabled in Local AI control for the current app session. Only extracted text, spreadsheet cells, PowerPoint shape geometry, connector metadata, checksums, and warnings enter the AI conversation; raw file bytes are never returned. Use the intake ID when staging its normalized import, and preserve precise extracted locators in card and reporting-line provenance.",
      inputSchema: { intakeId: z.string().min(1).max(200) },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ intakeId }) => {
      try {
        await client.authorizeTool({
          toolName: "extract_import_intake",
          mode: "read",
          sourceAccess: true,
        });
        const extraction = await client.extractImportIntake(intakeId);
        return success(
          extraction,
          `Extracted ${extraction.extractions.length} retained source file${extraction.extractions.length === 1 ? "" : "s"} from ${extraction.name}. The extracted content has entered this AI conversation; raw files did not.`,
        );
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "extract_chart_sources",
    {
      title: "Extract retained sources for one chart",
      description:
        "Read the retained local source files linked to one existing chart through OrgChart Studio's bounded extractor. Call list_charts and get_chart first, and use only when the user explicitly asks to recheck that chart. This requires retained-source extraction to be enabled in Local AI control for the current session. Raw files are never returned.",
      inputSchema: { chartId: z.string().min(1).max(200) },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ chartId }) => {
      try {
        await client.authorizeTool({
          toolName: "extract_chart_sources",
          chartId,
          mode: "read",
          sourceAccess: true,
        });
        const extraction = await client.extractChartSources(chartId);
        return success(
          extraction,
          `Extracted ${extraction.extractions.length} retained source file${extraction.extractions.length === 1 ? "" : "s"} for ${extraction.name}. The extracted content has entered this AI conversation; raw files did not.`,
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
        "Preferred AI import path. Stage validated normalized CSV or JSON as a durable new-chart proposal for field, source, uncertainty, and quality review inside OrgChart Studio. Nothing is added to the chart library until a person chooses Create chart. Optionally associate a pending source intake so its original files remain local evidence. Staff cards that visibly name a person are filled or acting assignments when the source supports that; nearby portfolio and coverage labels are not vacant seats or child reporting units without explicit evidence.",
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
        "Stage a complete ChartDocument for field-by-field human review in OrgChart Studio. The saved chart is not changed until a person applies the proposal. The chart ID, version, and updatedAt must still match, so stale proposals are rejected. Use unit.reportingPlacement standalone for a source card with no stated primary parent, and relationshipType source connection — authority unspecified for an evidenced connection whose supervisory meaning is not established. Preserve source locators and explanatory notes; do not invent supervision to satisfy validation. Use changeSummary only to restate the human-supplied reason for the change; never infer one.",
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
    "stage_source_recheck",
    {
      title: "Stage a retained-source recheck",
      description:
        "Stage source-backed corrections to an existing chart after extract_chart_sources. This requires retained-source extraction to be enabled. It first writes a private, selected-chart rollback backup in the active runtime, then stages a human-review proposal. It cannot add or remove cards, rewire relationships, change layout or pins, or silently confirm edits: every changed card or line must include a source locator, actionable review note, and sourceCertainty needs_review. The saved chart remains unchanged until a person applies the proposal.",
      inputSchema: {
        chart: z.record(z.string(), z.unknown()),
        reviewedSourceChecksums: z
          .array(z.string().min(16).max(128))
          .min(1)
          .max(100),
        changeSummary: z.string().min(3).max(500),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ chart, reviewedSourceChecksums, changeSummary }) => {
      try {
        const result = await runWithWriteActivity(
          client,
          {
            operation: "stage_source_recheck",
            label: changeSummary,
            chartId: chart.id,
            chartName: chart.name,
            sourceAccess: true,
          },
          async () => {
            const { charts } = await client.listCharts();
            const current = charts.find(
              (candidate) => candidate.id === chart.id,
            );
            if (!current) throw new Error("The requested chart was not found.");
            const validation = validateSourceRecheckProposal({
              current,
              proposed: chart,
              reviewedSourceChecksums,
            });
            const backupPackage = await client.createBackup([current.id]);
            const backup = await client.writeSourceRecheckBackup(backupPackage,current.id);
            try {
              const staged = await client.stageChartProposal(
                chart,
                changeSummary,
              );
              return { ...staged, backup, sourceReview: validation };
            } catch (error) {
              throw new Error(
                `A private rollback backup was saved to ${backup.path}, but the source-review proposal could not be staged: ${error instanceof Error ? error.message : "unknown error"}`,
              );
            }
          },
        );
        return success(
          result,
          `Created private rollback backup ${result.backup.fileName} and staged ${result.proposal.summary.total} source-backed change${result.proposal.summary.total === 1 ? "" : "s"} for human review. The saved chart has not changed.`,
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
