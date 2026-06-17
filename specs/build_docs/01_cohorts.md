# Build-docs — Screen 01 · Cohorts Explorer

> Worked example proving `specs/_build_doc_template.md`. Four representative pieces span the categories: a deterministic producer (`01:F-1.2`), an output-frontier gate (`01:F-1.3b`), a reusable UI surface (`01:F-2.3`), and the single mutant handoff (`01:F-5.2`) that wires P01 → P02. Build order and the full 25-piece list: see the plan's "Plano passo-a-passo do código — slice 01". Rules: `CLAUDE.md`.

---

# 01:F-1.2 — Job batch de ranking: percentil / gap / dos baselines   ·   [target: CÓDIGO]   [build: Claude+Codex]

## Functionality

- **Goal:** for each cohort, compute deterministically each account's percentile and gap-to-top plus the two cohort baselines, and persist them.
- **Composes / cites:** `01:US-1.1.x`, reuses the `Named_Query` runner.  ·  **04 §:** §3, §6 (ranking → batch job P01), §14.
- **Contract (E2E):**
  - TRIGGER-IN: schedule — weekly batch job P01 (cadence by name from `Config_Perillas`); out-of-band, not in operator session.
  - DATA-IN: `Restaurante`, `Orden` (recurrencia/cross_sell **computed from `Orden`**, never columns), `Cohort`, `Subgrupo`, `Pertenencia_Cohort_Snapshot` (prev), `Cohort_Rule_Version`.
  - DATA-OUT: `Pertenencia_Cohort_Snapshot.percentil_en_cohort` + `.gap_hasta_top`; `Cohort.baseline_descriptivo` + `.baseline_atribucion_segmento`. Producer = job batch P01 / `Named_Query`. NULL pre-run (§14).
  - TRIGGERS-FIRED: snapshot persisted → North Star/Goals; feeds `01:F-2.2` diff. 
- **Workflow — runtime:**
  1. Scheduler fires P01 weekly (cadence read by name from `Config_Perillas`).
  2. Read `Orden` + snapshots for the pool → gate: `tenant_id` server-side (RLS single-pool); pin the vigente `cohort_rule_version` (anti-mezcla) → fail-closed if version indeterminate.
  3. Core: SQL `fn_rank_cohort()` / `Named_Query` computes percentile, `gap_hasta_top`, and the two baselines from `Orden`. Deterministic, never LLM.
  4. Write result columns (were NULL) with `cohort_rule_version` stamped per row + `ultimo_calculo_ts`/provenance; respect `UNIQUE(restaurante_id, cohort_id, semana, cohort_rule_version)`.
  5. Fire downstream: snapshot → Goals; delta job `01:F-2.2`.
  6. (No UI; this is a job.)
- **Constraints:** §14 never seed a result (all NULL pre-run); deterministic never LLM; `cohort_rule_version` per row; recurrencia/cross_sell computed, not read (denylist `04 §4`).
- **Done-when:** *Given* seeded brutos with no results, *When* the job runs, *Then* percentil/gap/baselines go NULL → computed-from-`Orden`. *And* two runs give identical output. **Check ejecutable:** `pnpm test:antifake` (fails if any result column ≠ NULL pre-run) + `pnpm test:sql` (determinism + derived-not-literal).

## Design

- No UI surface (batch job). Outputs are rendered by `01:F-1.6`, `01:F-2.1`, `01:F-5.1`.

## Data

- **Tables:** `Pertenencia_Cohort_Snapshot` (write percentil/gap), `Cohort` (write baselines), `Restaurante`, `Orden`, `Cohort_Rule_Version` (read). Zone = cohort.
- **DATA-IN → DATA-OUT:** producer = job batch P01 / `Named_Query`; all result columns NULL pre-run (§14).
- **Gates:** RLS single-pool, `tenant_id` server-side; `cohort_rule_version` stamped; `UNIQUE(restaurante_id, cohort_id, semana, cohort_rule_version)`.
- **Config_Perillas by NAME:** batch cadence; tenure-bucket borders (upstream). **Provenance:** `ultimo_calculo_ts` per row.
- **Phantom check (§4):** creates NO `UPSIDE`/`PERFIL_COHORT` — baselines live in `Cohort.baseline_descriptivo`.
- **Determinism:** two runs, same input ⇒ identical (pgTAP).

---

# 01:F-1.3b — CHECK de k-anonimidad + flag de supresión   ·   [target: CÓDIGO]   [build: Claude+Codex]

## Functionality

