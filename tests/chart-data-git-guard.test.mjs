import assert from "node:assert/strict";
import test from "node:test";

import {
  blockedDataPath,
  contentLooksLikeChartData,
  contentLooksLikePublicReleaseRisk,
  scanPaths,
} from "../scripts/check-no-chart-data.mjs";

test("Git guard blocks databases, runtime storage, and encrypted backup packages", () => {
  assert.equal(blockedDataPath("private/chart.sqlite"), true);
  assert.equal(blockedDataPath("private/chart.sqlite-wal"), true);
  assert.equal(blockedDataPath("backups/recovery.orgchart-backup"), true);
  assert.equal(blockedDataPath("local-worker-data/v3/d1/chart.db"), true);
  assert.equal(blockedDataPath("lib/backup-format.ts"), false);
});

test("Git guard blocks source evidence but allows the generated public guide", () => {
  assert.equal(blockedDataPath("private/legacy-chart.pptx"), true);
  assert.equal(blockedDataPath("private/roster.xlsx"), true);
  assert.equal(blockedDataPath("private/chart-photo.jpeg"), true);
  assert.equal(blockedDataPath("private/source.pdf"), true);
  assert.equal(
    blockedDataPath("output/pdf/ORNL-OrgChart-Studio-macOS-Quick-Start.pdf"),
    false,
  );
});

test("Git guard recognizes chart-shaped JSON and staff roster CSV", () => {
  assert.equal(
    contentLooksLikeChartData(
      "private/chart.json",
      JSON.stringify({
        nodes: [{ data: { unit: { assignmentLabel: "A person" } } }],
        edges: [],
      }),
    ),
    true,
  );
  assert.equal(
    contentLooksLikeChartData(
      "private/roster.csv",
      "id,name,parentId,positionTitle,assignmentLabel\n1,Example,,Director,Example Person",
    ),
    true,
  );
  assert.equal(
    contentLooksLikeChartData(
      "private/staff.tsv",
      "employee name\tsupervisor\nExample Person\tExample Supervisor",
    ),
    true,
  );
});

test("Git guard allows source configuration and synthetic test fixtures", () => {
  assert.equal(
    contentLooksLikeChartData(
      "package.json",
      JSON.stringify({ scripts: { test: "node --test" } }),
    ),
    false,
  );
  assert.equal(
    contentLooksLikeChartData(
      "tests/fixtures/sample-import.csv",
      "id,name,parentId,positionTitle,assignmentLabel\nfixture,Fixture,,Role,Synthetic",
    ),
    false,
  );
  assert.equal(
    contentLooksLikeChartData(
      "tests/fixtures/unapproved-roster.csv",
      "id,name,parentId,positionTitle,assignmentLabel\n1,Example,,Role,Synthetic",
    ),
    true,
  );
});

test("Git guard detects public-release-sensitive text", () => {
  assert.equal(
    contentLooksLikePublicReleaseRisk(
      "docs/contact.md",
      "Contact person@example.org for public support.",
    ),
    null,
  );
  assert.equal(
    contentLooksLikePublicReleaseRisk(
      "docs/contact.md",
      `Contact ${["a.person", "ornl.gov"].join("@")} for help.`,
    ),
    "ORNL email address",
  );
  assert.equal(
    contentLooksLikePublicReleaseRisk(
      "docs/path.md",
      `Open ${["", "Users", "localperson", "Desktop", "chart.csv"].join("/")}.`,
    ),
    "user-specific macOS home path",
  );
  assert.equal(
    contentLooksLikePublicReleaseRisk(
      "tests/example.ts",
      [
        "Full Name,Position Title,Employment Type,Organization Name,Supervisor Full Name",
        [
          ["Alex", "Smith"].join(" "),
          "Director",
          "Employee",
          "Example Division",
          ["Taylor", "Jones"].join(" "),
        ].join(","),
      ].join("\n"),
    ),
    "non-synthetic workforce roster embedded in source",
  );
  assert.equal(
    contentLooksLikePublicReleaseRisk(
      "tests/example.ts",
      [
        "Full Name,Position Title,Employment Type,Organization Name,Supervisor Full Name",
        "Alex Example,Director,Employee,Example Division,Taylor Example",
      ].join("\n"),
    ),
    null,
  );
});

test("Git guard reports every unsafe candidate in a scan", () => {
  const contents = new Map([
    ["private/chart.json", JSON.stringify({ nodes: [], edges: [] })],
    ["docs/notes.json", JSON.stringify({ title: "Safe documentation" })],
    [
      "docs/contact.md",
      `Contact ${["a.person", "ornl.gov"].join("@")} for help.`,
    ],
  ]);
  const findings = scanPaths(
    [
      "private/chart.json",
      "private/data.db",
      "private/source.pptx",
      "docs/notes.json",
      "docs/contact.md",
    ],
    (filePath) => contents.get(filePath) ?? "",
  );
  assert.deepEqual(
    findings.map((finding) => finding.filePath),
    [
      "private/chart.json",
      "private/data.db",
      "private/source.pptx",
      "docs/contact.md",
    ],
  );
});
