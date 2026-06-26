import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";
import { runDiagnosis } from "../diagnosis/orchestrator.js";
import { triggerActionForProblem } from "../diagnosis/triggerAction.js";
import { diagnosisReasoning } from "../diagnosis/provider.js";
import { computeImpactLedger } from "../diagnosis/impact.js";
import { emitDossier } from "../diagnosis/dossier.js";
import { generateFromDossier } from "../artifact/generateFromDossier.js";
import { stageTickets, stageConversations } from "../intake/stage.js";
import {
  uploadTicketsInput,
  uploadConversationsInput,
  type IntakeResult,
} from "../../shared/contracts_intake.js";

// Situation Room intake (05B/05C operability). The operator uploads REAL data; the spine runs on it (no
// fixed scenario). tenant resolved server-side (anti-spoofing); staging is scoped to ctx.tenantId. Numbers
// are PRODUCED by the orchestrator over the staged rows, then READ back here — never seeded (§14).

// Run the spine on the reported problem and read back what the producers computed. Shared by both modes.
async function runSpine(
  tenantId: string,
  reportOn: string,
  conversationId: string | null,
  crit: string | null,
): Promise<{ affected: number; silent: number; revenue_lost: number; dossier_complete: boolean; artifact: boolean }> {
  // create-or-increment the open problem (same contract as diagnosis.reportProblem B.1.3).
  const ins = await query<{ problem_id: string }>(
    `insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status, frequency)
     values ($1,$2,$3,$4,'open',1)
     on conflict (tenant_id, restaurant_id) where status='open'
       do update set frequency = tenant."Diagnosed_Problem".frequency + 1, last_seen_ts = now()
     returning problem_id`,
    [tenantId, reportOn, conversationId, crit],
  );
  const problemId = ins[0]!.problem_id;
  // 05D Part A — Brain 2 built INSIDE runDiagnosis's fail-closed boundary (factory): a provider/key failure
  // degrades the freshly-inserted problem to needs_human instead of leaving it 'open' (Codex).
  const r = await runDiagnosis(problemId, tenantId, () => diagnosisReasoning(tenantId, problemId));
  await computeImpactLedger(problemId);
  const gate = await emitDossier(problemId);
  if (gate.emitted) {
    // Stamp the FIRST emission only — the returned row is the one-shot signal for the close-the-loop trigger
    // (a dedup-rerun of the same complete problem never re-stamps nor re-fires the motor; idempotent, Codex P2).
    const stamped = await query(
      `update tenant."Diagnosed_Problem"
          set dossier_emitted_at = now()
        where problem_id=$1 and tenant_id=$2 and dossier_emitted_at is null
        returning 1`,
      [problemId, tenantId],
    );
    // 05D close-the-loop: on first completion, fire the action motor for the diagnosed restaurants.
    // Fail-CLOSED (a partial dossier never auto-acts, §7) + one-shot + fail-OPEN (never breaks intake).
    if (stamped.length)
      await triggerActionForProblem(problemId, tenantId).catch((e) => {
        // Observability (Codex P1): fail-OPEN (intake/dossier stands) but the failure is LOGGED, not swallowed.
        console.warn(`[05D close-loop] trigger failed for problem ${problemId}:`, e);
        return null;
      });
  }
  let artifact = false;
  if (gate.emitted) {
    const a = await generateFromDossier(problemId, tenantId);
    artifact = a.status === "generated";
  }
  await query(`select gov.fn_roi_1_10($1)`, [tenantId]);
  return { affected: r.affected, silent: r.silent, revenue_lost: r.revenueLost, dossier_complete: gate.emitted, artifact };
}

export const intakeRouter = router({
  // Mode 1 — structured tickets. The cascade (affected/silent/€) is PRODUCED from the uploaded rows.
  uploadTickets: tenantProcedure
    .input(uploadTicketsInput)
    .mutation(async ({ ctx, input }): Promise<IntakeResult> => {
      const s = await stageTickets(ctx.tenantId, input.rows);
      const out = await runSpine(ctx.tenantId, s.reportOn!, s.conversationId, s.criticality);
      return {
        staged: s.staged,
        problems: 1,
        affected: out.affected,
        silent: out.silent,
        revenue_lost: out.revenue_lost,
        dossiers_complete: out.dossier_complete ? 1 : 0,
        artifacts: out.artifact ? 1 : 0,
        note: out.dossier_complete
          ? "Complete dossier produced from your upload — ready for the human gate."
          : "Diagnosed from your upload; dossier is partial (fail-closed) until every field is grounded.",
      };
    }),

  // Mode 2 — n8n conversations ingested into Conversation_Episode (the real DB structure). The spine runs
  // on the first session; without a payment population the cascade stays small and FAIL-CLOSES honestly.
  uploadConversations: tenantProcedure
    .input(uploadConversationsInput)
    .mutation(async ({ ctx, input }): Promise<IntakeResult> => {
      const s = await stageConversations(ctx.tenantId, input.conversations);
      const out = await runSpine(ctx.tenantId, s.reportOn!, s.conversationId, "moderate");
      return {
        staged: s.staged,
        problems: 1,
        affected: out.affected,
        silent: out.silent,
        revenue_lost: out.revenue_lost,
        dossiers_complete: out.dossier_complete ? 1 : 0,
        artifacts: out.artifact ? 1 : 0,
        note: out.dossier_complete
          ? "Diagnosed from your conversations — complete dossier."
          : "Conversations ingested + diagnosed; no payment-failure signal in this upload, so the cascade is limited (honest, fail-closed).",
      };
    }),
});
