import { describe, expect, it } from "vitest";
import { renderArtifact, ARTIFACT_KIND } from "./renderArtifact";

describe("02:1a renderArtifact — deterministic, quotes produced fields (§14, no LLM)", () => {
  it("maps action to a kind and renders a body from the proposal + path", () => {
    const a = renderArtifact({
      action_type: "A3",
      action_label: "Propose promo/bonus",
      cohort_id: "long_tail · 0-3m",
      root_cause: "price percentile high",
      before_after_expected: { dimension: "price_pctile", measured: 82, standard: 60, gap: 22 },
      playbook: "AI proposes promo; human releases the money",
    });
    expect(a.artifact_kind).toBe(ARTIFACT_KIND.A3); // "email_offer"
    expect(a.content.action).toBe("Propose promo/bonus");
    expect(a.content.cohort).toBe("long_tail · 0-3m");
    expect(a.content.path).toMatch(/price_pctile/);
    expect(a.content.path).toMatch(/82 → 60/);
    expect(a.content.how).toMatch(/human releases the money/);
  });

  it("rounds path floats to 2 decimals (no false precision, §3.6/§3.10)", () => {
    const a = renderArtifact({
      action_type: "A7",
      action_label: "Investigate fraud/risk",
      cohort_id: "c",
      root_cause: null,
      before_after_expected: { dimension: "cancel_by_customer", measured: 0.0833333333, standard: 0.05, gap: 0.0333333333 },
      playbook: null,
    });
    expect(a.content.path).toBe("cancel_by_customer: 0.08 → 0.05 · gap 0.03");
  });

  it("unknown action ⇒ generic memo kind, never throws", () => {
    const a = renderArtifact({
      action_type: "Z9",
      action_label: null,
      cohort_id: "c",
      root_cause: null,
      before_after_expected: null,
      playbook: null,
    });
    expect(a.artifact_kind).toBe(ARTIFACT_KIND.default); // "ops_memo"
    expect(a.content.action).toBe("Z9");
    expect(a.content.root).toBe("no attributable cause");
    expect(a.content.path).toBe("no projected path");
  });
});
