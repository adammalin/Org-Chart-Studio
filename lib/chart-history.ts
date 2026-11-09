import type { ChartDocument } from "./chart-library";
export interface MonthlyUpdate {
  id: string;
  month: string;
  label: string;
  changeList: string;
  summary: string;
  effectiveDate: string;
  status: "open" | "completed" | "interrupted";
  startedAt: string;
  completedAt: string | null;
  chartIds: string[];
}
export interface HistoryCheckpoint {
  id: string;
  chartId: string;
  chartName: string;
  recordedAt: string;
  sourceUpdatedAt: string;
  kind: string;
  label: string;
  batchId: string | null;
  effectiveDate: string;
  chart: ChartDocument;
}
export type CheckpointSummary = Omit<HistoryCheckpoint, "chart">;
export interface CheckpointRow {
  id: string;
  chart_id: string;
  chart_name: string;
  recorded_at: string;
  source_updated_at: string;
  kind: string;
  label: string;
  batch_id: string | null;
  effective_date: string;
  payload: string;
}
export function checkpointSummary(
  r: Omit<CheckpointRow, "payload">,
): CheckpointSummary {
  return {
    id: r.id,
    chartId: r.chart_id,
    chartName: r.chart_name,
    recordedAt: r.recorded_at,
    sourceUpdatedAt: r.source_updated_at,
    kind: r.kind,
    label: r.label,
    batchId: r.batch_id,
    effectiveDate: r.effective_date,
  };
}
export function checkpointFromRow(r: CheckpointRow): HistoryCheckpoint {
  return { ...checkpointSummary(r), chart: JSON.parse(r.payload) };
}
// Capture database state and provenance in the SAME transaction as the guarded
// mutation. A stale save cannot add a phantom historical state.
export function checkpointStatement(
  db: D1Database,
  chartId: string,
  expectedUpdatedAt: string | null,
  kind: string,
  label: string,
  options: {
    batchId?: string | null;
    effectiveDate?: string;
    baseline?: boolean;
    onlyOpenBatch?: boolean;
  } = {},
) {
  return db
    .prepare(
      `INSERT INTO chart_checkpoints (id,chart_id,chart_name,recorded_at,source_updated_at,kind,label,batch_id,effective_date,payload)
 SELECT ?,c.id,c.name,?,c.updated_at,?,?,COALESCE(?,(SELECT id FROM monthly_updates WHERE status='open' AND EXISTS(SELECT 1 FROM json_each(chart_ids) WHERE value=c.id))),?,
 json_patch(c.payload,json_object('id',c.id,'name',c.name,'description',c.description,'status',c.status,'version',c.version,'createdAt',c.created_at,'updatedAt',c.updated_at,
 'sources',json(COALESCE((SELECT json_group_array(json_object('id',s.id,'chartId',s.chart_id,'fileName',s.file_name,'contentType',s.content_type,'fileSize',s.file_size,'checksum',s.checksum,'storageKey',s.storage_key,'sourceType',s.source_type,'importedAt',s.imported_at,'rowCount',s.row_count,'warningCount',s.warning_count)) FROM source_records s WHERE s.chart_id=c.id),'[]'))))
 FROM charts c WHERE c.id=? AND (? IS NULL OR c.updated_at=?) ${options.onlyOpenBatch ? "AND EXISTS(SELECT 1 FROM monthly_updates WHERE id=? AND status='open')" : ""} ${options.baseline ? "AND NOT EXISTS(SELECT 1 FROM chart_checkpoints h WHERE h.chart_id=c.id)" : ""}`,
    )
    .bind(
      `checkpoint-${crypto.randomUUID()}`,
      new Date().toISOString(),
      kind,
      label.slice(0, 1000),
      options.batchId ?? null,
      options.effectiveDate ?? "",
      chartId,
      expectedUpdatedAt,
      expectedUpdatedAt,
      ...(options.onlyOpenBatch ? [options.batchId!] : []),
    );
}
export async function ensureHistoryBaselines(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT id,updated_at FROM charts c WHERE NOT EXISTS(SELECT 1 FROM chart_checkpoints h WHERE h.chart_id=c.id)`,
    )
    .all<{ id: string; updated_at: string }>();
  for (let i = 0; i < rows.results.length; i += 50)
    await db.batch(
      rows.results
        .slice(i, i + 50)
        .map((r) =>
          checkpointStatement(
            db,
            r.id,
            r.updated_at,
            "baseline",
            "First recorded timeline state",
            { baseline: true },
          ),
        ),
    );
}
export function historyRestoreError(
  checkpoints: HistoryCheckpoint[],
  batches: MonthlyUpdate[],
  chartIds: Set<string>,
): string | null {
  if (checkpoints.length > 50000 || batches.length > 5000)
    return "The historical timeline exceeds the supported limit.";
  const ids = new Set<string>(),
    batchIds = new Set<string>();
  for (const b of batches) {
    if (
      !b ||
      typeof b !== "object" ||
      !b.id ||
      batchIds.has(b.id) ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(b.month) ||
      !Array.isArray(b.chartIds) ||
      b.chartIds.some((id) => !chartIds.has(id)) ||
      !["open", "completed", "interrupted"].includes(b.status) ||
      !Number.isFinite(Date.parse(b.startedAt))
    )
      return "A monthly update record is malformed.";
    batchIds.add(b.id);
  }
  for (const h of checkpoints) {
    if (
      !h ||
      typeof h !== "object" ||
      !h.id ||
      ids.has(h.id) ||
      !chartIds.has(h.chartId) ||
      h.chart?.id !== h.chartId ||
      !Array.isArray(h.chart.nodes) ||
      !Array.isArray(h.chart.edges) ||
      !Array.isArray(h.chart.sources) ||
      !Number.isFinite(Date.parse(h.recordedAt)) ||
      (h.batchId && !batchIds.has(h.batchId))
    )
      return "A historical checkpoint is malformed or has a missing monthly update.";
    ids.add(h.id);
  }
  return null;
}

export async function recordChartMutation(
  db: D1Database,
  chartId: string,
  before: string,
  after: string,
  label: string,
  mutation: D1PreparedStatement,
  extra: D1PreparedStatement[] = [],
) {
  const results = await db.batch([
    checkpointStatement(db, chartId, before, "before", label),
    mutation,
    ...extra,
    checkpointStatement(db, chartId, after, "after", label),
  ]);
  return results[1];
}
