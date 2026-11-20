import { z } from "zod";
export function registerSupplementTools(
  server,
  client,
  withActivity = async (_client, _details, operation) => operation(),
) {
  const ok = (data) => ({
      structuredContent: data,
      content: [
        {
          type: "text",
          text: "Source-check evidence saved separately from human approval and Current designation.",
        },
      ],
    }),
    fail = (e) => ({
      isError: true,
      content: [{ type: "text", text: String(e?.message ?? e).slice(0, 700) }],
    });
  server.registerTool(
    "get_source_checks",
    {
      title: "Read dated source comparisons",
      description:
        "Read one selected chart’s structured AI and human source checks, whether they still match its content, and support-panel review counts. Call list_charts first. This does not retrieve a website or approve the chart.",
      inputSchema: { chartId: z.string().min(1) },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ chartId }) => {
      try {
        await client.authorizeTool({
          toolName: "get_source_checks",
          chartId,
          mode: "read",
        });
        return ok(
          await client.request(
            "/api/charts?resource=source_checks&chartId=" +
              encodeURIComponent(chartId),
          ),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );
  server.registerTool(
    "record_source_check",
    {
      title: "Record an AI source comparison",
      description:
        "After reading a selected chart and actually comparing the authorized source, record an immutable AI comparison with source URL, locator, result, scope, findings and optional source revision. Requires current version and updatedAt. Fingerprints the compared saved content; later content edits make it stale. Does not clear review flags, approve human review, change chart content or mark Current. Use differences for omitted support panels. Web retrieval is a separate step.",
      inputSchema: {
        chartId: z.string().min(1),
        expectedVersion: z.number().int().positive(),
        expectedUpdatedAt: z.string().min(1),
        checkedBy: z.string().min(1).max(160),
        sourceUrl: z.string().url().max(2000),
        sourceLocator: z.string().min(1).max(2000),
        sourceRevision: z.string().max(300).optional(),
        result: z.enum(["matches", "differences", "unavailable"]),
        scope: z.enum(["full_chart", "hierarchy_only"]),
        findings: z.string().min(1).max(5000),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        await client.authorizeTool({
          toolName: "record_source_check",
          chartId: input.chartId,
          mode: "write",
        });
        const { chartId, expectedVersion, expectedUpdatedAt, ...data } = input;
        return ok(
          await withActivity(
            client,
            {
              operation: "record_source_check",
              chartId,
              label: "Recording source comparison",
            },
            () =>
              client.postJson({
                action: "record_source_check",
                chartId,
                expectedVersion,
                expectedUpdatedAt,
                sourceCheck: {
                  ...data,
                  sourceRevision: data.sourceRevision ?? "",
                  reviewerType: "ai",
                },
              }),
          ),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );
}
