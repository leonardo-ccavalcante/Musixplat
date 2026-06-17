# Build-doc template — `## Functionality / ## Design / ## Data`

> Copy this per feature into `specs/build_docs/<screen>_<slug>.md`. It is the ultra-detailed doc the code agent works from. Fill every angle-bracket; delete nothing structural. Rules live in `CLAUDE.md` (single source of truth) — reference them, do not restate. Worked example: `specs/build_docs/01_cohorts.md`.

---

# <piece_id> — <título>   ·   [target: CÓDIGO | AGENTE | HUMANO]   [build: Claude | Codex-review | Claude+Codex]

## Functionality

- **Goal:** <outcome, not method — one line>
- **Composes / cites:** <piece_ids it orchestrates or depends on>  ·  **04 §:** <sections>
- **Contract (E2E — must match the consumer in `breakdown_N8N.md`):**
  - TRIGGER-IN: <sync user-action | schedule | event> + payload
  - DATA-IN: <fields read>
  - DATA-OUT: <fields written> + producer (<Named_Query | job | trigger | agent>) · NULL pre-run (§14)
  - TRIGGERS-FIRED: <downstream consumer piece_id> | null (terminal)
- **Workflow — step-by-step runtime (HOW the system executes it; this is what the agent follows):**
  1. <trigger> → who fires it (sync/schedule/event) + payload
  2. <read DATA-IN> → **gate applied** (k-anon / n_min / RLS single-pool / cohort_rule_version) → **fail-closed** on failure (degrade-to-human)
  3. <core> → deterministic compute (Named_Query/SQL, NULL pre-run §14)  |  AGENTE synthesis (text/ranking, NEVER a number)
  4. <write DATA-OUT> → named producer + provenance/freshness stamped + UNIQUE respected
  5. <output> → TRIGGERS-FIRED to consumer  |  terminal (fires nothing)
  6. <UI states along the path> → loading / empty / error (never green-fake)
  > Each step NAMES the actor + the gate + the effect. Without it the agent guesses the runtime.
- **Constraints:** <which `CLAUDE.md §3` hard-nos apply to this piece>
- **Done-when:** <Given / When / Then …> + **Check ejecutable:** <real command from `CLAUDE.md §1`>

## Design

- **Screen/component** + ref: `Design/musixmatch-pro-design-spec.md` §<n>
- **Tokens** used: `--mxm-*` (dark-only, no invented colors) · fluid layout (`clamp()` + logical properties)
- **States:** loading / empty / error explicit · NULL ⇒ conservative empty, never zero/green-fake
- **a11y (WCAG 2.1 AA):** <color-not-sole-carrier | focus-trap + Esc + focus-return | keyboard order | aria-*>
- **Reuse:** which `components/ui` primitive / existing pattern is reused (create new only with stated reason)

## Data

- **Canonical tables touched** (`04 §3`, by zone tenant/cohort/gov/catalog) + FKs (`04 §4`): <list>
- **DATA-IN → DATA-OUT:** producer (<Named_Query/job/trigger/agent>) · every result column NULL pre-run (§14)
- **Gates:** RLS zone + `tenant_id` server-side · k-anon (`k_anon_threshold`) and/or n_min (`n_min_threshold`) — separate · `cohort_rule_version` stamped per row · UNIQUE constraints
- **Config_Perillas by NAME:** <which knobs> · **provenance/freshness** fields written
- **Phantom check (§4):** confirm this piece creates NO denylisted table (`UPSIDE`, `MOVIMIENTO_LOG`, `SIMULACION`, `PERFIL_COHORT`, `TRANSICION_DE_COHORT`, …) — those are views/jsonb/derived
- **Determinism:** same inputs ⇒ same output (state the test)
