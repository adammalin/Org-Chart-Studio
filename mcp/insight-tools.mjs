import { z } from "zod";
const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};
const ok = (data) => ({
  structuredContent: data,
  content: [
    {
      type: "text",
      text: "Read local source-linked results. Unresolved evidence remains flagged.",
    },
  ],
});
const fail = (e) => ({
  isError: true,
  content: [
    {
      type: "text",
      text: (e instanceof Error ? e.message : "The request failed.").slice(
        0,
        700,
      ),
    },
  ],
});
export function registerInsightTools(server, client) {
  server.registerTool(
    "check_chart_consistency",
    {
      title: "Check related chart records and disagreements",
      description:
        "Compare a selected chart with related organization appearances in enabled charts. Names are candidate identities, not proof of equivalence. Returns assignment, role and reporting disagreements with source references; no chart is changed.",
      inputSchema: { chartId: z.string().min(1) },
      annotations,
    },
    async ({ chartId }) => {
      try {
        await client.authorizeTool({
          toolName: "check_chart_consistency",
          chartId,
          mode: "read",
        });
        const { control } = await client.request("/api/mcp-control");
        const q = new URLSearchParams({ chartId });
        if (control.chartScope === "selected")
          for (const id of control.allowedChartIds) q.append("scopeId", id);
        return ok(await client.request("/api/consistency?" + q));
      } catch (e) {
        return fail(e);
      }
    },
  );
  server.registerTool(
    "get_monthly_update_status",
    {
      title: "Read monthly progress and remaining review work",
      description:
        "Read saved progress, pending proposal summaries, source coverage and remaining questions for a monthly batch. Requires every included chart to be enabled by the local scope. This does not apply proposals or designate Current.",
      inputSchema: { batchId: z.string().optional() },
      annotations,
    },
    async ({ batchId }) => {
      try {
        await client.authorizeTool({
          toolName: "get_monthly_update_status",
          mode: "read",
        });
        const { control } = await client.request("/api/mcp-control");
        const data = await client.request(
          "/api/monthly-workspace" +
            (batchId ? "?batchId=" + encodeURIComponent(batchId) : ""),
        );
        if (data.report) {
          for (const chartId of data.report.batch.chartIds)
            await client.authorizeTool({
              toolName: "get_monthly_update_status",
              chartId,
              mode: "read",
            });
          if (control.chartScope === "selected") {
            const ids = new Set(control.allowedChartIds);
            data.report.issues = data.report.issues.filter((i) =>
              i.appearances.every((a) => ids.has(a.chartId)),
            );
            data.report.outsideCharts = data.report.outsideCharts.filter((c) =>
              ids.has(c.id),
            );
          }
        }
        data.batches = data.batches.filter(
          (b) =>
            control.chartScope === "all" ||
            b.chartIds.every((id) => control.allowedChartIds.includes(id)),
        );
        return ok(data);
      } catch (e) {
        return fail(e);
      }
    },
  );
  server.registerTool(
    "answer_saved_history",
    {
      title: "Answer a dated question from saved chart evidence",
      description:
        "Answer who held a role or what changed in one selected chart using immutable checkpoints. Supports questions such as Who led this division in October 2026? and What changed since 2026-10-01? Recorded dates are distinct from actual effective dates. Returns evidence IDs, unresolved notes and coverage gaps; does not invent earlier history.",
      inputSchema: {
        chartId: z.string().min(1),
        question: z.string().min(3).max(500),
        referenceDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        includeArchived: z.boolean().default(false),
      },
      annotations,
    },
    async (args) => {
      try {
        await client.authorizeTool({
          toolName: "answer_saved_history",
          chartId: args.chartId,
          mode: "read",
        });
        return ok(
          await client.request("/api/history/answers", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...args, scopeIds: [args.chartId] }),
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );
}
