import {
  normalizeChartLifecycle,
  storageSafeNodes,
  type ChartDocument,
  type SourceRecord,
} from "./chart-library";
import { normalizeSupplements } from "./chart-supplements";
import { validateHierarchy } from "./org-chart";
import { checkpointStatement } from "./chart-history";
import { clearEditContext, editContext } from "./edit-history-schema";

export interface EditState {
  id: string;
  name: string;
  description: string;
  status: ChartDocument["status"];
  version: number;
  createdAt: string;
  updatedAt: string;
  payload: Pick<ChartDocument, "nodes" | "edges"> & Partial<ChartDocument>;
}
export interface EditOperation {
  sequence: number;
  id: string;
  chart_id: string;
  actor: string;
  label: string;
  group_id: string | null;
  recorded_at: string;
  before_state: string;
  after_state: string;
  reversible: number;
  state: "applied" | "undone" | "superseded";
}
export interface EditEvent {
  sequence: number;
  id: string;
  chart_id: string;
  operation_id: string;
  action: string;
  actor: string;
  recorded_at: string;
}
export class EditHistoryError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function editDocument(
  s: EditState,
  sources: SourceRecord[] = [],
): ChartDocument {
  return {
    ...s.payload,
    id: s.id,
    name: s.name,
    description: s.description,
    status: s.status,
    version: s.version,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    lifecycle: normalizeChartLifecycle(
      s.payload.lifecycle,
      s.status,
      s.updatedAt,
      s.version,
    ),
    ...normalizeSupplements(s.payload),
    sources,
  };
}
export async function readEditChart(db: D1Database, chartId: string) {
  const row = await db
    .prepare("SELECT * FROM charts WHERE id=?")
    .bind(chartId)
    .first<{
      id: string;
      name: string;
      description: string;
      status: ChartDocument["status"];
      version: number;
      created_at: string;
      updated_at: string;
      payload: string;
    }>();
  if (!row) throw new EditHistoryError(404, "Chart not found.");
  const sources = await db
    .prepare(
      `SELECT id,chart_id AS chartId,file_name AS fileName,content_type AS contentType,file_size AS fileSize,checksum,storage_key AS storageKey,source_type AS sourceType,imported_at AS importedAt,row_count AS rowCount,warning_count AS warningCount FROM source_records WHERE chart_id=?`,
    )
    .bind(chartId)
    .all<SourceRecord>();
  return editDocument(
    {
      ...row,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      payload: JSON.parse(row.payload),
    },
    sources.results,
  );
}
export const operationSummary = (op: EditOperation) => ({
  id: op.id,
  sequence: op.sequence,
  actor: op.actor,
  label: op.label,
  groupId: op.group_id,
  recordedAt: op.recorded_at,
  reversible: !!op.reversible,
  state: op.state,
});
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
// Approval/source-review records remain append-only. Content can be recovered
// without manufacturing a new approval or deleting subsequent audit evidence.
export function reversibleContent(c: ChartDocument) {
  return {
    name: c.name,
    description: c.description,
    nodes: storageSafeNodes(c.nodes),
    edges: c.edges,
    libraryParentId: c.libraryParentId ?? null,
    supportPanels: c.supportPanels ?? [],
    sourceLayout: c.sourceLayout ?? null,
    archived: c.status === "archived",
  };
}
export async function editHistoryStatus(db: D1Database, chartId: string) {
  const [undo, redo, revision] = await Promise.all([
    db
      .prepare(
        "SELECT * FROM chart_edit_operations WHERE chart_id=? AND reversible=1 AND state='applied' ORDER BY sequence DESC LIMIT 1",
      )
      .bind(chartId)
      .first<EditOperation>(),
    db
      .prepare(
        "SELECT * FROM chart_edit_operations WHERE chart_id=? AND reversible=1 AND state='undone' ORDER BY sequence ASC LIMIT 1",
      )
      .bind(chartId)
      .first<EditOperation>(),
    db
      .prepare(
        "SELECT id FROM chart_edit_events WHERE chart_id=? ORDER BY sequence DESC LIMIT 1",
      )
      .bind(chartId)
      .first<{ id: string }>(),
  ]);
  return {
    undo: undo ? operationSummary(undo) : null,
    redo: redo ? operationSummary(redo) : null,
    revision: revision?.id ?? "baseline",
  };
}

type JsonObject = { [key: string]: unknown };
const object = (v: unknown): v is JsonObject =>
  !!v && typeof v === "object" && !Array.isArray(v);
const keyed = (v: unknown[]): v is (JsonObject & { id: string })[] =>
  v.every((x) => object(x) && typeof x.id === "string") &&
  new Set(v.map((x) => (x as { id: string }).id)).size === v.length;
