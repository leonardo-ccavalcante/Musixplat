import { readFileSync } from "node:fs";
import { pool } from "../server/db/pool.js";
import { runP01 } from "../server/jobs/p01.js";
import { runP02 } from "../server/jobs/p02.js";
import { migrate } from "./apply-migrations.js";

// Deploy entrypoint (railway.json preDeployCommand) — runs on EVERY release, idempotent + fail-closed:
//   1. Apply pending migrations via the TRACKED runner (public._schema_migrations) — the SAME ledger as
//      `pnpm db:migrate`/CI, so there is one migration mechanism (no raw re-apply that aborts on the
//      second deploy).
//   2. Seed ONLY a fresh project: if the DB has no gov.User rows (the foundation that login + every
//      producer depends on), run the seed kit (config knobs + catalog + users incl. U-OP-001 + the
//      5000-restaurant base) and the P01/P02 producers — so a fresh deploy comes up populated AND
//      logged-in (Cohorts/Cockpit/Observatory). An already-bootstrapped DB skips the seed entirely, so
//      re-deploys never re-seed or wipe operator data. (Diagnosis/Cost/Knowledge/Health authenticate and
//      fill on the first in-app "Run flow" — POOL-PAY is intentionally not staged on deploy.)
// Any error aborts the deploy (no half-seeded release goes live).

// A truly fresh DB has the schema (migrations just ran) but no seeded foundation. gov.User is the right
// signal: login resolves users from it, and seed.sql is the only writer of the operator/AI rows.
async function isFresh(): Promise<boolean> {
  const r = await pool.query<{ seeded: boolean }>(`select exists(select 1 from gov."User") as seeded`);
  return !r.rows[0]!.seeded;
}

async function seedFresh(): Promise<void> {
  // Anchor the base to TODAY so the board never goes stale: seed.sql's fn_generate_business_base +
  // fn_seed_usage_events read fn_demo_ref(), which reads the app.demo_ref GUC. A DEDICATED connection
  // carries the GUC into the seed; P01/P02 run at the weeks relative to today (current week + 3 weeks back).
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
    console.warn(`applied seed (foundation + base anchored to ${ref})`);
  } finally {
    client.release();
  }

  await runP01({ week: week1, refDate: ref });
  await runP01({ week: week2, refDate: ref, prevSemana: week1 });
  console.warn(`P01 done (${week1}, ${week2})`);

  // P02 — the Autonomy Cockpit producer. WITHOUT it the hosted DB has cohorts but ZERO NBA proposals, so
  // /cockpit renders the honest empty state. Production-honest: k_anon stays at the seeded k=5 (no relax);
  // a real 5000-restaurant base fills cohorts naturally.
  const r = await runP02({ week: week1 });
  console.warn(`P02 done — proposals: ${r.auto} AUTO, ${r.human} needs-human, ${r.skipped} no-act (A8)`);
}

async function main(): Promise<void> {
  await migrate(); // tracked + idempotent — every deploy
  if (await isFresh()) {
    console.warn("fresh DB (no gov.User) — seeding foundation + base + running P01/P02");
    await seedFresh();
  } else {
    console.warn("DB already bootstrapped (gov.User present) — skipping seed; migrations applied");
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
