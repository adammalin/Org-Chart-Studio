import type { Edge } from "@xyflow/react";

export type ConnectorRoutingMode = "separate" | "combed";

export interface EdgeRoutingNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  targetSide?: "top" | "left";
}

export interface EdgeRoutePoint {
  x: number;
  y: number;
}

export type RouteCornerAxis = "x" | "y" | "both" | "none";

export interface RouteCornerControl extends EdgeRoutePoint {
  pointIndex: number;
  axis: RouteCornerAxis;
  pinned: boolean;
}

export interface ManualEdgeRoute {
  version: 1;
  points: EdgeRoutePoint[];
  targetPortOffset: number;
}

export interface OrthogonalEdgeRoute {
  edgeId: string;
  sourceId: string;
  targetId: string;
  sourceHandleId: string;
  targetHandleId: string;
  sourcePortIndex: number;
  sourcePortCount: number;
  targetPortOffset: number;
  targetSide: "top" | "left";
  bundleKey?: string;
  manual: boolean;
  points: EdgeRoutePoint[];
  controls: RouteCornerControl[];
}

type Point = EdgeRoutePoint;

interface Segment {
  start: Point;
  end: Point;
  bundleKey?: string;
}

interface Obstacle {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface RouteGroup {
  source: EdgeRoutingNode;
  edges: Edge[];
  targets: EdgeRoutingNode[];
  portIndex: number;
  portCount: number;
  sourceX: number;
  sourceY: number;
  bundleKey?: string;
  manual: boolean;
}

const SOURCE_PORT_SPACING = 18;
const SOURCE_PORT_SIDE_MARGIN = 32;
const TARGET_PORT_SPACING = 8;
const TARGET_PORT_MAX_OFFSET = 32;
const ROW_SNAP_TOLERANCE = 28;
const NODE_CLEARANCE = 12;
const LANE_SPACING = 14;
const MIN_LEAD = 20;
const EPSILON = 0.5;

function isFinitePoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { x?: unknown; y?: unknown };
  return (
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y)
  );
}

export function manualEdgeRouteForEdge(edge: Edge): ManualEdgeRoute | undefined {
  const candidate = edge.data?.manualRoute;
  if (!candidate || typeof candidate !== "object") return undefined;
  const manualRoute = candidate as Partial<ManualEdgeRoute>;
  if (
    manualRoute.version !== 1 ||
    !Array.isArray(manualRoute.points) ||
    !manualRoute.points.length ||
    !manualRoute.points.every(isFinitePoint) ||
    typeof manualRoute.targetPortOffset !== "number" ||
    !Number.isFinite(manualRoute.targetPortOffset)
  ) {
    return undefined;
  }
  return {
    version: 1,
    points: manualRoute.points.map((point) => ({ ...point })),
    targetPortOffset: manualRoute.targetPortOffset,
  };
}

export function manualEdgeRouteFromRoute(
  route: OrthogonalEdgeRoute,
): ManualEdgeRoute | undefined {
  const points = route.points.slice(1, -1).map((point) => ({ ...point }));
  if (!points.length) return undefined;
  return {
    version: 1,
    points,
    targetPortOffset: route.targetPortOffset,
  };
}

export function moveManualEdgeRouteLane(
  manualRoute: ManualEdgeRoute,
  pointIndex: number,
  axis: Exclude<RouteCornerAxis, "both" | "none">,
  value: number,
): ManualEdgeRoute {
  if (!Number.isFinite(value) || !manualRoute.points[pointIndex]) return manualRoute;
  const points = manualRoute.points.map((point) => ({ ...point }));
  const coordinate = axis;
  const originalValue = points[pointIndex][coordinate];
  points[pointIndex][coordinate] = value;

  for (const neighborIndex of [pointIndex - 1, pointIndex + 1]) {
    const neighbor = points[neighborIndex];
    if (neighbor && Math.abs(neighbor[coordinate] - originalValue) <= EPSILON) {
      neighbor[coordinate] = value;
    }
  }

  return { ...manualRoute, points };
}

