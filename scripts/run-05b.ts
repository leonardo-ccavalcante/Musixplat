import Anthropic from "@anthropic-ai/sdk";
import { pool, query } from "../server/db/pool.js";
import { runDiagnosis } from "../server/diagnosis/orchestrator.js";
import { deterministicReasoning, llmReasoning, type DiagnosisReasoning } from "../server/diagnosis/reasoning.js";
import { appRouter } from "../server/routers/_app.js";
import type { Context } from "../server/_core/context.js";

// Live 05B runner — produces a REAL, working Diagnosis prototype (NOT a seed: the §14 producers run
// HERE). It owns a DEDICATED pool (POOL-PAY) so the silent-hunt yields the spec's clean reverse-cascade
// (47 affected / 35 silent / 12 complainants) without the seed's pool-wide failed-payment noise — and
// it proves RLS isolation (nothing bleeds into POOL-001's cockpit). Run after the seed: `pnpm db:05b`.
// The numbers (47/35/R$) are PRODUCED by fn_hunt_silent + fn_impact_revenue_lost over fixture Orders —
// never seeded into result columns. The fixture rows (Orders/Conversations) are INPUTS, marked [C].
const POOL = "POOL-PAY";
const USER = "U-PAY-001";
const N = 47; // restaurants with a failed payment in the window
const SILENT = 35; // of those, never opened a ticket (the silent ones we hunt)
const COMPLAINANTS = N - SILENT; // 12 opened a ticket (intent billing ⇒ finance)

/** Idempotent: the producer OWNS POOL-PAY — clear then rebuild its scenario (never touches other pools). */
async function rebuildScenario(): Promise<void> {
  await query(`delete from tenant."Affected" where tenant_id=$1`, [POOL]);
  await query(`delete from tenant."Diagnosed_Problem" where tenant_id=$1`, [POOL]);
  await query(`delete from tenant."Critical_Process" where tenant_id=$1`, [POOL]);
  await query(`delete from tenant."Knowledge_Case" where tenant_id=$1`, [POOL]);
  await query(`delete from tenant."Conversation_Episode" where tenant_id=$1`, [POOL]);
  await query(
    `delete from tenant."Order" o using tenant."Restaurant" r
      where o.restaurant_id=r.restaurant_id and r.tenant_id=$1`,
    [POOL],
  );
  await query(`delete from tenant."Restaurant" where tenant_id=$1`, [POOL]);
  await query(`delete from gov."User" where tenant_id=$1`, [POOL]);

  // dev-login operator (tenant is read from THIS row server-side, never the client — §3.4 anti-spoofing).
  await query(`insert into gov."User"(user_id, tenant_id, org_level) values ($1,$2,'team')`, [USER, POOL]);

  // 47 restaurants, one FAILED payment each. zone concentration 30 Centro / 17 Norte (a real pattern).
  await query(
    `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
     select 'R-PAY-'||lpad(g::text,3,'0'), $1, 'long_tail','long_tail', date '2026-01-01',
            case when g <= 30 then 'Centro' else 'Norte' end
       from generate_series(1,$2) g`,
    [POOL, N],
  );
  await query(
    `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
     select 'R-PAY-'||lpad(g::text,3,'0'), current_date, 100, 20, 'failed',
            case when g <= 30 then 'Centro' else 'Norte' end
       from generate_series(1,$1) g`,
    [N],
  );
  // 12 complainants opened a billing ticket; the other 35 are SILENT (the ⭐ population we surface).
  await query(
    `insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
     select 'R-PAY-'||lpad(g::text,3,'0')||':C1','R-PAY-'||lpad(g::text,3,'0')||':conv1',$1,
            'R-PAY-'||lpad(g::text,3,'0'),'billing'
       from generate_series(1,$2) g`,
    [POOL, COMPLAINANTS],
  );
  // one prior resolved case so the dossier's similar-cases field grounds (anti-hallucination, BR-B3).
  await query(
    `insert into tenant."Knowledge_Case"(tenant_id, area_type, pattern, outcome, resolution, reviewed)
     values ($1,'finance','payment_not_executed','resolved','gateway retry + manual reissue', true)`,
    [POOL],
  );
  // the payments process the proactive monitor watches (impact-high × fails-silently × measurable, BR-B12).
  await query(
    `insert into tenant."Critical_Process"(tenant_id, name, impact_score, fails_silently, truth_source_ref, origin, schedule)
     values ($1,'payments',0.95,true,'tenant.Order','policy','daily')`,
    [POOL],
  );
}

function devCtx(): Context {
  return { session: { user_id: USER, tenant_id: POOL, org_level: "team" }, tenantId: POOL, userId: USER };
}

async function main(): Promise<void> {
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const reasoning: DiagnosisReasoning = hasKey ? llmReasoning(new Anthropic()) : deterministicReasoning;
  console.warn(`run-05b: AGENTE reasoning = ${hasKey ? "Claude (real LLM)" : "deterministic (no ANTHROPIC_API_KEY)"}`);

  await rebuildScenario();

  // REACTIVE — a complainant opens a ticket ⇒ reportProblem (real US-B1.1.1 gate + B.1.3 dedup) ⇒ diagnose.
  const caller = appRouter.createCaller(devCtx());
  const reported = await caller.diagnosis.reportProblem({ restaurantId: "R-PAY-001", criticality: "critical" });
  const r1 = await runDiagnosis(reported.problem_id, POOL, reasoning);
  console.warn(
    `  reactive  ${reported.problem_id.slice(0, 8)} → area=${r1.areaType} affected=${r1.affected} ` +
      `silent=${r1.silent} R$=${r1.revenueLost} route=${r1.route} ` +
      `dossier=${r1.dossier.emitted ? "complete" : `partial(${r1.dossier.gaps.join(",")})`}`,
  );

  // PROACTIVE — the monitor catches a non-payment BEFORE a ticket (the reverse-cascade uau).
  const proc = (
    await query<{ process_id: string }>(`select process_id from tenant."Critical_Process" where tenant_id=$1`, [POOL])
  )[0];
  if (proc) {
    const mon = (
      await query<{ pid: string | null }>(`select tenant.fn_monitor_critical($1,$2) as pid`, [POOL, proc.process_id])
    )[0];
    if (mon?.pid) {
      const r2 = await runDiagnosis(mon.pid, POOL, reasoning);
      console.warn(
        `  proactive ${mon.pid.slice(0, 8)} → area=${r2.areaType} affected=${r2.affected} ` +
          `silent=${r2.silent} R$=${r2.revenueLost} route=${r2.route}`,
      );
    }
  }

  console.warn(`run-05b done — pool ${POOL}: ${N} affected / ${SILENT} silent. Dev-login as ${USER} on /diagnosis.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
