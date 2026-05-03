-- Deepwoken talent reference data
CREATE TABLE IF NOT EXISTS talents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tree TEXT NOT NULL,
  rarity TEXT NOT NULL,
  description TEXT,
  notes TEXT -- JSON array of bullet-point notes
);

CREATE TABLE IF NOT EXISTS talent_attributes (
  talent_id TEXT NOT NULL REFERENCES talents(id),
  attribute TEXT NOT NULL,
  min_value INTEGER,                -- e.g. 40 for "40 Agility"; NULL if no numeric req
  is_alternative INTEGER DEFAULT 0, -- 1 = this is a // (OR) option
  PRIMARY KEY (talent_id, attribute)
);

CREATE TABLE IF NOT EXISTS talent_prerequisites (
  talent_id TEXT NOT NULL REFERENCES talents(id),
  prereq_type TEXT NOT NULL,        -- attribute | talent | action | power
  prereq_value TEXT NOT NULL,       -- "40 Agility" | "kick-off" | "interact with Cauldron"
  is_alternative INTEGER DEFAULT 0,
  PRIMARY KEY (talent_id, prereq_value)
);

CREATE INDEX IF NOT EXISTS idx_talents_tree ON talents(tree);
CREATE INDEX IF NOT EXISTS idx_talents_rarity ON talents(rarity);
CREATE INDEX IF NOT EXISTS idx_talent_attributes_attribute ON talent_attributes(attribute);
