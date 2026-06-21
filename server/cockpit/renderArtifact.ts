// 02:1a — deterministic render of a released NBA into a dispatchable artifact: a real, recipient-facing
// MESSAGE the operator reviews (and may edit) before Send. Quotes the proposal's PRODUCED fields + the
// NBA_Catalogo playbook; numbers are formatted by unit (rate→%, €) but never invented (§14, mirrors
// server/artifact/generateFromDossier.ts). The body text is built by the copy agent (server/cockpit/
// copywriter.ts) — deterministic here; dispatchDetail swaps in the restaurant-facing LLM copy on the live path.
import { evidenceLine, readSignal, fmtValue } from "../../shared/signalFormat.js";
import { deterministicCopy, type CopyInput } from "./copywriter.js";

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

// The facts both providers share. evidence + numbers come from the [V] diagnosis (formatted, never invented).
// numbers = the figures the LLM must quote verbatim (§14 number-preservation guard).
export function buildCopyInput(i: RenderInput): CopyInput {
  const actionLabel = i.action_label ?? i.action_type ?? "Recommended action";
  const evidence = evidenceLine(i.before_after_expected) ?? i.root_cause ?? "No attributable cause.";
  const playbook = i.playbook ?? "Review with your account team and decide the next step.";
  const s = readSignal(i.before_after_expected);
  const numbers = s ? [fmtValue(s.dimension, s.measured), fmtValue(s.dimension, s.standard)] : [];
  return { actionLabel, cohortId: i.cohort_id, evidence, playbook, numbers };
}

export function renderArtifact(i: RenderInput): RenderedArtifact {
  const code = (i.action_type ?? "").toUpperCase();
  const kind = (ARTIFACT_KIND as Record<string, string>)[code] ?? ARTIFACT_KIND.default;
  const ci = buildCopyInput(i);
  return {
    artifact_kind: kind,
    content: { title: `${ci.actionLabel} · ${ci.cohortId}`, evidence: ci.evidence, body: deterministicCopy(ci) },
  };
}
