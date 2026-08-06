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

test("AI proposal diff treats source-review metadata as reviewable changes", () => {
  const current = createBlankChart("Source review chart", "chart-source-review");
  const root = current.nodes[0];
  const child = structuredClone(root);
  child.id = "unit-source-review-child";
  child.data.unit.id = child.id;
  child.data.unit.name = "Source Review Child";
  child.data.unit.shortName = "Review Child";
  current.nodes.push(child);
  current.edges.push({
    id: "edge-source-review-child",
    source: root.id,
    target: child.id,
    data: {
      relationshipType: "primary supervisory",
      sourceLocator: "Slide 1; connector 4",
      sourceCertainty: "confirmed",
      reviewNote: "",
    },
  });

  const proposed = structuredClone(current);
  proposed.nodes[0].data.unit.sourceLocator = "Slide 1; shape 2";
  proposed.nodes[0].data.unit.sourceCertainty = "needs_review";
  proposed.nodes[0].data.unit.reviewNote = "Verify the name-to-position mapping.";
  proposed.nodes[0].data.unit.planningState = "planned";
  proposed.edges[0].data = {
    ...proposed.edges[0].data,
    relationshipType: "secondary supervisory",
    sourceLocator: "Slide 1; connector 6",
    sourceCertainty: "needs_review",
    reviewNote: "Verify the reporting line against the source.",
  };

  const result = diffChartDocuments(current, proposed);

  assert.equal(result.summary.total, 8);
  assert.equal(result.summary.changed, 8);
  assert.deepEqual(result.summary.changedNodeIds, [root.id]);
  assert.deepEqual(result.summary.changedEdgeIds, ["edge-source-review-child"]);
  assert.deepEqual(
    result.changes.map((item) => item.fieldLabel),
    [
      "Source locator",
      "Source certainty",
      "Source review note",
      "Planning state",
      "Relationship type",
      "Source locator",
      "Source certainty",
      "Source review note",
    ],
  );
});
