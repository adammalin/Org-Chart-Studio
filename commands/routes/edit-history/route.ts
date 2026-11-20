import { z } from "zod";
import { ensureSchema, getBindings } from "../../../db";
import {
  contentFromState,
  editHistoryStatus,
  EditHistoryError,
  editDocument,
  inverseEdit,
  operationSummary,
  readEditChart,
  replayEdit,
  restoredEdit,
  reversibleContent,
  type EditOperation,
} from "../../../lib/edit-history";
import { diffChartDocuments } from "../../../lib/ai-change-review";

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
const error = (e: unknown) =>
  json(
    { error: e instanceof EditHistoryError ? e.message : e instanceof SyntaxError ? "The request is not valid JSON." : "History request failed. Refresh the saved workspace and try again." },
    e instanceof EditHistoryError ? e.status : e instanceof SyntaxError ? 400 : 500,
  );
export async function GET(request: Request) {
  try {
    const { DB } = getBindings();
    await ensureSchema(DB);
    const p = new URL(request.url).searchParams,
      chartId = p.get("chartId");
    if (!chartId) throw new EditHistoryError(400, "Select a chart.");
    const chart = await readEditChart(DB, chartId),
      status = await editHistoryStatus(DB, chartId);
    if (p.get("operationId")) {
      const op = await DB.prepare(
        "SELECT * FROM chart_edit_operations WHERE id=? AND chart_id=?",
      )
        .bind(p.get("operationId"), chartId)
        .first<EditOperation>();
      if (!op)
        throw new EditHistoryError(
          404,
          "History action not found for this chart.",
        );
      const before = editDocument(JSON.parse(op.before_state)),
        after = editDocument(JSON.parse(op.after_state));
      const detail = {
        ...operationSummary(op),
        changes: diffChartDocuments(before, after).changes,
      };
      if (p.get("previewRevert") === "1") {
        if (!op.reversible || op.state !== "applied")
          throw new EditHistoryError(
            409,
            "Only an applied content operation can be reverted.",
          );
        const content = inverseEdit(
          contentFromState(op.before_state),
          contentFromState(op.after_state),
          reversibleContent(chart),
        ) as ReturnType<typeof reversibleContent>;
        const proposed = restoredEdit(chart, content);
        if (
          (proposed.libraryParentId ?? null) !== (chart.libraryParentId ?? null)
        )
          throw new EditHistoryError(
            409,
            "This operation changes the library directory. Undo it in order or change its parent through the library controls.",
          );
        // Reviewed reverts cannot change archive state through an AI proposal.
        if (proposed.status === "archived" || chart.status === "archived")
          throw new EditHistoryError(
            423,
            "Unarchive through the normal chart controls before staging a content revert.",
          );
        return json({
          ...status,
          operation: detail,
          chart,
          proposed,
          changes: diffChartDocuments(chart, proposed).changes,
        });
      }
      return json({
        ...status,
        operation: detail,
        expectedVersion: chart.version,
        expectedUpdatedAt: chart.updatedAt,
      });
    }
    const before = Number(p.get("before") ?? Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(before) || before < 1)
      throw new EditHistoryError(400, "Invalid history cursor.");
    const rows = await DB.prepare(
      "SELECT sequence,id,chart_id,actor,label,group_id,recorded_at,reversible,state FROM chart_edit_operations WHERE chart_id=? AND sequence<? ORDER BY sequence DESC LIMIT 51",
    )
      .bind(chartId, before)
      .all<EditOperation>();
    const events = await DB.prepare(
      "SELECT id,operation_id,action,actor,recorded_at FROM chart_edit_events WHERE chart_id=? ORDER BY sequence DESC LIMIT 50",
    )
      .bind(chartId)
      .all();
    return json({
      ...status,
      chartId,
      ...(p.get("includeChart") === "1" ? { chart } : {}),
      ...(p.get("receiptId")
        ? {
            receipt: await DB.prepare(
              "SELECT id,action,operation_id FROM chart_edit_events WHERE chart_id=? AND id=?",
            )
              .bind(chartId, p.get("receiptId"))
              .first(),
          }
        : {}),
      expectedVersion: chart.version,
      expectedUpdatedAt: chart.updatedAt,
      operations: rows.results.slice(0, 50).map(operationSummary),
      nextCursor: rows.results.length > 50 ? rows.results[49].sequence : null,
      events: events.results,
    });
  } catch (e) {
    return error(e);
  }
}
export async function POST(request: Request) {
  try {
    const parsed = z
      .object({
        action: z.enum(["undo", "redo"]),
        chartId: z.string().min(1).max(200),
        operationId: z.string().min(1).max(200),
        expectedRevision: z.string().min(1).max(200),
        expectedUpdatedAt: z.string().min(1).max(100),
        expectedVersion: z.number().int().positive(),
        requestId: z.string().regex(/^history-request-[a-zA-Z0-9-]{1,100}$/),
      })
      .safeParse(await request.json());
    if (!parsed.success)
      throw new EditHistoryError(
        400,
        "A chart, exact operation, saved revision and request ID are required.",
      );
    const b = parsed.data;
    const { DB } = getBindings();
    await ensureSchema(DB);
    return json(
      await replayEdit(
        DB,
        { ...b, direction: b.action },
        request.headers.get("x-orgchart-actor") === "agent" ? "agent" : "user",
      ),
    );
  } catch (e) {
    return error(e);
  }
}
