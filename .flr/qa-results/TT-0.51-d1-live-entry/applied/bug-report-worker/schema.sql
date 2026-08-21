PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS bug_reports (
  report_id TEXT PRIMARY KEY,
  build TEXT NOT NULL,
  created_at TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 3,
  description TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL,
  summary_json TEXT,
  debug_schema_version TEXT
);
CREATE TABLE IF NOT EXISTS bug_report_chunks (
  report_id TEXT NOT NULL,
  chunk_no INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (report_id, chunk_no),
  FOREIGN KEY (report_id) REFERENCES bug_reports(report_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_bug_reports_build_created ON bug_reports(build, created_at DESC);
