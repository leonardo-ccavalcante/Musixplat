# 05D — Diagnosis Engine · LIVE (generalized · learning · extensible)   ·   [target: CÓDIGO]   [build: Claude+Codex]

> **Supersedes** the earlier `05D_generalized_diagnosis.md` draft (kept for history; this is canonical).
> Design locked via brainstorming + /problem-solving + /sat + /plan-ceo-review (2026-06-20, Leo approved).
>
> **Why this exists.** The deployed /diagnosis proves ONE problem (payment) with fixed input → reads as a
> canned simulation. This turns it into a **real, extensible, self-improving engine** demoable to the
> **Musixmatch CEO / VP Product / PRO Director**. Three executive claims it must make TRUE, not asserted:
>   1. **Resolve problemas DIFERENTES** — 5 distinct problem types, each E2E over real data.
>   2. **NÃO está fakeado** — every number drillable to its raw rows + deterministic SQL (§14).
>   3. **Eu poderia SUBIR CASOS NOVOS ao vivo e resolveria** — batch ticket ingestion, live new-case (L2),
>      live new-type-by-config (L3), and a **growing pgvector memory** the audience watches learn.
>
> **Non-negotiable invariants** (CLAUDE.md §3): numbers ALWAYS from deterministic SQL (§14); LLM/RAG NEVER
> produces a number (§8); `tenant_id` server-side (§7); every result column NULL pre-run; provenance per field.

---

## §A — The integrity spine (read first)

Two physically separated planes. This separation IS the anti-fake guarantee:

```
  JUDGMENT plane  (text only — may use LLM/RAG, may vary, shown with reasons)
     classify type · rank hypotheses · retrieve precedents · explain
        │  chooses WHICH measurement to run  ▼
  ─────────────────────────────────────────────────────────────────
  MEASUREMENT plane  (numbers only — deterministic SQL, NULL pre-run, never LLM)
     affected · silent · €-at-risk · 1:10 · concentration
```

**The honest line (KA1, rehearsed for a technical VP):** *"The AI chooses the QUESTION; SQL gives the ANSWER.
A number is never invented. If the AI chooses the wrong type, you SEE the low confidence / the two brains
disagree → it routes to a human. The measurement itself is always exact."*

RAG/embeddings live ENTIRELY in the judgment plane. They influence *which* number is computed, never the
number. "Learning" = **retrieval over a growing precedent memory** (institutional memory), explicitly
**NOT** model fine-tuning. Never say "the AI trains itself."

## §B — Functionality

- **Goal:** operator (or audience) drives the whole spine in-product — ingest tickets / add a case / teach a
  type → classify (2 brains) → diagnose → hunt the silent → quantify € → dossier → artifact → human gate →
  1:10 — with a visible, growing memory and every claim auditable.
- **Composes / cites:** 05B (orchestrator B.2→B.8, dossier gate, silent-hunt) · 05C (artifact) · 05DE (roi
  1:10) · 05A gov (`Decision_Trace`, `Knowledge_Case`). **04 §:** §3, §6, §7, §8, §14.

### B.1 — Generalized engine (descriptor registry)
Each problem type = a **descriptor** (not bespoke code): `{affected_signal, impact_signal, concentration_dim,
area_type, hypotheses[], metric}`. The engine reads the descriptor and runs the SAME pipeline. Built-in types
AND live-defined types use the SAME path (integrity: a VP asking "is the live one the real engine?" → yes).

**The 5 built-in types (real columns — zero fake):**
| type | affected (bad event) | impact € | source |
|---|---|---|---|
| `payment` | `Order.payment_status='failed'` | `sum(net_value)` failed | Order |
| `connection` | `Weekly_Connection`: `connected/committed < knob` | GMV of disconnected window | Weekly_Connection, Order |
| `menu_quality` | restaurant w/ high share `has_photo=false`/`has_description=false` | GMV vs conversion baseline | Order |
| `cancellation` | `cancelled_by='restaurant'` rate `> knob` | `sum(net_value)` cancelled | Order |
| `adoption` | `Usage_Event`: stopped using feature (gap `> knob` days) | at-risk GMV of affected | Usage_Event, Order |

