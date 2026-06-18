import { describe, it, expect } from "vitest";
import { financialAbort } from "../financial_abort.js";

// antifracThreshold supplied by caller reading Config_Knobs by name (CLAUDE.md §3.8)
const THRESHOLD = 1000;

const base = {
  financialClass: "indirect",
  autonomous: false,
  windowSum: 0,
  newAmount: 100,
};

describe("financialAbort — 05A:A.5.3 (financial abort gate, hard-no + anti-frac, 04 §7)", () => {
  // --- hard-no: direct + autonomous ---
  it("direct + autonomous ⇒ abort 'direct_no_auto'", () => {
    const r = financialAbort(
      { financialClass: "direct", autonomous: true, windowSum: 0, newAmount: 100 },
      THRESHOLD,
    );
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("direct_no_auto");
  });

  // --- direct + NOT autonomous: human proposes ⇒ no direct_no_auto; antifrac still applies ---
  it("direct + NOT autonomous + under threshold ⇒ {abort:false,'none'}", () => {
    const r = financialAbort(
      { financialClass: "direct", autonomous: false, windowSum: 0, newAmount: 100 },
      THRESHOLD,
    );
    expect(r.abort).toBe(false);
    expect(r.reason).toBe("none");
  });

  it("direct + NOT autonomous + over threshold ⇒ abort 'antifrac'", () => {
    const r = financialAbort(
      { financialClass: "direct", autonomous: false, windowSum: 900, newAmount: 200 },
      THRESHOLD,
    );
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("antifrac");
  });

  // --- direct + autonomous + also over threshold: direct_no_auto takes precedence ---
  it("direct + autonomous + over threshold ⇒ reason is 'direct_no_auto' (hard-no checked first)", () => {
    const r = financialAbort(
      { financialClass: "direct", autonomous: true, windowSum: 900, newAmount: 200 },
      THRESHOLD,
    );
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("direct_no_auto");
  });

  // --- antifrac: indirect ---
  it("indirect + sum+new > threshold ⇒ abort 'antifrac'", () => {
    const r = financialAbort(
      { financialClass: "indirect", autonomous: true, windowSum: 900, newAmount: 200 },
      THRESHOLD,
    );
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("antifrac");
  });

  it("indirect + sum+new === threshold (boundary) ⇒ {abort:false,'none'}", () => {
    const r = financialAbort(
      { financialClass: "indirect", autonomous: true, windowSum: 900, newAmount: 100 },
      THRESHOLD,
    );
    expect(r.abort).toBe(false);
    expect(r.reason).toBe("none");
  });

  it("indirect + sum+new < threshold ⇒ {abort:false,'none'}", () => {
    const r = financialAbort(
      { financialClass: "indirect", autonomous: false, windowSum: 0, newAmount: 100 },
      THRESHOLD,
    );
    expect(r.abort).toBe(false);
    expect(r.reason).toBe("none");
  });

  // --- fail-closed ---
  it("null ctx ⇒ abort 'fail_closed'", () => {
    const r = financialAbort(null, THRESHOLD);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  it("undefined ctx ⇒ abort 'fail_closed'", () => {
    const r = financialAbort(undefined, THRESHOLD);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  it("NaN antifracThreshold ⇒ abort 'fail_closed'", () => {
    const r = financialAbort(base, NaN);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  it("negative antifracThreshold ⇒ abort 'fail_closed'", () => {
    const r = financialAbort(base, -1);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  it("zero antifracThreshold ⇒ abort 'fail_closed' (nonsensical threshold)", () => {
    const r = financialAbort(base, 0);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  it("NaN windowSum ⇒ abort 'fail_closed'", () => {
    const r = financialAbort({ ...base, windowSum: NaN }, THRESHOLD);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  it("NaN newAmount ⇒ abort 'fail_closed'", () => {
    const r = financialAbort({ ...base, newAmount: NaN }, THRESHOLD);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  it("negative newAmount ⇒ abort 'fail_closed' (garbage input)", () => {
    const r = financialAbort({ ...base, newAmount: -1 }, THRESHOLD);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  it("negative windowSum ⇒ abort 'fail_closed' (garbage input)", () => {
    const r = financialAbort({ ...base, windowSum: -1 }, THRESHOLD);
    expect(r.abort).toBe(true);
    expect(r.reason).toBe("fail_closed");
  });

  // --- determinism ---
  it("deterministic: same input twice ⇒ identical output", () => {
    const ctx = { financialClass: "indirect", autonomous: true, windowSum: 500, newAmount: 200 };
    expect(financialAbort(ctx, THRESHOLD)).toEqual(financialAbort(ctx, THRESHOLD));
  });
});
