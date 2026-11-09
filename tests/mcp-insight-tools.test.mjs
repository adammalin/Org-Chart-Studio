import test from "node:test";
import assert from "node:assert/strict";
import { registerInsightTools } from "../mcp/insight-tools.mjs";

function fixture() {
  const handlers = new Map(), requests = [];
  const client = {
    authorizeTool: async ({ chartId }) => {
      if (chartId && chartId !== "allowed") throw Error("Blocked by chart scope");
    },
    request: async (path, init) => {
      requests.push({ path, init });
      if (path === "/api/mcp-control") return { control: { chartScope: "selected", allowedChartIds: ["allowed"] } };
      if (path.startsWith("/api/monthly-workspace")) return {
        batches: [], report: { batch: { chartIds: ["allowed", "restricted-missing-row"] }, rows: [{ chartId: "allowed" }] },
      };
      return { synthetic: true };
    },
  };
  registerInsightTools({ registerTool: (name, _schema, handler) => handlers.set(name, handler) }, client);
  return { handlers, requests };
}

test("monthly insight authorizes the complete batch even when a chart has no report row", async () => {
  const { handlers } = fixture();
  const result = await handlers.get("get_monthly_update_status")({});
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent, undefined);
});

test("consistency and historical answers constrain underlying evidence to enabled charts", async () => {
  const { handlers, requests } = fixture();
  await handlers.get("check_chart_consistency")({ chartId: "allowed" });
  assert.equal(new URL(requests.at(-1).path, "http://localhost").searchParams.get("scopeId"), "allowed");
  await handlers.get("answer_saved_history")({ chartId: "allowed", question: "Who led this chart today?" });
  assert.deepEqual(JSON.parse(requests.at(-1).init.body).scopeIds, ["allowed"]);
  const before = requests.length;
  const denied = await handlers.get("answer_saved_history")({ chartId: "restricted", question: "Who led this chart today?" });
  assert.equal(denied.isError, true);
  assert.equal(requests.length, before);
});
