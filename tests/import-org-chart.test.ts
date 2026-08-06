import assert from "node:assert/strict";
import test from "node:test";
import {
  aiIntakeBrief,
  importTemplateCsv,
  parseCsv,
  parseImportFile,
  rowsToChart,
} from "../lib/import-org-chart";

test("AI normalization brief separates filled staff cards from portfolio labels", () => {
  const brief = aiIntakeBrief();

  assert.match(brief, /split them into assignmentLabel and positionTitle/);
  assert.match(brief, /Do not store a visible person as a vacant organizational unit/);
  assert.match(brief, /client portfolios, coverage areas, specialties, and service lists/);
  assert.match(brief, /normally represents siblings under the same parent/);
  assert.match(brief, /semantic mapping is supported by the source/);
});

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

test("blank certainty enters review and relationship provenance stays independent", () => {
  const preview = parseImportFile(
    "review-defaults.csv",
    [
      "id,name,shortName,type,parentId,positionTitle,assignmentLabel,positionStatus,effectiveDate,publicationVisibility,source,sourceLocator,sourceCertainty,reviewNote,planningState,relationshipType,relationshipSourceLocator,relationshipSourceCertainty,relationshipReviewNote",
      "root,Example Division,Example Division,division,,Director,Alex Example,filled,Current,internal,Slide deck,Slide 1 shape 2,confirmed,,current,,,,",
      "child,Example Group,Example Group,group,root,Group Leader,Jordan Example,filled,Current,internal,Slide deck,Slide 1 shape 5,,,,primary supervisory,Slide 1 connector 7,inferred,Confirm connector endpoint",
    ].join("\n"),
  );

  assert.equal(preview.nodes[0].data.unit.sourceCertainty, "confirmed");
  assert.equal(preview.nodes[1].data.unit.sourceCertainty, "needs_review");
  assert.equal(preview.edges[0].data?.sourceCertainty, "inferred");
  assert.equal(preview.edges[0].data?.sourceLocator, "Slide 1 connector 7");
  assert.equal(preview.edges[0].data?.reviewNote, "Confirm connector endpoint");
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
  assert.ok(preview.findings.some((finding) => finding.severity === "blocking"));
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
  assert.equal(preview.nodes[0].data.unit.sourceCertainty, "needs_review");
  assert.equal(preview.edges[0].data?.sourceCertainty, "needs_review");
  assert.ok(preview.findings.some((finding) => finding.code === "SOURCE_CERTAINTY_REQUIRED"));
  assert.ok(preview.findings.some((finding) => finding.code === "RELATIONSHIP_CERTAINTY_REQUIRED"));
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
  assert.equal(preview.nodes[0].data.unit.sourceCertainty, "needs_review");
  assert.equal(preview.edges[0].data?.sourceCertainty, "needs_review");
  assert.ok(preview.findings.some((finding) => finding.code === "SOURCE_CERTAINTY_REQUIRED"));
  assert.ok(
    preview.findings.some((finding) => finding.code === "RELATIONSHIP_CERTAINTY_REQUIRED"),
  );
});

test("canonical JSON rejects malformed records without throwing", () => {
  const malformedNode = parseImportFile(
    "bad-node.json",
    JSON.stringify({ nodes: [null], edges: [] }),
  );
  const malformedRelationship = parseImportFile(
    "bad-edge.json",
    JSON.stringify({
      nodes: [
        {
          id: "root",
          type: "orgUnit",
          position: { x: 0, y: 0 },
          data: { unit: { id: "root", name: "Root", type: "division" } },
        },
      ],
      edges: [{ id: "missing-target", source: "root" }],
    }),
  );

  assert.ok(malformedNode.findings.some((finding) => finding.code === "MALFORMED_NODE"));
  assert.ok(
    malformedRelationship.findings.some(
      (finding) => finding.code === "MALFORMED_RELATIONSHIP",
    ),
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

  assert.equal(preview.findings.some((finding) => finding.severity === "blocking"), false);
  assert.ok(preview.findings.some((finding) => finding.code === "SUSPICIOUS_LINEAR_CHAIN"));
  assert.equal(preview.nodes.at(-1)?.data.unit.type, "other");
});

test("import validation warns about person-like vacancies and unsupported staff chains", () => {
  const rows = [
    "id,name,shortName,type,parentId,positionTitle,assignmentLabel,positionStatus,effectiveDate,publicationVisibility",
    "person-1,Kevin Norris,Kevin Norris,other,,Position not supplied,Position vacant,vacant,Current,internal",
    "person-2,Jordan Sample,Jordan Sample,other,person-1,Position not supplied,Position vacant,vacant,Current,internal",
    "person-3,Taylor Sample,Taylor Sample,other,person-2,Position not supplied,Position vacant,vacant,Current,internal",
    "person-4,Casey Sample,Casey Sample,other,person-3,Position not supplied,Position vacant,vacant,Current,internal",
    "person-5,Riley Sample,Riley Sample,other,person-4,Position not supplied,Position vacant,vacant,Current,internal",
    "person-6,Morgan Sample,Morgan Sample,other,person-5,Position not supplied,Position vacant,vacant,Current,internal",
  ].join("\n");
  const preview = parseImportFile("suspicious.csv", rows);

  assert.ok(preview.findings.some((finding) => finding.code === "PERSON_LOOKING_VACANCY"));
  assert.ok(preview.findings.some((finding) => finding.code === "SUSPICIOUS_LINEAR_CHAIN"));
});
