-- 02:DETAIL-A1 — definition fields for the NBA action-detail screen. Reference data (like the rest of
-- NBA_Catalogo), NOT a §14 result: the ROWS are seeded in seed.sql. The table is empty at migration time
-- (seed runs after migrations), so plain ADD COLUMN is safe. playbook = the step-by-step "path" the action
-- gives (free text v1, Leo). created_at = the real date the closed catalog was defined (the catalog
-- migration date) — an honest date, never invented at render time.
alter table catalog."NBA_Catalogo"
  add column playbook   text,            -- step-by-step path (free text v1; seeded, English §0)
  add column created_at timestamptz;     -- when the action was defined (seeded real date)
