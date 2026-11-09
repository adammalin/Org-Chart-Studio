import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { schemaStatements } from "../db/schema";
import { createBlankChart } from "../lib/chart-library";
import { diffChartDocuments, type AiChartProposal } from "../lib/ai-change-review";
import { finishPendingProposal, getPendingProposal, listPendingProposalSummaries, savePendingProposal } from "../lib/pending-proposal-store";

// Exercise the real SQL against SQLite, including D1's atomic batch semantics.
function open(path = ":memory:") {
  const sql = new DatabaseSync(path);
  for (const statement of schemaStatements) sql.exec(statement);
  const prepare = (query: string) => {
    let values: (string | number | null)[] = [];
    const statement = {
      bind: (...args: typeof values) => { values = args; return statement; },
      first: async () => sql.prepare(query).get(...values) ?? null,
      all: async () => ({ results: sql.prepare(query).all(...values) }),
      run: async () => ({ meta: sql.prepare(query).run(...values) }),
    };
    return statement;
  };
  const db = { prepare, batch: async (statements: ReturnType<typeof prepare>[]) => {
    sql.exec("BEGIN");
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec("COMMIT"); return results; }
    catch (error) { sql.exec("ROLLBACK"); throw error; }
  } } as unknown as D1Database;
  return { sql, db };
}
function proposal(id: string, chartId = id): AiChartProposal {
  const current = createBlankChart("Synthetic review " + chartId, chartId);
  const proposed = structuredClone(current);
  proposed.nodes[0].data.unit.assignmentLabel = "Synthetic leader";
  return { id, chartId, chartName: current.name, operation: "replace_chart_draft", status: "pending",
    changeSummary: "Synthetic correction", createdAt: "2026-11-09T19:00:00Z", expiresAt: null,
    current, proposed, ...diffChartDocuments(current, proposed) };
}
function chart(sql: DatabaseSync, id: string) {
  sql.prepare("INSERT INTO charts(id,name,created_at,updated_at,payload) VALUES (?,?,'now','now','{}')").run(id, id);
}

test("136 reviews survive repeated summary reads and closing/reopening the database", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synthetic-proposals-"));
  const path = join(dir, "reviews.sqlite");
  let store = open(path);
  try {
    for (let i = 0; i < 136; i++) { const id = `synthetic-${i}`; chart(store.sql, id); await savePendingProposal(store.db, proposal(id)); }
    for (let i = 0; i < 3; i++) assert.equal((await listPendingProposalSummaries(store.db)).length, 136);
    store.sql.close(); store = open(path);
    const summaries = await listPendingProposalSummaries(store.db);
    assert.equal(summaries.length, 136);
    assert.ok(summaries.every((item) => item.expiresAt === null && !("proposed" in item) && !("current" in item)));
    assert.equal((await getPendingProposal(store.db, "synthetic-0"))?.proposed.nodes[0].data.unit.assignmentLabel, "Synthetic leader");
  } finally { store.sql.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("replacement keeps one current review per chart and preserves previous payload", async () => {
  const { sql, db } = open();
  try {
    chart(sql, "synthetic");
    await savePendingProposal(db, proposal("old", "synthetic"));
    await savePendingProposal(db, proposal("new", "synthetic"));
    assert.deepEqual((await listPendingProposalSummaries(db)).map((item) => item.id), ["new"]);
    assert.equal(await getPendingProposal(db, "old"), null);
    const old = sql.prepare("SELECT status,payload FROM ai_chart_proposals WHERE id='old'").get();
    assert.equal(old?.status, "superseded"); assert.ok(old?.payload);
  } finally { sql.close(); }
});

test("failed replacement rolls back without losing the pending review", async () => {
  const { sql, db } = open();
  try {
    chart(sql, "synthetic"); await savePendingProposal(db, proposal("same", "synthetic"));
    await assert.rejects(savePendingProposal(db, proposal("same", "synthetic")));
    assert.equal((await getPendingProposal(db, "same"))?.id, "same");
  } finally { sql.close(); }
});

test("accepted, rejected and stale reviews leave the queue but retain recovery history", async () => {
  const { sql, db } = open();
  try {
    for (const status of ["accepted", "rejected", "stale"] as const) {
      chart(sql, status); await savePendingProposal(db, proposal(status));
      await finishPendingProposal(db, status, status);
      assert.equal(await getPendingProposal(db, status), null);
      assert.equal(sql.prepare("SELECT status FROM ai_chart_proposals WHERE id=?").get(status)?.status, status);
    }
    assert.equal((await listPendingProposalSummaries(db)).length, 0);
    assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM ai_chart_proposals").get()?.n, 3);
  } finally { sql.close(); }
});
