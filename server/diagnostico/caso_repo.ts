// EPIC-B6 repositorio (CRUD determinista, no LLM). Piece:
//   US-B6.2.1   — upsertCasoRepo: write/increment the replicable case (CASO_REPO jsonb on
//                 Problema_Diagnosticado, §4 not a table) + frecuencia + ultima_vez_ts.
// BR-B15: turns an inconstant case into a replicable one. PII redacted before persist (BR-B7).
import { query } from "../db/pool.js";
import { redactPII } from "../pieces/pii.js";

export interface CasoRepoInput {
  cliente_id?: string;
  dia?: string;
  screenshots?: string[];
  programas_levantados?: string[];
  links_replicaveis?: string[];
  onde_concentra?: unknown;
  dados_crudos?: unknown;
}

export interface CasoRepoResult {
  frecuencia: number;
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
  const out: CasoRepoInput = { onde_concentra: caso.onde_concentra, dados_crudos: caso.dados_crudos };
  const guard = (raw: string): string => {
    const r = redactPII(raw);
    if (r.residualPII) throw new Error("BR-B7: residual PII — refusing to persist caso_repo");
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
 * frecuencia of an existing one. caso_repo is a jsonb sub-object on Problema_Diagnosticado
 * (§4: NOT a table). PII is redacted first (BR-B7); the write fails closed if residual PII
 * survives. The branch + the returned frecuencia come from a single atomic UPDATE so the
 * count is read from the DB (RETURNING), never recomputed in TS (§14: frecuencia is a
 * computed count). When caso_repo was NULL we set it + ultima_vez_ts (created=true) and leave
 * frecuencia untouched; when it already exists we bump frecuencia+1 + ultima_vez_ts
 * (created=false). `was_null` is captured from the pre-update value in the same statement.
 */
export async function upsertCasoRepo(
  problemaId: string,
  caso: CasoRepoInput,
): Promise<CasoRepoResult> {
  const safe = redactCaso(caso);
  const rows = await query<{ frecuencia: number; created: boolean }>(
    `update tenant."Problema_Diagnosticado" p
        set caso_repo = $2::jsonb,
            frecuencia = case when p.caso_repo is null then p.frecuencia else p.frecuencia + 1 end,
            ultima_vez_ts = now()
       from (select caso_repo as prev from tenant."Problema_Diagnosticado" where problema_id = $1) s
      where p.problema_id = $1
      returning p.frecuencia as frecuencia, (s.prev is null) as created`,
    [problemaId, JSON.stringify(safe)],
  );
  const row = rows[0];
  if (!row) throw new Error(`US-B6.2.1: no Problema_Diagnosticado for ${problemaId}`);
  return { frecuencia: row.frecuencia, created: row.created };
}
