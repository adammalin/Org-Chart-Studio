import { ensureSchema, getBindings } from "../../../db";
import {
  createBlankChart,
  normalizeChartLifecycle,
  normalizeChartStatus,
  RETIRED_EXAMPLE_CHART_IDS,
  storageSafeNodes,
  type ChartDocument,
  type ChartStatus,
  type ChartVersion,
  type SourceRecord,
} from "../../../lib/chart-library";
import {
  lifecycleTransitionError,
} from "../../../lib/chart-lifecycle";
import { parseImportBytes } from "../../../lib/import-org-chart-file";
import { validateHierarchy } from "../../../lib/org-chart";
import { auditChartQuality } from "../../../lib/chart-governance";
import type { ImportIntakeStatus } from "../../../lib/import-intake";

interface ChartRow {
  id: string;
  name: string;
  description: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
  payload: string;
}

interface SourceRow {
  id: string;
  chart_id: string;
  file_name: string;
  content_type: string;
  file_size: number;
  checksum: string;
  storage_key: string;
  source_type: SourceRecord["sourceType"];
  imported_at: string;
  row_count: number;
  warning_count: number;
}

interface VersionRow {
  id: string;
  chart_id: string;
  version: number;
  label: string;
  created_at: string;
  payload: string;
  restored_from_version: number | null;
}

interface IntakeRow {
  id: string;
  name: string;
  status: ImportIntakeStatus;
  created_at: string;
  updated_at: string;
  chart_id: string | null;
}

interface IntakeFileRow {
  id: string;
  intake_id: string;
  file_name: string;
  content_type: string;
  file_size: number;
  checksum: string;
  storage_key: string;
  created_at: string;
}

const chartStatuses: ChartStatus[] = ["draft", "in_review", "current", "archived"];
function validateEditableChart(chart: ChartDocument): {
  error?: string;
  findings?: ReturnType<typeof validateHierarchy>;
} {
  if (!chart.id || !chart.name?.trim()) return { error: "Chart ID and name are required." };
  if (chart.name.trim().length > 160) return { error: "Chart names are limited to 160 characters." };
  if ((chart.description ?? "").length > 2_000) {
    return { error: "Chart descriptions are limited to 2,000 characters." };
  }
  if (!chartStatuses.includes(chart.status)) return { error: "Chart status is invalid." };
  if (!Array.isArray(chart.nodes) || !Array.isArray(chart.edges)) {
    return { error: "Chart nodes and relationships are required." };
  }
  if (chart.nodes.length > 5_000 || chart.edges.length > 10_000) {
    return { error: "This human-test build is limited to 5,000 units and 10,000 relationships." };
  }
  const findings = validateHierarchy(chart.nodes, chart.edges);
  if (findings.some((finding) => finding.severity === "blocking")) {
    return { error: "Resolve blocking structural findings before saving.", findings };
  }
  return {};
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sourceFromRow(row: SourceRow): SourceRecord {
  return {
    id: row.id,
    chartId: row.chart_id,
    fileName: row.file_name,
    contentType: row.content_type,
    fileSize: row.file_size,
    checksum: row.checksum,
    storageKey: row.storage_key,
    sourceType: row.source_type,
    importedAt: row.imported_at,
    rowCount: row.row_count,
    warningCount: row.warning_count,
  };
}

function chartFromRow(row: ChartRow, sources: SourceRecord[]): ChartDocument {
  const payload = JSON.parse(row.payload) as Pick<ChartDocument, "nodes" | "edges"> & {
    lifecycle?: Partial<ChartDocument["lifecycle"]>;
  };
  const status = normalizeChartStatus(row.status);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lifecycle: normalizeChartLifecycle(
      payload.lifecycle,
      status,
      row.updated_at,
      row.version,
      row.status === "approved",
    ),
    nodes: payload.nodes,
    edges: payload.edges,
    sources,
  };
}

function versionFromRow(row: VersionRow): ChartVersion {
  const payload = JSON.parse(row.payload) as Pick<ChartVersion, "nodes" | "edges">;
  return {
    id: row.id,
    chartId: row.chart_id,
    version: row.version,
    label: row.label,
    createdAt: row.created_at,
    restoredFromVersion: row.restored_from_version,
    nodes: payload.nodes,
    edges: payload.edges,
  };
}

function chartPayload(
  chart: Pick<ChartDocument, "nodes" | "edges"> &
    Partial<Pick<ChartDocument, "lifecycle">>,
) {
  return JSON.stringify({
    nodes: storageSafeNodes(chart.nodes),
    edges: chart.edges,
    lifecycle: chart.lifecycle,
  });
}

