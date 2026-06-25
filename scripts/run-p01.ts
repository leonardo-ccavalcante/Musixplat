import { runP01 } from "../server/jobs/p01.js";
import { pool, query } from "../server/db/pool.js";

// Demo runner: computes P01 results for two weeks (enables the delta diff) so the screen has
// real, computed numbers. Deterministic reference date. NOT a seed — results are produced here.
//
// Prototype convenience: relax k-anonymity to k=1 so every cohort shows. The long-tail
// cuisine×zone×tier cells fall under the production k=5 and would render "suppressed". k_anon_threshold
// is a NAMED knob (§3.8) precisely so it tunes without code — the suppression mechanism stays intact
// (fail-closed, still tested at k=5); only this demo run relaxes it. Production keeps the seeded k=5.
async function main(): Promise<void> {
  // Anchor the run to TODAY (same derivation as apply-hosted) so a local `db:reset` (whose seed base now
  // tracks current_date via fn_demo_ref) and these P01 weeks share one clock — the board never ages out.
  const [d] = await query<{ ref: string; w1: string; w2: string }>(
    `select current_date::text as ref,
            (date_trunc('week', current_date) - interval '21 days')::date::text as w1,
            date_trunc('week', current_date)::date::text as w2`,
  );
  const { ref, w1, w2 } = d!;
  await query(`update catalog."Config_Knobs" set value='1' where key='k_anon_threshold'`);
  console.warn("prototype: k_anon_threshold relaxed to 1 (production = 5)");
  await runP01({ week: w1, refDate: ref });
  await runP01({ week: w2, refDate: ref, prevSemana: w1 });
  console.warn(`P01 done (${w1}, ${w2}; ref ${ref})`);
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
