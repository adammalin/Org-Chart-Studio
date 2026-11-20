import fontkit from "@pdf-lib/fontkit";
import type { ChartFonts, OfficialCard } from "./chart-appearance";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  pushGraphicsState, popGraphicsState, concatTransformationMatrix,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import {
  connectionPointsForNode,
  EXPORT_CONNECTION_POINT_RADIUS,
  EXPORT_CONNECTION_POINT_STROKE_WIDTH,
  EXPORT_COLORS,
  EXPORT_PRESETS,
  exportLifecycleLabel,
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

function fitPdfTextSize(
  value: string,
  font: PDFFont,
  preferredSize: number,
  maximumWidth: number,
  minimumSize = 3,
): number {
  let size = preferredSize;
  while (
    size > minimumSize &&
    font.widthOfTextAtSize(value, size) > maximumWidth
  ) {
    size -= 0.25;
  }
  return Math.max(minimumSize, size);
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
  const cardFill =
    compact && node.hierarchyLevel === 2
      ? divisionLike
        ? EXPORT_COLORS.energy
        : EXPORT_COLORS.graphite
      : EXPORT_COLORS.white;
  const cardFillOpacity =
    compact && node.hierarchyLevel === 2 ? (divisionLike ? 0.18 : 0.58) : 1;
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
          color: color(
            node.hierarchyLevel === 2
              ? EXPORT_COLORS.darkTeal
              : EXPORT_COLORS.green,
          ),
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
    const nameSize = fitPdfTextSize(
      line,
      bold,
      Math.max(5, node.nameFontSize * scale),
      width - (compact ? 32 : 40) * scale,
    );
    page.drawText(pdfText(line, bold), {
      x: compact ? centeredX(line, bold, nameSize) : x + 20 * scale,
      y: mapY(node.y + 51 + index * node.nameLineHeight),
      size: nameSize,
      font: bold,
      color: color(EXPORT_COLORS.ink),
    });
  });
  const positionTitleSize = fitPdfTextSize(
    node.positionTitle,
    regular,
    Math.max(5, 12 * scale),
    width - (compact ? 32 : 40) * scale,
  );
  const positionTitleY = Math.min(
    98,
    Math.max(78, 51 + (node.nameLines.length - 1) * node.nameLineHeight + 18),
  );
  page.drawText(pdfText(node.positionTitle, regular), {
    x: compact
      ? centeredX(node.positionTitle, regular, positionTitleSize)
      : x + 20 * scale,
    y: mapY(node.y + positionTitleY),
    size: positionTitleSize,
    font: regular,
    color: color(EXPORT_COLORS.ink),
  });
  const statusMaximumWidth = Math.max(
    24,
    (node.width - (compact ? 56 : 48)) * scale,
  );
  const statusTextSizes = node.statusLines.map((line) =>
    fitPdfTextSize(
      line,
      bold,
      Math.max(3, node.statusFontSize * scale),
      statusMaximumWidth,
      2.5,
    ),
  );
  const statusTextWidth = Math.max(
    ...node.statusLines.map((line, index) =>
      bold.widthOfTextAtSize(line, statusTextSizes[index]),
    ),
  );
  const statusMarkerRadius = Math.max(1.8, 4 * scale);
  const statusGap = 7 * scale;
  const statusRowStartX = compact
    ? x +
      Math.max(
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
  node.statusLines.forEach((line, index) => {
    page.drawText(pdfText(line, bold), {
      x: statusTextX,
      y: mapY(node.y + 118 + index * node.statusLineHeight),
      size: statusTextSizes[index],
      font: bold,
      color: color(EXPORT_COLORS.ink),
    });
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
      const entryTextMaximumWidth = Math.max(24, (node.width - 138) * scale);
      const entryStatusMaximumWidth = Math.max(
        24,
        Math.min(96, Math.max(56, node.width * 0.36)) * scale,
      );
      const entryNameSize = fitPdfTextSize(
        entry.name,
        bold,
        Math.max(4, 10 * scale),
        entryTextMaximumWidth,
      );
      const entryRoleSize = fitPdfTextSize(
        entry.positionTitle,
        regular,
        Math.max(3.5, 8 * scale),
        entryTextMaximumWidth,
      );
      const entryStatusSize = fitPdfTextSize(
        entry.statusText,
        bold,
        Math.max(3.5, 8 * scale),
        entryStatusMaximumWidth,
      );
      const entryStatusWidth = bold.widthOfTextAtSize(
        entry.statusText,
        entryStatusSize,
      );
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
        size: entryNameSize,
        font: bold,
        color: color(EXPORT_COLORS.darkTeal),
      });
      page.drawText(pdfText(entry.positionTitle, regular), {
        x: x + 12 * scale,
        y: mapY(rowTop + 36),
        size: entryRoleSize,
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
  fonts?: ChartFonts|null,
): Promise<Uint8Array> {
  const targetScale = 0.72;
  const maxPageDimension = 14_400;
  const preset =
    EXPORT_PRESETS.find((candidate) => candidate.id === presetId) ??
    EXPORT_PRESETS[0];
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

  if(fonts)document.registerFontkit(fontkit);
  const decode=(base64:string)=>Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
  const regular = await document.embedFont(fonts?decode(fonts.regular):StandardFonts.Helvetica,{subset:!!fonts});
  const bold = await document.embedFont(fonts?decode(fonts.bold):StandardFonts.HelveticaBold,{subset:!!fonts});
  const italic=await document.embedFont(fonts?.italic?decode(fonts.italic):StandardFonts.HelveticaOblique,{subset:!!fonts?.italic});
  const boldItalic=await document.embedFont(fonts?.boldItalic?decode(fonts.boldItalic):StandardFonts.HelveticaBoldOblique,{subset:!!fonts?.boldItalic});
  const page = document.addPage([pageWidth, pageHeight]);
  const mapY = (top: number) => pageHeight - offsetY - top * scale;
  if(scene.appearance === "official") {
    page.drawRectangle({x:0,y:0,width:pageWidth,height:pageHeight,color:rgb(1,1,1)});
    const drawCard=(card:OfficialCard,x:number,y:number,width:number,height:number)=>{
      page.drawRectangle({x:offsetX+x*scale,y:mapY(y+height),width:width*scale,height:height*scale,color:card.noFill?undefined:color(card.fill),borderColor:card.noBorder?undefined:color(card.border),borderWidth:card.noBorder?0:card.borderWidth*scale});
      for(const line of card.lines){const font=line.italic?(line.bold?boldItalic:italic):(line.bold?bold:regular),size=line.size*scale,text=pdfText(line.text,font),natural=font.widthOfTextAtSize(text,size),desired=line.textWidth!==undefined?line.textWidth*scale:natural,anchor=line.anchor==='start'?0:line.anchor==='end'?1:.5,xp=offsetX+(x+line.x)*scale-desired*anchor,yp=mapY(y+line.y),angle=-(line.rotation??0)*Math.PI/180,sx=natural>0?desired/natural:1;
        page.pushOperators(pushGraphicsState(),concatTransformationMatrix(Math.cos(angle)*sx,Math.sin(angle)*sx,-Math.sin(angle),Math.cos(angle),xp,yp));
        page.drawText(text,{x:0,y:0,size,font,color:color(line.color??'000000')});page.pushOperators(popGraphicsState());
      }
    };
    const drawLine=(points:{x:number;y:number}[],dashed=false)=>{for(let i=1;i<points.length;i++)page.drawLine({start:{x:offsetX+points[i-1].x*scale,y:mapY(points[i-1].y)},end:{x:offsetX+points[i].x*scale,y:mapY(points[i].y)},color:color('595959'),thickness:(scene.connectorWidth??1.5)*scale,...(dashed?{dashArray:[(scene.connectorWidth??1.5)*3*scale,(scene.connectorWidth??1.5)*2*scale]}:{})});};
    if(scene.sourcePresentation){for(const stroke of scene.sourcePresentation.strokes){for(let i=1;i<stroke.points.length;i++)page.drawLine({start:{x:offsetX+stroke.points[i-1].x*scale,y:mapY(stroke.points[i-1].y)},end:{x:offsetX+stroke.points[i].x*scale,y:mapY(stroke.points[i].y)},color:color(stroke.color),thickness:stroke.width*scale,...(stroke.dash?{dashArray:stroke.dash.map(v=>v*scale)}:{})});}for(const a of scene.sourcePresentation.annotations)drawCard(a.card,a.bounds.x,a.bounds.y,a.bounds.width,a.bounds.height);}else for(const edge of scene.edges)drawLine(edge.points);
    for(const n of scene.nodes)drawCard(n.official!,n.x,n.y,n.width,n.height);
    for(const p of scene.supportPanels??[]){if(p.connector&&!scene.sourcePresentation)drawLine(p.connector.points,p.connector.style==='dashed');drawCard(p.official!,p.x,p.y,p.width,p.height);}
    page.drawText(pdfText(`${exportLifecycleLabel(scene).replaceAll('•','-')} - Generated ${scene.generatedAt}`,regular),{x:offsetX+52*scale,y:mapY(scene.height-12),size:10*scale,font:regular,color:color('595959')});
    return document.save();
  }

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
  page.drawText(exportLifecycleLabel(scene).replaceAll("•", "-"), {
    x: offsetX + 30 * scale,
    y: mapY(53),
    size: Math.max(5, 10 * scale),
    font: bold,
    color: color(EXPORT_COLORS.darkTeal),
  });

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
  for (const p of scene.supportPanels ?? []) {
    const x = offsetX + p.x * scale,
      y = pageHeight - offsetY - (p.y + p.height) * scale;
    for (let i = 1; i < (p.connector?.points.length ?? 0); i++) {
      const a = p.connector!.points[i - 1],
        b = p.connector!.points[i];
      page.drawLine({
        start: {
          x: offsetX + a.x * scale,
          y: pageHeight - offsetY - a.y * scale,
        },
        end: {
          x: offsetX + b.x * scale,
          y: pageHeight - offsetY - b.y * scale,
        },
        color: color("65756B"),
        thickness: 0.75,
        ...(p.connector!.style === "dashed" ? { dashArray: [4, 3] } : {}),
      });
    }
    page.drawRectangle({
      x,
      y,
      width: p.width * scale,
      height: p.height * scale,
      color: color("E7E9E7"),
      borderColor: color("6C7571"),
      borderWidth: 0.75,
    });
    page.drawText(pdfText(p.title, bold), {
      x: x + 20 * scale,
      y: pageHeight - offsetY - (p.y + 32) * scale,
      size: 20 * scale,
      font: bold,
      color: color("273C36"),
    });
    p.lines.forEach((line, i) =>
      page.drawText(pdfText(line, regular), {
        x: x + 20 * scale,
        y: pageHeight - offsetY - (p.y + 62 + i * p.lineHeight) * scale,
        size: p.fontSize * scale,
        font: regular,
        color: color("273C36"),
      }),
    );
  }

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
