import Anthropic from "@anthropic-ai/sdk";
import { pool, query } from "../server/db/pool.js";
import { runDiagnosis } from "../server/diagnosis/orchestrator.js";
import { deterministicReasoning, llmReasoning, type DiagnosisReasoning } from "../server/diagnosis/reasoning.js";
import { appRouter } from "../server/routers/_app.js";
import type { Context } from "../server/_core/context.js";
import { stagePayScenario, POOL_PAY, PAY_USER, PAY_N, PAY_SILENT } from "./scenario_pay.js";

// Live 05B runner — produces a REAL, working Diagnosis prototype (NOT a seed: the §14 producers run
// HERE). Stages the POOL-PAY scenario (shared with prototype:reset) then DIAGNOSES it (reactive +
// proactive) so the board is pre-populated for the e2e. It owns a DEDICATED pool (POOL-PAY) so the
// silent-hunt yields the clean reverse-cascade (47 affected / 35 silent / 12 complainants) and proves
// RLS isolation. The numbers (47/35/€) are PRODUCED by fn_hunt_silent + fn_impact_revenue_lost over
// fixture Orders — never seeded. Run after the seed: `pnpm db:05b`.

function devCtx(): Context {
  return { session: { user_id: PAY_USER, tenant_id: POOL_PAY, org_level: "team" }, tenantId: POOL_PAY, userId: PAY_USER };
}

async function main(): Promise<void> {
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const reasoning: DiagnosisReasoning = hasKey ? llmReasoning(new Anthropic()) : deterministicReasoning;
  console.warn(`run-05b: AGENTE reasoning = ${hasKey ? "Claude (real LLM)" : "deterministic (no ANTHROPIC_API_KEY)"}`);

  await stagePayScenario();

  // REACTIVE — a complainant opens a ticket ⇒ reportProblem (real US-B1.1.1 gate + B.1.3 dedup) ⇒ diagnose.
  const caller = appRouter.createCaller(devCtx());
  const reported = await caller.diagnosis.reportProblem({
    restaurantId: "R-PAY-001",
    conversationId: "R-PAY-001:conv1", // the episode that triggered it ⇒ origin = reactive
    criticality: "critical",
  });
  const r1 = await runDiagnosis(reported.problem_id, POOL_PAY, reasoning);
  console.warn(
    `  reactive  ${reported.problem_id.slice(0, 8)} → area=${r1.areaType} affected=${r1.affected} ` +
      `silent=${r1.silent} €=${r1.revenueLost} route=${r1.route} ` +
      `dossier=${r1.dossier.emitted ? "complete" : `partial(${r1.dossier.gaps.join(",")})`}`,
  );

  // PROACTIVE — the monitor catches a non-payment BEFORE a ticket (the reverse-cascade uau).
  const proc = (
    await query<{ process_id: string }>(`select process_id from tenant."Critical_Process" where tenant_id=$1`, [POOL_PAY])
  )[0];
  if (proc) {
    const mon = (
      await query<{ pid: string | null }>(`select tenant.fn_monitor_critical($1,$2) as pid`, [POOL_PAY, proc.process_id])
    )[0];
    if (mon?.pid) {
      const r2 = await runDiagnosis(mon.pid, POOL_PAY, reasoning);
      console.warn(
        `  proactive ${mon.pid.slice(0, 8)} → area=${r2.areaType} affected=${r2.affected} ` +
          `silent=${r2.silent} €=${r2.revenueLost} route=${r2.route}`,
      );
    }
  }

  console.warn(`run-05b done — pool ${POOL_PAY}: ${PAY_N} affected / ${PAY_SILENT} silent. Dev-login as ${PAY_USER} on /diagnosis.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
