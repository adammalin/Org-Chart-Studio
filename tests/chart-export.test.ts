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
  estimateExportTextWidth,
  safeExportFileStem,
} from "../lib/chart-export";
import { buildChartPdf } from "../lib/chart-export-pdf";
import { buildChartPptx } from "../lib/chart-export-pptx";
import {
  buildOrthogonalEdgeRoutes,
  manualEdgeRouteFromRoute,
  moveManualEdgeRouteLane,
} from "../lib/edge-routing";
import { NODE_HEIGHT, NODE_WIDTH } from "../lib/org-chart";

const generatedAt = "2026-07-31T20:00:00.000Z";

test("export text keeps complete long metadata in SVG and editable PowerPoint text boxes", async () => {
  const chart = seedChartDocuments()[0];
  const fullLabel =
    "A very long group and nonemployee assignment label that must remain inside the card";
  const longLabelChart = {
    ...chart,
    nodes: chart.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        unit: {
          ...node.data.unit,
          assignmentLabel: fullLabel,
        },
      },
    })),
  };
  const scene = buildChartExportScene(
    longLabelChart,
    "internal",
    generatedAt,
    "separate",
    "compact",
  );

  assert.ok(scene.nodes.some((node) =>
    node.compactEntries.some((entry) => entry.statusText === fullLabel),
  ));
  assert.ok(scene.nodes.every((node) =>
    !node.statusText.includes("…") &&
    node.compactEntries.every((entry) => !entry.statusText.includes("…")),
  ));

  const svg = buildChartSvg(scene, "natural");
  assert.ok(svg.includes(fullLabel));
  assert.ok(svg.includes(`data-full-text="${fullLabel}"`));
  assert.doesNotMatch(svg, /…/);

  const presentation = await buildChartPptx(scene, "presentation-wide");
  const slideXml = strFromU8(unzipSync(presentation)["ppt/slides/slide1.xml"]);
  assert.ok(slideXml.includes(fullLabel));
  assert.match(slideXml, /<a:normAutofit\/>/);
});

test("screen-ready export labels remove imported asterisks without mutating source data", async () => {
  const chart = seedChartDocuments()[0];
  const markedChart = {
    ...chart,
    nodes: chart.nodes.map((node, index) => index === 0
      ? {
          ...node,
          data: {
            ...node.data,
            unit: {
              ...node.data.unit,
              shortName: "**Business Assurance** Beverly Rausin** Linda Wallace",
              positionTitle: "**Director**",
              assignmentLabel: "**Erica Whitehead**",
            },
          },
        }
      : node),
  };
  const scene = buildChartExportScene(markedChart, "internal", generatedAt, "separate", "compact");
  const exportedNode = scene.nodes.find((node) => node.id === chart.nodes[0].id)!;

  assert.match(markedChart.nodes[0].data.unit.shortName, /\*\*/);
  assert.equal(exportedNode.name, "Business Assurance Beverly Rausin Linda Wallace");
  assert.equal(exportedNode.positionTitle, "Director");
  assert.equal(exportedNode.statusText, "Erica Whitehead");

  const svg = buildChartSvg(scene, "natural");
  assert.doesNotMatch(svg, /\*\*/);
  assert.match(svg, /Business Assurance Beverly Rausin Linda Wallace/);

  const presentation = await buildChartPptx(scene, "presentation-wide");
  const slideXml = strFromU8(unzipSync(presentation)["ppt/slides/slide1.xml"]);
  assert.doesNotMatch(slideXml, /\*\*/);
  assert.match(slideXml, /Business Assurance Beverly Rausin Linda Wallace/);
});

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
  assert.match(publicTable, /^chartLifecycle,chartVersion,lastCurrentAt,lastCurrentBy,unit,parent,unitType/m);
  assert.doesNotMatch(publicTable, /unit-lab|Sample role holder|source/i);
  assert.equal(safeExportFileStem("Example Directorate — Current!"), "example-directorate-current");
});

