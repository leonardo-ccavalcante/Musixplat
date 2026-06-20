import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";
import { nbaTestInput, nbaTestAllInput, nbaDetailInput, type nbaVerdict } from "../../shared/contracts.js";

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

  // 02:DETAIL-C — the action-detail surface. Auth-gated (tenantProcedure), but the history is COMPANY-WIDE
  // (no tenant filter): action reliability is validated knowledge about the policy, flows across pools
  // (04 §7/§8; Leo 2026-06-19). Only aggregates are exposed (no per-restaurant raw) ⇒ no k-anon frontier.
  detail: tenantProcedure.input(nbaDetailInput).query(async ({ input }) => {
    const def = await query<{
      code: string; label: string; funnel_stage: string; financial_class: string;
      root_cause_signal: string | null; threshold_knob: string | null; action_hint: string;
      playbook: string | null; created_at: string | null; current_version: string | null;
    }>(
      `select c.code, c.label, c.funnel_stage, c.financial_class::text as financial_class,
              c.root_cause_signal, c.threshold_knob, c.action_hint, c.playbook,
              c.created_at::text as created_at,
              (select value from catalog."Config_Knobs" where key='cohort_rule_version_current') as current_version
       from catalog."NBA_Catalogo" c where c.code=$1`,
      [input.action_code],
    );
    if (!def[0]) throw new TRPCError({ code: "NOT_FOUND", message: "unknown action_code" });

    const hist = await query<{
      action_code: string; run_count: number; last_run_at: string | null;
      solid_count: number; unconfirmed_count: number; no_data_count: number; acerto_rate: number | null;
    }>(
      `select action_code, run_count::int as run_count, last_run_at::text as last_run_at,
              solid_count::int as solid_count, unconfirmed_count::int as unconfirmed_count,
              no_data_count::int as no_data_count, acerto_rate::float8 as acerto_rate
       from cohort.fn_nba_action_history($1)`,
      [input.action_code],
    );
    return { definition: def[0], history: hist[0]! };
  }),

  // 02:DETAIL — the whole A1–A8 catalog with each action's company-wide usage (run_count + on-target rate),
  // for the cockpit's "What are these actions?" drawer. Company-wide aggregate (no tenant filter, like detail);
  // a READ of fn_nba_action_history (§14: acerto_rate NULL when no breach-class proposal, never a 0-fake).
  catalog: tenantProcedure.query(() =>
    query<{ code: string; run_count: number; acerto_rate: number | null }>(
      `select c.code, h.run_count::int as run_count, h.acerto_rate::float8 as acerto_rate
       from catalog."NBA_Catalogo" c
       cross join lateral cohort.fn_nba_action_history(c.code) h
       order by c.code`,
      [],
    ),
  ),
});
