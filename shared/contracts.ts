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

// F-2.2 / F-2.4 — feature-attribution carried on a delta: WHY a restaurant moved (root_cause +
// orders_delta), not only THAT it moved. Produced by fn_diff_delta; prov is [V] (measured), never
// fabricated. new/churn rows carry {sentido:"new"}; normal rows carry magnitud + root_cause.
export const rootCause = z.enum(["orders", "cancel", "connection", "quality", "none"]);
export type RootCause = z.infer<typeof rootCause>;
export const percentileDelta = z
  .object({
    sentido: z.enum(["up", "down", "equal", "new"]),
    magnitud: z.number().optional(),
    ventana_dias: z.number().optional(),
    n_min_ok: z.boolean().nullable().optional(),
    orders_delta: z.number().optional(),
    root_cause: rootCause.optional(),
    prov: z.string().optional(),
  })
  .nullable();
export type PercentileDelta = z.infer<typeof percentileDelta>;

// Delta panel row (F-2.3) — read-only projection of Prioritized_NBA_Event.
export const deltaRow = z.object({
  evento_id: z.string(),
  restaurant_id: z.string(),
  cohort_id: z.string(),
  week: z.string(),
  delta_status: deltaStatus.nullable(),
  percentile_in_cohort: z.number().nullable(),
  gap_to_top: z.number().nullable(),
  percentile_delta: percentileDelta, // F-2.4 why-it-moved (root_cause)
});
export type DeltaRow = z.infer<typeof deltaRow>;

// Provenance per field — [V] measured · [I] inferred · [C] projection/config. Never render/export
// a field without it (CLAUDE.md §3.10). Loose string: the DB stamps the bracketed code in the JSONB.
export type ProvTag = "[V]" | "[I]" | "[C]" | string;

// descriptive_baseline render projections (read-only, returned whole by cohorts.compare). Loose/
// optional: the JSONB is rendered DEFENSIVELY per field — a missing family degrades to empty, never
// throws, never fabricates. Mirrors fn_baseline_kpi (F-1.8) + fn_upside (F-1.7) + fn_topo_json (F-1.6).
export type CohortKpis = {
  volume?: { total_orders?: number | null; avg_orders?: number | null; avg_ticket?: number | null; gmv?: number | null; prov?: ProvTag };
  connection?: { ratio?: number | null; prov?: ProvTag };
  fulfillment?: { delivery_rate?: number | null; cancel_rate_restaurant?: number | null; cancel_rate_customer?: number | null; prov?: ProvTag };
  quality?: { pct_photo?: number | null; pct_description?: number | null; prov?: ProvTag };
  tickets?: { avg_tickets?: number | null; prov?: ProvTag };
};
export type CohortUpside = {
  lift_orders?: number | null;
  attribution?: { connection?: number | null; quality?: number | null; cancel?: number | null; price?: number | null } | null;
  unit?: string | null;
  prov?: ProvTag; // always [C] — projection, never ascends to [V]
};
export type DescriptiveBaseline = {
  kpis?: CohortKpis;
  upside?: CohortUpside;
  topo_vs_base?: { p90_vs_p10?: Record<string, number | null>; p75_vs_p25?: Record<string, number | null> };
  bands?: Record<string, Record<string, number | null>>;
  prov?: ProvTag;
} | null;

// Cohort cell (cohorts.list output, F-2.1) — semaphore status + freshness/staleness (BR-12).
// stale is computed SERVER-side via fn_is_stale (TTL knob BY NAME); fail-closed (unknown ⇒ stale).
export const cohortStatus = z.enum(["pending", "suppressed", "collapsed", "ok"]);
export type CohortStatus = z.infer<typeof cohortStatus>;
export type CohortCell = {
  cohort_id: string;
  cuisine: string | null;
  zone: string | null;
  tier_base: string;
  n_accounts: number | null;
  status: CohortStatus;
  freshness_ts: string | null;
  stale: boolean | null;
};

// 02:EPIC-1 / F-1.1 — Autonomy Cockpit row: an NBA_Proposal with its min() effective_level + the
// auto_releasable verdict (02:BR-5). status mirrors auto_releasable (AUTO = AI acts alone vs NEEDS-HUMAN);
// reason explains the human route. effective_level/auto_releasable are NULL until 02:1B runs (§14) — the
// screen renders that conservatively, never a fabricated number. before_after_expected is [C] (projection).
export const nbaCockpitRow = z.object({
  nba_id: z.string(),
  cohort_id: z.string(),
  action_type: z.string().nullable(),
  root_cause: z.string().nullable(),
  financial_class: z.enum(["direct", "indirect", "none"]).nullable(),
  effective_level: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable(),
  auto_releasable: z.boolean().nullable(),
  before_after_expected: z.unknown().nullable(),
  status: z.enum(["auto", "needs_human"]),
  reason: z.enum(["money", "level", "gates"]).nullable(),
  cohort_rule_version: z.string(),
});
export type NbaCockpitRow = z.infer<typeof nbaCockpitRow>;

// 02:1C / F-1.2 — human release/pause of a proposal. Carries NO tenant_id / operator_id (both resolved
// server-side from the session, anti-spoofing). resulting_level is the human override — validated
// server-side to be <= effective_level (override only DOWN, AUT-11 / BR-1).
export const cockpitReleaseInput = z.object({
  nba_id: z.string().min(1),
  action: z.enum(["RELEASE", "PAUSE"]),
  resulting_level: z.enum(["LOW", "MEDIUM", "HIGH"]),
});
export type CockpitReleaseInput = z.infer<typeof cockpitReleaseInput>;