export function sourcePortOffset(
  siblingIndex: number,
  siblingCount: number,
  nodeWidth: number,
): number {
  if (siblingCount <= 1) return 0;
  const maximumSpacing = Math.max(
    0,
    (nodeWidth - SOURCE_PORT_SIDE_MARGIN * 2) / (siblingCount - 1),
  );
  const spacing = Math.min(SOURCE_PORT_SPACING, maximumSpacing);
  return (siblingIndex - (siblingCount - 1) / 2) * spacing;
}

function targetPortCandidates(nodeWidth: number): number[] {
  const maximumOffset = Math.min(
    TARGET_PORT_MAX_OFFSET,
    Math.max(0, nodeWidth / 2 - SOURCE_PORT_SIDE_MARGIN),
  );
  const candidates = [0];
  for (let offset = TARGET_PORT_SPACING; offset <= maximumOffset; offset += TARGET_PORT_SPACING) {
    candidates.push(-offset, offset);
  }
  return candidates;
}

function asObstacle(node: EdgeRoutingNode): Obstacle {
  return {
    id: node.id,
    left: node.x - NODE_CLEARANCE,
    right: node.x + node.width + NODE_CLEARANCE,
    top: node.y - NODE_CLEARANCE,
    bottom: node.y + node.height + NODE_CLEARANCE,
  };
}

function compressedPoints(points: Point[]): Point[] {
  const withoutDuplicates = points.filter(
    (point, index) =>
      index === 0 ||
      Math.abs(point.x - points[index - 1].x) > EPSILON ||
      Math.abs(point.y - points[index - 1].y) > EPSILON,
  );
  return withoutDuplicates.filter((point, index) => {
    if (index === 0 || index === withoutDuplicates.length - 1) return true;
    const previous = withoutDuplicates[index - 1];
    const next = withoutDuplicates[index + 1];
    const vertical =
      Math.abs(previous.x - point.x) <= EPSILON &&
      Math.abs(point.x - next.x) <= EPSILON;
    const horizontal =
      Math.abs(previous.y - point.y) <= EPSILON &&
      Math.abs(point.y - next.y) <= EPSILON;
    return !vertical && !horizontal;
  });
}

function orthogonalizedPoints(points: Point[]): Point[] {
  if (points.length < 2) return points.map((point) => ({ ...point }));
  const result: Point[] = [{ ...points[0] }];
  points.slice(1).forEach((point) => {
    const previous = result.at(-1)!;
    const aligned =
      Math.abs(previous.x - point.x) <= EPSILON ||
      Math.abs(previous.y - point.y) <= EPSILON;
    if (!aligned) {
      const beforePrevious = result.at(-2);
      const arrivedVertically =
        !beforePrevious || Math.abs(beforePrevious.x - previous.x) <= EPSILON;
      result.push(
        arrivedVertically
          ? { x: previous.x, y: point.y }
          : { x: point.x, y: previous.y },
      );
    }
    result.push({ ...point });
  });
  return compressedPoints(result);
}

function routeCornerAxis(points: Point[], pointIndex: number): RouteCornerAxis {
  const point = points[pointIndex];
  if (!point || pointIndex <= 0 || pointIndex >= points.length - 1) return "none";
  let canMoveX = false;
  let canMoveY = false;
  for (const neighborIndex of [pointIndex - 1, pointIndex + 1]) {
    if (neighborIndex <= 0 || neighborIndex >= points.length - 1) continue;
    const neighbor = points[neighborIndex];
    if (Math.abs(neighbor.x - point.x) <= EPSILON) canMoveX = true;
    if (Math.abs(neighbor.y - point.y) <= EPSILON) canMoveY = true;
  }
  if (canMoveX && canMoveY) return "both";
  if (canMoveX) return "x";
  if (canMoveY) return "y";
  return "none";
}

function cornerControls(
  points: Point[],
  pinned: boolean,
): RouteCornerControl[] {
  return points.slice(1, -1).map((point, index) => ({
    ...point,
    pointIndex: index,
    axis: routeCornerAxis(points, index + 1),
    pinned,
  }));
}

