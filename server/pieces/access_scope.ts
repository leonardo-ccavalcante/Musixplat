// Piece 05A:A.2.0 — resolve access scope from credential, capped by teto_tier. Pure, fail-closed.
// RLS/credential eligibility gate (status='activa' + action in matrix) runs BEFORE least().
// levelMax NEVER exceeds teto_tier: least(rbac.level_max_liberable, tetoTier) over ordered enum.
// null/invalid tetoTier ⇒ LOW cap (fail-closed §3.7). Deterministic, no LLM. (04 §3 / §7)

export type Nivel = "LOW" | "MEDIUM" | "HIGH";

export interface RbacEntry {
  level_max_liberable: Nivel;
  requiere_2_ojos: boolean;
  origen_permitido: string[];
}

export interface Credencial {
  status: string;
  role: string;
  rbac_matriz: Record<string, RbacEntry>;
}

export interface AccessScope {
  allowed: boolean;
  levelMax: Nivel;
  requiere2Ojos: boolean;
  origenPermitido: string[];
}

const FAIL_CLOSED: AccessScope = {
  allowed: false,
  levelMax: "LOW",
  requiere2Ojos: true,
  origenPermitido: [],
};

/** Ordered enum: index = ordinal; lower index = lower level. */
const NIVEL_ORDER: Record<Nivel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

const NIVEL_KEYS: Nivel[] = ["LOW", "MEDIUM", "HIGH"];

function isNivel(v: unknown): v is Nivel {
  return typeof v === "string" && v in NIVEL_ORDER;
}

/** least(a, b) over ordered autonomy_level enum (LOW < MEDIUM < HIGH). */
function leastNivel(a: Nivel, b: Nivel): Nivel {
  return NIVEL_KEYS[Math.min(NIVEL_ORDER[a], NIVEL_ORDER[b])]!;
}

/**
 * Resolve effective access scope for `action` from a Credencial row and teto_tier ceiling.
 * Eligibility check (status + rbac) is separate from the least() cap — two distinct gates.
 */
export function resolveAccessScope(
  cred: Credencial | null | undefined,
  action: string,
  tetoTier: Nivel | null | undefined,
): AccessScope {
  // Missing credential ⇒ fail-closed (§3.7).
  if (cred == null) return { ...FAIL_CLOSED };

  // Eligibility gate 1: credential must be active.
  if (cred.status !== "activa") return { ...FAIL_CLOSED };

  // Eligibility gate 2: action must exist in the rbac matrix.
  const entry = cred.rbac_matriz[action];
  if (entry == null) return { ...FAIL_CLOSED };

  // Cap: null/invalid tetoTier ⇒ LOW (fail-closed ceiling, never optimistic).
  const effectiveTeto: Nivel = isNivel(tetoTier) ? tetoTier : "LOW";

  const levelMax = leastNivel(entry.level_max_liberable, effectiveTeto);

  return {
    allowed: true,
    levelMax,
    requiere2Ojos: entry.requiere_2_ojos,
    origenPermitido: entry.origen_permitido,
  };
}
