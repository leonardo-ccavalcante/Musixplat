import { runP01 } from "../server/jobs/p01.js";
import { runP02 } from "../server/jobs/p02.js";
import { pool, query } from "../server/db/pool.js";

// Live P02 runner — produces REAL Autonomy Cockpit data on top of P01 (NOT a seed; the §14 producers run
// HERE, after the seed). P01 (cohorts + funnel signals) then P02 (policy/eval bootstrap + propose). The
// result is a WORKING cockpit. Run after `pnpm db:reset` (seed) — e.g. `pnpm db:p02`.

async function main(): Promise<void> {
  // Anchor to TODAY (same derivation as apply-hosted) so a local `db:reset` (seed base now tracks
  // current_date via fn_demo_ref) and this P01/P02 week share one clock — the cockpit never ages out.
  const [d] = await query<{ ref: string; week: string }>(
    `select current_date::text as ref,
            (date_trunc('week', current_date) - interval '21 days')::date::text as week`,
  );
  const { ref, week } = d!;
  // Local-demo convenience: relax k-anonymity to k=1 so every cohort shows (production keeps the seeded
  // k=5; the mechanism stays intact + tested). Must precede P01 — fn_gate_k_anon reads it. Named knob (§3.8).
  await query(`update catalog."Config_Knobs" set value='1' where key='k_anon_threshold'`);
  console.warn("prototype: k_anon_threshold relaxed to 1 (production = 5)");
  await runP01({ week, refDate: ref }); // cohorts + funnel signals (fn_nba_signals)
  const r = await runP02({ week });
  console.warn(`P02 done — proposals: ${r.auto} AUTO, ${r.human} needs-human, ${r.skipped} no-act (A8). week=${week}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
