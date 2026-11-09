import type { ChartDocument } from "./chart-library";
import {
  normalizeChartLifecycle,
  normalizeChartStatus,
  storageSafeNodes,
} from "./chart-library";
import { getPendingProposal } from "./pending-proposal-store";
import { checkpointStatement } from "./chart-history";
import {
  appliedProposalStatus,
  archiveProposalError,
} from "./proposal-lifecycle";
import { validateHierarchy } from "./org-chart";
export class DecisionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function mutationGuard(
  db: D1Database,
  id: string,
  chartId: string,
  version: number,
  updatedAt: string,
  proposalId: string | null = null,
  batchId: string | null = null,
) {
  return db
    .prepare(
      `INSERT INTO mutation_guards(id,ok) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM charts WHERE id=? AND version=? AND updated_at=?) AND (? IS NULL OR EXISTS(SELECT 1 FROM ai_chart_proposals WHERE id=? AND status='pending')) AND (? IS NULL OR EXISTS(SELECT 1 FROM monthly_updates WHERE id=? AND status='open')) THEN 1 ELSE 0 END)`,
    )
    .bind(
      id,
      chartId,
      version,
      updatedAt,
      proposalId,
      proposalId,
      batchId,
      batchId,
    );
}
export async function decideProposals(
  db: D1Database,
  ids: string[],
  decision: "accept" | "reject",
  batchId?: string,
) {
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 10 ||
    new Set(ids).size !== ids.length || ids.some(id=>typeof id!=="string"||!id||id.length>200)
  )
    throw new DecisionError(
      422,
      "Select between one and ten distinct proposals per atomic decision.",
    );
  const proposals = [];
  for (const id of ids) {
    const p = await getPendingProposal(db, id);
    if (!p)
      throw new DecisionError(
        409,
        "A selected proposal is no longer pending. Refresh the review list.",
      );
    proposals.push(p);
  }
  if (JSON.stringify(proposals).length > 8_000_000)
    throw new DecisionError(
      413,
      "This group is too large for one decision. Review fewer charts at a time.",
    );
  if (new Set(proposals.map((p) => p.chartId)).size !== proposals.length)
    throw new DecisionError(
      422,
      "Only one proposal per chart may be decided at a time.",
    );
  if (batchId) {
    const b = await db
      .prepare(
        "SELECT chart_ids FROM monthly_updates WHERE id=? AND status='open'",
      )
      .bind(batchId)
      .first<{ chart_ids: string }>();
    if (
      !b ||
      proposals.some((p) => !JSON.parse(b.chart_ids).includes(p.chartId))
    )
      throw new DecisionError(
        409,
        "These proposals are not all in the open monthly update.",
      );
  }
  const statements: D1PreparedStatement[] = [],
    charts: ChartDocument[] = [],
    activities: string[] = [],
    guards: string[] = [];
  const at = new Date().toISOString();
  for (const p of proposals) {
    const row = await db
      .prepare("SELECT * FROM charts WHERE id=?")
      .bind(p.chartId)
      .first<{
        id: string;
        name: string;
        description: string;
        status: string;
        version: number;
        created_at: string;
        updated_at: string;
        payload: string;
      }>();
    if (!row)
      throw new DecisionError(404, "A selected chart no longer exists.");
    const payload = JSON.parse(row.payload),
      status = normalizeChartStatus(row.status);
    const current: ChartDocument = {
      id: row.id,
      name: row.name,
      description: row.description,
      status,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...payload,
      lifecycle: normalizeChartLifecycle(
        payload.lifecycle,
        status,
        row.updated_at,
        row.version,
      ),
      sources: p.current.sources,
    };
    if (
      decision === "accept" &&
      (status === "archived" ||
        row.version !== p.current.version ||
        row.updated_at !== p.current.updatedAt)
    )
      throw new DecisionError(
        409,
        `The saved chart changed. Prepare a fresh proposal for ${row.name}. No selected changes were applied.`,
      );
    const guard = `decision-${crypto.randomUUID()}`;
    guards.push(guard);
    statements.push(
      mutationGuard(
        db,
        guard,
        row.id,
        row.version,
        row.updated_at,
        p.id,
        batchId ?? null,
      ),
    );
    const activityId = `ai-event-${crypto.randomUUID()}`;
    activities.push(activityId);
    if (decision === "accept") {
      const archiveError = archiveProposalError(current, p.proposed);
      if (archiveError) throw new DecisionError(422, archiveError);
      if (
        validateHierarchy(p.proposed.nodes, p.proposed.edges).some(
          (f) => f.severity === "blocking",
        )
      )
        throw new DecisionError(
          422,
          "A selected proposal has structural blockers.",
        );
      const target = appliedProposalStatus(status, p.proposed.status),
        next: ChartDocument = {
          ...p.proposed,
          id: current.id,
          version: current.version,
          createdAt: current.createdAt,
          updatedAt: at,
          status: target,
          libraryParentId: current.libraryParentId,
          lifecycle: {
            ...current.lifecycle,
            statusChangedAt:
              target !== status ? at : current.lifecycle.statusChangedAt,
          },
          sources: current.sources,
          nodes: storageSafeNodes(p.proposed.nodes),
        };
      charts.push(next);
      statements.push(
        checkpointStatement(
          db,
          row.id,
          row.updated_at,
          "before",
          p.changeSummary || p.summary.text,
        ),
      );
      statements.push(
        db
          .prepare(
            "UPDATE charts SET name=?,description=?,status=?,updated_at=?,payload=? WHERE id=?",
          )
          .bind(
            next.name,
            next.description,
            next.status,
            at,
            JSON.stringify({
              nodes: next.nodes,
              edges: next.edges,
              lifecycle: next.lifecycle,
              libraryParentId: next.libraryParentId,
            }),
            row.id,
          ),
      );
      statements.push(
        checkpointStatement(
          db,
          row.id,
          at,
          "after",
          p.changeSummary || p.summary.text,
        ),
      );
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO ai_activity_events(id,chart_id,proposal_id,operation,status,summary,change_count,changed_node_ids,changed_edge_ids,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          activityId,
          p.chartId,
          p.id,
          p.operation,
          decision === "accept" ? "accepted" : "rejected",
          p.summary.text,
          p.summary.total,
          JSON.stringify(p.summary.changedNodeIds),
          JSON.stringify(p.summary.changedEdgeIds),
          at,
        ),
    );
    statements.push(
      db
        .prepare("UPDATE ai_chart_proposals SET status=? WHERE id=?")
        .bind(decision === "accept" ? "accepted" : "rejected", p.id),
    );
  }
  statements.push(
    ...guards.map((id) =>
      db.prepare("DELETE FROM mutation_guards WHERE id=?").bind(id),
    ),
  );
  try {
    await db.batch(statements);
  } catch {
    throw new DecisionError(
      409,
      "The decision could not be committed. No changes in this group were applied; refresh and retry after checking the saved charts.",
    );
  }
  return { charts, proposalIds: ids, activityIds: activities, decision };
}
