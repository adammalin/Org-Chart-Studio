export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS charts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    payload TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS charts_updated_at_idx ON charts(updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS source_records (
    id TEXT PRIMARY KEY,
    chart_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    checksum TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    source_type TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (chart_id) REFERENCES charts(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS source_records_chart_id_idx ON source_records(chart_id)`,
  `CREATE TABLE IF NOT EXISTS chart_versions (
    id TEXT PRIMARY KEY,
    chart_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    label TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL,
    restored_from_version INTEGER,
    FOREIGN KEY (chart_id) REFERENCES charts(id) ON DELETE CASCADE,
    UNIQUE (chart_id, version)
  )`,
  `CREATE INDEX IF NOT EXISTS chart_versions_chart_id_idx
    ON chart_versions(chart_id, version DESC)`,
  `CREATE TABLE IF NOT EXISTS ai_activity_events (
    id TEXT PRIMARY KEY,
    chart_id TEXT NOT NULL,
    proposal_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    status TEXT NOT NULL,
    summary TEXT NOT NULL,
    change_count INTEGER NOT NULL DEFAULT 0,
    changed_node_ids TEXT NOT NULL DEFAULT '[]',
    changed_edge_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    version_id TEXT,
    version_number INTEGER,
    version_label TEXT,
    FOREIGN KEY (chart_id) REFERENCES charts(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS ai_activity_events_chart_id_idx
    ON ai_activity_events(chart_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS import_intakes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    chart_id TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS import_intakes_status_idx
    ON import_intakes(status, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS import_intake_files (
    id TEXT PRIMARY KEY,
    intake_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (intake_id) REFERENCES import_intakes(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS import_intake_files_intake_id_idx
    ON import_intake_files(intake_id)`,
] as const;
