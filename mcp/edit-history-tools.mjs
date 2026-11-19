import { z } from "zod";
export function registerEditHistoryTools(server, client) {
  const base = {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  const call = async (name, chartId, write, fn) => {
    const activityId = crypto.randomUUID();
    let began = false;
    try {
      await client.authorizeTool({
        toolName: name,
        chartId,
        mode: write ? "write" : "read",
      });
      if (write && client.reportMcpActivity) {
        await client
          .reportMcpActivity({
            action: "begin",
            activityId,
            operation: name,
            label: "Recovering saved chart history",
            chartId,
          })
          .catch(() => undefined);
        began = true;
      }
      const d = await fn();
      if (began)
        await client
          .reportMcpActivity({
            action: "complete",
            activityId,
            operation: name,
            label: "Chart history recovery",
            chartId,
            succeeded: true,
            completionKind: d.proposal ? "review_ready" : "saved",
            proposalId: d.proposal?.id,
          })
          .catch(() => undefined);
      return {
        structuredContent: d,
        content: [
          {
            type: "text",
            text: write
              ? "History operation saved. Review the returned receipt and current chart."
              : "Read saved edit history.",
          },
        ],
      };
    } catch (e) {
      if (began)
        await client
          .reportMcpActivity({
            action: "complete",
            activityId,
            operation: name,
            label: "Chart history recovery",
            chartId,
            succeeded: false,
            message:
              e instanceof Error ? e.message.slice(0, 240) : "Recovery failed",
          })
          .catch(() => undefined);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: (e instanceof Error
              ? e.message
              : "History request failed."
            ).slice(0, 700),
          },
        ],
      };
    }
  };
  server.registerTool(
    "list_edit_history",
    {
      title: "Read durable undo/redo history",
      description:
        "List a selected chart's saved user and agent operations, undo/redo targets and revision. Survives chart switching and restart. Call list_charts first; personnel details are returned only when reading an operation preview.",
      inputSchema: {
        chartId: z.string().min(1),
        before: z.number().int().positive().optional(),
      },
      annotations: base,
    },
    ({ chartId, before }) =>
      call("list_edit_history", chartId, false, () =>
        client.request(
          `/api/edit-history?chartId=${encodeURIComponent(chartId)}${before ? `&before=${before}` : ""}`,
        ),
      ),
  );
  server.registerTool(
    "preview_edit_operation",
    {
      title: "Preview one saved edit",
      description:
        "Read field-level before/after differences for one selected chart operation before undo, redo or reviewed revert. Does not change a chart.",
      inputSchema: {
        chartId: z.string().min(1),
        operationId: z.string().min(1),
      },
      annotations: base,
    },
    ({ chartId, operationId }) =>
      call("preview_edit_operation", chartId, false, () =>
        client.request(
          `/api/edit-history?chartId=${encodeURIComponent(chartId)}&operationId=${encodeURIComponent(operationId)}`,
        ),
      ),
  );
  for (const action of ["undo", "redo"])
    server.registerTool(
      `${action}_chart_edit`,
      {
        title: `${action === "undo" ? "Undo" : "Redo"} a saved chart edit`,
        description: `${action === "undo" ? "Undo" : "Redo"} exactly the next saved operation only when the user explicitly requests it. List/preview history first. Requires the exact operation, history revision and saved chart guard. Atomically records a recovery receipt and checkpoints; duplicate request IDs are safe. Never grants Current approval or deletes source checks. Pending AI proposals block replay. Use a stable requestId when retrying an uncertain response.`,
        inputSchema: {
          chartId: z.string().min(1),
          operationId: z.string().min(1),
          expectedRevision: z.string().min(1),
          expectedVersion: z.number().int().positive(),
          expectedUpdatedAt: z.string().min(1),
          requestId: z.string().regex(/^history-request-[a-zA-Z0-9-]{1,100}$/),
        },
        annotations: { ...base, readOnlyHint: false },
      },
      (args) =>
        call(`${action}_chart_edit`, args.chartId, true, () =>
          client.request("/api/edit-history", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-orgchart-actor": "agent",
            },
            body: JSON.stringify({ ...args, action }),
          }),
        ),
    );
  server.registerTool(
    "stage_history_revert",
    {
      title: "Propose reverting an earlier operation",
      description:
        "Prepare a reviewed inverse of one applied operation, preserving nonconflicting later edits. Conflicting later changes block the whole revert. Uses the normal proposal queue; does not Apply or mark Current. Requires a user-requested operation and a current history revision from list_edit_history. Read the resulting field differences with the user.",
      inputSchema: {
        chartId: z.string().min(1),
        operationId: z.string().min(1),
        expectedRevision: z.string().min(1),
      },
      annotations: { ...base, readOnlyHint: false },
    },
    (args) =>
      call("stage_history_revert", args.chartId, true, async () => {
        const d = await client.request(
          `/api/edit-history?chartId=${encodeURIComponent(args.chartId)}&operationId=${encodeURIComponent(args.operationId)}&previewRevert=1`,
        );
        if (d.revision !== args.expectedRevision)
          throw Error(
            "History changed. Read and preview the current history before reverting.",
          );
        return client.request("/api/ai-proposals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "stage",
            chart: d.proposed,
            changeSummary: `Revert saved operation: ${d.operation.label}`,
          }),
        });
      }),
  );
}
