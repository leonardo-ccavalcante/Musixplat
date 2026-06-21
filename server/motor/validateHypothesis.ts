// 02C:2 — validateHypothesis: the DETERMINISTIC falsifier in the MOTOR-LLM ≤3 loop. Given a lever the
// engine chose (an NbaVerdict that SQL fn_nba_test already produced, §8/§14), it returns the two facts
// that decide retry-vs-escalate-vs-attempt:
//   - confirmed: this lever is a REAL problem (verdict ∈ {below,above} AND gap != null) — READ from the
//     verdict fields, NEVER recomputed. The number stays SQL's; we only inspect its sense.
//   - inRange:   the lever's action_code ∈ the cohort tier's Policy_Tier.allowed_today.auto_actions
//     (the human-approved range). Unknown tier / no row ⇒ false (fail-closed, §7), never optimistic.
// It does NOT re-implement the auto_releasable / money hard-no gate — that authority lives in
// sealMinCalculationNBA + autoDispatch (§3.11). This function only narrows the hypothesis loop.
import type pg from "pg";
import type { NbaVerdict } from "../agente/reasoning.js";

export interface Validation {
  confirmed: boolean; // SQL says this lever is out of range with a real gap (read, not recomputed)
  inRange: boolean; // action_code ∈ allowed_today.auto_actions for the cohort's tier
}

export async function validateHypothesis(
  lever: NbaVerdict,
  tierId: string,
  tenantId: string,
  client: pg.PoolClient,
): Promise<Validation> {
  const confirmed = (lever.verdict === "below" || lever.verdict === "above") && lever.gap != null;
  // jsonb `@>` containment on the action_code; coalesce ⇒ false when allowed_today lacks auto_actions.
  // P1-4 (§3.4): a tier spans pools, so read ONLY a policy SIGNED within this tenant — the lexicographically
  // latest GLOBAL policy could belong to another pool and authorize an action this pool never approved. No
  // tenant-owned row ⇒ rows[0] undefined ⇒ fail-closed to false (§7).
  const r = await client.query<{ ok: boolean }>(
    `select coalesce(allowed_today->'auto_actions' @> to_jsonb($2::text), false) as ok
       from gov."Policy_Tier"
      where tier_id = $1 and human_signature in (select user_id from gov."User" where tenant_id = $3)
      order by policy_version desc limit 1`,
    [tierId, lever.action_code, tenantId],
  );
  return { confirmed, inRange: r.rows[0]?.ok ?? false };
}
