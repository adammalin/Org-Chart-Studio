import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writePrivateSourceRecheckBackup } from "../mcp/private-recheck-backup.mjs";
import { validateSourceRecheckProposal } from "../mcp/source-recheck.mjs";

function chartFixture() {
  return {
    id: "chart-source-recheck",
    name: "Synthetic Source Recheck",
    description: "Synthetic test chart.",
    status: "draft",
    version: 3,
    createdAt: "2026-08-05T12:00:00.000Z",
    updatedAt: "2026-08-05T13:00:00.000Z",
    lifecycle: { statusChangedAt: "2026-08-05T12:00:00.000Z" },
    sources: [
      {
        id: "source-1",
        chartId: "chart-source-recheck",
        fileName: "synthetic-source.pptx",
        checksum: "a".repeat(64),
      },
    ],
    nodes: [
      {
        id: "unit-root",
        type: "orgUnit",
        position: { x: 20, y: 30 },
        data: {
          pinned: true,
          unit: {
            id: "unit-root",
            name: "Synthetic Division",
            shortName: "Synthetic Division",
            type: "division",
            positionTitle: "Director",
            assignmentLabel: "Position vacant",
            positionStatus: "vacant",
            effectiveDate: "Current",
            source: "Synthetic source",
            sourceLocator: "Slide 1 shape 2",
            sourceCertainty: "confirmed",
            reviewNote: "",
            planningState: "current",
            publicationVisibility: "internal",
          },
        },
      },
      {
        id: "unit-child",
        type: "orgUnit",
        position: { x: 20, y: 230 },
        data: {
          pinned: false,
          unit: {
            id: "unit-child",
            name: "Synthetic Group",
            shortName: "Synthetic Group",
            type: "group",
            positionTitle: "Group Leader",
            assignmentLabel: "Position vacant",
            positionStatus: "vacant",
            effectiveDate: "Current",
            source: "Synthetic source",
            sourceLocator: "Slide 1 shape 5",
            sourceCertainty: "confirmed",
            reviewNote: "",
            planningState: "current",
            publicationVisibility: "internal",
          },
        },
      },
    ],
    edges: [
      {
        id: "edge-root-child",
        source: "unit-root",
        target: "unit-child",
        type: "smoothstep",
        data: {
          relationshipType: "primary supervisory",
          sourceLocator: "Slide 1 connector 7",
          sourceCertainty: "confirmed",
          reviewNote: "",
          manualRoute: { mode: "pinned", controls: [{ x: 30, y: 120 }] },
        },
      },
    ],
  };
}

test("source recheck accepts only review-queued semantic changes and preserves layout", () => {
  const current = chartFixture();
  const proposed = structuredClone(current);
  proposed.nodes[1].data.unit.assignmentLabel = "Jordan Example";
  proposed.nodes[1].data.unit.positionStatus = "filled";
  proposed.nodes[1].data.unit.sourceCertainty = "needs_review";
  proposed.nodes[1].data.unit.reviewNote = "Confirm the person and title pairing.";
  proposed.edges[0].data.sourceCertainty = "needs_review";
  proposed.edges[0].data.reviewNote = "Confirm this connector endpoint.";

  const result = validateSourceRecheckProposal({
    current,
    proposed,
    reviewedSourceChecksums: ["a".repeat(64)],
  });

  assert.deepEqual(result.changedNodeIds, ["unit-child"]);
  assert.deepEqual(result.changedEdgeIds, ["edge-root-child"]);
});

test("source recheck rejects layout edits, rewiring, silent confirmation, and stale checksums", () => {
  const current = chartFixture();
  const proposal = () => {
    const proposed = structuredClone(current);
    proposed.nodes[1].data.unit.assignmentLabel = "Jordan Example";
    proposed.nodes[1].data.unit.sourceCertainty = "needs_review";
    proposed.nodes[1].data.unit.reviewNote = "Confirm the assignment.";
    return proposed;
  };
  const validate = (proposed, checksums = ["a".repeat(64)]) =>
    validateSourceRecheckProposal({ current, proposed, reviewedSourceChecksums: checksums });

  const moved = proposal();
  moved.nodes[1].position.x += 20;
  assert.throws(() => validate(moved), /preserve card layout/);

  const rewired = proposal();
  rewired.edges[0].source = "unit-child";
  assert.throws(() => validate(rewired), /cannot rewire/);

  const confirmed = proposal();
  confirmed.nodes[1].data.unit.sourceCertainty = "confirmed";
  assert.throws(() => validate(confirmed), /not placed in the Source review queue/);

  assert.throws(() => validate(proposal(), ["b".repeat(64)]), /exact sourceChecksums/);
});

test("source recheck writes a private selected-chart rollback package", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orgchart-source-recheck-"));
  const runtimePath = path.join(root, "mcp-runtime.json");
  const chart = chartFixture();
  const backup = {
    format: "orgchart-studio-library-backup",
    schemaVersion: 4,
    scope: "selected",
    exportedAt: "2026-08-05T13:00:00.000Z",
    chartCount: 1,
    sourceFileCount: 0,
    versionCount: 0,
    aiActivityCount: 0,
    charts: [chart],
    chartVersions: [],
    aiActivities: [],
    sourceFiles: [],
  };
  try {
    const receipt = writePrivateSourceRecheckBackup({
      backup,
      runtimePath,
      chartId: chart.id,
    });
    assert.equal(fs.existsSync(receipt.path), true);
    assert.equal(JSON.parse(fs.readFileSync(receipt.path, "utf8")).charts[0].id, chart.id);
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(receipt.path).mode & 0o077, 0);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
