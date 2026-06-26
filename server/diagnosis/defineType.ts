import { TRPCError } from "@trpc/server";
import { withTx } from "../db/pool.js";
import { PROBLEM_TYPES } from "../../shared/problem_types.js";
import type { DefineTypeInput, DefineTypeResult } from "../../shared/contracts_05b.js";

// 05D L3 — register an operator-taught (LIVE) problem type. Governance act ⇒ manager-gated at the router
// (mirrors cockpit.uploadConfig / motor.controls.set). Writes ONLY INPUT/config — area/hypotheses/measured_by
// are the human's teaching, never a produced number (§14). measured_by is validated against PROBLEM_TYPES by
// the zod input (null ⇒ unmeasurable ⇒ the engine degrades-to-human). The catalog is a GLOBAL registry (no
// tenant_id); tenant_id is used only to scope the audit log.
//
// Fail-closed guards (§7):
//  • a slug can't shadow a builtin (PROBLEM_TYPES is the builtins' single home);
//  • IMMUTABLE once used — if ANY Diagnosed_Problem already carries this type, reject (no retroactive
//    baseline change). The usage check + the upsert run in ONE tx, so they are atomic w.r.t. each other.
export async function defineType(
  tenantId: string,
  userId: string,
  input: DefineTypeInput,
): Promise<DefineTypeResult> {
  if (Object.prototype.hasOwnProperty.call(PROBLEM_TYPES, input.problem_type)) {
    throw new TRPCError({ code: "CONFLICT", message: `'${input.problem_type}' is a built-in type — choose a new name` });
  }
  return withTx(async (c) => {
    const used = await c.query(
      `select 1 from tenant."Diagnosed_Problem" where problem_type = $1 limit 1`,
      [input.problem_type],
    );
    if (used.rowCount) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `type '${input.problem_type}' is already in use — its definition is frozen (§7)`,
      });
    }
    await c.query(
      `insert into catalog."Problem_Type"
         (problem_type, area_type, label, hypotheses, measured_by, concentration_dim, origin, defined_by, created_at)
       values ($1, $2, $3, $4::jsonb, $5, $6, 'live', $7, now())
       on conflict (problem_type) do update set
         area_type = excluded.area_type, label = excluded.label, hypotheses = excluded.hypotheses,
         measured_by = excluded.measured_by, concentration_dim = excluded.concentration_dim,
         defined_by = excluded.defined_by`,
      [
        input.problem_type, input.area_type, input.label, JSON.stringify(input.hypotheses),
        input.measured_by, input.concentration_dim, userId,
      ],
    );
    await c.query(
      `insert into gov."Security_Log"(tenant_id, kind, detail) values ($1, 'define_type', $2::jsonb)`,
      [
        tenantId,
        JSON.stringify({ problem_type: input.problem_type, area_type: input.area_type, measured_by: input.measured_by, by: userId }),
      ],
    );
    return { problem_type: input.problem_type, measurable: input.measured_by !== null };
  });
}
