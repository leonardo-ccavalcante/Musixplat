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
};
export function getDescriptor(t: string): ProblemDescriptor {
  const d = PROBLEM_TYPES[t];
  if (!d) throw new Error(`unknown problem_type (fail-closed): ${t}`);
  return d;
}
