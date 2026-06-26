import { query } from "../db/pool.js";
import { PROBLEM_TYPES, liveDescriptor, type LiveTypeRow, type ProblemDescriptor } from "../../shared/problem_types.js";

// 05D L3 — resolve the descriptor the engine dispatches on. ONE home per type:
//  • builtins are CODE — the typed PROBLEM_TYPES map + their vetted SQL detector (change-locked §3.11);
//  • LIVE (operator-taught) types are DATA — read from catalog."Problem_Type" (origin='live', active).
// Fail-closed: an unknown/inactive type RAISES (the exact contract the old getDescriptor had) — never a
// silent wrong pipeline (§8). The catalog is a GLOBAL registry (no tenant_id), so no tenant is needed
// here; the diagnosis RUN that consumes the descriptor is tenant-scoped server-side upstream (§7).
export async function resolveDescriptor(
  problemType: string,
  exec: typeof query = query,
): Promise<ProblemDescriptor> {
  const builtin = PROBLEM_TYPES[problemType];
  if (builtin) return builtin;
  const rows = await exec<LiveTypeRow>(
    `select problem_type, area_type, label, hypotheses, measured_by, concentration_dim
       from catalog."Problem_Type" where problem_type = $1 and origin = 'live' and active = true`,
    [problemType],
  );
  if (!rows[0]) throw new Error(`unknown problem_type (fail-closed): ${problemType}`);
  return liveDescriptor(rows[0]);
}
