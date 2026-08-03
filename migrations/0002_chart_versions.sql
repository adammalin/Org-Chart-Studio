CREATE TABLE IF NOT EXISTS chart_versions (
  id TEXT PRIMARY KEY,
  chart_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  restored_from_version INTEGER,
  FOREIGN KEY (chart_id) REFERENCES charts(id) ON DELETE CASCADE,
  UNIQUE (chart_id, version)
);

CREATE INDEX IF NOT EXISTS chart_versions_chart_id_idx
  ON chart_versions(chart_id, version DESC);
