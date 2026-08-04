import assert from "node:assert/strict";
import test from "node:test";
import {
  auditChartQuality,
  compareChartDocuments,
  mergeSourceIntoTarget,
  planningStateForNode,
} from "../lib/chart-governance";
import { createBlankChart } from "../lib/chart-library";

test("quality audit identifies planned, uncertain, duplicate, and wide-span records", () => {
  const chart = createBlankChart("Synthetic governance test", "chart-governance");
  const root = chart.nodes[0];
  root.data.unit.sourceCertainty = "needs_review";
  root.data.unit.planningState = "planned";
  root.data.unit.effectiveDate = "Current";
  const children = Array.from({ length: 13 }, (_, index) => ({
    ...structuredClone(root),
    id: `child-${index}`,
    data: {
      ...structuredClone(root.data),
      unit: {
        ...structuredClone(root.data.unit),
        id: `child-${index}`,
        name: index < 2 ? "Duplicate unit" : `Child ${index}`,
        shortName: `Child ${index}`,
        planningState: "current" as const,
        sourceCertainty: "confirmed" as const,
      },
    },
  }));
  const nodes = [root, ...children];
  const edges = children.map((node) => ({
    id: `edge-${root.id}-${node.id}`,
    source: root.id,
    target: node.id,
    type: "smoothstep",
    data: { relationshipType: "primary supervisory" },
  }));

  const report = auditChartQuality(nodes, edges);

  assert.equal(planningStateForNode(root), "planned");
  assert.equal(report.findings.some((finding) => finding.code === "SOURCE_NEEDS_REVIEW"), true);
  assert.equal(report.findings.some((finding) => finding.code === "PLANNED_WITHOUT_EFFECTIVE_DATE"), true);
  assert.equal(report.findings.some((finding) => finding.code === "POSSIBLE_DUPLICATE_UNIT"), true);
  assert.equal(report.findings.some((finding) => finding.code === "WIDE_SPAN_OF_CONTROL"), true);
  assert.ok(report.score < 100);
});

test("chart comparison and merge preserve target identity while applying source content", () => {
  const target = createBlankChart("Target", "chart-target");
  const source = createBlankChart("Source", "chart-source");
  source.nodes[0].data.unit.name = "Source organization";
  source.nodes[0].data.unit.sourceLocator = "Slide 4";

  const comparison = compareChartDocuments(target, source);
  const merged = mergeSourceIntoTarget(target, source);

  assert.ok(comparison.totalChanges > 0);
  assert.equal(merged.id, target.id);
  assert.equal(merged.name, target.name);
  assert.equal(merged.nodes[0].data.unit.name, "Source organization");
  assert.equal(merged.nodes[0].data.unit.sourceLocator, "Slide 4");
});
