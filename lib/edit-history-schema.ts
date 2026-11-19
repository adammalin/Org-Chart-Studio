// SQLite triggers capture every saved chart update, including writes made by
// older clients. The journal and chart commit (or roll back) together.
const snapshot = (row: string) =>
  `json_object('id',${row}.id,'name',${row}.name,'description',${row}.description,'status',${row}.status,'version',${row}.version,'createdAt',${row}.created_at,'updatedAt',${row}.updated_at,'payload',json(${row}.payload))`;
const changed = [
  "nodes",
  "edges",
  "supportPanels",
  "sourceLayout",
  "libraryParentId",
]
  .map(
    (k) =>
      `json_extract(OLD.payload,'$.${k}') IS NOT json_extract(NEW.payload,'$.${k}')`,
  )
  .concat([
    "OLD.name IS NOT NEW.name",
    "OLD.description IS NOT NEW.description",
    "(OLD.status='archived') IS NOT (NEW.status='archived')",
  ])
  .join(" OR ");
export const editHistorySchema = [
  `CREATE TABLE IF NOT EXISTS chart_edit_context(chart_id TEXT PRIMARY KEY,actor TEXT NOT NULL,label TEXT NOT NULL,group_id TEXT,replay INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS chart_edit_operations(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,chart_id TEXT NOT NULL,actor TEXT NOT NULL,label TEXT NOT NULL,group_id TEXT,recorded_at TEXT NOT NULL,before_state TEXT NOT NULL,after_state TEXT NOT NULL,reversible INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('applied','undone','superseded')))`,
  `CREATE INDEX IF NOT EXISTS chart_edit_stack_idx ON chart_edit_operations(chart_id,reversible,state,sequence)`,
  `CREATE TABLE IF NOT EXISTS chart_edit_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,chart_id TEXT NOT NULL,operation_id TEXT NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,recorded_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS chart_edit_events_idx ON chart_edit_events(chart_id,sequence)`,
  `CREATE TRIGGER IF NOT EXISTS chart_edit_capture AFTER UPDATE ON charts
   WHEN (OLD.name IS NOT NEW.name OR OLD.description IS NOT NEW.description OR OLD.status IS NOT NEW.status OR OLD.payload IS NOT NEW.payload)
   AND COALESCE((SELECT replay FROM chart_edit_context WHERE chart_id=NEW.id),0)=0
   BEGIN
     UPDATE chart_edit_operations SET state='superseded' WHERE chart_id=NEW.id AND state='undone' AND (${changed});
     INSERT INTO chart_edit_operations(id,chart_id,actor,label,group_id,recorded_at,before_state,after_state,reversible,state)
     VALUES('edit-'||lower(hex(randomblob(16))),NEW.id,
       COALESCE((SELECT actor FROM chart_edit_context WHERE chart_id=NEW.id),'user'),
       COALESCE((SELECT label FROM chart_edit_context WHERE chart_id=NEW.id),'Chart updated'),
       (SELECT group_id FROM chart_edit_context WHERE chart_id=NEW.id),
       strftime('%Y-%m-%dT%H:%M:%fZ','now'),${snapshot("OLD")},${snapshot("NEW")},CASE WHEN ${changed} THEN 1 ELSE 0 END,'applied');
     INSERT INTO chart_edit_events(id,chart_id,operation_id,action,actor,recorded_at)
       SELECT 'event-'||lower(hex(randomblob(16))),chart_id,id,'applied',actor,recorded_at FROM chart_edit_operations WHERE sequence=last_insert_rowid();
   END`,
] as const;

export function editContext(
  db: D1Database,
  chartId: string,
  label: string,
  actor = "user",
  groupId: string | null = null,
  replay = false,
) {
  return db
    .prepare(
      `INSERT INTO chart_edit_context(chart_id,actor,label,group_id,replay) VALUES(?,?,?,?,?) ON CONFLICT(chart_id) DO UPDATE SET actor=excluded.actor,label=excluded.label,group_id=excluded.group_id,replay=excluded.replay`,
    )
    .bind(chartId, actor, label.slice(0, 1000), groupId, Number(replay));
}
export const clearEditContext = (db: D1Database, chartId: string) =>
  db.prepare("DELETE FROM chart_edit_context WHERE chart_id=?").bind(chartId);
