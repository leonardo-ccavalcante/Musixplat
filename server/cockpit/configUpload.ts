import { TRPCError } from "@trpc/server";
import { query, withTx } from "../db/pool.js";
import type {
  CockpitConfigInput,
  CockpitConfigResult,
  CockpitConfigTemplate,
} from "../../shared/contracts_cockpit_config.js";

// The ONLY knobs an operator may set, with a value validator each. A broad "any existing knob, any string"
// surface would let a pool operator corrupt safety/anchor knobs (k_anon_threshold='-1' weakens §3.2
// suppression; cohort_rule_version_current='x' breaks §3.5 anti-mezcla). Allowlist + range-check = fail-closed.
// Validators reject whitespace/empty (Number('  ')===0 would silently store a 0 confidence floor) and leading
// zeros (canonical values into §3.2/§3.8 knobs). motor_max_loops is bounded ≤3 to MATCH the sibling write path
// (motorControlsSetInput + the runtime 'exhausted_3_loops') — one knob, one bound, no divergence.
const isPosInt = (v: string): boolean => /^[1-9][0-9]*$/.test(v); // ≥1, no leading zero, no whitespace/empty
const isUnit = (v: string): boolean => {
  const n = Number(v);
  return /\S/.test(v) && Number.isFinite(n) && n >= 0 && n <= 1;
};
const OPERATOR_KNOBS: Record<string, { ok: (v: string) => boolean; hint: string }> = {
  k_anon_threshold: { ok: isPosInt, hint: "a positive integer" },
  n_min_threshold: { ok: isPosInt, hint: "a positive integer" },
  motor_max_loops: { ok: (v) => isPosInt(v) && Number(v) <= 3, hint: "an integer 1–3" },
  motor_min_confidence: { ok: isUnit, hint: "a number between 0 and 1" },
};

// 02:CP — operator-owned cockpit config upload (§14-safe). Upserts ONLY operator INPUTS: allowlisted
// Config_Knobs values (§3.8, by name) + Policy_Tier rows (the approved autonomy range, 3rd min() arm). Atomic
// — one bad item rejects the whole upload (fail-closed, §7). The signer must be a SENIOR MANAGER in the
// operator's pool (governance authority, §3.4 — mirrors managerProcedure). It NEVER writes a RESULT column
// (Eval_Cell verdicts, Policy_Tier.measured_result, proposals) — those are produced by the engine (§14); an
// in-place policy update RESETS measured_result to NULL so a stale result can't ride changed inputs.
export async function uploadCockpitConfig(input: CockpitConfigInput, tenantId: string): Promise<CockpitConfigResult> {
  return withTx(async (c) => {
    for (const k of input.knobs) {
      const spec = OPERATOR_KNOBS[k.key];
      if (!spec) throw new TRPCError({ code: "BAD_REQUEST", message: `knob '${k.key}' is not operator-settable` });
      const value = k.value.trim();
      if (!spec.ok(value)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `knob '${k.key}' must be ${spec.hint} (got '${k.value}')` });
      }
      // Operator-set ⇒ [V]/operator. insert-on-conflict (TRULY mirrors cost.upsertKnob): a hosted env where the
      // knob's migration drifted (KB-prod-500 class) self-heals instead of a silent 0-row UPDATE. NOTE: Config_Knobs
      // has no tenant_id (04 §3 = single platform-wide source) ⇒ this write is PLATFORM-WIDE, not pool-local.
      await c.query(
        `insert into catalog."Config_Knobs"(key, value, provenance, owner) values ($1,$2,'[V]','operator')
         on conflict (key) do update set value = excluded.value, provenance = '[V]', owner = 'operator'`,
        [k.key, value],
      );
    }
    for (const p of input.policy_tiers) {
      // The signer must be a SENIOR MANAGER in this pool (governance authority + anti cross-pool sign, §3.4).
      const signer = await c.query(
        `select 1 from gov."User" where user_id=$1 and tenant_id=$2 and role='agent_manager_senior'`,
        [p.human_signature, tenantId],
      );
      if (!signer.rowCount) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `signer '${p.human_signature}' must be a senior manager in this pool` });
      }
      // policy_version is FK-referenced by Decision_Trace/Release_Batch with NO on-update-cascade — changing it on
      // an existing policy raises a raw 23503 once a trace exists. Treat policy_version as immutable per policy_id.
      const existing = await c.query<{ policy_version: string }>(`select policy_version from gov."Policy_Tier" where policy_id=$1`, [p.policy_id]);
      if (existing.rowCount && existing.rows[0]!.policy_version !== p.policy_version) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `policy '${p.policy_id}' exists with version '${existing.rows[0]!.policy_version}' — policy_version is immutable; use a new policy_id for a new version`,
        });
      }
      // policy_version is globally UNIQUE: a new policy_id reusing another policy's version would hit a raw
      // 23505 — pre-check it so the operator gets a clear error, not a 500 (pra não quebrar).
      const clash = await c.query(`select 1 from gov."Policy_Tier" where policy_version=$1 and policy_id<>$2`, [p.policy_version, p.policy_id]);
      if (clash.rowCount) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `policy_version '${p.policy_version}' already belongs to another policy` });
      }
      // provenance [V] on the operator-set bruto fields. measured_result is NOT in this insert and is RESET to
      // NULL on update (§14: a result measured for the old cap must not ride the new one).
      await c.query(
        `insert into gov."Policy_Tier"
           (policy_id, tier_id, policy_version, tier_cap, allowed_today, how_measured, cross_tenant_rule,
            human_signature, provenance_by_field)
         values ($1,$2,$3,$4::public.autonomy_level,$5::jsonb,$6,$7,$8,
                 jsonb_build_object('tier_cap','[V]','allowed_today','[V]','human_signature','[V]'))
         on conflict (policy_id) do update set
           tier_id=excluded.tier_id, policy_version=excluded.policy_version, tier_cap=excluded.tier_cap,
           allowed_today=excluded.allowed_today, how_measured=excluded.how_measured,
           cross_tenant_rule=excluded.cross_tenant_rule, human_signature=excluded.human_signature,
           provenance_by_field=excluded.provenance_by_field, measured_result=null`,
        [
          p.policy_id, p.tier_id, p.policy_version, p.tier_cap, JSON.stringify(p.allowed_today),
          p.how_measured ?? null, p.cross_tenant_rule ?? null, p.human_signature,
        ],
      );
    }
    return { knobs: input.knobs.length, policy_tiers: input.policy_tiers.length };
  });
}

