import assert from "node:assert/strict";
import test from "node:test";
import {
  arrangeCompactPresentation,
  arrangeSelectedNodes,
  deriveCompactPresentation,
  descendantIds,
  initialEdges,
  initialNodes,
  positionBranchNodesFromSnapshot,
  runElkLayout,
  selectionMovementIds,
  translateBranchNodes,
  validateHierarchy,
} from "../lib/org-chart";

test("the synthetic fixture is a valid acyclic hierarchy", () => {
  assert.deepEqual(validateHierarchy(initialNodes, initialEdges), []);
});

test("validation rejects a reporting cycle", () => {
  const findings = validateHierarchy(initialNodes, [
    ...initialEdges,
    {
      id: "edge-cycle",
      source: "unit-quantum-networking",
      target: "unit-lab",
    },
  ]);

  assert.ok(findings.some((finding) => finding.code === "REPORTING_CYCLE"));
});

test("validation rejects a relationship with a missing endpoint", () => {
  const findings = validateHierarchy(initialNodes, [
    ...initialEdges,
    {
      id: "edge-missing",
      source: "unit-lab",
      target: "unit-not-present",
    },
  ]);

  assert.ok(findings.some((finding) => finding.code === "MISSING_ENDPOINT"));
});

test("validation rejects duplicate unit identifiers", () => {
  const findings = validateHierarchy(
    [...initialNodes, { ...initialNodes[0] }],
    initialEdges,
  );

  assert.ok(findings.some((finding) => finding.code === "DUPLICATE_UNIT_ID"));
});

test("validation rejects multiple primary parents", () => {
  const findings = validateHierarchy(initialNodes, [
    ...initialEdges,
    {
      id: "edge-extra-parent",
      source: "unit-operations",
      target: "unit-quantum-networking",
      data: { relationshipType: "primary supervisory" },
    },
  ]);

  assert.ok(
    findings.some((finding) => finding.code === "MULTIPLE_PRIMARY_PARENTS"),
  );
});

test("validation requires exactly one hierarchy root", () => {
  const findings = validateHierarchy(
    initialNodes,
    initialEdges.filter((edge) => edge.target !== "unit-operations"),
  );

  assert.ok(findings.some((finding) => finding.code === "INVALID_ROOT_COUNT"));
});

test("validation rejects an empty chart", () => {
  const findings = validateHierarchy([], []);

  assert.ok(findings.some((finding) => finding.code === "EMPTY_CHART"));
});

test("branch traversal remains inside the selected semantic branch", () => {
  const researchBranch = descendantIds("unit-research", initialEdges);

  assert.ok(researchBranch.has("unit-quantum-networking"));
  assert.ok(researchBranch.has("unit-scientific-software"));
  assert.equal(researchBranch.has("unit-facilities-planning"), false);
});

test("compact presentation groups terminal level-four records without changing hierarchy data", () => {
  const before = JSON.stringify({ nodes: initialNodes, edges: initialEdges });
  const presentation = deriveCompactPresentation(initialNodes, initialEdges);
  const arranged = arrangeCompactPresentation(initialNodes, initialEdges, presentation);

  assert.equal(presentation.levels.get("unit-lab"), 1);
  assert.equal(presentation.levels.get("unit-quantum-networking"), 4);
  assert.ok(presentation.listedNodeIds.has("unit-quantum-networking"));
  assert.ok(
    presentation.entriesByParent
      .get("unit-quantum-division")
      ?.some((entry) => entry.id === "unit-quantum-networking"),
  );
  assert.equal(
    arranged.some((flowNode) => flowNode.id === "unit-quantum-networking"),
    false,
  );
  assert.equal(JSON.stringify({ nodes: initialNodes, edges: initialEdges }), before);
});

