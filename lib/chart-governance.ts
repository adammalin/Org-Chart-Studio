import type { Edge } from "@xyflow/react";
import type { ChartDocument } from "./chart-library";
import type {
  OrgFlowNode,
  PlanningState,
  SourceCertainty,
  ValidationFinding,
} from "./org-chart";

export interface ChartQualityFinding extends ValidationFinding {
  nodeIds?: string[];
  edgeIds?: string[];
}

export interface ChartQualityReport {
  score: number;
  blockingCount: number;
  warningCount: number;
  findings: ChartQualityFinding[];
}

export interface ChartComparison {
  addedNodeIds: string[];
  removedNodeIds: string[];
  changedNodeIds: string[];
  addedEdgeIds: string[];
  removedEdgeIds: string[];
  changedEdgeIds: string[];
  totalChanges: number;
}

function normalized(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function primaryParents(edges: Edge[]): Map<string, string> {
  return new Map(
    edges
      .filter(
        (edge) =>
          (edge.data?.relationshipType ?? "primary supervisory") ===
          "primary supervisory",
      )
      .map((edge) => [edge.target, edge.source]),
  );
}

function maxHierarchyDepth(nodes: OrgFlowNode[], edges: Edge[]): number {
  const parents = primaryParents(edges);
  const nodeIds = new Set(nodes.map((node) => node.id));
  let maximum = 0;
  nodes.forEach((node) => {
    let depth = 0;
    let current = node.id;
    const seen = new Set<string>();
    while (parents.has(current) && !seen.has(current)) {
      seen.add(current);
      current = parents.get(current)!;
      if (!nodeIds.has(current)) break;
      depth += 1;
    }
    maximum = Math.max(maximum, depth);
  });
  return maximum;
}

export function planningStateForNode(node: OrgFlowNode): PlanningState {
  return node.data.unit.planningState === "planned" ? "planned" : "current";
}

export function certaintyForNode(node: OrgFlowNode): SourceCertainty {
  const certainty = node.data.unit.sourceCertainty;
  return certainty === "inferred" || certainty === "needs_review"
    ? certainty
    : "confirmed";
}

export function auditChartQuality(
  nodes: OrgFlowNode[],
  edges: Edge[],
  existingCharts: ChartDocument[] = [],
  currentChartId = "",
): ChartQualityReport {
  const findings: ChartQualityFinding[] = [];
  const names = new Map<string, string[]>();
  const children = new Map<string, string[]>();

  nodes.forEach((node) => {
    const nameKey = normalized(node.data.unit.name);
    if (nameKey) names.set(nameKey, [...(names.get(nameKey) ?? []), node.id]);
    const certainty = certaintyForNode(node);
    if (certainty === "needs_review") {
      findings.push({
        code: "SOURCE_NEEDS_REVIEW",
        severity: "warning",
        message: `${node.data.unit.shortName} has source information marked Needs review.`,
        nodeIds: [node.id],
      });
    } else if (certainty === "inferred") {
      findings.push({
        code: "INFERRED_SOURCE_FACT",
        severity: "warning",
        message: `${node.data.unit.shortName} contains an inferred source fact.`,
        nodeIds: [node.id],
      });
    }

    if (
      planningStateForNode(node) === "planned" &&
      normalized(node.data.unit.effectiveDate) === "current"
    ) {
      findings.push({
        code: "PLANNED_WITHOUT_EFFECTIVE_DATE",
        severity: "warning",
        message: `${node.data.unit.shortName} is planned but has no future effective date.`,
        nodeIds: [node.id],
      });
    }
    if (
      node.data.unit.positionStatus === "vacant" &&
      !node.data.unit.effectiveDate.trim()
    ) {
      findings.push({
        code: "VACANCY_WITHOUT_EFFECTIVE_DATE",
        severity: "warning",
        message: `${node.data.unit.shortName} is vacant without an effective date.`,
        nodeIds: [node.id],
      });
    }
  });

  edges.forEach((edge) => {
    if (
      (edge.data?.relationshipType ?? "primary supervisory") ===
      "primary supervisory"
    ) {
      children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target]);
    }
    const certainty = edge.data?.sourceCertainty;
    if (certainty === "needs_review" || certainty === "inferred") {
      findings.push({
        code:
          certainty === "needs_review"
            ? "RELATIONSHIP_NEEDS_REVIEW"
            : "INFERRED_RELATIONSHIP",
        severity: "warning",
        message: `Relationship ${edge.source} → ${edge.target} is ${certainty === "needs_review" ? "marked Needs review" : "inferred"}.`,
        edgeIds: [edge.id],
      });
    }
  });

  for (const [name, nodeIds] of names) {
    if (nodeIds.length > 1) {
      findings.push({
        code: "POSSIBLE_DUPLICATE_UNIT",
        severity: "warning",
        message: `${nodeIds.length} units share the name “${name}”.`,
        nodeIds,
      });
    }
  }
  for (const [parentId, childIds] of children) {
    if (childIds.length > 12) {
      findings.push({
        code: "WIDE_SPAN_OF_CONTROL",
        severity: "warning",
        message: `${parentId} has ${childIds.length} direct reports; verify that the reporting lines are intentional.`,
        nodeIds: [parentId, ...childIds],
      });
    }
  }
  const depth = maxHierarchyDepth(nodes, edges);
  if (depth > 8) {
    findings.push({
      code: "DEEP_HIERARCHY",
      severity: "warning",
      message: `The hierarchy is ${depth + 1} levels deep; verify unusually long reporting chains.`,
    });
  }

  const existingNames = new Map<string, string[]>();
  existingCharts
    .filter((chart) => chart.id !== currentChartId)
    .forEach((chart) =>
      chart.nodes.forEach((node) => {
        const key = normalized(node.data.unit.name);
        if (key) {
          existingNames.set(key, [
            ...(existingNames.get(key) ?? []),
            `${chart.name}: ${node.data.unit.shortName}`,
          ]);
        }
      }),
    );
  const crossChartMatches = [...names.keys()].filter((key) => existingNames.has(key));
  if (crossChartMatches.length) {
    findings.push({
      code: "EXISTING_LIBRARY_MATCH",
      severity: "warning",
      message: `${crossChartMatches.length} imported unit name${crossChartMatches.length === 1 ? "" : "s"} also appear in another chart. Compare before merging.`,
      nodeIds: crossChartMatches.flatMap((key) => names.get(key) ?? []),
    });
  }

  const blockingCount = findings.filter((finding) => finding.severity === "blocking").length;
  const warningCount = findings.length - blockingCount;
  return {
    score: Math.max(0, 100 - blockingCount * 25 - Math.min(60, warningCount * 5)),
    blockingCount,
    warningCount,
    findings,
  };
}

