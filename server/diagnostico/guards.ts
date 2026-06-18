// EPIC-B3 + edge cases — transversal hard-nos (deterministic, no LLM). Pieces:
//   EC-B5       — assertSingleTenant: >1 tenant_id in an aggregation ⇒ abort HARD + Security_Log
//   US-B3.3.1   — assertBoundary: population-cross boundary check (reuses EC-B5)
//   EC-B6       — scanBorderPII: redact/block at every read/write border (reuses 05A redactPII)
//   EC-B10      — guardInjection: conversa text = DATA never instruction; log señal_inyeccion
// BR-B6/B7 are HARD-NOs (fail-closed). Cross-tenant within a pool is fine; cross-pool aborts.
// 04 §3 (R4 RLS single-pool, R6 deterministic-never-LLM) / §7 (fail-closed mother rule).
import { query } from "../db/pool.js";
import { redactPII } from "../pieces/pii.js";

export interface PIIScan {
  texto: string;
  /** true ⇒ residual PII; caller must NOT persist / emit (fail-closed, EC-B6) */
  blocked: boolean;
  tipos: string[];
}

export interface InjectionGuard {
  tratadoComoDato: true;
  senalInyeccion: boolean;
}

/** EC-B5 — abort + log if an aggregation touches more than one tenant_id (cross-pool hard-no).
 *  Cross-restaurante within ONE tenant is allowed (a pool is many restaurantes). BR-B5/BR-B6. */
export async function assertSingleTenant(tenantIds: readonly string[], detail?: unknown): Promise<void> {
  const distinct = [...new Set(tenantIds)];
  if (distinct.length <= 1) return; // ≤1 tenant ⇒ within one pool, allowed.
  const base = typeof detail === "object" && detail !== null ? (detail as Record<string, unknown>) : {};
  await query(
    `insert into gov."Security_Log"(tenant_id, kind, detail) values ($1, 'cross_tenant', $2)`,
    [distinct[0], JSON.stringify({ piece: "05B:EC-B5", tenants: distinct, ...base })],
  );
  throw new Error("cross-tenant aggregation blocked (05B:EC-B5, BR-B6 hard-no)");
}

/** US-B3.3.1 — boundary check over rows about to cross; reuses assertSingleTenant (BR-B6). */
export async function assertBoundary(rows: ReadonlyArray<{ tenant_id: string }>): Promise<void> {
  await assertSingleTenant(rows.map((r) => r.tenant_id));
}

/** EC-B6 — scan a border payload; redact and flag block on residual PII (reuse 05A redactPII).
 *  blocked=true ⇒ caller MUST NOT persist/emit the text (fail-closed, BR-B7). */
export function scanBorderPII(text: string): PIIScan {
  const r = redactPII(text);
  return { texto: r.texto, blocked: r.residualPII, tipos: r.tipos };
}

// EC-B10 — prompt-injection / instruction-override signatures. Pure deterministic detection;
// conversa text is ALWAYS treated as DATA, the motor never executes it. Case-insensitive. The
// presence of any signature only RAISES señal_inyeccion (audit) — it never changes control flow.
const INJECTION_PATTERNS: readonly RegExp[] = [
  /\bignore\s+(?:all\s+|the\s+|any\s+)?(?:previous|prior|above|earlier)\b/i,
  /\bdisregard\s+(?:all\s+|the\s+|any\s+|your\s+)?(?:previous|prior|above|instructions?|rules?)\b/i,
  /\bforget\s+(?:everything|all|your|the\s+(?:above|previous))\b/i,
  /\boverride\s+(?:the\s+|your\s+|all\s+)?(?:instructions?|rules?|prompt|system)\b/i,
  /\b(?:system|assistant|developer)\s*:/i, // role spoofing, e.g. "system:"
  /\byou\s+are\s+now\b/i,
  /\bact\s+as\s+(?:a\s+|an\s+|if\b)/i,
  /\bpretend\s+(?:to\s+be|you\s+are)\b/i,
  /\bnew\s+(?:instructions?|rules?|prompt)\b/i,
  /\bprompt\s+injection\b/i,
];

/** EC-B10 — treat conversa text as DATA; never execute embedded instructions; flag injection. */
export function guardInjection(text: string): InjectionGuard {
  const senalInyeccion = INJECTION_PATTERNS.some((re) => re.test(text));
  return { tratadoComoDato: true, senalInyeccion };
}
