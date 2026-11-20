import test from "node:test";
import assert from "node:assert/strict";
import { registerEditHistoryTools } from "../mcp/edit-history-tools.mjs";
function fixture() {
  const handlers = new Map(),
    schemas = new Map(),
    requests = [],
    authorizations = [],
    activities = [];
  let paused = false,
    scope = "all",
    revision = "synthetic-revision";
  const client = {
    authorizeTool: async (a) => {
      authorizations.push(a);
      if (paused || (scope === "selected" && a.chartId !== "synthetic-allowed"))
        throw Error("Blocked by Local AI control");
    },
    reportMcpActivity: async (a) => activities.push(a),
    request: async (path, init) => {
      requests.push({ path, init });
      if (init?.method === "POST") {
        const body = JSON.parse(init.body);
        return path === "/api/ai-proposals"
          ? { proposal: { id: "synthetic-proposal", chartId: body.chart.id } }
          : { chart: { id: body.chartId }, receipt: { id: body.requestId } };
      }
      return {
        revision,
        operation: { label: "Synthetic agent update" },
        proposed: { id: "synthetic-allowed" },
        operations: [],
      };
    },
  };
  registerEditHistoryTools(
    {
      registerTool: (name, schema, handler) => {
        handlers.set(name, handler);
        schemas.set(name, schema);
      },
    },
    client,
  );
  return {
    handlers,
    schemas,
    requests,
    authorizations,
    activities,
    pause: () => {
      paused = true;
    },
    select: () => {
      scope = "selected";
    },
    stale: () => {
      revision = "later-synthetic-revision";
    },
  };
}
test("MCP history has read/write annotations, scoped authorization and exact replay guards", async () => {
  const f = fixture();
  assert.equal(
    f.schemas.get("list_edit_history").annotations.readOnlyHint,
    true,
  );
  assert.equal(
    f.schemas.get("undo_chart_edit").annotations.readOnlyHint,
    false,
  );
  const args = {
    chartId: "synthetic-allowed",
    operationId: "synthetic-operation",
    expectedRevision: "synthetic-revision",
    expectedVersion: 2,
    expectedUpdatedAt: "2026-11-18T12:00:00Z",
    requestId: "history-request-synthetic",
  };
  const result = await f.handlers.get("undo_chart_edit")(args);
  assert.equal(result.isError, undefined);
  assert.equal(f.authorizations.at(-1).mode, "write");
  assert.equal(f.requests.at(-1).init.headers["x-orgchart-actor"], "agent");
  assert.deepEqual(JSON.parse(f.requests.at(-1).init.body), {
    ...args,
    action: "undo",
  });
  assert.equal(f.activities.at(-1).completionKind, "saved");
  f.pause();
  const before = f.requests.length;
  assert.equal((await f.handlers.get("redo_chart_edit")(args)).isError, true);
  assert.equal(f.requests.length, before);
});
test("MCP history scope blocks reads and mutations outside the selected chart", async () => {
  const f = fixture();
  f.select();
  const blocked = await f.handlers.get("list_edit_history")({
    chartId: "synthetic-other",
  });
  assert.equal(blocked.isError, true);
  assert.equal(f.requests.length, 0);
  assert.equal(
    (
      await f.handlers.get("preview_edit_operation")({
        chartId: "synthetic-allowed",
        operationId: "synthetic-op",
      })
    ).isError,
    undefined,
  );
  assert.match(f.requests[0].path, /chartId=synthetic-allowed/);
});
test("older-operation MCP reverts stage normal review and stale previews do not write", async () => {
  const f = fixture(),
    args = {
      chartId: "synthetic-allowed",
      operationId: "synthetic-op",
      expectedRevision: "synthetic-revision",
    };
  const result = await f.handlers.get("stage_history_revert")(args);
  assert.equal(result.isError, undefined);
  const request = f.requests.at(-1);
  assert.equal(request.path, "/api/ai-proposals");
  assert.equal(JSON.parse(request.init.body).action, "stage");
  assert.equal(f.activities.at(-1).completionKind, "review_ready");
  f.stale();
  const count = f.requests.filter((r) => r.init?.method === "POST").length;
  assert.equal(
    (await f.handlers.get("stage_history_revert")(args)).isError,
    true,
  );
  assert.equal(
    f.requests.filter((r) => r.init?.method === "POST").length,
    count,
  );
  assert.equal(f.activities.at(-1).succeeded, false);
});
