## What

17 deterministic CÓDIGO pieces for **pantalla_05A** (atendimiento con contexto integrado) + the gov-zone **foundation DDL** they sit on. All pieces: pure, fail-closed, thresholds read **by name** (never literals), ≤100 lines, zero `any`.

### Pieces (`server/pieces/*.ts`, each unit-tested)
| EPIC | Pieces |
|---|---|
| A1/A2 montaje | A.2.2 grounding · A.1.3 intake_router · A.2.0 access_scope · A.2.1 access_filter · A.2.3 policy_resolver · A.3.0 predraft_gates |
| A2 respuesta | A.3.6-CHECK self_critique_check |
| A3 autonomía | A.4.1 min_normalizer · A.4.2 grounding_gate · A.4.4 confidence_gate · A.4.7 queue_priority |
| A4 ejecución | A.5.0 band_router · A.5.1 idempotency · A.5.3 financial_abort · A.5.4 readback_verify |
| A5 salida | A.6.1 version_seal · A.6.2 transcript_pii |
| A6 gobernanza | A.7.4b anti_rubber_stamp |

### Foundation DDL (`supabase/migrations/20260617000015_05a_foundation_gov.sql`)
`gov.{NBA_Propuesta, Eval_Cell, Credencial, Politica_Tier, Decision_Trace, Liberacion_Lote}` + `Conversa_Episodio` extension (`cohort_id, nba_usada, lock_posesion, señal_inyeccion`). Decision_Trace is append-only + 4-eyes CHECK + XOR origin. **Every RESULT column defaults NULL** (§14 anti-fake); the seed inserts **zero rows** in these tables (their rows come from runtime producers).

## Test evidence
- `tsc --noEmit -p tsconfig.json` → exit 0 (whole project)
- `vitest --project unit` → all 05A pieces green
- `supabase test db` → **28/28** pgTAP (incl. 12 new foundation tests: anti-fake empty-pre-run, append-only UPDATE/DELETE reject, 4-eyes, XOR origin)

## ⚠️ Review flags (please eyeball before merge)
1. **Root-cause fix (karpathy):** `Decision_Trace` links via **`episodio_id`** (real FK → `Conversa_Episodio` PK), NOT `conversa_id`. 04 L269 says "conversa_id", but conversa_id is tenant-scoped (PK = `tenant:conversa`) → a key on it would collide cross-tenant (§3.4). The real identity is `episodio_id`. Confirm this is acceptable vs 04's literal wording.
2. **`rubber_stamp_flag`** = RESULT column (NULL pre-run), **not** a STORED GENERATED column. 04 L270 defines it as `(tiempo_a_firma_seg < umbral AND origen='movil')`, but `umbral` is the knob `tiempo_rubber_stamp_seg` read by-name (§3.8) — a stored-generated expr can't read a knob. The runtime motor fills it.
3. **`min_calculo.nba_id` / `eval_cell_ref` FK** stay deferred (text). Migration 013 (merged) typed them text; `NBA_Propuesta.nba_id` / `Eval_Cell.eval_cell_id` are uuid. FK promotion needs a follow-up migration (didn't edit merged 013).
4. **Seed knobs NOT in this PR:** the 4 new knobs (`umbral_antifrac, lock_TTL, retencion_PII_dias, tiempo_rubber_stamp_seg`) were left out of `seed.sql` (that file is shared with the concurrent 05B work). They must be seeded before the DB-write pieces land.

## Deploy
On merge → apply-script runs migration `000015` against supabase prod.

## Not in this PR (follow-ups)
14 CÓDIGO remaining (10 DB-write + 2 ambiguous A.2.5/A.6.5 + 2 UI A.7.2/A.7.3) + 18 AGENTE pieces.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
