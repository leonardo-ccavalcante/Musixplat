import { describe, it, expect } from "vitest";
import { antiRubberStamp } from "../anti_rubber_stamp.js";

// pisoRejection is read by-name from Config_Knobs by the caller; we supply it here.
const PISO = 0.05;

describe("antiRubberStamp — 05A:A.7.4b (4-eyes independence + rejection→0 alarm, fail-closed §7)", () => {
  it("independent + rejectionRate > floor ⇒ {valid:true, alarm:false, reason:'ok'}", () => {
    const r = antiRubberStamp(
      { proponenteId: "user-A", confirmadorId: "user-B", rejectionRate: 0.2 },
      PISO
    );
    expect(r).toEqual({ valid: true, alarm: false, reason: "ok" });
  });

  it("independent + rejectionRate === 0 (< floor) ⇒ {valid:true, alarm:true, reason:'rubber_stamp'}", () => {
    const r = antiRubberStamp(
      { proponenteId: "user-A", confirmadorId: "user-B", rejectionRate: 0.0 },
      PISO
    );
    expect(r).toEqual({ valid: true, alarm: true, reason: "rubber_stamp" });
  });

  it("independent + rejectionRate === floor ⇒ alarm (boundary: <= floor triggers alarm)", () => {
    // [ASSUMPTION] rejectionRate == floor is treated as alarm (≤ floor ⇒ rubber_stamp). Rate at
    // the floor is indistinguishable from collapse; strict '>' is the safe direction (§3.7).
    const r = antiRubberStamp(
      { proponenteId: "user-A", confirmadorId: "user-B", rejectionRate: PISO },
      PISO
    );
    expect(r).toEqual({ valid: true, alarm: true, reason: "rubber_stamp" });
  });

  it("confirmadorId === proponenteId ⇒ {valid:false, alarm:false, reason:'not_independent'}", () => {
    const r = antiRubberStamp(
      { proponenteId: "user-A", confirmadorId: "user-A", rejectionRate: 0.3 },
      PISO
    );
    expect(r).toEqual({ valid: false, alarm: false, reason: "not_independent" });
  });

  it("confirmadorId null ⇒ {valid:false, alarm:false, reason:'no_confirmer'} (fail-closed — unconfirmed ≠ valid)", () => {
    const r = antiRubberStamp(
      { proponenteId: "user-A", confirmadorId: null, rejectionRate: 0.3 },
      PISO
    );
    expect(r).toEqual({ valid: false, alarm: false, reason: "no_confirmer" });
  });

  it("null event ⇒ fail_closed", () => {
    const r = antiRubberStamp(null, PISO);
    expect(r).toEqual({ valid: false, alarm: false, reason: "fail_closed" });
  });

  it("undefined event ⇒ fail_closed", () => {
    const r = antiRubberStamp(undefined, PISO);
    expect(r).toEqual({ valid: false, alarm: false, reason: "fail_closed" });
  });

  it("NaN pisoRejection ⇒ fail_closed (threshold corrupt ⇒ conservative state)", () => {
    const r = antiRubberStamp(
      { proponenteId: "user-A", confirmadorId: "user-B", rejectionRate: 0.2 },
      NaN
    );
    expect(r).toEqual({ valid: false, alarm: false, reason: "fail_closed" });
  });

  it("negative pisoRejection ⇒ fail_closed", () => {
    const r = antiRubberStamp(
      { proponenteId: "user-A", confirmadorId: "user-B", rejectionRate: 0.2 },
      -0.01
    );
    expect(r).toEqual({ valid: false, alarm: false, reason: "fail_closed" });
  });

  it("rejectionRate NaN (garbage input) ⇒ fail_closed", () => {
    const r = antiRubberStamp(
      { proponenteId: "user-A", confirmadorId: "user-B", rejectionRate: NaN },
      PISO
    );
    expect(r).toEqual({ valid: false, alarm: false, reason: "fail_closed" });
  });

  it("rejectionRate > 1 (out-of-range) ⇒ fail_closed", () => {
    const r = antiRubberStamp(
      { proponenteId: "user-A", confirmadorId: "user-B", rejectionRate: 1.1 },
      PISO
    );
    expect(r).toEqual({ valid: false, alarm: false, reason: "fail_closed" });
  });

  it("rejectionRate < 0 (out-of-range) ⇒ fail_closed", () => {
    const r = antiRubberStamp(
      { proponenteId: "user-A", confirmadorId: "user-B", rejectionRate: -0.1 },
      PISO
    );
    expect(r).toEqual({ valid: false, alarm: false, reason: "fail_closed" });
  });

  it("deterministic: same input twice ⇒ identical output", () => {
    const event = { proponenteId: "user-A", confirmadorId: "user-B", rejectionRate: 0.1 };
    expect(antiRubberStamp(event, PISO)).toEqual(antiRubberStamp(event, PISO));
  });
});
