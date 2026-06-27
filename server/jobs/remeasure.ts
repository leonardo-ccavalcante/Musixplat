import type { Exec } from "../diagnosis/precedent.js";
import { verifyResolutions, type ResolutionTally } from "../motor/remeasure.js";

// 05D Part D — the SCHEDULED trigger that closes the learning loop unattended. verifyResolutions is
// tenant-scoped (§3.4) and a cron has no session, so this DISCOVERS every tenant with an acted+unverified
// case and re-measures each. It never crafts a number — the 3-valued verdict is whatever fn_nba_test_all
// measures inside verifyResolutions (§14); this only fans out by tenant and aggregates the tally for the
// runner/cron log. Idempotent by construction (verifyResolutions only flips 'unverified' rows).

export interface RemeasureRun {
  tenants: number;
  tally: ResolutionTally;
}

const emptyTally = (): ResolutionTally => ({
  verified_fixed: 0,
  verified_reopened: 0,
  unmeasurable: 0,
  skipped_non_attributable: 0,
  skipped_confounded: 0,
});

export async function runRemeasureAllTenants(exec: Exec): Promise<RemeasureRun> {
  const tenants = await exec<{ tenant_id: string }>(
    `select distinct tenant_id
       from tenant."Knowledge_Case"
      where outcome = 'resolved' and verification_status = 'unverified' and lever is not null`,
    [],
  );
  const tally = emptyTally();
  for (const { tenant_id } of tenants) {
    const t = await verifyResolutions(tenant_id, exec);
    tally.verified_fixed += t.verified_fixed;
    tally.verified_reopened += t.verified_reopened;
    tally.unmeasurable += t.unmeasurable;
    tally.skipped_non_attributable += t.skipped_non_attributable;
    tally.skipped_confounded += t.skipped_confounded;
  }
  return { tenants: tenants.length, tally };
}
