import type pg from "pg";

// 02C MOTOR-LLM learning store (04 §3, BR-B16). Each terminal decision in the loop writes ONE
// Knowledge_Case row with reviewed=false — it does NOT ground future runs until a human approves it
// (the RL-guard). Grounding reads ONLY reviewed=true cases, so the AI never learns from un-vetted text.
// NO number is ever written here (§14): `outcome` is a measured RESULT, the narrative is [C].

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
}

export async function writeMotorCase(k: MotorCase, client: pg.PoolClient): Promise<string> {
  const prov = JSON.stringify({ outcome: "[V]", resolution: "[C]", not_resolved_reason: "[C]" });
  const path = JSON.stringify({ attempt_id: k.attemptId, nba_id: k.nbaId, resolution: k.resolution ?? null });
  const r = await client.query<{ kb_case_id: string }>(
    `insert into tenant."Knowledge_Case"
       (tenant_id, area_type, pattern, outcome, resolution, path_used, not_resolved_reason, discarded_branches, reviewed, provenance_by_field)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,false,$9::jsonb)
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
  // (discarded_branches) — not just the pattern/outcome. Reviewed-only (BR-B16 RL-guard). All TEXT, no number.
  const r = await client.query<GroundingCase>(
    `select pattern, outcome, resolution, not_resolved_reason, discarded_branches from tenant."Knowledge_Case"
      where tenant_id=$1 and reviewed=true and outcome is not null and area_type = any($2)
      order by created_at desc limit 8`,
    [tenantId, areas],
  );
  return r.rows;
}
