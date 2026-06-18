// Piece 05A:A.2.0 — resolve access scope from credential, capped by teto_tier. Pure, fail-closed.
// RLS/credential eligibility gate (estado='activa' + action in matrix) runs BEFORE least().
// nivelMax NEVER exceeds teto_tier: least(rbac.nivel_max_liberable, tetoTier) over ordered enum.
// null/invalid tetoTier ⇒ BAJA cap (fail-closed §3.7). Deterministic, no LLM. (04 §3 / §7)

export type Nivel = "BAJA" | "MEDIA" | "ALTA";

export interface RbacEntry {
  nivel_max_liberable: Nivel;
  requiere_2_ojos: boolean;
  origen_permitido: string[];
}

export interface Credencial {
  estado: string;
  rol: string;
  rbac_matriz: Record<string, RbacEntry>;
}

export interface AccessScope {
  allowed: boolean;
  nivelMax: Nivel;
  requiere2Ojos: boolean;
  origenPermitido: string[];
}

const FAIL_CLOSED: AccessScope = {
  allowed: false,
  nivelMax: "BAJA",
  requiere2Ojos: true,
  origenPermitido: [],
};

/** Ordered enum: index = ordinal; lower index = lower nivel. */
const NIVEL_ORDER: Record<Nivel, number> = { BAJA: 0, MEDIA: 1, ALTA: 2 };

const NIVEL_KEYS: Nivel[] = ["BAJA", "MEDIA", "ALTA"];

function isNivel(v: unknown): v is Nivel {
  return typeof v === "string" && v in NIVEL_ORDER;
}

/** least(a, b) over ordered nivel_autonomia enum (BAJA < MEDIA < ALTA). */
function leastNivel(a: Nivel, b: Nivel): Nivel {
  return NIVEL_KEYS[Math.min(NIVEL_ORDER[a], NIVEL_ORDER[b])]!;
}

/**
 * Resolve effective access scope for `action` from a Credencial row and teto_tier ceiling.
 * Eligibility check (estado + rbac) is separate from the least() cap — two distinct gates.
 */
export function resolveAccessScope(
  cred: Credencial | null | undefined,
  action: string,
  tetoTier: Nivel | null | undefined,
): AccessScope {
  // Missing credential ⇒ fail-closed (§3.7).
  if (cred == null) return { ...FAIL_CLOSED };

  // Eligibility gate 1: credential must be active.
  if (cred.estado !== "activa") return { ...FAIL_CLOSED };

  // Eligibility gate 2: action must exist in the rbac matrix.
  const entry = cred.rbac_matriz[action];
  if (entry == null) return { ...FAIL_CLOSED };

  // Cap: null/invalid tetoTier ⇒ BAJA (fail-closed ceiling, never optimistic).
  const effectiveTeto: Nivel = isNivel(tetoTier) ? tetoTier : "BAJA";

  const nivelMax = leastNivel(entry.nivel_max_liberable, effectiveTeto);

  return {
    allowed: true,
    nivelMax,
    requiere2Ojos: entry.requiere_2_ojos,
    origenPermitido: entry.origen_permitido,
  };
}
