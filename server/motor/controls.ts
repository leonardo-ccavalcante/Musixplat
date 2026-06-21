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
  // P1-3 (§3.4): show ONLY the tiers whose policy was signed within this tenant — a tier spans pools, so an
  // unscoped read would surface (and let the human edit) another pool's approved range.
  const tierRows = await exec<{ tier_id: string | null; auto_actions: unknown }>(
    `select distinct on (tier_id) tier_id, coalesce(allowed_today->'auto_actions', '[]'::jsonb) as auto_actions
       from gov."Policy_Tier"
      where human_signature in (select user_id from gov."User" where tenant_id=$1)
      order by tier_id, policy_version desc`,
    [tenantId],
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

  // P1-5: the REAL action catalog (A1..A8) the runtime whitelist compares against — so the controls toggle the
  // actions the motor actually evaluates, not invented names. financial_class lets the UI mark money actions
  // (which §7 never auto-acts, even if toggled on).
  const availableActions = await exec<{ code: string; label: string; financial_class: string }>(
    `select code, label, financial_class::text as financial_class from catalog."NBA_Catalogo" order by code`,
    [],
  );

  return { tiers, knobs, pending_cases: pending, available_actions: availableActions };
}

// setControls — apply whichever ONE op is present.
export async function setControls(tenantId: string, input: MotorControlsSetInput, exec: Exec): Promise<{ ok: true }> {
  if (input.auto_actions && input.tier_id) {
    // P1-3 (§3.4): scope the range edit to a policy SIGNED within this tenant — never mutate another pool's
    // approved range for a shared tier. A tier with no tenant-owned policy ⇒ no-op (0 rows), fail-closed.
    await exec(
      `update gov."Policy_Tier"
          set allowed_today = jsonb_set(coalesce(allowed_today,'{}'::jsonb), '{auto_actions}', $2::jsonb)
        where tier_id=$1 and human_signature in (select user_id from gov."User" where tenant_id=$3)`,
      [input.tier_id, JSON.stringify(input.auto_actions), tenantId],
    );
  } else if (input.knob_key && input.knob_value != null) {
    // Config_Knobs is GLOBAL config (no tenant column) — the motor loop knobs are platform-wide. The
    // managerProcedure role gate (P1-2) restricts WHO can change them; per-tenant knob scoping is a substrate
    // follow-up (the knob table has no tenant dimension).
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
