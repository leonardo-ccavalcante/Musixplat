import type pg from "pg";
import { query } from "../db/pool.js";
import { sealMinCalculationNBA, type Level } from "../conversation/min.js";
import { deterministicReasoning, type NbaReasoning, type NbaVerdict } from "./reasoning.js";

// 02:1A — the AGENTE engine. TRIGGER-IN: P01 emits Evento_Priorizado_NBA{restaurant_id, cohort_id}.
// Ranks the funnel deterministically (fn_nba_test_all), picks the worst-relative-gap lever via the
// ReasoningProvider, writes gov.NBA_Proposal{action_type, root_cause, nba_request, before_after_expected}
// (the §8 text is the provider's; the NUMBER is SQL), then fires 02:1B (sealMinCalculationNBA). No
// candidate ⇒ no-act contrafactual (A8), no autonomy to gate. Contract: breakdown_N8N 02:1A.
// lever_class/routing_destination are left NULL (that is piece 02:BR-13). Knowledge_Case is the 05B flow.

export interface ProposeInput {
  restaurantId: string;
  cohortId: string;
  week: string;
}
export interface ProposeResult {
  nbaId: string;
  actionType: string;
  levered: boolean;
  effectiveLevel: Level | null;
}

type Q = <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: readonly unknown[]) => Promise<T[]>;
const runner = (client?: pg.PoolClient): Q =>
  client ? async (sql, params) => (await client.query(sql, params as unknown[])).rows : (sql, params) => query(sql, params);

// 2nd/3rd min() arms. FAIL-CLOSED (§3.7) + anti-mix (§3.5): grant a non-LOW arm ONLY from an
// UNAMBIGUOUS resolution — exactly one distinct candidate value. Eval_Cell is keyed
// (cohort_id, intent, version) and Policy_Tier carries a semver policy_version, so a cohort has MANY
// candidate rows; with no production "current (policy|eval) version" source yet, we cannot pin the
// single governing row, so any disagreement (0 or >1 distinct values, e.g. across intents/versions)
// ⇒ null ⇒ LOW. This mirrors resolvePolicy (05A:A.2.3, none/stale/ambiguous ⇒ not sealed). It can
// only LOWER autonomy, never raise it wrongly — the old `order by ... desc limit 1` took the MAX
// (most-permissive) and sorted policy_version lexicographically ('v9'>'v10'), both anti-fail-closed.
// TODO(02:gov): once the governing (intent, version) for an NBA is specified, resolve the single
//   sealed arm here (reuse resolvePolicy); a non-LOW arm must come from exactly one current-version row.
async function loadArms(q: Q, cohortId: string): Promise<{ releasedEvals: Level | null; tierCap: Level | null }> {
  const tier = await q<{ tier_cap: Level }>(
    `select distinct pt.tier_cap from cohort."Cohort" c
       join gov."Policy_Tier" pt on pt.tier_id = c.tier_base::text
     where c.cohort_id=$1`,
    [cohortId],
  );
  const ev = await q<{ released_evals: Level }>(
    `select distinct released_evals from gov."Eval_Cell" where cohort_id=$1 and released_evals is not null`,
    [cohortId],
  );
  // Unambiguous (exactly one distinct value) ⇒ use it; otherwise fail-closed to null ⇒ LOW.
  return {
    releasedEvals: ev.length === 1 ? ev[0]!.released_evals : null,
    tierCap: tier.length === 1 ? tier[0]!.tier_cap : null,
  };
}

