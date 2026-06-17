import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54522/postgres";

export function makePool(): pg.Pool {
  return new pg.Pool({ connectionString, max: 4 });
}

const SEED_SQL = fileURLToPath(new URL("../../supabase/seed.sql", import.meta.url));

// Pristine state = brutos only, NO producers. Truncate all data + re-exec seed.sql via pg
// (health-independent: avoids the supabase CLI healthcheck flapping under load). The schema +
// functions (det_int, etc.) persist — they are created by migrations on `supabase start`.
export async function resetDb(pool: pg.Pool): Promise<void> {
  await pool.query(`
    truncate
      cohort."Evento_Priorizado_NBA", cohort."Pertenencia_Cohort_Snapshot",
      cohort."Subgrupo", cohort."Cohort",
      gov."ROI_Operador",
      tenant."Evento_Uso", tenant."Conversa_Episodio", tenant."KPI",
      tenant."Orden", tenant."Restaurante",
      gov."Usuario",
      catalog."Named_Query", catalog."Intent_Catalog",
      catalog."Cohort_Rule_Version", catalog."Config_Perillas"
    restart identity cascade;
  `);
  await pool.query(readFileSync(SEED_SQL, "utf8"));
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
