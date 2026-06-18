import { z } from "zod";

// Single source of truth for tRPC io (Zod v3, CLAUDE.md §1). Domain vocab stays native.

export const deltaStatus = z.enum([
  "cohort_changed",
  "percentile_up",
  "percentile_down",
  "at_risk",
  "new",
  "churn",
]);
export type DeltaStatus = z.infer<typeof deltaStatus>;

export const modePercentil = z.enum(["percentile", "qualitative_no_percentile"]);
export const tenureBucket = z.enum(["0-3m", "3-6m", "6-12m", "12m+"]);
export const tierBase = z.enum(["managed_brand", "managed_midmarket", "long_tail"]);

export const scopeOwnerRef = z.object({ dueno_id: z.string(), level: z.string() }).nullable();

// F-5.2 handoff — input carries NO tenant_id (resolved server-side from the session).
export const handoffInput = z.object({
  restaurant_id: z.string().min(1),
  cohort_id: z.string().min(1),
  subgroup_id: z.string().nullable().optional(),
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type HandoffInput = z.infer<typeof handoffInput>;

// Prioritized_NBA_Event — the single mutating output (matches 02:1A consumer fields).
export const eventoPriorizadoNba = z.object({
  evento_id: z.string(),
  restaurant_id: z.string(),
  cohort_id: z.string(),
  subgroup_id: z.string().nullable(),
  week: z.string(),
  percentile_in_cohort: z.number().nullable(),
  gap_to_top: z.number().nullable(),
  delta_status: deltaStatus.nullable(),
  n_min_ok: z.boolean().nullable(),
  mode: modePercentil.nullable(),
  cohort_rule_version: z.string(),
  scope_owner_ref: scopeOwnerRef,
  operator_id: z.string().nullable(),
});
export type EventoPriorizadoNba = z.infer<typeof eventoPriorizadoNba>;

// 03:NBA-TEST — the deterministic verdict object (cohort.fn_nba_test). The NUMBER is always SQL (§14);
// measured/standard/gap are NULL on no_data. action_code keys the row (A2/A3 share a dimension).
export const nbaVerdict = z.object({
  action_code: z.string(),
  dimension: z.string().nullable(),
  measured: z.number().nullable(),
  standard: z.number().nullable(),
  verdict: z.enum(["below", "ok", "above", "no_data"]),
  gap: z.number().nullable(),
  within_range: z.boolean(),
  n_min_ok: z.boolean().nullable(),
  k_anon_ok: z.boolean().nullable(),
  provenance: z.string(),
});
export type NbaVerdict = z.infer<typeof nbaVerdict>;

export const nbaTestInput = z.object({
  restaurant_id: z.string().min(1),
  action_code: z.string().min(1),
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const nbaTestAllInput = z.object({
  restaurant_id: z.string().min(1),
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Delta panel row (F-2.3) — read-only projection of Prioritized_NBA_Event.
export const deltaRow = z.object({
  evento_id: z.string(),
  restaurant_id: z.string(),
  cohort_id: z.string(),
  week: z.string(),
  delta_status: deltaStatus.nullable(),
  percentile_in_cohort: z.number().nullable(),
  gap_to_top: z.number().nullable(),
});
export type DeltaRow = z.infer<typeof deltaRow>;
