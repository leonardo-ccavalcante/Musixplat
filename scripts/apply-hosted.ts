import { readFileSync, readdirSync } from "node:fs";
import { pool } from "../server/db/pool.js";
import { runP01 } from "../server/jobs/p01.js";

// One-shot hosted deploy: apply migrations + seed (brutos) + run P01, against whatever
// DATABASE_URL points to (set to the Supabase session-pooler URL when deploying to hosted).
// Additive on a fresh project. Transparent: logs each step.
async function main(): Promise<void> {
  const dir = "supabase/migrations";
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    await pool.query(readFileSync(`${dir}/${f}`, "utf8"));
    console.warn("applied migration:", f);
  }
  await pool.query(readFileSync("supabase/seed.sql", "utf8"));
  console.warn("applied seed (brutos only)");

  await runP01({ semana: "2026-05-25", refDate: "2026-06-17" });
  await runP01({ semana: "2026-06-15", refDate: "2026-06-17", prevSemana: "2026-05-25" });
  console.warn("P01 done (2026-05-25, 2026-06-15)");
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
