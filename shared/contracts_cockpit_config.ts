import { z } from "zod";

// 02:CP — Autonomy Cockpit config upload (operator-owned governance, §14-safe). The operator UPLOADS only
// INPUTS: Policy_Tier rows (the human-approved autonomy range = the 3rd min() arm) + named Config_Knobs
// values (§3.8, by name). RESULT columns — Eval_Cell verdicts, NBA proposals, min_calculation, and
// Policy_Tier.measured_result — are PRODUCED by the engine and are NEVER uploadable (§14): this schema has
// no field for them. tier_cap is the ordered public.autonomy_level enum.
export const AUTONOMY_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;

export const knobUpsert = z.object({
  key: z.string().min(1), // must be an EXISTING knob (validated server-side, fail-closed)
  value: z.string().min(1), // numbers carried as strings (Config_Knobs.value is text)
});

export const policyTierUpsert = z.object({
  policy_id: z.string().min(1), // stable upsert key
  tier_id: z.string().min(1), // maps to Restaurant.tier_base (managed_brand · managed_midmarket · long_tail)
  policy_version: z.string().min(1), // globally unique (Policy_Tier.policy_version UNIQUE)
  tier_cap: z.enum(AUTONOMY_LEVELS), // the autonomy ceiling (3rd min() arm)
  allowed_today: z.object({ auto_actions: z.array(z.string()).default([]) }), // action codes the AI may act on alone
  how_measured: z.string().optional(),
  cross_tenant_rule: z.string().optional(),
  human_signature: z.string().min(1), // a manager user_id IN the operator's pool (accountable signer)
});

export const cockpitConfigInput = z
  .object({
    knobs: z.array(knobUpsert).default([]),
    policy_tiers: z.array(policyTierUpsert).default([]),
  })
  .refine((c) => c.knobs.length + c.policy_tiers.length > 0, {
    message: "config is empty: provide at least one knob or policy_tier",
  });

export type CockpitConfigInput = z.infer<typeof cockpitConfigInput>;
export type CockpitConfigResult = { knobs: number; policy_tiers: number };

export type ConfigField = { name: string; type: string; desc: string; example: string };
export type CockpitConfigTemplate = {
  json: string; // a ready-to-edit example that round-trips through cockpitConfigInput (pra não quebrar)
  knobs: ConfigField[]; // per-field legend
  policy_tiers: ConfigField[];
};
