import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function chartFixture() {
  return {
    id: "chart-public-fixture",
    name: "Public Fixture Chart",
    description: "Synthetic MCP test chart.",
    status: "draft",
    version: 2,
    createdAt: "2026-08-03T12:00:00.000Z",
    updatedAt: "2026-08-03T13:00:00.000Z",
    nodes: [
      {
        id: "unit-root",
        type: "orgUnit",
        position: { x: 0, y: 0 },
        data: {
          pinned: false,
          unit: {
            id: "unit-root",
            name: "Public Fixture",
            shortName: "Public Fixture",
            type: "division",
            positionTitle: "Director",
            assignmentLabel: "Position vacant",
            positionStatus: "vacant",
            effectiveDate: "Current",
            source: "Synthetic MCP test",
            publicationVisibility: "internal",
          },
        },
      },
    ],
    edges: [],
    sources: [],
  };
}

async function startFakeApp(token) {
  const chart = chartFixture();
  const activityEvents = [];
  const server = http.createServer(async (request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.headers["x-orgchart-desktop-token"] !== token) {
      response.statusCode = 403;
      response.end(JSON.stringify({ error: "denied" }));
      return;
    }
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "POST" && url.pathname === "/api/ai-activity") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const activity = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      activityEvents.push(activity);
      response.end(JSON.stringify({ activity }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/ai-proposals") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      assert.equal(body.action, "stage");
      response.statusCode = 201;
      response.end(
        JSON.stringify({
          proposal: {
            id: "proposal-public-fixture",
            chartId: chart.id,
            chartName: chart.name,
            operation: "replace_chart_draft",
            status: "pending",
            summary: {
              total: 1,
              added: 0,
              changed: 1,
              removed: 0,
              changedNodeIds: ["unit-root"],
              addedNodeIds: [],
              removedNodeIds: [],
              changedEdgeIds: [],
              addedEdgeIds: [],
              removedEdgeIds: [],
              text: "1 field change across 1 unit and 0 relationships.",
            },
          },
        }),
      );
      return;
    }
    if (request.method === "GET" && url.searchParams.get("resource") === "validate") {
      response.end(
        JSON.stringify({
          chartId: chart.id,
          chartVersion: chart.version,
          valid: true,
          findings: [],
        }),
      );
      return;
    }
    if (request.method === "GET" && url.searchParams.get("resource") === "versions") {
      response.end(
        JSON.stringify({
          versions: [
            {
              id: "version-2",
              chartId: chart.id,
              version: 2,
              label: "Reviewed fixture",
              createdAt: chart.updatedAt,
              restoredFromVersion: null,
            },
          ],
        }),
      );
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/charts") {
      response.end(JSON.stringify({ charts: [chart] }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/charts") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString("utf8");
      if (request.headers["content-type"]?.startsWith("multipart/form-data")) {
        if (body.includes('name="validateOnly"')) {
          response.end(
            JSON.stringify({
              preview: { nodes: chart.nodes, edges: [], rowCount: 1, findings: [] },
              evidenceFileNames: [],
            }),
          );
        } else {
          response.statusCode = 201;
          response.end(JSON.stringify({ chart, findings: [] }));
        }
        return;
      }
      const parsed = JSON.parse(body);
      response.statusCode = parsed.action === "create" ? 201 : 200;
      response.end(JSON.stringify({ chart, version: null }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: server.address().port, activityEvents };
}

test("local STDIO MCP exposes bounded tools and reaches only the authorized running app", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orgchart-mcp-server-"));
  const runtimePath = path.join(root, "mcp-runtime.json");
  const token = "a".repeat(64);
  const fake = await startFakeApp(token);
  fs.writeFileSync(
    runtimePath,
    JSON.stringify({
      version: 1,
      pid: process.pid,
      baseUrl: `http://127.0.0.1:${fake.port}/`,
      token,
      startedAt: new Date().toISOString(),
    }),
    { mode: 0o600 },
  );

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(projectRoot, "mcp", "server.mjs")],
    cwd: projectRoot,
    env: {
      ...process.env,
      ORGCHART_MCP_RUNTIME_FILE: runtimePath,
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "orgchart-mcp-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    assert.deepEqual(names, [
      "list_charts",
      "get_chart",
      "validate_chart",
      "list_chart_versions",
      "validate_normalized_import",
      "create_chart_draft",
      "import_normalized_chart",
      "replace_chart_draft",
      "save_chart_version",
    ]);
    assert.equal(
      listed.tools.find((tool) => tool.name === "list_charts")?.annotations?.readOnlyHint,
      true,
    );
    assert.equal(
      listed.tools.find((tool) => tool.name === "replace_chart_draft")?.annotations?.readOnlyHint,
      false,
    );
    assert.equal(names.includes("delete_chart"), false);
    assert.equal(names.includes("restore_backup"), false);

    const charts = await client.callTool({ name: "list_charts", arguments: {} });
    assert.equal(charts.isError, undefined);
    assert.equal(charts.structuredContent.charts[0].id, "chart-public-fixture");

    const validation = await client.callTool({
      name: "validate_chart",
      arguments: { chartId: "chart-public-fixture" },
    });
    assert.equal(validation.structuredContent.valid, true);

    const importPreview = await client.callTool({
      name: "validate_normalized_import",
      arguments: {
        chartName: "Public MCP Import",
        format: "csv",
        contents:
          "id,name,shortName,type,parentId,positionTitle,assignmentLabel,positionStatus,effectiveDate,publicationVisibility\nroot,Fixture,Fixture,division,,Director,Position vacant,vacant,Current,internal",
      },
    });
    assert.equal(importPreview.structuredContent.preview.rowCount, 1);

    const created = await client.callTool({
      name: "create_chart_draft",
      arguments: { name: "Synthetic Activity Test" },
    });
    assert.equal(created.isError, undefined);
    assert.equal(fake.activityEvents.length, 2);
    assert.equal(fake.activityEvents[0].action, "begin");
    assert.equal(fake.activityEvents[0].operation, "create_chart_draft");
    assert.equal(fake.activityEvents[1].action, "complete");
    assert.equal(fake.activityEvents[1].succeeded, true);
    assert.equal(fake.activityEvents[1].chartId, "chart-public-fixture");

    const proposed = structuredClone(chartFixture());
    proposed.nodes[0].data.unit.assignmentLabel = "Synthetic replacement";
    const staged = await client.callTool({
      name: "replace_chart_draft",
      arguments: { chart: proposed },
    });
    assert.equal(staged.isError, undefined);
    assert.equal(staged.structuredContent.proposal.id, "proposal-public-fixture");
    assert.match(staged.content[0].text, /saved chart has not changed/i);
    assert.equal(fake.activityEvents.at(-1).completionKind, "review_ready");
    assert.equal(fake.activityEvents.at(-1).proposalId, "proposal-public-fixture");
  } finally {
    await client.close();
    await new Promise((resolve) => fake.server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("MCP refuses a world-readable desktop session file", async () => {
  if (process.platform === "win32") return;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orgchart-mcp-permissions-"));
  const runtimePath = path.join(root, "mcp-runtime.json");
  fs.writeFileSync(
    runtimePath,
    JSON.stringify({
      version: 1,
      pid: process.pid,
      baseUrl: "http://127.0.0.1:12345/",
      token: "b".repeat(64),
    }),
    { mode: 0o644 },
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(projectRoot, "mcp", "server.mjs")],
    cwd: projectRoot,
    env: { ...process.env, ORGCHART_MCP_RUNTIME_FILE: runtimePath },
    stderr: "pipe",
  });
  const client = new Client({ name: "orgchart-mcp-permission-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: "list_charts", arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /unsafe permissions/);
  } finally {
    await client.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
