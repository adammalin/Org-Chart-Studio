import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  connectionPointsForNode,
  EXPORT_CONNECTION_POINT_RADIUS,
  EXPORT_CONNECTION_POINT_STROKE_WIDTH,
  EXPORT_COLORS,
  EXPORT_PRESETS,
  type ChartExportScene,
  type ExportPresetId,
  type ExportSceneNode,
} from "./chart-export";

function color(hex: string) {
  return rgb(
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  );
}

function pdfText(value: string, font: PDFFont): string {
  for (const character of value) {
    try {
      font.encodeText(character);
    } catch {
      throw new Error(
        `PDF export cannot represent the character ${JSON.stringify(character)} with the approved fallback font. Use SVG or PowerPoint for this chart, or replace that character before PDF export.`,
      );
    }
  }
  return value;
}

function drawNode(
  page: PDFPage,
  node: ExportSceneNode,
  pageHeight: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  regular: PDFFont,
  bold: PDFFont,
) {
  const x = offsetX + node.x * scale;
  const y = pageHeight - offsetY - (node.y + node.height) * scale;
  const width = node.width * scale;
  const height = node.height * scale;
  const mapY = (top: number) => pageHeight - offsetY - top * scale;
  const compact = !node.showConnectionPoints;
  const divisionLike = /division|directorate/i.test(node.unitType);
  const cardFill = compact && node.hierarchyLevel === 2
    ? divisionLike
      ? EXPORT_COLORS.energy
      : EXPORT_COLORS.graphite
    : EXPORT_COLORS.white;
  const cardFillOpacity = compact && node.hierarchyLevel === 2
    ? divisionLike
      ? 0.18
      : 0.58
    : 1;
  const centeredX = (value: string, font: PDFFont, size: number) =>
    x + Math.max(8 * scale, (width - font.widthOfTextAtSize(value, size)) / 2);
  const statusHex =
    node.status === "vacant"
      ? EXPORT_COLORS.orange
      : node.status === "acting"
        ? EXPORT_COLORS.blue
        : EXPORT_COLORS.green;

  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: color(cardFill),
    opacity: cardFillOpacity,
    borderColor: color(EXPORT_COLORS.darkTeal),
    borderWidth: Math.max(0.6, 1.5 * scale),
  });
  page.drawRectangle(
    compact
      ? {
          x,
          y: y + height - (node.hierarchyLevel === 1 ? 8 : 5) * scale,
          width,
          height: (node.hierarchyLevel === 1 ? 8 : 5) * scale,
          color: color(node.hierarchyLevel === 2 ? EXPORT_COLORS.darkTeal : EXPORT_COLORS.green),
        }
      : {
          x,
          y,
          width: 6 * scale,
          height,
          color: color(EXPORT_COLORS.green),
        },
  );
  const unitTypeSize = Math.max(5, 10 * scale);
  page.drawText(pdfText(node.unitType, bold), {
    x: compact ? centeredX(node.unitType, bold, unitTypeSize) : x + 20 * scale,
    y: mapY(node.y + 24),
    size: unitTypeSize,
    font: bold,
    color: color(EXPORT_COLORS.green),
  });
  node.nameLines.forEach((line, index) => {
    const nameSize = Math.max(7, (compact && node.hierarchyLevel === 1 ? 22 : 17) * scale);
    page.drawText(pdfText(line, bold), {
      x: compact ? centeredX(line, bold, nameSize) : x + 20 * scale,
      y: mapY(node.y + 51 + index * 20),
      size: nameSize,
      font: bold,
      color: color(EXPORT_COLORS.ink),
    });
  });
  const positionTitleSize = Math.max(5, 12 * scale);
  page.drawText(pdfText(node.positionTitle, regular), {
    x: compact
      ? centeredX(node.positionTitle, regular, positionTitleSize)
      : x + 20 * scale,
    y: mapY(node.y + (node.nameLines.length > 1 ? 92 : 78)),
    size: positionTitleSize,
    font: regular,
    color: color(EXPORT_COLORS.ink),
  });
  const statusTextSize = Math.max(5, 11 * scale);
  const statusTextWidth = bold.widthOfTextAtSize(node.statusText, statusTextSize);
  const statusMarkerRadius = Math.max(1.8, 4 * scale);
  const statusGap = 7 * scale;
  const statusRowStartX = compact
    ? x + Math.max(
        8 * scale,
        (width - (statusMarkerRadius * 2 + statusGap + statusTextWidth)) / 2,
      )
    : x + 20 * scale;
  const statusMarkerX = compact
    ? statusRowStartX + statusMarkerRadius
    : x + 24 * scale;
  const statusTextX = compact
    ? statusRowStartX + statusMarkerRadius * 2 + statusGap
    : x + 36 * scale;
  page.drawCircle({
    x: statusMarkerX,
    y: mapY(node.y + 114),
    size: statusMarkerRadius,
    color: color(statusHex),
  });
  page.drawText(pdfText(node.statusText, bold), {
    x: statusTextX,
    y: mapY(node.y + 118),
    size: statusTextSize,
    font: bold,
    color: color(EXPORT_COLORS.ink),
  });
  if (node.compactListStartY !== null) {
    const headerTop = node.y + node.compactListStartY;
    page.drawRectangle({
      x,
      y: mapY(headerTop + 34),
      width,
      height: 34 * scale,
      color: color(EXPORT_COLORS.graphite),
    });
    page.drawText(
      pdfText(
        `${node.compactEntries.length} LISTED ASSIGNMENT${node.compactEntries.length === 1 ? "" : "S"}`,
        bold,
      ),
      {
        x: x + 12 * scale,
        y: mapY(headerTop + 22),
        size: Math.max(4.5, 8 * scale),
        font: bold,
        color: color(EXPORT_COLORS.darkTeal),
      },
    );
    node.compactEntries.forEach((entry, index) => {
      const rowTop = headerTop + 34 + index * 54;
      const entryStatusSize = Math.max(4, 8 * scale);
      const entryStatusWidth = bold.widthOfTextAtSize(entry.statusText, entryStatusSize);
      const entryStatusRight = x + width - 12 * scale;
      const entryStatusMarkerRadius = Math.max(1.4, 3.5 * scale);
      page.drawLine({
        start: { x, y: mapY(rowTop) },
        end: { x: x + width, y: mapY(rowTop) },
        thickness: Math.max(0.35, scale),
        color: color(EXPORT_COLORS.graphite),
      });
      page.drawText(pdfText(entry.name, bold), {
        x: x + 12 * scale,
        y: mapY(rowTop + 19),
        size: Math.max(5, 10 * scale),
        font: bold,
        color: color(EXPORT_COLORS.darkTeal),
      });
      page.drawText(pdfText(entry.positionTitle, regular), {
        x: x + 12 * scale,
        y: mapY(rowTop + 36),
        size: Math.max(4, 8 * scale),
        font: regular,
        color: color(EXPORT_COLORS.ink),
      });
      page.drawCircle({
        x:
          entryStatusRight -
          entryStatusWidth -
          5 * scale -
          entryStatusMarkerRadius,
        y: mapY(rowTop + 27),
        size: entryStatusMarkerRadius,
        color: color(
          entry.status === "vacant"
            ? EXPORT_COLORS.orange
            : entry.status === "acting"
              ? EXPORT_COLORS.blue
              : EXPORT_COLORS.green,
        ),
      });
      page.drawText(pdfText(entry.statusText, bold), {
        x: entryStatusRight - entryStatusWidth,
        y: mapY(rowTop + 31),
        size: entryStatusSize,
        font: bold,
        color: color(EXPORT_COLORS.ink),
      });
    });
  }
  connectionPointsForNode(node).forEach((point) => {
    page.drawCircle({
      x: offsetX + point.x * scale,
      y: mapY(point.y),
      size: Math.max(0.8, EXPORT_CONNECTION_POINT_RADIUS * scale),
      color: color(EXPORT_COLORS.darkTeal),
      borderColor: color(EXPORT_COLORS.white),
      borderWidth: Math.max(0.4, EXPORT_CONNECTION_POINT_STROKE_WIDTH * scale),
    });
  });
}

