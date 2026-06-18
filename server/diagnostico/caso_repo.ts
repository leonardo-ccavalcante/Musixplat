// EPIC-B6 repository (deterministic CRUD, no LLM). Piece:
//   US-B6.2.1   — upsertCasoRepo: write/increment the replicable case (CASE_REPO jsonb on
//                 Diagnosed_Problem, §4 not a table) + frequency + last_seen_ts.
// BR-B15: turns an inconstant case into a replicable one. PII redacted before persist (BR-B7).
import { query } from "../db/pool.js";
import { redactPII } from "../pieces/pii.js";

export interface CasoRepoInput {
  cliente_id?: string;
  dia?: string;
  screenshots?: string[];
  programas_levantados?: string[];
  links_replicaveis?: string[];
  where_concentrated?: unknown;
  raw_data?: unknown;
}

export interface CasoRepoResult {
  frequency: number;
  created: boolean;
}

// String fields that carry free text / ids ⇒ must be PII-redacted before persist (BR-B7).
const STRING_KEYS = ["cliente_id", "dia"] as const;
const STRING_ARRAY_KEYS = ["screenshots", "programas_levantados", "links_replicaveis"] as const;

/**
 * Redact PII from every string field of `caso` BEFORE it is persisted (BR-B7, 05A:A.1.2).
 * Fail-closed (CLAUDE.md §3.7): if the independent residual net still flags PII in any field,
 * we throw rather than persist a leaky case. No LLM — redactPII is pure deterministic regex.
 */
function redactCaso(caso: CasoRepoInput): CasoRepoInput {
  const out: CasoRepoInput = { where_concentrated: caso.where_concentrated, raw_data: caso.raw_data };
  const guard = (raw: string): string => {
    const r = redactPII(raw);
    if (r.residualPII) throw new Error("BR-B7: residual PII — refusing to persist case_repo");
    return r.texto;
  };
  for (const k of STRING_KEYS) {
    const v = caso[k];
    if (v !== undefined) out[k] = guard(v);
  }
  for (const k of STRING_ARRAY_KEYS) {
    const v = caso[k];
    if (v !== undefined) out[k] = v.map(guard);
  }
  return out;
}

/**
 * US-B6.2.1 (04 §3 / §14, BR-B15, BR-B7) — persist a new replicable case or increment the
 * frequency of an existing one. case_repo is a jsonb sub-object on Diagnosed_Problem
 * (§4: NOT a table). PII is redacted first (BR-B7); the write fails closed if residual PII
 * survives. The branch + the returned frequency come from a single atomic UPDATE so the
 * count is read from the DB (RETURNING), never recomputed in TS (§14: frequency is a
 * computed count). When case_repo was NULL we set it + last_seen_ts (created=true) and leave
 * frequency untouched; when it already exists we bump frequency+1 + last_seen_ts
 * (created=false). `was_null` is captured from the pre-update value in the same statement.
 */
export async function upsertCasoRepo(
  problemaId: string,
  caso: CasoRepoInput,
): Promise<CasoRepoResult> {
  const safe = redactCaso(caso);
  const rows = await query<{ frequency: number; created: boolean }>(
    `update tenant."Diagnosed_Problem" p
        set case_repo = $2::jsonb,
            frequency = case when p.case_repo is null then p.frequency else p.frequency + 1 end,
            last_seen_ts = now()
       from (select case_repo as prev from tenant."Diagnosed_Problem" where problem_id = $1) s
      where p.problem_id = $1
      returning p.frequency as frequency, (s.prev is null) as created`,
    [problemaId, JSON.stringify(safe)],
  );
  const row = rows[0];
  if (!row) throw new Error(`US-B6.2.1: no Diagnosed_Problem for ${problemaId}`);
  return { frequency: row.frequency, created: row.created };
}
