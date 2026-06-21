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
import {
  deterministicReasoning,
  type DiagnosisReasoning,
  type GroundingCase,
  type AreaClassification,
  type RankedPath,
} from "./reasoning.js";
import { searchKnowledge } from "../knowledge/store.js";
import type { Embedder } from "../knowledge/embedder.js";
import type { Criticality } from "../../shared/contracts_05b.js";
import { getDescriptor } from "../../shared/problem_types.js";

// Deterministic candidate hypotheses per area (seed set; the provider only RANKS these, §8).
const HYPOTHESES: Record<string, string[]> = {
  finance: ["payment was not executed", "refund dispute concentrated", "balance mismatch"],
  product: ["feature adoption dropped", "product defect"],
  performance: ["latency / connection window"],
};

// 05D F0 — concentration axis allowlist: maps a descriptor's concentration_dim (closed enum) to a
// REAL Restaurant column. Allowlist (never raw interpolation) so the generic concentration query
// stays injection-proof even though the dim comes from our own vetted registry (§8 defense-in-depth).
const CONCENTRATION_DIMS: Record<string, string> = { zone: "zone", cuisine: "cuisine" };

/** Threshold BY NAME (§3.8), FAIL-CLOSED: knob_required_num RAISES if the knob is absent — never a
 *  silent literal default (mirrors silent.ts). Both knobs are seeded in seed.sql + the migration. */
async function knob(name: string): Promise<number> {
  const r = await query<{ v: number }>(`select catalog.knob_required_num($1) as v`, [name]);
  return Number(r[0]?.v);
}

/** Fetch prior REVIEWED cases (BR-B16) to ground the agent (BR-B3). Only reviewed cases — never
 *  unvetted AI text — steer reasoning. Area-scoped when an area is known (rank); tenant-recent when not
 *  (classify). Returns [] until producers populate Knowledge_Case ⇒ today the agents stay ungrounded
 *  (no behaviour change), and light up automatically once reviewed cases exist. tenant scope = §3.4. */
