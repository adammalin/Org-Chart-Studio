import test from "node:test";
import assert from "node:assert/strict";
import { registerHistoryTools } from "../mcp/history-tools.mjs";
function fixture() {
  const handlers = new Map(),
    authorizations = [],
    requests = [];
  let control = { chartScope: "all", allowedChartIds: [] };
  const batch = {
    id: "monthly-synthetic",
    chartIds: ["a", "b"],
    status: "open",
    changeList: "Synthetic director updates",
  };
  const client = {
    authorizeTool: async (x) => {
      authorizations.push(x);
      if (
        control.chartScope === "selected" &&
        x.chartId &&
        !control.allowedChartIds.includes(x.chartId)
      )
        throw Error("Blocked by selected chart scope");
    },
    listCharts: async () => ({
      charts: [
        {
          id: "a",
          name: "Synthetic Alpha",
          status: "draft",
          nodes: [
            {
              id: "person-a",
              data: {
                unit: {
                  name: "Alpha",
                  assignmentLabel: "Synthetic Leader",
                  positionTitle: "Director",
                },
              },
            },
          ],
        },
        { id: "b", name: "Synthetic Beta", status: "draft", nodes: [] },
      ],
    }),
    request: async (path, init) => {
      requests.push({ path, init });
      if (path === "/api/mcp-control") return { control };
      if (init?.method === "POST") return { batch };
      if (path.includes("checkpointId="))
        return { checkpoint: { chartId: "b", chart: { nodes: [] } } };
      return {
        checkpoints: [],
        months: ["2026-11"],
        batches: [batch],
        limit: 2000,
      };
    },
  };
  registerHistoryTools(
    { registerTool: (name, schema, handler) => handlers.set(name, handler) },
    client,
  );
  return {
    handlers,
    authorizations,
    requests,
    scope: () => {
      control = { chartScope: "selected", allowedChartIds: ["a"] };
    },
  };
}
test("monthly MCP batch writes authorize every included chart and preserve the submitted list", async () => {
  const f = fixture();
  const args = {
    month: "2026-11",
    label: "Synthetic monthly",
    changeList: "Replace synthetic director",
    chartIds: ["a", "b"],
  };
  const r = await f.handlers.get("begin_monthly_update")(args);
  assert.equal(r.isError, undefined);
  assert.deepEqual(
    f.authorizations.map((x) => x.chartId),
    ["a", "b"],
  );
  assert.equal(
    JSON.parse(f.requests.at(-1).init.body).changeList,
    args.changeList,
  );
  f.scope();
  const before = f.requests.length;
  const denied = await f.handlers.get("begin_monthly_update")(args);
  assert.equal(denied.isError, true);
  assert.equal(f.requests.length, before);
});
test("history and monthly lists respect chart scope and mismatched checkpoints are not returned", async () => {
  const f = fixture();
  f.scope();
  const batches = await f.handlers.get("list_monthly_updates")();
  assert.deepEqual(batches.structuredContent.batches, []);
  const wrong = await f.handlers.get("get_history_checkpoint")({
    chartId: "a",
    checkpointId: "synthetic-checkpoint",
  });
  assert.equal(wrong.isError, true);
  assert.equal(wrong.structuredContent, undefined);
  const search = await f.handlers.get("search_library")({
    query: "director",
    includeArchived: false,
  });
  assert.equal(search.structuredContent.matches[0].chartId, "a");
});
