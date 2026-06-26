import { describe, it, expect, vi } from "vitest";
import { triggerActionForProblem } from "./triggerAction.js";
import { stubMotorReasoning } from "../motor/reasoning.js";
import type { MotorAttemptResult } from "../motor/runMotor.js";

// 05D close-the-loop — the diagnosis, after its dossier, triggers the action motor for each AFFECTED
// restaurant. These pin the ORCHESTRATION (resolve → per-restaurant → tally); the §7 money/autonomy
// authority is the motor's own (runMotorAttempt) and is covered by its tests, not re-asserted here.
// Hermetic: exec + run are injected fakes (no DB, no LLM).

const target = (restaurant_id: string, over: Partial<{ cohort_id: string; week: string; tier_id: string | null }> = {}) => ({
  restaurant_id,
  cohort_id: "co1",
  week: "2026-01",
  tier_id: "tier_base_1",
  ...over,
});
const result = (outcome: MotorAttemptResult["outcome"]): MotorAttemptResult => ({
  outcome,
  reason: "x",
  nbaId: null,
  loops: 1,
  attemptId: "a",
});

describe("05D triggerActionForProblem — diagnosis closes the loop into the motor", () => {
  it("triggers the motor per affected restaurant and tallies outcomes; the resolve query is tenant-scoped (§3.4)", async () => {
    const calls: readonly unknown[][] = [];
    const exec = vi.fn(async (_sql: string, params: readonly unknown[]) => {
      (calls as unknown[][]).push([...params]);
      return [target("r1"), target("r2"), target("r3")];
    });
    const outcomes = ["acted", "escalated", "skipped"] as const;
    let k = 0;
    const run = vi.fn(async () => result(outcomes[k++]!));

    const res = await triggerActionForProblem("p1", "t1", { exec, run, reasoning: stubMotorReasoning });

    expect(res).toEqual({ acted: 1, escalated: 1, skipped: 1, attempts: 3 });
    expect(run).toHaveBeenCalledTimes(3);
    // §3.4: the producer is scoped by BOTH problem and tenant — tenant_id is never taken from a client body.
    expect(calls[0]).toEqual(["p1", "t1"]);
  });

  it("skips an unresolved target (null tier) — fail-closed, left to the human via the dossier", async () => {
    const exec = async () => [target("r1"), target("r2", { tier_id: null })];
    const run = vi.fn(async () => result("acted"));

    const res = await triggerActionForProblem("p1", "t1", { exec, run, reasoning: stubMotorReasoning });

    expect(run).toHaveBeenCalledTimes(1); // only the fully-resolved restaurant reaches the motor
    expect(res).toEqual({ acted: 1, escalated: 0, skipped: 0, attempts: 1 });
  });

  it("fail-open: a motor error on one restaurant never aborts the loop or the already-emitted dossier", async () => {
    const exec = async () => [target("r1"), target("r2")];
    let n = 0;
    const run = vi.fn(async () => {
      if (n++ === 0) throw new Error("motor boom");
      return result("acted");
    });

    const res = await triggerActionForProblem("p1", "t1", { exec, run, reasoning: stubMotorReasoning });

    expect(res).toEqual({ acted: 1, escalated: 1, skipped: 0, attempts: 2 }); // the throw counts as escalated
  });

  it("no affected restaurants ⇒ no action, and the LLM client is never constructed (no key needed)", async () => {
    const exec = async () => [];
    const run = vi.fn();

    // reasoning intentionally NOT injected: the lazy `?? llmMotorReasoning(openaiChatClient())` must not fire
    // when there is nothing to act on (an empty problem must never need an API key).
    const res = await triggerActionForProblem("p1", "t1", { exec, run });

    expect(res).toEqual({ acted: 0, escalated: 0, skipped: 0, attempts: 0 });
    expect(run).not.toHaveBeenCalled();
  });
});