test("exports visibly carry chart lifecycle and the last Current approval record", () => {
  const chart = seedChartDocuments()[0];
  const currentChart = {
    ...chart,
    status: "current" as const,
    version: 4,
    lifecycle: {
      statusChangedAt: "2026-08-04T14:00:00.000Z",
      lastCurrentAt: "2026-08-04T14:00:00.000Z",
      lastCurrentVersion: 4,
      lastCurrentBy: "Synthetic Reviewer",
      lastCurrentNote: "Synthetic approval fixture.",
    },
  };
  const scene = buildChartExportScene(currentChart, "internal", generatedAt);
  const svg = buildChartSvg(scene, "natural");
  const table = buildAccessibleTableCsv(currentChart, "internal");

  assert.equal(scene.chartStatus, "current");
  assert.equal(scene.lastCurrentVersion, 4);
  assert.equal(scene.lastCurrentBy, "Synthetic Reviewer");
  assert.match(svg, /INTERNAL • CURRENT • VERSION 4/);
  assert.match(svg, /Last Current v4/);
  assert.match(svg, /Synthetic Reviewer/);
  assert.match(table, /^unitId,chartLifecycle,chartVersion,lastCurrentAt,lastCurrentBy/m);
  assert.match(table, /current,4,2026-08-04T14:00:00.000Z,Synthetic Reviewer/);
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

test("compact exports group terminal records and route level-three cards from the left", () => {
  const chart = seedChartDocuments()[0];
  const scene = buildChartExportScene(
    chart,
    "internal",
    generatedAt,
    "separate",
    "compact",
  );
  const svg = buildChartSvg(scene, "natural");

  assert.equal(scene.presentationMode, "compact");
  assert.equal(scene.compactLayoutOrientation, "vertical");
  assert.ok(scene.groupedNodeCount > 0);
  assert.ok(scene.nodes.length < chart.nodes.length);
  assert.ok(scene.nodes.some((node) => node.compactEntries.length > 0));
  assert.ok(scene.nodes.some((node) => node.targetSide === "left"));
  assert.equal(scene.nodes.flatMap(connectionPointsForNode).length, 0);
  assert.match(svg, /compact grouped presentation/);
  assert.match(svg, /LISTED ASSIGNMENTS?/);
  assert.match(svg, /clipPath id="export-card-content-/);
  assert.match(svg, /text-anchor="end"/);
  assert.doesNotMatch(svg, /data-port-kind=/);
  const rootId = scene.nodes.find((node) => node.hierarchyLevel === 1)?.id;
  const rootEdges = scene.edges.filter((edge) => edge.sourceId === rootId);
  assert.ok(rootEdges.length > 1);
  assert.equal(new Set(rootEdges.map((edge) => edge.points[0].x)).size, 1);
  assert.equal(new Set(rootEdges.map((edge) => edge.points[1].y)).size, 1);
  for (const edge of scene.edges) {
    const target = scene.nodes.find((node) => node.id === edge.targetId)!;
    if (target.targetSide === "left") {
      assert.equal(edge.points.at(-1)?.x, target.x);
    }
  }
  for (const node of scene.nodes) {
    assert.ok(
      estimateExportTextWidth(node.statusText, 11, true) <= node.width - 56,
      `status text must fit inside ${node.id}`,
    );
    for (const entry of node.compactEntries) {
      assert.ok(
        estimateExportTextWidth(entry.statusText, 8, true) <= 96,
        `compact status text must fit inside ${entry.id}`,
      );
      assert.ok(
        estimateExportTextWidth(entry.name, 10, true) <= node.width - 138,
        `compact name must fit inside ${entry.id}`,
      );
    }
  }
});

test("horizontal compact exports use wide hierarchy rows and top-entry connectors", () => {
  const chart = seedChartDocuments()[0];
  const vertical = buildChartExportScene(
    chart,
    "internal",
    generatedAt,
    "separate",
    "compact",
    "vertical",
  );
  const horizontal = buildChartExportScene(
    chart,
    "internal",
    generatedAt,
    "separate",
    "compact",
    "horizontal",
  );
  const svg = buildChartSvg(horizontal, "presentation-wide");

  assert.equal(horizontal.presentationMode, "compact");
  assert.equal(horizontal.compactLayoutOrientation, "horizontal");
  assert.equal(horizontal.groupedNodeCount, vertical.groupedNodeCount);
  assert.ok(horizontal.width > vertical.width);
  assert.ok(horizontal.height < vertical.height);
  assert.ok(
    horizontal.nodes
      .filter((node) => node.hierarchyLevel >= 3)
      .every((node) => node.targetSide === "top"),
  );
  assert.match(svg, /horizontal compact grouped presentation/);
  assert.doesNotMatch(svg, /data-port-kind=/);
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

test("exports translate saved connector pins into the page coordinate system", () => {
  const chart = seedChartDocuments()[0];
  const edge = chart.edges[0];
  const routes = buildOrthogonalEdgeRoutes(
    chart.nodes.map((node) => ({
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    chart.edges,
  );
  const route = routes.get(edge.id)!;
  const control = route.controls.find(
    (candidate) => candidate.axis === "y" || candidate.axis === "both",
  )!;
  const manualRoute = manualEdgeRouteFromRoute(route)!;
  const pinnedY = manualRoute.points[control.pointIndex].y + 67;
  const movedRoute = moveManualEdgeRouteLane(
    manualRoute,
    control.pointIndex,
    "y",
    pinnedY,
  );
  const pinnedChart = {
    ...chart,
    edges: chart.edges.map((candidate) =>
      candidate.id === edge.id
        ? { ...candidate, data: { ...candidate.data, manualRoute: movedRoute } }
        : candidate,
    ),
  };

  const scene = buildChartExportScene(pinnedChart, "internal", generatedAt);
  const sourceNode = chart.nodes.find((node) => node.id === edge.source)!;
  const exportedSource = scene.nodes.find((node) => node.id === edge.source)!;
  const offsetY = exportedSource.y - sourceNode.position.y;
  const exportedEdge = scene.edges.find((candidate) => candidate.id === edge.id)!;

  assert.ok(exportedEdge.points.some((point) => point.y === pinnedY + offsetY));
  exportedEdge.points.slice(0, -1).forEach((point, index) => {
    const next = exportedEdge.points[index + 1];
    assert.ok(point.x === next.x || point.y === next.y);
  });
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

test("PowerPoint compact roster status boxes stay inside their group card", async () => {
  const chart = seedChartDocuments()[0];
  const scene = buildChartExportScene(
    chart,
    "internal",
    generatedAt,
    "separate",
    "compact",
  );
  const group = scene.nodes.find((node) => node.compactEntries.length > 0)!;
  const entry = group.compactEntries[0];
  const presentation = await buildChartPptx(scene, "presentation-wide");
  const slideXml = strFromU8(unzipSync(presentation)["ppt/slides/slide1.xml"]);
  const boundsFor = (objectName: string) => {
    const escapedName = objectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = slideXml.match(
      new RegExp(
        `name="${escapedName}"[\\s\\S]*?<a:off x="(\\d+)" y="(\\d+)"\\/><a:ext cx="(\\d+)" cy="(\\d+)"\\/>`,
      ),
    );
    assert.ok(match, `missing editable shape ${objectName}`);
    return {
      x: Number(match[1]),
      y: Number(match[2]),
      width: Number(match[3]),
      height: Number(match[4]),
    };
  };
  const cardBounds = boundsFor(`Unit card ${group.id}`);
  const statusBounds = boundsFor(`Compact entry status ${entry.id}`);

  assert.ok(statusBounds.x >= cardBounds.x);
  assert.ok(statusBounds.x + statusBounds.width <= cardBounds.x + cardBounds.width);
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