function manualRoutePoints(
  source: Point,
  target: Point,
  manualRoute: ManualEdgeRoute,
): Point[] {
  return orthogonalizedPoints([source, ...manualRoute.points, target]);
}

function segmentsForPoints(points: Point[], bundleKey?: string): Segment[] {
  const compressed = compressedPoints(points);
  return compressed.slice(0, -1).map((start, index) => ({
    start,
    end: compressed[index + 1],
    bundleKey,
  }));
}

function isVertical(segment: Segment): boolean {
  return Math.abs(segment.start.x - segment.end.x) <= EPSILON;
}

function sortedRange(first: number, second: number): [number, number] {
  return first <= second ? [first, second] : [second, first];
}

function rangesOverlap(
  first: [number, number],
  second: [number, number],
): boolean {
  return Math.min(first[1], second[1]) - Math.max(first[0], second[0]) > EPSILON;
}

function collinearOverlap(first: Segment, second: Segment): boolean {
  const firstVertical = isVertical(first);
  if (firstVertical !== isVertical(second)) return false;
  if (firstVertical) {
    if (Math.abs(first.start.x - second.start.x) > EPSILON) return false;
    return rangesOverlap(
      sortedRange(first.start.y, first.end.y),
      sortedRange(second.start.y, second.end.y),
    );
  }
  if (Math.abs(first.start.y - second.start.y) > EPSILON) return false;
  return rangesOverlap(
    sortedRange(first.start.x, first.end.x),
    sortedRange(second.start.x, second.end.x),
  );
}

function perpendicularCrossing(first: Segment, second: Segment): boolean {
  if (isVertical(first) === isVertical(second)) return false;
  const vertical = isVertical(first) ? first : second;
  const horizontal = isVertical(first) ? second : first;
  const [verticalTop, verticalBottom] = sortedRange(vertical.start.y, vertical.end.y);
  const [horizontalLeft, horizontalRight] = sortedRange(horizontal.start.x, horizontal.end.x);
  return (
    vertical.start.x > horizontalLeft + EPSILON &&
    vertical.start.x < horizontalRight - EPSILON &&
    horizontal.start.y > verticalTop + EPSILON &&
    horizontal.start.y < verticalBottom - EPSILON
  );
}

function segmentIntersectsObstacle(segment: Segment, obstacle: Obstacle): boolean {
  if (isVertical(segment)) {
    const [top, bottom] = sortedRange(segment.start.y, segment.end.y);
    return (
      segment.start.x > obstacle.left + EPSILON &&
      segment.start.x < obstacle.right - EPSILON &&
      bottom > obstacle.top + EPSILON &&
      top < obstacle.bottom - EPSILON
    );
  }
  const [left, right] = sortedRange(segment.start.x, segment.end.x);
  return (
    segment.start.y > obstacle.top + EPSILON &&
    segment.start.y < obstacle.bottom - EPSILON &&
    right > obstacle.left + EPSILON &&
    left < obstacle.right - EPSILON
  );
}

function routeScore(
  points: Point[],
  obstacles: Obstacle[],
  reserved: Segment[],
  bundleKey?: string,
): number | null {
  const segments = segmentsForPoints(points, bundleKey);
  if (segments.some((segment) => obstacles.some((obstacle) => segmentIntersectsObstacle(segment, obstacle)))) {
    return null;
  }

  let crossings = 0;
  for (const segment of segments) {
    for (const occupied of reserved) {
      if (collinearOverlap(segment, occupied)) {
        if (bundleKey && occupied.bundleKey === bundleKey) continue;
        return null;
      }
      if (perpendicularCrossing(segment, occupied)) crossings += 1;
    }
  }

  const length = segments.reduce(
    (total, segment) =>
      total +
      Math.abs(segment.end.x - segment.start.x) +
      Math.abs(segment.end.y - segment.start.y),
    0,
  );
  return length + Math.max(0, segments.length - 1) * 34 + crossings * 1_200;
}

