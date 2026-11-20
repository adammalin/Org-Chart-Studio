import type { ChartDocument, ChartStatus } from "./chart-library";

// A review can explicitly archive an unchanged chart. Other lifecycle promotions
// remain in the existing owner-approval workflow.
export function proposalTargetStatus(current: ChartStatus, proposed: ChartStatus): ChartStatus {
  return proposed === "archived" ? "archived" : current;
}

export function archiveProposalError(current: ChartDocument, proposed: ChartDocument): string | null {
  if (proposed.status !== "archived") return null;
  if (JSON.stringify(current.nodes) !== JSON.stringify(proposed.nodes)
      || JSON.stringify(current.edges) !== JSON.stringify(proposed.edges)) {
    return "Archive reviews must preserve chart cards, reporting lines, layout and pins. Prepare content changes separately.";
  }
  return null;
}

export function appliedProposalStatus(current: ChartStatus, proposed: ChartStatus): ChartStatus {
  return proposed === "archived" ? "archived" : current === "current" ? "draft" : current;
}
