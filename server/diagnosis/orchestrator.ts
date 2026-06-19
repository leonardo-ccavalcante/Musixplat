// EPIC-B1 orchestrator — sequences B.2→B.8 over the existing diagnosis modules. It OWNS no math:
// every number comes from a producer (SQL), the AGENTE provider only classifies + ranks TEXT (§8).
// The problem already exists (reportProblem B.1.3, reactive; or fn_monitor_critical, proactive).
// Fail-closed throughout: low-confidence+no-KB ⇒ degrade-to-human (BR-B3); cross-tenant ⇒ abort (EC-B5).
import { query } from "../db/pool.js";
import { guardInjection, assertSingleTenant } from "./guards.js";
import { lazyFetchPath, type IssuePath, type IssueTree } from "./issue_tree.js";
import { huntSilent, reconcileAffected } from "./silent.js";
import { computeRevenueLost } from "./impact.js";
import { dispatchPriority, routeNowQueue } from "./priority.js";
import { routeStub } from "./routing.js";
import { upsertCaseRepo } from "./case_repo.js";
import { emitDossier, type DossierGateResult } from "./dossier.js";
import { deterministicReasoning, type DiagnosisReasoning } from "./reasoning.js";
import type { Criticality } from "../../shared/contracts_05b.js";

// Deterministic candidate hypotheses per area (seed set; the provider only RANKS these, §8).
const HYPOTHESES: Record<string, string[]> = {
  finance: ["payment was not executed", "refund dispute concentrated", "balance mismatch"],
  product: ["feature adoption dropped", "product defect"],
  performance: ["latency / connection window"],
};

/** Threshold BY NAME (§3.8), FAIL-CLOSED: knob_required_num RAISES if the knob is absent — never a
 *  silent literal default (mirrors silent.ts). Both knobs are seeded in seed.sql + the migration. */
async function knob(name: string): Promise<number> {
  const r = await query<{ v: number }>(`select catalog.knob_required_num($1) as v`, [name]);
  return Number(r[0]?.v);
}

export interface DiagnosisResult {
  problemId: string;
  areaType: string;
  confidence: number;
  degraded: boolean;
  affected: number;
  silent: number;
  silentStatus: "evaluable" | "not_evaluable";
  revenueLost: number;
  route: string;
  nowQueue: "now" | "queue";
  priorityScore: number;
  dossier: DossierGateResult;
}

