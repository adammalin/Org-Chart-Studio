import assert from "node:assert/strict";
import test from "node:test";
import type { Edge } from "@xyflow/react";
import {
  buildOrthogonalEdgeRoutes,
  type EdgeRoutingNode,
} from "../lib/edge-routing";

const node = (id: string, x: number, y: number): EdgeRoutingNode => ({
  id,
  x,
  y,
  width: 248,
  height: 132,
});

function positiveLengthCollinearOverlaps(
  routes: ReturnType<typeof buildOrthogonalEdgeRoutes>,
): number {
  const segments = [...routes.values()].flatMap((route) =>
    route.points.slice(0, -1).map((start, index) => {
      const end = route.points[index + 1];
      return {
        edgeId: route.edgeId,
        bundleKey: route.bundleKey,
        start,
        end,
        vertical: start.x === end.x,
      };
    }),
  );
  let overlaps = 0;
  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      const first = segments[firstIndex];
      const second = segments[secondIndex];
      if (first.edgeId === second.edgeId || first.vertical !== second.vertical) continue;
      if (first.bundleKey && first.bundleKey === second.bundleKey) continue;
      if (first.vertical && Math.abs(first.start.x - second.start.x) > 0.01) continue;
      if (!first.vertical && Math.abs(first.start.y - second.start.y) > 0.01) continue;
      const firstRange = first.vertical
        ? [first.start.y, first.end.y].sort((left, right) => left - right)
        : [first.start.x, first.end.x].sort((left, right) => left - right);
      const secondRange = second.vertical
        ? [second.start.y, second.end.y].sort((left, right) => left - right)
        : [second.start.x, second.end.x].sort((left, right) => left - right);
      if (
        Math.min(firstRange[1], secondRange[1]) -
          Math.max(firstRange[0], secondRange[0]) >
        0.01
      ) {
        overlaps += 1;
      }
    }
  }
  return overlaps;
}

test("global connector lanes avoid horizontal and vertical path overlap", () => {
  const nodes = [
    node("parent-left", 0, 0),
    node("parent-right", 500, 0),
    node("intermediate", 0, 190),
    node("child-left", -300, 380),
    node("child-center", 0, 380),
    node("child-right", 800, 190),
  ];
  const edges: Edge[] = [
    { id: "edge-cross-right", source: "parent-left", target: "child-right" },
    { id: "edge-cross-left", source: "parent-right", target: "intermediate" },
    { id: "edge-long", source: "parent-left", target: "child-center" },
    { id: "edge-intermediate", source: "intermediate", target: "child-left" },
  ];

  const routes = buildOrthogonalEdgeRoutes(nodes, edges);

  assert.equal(routes.size, edges.length);
  assert.equal(positiveLengthCollinearOverlaps(routes), 0);
});

test("separate routing detours around cards between a parent and child", () => {
  const nodes = [
    node("parent", 250, 0),
    node("obstacle", 250, 250),
    node("child", 250, 520),
  ];
  const routes = buildOrthogonalEdgeRoutes(
    nodes,
    [{ id: "edge-parent-child", source: "parent", target: "child" }],
    "separate",
  );
  const route = routes.get("edge-parent-child")!;
  const obstacle = nodes[1];

  assert.ok(route.points.length >= 5);
  route.points.slice(0, -1).forEach((start, index) => {
    const end = route.points[index + 1];
    const vertical = start.x === end.x;
    const intersects = vertical
      ? start.x > obstacle.x &&
        start.x < obstacle.x + obstacle.width &&
        Math.max(start.y, end.y) > obstacle.y &&
        Math.min(start.y, end.y) < obstacle.y + obstacle.height
      : start.y > obstacle.y &&
        start.y < obstacle.y + obstacle.height &&
        Math.max(start.x, end.x) > obstacle.x &&
        Math.min(start.x, end.x) < obstacle.x + obstacle.width;
    assert.equal(intersects, false);
  });
});

test("combed routing shares a trunk only for nearby same-parent rows", () => {
  const nodes = [
    node("parent-a", 300, 0),
    node("child-a1", 0, 280),
    node("child-a2", 300, 286),
    node("child-a3", 600, 276),
    node("parent-b", 1_100, 0),
    node("child-b1", 950, 280),
    node("child-b2", 1_250, 284),
  ];
  const edges: Edge[] = [
    { id: "a1", source: "parent-a", target: "child-a1" },
    { id: "a2", source: "parent-a", target: "child-a2" },
    { id: "a3", source: "parent-a", target: "child-a3" },
    { id: "b1", source: "parent-b", target: "child-b1" },
    { id: "b2", source: "parent-b", target: "child-b2" },
  ];

  const routes = buildOrthogonalEdgeRoutes(nodes, edges, "combed");
  const firstBranch = [routes.get("a1")!, routes.get("a2")!, routes.get("a3")!];
  const secondBranch = [routes.get("b1")!, routes.get("b2")!];

  assert.equal(new Set(firstBranch.map((route) => route.bundleKey)).size, 1);
  assert.equal(new Set(firstBranch.map((route) => route.points[0].x)).size, 1);
  assert.equal(firstBranch[0].points[1].y, firstBranch[2].points[1].y);
  assert.equal(new Set(secondBranch.map((route) => route.bundleKey)).size, 1);
  assert.notEqual(firstBranch[0].bundleKey, secondBranch[0].bundleKey);
  assert.equal(positiveLengthCollinearOverlaps(routes), 0);
});

test("combed routing leaves different target rows on independent lanes", () => {
  const nodes = [
    node("parent", 300, 0),
    node("near-child", 100, 280),
    node("far-row-child", 500, 390),
  ];
  const routes = buildOrthogonalEdgeRoutes(
    nodes,
    [
      { id: "near", source: "parent", target: "near-child" },
      { id: "far", source: "parent", target: "far-row-child" },
    ],
    "combed",
  );

  assert.equal(routes.get("near")?.bundleKey, undefined);
  assert.equal(routes.get("far")?.bundleKey, undefined);
  assert.notEqual(routes.get("near")?.sourceHandleId, routes.get("far")?.sourceHandleId);
});
