import { query } from "../db/pool.js";
import { deterministicReasoning, type NbaVerdict } from "../agente/reasoning.js";

// The motor's DECISION only — the action_code it would pick for (restaurant, week), reusing the SAME
// deterministic gap-rank (cohort.fn_nba_test_all) + reasoning seam as proposeNba (§3.6) WITHOUT writing an
// NBA_Proposal or calling an LLM. This is the "AI under eval" answering a golden case (EPIC-B4 demo wiring).
// A8 = no attributable lever (no/insufficient data) — the honest fail-closed when the funnel says nothing.
export async function motorAnswer(restaurantId: string, week: string): Promise<string> {
  const verdicts = await query<NbaVerdict>(
    `select action_code, dimension, measured::float8 measured, standard::float8 standard, verdict,
            gap::float8 gap, within_range, n_min_ok, k_anon_ok
       from cohort.fn_nba_test_all($1,$2)`,
    [restaurantId, week],
  );
  const sel = deterministicReasoning.select(verdicts);
  return sel.lever ? sel.lever.action_code : "A8";
}
