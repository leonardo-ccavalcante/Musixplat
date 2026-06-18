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

// 2nd/3rd min() arms; empty pre-producer (Eval_Cell/Policy_Tier are RESULT/bruto) ⇒ null ⇒ LOW.
async function loadArms(q: Q, cohortId: string): Promise<{ releasedEvals: Level | null; tierCap: Level | null }> {
  const tier = await q<{ tier_cap: Level }>(
    `select pt.tier_cap from cohort."Cohort" c join gov."Policy_Tier" pt on pt.tier_id = c.tier_base::text
     where c.cohort_id=$1 order by pt.policy_version desc limit 1`,
    [cohortId],
  );
  const ev = await q<{ released_evals: Level }>(
    `select released_evals from gov."Eval_Cell" where cohort_id=$1 and released_evals is not null
     order by released_evals desc limit 1`,
    [cohortId],
  );
  return { releasedEvals: ev[0]?.released_evals ?? null, tierCap: tier[0]?.tier_cap ?? null };
}

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
  const provenance = JSON.stringify({ root_cause: "[C]", before_after_expected: "[C]" });

  const ins = await q<{ nba_id: string }>(
    `insert into gov."NBA_Proposal"(action_type, cohort_id, root_cause, nba_request,
        before_after_expected, financial_class, cohort_rule_version, provenance_by_field)
     values ($1,$2,$3,$4::public.autonomy_level,$5::jsonb,$6::public.financial_class,$7,$8::jsonb)
     returning nba_id`,
    [code, cohortId, sel.rootCause, cat.default_nba_request, beforeAfter, cat.financial_class, version, provenance],
  );
  const nbaId = ins[0]!.nba_id;

  // No candidate ⇒ no-act contrafactual (A8): nothing to gate, escalate to human.
  if (!sel.lever) {
    return { nbaId, actionType: "A8", levered: false, effectiveLevel: null };
  }

  // 02:1B — gate the candidate's autonomy. evals/tier empty ⇒ LOW (fail-closed); never auto-releases.
  const arms = await loadArms(q, cohortId);
  const min = await sealMinCalculationNBA(
    { nbaId, nbaRequest: cat.default_nba_request, releasedEvals: arms.releasedEvals, tierCap: arms.tierCap, cohortRuleVersion: version },
    client,
  );
  return { nbaId, actionType: code, levered: true, effectiveLevel: min.effectiveLevel };
}
