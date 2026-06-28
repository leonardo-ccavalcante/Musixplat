import { describe, expect, it } from "vitest";
import { INTENT_CATALOG, cohortOptionLabel, csvTemplate, parseGoldenCsv } from "./evalCoachFormat";

// EPIC-B4 coach onboarding — the operator complained the golden-set upload "didn't explain what to upload,
// in what format, with examples, and wouldn't let me upload anything". These pure helpers are the format
// contract: a self-explanatory CSV (legend embedded so it reads in Excel) + a lenient parser. Membership /
// duplicate / cross-pool integrity stays the server's fail-closed job (eval.authorFromTemplate), not here.

describe("eval coach format helpers", () => {
  it("INTENT_CATALOG mirrors the 7 seed intents (closed catalog) with human labels", () => {
    expect(INTENT_CATALOG.map((i) => i.intent_id)).toEqual([
      "billing",
      "delivery",
      "quality",
      "promo",
      "menu",
      "order_review",
      "cancellation",
    ]);
    expect(INTENT_CATALOG.find((i) => i.intent_id === "cancellation")?.label).toMatch(/cancel/i);
  });

  it("csvTemplate is self-explanatory: a comment legend, the header, and one empty-label row per member", () => {
    const csv = csvTemplate(["R1", "R2"], ["A1 — Increase connection", "A8 — Observation (no action)"]);
    expect(csv).toMatch(/^#/m); // carries a commented legend so it explains itself in a spreadsheet
    expect(csv).toContain("A1 — Increase connection");
    expect(csv).toContain("A8 — Observation (no action)");
    expect(csv).toContain("restaurant_id,correct_label"); // the machine header
    expect(csv).toContain("R1,"); // member row, label left blank for the operator
    expect(csv).toContain("R2,");
  });

  it("parseGoldenCsv ignores the legend/comments + header and keeps valid A1..A8 (case-insensitive)", () => {
    const filled = csvTemplate(["R1", "R2", "R3"], ["A1 — x"])
      .replace("R1,", "R1,A4")
      .replace("R2,", "R2,a8") // lowercase tolerated
      .replace("R3,", "R3,Z9"); // invalid code dropped (fail-closed: never invent a label)
    expect(parseGoldenCsv(filled)).toEqual([
      { restaurantId: "R1", correctLabel: "A4" },
      { restaurantId: "R2", correctLabel: "A8" },
    ]);
  });

  it("an un-filled template parses to zero rows — the operator MUST label first (no silent blanks)", () => {
    expect(parseGoldenCsv(csvTemplate(["R1", "R2"], ["A1 — x"]))).toEqual([]);
  });

  it("cohortOptionLabel prefers human descriptors, falls back to the opaque id", () => {
    expect(cohortOptionLabel({ cohort_id: "c1", cuisine: "pizza", zone: "north", tier_base: "long_tail" })).toBe(
      "pizza · north · long_tail",
    );
    expect(cohortOptionLabel({ cohort_id: "c1", cuisine: null, zone: null, tier_base: null })).toBe("c1");
  });
});
