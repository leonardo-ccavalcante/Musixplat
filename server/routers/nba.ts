import { z } from "zod";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";
import { nbaTestInput, nbaTestAllInput, type nbaVerdict } from "../../shared/contracts.js";

// 03:NBA-TEST exposure — read-only verdicts for the cockpit / AGENTE. The measurement is SQL
// (cohort.fn_nba_test, §14); this wrapper only resolves tenant_id server-side and GATES cross-tenant
// (a foreign restaurant ⇒ empty, never a leak — §3.4 RLS single-pool). The engine (02:1A) calls the
// SQL directly server-side; this is the typed door for external callers.
type VRow = z.infer<typeof nbaVerdict>;
const COLS = `v.action_code, v.dimension, v.measured::float8 as measured, v.standard::float8 as standard,
              v.verdict, v.gap::float8 as gap, v.within_range, v.n_min_ok, v.k_anon_ok, v.provenance`;

export const nbaRouter = router({
  test: tenantProcedure.input(nbaTestInput).query(async ({ ctx, input }) => {
    const r = await query<VRow>(
      `select ${COLS} from cohort.fn_nba_test($1,$2,$3) v
       where exists (select 1 from tenant."Restaurant" r where r.restaurant_id=$1 and r.tenant_id=$4)`,
      [input.restaurant_id, input.action_code, input.week, ctx.tenantId],
    );
    return r[0] ?? null;
  }),

  testAll: tenantProcedure.input(nbaTestAllInput).query(async ({ ctx, input }) => {
    return query<VRow>(
      `select ${COLS} from cohort.fn_nba_test_all($1,$2) v
       where exists (select 1 from tenant."Restaurant" r where r.restaurant_id=$1 and r.tenant_id=$3)`,
      [input.restaurant_id, input.week, ctx.tenantId],
    );
  }),
});
