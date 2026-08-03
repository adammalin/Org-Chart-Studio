import type { Edge } from "@xyflow/react";
import type { ChartDocument } from "./chart-library";
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  type OrgFlowNode,
  type PositionStatus,
} from "./org-chart";
import {
  buildOrthogonalEdgeRoutes,
  manualEdgeRouteForEdge,
  sourcePortOffset,
  type ConnectorRoutingMode,
} from "./edge-routing";

export type ExportAudience = "internal" | "public";
export type ExportPresetId =
  | "natural"
  | "presentation-wide"
  | "tabloid-landscape"
  | "tabloid-portrait";

export interface ExportPreset {
  id: ExportPresetId;
  label: string;
  description: string;
  width: number | null;
  height: number | null;
  pageWidthInches: number | null;
  pageHeightInches: number | null;
}

export const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: "natural",
    label: "SVG master / natural bounds",
    description: "Uses the complete chart bounds without forcing a paper or slide ratio.",
    width: null,
    height: null,
    pageWidthInches: null,
    pageHeightInches: null,
  },
  {
    id: "presentation-wide",
    label: "16:9 presentation",
    description: "Fits the complete chart onto a widescreen presentation canvas.",
    width: 1_600,
    height: 900,
    pageWidthInches: 13.333,
    pageHeightInches: 7.5,
  },
  {
    id: "tabloid-landscape",
    label: "11 × 17 landscape",
    description: "Fits the complete chart to tabloid landscape dimensions.",
    width: 2_200,
    height: 1_400,
    pageWidthInches: 17,
    pageHeightInches: 11,
  },
  {
    id: "tabloid-portrait",
    label: "11 × 17 portrait",
    description: "Fits the complete chart to tabloid portrait dimensions.",
    width: 1_400,
    height: 2_200,
    pageWidthInches: 11,
    pageHeightInches: 17,
  },
];

export interface ExportViewport {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  preset: ExportPreset;
}

export interface ExportSceneNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  unitType: string;
  nameLines: string[];
  positionTitle: string;
  status: PositionStatus;
  statusText: string;
  targetPortOffset: number;
  sourcePortOffsets: number[];
}

export interface ExportConnectionPoint {
  kind: "target" | "source";
  x: number;
  y: number;
}

export interface ExportSceneEdge {
  id: string;
  sourceId: string;
  targetId: string;
  points: Array<{ x: number; y: number }>;
}

export interface ChartExportScene {
  chartId: string;
  chartName: string;
  chartStatus: ChartDocument["status"];
  chartVersion: number;
  generatedAt: string;
  audience: ExportAudience;
  width: number;
  height: number;
  nodes: ExportSceneNode[];
  edges: ExportSceneEdge[];
  excludedNodeCount: number;
}

export const EXPORT_COLORS = {
  green: "00662C",
  darkTeal: "00454D",
  blue: "006BA6",
  orange: "FF9E1B",
  ink: "373A36",
  white: "FFFFFF",
  softGray: "F3F5F3",
} as const;

export const EXPORT_CONNECTION_POINT_RADIUS = 4;
export const EXPORT_CONNECTION_POINT_STROKE_WIDTH = 2;

const STATUS_LABELS: Record<PositionStatus, string> = {
  filled: "Filled",
  acting: "Acting",
  vacant: "Vacant",
};

const HEADER_HEIGHT = 74;
const FOOTER_HEIGHT = 34;
const PADDING = 52;

function compactText(value: string, maximum = 44): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maximum
    ? normalized
    : `${normalized.slice(0, Math.max(1, maximum - 1)).trimEnd()}…`;
}

function wrapName(value: string): string[] {
  const normalized = value.replace(/\s+/g, " ").trim();
  return [compactText(normalized || "Unnamed unit", 27)];
}

function visibleForAudience(node: OrgFlowNode, audience: ExportAudience): boolean {
  return audience === "internal" || node.data.unit.publicationVisibility === "public";
}

function assertAudienceHierarchyClosed(
  chart: ChartDocument,
  audience: ExportAudience,
  includedIds: Set<string>,
) {
  if (audience !== "public") return;
  const detachedEdge = chart.edges.find(
    (edge) => includedIds.has(edge.target) && !includedIds.has(edge.source),
  );
  if (!detachedEdge) return;
  const detachedNode = chart.nodes.find((node) => node.id === detachedEdge.target);
  throw new Error(
    `The public profile would detach ${detachedNode?.data.unit.shortName ?? detachedEdge.target} from an internal-only parent. Mark its full ancestor path public or keep this unit internal before exporting.`,
  );
}

