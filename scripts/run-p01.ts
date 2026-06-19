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
  const refDate = "2026-06-17";
  await query(`update catalog."Config_Knobs" set value='1' where key='k_anon_threshold'`);
  console.warn("prototype: k_anon_threshold relaxed to 1 (production = 5)");
  await runP01({ week: "2026-05-25", refDate });
  await runP01({ week: "2026-06-15", refDate, prevSemana: "2026-05-25" });
  console.warn("P01 done (2026-05-25, 2026-06-15)");
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
