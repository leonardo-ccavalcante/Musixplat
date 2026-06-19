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
  // 02:BR-5 auto_releasable gate (04 §3.3 L280). All optional; any omitted ⇒ fail-closed (no auto).
  financialDirect?: boolean; // money moves balance ⇒ never auto (also stands in for irreversible — the catalog carries no reversibility flag yet)
  nMinOk?: boolean | null; // verdict.n_min_ok of the chosen lever
  kAnonOk?: boolean | null; // verdict.k_anon_ok of the chosen lever
  policyResolved?: boolean; // a Policy_Tier resolved for the tier (tier_cap not null) — else fail-closed
  nCohort?: number | null;
}
export interface MinNbaResult {
  calculationId: string;
  effectiveLevel: Level;
  autoReleasable: boolean | null;
}

// 02:1B + 02:BR-5 — seal a min_calculation row for the NBA path (conversation_id null ⇒ XOR origin = nba).
// Reuses the SAME SQL least() engine as the conversation path; a null/missing arm ⇒ LOW (fail-closed §3.7).
// Also computes auto_releasable (04 §3.3 L280): effective_level=LOW ∧ no-money ∧ n_min_ok ∧ k_anon_ok ∧
// policy_resolved — the AUTO-vs-human gate (LOW = low-stakes ⇒ the AI acts alone). The predicate is
// fail-closed: financialDirect defaults true and the eval/policy gates default false, so an under-specified
// call can never auto-release. Append-only, produced at runtime, never seeded (§14). Optional client ⇒ tx.
export async function sealMinCalculationNBA(
  i: MinNbaInput,
  client?: pg.PoolClient,
): Promise<MinNbaResult> {
  const lvl = `gov.compute_effective_level($2::public.autonomy_level,$3::public.autonomy_level,$4::public.autonomy_level)`;
  const sql = `insert into gov."min_calculation"
       (nba_id, nba_request, released_evals, tier_cap, effective_level, auto_releasable, n_cohort, cohort_rule_version)
     values (
       $1,
       coalesce($2,'LOW')::public.autonomy_level,
       coalesce($3,'LOW')::public.autonomy_level,
       coalesce($4,'LOW')::public.autonomy_level,
       ${lvl},
       (${lvl} = 'LOW'::public.autonomy_level)
         and ($6 = false) and coalesce($7, false) and coalesce($8, false) and ($9 = true),
       $10, $5
     )
     returning calculation_id, effective_level, auto_releasable`;
  const params = [
    i.nbaId,
    i.nbaRequest,
    i.releasedEvals,
    i.tierCap,
    i.cohortRuleVersion ?? null,
    i.financialDirect ?? true, // unknown ⇒ treat as money/unsafe (fail-closed)
    i.nMinOk ?? false,
    i.kAnonOk ?? false,
    i.policyResolved ?? false,
    i.nCohort ?? null,
  ];
  const r = client
    ? (await client.query<{ calculation_id: string; effective_level: Level; auto_releasable: boolean | null }>(sql, params)).rows
    : await query<{ calculation_id: string; effective_level: Level; auto_releasable: boolean | null }>(sql, params);
  const row = r[0]!;
  return { calculationId: row.calculation_id, effectiveLevel: row.effective_level, autoReleasable: row.auto_releasable };
}