async function fetchGrounding(tenantId: string, areaType?: string): Promise<GroundingCase[]> {
  const rows = await query<{
    pattern: string | null;
    area_type: string;
    path_used: unknown;
    discarded_branches: unknown;
    probability: string | null; // node-pg returns a numeric column as a STRING — coerce below (honest type)
  }>(
    `select pattern, area_type, path_used, discarded_branches, probability
       from tenant."Knowledge_Case"
      where tenant_id = $1 and reviewed = true
        and ($2::text is null or area_type = $2)
      order by created_at desc limit 5`,
    [tenantId, areaType ?? null],
  );
  return rows.map((r) => ({
    pattern: r.pattern,
    areaType: r.area_type,
    pathUsed: r.path_used,
    discardedBranches: r.discarded_branches,
    probability: r.probability == null ? null : Number(r.probability), // numeric(string) → number | null
  }));
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
  embedder?: Embedder, // DI: tests inject deterministicEmbedder (hermetic/free); prod passes none ⇒ OpenAI.
): Promise<DiagnosisResult> {
  const prob = (
    await query<{
      conversation_id: string | null;
      criticality: Criticality | null;
      problem_type: string;
      segment: string | null;
    }>(
      `select conversation_id, criticality, problem_type, segment from tenant."Diagnosed_Problem"
        where problem_id = $1 and tenant_id = $2`,
      [problemId, tenantId],
    )
  )[0];
  if (!prob) throw new Error("runDiagnosis: unknown problem (fail-closed)");
  // 05D F0 — the descriptor the engine dispatches on (concentration axis, etc.). Fail-closed:
  // getDescriptor RAISES on an unregistered type (never a silent wrong pipeline, §8).
  const descriptor = getDescriptor(prob.problem_type);

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

  // B.2 classify + B.3 rank — the AGENTE provider (TEXT only, §8). Grounded on prior reviewed cases
  // (BR-B3); empty ⇒ ungrounded as before. Any PROVIDER failure — off-contract output, set-equality
  // violation (model invented/dropped/duplicated a hypothesis), or an empty rank — is fail-closed to
  // needs_human (BR-B3 / §3.7): the case is degraded, never left 'open' as if undiagnosed and never a
  // guess. We mark needs_human, then re-throw so the caller sees the degrade rather than a half-run.
  let cls: AreaClassification;
  let degraded: boolean;
  let ranked: RankedPath[];
  try {
    const classifyExamples = await fetchGrounding(tenantId);
    cls = await reasoning.classifyArea({ text, hint: prob.criticality, examples: classifyExamples });
    const floor = await knob("threshold_classification"); // seeded 05B classify floor (§3.8, fail-closed)
    const kb = await query<{ n: number }>(
      `select count(*)::int n from tenant."Knowledge_Case" where tenant_id = $1 and area_type = $2`,
      [tenantId, cls.areaType],
    );
    // Grounding floor: low confidence + no KB precedent ⇒ degrade (BR-B3).
    degraded = cls.confidence < floor && (kb[0]?.n ?? 0) === 0;
    await query(
      `update tenant."Diagnosed_Problem"
          set area_type = $2, confidence = $3,
              status = case when $4 then 'needs_human' else status end,
              provenance_by_field = provenance_by_field
                || jsonb_build_object('area_type','[C]','confidence','[C]')
        where problem_id = $1 and tenant_id = $5`,
      [problemId, cls.areaType, cls.confidence, degraded, tenantId],
    );

    // B.3 issue-tree: provider ranks the deterministic seed. Grounded on reviewed cases for THIS area:
    // falsified branches get pushed lower (set-equality holds — the model may only permute the seed).
    const rankExamples = await fetchGrounding(tenantId, cls.areaType);
    ranked = await reasoning.rankPaths({
      areaType: cls.areaType,
      hypotheses: HYPOTHESES[cls.areaType] ?? ["unclassified hypothesis"],
      examples: rankExamples,
    });
    if (ranked.length === 0) throw new Error("runDiagnosis: rankPaths returned no paths (fail-closed)");
  } catch (e) {
    // fail-closed (§3.7 / BR-B3): a reasoning-provider failure degrades the case to needs_human — never
    // leaves it 'open' as if it were never diagnosed. Re-throw so the caller knows the run degraded.
    await query(
      `update tenant."Diagnosed_Problem"
          set status = 'needs_human',
              provenance_by_field = provenance_by_field || jsonb_build_object('status','[C]')
        where problem_id = $1 and tenant_id = $2`,
      [problemId, tenantId],
    );
    throw e;
  }
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
      where problem_id = $1 and tenant_id = $3`,
    [problemId, JSON.stringify(tree), tenantId],
  );

  // B.5 silent-hunt (SQL anti-join) — the affected/silent counts are PRODUCED here, never seeded (BR-B4, §14).
  // 05D F0: the dispatcher routes on problem_type; segment (null ⇒ whole pool) is the optional slice.
  const s = await huntSilent(problemId, tenantId, undefined, prob.segment);
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
      where problem_id = $1 and tenant_id = $4`,
    [problemId, top.hypothesis, JSON.stringify(sims.map((x) => x.kb_case_id)), tenantId],
  );

  // B.6.5 semantic grounding over the UPLOADED knowledge base (P06). Augments — never replaces — the
  // area_type/Knowledge_Case path above (that match stays the §3 fail-closed grounding floor). Text-only
  // retrieval (§3.6): the producer fills kb_doc_refs at runtime (never seeded, §14), provenance [C].
  // tenant scope is the server-resolved tenantId (§3.4). Fail-closed: no hit ⇒ kb_doc_refs stays [].
  // Fail-closed (§3.7): a retrieval outage degrades to NO refs (kb_doc_refs stays []) — it must NEVER
  // abort the diagnosis. The area_type/Knowledge_Case grounding above already stands on its own.
  try {
    const kbHits = await searchKnowledge(tenantId, top.hypothesis ?? text ?? cls.areaType, undefined, embedder);
    if (kbHits.length) {
      await query(
        `update tenant."Diagnosed_Problem"
            set kb_doc_refs = $2::jsonb,
                provenance_by_field = provenance_by_field || jsonb_build_object('kb_doc_refs','[C]')
          where problem_id = $1 and tenant_id = $3`,
        [
          problemId,
          JSON.stringify(
            kbHits.map((h) => ({
              docId: h.docId,
              filename: h.filename,
              docType: h.docType,
              similarity: h.similarity,
            })),
          ),
          tenantId,
        ],
      );
    }
  } catch {
    // swallow → conservative state (no refs); the deterministic spine continues uninterrupted.
  }

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

  // B.8 route + replicable case (where_concentrated = REAL concentration on the descriptor's axis)
  // + dossier gate. 05D F0: GENERIC concentration — derived from the Affected set joined to
  // Restaurant, grouped by the descriptor's concentration_dim (no per-type filter; the Affected set
  // already encodes the type). dim is a CLOSED enum from the vetted registry ('zone'|'cuisine') and
  // is allowlist-checked before interpolation (defense-in-depth, never raw user SQL, §8).
  const dim = CONCENTRATION_DIMS[descriptor.concentration_dim];
  if (!dim) throw new Error(`runDiagnosis: unknown concentration_dim (fail-closed): ${descriptor.concentration_dim}`);
  const conc = (
    await query<{ value: string | null; n: number }>(
      `select r.${dim} as value, count(*)::int n
         from tenant."Affected" a
         join tenant."Restaurant" r on r.restaurant_id = a.restaurant_id
        where a.problem_id = $1
        group by r.${dim} order by n desc, value limit 1`,
      [problemId],
    )
  )[0];
  const route = routeStub(cls.areaType);
  await query(
    `update tenant."Diagnosed_Problem"
        set suggested_route = $2,
            provenance_by_field = provenance_by_field || jsonb_build_object('suggested_route','[C]')
      where problem_id = $1 and tenant_id = $3`,
    [problemId, route, tenantId],
  );
  await upsertCaseRepo(problemId, {
    where_concentrated: conc ? { dim: descriptor.concentration_dim, value: conc.value, n: conc.n } : null,
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
