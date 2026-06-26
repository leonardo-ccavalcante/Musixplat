import { z } from "zod";
import { PROBLEM_TYPES } from "./problem_types.js";

// 05B Diagnosis — shared tRPC io + domain types (Zod v3, CLAUDE.md §1). Domain vocab native.
// Piece-specific types live inside each server/diagnosis/* module; this file holds only the
// cross-cutting enums + the orchestrator input/row shapes that the router and many pieces share.

// Criticality: ordered (critical > moderate > low). critical ⇒ "now" (BR-B11). String-backed, but the
// ORDER is encoded in CRITICALITY_RANK so a number never depends on alphabetical sort.
export const criticality = z.enum(["critical", "moderate", "low"]);
export type Criticality = z.infer<typeof criticality>;
export const CRITICALITY_RANK: Record<Criticality, number> = { critical: 3, moderate: 2, low: 1 };

// Route: the 5 destinations (BR-B6.1). Closed set.
export const route = z.enum([
  "act_fast",
  "hand_to_team",
  "prototype_test",
  "fix_internal",
  "monitor_with_trigger",
]);
export type Route = z.infer<typeof route>;

// Proactive communication (BR-B13): the configured policy, and the resolved decision.
export const communicationPolicy = z.enum(["notify", "fix_silently"]);
export type CommunicationPolicy = z.infer<typeof communicationPolicy>;
export type CommunicationDecision = "notify" | "do_not_notify";

// reportProblem input (US-B1.1.1 gate + B.1.3 dedup). NO tenant_id — resolved server-side from
// the session (anti-spoofing, §7). restaurant_id is DATA within the pool (required, not the
// frontier). criticality is an optional trigger hint.
// 05D F0: problem_type selects the descriptor the engine dispatches on (default 'payment' ⇒ the
// shipped path is unchanged); segment is the optional slicing axis (Restaurant.segment). Both are
// classification INPUT (DATA, not a §14 result number).
export const reportProblemInput = z.object({
  restaurantId: z.string().min(1),
  conversationId: z.string().optional(),
  criticality: criticality.optional(),
  problem_type: z.string().default("payment"),
  segment: z.string().nullish(),
});
export type ReportProblemInput = z.infer<typeof reportProblemInput>;

// Diagnosed_Problem row shape (snake_case = DB). RESULT columns are null pre-producer (§14).
export interface ProblemRow {
  problem_id: string;
  tenant_id: string;
  restaurant_id: string;
  conversation_id: string | null;
  criticality: string | null;
  status: string;
  frequency: number;
  area_type: string | null;
  hypothesis_root: string | null;
  confidence: string | null;
  revenue_lost: string | null;
  churn_risk: string | null;
  cost_to_resolve: string | null;
  value_gained: string | null;
  suggested_route: string | null;
  silent_status: string | null;
  first_seen_ts: string;
  last_seen_ts: string | null;
}

export const reportProblemResult = z.object({
  problem_id: z.string(),
  status: z.string(),
  frequency: z.number(),
  created: z.boolean(),
});
export type ReportProblemResult = z.infer<typeof reportProblemResult>;

// ─── 05B read surface (diagnosis.list + diagnosis.getDossier) ───────────────────────────────────
// origin distinguishes the two flows: a reactive case carries the episode (conversation_id), a
// proactive case (caught by the monitor BEFORE a ticket) has none.
export type DiagnosisOrigin = "reactive" | "proactive";

// One row of the diagnosis board (numbers READ from the producers, never recomputed). affected/silent
// are live counts of Affected; revenue_lost is the Named_Query output. silentStatus = not_evaluable when
// the population is unobservable (BR-B4 fail-closed). needsHuman ⇒ status degraded/blocked (BR-B3).
export interface DiagnosisListRow {
  problem_id: string;
  restaurant_id: string;
  status: string;
  origin: DiagnosisOrigin;
  needs_human: boolean;
  criticality: string | null;
  area_type: string | null;
  hypothesis_root: string | null;
  confidence: number | null;
  affected: number;
  silent: number;
  silent_status: string | null;
  revenue_lost: number | null;
  suggested_route: string | null;
  frequency: number;
  first_seen_ts: string;
}

// getDossier input — problemId is DATA within the pool; tenant is resolved server-side (anti-spoofing §7).
export const getDossierInput = z.object({ problemId: z.string().min(1) });
export type GetDossierInput = z.infer<typeof getDossierInput>;

