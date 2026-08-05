import PptxGenJS from "pptxgenjs";
import {
  connectionPointsForNode,
  estimateExportTextWidth,
  EXPORT_CONNECTION_POINT_RADIUS,
  EXPORT_CONNECTION_POINT_STROKE_WIDTH,
  EXPORT_COLORS,
  EXPORT_PRESETS,
  exportLifecycleLabel,
  type ChartExportScene,
  type ExportPresetId,
  type ExportSceneNode,
} from "./chart-export";

const SLIDE_MARGIN = 0.18;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function fitTextPixels(
  value: string,
  preferredSize: number,
  maximumWidth: number,
  bold = false,
): number {
  const estimatedWidth = estimateExportTextWidth(value, preferredSize, bold);
  if (estimatedWidth <= maximumWidth) return preferredSize;
  return Math.max(2, preferredSize * (maximumWidth / estimatedWidth) * 0.9);
}

function drawNode(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  node: ExportSceneNode,
  scale: number,
  offsetX: number,
  offsetY: number,
) {
  const x = offsetX + node.x * scale;
  const y = offsetY + node.y * scale;
  const width = node.width * scale;
  const height = node.height * scale;
  const font = (pixels: number) => clamp(pixels * scale * 72, 1, 400);
  const compact = !node.showConnectionPoints;
  const divisionLike = /division|directorate/i.test(node.unitType);
  const cardFill = compact && node.hierarchyLevel === 2
    ? divisionLike
      ? EXPORT_COLORS.energy
      : EXPORT_COLORS.graphite
    : EXPORT_COLORS.white;
  const cardTransparency = compact && node.hierarchyLevel === 2
    ? divisionLike
      ? 82
      : 42
    : 0;
  const statusColor =
    node.status === "vacant"
      ? EXPORT_COLORS.orange
      : node.status === "acting"
        ? EXPORT_COLORS.blue
        : EXPORT_COLORS.green;
  const statusMaximumWidth = Math.max(56, node.width - (compact ? 56 : 48));
  const statusTextWidth = Math.min(
    statusMaximumWidth,
    Math.max(
      ...node.statusLines.map((line) =>
        estimateExportTextWidth(line, node.statusFontSize, true),
      ),
    ),
  );
  const statusRowStart = compact
    ? node.width / 2 - (8 + 7 + statusTextWidth) / 2
    : 20;
  const titleTop = Math.min(
    86,
    Math.max(66, 39 + (node.nameLines.length - 1) * node.nameLineHeight + 18),
  );
  const positionTitleFontSize = fitTextPixels(
    node.positionTitle,
    12,
    node.width - (compact ? 32 : 40),
  );
  const statusFontSize = Math.min(
    node.statusFontSize,
    ...node.statusLines.map((line) =>
      fitTextPixels(line, node.statusFontSize, statusMaximumWidth, true),
    ),
  );

  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w: width,
    h: height,
    fill: { color: cardFill, transparency: cardTransparency },
    line: { color: EXPORT_COLORS.darkTeal, width: clamp(1.5 * scale * 72, 0.2, 4) },
    objectName: `Unit card ${node.id}`,
  });
  slide.addShape(pptx.ShapeType.rect, compact
    ? {
        x,
        y,
        w: width,
        h: Math.max(0.01, (node.hierarchyLevel === 1 ? 8 : 5) * scale),
        fill: { color: node.hierarchyLevel === 2 ? EXPORT_COLORS.darkTeal : EXPORT_COLORS.green },
        line: { color: EXPORT_COLORS.green, transparency: 100 },
        objectName: `Unit accent ${node.id}`,
      }
    : {
        x,
        y,
        w: Math.max(0.01, 6 * scale),
        h: height,
        fill: { color: EXPORT_COLORS.green },
        line: { color: EXPORT_COLORS.green, transparency: 100 },
        objectName: `Unit accent ${node.id}`,
      });
  slide.addText(node.unitType, {
    x: x + (compact ? 12 : 20) * scale,
    y: y + 11 * scale,
    w: Math.max(0.3, width - 32 * scale),
    h: 18 * scale,
    margin: 0,
    fontFace: "Aptos",
    fontSize: font(10),
    bold: true,
    color: EXPORT_COLORS.green,
    charSpacing: font(1.2),
    fit: "shrink",
    align: compact ? "center" : "left",
    objectName: `Unit type ${node.id}`,
  });
  slide.addText(node.name, {
    x: x + (compact ? 12 : 20) * scale,
    y: y + 34 * scale,
    w: Math.max(0.3, width - 32 * scale),
    h: Math.max(20 * scale, (titleTop - 38) * scale),
    margin: 0,
    fontFace: "Aptos Display",
    fontSize: font(node.nameFontSize),
    bold: true,
    color: EXPORT_COLORS.ink,
    fit: "shrink",
    valign: "middle",
    align: compact ? "center" : "left",
    objectName: `Unit name ${node.id}`,
  });
  slide.addText(node.positionTitle, {
    x: x + (compact ? 12 : 20) * scale,
    y: y + titleTop * scale,
    w: Math.max(0.3, width - 32 * scale),
    h: 18 * scale,
    margin: 0,
    fontFace: "Aptos",
    fontSize: font(positionTitleFontSize),
    color: EXPORT_COLORS.ink,
    fit: "shrink",
    align: compact ? "center" : "left",
    objectName: `Position title ${node.id}`,
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: x + statusRowStart * scale,
    y: y + 106 * scale,
    w: Math.max(0.01, 8 * scale),
    h: Math.max(0.01, 8 * scale),
    fill: { color: statusColor },
    line: { color: statusColor, transparency: 100 },
    objectName: `Position status marker ${node.id}`,
  });
  slide.addText(node.statusLines.join("\n"), {
    x: x + (compact ? statusRowStart + 15 : 36) * scale,
    y: y + 101 * scale,
    w: compact
      ? Math.max(0.3, (statusTextWidth + 4) * scale)
      : Math.max(0.3, width - 48 * scale),
    h: Math.max(18, node.statusLines.length * node.statusLineHeight + 4) * scale,
    margin: 0,
    fontFace: "Aptos",
    fontSize: font(statusFontSize),
    bold: true,
    color: EXPORT_COLORS.ink,
    fit: "shrink",
    objectName: `Position status ${node.id}`,
  });
  if (node.compactListStartY !== null) {
    const headerY = y + node.compactListStartY * scale;
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y: headerY,
      w: width,
      h: 34 * scale,
      fill: { color: EXPORT_COLORS.graphite },
      line: { color: EXPORT_COLORS.graphite, transparency: 100 },
      objectName: `Compact roster heading ${node.id}`,
    });
    slide.addText(
      `${node.compactEntries.length} LISTED ASSIGNMENT${node.compactEntries.length === 1 ? "" : "S"}`,
      {
        x: x + 12 * scale,
        y: headerY + 8 * scale,
        w: Math.max(0.3, width - 24 * scale),
        h: 18 * scale,
        margin: 0,
        fontFace: "Aptos",
        fontSize: font(8),
        bold: true,
        color: EXPORT_COLORS.darkTeal,
        charSpacing: font(0.8),
        objectName: `Compact roster count ${node.id}`,
      },
    );
    node.compactEntries.forEach((entry, index) => {
      const rowY = headerY + (34 + index * 54) * scale;
      const entryTextWidth = Math.max(48, node.width - 126);
      const entryNameFontSize = fitTextPixels(entry.name, 10, entryTextWidth, true);
      const entryRoleFontSize = fitTextPixels(entry.positionTitle, 8, entryTextWidth);
      const entryStatusFontSize = fitTextPixels(entry.statusText, 8, 80, true);
      slide.addShape(pptx.ShapeType.line, {
        x,
        y: rowY,
        w: width,
        h: 0,
        line: { color: EXPORT_COLORS.graphite, width: clamp(scale * 72, 0.2, 2) },
        objectName: `Compact roster divider ${entry.id}`,
      });
      slide.addText(entry.name, {
        x: x + 12 * scale,
        y: rowY + 7 * scale,
        w: Math.max(0.3, width - 126 * scale),
        h: 15 * scale,
        margin: 0,
        fontFace: "Aptos Display",
        fontSize: font(entryNameFontSize),
        bold: true,
        color: EXPORT_COLORS.darkTeal,
        fit: "shrink",
        objectName: `Compact entry name ${entry.id}`,
      });
      slide.addText(entry.positionTitle, {
        x: x + 12 * scale,
        y: rowY + 25 * scale,
        w: Math.max(0.3, width - 126 * scale),
        h: 14 * scale,
        margin: 0,
        fontFace: "Aptos",
        fontSize: font(entryRoleFontSize),
        color: EXPORT_COLORS.ink,
        fit: "shrink",
        objectName: `Compact entry role ${entry.id}`,
      });
      const entryStatusColor =
        entry.status === "vacant"
          ? EXPORT_COLORS.orange
          : entry.status === "acting"
            ? EXPORT_COLORS.blue
            : EXPORT_COLORS.green;
      slide.addShape(pptx.ShapeType.ellipse, {
        x: x + (node.width - 104) * scale,
        y: rowY + 23 * scale,
        w: Math.max(0.01, 7 * scale),
        h: Math.max(0.01, 7 * scale),
        fill: { color: entryStatusColor },
        line: { color: entryStatusColor, transparency: 100 },
        objectName: `Compact entry status marker ${entry.id}`,
      });
      slide.addText(entry.statusText, {
        x: x + (node.width - 92) * scale,
        y: rowY + 19 * scale,
        w: Math.max(0.01, 80 * scale),
        h: 16 * scale,
        margin: 0,
        fontFace: "Aptos",
        fontSize: font(entryStatusFontSize),
        bold: true,
        color: EXPORT_COLORS.ink,
        align: "right",
        fit: "shrink",
        objectName: `Compact entry status ${entry.id}`,
      });
    });
  }
  connectionPointsForNode(node).forEach((point) => {
    const diameter = EXPORT_CONNECTION_POINT_RADIUS * 2 * scale;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: offsetX + point.x * scale - diameter / 2,
      y: offsetY + point.y * scale - diameter / 2,
      w: Math.max(0.01, diameter),
      h: Math.max(0.01, diameter),
      fill: { color: EXPORT_COLORS.darkTeal },
      line: {
        color: EXPORT_COLORS.white,
        width: clamp(
          EXPORT_CONNECTION_POINT_STROKE_WIDTH * scale * 72,
          0.2,
          4,
        ),
      },
      objectName: `Connection point ${point.kind} ${node.id}`,
    });
  });
}

