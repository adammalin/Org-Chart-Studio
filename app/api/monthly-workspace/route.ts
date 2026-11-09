import { ensureSchema, getBindings } from "../../../db";
import { GET as chartLibrary } from "../charts/route";
import { GET as historyIndex, POST as monthlyAction } from "../history/route";
import type { ChartLibraryResponse } from "../../../lib/chart-library";
import type { MonthlyUpdate } from "../../../lib/chart-history";
import { auditPortfolio } from "../../../lib/portfolio-consistency";
import { validateHierarchy } from "../../../lib/org-chart";
import {
  decideProposals,
  DecisionError,
  mutationGuard,
} from "../../../lib/proposal-decisions";
import { checkpointStatement } from "../../../lib/chart-history";
function respond(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}
export async function GET(request: Request) {
  const { DB } = getBindings();
  await ensureSchema(DB);
  const [{ charts }, history] = await Promise.all([
    chartLibrary(new Request("http://127.0.0.1/api/charts")).then((r) =>
      r.json(),
    ) as Promise<ChartLibraryResponse>,
    historyIndex(
      new Request("http://127.0.0.1/api/history?chartId=__metadata_only__"),
    ).then((r) => r.json()) as Promise<{ batches: MonthlyUpdate[] }>,
  ]);
  const id = new URL(request.url).searchParams.get("batchId");
  const batch = id
    ? history.batches.find((b) => b.id === id)
    : (history.batches.find((b) => b.status === "open") ?? history.batches[0]);
  if (!batch) return respond({ batches: history.batches, report: null });
  const ids = new Set(batch.chartIds);
  const finalStates = batch.status === "completed"
    ? await DB.prepare("SELECT payload FROM chart_checkpoints WHERE batch_id=? AND kind='monthly_after' ORDER BY sequence").bind(batch.id).all<{ payload: string }>()
    : null;
  const reviewCharts = finalStates
    ? [...new Map(finalStates.results.map(row => { const c = JSON.parse(row.payload) as ChartLibraryResponse["charts"][number]; return [c.id, c] as const; })).values()]
    : charts;
  const included = reviewCharts.filter((c) => ids.has(c.id));
  const pending = await DB.prepare(
    "SELECT id,chart_id,chart_name,summary,created_at FROM ai_chart_proposals WHERE status='pending'",
  ).all<{
    id: string;
    chart_id: string;
    chart_name: string;
    summary: string;
    created_at: string;
  }>();
  const checkpoints = await DB.prepare(
    "SELECT id,chart_id,kind,label,recorded_at FROM chart_checkpoints WHERE batch_id=? ORDER BY sequence",
  )
    .bind(batch.id)
    .all<{
      id: string;
      chart_id: string;
      kind: string;
      label: string;
      recorded_at: string;
    }>();
  const activities = await DB.prepare(
    "SELECT chart_id,status,change_count,created_at FROM ai_activity_events WHERE julianday(created_at)>=julianday(?) AND (? IS NULL OR julianday(created_at)<=julianday(?))",
  )
    .bind(batch.startedAt, batch.completedAt, batch.completedAt)
    .all<{
      chart_id: string;
      status: string;
      change_count: number;
      created_at: string;
    }>();
  const decisions = activities.results.filter((a) => ids.has(a.chart_id));
  const issues = auditPortfolio(reviewCharts).filter((i) =>
    i.appearances.some((a) => ids.has(a.chartId)),
  );
  const rows = included.map((c) => ({
    chartId: c.id,
    name: c.name,
    status: c.status,
    version: c.version,
    updatedAt: c.updatedAt,
    blockingIssues: validateHierarchy(c.nodes, c.edges).filter(
      (f) => f.severity === "blocking",
    ).length,
    sourceNotes:
      c.nodes.filter((n) => n.data.unit.sourceCertainty === "needs_review")
        .length +
      c.edges.filter((e) => e.data?.sourceCertainty === "needs_review").length,
    missingDates: c.nodes.filter(
      (n) =>
        !n.data.unit.effectiveDate ||
        /not specified|unknown|^current$/i.test(n.data.unit.effectiveDate),
    ).length,
    sourceLocators: c.nodes.filter((n) => !!n.data.unit.sourceLocator).length,
    cards: c.nodes.length,
    changed: checkpoints.results.some(
      (h) => h.chart_id === c.id && h.kind === "after",
    ),
    lastCheckpoint:
      checkpoints.results.filter((h) => h.chart_id === c.id).at(-1) ?? null,
    pending: pending.results
      .filter((p) => batch.status === "open" && p.chart_id === c.id)
      .map((p) => ({
        id: p.id,
        chartName: p.chart_name,
        summary: JSON.parse(p.summary),
        createdAt: p.created_at,
      })),
  }));
  return respond({
    batches: history.batches,
    report: {
      batch,
      stateBasis: finalStates ? "completed_checkpoints" : "live_saved_charts",
      rows,
      issues,
      decisions,
      checkpoints: checkpoints.results,
      pendingCount: rows.reduce((n, r) => n + r.pending.length, 0),
      changedCharts: rows.filter((r) => r.changed).length,
      currentCharts: rows.filter((r) => r.status === "current").length,
      blockingIssues: rows.reduce((n, r) => n + r.blockingIssues, 0),
      outsideCharts: charts
        .filter((c) => c.status !== "archived" && !ids.has(c.id))
        .map((c) => ({ id: c.id, name: c.name })),
    },
  });
}
export async function POST(request: Request) {
  const body = (await request.json()) as {
    action?: string;
    batchId?: string;
    proposalIds?: string[];
    decision?: "accept" | "reject";
    chartIds?: string[];
  };
  const { DB } = getBindings();
  await ensureSchema(DB);
  if (
    body.action === "review_batch" &&
    body.batchId &&
    body.proposalIds &&
    (body.decision === "accept" || body.decision === "reject")
  ) {
    try {
      return respond(
        await decideProposals(
          DB,
          body.proposalIds,
          body.decision,
          body.batchId,
        ),
      );
    } catch (error) {
      return respond(
        {
          error:
            error instanceof Error ? error.message : "Review decision failed.",
        },
        error instanceof DecisionError ? error.status : 500,
      );
    }
  }
  if (
    body.action === "include_charts" &&
    body.batchId &&
    Array.isArray(body.chartIds)
  ) {
    const b = await DB.prepare(
      "SELECT chart_ids,label,effective_date FROM monthly_updates WHERE id=? AND status='open'",
    )
      .bind(body.batchId)
      .first<{ chart_ids: string; label: string; effective_date: string }>();
    if (!b) return respond({ error: "Open monthly update not found." }, 409);
    const old = JSON.parse(b.chart_ids) as string[],
      add = [...new Set(body.chartIds)].filter((id) => !old.includes(id));
    if (!add.length || add.length + old.length > 200)
      return respond(
        { error: "Choose new active charts, up to 200 charts in one update." },
        422,
      );
    const statements: D1PreparedStatement[] = [],
      guards: string[] = [];
    for (const id of add) {
      const c = await DB.prepare(
        "SELECT version,updated_at FROM charts WHERE id=? AND status<>'archived'",
      )
        .bind(id)
        .first<{ version: number; updated_at: string }>();
      if (!c)
        return respond(
          { error: "A selected chart is unavailable or archived." },
          422,
        );
      const guard = `include-${crypto.randomUUID()}`;
      guards.push(guard);
      statements.push(
        mutationGuard(
          DB,
          guard,
          id,
          c.version,
          c.updated_at,
          null,
          body.batchId,
        ),
      );
      statements.push(
        checkpointStatement(
          DB,
          id,
          c.updated_at,
          "monthly_joined",
          `Joined update: ${b.label}`,
          { batchId: body.batchId, effectiveDate: b.effective_date },
        ),
      );
    }
    const guard = `scope-${crypto.randomUUID()}`;
    statements.unshift(
      DB.prepare(
        "INSERT INTO mutation_guards(id,ok) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM monthly_updates WHERE id=? AND chart_ids=? AND status='open') THEN 1 ELSE 0 END)",
      ).bind(guard, body.batchId, b.chart_ids),
    );
    guards.push(guard);
    statements.push(
      DB.prepare("UPDATE monthly_updates SET chart_ids=? WHERE id=?").bind(
        JSON.stringify([...old, ...add]),
        body.batchId,
      ),
      ...guards.map((id) =>
        DB.prepare("DELETE FROM mutation_guards WHERE id=?").bind(id),
      ),
    );
    try {
      await DB.batch(statements);
    } catch {
      return respond(
        { error: "The update scope changed. Refresh and try again." },
        409,
      );
    }
    return respond({ included: add });
  }
  if (body.action === "begin" || body.action === "complete")
    return monthlyAction(
      new Request(request.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  return respond({ error: "Unsupported monthly workspace action." }, 400);
}
