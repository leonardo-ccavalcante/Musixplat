import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { query, withTx } from "../db/pool.js";
import { knobNum } from "../_core/knobs.js";
import { CHAT_MODEL } from "../_core/llm.js";
import { recordUsageSafe } from "../_core/usage.js";
import { proposeNba } from "../agente/nba_engine.js";
import { autoDispatch } from "../cockpit/autoDispatch.js";
import type { NbaVerdict } from "../agente/reasoning.js";
import { type MotorReasoning, type MotorHypothesis, leverAdapter } from "./reasoning.js";
import { validateHypothesis } from "./validateHypothesis.js";
import { writeMotorCase, readGrounding } from "./learn.js";
import { acceptPrecedent, embedCaseText, currentRuleVersion, type AcceptedPrecedent } from "../diagnosis/precedent.js";
import { resolveEmbedder } from "../knowledge/embedder.js";

export interface MotorAttemptInput { restaurantId: string; cohortId: string; week: string; tenantId: string; tierId: string; }
export interface MotorAttemptResult {
  outcome: "acted" | "escalated" | "skipped"; // skipped = the cohort action was already dispatched (idempotent)
  reason: string; // acted ⇒ the chosen action_code ; escalated ⇒ why ; skipped ⇒ 'already_dispatched'
  nbaId: string | null;
  loops: number;
  attemptId: string;
}

const discardItem = (lever: NbaVerdict, reason: string) => ({ action_code: lever.action_code, reason });

// 05D Part B — the semantic query for precedent kNN: the situation, built from the CONFIRMING verdicts'
// patterns (matches the `${dimension}_${verdict}` text embed-on-write stores). Empty ⇒ no signal ⇒ no precedent.
const precedentQueryText = (verdicts: NbaVerdict[]): string =>
  verdicts.filter((v) => v.verdict === "below" || v.verdict === "above").map((v) => `${v.dimension}_${v.verdict}`).join(" ");

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

  // 05D Part B — PRECEDENT-FIRST: reuse a VERIFIED past fix whose lever still re-confirms on the fresh
  // verdicts, skipping the LLM loop (cheaper + grounded in a proven outcome, not a guess). Acts through the
  // SAME actOnLever path (out-of-range / auto_releasable seal / §7 money hard-no all re-checked). Fail-open:
  // no verified precedent ⇒ null ⇒ the LLM hypothesis loop runs exactly as before. Dormant until the Part D
  // re-measurement writes the first verified_fixed.
  let precedent: AcceptedPrecedent | null = null;
  try {
    const embedder = await resolveEmbedder();
    const minSim = await knobNum("precedent_similarity_min"); // §3.8 by NAME — the kNN similarity floor
    precedent = await acceptPrecedent(i.tenantId, verdicts, precedentQueryText(verdicts), query, embedder, minSim);
  } catch {
    // §7 fail-open: an embedding/kNN/db outage ⇒ treat as NO precedent ⇒ the LLM loop runs as before, never
    // abort the whole attempt on a transient precedent-retrieval failure (Codex).
    precedent = null;
  }
  if (precedent) {
    const val = await withTx((c) => validateHypothesis(precedent.freshVerdict, i.tierId, i.tenantId, c));
    return actOnLever(i, precedent.freshVerdict, precedent.resolution ?? "precedent reuse", val.inRange, discarded, attemptId, 0);
  }

  for (let k = 0; k < maxLoops; k++) {
    // P1-7 fail-closed (§7): a provider/parse failure degrades THIS attempt to human, never aborts the run.
    let hyp: MotorHypothesis;
    try {
      hyp = await reasoning.proposeHypothesis({ verdicts, discarded, grounding });
    } catch {
      return escalate(i, attemptId, "provider_failed", null, discarded, k + 1);
    }
    // Cost of the attention (P07): record this iteration's tokens (best-effort). Stub omits usage ⇒ no row.
    if (hyp.usage) await recordUsageSafe({ tenantId: i.tenantId, processType: "motor", kind: "chat", model: CHAT_MODEL, refId: attemptId, usage: hyp.usage });
    // No-suppose (Leo): no confident in-range candidate ⇒ escalate, never guess.
    if (!hyp.lever || hyp.confidence == null || hyp.confidence < minConf) {
      return escalate(i, attemptId, "no_confident_hypothesis", null, discarded, k + 1);
    }
    const lever = hyp.lever;
    const val = await withTx((c) => validateHypothesis(lever, i.tierId, i.tenantId, c));
    if (!val.confirmed) {
      discarded.push(discardItem(lever, "sql_no_gap")); // falsified ⇒ the next iteration grounds on it
      continue;
    }
    // confirmed ⇒ ACT. out-of-range / auto_releasable seal / §7 money hard-no / dispatch all live in
    // actOnLever (extracted so 05D Part B's precedent-first reuses the EXACT authority, no bespoke shortcut).
    return actOnLever(i, lever, hyp.rootCause, val.inRange, discarded, attemptId, k + 1);
  }
  return escalate(i, attemptId, "exhausted_3_loops", null, discarded, maxLoops);
}

