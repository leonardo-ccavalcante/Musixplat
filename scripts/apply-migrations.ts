import { readFileSync, readdirSync } from "node:fs";
import { pool } from "../server/db/pool.js";

// Apply schema (migrations only — no seed, no P01) to whatever DATABASE_URL points to.
// Used by CI to prepare a plain postgres service container; tests then seed via resetDb.
async function main(): Promise<void> {
  const dir = "supabase/migrations";
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(`${dir}/${f}`, "utf8"));
    console.warn("applied migration:", f);
  }
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
