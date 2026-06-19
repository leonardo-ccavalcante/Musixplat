import type pg from "pg";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";
import { readDossier, emitDossier } from "../diagnosis/dossier.js";
import { computeImpactLedger } from "../diagnosis/impact.js";
import { runDiagnosis } from "../diagnosis/orchestrator.js";
import {
  reportProblemInput,
  getDossierInput,
  getKnowledgeCaseInput,
  runDiagnosisInput,
  type ReportProblemResult,
  type DiagnosisListRow,
  type DiagnosisOrigin,
  type KnowledgeCaseView,
  type RunDiagnosisResult,
} from "../../shared/contracts_05b.js";

// 05B:US-B1.1.1 (gate tenant_id + restaurant_id) + 05B:B.1.3 (dedup create-or-increment).
// 04 §3/§7. tenant resolved server-side (tenantProcedure, anti-spoofing); cross-pool ⇒ abort +
// Security_Log (BR-B6 hard-no). At most ONE open problem per restaurant (anti double-counting,
// "one case = one PROBLEM") via the partial unique index — a repeat trigger increments frequency
// instead of duplicating (BR-B5/BR-B8). frequency is a computed count, never a seeded number.

// 05B read surface (F-B1.3 board + US-B6.3.1 dossier). tenant resolved server-side; numbers are READ
// from the producers, never recomputed (§14). Diagnosed_Problem carries tenant_id directly ⇒ scope by it.
export type Exec = <T extends pg.QueryResultRow>(sql: string, params: readonly unknown[]) => Promise<T[]>;

type RawListRow = {
  problem_id: string;
  restaurant_id: string;
  status: string;
  criticality: string | null;
  area_type: string | null;
  hypothesis_root: string | null;
  confidence: number | null;
  revenue_lost: number | null;
  suggested_route: string | null;
  silent_status: string | null;
  frequency: number;
  conversation_id: string | null;
  first_seen_ts: string;
  affected: number;
  silent: number;
};

/** Pure display mapping (DB-free, unit-testable): origin = reactive (has episode) vs proactive (monitor,
 *  conversation_id NULL); needs_human = degraded/blocked status (BR-B3/B17 fail-closed). No number recomputed. */
export function diagnosisView(r: Pick<RawListRow, "conversation_id" | "status">): {
  origin: DiagnosisOrigin;
  needs_human: boolean;
} {
  return {
    origin: r.conversation_id ? "reactive" : "proactive",
    needs_human: r.status === "needs_human" || r.status === "blocked",
  };
}

const LIST_SQL = `
  select p.problem_id::text as problem_id, p.restaurant_id, p.status, p.criticality, p.area_type,
         p.hypothesis_root, p.confidence::float8 as confidence, p.revenue_lost::float8 as revenue_lost,
         p.suggested_route, p.silent_status, p.frequency, p.conversation_id,
         p.first_seen_ts::text as first_seen_ts,
         coalesce(a.affected, 0) as affected, coalesce(a.silent, 0) as silent
  from tenant."Diagnosed_Problem" p
  left join lateral (
    select count(*)::int as affected, count(*) filter (where silent)::int as silent
    from tenant."Affected" where problem_id = p.problem_id
  ) a on true
  where p.tenant_id = $1
  order by p.first_seen_ts desc, p.problem_id`;

export async function listDiagnosisRows(tenantId: string, exec: Exec): Promise<DiagnosisListRow[]> {
  const raw = await exec<RawListRow>(LIST_SQL, [tenantId]);
  return raw.map((r) => ({
    problem_id: r.problem_id,
    restaurant_id: r.restaurant_id,
    status: r.status,
    criticality: r.criticality,
    area_type: r.area_type,
    hypothesis_root: r.hypothesis_root,
    confidence: r.confidence,
    affected: r.affected,
    silent: r.silent,
    silent_status: r.silent_status,
    revenue_lost: r.revenue_lost,
    suggested_route: r.suggested_route,
    frequency: r.frequency,
    first_seen_ts: r.first_seen_ts,
    ...diagnosisView(r),
  }));
}

