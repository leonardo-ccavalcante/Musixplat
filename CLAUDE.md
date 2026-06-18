# CLAUDE.md — code-agent operating guide (canonical)

AI-first Customer-Ops platform (Uber Eats domain). This file is the **single source of truth** for HOW to build the **242 CÓDIGO pieces** in `specs/breakdown_CODE_AGENT.md`. Codex reads `AGENTS.md`, which imports this file. Every piece's `[STACK-TUNE: <cmd>]` resolves to a real command in **§1**.

## §0 — How to read this · default mode

- **Default comms mode = `/caveman`** (ultra-compressed; drop filler, keep full technical accuracy). Applies to agent chatter, commits, PR bodies — never to code, tests, or this file.
- Anti-bloat rule (applies to edits of this file): for each line ask *"if I remove it, will the agent make a mistake?"* — if no, cut it. Bloated guides get ignored.
- **Code & data are ENGLISH** (identifiers, columns, enum values, UI strings, seed data). Flipped 2026-06-18 per Leo. The Spanish source specs (`04 §`) are the *conceptual* reference; translate their domain terms to English in code: `Restaurante`→`Restaurant`, `Orden`→`Order`, `Evento_Uso`→`Usage_Event`, `Config_Perillas`→`Config_Knobs`, `zona`→`zone`, `tipo_comida`→`cuisine`, `status_pago`→`payment_status`, etc. Canonical glossary = `scripts/rename_to_english.py`.
- Section `04 §N` means `specs/spec_ready/04_arquitectura_de_datos.md` section N. The data model there is authoritative; this file does not restate it, it points to it.

## §1 — Stack & repo map · resolves every `[STACK-TUNE]`

Stack is all-TypeScript, proven on Manus deploy (ref `leonardo-ccavalcante/bocatas_digital`). **Manus = deploy/OAuth layer only; it does not dictate the stack.** Pin these versions — do not invent newer APIs (Block H, package hallucination).

| Layer | Tech | Notes |
|---|---|---|
| Build | Vite 7 + TypeScript strict | zero `any` |
| Frontend | React 19 + wouter | SPA, mobile-first |
| API | tRPC v11 + Express | end-to-end typed; tenant resolved server-side |
| UI | shadcn/ui + Tailwind | dark-only; tokens `--mxm-*` from `Design/musixmatch-pro-design-spec.md`; WCAG 2.1 AA |
| Validation | Zod v3 | single source of truth |
| Server state | TanStack Query v5 | |
| UI state | Zustand v5 | |
| State machine | XState v5 | complex flows only (e.g. sandbox) |
| DB | Supabase Postgres + RLS + Realtime | EU region |
| **Deterministic jobs** | **TS + SQL, ZERO Python** | math lives in Postgres functions / `Named_Query`; orchestration/scheduling in TS (Edge/Deno or Node worker + `pg_cron` / n8n schedule) |
| Deploy | Manus | OAuth `oauth.manus.im`, Forge API |

**Repo map** (mirror Bocatas): `client/src/{pages,features,components,components/ui,lib,hooks}` · `server/{routers,_core,db}` · `shared/` (types imported by both sides) · `supabase/{migrations,functions}` · `e2e/` · `tests/`.

**Real commands** — substitute these for the breakdown placeholders:

| `[STACK-TUNE: …]` placeholder | Real command |
|---|---|
| `<comando test>`, `<vitest>`, `<comando test componente>` | `pnpm test` (Vitest) |
| `<comando test CI anti-fake>`, `<ci anti-fake>` | `pnpm test:antifake` (Vitest+pgTAP gate; see §3) |
| `<pgtap>`, `<comando test SQL>` | `pnpm test:sql` (pgTAP) |
| `<comando e2e>`, `<playwright e2e>` | `pnpm test:e2e` (Playwright) |
| `<a11y>`, `<playwright a11y>` | `pnpm test:a11y` (Playwright + axe) |
| `<type-check>`, `<typecheck>` | `pnpm typecheck` (`tsc --noEmit`) |
| `<comando integración>` | `pnpm test:integration` |
| `<comando test RLS>`, `<comando test concurrencia>` | `pnpm test:integration` (RLS/concurrency are integration tests; `RLS_TESTS_ENABLED=1`) |
| build / lint / db | `pnpm build` · `pnpm lint` · `supabase db reset` · `supabase migration new <name>` |

CI gate (GitHub Actions) runs: lint · typecheck · test · test:sql · test:antifake · test:e2e · Lighthouse. A piece is not done until its gate is green **with evidence** (command + output).

## §2 — Task framing (Block B)

