import { z } from "zod";
const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};
const ok = (data, text) => ({
  structuredContent: data,
  content: [{ type: "text", text }],
});
const failed = (error) => ({
  isError: true,
  content: [
    {
      type: "text",
      text: (error instanceof Error
        ? error.message
        : "History request failed."
      ).slice(0, 700),
    },
  ],
});
export function registerHistoryTools(server, client) {
  server.registerTool(
    "search_library",
    {
      title: "Search organizations, people and roles",
      description:
        "Search the current local library across organization names, abbreviations, people and position titles. Historical states are available through list_history and get_history_checkpoint.",
      inputSchema: {
        query: z.string().min(1).max(200),
        includeArchived: z.boolean().default(false),
      },
      annotations,
    },
    async ({ query, includeArchived }) => {
      try {
        await client.authorizeTool({
          toolName: "search_library",
          mode: "read",
        });
        const { control } = await client.request("/api/mcp-control");
        const { charts } = await client.listCharts();
        const allowed = charts.filter(
          (c) =>
            (control.chartScope === "all" ||
              control.allowedChartIds.includes(c.id)) &&
            (includeArchived || c.status !== "archived"),
        );
        const q = query.toLowerCase(),
          matches = [];
        for (const c of allowed) {
          for (const n of c.nodes) {
            const u = n.data.unit;
            if (
              [
                c.name,
                u.name,
                u.shortName,
                u.assignmentLabel,
                u.positionTitle,
              ].some((v) => (v || "").toLowerCase().includes(q))
            )
              matches.push({
                chartId: c.id,
                chartName: c.name,
                status: c.status,
                nodeId: n.id,
                organization: u.name,
                person: u.assignmentLabel,
                role: u.positionTitle,
              });
          }
        }
        return ok(
          { matches: matches.slice(0, 500), total: matches.length },
          `Found ${matches.length} matching records.`,
        );
      } catch (e) {
        return failed(e);
      }
    },
  );
  server.registerTool(
    "list_history",
    {
      title: "List dated chart checkpoints",
      description:
        "List immutable historical checkpoint summaries for a selected chart, optionally filtered by month or text. Dates are recorded dates, not inferred appointment dates.",
      inputSchema: {
        chartId: z.string().min(1),
        month: z
          .string()
          .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
          .optional(),
        query: z.string().max(200).optional(),
      },
      annotations,
    },
    async ({ chartId, month, query }) => {
      try {
        await client.authorizeTool({
          toolName: "list_history",
          chartId,
          mode: "read",
        });
        const params = new URLSearchParams({
          chartId,
          month: month || "",
          q: query || "",
        });
        const d = await client.request("/api/history?" + params);
        return ok(
          { checkpoints: d.checkpoints, months: d.months, limit: d.limit },
          `Found ${d.checkpoints.length} checkpoints.`,
        );
      } catch (e) {
        return failed(e);
      }
    },
  );
  server.registerTool(
    "get_history_checkpoint",
    {
      title: "Read a historical chart state",
      description:
        "Read one complete dated chart checkpoint. Returned people, roles, source metadata and reporting lines enter the AI conversation. The supplied chartId must match the checkpoint.",
      inputSchema: {
        chartId: z.string().min(1),
        checkpointId: z.string().min(1),
      },
      annotations,
    },
    async ({ chartId, checkpointId }) => {
      try {
        await client.authorizeTool({
          toolName: "get_history_checkpoint",
          chartId,
          mode: "read",
        });
        const d = await client.request(
          "/api/history?checkpointId=" + encodeURIComponent(checkpointId),
        );
        if (d.checkpoint.chartId !== chartId)
          throw Error("The checkpoint belongs to another chart.");
        return ok(
          { checkpoint: d.checkpoint },
          `Read historical checkpoint: ${d.checkpoint.label}.`,
        );
      } catch (e) {
        return failed(e);
      }
    },
  );
  server.registerTool(
    "list_monthly_updates",
    {
      title: "Read monthly update batches and change lists",
      description:
        "Read monthly change lists, completion summaries and batch status. Only batches entirely within the enabled chart scope are returned.",
      inputSchema: {},
      annotations,
    },
    async () => {
      try {
        await client.authorizeTool({
          toolName: "list_monthly_updates",
          mode: "read",
        });
        const [{ control }, d] = await Promise.all([
          client.request("/api/mcp-control"),
          client.request("/api/history"),
        ]);
        const batches = d.batches.filter(
          (b) =>
            control.chartScope === "all" ||
            b.chartIds.every((id) => control.allowedChartIds.includes(id)),
        );
        return ok({ batches }, `Found ${batches.length} monthly updates.`);
      } catch (e) {
        return failed(e);
      }
    },
  );
  server.registerTool(
    "begin_monthly_update",
    {
      title: "Begin a monthly update and preserve previous states",
      description:
        "Start a monthly update batch for explicitly selected active charts. Atomically saves each previous state before changes. Read current charts first; use reviewed proposals for changes and complete_monthly_update after decisions are resolved.",
      inputSchema: {
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        label: z.string().min(1).max(160),
        changeList: z.string().min(1).max(20000),
        chartIds: z.array(z.string().min(1)).min(1).max(200),
        effectiveDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      },
      annotations: { ...annotations, readOnlyHint: false },
    },
    async (args) => {
      try {
        for (const chartId of args.chartIds)
          await client.authorizeTool({
            toolName: "begin_monthly_update",
            chartId,
            mode: "write",
          });
        const d = await client.request("/api/history", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "begin", ...args }),
        });
        return ok(d, `Started ${d.batch.label}; previous states preserved.`);
      } catch (e) {
        return failed(e);
      }
    },
  );
  server.registerTool(
    "complete_monthly_update",
    {
      title: "Save the completed monthly checkpoint",
      description:
        "Complete an open monthly batch after pending proposals are reviewed. Saves a dated final state for every included chart, retains the change list and summary, and does not clear source flags or automatically mark charts Current.",
      inputSchema: {
        batchId: z.string().min(1),
        summary: z.string().min(1).max(20000),
      },
      annotations: { ...annotations, readOnlyHint: false },
    },
    async ({ batchId, summary }) => {
      try {
        await client.authorizeTool({
          toolName: "complete_monthly_update",
          mode: "write",
        });
        const d = await client.request("/api/history");
        const batch = d.batches.find((b) => b.id === batchId);
        if (!batch) throw Error("Monthly update not found.");
        for (const chartId of batch.chartIds)
          await client.authorizeTool({
            toolName: "complete_monthly_update",
            chartId,
            mode: "write",
          });
        const result = await client.request("/api/history", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "complete", batchId, summary }),
        });
        return ok(result, `Saved monthly checkpoint: ${result.batch.label}.`);
      } catch (e) {
        return failed(e);
      }
    },
  );
}
