import assert from "node:assert/strict";
import test from "node:test";
import { GET, POST } from "../app/api/ai-activity/route";
import type { McpActivityResponse } from "../lib/mcp-activity";

function activityRequest(body: Record<string, unknown>) {
  return new Request("http://127.0.0.1/api/ai-activity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("MCP write activity reports working and completed UI states without persistence", async () => {
  const activityId = "activity-synthetic-test";
  const startedResponse = await POST(
    activityRequest({
      action: "begin",
      activityId,
      operation: "replace_chart_draft",
      label: "Updating working draft",
      chartId: "chart-synthetic-test",
      chartName: "Synthetic Test Chart",
    }),
  );
  const started = (await startedResponse.json()) as McpActivityResponse;
  assert.equal(startedResponse.headers.get("cache-control"), "private, no-store");
  assert.equal(started.activity.phase, "working");
  assert.equal(started.activity.activeCount, 1);
  assert.equal(started.activity.chartId, "chart-synthetic-test");

  const polled = (await (await GET()).json()) as McpActivityResponse;
  assert.equal(polled.activity.phase, "working");
  assert.equal(polled.activity.label, "Updating working draft");

  const completed = (await (
    await POST(
      activityRequest({
        action: "complete",
        activityId,
        operation: "replace_chart_draft",
        label: "Updating working draft",
        chartId: "chart-synthetic-test",
        chartName: "Synthetic Test Chart",
        succeeded: true,
        completionKind: "review_ready",
        proposalId: "proposal-synthetic-test",
      }),
    )
  ).json()) as McpActivityResponse;
  assert.equal(completed.activity.phase, "succeeded");
  assert.equal(completed.activity.activeCount, 0);
  assert.ok(completed.activity.finishedAt);
  assert.ok(completed.activity.expiresAt);
  assert.equal(completed.activity.completionKind, "review_ready");
  assert.equal(completed.activity.proposalId, "proposal-synthetic-test");

  const dismissed = (await (
    await POST(activityRequest({ action: "dismiss", activityId }))
  ).json()) as McpActivityResponse;
  assert.equal(dismissed.activity.phase, "idle");
});

test("MCP activity endpoint rejects an incomplete activity signal", async () => {
  const response = await POST(activityRequest({ action: "begin" }));
  assert.equal(response.status, 400);
});

test("MCP activity reports a color-independent failure receipt", async () => {
  const activityId = "activity-synthetic-failure";
  await POST(
    activityRequest({
      action: "begin",
      activityId,
      operation: "save_chart_version",
      label: "Saving named chart version",
    }),
  );
  const failed = (await (
    await POST(
      activityRequest({
        action: "complete",
        activityId,
        operation: "save_chart_version",
        label: "Saving named chart version",
        succeeded: false,
        message: "Synthetic version conflict.",
      }),
    )
  ).json()) as McpActivityResponse;
  assert.equal(failed.activity.phase, "failed");
  assert.equal(failed.activity.message, "Synthetic version conflict.");
});