async function escalate(i: MotorAttemptInput, attemptId: string, reason: string, lever: NbaVerdict | null, discarded: { action_code: string; reason: string }[], loops: number): Promise<MotorAttemptResult> {
  await withTx((c) =>
    writeMotorCase({ tenantId: i.tenantId, areaType: lever?.dimension ?? "nba", pattern: reason, outcome: "escalated", notResolvedReason: reason, discarded, attemptId, nbaId: null }, c),
  );
  return { outcome: "escalated", reason, nbaId: null, loops, attemptId };
}

// 05D Part B — the ACT path, extracted from the loop so precedent-first reuses the EXACT §7 authority (no
// bespoke shortcut, §3.11). Given a CONFIRMED lever + its inRange flag: out-of-range ⇒ escalate; else
// proposeNba seals the authoritative auto_releasable, the gate re-checks money (financial_class != 'direct'),
// autoDispatch re-checks §7, and the learning case (now carrying the structured lever + its embedding, so it
// can become a future precedent) commits in the SAME tx as the dispatch (P1-6 atomicity).
async function actOnLever(
  i: MotorAttemptInput,
  lever: NbaVerdict,
  rootCause: string,
  inRange: boolean,
  discarded: { action_code: string; reason: string }[],
  attemptId: string,
  loops: number,
): Promise<MotorAttemptResult> {
  if (!inRange) {
    discarded.push(discardItem(lever, "out_of_range"));
    return escalate(i, attemptId, "out_of_range", lever, discarded, loops);
  }
  const res = await withTx((c) => proposeNba({ restaurantId: i.restaurantId, cohortId: i.cohortId, week: i.week }, leverAdapter(lever, rootCause), c));
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
      const pattern = `${lever.dimension}_${lever.verdict}`;
      // canonical embed = the signal pattern (write == the query text) so a deterministic-embedder env can
      // still retrieve it (Codex P2); the precise discrimination is the VERSIONED structured lever below, not
      // the embedding. rootCause is persisted in `resolution`, not folded into the (canonical) embedding text.
      const embedding = await embedCaseText(pattern); // best-effort, OUTSIDE the tx (external call)
      const ruleVersion = await currentRuleVersion(query); // §3.5 — stamp the baseline this fix was verified under
      await withTx(async (c) => {
        await autoDispatch(res.nbaId, i.tenantId, c);
        await writeMotorCase(
          {
            tenantId: i.tenantId,
            areaType: lever.dimension ?? "nba",
            pattern,
            outcome: "resolved",
            resolution: rootCause,
            discarded,
            attemptId,
            nbaId: res.nbaId,
            lever: { action_code: lever.action_code, dimension: lever.dimension, verdict: lever.verdict, cohort_rule_version: ruleVersion },
            embedding,
          },
          c,
        );
      });
      return { outcome: "acted", reason: lever.action_code, nbaId: res.nbaId, loops, attemptId };
    } catch (e) {
      // a cohort/action dedup CONFLICT means another restaurant already dispatched this action — an
      // idempotent SKIP, not a failure (don't flood the human queue with a bogus 'dispatch_failed').
      if (e instanceof TRPCError && e.code === "CONFLICT") {
        return { outcome: "skipped", reason: "already_dispatched", nbaId: null, loops, attemptId };
      }
      return escalate(i, attemptId, "dispatch_failed", lever, discarded, loops);
    }
  }
  return escalate(i, attemptId, "gate_failed_at_seal", lever, discarded, loops);
}
