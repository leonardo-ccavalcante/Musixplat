// Piece 05A:A.2.0 — resolve access scope from credential, capped by tier_cap. Pure, fail-closed.
// RLS/credential eligibility gate (status='active' + action in matrix) runs BEFORE least().
// levelMax NEVER exceeds tier_cap: least(rbac.level_max_releasable, tierCap) over ordered enum.
// null/invalid tierCap ⇒ LOW cap (fail-closed §3.7). Deterministic, no LLM. (04 §3 / §7)

export type Level = "LOW" | "MEDIUM" | "HIGH";

export interface RbacEntry {
  level_max_releasable: Level;
  requires_2_eyes: boolean;
  origin_allowed: string[];
}

export interface Credential {
  status: string;
  role: string;
  rbac_matrix: Record<string, RbacEntry>;
}

export interface AccessScope {
  allowed: boolean;
  levelMax: Level;
  requires2Eyes: boolean;
  originAllowed: string[];
}

const FAIL_CLOSED: AccessScope = {
  allowed: false,
  levelMax: "LOW",
  requires2Eyes: true,
  originAllowed: [],
};

/** Ordered enum: index = ordinal; lower index = lower level. */
const LEVEL_ORDER: Record<Level, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

const LEVEL_KEYS: Level[] = ["LOW", "MEDIUM", "HIGH"];

function isLevel(v: unknown): v is Level {
  return typeof v === "string" && v in LEVEL_ORDER;
}

/** least(a, b) over ordered autonomy_level enum (LOW < MEDIUM < HIGH). */
function leastLevel(a: Level, b: Level): Level {
  return LEVEL_KEYS[Math.min(LEVEL_ORDER[a], LEVEL_ORDER[b])]!;
}

/**
 * Resolve effective access scope for `action` from a Credential row and tier_cap ceiling.
 * Eligibility check (status + rbac) is separate from the least() cap — two distinct gates.
 */
export function resolveAccessScope(
  cred: Credential | null | undefined,
  action: string,
  tierCap: Level | null | undefined,
): AccessScope {
  // Missing credential ⇒ fail-closed (§3.7).
  if (cred == null) return { ...FAIL_CLOSED };

  // Eligibility gate 1: credential must be active.
  if (cred.status !== "active") return { ...FAIL_CLOSED };

  // Eligibility gate 2: action must exist in the rbac matrix.
  const entry = cred.rbac_matrix[action];
  if (entry == null) return { ...FAIL_CLOSED };

  // Cap: null/invalid tierCap ⇒ LOW (fail-closed ceiling, never optimistic).
  const effectiveTierCap: Level = isLevel(tierCap) ? tierCap : "LOW";

  const levelMax = leastLevel(entry.level_max_releasable, effectiveTierCap);

  return {
    allowed: true,
    levelMax,
    requires2Eyes: entry.requires_2_eyes,
    originAllowed: entry.origin_allowed,
  };
}