export async function buildChartPdf(
  scene: ChartExportScene,
  presetId: ExportPresetId = "natural",
): Promise<Uint8Array> {
  const targetScale = 0.72;
  const maxPageDimension = 14_400;
  const preset = EXPORT_PRESETS.find((candidate) => candidate.id === presetId) ?? EXPORT_PRESETS[0];
  const pageWidth = preset.pageWidthInches
    ? preset.pageWidthInches * 72
    : Math.min(maxPageDimension, Math.max(792, scene.width * targetScale));
  const pageHeight = preset.pageHeightInches
    ? preset.pageHeightInches * 72
    : Math.min(maxPageDimension, Math.max(612, scene.height * targetScale));
  const pageMargin = preset.pageWidthInches ? 18 : 0;
  const scale = Math.min(
    (pageWidth - pageMargin * 2) / scene.width,
    (pageHeight - pageMargin * 2) / scene.height,
  );
  const offsetX = (pageWidth - scene.width * scale) / 2;
  const offsetY = (pageHeight - scene.height * scale) / 2;

  const document = await PDFDocument.create();
  document.setTitle(`${scene.chartName} - organizational chart`);
  document.setAuthor("UT-Battelle LLC");
  document.setSubject(
    `${scene.audience === "public" ? "Public-safe" : "Internal"} working draft, version ${scene.chartVersion}, ${preset.label}`,
  );
  document.setCreator("ORNL OrgChart Studio");
  document.setProducer("ORNL OrgChart Studio");
  document.setCreationDate(new Date(scene.generatedAt));
  document.setModificationDate(new Date(scene.generatedAt));

  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const page = document.addPage([pageWidth, pageHeight]);
  const mapY = (top: number) => pageHeight - offsetY - top * scale;
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
    color: color(EXPORT_COLORS.softGray),
  });
  page.drawRectangle({
    x: offsetX,
    y: mapY(74),
    width: scene.width * scale,
    height: 74 * scale,
    color: color(EXPORT_COLORS.white),
  });
  page.drawRectangle({
    x: offsetX,
    y: mapY(74),
    width: 8 * scale,
    height: 74 * scale,
    color: color(EXPORT_COLORS.green),
  });
  page.drawText(pdfText(scene.chartName, bold), {
    x: offsetX + 30 * scale,
    y: mapY(31),
    size: Math.max(9, 20 * scale),
    font: bold,
    color: color(EXPORT_COLORS.ink),
  });
  page.drawText(
    `${scene.audience === "public" ? "PUBLIC-SAFE DRAFT" : "INTERNAL WORKING DRAFT"} - VERSION ${scene.chartVersion}`,
    {
      x: offsetX + 30 * scale,
      y: mapY(53),
      size: Math.max(5, 10 * scale),
      font: bold,
      color: color(EXPORT_COLORS.darkTeal),
    },
  );

  scene.edges.forEach((edge) => {
    for (let index = 1; index < edge.points.length; index += 1) {
      const start = edge.points[index - 1];
      const end = edge.points[index];
      page.drawLine({
        start: { x: offsetX + start.x * scale, y: mapY(start.y) },
        end: { x: offsetX + end.x * scale, y: mapY(end.y) },
        thickness: Math.max(0.7, 2 * scale),
        color: color(EXPORT_COLORS.darkTeal),
      });
    }
  });
  scene.nodes.forEach((node) =>
    drawNode(page, node, pageHeight, scale, offsetX, offsetY, regular, bold),
  );

  const generated = new Date(scene.generatedAt).toISOString();
  page.drawText(
    pdfText(
      `Generated ${generated} - ${scene.nodes.length} cards${scene.groupedNodeCount ? ` - ${scene.groupedNodeCount} grouped entries` : ""}${scene.excludedNodeCount ? ` - ${scene.excludedNodeCount} excluded by audience profile` : ""}`,
      regular,
    ),
    {
      x: offsetX + 52 * scale,
      y: mapY(scene.height - 15),
      size: Math.max(5, 10 * scale),
      font: regular,
      color: color(EXPORT_COLORS.ink),
    },
  );
  return document.save();
}
