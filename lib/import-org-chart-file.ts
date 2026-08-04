import { strFromU8, unzipSync } from "fflate";
import {
  importColumns,
  parseImportFile,
  rowsToChart,
  type ImportPreview,
  type ImportRow,
} from "./import-org-chart";
import { UNIT_TYPES, type UnitType, type ValidationFinding } from "./org-chart";

const MAX_UNCOMPRESSED_WORKBOOK_BYTES = 25_000_000;

const headerAliases: Record<(typeof importColumns)[number], string[]> = {
  id: ["id", "unitid", "orgunitid", "organizationid"],
  name: ["name", "unitname", "organizationalunit", "organizationname"],
  shortName: ["shortname", "displayname", "cardname", "abbreviation"],
  type: ["type", "unittype", "organizationtype", "level"],
  parentId: ["parentid", "parentunitid", "reportstoid", "reportsto", "parent"],
  positionTitle: ["positiontitle", "title", "leadershiptitle", "position"],
  assignmentLabel: ["assignmentlabel", "assignee", "leader", "person", "incumbent"],
  positionStatus: ["positionstatus", "status", "vacancystatus"],
  effectiveDate: ["effectivedate", "effective", "asofdate", "date"],
  publicationVisibility: ["publicationvisibility", "visibility", "audience"],
  source: ["source", "provenance", "sourcenote", "notes"],
  sourceLocator: ["sourcelocator", "locator", "slide", "page", "sourceref"],
  sourceCertainty: ["sourcecertainty", "certainty", "confidence", "reviewstatus"],
  reviewNote: ["reviewnote", "reviewquestion", "ambiguity", "uncertaintynote"],
  planningState: ["planningstate", "organizationstate", "orgstate", "scenario"],
};

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_match, decimal) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function normalizedHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "A";
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function textNodes(xml: string): string {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
    .map((match) => decodeXml(match[1]))
    .join("");
}

function worksheetRows(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const values: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2];
      const reference = attributes.match(/\br="([A-Z]+[0-9]+)"/i)?.[1] ?? "A1";
      const type = attributes.match(/\bt="([^"]+)"/)?.[1] ?? "n";
      const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const value =
        type === "s"
          ? (sharedStrings[Number(raw)] ?? "")
          : type === "inlineStr"
            ? textNodes(body)
            : decodeXml(raw);
      values[columnIndex(reference)] = value.trim();
    }
    rows.push(values);
  }
  return rows;
}

function firstWorksheetPath(files: Record<string, Uint8Array>): {
  path: string;
  name: string;
} {
  const workbookBytes = files["xl/workbook.xml"];
  const relationshipsBytes = files["xl/_rels/workbook.xml.rels"];
  if (!workbookBytes) {
    throw new Error("The Excel workbook is missing xl/workbook.xml.");
  }
  const workbook = strFromU8(workbookBytes);
  const firstSheet = workbook.match(/<sheet\b([^>]*)\/?\s*>/);
  const attributes = firstSheet?.[1] ?? "";
  const name = decodeXml(attributes.match(/\bname="([^"]+)"/)?.[1] ?? "Sheet 1");
  const relationshipId = attributes.match(/\br:id="([^"]+)"/)?.[1];
  let target = "worksheets/sheet1.xml";

  if (relationshipId && relationshipsBytes) {
    const relationships = strFromU8(relationshipsBytes);
    for (const match of relationships.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
      const relationshipAttributes = match[1];
      if (relationshipAttributes.match(/\bId="([^"]+)"/)?.[1] === relationshipId) {
        target = relationshipAttributes.match(/\bTarget="([^"]+)"/)?.[1] ?? target;
        break;
      }
    }
  }

  const normalizedTarget = target.startsWith("/")
    ? target.slice(1)
    : `xl/${target.replace(/^\.\//, "")}`;
  if (!files[normalizedTarget]) {
    throw new Error(`The first Excel worksheet (${name}) could not be read.`);
  }
  return { path: normalizedTarget, name };
}