function laneCandidates(
  sourceY: number,
  targetY: number,
  obstacles: Obstacle[],
  preferredY = (sourceY + targetY) / 2,
): number[] {
  const lower = Math.min(sourceY, targetY) + MIN_LEAD;
  const upper = Math.max(sourceY, targetY) - MIN_LEAD;
  const midpoint = (sourceY + targetY) / 2;
  if (lower > upper) return [midpoint];

  const candidates = [midpoint];
  if (preferredY >= lower && preferredY <= upper) candidates.push(preferredY);
  obstacles.forEach((obstacle) => {
    if (obstacle.top >= lower && obstacle.top <= upper) candidates.push(obstacle.top);
    if (obstacle.bottom >= lower && obstacle.bottom <= upper) candidates.push(obstacle.bottom);
  });
  for (
    let offset = LANE_SPACING;
    offset <= Math.min(upper - lower, LANE_SPACING * 12);
    offset += LANE_SPACING
  ) {
    if (midpoint - offset >= lower) candidates.push(midpoint - offset);
    if (midpoint + offset <= upper) candidates.push(midpoint + offset);
  }
  candidates.push(lower, upper);

  return [...new Set(candidates.map((candidate) => Number(candidate.toFixed(3))))].sort(
    (left, right) => Math.abs(left - preferredY) - Math.abs(right - preferredY) || left - right,
  );
}

function sideChannelCandidates(
  nodes: EdgeRoutingNode[],
  preferredX: number,
): number[] {
  const left = Math.min(...nodes.map((node) => node.x)) - NODE_CLEARANCE * 3;
  const right = Math.max(...nodes.map((node) => node.x + node.width)) + NODE_CLEARANCE * 3;
  const candidates = nodes.flatMap((node) => [
    node.x - NODE_CLEARANCE,
    node.x + node.width + NODE_CLEARANCE,
  ]);
  for (let index = 0; index < 8; index += 1) {
    candidates.push(left - index * LANE_SPACING, right + index * LANE_SPACING);
  }
  const ordered = [...new Set(candidates.map((candidate) => Number(candidate.toFixed(3))))].sort(
    (first, second) =>
      Math.abs(first - preferredX) - Math.abs(second - preferredX) ||
      first - second,
  );
  return [
    ...ordered.slice(0, 12),
    left,
    right,
  ].filter((candidate, index, values) => values.indexOf(candidate) === index);
}

function routeIndependentEdge(
  source: EdgeRoutingNode,
  target: EdgeRoutingNode,
  sourceX: number,
  allNodes: EdgeRoutingNode[],
  reserved: Segment[],
  laneOffset = 0,
  bundleKey?: string,
): Point[] {
  const sourceY = source.y + source.height;
  const targetY = target.y;
  const excludedIds = new Set([source.id, target.id]);
  const obstacles = allNodes
    .filter((node) => !excludedIds.has(node.id))
    .map(asObstacle);
  let best: { points: Point[]; score: number } | null = null;
  const preferredLaneY = (sourceY + targetY) / 2 + laneOffset;

  for (const targetOffset of targetPortCandidates(target.width)) {
    const targetX = target.x + target.width / 2 + targetOffset;
    for (const laneY of laneCandidates(sourceY, targetY, obstacles, preferredLaneY)) {
      const points = compressedPoints([
        { x: sourceX, y: sourceY },
        { x: sourceX, y: laneY },
        { x: targetX, y: laneY },
        { x: targetX, y: targetY },
      ]);
      const score = routeScore(points, obstacles, reserved, bundleKey);
      if (score === null) continue;
      const adjustedScore = score + Math.abs(targetOffset) * 2;
      if (!best || adjustedScore < best.score) best = { points, score: adjustedScore };
    }
  }
  if (best) return best.points;

  const direction = targetY >= sourceY ? 1 : -1;
  for (const targetOffset of targetPortCandidates(target.width)) {
    const targetX = target.x + target.width / 2 + targetOffset;
    for (const lead of [MIN_LEAD, MIN_LEAD + LANE_SPACING, MIN_LEAD + LANE_SPACING * 2]) {
      const sourceLeadY = sourceY + direction * lead;
      const targetLeadY = targetY - direction * lead;
      for (const sideX of sideChannelCandidates(allNodes, sourceX)) {
        const points = compressedPoints([
          { x: sourceX, y: sourceY },
          { x: sourceX, y: sourceLeadY },
          { x: sideX, y: sourceLeadY },
          { x: sideX, y: targetLeadY },
          { x: targetX, y: targetLeadY },
          { x: targetX, y: targetY },
        ]);
        const score = routeScore(points, obstacles, reserved, bundleKey);
        if (score === null) continue;
        const adjustedScore = score + Math.abs(targetOffset) * 2;
        if (!best || adjustedScore < best.score) best = { points, score: adjustedScore };
      }
    }
  }
  if (best) return best.points;

  const fallbackLane = (sourceY + targetY) / 2;
  const fallbackTargetX = target.x + target.width / 2;
  return compressedPoints([
    { x: sourceX, y: sourceY },
    { x: sourceX, y: fallbackLane },
    { x: fallbackTargetX, y: fallbackLane },
    { x: fallbackTargetX, y: targetY },
  ]);
}

