import { testDatabase } from "./helpers/test-db";
import assert from "node:assert/strict";
import test from "node:test";
import { supportFixture } from "./helpers/support-fixture";
import {
  normalizeSupplements,
  currentSourceChecks,
  contentFingerprint,
  supportReviewCount,
} from "../lib/chart-supplements";
import { storageSafeNodes, type ChartDocument } from "../lib/chart-library";
import { validateHierarchy } from "../lib/org-chart";
import { parseImportFile } from "../lib/import-org-chart";
import { searchLibrary } from "../lib/library-navigation";
import { roleAnswers, parseHistoryQuestion } from "../lib/history-answers";
import {
  buildChartExportScene,
  buildChartSvg,
  buildAccessibleTableCsv,
} from "../lib/chart-export";
import { buildChartPptx } from "../lib/chart-export-pptx";
import { buildChartPdf } from "../lib/chart-export-pdf";
import { unzipSync, strFromU8 } from "fflate";
import { PDFDocument } from "pdf-lib";
import {
  LIBRARY_BACKUP_VERSION,
  isLibraryBackup,
  type LibraryBackup,
} from "../lib/backup-format";
import type { HistoryCheckpoint } from "../lib/chart-history";
const charts = await import("../app/api/charts/route"),
  backups = await import("../app/api/backups/route"),
  proposals = await import("../app/api/ai-proposals/route");
