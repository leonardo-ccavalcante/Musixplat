-- B1 (multi-lens retro): the cockpit copy is generated on a tRPC READ (cockpit.dispatchDetail) that
-- TanStack re-runs on mount/refocus, so its token cost would be logged once PER RENDER. "Custo da atención"
-- is cost-per-DECISION. This PARTIAL unique index makes recordUsageOnce's INSERT ... ON CONFLICT DO NOTHING
-- genuinely idempotent per (tenant, nba_id) — DB-enforced and race-safe (a check-then-insert is not).
--
-- Partial (process_type = 'cockpit' only): other producers append multiple rows legitimately via the plain
-- recordUsage path (motor ref_id = attempt_id is unique anyway; diagnosis ref_id = problem_id may re-log) —
-- they are NOT in this index, so they are unaffected. No rows seeded (§14); cockpit logging is new (PR #48),
-- so gov."Llm_Usage_Log" has no 'cockpit' rows that could violate the index on creation. Idempotent migration.
create unique index if not exists llm_usage_cockpit_once
  on gov."Llm_Usage_Log"(tenant_id, process_type, ref_id)
  where process_type = 'cockpit';