// 02:CP — the downloadable template: a ready-to-edit example pre-filled with THIS pool's signer + the current
// values of the knobs most worth tuning, so uploading it as-is round-trips (pra não quebrar). Plus a per-field
// legend. Static read (no writes). §14-safe: it offers only INPUT fields, never a result column.
export async function buildConfigTemplate(tenantId: string): Promise<CockpitConfigTemplate> {
  const signer =
    (
      await query<{ user_id: string }>(
        `select user_id from gov."User" where tenant_id=$1 and role='agent_manager_senior' order by user_id limit 1`,
        [tenantId],
      )
    )[0]?.user_id ?? "U-OP-001";
  const knobKeys = Object.keys(OPERATOR_KNOBS); // derive from the allowlist so template & validation can't drift
  const vals = await query<{ key: string; value: string }>(
    `select key, value from catalog."Config_Knobs" where key = any($1)`,
    [knobKeys],
  );
  const valOf = (k: string): string => vals.find((r) => r.key === k)?.value ?? "";

  const example = {
    knobs: knobKeys.map((key) => ({ key, value: valOf(key) })),
    policy_tiers: [
      { policy_id: "PT-brand", tier_id: "managed_brand", policy_version: "pv-brand", tier_cap: "MEDIUM",
        allowed_today: { auto_actions: ["A1", "A4", "A6"] }, how_measured: "operator-signed", human_signature: signer },
      { policy_id: "PT-mid", tier_id: "managed_midmarket", policy_version: "pv-mid", tier_cap: "LOW",
        allowed_today: { auto_actions: ["A1"] }, how_measured: "operator-signed", human_signature: signer },
      { policy_id: "PT-long", tier_id: "long_tail", policy_version: "pv-long", tier_cap: "LOW",
        allowed_today: { auto_actions: ["A1"] }, how_measured: "operator-signed", human_signature: signer },
    ],
  };

  return {
    json: JSON.stringify(example, null, 2),
    knobs: [
      { name: "key", type: "text", desc: "an EXISTING knob name (§3.8) — unknown names are rejected", example: "k_anon_threshold" },
      { name: "value", type: "text", desc: "the value (numbers as strings)", example: valOf("k_anon_threshold") || "5" },
    ],
    policy_tiers: [
      { name: "policy_id", type: "text", desc: "stable id (upsert key)", example: "PT-brand" },
      { name: "tier_id", type: "enum", desc: "Restaurant.tier_base: managed_brand · managed_midmarket · long_tail", example: "managed_brand" },
      { name: "policy_version", type: "text", desc: "globally unique tag", example: "pv-brand" },
      { name: "tier_cap", type: "enum", desc: "LOW · MEDIUM · HIGH — the autonomy ceiling (3rd min() arm)", example: "MEDIUM" },
      { name: "allowed_today.auto_actions", type: "string[]", desc: "action codes the AI may act on alone (A1–A8)", example: '["A1","A4","A6"]' },
      { name: "human_signature", type: "text", desc: "a manager user_id IN your pool (the accountable signer)", example: signer },
    ],
  };
}