export async function runDiagnosis(
  problemId: string,
  tenantId: string,
  reasoning: DiagnosisReasoning = deterministicReasoning,
): Promise<DiagnosisResult> {
  const prob = (
    await query<{ conversation_id: string | null; criticality: Criticality | null }>(
      `select conversation_id, criticality from tenant."Diagnosed_Problem"
        where problem_id = $1 and tenant_id = $2`,
      [problemId, tenantId],
    )
  )[0];
  if (!prob) throw new Error("runDiagnosis: unknown problem (fail-closed)");

  // text source: episode intent (reactive) or a proactive context line. Treated as DATA (EC-B10).
  const text = prob.conversation_id
    ? (
        await query<{ intent: string | null }>(
          `select intent from tenant."Conversation_Episode"
            where conversation_id = $1 and tenant_id = $2 limit 1`,
          [prob.conversation_id, tenantId],
        )
      )[0]?.intent ?? ""
    : "payments process monitor — proactive non-payment sweep";
  guardInjection(text); // signal is audit-only; never executes embedded instructions.

  // B.2 classify (TEXT only). Grounding floor: low confidence + no KB precedent ⇒ degrade (BR-B3).
  const cls = await reasoning.classifyArea({ text, hint: prob.criticality });
  const floor = await knob("threshold_classification"); // seeded 05B classify floor (§3.8, fail-closed)
  const kb = await query<{ n: number }>(
    `select count(*)::int n from tenant."Knowledge_Case" where tenant_id = $1 and area_type = $2`,
    [tenantId, cls.areaType],
  );
  const degraded = cls.confidence < floor && (kb[0]?.n ?? 0) === 0;
  await query(
    `update tenant."Diagnosed_Problem"
        set area_type = $2, confidence = $3,
            status = case when $4 then 'needs_human' else status end,
            provenance_by_field = provenance_by_field
              || jsonb_build_object('area_type','[C]','confidence','[C]')
      where problem_id = $1`,
    [problemId, cls.areaType, cls.confidence, degraded],
  );

  // B.3 issue-tree (provider ranks the deterministic seed) + B.4 lazy-fetch the single top source (BR-B2).
  const ranked = await reasoning.rankPaths({
    areaType: cls.areaType,
    hypotheses: HYPOTHESES[cls.areaType] ?? ["unclassified hypothesis"],
  });
  if (ranked.length === 0) throw new Error("runDiagnosis: rankPaths returned no paths (fail-closed)");
  const tree: IssueTree = {
    paths: ranked.map((p) => ({
      path_id: p.path_id,
      hypothesis: p.hypothesis,
      probability: p.probability,
      source_consulted: null,
      result: "open" as const,
    })),
  };
  const top: IssuePath = lazyFetchPath(tree, ranked[0]!.path_id);
  tree.paths[0] = top;
  await query(
    `update tenant."Diagnosed_Problem"
        set issue_tree = $2::jsonb,
            provenance_by_field = provenance_by_field || jsonb_build_object('issue_tree','[C]')
      where problem_id = $1`,
    [problemId, JSON.stringify(tree)],
  );

  // B.5 silent-hunt (SQL anti-join) — the affected/silent counts are PRODUCED here, never seeded (BR-B4, §14).
  const s = await huntSilent(problemId, tenantId);
  const rec = await reconcileAffected(problemId);
  const tids = await query<{ tenant_id: string }>(
    `select distinct tenant_id from tenant."Affected" where problem_id = $1`,
    [problemId],
  );
  await assertSingleTenant(
    tids.map((t) => t.tenant_id),
    { piece: "05B:orchestrator", problemId },
  ); // EC-B5 cross-pool hard-no.

  // B.6 KB grounding ⇒ hypothesis_root anchored + similar_links (anti-hallucination, BR-B3).
  const sims = await query<{ kb_case_id: string }>(
    `select kb_case_id from tenant."Knowledge_Case" where tenant_id = $1 and area_type = $2 limit 5`,
    [tenantId, cls.areaType],
  );
  await query(
    `update tenant."Diagnosed_Problem"
        set hypothesis_root = $2, similar_links = $3::jsonb,
            provenance_by_field = provenance_by_field || jsonb_build_object('hypothesis_root','[C]')
      where problem_id = $1`,
    [problemId, top.hypothesis, JSON.stringify(sims.map((x) => x.kb_case_id))],
  );

  // B.7 impact (Named_Query) + priority (risk × impact vs cost). impact = revenue_lost (SQL).
  const imp = await computeRevenueLost(problemId);
  const risk = rec.restaurantsAffected > 0 ? s.silent / rec.restaurantsAffected : 0;
  const cost = await knob("monitor_cost_default");
  const nowQueue = routeNowQueue({ risk, impact: imp.revenueLost, cost });
  const priorityScore = dispatchPriority({
    criticality: prob.criticality,
    impact: imp.revenueLost,
    agile: null,
  });

  // B.8 route + replicable case (where_concentrated = REAL zone concentration) + dossier gate.
  const conc = (
    await query<{ zone: string | null; n: number }>(
      `select o.zone, count(*)::int n from tenant."Order" o
         join tenant."Affected" a on a.restaurant_id = o.restaurant_id and a.problem_id = $1
        where o.payment_status = 'failed' group by o.zone order by n desc limit 1`,
      [problemId],
    )
  )[0];
  const route = routeStub(cls.areaType);
  await query(
    `update tenant."Diagnosed_Problem"
        set suggested_route = $2,
            provenance_by_field = provenance_by_field || jsonb_build_object('suggested_route','[C]')
      where problem_id = $1`,
    [problemId, route],
  );
  await upsertCaseRepo(problemId, {
    where_concentrated: conc ? { dim: "zone", value: conc.zone, n: conc.n } : null,
    raw_data: { affected: s.affected, silent: s.silent, revenue_lost: imp.revenueLost },
  });
  const dossier = await emitDossier(problemId);

  return {
    problemId,
    areaType: cls.areaType,
    confidence: cls.confidence,
    degraded,
    affected: s.affected,
    silent: s.silent,
    silentStatus: rec.silentStatus,
    revenueLost: imp.revenueLost,
    route,
    nowQueue,
    priorityScore,
    dossier,
  };
}
