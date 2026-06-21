# REMAINING WORK — to a credible executive demo

> Generated 2026-06-21 by reading the repo (not from memory). Cites real file paths + line refs + PR numbers.
> Anchored to `specs/plans/2026-06-21-diagnosis-engine-live.md`, `specs/plans/2026-06-21-motor-llm.md`,
> `specs/build_docs/02C_motor_llm.md`, `specs/build_docs/02C_motor_llm_codex_review.md`,
> `specs/build_docs/05D_diagnosis_engine_live.md`, and `git log` / `gh pr list` (state below).
> Anything I could not confirm in code is marked `[UNVERIFIED]`.

---

## 1. Status snapshot

| Deliverable | State | Evidence |
|---|---|---|
| **05D F0** — registry + parameterize payment via descriptor engine | **DONE (merged PR #39)** | commits `471e6c8`..`fbab9f0`; `ca7b578` merge |
| **05D F1 / "CP1"** — 4 new diagnosis types (connection, cancellation, menu_quality, adoption) | **DONE (merged PR #40)** | commits `36de89f`,`cd7e032`,`8311ab9`,`833d5bd`; `7890040` merge |
| **05D descriptor-refactor** (proactive path descriptor-authoritative, enables L3) | **DONE (merged PR #41)** | `8e0b03e`; `b2915fd` merge |
| **CP2** — autonomous non-money execution (the floor: `autoDispatch`) | **DONE (merged PR #42)** | `4567ea9`,`4bb912f`,`58d529e`; `1d07bbf` merge |
| **02C MOTOR-LLM** (the hypothesis engine = effectively "CP3", see §2) | **IN-FLIGHT — local branch `feat/p02-motor-llm`, NOT pushed, NO PR** | 18 commits `ef8c30d`..`216f6b2`; `git for-each-ref` shows no upstream; `gh pr list --head feat/p02-motor-llm` empty |
| **02C Codex round-1 fixes** (9×P1 + 4×P2) | **DONE** | `f38a403`,`67bbfdf` |
| **02C Codex round-2 fixes** (5 of 7 P1 + 3 of 4 P2) | **DONE (partial — 2 P1 deferred by Leo)** | `216f6b2`; see §4 |
| **02D** — wire the diagnosis LLM into the /diagnosis UI | **REMAINING (not started)** | grep of `server/routers/diagnosis.ts` + `intake.ts` finds no `llmReasoning`/`diagnosis_use_llm`; UI runs the deterministic twin |
| **05D F2** — pgvector precedent memory + grow-on-resolve | **REMAINING** | `server/diagnosis/types/` does not exist; `Knowledge_Case` has no `embedding` col |
| **05D F3** — 2-brain classification + label-independent + `Decision_Trace` ext | **REMAINING** | not in `server/diagnosis/` |
| **05D F4** — batch ticket ingestion + dedup + buckets | **REMAINING** | no `ingestBatch` |
| **05D F5** — L2 new-case + L3 teach-a-type (whitelist compiler) | **REMAINING** | no `runCase`/`defineType` |
| **05D F6** — degradation + reset + stage-proofing | **REMAINING** | — |
| **05D F7** — anti-SAP console + design/a11y polish | **REMAINING** | console components in spec §H not built |

**Naming note on "Peça 1-6":** the operator's "Peças 1-6" map to the **"REAL gap (MECE)" list in
`05D_diagnosis_engine_live.md:298-305`** (6 numbered items), which the implementation plan
`2026-06-21-diagnosis-engine-live.md` phases as **F1-F7**. Peça-1 = F1 (4 types, DONE). Peças 2-6 = F2-F7
(REMAINING). I use the build-doc's numbering in §3 and cross-map to F-phases.

---

## 2. CP3 — what it actually is

There is **no deliverable literally named "CP3"** anywhere in the repo (grep finds CP1/CP2 only). The CP track
is: **CP1** = the 4 new diagnosis types (05D F1, PR #40) · **CP2** = the autonomy FLOOR (`autoDispatch`,
PR #42). The thing that comes next — and is the current work — is **02C MOTOR-LLM**.

**Therefore CP3 ≡ 02C MOTOR-LLM** (the engine that drives the CP2 floor). It is the central deliverable Leo
flagged in memory as "the motor-LLM is the next piece / the engine, not the floor."

- **Scope** (`specs/build_docs/02C_motor_llm.md`, `specs/plans/2026-06-21-motor-llm.md`): the AI proposes its
  OWN NBA hypothesis (LLM, text), a deterministic SQL analysis (`fn_nba_test_all`) falsifies/confirms it, the AI
  acts alone within the human-approved `Policy_Tier.allowed_today` range (non-money) or escalates honestly —
  across a ≤3-hypothesis loop, with the token cost of each decision visible.
- **Pieces (11 tasks / 7 phases, all implemented on branch):** Phase 0 motor knobs in `seed.sql`
  (`ef8c30d`) · Phase 1 `ProcessType 'motor'` + `MotorReasoning`/stub/`leverAdapter` (`f9ac369`,`b6ebfa5`) ·
  Phase 2 `validateHypothesis` (`043fee2`) · Phase 3 `learn.ts` + `runMotorAttempt` (≤3 loop) +
  `runMotorForCohort/Pool` fan-out (`47b5933`,`d048c88`,`b5ad0b2`) · Phase 4 `llmMotorReasoning` real provider
  (`1f2ed65`) · Phase 5 `motorRouter` + `controls.ts` (`8c95af5`) · Phase 6 Run-Motor UI + Escalated list +
  Autonomy Controls (`1f77d3c`,`a5de76e`) · Phase 7 `scripts/run-motor.ts` guarded real-LLM smoke (`e423860`).
  Files present: `server/motor/{reasoning,validateHypothesis,learn,runMotor,runMotorFanout,llmReasoning,controls}.ts`;
  router mounted at `server/routers/_app.ts:33`.
- **Done-when** (`02C_motor_llm.md:81-94`): acted ⇒ exactly one NBA auto-dispatched (origin=auto, confirmer
  null) + one `Knowledge_Case` + ≥1 motor `Llm_Usage_Log` row with non-null `v_llm_cost`; money-only gap ⇒
  nothing dispatched + escalated `out_of_range`; falsified lever ⇒ discarded + retry ≤3 else `exhausted_3_loops`;
  removing an action from `allowed_today` ⇒ engine stops auto-acting; `reviewed=false` case does not ground until
  approved. Gate = `pnpm test · test:antifake · test:integration · test:sql · typecheck · lint`.
- **Dependencies:** built ON TOP of CP2 (reuses `autoDispatch`, `sealMinCalculationNBA`, `proposeNba`
  unchanged — §3.11), `05A` `Policy_Tier`, `05B` `Knowledge_Case`, `P07` `recordUsage`/`v_llm_cost`. All of these
  are MERGED to main → no upstream blocker. **Zero new tables.**
- **What remains for CP3 to ship:** (a) **push the branch + open the PR** (it is local-only); (b) run the full
  gate with evidence on the branch `[UNVERIFIED — not run this session]`; (c) the deferred Codex round-2
  follow-ups in §4; (d) decide whether to land before or after the demo. It is feature-complete in code.

---

## 3. Peças 1-6 (05D Diagnosis Engine) — per the build-doc "REAL gap" / F-phases

### Peça 1 = F1 — 4 new diagnosis types  ·  **DONE (PR #40, refined #41)**
- **Goal:** connection / cancellation / menu_quality / adoption diagnosed via ONE descriptor-driven engine
  (`fn_hunt_silent` + `fn_impact_revenue_lost` `case` dispatchers + `PROBLEM_TYPES`), each a real reverse-cascade.
- **Status:** merged. Descriptor-authoritative proactive path (`8e0b03e`) enables L3 later.
- **Remains:** none for the 4 types. (Memory flags a latent demo concern: anti-join over a multi-producer table
  must scope the subtype — handled in #41; and the p_ref anchor in §5 affects whether these board rows render.)
- **Invariants:** §14 (RESULT NULL pre-run — anti-fake test extended), §8 (numbers SQL-only via `fn_*`),
  §3.4 (tenant server-side), §3.8 (knobs by name: `connection_min_ratio`, `cancel_rate_max`, etc.).

### Peça 2 = F2 — pgvector precedent memory + grow-on-resolve  ·  **REMAINING**
- **Goal** (`05D_diagnosis_engine_live.md:300-302`): `Knowledge_Case += embedding vector(1536)` + hnsw index +
  a precedent-kNN fn (mirror existing `searchKnowledge`) + **grow-on-resolve** (embed + insert precedent when a
  case resolves). Today embeddings live on `Knowledge_Chunk`/docs, NOT on precedents.
- **Remains:** migration (extension + column + index) + `server/diagnosis/memory.ts` (kNN) + the resolve-hook.
- **Dependencies:** adopt **main's OpenAI `text-embedding-3-small` dim-1536 + hnsw** stack
  (`server/knowledge/embedder.ts`) — decision reverses the earlier "local 384" plan (build-doc §"DECISION").
  Needs F0 (done). Independent of the motor.
- **Invariants:** §14 (embedding is `[C]` config-like, the precedent's `outcome` is a measured `[V]`); §8.

### Peça 3 = F3 — 2-brain classification + label-independent + trace  ·  **REMAINING**
- **Goal** (`:303`): run BOTH providers (`deterministicReasoning` + `llmReasoning` already exist in
  `server/diagnosis/reasoning.ts` — orchestrator uses ONE at a time today), agreement gate, blind
  label-vs-inferred compare, 2-run consistency, persist to an extended `gov.Decision_Trace`.
- **Remains:** the dual-run orchestration + `Decision_Trace` classification columns + the "How I know" panel.
- **Dependencies:** F2 (kNN feeds the AI brain's retrieval). Disagreement ⇒ `needs_human` (fail-closed §7).
- **Invariants:** §7 (disagreement degrades to human), §8 (LLM classifies TEXT only; €/affected stay SQL),
  §14, deterministic brain is the stable floor.

### Peça 4 = F4 — batch ticket ingestion + dedup + buckets  ·  **REMAINING**
- **Goal** (`:304`): `ingestBatch(tickets)` tRPC — classify each → dedup via existing `reportProblem`
  ON CONFLICT (frequency++) → diagnose clusters → honest buckets (unknown / no-data / low-confidence →
  needs_human) → headline aggregation. This is the "scale wow".
- **Remains:** the whole `ingestBatch` path + bucketing. None dropped silently.
- **Dependencies:** F0 (done) for the general path; benefits from F3's classifier.
- **Invariants:** §7 (every ticket lands in a bucket, none dropped — fail-closed), §14, §8.

### Peça 5 = F5 — L2 new-case + L3 teach-a-type  ·  **REMAINING**
- **Goal** (`:305`): L2 `runCase({type,segment,params})` inserts bounded INPUT rows then runs; L3
  `defineType(descriptor)` via a **whitelist compiler** (column + operator + threshold + metric →
  parameterized affected/impact query honoring the descriptor contract; NEVER raw SQL → `Problem_Type`
  origin='live').
- **Remains:** both `runCase` and `defineType` + the whitelist compiler.
- **Dependencies:** the descriptor-authoritative path (#41, done) was built specifically to enable L3.
- **Invariants:** §9 phantom denylist (no raw-SQL table creation), §8, §14, §3.8.

### Peça 6 = F7 — anti-SAP console + design/a11y polish  ·  **REMAINING** (F6 stage-proofing folds in here)
- **Goal** (`05D_diagnosis_engine_live.md:169`, §H): ONE route `/diagnosis`, result-first, evidence-on-demand;
  components `IngestPanel`, board streaming rows, `NeedsHumanPile`, `HowIKnowSheet`, `NewCaseDialog`,
  `TeachTypeDialog`, headline count-up. `--mxm-*` dark-only, WCAG AA, `prefers-reduced-motion`.
  Net-new shadcn primitives: `Sheet/Table/Form/Accordion` (only `Modal/Disclosure/Card` exist today).
- **F6 (degradation + reset + stage-proofing)** is a sibling pre-rehearsal hardening phase (pre-warm
  embeddings/classify, deterministic fallback, idempotent `reset` generalizing `run-05b`).
- **Remains:** all console components + the design-review/a11y pass + F6 hardening.
- **Dependencies:** overlays ALL phases (build incrementally, final pass last); needs F2-F5 outputs to render.
- **Invariants:** §4 (a11y AA, focus-trap, color-not-sole-carrier, honest empty/error — never green-fake), §14.

---

## 4. 02C MOTOR-LLM — remaining (deferred Codex follow-ups)

Source: `specs/build_docs/02C_motor_llm_codex_review.md` + commit `216f6b2` body (what was KEPT/DEFERRED).
Round-1 (9 P1 + 4 P2) and round-2 (most of 7 P1 + 3 P2) are FIXED. These remain:

| # | Follow-up | Why deferred | Effort |
|---|---|---|---|
| 1 | **02D — wire the diagnosis LLM into the /diagnosis UI** | Sibling piece, explicitly OUT of 02C scope (`02C_motor_llm.md:141-154`). Today `runDiagnosis` defaults to `deterministicReasoning`; `llmReasoning` runs ONLY in `scripts/run-05b.ts`. Narrating "the AI classifies the tickets" on the screen is overselling. Needs a `diagnosis_use_llm` knob fail-closing to deterministic. | **M** |
| 2 | **Real outcome-measurement producer (EPIC-B4)** — acted ⇒ `Knowledge_Case.outcome=NULL` (pending), only a measurement producer sets `resolved`/`not_resolved` | Round-2 P1-5. KEPT as `outcome='resolved'`-on-dispatch by Leo's call (commit body: "KEEP (Leo)"). `runMotor.ts:82` still writes `'resolved'` on a SEND that measured nothing → `readGrounding` teaches it as "worked" (§14 tension). The honest fix is a separate producer. | **M** |
| 3 | **Escalation context** — persist `restaurant_id` + `cohort_id` on the escalated `Knowledge_Case` | Round-2 P2-4. `learn.ts` stores only `attempt_id` → the human feed can't show WHICH cohort/restaurant escalated. | **S** |
| 4 | **Multi-version policy semantics** (P1-2 + P1-3) — semantic (not lexical) policy-version ordering; write a NEW signed policy version on a controls edit instead of mutating signed history | Round-2 P1-2/P1-3, explicitly DEFERRED in `216f6b2` ("latent in single-version demo"). `validateHypothesis.ts:33` still `order by policy_version desc` (lexical: v9 > v10); `controls.ts` UPDATE still mutates signed policy referenced by historical `Decision_Trace`. Latent until a 2nd policy version exists. | **M** |
| 5 | **P2-3 usage-logged-before-execute** — best-effort `recordUsageSafe` can swallow → a dispatch with no cost row | Round-2 P2-3, "debatable" (telemetry-must-not-fail-the-decision vs cost-attribution). Kept best-effort + flagged. | **S** |
| 6 | **P2-2 prefilter named-threshold alignment** (`m_connection<0.55` prefilter vs `nba_connection_min_ratio=0.80`) | Round-1 P2-2, deferred: INHERITED from the floor's `proposeAndAutoActForCohort`; the authoritative gate is `fn_nba_test`. Aligning the prefilter touches invariant-bearing floor code (§3.11) → separate follow-up. | **S** |

Plus the operational remainders from §2: **push branch + open PR + run the gate with evidence** `[UNVERIFIED]`.

---

## 5. Demo-blocking risks

### CONFIRMED — the `p_ref` / `current_date` anchor mismatch (the seed)
- `supabase/seed.sql:172` anchors the business base to a **FIXED** date:
  `select public.fn_generate_business_base(5000, date '2026-06-17');`
- but `supabase/seed.sql:175` seeds usage events at `current_date`, and `scripts/scenario_pay.ts:48` inserts
  payment-failure orders at `current_date`. `scripts/run-p01.ts`, `run-p02.ts`, `apply-hosted.ts` all hardcode
  `refDate = "2026-06-17"`.
- **Effect:** the cohort/funnel/diagnosis windows are pinned to ~2026-06-17, but parts of the fixture (usage,
  scenario_pay) drift with wall-clock `current_date`. As real time advances past `p_ref + window`, the diagnosis
  board and NBA signals zero out (windows no longer overlap the anchored base). Today is 2026-06-21 — already
  4 days past the anchor. **A live exec demo on a later date shows an empty board.**
- **Fix (pick one):** (a) make the seed anchor relative — `fn_generate_business_base(5000, current_date)` and
  thread `current_date` (or a single `DEMO_REF` env) through `run-p01/p02/apply-hosted` so EVERY producer shares
  one anchor; OR (b) freeze the demo to a fixed clock (pin `current_date` via a seeded `now()` override / run the
  demo machine's date). Option (a) is the durable fix; do it before any rehearsal.

### Other demo risks
- **02C is local-only** (§2): the motor — the headline "the AI proposes its own hypothesis and acts" moment — is
  not pushed and has no PR. If the demo runs from `main` or a hosted deploy, the motor is absent. **Push + deploy
  (or demo from the branch) before showing it.** `[UNVERIFIED: which environment the demo runs against.]`
- **02D gap (honesty)** (§4 #1): on the /diagnosis screen the AI classification is the DETERMINISTIC twin, not
  the LLM. Narrating "the AI reads and classifies the tickets" there overstates it until 02D lands. Either wire
  02D or adjust the narration ("the platform measures deterministically; the motor is where the AI reasons").
- **05D F7 console not built** (§3 Peça 6): /diagnosis is still the older single-type screen, not the anti-SAP
  console in spec §H. The visible "different problems, one engine" wow needs at least a minimal F7 drill-down.
- **Gate not re-verified this session** `[UNVERIFIED]`: I did not run `pnpm test*` on the motor branch. Run the
  full gate with evidence before demo (preflight: one DB suite at a time; container
  `supabase_db_musixmatch-customer-ops` on :54522).

---

## 6. Dependency graph (TRUE dependencies — for parallelization)

```
MERGED on main (no longer blockers):
  05B Knowledge_Case ─┐
  05A Policy_Tier ────┤
  P07 recordUsage ────┼──► CP2 floor (autoDispatch, sealMinCalc) ──► 02C MOTOR-LLM  [CP3, in-flight, local]
  02:1A proposeNba ───┘                                                   │
                                                                          ├─► 02C deferred: 02D (diagnosis LLM in UI)   [reuses 02C's LLM-provider primitive]
                                                                          ├─► 02C deferred: outcome-measurement producer (EPIC-B4)
                                                                          ├─► 02C deferred: escalation context (S)
                                                                          ├─► 02C deferred: multi-version policy (M)
                                                                          └─► 02C deferred: P2-2/P2-3 (S)

  05D F0 registry (PR#39) ──► 05D F1 / Peça1: 4 types (PR#40) ──► descriptor-refactor (PR#41)
        │                                                              │
        │                                                              └─► F5/Peça5 L3 teach-a-type  (descriptor-authoritative path enables it)
        ├─► F2/Peça2 pgvector memory ──► F3/Peça3 2-brain+trace ──► (real+learns wow)
        │         └─(adopts main's embedder.ts 1536/hnsw)
        ├─► F4/Peça4 batch ingest ──(benefits from F3 classifier)──► (scale wow)
        └─► F7/Peça6 console + F6 stage-proofing  (overlays ALL F-phases; final pass needs F2-F5 outputs)
```

**Independent / parallelizable (no shared files, no producer→consumer link):**
- **02C track** (CP3 + its deferred follow-ups) is independent of the **05D F2-F7 track** — different modules
  (`server/motor/` vs `server/diagnosis/`), different tables. They can proceed in parallel.
- Within 05D: **F2 (pgvector)** and **F4 (batch ingest)** are both gated only on F0 (done) and do not share files
  — F4 reuses `reportProblem` (orchestrator), F2 adds `memory.ts` + a migration. They can run in parallel.
  **F3 truly depends on F2** (the AI brain retrieves precedents via F2's kNN) — sequential.
- **02D** depends on 02C only for the reusable LLM-provider primitive; it touches `server/diagnosis/` +
  `server/routers/{diagnosis,intake}.ts`, so it would COLLIDE with 05D F3 (same `reasoning.ts`/orchestrator
  area) — sequence 02D and F3, or coordinate the merge.

**Shared-file collision hotspots to respect:**
- `server/diagnosis/reasoning.ts` + `orchestrator.ts` — touched by 02D, F2, F3. Serialize these three.
- `supabase/seed.sql` — touched by the p_ref fix (§5) AND any new-knob phase; small, but rebase-prone.
- `shared/contracts.ts` / `server/routers/_app.ts` — every new router edits these (motor already did); expect
  trivial merge conflicts, not logic conflicts.

---

## Appendix — items found stale / not load-bearing
- `specs/build_docs/05A_pendentes_todo.md` (dated 2026-06-18) lists `Decision_Trace`, `Policy_Tier`,
  `NBA_Proposal` as "missing foundation". Those tables now EXIST (02C/CP2 read+write them) → that TODO is
  **stale** and overstates remaining 05A foundation work. The 05A AGENTE layer (18 LLM pieces) remains a
  separate, not-started frontier, but it is NOT on the critical path to this demo.
- `specs/build_docs/05D_generalized_diagnosis.md` is explicitly **SUPERSEDED** by `05D_diagnosis_engine_live.md`.

---

## 7. Parallelization analysis (which deliverables run 100% in parallel, no impact)

> Applying four lenses: **/problem-solving** (MECE swimlanes) · **/sat** (key-assumptions on "no impact") · **/karpathy** (root cause of coupling) · **/plan-devex-review** (parallel-track friction).

### /problem-solving — MECE swimlanes (each lane shares NO files/contracts with another)
- **Lane 0 — DEMO-BLOCKER (do FIRST, alone):** the p_ref anchor fix (`seed.sql` + producers). Everything else rebases on it, so land it before fanning out.
- **Lane A — 02C motor follow-ups:** escalation-context (S), multi-version policy (M), P2-usage (S). Files: `server/motor/*`. Depends on: the 02C PR landing.
- **Lane B — 05D F2 pgvector memory:** `server/diagnosis/memory.ts` + a migration. Gated only on F0 (done).
- **Lane C — 05D F4 batch ingest:** its own module; reuses `reportProblem` read-only. Gated only on F0 (done).
- **Lane D — 05D F5 L3 teach-a-type:** the descriptor-refactor (PR#41) already enables it. Independent of F2/F3.
- **Serial (NOT parallel):** F3 2-brain *needs* F2's kNN → after B. 02D + F2 + F3 collide on `reasoning.ts`/orchestrator → serialize. F6/F7 console overlays ALL F-phases → last.

### /sat — key-assumptions check on "100% parallel, no impact"
"No impact" silently assumes five things; only some hold:
1. **No shared files** — TRUE across {02C-track ⊥ 05D-track} (different dirs/tables). FALSE for {02D, F2-reasoning, F3} (same `server/diagnosis/reasoning.ts`+orchestrator). [V]
2. **No producer→consumer contract** — F3←F2 is a real consumer link (sequential). F4 only *benefits* from F3 (degrades gracefully to the deterministic classifier) ⇒ parallel-able. [V]
3. **No shared migration ordering** — migrations are timestamp-append-only ⇒ safe IF two lanes don't mint the same timestamp; `seed.sql` is shared (rebase-prone, trivial). [LIKELY]
4. **No shared test DB** — **FALSE.** Every DB suite hits the one `:54522` + `resetDb` (truncate+reseed). Two lanes running integration *at the same time* corrupt each other. (Hit 3× THIS session.) ⇒ "parallel" silently means "serialize the integration runs" unless each lane gets its own DB. [V — the load-bearing miss]
5. **Reviewer/merge capacity** — each lane needs Codex + a human merge; lanes converge on `shared/contracts.ts`+`_app.ts` (trivial conflicts, real cadence cost). [LIKELY]

### /karpathy — the root cause of "not actually 100% parallel"
The CODE is mostly independent; the real coupling is **the shared test database**, not the modules. The minimal fix that makes the lanes genuinely parallel: give each parallel stream its **own DB** (a dedicated `pgvector` container or a separate database name on the same server) so `resetDb` can't collide. Without it, the only honest "parallel" is *write* in parallel but *run integration serially*. Don't over-engineer beyond that — worktrees + a per-lane DB is the whole fix.

### /plan-devex-review — the parallel-track developer experience
- **Friction (expect, don't fight):** `shared/contracts.ts` + `server/routers/_app.ts` — every new router edits both ⇒ trivial merge conflicts each land. `seed.sql` — Lane 0 + any new-knob lane. `reasoning.ts`/orchestrator — 02D/F2/F3 (serialize).
- **Magical setup for N parallel agents:** one git worktree per lane + one isolated DB per lane + each lane lands its own migration + Codex-per-lane + rebase cadence (Lane 0 first, then the rest).
- **Merge order:** (1) 02C PR (this branch) → (2) p_ref fix → (3) Lanes A/B/C/D fan out → (4) F3 after F2 → (5) 02D after F2/F3 → (6) console last.

### ANSWER — run 100% in parallel with no impact (given a per-lane DB):
**Lane A (02C follow-ups) · Lane B (F2 pgvector) · Lane C (F4 batch) · Lane D (F5 L3)** — four independent streams, different modules/tables, no contract links. **Caveat (non-negotiable):** each needs its OWN test DB, or their integration runs must be serialized (the only real "impact"). **Land Lane 0 (p_ref) first.** Keep **F3, 02D, F6/F7** serial.
