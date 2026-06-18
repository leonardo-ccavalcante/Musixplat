// Piece 05A:A.6.1 — Seal policy_version/tono_version + no-stale check. Pure, fail-closed,
// anti-mezcla (CLAUDE.md §3.5). At episode close, verifies the versions the episode ACTED
// under still match the current vigente versions. Drift on either ⇒ sealed:false (the
// episode's numbers/decisions can't be honestly attributed to the current version).
// Deterministic, no LLM, no side-effects. (04 §7)

export interface VersionSealInput {
  actedPolicyVersion: string;
  vigentePolicyVersion: string;
  actedTonoVersion: string;
  vigenteTonoVersion: string;
}

export interface VersionSeal {
  sealed: boolean;
  stale: boolean;
  /** null when sealed:false — no attributable version on drift (anti-mezcla) */
  policy_version: string | null;
  /** null when sealed:false — no attributable version on drift (anti-mezcla) */
  tono_version: string | null;
  /** which version fields drifted; empty when sealed:true */
  drifted: string[];
}

/** Fail-closed seal: any drift or missing input ⇒ {sealed:false, stale:true}. */
export function sealVersions(i: VersionSealInput | null | undefined): VersionSeal {
  // Missing input ⇒ conservative state (CLAUDE.md §3.7 fail-closed, not throw).
  if (i == null) {
    return { sealed: false, stale: true, policy_version: null, tono_version: null, drifted: [] };
  }

  const drifted: string[] = [];

  if (i.actedPolicyVersion !== i.vigentePolicyVersion) drifted.push("policy_version");
  if (i.actedTonoVersion !== i.vigenteTonoVersion) drifted.push("tono_version");

  if (drifted.length > 0) {
    // Versions null on drift: no honest attribution possible (anti-mezcla invariant).
    return { sealed: false, stale: true, policy_version: null, tono_version: null, drifted };
  }

  return {
    sealed: true,
    stale: false,
    policy_version: i.actedPolicyVersion,
    tono_version: i.actedTonoVersion,
    drifted: [],
  };
}
