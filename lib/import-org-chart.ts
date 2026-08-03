import type { Edge } from "@xyflow/react";
import {
  UNIT_TYPES,
  validateHierarchy,
  type OrgFlowNode,
  type PositionStatus,
  type UnitType,
  type ValidationFinding,
} from "./org-chart";

export const importColumns = [
  "id",
  "name",
  "shortName",
  "type",
  "parentId",
  "positionTitle",
  "assignmentLabel",
  "positionStatus",
  "effectiveDate",
  "publicationVisibility",
  "source",
] as const;

export type ImportRow = Record<(typeof importColumns)[number], string>;

export interface ImportPreview {
  nodes: OrgFlowNode[];
  edges: Edge[];
  findings: ValidationFinding[];
  rowCount: number;
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(field.trim());
      field = "";
    } else {
      field += character;
    }
  }

  fields.push(field.trim());
  return fields;
}

function normalizedHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stablePersonId(value: string, index: number, used: Set<string>): string {
  const stem =
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `person-${index + 1}`;
  const base = stem.startsWith("unit-") ? stem : `unit-${stem}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function personNameKey(value: string): string {
  const parts = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const withoutMiddleInitials = parts.filter(
    (part, index) => part.length > 1 || index === 0 || index === parts.length - 1,
  );
  return withoutMiddleInitials.join("");
}

function inferredRosterType(positionTitle: string): UnitType {
  const value = positionTitle.toLowerCase();
  if (/division director/.test(value)) return "division";
  if (/group leader/.test(value)) return "group";
  if (/team lead|\blead\b/.test(value)) return "team";
  return "other";
}

function parseCsvMatrix(text: string): string[][] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map(splitCsvLine);
}

function workforceRosterRows(matrix: string[][]): {
  rows: ImportRow[];
  findings: ValidationFinding[];
} | null {
  if (!matrix.length) return null;
  const headers = matrix[0].map(normalizedHeader);
  const column = (...aliases: string[]) =>
    headers.findIndex((header) => aliases.includes(header));
  const fullNameColumn = column("fullname", "employeefullname", "employeename");
  const titleColumn = column("positiontitle", "jobtitle", "title");
  const supervisorColumn = column(
    "supervisorfullname",
    "supervisorname",
    "managerfullname",
    "managername",
  );
  if (fullNameColumn < 0 || titleColumn < 0 || supervisorColumn < 0) return null;

  const organizationColumn = column(
    "organizationname",
    "organisationname",
    "departmentname",
    "orgname",
  );
  const employmentTypeColumn = column("employmenttype", "workertype", "employeetype");
  const usedIds = new Set<string>();
  const rawRows = matrix
    .slice(1)
    .filter((values) => values.some((value) => value.trim()))
    .map((values, index) => {
      const fullName = String(values[fullNameColumn] ?? "").trim();
      const positionTitle = String(values[titleColumn] ?? "").trim();
      const supervisorName = String(values[supervisorColumn] ?? "").trim();
      const organizationName =
        organizationColumn >= 0 ? String(values[organizationColumn] ?? "").trim() : "";
      const employmentType =
        employmentTypeColumn >= 0
          ? String(values[employmentTypeColumn] ?? "").trim()
          : "";
      return {
        id: stablePersonId(fullName, index, usedIds),
        fullName,
        positionTitle,
        supervisorName,
        organizationName,
        employmentType,
      };
    });

  const idsByPersonName = new Map<string, string[]>();
  rawRows.forEach((row) => {
    const key = personNameKey(row.fullName);
    idsByPersonName.set(key, [...(idsByPersonName.get(key) ?? []), row.id]);
  });

  let externalSupervisorCount = 0;
  let ambiguousSupervisorCount = 0;
  const rows = rawRows.map((row) => {
    const matches = row.supervisorName
      ? [...new Set(idsByPersonName.get(personNameKey(row.supervisorName)) ?? [])]
      : [];
    if (row.supervisorName && matches.length === 0) externalSupervisorCount += 1;
    if (matches.length > 1) ambiguousSupervisorCount += 1;
    const assignmentParts = [row.organizationName];
    if (row.employmentType && !/^employee$/i.test(row.employmentType)) {
      assignmentParts.push(row.employmentType);
    }
    return {
      id: row.id,
      name: row.fullName,
      shortName: row.fullName,
      type: inferredRosterType(row.positionTitle),
      parentId: matches.length === 1 ? matches[0] : "",
      positionTitle: row.positionTitle,
      assignmentLabel: assignmentParts.filter(Boolean).join(" · ") || row.fullName,
      positionStatus: "filled",
      effectiveDate: "Current",
      publicationVisibility: "internal",
      source: [
        row.organizationName ? `Roster organization: ${row.organizationName}` : "",
        row.employmentType ? `Employment type: ${row.employmentType}` : "",
        row.supervisorName ? `Roster supervisor: ${row.supervisorName}` : "",
      ]
        .filter(Boolean)
        .join("; "),
    } satisfies ImportRow;
  });

  const findings: ValidationFinding[] = [
    {
      code: "WORKFORCE_ROSTER_MAPPED",
      severity: "warning",
      message: `${rows.length} staff records were mapped into a supervisory hierarchy from Full Name and Supervisor Full Name columns.`,
    },
    {
      code: "GENERATED_STABLE_IDS",
      severity: "warning",
      message: `${rows.length} stable identifiers were generated from staff names. Preserve them in future normalized exports.`,
    },
  ];
  if (externalSupervisorCount) {
    findings.push({
      code: "EXTERNAL_SUPERVISOR_ROOT",
      severity: "warning",
      message: `${externalSupervisorCount} record${externalSupervisorCount === 1 ? " reports" : "s report"} outside this roster and ${externalSupervisorCount === 1 ? "was" : "were"} treated as a hierarchy root${externalSupervisorCount === 1 ? "" : "s"}.`,
    });
  }
  if (ambiguousSupervisorCount) {
    findings.push({
      code: "AMBIGUOUS_SUPERVISOR_NAME",
      severity: "blocking",
      message: `${ambiguousSupervisorCount} supervisor name${ambiguousSupervisorCount === 1 ? "" : "s"} matched more than one staff record. Add stable IDs before importing.`,
    });
  }
  return { rows, findings };
}

function parseCsvWithFindings(text: string): {
  rows: ImportRow[];
  findings: ValidationFinding[];
} {
  const matrix = parseCsvMatrix(text);
  const roster = workforceRosterRows(matrix);
  if (roster) return roster;
  if (!matrix.length) return { rows: [], findings: [] };
  const headers = matrix[0].map((header) => header.trim());
  return {
    rows: matrix.slice(1).map((values) =>
      Object.fromEntries(
        importColumns.map((column) => [
          column,
          values[headers.indexOf(column)]?.trim() ?? "",
        ]),
      ) as ImportRow,
    ),
    findings: [],
  };
}

export function parseCsv(text: string): ImportRow[] {
  return parseCsvWithFindings(text).rows;
}

function rowsFromJson(value: unknown): ImportRow[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((candidate) => {
    const record = candidate as Record<string, unknown>;
    return Object.fromEntries(
      importColumns.map((column) => [column, String(record[column] ?? "")]),
    ) as ImportRow;
  });
}

function rowsFromSourceManifest(value: unknown): ImportRow[] | null {
  if (!value || typeof value !== "object") return null;
  const canonicalData = (value as { canonicalData?: unknown }).canonicalData;
  if (!canonicalData || typeof canonicalData !== "object") return null;

  const units = (canonicalData as { units?: unknown }).units;
  const relationships = (canonicalData as { relationships?: unknown }).relationships;
  if (!Array.isArray(units) || !Array.isArray(relationships)) return null;

  const parentByTarget = new Map<string, string>();
  relationships.forEach((candidate) => {
    if (!candidate || typeof candidate !== "object") return;
    const relationship = candidate as Record<string, unknown>;
    const source = String(relationship.source ?? "");
    const target = String(relationship.target ?? "");
    if (source && target && !parentByTarget.has(target)) parentByTarget.set(target, source);
  });

  return units.map((candidate) => {
    const unit = (candidate ?? {}) as Record<string, unknown>;
    const id = String(unit.id ?? "");
    return {
      id,
      name: String(unit.name ?? ""),
      shortName: String(unit.shortName ?? ""),
      type: String(unit.type ?? ""),
      parentId: parentByTarget.get(id) ?? "",
      positionTitle: String(unit.positionTitle ?? ""),
      assignmentLabel: String(unit.assignmentLabel ?? ""),
      positionStatus: String(unit.positionStatus ?? ""),
      effectiveDate: String(unit.effectiveDate ?? ""),
      publicationVisibility: String(unit.publicationVisibility ?? ""),
      source: String(unit.source ?? ""),
    };
  });
}

export function rowsToChart(rows: ImportRow[]): ImportPreview {
  const findings: ValidationFinding[] = [];
  const ids = new Set<string>();
  const allowedTypes = new Set<UnitType>(UNIT_TYPES);
  const allowedStatuses = new Set<PositionStatus>(["filled", "acting", "vacant"]);

  if (!rows.length) {
    findings.push({
      code: "EMPTY_IMPORT",
      severity: "blocking",
      message: "The import does not contain any organizational-unit rows.",
    });
  }

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (!row.id || !row.name || !row.type) {
      findings.push({
        code: "REQUIRED_FIELD",
        severity: "blocking",
        message: `Row ${rowNumber} requires id, name, and type.`,
      });
    }
    if (ids.has(row.id)) {
      findings.push({
        code: "DUPLICATE_ID",
        severity: "blocking",
        message: `Row ${rowNumber} repeats id ${row.id}.`,
      });
    }
    ids.add(row.id);
    if (row.type && !allowedTypes.has(row.type as UnitType)) {
      findings.push({
        code: "INVALID_UNIT_TYPE",
        severity: "blocking",
        message: `Row ${rowNumber} has unsupported type ${row.type}.`,
      });
    }
    if (row.positionStatus && !allowedStatuses.has(row.positionStatus as PositionStatus)) {
      findings.push({
        code: "INVALID_POSITION_STATUS",
        severity: "blocking",
        message: `Row ${rowNumber} has unsupported positionStatus ${row.positionStatus}.`,
      });
    }
  });

  const parentById = new Map(rows.map((row) => [row.id, row.parentId]));
  const depthById = new Map<string, number>();
  const resolveDepth = (id: string, pending = new Set<string>()): number => {
    const cached = depthById.get(id);
    if (cached !== undefined) return cached;
    if (pending.has(id)) return 0;
    const parentId = parentById.get(id);
    if (!parentId || !parentById.has(parentId)) {
      depthById.set(id, 0);
      return 0;
    }
    pending.add(id);
    const depth = resolveDepth(parentId, pending) + 1;
    pending.delete(id);
    depthById.set(id, depth);
    return depth;
  };
  rows.forEach((row) => resolveDepth(row.id));
  const indexWithinDepth = new Map<number, number>();

  const nodes: OrgFlowNode[] = rows.map((row) => {
    const depth = depthById.get(row.id) ?? 0;
    const horizontalIndex = indexWithinDepth.get(depth) ?? 0;
    indexWithinDepth.set(depth, horizontalIndex + 1);
    return {
      id: row.id,
      type: "orgUnit",
      position: {
        x: horizontalIndex * 300,
        y: depth * 190,
      },
      data: {
        pinned: false,
        unit: {
          id: row.id,
          name: row.name,
          shortName: row.shortName || row.name,
          type: (allowedTypes.has(row.type as UnitType) ? row.type : "group") as UnitType,
          positionTitle: row.positionTitle || "Position not supplied",
          assignmentLabel: row.assignmentLabel || "Position vacant",
          positionStatus: (allowedStatuses.has(row.positionStatus as PositionStatus)
            ? row.positionStatus
            : "vacant") as PositionStatus,
          effectiveDate: row.effectiveDate || "Current",
          source: row.source || "Structured import pending review",
          publicationVisibility:
            row.publicationVisibility === "public" ? "public" : "internal",
        },
      },
    };
  });
  const edges: Edge[] = rows
    .filter((row) => row.parentId)
    .map((row) => ({
      id: `edge-${row.parentId}-${row.id}`,
      source: row.parentId,
      target: row.id,
      type: "smoothstep",
      data: { relationshipType: "primary supervisory" },
    }));

  findings.push(...validateHierarchy(nodes, edges));
  rows.forEach((row, index) => {
    if (row.parentId && !ids.has(row.parentId)) {
      findings.push({
        code: "MISSING_PARENT",
        severity: "blocking",
        message: `Row ${index + 2} references missing parent ${row.parentId}.`,
      });
    }
  });

  if (rows.length && !rows.some((row) => !row.parentId)) {
    findings.push({
      code: "MISSING_ROOT",
      severity: "blocking",
      message: "At least one row must have an empty parentId to establish a root.",
    });
  }

  return { nodes, edges, findings, rowCount: rows.length };
}

export function parseImportFile(fileName: string, text: string): ImportPreview {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".csv")) {
    const parsed = parseCsvWithFindings(text);
    const preview = rowsToChart(parsed.rows);
    return { ...preview, findings: [...parsed.findings, ...preview.findings] };
  }

  if (lowerName.endsWith(".json")) {
    const parsed = JSON.parse(text) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { nodes?: unknown }).nodes) &&
      Array.isArray((parsed as { edges?: unknown }).edges)
    ) {
      const chart = parsed as { nodes: OrgFlowNode[]; edges: Edge[] };
      const malformedNode = chart.nodes.find(
        (node) =>
          !node ||
          typeof node.id !== "string" ||
          !node.id ||
          !node.data?.unit ||
          typeof node.data.unit.name !== "string" ||
          typeof node.data.unit.type !== "string",
      );
      if (malformedNode || !chart.nodes.length) {
        return {
          nodes: [],
          edges: [],
          findings: [
            {
              code: malformedNode ? "MALFORMED_NODE" : "EMPTY_IMPORT",
              severity: "blocking",
              message: malformedNode
                ? "Every canonical node requires an id and a complete unit record."
                : "The import does not contain any organizational-unit nodes.",
            },
          ],
          rowCount: chart.nodes.length,
        };
      }

      const nodeIds = chart.nodes.map((node) => node.id);
      const duplicateIds = nodeIds.filter((id, index) => nodeIds.indexOf(id) !== index);
      const parentCounts = new Map<string, number>();
      chart.edges.forEach((edge) => {
        parentCounts.set(edge.target, (parentCounts.get(edge.target) ?? 0) + 1);
      });
      const findings = validateHierarchy(chart.nodes, chart.edges);
      chart.nodes.forEach((node) => {
        if (!UNIT_TYPES.includes(node.data.unit.type as UnitType)) {
          findings.push({
            code: "INVALID_UNIT_TYPE",
            severity: "blocking",
            message: `Unit ${node.id} has unsupported type ${node.data.unit.type}.`,
          });
        }
        if (!["filled", "acting", "vacant"].includes(node.data.unit.positionStatus)) {
          findings.push({
            code: "INVALID_POSITION_STATUS",
            severity: "blocking",
            message: `Unit ${node.id} has unsupported positionStatus ${node.data.unit.positionStatus}.`,
          });
        }
        if (!["internal", "public"].includes(node.data.unit.publicationVisibility)) {
          findings.push({
            code: "INVALID_PUBLICATION_VISIBILITY",
            severity: "blocking",
            message: `Unit ${node.id} has unsupported publication visibility.`,
          });
        }
      });
      if (duplicateIds.length) {
        findings.push({
          code: "DUPLICATE_ID",
          severity: "blocking",
          message: `Canonical nodes repeat id ${duplicateIds[0]}.`,
        });
      }
      const multipleParentTarget = [...parentCounts].find(([, count]) => count > 1)?.[0];
      if (multipleParentTarget) {
        findings.push({
          code: "MULTIPLE_PRIMARY_PARENTS",
          severity: "blocking",
          message: `Unit ${multipleParentTarget} has more than one primary parent.`,
        });
      }
      return {
        nodes: chart.nodes,
        edges: chart.edges,
        findings,
        rowCount: chart.nodes.length,
      };
    }

    const rows = rowsFromJson(parsed);
    if (rows) return rowsToChart(rows);

    const manifestRows = rowsFromSourceManifest(parsed);
    if (manifestRows) return rowsToChart(manifestRows);
  }

  throw new Error(
    "Use a CSV file or a JSON file containing rows, nodes and edges, or a source manifest.",
  );
}

export function importTemplateCsv(): string {
  return `${importColumns.join(",")}\nroot-001,Example Organization,Example Organization,laboratory,,Laboratory Director,Position vacant,vacant,Current,internal\nunit-001,Example Directorate,Example Directorate,directorate,root-001,Director,Position vacant,vacant,Current,internal\n`;
}

export function aiIntakeBrief(): string {
  return `# OrgChart Studio AI normalization brief

Use this brief only with an AI environment approved for the source material. If approval is uncertain, use synthetic or sanitized content instead.

## Task

Inspect the supplied organizational-chart PowerPoint, Word document, PDF, image, or staff roster as source evidence. Convert each organizational unit into one JSON row. Do not treat visual proximity alone as proof of a reporting relationship. Flag ambiguity for human review instead of guessing.

## Two-pass workflow

1. First, summarize what you can read and list every ambiguous connector, cropped label, duplicate name, uncertain leader assignment, and inferred unit type. Ask the human to resolve those questions. Do not produce import-ready JSON while material ambiguity remains.
2. After the human confirms the mapping, produce the final normalized JSON array described below. The human will attach both this JSON and the original source in OrgChart Studio and review the validation preview before creating a draft.

## Required output

For the final pass, return one JSON array and no surrounding prose. Each object must contain exactly these string fields:

${JSON.stringify(Object.fromEntries(importColumns.map((column) => [column, ""])), null, 2)}

## Rules

- Use a stable, unique id for every unit.
- Use parentId to reference the id of the single primary parent.
- Leave parentId empty for exactly one root unit.
- type must be one of: ${UNIT_TYPES.join(", ")}.
- positionStatus must be filled, acting, or vacant.
- publicationVisibility must be internal or public; use internal when the source does not establish approval for public display.
- Keep assignmentLabel empty or use Position vacant when a person is not supplied.
- Preserve source wording. Do not invent people, titles, units, dates, or reporting relationships.
- When a staff roster supplies Full Name and Supervisor Full Name, use those columns for reporting relationships and tolerate middle-initial differences only when the match is unique.
- Treat organization numbers, matrix or home organizations, employment type, and similar source conventions as metadata that must be preserved in the source/provenance note until a dedicated canonical field is approved.
- Never create a second root or omit a required parent merely to make an ambiguous source validate. Stop and ask the human to resolve the relationship before producing final JSON.
- Keep the original source file unchanged; it will be retained as evidence beside the normalized data.

## Synthetic shape example

${JSON.stringify(
  [
    {
      id: "root-001",
      name: "Example Organization",
      shortName: "Example Organization",
      type: "laboratory",
      parentId: "",
      positionTitle: "Laboratory Director",
      assignmentLabel: "Position vacant",
      positionStatus: "vacant",
      effectiveDate: "Current",
      publicationVisibility: "internal",
      source: "Synthetic example",
    },
  ],
  null,
  2,
)}
`;
}