function comparableNode(node: OrgFlowNode) {
  return {
    unit: node.data.unit,
    parentIndependentPosition: node.position,
    pinned: Boolean(node.data.pinned),
  };
}

function comparableEdge(edge: Edge) {
  return {
    source: edge.source,
    target: edge.target,
    data: edge.data ?? {},
  };
}

export function compareChartDocuments(
  target: Pick<ChartDocument, "nodes" | "edges">,
  source: Pick<ChartDocument, "nodes" | "edges">,
): ChartComparison {
  const targetNodes = new Map(target.nodes.map((node) => [node.id, node]));
  const sourceNodes = new Map(source.nodes.map((node) => [node.id, node]));
  const targetEdges = new Map(target.edges.map((edge) => [edge.id, edge]));
  const sourceEdges = new Map(source.edges.map((edge) => [edge.id, edge]));
  const addedNodeIds = [...sourceNodes.keys()].filter((id) => !targetNodes.has(id));
  const removedNodeIds = [...targetNodes.keys()].filter((id) => !sourceNodes.has(id));
  const changedNodeIds = [...sourceNodes.keys()].filter((id) => {
    const previous = targetNodes.get(id);
    return previous && JSON.stringify(comparableNode(previous)) !== JSON.stringify(comparableNode(sourceNodes.get(id)!));
  });
  const addedEdgeIds = [...sourceEdges.keys()].filter((id) => !targetEdges.has(id));
  const removedEdgeIds = [...targetEdges.keys()].filter((id) => !sourceEdges.has(id));
  const changedEdgeIds = [...sourceEdges.keys()].filter((id) => {
    const previous = targetEdges.get(id);
    return previous && JSON.stringify(comparableEdge(previous)) !== JSON.stringify(comparableEdge(sourceEdges.get(id)!));
  });
  return {
    addedNodeIds,
    removedNodeIds,
    changedNodeIds,
    addedEdgeIds,
    removedEdgeIds,
    changedEdgeIds,
    totalChanges:
      addedNodeIds.length +
      removedNodeIds.length +
      changedNodeIds.length +
      addedEdgeIds.length +
      removedEdgeIds.length +
      changedEdgeIds.length,
  };
}

export function mergeSourceIntoTarget(
  target: ChartDocument,
  source: ChartDocument,
): ChartDocument {
  return {
    ...target,
    nodes: source.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...node.data, unit: { ...node.data.unit } },
    })),
    edges: source.edges.map((edge) => ({
      ...edge,
      data: edge.data ? { ...edge.data } : undefined,
    })),
  };
}