// Three-way inverse: only reverse fields still equal to this operation's result.
// Later edits to another person/field survive. Conflicting later edits block the
// whole revert; there is no best-effort overwrite.
export function inverseEdit(
  before: unknown,
  after: unknown,
  current: unknown,
  path = "chart",
): unknown {
  if (equal(before, after)) return current;
  if (equal(current, after)) return structuredClone(before);
  if (object(before) && object(after) && object(current)) {
    const result: JsonObject = Object.create(null);
    for (const key of new Set([
      ...Object.keys(before),
      ...Object.keys(after),
      ...Object.keys(current),
    ])) {
      const value = inverseEdit(
        before[key],
        after[key],
        current[key],
        `${path}.${key}`,
      );
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  if (
    Array.isArray(before) &&
    Array.isArray(after) &&
    Array.isArray(current) &&
    keyed(before) &&
    keyed(after) &&
    keyed(current)
  ) {
    const bm = new Map(before.map((x) => [x.id, x])),
      am = new Map(after.map((x) => [x.id, x])),
      cm = new Map(current.map((x) => [x.id, x]));
    const restored = new Map<string, unknown>();
    for (const id of new Set([...bm.keys(), ...am.keys(), ...cm.keys()])) {
      const value = inverseEdit(
        bm.get(id),
        am.get(id),
        cm.get(id),
        `${path}[${id}]`,
      );
      if (value !== undefined) restored.set(id, value);
    }
    const order = (x: { id: string }[]) => x.map((x) => x.id);
    const common = (ids: string[]) =>
      ids.filter((id) => bm.has(id) && am.has(id));
    const reordered = !equal(common(order(before)), common(order(after)));
    if (
      reordered &&
      (!equal(common(order(current)), common(order(after))) ||
        current.some((x) => !am.has(x.id)))
    )
      throw new EditHistoryError(
        409,
        `A later change conflicts with ${path} ordering. Review the changes manually.`,
      );
    let ids = order(current).filter((id) => restored.has(id));
    if (reordered) {
      const originalOrder = common(order(before));
      let index = 0;
      ids = ids.map((id) =>
        bm.has(id) && am.has(id) ? originalOrder[index++] : id,
      );
    }
    // Preserve the relative order of every surviving later addition. Insert
    // recovered records at their nearest surviving original anchor, rather
    // than moving all later additions to the end of the array.
    const beforeIds = order(before);
    for (let i = 0; i < beforeIds.length; i++) {
      const id = beforeIds[i];
      if (!restored.has(id) || ids.includes(id)) continue;
      const next = beforeIds
        .slice(i + 1)
        .find((candidate) => ids.includes(candidate));
      if (next) ids.splice(ids.indexOf(next), 0, id);
      else ids.push(id);
    }
    return ids.map((id) => restored.get(id));
  }
  throw new EditHistoryError(
    409,
    `A later change conflicts with ${path}. No content was reverted.`,
  );
}
export function contentFromState(raw: string) {
  return reversibleContent(editDocument(JSON.parse(raw)));
}
export function restoredEdit(
  current: ChartDocument,
  content: ReturnType<typeof reversibleContent>,
): ChartDocument {
  const { archived, sourceLayout, ...fields } = content;
  const next: ChartDocument = {
    ...current,
    ...fields,
    sourceLayout: sourceLayout ?? undefined,
    status: archived ? "archived" : "draft",
    sources: current.sources,
    sourceChecks: current.sourceChecks,
    lifecycle: {
      ...current.lifecycle,
      statusChangedAt: new Date().toISOString(),
    },
  };
  const blockers = validateHierarchy(next.nodes, next.edges).filter(
    (f) => f.severity === "blocking",
  );
  if (blockers.length)
    throw new EditHistoryError(
      422,
      "This recovery would create invalid reporting relationships. No changes were applied.",
    );
  normalizeSupplements(next);
  return next;
}
export async function replayEdit(
  db: D1Database,
  args: {
    chartId: string;
    direction: "undo" | "redo";
    operationId: string;
    expectedRevision: string;
    expectedVersion: number;
    expectedUpdatedAt: string;
    requestId: string;
  },
  actor = "user",
) {
  // A repeated request returns its receipt and the CURRENT chart, never replays
  // the action or hands the editor an old saved document after a lost response.
  const receipt = await db
    .prepare(
      "SELECT * FROM chart_edit_events WHERE id=? AND chart_id=? AND action=?",
    )
    .bind(args.requestId, args.chartId, args.direction)
    .first<EditEvent>();
  if (receipt) {
    if (receipt.operation_id !== args.operationId)
      throw new EditHistoryError(
        409,
        "This request ID belongs to a different history operation.",
      );
    return {
      chart: await readEditChart(db, args.chartId),
      receipt,
      alreadyApplied: true,
    };
  }
  const current = await readEditChart(db, args.chartId),
    status = await editHistoryStatus(db, args.chartId);
  if (
    current.version !== args.expectedVersion ||
    current.updatedAt !== args.expectedUpdatedAt ||
    status.revision !== args.expectedRevision
  )
    throw new EditHistoryError(
      409,
      "The chart or its history changed. Refresh and preview the latest action before retrying.",
    );
  if (status[args.direction]?.id !== args.operationId)
    throw new EditHistoryError(
      409,
      "This is no longer the next history action. Refresh history.",
    );
  const pending = await db
    .prepare(
      "SELECT id FROM ai_chart_proposals WHERE chart_id=? AND status='pending'",
    )
    .bind(args.chartId)
    .first();
  if (pending)
    throw new EditHistoryError(
      409,
      "Resolve the pending AI proposal before undoing or redoing saved changes.",
    );
  const op = await db
    .prepare("SELECT * FROM chart_edit_operations WHERE id=? AND chart_id=?")
    .bind(args.operationId, args.chartId)
    .first<EditOperation>();
  if (!op) throw new EditHistoryError(404, "History action not found.");
  const expected = contentFromState(
    args.direction === "undo" ? op.after_state : op.before_state,
  );
  if (!equal(reversibleContent(current), expected))
    throw new EditHistoryError(
      409,
      "Saved content no longer matches this history action. Use a reviewed revert instead.",
    );
  const next = restoredEdit(
    current,
    contentFromState(
      args.direction === "undo" ? op.before_state : op.after_state,
    ),
  );
  // Strictly advance timestamps even when two operations run in one millisecond.
  next.updatedAt = new Date(
    Math.max(Date.now(), Date.parse(current.updatedAt) + 1),
  ).toISOString();
  const at = next.updatedAt,
    label = `${args.direction === "undo" ? "Undo" : "Redo"}: ${op.label}`;
  const guard = `history-${crypto.randomUUID()}`;
  const navigationGuards: D1PreparedStatement[] = [],
    navigationGuardIds: string[] = [];
  if (next.libraryParentId) {
    const parents = await db
      .prepare(
        "SELECT id,json_extract(payload,'$.libraryParentId') AS parent FROM charts",
      )
      .all<{ id: string; parent: string | null }>();
    const byId = new Map(parents.results.map((p) => [p.id, p.parent])),
      seen = new Set([current.id]);
    let parent: string | null = next.libraryParentId;
    while (parent) {
      if (seen.has(parent) || !byId.has(parent))
        throw new EditHistoryError(
          409,
          "The library structure changed. This recovery would create a missing parent or directory cycle.",
        );
      seen.add(parent);
      const expectedParent: string | null = byId.get(parent) ?? null,
        guardId = `navigation-${crypto.randomUUID()}`;
      navigationGuardIds.push(guardId);
      navigationGuards.push(
        db
          .prepare(
            "INSERT INTO mutation_guards(id,ok) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM charts WHERE id=? AND json_extract(payload,'$.libraryParentId') IS ?) THEN 1 ELSE 0 END)",
          )
          .bind(guardId, parent, expectedParent),
      );
      parent = expectedParent;
    }
  }
  const payload = JSON.stringify({
    nodes: storageSafeNodes(next.nodes),
    edges: next.edges,
    lifecycle: next.lifecycle,
    libraryParentId: next.libraryParentId,
    ...normalizeSupplements(next),
  });
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO mutation_guards(id,ok) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM charts WHERE id=? AND version=? AND updated_at=?) AND COALESCE((SELECT id FROM chart_edit_events WHERE chart_id=? ORDER BY sequence DESC LIMIT 1),'baseline')=? AND NOT EXISTS(SELECT 1 FROM ai_chart_proposals WHERE chart_id=? AND status='pending') THEN 1 ELSE 0 END)`,
        )
        .bind(
          guard,
          current.id,
          current.version,
          current.updatedAt,
          current.id,
          args.expectedRevision,
          current.id,
        ),
      ...navigationGuards,
      editContext(db, current.id, label, actor, op.group_id, true),
      checkpointStatement(db, current.id, current.updatedAt, "before", label),
      db
        .prepare(
          "UPDATE charts SET name=?,description=?,status=?,updated_at=?,payload=? WHERE id=?",
        )
        .bind(
          next.name,
          next.description,
          next.status,
          at,
          payload,
          current.id,
        ),
      db
        .prepare("UPDATE chart_edit_operations SET state=? WHERE id=?")
        .bind(args.direction === "undo" ? "undone" : "applied", op.id),
      db
        .prepare(
          "INSERT INTO chart_edit_events(id,chart_id,operation_id,action,actor,recorded_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(args.requestId, current.id, op.id, args.direction, actor, at),
      checkpointStatement(db, current.id, at, "after", label),
      clearEditContext(db, current.id),
      db.prepare("DELETE FROM mutation_guards WHERE id=?").bind(guard),
      ...navigationGuardIds.map((id) =>
        db.prepare("DELETE FROM mutation_guards WHERE id=?").bind(id),
      ),
    ]);
  } catch {
    throw new EditHistoryError(
      409,
      "History changed or the recovery transaction failed. No part of this action was committed. Refresh before retrying.",
    );
  }
  return {
    chart: await readEditChart(db, current.id),
    receipt: {
      id: args.requestId,
      action: args.direction,
      operation_id: op.id,
      actor,
      recorded_at: at,
    },
    alreadyApplied: false,
  };
}
