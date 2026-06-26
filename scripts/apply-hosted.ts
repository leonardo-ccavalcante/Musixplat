import { readFileSync } from "node:fs";
import { pool } from "../server/db/pool.js";
import { runP01 } from "../server/jobs/p01.js";
import { runP02 } from "../server/jobs/p02.js";
import { migrate } from "./apply-migrations.js";

// Deploy entrypoint (railway.json preDeployCommand) — runs on EVERY release, idempotent + fail-closed:
//   1. migrate() — apply pending migrations via the TRACKED public._schema_migrations runner (the SAME
//      mechanism as `pnpm db:migrate`, so there is one migration path).
//   2. Seed the FOUNDATION only on a brand-new project (no gov.User): config knobs + catalog + users
//      (incl. U-OP-001) + the 5000-restaurant base, anchored to today via fn_demo_ref(). seed.sql's
//      user/catalog inserts are NOT re-runnable, so this is gated strictly on "no users".
//   3. Run the PRODUCERS (P01 + P02) whenever there IS a base but NO cockpit yet (no NBA proposals).
//      Gating the producers SEPARATELY from the seed is what makes the deploy self-healing: a deploy that
//      crashed AFTER seed.sql committed (users present) but BEFORE the producers ran would otherwise leave
//      the cockpit permanently empty; here the next deploy completes it — without re-running the
//      non-idempotent seed. It also recomputes the cockpit after an operator regenerates the base.
// Any error aborts the deploy (no half-live release). POOL-PAY diagnosis is intentionally NOT staged here
// (it fills on the first in-app "Run flow").

async function flag(sql: string): Promise<boolean> {
  return (await pool.query<{ v: boolean }>(sql)).rows[0]!.v;
}

async function seedFoundation(): Promise<void> {
  // Anchor the base to TODAY: seed.sql's fn_generate_business_base + fn_seed_usage_events read
  // fn_demo_ref(), which reads the app.demo_ref GUC. A DEDICATED connection carries the GUC into the seed.
  const client = await pool.connect();
  try {
    await client.query(`select set_config('app.demo_ref', current_date::text, false)`);
    await client.query(readFileSync("supabase/seed.sql", "utf8"));
    console.warn("seeded foundation + 5000 base (anchored to today)");
  } finally {
    client.release();
  }
}

async function runProducers(): Promise<void> {
  // Weeks relative to today (current week + 3 weeks back), same spacing as the seeded demo. Production-
  // honest: k_anon stays at the seeded k=5 (no relax) — a real 5000-restaurant base fills cohorts naturally.
  const d = (
    await pool.query<{ ref: string; w1: string; w2: string }>(
      `select current_date::text as ref,
              (date_trunc('week', current_date) - interval '21 days')::date::text as w1,
              date_trunc('week', current_date)::date::text as w2`,
    )
  ).rows[0]!;
  await runP01({ week: d.w1, refDate: d.ref });
  await runP01({ week: d.w2, refDate: d.ref, prevSemana: d.w1 });
  console.warn(`P01 done (${d.w1}, ${d.w2})`);
  const r = await runP02({ week: d.w1 });
  console.warn(`P02 done — proposals: ${r.auto} AUTO, ${r.human} needs-human, ${r.skipped} no-act`);
}

async function main(): Promise<void> {
  await migrate(); // tracked + idempotent — every deploy

  if (await flag(`select not exists(select 1 from gov."User") as v`)) {
    console.warn("fresh DB (no gov.User) — seeding foundation + base");
    await seedFoundation();
  } else {
    console.warn("foundation present (gov.User) — skipping seed");
  }

  // Producers run when there is a base but the cockpit hasn't been produced — covers a fresh deploy, a
  // crash-self-heal (seed committed, producers didn't), and a recompute after the operator regenerates
  // the base. Skips when the cockpit already exists, or when there is no base to compute over.
  if (await flag(`select (exists(select 1 from tenant."Restaurant") and not exists(select 1 from gov."NBA_Proposal")) as v`)) {
    console.warn("base present, cockpit empty — running P01/P02");
    await runProducers();
  } else {
    console.warn("cockpit already produced (or no base yet) — skipping producers");
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