function clusterEdgesByTargetRow(
  edges: Edge[],
  nodeById: Map<string, EdgeRoutingNode>,
): Edge[][] {
  const ordered = [...edges].sort((left, right) => {
    const leftTarget = nodeById.get(left.target);
    const rightTarget = nodeById.get(right.target);
    return (
      (leftTarget?.y ?? 0) - (rightTarget?.y ?? 0) ||
      (leftTarget?.x ?? 0) - (rightTarget?.x ?? 0) ||
      left.id.localeCompare(right.id)
    );
  });
  const clusters: Edge[][] = [];
  ordered.forEach((edge) => {
    const target = nodeById.get(edge.target);
    if (!target) return;
    const current = clusters.at(-1);
    if (!current?.length) {
      clusters.push([edge]);
      return;
    }
    const currentTargets = current
      .map((candidate) => nodeById.get(candidate.target))
      .filter((candidate): candidate is EdgeRoutingNode => Boolean(candidate));
    const averageY =
      currentTargets.reduce((total, candidate) => total + candidate.y, 0) /
      currentTargets.length;
    if (Math.abs(target.y - averageY) <= ROW_SNAP_TOLERANCE) current.push(edge);
    else clusters.push([edge]);
  });
  return clusters;
}

function buildRouteGroups(
  nodes: EdgeRoutingNode[],
  edges: Edge[],
  mode: ConnectorRoutingMode,
): RouteGroup[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgesBySource = new Map<string, Edge[]>();
  edges.forEach((edge) => {
    edgesBySource.set(edge.source, [...(edgesBySource.get(edge.source) ?? []), edge]);
  });

  const groups: RouteGroup[] = [];
  edgesBySource.forEach((sourceEdges, sourceId) => {
    const source = nodeById.get(sourceId);
    if (!source) return;
    const manualEdges = sourceEdges.filter((edge) => manualEdgeRouteForEdge(edge));
    const automaticEdges = sourceEdges.filter((edge) => !manualEdgeRouteForEdge(edge));
    const leftTargetEdges = automaticEdges.filter(
      (edge) => nodeById.get(edge.target)?.targetSide === "left",
    );
    const topTargetEdges = automaticEdges.filter(
      (edge) => nodeById.get(edge.target)?.targetSide !== "left",
    );
    const topTargetGroups =
      mode === "combed"
        ? clusterEdgesByTargetRow(topTargetEdges, nodeById).flatMap((cluster) =>
            cluster.length > 1 ? [cluster] : cluster.map((edge) => [edge]),
          )
        : topTargetEdges.map((edge) => [edge]);
    const automaticGroups = [
      ...(leftTargetEdges.length ? [leftTargetEdges] : []),
      ...topTargetGroups,
    ];
    const edgeGroups = [
      ...manualEdges.map((edge) => [edge]),
      ...automaticGroups,
    ];
    const orderedGroups = edgeGroups
      .map((groupEdges) => ({
        edges: groupEdges,
        targets: groupEdges
          .map((edge) => nodeById.get(edge.target))
          .filter((target): target is EdgeRoutingNode => Boolean(target)),
      }))
      .filter((group) => group.targets.length === group.edges.length)
      .sort((left, right) => {
        const leftX = left.targets.reduce((total, target) => total + target.x, 0) / left.targets.length;
        const rightX = right.targets.reduce((total, target) => total + target.x, 0) / right.targets.length;
        return leftX - rightX || left.edges[0].id.localeCompare(right.edges[0].id);
      });

    orderedGroups.forEach((group, portIndex) => {
      groups.push({
        source,
        edges: group.edges,
        targets: group.targets,
        portIndex,
        portCount: orderedGroups.length,
        sourceX:
          source.x +
          source.width / 2 +
          sourcePortOffset(portIndex, orderedGroups.length, source.width),
        sourceY: source.y + source.height,
        bundleKey:
          group.edges.length > 1
            ? `${source.id}:comb-${portIndex}`
            : undefined,
        manual: group.edges.some((edge) => Boolean(manualEdgeRouteForEdge(edge))),
      });
    });
  });

  return groups.sort(
    (left, right) =>
      Number(right.manual) - Number(left.manual) ||
      Number(Boolean(right.bundleKey)) - Number(Boolean(left.bundleKey)) ||
      left.sourceY - right.sourceY ||
      left.sourceX - right.sourceX ||
      left.edges[0].id.localeCompare(right.edges[0].id),
  );
}