test("compact presentation respects card and sidecar overrides", () => {
  const overriddenNodes = initialNodes.map((flowNode) => {
    if (flowNode.id === "unit-quantum-networking") {
      return {
        ...flowNode,
        data: {
          ...flowNode.data,
          unit: { ...flowNode.data.unit, compactDisplay: "card" as const },
        },
      };
    }
    if (flowNode.id === "unit-operations") {
      return {
        ...flowNode,
        data: {
          ...flowNode.data,
          unit: { ...flowNode.data.unit, compactDisplay: "sidecar" as const },
        },
      };
    }
    return flowNode;
  });
  const presentation = deriveCompactPresentation(overriddenNodes, initialEdges);

  assert.equal(presentation.listedNodeIds.has("unit-quantum-networking"), false);
  assert.equal(presentation.sidecarNodeIds.has("unit-operations"), false);
});

test("branch translation moves descendants together without moving unrelated cards", () => {
  const rootId = "unit-research";
  const branchIds = descendantIds(rootId, initialEdges);
  const beforeById = new Map(
    initialNodes.map((flowNode) => [flowNode.id, { ...flowNode.position }]),
  );
  const moved = translateBranchNodes(
    initialNodes,
    initialEdges,
    rootId,
    { x: 125, y: -40 },
    false,
  );

  moved.forEach((flowNode) => {
    const before = beforeById.get(flowNode.id)!;
    if (branchIds.has(flowNode.id) && flowNode.id !== rootId) {
      assert.deepEqual(flowNode.position, {
        x: before.x + 125,
        y: before.y - 40,
      });
      return;
    }
    assert.deepEqual(flowNode.position, before);
  });
});

test("snapshot branch movement keeps every level below an L2 node together", () => {
  const rootId = "unit-research";
  const branchIds = descendantIds(rootId, initialEdges);
  const startingPositions = new Map(
    initialNodes
      .filter((flowNode) => branchIds.has(flowNode.id))
      .map((flowNode) => [flowNode.id, { ...flowNode.position }]),
  );
  const rootStart = startingPositions.get(rootId)!;
  const firstDragFrame = positionBranchNodesFromSnapshot(
    initialNodes,
    branchIds,
    startingPositions,
    rootId,
    { x: rootStart.x + 25, y: rootStart.y + 10 },
  );
  const finalDragFrame = positionBranchNodesFromSnapshot(
    firstDragFrame,
    branchIds,
    startingPositions,
    rootId,
    { x: rootStart.x + 180, y: rootStart.y - 60 },
  );

  for (const nodeId of [
    "unit-research",
    "unit-quantum-division",
    "unit-quantum-networking",
    "unit-scientific-software",
  ]) {
    const before = startingPositions.get(nodeId)!;
    const after = finalDragFrame.find((flowNode) => flowNode.id === nodeId)!.position;
    assert.deepEqual(after, { x: before.x + 180, y: before.y - 60 });
  }
  assert.deepEqual(
    finalDragFrame.find((flowNode) => flowNode.id === "unit-operations")!.position,
    initialNodes.find((flowNode) => flowNode.id === "unit-operations")!.position,
  );
});

test("multi-selection movement includes every selected branch when enabled", () => {
  const selectedIds = new Set(["unit-research", "unit-operations"]);
  const cardOnlyIds = selectionMovementIds(selectedIds, initialEdges, false);
  const branchIds = selectionMovementIds(selectedIds, initialEdges, true);

  assert.deepEqual(cardOnlyIds, selectedIds);
  assert.ok(branchIds.has("unit-quantum-networking"));
  assert.ok(branchIds.has("unit-business-services"));
  assert.equal(branchIds.has("unit-lab"), false);

  const startingPositions = new Map(
    initialNodes
      .filter((flowNode) => branchIds.has(flowNode.id))
      .map((flowNode) => [flowNode.id, { ...flowNode.position }]),
  );
  const rootId = "unit-research";
  const rootStart = startingPositions.get(rootId)!;
  const moved = positionBranchNodesFromSnapshot(
    initialNodes,
    branchIds,
    startingPositions,
    rootId,
    { x: rootStart.x + 90, y: rootStart.y + 35 },
  );

  for (const nodeId of [
    "unit-research",
    "unit-quantum-networking",
    "unit-operations",
    "unit-business-services",
  ]) {
    const before = startingPositions.get(nodeId)!;
    const after = moved.find((flowNode) => flowNode.id === nodeId)!.position;
    assert.deepEqual(after, { x: before.x + 90, y: before.y + 35 });
  }
});

