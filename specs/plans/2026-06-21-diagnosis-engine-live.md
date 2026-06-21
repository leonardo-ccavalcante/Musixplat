# Diagnosis Engine · LIVE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Spec: `specs/build_docs/05D_diagnosis_engine_live.md`.

**Goal:** Turn /diagnosis into a real, extensible, self-improving engine demoable to executives — 5 problem
types via one descriptor-driven engine, a growing pgvector memory, 2-brain classification, batch ticket
ingestion, live new-case/new-type, on-brand anti-SAP console — with every number deterministic SQL (§14).

**Architecture:** Two physically separated planes — **judgment** (classify/rank/retrieve; may use LLM/RAG; may
vary; shown with reasons) and **measurement** (SQL only; NULL pre-run; never LLM). RAG/embeddings live ONLY in
judgment and choose WHICH measurement runs, never the number. One engine, many **descriptors**
(`{affected, impact, concentration, area_type, hypotheses, metric}`); built-ins ship a vetted SQL query, live
types compile a query from a whitelist — both honor the SAME descriptor contract and the SAME pipeline.

**Tech Stack:** Vite+TS strict · React 19 + wouter · tRPC v11 + Express · shadcn/Tailwind (`--mxm-*`, dark) ·
Zod v3 · TanStack Query v5 · Supabase Postgres + **pgvector** · Vitest / pgTAP / Playwright.

**Branch:** ⚠️ `origin/main` is AHEAD of `feat/p05b-diagnosis` (the `diagnosis.run` mutation + "Run flow" UI live
only on main). **Branch off `origin/main`:** `git checkout -b feat/diagnosis-engine-live origin/main`.

---

## Decomposition (per skill scope-check: multi-subsystem spec ⇒ one plan per phase)

