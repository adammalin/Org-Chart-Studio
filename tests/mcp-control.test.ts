import "./helpers/test-db";
import assert from "node:assert/strict";
import test from "node:test";
import { GET, POST } from "../app/api/mcp-control/route";

function request(body: Record<string, unknown>) {
  return new Request("http://127.0.0.1/api/mcp-control", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("retained-source access defaults on and still respects opt-out, chart scope, and pause", async () => {
  const initial = await GET().then((response) => response.json()) as { control: { sourceAccessEnabled: boolean } };
  assert.equal(initial.control.sourceAccessEnabled, true);
  const defaultRead = await POST(request({ action: "authorize", toolName: "extract_chart_sources",
    chartId: "chart-synthetic", mode: "read", sourceAccess: true }));
  assert.equal(defaultRead.status, 200);
  await POST(
    request({
      action: "configure",
      paused: false,
      chartScope: "all",
      allowedChartIds: [],
      sourceAccessEnabled: false,
    }),
  );

  const blocked = await POST(
    request({
      action: "authorize",
      toolName: "extract_chart_sources",
      chartId: "chart-synthetic",
      mode: "read",
      sourceAccess: true,
    }),
  );
  assert.equal(blocked.status, 423);
  const blockedBody = (await blocked.json()) as { error: string };
  assert.match(blockedBody.error, /retained-source extraction is off/);

  const ordinaryRead = await POST(
    request({
      action: "authorize",
      toolName: "get_chart",
      chartId: "chart-synthetic",
      mode: "read",
    }),
  );
  assert.equal(ordinaryRead.status, 200);

  const configured = await POST(
    request({
      action: "configure",
      paused: false,
      chartScope: "all",
      allowedChartIds: [],
      sourceAccessEnabled: true,
    }),
  );
  const configuredBody = (await configured.json()) as {
    control: { sourceAccessEnabled: boolean };
  };
  assert.equal(configuredBody.control.sourceAccessEnabled, true);

  const allowed = await POST(
    request({
      action: "authorize",
      toolName: "extract_chart_sources",
      chartId: "chart-synthetic",
      mode: "read",
      sourceAccess: true,
    }),
  );
  assert.equal(allowed.status, 200);
  const state = (await GET().then((response) => response.json())) as {
    control: { events: Array<{ sourceAccess: boolean; allowed: boolean }> };
  };
  assert.equal(state.control.events[0].sourceAccess, true);
  assert.equal(state.control.events[0].allowed, true);
  await POST(request({ action: "configure", paused: false, chartScope: "selected",
    allowedChartIds: ["chart-synthetic"], sourceAccessEnabled: true }));
  const outsideScope = await POST(request({ action: "authorize", toolName: "extract_chart_sources",
    chartId: "chart-outside", mode: "read", sourceAccess: true }));
  assert.equal(outsideScope.status, 423);
  await POST(request({ action: "configure", paused: true, chartScope: "all",
    allowedChartIds: [], sourceAccessEnabled: true }));
  const paused = await POST(request({ action: "authorize", toolName: "extract_chart_sources",
    chartId: "chart-synthetic", mode: "read", sourceAccess: true }));
  assert.equal(paused.status, 423);
});

test('MCP opt-out and chart scope survive control reinitialization',async()=>{
 await POST(request({action:'configure',paused:true,chartScope:'selected',allowedChartIds:['synthetic-only'],sourceAccessEnabled:false}));
 delete (globalThis as typeof globalThis & {__orgChartMcpControlStore?:unknown}).__orgChartMcpControlStore;
 const d=await GET().then(r=>r.json()) as {control:{paused:boolean;chartScope:string;allowedChartIds:string[];sourceAccessEnabled:boolean}};
 assert.equal(d.control.paused,true);assert.equal(d.control.sourceAccessEnabled,false);assert.deepEqual(d.control.allowedChartIds,['synthetic-only']);assert.equal(d.control.chartScope,'selected');
});
