import type pg from "pg";
import { query } from "../db/pool.js";

export type Level = "LOW" | "MEDIUM" | "HIGH";

export interface MinConversationInput {
  episodeId: string;
  nbaRequest: Level | null;
  releasedEvals: Level | null;
  tierCap: Level | null;
}
export interface MinConversationResult {
  calculationId: string;
  effectiveLevel: Level;
}

// 05A:A.4.6 — seal a min_calculation row for the conversation path (nba_id null ⇒ XOR origin = episode).
// The least() engine lives in SQL (gov.compute_effective_level over the ordered autonomy_level
// enum); a null/missing arm ⇒ LOW (fail-closed §3.7). The row is append-only and produced HERE
// at runtime — never seeded (§14). The table CHECK re-verifies effective_level = least(arms). BR-A5.
export async function sealMinCalculationConversation(i: MinConversationInput): Promise<MinConversationResult> {
  const r = await query<{ calculation_id: string; effective_level: Level }>(
    `insert into gov."min_calculation"(episode_id, nba_request, released_evals, tier_cap, effective_level)
     values (
       $1,
       coalesce($2,'LOW')::public.autonomy_level,
       coalesce($3,'LOW')::public.autonomy_level,
       coalesce($4,'LOW')::public.autonomy_level,
       gov.compute_effective_level($2::public.autonomy_level,$3::public.autonomy_level,$4::public.autonomy_level)
     )
     returning calculation_id, effective_level`,
    [i.episodeId, i.nbaRequest, i.releasedEvals, i.tierCap],
  );
  const row = r[0]!;
  return { calculationId: row.calculation_id, effectiveLevel: row.effective_level };
}

export interface MinNbaInput {
  nbaId: string;
  nbaRequest: Level | null;
  releasedEvals: Level | null;
  tierCap: Level | null;
  cohortRuleVersion?: string | null;
}

// 02:1B — seal a min_calculation row for the NBA path (conversation_id null ⇒ XOR origin = nba). Reuses
// the SAME SQL least() engine as the conversation path; a null/missing arm ⇒ LOW (fail-closed §3.7).
// Append-only, produced at runtime, never seeded (§14). Optional client ⇒ runs inside a caller tx.
export async function sealMinCalculationNBA(
  i: MinNbaInput,
  client?: pg.PoolClient,
): Promise<MinConversationResult> {
  const sql = `insert into gov."min_calculation"(nba_id, nba_request, released_evals, tier_cap, effective_level, cohort_rule_version)
     values (
       $1,
       coalesce($2,'LOW')::public.autonomy_level,
       coalesce($3,'LOW')::public.autonomy_level,
       coalesce($4,'LOW')::public.autonomy_level,
       gov.compute_effective_level($2::public.autonomy_level,$3::public.autonomy_level,$4::public.autonomy_level),
       $5
     )
     returning calculation_id, effective_level`;
  const params = [i.nbaId, i.nbaRequest, i.releasedEvals, i.tierCap, i.cohortRuleVersion ?? null];
  const r = client
    ? (await client.query<{ calculation_id: string; effective_level: Level }>(sql, params)).rows
    : await query<{ calculation_id: string; effective_level: Level }>(sql, params);
  const row = r[0]!;
  return { calculationId: row.calculation_id, effectiveLevel: row.effective_level };
}
