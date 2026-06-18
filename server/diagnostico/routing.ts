import type { Ruta, ComunicacionPolitica, ComunicacionDecision } from "../../shared/contracts_05b.js";

// EPIC-B6 ruteador + comunicación proactiva (deterministic, no LLM). Pieces:
//   US-B6.1.1   — routeStub: demo FIXED rule tipo_area → ruta (full 5 rules = FILA, tracked TODO)
//   US-B6.4.1   — comunicacionBranch: avisar vs corregir-callado; DEFAULT no_comunicar (BR-B13)
//   B.8.6       — proactiveMessageBranch: policy-driven; delegates the send to 05A, no internals.

export interface ProactiveBranch {
  dispatch: boolean;
  via: "05A" | null;
}

/** US-B6.1.1 — demo stub: deterministic tipo_area → ruta. Unknown/null ⇒ monitorear_con_gatilho
 *  (conservative default, fail-closed §7). The DEMO recognises one rule (finanzas); the full
 *  5-rule router is FILA, tracked below — never silently dropped. (04 §3 R6, R7). */
export function routeStub(tipoArea: string | null): Ruta {
  // TODO FILA: full 5-rule router (US-B6.1 backlog) — map every tipo_area → ruta deterministically.
  if (tipoArea === "finanzas") return "corregir_interno";
  return "monitorear_con_gatilho"; // unknown / null ⇒ conservative default (fail-closed).
}

/** US-B6.4.1 — resolve the communication decision. avisar ⇒ avisar; corregir_callado/null/absent
 *  ⇒ no_comunicar (DEFAULT no-comunicar, BR-B13 fail-closed: silence unless explicitly told). */
export function comunicacionBranch(politica: ComunicacionPolitica | null): ComunicacionDecision {
  return politica === "avisar" ? "avisar" : "no_comunicar";
}

/** B.8.6 — proactive-message branch; reuses comunicacionBranch. On 'avisar' delegate the SEND to
 *  05A (we never reimplement nor expose its internals, EC-B14); otherwise stay silent (BR-B13). */
export function proactiveMessageBranch(politica: ComunicacionPolitica | null): ProactiveBranch {
  return comunicacionBranch(politica) === "avisar"
    ? { dispatch: true, via: "05A" }
    : { dispatch: false, via: null };
}
