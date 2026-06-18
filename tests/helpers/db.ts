import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54522/postgres";

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
        gov."ROI_Operator", gov."min_calculation",
        tenant."Affected", tenant."Diagnosed_Problem", tenant."Knowledge_Case",
        tenant."Usage_Event", tenant."Weekly_Connection", tenant."Conversation_Episode", tenant."KPI",
        tenant."Order", tenant."Restaurant",
        gov."User",
        catalog."Named_Query", catalog."Intent_Catalog",
        catalog."Cohort_Rule_Version", catalog."Config_Knobs"
      restart identity cascade;
    `);
    await c.query(readFileSync(SEED_SQL, "utf8"));
  } finally {
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
