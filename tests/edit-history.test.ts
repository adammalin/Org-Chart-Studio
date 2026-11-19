/* eslint-disable @typescript-eslint/no-explicit-any -- Synthetic integration responses. */
import { testDatabase } from "./helpers/test-db";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { supportFixture } from "./helpers/support-fixture";
import { editBackupError } from "../lib/edit-history-backup";
import { inverseEdit, readEditChart } from "../lib/edit-history";
const charts = await import("../app/api/charts/route"),
  edits = await import("../app/api/edit-history/route"),
  proposals = await import("../app/api/ai-proposals/route"),
  backups = await import("../app/api/backups/route");
async function post(
  route: { POST: (r: Request) => Promise<Response> },
  body: unknown,
) {
  const r = await route.POST(
    new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: r.status, data: (await r.json()) as any };
}
async function status(id: string) {
  const r = await edits.GET(
    new Request(`http://localhost/api/edit-history?chartId=${id}`),
  );
  assert.equal(r.status, 200);
  return (await r.json()) as any;
}
async function create(name = "Synthetic History") {
  const r = await post(charts, { action: "create", name });
  assert.equal(r.status, 201);
  return r.data.chart;
}
async function save(c: any, label = "Synthetic edit") {
  const r = await post(charts, { action: "save", chart: c, label });
  assert.equal(r.status, 200, r.data.error);
  return r.data.chart;
}
function replayBody(s: any, action = "undo") {
  return {
    action,
    chartId: s.chartId,
    operationId: s[action].id,
    expectedRevision: s.revision,
    expectedVersion: s.expectedVersion,
    expectedUpdatedAt: s.expectedUpdatedAt,
    requestId: `history-request-${crypto.randomUUID()}`,
  };
}
async function replay(id: string, action = "undo") {
  const s = await status(id);
  const body = replayBody(s, action),
    r = await post(edits, body);
  assert.equal(r.status, 200, r.data.error);
  return { body, ...r.data };
}

