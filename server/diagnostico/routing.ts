import type { Route, CommunicationPolicy, CommunicationDecision } from "../../shared/contracts_05b.js";

// EPIC-B6 router + proactive communication (deterministic, no LLM). Pieces:
//   US-B6.1.1   — routeStub: demo FIXED rule area_type → route (full 5 rules = QUEUE, tracked TODO)
//   US-B6.4.1   — communicationBranch: notify vs fix-silently; DEFAULT do_not_notify (BR-B13)
//   B.8.6       — proactiveMessageBranch: policy-driven; delegates the send to 05A, no internals.

export interface ProactiveBranch {
  dispatch: boolean;
  via: "05A" | null;
}

/** US-B6.1.1 — demo stub: deterministic area_type → route. Unknown/null ⇒ monitor_with_trigger
 *  (conservative default, fail-closed §7). The DEMO recognises one rule (finance); the full
 *  5-rule router is QUEUE, tracked below — never silently dropped. (04 §3 R6, R7). */
export function routeStub(areaType: string | null): Route {
  // TODO QUEUE: full 5-rule router (US-B6.1 backlog) — map every area_type → route deterministically.
  if (areaType === "finance") return "fix_internal";
  return "monitor_with_trigger"; // unknown / null ⇒ conservative default (fail-closed).
}

/** US-B6.4.1 — resolve the communication decision. notify ⇒ notify; fix_silently/null/absent
 *  ⇒ do_not_notify (DEFAULT do-not-notify, BR-B13 fail-closed: silence unless explicitly told). */
export function communicationBranch(policy: CommunicationPolicy | null): CommunicationDecision {
  return policy === "notify" ? "notify" : "do_not_notify";
}

/** B.8.6 — proactive-message branch; reuses communicationBranch. On 'notify' delegate the SEND to
 *  05A (we never reimplement nor expose its internals, EC-B14); otherwise stay silent (BR-B13). */
export function proactiveMessageBranch(policy: CommunicationPolicy | null): ProactiveBranch {
  return communicationBranch(policy) === "notify"
    ? { dispatch: true, via: "05A" }
    : { dispatch: false, via: null };
}