// PRECONDITION (§3.4 RLS single-pool): this is an INTERNAL server-side function with NO tenant guard of
// its own — it reads fn_nba_test_all + Cohort/Policy/Eval and writes NBA_Proposal trusting `input`. The
// CALLER (the P01 Evento_Priorizado_NBA trigger / future tRPC mutation) MUST have already resolved
// tenant_id server-side and verified restaurantId+cohortId belong to it (as nba.ts does via ctx.tenantId).
// It has no production caller yet; the typed door nba.test/testAll IS tenant-gated.
// TODO(02:1A-wiring): when wiring the trigger, thread a server-resolved tenantId into ProposeInput and
//   scope the reads (and assert the cohort↔tenant link), so the trust is enforced, not just documented.
export async function proposeNba(
  input: ProposeInput,
  reasoning: NbaReasoning = deterministicReasoning,
  client?: pg.PoolClient,
): Promise<ProposeResult> {
  const q = runner(client);
  const { restaurantId, cohortId, week } = input;

  const verdicts = await q<NbaVerdict>(
    `select action_code, dimension, measured::float8 measured, standard::float8 standard, verdict,
            gap::float8 gap, within_range, n_min_ok, k_anon_ok
     from cohort.fn_nba_test_all($1,$2)`,
    [restaurantId, week],
  );
  const sel = reasoning.select(verdicts);

  const ver = await q<{ value: string }>(
    `select value from catalog."Config_Knobs" where key='cohort_rule_version_current'`,
    [],
  );
  const version = ver[0]?.value;
  if (!version) throw new Error("proposeNba: missing cohort_rule_version_current"); // fail-closed

  const code = sel.lever ? sel.lever.action_code : "A8";
  const cat = (
    await q<{ default_nba_request: Level; financial_class: string }>(
      `select default_nba_request, financial_class from catalog."NBA_Catalogo" where code=$1`,
      [code],
    )
  )[0];
  if (!cat) throw new Error(`proposeNba: unknown action_code ${code}`);

  const beforeAfter = sel.lever
    ? JSON.stringify({
        dimension: sel.lever.dimension,
        measured: sel.lever.measured,
        standard: sel.lever.standard,
        gap: sel.lever.gap,
      })
    : null;
  // root_cause is templated interpretation ⇒ [C]. before_after_expected carries the measured diagnosis
  // snapshot (dimension/measured/standard/gap straight from fn_nba_test) ⇒ [V] (tagging it [C] would
  // misreport measured data as projection, §3.10; the projected "after" is a later piece, ascends to [C]
  // then). diagnosis_verdict/n_min_ok/k_anon_ok also come straight from fn_nba_test ⇒ [V] (02:DETAIL-A2).
  const provenance = JSON.stringify({
    root_cause: "[C]",
    before_after_expected: "[V]",
    diagnosis_verdict: "[V]",
    n_min_ok: "[V]",
    k_anon_ok: "[V]",
  });

  const ins = await q<{ nba_id: string }>(
    `insert into gov."NBA_Proposal"(action_type, cohort_id, root_cause, nba_request,
        before_after_expected, financial_class, cohort_rule_version, provenance_by_field,
        diagnosis_verdict, n_min_ok, k_anon_ok)
     values ($1,$2,$3,$4::public.autonomy_level,$5::jsonb,$6::public.financial_class,$7,$8::jsonb,$9,$10,$11)
     returning nba_id`,
    [
      code, cohortId, sel.rootCause, cat.default_nba_request, beforeAfter, cat.financial_class, version, provenance,
      // no lever (A8) ⇒ no_data + null evidence (fail-closed §14 — never a fabricated boolean)
      sel.lever?.verdict ?? "no_data", sel.lever?.n_min_ok ?? null, sel.lever?.k_anon_ok ?? null,
    ],
  );
  const nbaId = ins[0]!.nba_id;

  // No candidate ⇒ no-act contrafactual (A8): nothing to gate, escalate to human.
  if (!sel.lever) {
    return { nbaId, actionType: "A8", levered: false, effectiveLevel: null };
  }

  // 02:1B + 02:BR-5 — gate the candidate's autonomy and decide auto-dispatch vs human. evals/tier empty
  // ⇒ LOW + policy unresolved ⇒ auto_releasable=false (fail-closed): the AI only acts alone when the
  // action is low-stakes AND non-money AND the sample/policy hold (04 §3.3 L280). The number stays SQL.
  const arms = await loadArms(q, cohortId);
  const min = await sealMinCalculationNBA(
    {
      nbaId,
      nbaRequest: cat.default_nba_request,
      releasedEvals: arms.releasedEvals,
      tierCap: arms.tierCap,
      cohortRuleVersion: version,
      financialDirect: cat.financial_class === "direct",
      nMinOk: sel.lever.n_min_ok,
      kAnonOk: sel.lever.k_anon_ok,
      policyResolved: arms.tierCap != null,
    },
    client,
  );
  return { nbaId, actionType: code, levered: true, effectiveLevel: min.effectiveLevel };
}
