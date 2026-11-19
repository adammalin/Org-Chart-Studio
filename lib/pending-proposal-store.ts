import type { AiChartProposal, AiPendingProposalSummary } from "./ai-change-review";

// Full proposals live on disk; frequent queue polling reads only the small index.
export async function listPendingProposalSummaries(db: D1Database): Promise<AiPendingProposalSummary[]> {
  const rows = await db.prepare(
    `SELECT id, chart_id, chart_name, change_summary, created_at, summary
     FROM ai_chart_proposals WHERE status = 'pending'
     ORDER BY chart_name COLLATE NOCASE, created_at DESC`,
  ).all<{ id: string; chart_id: string; chart_name: string; change_summary: string | null;
    created_at: string; summary: string }>();
  return rows.results.map((row) => {
    const summary = JSON.parse(row.summary);
    return {
    id: row.id, chartId: row.chart_id, chartName: row.chart_name,
    changeSummary: row.change_summary, createdAt: row.created_at, expiresAt: null,
    summary,
    proposedStatus: summary.proposedStatus,
  }; });
}

export async function getPendingProposal(db: D1Database, id: string): Promise<AiChartProposal | null> {
  const row = await db.prepare("SELECT payload FROM ai_chart_proposals WHERE id = ? AND status = 'pending'")
    .bind(id).first<{ payload: string }>();
  return row ? JSON.parse(row.payload) as AiChartProposal : null;
}

export async function savePendingProposal(db: D1Database, proposal: AiChartProposal) {
  // D1 batches are transactional: failed inserts preserve the previous pending review.
  await db.batch([
    db.prepare("UPDATE ai_chart_proposals SET status = 'superseded' WHERE chart_id = ? AND status = 'pending'")
      .bind(proposal.chartId),
    db.prepare(`INSERT INTO ai_chart_proposals
      (id, chart_id, chart_name, change_summary, created_at, status, summary, payload)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`)
      .bind(proposal.id, proposal.chartId, proposal.chartName, proposal.changeSummary,
        proposal.createdAt, JSON.stringify({ ...proposal.summary, proposedStatus: proposal.proposed.status }), JSON.stringify(proposal)),
  ]);
}

export async function finishPendingProposal(db: D1Database, id: string, status: "accepted" | "rejected" | "stale") {
  await db.prepare("UPDATE ai_chart_proposals SET status = ? WHERE id = ? AND status = 'pending'")
    .bind(status, id).run();
}