- **Goal:** no cohort insight crosses the cross-tenant frontier if the cell is below the k-anonymity threshold.
- **Composes / cites:** `01:BR-15`, `01:1A`. Reuses the cohort-zone CHECK pattern.  ·  **04 §:** §3, §6.
- **Contract (E2E):**
  - TRIGGER-IN: sync — evaluated on the output frontier when an insight is about to be emitted.
  - DATA-IN: `Cohort.n_cuentas`, `Subgrupo`.
  - DATA-OUT: `Cohort.supresion_k_aplicada` (CHECK `n_cuentas >= k_anon_threshold`). Deterministic, computed at run.
  - TRIGGERS-FIRED: null (gate; suppresses or passes the insight).
- **Workflow — runtime:**
  1. Insight emission attempt reaches the output frontier.
  2. Gate: read `n_cuentas`; if count is indeterminate → **fail-closed = suppress**.
  3. Core: CHECK `n_cuentas >= k_anon_threshold` (threshold by name).
  4. Write `supresion_k_aplicada` (true ⇒ insight suppressed).
  5. Terminal — fires nothing downstream.
- **Constraints:** `k_anon_threshold` by NAME, never literal; this is the **output frontier** only (does not apply to internal diagnosis, §6); **separate from n_min** (`01:F-1.3`) — significance ≠ re-identification; fail-closed.
- **Done-when:** *Given* `n_cuentas < k_anon_threshold`, *Then* `supresion_k_aplicada=true` and the insight is suppressed; *Given* `>=`, passes; *Given* indeterminate count, suppresses. **Check ejecutable:** `pnpm test:sql` (boundary `k−1 / k / k+1` + fail-closed), in a fixture **separate** from the n_min tests.

## Design

- No standalone UI; the suppression flag is honored by any rendering surface (e.g. `01:F-3.4` raw ticket distribution).

## Data

- **Tables:** `Cohort` (write `supresion_k_aplicada`), `Subgrupo` (read). Zone = cohort (no `restaurante_id`).
- **Gates:** k-anon (`k_anon_threshold`) **only** — do not merge with n_min (`n_min_threshold`, piece `01:F-1.3`).
- **Config_Perillas by NAME:** `k_anon_threshold`.
- **Phantom check (§4):** none created.
- **Determinism:** CHECK is pure (pgTAP both sides of threshold).

---

# 01:F-2.3 — Render del panel de delta priorizado (at_risk arriba)   ·   [target: CÓDIGO]   [build: Claude]

## Functionality

- **Goal:** the operator sees the delta panel ordered with `at_risk` accounts on top. This is the **reusable ordered panel** other pieces reference (`01:F-1.6`, `01:F-5.1`, `01:EPIC-6`).
- **Composes / cites:** `01:US-2.2.2`, `01:1D`. Reuses the existing sortable list/table component.  ·  **04 §:** §3.
- **Contract (E2E):**
  - TRIGGER-IN: sync — operator opens the panel.
  - DATA-IN: `Evento_Priorizado_NBA.delta_status` (via a read tRPC procedure).
  - DATA-OUT: null (render only; recomputes nothing).
  - TRIGGERS-FIRED: null.
- **Workflow — runtime:**
  1. Operator opens the panel.
  2. Read `delta_status` rows (tenant scoped server-side); NULL pre-run ⇒ pass NULL through.
  3. Core: sort with `at_risk` first (deterministic order; no recompute — deltas come from `01:F-2.2`).
  4. No write.
  5. Terminal.
  6. UI states: loading / empty (explicit) / error.
- **Constraints:** render/sort only; never recomputes deltas; a11y order exposed semantically + keyboard-navigable; no dead-code; ≤100 lines.
- **Done-when:** *Given* deltas with several `at_risk`, *Then* they render on top in the defined order; *Given* empty list, *Then* explicit empty state. **Check ejecutable:** `pnpm test` (component asserts order) + `pnpm test:a11y` (keyboard navigation).

## Design

- **Component:** sortable list/table; reuse the existing sortable primitive in `components/ui` (create new only with stated reason). Ref `Design/musixmatch-pro-design-spec.md` (tokens §1).
- **Tokens:** `at_risk` row accent `--mxm-systemRed100`; card surface `--mxm-backgroundPrimaryElevated`; text `--mxm-contentPrimary`/`--mxm-contentSecondary`. Tabular numbers `font-variant-numeric: tabular-nums`. Fluid (`clamp()` + logical properties).
- **States:** loading skeleton · empty (explicit, never a green-fake empty) · error.
- **a11y (WCAG 2.1 AA):** sort order exposed semantically (not color-only), keyboard navigable, `aria-sort` on the active column.
- **Reuse:** the sortable table primitive; this panel is itself the reusable pattern for `01:F-1.6` / `01:F-5.1` / sandbox.

## Data

