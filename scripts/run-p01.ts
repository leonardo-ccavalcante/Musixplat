import { runP01 } from "../server/jobs/p01.js";
import { pool } from "../server/db/pool.js";

// Demo runner: computes P01 results for two weeks (enables the delta diff) so the screen has
// real, computed numbers. Deterministic reference date. NOT a seed — results are produced here.
async function main(): Promise<void> {
  const refDate = "2026-06-17";
  await runP01({ week: "2026-05-25", refDate });
  await runP01({ week: "2026-06-15", refDate, prevSemana: "2026-05-25" });
  console.warn("P01 done (2026-05-25, 2026-06-15)");
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
