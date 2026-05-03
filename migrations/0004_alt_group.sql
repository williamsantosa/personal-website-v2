-- Adds alt_group to talent_attributes and talent_prerequisites.
--
-- alt_group is a local integer (scoped per talent) that identifies which
-- OR-choice group a row belongs to.
--
--   alt_group IS NULL  → the requirement is always mandatory (AND)
--   alt_group = N      → this row belongs to OR-group N; the talent is
--                         satisfied if at least one row from group N is met.
--
-- This lets a build engine evaluate prerequisites as:
--   REQUIRED_ATTRS AND (group1_A OR group1_B) AND (group2_C OR group2_D) …
--
-- The is_alternative column is kept for quick boolean filtering (alt_group IS NOT NULL
-- is equivalent, but is_alternative=1 is more readable in SQL).

ALTER TABLE talent_attributes   ADD COLUMN alt_group INTEGER DEFAULT NULL;
ALTER TABLE talent_prerequisites ADD COLUMN alt_group INTEGER DEFAULT NULL;
