import { llmReasoning, deterministicReasoning, type DiagnosisReasoning } from "./reasoning.js";
import { openaiChatClient } from "../_core/llm.js";
import { getActiveChatModel } from "../_core/model.js";
import { recordUsageSafe } from "../_core/usage.js";
import { env } from "../_core/env.js";

// 05D Part A (02D) — the PRODUCT reasoning provider for the diagnosis spine (Brain 2). It is the missing
// wiring: today the two product call-sites (diagnosis.run, intake.runSpine) default to the deterministic
// floor, so the real LLM never runs in product. This returns the real LLM+RAG provider when an
// OPENAI_API_KEY is present, and FALLS OPEN to the deterministic floor otherwise (no key ⇒ no crash, §3.7;
// keeps CI hermetic — the worktree/CI carry no key). Cost is logged per problem (P07): recordUsageSafe is
// best-effort so a telemetry write never fails the operator's request. ONE construction shared by both
// product call-sites (diagnosis.run + intake.runSpine) so they cannot drift; it MIRRORS the inline wiring
// in scripts/run-05b (that script logs a different ref per call, so it builds its own). tenant server-side (§3.4).
let warnedNoKey = false;

export async function diagnosisReasoning(tenantId: string, problemId: string): Promise<DiagnosisReasoning> {
  if (!process.env.OPENAI_API_KEY) {
    // §7 fail-closed (Codex P1): PRODUCTION requires Brain 2 (the LLM). A missing key there is a
    // misconfiguration, NOT the CI hermetic mode — collapsing to a single brain would let cases auto-proceed
    // (deterministic conf 0.70 > the 0.60 floor) WITHOUT the 2-brain cross-check. Throw (mirrors env.ts's
    // prod guards + motor's openai client) so no case is ever diagnosed on one brain in production. In dev/CI
    // the LLM is intentionally absent ⇒ the deterministic floor is the hermetic mode; warn once (never silent).
    if (env.NODE_ENV === "production") {
      throw new Error(
        "diagnosisReasoning: OPENAI_API_KEY required in production — Brain 2 unavailable (fail-closed, §7)",
      );
    }
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn(
        "diagnosisReasoning: no OPENAI_API_KEY — deterministic floor only (dev/CI hermetic; the 2-brain agreement gate is inert until a key is set).",
      );
    }
    return deterministicReasoning;
  }
  const model = await getActiveChatModel(); // operator-selected chat model (knob, §3.8 by name)
  return llmReasoning(
    await openaiChatClient(),
    (usage) =>
      void recordUsageSafe({ tenantId, processType: "diagnosis", kind: "chat", model, refId: problemId, usage }),
    model,
  );
}
