import { ensureSchema, getBindings } from "../../../db";
import {
  createBlankChart,
  RETIRED_EXAMPLE_CHART_IDS,
  storageSafeNodes,
  type ChartDocument,
  type ChartStatus,
  type ChartVersion,
  type SourceRecord,
} from "../../../lib/chart-library";
import { parseImportBytes } from "../../../lib/import-org-chart-file";
import { validateHierarchy } from "../../../lib/org-chart";

interface ChartRow {
  id: string;
  name: string;
  description: string;
  status: ChartStatus;
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

const chartStatuses: ChartStatus[] = ["draft", "in_review", "approved", "archived"];
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
  const payload = JSON.parse(row.payload) as Pick<ChartDocument, "nodes" | "edges">;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

function chartPayload(chart: Pick<ChartDocument, "nodes" | "edges">) {
  return JSON.stringify({
    nodes: storageSafeNodes(chart.nodes),
    edges: chart.edges,
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
    if (evidenceFiles.length > 10) {
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
    const evidenceSize = evidenceFiles.reduce((total, evidence) => total + evidence.size, 0);
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
        evidenceFileNames: evidenceFiles.map((evidence) => evidence.name),
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
    const chart: ChartDocument = {
      id: chartId,
      name: chartName,
      description: `Imported from ${file.name}; pending data-owner review.`,
      status: "draft",
      version: 1,
      createdAt: now,
      updatedAt: now,
      nodes: preview.nodes,
      edges: preview.edges,
      sources: [source, ...evidenceItems.map((item) => item.source)],
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
      evidenceItems.forEach((item) => statements.push(sourceInsert(DB, item.source)));
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
      | "snapshot"
      | "restore_version"
      | "delete";
    name?: string;
    chartId?: string;
    chart?: ChartDocument;
    label?: string;
    versionId?: string;
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
      nodes: storageSafeNodes(existing.nodes),
      sources: [],
    };
    await DB.batch([
      chartInsert(DB, chart),
      versionInsert(DB, chart, `Duplicated from ${existing.name}`, now),
    ]);
    return Response.json({ chart }, { status: 201 });
  }

  if (body.action === "save" && body.chart) {
    const chart = body.chart;
    const validation = validateEditableChart(chart);
    if (validation.error) {
      return Response.json(validation, { status: 422 });
    }
    const existing = await DB.prepare("SELECT version, updated_at FROM charts WHERE id = ?")
      .bind(chart.id)
      .first<{ version: number; updated_at: string }>();
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
    const updatedAt = new Date().toISOString();
    const result = await DB.prepare(
      `UPDATE charts
       SET name = ?, description = ?, status = ?, version = ?, updated_at = ?, payload = ?
       WHERE id = ? AND updated_at = ?`,
    )
      .bind(
        chart.name,
        chart.description,
        chart.status,
        existing.version,
        updatedAt,
        JSON.stringify({ nodes: storageSafeNodes(chart.nodes), edges: chart.edges }),
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
    return Response.json({ chart: { ...chart, version: existing.version, updatedAt } });
  }

  if (body.action === "snapshot" && body.chart) {
    const chart = body.chart;
    const label = body.label?.trim().slice(0, 160) || "Saved working version";
    const existing = await DB.prepare("SELECT * FROM charts WHERE id = ?")
      .bind(chart.id)
      .first<ChartRow>();
    if (!existing) return Response.json({ error: "Chart not found." }, { status: 404 });

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
    return Response.json(
      { chart: nextChart, version: versionRow ? versionFromRow(versionRow) : null },
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
      version: nextVersion,
      updatedAt,
      nodes: storageSafeNodes(restoredPayload.nodes),
      edges: restoredPayload.edges,
    };
    const label = `Restored from v${versionRow.version}${
      body.label?.trim() ? `: ${body.label.trim().slice(0, 120)}` : ""
    }`;

    await DB.batch([
      DB.prepare(
        "UPDATE charts SET version = ?, updated_at = ?, payload = ? WHERE id = ?",
      ).bind(nextVersion, updatedAt, chartPayload(restoredChart), body.chartId),
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
    const sourceResult = await DB.prepare(
      "SELECT storage_key FROM source_records WHERE chart_id = ? AND storage_key <> ''",
    )
      .bind(body.chartId)
      .all<{ storage_key: string }>();
    await Promise.all(
      sourceResult.results.map((source) => SOURCE_FILES.delete(source.storage_key)),
    );
    await DB.batch([
      DB.prepare("DELETE FROM chart_versions WHERE chart_id = ?").bind(body.chartId),
      DB.prepare("DELETE FROM source_records WHERE chart_id = ?").bind(body.chartId),
      DB.prepare("DELETE FROM charts WHERE id = ?").bind(body.chartId),
    ]);
    return Response.json({ deleted: body.chartId });
  }

  return Response.json({ error: "Unsupported chart library action." }, { status: 400 });
}
