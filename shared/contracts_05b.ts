import { z } from "zod";

// 05B Diagnóstico — shared tRPC io + domain types (Zod v3, CLAUDE.md §1). Domain vocab native.
// Piece-specific types live inside each server/diagnostico/* module; this file holds only the
// cross-cutting enums + the orchestrator input/row shapes that the router and many pieces share.

// Criticidad: ordered (grave > media > baja). grave ⇒ "ahora" (BR-B11). String-backed, but the
// ORDER is encoded in CRITICIDAD_RANK so a number never depends on alphabetical sort.
export const criticidad = z.enum(["grave", "media", "baja"]);
export type Criticidad = z.infer<typeof criticidad>;
export const CRITICIDAD_RANK: Record<Criticidad, number> = { grave: 3, media: 2, baja: 1 };

// Ruta: the 5 destinations (BR-B6.1). Closed set.
export const ruta = z.enum([
  "actuar_rapido",
  "entregar_al_team",
  "prototipo_testar",
  "corregir_interno",
  "monitorear_con_gatilho",
]);
export type Ruta = z.infer<typeof ruta>;

// Comunicación proactiva (BR-B13): the configured policy, and the resolved decision.
export const comunicacionPolitica = z.enum(["avisar", "corregir_callado"]);
export type ComunicacionPolitica = z.infer<typeof comunicacionPolitica>;
export type ComunicacionDecision = "avisar" | "no_comunicar";

// reportProblema input (US-B1.1.1 gate + B.1.3 dedup). NO tenant_id — resolved server-side from
// the session (anti-spoofing, §7). restaurant_id is DATA within the pool (required, not the
// frontier). criticidad is an optional trigger hint.
export const reportProblemaInput = z.object({
  restaurantId: z.string().min(1),
  conversationId: z.string().optional(),
  criticidad: criticidad.optional(),
});
export type ReportProblemaInput = z.infer<typeof reportProblemaInput>;

// Diagnosed_Problem row shape (snake_case = DB). RESULT columns are null pre-producer (§14).
export interface ProblemaRow {
  problema_id: string;
  tenant_id: string;
  restaurant_id: string;
  conversation_id: string | null;
  criticidad: string | null;
  status: string;
  frecuencia: number;
  tipo_area: string | null;
  raiz_hipotese: string | null;
  confianza: string | null;
  rs_perdido: string | null;
  churn_risk: string | null;
  custo_resolver: string | null;
  value_ganho: string | null;
  ruta_sugerida: string | null;
  silenciosos_status: string | null;
  primera_vez_ts: string;
  ultima_vez_ts: string | null;
}

export const reportProblemaResult = z.object({
  problema_id: z.string(),
  status: z.string(),
  frecuencia: z.number(),
  created: z.boolean(),
});
export type ReportProblemaResult = z.infer<typeof reportProblemaResult>;
