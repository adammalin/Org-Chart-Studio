import type { Edge } from "@xyflow/react";
import type { ChartDocument } from "./chart-library";
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  arrangeCompactPresentation,
  compactNodeDimensions,
  deriveCompactPresentation,
  type ChartPresentationMode,
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
  hierarchyLevel: number;
  targetSide: "top" | "left";
  compactEntries: ExportSceneCompactEntry[];
  compactListStartY: number | null;
  showConnectionPoints: boolean;
  targetPortOffset: number;
  sourcePortOffsets: number[];
}

export interface ExportSceneCompactEntry {
  id: string;
  name: string;
  positionTitle: string;
  status: PositionStatus;
  statusText: string;
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
  presentationMode: ChartPresentationMode;
  width: number;
  height: number;
  nodes: ExportSceneNode[];
  edges: ExportSceneEdge[];
  excludedNodeCount: number;
  groupedNodeCount: number;
}

export const EXPORT_COLORS = {
  green: "00662C",
  darkTeal: "00454D",
  graphite: "DBDCDB",
  energy: "7DBA00",
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

export function estimateExportTextWidth(
  value: string,
  fontSize: number,
  bold = false,
): number {
  const units = Array.from(value).reduce((total, character) => {
    if (/\s/.test(character)) return total + 0.34;
    if (/[ilI1|.,'`:;]/.test(character)) return total + 0.3;
    if (/[MW@%&]/.test(character)) return total + 0.88;
    if (/[A-Z0-9]/.test(character)) return total + 0.62;
    return total + 0.54;
  }, 0);
  return units * fontSize * (bold ? 1.04 : 1);
}

export function fitExportText(
  value: string,
  maximumWidth: number,
  fontSize: number,
  bold = false,
): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || estimateExportTextWidth(normalized, fontSize, bold) <= maximumWidth) {
    return normalized;
  }
  const suffix = "…";
  let fitted = normalized;
  while (
    fitted.length > 1 &&
    estimateExportTextWidth(`${fitted.trimEnd()}${suffix}`, fontSize, bold) > maximumWidth
  ) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted.trimEnd()}${suffix}`;
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
  presentationMode: ChartPresentationMode = "individual",
): ChartExportScene {
  const audienceNodes = chart.nodes.filter((node) => visibleForAudience(node, audience));
  if (!audienceNodes.length) {
    throw new Error("This publication audience does not include any units.");
  }

  const audienceIds = new Set(audienceNodes.map((node) => node.id));
  assertAudienceHierarchyClosed(chart, audience, audienceIds);
  const audienceEdges = chart.edges.filter(
    (edge) => audienceIds.has(edge.source) && audienceIds.has(edge.target),
  );
  const compactPresentation = deriveCompactPresentation(audienceNodes, audienceEdges);
  const includedNodes =
    presentationMode === "compact"
      ? arrangeCompactPresentation(audienceNodes, audienceEdges, compactPresentation)
      : audienceNodes;
  const includedIds = new Set(includedNodes.map((node) => node.id));
  const sourceEdges = audienceEdges.filter(
    (edge) => includedIds.has(edge.source) && includedIds.has(edge.target),
  );
  const dimensionsById = new Map(
    includedNodes.map((node) => {
      const level = compactPresentation.levels.get(node.id) ?? 1;
      const entries =
        presentationMode === "compact"
          ? (compactPresentation.entriesByParent.get(node.id) ?? [])
          : [];
      return [
        node.id,
        presentationMode === "compact"
          ? compactNodeDimensions(
              level,
              entries.length,
              compactPresentation.sidecarNodeIds.has(node.id),
            )
          : { width: NODE_WIDTH, height: NODE_HEIGHT },
      ] as const;
    }),
  );
  const minX = Math.min(...includedNodes.map((node) => node.position.x));
  const minY = Math.min(...includedNodes.map((node) => node.position.y));
  const maxX = Math.max(
    ...includedNodes.map(
      (node) => node.position.x + (dimensionsById.get(node.id)?.width ?? NODE_WIDTH),
    ),
  );
  const maxY = Math.max(
    ...includedNodes.map(
      (node) => node.position.y + (dimensionsById.get(node.id)?.height ?? NODE_HEIGHT),
    ),
  );
  const offsetX = PADDING - minX;
  const offsetY = HEADER_HEIGHT + PADDING - minY;
  const includedEdges = sourceEdges.map((edge) => {
    const manualRoute = presentationMode === "compact" ? undefined : manualEdgeRouteForEdge(edge);
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
    const hierarchyLevel = compactPresentation.levels.get(node.id) ?? 1;
    const dimensions = dimensionsById.get(node.id) ?? { width: NODE_WIDTH, height: NODE_HEIGHT };
    const compactEntryTextWidth = Math.max(48, dimensions.width - 138);
    const compactEntryStatusWidth = Math.min(96, Math.max(56, dimensions.width * 0.36));
    const compactEntries =
      presentationMode === "compact"
        ? (compactPresentation.entriesByParent.get(node.id) ?? []).map((entry) => ({
            id: entry.id,
            name: fitExportText(
              compactText(entry.unit.shortName || entry.unit.name, 34),
              compactEntryTextWidth,
              10,
              true,
            ),
            positionTitle: fitExportText(
              compactText(entry.unit.positionTitle, 40),
              compactEntryTextWidth,
              8,
            ),
            status: entry.unit.positionStatus,
            statusText: fitExportText(
              audience === "public"
                ? STATUS_LABELS[entry.unit.positionStatus]
                : entry.unit.positionStatus === "filled"
                  ? compactText(entry.unit.assignmentLabel, 34)
                  : STATUS_LABELS[entry.unit.positionStatus],
              compactEntryStatusWidth,
              8,
              true,
            ),
          }))
        : [];
    const rawStatusText =
      audience === "public"
        ? STATUS_LABELS[unit.positionStatus]
        : unit.positionStatus === "filled"
          ? compactText(unit.assignmentLabel, 35)
          : STATUS_LABELS[unit.positionStatus];
    const compact = presentationMode === "compact";
    const nameFontSize = compact && hierarchyLevel === 1 ? 22 : 17;
    const horizontalTextInset = compact ? 32 : 40;
    const statusText = fitExportText(
      rawStatusText,
      Math.max(56, dimensions.width - (compact ? 56 : 48)),
      11,
      true,
    );
    return {
      id: node.id,
      x: node.position.x + offsetX,
      y: node.position.y + offsetY,
      width: dimensions.width,
      height: dimensions.height,
      unitType: unit.type.toUpperCase(),
      nameLines: wrapName(unit.shortName || unit.name).map((line) =>
        fitExportText(line, dimensions.width - horizontalTextInset, nameFontSize, true),
      ),
      positionTitle: fitExportText(
        compactText(unit.positionTitle, 39),
        dimensions.width - horizontalTextInset,
        12,
      ),
      status: unit.positionStatus,
      statusText,
      hierarchyLevel,
      targetSide:
        presentationMode === "compact" &&
        (hierarchyLevel >= 3 || compactPresentation.sidecarNodeIds.has(node.id))
          ? ("left" as const)
          : ("top" as const),
      compactEntries,
      compactListStartY: compactEntries.length
        ? dimensions.height - (34 + compactEntries.length * 54)
        : null,
      showConnectionPoints: presentationMode === "individual",
    };
  });
  const nodeById = new Map(baseNodes.map((node) => [node.id, node]));
  const routedEdges = buildOrthogonalEdgeRoutes(
    baseNodes.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      targetSide: node.targetSide,
    })),
    includedEdges,
    presentationMode === "compact" ? "combed" : connectorRoutingMode,
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
      route.targetSide === "left"
        ? endpoint.y - (targetNode.y + targetNode.height / 2)
        : endpoint.x - (targetNode.x + targetNode.width / 2),
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
    presentationMode,
    width: Math.max(760, maxX - minX + PADDING * 2),
    height: maxY - minY + HEADER_HEIGHT + FOOTER_HEIGHT + PADDING * 2,
    nodes,
    edges,
    excludedNodeCount: chart.nodes.length - audienceNodes.length,
    groupedNodeCount:
      presentationMode === "compact" ? compactPresentation.listedNodeIds.size : 0,
  };
}

export function connectionPointsForNode(
  node: ExportSceneNode,
): ExportConnectionPoint[] {
  if (!node.showConnectionPoints) return [];
  return [
    {
      kind: "target",
      x:
        node.targetSide === "left"
          ? node.x
          : node.x + node.width / 2 + node.targetPortOffset,
      y:
        node.targetSide === "left"
          ? node.y + node.height / 2 + node.targetPortOffset
          : node.y,
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
    .map((node, nodeIndex) => {
      const compact = scene.presentationMode === "compact";
      const textX = compact ? node.x + node.width / 2 : node.x + 20;
      const textAnchor = compact ? ' text-anchor="middle"' : "";
      const nameMarkup = node.nameLines
        .map(
          (line, index) =>
            `<tspan x="${textX}" dy="${index ? 20 : 0}">${escapeXml(line)}</tspan>`,
        )
        .join("");
      const titleY = node.y + (node.nameLines.length > 1 ? 92 : 78);
      const statusTextWidth = estimateExportTextWidth(node.statusText, 11, true);
      const statusRowStartX = compact
        ? textX - (8 + 7 + statusTextWidth) / 2
        : node.x + 20;
      const statusMarkerX = compact ? statusRowStartX + 4 : node.x + 24;
      const statusTextX = compact ? statusRowStartX + 15 : node.x + 36;
      const compactEntryMarkup = node.compactListStartY === null
        ? ""
        : `<g class="compact-roster">
            <rect x="${node.x}" y="${node.y + node.compactListStartY}" width="${node.width}" height="34" fill="#${EXPORT_COLORS.green}" fill-opacity="0.08"/>
            <text x="${node.x + 12}" y="${node.y + node.compactListStartY + 21}" font-family="Mulish, Aptos, Arial, sans-serif" font-size="8" font-weight="700" letter-spacing="0.8" fill="#${EXPORT_COLORS.darkTeal}">${node.compactEntries.length} LISTED ASSIGNMENT${node.compactEntries.length === 1 ? "" : "S"}</text>
            ${node.compactEntries.map((entry, index) => {
              const rowY = node.y + node.compactListStartY! + 34 + index * 54;
              const entryStatusRight = node.x + node.width - 12;
              const entryStatusTextWidth = estimateExportTextWidth(entry.statusText, 8, true);
              const entryStatusMarkerX = entryStatusRight - entryStatusTextWidth - 5 - 4;
              return `<g data-compact-entry-id="${escapeXml(entry.id)}">
                <line x1="${node.x}" y1="${rowY}" x2="${node.x + node.width}" y2="${rowY}" stroke="#${EXPORT_COLORS.graphite}" stroke-width="1"/>
                <text x="${node.x + 12}" y="${rowY + 19}" font-family="Mulish, Aptos, Arial, sans-serif" font-size="10" font-weight="700" fill="#${EXPORT_COLORS.darkTeal}">${escapeXml(entry.name)}</text>
                <text x="${node.x + 12}" y="${rowY + 35}" font-family="Mulish, Aptos, Arial, sans-serif" font-size="8" fill="#${EXPORT_COLORS.ink}">${escapeXml(entry.positionTitle)}</text>
                <circle cx="${entryStatusMarkerX}" cy="${rowY + 27}" r="4" fill="#${statusColor(entry.status)}"/>
                <text x="${entryStatusRight}" y="${rowY + 31}" text-anchor="end" font-family="Mulish, Aptos, Arial, sans-serif" font-size="8" font-weight="700" fill="#${EXPORT_COLORS.ink}">${escapeXml(entry.statusText)}</text>
              </g>`;
            }).join("")}
          </g>`;
      const connectionPointMarkup = connectionPointsForNode(node)
        .map(
          (point) =>
            `<circle class="org-connection-point org-connection-point--${point.kind}" data-port-kind="${point.kind}" cx="${point.x}" cy="${point.y}" r="${EXPORT_CONNECTION_POINT_RADIUS}" fill="#${EXPORT_COLORS.darkTeal}" stroke="#${EXPORT_COLORS.white}" stroke-width="${EXPORT_CONNECTION_POINT_STROKE_WIDTH}"/>`,
        )
        .join("");
      const cardFill = compact && node.hierarchyLevel === 2
        ? node.unitType === "DIVISION" || node.unitType === "DIRECTORATE"
          ? EXPORT_COLORS.energy
          : EXPORT_COLORS.graphite
        : EXPORT_COLORS.white;
      const cardFillOpacity = compact && node.hierarchyLevel === 2 ? "0.18" : "1";
      return `<g data-unit-id="${escapeXml(node.id)}">
        <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" fill="#${cardFill}" fill-opacity="${cardFillOpacity}" stroke="#${EXPORT_COLORS.darkTeal}" stroke-width="1.5"/>
        <g clip-path="url(#export-card-content-${nodeIndex})">
        ${compact
          ? `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.hierarchyLevel === 1 ? 8 : 5}" fill="#${node.hierarchyLevel === 2 ? EXPORT_COLORS.darkTeal : EXPORT_COLORS.green}"/>`
          : `<rect x="${node.x}" y="${node.y}" width="6" height="${node.height}" fill="#${EXPORT_COLORS.green}"/>`}
        <text x="${textX}" y="${node.y + 24}"${textAnchor} font-family="Mulish, Aptos, Arial, sans-serif" font-size="10" font-weight="700" letter-spacing="1.2" fill="#${EXPORT_COLORS.green}">${escapeXml(node.unitType)}</text>
        <text x="${textX}" y="${node.y + 51}"${textAnchor} font-family="Mulish, Aptos, Arial, sans-serif" font-size="${compact && node.hierarchyLevel === 1 ? 22 : 17}" font-weight="700" fill="#${EXPORT_COLORS.ink}">${nameMarkup}</text>
        <text x="${textX}" y="${titleY}"${textAnchor} font-family="Mulish, Aptos, Arial, sans-serif" font-size="12" fill="#${EXPORT_COLORS.ink}">${escapeXml(node.positionTitle)}</text>
        <circle cx="${statusMarkerX}" cy="${node.y + 114}" r="4" fill="#${statusColor(node.status)}"/>
        <text x="${statusTextX}" y="${node.y + 118}" font-family="Mulish, Aptos, Arial, sans-serif" font-size="11" font-weight="700" fill="#${EXPORT_COLORS.ink}">${escapeXml(node.statusText)}</text>
        ${compactEntryMarkup}
        </g>
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
    <desc id="description">${escapeXml(audienceLabel)}, version ${scene.chartVersion}, ${scene.presentationMode === "compact" ? "compact grouped presentation" : "individual card presentation"}, ${escapeXml(viewport.preset.label)}, generated ${escapeXml(generatedLabel)}.</desc>
    <defs>
      ${scene.nodes.map((node, index) => `<clipPath id="export-card-content-${index}" clipPathUnits="userSpaceOnUse"><rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"/></clipPath>`).join("")}
    </defs>
    <rect width="${viewport.width}" height="${viewport.height}" fill="#${EXPORT_COLORS.softGray}"/>
    <g transform="translate(${viewport.offsetX} ${viewport.offsetY}) scale(${viewport.scale})">
    <rect width="${scene.width}" height="${scene.height}" fill="#${EXPORT_COLORS.softGray}"/>
    <rect x="0" y="0" width="${scene.width}" height="${HEADER_HEIGHT}" fill="#${EXPORT_COLORS.white}"/>
    <rect x="0" y="0" width="8" height="${HEADER_HEIGHT}" fill="#${EXPORT_COLORS.green}"/>
    <text x="30" y="31" font-family="Mulish, Aptos, Arial, sans-serif" font-size="20" font-weight="700" fill="#${EXPORT_COLORS.ink}">${escapeXml(scene.chartName)}</text>
    <text x="30" y="53" font-family="Mulish, Aptos, Arial, sans-serif" font-size="10" font-weight="700" letter-spacing="1.1" fill="#${EXPORT_COLORS.darkTeal}">${audienceLabel} • VERSION ${scene.chartVersion}</text>
    ${edgeMarkup}${nodeMarkup}
    <text x="${PADDING}" y="${scene.height - 15}" font-family="Mulish, Aptos, Arial, sans-serif" font-size="10" fill="#${EXPORT_COLORS.ink}">Generated ${escapeXml(generatedLabel)} • ${scene.nodes.length} cards${scene.groupedNodeCount ? ` • ${scene.groupedNodeCount} grouped entries` : ""}${scene.excludedNodeCount ? ` • ${scene.excludedNodeCount} excluded by audience profile` : ""}</text>
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
