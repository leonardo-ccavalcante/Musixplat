import { describe, it, expect } from "vitest";
import { antiRubberStamp } from "../anti_rubber_stamp.js";

// rejectionFloor is read by-name from Config_Knobs by the caller; we supply it here.
const FLOOR = 0.05;

describe("antiRubberStamp — 05A:A.7.4b (4-eyes independence + rejection→0 alarm, fail-closed §7)", () => {
  it("independent + rejectionRate > floor ⇒ {valid:true, alarm:false, reason:'ok'}", () => {
    const r = antiRubberStamp(
      { proposerId: "user-A", confirmerId: "user-B", rejectionRate: 0.2 },
      FLOOR
    );
    expect(r).toEqual({ valid: true, alarm: false, reason: "ok" });
  });

  it("independent + rejectionRate === 0 (< floor) ⇒ {valid:true, alarm:true, reason:'rubber_stamp'}", () => {
    const r = antiRubberStamp(
      { proposerId: "user-A", confirmerId: "user-B", rejectionRate: 0.0 },
      FLOOR
    );
    expect(r).toEqual({ valid: true, alarm: true, reason: "rubber_stamp" });
  });

  it("independent + rejectionRate === floor ⇒ alarm (boundary: <= floor triggers alarm)", () => {
    // [ASSUMPTION] rejectionRate == floor is treated as alarm (≤ floor ⇒ rubber_stamp). Rate at
    // the floor is indistinguishable from collapse; strict '>' is the safe direction (§3.7).
    const r = antiRubberStamp(
      { proposerId: "user-A", confirmerId: "user-B", rejectionRate: FLOOR },
      FLOOR
    );
    expect(r).toEqual({ valid: true, alarm: true, reason: "rubber_stamp" });
  });

  it("confirmerId === proposerId ⇒ {valid:false, alarm:false, reason:'not_independent'}", () => {
    const r = antiRubberStamp(
      { proposerId: "user-A", confirmerId: "user-A", rejectionRate: 0.3 },
      FLOOR
    );
    expect(r).toEqual({ valid: false, alarm: false, reason: "not_independent" });
  });

  it("confirmerId null ⇒ {valid:false, alarm:false, reason:'no_confirmer'} (fail-closed — unconfirmed ≠ valid)", () => {
    const r = antiRubberStamp(
      { proposerId: "user-A", confirmerId: null, rejectionRate: 0.3 },
      FLOOR
    );
    expect(r).toEqual({ valid: false, alarm: false, reason: "no_confirmer" });
  });

  it("null event ⇒ fail_closed", () => {
    const r = antiRubberStamp(null, FLOOR);
    expect(r).toEqual({ valid: false, alarm: false, reason: "fail_closed" });
  });

  it("undefined event ⇒ fail_closed", () => {
    const r = antiRubberStamp(undefined, FLOOR);
    expect(r).toEqual({ valid: false, alarm: false, reason: "fail_closed" });
  });

  it("NaN rejectionFloor ⇒ fail_closed (threshold corrupt ⇒ conservative state)", () => {
    const r = antiRubberStamp(
      { proposerId: "user-A", confirmerId: "user-B", rejectionRate: 0.2 },
      NaN
    );
    expect(r).toEqual({ valid: false, alarm: false, reason: "fail_closed" });
  });

  it("negative rejectionFloor ⇒ fail_closed", () => {
    const r = antiRubberStamp(
      { proposerId: "user-A", confirmerId: "user-B", rejectionRate: 0.2 },
      -0.01
    );
    expect(r).toEqual({ valid: false, alarm: false, reason: "fail_closed" });
  });

  it("rejectionRate NaN (garbage input) ⇒ fail_closed", () => {
    const r = antiRubberStamp(
      { proposerId: "user-A", confirmerId: "user-B", rejectionRate: NaN },
      FLOOR
    );
    expect(r).toEqual({ valid: false, alarm: false, reason: "fail_closed" });
  });

  it("rejectionRate > 1 (out-of-range) ⇒ fail_closed", () => {
    const r = antiRubberStamp(
      { proposerId: "user-A", confirmerId: "user-B", rejectionRate: 1.1 },
      FLOOR
    );
    expect(r).toEqual({ valid: false, alarm: false, reason: "fail_closed" });
  });

  it("rejectionRate < 0 (out-of-range) ⇒ fail_closed", () => {
    const r = antiRubberStamp(
      { proposerId: "user-A", confirmerId: "user-B", rejectionRate: -0.1 },
      FLOOR
    );
    expect(r).toEqual({ valid: false, alarm: false, reason: "fail_closed" });
  });

  it("deterministic: same input twice ⇒ identical output", () => {
    const event = { proposerId: "user-A", confirmerId: "user-B", rejectionRate: 0.1 };
    expect(antiRubberStamp(event, FLOOR)).toEqual(antiRubberStamp(event, FLOOR));
  });
});
