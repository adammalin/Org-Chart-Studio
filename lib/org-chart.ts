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

export type ChartPresentationMode = "compact" | "individual";

export type CompactLayoutOrientation = "vertical" | "horizontal";

export type CompactDisplay = "auto" | "card" | "list" | "sidecar";

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
  compactDisplay?: CompactDisplay;
  publicationVisibility: "internal" | "public";
}

export interface CompactListEntry {
  id: string;
  hierarchyLevel: number;
  unit: OrganizationalUnit;
  aiChange?: "added" | "changed";
  isSearchMatch?: boolean;
  selected?: boolean;
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
  compactEntries?: CompactListEntry[];
  compactSidecar?: boolean;
  hierarchyLevel?: number;
  presentationMode?: ChartPresentationMode;
  targetSide?: "top" | "left";
  visualHeight?: number;
  visualWidth?: number;
  onToggleCollapse?: (id: string) => void;
  onSelectCompactEntry?: (id: string) => void;
}

export type OrgFlowNode = Node<OrgNodeData, "orgUnit">;

export const NODE_WIDTH = 248;
export const NODE_HEIGHT = 132;
export const COMPACT_ROOT_WIDTH = 720;
export const COMPACT_BRANCH_WIDTH = 280;
export const COMPACT_ROOT_HEIGHT = 174;
export const COMPACT_BRANCH_HEIGHT = 146;
export const COMPACT_ENTRY_HEIGHT = 54;
export const COMPACT_LIST_HEADER_HEIGHT = 34;

export interface CompactPresentation {
  levels: Map<string, number>;
  parentById: Map<string, string>;
  listedNodeIds: Set<string>;
  sidecarNodeIds: Set<string>;
  entriesByParent: Map<string, CompactListEntry[]>;
}

export interface CompactNodeDimensions {
  width: number;
  height: number;
}

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

function orderedNodeIds(ids: string[], nodeById: Map<string, OrgFlowNode>): string[] {
  return [...ids].sort((leftId, rightId) => {
    const left = nodeById.get(leftId);
    const right = nodeById.get(rightId);
    return (
      (left?.position.y ?? 0) - (right?.position.y ?? 0) ||
      (left?.position.x ?? 0) - (right?.position.x ?? 0) ||
      (left?.data.unit.shortName ?? leftId).localeCompare(
        right?.data.unit.shortName ?? rightId,
      )
    );
  });
}

export function hierarchyLevels(
  nodes: OrgFlowNode[],
  edges: Edge[],
): Map<string, number> {
  const levels = new Map<string, number>();
  const nodeIds = new Set(nodes.map((flowNode) => flowNode.id));
  const targets = new Set(
    edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)).map((edge) => edge.target),
  );
  const childrenByParent = new Map<string, string[]>();
  edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
    childrenByParent.set(edge.source, [
      ...(childrenByParent.get(edge.source) ?? []),
      edge.target,
    ]);
  });
  const roots = nodes.filter((flowNode) => !targets.has(flowNode.id)).map((flowNode) => flowNode.id);
  const pending = roots.map((id) => ({ id, level: 1 }));
  while (pending.length) {
    const current = pending.shift()!;
    const knownLevel = levels.get(current.id);
    if (knownLevel !== undefined && knownLevel <= current.level) continue;
    levels.set(current.id, current.level);
    (childrenByParent.get(current.id) ?? []).forEach((childId) => {
      pending.push({ id: childId, level: current.level + 1 });
    });
  }
  nodes.forEach((flowNode) => {
    if (!levels.has(flowNode.id)) levels.set(flowNode.id, 1);
  });
  return levels;
}

export function compactNodeDimensions(
  hierarchyLevel: number,
  entryCount = 0,
  sidecar = false,
): CompactNodeDimensions {
  if (sidecar) return { width: COMPACT_BRANCH_WIDTH, height: NODE_HEIGHT };
  if (hierarchyLevel <= 1) return { width: COMPACT_ROOT_WIDTH, height: COMPACT_ROOT_HEIGHT };
  const baseHeight = hierarchyLevel === 2 ? COMPACT_BRANCH_HEIGHT : NODE_HEIGHT;
  return {
    width: COMPACT_BRANCH_WIDTH,
    height:
      baseHeight +
      (entryCount ? COMPACT_LIST_HEADER_HEIGHT + entryCount * COMPACT_ENTRY_HEIGHT : 0),
  };
}

