import { runP01 } from "../server/jobs/p01.js";
import { proposeNba } from "../server/agente/nba_engine.js";
import { pool, query } from "../server/db/pool.js";

// Live P02 runner — produces REAL Autonomy Cockpit data on top of P01 (NOT a seed; the §14 producers run
// HERE, after the seed). It (1) bootstraps governance: a human-signed root Policy_Tier per tier (the 3rd
// min() arm) + a green Eval_Cell per touched cohort (the 2nd arm); (2) proposes an NBA per problem
// restaurant across a sample of cohorts. The result is a WORKING cockpit: low-stakes, non-money proposals
// whose sample/policy hold clear to AUTO (the AI acts alone); money actions and failed gates escalate to a
// human. Run after `pnpm db:reset` (seed) — e.g. `pnpm db:p02`.

const WEEK = "2026-05-25";
const REF = "2026-06-17";

async function bootstrapPolicies(): Promise<void> {
  // Root policies (operator-signed, 1st generation ⇒ born_from_trace NULL). Idempotent.
  await query(
    `insert into gov."Policy_Tier"(policy_id, tier_id, policy_version, tier_cap, how_measured, human_signature)
     values ('PT-brand','managed_brand','pv-brand','MEDIUM','root policy (operator-signed)','U-OP-001'),
            ('PT-mid','managed_midmarket','pv-mid','LOW','root policy (operator-signed)','U-OP-001'),
            ('PT-long','long_tail','pv-long','LOW','root policy (operator-signed)','U-OP-001')
     on conflict (policy_id) do nothing`,
  );
}

async function main(): Promise<void> {
  await runP01({ week: WEEK, refDate: REF }); // cohorts + funnel signals (fn_nba_signals)
  await bootstrapPolicies();

  const intent = (
    await query<{ intent_id: string }>(`select intent_id from catalog."Intent_Catalog" order by intent_id limit 1`)
  )[0]!.intent_id;

  // A spread of problem restaurants (connection / quality / price / cancel) ⇒ a natural mix of non-money
  // (AUTO) and money (NEEDS-HUMAN) levers across several cohorts.
  const sample = await query<{ restaurant_id: string; cohort_id: string }>(
    `select restaurant_id, cohort_id from cohort."Cohort_Membership_Snapshot"
     where week=$1 and (m_connection<0.55 or m_quality<0.55 or price_pctile_in_cohort>78 or cancel_by_restaurant>0.08)
     order by restaurant_id limit 40`,
    [WEEK],
  );

  let auto = 0;
  let human = 0;
  let skipped = 0;
  for (const r of sample) {
    // Green golden-set for this cohort×intent (a real verdict, produced here — never seeded).
    await query(
      `insert into gov."Eval_Cell"(cohort_id, intent, version, released_evals, status)
       values ($1,$2,'gs-1','LOW','green') on conflict (cohort_id, intent, version) do nothing`,
      [r.cohort_id, intent],
    );
    const res = await proposeNba({ restaurantId: r.restaurant_id, cohortId: r.cohort_id, week: WEEK });
    if (!res.levered) {
      skipped++;
      continue;
    }
    const m = (
      await query<{ auto_releasable: boolean | null }>(
        `select auto_releasable from gov."min_calculation" where nba_id=$1 order by computed_at desc limit 1`,
        [res.nbaId],
      )
    )[0];
    if (m?.auto_releasable) auto++;
    else human++;
  }
  console.warn(`P02 done — proposals: ${auto} AUTO, ${human} needs-human, ${skipped} no-act (A8). week=${WEEK}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
