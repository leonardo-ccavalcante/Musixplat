import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";
import {
  learningCasesInput,
  type ObservatoryCapRow,
  type ObservatoryEvalCell,
  type ObservatoryLearningCase,
  type ObservatoryTrace,
} from "../../shared/contracts_observatory.js";

// Observatory — read-only VITRINA over already-produced gov/tenant tables. Every value is read
// as-stored (§14); nothing is computed or ranked here. tenant resolved server-side (§3.4). Own-tenant
// internal view ⇒ NO k-anon/n_min suppression (full traceability).
export const observatoryRouter = router({
  // Eval grid. Eval_Cell has NO tenant_id ⇒ scope by joining cohort_id → Cohort_Membership_Snapshot →
  // Restaurant.tenant_id (the producer pattern, provision.ts:22-25), pinned to the current cohort rule
  // version to avoid cross-version membership over-count. Eval_Cell.version (gs-1) is golden-set identity.
  evalList: tenantProcedure.query(async ({ ctx }): Promise<ObservatoryEvalCell[]> => {
    const version = (
      await query<{ value: string }>(`select value from catalog."Config_Knobs" where key='cohort_rule_version_current'`)
    )[0]?.value;
    if (!version) return []; // fail-closed (§3.8): no current version ⇒ nothing to show, never guess
    const r = await query<{
      cohort_id: string;
      intent: string;
      version: string;
      released_evals: "LOW" | "MEDIUM" | "HIGH" | null;
      status: "red" | "green" | null;
      n_cohort_x_intent: number | null;
      kappa: number | null;
      redteam_independence_flag: boolean | null;
      redteam_judge_vs_human_result: string | null;
      provenance_by_field: Record<string, string>;
      cuisine: string | null;
      zone: string | null;
      tier_base: string | null;
    }>(
      `select e.cohort_id, e.intent, e.version, e.released_evals, e.status,
              e.n_cohort_x_intent, e.kappa::float8 as kappa,
              e.redteam_independence_flag, e.redteam_judge_vs_human_result, e.provenance_by_field,
              c.cuisine, c.zone, c.tier_base
         from gov."Eval_Cell" e
         join cohort."Cohort" c on c.cohort_id = e.cohort_id
        where exists (
          select 1 from cohort."Cohort_Membership_Snapshot" cms
            join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $1
           where cms.cohort_id = e.cohort_id and cms.cohort_rule_version = $2)
        order by e.cohort_id, e.intent`,
      [ctx.tenantId, version],
    );
    return r.map((x) => ({
      cohortId: x.cohort_id,
      intent: x.intent,
      version: x.version,
      releasedEvals: x.released_evals,
      status: x.status,
      nCohortXIntent: x.n_cohort_x_intent,
      kappa: x.kappa,
      redteamIndependenceFlag: x.redteam_independence_flag,
      redteamJudgeVsHumanResult: x.redteam_judge_vs_human_result,
      provenanceByField: x.provenance_by_field ?? {},
      cuisine: x.cuisine,
      zone: x.zone,
      tierBase: x.tier_base,
    }));
  }),

  // Limits cap table (one row per tier). The honest "proven vs your cap" split (§3.10/§14): yourCap is the
  // human-approved ceiling (Policy_Tier.tier_cap, [V]); proven is the highest MEASURED ([V], green) eval
  // level among the tier's current-version cohorts (an [I] floor never counts ⇒ NULL "not graded"); runsAlone
  // = least(yourCap, coalesce(proven,'LOW')) over the ordered autonomy_level enum, computed in SQL (never
  // recomputed client-side). Policy_Tier is tier-keyed/global (no tenant_id) ⇒ tenant is anchored on
  // human_signature → User.tenant_id (the autoDispatch-safe anchor, §3.4): a tier the pool's manager never
  // signed is simply absent (fail-closed), not shown as this pool's cap.
  capTable: tenantProcedure.query(async ({ ctx }): Promise<ObservatoryCapRow[]> => {
    const version = (
      await query<{ value: string }>(`select value from catalog."Config_Knobs" where key='cohort_rule_version_current'`)
    )[0]?.value;
    if (!version) return []; // fail-closed (§3.8): no current version ⇒ nothing to show
    const r = await query<{ tier: string; your_cap: string; proven: string | null; runs_alone: string }>(
      `with pol as (
         select distinct on (pt.tier_id) pt.tier_id as tier, pt.tier_cap
           from gov."Policy_Tier" pt
           join gov."User" u on u.user_id = pt.human_signature and u.tenant_id = $1
          order by pt.tier_id, pt.policy_version desc
       ),
       proven as (
         select c.tier_base::text as tier, max(e.released_evals) as proven
           from gov."Eval_Cell" e
           join cohort."Cohort" c on c.cohort_id = e.cohort_id
          where e.status = 'green'
            and e.provenance_by_field->>'status' = '[V]'
            and exists (
              select 1 from cohort."Cohort_Membership_Snapshot" cms
                join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $1
               where cms.cohort_id = e.cohort_id and cms.cohort_rule_version = $2)
          group by c.tier_base
       )
       select pol.tier, pol.tier_cap::text as your_cap, pr.proven::text as proven,
              least(pol.tier_cap, coalesce(pr.proven, 'LOW'::public.autonomy_level))::text as runs_alone
         from pol
         left join proven pr on pr.tier = pol.tier
        order by pol.tier`,
      [ctx.tenantId, version],
    );
    return r.map((x) => ({
      tier: x.tier,
      yourCap: x.your_cap as ObservatoryCapRow["yourCap"],
      proven: x.proven as ObservatoryCapRow["proven"],
      runsAlone: x.runs_alone as ObservatoryCapRow["runsAlone"],
    }));
  }),

  // Full learned-case list (any outcome). Knowledge_Case HAS tenant_id ⇒ straightforward scope.
  // outcome='not_resolved' is structurally empty today (motor writes only resolved/escalated) — the UI
  // shows an honest empty tier, never a fake value. probability/similar_links are always NULL today.
  learningCases: tenantProcedure
    .input(learningCasesInput)
    .query(async ({ ctx, input }): Promise<ObservatoryLearningCase[]> => {
      const where: string[] = [`tenant_id = $1`];
      const params: unknown[] = [ctx.tenantId];
      if (input.areaType) {
        params.push(input.areaType);
        where.push(`area_type = $${params.length}`);
      }
      if (input.outcome) {
        params.push(input.outcome);
        where.push(`outcome = $${params.length}`);
      }
      const r = await query<{
        kb_case_id: string;
        area_type: string;
        pattern: string | null;
        outcome: string | null;
        resolution: string | null;
        not_resolved_reason: string | null;
        discarded_branches: unknown;
        probability: number | null;
        reviewed: boolean;
        verification_status: string | null;
        provenance_by_field: Record<string, string>;
        created_at: string;
      }>(
        `select kb_case_id, area_type, pattern, outcome, resolution, not_resolved_reason,
                discarded_branches, probability::float8 as probability, reviewed,
                verification_status, provenance_by_field, created_at::text as created_at
           from tenant."Knowledge_Case"
          where ${where.join(" and ")}
          order by created_at desc limit 100`,
        params,
      );
      return r.map((x) => ({
        kbCaseId: x.kb_case_id,
        areaType: x.area_type,
        pattern: x.pattern,
        outcome: x.outcome,
        resolution: x.resolution,
        notResolvedReason: x.not_resolved_reason,
        discardedBranches: x.discarded_branches,
        probability: x.probability,
        reviewed: x.reviewed,
        verificationStatus: x.verification_status,
        provenanceByField: x.provenance_by_field ?? {},
        createdAt: x.created_at,
      }));
    }),

  // Auto-origin governance traces (what the AI did alone + its gates). Decision_Trace has NO tenant_id
  // and no uniform tenant join; anchor on Action_Dispatch.tenant_id (the dispatch owner) with
  // origin='auto' — the same safe anchor listAutoActions uses (cockpit.ts:141), and exactly the
  // "what the AI did alone" governing thought. gate_result/time_to_signature_sec/rubber_stamp_flag are
  // RESULT NULL-pre-run; independence_guaranteed is a generated column (trustworthy).
  traces: tenantProcedure.query(async ({ ctx }): Promise<ObservatoryTrace[]> => {
    const r = await query<{
      trace_id: string;
      action: string;
      effective_level_applied: "LOW" | "MEDIUM" | "HIGH" | null;
      escalation_axis: string | null;
      proposer_id: string;
      confirmer_id: string | null;
      independence_guaranteed: boolean | null;
      gate_result: unknown | null;
      time_to_signature_sec: number | null;
      rubber_stamp_flag: boolean | null;
      ts: string;
    }>(
      `select dt.trace_id, dt.action::text as action, dt.effective_level_applied,
              dt.escalation_axis::text as escalation_axis, dt.proposer_id, dt.confirmer_id,
              dt.independence_guaranteed, dt.gate_result, dt.time_to_signature_sec,
              dt.rubber_stamp_flag, dt."timestamp"::text as ts
         from gov."Decision_Trace" dt
         join gov."Action_Dispatch" ad on ad.decision_trace_id = dt.trace_id
        where ad.tenant_id = $1 and dt.origin = 'auto'
        order by dt."timestamp" desc limit 50`,
      [ctx.tenantId],
    );
    return r.map((x) => ({
      traceId: x.trace_id,
      action: x.action,
      effectiveLevelApplied: x.effective_level_applied,
      escalationAxis: x.escalation_axis,
      proposerId: x.proposer_id,
      confirmerId: x.confirmer_id,
      independenceGuaranteed: x.independence_guaranteed,
      gateResult: x.gate_result,
      timeToSignatureSec: x.time_to_signature_sec,
      rubberStampFlag: x.rubber_stamp_flag,
      ts: x.ts,
    }));
  }),
});
