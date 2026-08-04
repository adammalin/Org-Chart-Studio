import { ensureSchema, getBindings } from "../../../db";
import type { AiImportProposal } from "../../../lib/ai-import-review";
import { auditChartQuality } from "../../../lib/chart-governance";
import {
  normalizeChartLifecycle,
  normalizeChartStatus,
  storageSafeNodes,
  type ChartDocument,
  type SourceRecord,
} from "../../../lib/chart-library";
import type { ImportIntakeFile, ImportIntakeStatus } from "../../../lib/import-intake";
import { parseImportBytes } from "../../../lib/import-org-chart-file";

const PROPOSAL_TTL_MS = 30 * 60_000;
const MAX_PENDING_PROPOSALS = 20;

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

interface StoredImportProposal {
  proposal: AiImportProposal;
  contents: string;
}

interface ImportProposalStore {
  proposals: Map<string, StoredImportProposal>;
}

const proposalGlobal = globalThis as typeof globalThis & {
  __orgChartAiImportProposalStore?: ImportProposalStore;
};

function proposalStore(): ImportProposalStore {
  if (!proposalGlobal.__orgChartAiImportProposalStore) {
    proposalGlobal.__orgChartAiImportProposalStore = { proposals: new Map() };
  }
  return proposalGlobal.__orgChartAiImportProposalStore;
}

function cleanProposalStore() {
  const store = proposalStore();
  const now = Date.now();
  for (const [id, stored] of store.proposals) {
    if (Date.parse(stored.proposal.expiresAt) <= now) store.proposals.delete(id);
  }
  while (store.proposals.size >= MAX_PENDING_PROPOSALS) {
    const oldest = store.proposals.keys().next().value as string | undefined;
    if (!oldest) break;
    store.proposals.delete(oldest);
  }
}

function noStoreJson(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "private, no-store");
  return Response.json(value, { ...init, headers });
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function chartFromRow(row: ChartRow): ChartDocument {
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
    sources: [],
  };
}

function intakeFileFromRow(row: IntakeFileRow): ImportIntakeFile {
  return {
    id: row.id,
    intakeId: row.intake_id,
    fileName: row.file_name,
    contentType: row.content_type,
    fileSize: row.file_size,
    checksum: row.checksum,
    storageKey: row.storage_key,
    createdAt: row.created_at,
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
      JSON.stringify({
        nodes: storageSafeNodes(chart.nodes),
        edges: chart.edges,
        lifecycle: chart.lifecycle,
      }),
    );
}