- Each piece in the breakdown already ships **Goal / Context / Constraints / Done-when**. **Read the piece; do not re-invent it.** Implement to its Done-when, cite its `piece_id` + `04 §`.
- Goal = outcome, not method. Explore → plan → code → commit. One thread per piece.
- Reference existing patterns/files concretely; do not describe abstractly.
- Missing evidence ⇒ tag `[ASSUMPTION — why: …]` or `[UNVERIFIED]` and resolve with tools, never guess.

## §3 — Data invariants = build contract (from `04`, NON-NEGOTIABLE)

The heart. Every piece obeys these; each maps to a test.

1. **§14 anti-fake / NULL-pre-run (MASTER).** Every RESULT column is `NULL`/conservative before its producer runs. Only a named producer (`Named_Query` / job / trigger / agent) computes it. **Never seed a result number. Never edit/skip a test to pass** (reward-hacking — same fatal class). Enforced by `pnpm test:antifake`: after seed, before jobs, every result column must be NULL; build fails otherwise.
2. **k-anon ≠ n_min (§3.2/§7).** `k_anon_threshold` suppresses cross-tenant insight at the **output frontier** (`supresion_k_aplicada`). `n_min_threshold` collapses a cell to qualitative mode internally. Two different constraints — separate code, separate fixtures, never merged.
3. **Financial hard-no (§7).** `clase_financiera=directa` ⇒ AI only PROPOSES; never auto-releases money / moves balance. Anti-fracturing: N micro-orders vs `umbral_antifrac` per restaurante/window.
4. **RLS single-pool (§7/§8).** `tenant_id` resolved **server-side** (anti-spoofing), never from client body. Cross-restaurante within a pool is normal; cross-pool = abort + red-block + security log. (RLS Postgres policies are written but deferred per `04 §13`; the active enforcement today is the server-side tRPC guard.)
5. **`cohort_rule_version` anti-mezcla (§6/§7).** Stamped per row. Never mix baselines across versions; a KPI shows a number only if `formula+periodicidad+group_by == def_version` cited. Fail-closed via the shared anti-mezcla guard (`01:F-4.3`), reused across `01:F-1.6`/`01:F-2.2`/`01:F-4.2` (one guard, not duplicated per screen).
6. **Deterministic never LLM (§2/§14).** Measurement = `Named_Query` (SQL). LLM only proposes/ranks **text**, never produces a number.
7. **Fail-closed (mother rule, §7).** Any failure / missing input degrades to conservative state or to human — never to an optimistic default.
8. **Config_Perillas by NAME (§3.4).** Every threshold read by name: `k_anon_threshold`, `n_min_threshold`, tenure-bucket borders, `D`, `TTL_baseline`, `umbral_antifrac`, `retencion_PII`, `costo_por_respuesta`. Never a hard-coded literal.
9. **Phantom denylist (§4).** Do NOT `CREATE TABLE` for `UPSIDE`, `MOVIMIENTO_LOG`, `TRANSICION_DE_COHORT`, `SIMULACION`, `PERFIL_COHORT`, `PerformanceFeed`, etc. They are views / jsonb / derived fields / sandbox.
10. **Provenance per field; `autonomy_level` is an ordered ENUM** (`'LOW','MEDIUM','HIGH'`, never varchar — declaration order, not alphabetical, drives `least()` fail-closed to LOW). No provenance ⇒ no render/export.

## §4 — Quality per unit (Block D)

- **≤100 lines per unit**; split larger into reviewable passes.
- **Reuse before create**: scan `components/ui`, hooks, utils, `server/` queries; create new only stating WHY reuse is impossible.
- **Production-ready**: error handling + edge cases + a11y + security + observability; zero dead-code; a `TODO` is tracked follow-up, not silent debt.
- **a11y WCAG 2.1 AA**: modal focus-trap + Esc + focus-return + `aria-modal`; color is never the sole carrier (redundant text/icon); explicit loading/empty/error states (never green-fake).
- **Fluid + themed**: `clamp()` + logical properties (RTL-ready); `--mxm-*` tokens only, dark-only, no invented colors.
- **Secrets by env-var NAME, never the value.** See `.env.example`.

## §5 — Verification loop (Block E)

- Tests are part of Done. Write the failing test first (red → green → refactor); the piece's "Check ejecutable" is that test.
- Delivery gate: lint + typecheck + test + behavioral/a11y, **with evidence** (command + output, not "it passes").
- 3-pass self-review (generate → self-critique vs Done-when → refine). Each loop = one focused change so failures stay attributable.
- UI: visual check against the rendered artifact (Playwright screenshot), not code alone.
- A test failure is feedback to reflect on and retry, not a stop.

