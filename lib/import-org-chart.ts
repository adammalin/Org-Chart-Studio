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
  "sourceLocator",
  "sourceCertainty",
  "reviewNote",
  "planningState",
  "relationshipType",
  "relationshipSourceLocator",
  "relationshipSourceCertainty",
  "relationshipReviewNote",
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
        rowNumber: index + 2,
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
      sourceLocator: `Workforce roster row ${row.rowNumber}`,
      sourceCertainty: "confirmed",
      reviewNote: "",
      planningState: "current",
      relationshipType: "primary supervisory",
      relationshipSourceLocator: matches.length === 1 ? `Workforce roster row ${row.rowNumber}; Supervisor Full Name` : "",
      relationshipSourceCertainty: matches.length === 1 ? "confirmed" : "",
      relationshipReviewNote: "",
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

  const relationshipByTarget = new Map<string, Record<string, unknown>>();
  relationships.forEach((candidate) => {
    if (!candidate || typeof candidate !== "object") return;
    const relationship = candidate as Record<string, unknown>;
    const source = String(relationship.source ?? "");
    const target = String(relationship.target ?? "");
    if (source && target && !relationshipByTarget.has(target)) {
      relationshipByTarget.set(target, relationship);
    }
  });

  return units.map((candidate) => {
    const unit = (candidate ?? {}) as Record<string, unknown>;
    const id = String(unit.id ?? "");
    const relationship = relationshipByTarget.get(id);
    return {
      id,
      name: String(unit.name ?? ""),
      shortName: String(unit.shortName ?? ""),
      type: String(unit.type ?? ""),
      parentId: String(relationship?.source ?? ""),
      positionTitle: String(unit.positionTitle ?? ""),
      assignmentLabel: String(unit.assignmentLabel ?? ""),
      positionStatus: String(unit.positionStatus ?? ""),
      effectiveDate: String(unit.effectiveDate ?? ""),
      publicationVisibility: String(unit.publicationVisibility ?? ""),
      source: String(unit.source ?? ""),
      sourceLocator: String(unit.sourceLocator ?? ""),
      sourceCertainty: String(unit.sourceCertainty ?? ""),
      reviewNote: String(unit.reviewNote ?? ""),
      planningState: String(unit.planningState ?? ""),
      relationshipType: String(relationship?.relationshipType ?? relationship?.type ?? ""),
      relationshipSourceLocator: String(relationship?.sourceLocator ?? ""),
      relationshipSourceCertainty: String(relationship?.sourceCertainty ?? ""),
      relationshipReviewNote: String(relationship?.reviewNote ?? ""),
    };
  });
}

const structuralNameWords = new Set([
  "administration",
  "center",
  "communications",
  "configured",
  "department",
  "directorate",
  "division",
  "engineering",
  "group",
  "laboratory",
  "management",
  "office",
  "operations",
  "organization",
  "organisation",
  "other",
  "program",
  "project",
  "research",
  "science",
  "sciences",
  "section",
  "services",
  "support",
  "systems",
  "team",
  "technology",
  "technologies",
  "unit",
]);