export function safeExportFileStem(value: string): string {
  const stem = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 72);
  return stem || "organizational-chart";
}

export function resolveExportViewport(
  scene: ChartExportScene,
  presetId: ExportPresetId,
): ExportViewport {
  const preset = EXPORT_PRESETS.find((candidate) => candidate.id === presetId) ?? EXPORT_PRESETS[0];
  if (!preset.width || !preset.height) {
    return {
      width: scene.width,
      height: scene.height,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      preset,
    };
  }
  const safeMargin = Math.min(preset.width, preset.height) * 0.02;
  const scale = Math.min(
    (preset.width - safeMargin * 2) / scene.width,
    (preset.height - safeMargin * 2) / scene.height,
  );
  return {
    width: preset.width,
    height: preset.height,
    scale,
    offsetX: (preset.width - scene.width * scale) / 2,
    offsetY: (preset.height - scene.height * scale) / 2,
    preset,
  };
}

export function buildChartExportScene(
  chart: ChartDocument,
  audience: ExportAudience,
  generatedAt = new Date().toISOString(),
  connectorRoutingMode: ConnectorRoutingMode = "separate",
): ChartExportScene {
  const includedNodes = chart.nodes.filter((node) => visibleForAudience(node, audience));
  if (!includedNodes.length) {
    throw new Error("This publication audience does not include any units.");
  }

  const includedIds = new Set(includedNodes.map((node) => node.id));
  assertAudienceHierarchyClosed(chart, audience, includedIds);
  const sourceEdges = chart.edges.filter(
    (edge) => includedIds.has(edge.source) && includedIds.has(edge.target),
  );
  const minX = Math.min(...includedNodes.map((node) => node.position.x));
  const minY = Math.min(...includedNodes.map((node) => node.position.y));
  const maxX = Math.max(...includedNodes.map((node) => node.position.x + NODE_WIDTH));
  const maxY = Math.max(...includedNodes.map((node) => node.position.y + NODE_HEIGHT));
  const offsetX = PADDING - minX;
  const offsetY = HEADER_HEIGHT + PADDING - minY;
  const includedEdges = sourceEdges.map((edge) => {
    const manualRoute = manualEdgeRouteForEdge(edge);
    if (!manualRoute) return edge;
    return {
      ...edge,
      data: {
        ...edge.data,
        manualRoute: {
          ...manualRoute,
          points: manualRoute.points.map((point) => ({
            x: point.x + offsetX,
            y: point.y + offsetY,
          })),
        },
      },
    };
  });

  const baseNodes = includedNodes.map((node) => {
    const unit = node.data.unit;
    const statusText =
      audience === "public"
        ? STATUS_LABELS[unit.positionStatus]
        : unit.positionStatus === "filled"
          ? compactText(unit.assignmentLabel, 35)
          : STATUS_LABELS[unit.positionStatus];
    return {
      id: node.id,
      x: node.position.x + offsetX,
      y: node.position.y + offsetY,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      unitType: unit.type.toUpperCase(),
      nameLines: wrapName(unit.shortName || unit.name),
      positionTitle: compactText(unit.positionTitle, 39),
      status: unit.positionStatus,
      statusText,
    };
  });
  const nodeById = new Map(baseNodes.map((node) => [node.id, node]));
  const routedEdges = buildOrthogonalEdgeRoutes(
    baseNodes,
    includedEdges,
    connectorRoutingMode,
  );
  const sourcePortCounts = new Map<string, number>();
  const targetPortOffsets = new Map<string, number>();
  routedEdges.forEach((route) => {
    sourcePortCounts.set(route.sourceId, route.sourcePortCount);
    const targetNode = nodeById.get(route.targetId);
    const endpoint = route.points.at(-1);
    if (!targetNode || !endpoint) return;
    targetPortOffsets.set(
      route.targetId,
      endpoint.x - (targetNode.x + targetNode.width / 2),
    );
  });
  const nodes: ExportSceneNode[] = baseNodes.map((node) => {
    const sourcePortCount = Math.max(1, sourcePortCounts.get(node.id) ?? 0);
    return {
      ...node,
      targetPortOffset: targetPortOffsets.get(node.id) ?? 0,
      sourcePortOffsets: Array.from({ length: sourcePortCount }, (_, index) =>
        sourcePortOffset(index, sourcePortCount, node.width),
      ),
    };
  });
  const edges: ExportSceneEdge[] = includedEdges.flatMap((edge: Edge) => {
    const route = routedEdges.get(edge.id);
    if (!route || !nodeById.has(edge.source) || !nodeById.has(edge.target)) return [];
    return [
      {
        id: edge.id,
        sourceId: edge.source,
        targetId: edge.target,
        points: route.points,
      },
    ];
  });

  return {
    chartId: chart.id,
    chartName: chart.name,
    chartStatus: chart.status,
    chartVersion: chart.version,
    generatedAt,
    audience,
    width: Math.max(760, maxX - minX + PADDING * 2),
    height: maxY - minY + HEADER_HEIGHT + FOOTER_HEIGHT + PADDING * 2,
    nodes,
    edges,
    excludedNodeCount: chart.nodes.length - nodes.length,
  };
}

