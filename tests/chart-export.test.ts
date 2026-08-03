import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import {
  decodePDFRawStream,
  PDFArray,
  PDFDocument,
  PDFRawStream,
} from "pdf-lib";
import { seedChartDocuments } from "../lib/chart-library";
import {
  buildAccessibleTableCsv,
  buildChartExportScene,
  buildChartSvg,
  connectionPointsForNode,
  safeExportFileStem,
} from "../lib/chart-export";
import { buildChartPdf } from "../lib/chart-export-pdf";
import { buildChartPptx } from "../lib/chart-export-pptx";

const generatedAt = "2026-07-31T20:00:00.000Z";

test("a single scene drives metadata-rich internal and public SVG exports", () => {
  const chart = seedChartDocuments()[0];
  const internal = buildChartExportScene(chart, "internal", generatedAt);
  const publicScene = buildChartExportScene(chart, "public", generatedAt);
  const publicSvg = buildChartSvg(publicScene, "presentation-wide");

  assert.equal(internal.nodes.length, chart.nodes.length);
  assert.equal(publicScene.nodes.length, 3);
  assert.equal(publicScene.excludedNodeCount, chart.nodes.length - 3);
  assert.match(publicSvg, /PUBLIC-SAFE DRAFT/);
  assert.match(publicSvg, /VERSION 1/);
  assert.match(publicSvg, /viewBox="0 0 1600 900"/);
  assert.doesNotMatch(publicSvg, /Sample role holder/);
  assert.match(publicSvg, /Synthetic Laboratory Overview/);
  const publicTable = buildAccessibleTableCsv(chart, "public");
  assert.match(publicTable, /^unit,parent,unitType/m);
  assert.doesNotMatch(publicTable, /unit-lab|Sample role holder|source/i);
  assert.equal(safeExportFileStem("Example Directorate — Current!"), "example-directorate-current");
});

test("shared export scene includes editor-matching connection point circles", () => {
  const chart = seedChartDocuments()[0];
  const scene = buildChartExportScene(chart, "internal", generatedAt);
  const svg = buildChartSvg(scene, "natural");
  const expectedSourcePointCount = scene.nodes.reduce(
    (total, node) => total + node.sourcePortOffsets.length,
    0,
  );

  assert.equal(
    (svg.match(/data-port-kind="target"/g) ?? []).length,
    scene.nodes.length,
  );
  assert.equal(
    (svg.match(/data-port-kind="source"/g) ?? []).length,
    expectedSourcePointCount,
  );
  assert.match(svg, /class="org-connection-point org-connection-point--target"/);
  assert.match(svg, /fill="#00454D" stroke="#FFFFFF" stroke-width="2"/);

  for (const node of scene.nodes) {
    const points = connectionPointsForNode(node);
    assert.equal(points[0].kind, "target");
    assert.equal(points[0].y, node.y);
    assert.ok(points.some((point) => point.kind === "source"));
  }
  for (const edge of scene.edges) {
    const source = scene.nodes.find((node) => node.id === edge.sourceId);
    const target = scene.nodes.find((node) => node.id === edge.targetId);
    assert.ok(source && target);
    const sourcePoints = connectionPointsForNode(source).filter(
      (point) => point.kind === "source",
    );
    const targetPoint = connectionPointsForNode(target)[0];
    assert.ok(
      sourcePoints.some(
        (point) => point.x === edge.points[0].x && point.y === edge.points[0].y,
      ),
    );
    assert.deepEqual(targetPoint, {
      kind: "target",
      ...edge.points.at(-1)!,
    });
  }
});

test("sibling relationships use separate source ports and connector lanes", () => {
  const chart = seedChartDocuments()[0];
  const scene = buildChartExportScene(chart, "internal", generatedAt);
  const siblingEdges = scene.edges.filter((edge) => edge.sourceId === "unit-lab");

  assert.ok(siblingEdges.length > 1);
  assert.equal(
    new Set(siblingEdges.map((edge) => edge.points[0].x)).size,
    siblingEdges.length,
  );
  assert.equal(
    new Set(siblingEdges.map((edge) => edge.points[1].y)).size,
    siblingEdges.length,
  );
});

test("combed export geometry matches the optional same-parent screen routing", () => {
  const chart = seedChartDocuments()[0];
  const scene = buildChartExportScene(chart, "internal", generatedAt, "combed");
  const siblingEdges = scene.edges.filter((edge) => edge.sourceId === "unit-lab");

  assert.equal(siblingEdges.length, 2);
  assert.equal(new Set(siblingEdges.map((edge) => edge.points[0].x)).size, 1);
  assert.equal(new Set(siblingEdges.map((edge) => edge.points[1].y)).size, 1);
});

