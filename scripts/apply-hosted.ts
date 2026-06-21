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
  // Demo-freshness vs test-determinism (REMAINING_WORK §5): the hosted/prod base is anchored to TODAY so the
  // board never goes stale (the seed's fn_generate_business_base reads the `app.demo_ref` GUC; resetDb in
  // tests never sets it ⇒ stays fixed at 2026-06-17 ⇒ §14 numbers deterministic). A DEDICATED connection
  // carries the GUC into seed.sql, and P01/P02 run at the weeks RELATIVE to today (same spacing as the fixed
  // demo: the current week + the week 3 weeks back).
  const client = await pool.connect();
  let ref: string, week1: string, week2: string;
  try {
    const d = (
      await client.query<{ ref: string; w1: string; w2: string }>(
        `select current_date::text as ref,
                (date_trunc('week', current_date) - interval '21 days')::date::text as w1,
                date_trunc('week', current_date)::date::text as w2`,
      )
    ).rows[0]!;
    ref = d.ref;
    week1 = d.w1;
    week2 = d.w2;
    await client.query(`select set_config('app.demo_ref', $1, false)`, [ref]);
    await client.query(readFileSync("supabase/seed.sql", "utf8"));
    console.warn(`applied seed (base anchored to ${ref})`);
  } finally {
    client.release();
  }

  await runP01({ week: week1, refDate: ref });
  await runP01({ week: week2, refDate: ref, prevSemana: week1 });
  console.warn(`P01 done (${week1}, ${week2})`);

  // P02 — the Autonomy Cockpit producer. WITHOUT this the hosted DB has cohorts but ZERO NBA proposals,
  // so /cockpit renders the honest empty state ("The AI has proposed no actions yet"). Production-honest:
  // k_anon stays at the seeded k=5 (no relax) — a real 5000-restaurant base fills cohorts naturally.
  const r = await runP02({ week: week1 });
  console.warn(`P02 done — proposals: ${r.auto} AUTO, ${r.human} needs-human, ${r.skipped} no-act (A8)`);
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
