import { z } from "zod";

// Single source of truth for tRPC io (Zod v3, CLAUDE.md §1). Domain vocab stays native.

export const deltaStatus = z.enum([
  "mudou_cohort",
  "melhorou_percentil",
  "baixou_percentil",
  "at_risk",
  "novo",
  "churn",
]);
export type DeltaStatus = z.infer<typeof deltaStatus>;

export const modoPercentil = z.enum(["percentil", "cualitativo_sin_percentil"]);
export const tenureBucket = z.enum(["0-3m", "3-6m", "6-12m", "12m+"]);
export const tierBase = z.enum(["managed_brand", "managed_midmarket", "long_tail"]);

export const scopeOwnerRef = z.object({ dueno_id: z.string(), nivel: z.string() }).nullable();

// F-5.2 handoff — input carries NO tenant_id (resolved server-side from the session).
export const handoffInput = z.object({
  restaurante_id: z.string().min(1),
  cohort_id: z.string().min(1),
  subgrupo_id: z.string().nullable().optional(),
  semana: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type HandoffInput = z.infer<typeof handoffInput>;

// Evento_Priorizado_NBA — the único mutante output (matches 02:1A consumer fields).
export const eventoPriorizadoNba = z.object({
  evento_id: z.string(),
  restaurante_id: z.string(),
  cohort_id: z.string(),
  subgrupo_id: z.string().nullable(),
  semana: z.string(),
  percentil_en_cohort: z.number().nullable(),
  gap_hasta_top: z.number().nullable(),
  delta_status: deltaStatus.nullable(),
  n_min_ok: z.boolean().nullable(),
  modo: modoPercentil.nullable(),
  cohort_rule_version: z.string(),
  scope_owner_ref: scopeOwnerRef,
  operador_id: z.string().nullable(),
});
export type EventoPriorizadoNba = z.infer<typeof eventoPriorizadoNba>;

// Delta panel row (F-2.3) — read-only projection of Evento_Priorizado_NBA.
export const deltaRow = z.object({
  evento_id: z.string(),
  restaurante_id: z.string(),
  cohort_id: z.string(),
  delta_status: deltaStatus.nullable(),
  percentil_en_cohort: z.number().nullable(),
  gap_hasta_top: z.number().nullable(),
});
export type DeltaRow = z.infer<typeof deltaRow>;
