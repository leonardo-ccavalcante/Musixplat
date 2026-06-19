import { z } from "zod";

// 05C Artifact wedge — shared tRPC io + row shape (Zod v3, CLAUDE.md §1). problemId is DATA within the
// pool; tenant resolved server-side (anti-spoofing §7).
export const generateArtifactInput = z.object({ problemId: z.string().min(1) });
export type GenerateArtifactInput = z.infer<typeof generateArtifactInput>;

// generate outcome: a persisted artifact, OR a fail-closed reason (no row written).
export type GenerateArtifactResult =
  | { status: "generated"; artifact_id: string; artifact_type: string; target_metric: string }
  | { status: "incomplete_dossier"; gaps: string[] }
  | { status: "missing_how" };

// Artifact decision (Gate 4 human gate) — approve/reject/escalate, recorded with a Decision_Trace.
export const artifactDecisionInput = z.object({
  artifactId: z.string().min(1),
  action: z.enum(["approve", "reject", "escalate"]),
});
export type ArtifactDecisionInput = z.infer<typeof artifactDecisionInput>;
export interface ArtifactDecisionResult {
  artifact_id: string;
  status: string;
  trace_id: string;
}

// One artifact row for the read surface / human queue.
export interface ArtifactRow {
  artifact_id: string;
  problem_id: string;
  artifact_type: string;
  target_metric: string;
  status: string;
  content: unknown;
  decision_trace_id: string | null;
  created_at: string;
}
