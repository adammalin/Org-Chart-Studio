import assert from "node:assert/strict";
import test from "node:test";
import {
  parseHistoryQuestion,
  roleAnswers,
  changeAnswers,
} from "../lib/history-answers";
import { createBlankChart } from "../lib/chart-library";
import type { HistoryCheckpoint } from "../lib/chart-history";
function snapshot(id: string, person: string, date: string): HistoryCheckpoint {
  const c = createBlankChart("Synthetic Physics", "synthetic");
  c.nodes[0].id = "root";
  c.nodes[0].data.unit.id = "root";
  c.nodes[0].data.unit.name = "Synthetic Physics";
  c.nodes[0].data.unit.assignmentLabel = person;
  c.nodes[0].data.unit.positionTitle = "Director";
  return {
    id,
    chartId: c.id,
    chartName: c.name,
    recordedAt: date + "T12:00:00Z",
    sourceUpdatedAt: date + "T12:00:00Z",
    kind: "after",
    label: "Synthetic change",
    batchId: null,
    effectiveDate: "",
    chart: c,
  };
}
test("dated questions parse with explicit interpretations and real calendar dates", () => {
  const q = parseHistoryQuestion({
    question: "Who led Physics in October 2026?",
    referenceDate: "2026-11-09",
  });
  assert.equal(q.organization, "Physics");
  assert.equal(q.since, "2026-10-01");
  assert.equal(q.asOf, "2026-10-31");
  assert.equal(q.period, true);
  assert.equal(
    parseHistoryQuestion({
      question: "What changed since last month?",
      referenceDate: "2026-01-09",
    }).since,
    "2025-12-01",
  );
  assert.throws(
    () => parseHistoryQuestion({ chartId: "x", asOf: "2026-02-30" }),
    /calendar/,
  );
});
test("recorded role results preserve conflicting appearances and their checkpoint evidence", () => {
  const a = snapshot("a", "Synthetic Alice", "2026-10-01"),
    b = snapshot("b", "Synthetic Bob", "2026-10-20");
  const answers = roleAnswers(
    [a, b],
    parseHistoryQuestion({
      question: "Who led Physics in October 2026?",
      referenceDate: "2026-11-09",
    }),
  );
  assert.equal(answers.length, 2);
  assert.deepEqual(
    answers.map((a) => a.evidence[0].checkpointId),
    ["a", "b"],
  );
});
test("change answers report coverage gaps rather than inventing a new organization", () => {
  const b = snapshot("b", "Synthetic Bob", "2026-11-09"),
    p = parseHistoryQuestion({ question: "What changed since 2026-10-01?" });
  assert.equal(changeAnswers([], [b], p).gaps.length, 1);
  const a = snapshot("a", "Synthetic Alice", "2026-10-01");
  assert.ok(
    changeAnswers([a], [b], p).changes[0].changes.some(
      (c) => c.field === "assignmentLabel",
    ),
  );
});

test("planned assignments are excluded and unresolved source notes travel with evidence", () => {
  const current = snapshot("current", "Synthetic Current", "2026-11-09");
  current.chart.nodes[0].data.unit.reviewNote = "Synthetic source disagreement";
  const planned = snapshot("planned", "Synthetic Future", "2026-11-09");
  planned.chart.nodes[0].data.unit.planningState = "planned";
  const results = roleAnswers([current, planned],parseHistoryQuestion({chartId:current.chartId}));
  assert.equal(results.length,1);
  assert.equal(results[0].person,"Synthetic Current");
  assert.equal(results[0].evidence[0].reviewNote,"Synthetic source disagreement");
});
