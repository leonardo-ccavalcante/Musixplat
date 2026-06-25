import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

// `||` (not `??`) so an EMPTY string falls back to the local default. A stray empty `DATABASE_URL=`
// (e.g. a vestigial MySQL placeholder line in .env) would otherwise leave pg to silently default to
// port 5432 and fail with ECONNREFUSED instead of hitting the Supabase test db on 54522.
const connectionString =
  process.env.DATABASE_URL?.trim() || "postgresql://postgres:postgres@127.0.0.1:54522/postgres";

export function makePool(): pg.Pool {
  return new pg.Pool({ connectionString, max: Number(process.env.PG_POOL_MAX ?? 4) });
}

const SEED_SQL = fileURLToPath(new URL("../../supabase/seed.sql", import.meta.url));

// Pristine state = raw only, NO producers. Truncate all data + re-exec seed.sql via pg.
// SERIALIZED across vitest projects/files (antifake + integration share one DB) via a session
// advisory lock held on ONE dedicated connection across truncate+seed — concurrent resets would
// otherwise deadlock on the truncate cascade. The seed generator emits R001..R5000 (lpad 3), so the
// legacy anchor 'R001' that 05A/05B fixtures reference exists naturally (no injection, count = 5000).
const RESET_LOCK = 987654321;
export async function resetDb(pool: pg.Pool): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("select pg_advisory_lock($1)", [RESET_LOCK]);
    await c.query(`
      truncate
        cohort."Prioritized_NBA_Event", cohort."Cohort_Membership_Snapshot",
        cohort."Subgroup", cohort."Cohort",
        gov."ROI_Operator", gov."min_calculation", gov."NBA_Proposal",
        tenant."Affected", tenant."Diagnosed_Problem", tenant."Knowledge_Case", tenant."Critical_Process",
        tenant."Usage_Event", tenant."Weekly_Connection", tenant."Conversation_Episode", tenant."KPI",
        tenant."Order", tenant."Restaurant",
        gov."User",
        catalog."Named_Query", catalog."Intent_Catalog", catalog."NBA_Catalogo",
        catalog."Cohort_Rule_Version", catalog."Config_Knobs"
      restart identity cascade;
    `);
    // Pin the demo clock so seed.sql's fn_demo_ref()-anchored base + usage are deterministic across run
    // dates (= the legacy 2026-06-17 anchor the fixtures expect).
    await c.query("select set_config('app.demo_ref', '2026-06-17', false)");
    await c.query(readFileSync(SEED_SQL, "utf8"));
  } finally {
    // ALWAYS clear the GUC (even if seed.sql threw) so the pooled connection can't leak 2026-06-17 to a
    // later query that expects current_date ('' ⇒ nullif ⇒ null ⇒ fn_demo_ref falls back to current_date).
    await c.query("select set_config('app.demo_ref', '', false)");
    await c.query("select pg_advisory_unlock($1)", [RESET_LOCK]);
    c.release();
  }
}

export async function rows<T extends pg.QueryResultRow = pg.QueryResultRow>(
  pool: pg.Pool,
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const r = await pool.query<T>(sql, params as unknown[]);
  return r.rows;
}

export async function count(pool: pg.Pool, fromAndWhere: string): Promise<number> {
  const r = await pool.query<{ n: string }>(`select count(*)::text as n from ${fromAndWhere}`);
  return Number(r.rows[0]?.n ?? "0");
}
