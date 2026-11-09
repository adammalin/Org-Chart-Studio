import { ensureSchema, getBindings } from "../../../../db";
import {
  ensureHistoryBaselines,
  checkpointFromRow,
  type CheckpointRow,
} from "../../../../lib/chart-history";
import {
  parseHistoryQuestion,
  roleAnswers,
  changeAnswers,
  type HistoryQuestion,
} from "../../../../lib/history-answers";
function respond(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}
export async function POST(request: Request) {
  const input = (await request.json()) as HistoryQuestion;
  let parsed;
  try {
    parsed = parseHistoryQuestion(input);
  } catch (error) {
    return respond({ error: (error as Error).message }, 422);
  }
  const { DB } = getBindings();
  await ensureSchema(DB);
  await ensureHistoryBaselines(DB);
  const available = await DB.prepare(
    "SELECT id FROM charts WHERE (?=1 OR status<>'archived')",
  )
    .bind(input.includeArchived ? 1 : 0)
    .all<{ id: string }>();
  const allowed = new Set(input.scopeIds ?? available.results.map((c) => c.id));
  const ids = available.results
    .map((c) => c.id)
    .filter(
      (id) => allowed.has(id) && (!input.chartId || input.chartId === id),
    );
  if (!ids.length)
    return respond({
      parsed,
      roles: [],
      changes: [],
      gaps: [],
      message: "No charts match the selected scope.",
    });
  const placeholders = ids.map(() => "?").join(",");
  async function latest(date: string) {
    return (
      await DB.prepare(
        `SELECT * FROM (SELECT h.*,ROW_NUMBER() OVER(PARTITION BY chart_id ORDER BY julianday(recorded_at) DESC,sequence DESC) AS rank FROM chart_checkpoints h WHERE chart_id IN (${placeholders}) AND julianday(recorded_at)<=julianday(?)) WHERE rank=1`,
      )
        .bind(...ids, date + "T23:59:59.999Z")
        .all<CheckpointRow>()
    ).results.map(checkpointFromRow);
  }
  const after = await latest(parsed.asOf);
  const missing = ids.filter((id) => !after.some((h) => h.chartId === id));
  const note =
    "Answers describe saved evidence. Recorded dates and documented organizational effective dates are different; missing effective dates and source disagreements are not resolved by this answer.";
  if (parsed.mode === "changes") {
    const before = await latest(parsed.since);
    const result = changeAnswers(before, after, parsed);
    return respond({
      parsed,
      ...result,
      missingCharts: missing,
      note,
      message: !result.changes.length
        ? "No differences were found within the available comparison coverage. Check gaps before concluding that no organizational changes occurred."
        : undefined,
    });
  }
  let snapshots = after;
  if (parsed.period) {
    const inside = await DB.prepare(
      `SELECT * FROM chart_checkpoints WHERE chart_id IN (${placeholders}) AND julianday(recorded_at)>=julianday(?) AND julianday(recorded_at)<=julianday(?) ORDER BY sequence LIMIT 501`,
    )
      .bind(...ids, parsed.since + "T00:00:00Z", parsed.asOf + "T23:59:59.999Z")
      .all<CheckpointRow>();
    if (inside.results.length > 500)
      return respond(
        {
          error:
            "This period contains more than 500 checkpoints. Choose a specific chart or a shorter period.",
        },
        413,
      );
    const previous = new Date(parsed.since + "T00:00:00Z");
    previous.setUTCDate(previous.getUTCDate() - 1);
    snapshots = [
      ...(await latest(previous.toISOString().slice(0, 10))),
      ...inside.results.map(checkpointFromRow),
    ];
  }
  const roles = roleAnswers(snapshots, parsed);
  return respond({
    parsed,
    roles,
    missingCharts: missing,
    note,
    message: roles.length
      ? undefined
      : "No matching recorded assignment was found for this date and scope. Later checkpoints cannot establish who held the role earlier.",
  });
}