function chartInsert(db: D1Database, chart: ChartDocument) {
  return db
    .prepare(
      `INSERT INTO charts
        (id, name, description, status, version, created_at, updated_at, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      chart.id,
      chart.name,
      chart.description,
      chart.status,
      chart.version,
      chart.createdAt,
      chart.updatedAt,
      chartPayload(chart),
    );
}

function versionInsert(
  db: D1Database,
  chart: Pick<ChartDocument, "id" | "version" | "nodes" | "edges">,
  label: string,
  createdAt: string,
  restoredFromVersion: number | null = null,
) {
  return db
    .prepare(
      `INSERT INTO chart_versions
        (id, chart_id, version, label, created_at, payload, restored_from_version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      `version-${crypto.randomUUID()}`,
      chart.id,
      chart.version,
      label,
      createdAt,
      chartPayload(chart),
      restoredFromVersion,
    );
}

async function linkAcceptedAiActivity(
  db: D1Database,
  chartId: string,
  version: ChartVersion,
) {
  await db
    .prepare(
      `UPDATE ai_activity_events
       SET version_id = ?, version_number = ?, version_label = ?
       WHERE chart_id = ? AND status = 'accepted' AND version_id IS NULL`,
    )
    .bind(version.id, version.version, version.label, chartId)
    .run();
}

function sourceInsert(db: D1Database, source: SourceRecord) {
  return db
    .prepare(
      `INSERT INTO source_records
        (id, chart_id, file_name, content_type, file_size, checksum, storage_key,
         source_type, imported_at, row_count, warning_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      source.id,
      source.chartId,
      source.fileName,
      source.contentType,
      source.fileSize,
      source.checksum,
      source.storageKey,
      source.sourceType,
      source.importedAt,
      source.rowCount,
      source.warningCount,
    );
}

async function retireBuiltInExampleCharts(db: D1Database) {
  await db.batch([
    db
      .prepare("DELETE FROM chart_versions WHERE chart_id IN (?, ?, ?)")
      .bind(...RETIRED_EXAMPLE_CHART_IDS),
    db
      .prepare("DELETE FROM source_records WHERE chart_id IN (?, ?, ?)")
      .bind(...RETIRED_EXAMPLE_CHART_IDS),
    db
      .prepare("DELETE FROM charts WHERE id IN (?, ?, ?)")
      .bind(...RETIRED_EXAMPLE_CHART_IDS),
  ]);
}

async function ensureVersionBaselines(db: D1Database) {
  const result = await db
    .prepare(
      `SELECT charts.* FROM charts
       WHERE NOT EXISTS (
         SELECT 1 FROM chart_versions WHERE chart_versions.chart_id = charts.id
       )`,
    )
    .all<ChartRow>();
  if (!result.results.length) return;
  await db.batch(
    result.results.map((row) => {
      const chart = chartFromRow(row, []);
      return versionInsert(db, chart, "Initial saved draft", row.updated_at);
    }),
  );
}

async function loadCharts(db: D1Database): Promise<ChartDocument[]> {
  const [chartResult, sourceResult] = await Promise.all([
    db.prepare("SELECT * FROM charts ORDER BY updated_at DESC").all<ChartRow>(),
    db.prepare("SELECT * FROM source_records ORDER BY imported_at DESC").all<SourceRow>(),
  ]);
  const sources = sourceResult.results.map(sourceFromRow);
  return chartResult.results.map((row) =>
    chartFromRow(
      row,
      sources.filter((source) => source.chartId === row.id),
    ),
  );
}

export async function GET(request: Request) {
  const { DB, SOURCE_FILES } = getBindings();
  await ensureSchema(DB);
  await retireBuiltInExampleCharts(DB);
  await ensureVersionBaselines(DB);
  const url = new URL(request.url);
  const chartId = url.searchParams.get("chartId");
  const sourceId = url.searchParams.get("sourceId");
  if (url.searchParams.get("resource") === "source" && sourceId) {
    const row = await DB.prepare("SELECT * FROM source_records WHERE id = ?")
      .bind(sourceId)
      .first<SourceRow>();
    if (!row || !row.storage_key) {
      return Response.json({ error: "Stored source file is unavailable." }, { status: 404 });
    }
    const object = await SOURCE_FILES.get(row.storage_key);
    if (!object) {
      return Response.json({ error: "Stored source file is unavailable." }, { status: 404 });
    }
    const bytes = await object.arrayBuffer();
    if ((await sha256Hex(bytes)) !== row.checksum) {
      return Response.json(
        { error: "Stored source file failed its integrity check." },
        { status: 409 },
      );
    }
    const asciiFileName = row.file_name.replace(/[^\x20-\x7E]|["\\]/g, "_");
    const encodedFileName = encodeURIComponent(row.file_name).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new Response(bytes, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": row.content_type || "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`,
        "X-Content-Type-Options": "nosniff",
        "X-OrgChart-Source-Checksum": row.checksum,
      },
    });
  }
  if (url.searchParams.get("resource") === "validate" && chartId) {
    const row = await DB.prepare("SELECT * FROM charts WHERE id = ?")
      .bind(chartId)
      .first<ChartRow>();
    if (!row) {
      return Response.json({ error: "Chart not found." }, { status: 404 });
    }
    const chart = chartFromRow(row, []);
    const findings = validateHierarchy(chart.nodes, chart.edges);
    return Response.json({
      chartId,
      chartVersion: chart.version,
      valid: !findings.some((finding) => finding.severity === "blocking"),
      findings,
    });
  }
  if (url.searchParams.get("resource") === "versions" && chartId) {
    const result = await DB.prepare(
      "SELECT * FROM chart_versions WHERE chart_id = ? ORDER BY version DESC",
    )
      .bind(chartId)
      .all<VersionRow>();
    return Response.json({ versions: result.results.map(versionFromRow) });
  }
  return Response.json({ charts: await loadCharts(DB) });
}

