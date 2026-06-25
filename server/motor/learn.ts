import type pg from "pg";
import type { PrecedentLever } from "../diagnosis/precedent.js";

// 02C MOTOR-LLM learning store (04 §3, BR-B16). Each terminal decision in the loop writes ONE
// Knowledge_Case row with reviewed=false — it does NOT ground future runs until a human approves it
// (the RL-guard). Grounding reads ONLY reviewed=true cases, so the AI never learns from un-vetted text.
// NO number is ever written here (§14): `outcome` is a [C] classification, the narrative is [C].

// 05D Part B — a vector string `[a,b,...]` for the pgvector column (NULL ⇒ not retrievable as a precedent yet).
const toVector = (v: number[] | null | undefined): string | null => (v && v.length ? `[${v.join(",")}]` : null);

export interface MotorCase {
  tenantId: string;
  areaType: string; // lever.dimension (e.g. "m_connection")
  pattern: string; // e.g. `${dimension}_${verdict}`
  outcome: "resolved" | "escalated"; // resolved = AI acted alone; escalated = handed to human
  resolution?: string | null; // [C] what it did (acted)
  notResolvedReason?: string | null; // [C] why escalated
  discarded: { action_code: string; reason: string }[];
  attemptId: string; // motor_attempt_id — ties cost (Llm_Usage_Log.ref_id)
  nbaId: string | null; // the dispatched NBA when acted
  lever?: PrecedentLever | null; // 05D Part B — the structured predicate, so Part B can re-validate it later
  embedding?: number[] | null; // 05D Part B — semantic key for precedent kNN (NULL ⇒ not retrievable yet)
  restaurantId?: string | null; // 05D Part D — re-measure target: the SAME restaurant the action ran on
  actedWeek?: string | null; // 05D Part D — the week measured; re-measure at actedWeek + resolution_verify_window
}

export async function writeMotorCase(k: MotorCase, client: pg.PoolClient): Promise<string> {
  // outcome is a [C] classification ('acted alone' / 'escalated'), NOT a measured [V] (05D §82): the ONLY
  // [V] is verification_status, written solely by the Part D re-measurement job once it proves a gap-close.
  const prov = JSON.stringify({ outcome: "[C]", resolution: "[C]", not_resolved_reason: "[C]" });
  // path_used also carries the 05D Part D re-measure target (restaurant + acted week) — inputs, not [V]
  // results — so the prove-it-resolved producer can re-run the SAME signal a window later.
  const path = JSON.stringify({
    attempt_id: k.attemptId, nba_id: k.nbaId, resolution: k.resolution ?? null,
    restaurant_id: k.restaurantId ?? null, acted_week: k.actedWeek ?? null,
  });
  const r = await client.query<{ kb_case_id: string }>(
    `insert into tenant."Knowledge_Case"
       (tenant_id, area_type, pattern, outcome, resolution, path_used, not_resolved_reason, discarded_branches, reviewed, provenance_by_field, lever, embedding)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,false,$9::jsonb,$10::jsonb,$11::vector)
     returning kb_case_id`,
    [
      k.tenantId,
      k.areaType,
      k.pattern,
      k.outcome,
      k.resolution ?? null,
      path,
      k.notResolvedReason ?? null,
      JSON.stringify(k.discarded),
      prov,
      k.lever ? JSON.stringify(k.lever) : null,
      toVector(k.embedding),
    ],
  );
  return r.rows[0]!.kb_case_id;
}

export interface GroundingCase {
  pattern: string;
  outcome: string;
  resolution: string | null; // POSITIVE polarity: the action that WORKED (replicate it) — P2-3
  not_resolved_reason: string | null; // NEGATIVE polarity: why it failed
  discarded_branches: unknown; // the hypotheses already falsified (prune them) — P2-3
}

export async function readGrounding(tenantId: string, areas: string[], client: pg.PoolClient): Promise<GroundingCase[]> {
  // P2-3: carry BOTH polarities so the LLM can replicate what worked (resolution) AND prune what didn't
  // (discarded_branches) — not just the pattern/outcome. All TEXT, no number.
  // 05D Part D RL-guard split (decision #2/#3): a case grounds future runs if a HUMAN reviewed it OR the Part D
  // re-measurement MEASURED a real gap-close (verification_status='verified_fixed'). A measured fix is a strong
  // precedent without waiting for human review; a raw 'acted' (unverified) still never grounds (§14, no fake).
  const r = await client.query<GroundingCase>(
    `select pattern, outcome, resolution, not_resolved_reason, discarded_branches from tenant."Knowledge_Case"
      where tenant_id=$1 and (reviewed=true or verification_status='verified_fixed') and outcome is not null and area_type = any($2)
      order by created_at desc limit 8`,
    [tenantId, areas],
  );
  return r.rows;
}
