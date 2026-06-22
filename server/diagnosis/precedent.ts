import type { QueryResultRow } from "pg";
import { resolveEmbedder, type Embedder } from "../knowledge/embedder.js";
import type { NbaVerdict } from "../agente/reasoning.js";

// 05D Part B (F2) — precedent-first. A VERIFIED past fix (a Knowledge_Case the Part D re-measurement proved
// closed) is retrieved by semantic kNN and reused ONLY if its structured lever still holds on the current
// data. Two independent gates (Leo's hard rule): (a) measured-verified, never raw 'acted'; (b) the
// sub-hypothesis signal re-confirms (deterministic SQL — the verdicts the motor already produced, §8/§14).

// The structured predicate persisted on a Knowledge_Case (§4 lever): enough to re-validate the precedent.
// cohort_rule_version makes it a VERSIONED predicate — a precedent verified under one baseline is never
// reused under another (§3.5 anti-mezcla).
export interface PrecedentLever {
  action_code: string;
  dimension: string | null;
  verdict: string | null;
  cohort_rule_version: string | null;
}

// Injectable row executor so the accept-gate is unit-testable with a fake (no DB). Mirrors the pool's query.
export type Exec = <T extends QueryResultRow>(sql: string, params: readonly unknown[]) => Promise<T[]>;

/** Does the precedent's lever STILL hold on the current fresh verdicts? Match the FULL predicate (Codex):
 *  same action_code AND dimension AND the SAME breach direction the precedent fixed (not the opposite), with
 *  a real gap. Returns the FRESH verdict to act on — so the reused action runs on CURRENT data, never the
 *  stale persisted number (§14). null ⇒ the lever no longer holds here ⇒ don't reuse. Pure. */
export function reconfirmsLever(verdicts: NbaVerdict[], lever: PrecedentLever): NbaVerdict | null {
  const v = verdicts.find((x) => x.action_code === lever.action_code && x.dimension === lever.dimension);
  if (!v) return null;
  return v.verdict === lever.verdict && (v.verdict === "below" || v.verdict === "above") && v.gap != null ? v : null;
}

/** §3.5 — the CURRENT cohort-rule baseline (a Config_Knobs string, not a number). A precedent is reusable
 *  only under the baseline it was verified on; absent ⇒ fail-closed (no reuse). */
export async function currentRuleVersion(exec: Exec): Promise<string | null> {
  const r = await exec<{ value: string }>(`select value from catalog."Config_Knobs" where key='cohort_rule_version_current'`, []);
  return r[0]?.value ?? null;
}

const toVector = (v: number[]): string => `[${v.join(",")}]`;

/** 05D Part B — embed a case's situation text at WRITE time for the precedent kNN. Best-effort: a failed or
 *  absent embedder ⇒ null (the case is still written, just not retrievable as a precedent until re-embedded);
 *  never throws, so an embedding outage never blocks the motor's learning write (§3.7). resolveEmbedder is
 *  VITEST-hermetic (deterministic, free, no network under test). */
export async function embedCaseText(text: string): Promise<number[] | null> {
  try {
    const e = await resolveEmbedder();
    const [v] = await e.embed([text]);
    return v ?? null;
  } catch {
    return null;
  }
}

export interface AcceptedPrecedent {
  kbCaseId: string;
  resolution: string | null;
  lever: PrecedentLever;
  freshVerdict: NbaVerdict; // the current confirming verdict to act on (not the stale persisted one)
}

/** 05D Part B accept-gate (§50/§94). kNN finds the nearest **verified_fixed** precedent (a fix a Part D
 *  re-measurement actually proved closed — never a raw `outcome='acted'`); ACCEPT only if its structured
 *  lever RE-CONFIRMS on the current fresh verdicts. Fail-closed (§7): no verified candidate, an empty
 *  embedding, or a lever that no longer holds ⇒ null (the caller proposes its own hypothesis instead).
 *  tenant resolved server-side by the caller (§3.4). Numbers stay SQL — this only retrieves + gates text. */
export async function acceptPrecedent(
  tenantId: string,
  verdicts: NbaVerdict[],
  queryText: string,
  exec: Exec,
  embedder: Embedder,
  minSim: number,
): Promise<AcceptedPrecedent | null> {
  // §3.5 anti-mezcla: only a precedent verified under the CURRENT baseline may be reused. Absent ⇒ fail-closed.
  const ruleVersion = await currentRuleVersion(exec);
  if (!ruleVersion) return null;
  const [vec] = await embedder.embed([queryText]);
  if (!vec) return null;
  // The nearest verified precedent OF THE CURRENT BASELINE, ABOVE the similarity floor (§3.8
  // `precedent_similarity_min`): a dissimilar nearest-neighbor or a stale-baseline one is rejected here —
  // never reused just because its action_code happens to currently breach.
  const rows = await exec<{ kb_case_id: string; resolution: string | null; lever: PrecedentLever | null }>(
    `select kb_case_id, resolution, lever
       from tenant."Knowledge_Case"
      where tenant_id = $1 and verification_status = 'verified_fixed'
        and embedding is not null and lever is not null
        and lever->>'cohort_rule_version' = $4
        and (1 - (embedding <=> $2::vector)) >= $3
      order by embedding <=> $2::vector
      limit 1`,
    [tenantId, toVector(vec), minSim, ruleVersion],
  );
  const cand = rows[0];
  if (!cand || !cand.lever) return null;
  const fresh = reconfirmsLever(verdicts, cand.lever);
  if (!fresh) return null;
  return { kbCaseId: cand.kb_case_id, resolution: cand.resolution, lever: cand.lever, freshVerdict: fresh };
}
