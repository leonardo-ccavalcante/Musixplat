import type pg from "pg";
import type { MotorControls, MotorControlsSetInput, MotorEscalationRow } from "../../shared/contracts.js";

// 02C MOTOR-LLM — the human-editable "Autonomy Controls" backend + the escalations feed. `exec` is the
// caller's query primitive (router passes the real pool's `query`; tests pass a pool wrapper) so this stays
// transport-agnostic and testable. NO number is computed here (§14): cost is read from the SQL view
// gov.v_llm_cost, every other field READS the substrate. Fail-closed throughout (§3.7).
type Exec = <T extends pg.QueryResultRow>(sql: string, params: readonly unknown[]) => Promise<T[]>;

// getControls — the approved range, the loop knobs, and the pending RLHF queue (BR-B16). pending_cases is
// tenant-scoped (un-reviewed cases this human must approve before they ground future runs). tiers/knobs are
// governance-global in this substrate (see setControls honesty note).
export async function getControls(tenantId: string, exec: Exec): Promise<MotorControls> {
  const tierRows = await exec<{ tier_id: string | null; auto_actions: unknown }>(
    `select tier_id, coalesce(allowed_today->'auto_actions', '[]'::jsonb) as auto_actions
       from gov."Policy_Tier" order by tier_id`,
    [],
  );
  const tiers = tierRows
    .filter((t): t is { tier_id: string; auto_actions: unknown } => t.tier_id != null)
    .map((t) => ({ tier_id: t.tier_id, auto_actions: (Array.isArray(t.auto_actions) ? t.auto_actions : []) as string[] }));

  const knobs = await exec<{ key: string; value: string }>(
    `select key, value from catalog."Config_Knobs"
      where key in ('motor_max_loops','motor_min_confidence') order by key`,
    [],
  );

  const pending = await exec<{ kb_case_id: string; pattern: string; outcome: string }>(
    `select kb_case_id::text as kb_case_id, coalesce(pattern,'') as pattern, coalesce(outcome,'') as outcome
       from tenant."Knowledge_Case" where tenant_id=$1 and reviewed=false order by created_at desc limit 50`,
    [tenantId],
  );

  return { tiers, knobs, pending_cases: pending };
}

// setControls — apply whichever ONE op is present.
export async function setControls(tenantId: string, input: MotorControlsSetInput, exec: Exec): Promise<{ ok: true }> {
  if (input.auto_actions && input.tier_id) {
    // HONESTY (§4, no-fake-scope): Policy_Tier is keyed by TIER, not tenant, in this substrate (inherited from
    // the floor's governance model). This edit is tier-GLOBAL — every pool sharing the tier sees it. Per-tenant
    // range scoping is a known follow-up gap; we do NOT add a tenant filter we cannot enforce here.
    await exec(
      `update gov."Policy_Tier"
          set allowed_today = jsonb_set(coalesce(allowed_today,'{}'::jsonb), '{auto_actions}', $2::jsonb)
        where tier_id=$1`,
      [input.tier_id, JSON.stringify(input.auto_actions)],
    );
  } else if (input.knob_key && input.knob_value != null) {
    // Config_Knobs is GLOBAL config (no tenant column) — also tier/global, same caveat as above.
    await exec(`update catalog."Config_Knobs" set value=$2 where key=$1`, [input.knob_key, input.knob_value]);
  } else if (input.approve_case_id) {
    // THIS op IS tenant-scoped and enforced: the RLHF approval only flips the caller's own case (anti cross-tenant).
    await exec(
      `update tenant."Knowledge_Case" set reviewed=true where kb_case_id=$1 and tenant_id=$2`,
      [input.approve_case_id, tenantId],
    );
  }
  return { ok: true };
}

// listEscalations — the cases the motor handed to a human (outcome='escalated'), tenant-scoped, recent-first.
// cost_usd left-joins the LLM spend for the attempt that drove the case (gov.v_llm_cost.cost_usd grouped by
// ref_id = path_used.attempt_id); NULL when the stub drove it / no priced LLM rows (§3.7 — honest, not $0).
export async function listEscalations(tenantId: string, exec: Exec): Promise<MotorEscalationRow[]> {
  return exec<MotorEscalationRow>(
    `select kc.kb_case_id::text as kb_case_id, kc.area_type, coalesce(kc.pattern,'') as pattern,
            kc.not_resolved_reason, kc.discarded_branches, c.cost as cost_usd, kc.created_at::text as created_at
       from tenant."Knowledge_Case" kc
       left join (select ref_id, sum(cost_usd) as cost from gov.v_llm_cost group by ref_id) c
              on c.ref_id = kc.path_used->>'attempt_id'
      where kc.tenant_id=$1 and kc.outcome='escalated'
      order by kc.created_at desc limit 50`,
    [tenantId],
  );
}
