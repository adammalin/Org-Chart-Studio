import assert from "node:assert/strict";
import test from "node:test";
import { GET, POST } from "../app/api/mcp-control/route";

async function post(value: unknown) {
  return POST(
    new Request("http://localhost/api/mcp-control", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    }),
  );
}

test("MCP control pauses access and limits selected chart operations", async () => {
  await post({ action: "clear_events" });
  await post({
    action: "configure",
    paused: true,
    chartScope: "all",
    allowedChartIds: [],
  });
  const paused = await post({
    action: "authorize",
    toolName: "get_chart",
    chartId: "chart-one",
    mode: "read",
  });
  assert.equal(paused.status, 423);

  await post({
    action: "configure",
    paused: false,
    chartScope: "selected",
    allowedChartIds: ["chart-one"],
  });
  const allowed = await post({
    action: "authorize",
    toolName: "replace_chart_draft",
    chartId: "chart-one",
    mode: "write",
  });
  const blocked = await post({
    action: "authorize",
    toolName: "get_chart",
    chartId: "chart-two",
    mode: "read",
  });
  assert.equal(allowed.status, 200);
  assert.equal(blocked.status, 423);

  const current = (await (await GET()).json()) as {
    control: { events: Array<{ allowed: boolean; toolName: string }> };
  };
  assert.equal(current.control.events.some((event) => event.allowed), true);
  assert.equal(current.control.events.some((event) => !event.allowed), true);
});
