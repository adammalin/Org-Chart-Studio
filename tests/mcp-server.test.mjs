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
    sources: [
      {
        id: "source-public-fixture",
        chartId: "chart-public-fixture",
        fileName: "fixture.pdf",
        contentType: "application/pdf",
        fileSize: 100,
        checksum: "f".repeat(64),
        storageKey: "chart-sources/fixture.pdf",
        sourceType: "guided_extraction",
        importedAt: "2026-08-03T12:00:00.000Z",
        rowCount: 0,
        warningCount: 0,
      },
    ],
  };
}

async function startFakeApp(token) {
  const chart = chartFixture();
  const activityEvents = [];
  const authorizationRequests = [];
  const server = http.createServer(async (request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.headers["x-orgchart-desktop-token"] !== token) {
      response.statusCode = 403;
      response.end(JSON.stringify({ error: "denied" }));
      return;
    }
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "POST" && url.pathname === "/api/mcp-control") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      authorizationRequests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      response.end(
        JSON.stringify({
          control: {
            paused: false,
            chartScope: "all",
            allowedChartIds: [],
            sourceAccessEnabled: true,
            revision: 1,
            events: [],
          },
        }),
      );
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/source-extractions") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.end(
        JSON.stringify({
          scope: body.scope,
          id: body.id,
          name: body.scope === "chart" ? chart.name : "Public Fixture Intake",
          extractedAt: chart.updatedAt,
          notice: "Synthetic extracted content only.",
          sourceChecksums: ["f".repeat(64)],
          extractions: [
            {
              id: "source-public-fixture",
              fileName: "fixture.pdf",
              contentType: "application/pdf",
              checksum: "f".repeat(64),
              kind: "pdf",
              truncated: false,
              warnings: [],
              data: { text: "Synthetic fixture source text" },
            },
          ],
        }),
      );
      return;
    }
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
      assert.ok([
        "The synthetic assignment changed after owner review.",
        "Recheck the synthetic fixture against its retained source.",
      ].includes(body.changeSummary));
      const sourceRecheck = body.changeSummary.startsWith("Recheck");
      response.statusCode = 201;
      response.end(
        JSON.stringify({
          proposal: {
            id: sourceRecheck ? "proposal-source-recheck" : "proposal-public-fixture",
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
    if (request.method === "GET" && url.pathname === "/api/backups") {
      response.end(
        JSON.stringify({
          format: "orgchart-studio-library-backup",
          schemaVersion: 4,
          scope: "selected",
          exportedAt: chart.updatedAt,
          chartCount: 1,
          sourceFileCount: 0,
          versionCount: 0,
          aiActivityCount: 0,
          charts: [chart],
          chartVersions: [],
          aiActivities: [],
          sourceFiles: [],
        }),
      );
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/ai-import-proposals") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      assert.equal(body.action, "stage");
      response.statusCode = 201;
      response.end(
        JSON.stringify({
          proposal: {
            id: "import-proposal-public-fixture",
            chartName: body.chartName,
            operation: "stage_normalized_import",
            status: "pending",
            proposed: { nodes: chart.nodes, edges: [] },
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
    if (request.method === "GET" && url.pathname === "/api/import-intakes") {
      response.end(
        JSON.stringify({
          intakes: [
            {
              id: "intake-public-fixture",
              name: "Public Fixture Intake",
              status: "pending",
              createdAt: chart.createdAt,
              updatedAt: chart.updatedAt,
              chartId: null,
              files: [
                {
                  fileName: "fixture.pdf",
                  contentType: "application/pdf",
                  fileSize: 100,
                  checksum: "fixture-checksum",
                },
              ],
            },
          ],
        }),
      );
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
  return { server, port: server.address().port, activityEvents, authorizationRequests };
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
      "list_import_intakes",
      "extract_import_intake",
      "extract_chart_sources",
      "create_chart_draft",
      "import_normalized_chart",
      "stage_normalized_import",
      "replace_chart_draft",
      "stage_source_recheck",
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
    assert.match(
      listed.tools.find((tool) => tool.name === "validate_normalized_import")?.description ?? "",
      /do not turn adjacent portfolio, coverage, specialty, or service labels into vacant child units/,
    );
    assert.match(
      listed.tools.find((tool) => tool.name === "stage_normalized_import")?.description ?? "",
      /nearby portfolio and coverage labels are not vacant seats/,
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

    const intakes = await client.callTool({ name: "list_import_intakes", arguments: {} });
    assert.equal(intakes.structuredContent.intakes[0].id, "intake-public-fixture");

    const extractedIntake = await client.callTool({
      name: "extract_import_intake",
      arguments: { intakeId: "intake-public-fixture" },
    });
    assert.match(extractedIntake.structuredContent.extractions[0].data.text, /fixture source/i);
    assert.equal(fake.authorizationRequests.at(-1).sourceAccess, true);

    const extractedChartSources = await client.callTool({
      name: "extract_chart_sources",
      arguments: { chartId: "chart-public-fixture" },
    });
    assert.deepEqual(extractedChartSources.structuredContent.sourceChecksums, ["f".repeat(64)]);
    assert.equal(fake.authorizationRequests.at(-1).chartId, "chart-public-fixture");

    const stagedImport = await client.callTool({
      name: "stage_normalized_import",
      arguments: {
        chartName: "Public MCP Import",
        format: "csv",
        contents:
          "id,name,shortName,type,parentId,positionTitle,assignmentLabel,positionStatus,effectiveDate,publicationVisibility\nroot,Fixture,Fixture,division,,Director,Position vacant,vacant,Current,internal",
        intakeId: "intake-public-fixture",
      },
    });
    assert.equal(stagedImport.isError, undefined);
    assert.equal(
      stagedImport.structuredContent.proposal.id,
      "import-proposal-public-fixture",
    );
    assert.equal(fake.activityEvents.at(-1).completionKind, "review_ready");

    const created = await client.callTool({
      name: "create_chart_draft",
      arguments: { name: "Synthetic Activity Test" },
    });
    assert.equal(created.isError, undefined);
    assert.equal(fake.activityEvents.length, 4);
    assert.equal(fake.activityEvents.at(-2).action, "begin");
    assert.equal(fake.activityEvents.at(-2).operation, "create_chart_draft");
    assert.equal(fake.activityEvents.at(-1).action, "complete");
    assert.equal(fake.activityEvents.at(-1).succeeded, true);
    assert.equal(fake.activityEvents.at(-1).chartId, "chart-public-fixture");

    const proposed = structuredClone(chartFixture());
    proposed.nodes[0].data.unit.assignmentLabel = "Synthetic replacement";
    const staged = await client.callTool({
      name: "replace_chart_draft",
      arguments: {
        chart: proposed,
        changeSummary: "The synthetic assignment changed after owner review.",
      },
    });
    assert.equal(staged.isError, undefined);
    assert.equal(staged.structuredContent.proposal.id, "proposal-public-fixture");
    assert.match(staged.content[0].text, /saved chart has not changed/i);
    assert.equal(fake.activityEvents.at(-1).completionKind, "review_ready");
    assert.equal(fake.activityEvents.at(-1).proposalId, "proposal-public-fixture");

    const sourceRecheck = structuredClone(chartFixture());
    sourceRecheck.nodes[0].data.unit.assignmentLabel = "Synthetic reviewed assignment";
    sourceRecheck.nodes[0].data.unit.sourceLocator = "PDF page 1";
    sourceRecheck.nodes[0].data.unit.sourceCertainty = "needs_review";
    sourceRecheck.nodes[0].data.unit.reviewNote = "Confirm the extracted assignment.";
    const stagedRecheck = await client.callTool({
      name: "stage_source_recheck",
      arguments: {
        chart: sourceRecheck,
        reviewedSourceChecksums: ["f".repeat(64)],
        changeSummary: "Recheck the synthetic fixture against its retained source.",
      },
    });
    assert.equal(stagedRecheck.isError, undefined);
    assert.equal(stagedRecheck.structuredContent.proposal.id, "proposal-source-recheck");
    assert.equal(fs.existsSync(stagedRecheck.structuredContent.backup.path), true);
    assert.equal(fake.authorizationRequests.at(-1).sourceAccess, true);
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
