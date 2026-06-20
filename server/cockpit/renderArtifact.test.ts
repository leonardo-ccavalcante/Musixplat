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
