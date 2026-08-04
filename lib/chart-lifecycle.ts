import type { Edge } from "@xyflow/react";
import type { ChartDocument, ChartStatus } from "./chart-library";
import { validateHierarchy, type OrgFlowNode } from "./org-chart";

export interface LifecycleReadiness {
  ready: boolean;
  blockingReasons: string[];
  structuralBlockers: number;
  reviewItems: number;
}

const allowedTransitions: Record<ChartStatus, ChartStatus[]> = {
  draft: ["in_review", "archived"],
  in_review: ["draft", "current", "archived"],
  current: ["draft", "archived"],
  archived: ["draft"],
};

export function canTransitionChartStatus(from: ChartStatus, to: ChartStatus): boolean {
  return from === to || allowedTransitions[from].includes(to);
}

export function sourceReviewItemCount(nodes: OrgFlowNode[], edges: Edge[]): number {
  const nodeCount = nodes.filter(
    (node) => node.data.unit.sourceCertainty === "needs_review",
  ).length;
  const edgeCount = edges.filter(
    (edge) => edge.data?.sourceCertainty === "needs_review",
  ).length;
  return nodeCount + edgeCount;
}

export function currentReadiness(
  chart: Pick<ChartDocument, "nodes" | "edges">,
): LifecycleReadiness {
  const structuralBlockers = validateHierarchy(chart.nodes, chart.edges).filter(
    (finding) => finding.severity === "blocking",
  ).length;
  const reviewItems = sourceReviewItemCount(chart.nodes, chart.edges);
  const blockingReasons: string[] = [];
  if (structuralBlockers) {
    blockingReasons.push(
      `${structuralBlockers} blocking structure issue${structuralBlockers === 1 ? "" : "s"} must be resolved.`,
    );
  }
  if (reviewItems) {
    blockingReasons.push(
      `${reviewItems} source review item${reviewItems === 1 ? "" : "s"} must be resolved.`,
    );
  }
  return {
    ready: blockingReasons.length === 0,
    blockingReasons,
    structuralBlockers,
    reviewItems,
  };
}

export function lifecycleTransitionError(
  chart: Pick<ChartDocument, "status" | "nodes" | "edges">,
  targetStatus: ChartStatus,
): string | null {
  if (!canTransitionChartStatus(chart.status, targetStatus)) {
    return `A ${chart.status.replace("_", " ")} chart cannot move directly to ${targetStatus.replace("_", " ")}.`;
  }
  if (targetStatus === "current") {
    if (chart.status !== "in_review") {
      return "Only a chart that is In review can be marked Current.";
    }
    const readiness = currentReadiness(chart);
    if (!readiness.ready) return readiness.blockingReasons.join(" ");
  }
  return null;
}