function looksLikePersonName(value: string): boolean {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  if (words.some((word) => structuralNameWords.has(word.toLowerCase().replace(/[^a-z]/g, "")))) {
    return false;
  }
  return words.every((word) => /^[A-Z][A-Za-z'’.-]*$/.test(word));
}

function importSafetyFindings(rows: ImportRow[]): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const missingUnitCertainty = rows.filter((row) => !row.sourceCertainty.trim()).length;
  const missingRelationshipCertainty = rows.filter(
    (row) => row.parentId && !row.relationshipSourceCertainty.trim(),
  ).length;
  const confirmedWithoutLocator = rows.filter(
    (row) =>
      row.sourceCertainty === "confirmed" && !row.sourceLocator.trim(),
  ).length;
  const confirmedRelationshipWithoutLocator = rows.filter(
    (row) =>
      row.parentId &&
      row.relationshipSourceCertainty === "confirmed" &&
      !row.relationshipSourceLocator.trim(),
  ).length;
  const personVacancies = rows.filter(
    (row) =>
      row.positionStatus === "vacant" &&
      /^(?:position\s+)?vacant$/i.test(row.assignmentLabel.trim() || "Position vacant") &&
      looksLikePersonName(row.name),
  );
  const descriptiveUnits = rows.filter(
    (row) =>
      row.positionStatus === "vacant" &&
      (!row.positionTitle.trim() || /not supplied/i.test(row.positionTitle)) &&
      /\b(portfolio|coverage|specialt(?:y|ies)|service list|client list|legend)\b/i.test(row.name),
  );
  const locatorCounts = new Map<string, number>();
  rows.forEach((row) => {
    const locator = row.sourceLocator.trim().toLowerCase();
    if (locator) locatorCounts.set(locator, (locatorCounts.get(locator) ?? 0) + 1);
  });
  const sharedLocators = [...locatorCounts.values()].filter((count) => count > 1).length;

  if (missingUnitCertainty) {
    findings.push({
      code: "SOURCE_CERTAINTY_REQUIRED",
      severity: "warning",
      message: `${missingUnitCertainty} imported unit${missingUnitCertainty === 1 ? " has" : "s have"} no explicit source certainty and will enter the Source review queue.`,
    });
  }
  if (missingRelationshipCertainty) {
    findings.push({
      code: "RELATIONSHIP_CERTAINTY_REQUIRED",
      severity: "warning",
      message: `${missingRelationshipCertainty} reporting relationship${missingRelationshipCertainty === 1 ? " has" : "s have"} no separate source certainty and will enter the Source review queue.`,
    });
  }
  if (confirmedWithoutLocator || confirmedRelationshipWithoutLocator) {
    findings.push({
      code: "CONFIRMED_WITHOUT_SOURCE_LOCATOR",
      severity: "warning",
      message: `${confirmedWithoutLocator + confirmedRelationshipWithoutLocator} confirmed record${confirmedWithoutLocator + confirmedRelationshipWithoutLocator === 1 ? " has" : "s have"} no precise source locator. Confirmed should identify the supporting slide, page, shape, or row.`,
    });
  }
  if (personVacancies.length) {
    findings.push({
      code: "PERSON_LOOKING_VACANCY",
      severity: "warning",
      message: `${personVacancies.length} vacant card${personVacancies.length === 1 ? " looks" : "s look"} like a person name. Verify that visible people were split into assignmentLabel and positionTitle instead of imported as vacancies.`,
    });
  }
  if (descriptiveUnits.length) {
    findings.push({
      code: "DESCRIPTIVE_LABEL_AS_UNIT",
      severity: "warning",
      message: `${descriptiveUnits.length} possible portfolio, coverage, specialty, or legend label${descriptiveUnits.length === 1 ? " was" : "s were"} imported as organizational units. Verify that each has an explicit reporting connector.`,
    });
  }
  if (sharedLocators) {
    findings.push({
      code: "SHARED_SOURCE_LOCATOR",
      severity: "warning",
      message: `${sharedLocators} source locator${sharedLocators === 1 ? " is" : "s are"} reused by multiple units. Verify that a single visual shape was not split into unsupported semantic records.`,
    });
  }

  const children = new Map<string, string[]>();
  rows.forEach((row) => {
    if (row.parentId) children.set(row.parentId, [...(children.get(row.parentId) ?? []), row.id]);
  });
  let longestLinearChain = 0;
  rows.forEach((row) => {
    let length = 1;
    let current = row.id;
    const seen = new Set<string>();
    while ((children.get(current)?.length ?? 0) === 1 && !seen.has(current)) {
      seen.add(current);
      current = children.get(current)![0];
      length += 1;
    }
    longestLinearChain = Math.max(longestLinearChain, length);
  });
  if (longestLinearChain >= 6 && longestLinearChain >= Math.ceil(rows.length * 0.6)) {
    findings.push({
      code: "SUSPICIOUS_LINEAR_CHAIN",
      severity: "warning",
      message: `${longestLinearChain} of ${rows.length} records form one reporting chain. Verify that neighboring staff cards connected to a shared line were not interpreted as parent-to-child in reading order.`,
    });
  }

  return findings;
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
    if (
      row.sourceCertainty &&
      !["confirmed", "inferred", "needs_review"].includes(row.sourceCertainty)
    ) {
      findings.push({
        code: "INVALID_SOURCE_CERTAINTY",
        severity: "blocking",
        message: `Row ${rowNumber} has unsupported sourceCertainty ${row.sourceCertainty}.`,
      });
    }
    if (row.planningState && !["current", "planned"].includes(row.planningState)) {
      findings.push({
        code: "INVALID_PLANNING_STATE",
        severity: "blocking",
        message: `Row ${rowNumber} has unsupported planningState ${row.planningState}.`,
      });
    }
    if (
      row.relationshipSourceCertainty &&
      !["confirmed", "inferred", "needs_review"].includes(row.relationshipSourceCertainty)
    ) {
      findings.push({
        code: "INVALID_RELATIONSHIP_SOURCE_CERTAINTY",
        severity: "blocking",
        message: `Row ${rowNumber} has unsupported relationshipSourceCertainty ${row.relationshipSourceCertainty}.`,
      });
    }
    if (
      row.relationshipType &&
      !["primary supervisory", "secondary supervisory"].includes(row.relationshipType)
    ) {
      findings.push({
        code: "INVALID_RELATIONSHIP_TYPE",
        severity: "blocking",
        message: `Row ${rowNumber} has unsupported relationshipType ${row.relationshipType}.`,
      });
    }
  });

  findings.push(...importSafetyFindings(rows));

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
          sourceLocator: row.sourceLocator,
          sourceCertainty:
            row.sourceCertainty === "confirmed" || row.sourceCertainty === "inferred"
              ? row.sourceCertainty
              : "needs_review",
          reviewNote:
            row.reviewNote || (!row.sourceCertainty ? "Source certainty was not supplied during import." : ""),
          planningState: row.planningState === "planned" ? "planned" : "current",
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
      data: {
        relationshipType:
          row.relationshipType === "secondary supervisory"
            ? "secondary supervisory"
            : "primary supervisory",
        sourceLocator: row.relationshipSourceLocator,
        sourceCertainty:
          row.relationshipSourceCertainty === "confirmed" ||
          row.relationshipSourceCertainty === "inferred"
            ? row.relationshipSourceCertainty
            : "needs_review",
        reviewNote:
          row.relationshipReviewNote ||
          (!row.relationshipSourceCertainty
            ? "Reporting-line certainty was not supplied during import."
            : ""),
      },
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
      const hasMalformedNode = chart.nodes.some(
        (node) =>
          !node ||
          typeof node.id !== "string" ||
          !node.id ||
          !node.data?.unit ||
          typeof node.data.unit.name !== "string" ||
          typeof node.data.unit.type !== "string",
      );
      if (hasMalformedNode || !chart.nodes.length) {
        return {
          nodes: [],
          edges: [],
          findings: [
            {
              code: hasMalformedNode ? "MALFORMED_NODE" : "EMPTY_IMPORT",
              severity: "blocking",
              message: hasMalformedNode
                ? "Every canonical node requires an id and a complete unit record."
                : "The import does not contain any organizational-unit nodes.",
            },
          ],
          rowCount: chart.nodes.length,
        };
      }
      const hasMalformedEdge = chart.edges.some(
        (edge) =>
          !edge ||
          typeof edge.id !== "string" ||
          !edge.id ||
          typeof edge.source !== "string" ||
          !edge.source ||
          typeof edge.target !== "string" ||
          !edge.target,
      );
      if (hasMalformedEdge) {
        return {
          nodes: [],
          edges: [],
          findings: [
            {
              code: "MALFORMED_RELATIONSHIP",
              severity: "blocking",
              message: "Every canonical relationship requires an id, source, and target.",
            },
          ],
          rowCount: chart.nodes.length,
        };
      }
      const canonical = {
        nodes: chart.nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            unit: {
              ...node.data?.unit,
              sourceCertainty: node.data?.unit?.sourceCertainty ?? "needs_review",
              reviewNote:
                node.data?.unit?.reviewNote ??
                (node.data?.unit?.sourceCertainty
                  ? ""
                  : "Source certainty was not supplied during canonical import."),
            },
          },
        })) as OrgFlowNode[],
        edges: chart.edges.map((edge) => ({
          ...edge,
          data: {
            ...edge.data,
            sourceCertainty: edge.data?.sourceCertainty ?? "needs_review",
            reviewNote:
              edge.data?.reviewNote ??
              (edge.data?.sourceCertainty
                ? ""
                : "Reporting-line certainty was not supplied during canonical import."),
          },
        })) as Edge[],
      };
      const nodeIds = canonical.nodes.map((node) => node.id);
      const duplicateIds = nodeIds.filter((id, index) => nodeIds.indexOf(id) !== index);
      const parentCounts = new Map<string, number>();
      canonical.edges.forEach((edge) => {
        parentCounts.set(edge.target, (parentCounts.get(edge.target) ?? 0) + 1);
      });
      const findings = validateHierarchy(canonical.nodes, canonical.edges);
      const incomingRelationship = new Map(
        chart.edges.map((edge) => [edge.target, edge] as const),
      );
      findings.push(
        ...importSafetyFindings(
          chart.nodes.map((node) => {
            const relationship = incomingRelationship.get(node.id);
            return {
              id: node.id,
              name: String(node.data.unit.name ?? ""),
              shortName: String(node.data.unit.shortName ?? ""),
              type: String(node.data.unit.type ?? ""),
              parentId: String(relationship?.source ?? ""),
              positionTitle: String(node.data.unit.positionTitle ?? ""),
              assignmentLabel: String(node.data.unit.assignmentLabel ?? ""),
              positionStatus: String(node.data.unit.positionStatus ?? ""),
              effectiveDate: String(node.data.unit.effectiveDate ?? ""),
              publicationVisibility: String(node.data.unit.publicationVisibility ?? ""),
              source: String(node.data.unit.source ?? ""),
              sourceLocator: String(node.data.unit.sourceLocator ?? ""),
              sourceCertainty: String(node.data.unit.sourceCertainty ?? ""),
              reviewNote: String(node.data.unit.reviewNote ?? ""),
              planningState: String(node.data.unit.planningState ?? ""),
              relationshipType: String(relationship?.data?.relationshipType ?? ""),
              relationshipSourceLocator: String(relationship?.data?.sourceLocator ?? ""),
              relationshipSourceCertainty: String(
                relationship?.data?.sourceCertainty ?? "",
              ),
              relationshipReviewNote: String(relationship?.data?.reviewNote ?? ""),
            };
          }),
        ),
      );
      canonical.nodes.forEach((node) => {
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
        if (
          !["confirmed", "inferred", "needs_review"].includes(
            node.data.unit.sourceCertainty ?? "",
          )
        ) {
          findings.push({
            code: "INVALID_SOURCE_CERTAINTY",
            severity: "blocking",
            message: `Unit ${node.id} has unsupported source certainty.`,
          });
        }
      });
      canonical.edges.forEach((edge) => {
        if (
          !["confirmed", "inferred", "needs_review"].includes(
            String(edge.data?.sourceCertainty ?? ""),
          )
        ) {
          findings.push({
            code: "INVALID_RELATIONSHIP_SOURCE_CERTAINTY",
            severity: "blocking",
            message: `Relationship ${edge.id} has unsupported source certainty.`,
          });
        }
        if (
          edge.data?.relationshipType &&
          !["primary supervisory", "secondary supervisory"].includes(
            String(edge.data.relationshipType),
          )
        ) {
          findings.push({
            code: "INVALID_RELATIONSHIP_TYPE",
            severity: "blocking",
            message: `Relationship ${edge.id} has unsupported relationship type.`,
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
        nodes: canonical.nodes,
        edges: canonical.edges,
        findings,
        rowCount: canonical.nodes.length,
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
  return `${importColumns.join(",")}\nroot-001,Example Organization,Example Organization,laboratory,,Laboratory Director,Position vacant,vacant,Current,internal,Synthetic example,Synthetic row 1,confirmed,,current,,,,\nunit-001,Example Directorate,Example Directorate,directorate,root-001,Director,Position vacant,vacant,Current,internal,Synthetic example,Synthetic row 2,confirmed,,current,primary supervisory,Synthetic row 2 connector,confirmed,\n`;
}

export function aiIntakeBrief(): string {
  return `# OrgChart Studio AI normalization brief

Use this brief only with an AI environment approved for the source material. If approval is uncertain, use synthetic or sanitized content instead.

## Task

Inspect the supplied organizational-chart PowerPoint, Word document, PDF, image, or staff roster as source evidence. Convert each organizational unit into one JSON row. Do not treat visual proximity alone as proof of a reporting relationship. Flag ambiguity for human review instead of guessing.

## Two-pass workflow

1. First, summarize what you can read and list every ambiguous connector, cropped label, duplicate name, uncertain leader assignment, and inferred unit type. Ask the human to resolve those questions. Do not label materially ambiguous content as confirmed; a review proposal may carry it as needs_review only when the human deliberately wants an unresolved draft.
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
- sourceLocator should identify the supporting slide, page, worksheet row, or other precise location when available.
- sourceCertainty must be confirmed, inferred, or needs_review. Use needs_review rather than hiding an unresolved source issue.
- reviewNote should concisely state the unresolved question or inference; otherwise leave it empty.
- planningState must be current or planned. A planned unit must have a meaningful future effectiveDate.
- relationshipType must be primary supervisory or secondary supervisory when parentId is supplied.
- relationshipSourceLocator, relationshipSourceCertainty, and relationshipReviewNote describe the reporting line separately from the card. Never copy a card's confidence onto its reporting line unless the source independently supports both.
- Keep assignmentLabel empty or use Position vacant when a person is not supplied.
- When a visual card contains a person and role, split them into assignmentLabel and positionTitle and mark the position filled or acting as supported by the source. Do not store a visible person as a vacant organizational unit.
- Treat stacked labels, shaded strips, legends, client portfolios, coverage areas, specialties, and service lists as descriptive content unless an explicit connector or source statement establishes that they are separate reporting units. Preserve descriptive content in source or reviewNote instead of inventing child units.
- A row of staff cards connected to one shared reporting line normally represents siblings under the same parent. Do not chain adjacent staff cards or their descriptive lists together because of reading order or proximity.
- sourceCertainty confirmed means the semantic mapping is supported by the source, not merely that the words were readable. A relationship inferred from relative placement must be inferred or needs_review.
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
      sourceLocator: "Synthetic example row 1",
      sourceCertainty: "confirmed",
      reviewNote: "",
      planningState: "current",
      relationshipType: "",
      relationshipSourceLocator: "",
      relationshipSourceCertainty: "",
      relationshipReviewNote: "",
    },
  ],
  null,
  2,
)}
`;
}
