import { query } from "../db/pool.js";
import { runMotorAttempt, type MotorAttemptInput, type MotorAttemptResult } from "../motor/runMotor.js";
import { llmMotorReasoning } from "../motor/llmReasoning.js";
import { openaiChatClient } from "../_core/llm.js";
import type { MotorReasoning } from "../motor/reasoning.js";

// 05D close-the-loop (Leo) — after the diagnosis emits its dossier, it ALSO triggers the action motor for
// each AFFECTED restaurant of THIS problem. This module ONLY orchestrates: resolve every affected restaurant
// to its (cohort, week, tier) and run the per-restaurant motor primitive. The §7 money hard-no + the
// human-approved autonomy range live INSIDE runMotorAttempt (money / out-of-range → escalate to a human;
// non-money in-range → the AI acts alone) — reused here, never re-implemented (§3.11). Numbers stay SQL (§14).

export interface ActionTriggerResult {
  acted: number; // the AI dispatched alone (auto_releasable + non-money, in-range)
  escalated: number; // left for a human (money / out-of-range / failed gate / per-restaurant error)
  skipped: number; // the cohort action was already dispatched (idempotent dedup) — not a failure
  attempts: number; // resolved restaurants the motor actually ran on
}

interface Target { restaurant_id: string; cohort_id: string; week: string; tier_id: string | null }
type Exec = (sql: string, params: readonly unknown[]) => Promise<Target[]>;
type AttemptRunner = (i: MotorAttemptInput, reasoning: MotorReasoning) => Promise<MotorAttemptResult>;
export interface TriggerDeps { exec?: Exec; run?: AttemptRunner; reasoning?: MotorReasoning }

// Resolve every affected restaurant to the motor's input. §3.4: scoped by tenant (join Restaurant + tenant_id
// — presence in a pool-spanning cohort is NOT ownership). §3.5 anti-mezcla: CURRENT cohort_rule_version only.
// INNER joins drop a restaurant with no current-version membership/cohort (⇒ it stays with the human via the
// dossier). `distinct on` keeps each restaurant's latest-week membership; cms.cohort_id breaks ties
// DETERMINISTICALLY (Codex P2 — never an arbitrary tier under same-week multi-cohort). Capped (mirrors
// runMotorFanout's 12); a truncated set is LOGGED below, never silently dropped (the dossier holds the full set).
const MAX_TARGETS = 12;
const TARGETS_SQL = `
  select distinct on (a.restaurant_id)
         a.restaurant_id, cms.cohort_id, cms.week::text as week, co.tier_base::text as tier_id
    from tenant."Affected" a
    join tenant."Restaurant" r on r.restaurant_id = a.restaurant_id and r.tenant_id = $2
    join cohort."Cohort_Membership_Snapshot" cms on cms.restaurant_id = a.restaurant_id
         and cms.cohort_rule_version = (select value from catalog."Config_Knobs" where key='cohort_rule_version_current')
    join cohort."Cohort" co on co.cohort_id = cms.cohort_id
   where a.problem_id = $1
   order by a.restaurant_id, cms.week desc, cms.cohort_id
   limit ${MAX_TARGETS}`;

export async function triggerActionForProblem(
  problemId: string,
  tenantId: string,
  deps: TriggerDeps = {},
): Promise<ActionTriggerResult> {
  const exec = deps.exec ?? query;
  const run = deps.run ?? runMotorAttempt;
  const out: ActionTriggerResult = { acted: 0, escalated: 0, skipped: 0, attempts: 0 };

  const targets = await exec(TARGETS_SQL, [problemId, tenantId]);
  if (!targets.length) return out; // nothing diagnosed-and-resolvable ⇒ never construct the LLM client (no key needed)
  if (targets.length === MAX_TARGETS) {
    // Observability (Codex P2): the affected set hit the cap — the overflow is NOT acted on autonomously; it
    // stays with the human via the dossier. Logged so the truncation is never silent (it reads as "all done").
    console.warn(`[05D close-loop] problem ${problemId}: affected set capped at ${MAX_TARGETS}; overflow deferred to the human.`);
  }

  const reasoning = deps.reasoning ?? llmMotorReasoning(await openaiChatClient());
  for (const t of targets) {
    // Fail-closed: an unresolved target (e.g. a cohort with no tier) is left to the human via the dossier.
    if (!t.cohort_id || !t.week || !t.tier_id) continue;
    let res: MotorAttemptResult;
    try {
      res = await run({ restaurantId: t.restaurant_id, cohortId: t.cohort_id, week: t.week, tenantId, tierId: t.tier_id }, reasoning);
    } catch {
      // Fail-open (§7): a per-restaurant motor/db error degrades that one to a human, never aborts the loop —
      // the dossier is already emitted and must stand.
      out.escalated++;
      out.attempts++;
      continue;
    }
    if (res.outcome === "acted") out.acted++;
    else if (res.outcome === "skipped") out.skipped++;
    else out.escalated++;
    out.attempts++;
  }
  return out;
}