This file fully details **F0** (foundation — everything depends on it; self-contained: payment stays E2E via
the general path). F1–F7 are roadmapped here with task lists + dependencies; each gets its own full TDD plan
authored when its predecessor lands (writing complete code now would drift before F0's output exists).

### Phase dependency graph + critical path
```
F0 registry/parameterize ──┬─► F1 4 new types ──┬─► F4 batch ingestion ──► (scale wow)
                           │                     └─► F5 L2/L3 live ──────► (extensible wow)
                           └─► F2 pgvector memory ─► F3 2-brain+trace ───► (real+learns wow)
F7 console/design polish overlays all phases (built incrementally; final pass at end)
F6 degradation+reset+stage-proofing hardens before any rehearsal
```
- **Milestone M1 (first demoable wow — "different problems, not faked"):** F0 + F1(connection) + a minimal
  provenance drill-down (subset of F7). Two real types via ONE engine, every number drillable. THIS is the
  shortest path to something that visibly beats today's canned single-type screen.
- **M2 ("real + learns"):** + F2 + F3. **M3 ("scales"):** + F4. **M4 ("extensible live"):** + F5. **M5 ("stage-proof"):** + F6 + F7.

### File-structure map (created ✚ / modified ✎)
- ✚ `supabase/migrations/<ts>_05d_registry.sql` — `catalog.Problem_Type`, `Diagnosed_Problem += problem_type, segment`, seed payment descriptor.
- ✎ `supabase/migrations/.../20260617000014_05b_diagnostico.sql` is FROZEN (shipped) — never edit; add NEW migrations.
- ✚ `supabase/migrations/<ts>_05d_affected_dispatch.sql` — `fn_affected_payment` + `fn_hunt_silent` dispatcher (+ segment).
- ✚ `supabase/migrations/<ts>_05d_impact_dispatch.sql` — `fn_impact_payment` + `fn_impact_revenue_lost` dispatcher.
- ✎ `server/diagnosis/orchestrator.ts` — read `problem_type`; concentration query type-aware; thread `segment`.
- ✎ `server/routers/diagnosis.ts` — `reportProblem` accepts optional `{problem_type, segment}` (default payment).
- ✎ `shared/contracts_05b.ts` — extend `reportProblemInput` Zod.
- ✚ `shared/problem_types.ts` — the descriptor TS type + the `payment` built-in (single source, imported both sides).
- ✚ `tests/sql/05d_registry.test.sql` · `tests/integration/05d_payment_general_path.test.ts` · extend `tests/antifake/antifake.test.ts`.
- (F1+) `server/diagnosis/types/{connection,cancellation,menu_quality,adoption}.ts` + matching migrations/fixtures.
- (F2+) pgvector migration + `server/diagnosis/memory.ts` (embed + kNN). (F3+) `reasoning.ts` AI+RAG provider + `Decision_Trace` extension.
- (F7) `client/src/features/diagnosis/{IngestPanel,HowIKnowSheet,MemoryStrip,NewCaseDialog,TeachTypeDialog,NeedsHumanPile}.tsx`.

---

## F0 — Registry + parameterize (payment stays E2E via the general path; zero regression)

> Invariants every task obeys: result cols NULL pre-run (§14); numbers SQL-only (§8); `tenant_id` server-side
> (§7); knobs by name; ≤100 lines/unit; reuse before create. 1 commit per task. TDD: red → green → refactor.

### Task 0: Branch + green baseline
- [ ] **Step 1:** `git fetch origin && git checkout -b feat/diagnosis-engine-live origin/main`
- [ ] **Step 2:** `pnpm install && supabase db reset && pnpm db:05b` (seed POOL-PAY scenario)
- [ ] **Step 3:** Run the full gate to capture a GREEN baseline:
  `pnpm typecheck && pnpm test && pnpm test:sql && pnpm test:antifake && pnpm test:integration`
  Expected: all pass (this is the regression bar F0 must preserve).
- [ ] **Step 4:** Commit nothing yet (baseline only).

### Task 1: Descriptor contract (TS, single source of truth)
**Files:** Create `shared/problem_types.ts`; Test `tests/unit/problem_types.test.ts`
- [ ] **Step 1 — failing test:**
```ts
import { describe, it, expect } from "vitest";
import { PROBLEM_TYPES, getDescriptor } from "../../shared/problem_types.js";
describe("problem_types registry", () => {
  it("has the payment built-in with a complete descriptor", () => {
    const d = getDescriptor("payment");
    expect(d.area_type).toBe("finance");
    expect(d.affected.table).toBe("Order");
    expect(d.impact.kind).toBe("sum_net_value");
    expect(d.origin).toBe("builtin");
  });
  it("throws fail-closed on unknown type", () => {
    expect(() => getDescriptor("nope")).toThrow(/unknown problem_type/);
  });
});
```
- [ ] **Step 2:** `pnpm test problem_types -v` → FAIL (module missing).
- [ ] **Step 3 — implement (≤100 ln):**
```ts
// shared/problem_types.ts — descriptor contract shared by server (dispatch) + client (labels). No SQL here.
export type Operator = "lt" | "gt" | "eq";
export interface AffectedDescriptor { table: string; signal: string; operator?: Operator; threshold_knob?: string; }
export interface ImpactDescriptor { kind: "sum_net_value" | "gmv_window" | "at_risk_gmv"; }
export interface ProblemDescriptor {
  problem_type: string; area_type: "finance" | "performance" | "product" | "operations";
  label: string; affected: AffectedDescriptor; impact: ImpactDescriptor;
  concentration_dim: "zone" | "cuisine"; hypotheses: string[];
  metric: string; origin: "builtin" | "live";
}
export const PROBLEM_TYPES: Record<string, ProblemDescriptor> = {
  payment: {
    problem_type: "payment", area_type: "finance", label: "Payment failed",
    affected: { table: "Order", signal: "payment_status='failed'" },
    impact: { kind: "sum_net_value" }, concentration_dim: "zone",
    hypotheses: ["payment was not executed", "refund dispute concentrated", "balance mismatch"],
    metric: "recover_failed_payment_value", origin: "builtin",
  },
};
export function getDescriptor(t: string): ProblemDescriptor {
  const d = PROBLEM_TYPES[t];
  if (!d) throw new Error(`unknown problem_type (fail-closed): ${t}`);
  return d;
}
```
- [ ] **Step 4:** `pnpm test problem_types -v` → PASS.
- [ ] **Step 5:** `git add -A && git commit -m "feat(05D:F0): descriptor contract + payment built-in"`

### Task 2: Migration — registry table + columns + payment descriptor row
**Files:** Create `supabase/migrations/<ts>_05d_registry.sql`; Test `tests/sql/05d_registry.test.sql`
- [ ] **Step 1 — failing pgTAP test:**
```sql
begin; select plan(4);
select has_table('catalog','Problem_Type','registry table exists');
select has_column('tenant','Diagnosed_Problem','problem_type','type col added');
select has_column('tenant','Diagnosed_Problem','segment','segment col added');
select is( (select area_type from catalog."Problem_Type" where problem_type='payment'),
           'finance', 'payment descriptor seeded');
select * from finish(); rollback;
```
- [ ] **Step 2:** `pnpm test:sql` → FAIL (objects missing).
- [ ] **Step 3 — migration (`supabase migration new 05d_registry`):**
```sql
create table catalog."Problem_Type" (
  problem_type        text primary key,
  area_type           text not null,
  affected_descriptor jsonb not null,
  impact_descriptor   jsonb not null,
  concentration_dim   text not null default 'zone',
  metric              text not null,
  origin              text not null default 'builtin',
  active              boolean not null default true
);
alter table tenant."Diagnosed_Problem"
  add column if not exists problem_type text not null default 'payment',
  add column if not exists segment      text;
insert into catalog."Problem_Type"(problem_type, area_type, affected_descriptor, impact_descriptor, metric)
values ('payment','finance',
        '{"table":"Order","signal":"payment_status=''failed''"}'::jsonb,
        '{"kind":"sum_net_value"}'::jsonb, 'recover_failed_payment_value');
```
- [ ] **Step 4:** `supabase db reset && pnpm db:05b && pnpm test:sql` → PASS.
- [ ] **Step 5:** `git commit -am "feat(05D:F0): Problem_Type registry + Diagnosed_Problem type/segment cols"`

### Task 3: Affected producer — dispatcher + payment (segment-aware), regression-preserving
**Files:** Create `supabase/migrations/<ts>_05d_affected_dispatch.sql`; Test `tests/sql/05d_affected.test.sql`
> Strategy: extract the EXISTING `fn_hunt_silent` body (Order failed ∖ complainants) into `fn_affected_payment`;
> make `fn_hunt_silent` a dispatcher that reads `Diagnosed_Problem.problem_type` and calls the per-type fn,
> adding an optional `p_segment` filter. Same Affected output for payment ⇒ regression preserved.
- [ ] **Step 1 — failing test (regression + segment):**
```sql
begin; select plan(2);
-- payment problem in POOL-PAY still yields 47 affected / 35 silent via the dispatcher
select tenant.fn_hunt_silent((select problem_id from tenant."Diagnosed_Problem" where tenant_id='POOL-PAY' limit 1),
                             'POOL-PAY', (select value::int from catalog."Config_Knobs" where key='window_silent'), null);
select is((select count(*)::int from tenant."Affected" a join tenant."Diagnosed_Problem" p on p.problem_id=a.problem_id
           where p.tenant_id='POOL-PAY'), 47, 'payment affected = 47 via general path');
select is((select count(*) filter (where silent)::int from tenant."Affected" a join tenant."Diagnosed_Problem" p
           on p.problem_id=a.problem_id where p.tenant_id='POOL-PAY'), 35, 'silent = 35');
select * from finish(); rollback;
```
- [ ] **Step 2:** `pnpm test:sql` → FAIL (signature `fn_hunt_silent(uuid,text,int,text)` not found).
- [ ] **Step 3 — migration:** `fn_affected_payment(p_problem,p_tenant,p_window,p_segment)` = the current
  anti-join body + `and ($4 is null or rr.segment = $4)`; `fn_hunt_silent(p_problem,p_tenant,p_window,p_segment)`
  = look up `problem_type`, `case 'payment' then perform fn_affected_payment(...) end`, fail-closed else.
  (Keep ≤100 ln; copy the exact body from migration 20260617000014 lines 104-131.)
- [ ] **Step 4:** `supabase db reset && pnpm db:05b && pnpm test:sql` → PASS.
- [ ] **Step 5:** `git commit -am "feat(05D:F0): fn_hunt_silent dispatcher + fn_affected_payment + segment"`

### Task 4: Impact producer — dispatcher + payment
**Files:** Create `supabase/migrations/<ts>_05d_impact_dispatch.sql`; Test `tests/sql/05d_impact.test.sql`
- [ ] **Step 1 — failing test:** payment problem → `fn_impact_revenue_lost` still returns the seeded scenario's € (same as today) via dispatcher.
- [ ] **Step 2:** `pnpm test:sql` → FAIL.
- [ ] **Step 3 — migration:** extract body into `fn_impact_payment(p_problem)`; `fn_impact_revenue_lost(p_problem)` dispatches on `problem_type` (case payment → fn_impact_payment). Writes `revenue_lost` + provenance `[I]` exactly as before. NULL pre-run preserved.
- [ ] **Step 4:** `supabase db reset && pnpm db:05b && pnpm test:sql` → PASS.
- [ ] **Step 5:** `git commit -am "feat(05D:F0): fn_impact dispatcher + fn_impact_payment"`

### Task 5: Orchestrator + router — thread problem_type/segment, type-aware concentration
**Files:** Modify `server/diagnosis/orchestrator.ts`, `server/routers/diagnosis.ts`, `shared/contracts_05b.ts`; Test `tests/integration/05d_payment_general_path.test.ts`
- [ ] **Step 1 — failing integration test:** `reportProblem({restaurantId:'R-PAY-001', problem_type:'payment', segment:null})` → `runDiagnosis` → assert affected=47, silent=35, revenue_lost>0, dossier gate unchanged (full payment E2E via the general path).
- [ ] **Step 2:** `pnpm test:integration` → FAIL (input rejects `problem_type`).
- [ ] **Step 3 — implement:** (a) `reportProblemInput` Zod: add `problem_type: z.string().default('payment')`, `segment: z.string().nullish()`; persist both on insert. (b) orchestrator: read `problem_type` from the problem row; pass `segment` into `huntSilent`; make the zone-concentration query use the descriptor's `concentration_dim` (still `zone` for payment) — keep `payment_status='failed'` ONLY inside `fn_affected_payment`, NOT in the orchestrator (move that coupling down). (c) concentration query becomes generic: count affected by `concentration_dim` (no payment filter — the Affected set already encodes the type).
- [ ] **Step 4:** `pnpm test:integration && pnpm test:antifake` → PASS.
- [ ] **Step 5:** `git commit -am "feat(05D:F0): orchestrator+router thread problem_type/segment via general path"`

### Task 6: Anti-fake + full gate (F0 done-when)
- [ ] **Step 1:** Extend `tests/antifake/antifake.test.ts`: after seed + before producers, `Diagnosed_Problem.revenue_lost` IS NULL and `Affected` is empty for a freshly-reported payment problem (general path doesn't pre-seed).
- [ ] **Step 2:** `pnpm test:antifake` → PASS.
- [ ] **Step 3:** Full gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:sql && pnpm test:antifake && pnpm test:integration && pnpm test:e2e` → all green (payment behaves identically, now via the descriptor engine).
- [ ] **Step 4 — Codex adversarial review** (fresh context): diff vs spec §F0 + invariants. Criterion = "less bug". Resolve findings.
- [ ] **Step 5:** `git commit -am "test(05D:F0): anti-fake + regression green — payment E2E via general engine"`

**F0 Done-when:** payment diagnosis is byte-for-byte equivalent in behavior, but now flows through
`Problem_Type` + `fn_hunt_silent` dispatcher + `fn_impact` dispatcher + descriptor-aware orchestrator. No new
type yet; the engine is now general. Gate green with evidence.

---

## F1–F7 — roadmap (task lists; full TDD plan authored JIT per phase)

**F1 — 4 new types** (one sub-phase each: connection → cancellation → menu_quality → adoption). Per type:
(1) descriptor in `shared/problem_types.ts` + `Problem_Type` seed row; (2) `fn_affected_<type>` + dispatcher
case + `fn_impact_<type>`; (3) new knobs in seed (`connection_min_ratio`, `cancel_rate_max`, `menu_quality_min`,
`adoption_gap_days`); (4) KB precedent fixture per area; (5) segment fixtures (the reverse-cascade per segment);
(6) pgTAP + integration + anti-fake; (7) Codex review + commit. **M1 reached after connection.**

**F2 — pgvector memory.** Migration: `create extension vector`; `Knowledge_Case += embedding vector(384)` +
ivfflat index. `server/diagnosis/memory.ts`: local embed (transformers.js/ONNX all-MiniLM, in-process) +
`fn_knn_precedents(embedding, area, k)`. Grounding B.6 → semantic top-k. **Grow-on-resolve:** on resolve,
write precedent + embedding. Tests: kNN returns nearest; cold-start falls back; embedding is local (no network).

**F3 — 2-brain + label-independent + trace.** `reasoning.ts`: add `ragReasoning` provider (embed→kNN→type+score,
temp 0) composing with the existing deterministic provider. Label-independent inference + compare. Extend
`gov.Decision_Trace` with classification fields (inferred_type, brain, neighbors, scores, run_consistency,
label_match). 2-run consistency (pre-warmed). Tests: deterministic brain always stable; disagreement→needs_human.

**F4 — batch ingestion + dedup + buckets.** `ingestBatch(tickets)` tRPC: classify each → dedup via existing
`reportProblem` ON CONFLICT (frequency++) → diagnose clusters → honest buckets (unknown/no-data/low-confidence
→ needs_human). Headline aggregation. Tests: 210 tickets → P problems → S silent; buckets populated, none dropped.

**F5 — L2 new-case + L3 teach-a-type.** L2: `runCase({type,segment,params})` inserts INPUT rows (bounded, demo
pool) → run. L3: `defineType(descriptor)` from a **whitelist compiler** (column+operator+threshold+metric →
parameterized affected/impact query honoring the descriptor contract; NEVER raw SQL). Tests: live type with
backing data resolves; without data → honest "can't measure".

**F6 — degradation + reset + stage-proofing.** Honest-limit messaging; `reset` rebuilds pool idempotently
(generalize `run-05b`); pre-warm curated batch (embeddings/classify/trace/2-run precomputed); deterministic
fallback if embed fails. Tests: off-distribution degrades; reset returns clean state; no live network needed.

**F7 — console + design polish** (per spec §C/§H/§I; built incrementally, final pass here). Components:
`IngestPanel` (sample-inbox + paste), board streaming rows, `NeedsHumanPile`, `HowIKnowSheet` (2 brains +
label-match + 2× + memory strip + drill-down), `NewCaseDialog`, `TeachTypeDialog`, headline count-up. On-brand
`--mxm-*`, WCAG AA, `prefers-reduced-motion`. Then `/design-review` for visual QA + `pnpm test:a11y`.

---

## Self-review (against spec)
- **Coverage:** F0 covers spec §B.1 (registry/descriptor) + the de-coupling of the 3 payment-bound producers
  (§Functionality items 1-3); F1 §B.1 types; F2 §B.3; F3 §B.2; F4 §B.4; F5 §B.5; F6 §B.6 + §E; F7 §C/§H/§I. No spec section unmapped.
- **Placeholders:** F0 has real code per step. F1–F7 are explicitly roadmap (detailed JIT) — not placeholders inside an "executable" phase.
- **Type consistency:** `getDescriptor`/`ProblemDescriptor`/`fn_hunt_silent(uuid,text,int,text)` used consistently across tasks.

## Execution handoff
Plan saved to `specs/plans/2026-06-21-diagnosis-engine-live.md`. Recommended execution:
**Subagent-Driven** (fresh subagent per task + Codex review between tasks). Alternative: inline executing-plans.
**Start = F0 Task 0** (branch off origin/main + green baseline) → M1 = F0 + F1(connection).