test("persistent complete edits survive database reopen, chart switching, undo and redo", async () => {
  const folder = mkdtempSync(join(tmpdir(), "orgchart-history-")),
    path = join(folder, "synthetic.sqlite");
  let db = testDatabase(path);
  try {
    const blank = await create();
    let c = await save(
      {
        ...supportFixture(blank.id),
        version: blank.version,
        createdAt: blank.createdAt,
        updatedAt: blank.updatedAt,
      },
      "Import synthetic support layout",
    );
    const original = structuredClone(c);
    c.name = "Synthetic renamed chart";
    c.description = "Synthetic description";
    c.supportPanels[0].entries[0].person = "Synthetic New Support";
    c.supportPanels[0].geometry.x += 20;
    c.nodes[0].position.x += 50;
    c.nodes[0].data.unit.assignmentLabel = "Synthetic New Director";
    c = await save(c, "Edit complete chart and support layout");
    await create("Synthetic other chart");
    assert.equal(
      (await status(c.id)).undo.label,
      "Edit complete chart and support layout",
    );
    db.sql.close();
    db = testDatabase(path);
    const undone = await replay(c.id);
    for (const key of [
      "name",
      "description",
      "nodes",
      "edges",
      "supportPanels",
      "sourceLayout",
    ])
      assert.deepEqual(undone.chart[key], original[key], key);
    assert.equal(undone.chart.status, "draft");
    assert.ok((await status(c.id)).redo);
    const redone = await replay(c.id, "redo");
    for (const key of [
      "name",
      "description",
      "nodes",
      "edges",
      "supportPanels",
      "sourceLayout",
    ])
      assert.deepEqual(redone.chart[key], c[key], key);
    assert.equal((await status(c.id)).events[0].action, "redo");
  } finally {
    db.sql.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
test("history has no 40-step cap; paging, new branches and per-chart isolation", async () => {
  const db = testDatabase();
  try {
    let c = await create();
    const other = await create("Synthetic Independent");
    for (let i = 0; i < 65; i++) {
      c.description = `Synthetic edit ${i}`;
      c = await save(c, `Edit ${i}`);
    }
    const s = await status(c.id);
    assert.equal(s.operations.length, 50);
    assert.ok(s.nextCursor);
    assert.equal((await status(other.id)).undo, null);
    const page = (await edits
      .GET(
        new Request(
          `http://localhost/api/edit-history?chartId=${c.id}&before=${s.nextCursor}`,
        ),
      )
      .then((r) => r.json())) as any;
    assert.equal(page.operations.length, 15);
    await replay(c.id);
    const undone = await status(c.id);
    assert.equal(undone.redo.label, "Edit 64");
    const current = await readEditChart(db.db, c.id);
    current.description = "Synthetic different branch";
    await save(current, "New branch");
    const branched = await status(c.id);
    assert.equal(branched.redo, null);
    assert.equal(
      branched.operations.find((o: any) => o.id === undone.redo.id).state,
      "superseded",
    );
    const stale = await post(edits, replayBody(undone, "redo"));
    assert.equal(stale.status, 409);
  } finally {
    db.sql.close();
  }
});
test("accepted agent proposals share the undo stack and keep provenance", async () => {
  const db = testDatabase();
  try {
    const c = await create(),
      next = structuredClone(c);
    next.nodes[0].data.unit.assignmentLabel = "Synthetic Agent Director";
    const staged = await post(proposals, {
      action: "stage",
      chart: next,
      changeSummary: "Synthetic agent update",
    });
    assert.equal(staged.status, 201);
    await post(proposals, {
      action: "accept",
      proposalId: staged.data.proposal.id,
    });
    const s = await status(c.id);
    assert.equal(s.undo.actor, "agent");
    assert.equal(s.undo.groupId, staged.data.proposal.id);
    const undone = await replay(c.id);
    assert.equal(
      undone.chart.nodes[0].data.unit.assignmentLabel,
      c.nodes[0].data.unit.assignmentLabel,
    );
    const redone = await replay(c.id, "redo");
    assert.equal(
      redone.chart.nodes[0].data.unit.assignmentLabel,
      "Synthetic Agent Director",
    );
  } finally {
    db.sql.close();
  }
});
test("stale replay, duplicate clicks, pending reviews and lost-response retries are safe", async () => {
  const db = testDatabase();
  try {
    let c = await create();
    c.description = "Synthetic first";
    c = await save(c);
    const old = await status(c.id);
    const body = replayBody(old);
    const first = await post(edits, body);
    assert.equal(first.status, 200);
    assert.equal(
      (
        await post(edits, {
          ...body,
          requestId: `history-request-${crypto.randomUUID()}`,
        })
      ).status,
      409,
    );
    let current = first.data.chart;
    current.description = "Synthetic later";
    current = await save(current);
    const receipt = await post(edits, body);
    assert.equal(receipt.status, 200);
    assert.equal(receipt.data.alreadyApplied, true);
    assert.equal(receipt.data.chart.description, "Synthetic later");
    const next = structuredClone(current);
    next.description = "Synthetic pending";
    const staged = await post(proposals, { action: "stage", chart: next });
    assert.equal(staged.status, 201);
    const blocked = await post(edits, replayBody(await status(c.id)));
    assert.equal(blocked.status, 409);
    assert.match(blocked.data.error, /pending/);
  } finally {
    db.sql.close();
  }
});
test("failed recovery transaction rolls back chart, stack, receipt and checkpoints together", async () => {
  const db = testDatabase();
  try {
    let c = await create();
    c.description = "Synthetic saved";
    c = await save(c);
    const s = await status(c.id),
      before = db.sql
        .prepare("SELECT COUNT(*) AS n FROM chart_checkpoints")
        .get() as any;
    db.sql.exec(
      "CREATE TRIGGER fail_recovery BEFORE INSERT ON chart_edit_events WHEN NEW.action='undo' BEGIN SELECT RAISE(ABORT,'synthetic disk failure'); END",
    );
    const r = await post(edits, replayBody(s));
    assert.equal(r.status, 409);
    assert.equal((await readEditChart(db.db, c.id)).description, c.description);
    const after = await status(c.id);
    assert.deepEqual(after.undo, s.undo);
    assert.equal(after.redo, null);
    assert.equal(after.revision, s.revision);
    assert.deepEqual(
      db.sql.prepare("SELECT COUNT(*) AS n FROM chart_checkpoints").get(),
      before,
    );
    assert.equal(
      (
        db.sql
          .prepare("SELECT COUNT(*) AS n FROM chart_edit_context")
          .get() as any
      ).n,
      0,
    );
  } finally {
    db.sql.close();
  }
});
test("reviewed older-operation reverts keep later fields and block conflicts", async () => {
  const db = testDatabase();
  try {
    let c = await create();
    c.nodes[0].data.unit.assignmentLabel = "Synthetic original";
    c = await save(c);
    c.nodes[0].data.unit.assignmentLabel = "Synthetic agent";
    c = await save(c, "Synthetic targeted edit");
    const target = (await status(c.id)).undo.id;
    c.nodes[0].data.unit.positionTitle = "Synthetic later role";
    c = await save(c, "Later independent role");
    const url = `http://localhost/api/edit-history?chartId=${c.id}&operationId=${target}&previewRevert=1`;
    const r = await edits.GET(new Request(url)),
      d = (await r.json()) as any;
    assert.equal(r.status, 200, d.error);
    assert.equal(
      d.proposed.nodes[0].data.unit.assignmentLabel,
      "Synthetic original",
    );
    assert.equal(
      d.proposed.nodes[0].data.unit.positionTitle,
      "Synthetic later role",
    );
    assert.equal(
      (await readEditChart(db.db, c.id)).nodes[0].data.unit.assignmentLabel,
      "Synthetic agent",
    );
    c.nodes[0].data.unit.assignmentLabel = "Synthetic subsequent correction";
    await save(c);
    const conflict = await edits.GET(new Request(url));
    assert.equal(conflict.status, 409);
    assert.throws(
      () =>
        inverseEdit(
          [{ id: "a", v: 1 }],
          [{ id: "a", v: 2 }],
          [{ id: "a", v: 3 }],
        ),
      /conflicts/,
    );
  } finally {
    db.sql.close();
  }
});
test("undo preserves later source checks and never silently reapproves Current", async () => {
  const db = testDatabase();
  try {
    let c = await create();
    c.nodes[0].data.unit.assignmentLabel = "Synthetic new holder";
    c = await save(c);
    const checked = await post(charts, {
      action: "record_source_check",
      chartId: c.id,
      expectedVersion: c.version,
      expectedUpdatedAt: c.updatedAt,
      sourceCheck: {
        reviewerType: "ai",
        checkedBy: "Synthetic AI",
        sourceUrl: "https://example.test/org",
        sourceLocator: "Synthetic page 1",
        result: "matches",
        scope: "full_chart",
        findings: "Synthetic source comparison",
      },
    });
    assert.equal(checked.status, 201, checked.data.error);
    c = checked.data.chart;
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
    const undone = await replay(c.id);
    assert.equal(undone.chart.status, "draft");
    assert.equal(undone.chart.sourceChecks.length, 1);
    const redo = await replay(c.id, "redo");
    assert.equal(redo.chart.status, "draft");
    assert.equal(redo.chart.sourceChecks.length, 1);
  } finally {
    db.sql.close();
  }
});
test("schema 7 backup restores functioning undo/redo into copies and rejects broken journal links", async () => {
  const db = testDatabase();
  try {
    let c = await create();
    c.description = "Synthetic original saved";
    c = await save(c, "First edit");
    c.description = "Synthetic final saved";
    c = await save(c, "Second edit");
    await replay(c.id);
    const exported = (await backups
      .GET(new Request(`http://localhost/api/backups?chartId=${c.id}`))
      .then((r) => r.json())) as any;
    assert.equal(exported.schemaVersion, 7);
    assert.equal(exported.editHistory.operations.length, 2);
    const imported = await post(backups, exported);
    assert.equal(imported.status, 201, imported.data.error);
    const copy = imported.data.restoredCharts[0];
    assert.notEqual(copy.id, c.id);
    assert.equal((await status(copy.id)).redo.label, "Second edit");
    const redone = await replay(copy.id, "redo");
    assert.equal(redone.chart.description, "Synthetic final saved");
    assert.match(redone.chart.name, /Restored/);
    assert.equal(
      (await readEditChart(db.db, c.id)).description,
      "Synthetic original saved",
    );
    exported.editHistory.events[0].operation_id = "missing-synthetic-operation";
    assert.equal((await post(backups, exported)).status, 422);
  } finally {
    db.sql.close();
  }
});

test("archive recovery is reversible while Current designation remains a separate decision", async () => {
  const db = testDatabase();
  try {
    let c = await create();
    c.description = "Synthetic saved before archive";
    c = await save(c);
    const archived = await post(charts, {
      action: "transition_status",
      chartId: c.id,
      targetStatus: "archived",
      expectedVersion: c.version,
      expectedUpdatedAt: c.updatedAt,
    });
    assert.equal(archived.status, 200);
    const undone = await replay(c.id);
    assert.equal(undone.chart.status, "draft");
    assert.equal(undone.chart.description, c.description);
    const redone = await replay(c.id, "redo");
    assert.equal(redone.chart.status, "archived");
  } finally {
    db.sql.close();
  }
});
test("recovery blocks a library-parent cycle introduced by another chart", async () => {
  const db = testDatabase();
  try {
    let a = await create("Synthetic Parent A"),
      b = await create("Synthetic Parent B");
    a.libraryParentId = b.id;
    a = await save(a, "Synthetic parent link");
    a.libraryParentId = null;
    a = await save(a, "Synthetic detach");
    b.libraryParentId = a.id;
    b = await save(b, "Synthetic other parent changed");
    const r = await post(edits, replayBody(await status(a.id)));
    assert.equal(r.status, 409);
    assert.match(r.data.error, /cycle/);
    assert.equal((await readEditChart(db.db, a.id)).libraryParentId, null);
  } finally {
    db.sql.close();
  }
});

test("older structural reverts preserve the order of later additions and reject ambiguous reorders", () => {
  const before = [
      { id: "a", value: 1 },
      { id: "deleted", value: 2 },
      { id: "c", value: 3 },
    ],
    after = [before[0], before[2]],
    current = [after[0], { id: "later", value: 4 }, after[1]];
  const result = inverseEdit(before, after, current) as { id: string }[];
  assert.deepEqual(
    result.filter((x) => x.id !== "deleted").map((x) => x.id),
    ["a", "later", "c"],
  );
  assert.ok(result.some((x) => x.id === "deleted"));
  assert.throws(
    () =>
      inverseEdit(
        [{ id: "a" }, { id: "b" }],
        [{ id: "b" }, { id: "a" }],
        [{ id: "b" }, { id: "new" }, { id: "a" }],
      ),
    /ordering/,
  );
});

test("history returns safe client errors for malformed JSON", async () => {
  const response = await edits.POST(new Request('http://localhost/api/edit-history', {method:'POST', headers:{'content-type':'application/json'}, body:'{broken'}));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {error:'The request is not valid JSON.'});
});

test("backup restore rejects malformed recovery snapshots before writing any charts", async () => {
  const db = testDatabase();
  try {
    let c = await create(); c.description = 'Synthetic change'; c = await save(c);
    const exported = await backups.GET(new Request(`http://localhost/api/backups?chartId=${c.id}`)).then(r=>r.json()) as any;
    const before = db.sql.prepare('SELECT COUNT(*) AS n FROM charts').get();
    const inReview = structuredClone(exported.editHistory);
    for (const op of inReview.operations) for (const field of ['before_state','after_state']) {
      const state = JSON.parse(op[field]); state.status = 'in_review'; op[field] = JSON.stringify(state);
    }
    assert.equal(editBackupError(inReview,new Set([c.id])), null, 'valid In review snapshots must remain portable');
    for (const mutate of [
      (s:any)=>{s.description = {};},
      (s:any)=>{s.version = -1;},
      (s:any)=>{s.status = 'invalid';},
      (s:any)=>{s.updatedAt = 'invalid';},
      (s:any)=>{s.payload.nodes[0].position.x = 'invalid';},
      (s:any)=>{s.payload.nodes[0].data.unit.assignmentLabel = {};},
      (s:any)=>{s.payload.edges = [{id:'broken', source:{}, target:'missing'}];},
    ]) {
      const bad = structuredClone(exported), op = bad.editHistory.operations[0];
      const state = JSON.parse(op.before_state); mutate(state); op.before_state = JSON.stringify(state);
      const result = await post(backups,bad);
      assert.equal(result.status,422,result.data.error);
      assert.deepEqual(db.sql.prepare('SELECT COUNT(*) AS n FROM charts').get(), before);
    }
  } finally { db.sql.close(); }
});


test("history does not expose internal database errors", async () => {
  const db = testDatabase();
  const c = await create(); db.sql.close();
  const response = await edits.GET(new Request(`http://localhost/api/edit-history?chartId=${c.id}`));
  assert.equal(response.status,500);
  assert.deepEqual(await response.json(), {error:'History request failed. Refresh the saved workspace and try again.'});
});
