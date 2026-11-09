import { calendarDate } from "../../../lib/history-answers";
import { validateHierarchy } from "../../../lib/org-chart";
import { mutationGuard } from "../../../lib/proposal-decisions";
import { ensureSchema, getBindings } from "../../../db";
import {
  checkpointStatement,
  checkpointFromRow,
  checkpointSummary,
  ensureHistoryBaselines,
  type CheckpointRow,
  type MonthlyUpdate,
} from "../../../lib/chart-history";
function respond(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}
interface BatchRow {
  id: string;
  month: string;
  label: string;
  change_list: string;
  summary: string;
  effective_date: string;
  status: "open" | "completed" | "interrupted";
  started_at: string;
  completed_at: string | null;
  chart_ids: string;
}
export function batchFromRow(b: BatchRow): MonthlyUpdate {
  return {
    id: b.id,
    month: b.month,
    label: b.label,
    changeList: b.change_list,
    summary: b.summary,
    effectiveDate: b.effective_date,
    status: b.status,
    startedAt: b.started_at,
    completedAt: b.completed_at,
    chartIds: JSON.parse(b.chart_ids),
  };
}
export async function GET(request: Request) {
  const { DB } = getBindings();
  await ensureSchema(DB);
  await ensureHistoryBaselines(DB);
  const url = new URL(request.url),
    id = url.searchParams.get("checkpointId");
  if (id) {
    const row = await DB.prepare("SELECT * FROM chart_checkpoints WHERE id=?")
      .bind(id)
      .first<CheckpointRow>();
    return row
      ? respond({ checkpoint: checkpointFromRow(row) })
      : respond({ error: "Checkpoint not found." }, 404);
  }
  const chartId = url.searchParams.get("chartId") || "",
    month = url.searchParams.get("month") || "",
    q = (url.searchParams.get("q") || "").slice(0, 200).toLowerCase(),
    through = url.searchParams.get("through") || "";
  if (through && !Number.isFinite(Date.parse(through)))
    return respond({ error: "Choose a valid recorded-through date." }, 422);
  const result = await DB.prepare(
    `SELECT id,chart_id,chart_name,recorded_at,source_updated_at,kind,label,batch_id,effective_date FROM chart_checkpoints WHERE (?='' OR chart_id=?) AND (?='' OR COALESCE((SELECT month FROM monthly_updates m WHERE m.id=batch_id),substr(recorded_at,1,7))=?) AND (?='' OR instr(lower(payload),?)>0) AND (?='' OR julianday(recorded_at)<=julianday(?)) ORDER BY sequence DESC LIMIT 2000`,
  )
    .bind(chartId, chartId, month, month, q, q, through, through)
    .all<CheckpointRow>();
  const batches = await DB.prepare(
    "SELECT * FROM monthly_updates ORDER BY started_at DESC",
  ).all<BatchRow>();
  const months = await DB.prepare(
    "SELECT DISTINCT COALESCE((SELECT month FROM monthly_updates m WHERE m.id=batch_id),substr(recorded_at,1,7)) AS month FROM chart_checkpoints ORDER BY month DESC",
  ).all<{ month: string }>();
  return respond({
    checkpoints: result.results.map(checkpointSummary),
    batches: batches.results.map(batchFromRow),
    months: months.results.map((x) => x.month),
    limit: 2000,
  });
}
export async function POST(request: Request) {
  const { DB } = getBindings();
  await ensureSchema(DB);
  const b = (await request.json()) as {
    action?: string;
    month?: string;
    label?: string;
    changeList?: string;
    summary?: string;
    effectiveDate?: string;
    chartIds?: string[];
    batchId?: string;
  };
  if (b.action === "begin") {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(b.month || ""))
      return respond({ error: "Choose a valid update month." }, 422);
    if (!b.label?.trim() || !b.changeList?.trim())
      return respond(
        { error: "Provide a label and monthly change list." },
        422,
      );
    if (b.effectiveDate && !calendarDate(b.effectiveDate))
      return respond(
        { error: "Effective date must be YYYY-MM-DD, or blank when unknown." },
        422,
      );
    const open = await DB.prepare(
      "SELECT id FROM monthly_updates WHERE status='open'",
    ).first();
    if (open)
      return respond(
        { error: "Complete the open monthly update before starting another." },
        409,
      );
    const rows = await DB.prepare(
      "SELECT id,updated_at FROM charts WHERE status<>'archived'",
    ).all<{ id: string; updated_at: string }>();
    const selected = b.chartIds?.length ? new Set(b.chartIds) : null,
      charts = rows.results.filter((x) => !selected || selected.has(x.id));
    if (!charts.length || (selected && charts.length !== selected.size))
      return respond(
        { error: "Choose existing active charts for this update." },
        422,
      );
    const batch: MonthlyUpdate = {
      id: `monthly-${crypto.randomUUID()}`,
      month: b.month!,
      label: b.label.trim().slice(0, 160),
      changeList: b.changeList.trim().slice(0, 20000),
      summary: "",
      effectiveDate: b.effectiveDate || "",
      status: "open",
      startedAt: new Date().toISOString(),
      completedAt: null,
      chartIds: charts.map((x) => x.id),
    };
    try {
      await DB.batch([
        DB.prepare(
          `INSERT INTO monthly_updates (id,month,label,change_list,summary,effective_date,status,started_at,completed_at,chart_ids) VALUES (?,?,?,?,'',?,'open',?,NULL,?)`,
        ).bind(
          batch.id,
          batch.month,
          batch.label,
          batch.changeList,
          batch.effectiveDate,
          batch.startedAt,
          JSON.stringify(batch.chartIds),
        ),
        ...charts.map((x) =>
          checkpointStatement(DB, x.id, null, "monthly_before", batch.label, {
            batchId: batch.id,
            effectiveDate: batch.effectiveDate,
          }),
        ),
      ]);
    } catch {
      return respond(
        {
          error:
            "The monthly update could not begin. Refresh and check for another open update.",
        },
        409,
      );
    }
    return respond({ batch }, 201);
  }
  if (b.action === "complete" && b.batchId) {
    const row = await DB.prepare(
      "SELECT * FROM monthly_updates WHERE id=? AND status='open'",
    )
      .bind(b.batchId)
      .first<BatchRow>();
    if (!row) return respond({ error: "Open monthly update not found." }, 409);
    if (!b.summary?.trim())
      return respond({ error: "Provide a completion summary." }, 422);
    const batch = batchFromRow(row),
      ids = new Set(batch.chartIds),
      pending = await DB.prepare(
        "SELECT chart_id FROM ai_chart_proposals WHERE status='pending'",
      ).all<{ chart_id: string }>();
    if (pending.results.some((x) => ids.has(x.chart_id)))
      return respond(
        {
          error:
            "Review the pending proposals in this update before completing it.",
        },
        409,
      );
    const rows = await DB.prepare(
        "SELECT id,version,updated_at,payload FROM charts",
      ).all<{
        id: string;
        version: number;
        updated_at: string;
        payload: string;
      }>(),
      charts = rows.results.filter((x) => ids.has(x.id));
    if (charts.length !== ids.size)
      return respond({ error: "A chart in this update is missing." }, 409);
    for (const chart of charts) {
      const payload = JSON.parse(chart.payload);
      if (
        validateHierarchy(payload.nodes, payload.edges).some(
          (f) => f.severity === "blocking",
        )
      )
        return respond(
          {
            error:
              "Resolve structural blockers before completing the monthly update.",
          },
          422,
        );
    }
    const completedAt = new Date().toISOString();
    const guards = charts.map(() => `complete-${crypto.randomUUID()}`),
      scopeGuard = `complete-scope-${crypto.randomUUID()}`;
    let results;
    try {
      results = await DB.batch([
        DB.prepare(
          `INSERT INTO mutation_guards(id,ok) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM monthly_updates WHERE id=? AND status='open' AND chart_ids=?) AND NOT EXISTS(SELECT 1 FROM ai_chart_proposals WHERE status='pending' AND chart_id IN(SELECT value FROM json_each(?))) THEN 1 ELSE 0 END)`,
        ).bind(scopeGuard, batch.id, row.chart_ids, row.chart_ids),
        ...charts.map((c, i) =>
          mutationGuard(
            DB,
            guards[i],
            c.id,
            c.version,
            c.updated_at,
            null,
            batch.id,
          ),
        ),
        ...charts.map((x) =>
          checkpointStatement(
            DB,
            x.id,
            null,
            "monthly_after",
            b.summary!.trim(),
            {
              batchId: batch.id,
              effectiveDate: batch.effectiveDate,
              onlyOpenBatch: true,
            },
          ),
        ),
        DB.prepare(
          "UPDATE monthly_updates SET status='completed',completed_at=?,summary=? WHERE id=? AND status='open'",
        ).bind(completedAt, b.summary.trim().slice(0, 20000), batch.id),
        ...[...guards, scopeGuard].map((id) =>
          DB.prepare("DELETE FROM mutation_guards WHERE id=?").bind(id),
        ),
      ]);
    } catch {
      return respond(
        {
          error:
            "The update changed during final checks. Nothing was completed; refresh and review pending work.",
        },
        409,
      );
    }
    if ((results[results.length - guards.length - 2].meta.changes ?? 0) !== 1)
      return respond(
        { error: "The monthly update was already completed." },
        409,
      );
    return respond({
      batch: {
        ...batch,
        status: "completed",
        completedAt,
        summary: b.summary.trim().slice(0, 20000),
      },
    });
  }
  return respond({ error: "Unsupported history action." }, 400);
}
