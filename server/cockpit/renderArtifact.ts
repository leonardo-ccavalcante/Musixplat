// 02:1a — deterministic render of a released NBA into a dispatchable artifact: a real, recipient-facing
// MESSAGE the operator reviews (and may edit) before Send. Quotes the proposal's PRODUCED fields + the
// NBA_Catalogo playbook; numbers are formatted by unit (rate→%, €) but never invented (§14, mirrors
// server/artifact/generateFromDossier.ts). NO LLM (server/_core/llm.ts is not on this branch).
import { evidenceLine } from "../../shared/signalFormat.js";

export const ARTIFACT_KIND = {
  A1: "ops_memo",
  A2: "price_rec",
  A3: "email_offer",
  A4: "ops_memo",
  A5: "growth_brief",
  A6: "ops_ticket",
  A7: "risk_escalation",
  A8: "ops_memo",
  default: "ops_memo",
} as const;

export interface RenderInput {
  action_type: string | null;
  action_label: string | null;
  cohort_id: string;
  root_cause: string | null;
  before_after_expected: unknown;
  playbook: string | null;
}
export interface RenderedArtifact {
  artifact_kind: string;
  // title = heading; evidence = the measured "why" ([V], read-only); body = the editable message sent out.
  content: { title: string; evidence: string; body: string };
}

export function renderArtifact(i: RenderInput): RenderedArtifact {
  const code = (i.action_type ?? "").toUpperCase();
  const kind = (ARTIFACT_KIND as Record<string, string>)[code] ?? ARTIFACT_KIND.default;
  const action = i.action_label ?? i.action_type ?? "Recommended action";
  // The measured why, formatted in its natural unit; fall back to the proposal prose, then a conservative
  // default (never a fabricated number, §14).
  const evidence = evidenceLine(i.before_after_expected) ?? i.root_cause ?? "No attributable cause.";
  const steps = i.playbook ?? "Review with your account team and decide the next step.";
  const body = [
    `Re: ${action} — cohort ${i.cohort_id}.`,
    "",
    `What we measured: ${evidence}.`,
    "",
    "Recommended next steps:",
    steps,
  ].join("\n");
  return {
    artifact_kind: kind,
    content: { title: `${action} · ${i.cohort_id}`, evidence, body },
  };
}
