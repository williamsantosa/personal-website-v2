-- One pin per 24h per submitter (submitter = hashed IP)
CREATE TABLE IF NOT EXISTS pin_rate_limit (
  submitter_id TEXT PRIMARY KEY,
  last_submit_at TEXT NOT NULL
);