// run (Gate 1 operability) — the product triggers the orchestrator for one problem. problemId is DATA
// within the pool; tenant resolved server-side (anti-spoofing §7). Idempotent (orchestrator UPDATE-only
// + fn_hunt_silent ON CONFLICT DO NOTHING).
export const runDiagnosisInput = z.object({ problemId: z.string().min(1) });
export type RunDiagnosisInput = z.infer<typeof runDiagnosisInput>;
// Result the UI needs to render the run outcome (numbers PRODUCED by the orchestrator, never seeded).
export interface RunDiagnosisResult {
  problem_id: string;
  area_type: string;
  confidence: number | null; // classifier inference [C]; NULL on the proactive/typed path (none ran)
  degraded: boolean;
  affected: number | null; // NULL when unmeasurable (a live type with no bound producer) — never a fake 0 (§14)
  silent: number | null;
  silent_status: string;
  revenue_lost: number | null;
  route: string;
  dossier_emitted: boolean;
  dossier_gaps: string[];
}

// 05D L3 — teach a NEW (live) problem type at runtime. The operator owns the FRAME (area / concentration /
// hypotheses / label / routing); measured_by binds the MEASUREMENT to an existing vetted producer, or null
// ⇒ unmeasurable (the engine degrades-to-human). slug is a lowercase dispatch key (no spaces/SQL). All
// fields are INPUT/config — never a produced number (§14).
export const defineTypeInput = z.object({
  problem_type: z.string().regex(/^[a-z][a-z0-9_]{1,48}$/, "lowercase slug: a-z, 0-9, _ (2-49 chars)"),
  label: z.string().trim().min(1).max(100),
  area_type: z.enum(["finance", "performance", "product", "operations"]),
  concentration_dim: z.enum(["zone", "cuisine"]),
  // single source for the builtin allowlist = PROBLEM_TYPES (never a re-hardcoded list). null = unmeasurable.
  measured_by: z
    .string()
    .nullable()
    .refine((v) => v === null || Object.prototype.hasOwnProperty.call(PROBLEM_TYPES, v), {
      message: "measured_by must be a known builtin producer or null",
    }),
  hypotheses: z.array(z.string().trim().min(1).max(200)).min(1).max(10),
});
export type DefineTypeInput = z.infer<typeof defineTypeInput>;
export interface DefineTypeResult {
  problem_type: string;
  measurable: boolean; // false ⇒ no bound producer ⇒ the engine will degrade-to-human (§14)
}

// getKnowledgeCase — the dossier's "similar cases" links open these KB precedents (BR-B3 grounding).
export const getKnowledgeCaseInput = z.object({ kbCaseId: z.string().min(1) });
export type GetKnowledgeCaseInput = z.infer<typeof getKnowledgeCaseInput>;
export interface KnowledgeCaseView {
  kb_case_id: string;
  area_type: string;
  pattern: string | null;
  outcome: string | null;
  resolution: string | null;
  not_resolved_reason: string | null;
  probability: number | null;
  discarded_branches: unknown;
  created_at: string;
}

// 05D Part C — human decision console. The operator confirms/overrides the area and writes the WHY for a
// needs_human case. Areas = the classifier's closed set (reasoning.ts ALLOWED_AREAS); a free area is rejected
// (fail-closed). rationale is required short [C] text. tenant + ownership resolved server-side (§7).
export const decisionArea = z.enum(["finance", "product", "performance", "operations", "unclassified"]);
export type DecisionArea = z.infer<typeof decisionArea>;
export const DECISION_AREAS = decisionArea.options;
export const decideDiagnosisInput = z.object({
  problemId: z.string().min(1),
  areaType: decisionArea,
  rationale: z.string().trim().min(3).max(500),
});
export type DecideDiagnosisInput = z.infer<typeof decideDiagnosisInput>;
export interface DecideDiagnosisResult {
  ok: boolean;
  kbCaseId: string;
}

// 05D Part C — decision #2 audit: what the Part D re-measurement auto-approved (verification_status=
// 'verified_fixed'), so the human has visibility of the autonomous verifications. Read-only, tenant-scoped.
export interface RecentlyVerifiedRow {
  kb_case_id: string;
  area_type: string;
  pattern: string | null;
  resolution: string | null;
  created_at: string;
}