export function connectionPointsForNode(
  node: ExportSceneNode,
): ExportConnectionPoint[] {
  return [
    {
      kind: "target",
      x: node.x + node.width / 2 + node.targetPortOffset,
      y: node.y,
    },
    ...node.sourcePortOffsets.map((offset) => ({
      kind: "source" as const,
      x: node.x + node.width / 2 + offset,
      y: node.y + node.height,
    })),
  ];
}

export function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '\"': "&quot;",
    };
    return entities[character];
  });
}

function statusColor(status: PositionStatus): string {
  if (status === "vacant") return EXPORT_COLORS.orange;
  if (status === "acting") return EXPORT_COLORS.blue;
  return EXPORT_COLORS.green;
}

export function buildChartSvg(
  scene: ChartExportScene,
  presetId: ExportPresetId = "natural",
): string {
  const viewport = resolveExportViewport(scene, presetId);
  const audienceLabel = scene.audience === "public" ? "PUBLIC-SAFE DRAFT" : "INTERNAL WORKING DRAFT";
  const edgeMarkup = scene.edges
    .map((edge) => {
      const path = edge.points
        .map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`)
        .join(" ");
      return `<path d="${path}" fill="none" stroke="#${EXPORT_COLORS.darkTeal}" stroke-width="2"/>`;
    })
    .join("");
  const nodeMarkup = scene.nodes
    .map((node) => {
      const nameMarkup = node.nameLines
        .map(
          (line, index) =>
            `<tspan x="${node.x + 20}" dy="${index ? 20 : 0}">${escapeXml(line)}</tspan>`,
        )
        .join("");
      const titleY = node.y + (node.nameLines.length > 1 ? 92 : 78);
      const connectionPointMarkup = connectionPointsForNode(node)
        .map(
          (point) =>
            `<circle class="org-connection-point org-connection-point--${point.kind}" data-port-kind="${point.kind}" cx="${point.x}" cy="${point.y}" r="${EXPORT_CONNECTION_POINT_RADIUS}" fill="#${EXPORT_COLORS.darkTeal}" stroke="#${EXPORT_COLORS.white}" stroke-width="${EXPORT_CONNECTION_POINT_STROKE_WIDTH}"/>`,
        )
        .join("");
      return `<g data-unit-id="${escapeXml(node.id)}">
        <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" fill="#${EXPORT_COLORS.white}" stroke="#${EXPORT_COLORS.darkTeal}" stroke-width="1.5"/>
        <rect x="${node.x}" y="${node.y}" width="6" height="${node.height}" fill="#${EXPORT_COLORS.green}"/>
        <text x="${node.x + 20}" y="${node.y + 24}" font-family="Mulish, Aptos, Arial, sans-serif" font-size="10" font-weight="700" letter-spacing="1.2" fill="#${EXPORT_COLORS.green}">${escapeXml(node.unitType)}</text>
        <text x="${node.x + 20}" y="${node.y + 51}" font-family="Mulish, Aptos, Arial, sans-serif" font-size="17" font-weight="700" fill="#${EXPORT_COLORS.ink}">${nameMarkup}</text>
        <text x="${node.x + 20}" y="${titleY}" font-family="Mulish, Aptos, Arial, sans-serif" font-size="12" fill="#${EXPORT_COLORS.ink}">${escapeXml(node.positionTitle)}</text>
        <circle cx="${node.x + 24}" cy="${node.y + 114}" r="4" fill="#${statusColor(node.status)}"/>
        <text x="${node.x + 36}" y="${node.y + 118}" font-family="Mulish, Aptos, Arial, sans-serif" font-size="11" fill="#${EXPORT_COLORS.ink}">${escapeXml(node.statusText)}</text>
        ${connectionPointMarkup}
      </g>`;
    })
    .join("");

  const generatedLabel = new Date(scene.generatedAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${viewport.width}" height="${viewport.height}" viewBox="0 0 ${viewport.width} ${viewport.height}" role="img" aria-labelledby="title description">
    <title id="title">${escapeXml(scene.chartName)} organizational chart</title>
    <desc id="description">${escapeXml(audienceLabel)}, version ${scene.chartVersion}, ${escapeXml(viewport.preset.label)}, generated ${escapeXml(generatedLabel)}.</desc>
    <rect width="${viewport.width}" height="${viewport.height}" fill="#${EXPORT_COLORS.softGray}"/>
    <g transform="translate(${viewport.offsetX} ${viewport.offsetY}) scale(${viewport.scale})">
    <rect width="${scene.width}" height="${scene.height}" fill="#${EXPORT_COLORS.softGray}"/>
    <rect x="0" y="0" width="${scene.width}" height="${HEADER_HEIGHT}" fill="#${EXPORT_COLORS.white}"/>
    <rect x="0" y="0" width="8" height="${HEADER_HEIGHT}" fill="#${EXPORT_COLORS.green}"/>
    <text x="30" y="31" font-family="Mulish, Aptos, Arial, sans-serif" font-size="20" font-weight="700" fill="#${EXPORT_COLORS.ink}">${escapeXml(scene.chartName)}</text>
    <text x="30" y="53" font-family="Mulish, Aptos, Arial, sans-serif" font-size="10" font-weight="700" letter-spacing="1.1" fill="#${EXPORT_COLORS.darkTeal}">${audienceLabel} • VERSION ${scene.chartVersion}</text>
    ${edgeMarkup}${nodeMarkup}
    <text x="${PADDING}" y="${scene.height - 15}" font-family="Mulish, Aptos, Arial, sans-serif" font-size="10" fill="#${EXPORT_COLORS.ink}">Generated ${escapeXml(generatedLabel)} • ${scene.nodes.length} units${scene.excludedNodeCount ? ` • ${scene.excludedNodeCount} excluded by audience profile` : ""}</text>
    </g>
  </svg>`;
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildAccessibleTableCsv(
  chart: ChartDocument,
  audience: ExportAudience,
): string {
  const includedNodes = chart.nodes.filter((node) => visibleForAudience(node, audience));
  const includedIds = new Set(includedNodes.map((node) => node.id));
  assertAudienceHierarchyClosed(chart, audience, includedIds);
  const parentById = new Map(
    chart.edges
      .filter((edge) => includedIds.has(edge.source) && includedIds.has(edge.target))
      .map((edge) => [edge.target, edge.source]),
  );
  const nameById = new Map(
    includedNodes.map((node) => [node.id, node.data.unit.name]),
  );
  const publicHeaders = ["unit", "parent", "unitType", "positionTitle", "positionStatus", "effectiveDate"];
  const internalHeaders = [
    "unitId",
    ...publicHeaders,
    "assignmentLabel",
    "publicationVisibility",
    "source",
  ];
  const headers = audience === "public" ? publicHeaders : internalHeaders;
  const rows = includedNodes.map((node) => {
    const unit = node.data.unit;
    const publicValues = [
      unit.name,
      nameById.get(parentById.get(node.id) ?? "") ?? "Root",
      unit.type,
      unit.positionTitle,
      unit.positionStatus,
      unit.effectiveDate,
    ];
    return audience === "public"
      ? publicValues
      : [
          node.id,
          ...publicValues,
          unit.assignmentLabel,
          unit.publicationVisibility,
          unit.source,
        ];
  });
  return [headers, ...rows]
    .map((row) => row.map((value) => csvCell(String(value))).join(","))
    .join("\r\n");
}
