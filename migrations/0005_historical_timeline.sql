CREATE TABLE IF NOT EXISTS monthly_updates (id TEXT PRIMARY KEY, month TEXT NOT NULL, label TEXT NOT NULL, change_list TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', effective_date TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT, chart_ids TEXT NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS monthly_one_open_idx ON monthly_updates(status) WHERE status='open';

CREATE TABLE IF NOT EXISTS chart_checkpoints (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, chart_id TEXT NOT NULL, chart_name TEXT NOT NULL, recorded_at TEXT NOT NULL, source_updated_at TEXT NOT NULL, kind TEXT NOT NULL, label TEXT NOT NULL, batch_id TEXT, effective_date TEXT NOT NULL DEFAULT '', payload TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS checkpoints_chart_date_idx ON chart_checkpoints(chart_id,recorded_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, payload TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS ai_chart_proposals (
    id TEXT PRIMARY KEY,
    chart_id TEXT NOT NULL,
    chart_name TEXT NOT NULL,
    change_summary TEXT,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    summary TEXT NOT NULL,
    payload TEXT NOT NULL,
    FOREIGN KEY (chart_id) REFERENCES charts(id) ON DELETE CASCADE
  );

CREATE UNIQUE INDEX IF NOT EXISTS ai_chart_proposals_pending_chart_idx
    ON ai_chart_proposals(chart_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS ai_chart_proposals_status_idx
    ON ai_chart_proposals(status, chart_name);
