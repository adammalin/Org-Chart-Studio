/* eslint-disable @typescript-eslint/no-explicit-any -- Synthetic API fixtures inspect variable response shapes. */
import { testDatabase } from "./helpers/test-db";
import assert from "node:assert/strict";
import test from "node:test";
import { createBlankChart, type ChartDocument } from "../lib/chart-library";
import { historyRestoreError } from "../lib/chart-history";
const history = await import("../app/api/history/route");
const charts = await import("../app/api/charts/route");
const backups = await import("../app/api/backups/route");
const proposals = await import("../app/api/ai-proposals/route");
function request(body: unknown) {
  return new Request("http://127.0.0.1/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function post(
  route: { POST: (r: Request) => Promise<Response> },
  body: unknown,
) {
  const r = await route.POST(request(body));
  return { status: r.status, data: (await r.json()) as any };
}
function seed(
  sql: ReturnType<typeof testDatabase>["sql"],
  id: string,
  name = id,
) {
  const c = createBlankChart(name, id);
  c.updatedAt = "2026-10-01T12:00:00Z";
  c.nodes[0].data.unit.assignmentLabel = "Synthetic Previous Leader";
  sql
    .prepare(
      "INSERT INTO charts(id,name,description,status,version,created_at,updated_at,payload) VALUES(?,?,?,?,?,?,?,?)",
    )
    .run(
      c.id,
      c.name,
      c.description,
      c.status,
      c.version,
      c.createdAt,
      c.updatedAt,
      JSON.stringify({
        nodes: c.nodes,
        edges: c.edges,
        lifecycle: c.lifecycle,
      }),
    );
  return c;
}
async function timeline(chartId = "") {
  return (await history
    .GET(new Request("http://127.0.0.1/api/history?chartId=" + chartId))
    .then((r) => r.json())) as any;
}
test("monthly update preserves before, applied changes, final checkpoints, and change list", async () => {
  const { sql } = testDatabase();
  try {
    const c = seed(sql, "synthetic-monthly");
    const begun = await post(history, {
      action: "begin",
      month: "2026-11",
      label: "Synthetic November",
      changeList: "Replace the director with Synthetic New Leader",
      chartIds: [c.id],
    });
    assert.equal(begun.status, 201);
    const next = structuredClone(c);
    next.nodes[0].data.unit.assignmentLabel = "Synthetic New Leader";
    const staged = await post(proposals, {
      action: "stage",
      chart: next,
      changeSummary: "Director changed from monthly list",
    });
    assert.equal(staged.status, 201);
    assert.equal(
      (
        await post(history, {
          action: "complete",
          batchId: begun.data.batch.id,
          summary: "Done",
        })
      ).status,
      409,
    );
    const applied = await post(proposals, {
      action: "accept",
      proposalId: staged.data.proposal.id,
    });
    assert.equal(applied.status, 200);
    const done = await post(history, {
      action: "complete",
      batchId: begun.data.batch.id,
      summary: "Updated synthetic director",
    });
    assert.equal(done.status, 200);
    const h = await timeline(c.id);
    assert.equal(h.checkpoints.length, 4);
    assert.equal(h.batches[0].changeList, begun.data.batch.changeList);
    assert.ok(
      h.checkpoints.every((x: any) => x.batchId === begun.data.batch.id),
    );
    const before = sql
      .prepare(
        "SELECT payload FROM chart_checkpoints WHERE kind='monthly_before'",
      )
      .get() as any;
    assert.equal(
      JSON.parse(before.payload).nodes[0].data.unit.assignmentLabel,
      "Synthetic Previous Leader",
    );
    const after = sql
      .prepare(
        "SELECT payload FROM chart_checkpoints WHERE kind='monthly_after'",
      )
      .get() as any;
    assert.equal(
      JSON.parse(after.payload).nodes[0].data.unit.assignmentLabel,
      "Synthetic New Leader",
    );
    assert.equal(
      (await post(charts, { action: "save", chart: c })).status,
      409,
    );
    assert.equal((await timeline(c.id)).checkpoints.length, 4);
  } finally {
    sql.close();
  }
});
test("Current is available from Draft, requires acknowledgment of source notes, and retains notes", async () => {
  const { sql } = testDatabase();
  try {
    const c = seed(sql, "synthetic-current");
    c.nodes[0].data.unit.sourceCertainty = "needs_review";
    sql.prepare("UPDATE charts SET payload=? WHERE id=?").run(
      JSON.stringify({
        nodes: c.nodes,
        edges: c.edges,
        lifecycle: c.lifecycle,
      }),
      c.id,
    );
    const body = {
      action: "transition_status",
      chartId: c.id,
      targetStatus: "current",
      expectedVersion: c.version,
      expectedUpdatedAt: c.updatedAt,
      currentBy: "Synthetic reviewer",
    };
    assert.equal((await post(charts, body)).status, 422);
    const yes = await post(charts, { ...body, acknowledgeReview: true });
    assert.equal(yes.status, 200);
    assert.equal(yes.data.chart.status, "current");
    assert.equal(
      yes.data.chart.nodes[0].data.unit.sourceCertainty,
      "needs_review",
    );
    assert.equal((await timeline(c.id)).checkpoints.length, 2);
  } finally {
    sql.close();
  }
});
test("unencrypted v5 backup round trip preserves timeline, archived status and placement without replacing originals", async () => {
  const { sql } = testDatabase();
  try {
    const a = seed(sql, "synthetic-parent"),
      b = seed(sql, "synthetic-child");
    b.libraryParentId = a.id;
    b.status = "archived";
    sql.prepare("UPDATE charts SET status=?,payload=? WHERE id=?").run(
      "archived",
      JSON.stringify({
        nodes: b.nodes,
        edges: b.edges,
        lifecycle: b.lifecycle,
        libraryParentId: a.id,
      }),
      b.id,
    );
    const begun = await post(history, {
      action: "begin",
      month: "2026-11",
      label: "Synthetic update",
      changeList: "Test full history",
      chartIds: [a.id],
    });
    assert.equal(begun.status, 201);
    await post(history, {
      action: "complete",
      batchId: begun.data.batch.id,
      summary: "No changes required",
    });
    const backup = (await backups
      .GET(new Request("http://127.0.0.1/api/backups"))
      .then((r) => r.json())) as any;
    assert.equal(backup.schemaVersion, 5);
    assert.ok(backup.checkpoints.length >= 3);
    const restored = await post(backups, backup);
    assert.equal(restored.status, 201);
    assert.equal(
      restored.data.restoredCheckpointCount,
      backup.checkpoints.length,
    );
    assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM charts").get()?.n, 4);
    const restoredA = restored.data.restoredCharts.find(
        (c: ChartDocument) => c.name === a.name + " — Restored",
      ),
      restoredB = restored.data.restoredCharts.find(
        (c: ChartDocument) => c.name === b.name + " — Restored",
      );
    assert.equal(restoredB.libraryParentId, restoredA.id);
    assert.equal(restoredB.status, "archived");
    const h = await timeline(restoredA.id);
    assert.equal(h.checkpoints.length, 2);
    assert.ok(h.checkpoints.every((x: any) => x.chartId === restoredA.id));
    const legacy = {
      ...backup,
      schemaVersion: 4,
      checkpoints: undefined,
      monthlyUpdates: undefined,
    };
    assert.equal((await post(backups, legacy)).status, 201);
    const broken = structuredClone(backup);
    broken.checkpoints[0].chartId = "missing";
    assert.equal((await post(backups, broken)).status, 422);
  } finally {
    sql.close();
  }
});
test("malformed history references are rejected", () => {
  assert.match(
    historyRestoreError([{ id: "x" }] as any, [], new Set()) || "",
    /malformed/,
  );
});

test("failed after-checkpoint write rolls back both mutation and before state", async () => {
  const { sql } = testDatabase();
  try {
    const c = seed(sql, "synthetic-atomic"),
      next = structuredClone(c);
    next.nodes[0].data.unit.assignmentLabel = "Should never commit";
    sql.exec(
      "CREATE TRIGGER synthetic_failure BEFORE INSERT ON chart_checkpoints WHEN NEW.kind='after' BEGIN SELECT RAISE(ABORT,'synthetic disk failure'); END;",
    );
    await assert.rejects(post(charts, { action: "save", chart: next }));
    const row = sql
      .prepare("SELECT payload FROM charts WHERE id=?")
      .get(c.id) as any;
    assert.equal(
      JSON.parse(row.payload).nodes[0].data.unit.assignmentLabel,
      "Synthetic Previous Leader",
    );
    assert.equal(
      sql.prepare("SELECT COUNT(*) AS n FROM chart_checkpoints").get()?.n,
      0,
    );
  } finally {
    sql.close();
  }
});

test("library tree choice is stored in the database independently of the browser origin", async () => {
  const { sql } = testDatabase();
  try {
    const preferences = await import("../app/api/preferences/route");
    assert.equal(
      ((await preferences.GET().then((r) => r.json())) as any).libraryView,
      "flat",
    );
    assert.equal(
      (await post(preferences, { libraryView: "tree" })).status,
      200,
    );
    assert.equal(
      ((await preferences.GET().then((r) => r.json())) as any).libraryView,
      "tree",
    );
    assert.equal(
      sql
        .prepare("SELECT payload FROM app_settings WHERE key='library-view'")
        .get()?.payload,
      "tree",
    );
    assert.equal(
      (await post(preferences, { libraryView: "invalid" })).status,
      422,
    );
  } finally {
    sql.close();
  }
});

test("an imported unfinished monthly update remains visibly interrupted and retains its history", async () => {
  const { sql } = testDatabase();
  try {
    const c = seed(sql, "synthetic-unfinished");
    const started = await post(history, {
      action: "begin",
      month: "2026-11",
      label: "Unfinished synthetic update",
      changeList: "Awaiting a synthetic review",
      chartIds: [c.id],
    });
    assert.equal(started.status, 201);
    const backup = (await backups
      .GET(new Request("http://127.0.0.1/api/backups"))
      .then((r) => r.json())) as any;
    const restored = await post(backups, backup);
    assert.equal(restored.status, 201);
    const batches = (await timeline()).batches;
    assert.equal(batches.filter((b: any) => b.status === "open").length, 1);
    const recovered = batches.find((b: any) => b.status === "interrupted");
    assert.ok(recovered);
    assert.equal(recovered.completedAt, null);
    assert.equal(recovered.changeList, "Awaiting a synthetic review");
    assert.ok(recovered.summary.includes("unfinished"));
  } finally {
    sql.close();
  }
});
