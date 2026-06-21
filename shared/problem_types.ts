// shared/problem_types.ts — descriptor contract shared by server (dispatch) + client (labels). No SQL here.
export type Operator = "lt" | "gt" | "eq";
export interface AffectedDescriptor { table: string; signal: string; operator?: Operator; threshold_knob?: string; }
export interface ImpactDescriptor { kind: "sum_net_value" | "gmv_window" | "at_risk_gmv"; }
export interface ProblemDescriptor {
  problem_type: string; area_type: "finance" | "performance" | "product" | "operations";
  label: string; affected: AffectedDescriptor; impact: ImpactDescriptor;
  concentration_dim: "zone" | "cuisine"; hypotheses: string[];
  metric: string; origin: "builtin" | "live";
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
};
export function getDescriptor(t: string): ProblemDescriptor {
  const d = PROBLEM_TYPES[t];
  if (!d) throw new Error(`unknown problem_type (fail-closed): ${t}`);
  return d;
}