function routeLeftRailGroup(group: RouteGroup): Point[][] | null {
  if (!group.targets.length || group.targets.some((target) => target.targetSide !== "left")) {
    return null;
  }
  const railX = Math.min(...group.targets.map((target) => target.x)) - 18;
  const firstTargetY = Math.min(
    ...group.targets.map((target) => target.y + target.height / 2),
  );
  const direction = firstTargetY >= group.sourceY ? 1 : -1;
  const sourceLeadY = group.sourceY + direction * MIN_LEAD;
  return group.targets.map((target) => {
    const targetY = target.y + target.height / 2;
    return compressedPoints([
      { x: group.sourceX, y: group.sourceY },
      { x: group.sourceX, y: sourceLeadY },
      { x: railX, y: sourceLeadY },
      { x: railX, y: targetY },
      { x: target.x, y: targetY },
    ]);
  });
}

function routeCombedGroup(
  group: RouteGroup,
  allNodes: EdgeRoutingNode[],
  reserved: Segment[],
): Point[][] | null {
  const leftRailRoutes = routeLeftRailGroup(group);
  if (leftRailRoutes) return leftRailRoutes;
  if (!group.bundleKey || group.edges.length < 2) return null;
  const targetIds = new Set(group.targets.map((target) => target.id));
  const obstacles = allNodes
    .filter((node) => node.id !== group.source.id && !targetIds.has(node.id))
    .map(asObstacle);
  const averageTargetY =
    group.targets.reduce((total, target) => total + target.y, 0) / group.targets.length;
  let best: { routes: Point[][]; score: number } | null = null;

  const trunkCandidates = [
    group.sourceX,
    ...sideChannelCandidates(allNodes, group.sourceX),
  ];
  for (const laneY of laneCandidates(group.sourceY, averageTargetY, obstacles)) {
    for (const trunkX of trunkCandidates) {
      const direction = averageTargetY >= group.sourceY ? 1 : -1;
      const sourceLeadY = group.sourceY + direction * MIN_LEAD;
      const routes = group.targets.map((target) => {
        const targetX = target.x + target.width / 2;
        return compressedPoints(
          Math.abs(trunkX - group.sourceX) <= EPSILON
            ? [
                { x: group.sourceX, y: group.sourceY },
                { x: group.sourceX, y: laneY },
                { x: targetX, y: laneY },
                { x: targetX, y: target.y },
              ]
            : [
                { x: group.sourceX, y: group.sourceY },
                { x: group.sourceX, y: sourceLeadY },
                { x: trunkX, y: sourceLeadY },
                { x: trunkX, y: laneY },
                { x: targetX, y: laneY },
                { x: targetX, y: target.y },
              ],
        );
      });
      const scores = routes.map((points) =>
        routeScore(points, obstacles, reserved, group.bundleKey),
      );
      if (scores.some((score) => score === null)) continue;
      const totalScore = (scores as number[]).reduce((total, score) => total + score, 0);
      if (!best || totalScore < best.score) best = { routes, score: totalScore };
    }
  }
  return best?.routes ?? null;
}

