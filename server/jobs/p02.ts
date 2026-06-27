import { query } from "../db/pool.js";
import { proposeNba } from "../agente/nba_engine.js";
import { seedGoldenSet } from "../eval/seedGoldenSet.js";
import { runEval, motorEvalProvider } from "../eval/runEval.js";

// P02 batch (02:1A producer). Runs AFTER P01 (cohorts + funnel signals). Bootstraps governance then
// proposes one NBA per problem restaurant across a sample of cohorts — the data the Autonomy Cockpit shows.
// §14: every number stays SQL (proposeNba calls fn_nba_test); nothing seeded. Idempotent (on-conflict
// guards + proposeNba is additive). Extracted from scripts/run-p02.ts so the hosted seed (apply-hosted)
// produces a WORKING cockpit too — the omission that left prod with cohorts but zero proposals.

export interface P02Options {
  week: string; // the week to propose over (must match a P01 run)
  sampleLimit?: number; // cap on problem restaurants sampled (default 40)
}
export interface P02Result {
  auto: number; // proposals the AI clears to act alone (auto_releasable)
  human: number; // proposals escalated to a human (money / failed gate / non-LOW)
  skipped: number; // no-act contrafactual (A8 — no attributable lever)
}

// Root policies (operator-signed, 1st generation ⇒ born_from_trace NULL) — the 3rd min() arm. Idempotent.
// Exported so the in-app "Preparar cockpit" provision (server/cockpit/provision.ts) reuses the SAME bootstrap
// the hosted seed uses (on-conflict do nothing ⇒ never clobbers an operator-uploaded policy).
export async function bootstrapPolicies(): Promise<void> {
  await query(
    `insert into gov."Policy_Tier"(policy_id, tier_id, policy_version, tier_cap, how_measured, human_signature)
     values ('PT-brand','managed_brand','pv-brand','MEDIUM','root policy (operator-signed)','U-OP-001'),
            ('PT-mid','managed_midmarket','pv-mid','LOW','root policy (operator-signed)','U-OP-001'),
            ('PT-long','long_tail','pv-long','LOW','root policy (operator-signed)','U-OP-001')
     on conflict (policy_id) do nothing`,
  );
}

export async function runP02(opts: P02Options): Promise<P02Result> {
  const { week, sampleLimit = 40 } = opts;
  await bootstrapPolicies();

  const intent = (
    await query<{ intent_id: string }>(`select intent_id from catalog."Intent_Catalog" order by intent_id limit 1`)
  )[0]!.intent_id;

  // A spread of problem restaurants (connection / quality / price / cancel) ⇒ a natural mix of non-money
  // (AUTO) and money (NEEDS-HUMAN) levers across several cohorts.
  const sample = await query<{ restaurant_id: string; cohort_id: string }>(
    `select restaurant_id, cohort_id from cohort."Cohort_Membership_Snapshot"
     where week=$1 and (m_connection<0.55 or m_quality<0.55 or price_pctile_in_cohort>78 or cancel_by_restaurant>0.08)
     order by restaurant_id limit $2`,
    [week, sampleLimit],
  );

  let auto = 0;
  let human = 0;
  let skipped = 0;
  for (const r of sample) {
    // DEMO BOOTSTRAP (§14 honesty): there is no golden-set evaluator yet (EPIC-B4 not built). released_evals
    // and status are RESULT columns that must NOT be seeded as measured ([V]). We insert the CONSERVATIVE
    // floor (released_evals='LOW' caps least() to LOW — never a permissive grant) only so the hosted cockpit
    // has the 2nd min() arm to show; provenance is stamped [I] (inferred/seeded) so nothing downstream can
    // read it as a measured pass. A real evaluator (EPIC-B4) must overwrite it with [V] before any [V] claim.
    await query(
      `insert into gov."Eval_Cell"(cohort_id, intent, version, released_evals, status, provenance_by_field)
       values ($1,$2,'gs-1','LOW','green',
               jsonb_build_object('released_evals','[I]','status','[I]'))
       on conflict (cohort_id, intent, version) do nothing`,
      [r.cohort_id, intent],
    );
    const res = await proposeNba({ restaurantId: r.restaurant_id, cohortId: r.cohort_id, week });
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

  // EPIC-B4 demo wiring — PRODUCE a real measured eval verdict so the hosted cockpit/observatory shows a
  // [V] cell (status green + real κ/n) instead of only the [I] LOW floor seeded above. seedGoldenSet writes
  // INPUT only (the verdict is still produced by runEval, §14); promotion stays HUMAN (no promote call here,
  // so released_evals is left at the floor/NULL until someone signs). No-data ⇒ seedGoldenSet returns null ⇒
  // no demo cell (honest, never a faked one). BEST-EFFORT: this is demo decoration — a failure must NEVER
  // abort runP02 (the cockpit-critical proposals already committed; apply-hosted must stay self-healing).
  try {
    const gs = await seedGoldenSet(week);
    if (gs) await runEval(gs.cohortId, gs.intent, gs.version, motorEvalProvider);
  } catch (err) {
    console.warn(`[runP02] demo eval wiring skipped (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }

  return { auto, human, skipped };
}
