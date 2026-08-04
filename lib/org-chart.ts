import type { Edge, Node, XYPosition } from "@xyflow/react";

export const UNIT_TYPES = [
  "laboratory",
  "directorate",
  "division",
  "section",
  "group",
  "team",
  "program",
  "office",
  "project",
  "other",
] as const;

export type UnitType = (typeof UNIT_TYPES)[number];

export type PositionStatus = "filled" | "acting" | "vacant";

export type PlanningState = "current" | "planned";

export type SourceCertainty = "confirmed" | "inferred" | "needs_review";

export interface OrganizationalUnit {
  id: string;
  name: string;
  shortName: string;
  type: UnitType;
  positionTitle: string;
  assignmentLabel: string;
  positionStatus: PositionStatus;
  effectiveDate: string;
  source: string;
  sourceLocator?: string;
  sourceCertainty?: SourceCertainty;
  reviewNote?: string;
  planningState?: PlanningState;
  publicationVisibility: "internal" | "public";
}

export interface OrgNodeData extends Record<string, unknown> {
  unit: OrganizationalUnit;
  pinned: boolean;
  collapsed?: boolean;
  childCount?: number;
  sourcePortCount?: number;
  targetPortOffset?: number;
  isSearchMatch?: boolean;
  aiChange?: "added" | "changed";
  onToggleCollapse?: (id: string) => void;
}

export type OrgFlowNode = Node<OrgNodeData, "orgUnit">;

export const NODE_WIDTH = 248;
export const NODE_HEIGHT = 132;

const unit = (
  id: string,
  name: string,
  shortName: string,
  type: UnitType,
  positionTitle: string,
  assignmentLabel: string,
  positionStatus: PositionStatus,
  effectiveDate = "Current",
  publicationVisibility: "internal" | "public" = "internal",
): OrganizationalUnit => ({
  id,
  name,
  shortName,
  type,
  positionTitle,
  assignmentLabel,
  positionStatus,
  effectiveDate,
  source: "Synthetic prototype dataset",
  publicationVisibility,
});

const node = (
  organizationalUnit: OrganizationalUnit,
  position: XYPosition,
): OrgFlowNode => ({
  id: organizationalUnit.id,
  type: "orgUnit",
  position,
  data: {
    unit: organizationalUnit,
    pinned: false,
  },
});

export const initialNodes: OrgFlowNode[] = [
  node(
    unit(
      "unit-lab",
      "Synthetic Laboratory",
      "Laboratory",
      "laboratory",
      "Laboratory Director",
      "Sample role holder 01",
      "filled",
      "Current",
      "public",
    ),
    { x: 600, y: 40 },
  ),
  node(
    unit(
      "unit-research",
      "Example Research Directorate",
      "Research",
      "directorate",
      "Associate Laboratory Director",
      "Sample role holder 02",
      "filled",
      "Current",
      "public",
    ),
    { x: 280, y: 260 },
  ),
  node(
    unit(
      "unit-operations",
      "Example Operations Directorate",
      "Operations",
      "directorate",
      "Associate Laboratory Director",
      "Sample role holder 03",
      "acting",
      "Effective July 1, 2026",
      "public",
    ),
    { x: 920, y: 260 },
  ),
  node(
    unit(
      "unit-quantum-division",
      "Example Quantum Systems Division",
      "Quantum Systems",
      "division",
      "Division Director",
      "Sample role holder 04",
      "filled",
    ),
    { x: 80, y: 500 },
  ),
  node(
    unit(
      "unit-computing-division",
      "Example Computing Division",
      "Computing",
      "division",
      "Division Director",
      "Sample role holder 05",
      "filled",
    ),
    { x: 400, y: 500 },
  ),
  node(
    unit(
      "unit-facilities-division",
      "Example Facilities Division",
      "Facilities",
      "division",
      "Division Director",
      "Sample role holder 06",
      "filled",
    ),
    { x: 760, y: 500 },
  ),
  node(
    unit(
      "unit-business-division",
      "Example Business Services Division",
      "Business Services",
      "division",
      "Division Director",
      "Position vacant",
      "vacant",
      "Effective August 15, 2026",
    ),
    { x: 1080, y: 500 },
  ),
  node(
    unit(
      "unit-quantum-networking",
      "Quantum Networking Group",
      "Quantum Networking",
      "group",
      "Group Leader",
      "Sample role holder 07",
      "filled",
    ),
    { x: 0, y: 740 },
  ),
  node(
    unit(
      "unit-materials-systems",
      "Example Materials Systems Group",
      "Materials Systems",
      "group",
      "Group Leader",
      "Sample role holder 08",
      "filled",
    ),
    { x: 280, y: 740 },
  ),
  node(
    unit(
      "unit-scientific-software",
      "Example Scientific Software Group",
      "Scientific Software",
      "group",
      "Group Leader",
      "Sample role holder 09",
      "acting",
      "Effective June 15, 2026",
    ),
    { x: 560, y: 740 },
  ),
  node(
    unit(
      "unit-facilities-planning",
      "Example Facilities Planning Group",
      "Facilities Planning",
      "group",
      "Group Leader",
      "Sample role holder 10",
      "filled",
    ),
    { x: 840, y: 740 },
  ),
  node(
    unit(
      "unit-business-services",
      "Example Business Operations Group",
      "Business Operations",
      "group",
      "Group Leader",
      "Position vacant",
      "vacant",
    ),
    { x: 1120, y: 740 },
  ),
];