function reserveRoutes(
  reserved: Segment[],
  routes: Array<{ points: Point[]; bundleKey?: string }>,
) {
  const keys = new Set<string>();
  routes.forEach((route) => {
    segmentsForPoints(route.points, route.bundleKey).forEach((segment) => {
      const key = [
        segment.start.x.toFixed(3),
        segment.start.y.toFixed(3),
        segment.end.x.toFixed(3),
        segment.end.y.toFixed(3),
        segment.bundleKey ?? "",
      ].join(":");
      if (keys.has(key)) return;
      keys.add(key);
      reserved.push(segment);
    });
  });
}

export function buildOrthogonalEdgeRoutes(
  nodes: EdgeRoutingNode[],
  edges: Edge[],
  mode: ConnectorRoutingMode = "separate",
): Map<string, OrthogonalEdgeRoute> {
  const routes = new Map<string, OrthogonalEdgeRoute>();
  const reserved: Segment[] = [];
  const groups = buildRouteGroups(nodes, edges, mode);

  groups.forEach((group) => {
    const sourceHandleId = `route-${group.portIndex}`;
    const combedRoutes = routeCombedGroup(group, nodes, reserved);
    const groupRoutes = group.edges.map((edge, edgeIndex) => {
      const target = group.targets[edgeIndex];
      const manualRoute = manualEdgeRouteForEdge(edge);
      const automaticPoints =
        manualRoute
          ? undefined
          : combedRoutes?.[edgeIndex] ??
            routeIndependentEdge(
              group.source,
              target,
              group.sourceX,
              nodes,
              reserved,
              (group.portIndex - (group.portCount - 1) / 2) * LANE_SPACING,
              group.bundleKey,
            );
      const targetPortOffset = manualRoute
        ? Math.max(
            -TARGET_PORT_MAX_OFFSET,
            Math.min(TARGET_PORT_MAX_OFFSET, manualRoute.targetPortOffset),
          )
        : target.targetSide === "left"
          ? (automaticPoints?.at(-1)?.y ?? target.y + target.height / 2) -
            (target.y + target.height / 2)
          : (automaticPoints?.at(-1)?.x ?? target.x + target.width / 2) -
            (target.x + target.width / 2);
      const sourcePoint = { x: group.sourceX, y: group.sourceY };
      const targetSide = target.targetSide ?? "top";
      const targetPoint =
        targetSide === "left"
          ? { x: target.x, y: target.y + target.height / 2 + targetPortOffset }
          : {
              x: target.x + target.width / 2 + targetPortOffset,
              y: target.y,
            };
      const points = manualRoute
        ? manualRoutePoints(sourcePoint, targetPoint, manualRoute)
        : automaticPoints!;
      const controls = manualRoute
        ? cornerControls([sourcePoint, ...manualRoute.points, targetPoint], true)
        : cornerControls(points, false);
      const route: OrthogonalEdgeRoute = {
        edgeId: edge.id,
        sourceId: edge.source,
        targetId: edge.target,
        sourceHandleId,
        targetHandleId: "parent",
        sourcePortIndex: group.portIndex,
        sourcePortCount: group.portCount,
        targetPortOffset,
        targetSide,
        bundleKey: manualRoute ? undefined : group.bundleKey,
        manual: Boolean(manualRoute),
        points,
        controls,
      };
      routes.set(edge.id, route);
      return route;
    });
    reserveRoutes(reserved, groupRoutes);
  });

  return routes;
}

export function edgeRoutePath(route: OrthogonalEdgeRoute): string {
  return route.points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}
