import { llmReasoning, deterministicReasoning, type DiagnosisReasoning } from "./reasoning.js";
import { openaiChatClient } from "../_core/llm.js";
import { getActiveChatModel } from "../_core/model.js";
import { recordUsageSafe } from "../_core/usage.js";

// 05D Part A (02D) — the PRODUCT reasoning provider for the diagnosis spine (Brain 2). It is the missing
// wiring: today the two product call-sites (diagnosis.run, intake.runSpine) default to the deterministic
// floor, so the real LLM never runs in product. This returns the real LLM+RAG provider when an
// OPENAI_API_KEY is present, and FALLS OPEN to the deterministic floor otherwise (no key ⇒ no crash, §3.7;
// keeps CI hermetic — the worktree/CI carry no key). Cost is logged per problem (P07): recordUsageSafe is
// best-effort so a telemetry write never fails the operator's request. ONE construction shared by both
// product call-sites (diagnosis.run + intake.runSpine) so they cannot drift; it MIRRORS the inline wiring
// in scripts/run-05b (that script logs a different ref per call, so it builds its own). tenant server-side (§3.4).
export async function diagnosisReasoning(tenantId: string, problemId: string): Promise<DiagnosisReasoning> {
  if (!process.env.OPENAI_API_KEY) return deterministicReasoning;
  const model = await getActiveChatModel(); // operator-selected chat model (knob, §3.8 by name)
  return llmReasoning(
    await openaiChatClient(),
    (usage) =>
      void recordUsageSafe({ tenantId, processType: "diagnosis", kind: "chat", model, refId: problemId, usage }),
    model,
  );
}