## §6 — Safety & change control (Block F)

- **Human owns the merge.** Agents surface diffs; nothing ships autonomously.
- Least-privilege scopes; write confined to the working branch.
- **Never put `.env`/secrets in this file or any committed file.** Reference names only.
- **Never modify, delete, or read-through a test to make it pass** (reward-hacking). Red test ⇒ fix production code.
- Small diffs: large PRs lower review quality (Block H).

## §7 — Skill-driven build workflow (Block G + superpowers)

Roles: **Claude (ultracode) = primary Writer** of every piece · **Codex = adversarial Reviewer in a fresh context** (refutes the diff vs Done-when; sees only spec + diff + test output, not the writer's rationale). Criterion = *less bug*. Risk-max pieces (anti-fake / money / RLS / k-anon) get **double-implement + behavioral diff**, converging to the stricter implementation; irreconcilable divergence ⇒ escalate to human.

Every build session **opens with `/using-superpowers`** (mandatory): before any action, invoke the relevant skill, announce *"Using [skill] to [purpose]"*, turn its checklist into TodoWrite items, process-skills before implementation-skills. **Skills are invoked, not cited** — the discipline (TDD, systematic debugging, adversarial review) is what reduces bugs.

Per-piece pipeline (each step = a skill actually called):
1. `/brainstorming` — align the piece's intent before planning.
2. `/spec-driven-development` — derive the executable spec from the breakdown piece.
3. `/writing-plans` — the step-by-step (= the **Workflow** block of the build-doc).
4. `/gstack-router` — route when the task crosses lifecycle phases.
5. `/test-driven-development` + `/testing-strategy` — test before code; the §3 anti-fake test comes first.
6. `/executing-plans` — Claude implements (Writer).
7. `/requesting-code-review` → Codex (fresh) refutes → `/receiving-code-review` (technical rigor, no performative agreement).
8. `/debug` + `/systematic-debugging` — on failure: hypothesis → reproducing test → fix → re-run gate.
9. QA triple-check before delivery: `/sat` + `/grill-me` + `/problem-solving` + product review.

Per-piece recipe (the loop all 242 follow): **R0** reuse-scan → **R1** contract (Zod/SQL sig/tRPC io = exact DATA-IN/OUT) → **R2** red test → **R3** impl ≤100 ln (determinism in SQL, threshold by name, `cohort_rule_version` per row, `tenant_id` server-side, nothing seeded) → **R4** green + anti-fake green → **R5** gates (typecheck/lint/a11y/secrets-by-name) → **R6** observability (provenance/ts, aria-live, security log on blocked cross-pool/version-mix) → **R7** Codex review + commit (1 piece = 1 commit citing `piece_id` + `04 §`).

## §8 — CODE ↔ AGENTE ↔ HUMANO handoff (E2E)

The master criterion is **E2E working**. Each CÓDIGO piece declares `TRIGGER-IN / DATA-IN / DATA-OUT / TRIGGERS-FIRED`; the contract must match the consuming AGENTE/N8N piece in `specs/breakdown_N8N.md`.

- **Golden rule:** CÓDIGO emits events + deterministic numbers; **AGENTE produces text/synthesis/ranking and never fabricates a number** (numbers always from `Named_Query`, §14); non-attributable cause is `[C]`/`[I]`, never `[V]`.
- AGENTE pieces run as n8n containers or TS; N8N containers only *sequence* CÓDIGO steps, they never re-implement a step's logic.
- **Before claiming a contract "fits":** grep the target doc for the same field names (bilateral). Canonical chain: `01:F-5.2` emits `Evento_Priorizado_NBA{cohort_id, restaurante_id}` → `02:1A` AGENTE proposes NBAs (payload round-trip resolves COL-13/COL-15).

## §9 — Limitations (Block H, honest)

Context degrades as it fills (use subagents/fresh threads). LLMs hallucinate packages/APIs (pin versions). Codegen is non-deterministic ("worked once" ≠ reproducible). "Tests pass" ≠ "behavior correct" (artifact/UX review still needed). Unmanaged large diffs lower review quality. A reviewer prompted to find gaps finds some even when sound — flag only correctness/requirement gaps, don't over-engineer. **A human owns every merge.**

## Build-doc per feature

For each feature the agent writes a build-doc from `specs/_build_doc_template.md` (three parts: `## Functionality` incl. the runtime **Workflow**, `## Design`, `## Data`). Worked example: `specs/build_docs/01_cohorts.md`.
