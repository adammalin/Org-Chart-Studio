CREATE TABLE IF NOT EXISTS import_intakes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  chart_id TEXT
);

CREATE INDEX IF NOT EXISTS import_intakes_status_idx
  ON import_intakes(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS import_intake_files (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (intake_id) REFERENCES import_intakes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS import_intake_files_intake_id_idx
  ON import_intake_files(intake_id);
