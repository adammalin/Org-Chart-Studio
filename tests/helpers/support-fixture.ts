import { createBlankChart, type ChartDocument } from "../../lib/chart-library";
export function supportFixture(id = "synthetic-support"): ChartDocument {
  const c = createBlankChart("Synthetic Support Directorate", id),
    root = c.nodes[0];
  root.id = "synthetic-root";
  root.data.unit = {
    ...root.data.unit,
    id: root.id,
    name: "Synthetic Directorate",
    shortName: "Synthetic Directorate",
    assignmentLabel: "Sample Director",
    positionTitle: "Director",
    positionStatus: "filled",
    sourceCertainty: "confirmed",
    sourceLocator: "Synthetic slide 1 root",
    publicationVisibility: "public",
  };
  root.position = { x: 600, y: 80 };
  root.style = { width: 900, height: 200 };
  root.data.pinned = true;
  const child = structuredClone(root);
  child.id = "synthetic-child";
  child.data.unit = {
    ...child.data.unit,
    id: child.id,
    name: "Synthetic Division",
    shortName: "Synthetic Division",
    assignmentLabel: "Sample Division Lead",
  };
  child.position = { x: 100, y: 450 };
  child.style = { width: 400, height: 140 };
  c.nodes = [root, child];
  c.edges = [
    {
      id: "synthetic-edge",
      source: root.id,
      target: child.id,
      data: {
        relationshipType: "primary supervisory",
        sourceCertainty: "confirmed",
        sourceLocator: "Synthetic connector",
        sourceRoute: {
          sourceBounds: { ...root.position, ...root.style },
          targetBounds: { ...child.position, ...child.style },
          points: [
            { x: 1050, y: 280 },
            { x: 1050, y: 340 },
            { x: 300, y: 340 },
            { x: 300, y: 450 },
          ],
        },
      },
    },
  ];
  c.sourceLayout = {
    referenceUrl: "https://example.invalid/official-chart.pptx",
    sourceLocator: "Synthetic slide 1",
    capturedAt: "2026-11-11T12:00:00Z",
    width: 2000,
    height: 1300,
  };
  c.supportPanels = [
    {
      id: "synthetic-matrix",
      title: "Synthetic Matrix Support",
      kind: "matrix_support",
      anchorUnitId: root.id,
      placement: "below",
      geometry: { x: 600, y: 700, width: 800, height: 360 },
      connector: {
        points: [
          { x: 1050, y: 280 },
          { x: 1050, y: 700 },
        ],
        style: "solid",
      },
      publicationVisibility: "internal",
      source: "Synthetic source",
      sourceLocator: "Synthetic slide 1, support panel",
      sourceCertainty: "needs_review",
      reviewNote: "Synthetic comparison only",
      entries: [
        {
          id: "synthetic-support-hr",
          role: "HR Business Partner",
          person: "Sample Support Person",
          positionStatus: "acting",
          effectiveDate: "Not specified",
          publicationVisibility: "internal",
          source: "Synthetic source",
          sourceLocator: "Synthetic support row 1",
          sourceCertainty: "needs_review",
          reviewNote: "Verify synthetic support role",
        },
        {
          id: "synthetic-support-procurement",
          role: "Procurement Manager",
          person: "Another Sample Person",
          positionStatus: "filled",
          effectiveDate: "Not specified",
          publicationVisibility: "public",
          source: "Synthetic source",
          sourceLocator: "Synthetic support row 2",
          sourceCertainty: "needs_review",
          reviewNote: "Verify synthetic support role",
        },
      ],
    },
  ];
  return c;
}
