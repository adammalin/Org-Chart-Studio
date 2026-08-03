import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { parseXlsxImport } from "../lib/import-org-chart-file";

function inlineCell(reference: string, value: string) {
  return `<c r="${reference}" t="inlineStr"><is><t>${value}</t></is></c>`;
}

function workbookWithRows(rows: string[][]): Uint8Array {
  const rowXml = rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map((value, columnIndex) =>
            inlineCell(`${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`, value),
          )
          .join("")}</row>`,
    )
    .join("");
  return zipSync({
    "xl/workbook.xml": strToU8(
      '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Current Org" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0"?><worksheet><sheetData>${rowXml}</sheetData></worksheet>`,
    ),
  });
}

test("Excel import maps common headers, generates IDs, and resolves parent names", () => {
  const workbook = workbookWithRows([
    ["Unit Name", "Type", "Reports To", "Position", "Leader", "Status"],
    ["Example Laboratory", "laboratory", "", "Laboratory Director", "Position vacant", "vacant"],
    ["Research Directorate", "directorate", "Example Laboratory", "Director", "Sample leader", "filled"],
  ]);
  const preview = parseXlsxImport(workbook);

  assert.equal(preview.worksheetName, "Current Org");
  assert.equal(preview.rowCount, 2);
  assert.equal(preview.nodes.length, 2);
  assert.equal(preview.edges.length, 1);
  assert.equal(preview.edges[0].source, preview.nodes[0].id);
  assert.equal(preview.edges[0].target, preview.nodes[1].id);
  assert.ok(
    preview.findings.some((finding) => finding.code === "GENERATED_STABLE_IDS"),
  );
  assert.equal(
    preview.findings.some((finding) => finding.severity === "blocking"),
    false,
  );
});

test("Excel import blocks a worksheet without a recognizable name column", () => {
  const preview = parseXlsxImport(
    workbookWithRows([
      ["Unknown", "Reports To"],
      ["Example", ""],
    ]),
  );

  assert.ok(
    preview.findings.some(
      (finding) => finding.code === "EXCEL_NAME_COLUMN_REQUIRED",
    ),
  );
});
