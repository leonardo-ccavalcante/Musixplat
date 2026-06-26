// shared/problem_types.ts — descriptor contract shared by server (dispatch) + client (labels). No SQL here.
export type Operator = "lt" | "gt" | "eq";
export interface AffectedDescriptor { table: string; signal: string; operator?: Operator; threshold_knob?: string; }
export interface ImpactDescriptor { kind: "sum_net_value" | "gmv_window" | "at_risk_gmv"; }
export interface ProblemDescriptor {
  problem_type: string; area_type: "finance" | "performance" | "product" | "operations";
  label: string;
  // affected/impact/metric describe the MEASUREMENT. Builtins always carry them; a LIVE (operator-taught)
  // type INHERITS them from its bound producer (measured_by) and leaves them UNDEFINED when nothing is
  // bound — that type is unmeasurable and the engine degrades-to-human (§14). concentration_dim +
  // hypotheses are always present (the operator owns those for a live type).
  affected?: AffectedDescriptor; impact?: ImpactDescriptor; metric?: string;
  concentration_dim: "zone" | "cuisine"; hypotheses: string[];
  origin: "builtin" | "live";
  measured_by?: string | null; // live: bound vetted producer (null/absent ⇒ unmeasurable). builtin: absent.
}
export const PROBLEM_TYPES: Record<string, ProblemDescriptor> = {
  payment: {
    problem_type: "payment", area_type: "finance", label: "Payment failed",
    affected: { table: "Order", signal: "payment_status='failed'" },
    impact: { kind: "sum_net_value" }, concentration_dim: "zone",
    hypotheses: ["payment was not executed", "refund dispute concentrated", "balance mismatch"],
    metric: "recover_failed_payment_value", origin: "builtin",
  },
  connection: {
    problem_type: "connection", area_type: "performance", label: "Low connection",
    // ratio = Σconnected/Σcommitted over the window; affected when below the diagnosis knob.
    // threshold read BY NAME (§3.8) — connection_min_ratio is the DIAGNOSIS threshold, DISTINCT from the
    // A1 nba_connection_min_ratio ACTION policy (tuning when to PROPOSE a reconnect must not silently
    // shift what COUNTS as a diagnosed connection problem). Codex P2.
    affected: { table: "Weekly_Connection", signal: "connection_ratio < connection_min_ratio", operator: "lt", threshold_knob: "connection_min_ratio" },
    impact: { kind: "at_risk_gmv" }, concentration_dim: "zone",
    hypotheses: ["restaurant device/app disconnected", "POS/integration failure", "staff not logging in during committed hours"],
    metric: "restore_connection_uptime", origin: "builtin",
  },
  cancellation: {
    problem_type: "cancellation", area_type: "operations", label: "Restaurant cancellations",
    // restaurant-side cancel rate over the window = count(payment_status='failed' AND cancelled_by='restaurant')
    // / count(payment_status IN ('ok','failed')) (concluded orders) — the SAME raw definition the cohort
    // signal cancel_by_restaurant uses (baseline_kpi_v2 / nba_signals). affected when ABOVE the diagnosis
    // knob (operator 'gt'). threshold read BY NAME (§3.8) — cancel_rate_max is the DIAGNOSIS threshold,
    // DISTINCT from the A6 nba_cancel_rate_max ACTION policy (same Codex split as connection_min_ratio).
    affected: { table: "Order", signal: "cancel_rate_restaurant > cancel_rate_max", operator: "gt", threshold_knob: "cancel_rate_max" },
    impact: { kind: "at_risk_gmv" }, concentration_dim: "zone",
    hypotheses: ["restaurant rejecting orders (out of stock / closed)", "kitchen overload at peak hours", "menu item availability not synced"],
    metric: "reduce_restaurant_cancellations", origin: "builtin",
  },
  menu_quality: {
    problem_type: "menu_quality", area_type: "product", label: "Low menu quality",
    // quality = avg((has_photo::int + has_description::int)/2.0) over the window's orders — the SAME raw
    // signal cohort.m_quality is built from (read direct from raw Order, §14). affected when BELOW the knob.
    // threshold read BY NAME (§3.8) — menu_quality_min is the DIAGNOSIS threshold, DISTINCT from the A4
    // nba_menu_quality_min ACTION policy. Mirrors the connection_min_ratio split.
    affected: { table: "Order", signal: "menu_quality < menu_quality_min", operator: "lt", threshold_knob: "menu_quality_min" },
    impact: { kind: "at_risk_gmv" }, concentration_dim: "zone",
    hypotheses: ["menu items missing photos", "menu items missing descriptions", "stale / incomplete menu listing"],
    metric: "improve_menu_quality", origin: "builtin",
  },
  adoption: {
    problem_type: "adoption", area_type: "product", label: "Feature adoption gap",
    // affected = restaurants whose most-recent Usage_Event is older than adoption_gap_days (or who have
    // NONE). The actual anti-join lives in tenant.fn_affected_adoption (SQL, §3.6). threshold read BY NAME
    // (§3.8) — adoption_gap_days is a DEDICATED diagnosis gap, never an nba_* action policy.
    affected: { table: "Usage_Event", signal: "days_since_last_usage_event > adoption_gap_days", operator: "gt", threshold_knob: "adoption_gap_days" },
    impact: { kind: "at_risk_gmv" }, concentration_dim: "zone",
    hypotheses: ["restaurant never onboarded the feature", "feature value not understood / no activation moment", "usage churned after initial trial"],
    metric: "restore_feature_adoption", origin: "builtin",
  },
};
export function getDescriptor(t: string): ProblemDescriptor {
  const d = PROBLEM_TYPES[t];
  if (!d) throw new Error(`unknown problem_type (fail-closed): ${t}`);
  return d;
}

// 05D L3 — the registry row of a LIVE (operator-taught) type. No SQL here (shared); the server reads it.
export interface LiveTypeRow {
  problem_type: string; area_type: string; label: string | null;
  hypotheses: unknown; measured_by: string | null; concentration_dim: string;
}

// Build a descriptor for a LIVE type from its registry row. The operator owns the FRAME
// (area/label/concentration/hypotheses); the MEASUREMENT (affected/impact/metric) is INHERITED from the
// bound vetted producer (measured_by) so it can never desync from the real detector. An unbound — or
// unknown-bound — live type leaves affected/impact undefined ⇒ unmeasurable ⇒ degrade-to-human (§14).
export function liveDescriptor(row: LiveTypeRow): ProblemDescriptor {
  const bound = row.measured_by ? PROBLEM_TYPES[row.measured_by] : undefined;
  return {
    problem_type: row.problem_type,
    area_type: row.area_type as ProblemDescriptor["area_type"],
    label: row.label ?? row.problem_type,
    concentration_dim: row.concentration_dim as ProblemDescriptor["concentration_dim"],
    hypotheses: Array.isArray(row.hypotheses) ? row.hypotheses.map(String) : [],
    origin: "live",
    measured_by: row.measured_by,
    affected: bound?.affected,
    impact: bound?.impact,
    metric: bound?.metric,
  };
}

// Measurable iff there is a deterministic producer to run: builtins always have one; a live type only when
// measured_by binds to a real builtin (⇒ affected was inherited). No producer ⇒ honest degrade-to-human.
export function isMeasurable(d: ProblemDescriptor): boolean {
  return d.affected !== undefined;
}
