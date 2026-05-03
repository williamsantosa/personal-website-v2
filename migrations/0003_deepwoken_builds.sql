-- Deepwoken build storage (schema only -- UI not yet implemented)
CREATE TABLE IF NOT EXISTS builds (
  id TEXT PRIMARY KEY,
  name TEXT,
  share_code TEXT UNIQUE,
  race TEXT,
  oath TEXT,
  murmur TEXT,
  origin TEXT,
  bell TEXT,
  outfit TEXT,
  -- core stats
  str INTEGER DEFAULT 0,
  ftd INTEGER DEFAULT 0,
  agl INTEGER DEFAULT 0,
  int INTEGER DEFAULT 0,
  wil INTEGER DEFAULT 0,
  cha INTEGER DEFAULT 0,
  -- weapon stats
  heavy_wep INTEGER DEFAULT 0,
  medium_wep INTEGER DEFAULT 0,
  light_wep INTEGER DEFAULT 0,
  -- attunements
  flamecharm INTEGER DEFAULT 0,
  frostdraw INTEGER DEFAULT 0,
  thundercall INTEGER DEFAULT 0,
  galebreathe INTEGER DEFAULT 0,
  shadowcast INTEGER DEFAULT 0,
  ironsing INTEGER DEFAULT 0,
  bloodrend INTEGER DEFAULT 0,
  -- secondary stats (derived from attunements)
  vitality INTEGER DEFAULT 0,
  erudition INTEGER DEFAULT 0,
  proficiency INTEGER DEFAULT 0,
  songchant INTEGER DEFAULT 0,
  -- character options
  boon1 TEXT,
  boon2 TEXT,
  flaw1 TEXT,
  flaw2 TEXT,
  flaw3 TEXT,
  -- shrine of order flags
  pre_shrine TEXT, -- JSON snapshot of stats before shrine
  post_shrine TEXT, -- JSON snapshot of stats after shrine
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS build_talents (
  build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  talent_id TEXT NOT NULL REFERENCES talents(id),
  PRIMARY KEY (build_id, talent_id)
);

CREATE INDEX IF NOT EXISTS idx_builds_share_code ON builds(share_code);
