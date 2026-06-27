// Part 2 (eval coach loop): the AI-under-eval answers a golden case using the SAME grounded reasoning the
// production motor uses (runMotor.ts:45) — read the SQL verdicts + the operator's REVIEWED Knowledge_Case
// grounding, then the reasoning provider picks AT MOST ONE action_code. This is what makes COACHING raise the
// eval score: approving a lesson (reviewed=true) changes readGrounding ⇒ changes this answer ⇒ changes the
// verdict. §2/§14: the LLM only PICKS an action_code (the provider maps it back to a real SQL verdict); it
// never produces a number. Fail-closed: a reasoning error (e.g. no OPENAI key) degrades to the DETERMINISTIC
// motor answer (the floor) — the eval still runs honestly, it just can't be coached until a key is set. It
// never fabricates a pass.
import { query, withTx } from "../db/pool.js";
import { knobNum } from "../_core/knobs.js";
import { readGrounding } from "../motor/learn.js";
import { motorAnswer } from "./motorAnswer.js";
import type { MotorReasoning } from "../motor/reasoning.js";
import type { NbaVerdict } from "../agente/reasoning.js";
import type { EvalProvider } from "./runEval.js";

/** How a case's (restaurant, week) maps to the SQL verdicts. Injectable so the coach-loop is testable
 *  without a full P01 run; prod uses the real deterministic gap-rank (cohort.fn_nba_test_all). */
export type VerdictLoader = (restaurantId: string, week: string) => Promise<NbaVerdict[]>;

const loadVerdicts: VerdictLoader = (restaurantId, week) =>
  query<NbaVerdict>(
    `select action_code, dimension, measured::float8 measured, standard::float8 standard, verdict,
            gap::float8 gap, within_range, n_min_ok, k_anon_ok
       from cohort.fn_nba_test_all($1,$2)`,
    [restaurantId, week],
  );

/** The grounded motor's call for ONE golden case: read verdicts + the tenant's REVIEWED grounding for the
 *  verdicts' areas, then ask the reasoning provider for ≤1 action_code. A8 (no-act) when there is no
 *  confident lever — never "" or a guess (§7 fail-closed). */
export async function motorAnswerGrounded(
  restaurantId: string,
  week: string,
  tenantId: string,
  reasoning: MotorReasoning,
  load: VerdictLoader = loadVerdicts,
): Promise<string> {
  const verdicts = await load(restaurantId, week);
  const areas = [...new Set(verdicts.map((v) => v.dimension).filter((d): d is string => !!d))];
  const grounding = await withTx((c) => readGrounding(tenantId, areas, c));
  const hyp = await reasoning.proposeHypothesis({ verdicts, discarded: [], grounding });
  // Mirror runMotor's gate (runMotor.ts:80): no lever / null / below motor_min_confidence ⇒ escalate = NO
  // autonomous act. The eval must grade what PRODUCTION would actually do — else it certifies (and a human
  // could promote) MEDIUM for a low-confidence pick the live motor would escalate, never execute.
  const minConf = await knobNum("motor_min_confidence");
  if (!hyp.lever || hyp.confidence == null || hyp.confidence < minConf) return "A8";
  return hyp.lever.action_code;
}

/** An EvalProvider that grades the LEARNING motor (so teaching a lesson can raise the score). Fail-closed:
 *  any reasoning error (e.g. no OPENAI key) degrades to the deterministic motor answer — the eval still
 *  produces a verdict, it just can't be coached until the key is set (the GUI surfaces this). Hermetic in
 *  tests via an injected `reasoning` (+ optional `load`). */
export function groundedEvalProvider(
  tenantId: string,
  reasoning: MotorReasoning,
  load: VerdictLoader = loadVerdicts,
): EvalProvider {
  return {
    answer: async (scenario) => {
      const s = scenario as { restaurant_id?: string; week?: string } | null;
      if (!s?.restaurant_id || !s?.week) return "A8";
      try {
        return await motorAnswerGrounded(s.restaurant_id, s.week, tenantId, reasoning, load);
      } catch {
        return motorAnswer(s.restaurant_id, s.week); // degrade to the floor, never fabricate
      }
    },
  };
}