function versionInsert(db: D1Database, chart: ChartDocument, label: string) {
  return db
    .prepare(
      `INSERT INTO chart_versions
        (id, chart_id, version, label, created_at, payload, restored_from_version)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      `version-${crypto.randomUUID()}`,
      chart.id,
      chart.version,
      label,
      chart.createdAt,
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

async function loadPendingIntake(db: D1Database, intakeId: string | null) {
  if (!intakeId) return { intake: null, files: [] as ImportIntakeFile[] };
  const [intake, files] = await Promise.all([
    db.prepare("SELECT * FROM import_intakes WHERE id = ? AND status = 'pending'")
      .bind(intakeId)
      .first<IntakeRow>(),
    db.prepare("SELECT * FROM import_intake_files WHERE intake_id = ? ORDER BY created_at")
      .bind(intakeId)
      .all<IntakeFileRow>(),
  ]);
  if (!intake) throw new Error("The selected source intake is unavailable or already used.");
  return { intake, files: files.results.map(intakeFileFromRow) };
}

export async function GET(request: Request) {
  cleanProposalStore();
  const proposalId = new URL(request.url).searchParams.get("proposalId");
  if (!proposalId) return noStoreJson({ error: "A proposal ID is required." }, { status: 400 });
  const stored = proposalStore().proposals.get(proposalId);
  if (!stored) {
    return noStoreJson(
      { error: "This AI import proposal expired or is no longer available." },
      { status: 404 },
    );
  }
  return noStoreJson({ proposal: stored.proposal });
}

export async function POST(request: Request) {
  const { DB, SOURCE_FILES } = getBindings();
  await ensureSchema(DB);
  cleanProposalStore();
  const body = (await request.json()) as {
    action?: "stage" | "accept" | "reject";
    chartName?: string;
    format?: "csv" | "json";
    contents?: string;
    intakeId?: string;
    proposalId?: string;
  };

  if (body.action === "stage") {
    const chartName = body.chartName?.trim() ?? "";
    const contents = body.contents ?? "";
    if (!chartName || chartName.length > 160) {
      return noStoreJson({ error: "Provide a chart name no longer than 160 characters." }, { status: 400 });
    }
    if (!body.format || !["csv", "json"].includes(body.format) || !contents) {
      return noStoreJson({ error: "Normalized CSV or JSON contents are required." }, { status: 400 });
    }
    if (new TextEncoder().encode(contents).byteLength > 4_500_000) {
      return noStoreJson({ error: "Normalized import contents exceed 4.5 MB." }, { status: 413 });
    }
    let intake;
    let intakeFiles: ImportIntakeFile[];
    try {
      ({ intake, files: intakeFiles } = await loadPendingIntake(DB, body.intakeId ?? null));
    } catch (error) {
      return noStoreJson({ error: error instanceof Error ? error.message : "The source intake is unavailable." }, { status: 404 });
    }
    let preview;
    try {
      preview = parseImportBytes(
        `ai-normalized-org-chart.${body.format}`,
        new TextEncoder().encode(contents),
      );
    } catch (error) {
      return noStoreJson({ error: error instanceof Error ? error.message : "The normalized import could not be parsed." }, { status: 422 });
    }
    if (preview.findings.some((finding) => finding.severity === "blocking")) {
      return noStoreJson(
        { error: "Resolve blocking validation findings before staging the import.", findings: preview.findings },
        { status: 422 },
      );
    }
    const existing = await DB.prepare("SELECT * FROM charts ORDER BY updated_at DESC").all<ChartRow>();
    const quality = auditChartQuality(
      preview.nodes,
      preview.edges,
      existing.results.map(chartFromRow),
    );
    const createdAt = new Date();
    const proposal: AiImportProposal = {
      id: `import-proposal-${crypto.randomUUID()}`,
      chartName,
      operation: "stage_normalized_import",
      status: "pending",
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + PROPOSAL_TTL_MS).toISOString(),
      format: body.format,
      intakeId: intake?.id ?? null,
      intakeName: intake?.name ?? null,
      evidenceFileNames: intakeFiles.map((file) => file.fileName),
      proposed: { nodes: preview.nodes, edges: preview.edges },
      findings: [...preview.findings, ...quality.findings],
      quality,
    };
    proposalStore().proposals.set(proposal.id, { proposal, contents });
    return noStoreJson({ proposal }, { status: 201 });
  }

  if ((body.action === "accept" || body.action === "reject") && body.proposalId) {
    const stored = proposalStore().proposals.get(body.proposalId);
    if (!stored) {
      return noStoreJson({ error: "This AI import proposal expired or is no longer available." }, { status: 404 });
    }
    if (body.action === "reject") {
      proposalStore().proposals.delete(body.proposalId);
      return noStoreJson({ rejected: body.proposalId });
    }

    let intake;
    let intakeFiles: ImportIntakeFile[];
    try {
      ({ intake, files: intakeFiles } = await loadPendingIntake(DB, stored.proposal.intakeId));
    } catch (error) {
      proposalStore().proposals.delete(body.proposalId);
      return noStoreJson({ error: error instanceof Error ? error.message : "The source intake is unavailable." }, { status: 409 });
    }
    const now = new Date().toISOString();
    const chartId = `chart-${crypto.randomUUID()}`;
    const normalizedBytes = new TextEncoder().encode(stored.contents);
    const normalizedSourceId = `source-${crypto.randomUUID()}`;
    const normalizedFileName = `ai-normalized-org-chart.${stored.proposal.format}`;
    const normalizedStorageKey = `chart-sources/${chartId}/${normalizedSourceId}-${normalizedFileName}`;
    const normalizedChecksum = await sha256Hex(normalizedBytes.slice().buffer);
    const warningCount = stored.proposal.findings.filter((finding) => finding.severity === "warning").length;
    const normalizedSource: SourceRecord = {
      id: normalizedSourceId,
      chartId,
      fileName: normalizedFileName,
      contentType: stored.proposal.format === "json" ? "application/json" : "text/csv",
      fileSize: normalizedBytes.byteLength,
      checksum: normalizedChecksum,
      storageKey: normalizedStorageKey,
      sourceType: "structured_import",
      importedAt: now,
      rowCount: stored.proposal.proposed.nodes.length,
      warningCount,
    };
    const evidenceSources: SourceRecord[] = intakeFiles.map((file) => ({
      id: `source-${crypto.randomUUID()}`,
      chartId,
      fileName: file.fileName,
      contentType: file.contentType,
      fileSize: file.fileSize,
      checksum: file.checksum,
      storageKey: file.storageKey,
      sourceType: "guided_extraction",
      importedAt: now,
      rowCount: 0,
      warningCount: 0,
    }));
    const chart: ChartDocument = {
      id: chartId,
      name: stored.proposal.chartName,
      description: `Created from a reviewed AI-normalized import${intake ? ` and source intake ${intake.name}` : ""}.`,
      status: "draft",
      version: 1,
      createdAt: now,
      updatedAt: now,
      lifecycle: normalizeChartLifecycle(null, "draft", now, 1),
      nodes: storageSafeNodes(stored.proposal.proposed.nodes),
      edges: stored.proposal.proposed.edges,
      sources: [normalizedSource, ...evidenceSources],
    };
    try {
      await SOURCE_FILES.put(normalizedStorageKey, normalizedBytes, {
        httpMetadata: { contentType: normalizedSource.contentType },
        customMetadata: { chartId, sourceId: normalizedSourceId, checksum: normalizedChecksum },
      });
      await DB.batch([
        chartInsert(DB, chart),
        versionInsert(DB, chart, "Created from reviewed AI import"),
        sourceInsert(DB, normalizedSource),
        ...evidenceSources.map((source) => sourceInsert(DB, source)),
        ...(intake
          ? [
              DB.prepare(
                "UPDATE import_intakes SET status = 'imported', chart_id = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
              ).bind(chartId, now, intake.id),
            ]
          : []),
      ]);
    } catch (error) {
      await SOURCE_FILES.delete(normalizedStorageKey);
      throw error;
    }
    proposalStore().proposals.delete(body.proposalId);
    return noStoreJson({ chart }, { status: 201 });
  }

  return noStoreJson({ error: "Unsupported AI import proposal action." }, { status: 400 });
}
