/* eslint-disable @typescript-eslint/no-explicit-any -- Synthetic API fixtures inspect variable response shapes. */
import { testDatabase } from "./helpers/test-db";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBlankChart, type ChartDocument } from "../lib/chart-library";
const charts = await import("../app/api/charts/route"),
  history = await import("../app/api/history/route"),
  workspace = await import("../app/api/monthly-workspace/route"),
  proposals = await import("../app/api/ai-proposals/route"),
  backups = await import("../app/api/backups/route"),
  answers = await import("../app/api/history/answers/route"),
  consistency = await import("../app/api/consistency/route");
async function post(
  route: { POST: (r: Request) => Promise<Response> },
  body: unknown,
) {
  const r = await route.POST(
    new Request("http://127.0.0.1/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: r.status, data: (await r.json()) as any };
}
async function library() {
  return (
    (await charts
      .GET(new Request("http://127.0.0.1/api/charts"))
      .then((r) => r.json())) as any
  ).charts as ChartDocument[];
}
function seed(db: ReturnType<typeof testDatabase>, id: string) {
  const c = createBlankChart("Synthetic Physics Division", id);
  c.nodes[0].data.unit.name = c.name;
  c.nodes[0].data.unit.assignmentLabel = "Synthetic Alice";
  c.nodes[0].data.unit.positionTitle = "Director";
  c.nodes[0].data.unit.sourceCertainty = "confirmed";
  c.nodes[0].data.unit.sourceLocator = "Synthetic local diagram, page 1";
  db.sql
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
test("monthly journey: atomic failure, resume after database reopen, Current, dated answers, and full export/restore", async () => {
  const dir = mkdtempSync(join(tmpdir(), "studio-monthly-journey-")),
    file = join(dir, "library.sqlite");
  let db = testDatabase(file);
  try {
    const a = seed(db, "synthetic-a"),
      b = seed(db, "synthetic-b");
    await library();
    const begun = await post(history, {
      action: "begin",
      month: "2026-11",
      label: "Synthetic monthly journey",
      changeList:
        "Replace Synthetic Alice with Synthetic Bob in both appearances",
      chartIds: [a.id, b.id],
    });
    assert.equal(begun.status, 201);
    const batchId = begun.data.batch.id;
    const ids: string[] = [];
    for (const c of await library()) {
      const next = structuredClone(c);
      next.nodes[0].data.unit.assignmentLabel = "Synthetic Bob";
      next.nodes[0].data.unit.sourceCertainty = "needs_review";
      const staged = await post(proposals, {
        action: "stage",
        chart: next,
        changeSummary: "Synthetic leadership update",
      });
      assert.equal(staged.status, 201);
      ids.push(staged.data.proposal.id);
    }
    db.sql.exec(
      "CREATE TRIGGER synthetic_batch_failure BEFORE INSERT ON chart_checkpoints WHEN NEW.kind='after' AND NEW.chart_id='synthetic-b' BEGIN SELECT RAISE(ABORT,'synthetic interrupted write'); END;",
    );
    const failed = await post(workspace, {
      action: "review_batch",
      batchId,
      proposalIds: ids,
      decision: "accept",
    });
    assert.equal(failed.status, 409);
    assert.ok(
      (await library()).every(
        (c) => c.nodes[0].data.unit.assignmentLabel === "Synthetic Alice",
      ),
    );
    assert.equal(
      db.sql
        .prepare(
          "SELECT COUNT(*) AS n FROM ai_chart_proposals WHERE status='pending'",
        )
        .get()?.n,
      2,
    );
    assert.equal(
      db.sql.prepare("SELECT COUNT(*) AS n FROM ai_activity_events").get()?.n,
      0,
    );
    db.sql.exec("DROP TRIGGER synthetic_batch_failure");
    assert.equal(
      (
        await post(workspace, {
          action: "review_batch",
          batchId,
          proposalIds: ids,
          decision: "accept",
        })
      ).status,
      200,
    );
    db.sql.close();
    db = testDatabase(file);
    const resumed = (await workspace
      .GET(
        new Request(
          "http://127.0.0.1/api/monthly-workspace?batchId=" + batchId,
        ),
      )
      .then((r) => r.json())) as any;
    assert.equal(resumed.report.changedCharts, 2);
    assert.equal(resumed.report.pendingCount, 0);
    assert.equal(resumed.report.decisions.length, 2);
    for (const c of await library()) {
      const marked = await post(charts, {
        action: "transition_status",
        chartId: c.id,
        targetStatus: "current",
        expectedVersion: c.version,
        expectedUpdatedAt: c.updatedAt,
        currentBy: "Synthetic reviewer",
        acknowledgeReview: true,
      });
      assert.equal(marked.status, 200);
      assert.equal(
        marked.data.chart.nodes[0].data.unit.sourceCertainty,
        "needs_review",
      );
    }
    assert.equal(
      (
        await post(history, {
          action: "complete",
          batchId,
          summary: "Updated both appearances; source notes retained",
        })
      ).status,
      200,
    );
    const today = new Date().toISOString().slice(0, 10);
    const answer = await post(answers, {
      mode: "roles",
      organization: "Physics",
      asOf: today,
    });
    assert.equal(answer.status, 200);
    assert.equal(answer.data.roles.length, 1);
    assert.equal(answer.data.roles[0].person, "Synthetic Bob");
    assert.equal(answer.data.roles[0].evidence.length, 2);
    const gap = await post(answers, {
      mode: "roles",
      organization: "Physics",
      asOf: "1900-01-01",
    });
    assert.equal(gap.data.roles.length, 0);
    assert.equal(gap.data.missingCharts.length, 2);
    const backup = (await backups
      .GET(new Request("http://127.0.0.1/api/backups"))
      .then((r) => r.json())) as any;
    assert.equal(backup.monthlyUpdates[0].status, "completed");
    assert.ok(
      backup.checkpoints.some(
        (h: any) =>
          h.chart.nodes[0].data.unit.assignmentLabel === "Synthetic Alice",
      ),
    );
    const restored = await post(backups, backup);
    assert.equal(restored.status, 201);
    assert.equal(restored.data.restoredCharts.length, 2);
    assert.ok(
      restored.data.restoredCharts.every(
        (c: ChartDocument) => c.status === "current",
      ),
    );
    assert.equal(
      restored.data.restoredCheckpointCount,
      backup.checkpoints.length,
    );
    assert.ok((await library()).some((c) => c.id === "synthetic-a"));
    const later = (await library()).find(c => c.id === a.id)!;
    later.nodes[0].data.unit.assignmentLabel = "Synthetic Later Holder";
    const future = new Date(Date.now()+86_400_000).toISOString();
    db.sql.prepare("UPDATE charts SET status='draft',updated_at=?,payload=? WHERE id=?").run(future, JSON.stringify({nodes:later.nodes,edges:later.edges,lifecycle:later.lifecycle}),a.id);
    db.sql.prepare("INSERT INTO ai_activity_events(id,chart_id,proposal_id,operation,status,summary,change_count,changed_node_ids,changed_edge_ids,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run("later-decision",a.id,"later-proposal","replace_chart_draft","accepted","Synthetic later decision",1,"[]","[]",future);
    const oldMonth = await workspace.GET(new Request("http://127.0.0.1/api/monthly-workspace?batchId="+batchId)).then(r=>r.json()) as any;
    assert.equal(oldMonth.report.stateBasis,"completed_checkpoints");
    assert.equal(oldMonth.report.currentCharts,2);
    assert.equal(oldMonth.report.decisions.length,2);
    assert.ok(oldMonth.report.rows.every((r:any)=>r.status==="current"));
  } finally {
    db.sql.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("cross-chart checks constrain related evidence to selected chart scope", async () => {
  const db = testDatabase();
  try {
    const a = seed(db, "scope-a"),
      b = seed(db, "scope-b");
    b.nodes[0].data.unit.assignmentLabel = "Synthetic Other";
    db.sql
      .prepare("UPDATE charts SET payload=? WHERE id=?")
      .run(
        JSON.stringify({
          nodes: b.nodes,
          edges: b.edges,
          lifecycle: b.lifecycle,
        }),
        b.id,
      );
    const full = (await consistency
      .GET(new Request("http://127.0.0.1/api/consistency?chartId=" + a.id))
      .then((r) => r.json())) as any;
    assert.equal(full.issues.length, 1);
    const limited = (await consistency
      .GET(
        new Request(
          "http://127.0.0.1/api/consistency?chartId=" +
            a.id +
            "&scopeId=" +
            a.id,
        ),
      )
      .then((r) => r.json())) as any;
    assert.equal(limited.issues.length, 0);
    assert.ok(
      limited.related.every((g: any) =>
        g.appearances.every((r: any) => r.chartId === a.id),
      ),
    );
  } finally {
    db.sql.close();
  }
});

test('lost-response reconciliation keeps only pending selections for retry',async()=>{const {remainingReviewSelection}=await import('../lib/monthly-progress');assert.deepEqual([...remainingReviewSelection(new Set(['already-committed','still-pending']),['still-pending'])],['still-pending']);});
