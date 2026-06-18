// Piece 05A:A.5.1 — build pedido_ejecucion + deterministic idempotency_key; seal policy_version.
// Pure. No randomness, no Date, no I/O. (04 §7)
//
// Hash algorithm: FNV-1a 32-bit (Fowler–Noll–Vo, public domain, well-known).
// Chosen because: (a) pure bitwise arithmetic — no node:crypto, no jsdom compat issues;
// (b) strong avalanche for short strings (changing 1 char flips ~50 % of bits);
// (c) fits trivially in <15 lines, no external dep.
// Output: 8-char lowercase hex string (e.g. "a3f2b1c0").
//
// Fail-closed rule (§3.7 / CLAUDE.md §3): missing/empty required field ⇒ {idempotency_key:null}.
// pedido contents intentionally excluded from the key — only (conversationId, nbaId, policyVersion)
// determine de-dup identity; re-delivering the same logical request with updated pedido still
// deduplicates correctly at the P2 handoff.

export interface ExecRequestInput {
  conversationId: string;
  nbaId: string;
  policyVersion: string;
  pedido: Record<string, unknown>;
}

export interface ExecRequest {
  pedido_ejecucion: Record<string, unknown>;
  idempotency_key: string | null;
}

/** FNV-1a 32-bit over a UTF-16 code-unit sequence. Pure arithmetic — no crypto, no I/O. */
function fnv1a32(s: string): string {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // imul keeps result in 32-bit signed range across JS engines
    h = Math.imul(h, 0x01000193) >>> 0; // FNV prime; >>> 0 → uint32
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Assemble the execution-request object for handoff to P2.
 *
 * Determinism guarantee: same {conversationId, nbaId, policyVersion} ⇒ same idempotency_key,
 * regardless of pedido contents or call order. Any required field absent or empty ⇒
 * {idempotency_key: null, pedido_ejecucion: {}} (fail-closed; caller must not dispatch).
 */
export function buildExecRequest(i: ExecRequestInput | null | undefined): ExecRequest {
  const NULL_RESULT: ExecRequest = { pedido_ejecucion: {}, idempotency_key: null };

  if (!i) return NULL_RESULT;

  const { conversationId, nbaId, policyVersion, pedido } = i;

  // Fail-closed: all three key fields must be non-empty strings.
  if (!conversationId || !nbaId || !policyVersion) return NULL_RESULT;

  // Canonical delimiter chosen to be outside normal UUID/semver char set.
  const canonical = `${conversationId}|${nbaId}|${policyVersion}`;
  const idempotency_key = fnv1a32(canonical);

  // Seal policy_version into the execution request so downstream can never mix versions.
  const pedido_ejecucion: Record<string, unknown> = { ...pedido, policy_version: policyVersion };

  return { pedido_ejecucion, idempotency_key };
}
