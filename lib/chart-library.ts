import type { Edge } from "@xyflow/react";
import {
  descendantIds,
  initialEdges,
  initialNodes,
  type OrgFlowNode,
} from "./org-chart";

export type ChartStatus = "draft" | "in_review" | "current" | "archived";

export interface ChartLifecycleMetadata {
  statusChangedAt: string;
  lastCurrentAt: string | null;
  lastCurrentVersion: number | null;
  lastCurrentBy: string;
  lastCurrentNote: string;
}

export const chartStatusLabels: Record<ChartStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  current: "Current",
  archived: "Archived",
};

export const chartStatusDescriptions: Record<ChartStatus, string> = {
  draft: "Actively being built or edited; not yet approved.",
  in_review: "Submitted for a person to verify before it becomes Current.",
  current: "Approved, authoritative, and currently in use.",
  archived: "Historical and read-only; no longer the working chart.",
};

export function normalizeChartStatus(status: unknown): ChartStatus {
  if (status === "approved") return "current";
  if (status === "in_review" || status === "current" || status === "archived") {
    return status;
  }
  return "draft";
}

export function normalizeChartLifecycle(
  lifecycle: Partial<ChartLifecycleMetadata> | null | undefined,
  status: ChartStatus,
  updatedAt: string,
  version: number,
  legacyApproved = false,
): ChartLifecycleMetadata {
  const inferredCurrentAt = status === "current" ? updatedAt : null;
  const inferredCurrentVersion = status === "current" ? version : null;
  return {
    statusChangedAt: lifecycle?.statusChangedAt || updatedAt,
    lastCurrentAt: lifecycle?.lastCurrentAt || inferredCurrentAt,
    lastCurrentVersion: lifecycle?.lastCurrentVersion ?? inferredCurrentVersion,
    lastCurrentBy:
      lifecycle?.lastCurrentBy ||
      (legacyApproved || (status === "current" && !lifecycle)
        ? "Migrated approved record"
        : ""),
    lastCurrentNote: lifecycle?.lastCurrentNote || "",
  };
}

export const RETIRED_EXAMPLE_CHART_IDS = [
  "chart-synthetic-laboratory",
  "chart-example-research",
  "chart-example-operations",
] as const;

export function isRetiredExampleChartId(chartId: string): boolean {
  return (RETIRED_EXAMPLE_CHART_IDS as readonly string[]).includes(chartId);
}

export interface SourceRecord {
  id: string;
  chartId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  checksum: string;
  storageKey: string;
  sourceType: "structured_import" | "guided_extraction" | "synthetic";
  importedAt: string;
  rowCount: number;
  warningCount: number;
}

export interface ChartDocument {
  id: string;
  name: string;
  description: string;
  status: ChartStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  lifecycle: ChartLifecycleMetadata;
  nodes: OrgFlowNode[];
  edges: Edge[];
  sources: SourceRecord[];
}

export interface ChartLibraryResponse {
  charts: ChartDocument[];
}

export interface ChartVersion {
  id: string;
  chartId: string;
  version: number;
  label: string;
  createdAt: string;
  restoredFromVersion: number | null;
  nodes: OrgFlowNode[];
  edges: Edge[];
}

export interface ChartVersionsResponse {
  versions: ChartVersion[];
}

export function storageSafeNodes(nodes: OrgFlowNode[]): OrgFlowNode[] {
  return nodes.map((flowNode) => ({
    id: flowNode.id,
    type: "orgUnit",
    position: { ...flowNode.position },
    data: {
      unit: flowNode.data.unit,
      pinned: Boolean(flowNode.data.pinned),
    },
  }));
}

function branchDocument(
  id: string,
  name: string,
  description: string,
  rootId: string,
  date: string,
): ChartDocument {
  const branchIds = descendantIds(rootId, initialEdges);
  const nodes = storageSafeNodes(
    initialNodes
      .filter((flowNode) => branchIds.has(flowNode.id))
      .map((flowNode) => ({
        ...flowNode,
        position: {
          x: flowNode.position.x - Math.min(
            ...initialNodes
              .filter((candidate) => branchIds.has(candidate.id))
              .map((candidate) => candidate.position.x),
          ),
          y: flowNode.position.y - Math.min(
            ...initialNodes
              .filter((candidate) => branchIds.has(candidate.id))
              .map((candidate) => candidate.position.y),
          ),
        },
      })),
  );
  const edges = initialEdges.filter(
    (edge) => branchIds.has(edge.source) && branchIds.has(edge.target),
  );

  return {
    id,
    name,
    description,
    status: "draft",
    version: 1,
    createdAt: date,
    updatedAt: date,
    lifecycle: normalizeChartLifecycle(null, "draft", date, 1),
    nodes,
    edges,
    sources: [],
  };
}

export function seedChartDocuments(): ChartDocument[] {
  const date = "2026-07-31T15:00:00-04:00";
  const primary: ChartDocument = {
    id: "chart-synthetic-laboratory",
    name: "Synthetic Laboratory Overview",
    description: "Complete synthetic hierarchy used for technical prototype testing.",
    status: "draft",
    version: 1,
    createdAt: date,
    updatedAt: date,
    lifecycle: normalizeChartLifecycle(null, "draft", date, 1),
    nodes: storageSafeNodes(initialNodes),
    edges: initialEdges,
    sources: [
      {
        id: "source-synthetic-fixture",
        chartId: "chart-synthetic-laboratory",
        fileName: "built-in-synthetic-fixture",
        contentType: "application/json",
        fileSize: 0,
        checksum: "synthetic-fixture",
        storageKey: "",
        sourceType: "synthetic",
        importedAt: date,
        rowCount: initialNodes.length,
        warningCount: 0,
      },
    ],
  };

  return [
    primary,
    branchDocument(
      "chart-example-research",
      "Example Research Directorate",
      "Synthetic directorate-level working chart.",
      "unit-research",
      date,
    ),
    branchDocument(
      "chart-example-operations",
      "Example Operations Directorate",
      "Synthetic operations branch for layout and publication testing.",
      "unit-operations",
      date,
    ),
  ];
}

export function createBlankChart(name: string, id = crypto.randomUUID()): ChartDocument {
  const now = new Date().toISOString();
  const rootId = `unit-${crypto.randomUUID()}`;

  return {
    id,
    name,
    description: "New draft chart. Complete the organization details before review.",
    status: "draft",
    version: 1,
    createdAt: now,
    updatedAt: now,
    lifecycle: normalizeChartLifecycle(null, "draft", now, 1),
    nodes: [
      {
        id: rootId,
        type: "orgUnit",
        position: { x: 0, y: 0 },
        data: {
          pinned: false,
          unit: {
            id: rootId,
            name: "Untitled organization",
            shortName: "Untitled organization",
            type: "laboratory",
            positionTitle: "Leadership position",
            assignmentLabel: "Position vacant",
            positionStatus: "vacant",
            effectiveDate: "Current",
            source: "User-created draft",
            sourceLocator: "",
            sourceCertainty: "confirmed",
            reviewNote: "",
            planningState: "current",
            publicationVisibility: "internal",
          },
        },
      },
    ],
    edges: [],
    sources: [],
  };
}