- **Tables:** reads `Evento_Priorizado_NBA.delta_status` only. Zone = cohort/tenant.
- **DATA-IN → DATA-OUT:** none written. NULL pre-run passes through as NULL (never a fabricated number).
- **Gates:** RLS single-pool (read scoped server-side).
- **Phantom check (§4):** none.
- **Determinism:** same delta set ⇒ same order.

---

# 01:F-5.2 — Handoff: emite Evento_Priorizado_NBA en click síncrono (único output mutante)   ·   [target: CÓDIGO]   [build: Claude+Codex]

## Functionality

- **Goal:** on handoff confirm, emit one `Evento_Priorizado_NBA` for NBA (P02) to consume — the **only real mutant output of P01**.
- **Composes / cites:** `01:US-5.1.2`, `01:BR-14`, `01:BR-6`, `01:1G`. Reuses the event-write + `Evento_Uso` append pattern.  ·  **04 §:** §3, §14.
- **Contract (E2E — must match `02:1A` TRIGGER-IN in `breakdown_N8N.md`):**
  - TRIGGER-IN: sync user-action — operator confirms handoff (in-app click); payload `restaurante_id, cohort_id, subgrupo_id`.
  - DATA-IN: `Pertenencia_Cohort_Snapshot.{percentil_en_cohort, gap_hasta_top, n_min_ok, freshness_ts, scope_owner_ref, cohort_rule_version}`; `Usuario.usuario_id` (operador_id); `tenant_id` server-side.
  - DATA-OUT: `Evento_Priorizado_NBA{evento_id, restaurante_id, cohort_id, subgrupo_id, percentil_en_cohort, gap_hasta_top, delta_status, n_min_ok, freshness_ts, modo, cohort_rule_version, scope_owner_ref, operador_id}`. Producer = sync event. NULL pre-run.
  - TRIGGERS-FIRED: **`Evento_Priorizado_NBA → 02:1A` (P02 NBA)**; append `Evento_Uso`. ✅ round-trip: `02:1A` reads `{cohort_id, restaurante_id}` — both present (resolves COL-13/COL-15).
- **Workflow — runtime:**
  1. Operator clicks confirm on a prioritized account (from `01:F-5.1` drill); payload `{restaurante_id, cohort_id, subgrupo_id}`.
  2. Gate: resolve `tenant_id` server-side (never from client); validate operator authorization via `scope_owner_ref`; idempotency guard against double-click; pin `cohort_rule_version`.
  3. Core: build the event payload from the snapshot; `risk_class` is **not** born here (it is born in P02).
  4. Write exactly one `Evento_Priorizado_NBA` (version stamped) + append `Evento_Uso` (append-only).
  5. Fire: event → `02:1A` (NBA proposes for cohort).
  6. UI: button busy/disabled during write; success/error state.
- **Constraints:** §14 NULL pre-run; `tenant_id` server-side (RLS); idempotent on double-click; `cohort_rule_version` stamped; `risk_class` not created here; payload must match `02:1A`.
- **Done-when:** *Given* an authorized operator on a prioritized account, *When* they confirm, *Then* exactly one `Evento_Priorizado_NBA` is inserted (version stamped) and `Evento_Uso` appended. *And* double-click does not duplicate. **Check ejecutable:** `pnpm test:integration` (asserts one row + `Evento_Uso` append + `tenant_id` server-side; payload round-trip against `02:1A` TRIGGER-IN) + `pnpm test:e2e`.

## Design

- **Surface:** confirm button on the drill (`01:F-5.1`). Token: primary action `--mxm-paletteBrand100`. Busy state `aria-busy`, disabled during the write.
- **States:** idle / busy (disabled, anti double-fire) / success / error.
- **a11y (WCAG 2.1 AA):** accessible button label, `aria-busy` while emitting, focus preserved.
- **Reuse:** the existing event-write + `Evento_Uso` append helper; no new table.

## Data

- **Tables:** write `Evento_Priorizado_NBA` (the single mutant output) + append `Evento_Uso`; read `Pertenencia_Cohort_Snapshot`, `Usuario`. Zone = cohort/tenant.
- **DATA-IN → DATA-OUT:** producer = sync event; NULL pre-run (§14).
- **Gates:** RLS single-pool (`tenant_id` server-side); idempotency; `cohort_rule_version` stamped; operator authorization via `scope_owner_ref`.
- **Config_Perillas by NAME:** n/a (uses stamped snapshot values).  ·  **Provenance:** `freshness_ts` carried from snapshot.
- **Phantom check (§4):** none — `delta_status` carried inline (no `MOVIMIENTO_LOG`).
- **Determinism / idempotency:** double confirm ⇒ exactly one event.
