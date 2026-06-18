## What

Completes the Spanish→English rename of the **data/schema layer + the 05A backend pieces**, on top of `english-rename` (which had done a partial pass). Glossary-driven so cross-file references stay valid.

### Renamed
- **gov tables:** `Credencial`→`Credential`, `Liberacion_Lote`→`Release_Batch`, `NBA_Propuesta`→`NBA_Proposal`, `Politica_Tier`→`Policy_Tier` (+ `min_calculo`→`min_calculation`, `ROI_Operador`→`ROI_Operator`, `Usuario`→`User`, already in base)
- **types/enums:** `accion_*`→`*_action`, `class_financiera`→`financial_class`, `destino_ruteo`→`routing_destination`, `eje_escalacion`→`escalation_axis`, `rol_credencial`→`credential_role`, … ; enum **values** `liberar`→`release`, `pausar`→`pause`, `resuelto`→`resolved`, `abierta`→`open`, …
- **05A piece identifiers:** `eje`→`axis`, `confianza`→`confidence`, `piso`→`floor`, `umbral`→`threshold`, `intensidad`→`intensity`, `prioridad_cola`→`queue_priority`, `Credencial`→`Credential`

### Invariants preserved
- `public.autonomy_level` keeps order **LOW, MEDIUM, HIGH** (so `least()` gives the conservative floor, §3).
- Config_Knobs **key names** (e.g. `piso_confianza`) preserved — they're keyed data, renamed only if the seed renames them.
- Behavior unchanged: names/values/text only.

## Verification (worktree, this branch)
- `tsc --noEmit` → **0**
- `eslint <tracked> --max-warnings=0` → **0**
- `vitest --project unit` → **299 passed**
- `supabase db reset` → renamed schema applies clean (`Policy_Tier`, `min_calculation`, …)
- `supabase test db` (pgTAP) → **36/36 PASS** (incl. `cohort_engine_v2` — green on a clean reset)
- `vitest --project integration` → the tests that ran **passed**; the run then hit `ECONNREFUSED` because the **shared local DB was reset by the concurrent process mid-run** (env, not a rename bug — a rename bug throws "relation/column does not exist", not a connection error). **CI's isolated postgres confirms integration.**

## Out of scope (deliberate — flag for a coordinated follow-up)
- **05B backend code identifiers** (~16 files: `server/diagnostico/*`, `shared/contracts_05b.ts`, `tests/integration/diag_*`): `Comunicacion`→`Communication`, `politica`→`policy`, `ruta`→`route`, `tipoArea`→`areaType`, `silenciosos`, `impacto`, … + the Spanish **filenames/dir** (`diagnostico/`, `caso_repo`, `silenciosos`, `impacto`). This is the concurrent process's **actively-developed** code (chunk3 in flight) — renaming it in isolation now would create a large merge conflict against the live `english-rename`. Best done by/with the 05B track or after it stabilizes.
- **Comment-level Spanish** (e.g. `redacción`, `escalación`, `semáforo`) across files — documentation, lowest priority.

## Base & isolation
Branched off `english-rename` @ `673b1fd`; done in a git worktree so the concurrent process advancing `english-rename` (now chunk3) doesn't clobber this. Will need reconciliation at merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
