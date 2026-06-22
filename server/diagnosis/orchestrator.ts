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
  brainAgreement,
  conversationText,
  type DiagnosisReasoning,
  type GroundingCase,
  type RankedPath,
} from "./reasoning.js";
import { searchKnowledge } from "../knowledge/store.js";
import type { Embedder } from "../knowledge/embedder.js";
import type { Criticality } from "../../shared/contracts_05b.js";
import { getDescriptor } from "../../shared/problem_types.js";
import { redactPII } from "../pieces/pii.js";

// Deterministic candidate hypotheses per area (seed set; the provider only RANKS these, §8).
const HYPOTHESES: Record<string, string[]> = {
  finance: ["payment was not executed", "refund dispute concentrated", "balance mismatch"],
  product: ["feature adoption dropped", "product defect"],
  performance: ["latency / connection window"],
  operations: ["restaurant rejecting orders (out of stock / closed)", "kitchen overload at peak hours", "menu availability not synced"],
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
  confidence: number | null; // a classifier inference [C]; NULL on the proactive/typed path (none ran)
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
  reasoning: DiagnosisReasoning | (() => Promise<DiagnosisReasoning>) = deterministicReasoning,
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

  // B.2 classify + B.3 rank — TWO honest modes (05D descriptor-refactor):
  //  • REACTIVE (a Conversation exists): the AGENTE blind-classifies the episode text (§8) — it infers
  //    the area from what the customer actually said, INDEPENDENT of the type label, and degrades to
  //    human when it cannot read it (BR-B3 net, e.g. an unclassifiable intent). The blind area drives
  //    the area-keyed hypotheses seed. UNCHANGED.
  //  • PROACTIVE/typed (no Conversation): there is nothing to blind-read, so the REGISTERED descriptor
  //    is authoritative — its area drives the pipeline directly (no synthetic-string round-trip through
  //    the classifier). This makes L3 (a LIVE-taught type) work with zero vocab change and never weakens
  //    the reactive net. Fail-closed still holds: an unknown type RAISED at getDescriptor above; a
  //    provider failure degrades in the catch below.
  // Any PROVIDER failure (off-contract output, set-equality violation, empty rank) is fail-closed to
  // needs_human (BR-B3 / §3.7) in the catch — never left 'open', never a guess. The NUMBER is SQL (§14).
  let cls: { areaType: string; confidence: number | null };
  let degraded: boolean;
  let ranked: RankedPath[];
  // rank seed: reactive follows the BLIND area (area-keyed map); proactive/typed follows the type's own
  // descriptor.hypotheses (richer + the seed L3 needs — a live type carries its own candidate causes).
  let rankSeed: string[];
  let reactiveText: string | null = null; // episode text, kept for the B.6.5 KB-search fallback only
  try {
    // Resolve the provider INSIDE the fail-closed boundary (Codex P1): a construction failure — e.g. a
    // missing prod key throwing in diagnosisReasoning — is caught below ⇒ the case degrades to needs_human,
    // never left 'open'. Callers pass a factory (() => diagnosisReasoning(...)); tests inject a value directly.
    const provider = typeof reasoning === "function" ? await reasoning() : reasoning;
    if (prob.conversation_id) {
      // 05D Part A — the brains must read what the CUSTOMER ACTUALLY SAID (`turnos`, the real chat), not the
      // coarse `intent` label (Codex P1). turnos can be UNREDACTED (conversation.recv persists raw input), so
      // REDACT before any external send — Brain 2 (LLM classify) and the B.6.5 KB embedding both leave the
      // system. Fail-closed (§3.7): if the independent residual net STILL finds PII after redaction, drop the
      // transcript and fall back to the coarse intent label (an enum — no free customer text) rather than leak.
      const ep = (
        await query<{ intent: string | null; turnos: unknown }>(
          `select intent, turnos from tenant."Conversation_Episode"
            where conversation_id = $1 and tenant_id = $2 limit 1`,
          [prob.conversation_id, tenantId],
        )
      )[0];
      const raw = conversationText(ep?.turnos);
      const red = raw ? redactPII(raw) : null;
      const text = red && !red.residualPII ? red.texto : (ep?.intent ?? "");
      reactiveText = text;
      guardInjection(text); // untrusted DATA (EC-B10); audit-only, never executes embedded instructions.
      const classifyExamples = await fetchGrounding(tenantId);
      // 05D Part A (02D + F3) — TWO independent brains on the SAME ticket text. Brain 2 = the injected
      // provider (real LLM+RAG in prod; reads what the customer actually said). Brain 1 = the deterministic
      // keyword FLOOR (always available, free). When the caller injects the deterministic provider (the CI /
      // hermetic default) the two brains ARE the same call ⇒ we skip the redundant classify and they always
      // agree (no network, no flake). brainAgreement keys on AREA only (Leo 2026-06-22): a categorical area
      // conflict ⇒ degrade-to-human; otherwise the case proceeds on the lead's read.
      const lead = await provider.classifyArea({ text, hint: prob.criticality, examples: classifyExamples });
      const floorBrain =
        provider === deterministicReasoning ? lead : await deterministicReasoning.classifyArea({ text });
      const gate = brainAgreement(floorBrain, lead);
      const floor = await knob("threshold_classification"); // seeded classify floor (§3.8, fail-closed)
      const kb = await query<{ n: number }>(
        `select count(*)::int n from tenant."Knowledge_Case" where tenant_id = $1 and area_type = $2`,
        [tenantId, gate.areaType],
      );
      // needs_human on EITHER a 2-brain area disagreement (Part A gate) OR the existing BR-B3 grounding
      // floor (low confidence + no KB precedent). Both route to the human console; never an optimistic
      // default (§7 fail-closed). The disagreement gate is ADDITIVE — it only ever ADDS a degrade.
      degraded = gate.disagreement || (gate.confidence < floor && (kb[0]?.n ?? 0) === 0);
      rankSeed = HYPOTHESES[gate.areaType] ?? ["unclassified hypothesis"];
      cls = { areaType: gate.areaType, confidence: gate.confidence };
    } else {
      // proactive/typed: descriptor authoritative. No classifyArea ran ⇒ confidence is NULL — we never
      // claim a classifier inference that did not occur (§3.6/§14 honesty, Codex P1); the area is the
      // registered type's, marked [C] config-derived. NOT degraded here: the type is KNOWN (not an
      // optimistic guess on unread input — the unknown-type case already RAISED at getDescriptor).
      // TODO(05D-F5/L3): a LIVE-taught type with NO backing data / no KB precedent must honestly
      // degrade-to-human ("can't measure yet", build-doc §C). Re-open that gate when defineType lands;
      // today only the 5 vetted builtins reach this branch, all with real producers.
      cls = { areaType: descriptor.area_type, confidence: null };
      degraded = false;
      rankSeed = descriptor.hypotheses;
    }
    await query(
      `update tenant."Diagnosed_Problem"
          set area_type = $2, confidence = $3,
              status = case when $4 then 'needs_human' else status end,
              provenance_by_field = provenance_by_field
                || jsonb_build_object('area_type','[C]','confidence','[C]')
        where problem_id = $1 and tenant_id = $5`,
      [problemId, cls.areaType, cls.confidence, degraded, tenantId],
    );

    // B.3 issue-tree: the provider only ORDERS the seed (set-equality §8). Grounded on reviewed cases
    // for the area: falsified branches get pushed lower.
    const rankExamples = await fetchGrounding(tenantId, cls.areaType);
    ranked = await provider.rankPaths({ areaType: cls.areaType, hypotheses: rankSeed, examples: rankExamples });
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
  if (!prob.conversation_id) {
    // proactive/typed: the consulted source is the descriptor's OWN evidence table (§3 provenance
    // honesty, Codex P2) — NOT a regex guess on the hypothesis text, which mis-resolves descriptor
    // phrasings (e.g. menu_quality's "menu items missing photos" → Conversation_Episode, a source
    // ABSENT for a proactive case; the real evidence is tenant.Order). affected.table is a vetted
    // registry value (no raw user SQL). Reactive keeps resolveSource (the blind hypothesis's source).
    top.source_consulted = `tenant.${descriptor.affected.table}`;
  }
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
    const kbHits = await searchKnowledge(tenantId, top.hypothesis ?? reactiveText ?? cls.areaType, undefined, embedder);
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
