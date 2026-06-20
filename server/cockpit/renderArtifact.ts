// 02:1a — deterministic render of a released NBA into a dispatchable artifact. Quotes the proposal's
// PRODUCED fields + the NBA_Catalogo playbook for the action; never invents a number (§14, mirrors
// server/artifact/generateFromDossier.ts). NO LLM (server/_core/llm.ts is not on this branch).
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
  content: { action: string; cohort: string; root: string; path: string; how: string };
}

// Display rounding (mirrors lib/utils fmtNum): at most 2 decimals, no false precision (§3.6/§3.10).
const fmt = (n: number): string => Number(n.toFixed(2)).toString();

// One human-readable evidence line from the [C] projection; numbers are quoted (rounded), never computed.
function pathText(j: unknown): string {
  if (j && typeof j === "object") {
    const o = j as { dimension?: unknown; measured?: unknown; standard?: unknown; gap?: unknown };
    if (typeof o.dimension === "string" && typeof o.measured === "number" && typeof o.standard === "number") {
      const gap = typeof o.gap === "number" ? ` · gap ${fmt(o.gap)}` : "";
      return `${o.dimension}: ${fmt(o.measured)} → ${fmt(o.standard)}${gap}`;
    }
  }
  return "no projected path";
}

export function renderArtifact(i: RenderInput): RenderedArtifact {
  const code = (i.action_type ?? "").toUpperCase();
  const kind = (ARTIFACT_KIND as Record<string, string>)[code] ?? ARTIFACT_KIND.default;
  return {
    artifact_kind: kind,
    content: {
      action: i.action_label ?? i.action_type ?? "—",
      cohort: i.cohort_id,
      root: i.root_cause ?? "no attributable cause",
      path: pathText(i.before_after_expected),
      how: i.playbook ?? "—",
    },
  };
}
