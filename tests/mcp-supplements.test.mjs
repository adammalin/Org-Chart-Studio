import test from "node:test";
import assert from "node:assert/strict";
import { registerSupplementTools } from "../mcp/supplement-tools.mjs";
test("source check tools respect selected-chart scope and can only create AI comparison records", async () => {
  const handlers = new Map(),
    requests = [];
  registerSupplementTools(
    {
      registerTool: (name, metadata, handler) =>
        handlers.set(name, { metadata, handler }),
    },
    {
      authorizeTool: async ({ chartId }) => {
        if (chartId !== "allowed") throw Error("Blocked by chart scope");
      },
      request: async (path) => {
        requests.push(path);
        return { checks: [] };
      },
      postJson: async (body) => {
        requests.push(body);
        return { sourceCheck: body.sourceCheck };
      },
    },
  );
  const result = await handlers
    .get("record_source_check")
    .handler({
      chartId: "allowed",
      expectedVersion: 1,
      expectedUpdatedAt: "2026-11-11T12:00:00Z",
      checkedBy: "Synthetic agent",
      sourceUrl: "https://example.invalid/chart",
      sourceLocator: "Synthetic slide 1",
      scope: "full_chart",
      result: "differences",
      findings: "Missing support panel",
      reviewerType: "human",
    });
  assert.equal(result.structuredContent.sourceCheck.reviewerType, "ai");
  assert.equal(requests[0].action, "record_source_check");
  const count = requests.length;
  const denied = await handlers
    .get("get_source_checks")
    .handler({ chartId: "blocked" });
  assert.equal(denied.isError, true);
  assert.equal(requests.length, count);
  assert.equal(
    handlers.get("get_source_checks").metadata.annotations.readOnlyHint,
    true,
  );
});
