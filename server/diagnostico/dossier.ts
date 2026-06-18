// EPIC-B6 handoff #8 (deterministic gate, no LLM). Piece:
//   US-B6.3.1   — emitDossier: 11-field completeness + provenance gate over v_dossier_handoff;
//                 any empty field or missing provenance ⇒ fail-closed (no emit). PII saneada
//                 via scanBorderPII (EC-B6). BR-B17/B18: never hand off work half-done.
import { query } from "../db/pool.js";
import { scanBorderPII } from "./guards.js";

export interface DossierGateResult {
  emitted: boolean;
  /** names of the 11-field gaps that blocked emission (empty ⇒ emitted=true). */
  gaps: string[];
  dossier: Record<string, unknown> | null;
}

// The 11 derived dossier fields exposed by tenant.v_dossier_handoff (04 §3.4, §4).
const FIELDS = [
  "f1_type_root", "f2_evidence", "f3_who", "f4_where_concentrated", "f5_how_much",
  "f6_recurrence", "f7_similar_cases", "f8_auditable_hypothesis", "f9_suggested_route",
  "f10_raw_data", "f11_provenance",
] as const;
type Field = (typeof FIELDS)[number];

type DossierRow = Record<Field, unknown> & { problem_id: string };

const isNil = (v: unknown): boolean => v === null || v === undefined;
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
// A composite jsonb field is complete only when present AND every inner value is non-null.
const objectComplete = (v: unknown): boolean => isObject(v) && Object.values(v).every((x) => !isNil(x));
const arrayNonEmpty = (v: unknown): boolean => Array.isArray(v) && v.length > 0;

// Per-field GAP rule (a field present in `gaps` blocked emission). Fail-closed ⇒ default to GAP.
function isGap(field: Field, value: unknown): boolean {
  switch (field) {
    // composite jsonb objects: GAP if null OR any inner value is null.
    case "f1_type_root":
    case "f5_how_much":
    case "f8_auditable_hypothesis":
      return !objectComplete(value);
    // arrays: GAP if null OR empty [].
    case "f3_who":
    case "f7_similar_cases":
      return !arrayNonEmpty(value);
    // provenance object: GAP if null OR empty {} (no provenance ⇒ no render/export, §3 R10).
    case "f11_provenance":
      return !isObject(value) || Object.keys(value).length === 0;
    // scalar / opaque jsonb (f2/f4/f6/f9/f10): GAP if null.
    default:
      return isNil(value);
  }
}

/** US-B6.3.1 — gate the dossier: emit only when all 11 fields are present with provenance. */
export async function emitDossier(problemaId: string): Promise<DossierGateResult> {
  const rows = await query<DossierRow>(
    `select problem_id, ${FIELDS.join(", ")}
       from tenant.v_dossier_handoff where problem_id = $1`,
    [problemaId],
  );
  const row = rows[0];
  // No row ⇒ every field is a gap (fail-closed: a missing case is never a complete dossier).
  if (!row) return { emitted: false, gaps: [...FIELDS], dossier: null };

  const gaps = FIELDS.filter((f) => isGap(f, row[f])) as string[];

  const dossier = Object.fromEntries(FIELDS.map((f) => [f, row[f]])) as Record<string, unknown>;
  // EC-B6 / BR-B7 — scan the dossier's PII surface; residual PII ⇒ 'pii' gap (fail-closed).
  // f6_recurrence is excluded: it holds only counts + system timestamps (no user PII), and an
  // ISO date's YYYYMMDD always survives the residual-digit net (guards.ts), so scanning it would
  // self-block every complete dossier — defeating BR-B17/B18 (gate INCOMPLETE work, not complete).
  const piiSurface = Object.fromEntries(FIELDS.filter((f) => f !== "f6_recurrence").map((f) => [f, row[f]]));
  if (scanBorderPII(JSON.stringify(piiSurface)).blocked) gaps.push("pii");

  // BR-B17/B18 — emit only a complete, provenanced, PII-safe dossier; otherwise hand off nothing.
  return gaps.length === 0 ? { emitted: true, gaps: [], dossier } : { emitted: false, gaps, dossier: null };
}