export async function POST(request: Request) {
  const { DB, SOURCE_FILES } = getBindings();
  await ensureSchema(DB);

  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    const evidenceFiles = formData
      .getAll("evidence")
      .filter((value): value is File => value instanceof File && value.size > 0);
    const chartName = String(formData.get("chartName") ?? "").trim();
    const validateOnly = formData.get("validateOnly") === "1";
    const intakeId = String(formData.get("intakeId") ?? "").trim();
    const [intake, intakeFileResult] = intakeId
      ? await Promise.all([
          DB.prepare("SELECT * FROM import_intakes WHERE id = ? AND status = 'pending'")
            .bind(intakeId)
            .first<IntakeRow>(),
          DB.prepare("SELECT * FROM import_intake_files WHERE intake_id = ? ORDER BY created_at")
            .bind(intakeId)
            .all<IntakeFileRow>(),
        ])
      : [null, { results: [] as IntakeFileRow[] }];

    if (intakeId && !intake) {
      return Response.json(
        { error: "The selected source intake is unavailable or already used." },
        { status: 409 },
      );
    }
    const intakeFiles = intakeFileResult.results;

    if (!(file instanceof File) || !chartName) {
      return Response.json(
        { error: "Choose a CSV, JSON, or Excel file and provide a chart name." },
        { status: 400 },
      );
    }
    if (chartName.length > 160) {
      return Response.json({ error: "Chart names are limited to 160 characters." }, { status: 400 });
    }
    if (file.size > 5_000_000) {
      return Response.json(
        { error: "Prototype imports are limited to 5 MB." },
        { status: 413 },
      );
    }
    if (evidenceFiles.length + intakeFiles.length > 10) {
      return Response.json(
        { error: "Attach no more than 10 source evidence files per import." },
        { status: 413 },
      );
    }
    const oversizedEvidence = evidenceFiles.find((evidence) => evidence.size > 20_000_000);
    if (oversizedEvidence) {
      return Response.json(
        { error: `Source evidence files are limited to 20 MB each (${oversizedEvidence.name}).` },
        { status: 413 },
      );
    }
    const unsupportedEvidence = evidenceFiles.find(
      (evidence) => !/\.(pptx|docx|pdf|png|jpe?g)$/i.test(evidence.name),
    );
    if (unsupportedEvidence) {
      return Response.json(
        {
          error: `Source evidence must be a PowerPoint, Word, PDF, PNG, or JPEG file (${unsupportedEvidence.name}).`,
        },
        { status: 415 },
      );
    }
    const evidenceSize =
      evidenceFiles.reduce((total, evidence) => total + evidence.size, 0) +
      intakeFiles.reduce((total, evidence) => total + evidence.file_size, 0);
    if (file.size + evidenceSize > 25_000_000) {
      return Response.json(
        { error: "The normalized data and source evidence files exceed the 25 MB intake limit." },
        { status: 413 },
      );
    }

    const fileBytes = await file.arrayBuffer();
    let preview;
    try {
      preview = parseImportBytes(file.name, new Uint8Array(fileBytes));
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "The import could not be parsed." },
        { status: 422 },
      );
    }
    const quality = auditChartQuality(preview.nodes, preview.edges);
    preview = {
      ...preview,
      findings: [...preview.findings, ...quality.findings],
    };
    if (preview.rowCount > 5_000) {
      return Response.json(
        { error: "This human-test build is limited to 5,000 units per imported chart." },
        { status: 413 },
      );
    }

    if (preview.findings.some((finding) => finding.severity === "blocking")) {
      return Response.json(
        {
          error: "Resolve blocking validation findings before creating the chart.",
          findings: preview.findings,
          rowCount: preview.rowCount,
        },
        { status: 422 },
      );
    }

    if (validateOnly) {
      return Response.json({
        preview: {
          nodes: preview.nodes,
          edges: preview.edges,
          rowCount: preview.rowCount,
          findings: preview.findings,
        },
        evidenceFileNames: [
          ...intakeFiles.map((evidence) => evidence.file_name),
          ...evidenceFiles.map((evidence) => evidence.name),
        ],
      });
    }

    const now = new Date().toISOString();
    const chartId = `chart-${crypto.randomUUID()}`;
    const sourceId = `source-${crypto.randomUUID()}`;
    const checksum = await sha256Hex(fileBytes);
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const storageKey = `chart-sources/${chartId}/${sourceId}-${safeFileName}`;
    const source: SourceRecord = {
      id: sourceId,
      chartId,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      fileSize: file.size,
      checksum,
      storageKey,
      sourceType: "structured_import",
      importedAt: now,
      rowCount: preview.rowCount,
      warningCount: preview.findings.filter((finding) => finding.severity === "warning").length,
    };
    const evidenceItems = await Promise.all(
      evidenceFiles.map(async (evidence) => {
        const bytes = await evidence.arrayBuffer();
        const checksum = await sha256Hex(bytes);
        const id = `source-${crypto.randomUUID()}`;
        const safeEvidenceName = evidence.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const sourceRecord: SourceRecord = {
          id,
          chartId,
          fileName: evidence.name,
          contentType: evidence.type || "application/octet-stream",
          fileSize: evidence.size,
          checksum,
          storageKey: `chart-sources/${chartId}/${id}-${safeEvidenceName}`,
          sourceType: "guided_extraction",
          importedAt: now,
          rowCount: 0,
          warningCount: 0,
        };
        return { bytes, source: sourceRecord };
      }),
    );
    const intakeEvidenceItems = intakeFiles.map((evidence) => {
      const sourceRecord: SourceRecord = {
        id: `source-${crypto.randomUUID()}`,
        chartId,
        fileName: evidence.file_name,
        contentType: evidence.content_type,
        fileSize: evidence.file_size,
        checksum: evidence.checksum,
        storageKey: evidence.storage_key,
        sourceType: "guided_extraction",
        importedAt: now,
        rowCount: 0,
        warningCount: 0,
      };
      return { source: sourceRecord };
    });
    const chart: ChartDocument = {
      id: chartId,
      name: chartName,
      description: `Imported from ${file.name}; pending data-owner review.`,
      status: "draft",
      version: 1,
      createdAt: now,
      updatedAt: now,
      lifecycle: normalizeChartLifecycle(null, "draft", now, 1),
      nodes: preview.nodes,
      edges: preview.edges,
      sources: [
        source,
        ...intakeEvidenceItems.map((item) => item.source),
        ...evidenceItems.map((item) => item.source),
      ],
    };

    try {
      await SOURCE_FILES.put(storageKey, fileBytes, {
        httpMetadata: { contentType: source.contentType },
        customMetadata: { chartId, sourceId, checksum },
      });
      for (const evidenceItem of evidenceItems) {
        await SOURCE_FILES.put(evidenceItem.source.storageKey, evidenceItem.bytes, {
          httpMetadata: { contentType: evidenceItem.source.contentType },
          customMetadata: {
            chartId,
            sourceId: evidenceItem.source.id,
            checksum: evidenceItem.source.checksum,
          },
        });
      }
      const statements = [
        chartInsert(DB, chart),
        versionInsert(DB, chart, `Imported from ${file.name}`, now),
        sourceInsert(DB, source),
      ];
      intakeEvidenceItems.forEach((item) => statements.push(sourceInsert(DB, item.source)));
      evidenceItems.forEach((item) => statements.push(sourceInsert(DB, item.source)));
      if (intake) {
        statements.push(
          DB.prepare(
            "UPDATE import_intakes SET status = 'imported', chart_id = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
          ).bind(chartId, now, intake.id),
        );
      }
      await DB.batch(statements);
    } catch (error) {
      await Promise.all(
        [storageKey, ...evidenceItems.map((item) => item.source.storageKey)]
          .map((key) => SOURCE_FILES.delete(key)),
      );
      throw error;
    }

    return Response.json({ chart, findings: preview.findings }, { status: 201 });
  }

  const body = (await request.json()) as {
    action?:
      | "create"
      | "duplicate"
      | "save"
      | "transition_status"
      | "snapshot"
      | "snapshot_current"
      | "restore_version"
      | "delete";
    name?: string;
    chartId?: string;
    chart?: ChartDocument;
    label?: string;
    versionId?: string;
    expectedVersion?: number;
    expectedUpdatedAt?: string;
    targetStatus?: ChartStatus;
    currentBy?: string;
    approvalNote?: string;
  };

  if (body.action === "create") {
    const name = body.name?.trim() || "Untitled chart";
    if (name.length > 160) {
      return Response.json({ error: "Chart names are limited to 160 characters." }, { status: 400 });
    }
    const chart = createBlankChart(name, `chart-${crypto.randomUUID()}`);
    await DB.batch([
      chartInsert(DB, chart),
      versionInsert(DB, chart, "Initial blank draft", chart.createdAt),
    ]);
    return Response.json({ chart }, { status: 201 });
  }

  if (body.action === "duplicate" && body.chartId) {
    const row = await DB.prepare("SELECT * FROM charts WHERE id = ?").bind(body.chartId).first<ChartRow>();
    if (!row) return Response.json({ error: "Chart not found." }, { status: 404 });
    const existing = chartFromRow(row, []);
    const now = new Date().toISOString();
    const chart: ChartDocument = {
      ...existing,
      id: `chart-${crypto.randomUUID()}`,
      name: `${existing.name} — Copy`,
      description: `Working copy of ${existing.name}.`,
      status: "draft",
      version: 1,
      createdAt: now,
      updatedAt: now,
      lifecycle: normalizeChartLifecycle(null, "draft", now, 1),
      nodes: storageSafeNodes(existing.nodes),
      sources: [],
    };
    await DB.batch([
      chartInsert(DB, chart),
      versionInsert(DB, chart, `Duplicated from ${existing.name}`, now),
    ]);
    return Response.json({ chart }, { status: 201 });
  }

  if (body.action === "transition_status" && body.chartId && body.targetStatus) {
    if (!chartStatuses.includes(body.targetStatus)) {
      return Response.json({ error: "Chart lifecycle status is invalid." }, { status: 400 });
    }
    const [row, sourceResult] = await Promise.all([
      DB.prepare("SELECT * FROM charts WHERE id = ?")
        .bind(body.chartId)
        .first<ChartRow>(),
      DB.prepare("SELECT * FROM source_records WHERE chart_id = ? ORDER BY imported_at DESC")
        .bind(body.chartId)
        .all<SourceRow>(),
    ]);
    if (!row) return Response.json({ error: "Chart not found." }, { status: 404 });
    if (body.expectedVersion !== row.version || body.expectedUpdatedAt !== row.updated_at) {
      return Response.json(
        {
          error: "The chart changed before its lifecycle status could be updated.",
          currentVersion: row.version,
          currentUpdatedAt: row.updated_at,
        },
        { status: 409 },
      );
    }
    const currentChart = chartFromRow(row, sourceResult.results.map(sourceFromRow));
    const transitionError = lifecycleTransitionError(currentChart, body.targetStatus);
    if (transitionError) {
      return Response.json({ error: transitionError }, { status: 422 });
    }
    const updatedAt = new Date().toISOString();
    if (body.targetStatus === "current") {
      const currentBy = body.currentBy?.trim().slice(0, 120) ?? "";
      if (!currentBy) {
        return Response.json(
          { error: "Record who reviewed and marked this chart Current." },
          { status: 422 },
        );
      }
      const latest = await DB.prepare(
        "SELECT MAX(version) AS version FROM chart_versions WHERE chart_id = ?",
      )
        .bind(currentChart.id)
        .first<{ version: number | null }>();
      const nextVersion = Math.max(currentChart.version, latest?.version ?? 0) + 1;
      const nextChart: ChartDocument = {
        ...currentChart,
        status: "current",
        version: nextVersion,
        updatedAt,
        lifecycle: {
          ...currentChart.lifecycle,
          statusChangedAt: updatedAt,
          lastCurrentAt: updatedAt,
          lastCurrentVersion: nextVersion,
          lastCurrentBy: currentBy,
          lastCurrentNote: body.approvalNote?.trim().slice(0, 1_000) ?? "",
        },
      };
      const update = DB.prepare(
        `UPDATE charts
         SET status = ?, version = ?, updated_at = ?, payload = ?
         WHERE id = ? AND version = ? AND updated_at = ?`,
      ).bind(
        nextChart.status,
        nextVersion,
        updatedAt,
        chartPayload(nextChart),
        nextChart.id,
        currentChart.version,
        currentChart.updatedAt,
      );
      await DB.batch([
        update,
        versionInsert(DB, nextChart, `Marked Current by ${currentBy}`, updatedAt),
      ]);
      const versionRow = await DB.prepare(
        "SELECT * FROM chart_versions WHERE chart_id = ? AND version = ?",
      )
        .bind(nextChart.id, nextVersion)
        .first<VersionRow>();
      return Response.json({
        chart: nextChart,
        version: versionRow ? versionFromRow(versionRow) : null,
      });
    }

    const nextChart: ChartDocument = {
      ...currentChart,
      status: body.targetStatus,
      updatedAt,
      lifecycle: {
        ...currentChart.lifecycle,
        statusChangedAt: updatedAt,
      },
    };
    const result = await DB.prepare(
      `UPDATE charts SET status = ?, updated_at = ?, payload = ?
       WHERE id = ? AND version = ? AND updated_at = ?`,
    )
      .bind(
        nextChart.status,
        updatedAt,
        chartPayload(nextChart),
        nextChart.id,
        currentChart.version,
        currentChart.updatedAt,
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      return Response.json(
        { error: "The chart changed before its lifecycle status could be updated." },
        { status: 409 },
      );
    }
    return Response.json({ chart: nextChart });
  }

  if (body.action === "save" && body.chart) {
    const chart = body.chart;
    const validation = validateEditableChart(chart);
    if (validation.error) {
      return Response.json(validation, { status: 422 });
    }
    const existing = await DB.prepare("SELECT * FROM charts WHERE id = ?")
      .bind(chart.id)
      .first<ChartRow>();
    if (!existing) return Response.json({ error: "Chart not found." }, { status: 404 });
    if (chart.version !== existing.version || chart.updatedAt !== existing.updated_at) {
      return Response.json(
        {
          error: "The working draft changed while this save was pending.",
          currentVersion: existing.version,
          currentUpdatedAt: existing.updated_at,
        },
        { status: 409 },
      );
    }
    const existingChart = chartFromRow(existing, []);
    if (existingChart.status === "archived") {
      return Response.json(
        { error: "Archived charts are read-only. Restore this chart as a Draft before editing." },
        { status: 423 },
      );
    }
    const incomingStatus = normalizeChartStatus(chart.status);
    const editingCurrent = existingChart.status === "current" && incomingStatus === "draft";
    if (incomingStatus !== existingChart.status && !editingCurrent) {
      return Response.json(
        { error: "Use the chart lifecycle control to change this status." },
        { status: 422 },
      );
    }
    if (existingChart.status === "current" && !editingCurrent) {
      return Response.json(
        { error: "Current charts are protected. Begin editing to return it to Draft first." },
        { status: 423 },
      );
    }
    const updatedAt = new Date().toISOString();
    const nextChart: ChartDocument = {
      ...chart,
      status: editingCurrent ? "draft" : existingChart.status,
      version: existing.version,
      updatedAt,
      lifecycle: {
        ...normalizeChartLifecycle(
          chart.lifecycle,
          editingCurrent ? "draft" : existingChart.status,
          existing.updated_at,
          existing.version,
        ),
        statusChangedAt: editingCurrent
          ? updatedAt
          : existingChart.lifecycle.statusChangedAt,
      },
      nodes: storageSafeNodes(chart.nodes),
    };
    const result = await DB.prepare(
      `UPDATE charts
       SET name = ?, description = ?, status = ?, version = ?, updated_at = ?, payload = ?
       WHERE id = ? AND updated_at = ?`,
    )
      .bind(
        nextChart.name,
        nextChart.description,
        nextChart.status,
        existing.version,
        updatedAt,
        chartPayload(nextChart),
        chart.id,
        existing.updated_at,
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      const current = await DB.prepare("SELECT version, updated_at FROM charts WHERE id = ?")
        .bind(chart.id)
        .first<{ version: number; updated_at: string }>();
      return Response.json(
        {
          error: "The working draft changed while this save was pending.",
          currentVersion: current?.version ?? existing.version,
          currentUpdatedAt: current?.updated_at ?? existing.updated_at,
        },
        { status: 409 },
      );
    }
    return Response.json({ chart: nextChart, returnedToDraft: editingCurrent });
  }

  if (body.action === "snapshot" && body.chart) {
    const chart = body.chart;
    const label = body.label?.trim().slice(0, 160) || "Saved working version";
    const existing = await DB.prepare("SELECT * FROM charts WHERE id = ?")
      .bind(chart.id)
      .first<ChartRow>();
    if (!existing) return Response.json({ error: "Chart not found." }, { status: 404 });
    const existingChart = chartFromRow(existing, []);
    if (existingChart.status === "current" || existingChart.status === "archived") {
      return Response.json(
        {
          error: existingChart.status === "current"
            ? "Current already points to its approved checkpoint. Begin editing to create a Draft before saving another version."
            : "Archived charts are read-only. Restore this chart as a Draft before saving another version.",
        },
        { status: 423 },
      );
    }
    if (chart.version !== existing.version || chart.updatedAt !== existing.updated_at) {
      return Response.json(
        {
          error: "The working draft changed before the named version could be saved.",
          currentVersion: existing.version,
          currentUpdatedAt: existing.updated_at,
        },
        { status: 409 },
      );
    }

    const validation = validateEditableChart(chart);
    if (validation.error) return Response.json(validation, { status: 422 });

    const latest = await DB.prepare(
      "SELECT MAX(version) AS version FROM chart_versions WHERE chart_id = ?",
    )
      .bind(chart.id)
      .first<{ version: number | null }>();
    const nextVersion = Math.max(existing.version, latest?.version ?? 0) + 1;
    const updatedAt = new Date().toISOString();
    const nextChart: ChartDocument = {
      ...chart,
      version: nextVersion,
      updatedAt,
      nodes: storageSafeNodes(chart.nodes),
    };

    await DB.batch([
      DB.prepare(
        `UPDATE charts
         SET name = ?, description = ?, status = ?, version = ?, updated_at = ?, payload = ?
         WHERE id = ?`,
      ).bind(
        nextChart.name,
        nextChart.description,
        nextChart.status,
        nextVersion,
        updatedAt,
        chartPayload(nextChart),
        nextChart.id,
      ),
      versionInsert(DB, nextChart, label, updatedAt),
    ]);
    const versionRow = await DB.prepare(
      "SELECT * FROM chart_versions WHERE chart_id = ? AND version = ?",
    )
      .bind(nextChart.id, nextVersion)
      .first<VersionRow>();
    const savedVersion = versionRow ? versionFromRow(versionRow) : null;
    if (savedVersion) await linkAcceptedAiActivity(DB, nextChart.id, savedVersion);
    return Response.json(
      { chart: nextChart, version: savedVersion },
      { status: 201 },
    );
  }

  if (body.action === "snapshot_current" && body.chartId) {
    const existing = await DB.prepare("SELECT * FROM charts WHERE id = ?")
      .bind(body.chartId)
      .first<ChartRow>();
    if (!existing) return Response.json({ error: "Chart not found." }, { status: 404 });
    const existingStatus = normalizeChartStatus(existing.status);
    if (existingStatus === "current" || existingStatus === "archived") {
      return Response.json(
        { error: `${existingStatus === "current" ? "Current" : "Archived"} charts cannot create a new working checkpoint.` },
        { status: 423 },
      );
    }
    if (
      body.expectedVersion !== existing.version ||
      body.expectedUpdatedAt !== existing.updated_at
    ) {
      return Response.json(
        {
          error: "The working draft changed before the named version could be saved.",
          currentVersion: existing.version,
          currentUpdatedAt: existing.updated_at,
        },
        { status: 409 },
      );
    }
    const sourceResult = await DB.prepare(
      "SELECT * FROM source_records WHERE chart_id = ? ORDER BY imported_at DESC",
    )
      .bind(body.chartId)
      .all<SourceRow>();
    const chart = chartFromRow(existing, sourceResult.results.map(sourceFromRow));
    const validation = validateEditableChart(chart);
    if (validation.error) return Response.json(validation, { status: 422 });
    const latest = await DB.prepare(
      "SELECT MAX(version) AS version FROM chart_versions WHERE chart_id = ?",
    )
      .bind(chart.id)
      .first<{ version: number | null }>();
    const nextVersion = Math.max(existing.version, latest?.version ?? 0) + 1;
    const updatedAt = new Date().toISOString();
    const label = body.label?.trim().slice(0, 160) || "Saved working version";
    const nextChart: ChartDocument = {
      ...chart,
      version: nextVersion,
      updatedAt,
    };
    const update = await DB.prepare(
      `UPDATE charts SET version = ?, updated_at = ?
       WHERE id = ? AND version = ? AND updated_at = ?`,
    )
      .bind(nextVersion, updatedAt, chart.id, existing.version, existing.updated_at)
      .run();
    if ((update.meta.changes ?? 0) !== 1) {
      return Response.json(
        { error: "The working draft changed before the named version could be saved." },
        { status: 409 },
      );
    }
    await versionInsert(DB, nextChart, label, updatedAt).run();
    const versionRow = await DB.prepare(
      "SELECT * FROM chart_versions WHERE chart_id = ? AND version = ?",
    )
      .bind(nextChart.id, nextVersion)
      .first<VersionRow>();
    const savedVersion = versionRow ? versionFromRow(versionRow) : null;
    if (savedVersion) await linkAcceptedAiActivity(DB, nextChart.id, savedVersion);
    return Response.json(
      { chart: nextChart, version: savedVersion },
      { status: 201 },
    );
  }

  if (body.action === "restore_version" && body.chartId && body.versionId) {
    const [chartRow, versionRow, sourceResult] = await Promise.all([
      DB.prepare("SELECT * FROM charts WHERE id = ?")
        .bind(body.chartId)
        .first<ChartRow>(),
      DB.prepare("SELECT * FROM chart_versions WHERE id = ? AND chart_id = ?")
        .bind(body.versionId, body.chartId)
        .first<VersionRow>(),
      DB.prepare("SELECT * FROM source_records WHERE chart_id = ?")
        .bind(body.chartId)
        .all<SourceRow>(),
    ]);
    if (!chartRow || !versionRow) {
      return Response.json({ error: "Chart version not found." }, { status: 404 });
    }

    const restoredPayload = JSON.parse(versionRow.payload) as Pick<
      ChartDocument,
      "nodes" | "edges"
    >;
    const findings = validateHierarchy(restoredPayload.nodes, restoredPayload.edges);
    if (findings.some((finding) => finding.severity === "blocking")) {
      return Response.json(
        { error: "The saved version failed structural validation.", findings },
        { status: 422 },
      );
    }

    const latest = await DB.prepare(
      "SELECT MAX(version) AS version FROM chart_versions WHERE chart_id = ?",
    )
      .bind(body.chartId)
      .first<{ version: number | null }>();
    const nextVersion = Math.max(chartRow.version, latest?.version ?? 0) + 1;
    const updatedAt = new Date().toISOString();
    const current = chartFromRow(
      chartRow,
      sourceResult.results.map(sourceFromRow),
    );
    const restoredChart: ChartDocument = {
      ...current,
      status: "draft",
      version: nextVersion,
      updatedAt,
      lifecycle: {
        ...current.lifecycle,
        statusChangedAt: updatedAt,
      },
      nodes: storageSafeNodes(restoredPayload.nodes),
      edges: restoredPayload.edges,
    };
    const label = `Restored from v${versionRow.version}${
      body.label?.trim() ? `: ${body.label.trim().slice(0, 120)}` : ""
    }`;

    await DB.batch([
      DB.prepare(
        "UPDATE charts SET status = ?, version = ?, updated_at = ?, payload = ? WHERE id = ?",
      ).bind("draft", nextVersion, updatedAt, chartPayload(restoredChart), body.chartId),
      versionInsert(
        DB,
        restoredChart,
        label,
        updatedAt,
        versionRow.version,
      ),
    ]);
    const restoredVersionRow = await DB.prepare(
      "SELECT * FROM chart_versions WHERE chart_id = ? AND version = ?",
    )
      .bind(body.chartId, nextVersion)
      .first<VersionRow>();
    return Response.json({
      chart: restoredChart,
      version: restoredVersionRow ? versionFromRow(restoredVersionRow) : null,
    });
  }

  if (body.action === "delete" && body.chartId) {
    const chartRow = await DB.prepare("SELECT status FROM charts WHERE id = ?")
      .bind(body.chartId)
      .first<{ status: string }>();
    if (!chartRow) return Response.json({ error: "Chart not found." }, { status: 404 });
    if (normalizeChartStatus(chartRow.status) !== "archived") {
      return Response.json(
        { error: "Archive a chart before permanently deleting it." },
        { status: 423 },
      );
    }
    const sourceResult = await DB.prepare(
      "SELECT storage_key FROM source_records WHERE chart_id = ? AND storage_key <> ''",
    )
      .bind(body.chartId)
      .all<{ storage_key: string }>();
    await Promise.all(
      sourceResult.results.map((source) => SOURCE_FILES.delete(source.storage_key)),
    );
    await DB.batch([
      DB.prepare("DELETE FROM ai_activity_events WHERE chart_id = ?").bind(body.chartId),
      DB.prepare("DELETE FROM chart_versions WHERE chart_id = ?").bind(body.chartId),
      DB.prepare("DELETE FROM source_records WHERE chart_id = ?").bind(body.chartId),
      DB.prepare(
        "DELETE FROM import_intake_files WHERE intake_id IN (SELECT id FROM import_intakes WHERE chart_id = ?)",
      ).bind(body.chartId),
      DB.prepare("DELETE FROM import_intakes WHERE chart_id = ?").bind(body.chartId),
      DB.prepare("DELETE FROM charts WHERE id = ?").bind(body.chartId),
    ]);
    return Response.json({ deleted: body.chartId });
  }

  return Response.json({ error: "Unsupported chart library action." }, { status: 400 });
}