export async function buildChartPptx(
  scene: ChartExportScene,
  presetId: ExportPresetId = "presentation-wide",
): Promise<Uint8Array> {
  const PptxConstructor =
    (PptxGenJS as unknown as { default?: typeof PptxGenJS }).default ?? PptxGenJS;
  const pptx = new PptxConstructor();
  const preset = EXPORT_PRESETS.find((candidate) => candidate.id === presetId) ?? EXPORT_PRESETS[1];
  const slideWidth = preset.pageWidthInches ?? 13.333;
  const slideHeight = preset.pageHeightInches ?? 7.5;
  pptx.defineLayout({ name: "ORGCHART_EXPORT", width: slideWidth, height: slideHeight });
  pptx.layout = "ORGCHART_EXPORT";
  pptx.author = "UT-Battelle LLC";
  pptx.company = "UT-Battelle LLC";
  pptx.subject = `${scene.audience === "public" ? "Public-safe" : "Internal"} organizational chart working draft`;
  pptx.title = `${scene.chartName} - organizational chart`;
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
  };

  const availableWidth = slideWidth - SLIDE_MARGIN * 2;
  const availableHeight = slideHeight - SLIDE_MARGIN * 2;
  const scale = Math.min(availableWidth / scene.width, availableHeight / scene.height);
  const offsetX = (slideWidth - scene.width * scale) / 2;
  const offsetY = (slideHeight - scene.height * scale) / 2;
  const slide = pptx.addSlide();
  slide.background = { color: EXPORT_COLORS.softGray };
  slide.addShape(pptx.ShapeType.rect, {
    x: offsetX,
    y: offsetY,
    w: scene.width * scale,
    h: 74 * scale,
    fill: { color: EXPORT_COLORS.white },
    line: { color: EXPORT_COLORS.white, transparency: 100 },
    objectName: "Chart header",
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: offsetX,
    y: offsetY,
    w: Math.max(0.03, 8 * scale),
    h: 74 * scale,
    fill: { color: EXPORT_COLORS.green },
    line: { color: EXPORT_COLORS.green, transparency: 100 },
    objectName: "Chart header accent",
  });
  slide.addText(scene.chartName, {
    x: offsetX + 30 * scale,
    y: offsetY + 13 * scale,
    w: Math.max(1, scene.width * scale - 60 * scale),
    h: 28 * scale,
    margin: 0,
    fontFace: "Aptos Display",
    fontSize: clamp(20 * scale * 72, 1, 400),
    bold: true,
    color: EXPORT_COLORS.ink,
    fit: "shrink",
    objectName: "Chart title",
  });
  slide.addText(
    exportLifecycleLabel(scene).replaceAll("•", " | "),
    {
      x: offsetX + 30 * scale,
      y: offsetY + 43 * scale,
      w: Math.max(1, scene.width * scale - 60 * scale),
      h: 16 * scale,
      margin: 0,
      fontFace: "Aptos",
      fontSize: clamp(10 * scale * 72, 1, 400),
      bold: true,
      color: EXPORT_COLORS.darkTeal,
      charSpacing: clamp(1.1 * scale * 72, 0.1, 400),
      fit: "shrink",
      objectName: "Chart version label",
    },
  );

  scene.edges.forEach((edge) => {
    for (let index = 1; index < edge.points.length; index += 1) {
      const start = edge.points[index - 1];
      const end = edge.points[index];
      const startX = offsetX + start.x * scale;
      const startY = offsetY + start.y * scale;
      const endX = offsetX + end.x * scale;
      const endY = offsetY + end.y * scale;
      slide.addShape(pptx.ShapeType.line, {
        x: Math.min(startX, endX),
        y: Math.min(startY, endY),
        w: Math.max(0.001, Math.abs(endX - startX)),
        h: Math.max(0.001, Math.abs(endY - startY)),
        line: {
          color: EXPORT_COLORS.darkTeal,
          width: clamp(2 * scale * 72, 0.2, 4),
          beginArrowType: "none",
          endArrowType: "none",
        },
        objectName: `Reporting connector ${edge.sourceId} to ${edge.targetId}`,
      });
    }
  });
  scene.nodes.forEach((node) => drawNode(pptx, slide, node, scale, offsetX, offsetY));

  const footer = `Generated ${new Date(scene.generatedAt).toISOString()}  |  ${scene.nodes.length} cards${scene.groupedNodeCount ? `  |  ${scene.groupedNodeCount} grouped entries` : ""}${scene.excludedNodeCount ? `  |  ${scene.excludedNodeCount} excluded by audience profile` : ""}`;
  slide.addText(footer, {
    x: offsetX + 52 * scale,
    y: offsetY + (scene.height - 26) * scale,
    w: Math.max(1, scene.width * scale - 104 * scale),
    h: 14 * scale,
    margin: 0,
    fontFace: "Aptos",
    fontSize: clamp(10 * scale * 72, 1, 400),
    color: EXPORT_COLORS.ink,
    fit: "shrink",
    objectName: "Chart export metadata",
  });
  slide.addNotes(
    `Generated by ORNL OrgChart Studio from chart ${scene.chartId}, version ${scene.chartVersion}. This presentation is an editable working draft; verify audience approval before distribution.`,
  );

  const output = await pptx.write({ outputType: "uint8array", compression: true });
  if (!(output instanceof Uint8Array)) {
    throw new Error("PowerPoint generation returned an unexpected output type.");
  }
  return output;
}
