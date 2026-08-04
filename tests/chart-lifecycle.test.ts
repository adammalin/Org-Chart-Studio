import assert from "node:assert/strict";
import test from "node:test";
import {
  createBlankChart,
  normalizeChartLifecycle,
  normalizeChartStatus,
} from "../lib/chart-library";
import {
  canTransitionChartStatus,
  currentReadiness,
  lifecycleTransitionError,
} from "../lib/chart-lifecycle";

test("legacy Approved records migrate to Current with an inferred approval record", () => {
  const updatedAt = "2026-08-04T12:00:00.000Z";
  const status = normalizeChartStatus("approved");
  const lifecycle = normalizeChartLifecycle(null, status, updatedAt, 7, true);

  assert.equal(status, "current");
  assert.equal(lifecycle.lastCurrentAt, updatedAt);
  assert.equal(lifecycle.lastCurrentVersion, 7);
  assert.equal(lifecycle.lastCurrentBy, "Migrated approved record");
});

test("chart lifecycle permits the governed workflow and blocks skipped approval steps", () => {
  assert.equal(canTransitionChartStatus("draft", "in_review"), true);
  assert.equal(canTransitionChartStatus("in_review", "current"), true);
  assert.equal(canTransitionChartStatus("current", "archived"), true);
  assert.equal(canTransitionChartStatus("archived", "draft"), true);
  assert.equal(canTransitionChartStatus("draft", "current"), false);
  assert.equal(canTransitionChartStatus("archived", "current"), false);
});

test("Current readiness requires valid structure and a clear source review queue", () => {
  const chart = createBlankChart("Lifecycle test", "chart-lifecycle-test");
  chart.status = "in_review";
  assert.equal(currentReadiness(chart).ready, true);
  assert.equal(lifecycleTransitionError(chart, "current"), null);

  chart.nodes[0].data.unit.sourceCertainty = "needs_review";
  const readiness = currentReadiness(chart);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.reviewItems, 1);
  assert.match(lifecycleTransitionError(chart, "current") ?? "", /source review item/i);
});

test("only In review charts may be marked Current", () => {
  const chart = createBlankChart("Draft lifecycle test", "chart-draft-lifecycle-test");
  assert.match(lifecycleTransitionError(chart, "current") ?? "", /cannot move directly|only.*In review/i);
});
