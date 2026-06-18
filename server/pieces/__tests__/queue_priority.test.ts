import { describe, it, expect } from "vitest";
import { queuePriority } from "../queue_priority.js";

// Piece 05A:A.4.7 — queue priority from spike signal. (04 §3)
// umbral=10 is the caller-supplied threshold (read by-name from Config_Perillas upstream).
const UMBRAL = 10;

describe("queuePriority — 05A:A.4.7 (deterministic, fail-closed, tier-isolated)", () => {
  // --- boolean spike path ---
  it("spike:true ⇒ ALTA", () => {
    expect(queuePriority({ spike: true }).prioridad_cola).toBe("ALTA");
  });

  it("spike:false ⇒ NORMAL", () => {
    expect(queuePriority({ spike: false }).prioridad_cola).toBe("NORMAL");
  });

  // --- numeric intensity path ---
  it("intensidad above umbral ⇒ ALTA", () => {
    expect(queuePriority({ intensidad: 11 }, UMBRAL).prioridad_cola).toBe("ALTA");
  });

  it("intensidad exactly at umbral ⇒ ALTA (boundary inclusive)", () => {
    expect(queuePriority({ intensidad: 10 }, UMBRAL).prioridad_cola).toBe("ALTA");
  });

  it("intensidad below umbral ⇒ NORMAL", () => {
    expect(queuePriority({ intensidad: 9 }, UMBRAL).prioridad_cola).toBe("NORMAL");
  });

  // --- fail-closed: missing / garbage signal ---
  it("null signal ⇒ NORMAL (fail-closed, non-disruptive default)", () => {
    expect(queuePriority(null).prioridad_cola).toBe("NORMAL");
  });

  it("undefined signal ⇒ NORMAL (fail-closed)", () => {
    expect(queuePriority(undefined).prioridad_cola).toBe("NORMAL");
  });

  it("empty object signal (no spike, no intensidad) ⇒ NORMAL (fail-closed)", () => {
    expect(queuePriority({}).prioridad_cola).toBe("NORMAL");
  });

  it("intensidad present but umbral missing ⇒ NORMAL (fail-closed: cannot evaluate without threshold)", () => {
    expect(queuePriority({ intensidad: 999 }).prioridad_cola).toBe("NORMAL");
  });

  it("intensidad NaN ⇒ NORMAL (fail-closed: garbage input)", () => {
    expect(queuePriority({ intensidad: NaN }, UMBRAL).prioridad_cola).toBe("NORMAL");
  });

  it("umbral NaN ⇒ NORMAL (fail-closed: garbage threshold)", () => {
    expect(queuePriority({ intensidad: 99 }, NaN).prioridad_cola).toBe("NORMAL");
  });

  // --- CRITICAL isolation invariant: output must NEVER carry tier/nivel ---
  it("output has NO 'nivel', 'tier', or 'nivel_efectivo' key (tier isolation, §3 invariant)", () => {
    const keys = Object.keys(queuePriority({ spike: true }));
    expect(keys).not.toContain("nivel");
    expect(keys).not.toContain("tier");
    expect(keys).not.toContain("nivel_efectivo");
    expect(keys).toEqual(["prioridad_cola"]);
  });

  // --- determinism ---
  it("deterministic: same input twice ⇒ identical output", () => {
    const sig = { intensidad: 15 };
    expect(queuePriority(sig, UMBRAL)).toEqual(queuePriority(sig, UMBRAL));
  });
});