function slugId(value: string, index: number, used: Set<string>): string {
  const base =
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `unit-${index + 1}`;
  let candidate = base.startsWith("unit-") ? base : `unit-${base}`;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function normalizeWorkbookRows(matrix: string[][]): {
  rows: ImportRow[];
  findings: ValidationFinding[];
} {
  const findings: ValidationFinding[] = [];
  const headerRowIndex = matrix.findIndex((row) => row.some((value) => value?.trim()));
  if (headerRowIndex < 0) return { rows: [], findings };
  const headers = matrix[headerRowIndex].map(normalizedHeader);
  const columnByField = new Map<string, number>();
  importColumns.forEach((field) => {
    const aliases = headerAliases[field];
    const index = headers.findIndex((header) => aliases.includes(header));
    if (index >= 0) columnByField.set(field, index);
  });

  if (!columnByField.has("name")) {
    findings.push({
      code: "EXCEL_NAME_COLUMN_REQUIRED",
      severity: "blocking",
      message: "The Excel worksheet needs a unit-name column such as name or unitName.",
    });
    return { rows: [], findings };
  }

  const usedIds = new Set<string>();
  let generatedIds = 0;
  const rows = matrix
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((value) => value?.trim()))
    .map((values, index) => {
      const read = (field: (typeof importColumns)[number]) => {
        const column = columnByField.get(field);
        return column === undefined ? "" : String(values[column] ?? "").trim();
      };
      const name = read("name");
      let id = read("id");
      if (!id) {
        id = slugId(name, index, usedIds);
        generatedIds += 1;
      } else if (usedIds.has(id)) {
        id = slugId(id, index, usedIds);
      } else {
        usedIds.add(id);
      }
      const rawType = read("type").toLowerCase();
      const inferredType = /laboratory|lab$/.test(name.toLowerCase())
        ? "laboratory"
        : /directorate/.test(name.toLowerCase())
          ? "directorate"
          : /division/.test(name.toLowerCase())
            ? "division"
            : /section/.test(name.toLowerCase())
              ? "section"
              : /team/.test(name.toLowerCase())
                ? "team"
                : /program/.test(name.toLowerCase())
                  ? "program"
                  : /office/.test(name.toLowerCase())
                    ? "office"
                    : /project/.test(name.toLowerCase())
                      ? "project"
                      : "group";
      const statusValue = read("positionStatus").toLowerCase();
      const assignmentLabel = read("assignmentLabel");
      return {
        id,
        name,
        shortName: read("shortName") || name,
        type: UNIT_TYPES.includes(rawType as UnitType)
          ? rawType
          : inferredType,
        parentId: read("parentId"),
        positionTitle: read("positionTitle"),
        assignmentLabel,
        positionStatus: ["filled", "acting", "vacant"].includes(statusValue)
          ? statusValue
          : /vacant/i.test(assignmentLabel)
            ? "vacant"
            : assignmentLabel
              ? "filled"
              : "vacant",
        effectiveDate: read("effectiveDate"),
        publicationVisibility:
          read("publicationVisibility").toLowerCase() === "public"
            ? "public"
            : "internal",
        source: read("source"),
      } as ImportRow;
    });

  const idsByName = new Map<string, string[]>();
  rows.forEach((row) => {
    [row.name, row.shortName].forEach((name) => {
      const key = normalizedHeader(name);
      idsByName.set(key, [...(idsByName.get(key) ?? []), row.id]);
    });
  });
  rows.forEach((row) => {
    if (!row.parentId || usedIds.has(row.parentId)) return;
    const matches = [...new Set(idsByName.get(normalizedHeader(row.parentId)) ?? [])];
    if (matches.length === 1) row.parentId = matches[0];
  });

  if (generatedIds) {
    findings.push({
      code: "GENERATED_STABLE_IDS",
      severity: "warning",
      message: `${generatedIds} unit identifiers were generated from names. Review and preserve them for future imports.`,
    });
  }
  if (!columnByField.has("parentId")) {
    findings.push({
      code: "EXCEL_PARENT_COLUMN_REQUIRED",
      severity: "blocking",
      message: "The Excel worksheet needs a parentId, reportsTo, or parent column.",
    });
  }
  return { rows, findings };
}

export function parseXlsxImport(bytes: Uint8Array): ImportPreview & {
  worksheetName: string;
} {
  let uncompressedBytes = 0;
  const files = unzipSync(bytes, {
    filter(file) {
      uncompressedBytes += file.originalSize;
      if (uncompressedBytes > MAX_UNCOMPRESSED_WORKBOOK_BYTES) {
        throw new Error("The expanded Excel workbook exceeds the 25 MB safety limit.");
      }
      return (
        file.name === "xl/workbook.xml" ||
        file.name === "xl/_rels/workbook.xml.rels" ||
        file.name === "xl/sharedStrings.xml" ||
        file.name.startsWith("xl/worksheets/")
      );
    },
  });
  const sharedStrings = files["xl/sharedStrings.xml"]
    ? [...strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(
        (match) => textNodes(match[1]),
      )
    : [];
  const worksheet = firstWorksheetPath(files);
  const matrix = worksheetRows(strFromU8(files[worksheet.path]), sharedStrings);
  const normalized = normalizeWorkbookRows(matrix);
  const preview = rowsToChart(normalized.rows);
  return {
    ...preview,
    findings: [...normalized.findings, ...preview.findings],
    worksheetName: worksheet.name,
  };
}

export function parseImportBytes(fileName: string, bytes: Uint8Array): ImportPreview {
  if (fileName.toLowerCase().endsWith(".xlsx")) return parseXlsxImport(bytes);
  return parseImportFile(fileName, new TextDecoder().decode(bytes));
}