test("selection alignment moves and pins only the selected cards", () => {
  const selectedIds = new Set([
    "unit-quantum-division",
    "unit-computing-division",
    "unit-facilities-division",
  ]);
  const selected = initialNodes.map((flowNode) => ({
    ...flowNode,
    selected: selectedIds.has(flowNode.id),
  }));
  const untouchedBefore = selected.find(
    (flowNode) => flowNode.id === "unit-business-division",
  )!;
  const aligned = arrangeSelectedNodes(selected, "align-top");
  const selectedY = aligned
    .filter((flowNode) => selectedIds.has(flowNode.id))
    .map((flowNode) => flowNode.position.y);

  assert.equal(new Set(selectedY).size, 1);
  aligned
    .filter((flowNode) => selectedIds.has(flowNode.id))
    .forEach((flowNode) => assert.equal(flowNode.data.pinned, true));
  assert.deepEqual(
    aligned.find((flowNode) => flowNode.id === untouchedBefore.id),
    untouchedBefore,
  );
});

test("selection distribution preserves the endpoints and spaces middle cards evenly", () => {
  const selectedIds = new Set([
    "unit-quantum-division",
    "unit-computing-division",
    "unit-facilities-division",
  ]);
  const selected = initialNodes.map((flowNode) => ({
    ...flowNode,
    selected: selectedIds.has(flowNode.id),
  }));
  const beforePositions = selected
    .filter((flowNode) => selectedIds.has(flowNode.id))
    .map((flowNode) => flowNode.position.x)
    .sort((left, right) => left - right);
  const distributed = arrangeSelectedNodes(selected, "distribute-horizontal");
  const positions = distributed
    .filter((flowNode) => selectedIds.has(flowNode.id))
    .map((flowNode) => flowNode.position.x)
    .sort((left, right) => left - right);

  assert.equal(positions[1] - positions[0], positions[2] - positions[1]);
  assert.equal(positions[0], beforePositions[0]);
  assert.equal(positions[2], beforePositions[2]);
});

test("distribution requires at least three selected cards", () => {
  const selected = initialNodes.map((flowNode, index) => ({
    ...flowNode,
    selected: index < 2,
  }));

  assert.equal(arrangeSelectedNodes(selected, "distribute-vertical"), selected);
});

test("ELK produces finite coordinates and respects pinned positions", async () => {
  const pinnedId = "unit-quantum-networking";
  const withPin = initialNodes.map((flowNode) =>
    flowNode.id === pinnedId
      ? { ...flowNode, data: { ...flowNode.data, pinned: true } }
      : flowNode,
  );
  const pinnedBefore = withPin.find((flowNode) => flowNode.id === pinnedId)?.position;
  const layouted = await runElkLayout(withPin, initialEdges, true);
  const pinnedAfter = layouted.find((flowNode) => flowNode.id === pinnedId)?.position;

  assert.equal(layouted.length, initialNodes.length);
  layouted.forEach((flowNode) => {
    assert.equal(Number.isFinite(flowNode.position.x), true);
    assert.equal(Number.isFinite(flowNode.position.y), true);
  });
  assert.deepEqual(pinnedAfter, pinnedBefore);
});

test("validation and branch traversal handle a 500-unit hierarchy", () => {
  const nodes = Array.from({ length: 500 }, (_, index) => {
    const id = `unit-scale-${index}`;
    return {
      ...initialNodes[0],
      id,
      position: { x: (index % 20) * 280, y: Math.floor(index / 20) * 200 },
      data: {
        ...initialNodes[0].data,
        unit: {
          ...initialNodes[0].data.unit,
          id,
          name: `Scale Test Unit ${index}`,
          shortName: `Unit ${index}`,
        },
      },
    };
  });
  const edges = nodes.slice(1).map((node, index) => ({
    id: `edge-scale-${index}-${index + 1}`,
    source: `unit-scale-${Math.floor(index / 3)}`,
    target: node.id,
    data: { relationshipType: "primary supervisory" },
  }));

  assert.deepEqual(validateHierarchy(nodes, edges), []);
  assert.equal(descendantIds("unit-scale-0", edges).size, 500);
});