async function post(
  route: { POST: (r: Request) => Promise<Response> },
  body: unknown,
) {
  const response = await route.POST(
    new Request("http://127.0.0.1/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return {
    status: response.status,
    data: (await response.json()) as {
      chart: ChartDocument;
      error?: string;
      version?: { id: string };
      proposal?: { id: string; changes: { category: string }[] };
      restoredCharts?: ChartDocument[];
    },
  };
}
async function createFixture() {
  const created = await post(charts, {
    action: "create",
    name: "Synthetic support fixture",
  });
  assert.equal(created.status, 201);
  const fixture = {
    ...supportFixture(created.data.chart.id),
    version: created.data.chart.version,
    createdAt: created.data.chart.createdAt,
    updatedAt: created.data.chart.updatedAt,
  };
  const saved = await post(charts, { action: "save", chart: fixture });
  assert.equal(saved.status, 200, saved.data.error);
  return saved.data.chart;
}
test("support content stays outside supervisory hierarchy and rejects dangling or malformed geometry", () => {
  const c = supportFixture();
  const normalized = normalizeSupplements(c);
  assert.equal(c.nodes.length, 2);
  assert.equal(c.edges.length, 1);
  assert.equal(
    validateHierarchy(c.nodes, c.edges).filter((f) => f.severity === "blocking")
      .length,
    0,
  );
  assert.equal(supportReviewCount(c), 3);
  assert.deepEqual(storageSafeNodes(c.nodes)[0].style, {
    width: 900,
    height: 200,
  });
  assert.deepEqual(normalized.supportPanels, c.supportPanels);
  const bad = structuredClone(c);
  bad.supportPanels![0].anchorUnitId = "missing";
  assert.throws(() => normalizeSupplements(bad), /existing organization/);
  bad.supportPanels![0].anchorUnitId = c.nodes[0].id;
  bad.supportPanels![0].geometry!.width = NaN;
  assert.throws(() => normalizeSupplements(bad), /finite/);
});
test("canonical import and source-preserving visual/table exports retain panels, positions and editable text", async () => {
  const c = supportFixture(),
    preview = parseImportFile("source.json", JSON.stringify(c));
  assert.deepEqual(preview.supportPanels, c.supportPanels);
  assert.deepEqual(preview.sourceLayout, c.sourceLayout);
  const scene = buildChartExportScene(c, "internal", "2026-11-11T12:00:00Z");
  const root = scene.nodes.find((n) => n.id === c.nodes[0].id)!;
  assert.equal(root.width, 900);
  assert.equal(root.height, 200);
  assert.equal(scene.supportPanels![0].x - root.x, 0);
  assert.equal(scene.supportPanels![0].y - root.y, 620);
  assert.deepEqual(
    scene.edges[0].points.map((p) => ({ x: p.x - root.x, y: p.y - root.y })),
    [
      { x: 450, y: 200 },
      { x: 450, y: 260 },
      { x: -300, y: 260 },
      { x: -300, y: 370 },
    ],
  );
  const svg = buildChartSvg(scene, "natural");
  assert.match(svg, /data-support-panel-id="synthetic-matrix"/);
  assert.match(svg, /Sample Support Person/);
  assert.match(buildAccessibleTableCsv(c, "internal"), /support_assignment/);
  const pptx = await buildChartPptx(scene, "presentation-wide");
  const xml = strFromU8(unzipSync(pptx)["ppt/slides/slide1.xml"]);
  assert.match(xml, /Sample Support Person/);
  assert.match(xml, /Support panel synthetic-matrix/);
  const pdf = await PDFDocument.load(
    await buildChartPdf(scene, "tabloid-landscape"),
  );
  assert.equal(pdf.getPageCount(), 1);
});
test("public exports exclude internal support panels and suppress people in public-marked support assignments", () => {
  const c = supportFixture();
  let svg = buildChartSvg(buildChartExportScene(c, "public"), "natural");
  assert.doesNotMatch(
    svg,
    /Sample Support Person|Another Sample Person|Synthetic Matrix Support/,
  );
  c.supportPanels![0].publicationVisibility = "public";
  svg = buildChartSvg(buildChartExportScene(c, "public"), "natural");
  assert.match(svg, /Procurement Manager/);
  assert.doesNotMatch(
    svg,
    /Sample Support Person|Another Sample Person|HR Business Partner/,
  );
  assert.doesNotMatch(
    buildAccessibleTableCsv(c, "public"),
    /Sample Support Person|Another Sample Person/,
  );
});
test("source records preserve evidence, become stale on fact edits but not geometry edits, and do not clear review flags", async () => {
  const { sql } = testDatabase();
  try {
    let c = await createFixture();
    const check = {
      checkedBy: "Synthetic AI reviewer",
      reviewerType: "ai",
      sourceUrl: "https://example.invalid/official-chart.pptx",
      sourceLocator: "Synthetic slide 1",
      sourceRevision: "Synthetic revision A",
      scope: "full_chart",
      result: "matches",
      findings: "Synthetic full comparison passed",
    };
    const recorded = await post(charts, {
      action: "record_source_check",
      chartId: c.id,
      expectedVersion: c.version,
      expectedUpdatedAt: c.updatedAt,
      sourceCheck: check,
    });
    assert.equal(recorded.status, 201, recorded.data.error);
    c = recorded.data.chart;
    assert.equal(supportReviewCount(c), 3);
    assert.equal((await currentSourceChecks(c))[0].stale, false);
    const hash = await contentFingerprint(c);
    c.nodes[0].position.x += 40;
    assert.equal(await contentFingerprint(c), hash);
    c.supportPanels![0].entries[0].person = "Changed Sample Person";
    assert.equal((await currentSourceChecks(c))[0].stale, true);
    const tamper = await post(charts, {
      action: "save",
      chart: { ...recorded.data.chart, sourceChecks: [] },
    });
    assert.equal(tamper.status, 422);
    const stale = await post(charts, {
      action: "record_source_check",
      chartId: c.id,
      expectedVersion: c.version,
      expectedUpdatedAt: "2000-01-01",
      sourceCheck: check,
    });
    assert.equal(stale.status, 409);
  } finally {
    sql.close();
  }
});
test("old clients cannot silently remove support content and reviewed proposals retain it in named versions and restores", async () => {
  const { sql } = testDatabase();
  try {
    let c = await createFixture();
    const legacy = { ...c };
    delete legacy.supportPanels;
    delete legacy.sourceChecks;
    delete legacy.sourceLayout;
    legacy.description = "Synthetic legacy metadata edit";
    let saved = await post(charts, { action: "save", chart: legacy });
    assert.equal(saved.status, 200, saved.data.error);
    c = saved.data.chart;
    assert.equal(c.supportPanels!.length, 1);
    assert.ok(c.sourceLayout);
    const next = structuredClone(c);
    next.supportPanels![0].entries[0].person = "Reviewed Sample Person";
    const staged = await post(proposals, {
      action: "stage",
      chart: next,
      changeSummary: "Synthetic support reassignment",
    });
    assert.equal(staged.status, 201, staged.data.error);
    assert.ok(
      staged.data.proposal!.changes.some((f) => f.category === "support"),
    );
    saved = await post(proposals, {
      action: "accept",
      proposalId: staged.data.proposal!.id,
    });
    assert.equal(saved.status, 200, saved.data.error);
    assert.equal(
      saved.data.chart.supportPanels![0].entries[0].person,
      "Reviewed Sample Person",
    );
    const snapshot = await post(charts, {
      action: "snapshot_current",
      chartId: c.id,
      expectedVersion: saved.data.chart.version,
      expectedUpdatedAt: saved.data.chart.updatedAt,
      label: "Synthetic support checkpoint",
    });
    assert.equal(snapshot.status, 201, snapshot.data.error);
    const altered = await post(charts, {
      action: "save",
      chart: { ...snapshot.data.chart, supportPanels: [] },
    });
    assert.equal(altered.status, 200);
    const restored = await post(charts, {
      action: "restore_version",
      chartId: c.id,
      versionId: snapshot.data.version!.id,
    });
    assert.equal(restored.status, 200, restored.data.error);
    assert.equal(
      restored.data.chart.supportPanels![0].entries[0].person,
      "Reviewed Sample Person",
    );
    assert.deepEqual(restored.data.chart.sourceLayout, c.sourceLayout);
  } finally {
    sql.close();
  }
});
test("schema-v6 full backups merge support geometry and check history while retaining v5 compatibility", async () => {
  const { sql } = testDatabase();
  try {
    let c = await createFixture();
    const snapshot = await post(charts, {
      action: "snapshot_current",
      chartId: c.id,
      expectedVersion: c.version,
      expectedUpdatedAt: c.updatedAt,
      label: "Synthetic geometry checkpoint",
    });
    assert.equal(snapshot.status, 201, snapshot.data.error);
    c = snapshot.data.chart;
    const backup = (await backups
      .GET(new Request("http://127.0.0.1/api/backups?chartId=" + c.id))
      .then((r) => r.json())) as LibraryBackup;
    assert.equal(backup.schemaVersion, LIBRARY_BACKUP_VERSION);
    assert.ok(isLibraryBackup({ ...backup, schemaVersion: 5 }));
    assert.deepEqual(backup.charts[0].supportPanels, c.supportPanels);
    assert.ok(backup.chartVersions!.at(-1)!.sourceLayout);
    const restored = await post(backups, backup);
    assert.equal(restored.status, 201, restored.data.error);
    assert.deepEqual(
      restored.data.restoredCharts![0].supportPanels,
      c.supportPanels,
    );
    assert.deepEqual(
      restored.data.restoredCharts![0].nodes[0].style,
      c.nodes[0].style,
    );
    assert.equal(
      sql.prepare("SELECT count(*) as count FROM charts").get()!.count,
      2,
    );
  } finally {
    sql.close();
  }
});
test("support roles are searchable and dated history answers never present them as organizational leaders", () => {
  const c = supportFixture();
  assert.equal(
    searchLibrary([c], "Sample Support Person")[0].role,
    "HR Business Partner",
  );
  const h = {
    id: "synthetic-checkpoint",
    chartId: c.id,
    chartName: c.name,
    recordedAt: "2026-11-11T12:00:00Z",
    kind: "after",
    chart: c,
  } as HistoryCheckpoint;
  const roles = roleAnswers(
    [h],
    parseHistoryQuestion({ mode: "roles", query: "HR Business Partner" }),
  );
  assert.equal(roles[0].person, "Sample Support Person");
  assert.match(roles[0].organization, /support/);
  const leaders = roleAnswers(
    [h],
    parseHistoryQuestion({
      question: "Who led this chart on 2026-11-11?",
      chartId: c.id,
    }),
  );
  assert.ok(leaders.every((r) => !r.organization.includes("(support)")));
});
