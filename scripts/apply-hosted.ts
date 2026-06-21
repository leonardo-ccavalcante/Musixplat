import { readFileSync, readdirSync } from "node:fs";
import { pool } from "../server/db/pool.js";
import { runP01 } from "../server/jobs/p01.js";
import { runP02 } from "../server/jobs/p02.js";

// One-shot hosted deploy: apply migrations + seed (brutos) + run P01 + P02, against whatever
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

  await runP01({ week: "2026-05-25", refDate: "2026-06-17" });
  await runP01({ week: "2026-06-15", refDate: "2026-06-17", prevSemana: "2026-05-25" });
  console.warn("P01 done (2026-05-25, 2026-06-15)");

  // P02 — the Autonomy Cockpit producer. WITHOUT this the hosted DB has cohorts but ZERO NBA proposals,
  // so /cockpit renders the honest empty state ("The AI has proposed no actions yet"). Production-honest:
  // k_anon stays at the seeded k=5 (no relax) — a real 5000-restaurant base fills cohorts naturally.
  const r = await runP02({ week: "2026-05-25" });
  console.warn(`P02 done — proposals: ${r.auto} AUTO, ${r.human} needs-human, ${r.skipped} no-act (A8)`);
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
