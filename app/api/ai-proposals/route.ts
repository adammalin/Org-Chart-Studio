import { decideProposals, DecisionError } from "../../../lib/proposal-decisions";
import { ensureSchema, getBindings } from "../../../db";
import {
  diffChartDocuments,
  type AiActivityRecord,
  type AiChartProposal,
} from "../../../lib/ai-change-review";
import {
  normalizeChartLifecycle,
  normalizeChartStatus,
  storageSafeNodes,
  type ChartDocument,
  type ChartStatus,
  type SourceRecord,
} from "../../../lib/chart-library";
import { archiveProposalError, proposalTargetStatus } from "../../../lib/proposal-lifecycle";
import { validateHierarchy } from "../../../lib/org-chart";
import { listPendingProposalSummaries, getPendingProposal, savePendingProposal } from "../../../lib/pending-proposal-store";

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

const chartStatuses: ChartStatus[] = ["draft", "in_review", "current", "archived"];

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
    libraryParentId?: string | null;
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
    libraryParentId: payload.libraryParentId,
    nodes: payload.nodes,
    edges: payload.edges,
    sources,
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

function validateEditableChart(chart: ChartDocument) {
  if (!chart.id || !chart.name?.trim()) return "Chart ID and name are required.";
  if (chart.name.trim().length > 160) return "Chart names are limited to 160 characters.";
  if ((chart.description ?? "").length > 2_000) return "Chart descriptions are limited to 2,000 characters.";
  if (!chartStatuses.includes(chart.status)) return "Chart status is invalid.";
  if (!Array.isArray(chart.nodes) || !Array.isArray(chart.edges)) {
    return "Chart nodes and relationships are required.";
  }
  if (chart.nodes.length > 5_000 || chart.edges.length > 10_000) {
    return "This human-test build is limited to 5,000 units and 10,000 relationships.";
  }
  const findings = validateHierarchy(chart.nodes, chart.edges);
  if (findings.some((finding) => finding.severity === "blocking")) {
    return "Resolve blocking structural findings before staging this proposal.";
  }
  return null;
}

async function loadCurrentChart(db: D1Database, chartId: string) {
  const [row, sourceResult] = await Promise.all([
    db.prepare("SELECT * FROM charts WHERE id = ?").bind(chartId).first<ChartRow>(),
    db.prepare("SELECT * FROM source_records WHERE chart_id = ? ORDER BY imported_at DESC")
      .bind(chartId)
      .all<SourceRow>(),
  ]);
  return row ? chartFromRow(row, sourceResult.results.map(sourceFromRow)) : null;
}

function noStoreJson(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "private, no-store");
  return Response.json(value, { ...init, headers });
}

export async function GET(request: Request) {
  const { DB } = getBindings();
  await ensureSchema(DB);
  const url = new URL(request.url);
  const proposalId = url.searchParams.get("proposalId");
  if (proposalId) {
    const proposal = await getPendingProposal(DB, proposalId);
    if (!proposal) {
      return noStoreJson({ error: "This AI proposal is no longer pending. Select the current review from the queue." }, { status: 404 });
    }
    return noStoreJson({ proposal });
  }
  if (url.searchParams.get("status") === "pending") {
    const proposals = await listPendingProposalSummaries(DB);
    return noStoreJson({ proposals });
  }
  const chartId = url.searchParams.get("chartId");
  if (!chartId) return noStoreJson({ error: "A chart ID is required." }, { status: 400 });
  const result = await DB.prepare(
    "SELECT * FROM ai_activity_events WHERE chart_id = ? ORDER BY created_at DESC LIMIT 100",
  )
    .bind(chartId)
    .all<ActivityRow>();
  return noStoreJson({ activities: result.results.map(activityFromRow) });
}

export async function POST(request: Request) {
  const { DB } = getBindings();
  await ensureSchema(DB);
  const body = (await request.json()) as {
    action?: "stage" | "accept" | "reject";
    chart?: ChartDocument;
    proposalId?: string;
    changeSummary?: string;
  };

  if (body.action === "stage" && body.chart) {
    const proposed = body.chart;
    const error = validateEditableChart(proposed);
    if (error) return noStoreJson({ error }, { status: 422 });
    const current = await loadCurrentChart(DB, proposed.id);
    if(current)proposed.libraryParentId=current.libraryParentId;
    if (!current) return noStoreJson({ error: "Chart not found." }, { status: 404 });
    if (current.status === "archived") {
      return noStoreJson(
        { error: "Archived charts are read-only. Restore this chart as a Draft before proposing changes." },
        { status: 423 },
      );
    }
    if (proposed.version !== current.version || proposed.updatedAt !== current.updatedAt) {
      return noStoreJson(
        {
          error: "The working draft changed while the AI proposal was being prepared.",
          currentVersion: current.version,
          currentUpdatedAt: current.updatedAt,
        },
        { status: 409 },
      );
    }
    const archiveError = archiveProposalError(current, proposed);
    if (archiveError) return noStoreJson({ error: archiveError }, { status: 422 });
    const reviewed = { ...proposed, status: proposalTargetStatus(current.status, proposed.status) };
    const { changes, summary } = diffChartDocuments(current, reviewed);
    if (!changes.length) {
      return noStoreJson({ error: "The proposed chart is identical to the current saved chart." }, { status: 422 });
    }
    const createdAt = new Date();
    const proposal: AiChartProposal = {
      id: `proposal-${crypto.randomUUID()}`,
      chartId: current.id,
      chartName: proposed.name,
      operation: "replace_chart_draft",
      status: "pending",
      changeSummary: body.changeSummary?.trim().slice(0, 500) || null,
      createdAt: createdAt.toISOString(),
      expiresAt: null,
      current,
      proposed: {
        ...reviewed,
        lifecycle: current.lifecycle,
        createdAt: current.createdAt,
        sources: current.sources,
        nodes: storageSafeNodes(proposed.nodes),
      },
      changes,
      summary,
    };
    await savePendingProposal(DB, proposal);
    return noStoreJson({ proposal }, { status: 201 });
  }

  if ((body.action === "accept" || body.action === "reject") && body.proposalId) {
    try{const result=await decideProposals(DB,[body.proposalId],body.action);const chart=result.charts[0];return noStoreJson(body.action==="reject"?{rejected:body.proposalId}:{chart,activityId:result.activityIds[0],returnedToDraft:chart.status==="draft"&&!!chart.lifecycle.lastCurrentAt});}
    catch(error){return noStoreJson({error:error instanceof Error?error.message:"The review decision failed."},{status:error instanceof DecisionError?error.status:500});}
  }

  return noStoreJson({ error: "Unsupported AI proposal action." }, { status: 400 });
}
