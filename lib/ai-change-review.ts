import type { Edge } from "@xyflow/react";
import type { ChartDocument } from "./chart-library";
import type { OrgFlowNode, OrganizationalUnit } from "./org-chart";

export type AiChangeKind = "added" | "changed" | "removed";
export type AiChangeCategory = "chart" | "unit" | "relationship" | "layout";
export type AiProposalStatus = "pending" | "accepted" | "rejected";

export interface AiFieldChange {
  id: string;
  kind: AiChangeKind;
  category: AiChangeCategory;
  entityId: string;
  entityLabel: string;
  field: string;
  fieldLabel: string;
  before: string | null;
  after: string | null;
}

export interface AiChangeSummary {
  total: number;
  added: number;
  changed: number;
  removed: number;
  changedNodeIds: string[];
  addedNodeIds: string[];
  removedNodeIds: string[];
  changedEdgeIds: string[];
  addedEdgeIds: string[];
  removedEdgeIds: string[];
  text: string;
}

export interface AiChartProposal {
  id: string;
  chartId: string;
  chartName: string;
  operation: "replace_chart_draft";
  status: AiProposalStatus;
  changeSummary: string | null;
  createdAt: string;
  expiresAt: string;
  current: ChartDocument;
  proposed: ChartDocument;
  changes: AiFieldChange[];
  summary: AiChangeSummary;
}

export interface AiPendingProposalSummary {
  id: string;
  chartId: string;
  chartName: string;
  changeSummary: string | null;
  createdAt: string;
  expiresAt: string;
  summary: AiChangeSummary;
}

export interface AiActivityRecord {
  id: string;
  chartId: string;
  proposalId: string;
  operation: string;
  status: "accepted" | "rejected";
  summary: string;
  changeCount: number;
  changedNodeIds: string[];
  changedEdgeIds: string[];
  createdAt: string;
  versionId: string | null;
  versionNumber: number | null;
  versionLabel: string | null;
}

export interface AiProposalResponse {
  proposal: AiChartProposal;
}

export interface AiPendingProposalsResponse {
  proposals: AiPendingProposalSummary[];
}

export interface AiActivityHistoryResponse {
  activities: AiActivityRecord[];
}

const unitFields: Array<{
  key: keyof OrganizationalUnit;
  label: string;
  category?: AiChangeCategory;
}> = [
  { key: "name", label: "Full unit name" },
  { key: "shortName", label: "Card display name" },
  { key: "type", label: "Unit type" },
  { key: "positionTitle", label: "Position title" },
  { key: "assignmentLabel", label: "Assignment or vacancy label" },
  { key: "positionStatus", label: "Position status" },
  { key: "compactDisplay", label: "Compact presentation" },
  { key: "effectiveDate", label: "Effective date or label" },
  { key: "publicationVisibility", label: "Publication visibility" },
  { key: "source", label: "Source or provenance note" },
];

function displayValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function change(
  kind: AiChangeKind,
  category: AiChangeCategory,
  entityId: string,
  entityLabel: string,
  field: string,
  fieldLabel: string,
  before: unknown,
  after: unknown,
): AiFieldChange {
  return {
    id: `${category}-${entityId}-${field}-${kind}`,
    kind,
    category,
    entityId,
    entityLabel,
    field,
    fieldLabel,
    before: displayValue(before),
    after: displayValue(after),
  };
}

function nodeLabel(node: OrgFlowNode): string {
  return node.data.unit.shortName || node.data.unit.name || node.id;
}