export function deriveCompactPresentation(
  nodes: OrgFlowNode[],
  edges: Edge[],
): CompactPresentation {
  const nodeById = new Map(nodes.map((flowNode) => [flowNode.id, flowNode]));
  const levels = hierarchyLevels(nodes, edges);
  const parentById = new Map<string, string>();
  const childrenByParent = new Map<string, string[]>();
  edges.forEach((edge) => {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) return;
    parentById.set(edge.target, edge.source);
    childrenByParent.set(edge.source, [
      ...(childrenByParent.get(edge.source) ?? []),
      edge.target,
    ]);
  });

  const listedNodeIds = new Set<string>();
  const sidecarNodeIds = new Set<string>();
  nodes.forEach((flowNode) => {
    const parentId = parentById.get(flowNode.id);
    if (!parentId || (childrenByParent.get(flowNode.id) ?? []).length) return;
    const display = flowNode.data.unit.compactDisplay ?? "auto";
    const level = levels.get(flowNode.id) ?? 1;
    if (display === "sidecar" && (levels.get(parentId) ?? 1) === 1) {
      sidecarNodeIds.add(flowNode.id);
      return;
    }
    if (display === "list" || (display === "auto" && level >= 4)) {
      listedNodeIds.add(flowNode.id);
    }
  });

  const entriesByParent = new Map<string, CompactListEntry[]>();
  listedNodeIds.forEach((nodeId) => {
    const flowNode = nodeById.get(nodeId);
    const parentId = parentById.get(nodeId);
    if (!flowNode || !parentId) return;
    entriesByParent.set(parentId, [
      ...(entriesByParent.get(parentId) ?? []),
      {
        id: flowNode.id,
        hierarchyLevel: levels.get(flowNode.id) ?? 1,
        unit: flowNode.data.unit,
      },
    ]);
  });
  entriesByParent.forEach((entries, parentId) => {
    const orderedIds = orderedNodeIds(entries.map((entry) => entry.id), nodeById);
    const entryById = new Map(entries.map((entry) => [entry.id, entry]));
    entriesByParent.set(
      parentId,
      orderedIds.flatMap((id) => {
        const entry = entryById.get(id);
        return entry ? [entry] : [];
      }),
    );
  });

  return {
    levels,
    parentById,
    listedNodeIds,
    sidecarNodeIds,
    entriesByParent,
  };
}