export const diagnosisRouter = router({
  reportProblem: tenantProcedure
    .input(reportProblemInput)
    .mutation(async ({ ctx, input }): Promise<ReportProblemResult> => {
      // US-B1.1.1 — restaurant must EXIST and belong to the session's pool (fail-closed).
      const owner = await query<{ tenant_id: string }>(
        `select tenant_id from tenant."Restaurant" where restaurant_id = $1`,
        [input.restaurantId],
      );
      if (!owner[0]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "unknown restaurant_id (fail-closed)" });
      }
      if (owner[0].tenant_id !== ctx.tenantId) {
        await query(
          `insert into gov."Security_Log"(tenant_id, kind, detail) values ($1, 'cross_pool', $2)`,
          [ctx.tenantId, JSON.stringify({ piece: "05B:US-B1.1.1", restaurantId: input.restaurantId })],
        );
        throw new TRPCError({ code: "FORBIDDEN", message: "cross-pool diagnosis blocked" });
      }

      // B.1.3 — create-or-increment. Partial unique (tenant_id, restaurant_id) WHERE open.
      // (xmax = 0) ⇒ this call inserted; otherwise it bumped an existing open problem.
      const rows = await query<{
        problem_id: string;
        status: string;
        frequency: number;
        created: boolean;
      }>(
        `insert into tenant."Diagnosed_Problem"
           (tenant_id, restaurant_id, conversation_id, criticality, status, frequency)
         values ($1, $2, $3, $4, 'open', 1)
         on conflict (tenant_id, restaurant_id) where status = 'open'
           do update set frequency     = tenant."Diagnosed_Problem".frequency + 1,
                         last_seen_ts  = now()
         returning problem_id, status, frequency, (xmax = 0) as created`,
        [ctx.tenantId, input.restaurantId, input.conversationId ?? null, input.criticality ?? null],
      );
      const r = rows[0];
      if (!r) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "report failed" });
      return { problem_id: r.problem_id, status: r.status, frequency: r.frequency, created: r.created };
    }),

  // Gate 1 (05B operability) — the PRODUCT triggers the orchestrator for one problem (no terminal).
  // tenant resolved server-side; a foreign pool ⇒ Security_Log + abort (BR-B6, mirrors reportProblem).
  // runDiagnosis is idempotent (UPDATE-only writes + fn_hunt_silent ON CONFLICT DO NOTHING), so a
  // re-run never duplicates Affected/Diagnosed_Problem. Numbers are PRODUCED by the orchestrator (§14).
  run: tenantProcedure
    .input(runDiagnosisInput)
    .mutation(async ({ ctx, input }): Promise<RunDiagnosisResult> => {
      const owner = await query<{ tenant_id: string }>(
        `select tenant_id from tenant."Diagnosed_Problem" where problem_id = $1`,
        [input.problemId],
      );
      if (!owner[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "unknown problem (fail-closed)" });
      }
      if (owner[0].tenant_id !== ctx.tenantId) {
        await query(
          `insert into gov."Security_Log"(tenant_id, kind, detail) values ($1, 'cross_pool', $2)`,
          [ctx.tenantId, JSON.stringify({ piece: "05B:diagnosis.run", problemId: input.problemId })],
        );
        throw new TRPCError({ code: "FORBIDDEN", message: "cross-pool diagnosis blocked" });
      }
      const r = await runDiagnosis(input.problemId, ctx.tenantId);
      // EPIC-B5 — quantify f5 (churn/cost/value) from the produced counts, then re-gate the dossier so the
      // returned verdict reflects the completed impact. Fail-closed: no affected population ⇒ f5 stays NULL
      // ⇒ dossier remains PARTIAL (the SQL producer no-ops). Numbers PRODUCED, never seeded (§14).
      await computeImpactLedger(input.problemId);
      const gate = await emitDossier(input.problemId);
      // Refresh the 1:10 leverage from the produced counts (deterministic, §14). Read-only surface = roi.summary.
      await query(`select gov.fn_roi_1_10($1)`, [ctx.tenantId]);
      return {
        problem_id: r.problemId,
        area_type: r.areaType,
        confidence: r.confidence,
        degraded: r.degraded,
        affected: r.affected,
        silent: r.silent,
        silent_status: r.silentStatus,
        revenue_lost: r.revenueLost,
        route: r.route,
        dossier_emitted: gate.emitted,
        dossier_gaps: gate.gaps,
      };
    }),

  // F-B1.3 — the diagnosis board: every problem in the pool with produced counts + autonomy verdict.
  list: tenantProcedure.query(({ ctx }): Promise<DiagnosisListRow[]> => listDiagnosisRows(ctx.tenantId, query)),

  // US-B6.3.1 — the 11-field dossier gate for one problem (read-only; honest partial gaps). Ownership
  // verified server-side first ⇒ no cross-pool dossier leak (BR-B6).
  getDossier: tenantProcedure.input(getDossierInput).query(async ({ ctx, input }) => {
    const own = await query<{ x: number }>(
      `select 1 as x from tenant."Diagnosed_Problem" where problem_id = $1 and tenant_id = $2`,
      [input.problemId, ctx.tenantId],
    );
    if (!own[0]) throw new TRPCError({ code: "NOT_FOUND", message: "problem not in this pool" });
    return readDossier(input.problemId);
  }),

  // BR-B3 grounding read — open one KB precedent (the dossier's similar-cases links). Tenant-scoped.
  getKnowledgeCase: tenantProcedure
    .input(getKnowledgeCaseInput)
    .query(async ({ ctx, input }): Promise<KnowledgeCaseView> => {
      const rows = await query<KnowledgeCaseView>(
        `select kb_case_id::text as kb_case_id, area_type, pattern, outcome, resolution,
                not_resolved_reason, probability::float8 as probability, discarded_branches,
                created_at::text as created_at
           from tenant."Knowledge_Case" where kb_case_id = $1 and tenant_id = $2`,
        [input.kbCaseId, ctx.tenantId],
      );
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "kb case not in this pool" });
      return rows[0];
    }),

  // F-B1.3 header — the TRUE silent figure: COUNT(DISTINCT restaurant) flagged silent across the pool's
  // problems. Problems share the pool population (one ticket reveals the whole pool), so summing per-row
  // silent double-counts; this dedupes server-side. Deterministic SQL, tenant-scoped, never recomputed
  // client-side (§14, §8 deterministic-never-LLM).
  silentSummary: tenantProcedure.query(async ({ ctx }): Promise<{ distinctSilent: number }> => {
    const rows = await query<{ silent: number }>(
      `select count(distinct a.restaurant_id)::int as silent
         from tenant."Affected" a
         join tenant."Diagnosed_Problem" p on p.problem_id = a.problem_id
        where p.tenant_id = $1 and a.silent`,
      [ctx.tenantId],
    );
    return { distinctSilent: rows[0]?.silent ?? 0 };
  }),
});