function edgeLabel(edge: Edge, nodes: Map<string, OrgFlowNode>): string {
  const source = nodes.get(edge.source);
  const target = nodes.get(edge.target);
  return `${source ? nodeLabel(source) : edge.source} → ${target ? nodeLabel(target) : edge.target}`;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function diffChartDocuments(
  current: ChartDocument,
  proposed: ChartDocument,
): { changes: AiFieldChange[]; summary: AiChangeSummary } {
  const changes: AiFieldChange[] = [];
  const chartFields: Array<[keyof ChartDocument, string]> = [
    ["name", "Chart name"],
    ["description", "Chart description"],
    ["status", "Chart lifecycle"],
  ];
  for (const [field, label] of chartFields) {
    if (current[field] !== proposed[field]) {
      changes.push(
        change("changed", "chart", current.id, current.name, String(field), label, current[field], proposed[field]),
      );
    }
  }

  const currentNodes = new Map(current.nodes.map((node) => [node.id, node]));
  const proposedNodes = new Map(proposed.nodes.map((node) => [node.id, node]));
  for (const node of proposed.nodes) {
    const previous = currentNodes.get(node.id);
    if (!previous) {
      changes.push(
        change("added", "unit", node.id, nodeLabel(node), "unit", "Organizational unit", null, nodeLabel(node)),
      );
      continue;
    }
    for (const field of unitFields) {
      if (previous.data.unit[field.key] !== node.data.unit[field.key]) {
        changes.push(
          change(
            "changed",
            field.category ?? "unit",
            node.id,
            nodeLabel(node),
            String(field.key),
            field.label,
            previous.data.unit[field.key],
            node.data.unit[field.key],
          ),
        );
      }
    }
    if (Boolean(previous.data.pinned) !== Boolean(node.data.pinned)) {
      changes.push(
        change("changed", "layout", node.id, nodeLabel(node), "pinned", "Card placement", previous.data.pinned ? "Pinned" : "Automatic", node.data.pinned ? "Pinned" : "Automatic"),
      );
    }
    if (previous.position.x !== node.position.x || previous.position.y !== node.position.y) {
      changes.push(
        change(
          "changed",
          "layout",
          node.id,
          nodeLabel(node),
          "position",
          "Card position",
          `${Math.round(previous.position.x)}, ${Math.round(previous.position.y)}`,
          `${Math.round(node.position.x)}, ${Math.round(node.position.y)}`,
        ),
      );
    }
  }
  for (const node of current.nodes) {
    if (!proposedNodes.has(node.id)) {
      changes.push(
        change("removed", "unit", node.id, nodeLabel(node), "unit", "Organizational unit", nodeLabel(node), null),
      );
    }
  }

  const currentEdges = new Map(current.edges.map((edge) => [edge.id, edge]));
  const proposedEdges = new Map(proposed.edges.map((edge) => [edge.id, edge]));
  for (const edge of proposed.edges) {
    const previous = currentEdges.get(edge.id);
    const label = edgeLabel(edge, proposedNodes);
    if (!previous) {
      changes.push(
        change("added", "relationship", edge.id, label, "relationship", "Reporting relationship", null, label),
      );
      continue;
    }
    if (previous.source !== edge.source || previous.target !== edge.target) {
      changes.push(
        change(
          "changed",
          "relationship",
          edge.id,
          label,
          "relationship",
          "Reporting relationship",
          edgeLabel(previous, currentNodes),
          label,
        ),
      );
    }
    if (!jsonEqual(previous.data?.manualRoute, edge.data?.manualRoute)) {
      changes.push(
        change("changed", "layout", edge.id, label, "manualRoute", "Pinned connector route", previous.data?.manualRoute ? "Pinned" : "Automatic", edge.data?.manualRoute ? "Pinned" : "Automatic"),
      );
    }
  }
  for (const edge of current.edges) {
    if (!proposedEdges.has(edge.id)) {
      const label = edgeLabel(edge, currentNodes);
      changes.push(
        change("removed", "relationship", edge.id, label, "relationship", "Reporting relationship", label, null),
      );
    }
  }

  const idsFor = (category: "unit" | "relationship", kind: AiChangeKind) =>
    Array.from(
      new Set(
        changes
          .filter((item) => item.category === category && item.kind === kind)
          .map((item) => item.entityId),
      ),
    );
  const changedNodeIds = Array.from(
    new Set(
      changes
        .filter((item) => (item.category === "unit" || item.category === "layout") && proposedNodes.has(item.entityId))
        .map((item) => item.entityId),
    ),
  );
  const changedEdgeIds = Array.from(
    new Set(
      changes
        .filter((item) => (item.category === "relationship" || item.category === "layout") && proposedEdges.has(item.entityId))
        .map((item) => item.entityId),
    ),
  );
  const added = changes.filter((item) => item.kind === "added").length;
  const removed = changes.filter((item) => item.kind === "removed").length;
  const changed = changes.length - added - removed;
  const affectedUnits = new Set(
    changes
      .filter((item) => item.category === "unit" || (item.category === "layout" && proposedNodes.has(item.entityId)))
      .map((item) => item.entityId),
  ).size;
  const affectedRelationships = new Set(
    changes
      .filter((item) => item.category === "relationship" || (item.category === "layout" && proposedEdges.has(item.entityId)))
      .map((item) => item.entityId),
  ).size;
  const summary: AiChangeSummary = {
    total: changes.length,
    added,
    changed,
    removed,
    changedNodeIds,
    addedNodeIds: idsFor("unit", "added"),
    removedNodeIds: idsFor("unit", "removed"),
    changedEdgeIds,
    addedEdgeIds: idsFor("relationship", "added"),
    removedEdgeIds: idsFor("relationship", "removed"),
    text: `${changes.length} field change${changes.length === 1 ? "" : "s"} across ${affectedUnits} unit${affectedUnits === 1 ? "" : "s"} and ${affectedRelationships} relationship${affectedRelationships === 1 ? "" : "s"}.`,
  };
  return { changes, summary };
}
