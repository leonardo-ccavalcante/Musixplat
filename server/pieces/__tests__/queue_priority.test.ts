import { describe, it, expect } from "vitest";
import { queuePriority } from "../queue_priority.js";

// Piece 05A:A.4.7 — queue priority from spike signal. (04 §3)
// threshold=10 is the caller-supplied threshold (read by-name from Config_Knobs upstream).
const UMBRAL = 10;

describe("queuePriority — 05A:A.4.7 (deterministic, fail-closed, tier-isolated)", () => {
  // --- boolean spike path ---
  it("spike:true ⇒ HIGH", () => {
    expect(queuePriority({ spike: true }).queue_priority).toBe("HIGH");
  });

  it("spike:false ⇒ NORMAL", () => {
    expect(queuePriority({ spike: false }).queue_priority).toBe("NORMAL");
  });

  // --- numeric intensity path ---
  it("intensity above threshold ⇒ HIGH", () => {
    expect(queuePriority({ intensity: 11 }, UMBRAL).queue_priority).toBe("HIGH");
  });

  it("intensity exactly at threshold ⇒ HIGH (boundary inclusive)", () => {
    expect(queuePriority({ intensity: 10 }, UMBRAL).queue_priority).toBe("HIGH");
  });

  it("intensity below threshold ⇒ NORMAL", () => {
    expect(queuePriority({ intensity: 9 }, UMBRAL).queue_priority).toBe("NORMAL");
  });

  // --- fail-closed: missing / garbage signal ---
  it("null signal ⇒ NORMAL (fail-closed, non-disruptive default)", () => {
    expect(queuePriority(null).queue_priority).toBe("NORMAL");
  });

  it("undefined signal ⇒ NORMAL (fail-closed)", () => {
    expect(queuePriority(undefined).queue_priority).toBe("NORMAL");
  });

  it("empty object signal (no spike, no intensity) ⇒ NORMAL (fail-closed)", () => {
    expect(queuePriority({}).queue_priority).toBe("NORMAL");
  });

  it("intensity present but threshold missing ⇒ NORMAL (fail-closed: cannot evaluate without threshold)", () => {
    expect(queuePriority({ intensity: 999 }).queue_priority).toBe("NORMAL");
  });

  it("intensity NaN ⇒ NORMAL (fail-closed: garbage input)", () => {
    expect(queuePriority({ intensity: NaN }, UMBRAL).queue_priority).toBe("NORMAL");
  });

  it("threshold NaN ⇒ NORMAL (fail-closed: garbage threshold)", () => {
    expect(queuePriority({ intensity: 99 }, NaN).queue_priority).toBe("NORMAL");
  });

  // --- CRITICAL isolation invariant: output must NEVER carry tier/level ---
  it("output has NO 'level', 'tier', or 'effective_level' key (tier isolation, §3 invariant)", () => {
    const keys = Object.keys(queuePriority({ spike: true }));
    expect(keys).not.toContain("level");
    expect(keys).not.toContain("tier");
    expect(keys).not.toContain("effective_level");
    expect(keys).toEqual(["queue_priority"]);
  });

  // --- determinism ---
  it("deterministic: same input twice ⇒ identical output", () => {
    const sig = { intensity: 15 };
    expect(queuePriority(sig, UMBRAL)).toEqual(queuePriority(sig, UMBRAL));
  });
});
