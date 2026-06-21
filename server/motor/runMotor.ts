import { randomUUID } from "node:crypto";
import { query, withTx } from "../db/pool.js";
import { knobNum } from "../_core/knobs.js";
import { proposeNba } from "../agente/nba_engine.js";
import { autoDispatch } from "../cockpit/autoDispatch.js";
import type { NbaVerdict } from "../agente/reasoning.js";
import { type MotorReasoning, leverAdapter } from "./reasoning.js";
import { validateHypothesis } from "./validateHypothesis.js";
import { writeMotorCase, readGrounding } from "./learn.js";

export interface MotorAttemptInput {
  restaurantId: string;
  cohortId: string;
  week: string;
  tenantId: string;
  tierId: string;
}
export interface MotorAttemptResult {
  outcome: "acted" | "escalated";
  reason: string; // acted ⇒ the chosen action_code ; escalated ⇒ why (out_of_range / exhausted_3_loops / …)
  nbaId: string | null;
  loops: number;
  attemptId: string;
}

const discardItem = (lever: NbaVerdict, reason: string) => ({ action_code: lever.action_code, reason });

// 02C — one restaurant, the ≤3 hypothesis loop: AI proposes (LLM/stub, TEXT only) → SQL falsifies/confirms →
// ACT (in-range, non-money, auto_releasable) or ESCALATE (out-of-range / no-confident / exhausted). The
// auto_releasable+money authority is NOT re-implemented here — it stays in sealMinCalculationNBA (inside
// proposeNba) + autoDispatch's DB re-check (§3.11, §7). Numbers come only from fn_nba_test_all (§14/§8).
export async function runMotorAttempt(i: MotorAttemptInput, reasoning: MotorReasoning): Promise<MotorAttemptResult> {
  const attemptId = randomUUID();
  const maxLoops = await knobNum("motor_max_loops");
  const minConf = await knobNum("motor_min_confidence");
  const verdicts = await query<NbaVerdict>(
    `select action_code, dimension, measured::float8 measured, standard::float8 standard, verdict,
            gap::float8 gap, within_range, n_min_ok, k_anon_ok from cohort.fn_nba_test_all($1,$2)`,
    [i.restaurantId, i.week],
  );
  const areas = [...new Set(verdicts.map((v) => v.dimension).filter((d): d is string => !!d))];
  const grounding = await withTx((c) => readGrounding(i.tenantId, areas, c));
  const discarded: { action_code: string; reason: string }[] = [];

  for (let k = 0; k < maxLoops; k++) {
    const hyp = await reasoning.proposeHypothesis({ verdicts, discarded, grounding });
    // No-suppose (Leo): no confident in-range candidate ⇒ escalate, never guess.
    if (!hyp.lever || hyp.confidence == null || hyp.confidence < minConf) {
      return escalate(i, attemptId, "no_confident_hypothesis", null, discarded, k + 1);
    }
    const lever = hyp.lever;
    const val = await withTx((c) => validateHypothesis(lever, i.restaurantId, i.cohortId, i.tierId, c));
    if (!val.confirmed) {
      discarded.push(discardItem(lever, "sql_no_gap")); // falsified ⇒ the next iteration grounds on it
      continue;
    }
    if (!val.inRange) {
      discarded.push(discardItem(lever, "out_of_range"));
      return escalate(i, attemptId, "out_of_range", lever, discarded, k + 1);
    }
    // ATTEMPT ACT — proposeNba seals the AUTHORITATIVE auto_releasable; autoDispatch re-checks §7.
    const res = await withTx((c) => proposeNba({ restaurantId: i.restaurantId, cohortId: i.cohortId, week: i.week }, leverAdapter(lever, hyp.rootCause), c));
    const gate = (
      await query<{ ar: boolean | null; fc: string | null }>(
        `select m.auto_releasable as ar, p.financial_class::text as fc from gov."NBA_Proposal" p
           left join lateral (select auto_releasable from gov."min_calculation" where nba_id=p.nba_id::text order by computed_at desc limit 1) m on true
          where p.nba_id=$1::uuid`,
        [res.nbaId],
      )
    )[0];
    if (gate?.ar === true && gate.fc !== "direct") {
      try {
        await withTx((c) => autoDispatch(res.nbaId, i.tenantId, c));
        await withTx((c) =>
          writeMotorCase(
            { tenantId: i.tenantId, areaType: lever.dimension ?? "nba", pattern: `${lever.dimension}_${lever.verdict}`, outcome: "resolved", resolution: hyp.rootCause, discarded, attemptId, nbaId: res.nbaId },
            c,
          ),
        );
        return { outcome: "acted", reason: lever.action_code, nbaId: res.nbaId, loops: k + 1, attemptId };
      } catch {
        return escalate(i, attemptId, "dispatch_failed", lever, discarded, k + 1);
      }
    }
    return escalate(i, attemptId, "gate_failed_at_seal", lever, discarded, k + 1);
  }
  return escalate(i, attemptId, "exhausted_3_loops", null, discarded, maxLoops);
}

async function escalate(i: MotorAttemptInput, attemptId: string, reason: string, lever: NbaVerdict | null, discarded: { action_code: string; reason: string }[], loops: number): Promise<MotorAttemptResult> {
  await withTx((c) =>
    writeMotorCase({ tenantId: i.tenantId, areaType: lever?.dimension ?? "nba", pattern: reason, outcome: "escalated", notResolvedReason: reason, discarded, attemptId, nbaId: null }, c),
  );
  return { outcome: "escalated", reason, nbaId: null, loops, attemptId };
}