test("public export refuses to silently detach a unit from an internal ancestor", () => {
  const chart = seedChartDocuments()[0];
  const detached = {
    ...chart,
    nodes: chart.nodes.map((node) =>
      node.id === "unit-quantum-networking"
        ? {
            ...node,
            data: {
              ...node.data,
              unit: { ...node.data.unit, publicationVisibility: "public" as const },
            },
          }
        : node,
    ),
  };

  assert.throws(
    () => buildChartExportScene(detached, "public", generatedAt),
    /detach.*internal-only parent/i,
  );
});

test("PDF export is a valid vector document with chart metadata", async () => {
  const chart = seedChartDocuments()[0];
  const scene = buildChartExportScene(chart, "internal", generatedAt);
  const pdf = await buildChartPdf(scene, "tabloid-landscape");

  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString("ascii"), "%PDF-");
  assert.ok(pdf.byteLength > 4_000);
  const document = await PDFDocument.load(pdf);
  const page = document.getPage(0);
  assert.deepEqual(page.getSize(), { width: 1_224, height: 792 });
  const contents = page.node.Contents();
  const streams =
    contents instanceof PDFArray
      ? Array.from({ length: contents.size() }, (_, index) => contents.lookup(index))
      : [contents];
  const curveOperatorCount = streams.reduce((total, stream) => {
    if (!(stream instanceof PDFRawStream)) return total;
    const decoded = decodePDFRawStream(stream).decode();
    return total + (Buffer.from(decoded).toString("latin1").match(/ c\n/g) ?? []).length;
  }, 0);
  const expectedCircleCount =
    scene.nodes.length +
    scene.nodes.reduce(
      (total, node) => total + connectionPointsForNode(node).length,
      0,
    );
  assert.equal(curveOperatorCount, expectedCircleCount * 4);
});

test("PDF export reports unsupported fallback-font characters instead of replacing them silently", async () => {
  const chart = { ...seedChartDocuments()[0], name: "Example Ω Organization" };
  const scene = buildChartExportScene(chart, "internal", generatedAt);

  await assert.rejects(buildChartPdf(scene), /cannot represent the character/i);
});

test("PowerPoint export contains editable slide shapes and metadata", async () => {
  const chart = seedChartDocuments()[0];
  const scene = buildChartExportScene(chart, "public", generatedAt);
  const presentation = await buildChartPptx(scene, "tabloid-portrait");
  const files = unzipSync(presentation);

  assert.ok(files["ppt/presentation.xml"]);
  assert.ok(files["ppt/slides/slide1.xml"]);
  const slideXml = strFromU8(files["ppt/slides/slide1.xml"]);
  assert.match(slideXml, /Synthetic Laboratory Overview/);
  assert.match(slideXml, /PUBLIC-SAFE DRAFT/);
  assert.match(slideXml, /Unit card unit-lab/);
  assert.match(slideXml, /Connection point target unit-lab/);
  assert.match(slideXml, /Connection point source unit-lab/);
  assert.doesNotMatch(slideXml, /Sample role holder/);
  const presentationXml = strFromU8(files["ppt/presentation.xml"]);
  assert.match(presentationXml, /p:sldSz cx="10058400" cy="15544800"/);
});

test("PowerPoint keeps card typography proportional on a wide fit-to-slide chart", async () => {
  const chart = seedChartDocuments()[0];
  const wideChart = {
    ...chart,
    nodes: chart.nodes.map((node, index) => ({
      ...node,
      position: { x: index * 620, y: node.position.y },
    })),
  };
  const scene = buildChartExportScene(wideChart, "internal", generatedAt);
  const presentation = await buildChartPptx(scene, "presentation-wide");
  const files = unzipSync(presentation);
  const slideXml = strFromU8(files["ppt/slides/slide1.xml"]);
  const scale = Math.min(
    (13.333 - 0.36) / scene.width,
    (7.5 - 0.36) / scene.height,
  );
  const expectedNameSize = Math.round(17 * scale * 72 * 100);

  assert.ok(expectedNameSize < 600, "the fixture must exercise the old 6 pt clamp");
  assert.match(slideXml, new RegExp(`sz="${expectedNameSize}"`));
  assert.doesNotMatch(slideXml, /sz="600"/);
});
