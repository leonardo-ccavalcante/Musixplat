import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { pool } from "../server/db/pool.js";
import { migrationOrder, pendingMigrations } from "./migrate-plan.js";

// Apply schema migrations to whatever DATABASE_URL points to. Idempotent: each file is recorded in
// public._schema_migrations after it succeeds, so re-runs (every deploy via railway.json
// preDeployCommand; CI's `pnpm db:migrate`) only run files not yet applied. Fail-closed: any failing
// migration rolls back and aborts the run (non-zero exit) so a half-applied deploy never goes live.
//
//   pnpm db:migrate                 apply pending migrations
//   pnpm db:migrate -- --baseline   record ALL current files as applied WITHOUT running them
//                                   (one-time adoption on a DB whose schema predates this tracking)

const DIR = "supabase/migrations";
const TABLE = "public._schema_migrations";

function allFiles(): string[] {
  return readdirSync(DIR).filter((f) => f.endsWith(".sql"));
}

async function ensureTable(): Promise<void> {
  await pool.query(
    `create table if not exists ${TABLE} (filename text primary key, applied_at timestamptz not null default now())`,
  );
}

async function appliedSet(): Promise<Set<string>> {
  const res = await pool.query<{ filename: string }>(`select filename from ${TABLE}`);
  return new Set(res.rows.map((r) => r.filename));
}

async function migrate(): Promise<void> {
  await ensureTable();
  const pending = pendingMigrations(allFiles(), await appliedSet());
  if (pending.length === 0) {
    console.warn("no pending migrations");
    return;
  }
  for (const f of pending) {
    const sql = readFileSync(`${DIR}/${f}`, "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(`insert into ${TABLE}(filename) values ($1)`, [f]);
      await client.query("commit");
      console.warn("applied migration:", f);
    } catch (e) {
      await client.query("rollback");
      throw new Error(`migration failed (rolled back): ${f}\n${(e as Error).message}`);
    } finally {
      client.release();
    }
  }
  console.warn(`applied ${pending.length} migration(s)`);
}

// Adopt tracking on a DB that already has the schema: record every current file as applied so
// migrate() won't try to re-run already-present (non-idempotent) DDL. Run ONCE, after manually
// applying any genuinely-missing migration.
async function baseline(): Promise<void> {
  await ensureTable();
  const files = migrationOrder(allFiles());
  for (const f of files) {
    await pool.query(`insert into ${TABLE}(filename) values ($1) on conflict (filename) do nothing`, [f]);
  }
  console.warn(`baselined ${files.length} migration(s) as applied (no SQL executed)`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--baseline")) await baseline();
  else await migrate();
  await pool.end();
}

// Run only when invoked directly — keeps the pool closed when this module is merely imported.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