Silent (all types) = affected WITHOUT a `Conversation_Episode`. Slicing axis = **segment** (`Restaurant.segment`/`tier_base`).

### B.2 — Two-brain classification (label-independent)
- **Brain 1 — deterministic** (`reasoning.ts` keyword regex, exists): always stable, 2/2 on reruns. The floor.
- **Brain 2 — AI + RAG**: embed(ticket) → kNN over precedent memory → type + neighbors + similarity score
  (temperature 0). Reuses the existing `DiagnosisReasoning` seam (`classifyArea`/`rankPaths`).
- **Label-independent inference (the "learned vs copied" proof):** when input carries a type label (CSV
  column), the engine **ignores it during inference**, then **compares**: "inferred X from text; label said X →
  MATCH ✓ / MISMATCH (here's why)". Proves learning, not label-copying.
- **Agreement gate:** brains disagree OR similarity below threshold OR confidence below floor ⇒ `needs_human`
  (fail-closed, already in orchestrator B.2). Numbers never auto-commit on low confidence.

### B.3 — Growing memory (pgvector, the visible "learning")
- Precedents (resolved `Knowledge_Case` rows) carry an **embedding** (pgvector). Grounding B.6 becomes
  **semantic top-k** (was "5 latest by area_type").
- **Grow-on-resolve loop (NEW):** resolving a case writes a precedent + its embedding → the next similar
  ticket retrieves it, cites it, confidence rises. THIS is the visible continuous improvement.
- **Visible:** live precedent counter, retrieved neighbors + scores on screen. Optional human-readable
  `playbook.md` the engine appends lessons to (showable/auditable) — DECISION: DB-first; playbook as stretch.

### B.4 — Batch ticket ingestion (the scale "wow")
200 tickets → classify each (2 brains) → **group/dedup** (one open problem per restaurant; repeat → frequency++,
exists in `reportProblem`) → diagnose each cluster → hunt silent FROM THE DATA → prioritize by €.
**Honest buckets** (shown, never dropped): unknown class · no backing data · low confidence → `needs_human`.
Headline: "200 tickets → N real problems → M silent behind them → €X."

### B.5 — Live interactivity (audience can drive)
- **L2 new-case:** form → audience sets INPUTS (count, %, zone, segment) → inserts INPUT rows into demo pool →
  run. Number derives from what they entered. (Inputs are `[C]`/`[V]` data; results stay NULL-pre-run, SQL.)
- **L3 teach-a-type:** guided form → pick `column + operator + threshold + impact metric` from a **whitelist**
  → compose a NEW registry descriptor (parameterized query, **never raw SQL from user**) → run. A class defined
  30s ago is resolved → literal platform proof.

### B.6 — Honest degradation (credibility, not a bug)
Off-distribution request (no detector / no data / no near neighbor) ⇒ explicit: *"I can't measure this yet —
I'd need signal X + data Y."* Explicit limit that works inside it = what convinces executives.

### B.7 — Contract (E2E)
- TRIGGER-IN: user/audience action — `ingestBatch(tickets)` · `runCase({type,segment,params})` · `defineType(descriptor)` · `runDiagnosis({problemId})`
- DATA-IN: Order/Weekly_Connection/Usage_Event/Conversation_Episode · Restaurant.segment · Knowledge_Case(+embedding) · knobs by name
- DATA-OUT: `Affected{complained,silent,evidence}` · `Diagnosed_Problem{area_type,confidence,revenue_lost,case_repo,...}` · `Generated_Artifact` · `Decision_Trace`(classification trace) — all via named producer, NULL pre-run (§14)
- TRIGGERS-FIRED: artifact.decide (human gate) → roi 1:10 (read terminal)

- **Done-when:** Given the seeded multi-type pool, When operator/audience runs any `{type,segment}` / uploads a
  batch / teaches a type, Then a REAL, distinct reverse-cascade + dossier + artifact appear, the memory grows
  visibly, classification shows 2 brains + label-match + 2-run consistency, every number drills to its SQL, and
  off-distribution degrades honestly. **Check:** `pnpm test:antifake` · `pnpm test:sql` · `pnpm test:integration` · `pnpm test:e2e` · `pnpm test:a11y`.

## §C — Design (console, anti-SAP)

**One console.** Hierarchy = result first, evidence on demand.
```
┌── Diagnosis Engine ───────────────────────────────────────────────┐
│ Headline:  N tickets → P problems → S silent → €X                  │
│ [Ingest batch] [+ New case] [+ Teach a type] [Reset]               │
│ Board: problems · type · silent · € · priority · [needs-human pile]│
│   └ click a problem → side panel "How I know":                     │
│       • 2 brains side by side (rule ✓ / AI ✓) + why                │
│       • CSV label vs AI-inferred (blind) → MATCH ✓                 │
│       • ran 2× → 2/2 stable (pre-warmed; only new case runs live)  │
│       • Memory: 3 → 4 precedents (+ nearest neighbors & scores)    │
│       • drill-down: every number → its raw rows + SQL              │
└────────────────────────────────────────────────────────────────────┘
```
- Tokens `--mxm-*` dark-only · fluid `clamp()` + logical props · WCAG 2.1 AA (focus-trap modals, color never
  sole carrier, explicit loading/empty/error — never green-fake).
- Reuse: SpineTimeline / DiagnosisBoard / ArtifactQueue / DossierModal. New: ingest panel, "How I know" panel, memory strip, teach-a-type form.
- **Visual system + UX = `/design-consultation` then `/plan-design-review`** (next phase) — anti-SAP bar: one
  console, few actions, obvious hierarchy.

## §D — Data

- **Tables (04 §3):** `tenant.{Order, Weekly_Connection, Usage_Event, Restaurant, Conversation_Episode, Affected, Diagnosed_Problem, Knowledge_Case}` · `gov.{Generated_Artifact, Decision_Trace, Security_Log}` · `catalog.Problem_Type` (NEW registry).
- **Schema deltas:**
  - extension `vector` (pgvector); `Knowledge_Case += embedding vector` (+ ivfflat index). **Embeddings GENERATED by a LOCAL model in the Node process** (e.g. transformers.js / a small ONNX model like all-MiniLM — no external API) and **STORED** in pgvector. (SAT KA5 — no network, no EU residency issue, no stage dependency.)
  - `catalog.Problem_Type(problem_type pk, area_type, affected_descriptor jsonb, impact_descriptor jsonb, concentration_dim, metric, origin 'builtin'|'live', active)`.
  - `Diagnosed_Problem += problem_type text not null default 'payment', segment text`.
  - per-type producers driven by descriptor: `fn_affected(problem,tenant,window,segment)` dispatches on `problem_type`; `fn_impact(problem)` per type. All write result cols NULL-pre-run.
  - `Decision_Trace +=` classification trace fields (inferred_type, brain, neighbors jsonb, scores, run_consistency, label_match) — append-only audit (reuse existing append-only table; extend, not new).
- **Gates:** RLS zone + `tenant_id` server-side · k-anon/n_min unchanged (separate) · UNIQUE `(problem,restaurant)`, `(problem,artifact_type)`.
- **Config_Perillas by NAME:** `window_silent` · NEW `connection_min_ratio`, `cancel_rate_max`, `menu_quality_min`, `adoption_gap_days`, `similarity_threshold`, `classification_floor` · `monitor_cost_default`. Never a literal.
- **Phantom check (§4):** creates only `catalog.Problem_Type` + columns + pgvector index. No denylisted table.
- **Determinism:** measurement plane fully deterministic (pgTAP per producer); judgment plane non-deterministic BY DESIGN, made transparent (trace + 2-run consistency + threshold).

## §E — SAT blindagens (baked into the build)

| Risk | Blindagem (build requirement) |
|---|---|
| KA1 RAG influences which number | Frame "AI picks question / SQL answers"; 2-brain + confidence + human-gate make wrong type visible |
| KA3 live nondeterminism | temperature 0; deterministic brain always stable; 2-run live only on verified-stable curated case; variance = a DELIBERATE moment on a known-ambiguous case → human |
| KA4 latency on stage | pre-warm curated batch (embeddings+classify+trace precomputed); live = only the new case; kNN is ms |
| KA5 embeddings dependency | **LOCAL in-process embeddings** (chosen — model in Node, vectors in pgvector) → no network, no EU residency; deterministic fallback if anything fails |
| KA6 wrong neighbor | `similarity_threshold`; below ⇒ deterministic brain + needs_human; score always visible |
| KA7 cold-start | deterministic brain is the floor; seed memory with curated cases; optional "watch it learn from zero" arc |
| WI3 "is it a lookup?" | rehearsed demo: correct match on a phrasing sharing NO keywords with any precedent ⇒ proves semantic, not string-match |

## §F — Phased delivery (output visible each phase; 1 commit/phase, gate green)

> Time is not the constraint (Leo). Build the full vision; phase to keep it always-green and stage-proof.

- **F0 — Registry + parameterize** the 3 payment-coupled producers (`fn_hunt_silent`, `fn_impact_revenue_lost`, concentration query) into descriptor-driven; payment stays E2E via the general path. Zero-regression refactor.
- **F1 — 4 new types** (connection → cancellation → menu_quality → adoption), each: descriptor + SQL producers + KB precedent + segment fixtures + tests. Each = the reverse-cascade, real.
- **F2 — pgvector memory:** extension + embeddings + semantic grounding + grow-on-resolve loop + memory strip UI.
- **F3 — 2-brain + label-independent + trace:** AI brain wired, blind inference + compare, `Decision_Trace` extension, "How I know" panel, 2-run consistency.
- **F4 — batch ingestion + dedup + buckets** (the scale headline).
- **F5 — L2 new-case + L3 teach-a-type** (whitelist-composed descriptor).
- **F6 — honest degradation + reset + stage-proofing** (pre-warm, fallbacks, rehearsed moments).
- **F7 — `/design-consultation` + `/plan-design-review`** pass on the console; a11y + visual polish.

Per phase: R0 reuse → R1 contract (Zod/SQL sig) → R2 red test (anti-fake first) → R3 impl ≤100ln/unit → R4 green → R5 gates → R6 provenance/observability → R7 Codex adversarial review + commit.

## §G — Open honesty boundaries (state plainly; never overclaim)
- "Learning" = retrieval over growing memory, NOT fine-tuning. Say so.
- Live-defined type (L3) needs backing data; no data ⇒ honest "can't measure yet."
- € impact normalized to "at-risk GMV" across types for board/1:10 coherence — label it a floor, not a ceiling (churn not measured).
- Demo data is synthetic; the ENGINE is production logic. Say that too — it's the most disarming line.

## §H — Console design (on-brand, anti-SAP) · feeds /plan-design-review

**Principle:** ONE route (`/diagnosis`), result-first, evidence on demand. Everything is this console + overlays
(Sheet/Dialog) — no nav maze, no new pages. Progressive disclosure, not 50 screens. Honors `--mxm-*` only.

```
┌─ Diagnosis Engine ──────────────────────────────────────── [Reset] ─┐
│  Support · Diagnosis                                                 │
│  HEADLINE (post-run, count-up, aria-live):                          │
│    210 tickets → 38 problems → 1,294 silent → €182,400 at risk      │
│  ──────────────────────────────────────────────────────────────────│
│  [⤓ Ingest batch]   [+ New case]   [+ Teach a type]                 │  primary=coral, rest=outline
│  ──────────────────────────────────────────────────────────────────│
│  BOARD (DataTable, sortable by € / priority)                        │
│   type      │ problem         │ silent │ € at risk │ priority        │
│   ⛒ payment │ payment failed  │  35    │ €12,400   │ ●●● High        │ → row → Sheet
│   ⚡ conn    │ low connection  │  22    │ €7,100    │ ●●  Med         │
│  ─ Needs human (honest pile) ───────────────────────── 7 ─────────── │  distinct, always visible
│   ambiguous · no backing data · low confidence (reason shown)       │
└──────────────────────────────────────────────────────────────────────┘

 Sheet side="right" — "How I know — payment failed @ R-PAY-001"
 ┌──────────────────────────────────────────────┐
 │ Verdict: payment · conf 0.86 · [C]            │
 │ ── Two brains ──────────────────────────────  │
 │ ┌ Rule (det.) ✓ ┐   ┌ AI + RAG ✓ ┐            │
 │ │ matched: pago,│   │ nearest: #4 │           │
 │ │ reembolso     │   │ sim 0.92    │           │
 │ └───────────────┘   └─────────────┘           │
 │ Label(CSV): payment · Inferred(blind): payment │
 │      → MATCH ✓                                  │
 │ Consistency: ran 2× → 2/2 stable   [badge]     │
 │ ── Memory ──────────────────────────────────   │
 │ precedents 3 → 4 (learned now) ▲               │
 │ neighbors: #4·0.92  #1·0.71  #9·0.55           │
 │ ── Drill-down (accordion) ─────────────────    │
 │ ▸ 35 silent → [raw rows table] + SQL           │
 │ ▸ €12,400  → [orders table]   + SQL            │
 └──────────────────────────────────────────────┘
```

**Component map (shadcn/ui + tokens):**
- Shell: existing `<main>` container (`max-w-screen-xl`, fluid padding).
- Headline: custom; `tabular-nums`; count-up via small hook (opacity/transform only, reduced-motion ⇒ instant); `aria-live="polite"`.
- Action bar: `Button` — primary coral (`--mxm-paletteBrand100`) for the lead action, outline for rest; **disable + spinner during async** (UX: loading-buttons); `Reset` = destructive-outline → confirm `Dialog`.
- Board: `DataTable` (TanStack Table) sortable by €/priority; `overflow-x-auto` wrapper; row `cursor-pointer` + hover `--mxm-backgroundHover`; type = Lucide icon + label (**color never sole carrier**); priority = dots + text.
- Needs-human pile: distinct muted `Card`/`Accordion` below board, count `Badge`, per-row honest reason — never hidden.
- "How I know": `Sheet side="right"` (focus-trap + Esc + focus-return built-in); two brains = 2 `Card`; verdict/consistency = `Badge`; drill-down = `Accordion` → `Table` of raw rows + read-only `<pre>` SQL.
- L2/L3: `Dialog` + `Form` (react-hook-form + zod). L3 = `Select` (column/operator/metric) + `Input`/`Slider` (threshold), **never raw SQL**; live "will match N rows" preview before run (causality).
- Run status: `aria-live` region ("Reporting → diagnosing → generating…").

**Tokens / hierarchy:** canvas `#131313` · cards/sheets `#1F1F1F` · borders `#343434` · text white / `#BDBDBD` / `#828282`. Coral = primary button + the **silent** headline figure + active states, used sparingly (subtraction). **Contrast:** coral for fills/large numbers/icons only — NOT small body text (risks <4.5:1 on dark); white for text. Provenance chips reuse existing `[C]/[I]/[V]` legend.

**Motion:** 150–300ms color/opacity; count-up + new-row fade-in on run; memory counter subtle pulse on increment — ALL gated by `prefers-reduced-motion`.

**a11y (WCAG 2.1 AA):** Sheet focus-trap/Esc/return; `aria-live` on headline + run status; every status carries icon+text (MATCH ✓, brains ✓, priority dots+label); keyboard order L→R, T→B; 44px targets; semantic `<thead>/<tbody>`; `<label for>` on all inputs; explicit loading (skeleton) / empty ("no problems — ingest a batch") / error (fail-closed) / needs-human — never green-fake, NULL ⇒ conservative empty.

## §I — UI/UX review additions (/plan-design-review, mode A) · raised design 7→9/10

**Pass 1 — IA (constraint worship):** if only 3 things survive, they are: the **reverse-cascade headline number**, the **top problem by €** in the board, and the **lead action** (Ingest/Run). Everything else is secondary/tertiary (board detail) or on-demand (Sheet).

**Pass 2 — Interaction states (what the USER sees; never green-fake):**

| Feature | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Headline | skeleton `— → — → —` | "Ingest a batch or add a case to begin" | keep last good + error chip | numbers **count up** (aria-live) | computed parts shown; uncomputed = `—`, never 0 |
| Ingest batch | button spinner + "classifying 120/210…" | dropzone "drop a CSV / load sample inbox" | per-row reject list ("12 skipped: no restaurant_id") | toast "210 → 38 problems" | classified vs → needs-human split shown |
| Board | skeleton rows | "No problems yet — ingest a batch" + CTA | fail-closed banner + retry | rows | **stream rows as they resolve** + shimmer on pending |
| Needs-human pile | — | "Nothing needs a human — all confident" (positive) | — | count + reason per row | grows as batch runs |
| How-I-know | skeleton sections | "No reasoning captured" | "trace unavailable" | full panel | AI brain failed ⇒ show rule-only + honest "AI unavailable" |
| Memory strip | counter skeleton | "Memory empty — watch it learn" | — | counter + neighbors | neighbors below threshold greyed "too far to trust" |
| L2 new-case | "will create N rows…" preview | form defaults | inline validation | runs → board updates | — |
| L3 teach-a-type | "will match N rows" live preview | guided defaults | **"no data backs this signal"** (honest degradation) | new type runs | — |
| Reset | spinner "rebuilding pool…" | — | retry | toast "clean" | — |

**Pass 3 — Demo journey + magic-moment & latency choreography (the stage half of the game):**

| # | Audience does | Feels | Plan supports |
|---|---|---|---|
| 1 | Lands (board PRE-WARMED) | "whoa — 1,294 silent / €182k" | instant render, no wait; headline count-up |
| 2 | "is it real?" → opens How-I-know | skeptical → reassured | 2 brains agree + drill-down to raw rows + SQL |
| 3 | "learned or copied?" | convinced | label-vs-inferred MATCH on blind inference |
| 4 | **adds a NEW case (L2)** | "works on MY data" | **the only real wait (2–4s)** → staged microcopy "classifying → diagnosing → hunting silent" (aria-live) + skeleton of incoming row, never frozen → count-up |
| 5 | teaches a type (L3) | "it's a platform" | instant "will match N rows" preview → run → new class resolved |
| 6 | asks off-distribution | trust | needs-human pile / "can't measure yet — needs signal X + data Y" |

**Latency rule (stage-proof):** ONLY live waits = L2 new-case run + L3 run. Everything else pre-warmed (embeddings/classification/trace/2-run consistency precomputed). Each live LLM call ≤2s, temperature 0; never a frozen screen — staged microcopy + skeleton row.

**Pass 4 — AI-slop guardrails (App UI ruleset):** board = real `<Table>` (NOT card mosaic) ✓ · two-brain = exactly 2 surface cards (card IS the comparison) — no icon-in-colored-circle, no colored left-border · memory = inline list, not card grid · one accent (coral), no purple gradient · Gordita display (no system-ui) · no centered-everything. Cards must earn their pixels.

**Pass 5 — Design-system alignment:** reuse `DiagnosisBoard`/`ArtifactQueue`/`DossierModal`/`SpineTimeline` + shadcn `Sheet/Dialog/Table/Form/Badge/Accordion/Button`. New components (fit existing vocab, surface tokens only): `IngestPanel`, `HowIKnowSheet`, `MemoryStrip`, `NewCaseDialog`, `TeachTypeDialog`, `NeedsHumanPile`.

**Pass 6 — Responsive (intentional per viewport):**
- **Projector/desktop ≥1440** (primary): board + Sheet side-by-side; headline one line.
- **Laptop 1024–1439** (VP's screen): same; Sheet narrower (`clamp` width).
- **Tablet/mobile <768**: Sheet → full-screen overlay; board rows → stacked cards; headline wraps to 2 lines; actions → overflow menu.
ARIA landmarks: `main` · `region`(board, aria-label) · `complementary`(Sheet). Focus moves into Sheet on open, returns to row on close. `prefers-reduced-motion` ⇒ count-up/stream become instant. Coral never as small text (contrast).

**Pass 7 — Decisions (resolved with Leo 2026-06-21):**
- D1 ingest = **"load sample inbox" button + paste box** (stage-proof instant + audience-supplies moment).
- D2 headline **count-up ON** (gated by `prefers-reduced-motion`).
- D3 board = **streaming rows** (resolve live one-by-one + shimmer on pending).
- D4 memory = **seeded baseline (3-4 precedents) + live increment on resolve + a "reset to zero" button** to show learning from scratch on demand.
- D5 brain labels = **friendly + technical tooltip**: "Rules engine" / "AI (with memory)" on the surface; tooltip reveals "deterministic" / "RAG + pgvector" for the technical VP.

## §J — Reconciliation vs current `origin/main` (2026-06-21, after P06/P07/p02/cockpit landed)

The build started on a stale base (`e95cb32`); `origin/main` (`56ca77f`) moved +28 commits and **already ships** much of this spec's planned infra. Deep recon + /problem-solving + /sat. **Build the GAP, reuse the rest.**

**Already on main (REUSE, do not rebuild):**
- pgvector + kNN: `server/knowledge/store.ts → searchKnowledge()` (cosine, threshold-by-knob, tenant-scoped) — the "semantic top-k", over `tenant.Knowledge_Chunk.embedding vector(1536)` (hnsw cosine).
- embedder: `server/knowledge/embedder.ts → resolveEmbedder/embedWithRetry` (**OpenAI `text-embedding-3-small`, dim 1536**; deterministic hash fallback under VITEST/no-key).
- 2-brain seam: `server/diagnosis/reasoning.ts` (`deterministicReasoning` + `llmReasoning(client,onUsage?,model?)`); orchestrator uses ONE at a time today.
- LLM+cost (P07): `server/_core/{llm,usage,model}.ts`, `gov.Llm_Usage_Log` + `gov.v_llm_cost`, `getActiveChatModel()`, router `cost.ts`.
- orchestrator already wires `searchKnowledge` at B.6.5 (over doc chunks) + grounds `Knowledge_Case` "5 latest by area_type" at B.6.
- UI: all diagnosis components + the cockpit-redesign screen pattern (CockpitPage/CockpitBoard, `mxm-*` tokens, `LoadingState/ErrorState/EmptyState`, `ProvenanceBadge/Legend`).

**DECISION (reverses earlier "local embeddings", §D/§E KA5):** adopt **main's OpenAI 1536/hnsw** stack (reuse everything) + **pre-warm** the curated demo set offline so only the audience's live case makes 1 API call; demo data is synthetic (no real EU PII). Do NOT add a divergent local 384 stack. (Supersedes the §D "LOCAL in-process embeddings" line.)

**The REAL gap (MECE, after subtracting what exists):**
1. 4 non-payment type descriptors (connection/cancellation/menu_quality/adoption) wired into F0's `fn_hunt_silent`/`fn_impact_revenue_lost` `case` dispatchers + `PROBLEM_TYPES`.
2. **Learning memory:** `Knowledge_Case += embedding vector(1536)` + hnsw + a precedent-kNN fn (mirror `searchKnowledge`) + **grow-on-resolve** (embed+insert precedent on resolution). (Today embeddings live on `Knowledge_Chunk`/docs, NOT on precedents.)
3. Dual-brain run (BOTH providers) + agreement gate + blind label-vs-inferred compare + 2-run consistency + persist to extended `Decision_Trace`.
4. `ingestBatch` (classify→dedup→diagnose→silent→prioritize) + honest buckets + headline.
5. L2 `runCase` (insert input rows + run) + L3 `defineType` (whitelist→`Problem_Type` origin='live').
6. Console on `/diagnosis` (new components; `Sheet/Table/Form/Accordion` are net-new — only `Modal/Disclosure/Card` exist today).

**F0 rebase:** orchestrator/silent/contracts had ZERO drift on main; `reasoning.ts` was never edited by F0 → **clean rebase**. ONLY fix = renumber the 3 F0 migrations (`20260621000001/2/3` → `20260621000002/3/4`; main already holds `…0001_llm_usage_cost`). No DB-object collision (main has no `Problem_Type`/`segment`/dispatchers). Adopt main's embedding reality when wiring piece 2.
