import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { extractSourceFile } from "../lib/source-extraction";

function input(fileName: string, bytes: Uint8Array, contentType = "application/octet-stream") {
  return {
    id: `source-${fileName}`,
    fileName,
    contentType,
    checksum: "synthetic-checksum",
    bytes,
  };
}

test("local PowerPoint extraction preserves shape lines, geometry, and connector endpoints", () => {
  const deck = zipSync({
    "ppt/presentation.xml": strToU8(
      '<?xml version="1.0"?><p:presentation xmlns:p="p"><p:sldSz cx="12192000" cy="6858000"/></p:presentation>',
    ),
    "ppt/slides/slide1.xml": strToU8(
      '<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:sp><p:nvSpPr><p:cNvPr id="2" name="Director card"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="300" cy="400"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Example Division</a:t></a:r></a:p><a:p><a:r><a:t>Alex Example</a:t></a:r></a:p></p:txBody></p:sp><p:cxnSp><p:nvCxnSpPr><p:cNvPr id="7" name="Reporting line"/><p:cNvCxnSpPr><a:stCxn id="2" idx="1"/><a:endCxn id="5" idx="0"/></p:cNvCxnSpPr></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="200" y="400"/><a:ext cx="0" cy="600"/></a:xfrm></p:spPr></p:cxnSp></p:sld>',
    ),
  });

  const extraction = extractSourceFile(input("example.pptx", deck));
  const data = extraction.data as {
    slides: Array<{
      shapes: Array<{ id: string; lines: string[]; x: number }>;
      connectors: Array<{ id: string; startShapeId: string; endShapeId: string }>;
    }>;
  };

  assert.equal(extraction.kind, "powerpoint");
  assert.deepEqual(data.slides[0].shapes[0].lines, ["Example Division", "Alex Example"]);
  assert.equal(data.slides[0].shapes[0].x, 100);
  assert.equal(data.slides[0].connectors[0].startShapeId, "2");
  assert.equal(data.slides[0].connectors[0].endShapeId, "5");
});

test("local Word and Excel extraction returns reviewable text and rows", () => {
  const document = zipSync({
    "word/document.xml": strToU8(
      '<?xml version="1.0"?><w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Source convention</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Org number</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
    ),
  });
  const workbook = zipSync({
    "xl/workbook.xml": strToU8(
      '<?xml version="1.0"?><workbook xmlns:r="r"><sheets><sheet name="Roster" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Full Name</t></is></c><c r="B1" t="inlineStr"><is><t>Supervisor Full Name</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Alex Example</t></is></c><c r="B2" t="inlineStr"><is><t>Jordan Example</t></is></c></row></sheetData></worksheet>',
    ),
  });

  const word = extractSourceFile(input("notes.docx", document));
  const excel = extractSourceFile(input("roster.xlsx", workbook));

  assert.deepEqual((word.data as { paragraphs: string[] }).paragraphs.slice(0, 2), [
    "Source convention",
    "Org number",
  ]);
  assert.equal((excel.data as { worksheetName: string }).worksheetName, "Roster");
  assert.deepEqual((excel.data as { rows: string[][] }).rows[1], [
    "Alex Example",
    "Jordan Example",
  ]);
});

test("local CSV and PDF extraction returns text without returning source bytes", () => {
  const csv = extractSourceFile(
    input("roster.csv", strToU8("Full Name,Title\nAlex Example,Director\n"), "text/csv"),
  );
  const pdf = extractSourceFile(
    input("chart.pdf", strToU8("%PDF-1.4\nBT (Example Division) Tj (Alex Example) Tj ET\n%%EOF"), "application/pdf"),
  );

  assert.match((csv.data as { text: string }).text, /Alex Example/);
  assert.match((pdf.data as { text: string }).text, /Example Division/);
  assert.doesNotMatch(JSON.stringify([csv, pdf]), /dataBase64|sourceBytes/);
});

test("image extraction stays metadata-only when local OCR is unavailable", () => {
  const extraction = extractSourceFile(
    input("chart.png", new Uint8Array([137, 80, 78, 71]), "image/png"),
  );

  assert.equal(extraction.kind, "image");
  assert.match(extraction.warnings[0], /does not perform OCR/);
});
