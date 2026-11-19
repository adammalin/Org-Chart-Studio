import {officialCard,officialSupport,officialScale,type OfficialCard,type ChartAppearance,type ChartFonts} from "./chart-appearance";
import {officialCardSvg,officialFontStyle} from "./official-export";
import { audienceSupportPanels, panelGeometry } from "./chart-supplements";
import type { Edge } from "@xyflow/react";
import type { ChartDocument } from "./chart-library";
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  arrangeCompactPresentation,
  cleanOrgChartDisplayText,
  compactNodeDimensions,
  deriveCompactPresentation,
  type ChartPresentationMode,
  type CompactLayoutOrientation,
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
  "natural" | "presentation-wide" | "tabloid-landscape" | "tabloid-portrait";

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
    description:
      "Uses the complete chart bounds without forcing a paper or slide ratio.",
    width: null,
    height: null,
    pageWidthInches: null,
    pageHeightInches: null,
  },
  {
    id: "presentation-wide",
    label: "16:9 presentation",
    description:
      "Fits the complete chart onto a widescreen presentation canvas.",
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
  official?: OfficialCard;
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  unitType: string;
  name: string;
  nameLines: string[];
  nameFontSize: number;
  nameLineHeight: number;
  positionTitle: string;
  status: PositionStatus;
  statusText: string;
  statusLines: string[];
  statusFontSize: number;
  statusLineHeight: number;
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

export interface ExportSceneSupportPanel {
  official?: OfficialCard;
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  fontSize: number;
  lineHeight: number;
  assignmentCount: number;
  connector?: { points: { x: number; y: number }[]; style: "solid" | "dashed" };
}

export interface ChartExportScene {
  appearance?: ChartAppearance;
  connectorWidth?: number;
  supportPanels?: ExportSceneSupportPanel[];
  chartId: string;
  chartName: string;
  chartStatus: ChartDocument["status"];
  chartVersion: number;
  lastCurrentAt: string | null;
  lastCurrentVersion: number | null;
  lastCurrentBy: string;
  generatedAt: string;
  audience: ExportAudience;
  presentationMode: ChartPresentationMode;
  compactLayoutOrientation: CompactLayoutOrientation;
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
  not_specified: "Not specified",
};

const HEADER_HEIGHT = 74;
const FOOTER_HEIGHT = 34;
const PADDING = 52;

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

function wrapExportText(
  value: string,
  maximumWidth: number,
  fontSize: number,
  bold = false,
): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (estimateExportTextWidth(word, fontSize, bold) > maximumWidth) {
      if (current) {
        lines.push(current);
        current = "";
      }
      let segment = "";
      for (const character of word) {
        const candidate = `${segment}${character}`;
        if (
          segment &&
          estimateExportTextWidth(candidate, fontSize, bold) > maximumWidth
        ) {
          lines.push(segment);
          segment = character;
        } else {
          segment = candidate;
        }
      }
      current = segment;
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (
      current &&
      estimateExportTextWidth(candidate, fontSize, bold) > maximumWidth
    ) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function layoutExportStatus(
  value: string,
  maximumWidth: number,
  maximumHeight: number,
): { text: string; lines: string[]; fontSize: number; lineHeight: number } {
  const text = cleanOrgChartDisplayText(value) || "Unassigned";
  for (let fontSize = 11; fontSize >= 3; fontSize -= 0.5) {
    const lineHeight = fontSize * 1.14;
    const lines = wrapExportText(text, maximumWidth, fontSize, true);
    if (lines.length * lineHeight <= maximumHeight) {
      return { text, lines, fontSize, lineHeight };
    }
  }
  const fontSize = 3;
  return {
    text,
    lines: wrapExportText(text, maximumWidth, fontSize, true),
    fontSize,
    lineHeight: fontSize * 1.14,
  };
}

function layoutExportName(
  value: string,
  maximumWidth: number,
  preferredFontSize: number,
): { text: string; lines: string[]; fontSize: number; lineHeight: number } {
  const text = cleanOrgChartDisplayText(value) || "Unnamed unit";
  const maximumLines = 3;
  const maximumHeight = 54;
  for (let fontSize = preferredFontSize; fontSize >= 10; fontSize -= 1) {
    const lineHeight = fontSize * 1.14;
    const lines = wrapExportText(text, maximumWidth, fontSize, true);
    if (
      lines.length <= maximumLines &&
      lines.length * lineHeight <= maximumHeight
    ) {
      return { text, lines, fontSize, lineHeight };
    }
  }
  // Merging overflow into three lines can create text wider than the card.
  // Preserve every word and fit the full block within both card dimensions.
  for (let fontSize = 9.5; fontSize >= 3; fontSize -= 0.5) {
    const lineHeight = fontSize * 1.14;
    const lines = wrapExportText(text, maximumWidth, fontSize, true);
    if (lines.length * lineHeight <= maximumHeight)
      return { text, lines, fontSize, lineHeight };
  }
  throw new Error("The card name needs more space for export. Shorten its display name or enlarge the card.");
}

function visibleForAudience(
  node: OrgFlowNode,
  audience: ExportAudience,
): boolean {
  return (
    audience === "internal" || node.data.unit.publicationVisibility === "public"
  );
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
  const detachedNode = chart.nodes.find(
    (node) => node.id === detachedEdge.target,
  );
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
  const preset =
    EXPORT_PRESETS.find((candidate) => candidate.id === presetId) ??
    EXPORT_PRESETS[0];
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
  compactLayoutOrientation: CompactLayoutOrientation = "vertical",
  appearance: ChartAppearance = "official",
): ChartExportScene {
  const official = appearance === "official";
  const audienceNodes = chart.nodes.filter((node) =>
    visibleForAudience(node, audience),
  );
  if (!audienceNodes.length) {
    throw new Error("This publication audience does not include any units.");
  }

  const audienceIds = new Set(audienceNodes.map((node) => node.id));
  assertAudienceHierarchyClosed(chart, audience, audienceIds);
  const audienceEdges = chart.edges.filter(
    (edge) => audienceIds.has(edge.source) && audienceIds.has(edge.target),
  );
  const compactPresentation = deriveCompactPresentation(
    audienceNodes,
    audienceEdges,
  );
  const includedNodes =
    presentationMode === "compact"
      ? arrangeCompactPresentation(
          audienceNodes,
          audienceEdges,
          compactPresentation,
          compactLayoutOrientation,
        )
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
          : {
              width: Number(node.style?.width) || NODE_WIDTH,
              height: Number(node.style?.height) || NODE_HEIGHT,
            },
      ] as const;
    }),
  );
  const organizationMaxY = Math.max(
    ...includedNodes.map(
      (n) => n.position.y + (dimensionsById.get(n.id)?.height ?? NODE_HEIGHT),
    ),
  );
  const panels = audienceSupportPanels(chart, audience).map((p, index) => {
    const geometry =
      presentationMode === "compact"
        ? {
            x: Math.min(...includedNodes.map((n) => n.position.x)),
            y: organizationMaxY + 72 + index * 520,
            width: p.geometry?.width ?? 520,
            height: p.geometry?.height ?? 100 + p.entries.length * 48,
          }
        : panelGeometry(p, chart);
    let fontSize = 16,
      lines: string[] = [];
    for (; fontSize >= 8; fontSize--) {
      lines = p.entries.flatMap((e) =>
        wrapExportText(
          `${e.role}: ${e.person ? e.person + (e.positionStatus === "acting" && !/interim|acting/i.test(e.person) ? " (Interim)" : "") : STATUS_LABELS[e.positionStatus]}`,
          geometry.width - 40,
          fontSize,
        ),
      );
      if (lines.length * fontSize * 1.5 + 70 <= geometry.height) break;
    }
    if (fontSize < 8)
      throw Error(
        `Support panel ${p.title} needs more space for legible export. Enlarge its saved bounds.`,
      );
    return {
      id: p.id,
      title: p.title,
      ...geometry,
      connector: presentationMode === "compact" ? undefined : p.connector,
      lines,
      fontSize,
      lineHeight: fontSize * 1.5,
      assignmentCount: p.entries.length,
      ...(official?{official:officialSupport(p.title,p.entries,geometry.width,geometry.height,officialScale(presentationMode === "compact"?undefined:chart.sourceLayout?.width,geometry.width))}:{}),
    };
  });
  const rectangles = [
    ...includedNodes.map((n) => ({
      x: n.position.x,
      y: n.position.y,
      width: dimensionsById.get(n.id)!.width,
      height: dimensionsById.get(n.id)!.height,
    })),
    ...panels,
  ];
  if (chart.sourceLayout && presentationMode === "individual")
    rectangles.push({
      x: 0,
      y: 0,
      width: chart.sourceLayout.width,
      height: chart.sourceLayout.height,
    });
  const minX = Math.min(...rectangles.map((r) => r.x)),
    minY = Math.min(...rectangles.map((r) => r.y)),
    maxX = Math.max(...rectangles.map((r) => r.x + r.width)),
    maxY = Math.max(...rectangles.map((r) => r.y + r.height));
  const offsetX = PADDING - minX;
  const offsetY = (official ? 0 : HEADER_HEIGHT) + PADDING - minY;
  const includedEdges = sourceEdges.map((edge) => {
    const manualRoute =
      presentationMode === "compact" ? undefined : manualEdgeRouteForEdge(edge);
    const sourceRoute =
      presentationMode === "compact"
        ? undefined
        : (edge.data?.sourceRoute as
            | {
                points: { x: number; y: number }[];
                sourceBounds: {
                  x: number;
                  y: number;
                  width: number;
                  height: number;
                };
                targetBounds: {
                  x: number;
                  y: number;
                  width: number;
                  height: number;
                };
              }
            | undefined);
    const shift = (p: { x: number; y: number }) => ({
      ...p,
      x: p.x + offsetX,
      y: p.y + offsetY,
    });
    return {
      ...edge,
      data: {
        ...edge.data,
        manualRoute: manualRoute
          ? { ...manualRoute, points: manualRoute.points.map(shift) }
          : undefined,
        sourceRoute: sourceRoute
          ? {
              ...sourceRoute,
              points: sourceRoute.points.map(shift),
              sourceBounds: shift(sourceRoute.sourceBounds),
              targetBounds: shift(sourceRoute.targetBounds),
            }
          : undefined,
      },
    };
  });

  const baseNodes = includedNodes.map((node) => {
    const unit = node.data.unit;
    const hierarchyLevel = compactPresentation.levels.get(node.id) ?? 1;
    const dimensions = dimensionsById.get(node.id) ?? {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
    const compactEntries =
      presentationMode === "compact"
        ? (compactPresentation.entriesByParent.get(node.id) ?? []).map(
            (entry) => ({
              id: entry.id,
              name: cleanOrgChartDisplayText(
                entry.unit.shortName || entry.unit.name,
              ),
              positionTitle: cleanOrgChartDisplayText(entry.unit.positionTitle),
              status: entry.unit.positionStatus,
              statusText: cleanOrgChartDisplayText(
                audience === "public"
                  ? STATUS_LABELS[entry.unit.positionStatus]
                  : entry.unit.positionStatus === "filled"
                    ? entry.unit.assignmentLabel
                    : STATUS_LABELS[entry.unit.positionStatus],
              ),
            }),
          )
        : [];
    const rawStatusText =
      audience === "public"
        ? STATUS_LABELS[unit.positionStatus]
        : unit.positionStatus === "filled"
          ? unit.assignmentLabel
          : STATUS_LABELS[unit.positionStatus];
    const compact = presentationMode === "compact";
    const nameFontSize = compact && hierarchyLevel === 1 ? 22 : 17;
    const horizontalTextInset = compact ? 32 : 40;
    const nameLayout = layoutExportName(
      unit.shortName || unit.name,
      dimensions.width - horizontalTextInset,
      nameFontSize,
    );
    const compactListStartY = compactEntries.length
      ? dimensions.height - (34 + compactEntries.length * 54)
      : null;
    const statusLayout = layoutExportStatus(
      rawStatusText,
      dimensions.width - (compact ? 56 : 48),
      Math.max(18, (compactListStartY ?? dimensions.height) - 110),
    );
    return {
      ...(official?{official:officialCard(unit,dimensions.width,dimensions.height,hierarchyLevel,officialScale(presentationMode === "compact"?undefined:chart.sourceLayout?.width,dimensions.width),audience === "public",compactEntries.map(e=>({id:e.id,title:e.name,assignment:e.statusText})))}:{}),
      id: node.id,
      x: node.position.x + offsetX,
      y: node.position.y + offsetY,
      width: dimensions.width,
      height: dimensions.height,
      unitType: unit.type.toUpperCase(),
      name: nameLayout.text,
      nameLines: nameLayout.lines,
      nameFontSize: nameLayout.fontSize,
      nameLineHeight: nameLayout.lineHeight,
      positionTitle: cleanOrgChartDisplayText(unit.positionTitle),
      status: unit.positionStatus,
      statusText: statusLayout.text,
      statusLines: statusLayout.lines,
      statusFontSize: statusLayout.fontSize,
      statusLineHeight: statusLayout.lineHeight,
      hierarchyLevel,
      targetSide:
        presentationMode === "compact" &&
        (compactPresentation.sidecarNodeIds.has(node.id) ||
          (compactLayoutOrientation === "vertical" && hierarchyLevel >= 3))
          ? ("left" as const)
          : ("top" as const),
      compactEntries,
      compactListStartY,
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
    if (!route || !nodeById.has(edge.source) || !nodeById.has(edge.target))
      return [];
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
    appearance,
    connectorWidth: official ? 1.5*(presentationMode === "compact"?1:(chart.sourceLayout?.width??960)/960) : 2,
    chartId: chart.id,
    chartName: chart.name,
    chartStatus: chart.status,
    chartVersion: chart.version,
    lastCurrentAt: chart.lifecycle.lastCurrentAt,
    lastCurrentVersion: chart.lifecycle.lastCurrentVersion,
    lastCurrentBy: chart.lifecycle.lastCurrentBy,
    generatedAt,
    audience,
    presentationMode,
    compactLayoutOrientation,
    width: Math.max(760, maxX - minX + PADDING * 2),
    height: maxY - minY + (official ? 0 : HEADER_HEIGHT) + FOOTER_HEIGHT + PADDING * 2,
    nodes,
    edges,
    supportPanels: panels.map((p) => ({
      ...p,
      x: p.x + offsetX,
      y: p.y + offsetY,
      connector: p.connector
        ? {
            ...p.connector,
            points: p.connector.points.map((point) => ({
              x: point.x + offsetX,
              y: point.y + offsetY,
            })),
          }
        : undefined,
    })),
    excludedNodeCount: chart.nodes.length - audienceNodes.length,
    groupedNodeCount:
      presentationMode === "compact"
        ? compactPresentation.listedNodeIds.size
        : 0,
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

function fitExportFontSize(
  value: string,
  maximumWidth: number,
  preferredFontSize: number,
  bold = false,
): number {
  const estimatedWidth = estimateExportTextWidth(
    value,
    preferredFontSize,
    bold,
  );
  if (estimatedWidth <= maximumWidth) return preferredFontSize;
  return Math.max(3, preferredFontSize * (maximumWidth / estimatedWidth) * 0.9);
}

function statusColor(status: PositionStatus): string {
  if (status === "not_specified") return EXPORT_COLORS.ink;
  if (status === "vacant") return EXPORT_COLORS.orange;
  if (status === "acting") return EXPORT_COLORS.blue;
  return EXPORT_COLORS.green;
}

export function exportLifecycleLabel(scene: ChartExportScene): string {
  const status =
    scene.chartStatus === "in_review"
      ? "IN REVIEW"
      : scene.chartStatus.toUpperCase();
  const audience =
    scene.audience === "public" ? "PUBLIC-SAFE DRAFT" : "INTERNAL";
  return `${audience} • ${status} • VERSION ${scene.chartVersion}`;
}

export function buildChartSvg(
  scene: ChartExportScene,
  presetId: ExportPresetId = "natural",
  fonts?: ChartFonts | null,
): string {
  const viewport = resolveExportViewport(scene, presetId);
  const audienceLabel = exportLifecycleLabel(scene);
  if(scene.appearance === "official") {
    const connectors=scene.edges.map(e=>`<polyline points="${e.points.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="#595959" stroke-width="${scene.connectorWidth??1.5}"/>`).join('');
    const cards=scene.nodes.map(n=>officialCardSvg(n.official!,n.x,n.y,n.width,n.height,n.id)).join('');
    const panels=(scene.supportPanels??[]).map(p=>`${p.connector?`<polyline points="${p.connector.points.map(v=>`${v.x},${v.y}`).join(' ')}" fill="none" stroke="#595959" stroke-width="${scene.connectorWidth??1.5}"${p.connector.style==='dashed'?` stroke-dasharray="${(scene.connectorWidth??1.5)*3} ${(scene.connectorWidth??1.5)*2}"`:''}/>`:''}${officialCardSvg(p.official!,p.x,p.y,p.width,p.height,p.id).replace('data-unit-id=','data-support-panel-id=')}`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${viewport.width}" height="${viewport.height}" viewBox="0 0 ${viewport.width} ${viewport.height}" role="img" aria-labelledby="title description"><title id="title">${escapeXml(scene.chartName)} organizational chart</title><desc id="description">${escapeXml(audienceLabel)}; official slide appearance; saved arrangement.</desc><defs>${officialFontStyle(fonts)}</defs><rect width="100%" height="100%" fill="#FFFFFF"/><g transform="translate(${viewport.offsetX} ${viewport.offsetY}) scale(${viewport.scale})">${connectors}${cards}${panels}<text x="${PADDING}" y="${scene.height-12}" font-family="Arial,sans-serif" font-size="10" fill="#595959">${escapeXml(audienceLabel)} · Generated ${escapeXml(scene.generatedAt)}</text></g></svg>`;
  }

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
      const horizontalTextInset = compact ? 32 : 40;
      const nameMaximumWidth = node.width - horizontalTextInset;
      const nameMarkup = node.nameLines
        .map((line, index) => {
          const lineFontSize = fitExportFontSize(
            line,
            nameMaximumWidth,
            node.nameFontSize,
            true,
          );
          return `<tspan x="${textX}" dy="${index ? node.nameLineHeight : 0}" font-size="${lineFontSize}">${escapeXml(line)}</tspan>`;
        })
        .join("");
      const titleY =
        node.y +
        Math.min(
          98,
          Math.max(
            78,
            51 + (node.nameLines.length - 1) * node.nameLineHeight + 18,
          ),
        );
      const statusMaximumWidth = Math.max(56, node.width - (compact ? 56 : 48));
      const positionTitleFontSize = fitExportFontSize(
        node.positionTitle,
        nameMaximumWidth,
        12,
      );
      const statusFontSize = Math.min(
        node.statusFontSize,
        ...node.statusLines.map((line) =>
          fitExportFontSize(
            line,
            statusMaximumWidth,
            node.statusFontSize,
            true,
          ),
        ),
      );
      const statusTextWidth = Math.max(
        ...node.statusLines.map((line) =>
          estimateExportTextWidth(line, statusFontSize, true),
        ),
      );
      const statusRowStartX = compact
        ? textX - (8 + 7 + statusTextWidth) / 2
        : node.x + 20;
      const statusMarkerX = compact ? statusRowStartX + 4 : node.x + 24;
      const statusTextX = compact ? statusRowStartX + 15 : node.x + 36;
      const statusMarkup = node.statusLines
        .map(
          (line, index) =>
            `<tspan x="${statusTextX}" dy="${index ? node.statusLineHeight : 0}">${escapeXml(line)}</tspan>`,
        )
        .join("");
      const compactEntryMarkup =
        node.compactListStartY === null
          ? ""
          : `<g class="compact-roster">
            <rect x="${node.x}" y="${node.y + node.compactListStartY}" width="${node.width}" height="34" fill="#${EXPORT_COLORS.green}" fill-opacity="0.08"/>
            <text x="${node.x + 12}" y="${node.y + node.compactListStartY + 21}" font-family="Mulish, Aptos, Arial, sans-serif" font-size="8" font-weight="700" letter-spacing="0.8" fill="#${EXPORT_COLORS.darkTeal}">${node.compactEntries.length} LISTED ASSIGNMENT${node.compactEntries.length === 1 ? "" : "S"}</text>
            ${node.compactEntries
              .map((entry, index) => {
                const rowY = node.y + node.compactListStartY! + 34 + index * 54;
                const entryStatusRight = node.x + node.width - 12;
                const entryNameMaximumWidth = Math.max(48, node.width - 138);
                const entryStatusMaximumWidth = Math.min(
                  96,
                  Math.max(56, node.width * 0.36),
                );
                const entryNameFontSize = fitExportFontSize(
                  entry.name,
                  entryNameMaximumWidth,
                  10,
                  true,
                );
                const entryRoleFontSize = fitExportFontSize(
                  entry.positionTitle,
                  entryNameMaximumWidth,
                  8,
                );
                const entryStatusFontSize = fitExportFontSize(
                  entry.statusText,
                  entryStatusMaximumWidth,
                  8,
                  true,
                );
                const entryStatusTextWidth = estimateExportTextWidth(
                  entry.statusText,
                  entryStatusFontSize,
                  true,
                );
                const entryStatusMarkerX =
                  entryStatusRight - entryStatusTextWidth - 5 - 4;
                return `<g data-compact-entry-id="${escapeXml(entry.id)}">
                <line x1="${node.x}" y1="${rowY}" x2="${node.x + node.width}" y2="${rowY}" stroke="#${EXPORT_COLORS.graphite}" stroke-width="1"/>
                <text x="${node.x + 12}" y="${rowY + 19}" data-full-text="${escapeXml(entry.name)}" font-family="Mulish, Aptos, Arial, sans-serif" font-size="${entryNameFontSize}" font-weight="700" fill="#${EXPORT_COLORS.darkTeal}">${escapeXml(entry.name)}</text>
                <text x="${node.x + 12}" y="${rowY + 35}" data-full-text="${escapeXml(entry.positionTitle)}" font-family="Mulish, Aptos, Arial, sans-serif" font-size="${entryRoleFontSize}" fill="#${EXPORT_COLORS.ink}">${escapeXml(entry.positionTitle)}</text>
                <circle cx="${entryStatusMarkerX}" cy="${rowY + 27}" r="4" fill="#${statusColor(entry.status)}"/>
                <text x="${entryStatusRight}" y="${rowY + 31}" data-full-text="${escapeXml(entry.statusText)}" text-anchor="end" font-family="Mulish, Aptos, Arial, sans-serif" font-size="${entryStatusFontSize}" font-weight="700" fill="#${EXPORT_COLORS.ink}">${escapeXml(entry.statusText)}</text>
              </g>`;
              })
              .join("")}
          </g>`;
      const connectionPointMarkup = connectionPointsForNode(node)
        .map(
          (point) =>
            `<circle class="org-connection-point org-connection-point--${point.kind}" data-port-kind="${point.kind}" cx="${point.x}" cy="${point.y}" r="${EXPORT_CONNECTION_POINT_RADIUS}" fill="#${EXPORT_COLORS.darkTeal}" stroke="#${EXPORT_COLORS.white}" stroke-width="${EXPORT_CONNECTION_POINT_STROKE_WIDTH}"/>`,
        )
        .join("");
      const cardFill =
        compact && node.hierarchyLevel === 2
          ? node.unitType === "DIVISION" || node.unitType === "DIRECTORATE"
            ? EXPORT_COLORS.energy
            : EXPORT_COLORS.graphite
          : EXPORT_COLORS.white;
      const cardFillOpacity =
        compact && node.hierarchyLevel === 2 ? "0.18" : "1";
      return `<g data-unit-id="${escapeXml(node.id)}">
        <title>${escapeXml(`${node.name} — ${node.positionTitle} — ${node.statusText}`)}</title>
        <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" fill="#${cardFill}" fill-opacity="${cardFillOpacity}" stroke="#${EXPORT_COLORS.darkTeal}" stroke-width="1.5"/>
        <g clip-path="url(#export-card-content-${nodeIndex})">
        ${
          compact
            ? `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.hierarchyLevel === 1 ? 8 : 5}" fill="#${node.hierarchyLevel === 2 ? EXPORT_COLORS.darkTeal : EXPORT_COLORS.green}"/>`
            : `<rect x="${node.x}" y="${node.y}" width="6" height="${node.height}" fill="#${EXPORT_COLORS.green}"/>`
        }
        <text x="${textX}" y="${node.y + 24}"${textAnchor} font-family="Mulish, Aptos, Arial, sans-serif" font-size="10" font-weight="700" letter-spacing="1.2" fill="#${EXPORT_COLORS.green}">${escapeXml(node.unitType)}</text>
        <text x="${textX}" y="${node.y + 51}" data-full-text="${escapeXml(node.name)}"${textAnchor} font-family="Mulish, Aptos, Arial, sans-serif" font-size="${node.nameFontSize}" font-weight="700" fill="#${EXPORT_COLORS.ink}">${nameMarkup}</text>
        <text x="${textX}" y="${titleY}" data-full-text="${escapeXml(node.positionTitle)}"${textAnchor} font-family="Mulish, Aptos, Arial, sans-serif" font-size="${positionTitleFontSize}" fill="#${EXPORT_COLORS.ink}">${escapeXml(node.positionTitle)}</text>
        <circle cx="${statusMarkerX}" cy="${node.y + 114}" r="4" fill="#${statusColor(node.status)}"/>
        <text x="${statusTextX}" y="${node.y + 118}" data-full-text="${escapeXml(node.statusText)}" font-family="Mulish, Aptos, Arial, sans-serif" font-size="${statusFontSize}" font-weight="700" fill="#${EXPORT_COLORS.ink}">${statusMarkup}</text>
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
    <desc id="description">${escapeXml(audienceLabel)}, ${scene.presentationMode === "compact" ? `${scene.compactLayoutOrientation} compact grouped presentation` : "individual card presentation"}, ${escapeXml(viewport.preset.label)}, generated ${escapeXml(generatedLabel)}.</desc>
    <defs>
      ${scene.nodes.map((node, index) => `<clipPath id="export-card-content-${index}" clipPathUnits="userSpaceOnUse"><rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"/></clipPath>`).join("")}
    </defs>
    <rect width="${viewport.width}" height="${viewport.height}" fill="#${EXPORT_COLORS.softGray}"/>
    <g transform="translate(${viewport.offsetX} ${viewport.offsetY}) scale(${viewport.scale})">
    <rect width="${scene.width}" height="${scene.height}" fill="#${EXPORT_COLORS.softGray}"/>
    <rect x="0" y="0" width="${scene.width}" height="${HEADER_HEIGHT}" fill="#${EXPORT_COLORS.white}"/>
    <rect x="0" y="0" width="8" height="${HEADER_HEIGHT}" fill="#${EXPORT_COLORS.green}"/>
    <text x="30" y="31" font-family="Mulish, Aptos, Arial, sans-serif" font-size="20" font-weight="700" fill="#${EXPORT_COLORS.ink}">${escapeXml(scene.chartName)}</text>
    <text x="30" y="53" font-family="Mulish, Aptos, Arial, sans-serif" font-size="10" font-weight="700" letter-spacing="1.1" fill="#${EXPORT_COLORS.darkTeal}">${audienceLabel}</text>
    ${edgeMarkup}${nodeMarkup}
    ${(scene.supportPanels ?? []).map((p) => `<g data-support-panel-id="${escapeXml(p.id)}">${p.connector ? `<polyline points="${p.connector.points.map((point) => `${point.x},${point.y}`).join(" ")}" fill="none" stroke="#65756B" stroke-width="1.5"${p.connector.style === "dashed" ? ` stroke-dasharray="6 4"` : ""}/>` : ""}<title>${escapeXml(p.title)} — support assignments</title><rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" fill="#E7E9E7" stroke="#6C7571" stroke-width="1.5"/><text x="${p.x + p.width / 2}" y="${p.y + 32}" text-anchor="middle" font-family="Mulish,Aptos,Arial,sans-serif" font-weight="700" font-size="20" fill="#273C36">${escapeXml(p.title)}</text>${p.lines.map((line, i) => `<text x="${p.x + 20}" y="${p.y + 62 + i * p.lineHeight}" font-family="Mulish,Aptos,Arial,sans-serif" font-size="${p.fontSize}" fill="#273C36">${escapeXml(line)}</text>`).join("")}</g>`).join("")}

    <text x="${PADDING}" y="${scene.height - 15}" font-family="Mulish, Aptos, Arial, sans-serif" font-size="10" fill="#${EXPORT_COLORS.ink}">Generated ${escapeXml(generatedLabel)} • ${scene.nodes.length} cards${scene.groupedNodeCount ? ` • ${scene.groupedNodeCount} grouped entries` : ""}${scene.excludedNodeCount ? ` • ${scene.excludedNodeCount} excluded by audience profile` : ""}${scene.lastCurrentAt ? ` • Last Current v${scene.lastCurrentVersion ?? scene.chartVersion} ${escapeXml(new Date(scene.lastCurrentAt).toLocaleDateString("en-US"))}${scene.lastCurrentBy ? ` by ${escapeXml(scene.lastCurrentBy)}` : ""}` : ""}</text>
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
  const includedNodes = chart.nodes.filter((node) =>
    visibleForAudience(node, audience),
  );
  const includedIds = new Set(includedNodes.map((node) => node.id));
  assertAudienceHierarchyClosed(chart, audience, includedIds);
  const parentById = new Map(
    chart.edges
      .filter(
        (edge) => includedIds.has(edge.source) && includedIds.has(edge.target),
      )
      .map((edge) => [edge.target, edge.source]),
  );
  const nameById = new Map(
    includedNodes.map((node) => [node.id, node.data.unit.name]),
  );
  const lifecycleHeaders = [
    "chartLifecycle",
    "chartVersion",
    "lastCurrentAt",
    "lastCurrentBy",
  ];
  const publicHeaders = [
    ...lifecycleHeaders,
    "unit",
    "parent",
    "unitType",
    "positionTitle",
    "positionStatus",
    "effectiveDate",
  ];
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
      chart.status,
      chart.version,
      chart.lifecycle.lastCurrentAt ?? "",
      chart.lifecycle.lastCurrentBy,
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
  const panels = audienceSupportPanels(chart, audience);
  if (panels.length) {
    headers.push("recordType", "supportPanelId");
    if (audience === "internal")
      headers.push("sourceLocator", "sourceCertainty", "reviewNote");
    for (const row of rows)
      row.push(
        "organization",
        "",
        ...(audience === "internal" ? ["", "", ""] : []),
      );
    for (const p of panels)
      for (const e of p.entries) {
        const anchor =
          chart.nodes.find((n) => n.id === p.anchorUnitId)?.data.unit.name ??
          chart.name;
        const publicValues = [
          chart.status,
          chart.version,
          chart.lifecycle.lastCurrentAt ?? "",
          chart.lifecycle.lastCurrentBy,
          p.title,
          anchor,
          "support_assignment",
          e.role,
          e.positionStatus,
          e.effectiveDate,
        ];
        rows.push(
          audience === "public"
            ? [...publicValues, "support_assignment", p.id]
            : [
                e.id,
                ...publicValues,
                e.person,
                e.publicationVisibility,
                e.source || p.source,
                "support_assignment",
                p.id,
                e.sourceLocator || p.sourceLocator,
                e.sourceCertainty,
                e.reviewNote,
              ],
        );
      }
  }
  return [headers, ...rows]
    .map((row) => row.map((value) => csvCell(String(value))).join(","))
    .join("\r\n");
}
