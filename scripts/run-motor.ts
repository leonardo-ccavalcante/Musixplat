import { openaiChatClient } from "../server/_core/llm.js";
import { getActiveChatModel } from "../server/_core/model.js";
import { pool, query } from "../server/db/pool.js";
import { runMotorForCohort } from "../server/motor/runMotorFanout.js";
import { stubMotorReasoning, type MotorReasoning } from "../server/motor/reasoning.js";
import { llmMotorReasoning } from "../server/motor/llmReasoning.js";

// 02C MOTOR-LLM live smoke — proves the autonomous loop works END TO END with the REAL LLM (or the stub
// when no OPENAI_API_KEY), and that it NEVER auto-dispatches money (§7). Picks the highest-problem cohort,
// arms its tier with the default non-money allowed set (A1,A4,A6) + a signed LOW policy (the human-approved
// range), runs the loop, and prints the spectrum + the token COST (§14: cost is SQL, v_llm_cost). NOT in CI.
//   OPENAI_API_KEY=… DATABASE_URL=… pnpm exec tsx scripts/run-motor.ts
async function main(): Promise<void> {
  const hasKey = Boolean(process.env.OPENAI_API_KEY);
  const model = await getActiveChatModel();
  const reasoning: MotorReasoning = hasKey ? llmMotorReasoning(await openaiChatClient(), model) : stubMotorReasoning;
  console.warn(`run-motor: reasoning = ${hasKey ? "OpenAI (real LLM)" : "deterministic stub (no OPENAI_API_KEY)"}`);

  const t = (
    await query<{ cohort_id: string; tier_base: string; tenant_id: string }>(
      `select cms.cohort_id, ct.tier_base::text as tier_base, rt.tenant_id
         from cohort."Cohort_Membership_Snapshot" cms
         join cohort."Cohort" ct on ct.cohort_id = cms.cohort_id
         join tenant."Restaurant" rt on rt.restaurant_id = cms.restaurant_id
        where cms.m_connection < 0.55
        group by cms.cohort_id, ct.tier_base, rt.tenant_id order by count(*) desc limit 1`,
    )
  )[0];
  if (!t) throw new Error("run-motor: no problem cohort (run pnpm db:p01 first)");

  // Arm the human-approved range: a signed LOW policy + the default non-money allowed set (the controls seed).
  const operator = (await query<{ user_id: string }>(`select user_id from gov."User" where tenant_id=$1 and role='agent_manager_senior' order by user_id limit 1`, [t.tenant_id]))[0]?.user_id;
  const allowed = (await query<{ v: string }>(`select catalog.knob_text('motor_allowed_actions_default') as v`))[0]!.v;
  const autoActions = JSON.stringify({ auto_actions: allowed.split(",") });
  await query(
    `insert into gov."Policy_Tier"(policy_id, tier_id, policy_version, tier_cap, allowed_today, human_signature)
     values ('pt-motor-smoke', $1, 'pv-zzz-smoke', 'LOW', $3::jsonb, $2)
     on conflict (policy_id) do update set allowed_today=excluded.allowed_today`,
    [t.tier_base, operator, autoActions],
  );

  const out = await runMotorForCohort(t.cohort_id, t.tenant_id, reasoning);
  console.warn(`  cohort ${t.cohort_id.slice(0, 10)} → acted=${out.acted} escalated=${out.escalated} attempts=${out.attempts}`);

  // §7 PROOF: zero money auto-dispatched. §14: the cost is a SQL aggregate (v_llm_cost), never computed in TS.
  const money = (await query<{ n: number }>(`select count(*)::int n from gov."Action_Dispatch" ad join gov."NBA_Proposal" p on p.nba_id::text=ad.nba_id where ad.tenant_id=$1 and p.financial_class='direct'`, [t.tenant_id]))[0]!.n;
  const cost = (await query<{ c: number | null }>(`select sum(cost_usd) c from gov.v_llm_cost where process_type='motor'`))[0]!.c;
  console.warn(`  money auto-dispatched = ${money} (must be 0)   ·   motor token cost = ${cost == null ? "unpriced" : "$" + Number(cost).toFixed(4)}`);
  if (money !== 0) throw new Error(`run-motor: §7 VIOLATION — ${money} money NBAs auto-dispatched`);
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error("run-motor failed:", e);
    return pool.end().then(() => process.exit(1));
  });
