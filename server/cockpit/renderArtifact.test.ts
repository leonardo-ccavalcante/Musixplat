import { describe, expect, it } from "vitest";
import { renderArtifact, ARTIFACT_KIND } from "./renderArtifact";

describe("02:1a renderArtifact — deterministic message, quotes produced fields in units (§14, no LLM)", () => {
  it("maps action to a kind and builds a readable message from the proposal + path + playbook", () => {
    const a = renderArtifact({
      action_type: "A3",
      action_label: "Propose promo/bonus",
      cohort_id: "long_tail · 0-3m",
      root_cause: "price percentile high",
      before_after_expected: { dimension: "price_pctile_in_cohort", measured: 82, standard: 60, gap: 22 },
      playbook: "1) Draft an offer. 2) A human releases the money.",
    });
    expect(a.artifact_kind).toBe(ARTIFACT_KIND.A3); // "email_offer"
    expect(a.content.title).toBe("Propose promo/bonus · long_tail · 0-3m");
    // evidence uses the dimension's unit (percentile) + human label
    expect(a.content.evidence).toBe("Price percentile vs peers 82 pctile vs 60 pctile standard · gap +22 pts");
    // body is the real outgoing message: it quotes the measured why and the playbook steps
    expect(a.content.body).toContain("What we measured: Price percentile vs peers 82 pctile");
    expect(a.content.body).toContain("A human releases the money");
    expect(a.content.body).toContain("cohort long_tail · 0-3m");
  });

  it("formats a rate as a % with no false precision (§3.6/§3.10)", () => {
    const a = renderArtifact({
      action_type: "A7",
      action_label: "Investigate fraud/risk",
      cohort_id: "c",
      root_cause: null,
      before_after_expected: { dimension: "cancel_by_customer", measured: 0.0833333333, standard: 0.05, gap: 0.0333333333 },
      playbook: null,
    });
    expect(a.content.evidence).toBe("Customer-cancel rate 8.3% vs 5% standard · gap +3.3 pts");
    expect(a.content.body).not.toMatch(/0\.0833333/); // no raw floats leak into the message
  });

  it("unknown action ⇒ generic memo kind, never throws; falls back to conservative prose", () => {
    const a = renderArtifact({
      action_type: "Z9",
      action_label: null,
      cohort_id: "c",
      root_cause: null,
      before_after_expected: null,
      playbook: null,
    });
    expect(a.artifact_kind).toBe(ARTIFACT_KIND.default); // "ops_memo"
    expect(a.content.title).toBe("Z9 · c");
    expect(a.content.evidence).toBe("No attributable cause.");
    expect(a.content.body).toContain("Review with your account team");
  });
});
