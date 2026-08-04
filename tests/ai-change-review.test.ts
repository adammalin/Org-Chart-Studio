import assert from "node:assert/strict";
import test from "node:test";
import { diffChartDocuments } from "../lib/ai-change-review";
import { createBlankChart } from "../lib/chart-library";

test("AI proposal diff identifies content, structure, and layout fields", () => {
  const current = createBlankChart("Synthetic review chart", "chart-synthetic-review");
  current.createdAt = "2026-08-03T12:00:00.000Z";
  current.updatedAt = "2026-08-03T12:00:00.000Z";
  const root = current.nodes[0];
  const childId = "unit-synthetic-child";
  const proposed = structuredClone(current);
  proposed.description = "Synthetic reviewed description.";
  proposed.nodes[0].data.unit.assignmentLabel = "Synthetic interim leader";
  proposed.nodes[0].data.unit.positionStatus = "acting";
  proposed.nodes[0].position = { x: 48, y: 24 };
  proposed.nodes.push({
    id: childId,
    type: "orgUnit",
    position: { x: 0, y: 240 },
    data: {
      pinned: false,
      unit: {
        ...root.data.unit,
        id: childId,
        name: "Synthetic Child Unit",
        shortName: "Child Unit",
        type: "group",
      },
    },
  });
  proposed.edges.push({ id: "edge-synthetic-child", source: root.id, target: childId });

  const result = diffChartDocuments(current, proposed);

  assert.equal(result.summary.total, 6);
  assert.equal(result.summary.added, 2);
  assert.equal(result.summary.changed, 4);
  assert.deepEqual(result.summary.addedNodeIds, [childId]);
  assert.deepEqual(result.summary.addedEdgeIds, ["edge-synthetic-child"]);
  assert.ok(result.summary.changedNodeIds.includes(root.id));
  assert.ok(result.changes.some((change) => change.fieldLabel === "Position status"));
  assert.ok(result.changes.some((change) => change.fieldLabel === "Card position"));
  assert.ok(result.changes.some((change) => change.fieldLabel === "Chart description"));
});

test("AI proposal diff reports removed cards and relationships", () => {
  const current = createBlankChart("Synthetic removal chart", "chart-synthetic-removal");
  const child = structuredClone(current.nodes[0]);
  child.id = "unit-to-remove";
  child.data.unit.id = child.id;
  child.data.unit.name = "Unit to remove";
  child.data.unit.shortName = "Remove";
  current.nodes.push(child);
  current.edges.push({ id: "edge-to-remove", source: current.nodes[0].id, target: child.id });
  const proposed = structuredClone(current);
  proposed.nodes = proposed.nodes.slice(0, 1);
  proposed.edges = [];

  const result = diffChartDocuments(current, proposed);

  assert.deepEqual(result.summary.removedNodeIds, ["unit-to-remove"]);
  assert.deepEqual(result.summary.removedEdgeIds, ["edge-to-remove"]);
  assert.equal(result.summary.removed, 2);
});