export function arrangeCompactPresentation(
  nodes: OrgFlowNode[],
  edges: Edge[],
  presentation = deriveCompactPresentation(nodes, edges),
  orientation: CompactLayoutOrientation = "vertical",
): OrgFlowNode[] {
  const visibleNodes = nodes.filter(
    (flowNode) => !presentation.listedNodeIds.has(flowNode.id),
  );
  const nodeById = new Map(visibleNodes.map((flowNode) => [flowNode.id, flowNode]));
  const childrenByParent = new Map<string, string[]>();
  edges.forEach((edge) => {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) return;
    childrenByParent.set(edge.source, [
      ...(childrenByParent.get(edge.source) ?? []),
      edge.target,
    ]);
  });
  childrenByParent.forEach((ids, parentId) => {
    childrenByParent.set(parentId, orderedNodeIds(ids, nodeById));
  });
  const targets = new Set(
    edges.filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target)).map((edge) => edge.target),
  );
  const roots = orderedNodeIds(
    visibleNodes.filter((flowNode) => !targets.has(flowNode.id)).map((flowNode) => flowNode.id),
    nodeById,
  );
  const positions = new Map<string, XYPosition>();

  const dimensionsFor = (nodeId: string) =>
    compactNodeDimensions(
      presentation.levels.get(nodeId) ?? 1,
      presentation.entriesByParent.get(nodeId)?.length ?? 0,
      presentation.sidecarNodeIds.has(nodeId),
    );

  if (orientation === "horizontal") {
    const SIBLING_GAP = 32;
    const ROOT_GAP = 128;
    const LEVEL_GAP = 70;
    const ROOT_LEVEL_GAP = 92;
    const STACK_GAP = 18;
    const layerHeights = new Map<number, number>();
    visibleNodes.forEach((flowNode) => {
      if (presentation.sidecarNodeIds.has(flowNode.id)) return;
      const level = presentation.levels.get(flowNode.id) ?? 1;
      layerHeights.set(
        level,
        Math.max(layerHeights.get(level) ?? 0, dimensionsFor(flowNode.id).height),
      );
    });
    const layerY = new Map<number, number>();
    let cursorY = 30;
    [...layerHeights.keys()]
      .sort((a, b) => a - b)
      .forEach((level) => {
        layerY.set(level, cursorY);
        cursorY +=
          (layerHeights.get(level) ?? NODE_HEIGHT) +
          (level === 1 ? ROOT_LEVEL_GAP : LEVEL_GAP);
      });

    const visibleChildren = (nodeId: string) =>
      (childrenByParent.get(nodeId) ?? []).filter(
        (childId) => !presentation.sidecarNodeIds.has(childId),
      );
    const subtreeWidthById = new Map<string, number>();
    const subtreeWidth = (nodeId: string, visiting = new Set<string>()): number => {
      const known = subtreeWidthById.get(nodeId);
      if (known !== undefined) return known;
      const ownWidth = dimensionsFor(nodeId).width;
      if (visiting.has(nodeId)) return ownWidth;
      const nextVisiting = new Set(visiting).add(nodeId);
      const childWidths = visibleChildren(nodeId).map((childId) =>
        subtreeWidth(childId, nextVisiting),
      );
      const childrenSpan = childWidths.length
        ? childWidths.reduce((total, width) => total + width, 0) +
          Math.max(0, childWidths.length - 1) * SIBLING_GAP
        : 0;
      const width = Math.max(ownWidth, childrenSpan);
      subtreeWidthById.set(nodeId, width);
      return width;
    };

    const placeSubtree = (
      nodeId: string,
      left: number,
      visiting = new Set<string>(),
    ) => {
      if (visiting.has(nodeId)) return;
      const nextVisiting = new Set(visiting).add(nodeId);
      const dimensions = dimensionsFor(nodeId);
      const span = subtreeWidth(nodeId);
      const level = presentation.levels.get(nodeId) ?? 1;
      positions.set(nodeId, {
        x: left + (span - dimensions.width) / 2,
        y: layerY.get(level) ?? 30,
      });
      const children = visibleChildren(nodeId);
      const childrenSpan = children.length
        ? children.reduce((total, childId) => total + subtreeWidth(childId), 0) +
          Math.max(0, children.length - 1) * SIBLING_GAP
        : 0;
      let childLeft = left + (span - childrenSpan) / 2;
      children.forEach((childId) => {
        placeSubtree(childId, childLeft, nextVisiting);
        childLeft += subtreeWidth(childId) + SIBLING_GAP;
      });
    };

    let chartOffsetX = 0;
    roots.forEach((rootId) => {
      const rootSpan = subtreeWidth(rootId);
      placeSubtree(rootId, chartOffsetX);
      const rootPosition = positions.get(rootId) ?? { x: chartOffsetX, y: 30 };
      const rootDimensions = dimensionsFor(rootId);
      const sidecars = (childrenByParent.get(rootId) ?? []).filter((id) =>
        presentation.sidecarNodeIds.has(id),
      );
      sidecars.forEach((sidecarId, index) => {
        const sidecarDimensions = dimensionsFor(sidecarId);
        positions.set(sidecarId, {
          x: rootPosition.x + rootDimensions.width + 38,
          y: rootPosition.y + 24 + index * (sidecarDimensions.height + STACK_GAP),
        });
      });
      const sidecarRight = sidecars.reduce((right, id) => {
        const position = positions.get(id);
        return Math.max(right, (position?.x ?? 0) + dimensionsFor(id).width);
      }, chartOffsetX + rootSpan);
      chartOffsetX = Math.max(chartOffsetX + rootSpan, sidecarRight) + ROOT_GAP;
    });

    let fallbackY = 30;
    visibleNodes.forEach((flowNode) => {
      if (positions.has(flowNode.id)) return;
      positions.set(flowNode.id, { x: chartOffsetX, y: fallbackY });
      fallbackY += dimensionsFor(flowNode.id).height + STACK_GAP;
    });

    return visibleNodes.map((flowNode) => ({
      ...flowNode,
      position: positions.get(flowNode.id) ?? flowNode.position,
    }));
  }

  const BRANCH_GAP = 64;
  const LEVEL_GAP = 92;
  const STACK_GAP = 18;
  let chartOffsetX = 0;

  roots.forEach((rootId) => {
    const rootDimensions = dimensionsFor(rootId);
    const directChildren = childrenByParent.get(rootId) ?? [];
    const sidecars = directChildren.filter((id) => presentation.sidecarNodeIds.has(id));
    const branchIds = directChildren.filter((id) => !presentation.sidecarNodeIds.has(id));
    const branchWidths = branchIds.map((id) => dimensionsFor(id).width);
    const branchSpan = branchWidths.length
      ? branchWidths.reduce((total, width) => total + width, 0) +
        Math.max(0, branchWidths.length - 1) * BRANCH_GAP
      : rootDimensions.width;
    const rootX = chartOffsetX + Math.max(0, (branchSpan - rootDimensions.width) / 2);
    const rootY = 30;
    positions.set(rootId, { x: rootX, y: rootY });

    sidecars.forEach((sidecarId, index) => {
      const sidecarDimensions = dimensionsFor(sidecarId);
      positions.set(sidecarId, {
        x: rootX + rootDimensions.width + 38,
        y: rootY + 24 + index * (sidecarDimensions.height + STACK_GAP),
      });
    });

    let branchX = chartOffsetX;
    const branchY = rootY + rootDimensions.height + LEVEL_GAP;
    const placeStack = (
      parentId: string,
      columnX: number,
      startY: number,
    ): number => {
      let cursorY = startY;
      for (const childId of childrenByParent.get(parentId) ?? []) {
        if (presentation.sidecarNodeIds.has(childId)) continue;
        const childDimensions = dimensionsFor(childId);
        // Compact descendants share one branch column at every depth. The left-entry
        // rail communicates nesting without creating a stair-step card edge.
        positions.set(childId, { x: columnX, y: cursorY });
        cursorY += childDimensions.height + STACK_GAP;
        if ((childrenByParent.get(childId) ?? []).length) {
          cursorY = placeStack(childId, columnX, cursorY);
        }
      }
      return cursorY;
    };

    branchIds.forEach((branchId, branchIndex) => {
      const branchDimensions = dimensionsFor(branchId);
      positions.set(branchId, { x: branchX, y: branchY });
      placeStack(
        branchId,
        branchX,
        branchY + branchDimensions.height + 32,
      );
      branchX += branchDimensions.width + BRANCH_GAP;
      if (branchIndex === branchIds.length - 1) branchX -= BRANCH_GAP;
    });

    const sidecarRight = sidecars.reduce((right, id) => {
      const position = positions.get(id);
      return Math.max(right, (position?.x ?? 0) + dimensionsFor(id).width);
    }, rootX + rootDimensions.width);
    chartOffsetX = Math.max(chartOffsetX + branchSpan, sidecarRight) + BRANCH_GAP * 2;
  });

  let fallbackY = 30;
  visibleNodes.forEach((flowNode) => {
    if (positions.has(flowNode.id)) return;
    positions.set(flowNode.id, { x: chartOffsetX, y: fallbackY });
    fallbackY += dimensionsFor(flowNode.id).height + STACK_GAP;
  });

  return visibleNodes.map((flowNode) => ({
    ...flowNode,
    position: positions.get(flowNode.id) ?? flowNode.position,
  }));
}

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
