import { ensureSchema, getBindings } from "../../../db";
import {
  LIBRARY_BACKUP_FORMAT,
  LIBRARY_BACKUP_VERSION,
  isLibraryBackup,
  resolveBackupSelection,
  type BackupSourceFile,
  type LibraryBackup,
} from "../../../lib/backup-format";
import type { AiActivityRecord } from "../../../lib/ai-change-review";
import {
  isRetiredExampleChartId,
  storageSafeNodes,
  type ChartDocument,
  type ChartStatus,
  type ChartVersion,
  type SourceRecord,
} from "../../../lib/chart-library";
import { parseImportFile } from "../../../lib/import-org-chart";

const MAX_BACKUP_BYTES = 25_000_000;
const MAX_CHARTS = 200;
const MAX_TOTAL_NODES = 25_000;
const MAX_SOURCE_FILES = 1_000;
const MAX_VERSIONS = 5_000;
const MAX_AI_ACTIVITIES = 10_000;

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

interface ActivityRow {
  id: string;
  chart_id: string;
  proposal_id: string;
  operation: string;
  status: "accepted" | "rejected";
  summary: string;
  change_count: number;
  changed_node_ids: string;
  changed_edge_ids: string;
  created_at: string;
  version_id: string | null;
  version_number: number | null;
  version_label: string | null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
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

function activityFromRow(row: ActivityRow): AiActivityRecord {
  return {
    id: row.id,
    chartId: row.chart_id,
    proposalId: row.proposal_id,
    operation: row.operation,
    status: row.status,
    summary: row.summary,
    changeCount: row.change_count,
    changedNodeIds: JSON.parse(row.changed_node_ids) as string[],
    changedEdgeIds: JSON.parse(row.changed_edge_ids) as string[],
    createdAt: row.created_at,
    versionId: row.version_id,
    versionNumber: row.version_number,
    versionLabel: row.version_label,
  };
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
      JSON.stringify({ nodes: storageSafeNodes(chart.nodes), edges: chart.edges }),
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

function versionInsert(db: D1Database, version: ChartVersion) {
  return db
    .prepare(
      `INSERT INTO chart_versions
        (id, chart_id, version, label, created_at, payload, restored_from_version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      version.id,
      version.chartId,
      version.version,
      version.label,
      version.createdAt,
      JSON.stringify({
        nodes: storageSafeNodes(version.nodes),
        edges: version.edges,
      }),
      version.restoredFromVersion,
    );
}

function activityInsert(db: D1Database, activity: AiActivityRecord) {
  return db
    .prepare(
      `INSERT INTO ai_activity_events
        (id, chart_id, proposal_id, operation, status, summary, change_count,
         changed_node_ids, changed_edge_ids, created_at, version_id, version_number, version_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      activity.id,
      activity.chartId,
      activity.proposalId,
      activity.operation,
      activity.status,
      activity.summary,
      activity.changeCount,
      JSON.stringify(activity.changedNodeIds),
      JSON.stringify(activity.changedEdgeIds),
      activity.createdAt,
      activity.versionId,
      activity.versionNumber,
      activity.versionLabel,
    );
}

function noStoreJson(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store, max-age=0");
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), { ...init, headers });
}

export async function GET(request: Request) {
  const { DB, SOURCE_FILES } = getBindings();
  await ensureSchema(DB);
  const [chartResult, sourceResult, versionResult, activityResult] = await Promise.all([
    DB.prepare("SELECT * FROM charts ORDER BY updated_at DESC").all<ChartRow>(),
    DB.prepare("SELECT * FROM source_records ORDER BY imported_at DESC").all<SourceRow>(),
    DB.prepare("SELECT * FROM chart_versions ORDER BY chart_id, version").all<VersionRow>(),
    DB.prepare("SELECT * FROM ai_activity_events ORDER BY chart_id, created_at").all<ActivityRow>(),
  ]);
  const availableChartRows = chartResult.results.filter(
    (row) => !isRetiredExampleChartId(row.id),
  );
  const requestedChartIds = new URL(request.url).searchParams.getAll("chartId");
  if (requestedChartIds.length > MAX_CHARTS) {
    return noStoreJson(
      { error: `A backup can include no more than ${MAX_CHARTS} selected charts.` },
      { status: 413 },
    );
  }
  const selection = resolveBackupSelection(
    availableChartRows.map((row) => row.id),
    requestedChartIds,
  );
  if (selection.missingChartIds.length) {
    return noStoreJson(
      { error: "One or more selected charts are no longer available. Refresh and try again." },
      { status: 404 },
    );
  }
  if (!selection.chartIds.length) {
    return noStoreJson(
      { error: "No charts are available to include in a backup." },
      { status: 422 },
    );
  }
  const selectedChartIds = new Set(selection.chartIds);
  const chartRows = availableChartRows.filter((row) => selectedChartIds.has(row.id));
  const includedChartIds = new Set(chartRows.map((row) => row.id));
  const sourceRows = sourceResult.results.filter((row) => includedChartIds.has(row.chart_id));
  const versionRows = versionResult.results.filter((row) => includedChartIds.has(row.chart_id));
  const activityRows = activityResult.results.filter((row) => includedChartIds.has(row.chart_id));
  const sourceFiles: BackupSourceFile[] = [];
  let sourceBytes = 0;

  for (const sourceRow of sourceRows) {
    if (!sourceRow.storage_key) continue;
    const object = await SOURCE_FILES.get(sourceRow.storage_key);
    if (!object) {
      return noStoreJson(
        { error: `Stored source file ${sourceRow.file_name} is missing; backup was not created.` },
        { status: 409 },
      );
    }
    sourceBytes += object.size;
    if (sourceBytes > MAX_BACKUP_BYTES) {
      return noStoreJson(
        { error: "Stored source files exceed the 25 MB prototype backup limit." },
        { status: 413 },
      );
    }
    const bytes = await object.arrayBuffer();
    const checksum = await sha256(bytes);
    if (checksum !== sourceRow.checksum) {
      return noStoreJson(
        { error: `Stored source file ${sourceRow.file_name} failed its checksum check.` },
        { status: 409 },
      );
    }
    sourceFiles.push({
      sourceId: sourceRow.id,
      fileName: sourceRow.file_name,
      contentType: sourceRow.content_type,
      checksum,
      dataBase64: bytesToBase64(new Uint8Array(bytes)),
    });
  }

  const sources = sourceRows.map(sourceFromRow);
  const charts = chartRows.map((row) =>
    chartFromRow(
      row,
      sources
        .filter((source) => source.chartId === row.id)
        .map((source) => ({ ...source, storageKey: "" })),
    ),
  );
  const backup: LibraryBackup = {
    format: LIBRARY_BACKUP_FORMAT,
    schemaVersion: LIBRARY_BACKUP_VERSION,
    scope: selection.scope,
    exportedAt: new Date().toISOString(),
    chartCount: charts.length,
    sourceFileCount: sourceFiles.length,
    versionCount: versionRows.length,
    aiActivityCount: activityRows.length,
    charts,
    chartVersions: versionRows.map(versionFromRow),
    aiActivities: activityRows.map(activityFromRow),
    sourceFiles,
  };

  return noStoreJson(backup, {
    headers: {
      "content-disposition": 'attachment; filename="orgchart-studio-library-backup.json"',
      "x-content-type-options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BACKUP_BYTES * 1.5) {
    return noStoreJson({ error: "The decrypted backup exceeds the restore limit." }, { status: 413 });
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return noStoreJson({ error: "The decrypted backup is not valid JSON." }, { status: 400 });
  }
  if (!isLibraryBackup(value)) {
    return noStoreJson({ error: "This is not a supported OrgChart Studio backup." }, { status: 422 });
  }

  const backup = value;
  const chartVersions = backup.chartVersions ?? [];
  const aiActivities = backup.aiActivities ?? [];
  const restorableCharts = backup.charts.filter(
    (chart) => !isRetiredExampleChartId(chart.id),
  );
  if (!restorableCharts.length) {
    return noStoreJson(
      { error: "This backup contains only retired built-in example charts." },
      { status: 422 },
    );
  }
  const restorableChartIds = new Set(restorableCharts.map((chart) => chart.id));
  const restorableVersions = chartVersions.filter((version) =>
    restorableChartIds.has(version.chartId),
  );
  const totalNodes = backup.charts.reduce((count, chart) => count + chart.nodes.length, 0);
  if (
    !backup.charts.length ||
    backup.chartCount !== backup.charts.length ||
    backup.sourceFileCount !== backup.sourceFiles.length ||
    backup.charts.length > MAX_CHARTS ||
    totalNodes > MAX_TOTAL_NODES ||
    backup.sourceFiles.length > MAX_SOURCE_FILES ||
    chartVersions.length > MAX_VERSIONS ||
    aiActivities.length > MAX_AI_ACTIVITIES ||
    (backup.versionCount !== undefined && backup.versionCount !== chartVersions.length) ||
    (backup.aiActivityCount !== undefined && backup.aiActivityCount !== aiActivities.length)
  ) {
    return noStoreJson(
      { error: "The backup exceeds the supported chart, unit, or source-file limits." },
      { status: 413 },
    );
  }

  for (const chart of backup.charts) {
    if (!chart.id || !chart.name || !Array.isArray(chart.nodes) || !Array.isArray(chart.edges)) {
      return noStoreJson({ error: "A chart record in the backup is malformed." }, { status: 422 });
    }
    const findings = parseImportFile(
      "backup-chart.json",
      JSON.stringify({ nodes: chart.nodes, edges: chart.edges }),
    ).findings;
    if (findings.some((finding) => finding.severity === "blocking")) {
      return noStoreJson(
        { error: `Chart ${chart.name} failed structural validation.`, findings },
        { status: 422 },
      );
    }
  }

  const backupChartIds = new Set(backup.charts.map((chart) => chart.id));
  const versionKeys = new Set<string>();
  for (const version of chartVersions) {
    const versionKey = `${version.chartId}:${version.version}`;
    if (
      !version.id ||
      !backupChartIds.has(version.chartId) ||
      !Number.isInteger(version.version) ||
      version.version < 1 ||
      !version.label ||
      !Array.isArray(version.nodes) ||
      !Array.isArray(version.edges) ||
      versionKeys.has(versionKey)
    ) {
      return noStoreJson(
        { error: "A chart version record in the backup is malformed or duplicated." },
        { status: 422 },
      );
    }
    versionKeys.add(versionKey);
    const findings = parseImportFile(
      "backup-version.json",
      JSON.stringify({ nodes: version.nodes, edges: version.edges }),
    ).findings;
    if (findings.some((finding) => finding.severity === "blocking")) {
      return noStoreJson(
        { error: `Saved version ${version.version} failed structural validation.`, findings },
        { status: 422 },
      );
    }
  }

  const versionIds = new Set(chartVersions.map((version) => version.id));
  const activityIds = new Set<string>();
  for (const activity of aiActivities) {
    if (
      !activity.id ||
      !activity.proposalId ||
      !backupChartIds.has(activity.chartId) ||
      (activity.status !== "accepted" && activity.status !== "rejected") ||
      !activity.summary ||
      !Number.isInteger(activity.changeCount) ||
      activity.changeCount < 0 ||
      !Array.isArray(activity.changedNodeIds) ||
      !Array.isArray(activity.changedEdgeIds) ||
      (activity.versionId !== null && !versionIds.has(activity.versionId)) ||
      activityIds.has(activity.id)
    ) {
      return noStoreJson(
        { error: "An AI activity record in the backup is malformed or duplicated." },
        { status: 422 },
      );
    }
    activityIds.add(activity.id);
  }

  const sourceFilesById = new Map(backup.sourceFiles.map((file) => [file.sourceId, file]));
  const sourceRecords = backup.charts.flatMap((chart) => chart.sources);
  const sourceRecordsById = new Map(sourceRecords.map((source) => [source.id, source]));
  if (
    sourceFilesById.size !== backup.sourceFiles.length ||
    sourceRecordsById.size !== sourceRecords.length
  ) {
    return noStoreJson({ error: "The backup contains duplicate source identifiers." }, { status: 422 });
  }
  for (const sourceRecord of sourceRecords) {
    if (
      sourceRecord.sourceType !== "synthetic" &&
      sourceRecord.fileSize > 0 &&
      !sourceFilesById.has(sourceRecord.id)
    ) {
      return noStoreJson(
        { error: `Backup source file ${sourceRecord.fileName} is missing.` },
        { status: 422 },
      );
    }
  }

  const decodedFiles = new Map<string, Uint8Array>();
  let decodedByteCount = 0;
  for (const sourceFile of backup.sourceFiles) {
    const sourceRecord = sourceRecordsById.get(sourceFile.sourceId);
    if (
      !sourceRecord ||
      sourceRecord.fileName !== sourceFile.fileName ||
      sourceRecord.contentType !== sourceFile.contentType ||
      sourceRecord.checksum !== sourceFile.checksum
    ) {
      return noStoreJson(
        { error: `Source file ${sourceFile.fileName || "record"} does not match its provenance record.` },
        { status: 422 },
      );
    }
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(sourceFile.dataBase64);
    } catch {
      return noStoreJson({ error: `Source file ${sourceFile.fileName} is not valid base64.` }, { status: 422 });
    }
    decodedByteCount += bytes.byteLength;
    if (decodedByteCount > MAX_BACKUP_BYTES) {
      return noStoreJson({ error: "Source files exceed the 25 MB restore limit." }, { status: 413 });
    }
    const checksum = await sha256(bytes.slice().buffer);
    if (checksum !== sourceFile.checksum) {
      return noStoreJson(
        { error: `Source file ${sourceFile.fileName} failed its checksum check.` },
        { status: 422 },
      );
    }
    if (bytes.byteLength !== sourceRecord.fileSize) {
      return noStoreJson(
        { error: `Source file ${sourceFile.fileName} does not match its recorded size.` },
        { status: 422 },
      );
    }
    decodedFiles.set(sourceFile.sourceId, bytes);
  }

  const { DB, SOURCE_FILES } = getBindings();
  await ensureSchema(DB);
  const now = new Date().toISOString();
  const restoredCharts: ChartDocument[] = [];
  const statements: D1PreparedStatement[] = [];
  const writtenStorageKeys: string[] = [];
  let restoredActivityCount = 0;

  try {
    for (const original of restorableCharts) {
      const chartId = `chart-${crypto.randomUUID()}`;
      const restoredSources: SourceRecord[] = [];
      for (const originalSource of original.sources) {
        const sourceId = `source-${crypto.randomUUID()}`;
        const sourceFile = sourceFilesById.get(originalSource.id);
        const bytes = decodedFiles.get(originalSource.id);
        let storageKey = "";
        if (sourceFile && bytes) {
          const safeFileName = sourceFile.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
          storageKey = `chart-sources/${chartId}/${sourceId}-${safeFileName}`;
          await SOURCE_FILES.put(storageKey, bytes, {
            httpMetadata: { contentType: sourceFile.contentType },
            customMetadata: { chartId, sourceId, checksum: sourceFile.checksum },
          });
          writtenStorageKeys.push(storageKey);
        }
        restoredSources.push({
          ...originalSource,
          id: sourceId,
          chartId,
          storageKey,
          importedAt: now,
        });
      }

      const chart: ChartDocument = {
        ...original,
        id: chartId,
        name: `${original.name} — Restored`,
        description: `Restored from encrypted backup exported ${backup.exportedAt}. ${original.description}`,
        status: "draft",
        createdAt: now,
        updatedAt: now,
        nodes: storageSafeNodes(original.nodes),
        sources: restoredSources,
      };
      restoredCharts.push(chart);
      statements.push(chartInsert(DB, chart));
      restoredSources.forEach((source) => statements.push(sourceInsert(DB, source)));
      const originalVersions = restorableVersions.filter(
        (version) => version.chartId === original.id,
      );
      const restoredVersionIds = new Map<string, string>();
      if (originalVersions.length) {
        originalVersions.forEach((version) => {
          const versionId = `version-${crypto.randomUUID()}`;
          restoredVersionIds.set(version.id, versionId);
          statements.push(
            versionInsert(DB, {
              ...version,
              id: versionId,
              chartId,
              nodes: storageSafeNodes(version.nodes),
            }),
          );
        });
      } else {
        statements.push(
          versionInsert(DB, {
            id: `version-${crypto.randomUUID()}`,
            chartId,
            version: chart.version,
            label: "Restored legacy backup baseline",
            createdAt: now,
            restoredFromVersion: null,
            nodes: storageSafeNodes(chart.nodes),
            edges: chart.edges,
          }),
        );
      }
      const originalActivities = aiActivities.filter(
        (activity) => activity.chartId === original.id,
      );
      originalActivities.forEach((activity) => {
        const linkedVersionId = activity.versionId
          ? restoredVersionIds.get(activity.versionId) ?? null
          : null;
        statements.push(
          activityInsert(DB, {
            ...activity,
            id: `ai-event-${crypto.randomUUID()}`,
            chartId,
            proposalId: `restored-${activity.proposalId}`.slice(0, 240),
            versionId: linkedVersionId,
            versionNumber: linkedVersionId ? activity.versionNumber : null,
            versionLabel: linkedVersionId ? activity.versionLabel : null,
          }),
        );
      });
      restoredActivityCount += originalActivities.length;
    }
    await DB.batch(statements);
  } catch (error) {
    await Promise.all(writtenStorageKeys.map((key) => SOURCE_FILES.delete(key)));
    throw error;
  }

  return noStoreJson(
    {
      restoredCharts,
      restoredChartCount: restoredCharts.length,
      restoredSourceFileCount: writtenStorageKeys.length,
      restoredVersionCount: restorableVersions.length || restoredCharts.length,
      restoredAiActivityCount: restoredActivityCount,
      mode: "merge",
    },
    { status: 201 },
  );
}
