import assert from "node:assert/strict";
import test from "node:test";
import {
  importTemplateCsv,
  parseCsv,
  parseImportFile,
  rowsToChart,
} from "../lib/import-org-chart";

test("CSV template parses into a valid hierarchy", () => {
  const preview = parseImportFile("template.csv", importTemplateCsv());

  assert.equal(preview.rowCount, 2);
  assert.equal(preview.nodes.length, 2);
  assert.equal(preview.edges.length, 1);
  assert.equal(preview.edges[0].source, "root-001");
  assert.deepEqual(preview.findings, []);
});

test("CSV parsing preserves commas and escaped quotes inside quoted fields", () => {
  const rows = parseCsv(
    'id,name,shortName,type,parentId,positionTitle,assignmentLabel,positionStatus,effectiveDate,publicationVisibility\nroot,"Example, Inc.",Example,laboratory,,Director,"Taylor ""T.J."" Example",filled,Current,internal\n',
  );

  assert.equal(rows[0].name, "Example, Inc.");
  assert.equal(rows[0].assignmentLabel, 'Taylor "T.J." Example');
});

test("normalized imports retain source locators, uncertainty, and planned state", () => {
  const preview = parseImportFile(
    "provenance.csv",
    [
      "id,name,shortName,type,parentId,positionTitle,assignmentLabel,positionStatus,effectiveDate,publicationVisibility,source,sourceLocator,sourceCertainty,reviewNote,planningState",
      "root,Example Organization,Example,division,,Director,Position vacant,vacant,October 1 2026,internal,Reviewed slide,Slide 2,inferred,Connector should be confirmed,planned",
    ].join("\n"),
  );

  assert.equal(preview.nodes[0].data.unit.sourceLocator, "Slide 2");
  assert.equal(preview.nodes[0].data.unit.sourceCertainty, "inferred");
  assert.equal(preview.nodes[0].data.unit.reviewNote, "Connector should be confirmed");
  assert.equal(preview.nodes[0].data.unit.planningState, "planned");
});

test("workforce roster CSV maps staff and resolves supervisor middle initials", () => {
  const preview = parseImportFile(
    "staff-roster.csv",
    [
      "Full Name,Position Title,Employment Type,Organization Name,Supervisor Full Name",
      "Morgan Example,Division Director,Employee,Example Communications Division,Avery Example",
      "Riley Example,Group Leader,Employee,Example Digital Communications Group,Morgan R. Example",
      "Casey Example,Communications Specialist,Employee,Example Digital Communications Group,Riley N. Example",
    ].join("\n"),
  );

  assert.equal(preview.rowCount, 3);
  assert.equal(preview.edges.length, 2);
  assert.equal(preview.nodes[0].data.unit.type, "division");
  assert.equal(preview.nodes[1].data.unit.type, "group");
  assert.equal(
    preview.nodes[2].data.unit.assignmentLabel,
    "Example Digital Communications Group",
  );
  assert.equal(preview.edges[0].source, preview.nodes[0].id);
  assert.equal(preview.edges[1].source, preview.nodes[1].id);
  assert.equal(
    preview.findings.some((finding) => finding.code === "WORKFORCE_ROSTER_MAPPED"),
    true,
  );
  assert.equal(
    preview.findings.some((finding) => finding.severity === "blocking"),
    false,
  );
});

test("blocking findings prevent empty, duplicate, and missing-parent imports", () => {
  assert.ok(
    rowsToChart([]).findings.some((finding) => finding.code === "EMPTY_IMPORT"),
  );

  const preview = parseImportFile(
    "invalid.csv",
    "id,name,shortName,type,parentId,positionTitle,assignmentLabel,positionStatus,effectiveDate,publicationVisibility\nunit-1,One,One,division,not-present,Director,Vacant,vacant,Current,internal\nunit-1,Two,Two,group,unit-1,Leader,Vacant,vacant,Current,internal\n",
  );

  assert.ok(preview.findings.some((finding) => finding.code === "DUPLICATE_ID"));
  assert.ok(preview.findings.some((finding) => finding.code === "MISSING_PARENT"));
  assert.ok(preview.findings.every((finding) => finding.severity === "blocking"));
});

test("a downloaded source manifest can be imported as canonical rows", () => {
  const manifest = {
    chartId: "chart-example",
    canonicalData: {
      units: [
        {
          id: "root",
          name: "Example Organization",
          shortName: "Example",
          type: "laboratory",
          positionTitle: "Director",
          assignmentLabel: "Position vacant",
          positionStatus: "vacant",
          effectiveDate: "Current",
          publicationVisibility: "internal",
        },
        {
          id: "child",
          name: "Example Division",
          shortName: "Division",
          type: "division",
          positionTitle: "Division Director",
          assignmentLabel: "Position vacant",
          positionStatus: "vacant",
          effectiveDate: "Current",
          publicationVisibility: "internal",
        },
      ],
      relationships: [
        { id: "edge-root-child", source: "root", target: "child" },
      ],
    },
  };

  const preview = parseImportFile("source-manifest.json", JSON.stringify(manifest));

  assert.equal(preview.nodes.length, 2);
  assert.equal(preview.edges.length, 1);
  assert.deepEqual(preview.findings, []);
});

test("canonical JSON rejects multiple primary parents", () => {
  const unit = (id: string) => ({
    id,
    type: "orgUnit",
    position: { x: 0, y: 0 },
    data: {
      pinned: false,
      unit: {
        id,
        name: id,
        shortName: id,
        type: "group",
        positionTitle: "Leader",
        assignmentLabel: "Position vacant",
        positionStatus: "vacant",
        effectiveDate: "Current",
        source: "Test",
        publicationVisibility: "internal",
      },
    },
  });
  const preview = parseImportFile(
    "canonical.json",
    JSON.stringify({
      nodes: [unit("one"), unit("two"), unit("child")],
      edges: [
        { id: "one-child", source: "one", target: "child" },
        { id: "two-child", source: "two", target: "child" },
      ],
    }),
  );

  assert.ok(
    preview.findings.some((finding) => finding.code === "MULTIPLE_PRIMARY_PARENTS"),
  );
});

test("imports section, team, program, office, project, and configured-other unit levels", () => {
  const rows = [
    "id,name,shortName,type,parentId,positionTitle,assignmentLabel,positionStatus,effectiveDate,publicationVisibility",
    "root,Example Organization,Example,laboratory,,Director,Position vacant,vacant,Current,internal",
    "section,Example Section,Section,section,root,Section Head,Position vacant,vacant,Current,internal",
    "team,Example Team,Team,team,section,Team Lead,Position vacant,vacant,Current,internal",
    "program,Example Program,Program,program,team,Program Manager,Position vacant,vacant,Current,internal",
    "office,Example Office,Office,office,program,Office Director,Position vacant,vacant,Current,internal",
    "project,Example Project,Project,project,office,Project Lead,Position vacant,vacant,Current,internal",
    "other,Configured Unit,Configured,other,project,Unit Lead,Position vacant,vacant,Current,internal",
  ].join("\n");
  const preview = parseImportFile("levels.csv", rows);

  assert.deepEqual(preview.findings, []);
  assert.equal(preview.nodes.at(-1)?.data.unit.type, "other");
});
