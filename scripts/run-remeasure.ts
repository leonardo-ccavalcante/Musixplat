import { pool, query } from "../server/db/pool.js";
import { runRemeasureAllTenants } from "../server/jobs/remeasure.js";

// 05D Part D — the SCHEDULED cron entrypoint that closes the learning loop unattended. Re-measures every
// tenant with an acted+unverified case and stamps the 3-valued verification_status (the only [V] field, §14).
// Data-time gated: a case whose verify-window has no snapshot yet stays 'unverified' and is re-queued next
// run (no wall-clock dependency). Pure: deterministic re-measurement, no money, no LLM (§7/§14). Wire the
// CADENCE in the deploy (Railway cron, e.g. weekly) — the logic here is idempotent and side-effect-safe.
//   DATABASE_URL=… pnpm db:remeasure
async function main(): Promise<void> {
  const { tenants, tally } = await runRemeasureAllTenants(query);
  console.warn(
    `remeasure: ${tenants} tenant(s) · verified_fixed=${tally.verified_fixed} ` +
      `reopened=${tally.verified_reopened} unmeasurable=${tally.unmeasurable} ` +
      `skipped(non_attributable=${tally.skipped_non_attributable}, confounded=${tally.skipped_confounded})`,
  );
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error("run-remeasure failed:", e);
    return pool.end().then(() => process.exit(1));
  });
