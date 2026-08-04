import { ensureSchema, getBindings } from "../../../db";
import {
  diffChartDocuments,
  type AiActivityRecord,
  type AiChartProposal,
} from "../../../lib/ai-change-review";
import {
  storageSafeNodes,
  type ChartDocument,
  type ChartStatus,
  type SourceRecord,
} from "../../../lib/chart-library";
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

interface ProposalStore {
  proposals: Map<string, AiChartProposal>;
}

const PROPOSAL_TTL_MS = 30 * 60_000;
const MAX_PENDING_PROPOSALS = 20;
const chartStatuses: ChartStatus[] = ["draft", "in_review", "approved", "archived"];
const proposalGlobal = globalThis as typeof globalThis & {
  __orgChartAiProposalStore?: ProposalStore;
};

function proposalStore(): ProposalStore {
  if (!proposalGlobal.__orgChartAiProposalStore) {
    proposalGlobal.__orgChartAiProposalStore = { proposals: new Map() };
  }
  return proposalGlobal.__orgChartAiProposalStore;
}

function cleanProposalStore() {
  const store = proposalStore();
  const now = Date.now();
  for (const [id, proposal] of store.proposals) {
    if (Date.parse(proposal.expiresAt) <= now || proposal.status !== "pending") {
      store.proposals.delete(id);
    }
  }
  while (store.proposals.size >= MAX_PENDING_PROPOSALS) {
    const oldest = store.proposals.keys().next().value as string | undefined;
    if (!oldest) break;
    store.proposals.delete(oldest);
  }
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
  cleanProposalStore();
  const url = new URL(request.url);
  const proposalId = url.searchParams.get("proposalId");
  if (proposalId) {
    const proposal = proposalStore().proposals.get(proposalId);
    if (!proposal) {
      return noStoreJson({ error: "This AI proposal expired or is no longer available." }, { status: 404 });
    }
    return noStoreJson({ proposal });
  }
  if (url.searchParams.get("status") === "pending") {
    const proposals = [...proposalStore().proposals.values()]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .map((proposal) => ({
        id: proposal.id,
        chartId: proposal.chartId,
        chartName: proposal.chartName,
        changeSummary: proposal.changeSummary,
        createdAt: proposal.createdAt,
        expiresAt: proposal.expiresAt,
        summary: proposal.summary,
      }));
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
  cleanProposalStore();
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
    if (!current) return noStoreJson({ error: "Chart not found." }, { status: 404 });
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
    const { changes, summary } = diffChartDocuments(current, proposed);
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
      expiresAt: new Date(createdAt.getTime() + PROPOSAL_TTL_MS).toISOString(),
      current,
      proposed: {
        ...proposed,
        createdAt: current.createdAt,
        sources: current.sources,
        nodes: storageSafeNodes(proposed.nodes),
      },
      changes,
      summary,
    };
    proposalStore().proposals.set(proposal.id, proposal);
    return noStoreJson({ proposal }, { status: 201 });
  }

  if ((body.action === "accept" || body.action === "reject") && body.proposalId) {
    const store = proposalStore();
    const proposal = store.proposals.get(body.proposalId);
    if (!proposal) {
      return noStoreJson({ error: "This AI proposal expired or is no longer available." }, { status: 404 });
    }
    const current = await loadCurrentChart(DB, proposal.chartId);
    if (!current) return noStoreJson({ error: "Chart not found." }, { status: 404 });
    if (current.version !== proposal.current.version || current.updatedAt !== proposal.current.updatedAt) {
      store.proposals.delete(proposal.id);
      return noStoreJson(
        { error: "The chart changed after this AI proposal was created. Ask the AI to prepare a fresh proposal." },
        { status: 409 },
      );
    }

    const createdAt = new Date().toISOString();
    const activityId = `ai-event-${crypto.randomUUID()}`;
    if (body.action === "reject") {
      await DB.prepare(
        `INSERT INTO ai_activity_events
          (id, chart_id, proposal_id, operation, status, summary, change_count,
           changed_node_ids, changed_edge_ids, created_at)
         VALUES (?, ?, ?, ?, 'rejected', ?, ?, ?, ?, ?)`,
      )
        .bind(
          activityId,
          proposal.chartId,
          proposal.id,
          proposal.operation,
          proposal.summary.text,
          proposal.summary.total,
          JSON.stringify(proposal.summary.changedNodeIds),
          JSON.stringify(proposal.summary.changedEdgeIds),
          createdAt,
        )
        .run();
      store.proposals.delete(proposal.id);
      return noStoreJson({ rejected: proposal.id });
    }

    const proposed = proposal.proposed;
    const updatedAt = new Date().toISOString();
    const result = await DB.prepare(
      `UPDATE charts
       SET name = ?, description = ?, status = ?, updated_at = ?, payload = ?
       WHERE id = ? AND version = ? AND updated_at = ?`,
    )
      .bind(
        proposed.name,
        proposed.description,
        proposed.status,
        updatedAt,
        JSON.stringify({ nodes: storageSafeNodes(proposed.nodes), edges: proposed.edges }),
        proposal.chartId,
        proposal.current.version,
        proposal.current.updatedAt,
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      store.proposals.delete(proposal.id);
      return noStoreJson(
        { error: "The chart changed before the proposal could be applied. Ask the AI to prepare a fresh proposal." },
        { status: 409 },
      );
    }
    await DB.prepare(
      `INSERT INTO ai_activity_events
        (id, chart_id, proposal_id, operation, status, summary, change_count,
         changed_node_ids, changed_edge_ids, created_at)
       VALUES (?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?)`,
    )
      .bind(
        activityId,
        proposal.chartId,
        proposal.id,
        proposal.operation,
        proposal.summary.text,
        proposal.summary.total,
        JSON.stringify(proposal.summary.changedNodeIds),
        JSON.stringify(proposal.summary.changedEdgeIds),
        createdAt,
      )
      .run();
    store.proposals.delete(proposal.id);
    const chart: ChartDocument = {
      ...proposed,
      version: current.version,
      createdAt: current.createdAt,
      updatedAt,
      sources: current.sources,
      nodes: storageSafeNodes(proposed.nodes),
    };
    return noStoreJson({ chart, activityId });
  }

  return noStoreJson({ error: "Unsupported AI proposal action." }, { status: 400 });
}
