import { z } from "zod";

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
export const reportProblemInput = z.object({
  restaurantId: z.string().min(1),
  conversationId: z.string().optional(),
  criticality: criticality.optional(),
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