const primaryEdge = (source: string, target: string): Edge => ({
  id: `edge-${source}-${target}`,
  source,
  target,
  type: "smoothstep",
  data: { relationshipType: "primary supervisory" },
});

export const initialEdges: Edge[] = [
  primaryEdge("unit-lab", "unit-research"),
  primaryEdge("unit-lab", "unit-operations"),
  primaryEdge("unit-research", "unit-quantum-division"),
  primaryEdge("unit-research", "unit-computing-division"),
  primaryEdge("unit-operations", "unit-facilities-division"),
  primaryEdge("unit-operations", "unit-business-division"),
  primaryEdge("unit-quantum-division", "unit-quantum-networking"),
  primaryEdge("unit-quantum-division", "unit-materials-systems"),
  primaryEdge("unit-computing-division", "unit-scientific-software"),
  primaryEdge("unit-facilities-division", "unit-facilities-planning"),
  primaryEdge("unit-business-division", "unit-business-services"),
];

export async function runElkLayout(
  nodes: OrgFlowNode[],
  edges: Edge[],
  preservePinned = false,
): Promise<OrgFlowNode[]> {
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  const elk = new ELK();
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "56",
      "elk.layered.spacing.nodeNodeBetweenLayers": "92",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children: nodes.map((flowNode) => ({
      id: flowNode.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const result = await elk.layout(graph);
  const positions = new Map(
    result.children?.map((child) => [
      child.id,
      { x: child.x ?? 0, y: child.y ?? 0 },
    ]),
  );

  return nodes.map((flowNode) => ({
    ...flowNode,
    position:
      preservePinned && flowNode.data.pinned
        ? flowNode.position
        : (positions.get(flowNode.id) ?? flowNode.position),
  }));
}

export function descendantIds(rootId: string, edges: Edge[]): Set<string> {
  const descendants = new Set<string>([rootId]);
  const childrenByParent = new Map<string, string[]>();
  edges.forEach((edge) => {
    const children = childrenByParent.get(edge.source) ?? [];
    children.push(edge.target);
    childrenByParent.set(edge.source, children);
  });
  const pending = [rootId];
  while (pending.length) {
    const parentId = pending.pop()!;
    (childrenByParent.get(parentId) ?? []).forEach((childId) => {
      if (descendants.has(childId)) return;
      descendants.add(childId);
      pending.push(childId);
    });
  }
  return descendants;
}

export function selectionMovementIds(
  selectedNodeIds: ReadonlySet<string>,
  edges: Edge[],
  includeDescendants: boolean,
): Set<string> {
  const movementNodeIds = new Set(selectedNodeIds);
  if (!includeDescendants) return movementNodeIds;
  selectedNodeIds.forEach((nodeId) => {
    descendantIds(nodeId, edges).forEach((descendantId) =>
      movementNodeIds.add(descendantId),
    );
  });
  return movementNodeIds;
}

export function translateBranchNodes(
  nodes: OrgFlowNode[],
  edges: Edge[],
  rootId: string,
  delta: XYPosition,
  includeRoot = true,
): OrgFlowNode[] {
  if (delta.x === 0 && delta.y === 0) return nodes;

  const branchIds = descendantIds(rootId, edges);
  if (!includeRoot) branchIds.delete(rootId);

  return nodes.map((flowNode) =>
    branchIds.has(flowNode.id)
      ? {
          ...flowNode,
          position: {
            x: flowNode.position.x + delta.x,
            y: flowNode.position.y + delta.y,
          },
        }
      : flowNode,
  );
}

export function positionBranchNodesFromSnapshot(
  nodes: OrgFlowNode[],
  branchIds: ReadonlySet<string>,
  startingPositions: ReadonlyMap<string, XYPosition>,
  rootId: string,
  rootPosition: XYPosition,
): OrgFlowNode[] {
  const rootStart = startingPositions.get(rootId);
  if (!rootStart) return nodes;
  const delta = {
    x: rootPosition.x - rootStart.x,
    y: rootPosition.y - rootStart.y,
  };

  return nodes.map((flowNode) => {
    if (!branchIds.has(flowNode.id)) return flowNode;
    const startingPosition = startingPositions.get(flowNode.id);
    if (!startingPosition) return flowNode;
    return {
      ...flowNode,
      position: {
        x: startingPosition.x + delta.x,
        y: startingPosition.y + delta.y,
      },
    };
  });
}

export type SelectionArrangement =
  | "align-left"
  | "align-horizontal-center"
  | "align-right"
  | "align-top"
  | "align-vertical-center"
  | "align-bottom"
  | "distribute-horizontal"
  | "distribute-vertical";

export function arrangeSelectedNodes(
  nodes: OrgFlowNode[],
  arrangement: SelectionArrangement,
): OrgFlowNode[] {
  const selectedNodes = nodes.filter((flowNode) => flowNode.selected);
  const isDistribution = arrangement.startsWith("distribute-");
  if (selectedNodes.length < (isDistribution ? 3 : 2)) return nodes;

  const selectedByAxis = [...selectedNodes].sort((left, right) =>
    arrangement === "distribute-vertical"
      ? left.position.y - right.position.y
      : left.position.x - right.position.x,
  );
  const minX = Math.min(...selectedNodes.map((flowNode) => flowNode.position.x));
  const maxX = Math.max(...selectedNodes.map((flowNode) => flowNode.position.x));
  const minY = Math.min(...selectedNodes.map((flowNode) => flowNode.position.y));
  const maxY = Math.max(...selectedNodes.map((flowNode) => flowNode.position.y));
  const horizontalCenter = (minX + maxX) / 2;
  const verticalCenter = (minY + maxY) / 2;
  const arrangedPositions = new Map<string, XYPosition>();

  selectedNodes.forEach((flowNode) => {
    const position = { ...flowNode.position };
    if (arrangement === "align-left") position.x = minX;
    if (arrangement === "align-horizontal-center") position.x = horizontalCenter;
    if (arrangement === "align-right") position.x = maxX;
    if (arrangement === "align-top") position.y = minY;
    if (arrangement === "align-vertical-center") position.y = verticalCenter;
    if (arrangement === "align-bottom") position.y = maxY;
    arrangedPositions.set(flowNode.id, position);
  });

  if (arrangement === "distribute-horizontal") {
    const spacing = (maxX - minX) / (selectedByAxis.length - 1);
    selectedByAxis.forEach((flowNode, index) => {
      arrangedPositions.set(flowNode.id, {
        ...flowNode.position,
        x: minX + spacing * index,
      });
    });
  }

  if (arrangement === "distribute-vertical") {
    const spacing = (maxY - minY) / (selectedByAxis.length - 1);
    selectedByAxis.forEach((flowNode, index) => {
      arrangedPositions.set(flowNode.id, {
        ...flowNode.position,
        y: minY + spacing * index,
      });
    });
  }

  return nodes.map((flowNode) => {
    const position = arrangedPositions.get(flowNode.id);
    return position
      ? {
          ...flowNode,
          position,
          data: { ...flowNode.data, pinned: true },
        }
      : flowNode;
  });
}

export interface ValidationFinding {
  code: string;
  severity: "blocking" | "warning";
  message: string;
}

export function validateHierarchy(
  nodes: OrgFlowNode[],
  edges: Edge[],
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const nodeIds = new Set(nodes.map((flowNode) => flowNode.id));
  const seenIds = new Set<string>();
  const duplicateId = nodes.find((flowNode) => {
    if (seenIds.has(flowNode.id)) return true;
    seenIds.add(flowNode.id);
    return false;
  })?.id;

  if (duplicateId) {
    findings.push({
      code: "DUPLICATE_UNIT_ID",
      severity: "blocking",
      message: `Unit identifiers must be unique. Duplicate: ${duplicateId}.`,
    });
  }

  if (!nodes.length) {
    findings.push({
      code: "EMPTY_CHART",
      severity: "blocking",
      message: "A chart must contain at least one organizational unit.",
    });
  }

  edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      findings.push({
        code: "MISSING_ENDPOINT",
        severity: "blocking",
        message: `Relationship ${edge.id} references a missing unit.`,
      });
    }
    if (edge.source === edge.target) {
      findings.push({
        code: "SELF_REPORTING_UNIT",
        severity: "blocking",
        message: `Unit ${edge.source} cannot report to itself.`,
      });
    }
  });

  const validPrimaryEdges = edges.filter(
    (edge) =>
      nodeIds.has(edge.source) &&
      nodeIds.has(edge.target) &&
      (edge.data?.relationshipType ?? "primary supervisory") ===
        "primary supervisory",
  );
  const parentCounts = new Map<string, number>();
  validPrimaryEdges.forEach((edge) => {
    parentCounts.set(edge.target, (parentCounts.get(edge.target) ?? 0) + 1);
  });
  const multipleParentId = nodes.find(
    (flowNode) => (parentCounts.get(flowNode.id) ?? 0) > 1,
  )?.id;
  if (multipleParentId) {
    findings.push({
      code: "MULTIPLE_PRIMARY_PARENTS",
      severity: "blocking",
      message: `Unit ${multipleParentId} has more than one primary parent.`,
    });
  }

  if (nodes.length) {
    const roots = nodes.filter(
      (flowNode) => (parentCounts.get(flowNode.id) ?? 0) === 0,
    );
    if (roots.length !== 1) {
      findings.push({
        code: "INVALID_ROOT_COUNT",
        severity: "blocking",
        message: `A chart must contain exactly one root unit; found ${roots.length}.`,
      });
    }
  }

  const childrenByParent = new Map<string, string[]>();
  const inDegree = new Map(nodes.map((flowNode) => [flowNode.id, 0]));

  validPrimaryEdges.forEach((edge) => {
    childrenByParent.set(edge.source, [
      ...(childrenByParent.get(edge.source) ?? []),
      edge.target,
    ]);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  });
  const pending = [...inDegree]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id);
  let visitedCount = 0;
  while (pending.length) {
    const id = pending.pop()!;
    visitedCount += 1;
    (childrenByParent.get(id) ?? []).forEach((childId) => {
      const nextDegree = (inDegree.get(childId) ?? 0) - 1;
      inDegree.set(childId, nextDegree);
      if (nextDegree === 0) pending.push(childId);
    });
  }

  if (visitedCount !== nodes.length) {
    findings.push({
      code: "REPORTING_CYCLE",
      severity: "blocking",
      message: "The primary supervisory hierarchy contains a cycle.",
    });
  }

  return findings;
}

export const exampleChangeRequest =
  "Move the Quantum Networking Group under the Example Computing Division, mark the group leader position vacant effective August 15, and preserve the current card positions where possible.";

export const exampleOperations = [
  {
    type: "change_unit_parent",
    target: "Quantum Networking Group",
    before: "Example Quantum Systems Division",
    after: "Example Computing Division",
  },
  {
    type: "vacate_position",
    target: "Quantum Networking Group — Group Leader",
    before: "Filled",
    after: "Vacant effective August 15, 2026",
  },
  {
    type: "request_branch_layout",
    target: "Example Computing Division",
    before: "Current card positions",
    after: "Respect pinned cards",
  },
] as const;
