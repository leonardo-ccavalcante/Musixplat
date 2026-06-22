# Observatory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only `/observatory` screen that shows what the AI does on its own (evals/boundary, learning, auto-activity, cost) and exposes only the honest human levers that already exist (tighten the cap, approve/reject learning, release/pause).

**Architecture:** Reuse-first. 3 NEW tenant-scoped `SELECT`-only tRPC reads (`observatory.evalList`, `observatory.learningCases`, `observatory.traces`); 1 new page + route; cap-edit reuses `cockpit.configTemplate`/`cockpit.uploadConfig` verbatim; actions reuse `motor.controls.set` and `cockpit.release`. No new producer, no result computed, no schema change (spec `specs/build_docs/observatory.md`).

**Tech Stack:** tRPC v11 + Express, Zod v3, `query`/`withTx` from `server/db/pool`, Postgres (Supabase), React 19 + wouter + TanStack Query, Tailwind `--mxm-*`, Vitest (unit + integration), Playwright (e2e/a11y).

**Invariants pinned (every task respects):** §14 (never write/fabricate a result; eval grade read-only; green only when `provenance.status=='[V]'`; NULL result → "not yet measured", never 0/green) · §3.4 (tenant resolved server-side; `evalList`/`traces` resolve tenant by join) · §3.2 (k-anon/n_min ABSENT — own-tenant full traceability) · §7 (fail-closed; guarded actions confirm-before; no money auto-release).

---

## File structure

- **Create** `shared/contracts_observatory.ts` — Zod row + list contracts for the 3 reads.
- **Create** `server/routers/observatory.ts` — `observatoryRouter` (3 `tenantProcedure.query`, inline SQL, mirrors `server/routers/cost.ts`).
- **Modify** `server/routers/_app.ts` — register `observatory: observatoryRouter`.
- **Create** `tests/integration/observatory_eval_list.test.ts`, `observatory_learning_cases.test.ts`, `observatory_traces.test.ts` — tenant-isolation + provenance/NULL behavior.
- **Create** `client/src/features/observatory/EvalStatusBadge.tsx` — honest (status × provenance) label (never "measured" for `[I]` floor). + unit test `tests/unit/eval_status_badge.test.tsx`.
- **Create** `client/src/pages/ObservatoryPage.tsx` — the screen (hero Posture + Freedom + Learning + Activity tiers).
- **Modify** `client/src/App.tsx` — `/observatory` route + nav link.
- **Create** `e2e/observatory.spec.ts` — render + a11y.

Backend before frontend. Each task is TDD: write failing test → run-fail → implement → run-pass → commit.

---

### Task 0: Build-session preflight (isolated worktree, green trunk, dedicated DB)

**Files:** none (environment).

- [ ] **Step 1: Fetch + confirm trunk is green before basing work**

```bash
cd /Users/familiagirardicavalcante/Desktop/Musixmatch
git fetch origin
git log --oneline origin/main..HEAD   # expect empty (current branch merged) — never inherit red
git rev-parse --abbrev-ref HEAD        # know where you are before any git op
```

- [ ] **Step 2: Create an ISOLATED worktree (the working copy is shared with the operator; long work must not be polluted by a branch switch — iter-39/40 lesson)**

```bash
git worktree add ../musixmatch-observatory -b feat/observatory origin/main
cd ../musixmatch-observatory
pnpm install
pnpm typecheck   # trunk must be green from the base point; clash is semantic, not textual
```

- [ ] **Step 3: Dedicated pgvector container for DB-backed tests (NEVER the shared :54522, NEVER `supabase db reset`)**

```bash
docker run -d --name mxm-observatory -e POSTGRES_PASSWORD=postgres -p 54541:5432 pgvector/pgvector:pg15
export DATABASE_URL="postgres://postgres:postgres@127.0.0.1:54541/postgres"
pnpm db:migrate   # idempotent; applies all migrations to the dedicated container
```

Expected: typecheck passes, container healthy, migrations applied. Run **one** DB suite at a time later (resetDb collides if concurrent).

---

### Task 1: Read contracts (`shared/contracts_observatory.ts`)

**Files:**
- Create: `shared/contracts_observatory.ts`
- Test: covered by the integration tests (Tasks 2-4 assert against these types).

- [ ] **Step 1: Write the contract file**

```typescript
import { z } from "zod";

// Observatory — read-only contracts over EXISTING produced tables. Nothing here is computed; every
// RESULT field is passed through as-stored and may be NULL pre-run (§14). provenanceByField is the raw
// per-field tag map ([I]/[V]/[C]); the UI gates "green = pass" on provenanceByField.status == '[V]'.
export const AUTONOMY_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export const EVAL_STATUSES = ["red", "green"] as const;

const provMap = z.record(z.string()); // { released_evals: '[I]', status: '[I]', ... }

// One eval cell (the AI's autonomy "grade" per cohort × intent × golden-set version). version is the
// golden-set version (identity, e.g. 'gs-1'), NOT cohort_rule_version. Eval_Cell has NO timestamp ⇒ no
// freshness field here (showing one would fabricate it).
export const observatoryEvalCell = z.object({
  cohortId: z.string(),
  intent: z.string(),
  version: z.string(),
  releasedEvals: z.enum(AUTONOMY_LEVELS).nullable(),
  status: z.enum(EVAL_STATUSES).nullable(),
  nCohortXIntent: z.number().nullable(),
  kappa: z.number().nullable(),
  redteamIndependenceFlag: z.boolean().nullable(),
  redteamJudgeVsHumanResult: z.string().nullable(),
  provenanceByField: provMap,
  cuisine: z.string().nullable(),
  zone: z.string().nullable(),
  tierBase: z.string().nullable(),
});
export type ObservatoryEvalCell = z.infer<typeof observatoryEvalCell>;

// One learned case. outcome is a RESULT [V]; narratives are [C]; reviewed is the human-vetting gate
// (there is NO human_authored / verification_status column). probability/similarLinks are always NULL
// for motor-written cases today.
export const observatoryLearningCase = z.object({
  kbCaseId: z.string(),
  areaType: z.string(),
  pattern: z.string().nullable(),
  outcome: z.string().nullable(),
  resolution: z.string().nullable(),
  notResolvedReason: z.string().nullable(),
  discardedBranches: z.unknown(),
  probability: z.number().nullable(),
  reviewed: z.boolean(),
  provenanceByField: provMap,
  createdAt: z.string(),
});
export type ObservatoryLearningCase = z.infer<typeof observatoryLearningCase>;

export const learningCasesInput = z.object({
  areaType: z.string().min(1).optional(),
  outcome: z.enum(["resolved", "not_resolved", "escalated"]).optional(),
});

// One auto-origin governance trace (what the AI did alone + its gates). gateResult/timeToSignatureSec/
// rubberStampFlag are RESULT, NULL pre-run; independenceGuaranteed is a generated column (trustworthy).
export const observatoryTrace = z.object({
  traceId: z.string(),
  action: z.string(),
  effectiveLevelApplied: z.enum(AUTONOMY_LEVELS).nullable(),
  escalationAxis: z.string().nullable(),
  proposerId: z.string(),
  confirmerId: z.string().nullable(),
  independenceGuaranteed: z.boolean().nullable(),
  gateResult: z.unknown().nullable(),
  timeToSignatureSec: z.number().nullable(),
  rubberStampFlag: z.boolean().nullable(),
  ts: z.string(),
});
export type ObservatoryTrace = z.infer<typeof observatoryTrace>;
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm typecheck`
Expected: PASS (file is types only).

- [ ] **Step 3: Commit**

```bash
git add shared/contracts_observatory.ts
git commit -m "feat(observatory): read-only contracts for eval/learning/trace"
```

---

### Task 2: `observatory.evalList` (tenant-scoped eval grid read)

**Files:**
- Create: `server/routers/observatory.ts`
- Modify: `server/routers/_app.ts` (done in Task 5; for now the test imports the router after Task 5 — so do Task 5's wiring inline here is NOT allowed; instead this task creates the router and Task 5 wires it. The test in this task imports `appRouter`, so register the router at the end of this task's implementation step by also editing `_app.ts`.)
- Test: `tests/integration/observatory_eval_list.test.ts`

> NOTE: because the integration test calls `appRouter.createCaller`, this task both creates `observatory.ts` AND adds the `observatory:` line to `_app.ts`. Task 5 is then a no-op confirmation. (Kept as one unit so the test is runnable.)

- [ ] **Step 1: Write the failing test**

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { makePool, resetDb, rows } from "../helpers/db";

function caller(tenantId: string, userId: string) {
  const ctx: Context = { session: { user_id: userId, tenant_id: tenantId, org_level: "team" }, tenantId, userId };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;
beforeAll(async () => { pool = makePool(); await resetDb(pool); }, 60_000);
afterAll(async () => { await pool.end(); });

describe("observatory.evalList — own-tenant only, provenance passed through, no fabricated freshness", () => {
  it("returns this pool's eval cells and NOT another pool's", async () => {
    const version = (await rows<{ value: string }>(pool,
      `select value from catalog."Config_Knobs" where key='cohort_rule_version_current'`))[0]!.value;
    const r2 = (await rows<{ restaurant_id: string }>(pool,
      `select restaurant_id from tenant."Restaurant" where tenant_id='POOL-002' order by restaurant_id limit 1`))[0]!;
    const intent = (await rows<{ intent_id: string }>(pool,
      `select intent_id from catalog."Intent_Catalog" order by intent_id limit 1`))[0]!.intent_id;

    // a cohort owned by POOL-002 (membership) with an [I] floor eval cell
    await pool.query(`insert into cohort."Cohort"(cohort_id,cuisine,zone,tier_base,cohort_rule_version)
      values ('c_obs','pizza','north','long_tail',$1) on conflict do nothing`, [version]);
    await pool.query(`insert into cohort."Cohort_Membership_Snapshot"
      (restaurant_id,cohort_id,week,cohort_rule_version,percentile_in_cohort,gap_to_top,provenance)
      values ($1,'c_obs','2026-06-22',$2,50,0.5,'[V]')`, [r2.restaurant_id, version]);
    await pool.query(`insert into gov."Eval_Cell"(cohort_id,intent,version,released_evals,status,provenance_by_field)
      values ('c_obs',$1,'gs-1','LOW'::public.autonomy_level,'green'::public.eval_status,
              jsonb_build_object('released_evals','[I]','status','[I]'))
      on conflict (cohort_id,intent,version) do nothing`, [intent]);

    const owner = await caller("POOL-002", "U-OP-002").observatory.evalList();
    const cell = owner.find((c) => c.cohortId === "c_obs");
    expect(cell).toBeDefined();
    expect(cell!.releasedEvals).toBe("LOW");
    expect(cell!.status).toBe("green");
    expect(cell!.provenanceByField.status).toBe("[I]"); // green is [I] floor, NOT a measured pass
    expect(cell!.kappa).toBeNull();                       // RESULT NULL under floor, never 0
    expect(cell).not.toHaveProperty("freshness");          // Eval_Cell has no timestamp ⇒ no freshness

    const other = await caller("POOL-PAY", "U-PAY-001").observatory.evalList();
    expect(other.find((c) => c.cohortId === "c_obs")).toBeUndefined(); // cross-pool isolation (§3.4)
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm test:integration -- observatory_eval_list`
Expected: FAIL (`observatory` router does not exist).

- [ ] **Step 3: Implement the router (create `server/routers/observatory.ts`)**

```typescript
import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";
import {
  learningCasesInput,
  type ObservatoryEvalCell,
  type ObservatoryLearningCase,
  type ObservatoryTrace,
} from "../../shared/contracts_observatory.js";

// Observatory — read-only VITRINA over already-produced gov/tenant tables. Every value is read
// as-stored (§14); nothing is computed or ranked here. tenant resolved server-side (§3.4). Own-tenant
// internal view ⇒ NO k-anon/n_min suppression (full traceability).
export const observatoryRouter = router({
  // Eval grid. Eval_Cell has NO tenant_id ⇒ scope by joining cohort_id → Cohort_Membership_Snapshot →
  // Restaurant.tenant_id (the producer pattern, provision.ts:22-25), pinned to the current cohort rule
  // version to avoid cross-version membership over-count. Eval_Cell.version (gs-1) is golden-set identity.
  evalList: tenantProcedure.query(async ({ ctx }): Promise<ObservatoryEvalCell[]> => {
    const version = (
      await query<{ value: string }>(`select value from catalog."Config_Knobs" where key='cohort_rule_version_current'`)
    )[0]?.value;
    if (!version) return []; // fail-closed (§3.8): no current version ⇒ nothing to show, never guess
    const r = await query<{
      cohort_id: string; intent: string; version: string;
      released_evals: "LOW" | "MEDIUM" | "HIGH" | null; status: "red" | "green" | null;
      n_cohort_x_intent: number | null; kappa: number | null;
      redteam_independence_flag: boolean | null; redteam_judge_vs_human_result: string | null;
      provenance_by_field: Record<string, string>;
      cuisine: string | null; zone: string | null; tier_base: string | null;
    }>(
      `select e.cohort_id, e.intent, e.version, e.released_evals, e.status,
              e.n_cohort_x_intent, e.kappa::float8 as kappa,
              e.redteam_independence_flag, e.redteam_judge_vs_human_result, e.provenance_by_field,
              c.cuisine, c.zone, c.tier_base
         from gov."Eval_Cell" e
         join cohort."Cohort" c on c.cohort_id = e.cohort_id
        where exists (
          select 1 from cohort."Cohort_Membership_Snapshot" cms
            join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $1
           where cms.cohort_id = e.cohort_id and cms.cohort_rule_version = $2)
        order by e.cohort_id, e.intent`,
      [ctx.tenantId, version],
    );
    return r.map((x) => ({
      cohortId: x.cohort_id, intent: x.intent, version: x.version,
      releasedEvals: x.released_evals, status: x.status,
      nCohortXIntent: x.n_cohort_x_intent, kappa: x.kappa,
      redteamIndependenceFlag: x.redteam_independence_flag,
      redteamJudgeVsHumanResult: x.redteam_judge_vs_human_result,
      provenanceByField: x.provenance_by_field ?? {},
      cuisine: x.cuisine, zone: x.zone, tierBase: x.tier_base,
    }));
  }),

  // (learningCases + traces added in Tasks 3-4)
});
```

Then register it in `server/routers/_app.ts` (add the import and the line, alphabetical-ish near `cost`/`motor`):

```typescript
import { observatoryRouter } from "./observatory.js";
// ...inside the appRouter object literal:
  observatory: observatoryRouter,
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `pnpm test:integration -- observatory_eval_list`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routers/observatory.ts server/routers/_app.ts tests/integration/observatory_eval_list.test.ts
git commit -m "feat(observatory): tenant-scoped evalList read (cohort→membership→tenant join, provenance passthrough)"
```

---

### Task 3: `observatory.learningCases` (full case list, tenant-scoped)

**Files:**
- Modify: `server/routers/observatory.ts`
- Test: `tests/integration/observatory_learning_cases.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { makePool, resetDb } from "../helpers/db";

function caller(t: string, u: string) {
  const ctx: Context = { session: { user_id: u, tenant_id: t, org_level: "team" }, tenantId: t, userId: u };
  return appRouter.createCaller(ctx);
}
let pool: pg.Pool;
beforeAll(async () => { pool = makePool(); await resetDb(pool); }, 60_000);
afterAll(async () => { await pool.end(); });

describe("observatory.learningCases — own-tenant, provenance + reviewed surfaced", () => {
  it("returns this pool's cases (resolved/escalated) and not another pool's", async () => {
    await pool.query(`insert into tenant."Knowledge_Case"
      (tenant_id,area_type,pattern,outcome,resolution,reviewed,provenance_by_field)
      values ('POOL-002','payment','dup charge','resolved','refunded',false,
              jsonb_build_object('outcome','[V]','resolution','[C]'))`);
    await pool.query(`insert into tenant."Knowledge_Case"
      (tenant_id,area_type,pattern,outcome,not_resolved_reason,reviewed,provenance_by_field)
      values ('POOL-PAY','payment','secret pattern','escalated','needs human',false,
              jsonb_build_object('outcome','[V]','not_resolved_reason','[C]'))`);

    const owner = await caller("POOL-002", "U-OP-002").observatory.learningCases({});
    expect(owner.some((c) => c.pattern === "dup charge")).toBe(true);
    expect(owner.some((c) => c.pattern === "secret pattern")).toBe(false); // cross-pool isolation
    const one = owner.find((c) => c.pattern === "dup charge")!;
    expect(one.provenanceByField.outcome).toBe("[V]");
    expect(one.reviewed).toBe(false);
    expect(one.probability).toBeNull(); // never written by motor ⇒ NULL, not 0
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm test:integration -- observatory_learning_cases`
Expected: FAIL (`learningCases` not a function).

- [ ] **Step 3: Implement (add to `observatoryRouter` in `server/routers/observatory.ts`, import `learningCasesInput` already present)**

```typescript
  // Full learned-case list (any outcome). Knowledge_Case HAS tenant_id ⇒ straightforward scope.
  // outcome='not_resolved' is structurally empty today (motor writes only resolved/escalated) — the UI
  // shows an honest empty tier, never a fake value. probability/similar_links are always NULL today.
  learningCases: tenantProcedure.input(learningCasesInput).query(
    async ({ ctx, input }): Promise<ObservatoryLearningCase[]> => {
      const where: string[] = [`tenant_id = $1`];
      const params: unknown[] = [ctx.tenantId];
      if (input.areaType) { params.push(input.areaType); where.push(`area_type = $${params.length}`); }
      if (input.outcome) { params.push(input.outcome); where.push(`outcome = $${params.length}`); }
      const r = await query<{
        kb_case_id: string; area_type: string; pattern: string | null; outcome: string | null;
        resolution: string | null; not_resolved_reason: string | null; discarded_branches: unknown;
        probability: number | null; reviewed: boolean; provenance_by_field: Record<string, string>;
        created_at: string;
      }>(
        `select kb_case_id, area_type, pattern, outcome, resolution, not_resolved_reason,
                discarded_branches, probability::float8 as probability, reviewed,
                provenance_by_field, created_at::text as created_at
           from tenant."Knowledge_Case"
          where ${where.join(" and ")}
          order by created_at desc limit 100`,
        params,
      );
      return r.map((x) => ({
        kbCaseId: x.kb_case_id, areaType: x.area_type, pattern: x.pattern, outcome: x.outcome,
        resolution: x.resolution, notResolvedReason: x.not_resolved_reason,
        discardedBranches: x.discarded_branches, probability: x.probability, reviewed: x.reviewed,
        provenanceByField: x.provenance_by_field ?? {}, createdAt: x.created_at,
      }));
    },
  ),
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm test:integration -- observatory_learning_cases`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routers/observatory.ts tests/integration/observatory_learning_cases.test.ts
git commit -m "feat(observatory): tenant-scoped learningCases read (provenance + reviewed surfaced)"
```

---

### Task 4: `observatory.traces` (auto-origin governance traces, tenant via Action_Dispatch)

**Files:**
- Modify: `server/routers/observatory.ts`
- Test: `tests/integration/observatory_traces.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { makePool, resetDb } from "../helpers/db";

function caller(t: string, u: string) {
  const ctx: Context = { session: { user_id: u, tenant_id: t, org_level: "team" }, tenantId: t, userId: u };
  return appRouter.createCaller(ctx);
}
let pool: pg.Pool;
beforeAll(async () => { pool = makePool(); await resetDb(pool); }, 60_000);
afterAll(async () => { await pool.end(); });

describe("observatory.traces — auto-origin only, scoped by Action_Dispatch.tenant_id", () => {
  it("returns the running pool's auto traces and renders NULL result fields honestly", async () => {
    const res = await caller("POOL-PAY", "U-PAY-001").observatory.traces();
    expect(Array.isArray(res)).toBe(true);
    // every returned row is an auto-origin governance trace; NULL result fields stay null (never 0)
    for (const t of res) {
      expect(["release", "pause", "override"]).toContain(t.action);
      if (t.timeToSignatureSec === null) expect(t.timeToSignatureSec).toBeNull();
    }
    // a foreign pool's caller never sees POOL-PAY's auto traces
    const foreign = await caller("POOL-002", "U-OP-002").observatory.traces();
    const ids = new Set(foreign.map((t) => t.traceId));
    for (const t of res) expect(ids.has(t.traceId)).toBe(false);
  });
});
```

> If the seed has no auto-dispatched traces, the arrays may be empty — the test still proves scoping (no cross-pool ids) and shape. To make it non-vacuous, optionally run `await caller("POOL-PAY","U-PAY-001").cockpit.proposePool()` first if the seed supports auto-dispatch; otherwise the empty-but-isolated assertion is acceptable and documented.

- [ ] **Step 2: Run — verify fail**

Run: `pnpm test:integration -- observatory_traces`
Expected: FAIL (`traces` not a function).

- [ ] **Step 3: Implement (add to `observatoryRouter`)**

```typescript
  // Auto-origin governance traces (what the AI did alone + its gates). Decision_Trace has NO tenant_id
  // and no uniform tenant join; anchor on Action_Dispatch.tenant_id (the dispatch owner) with
  // origin='auto' — the same safe anchor listAutoActions uses (cockpit.ts:141), and exactly the
  // "what the AI did alone" governing thought. gate_result/time_to_signature_sec/rubber_stamp_flag are
  // RESULT NULL-pre-run; independence_guaranteed is a generated column (trustworthy).
  traces: tenantProcedure.query(async ({ ctx }): Promise<ObservatoryTrace[]> => {
    const r = await query<{
      trace_id: string; action: string; effective_level_applied: "LOW" | "MEDIUM" | "HIGH" | null;
      escalation_axis: string | null; proposer_id: string; confirmer_id: string | null;
      independence_guaranteed: boolean | null; gate_result: unknown | null;
      time_to_signature_sec: number | null; rubber_stamp_flag: boolean | null; ts: string;
    }>(
      `select dt.trace_id, dt.action::text as action, dt.effective_level_applied,
              dt.escalation_axis::text as escalation_axis, dt.proposer_id, dt.confirmer_id,
              dt.independence_guaranteed, dt.gate_result, dt.time_to_signature_sec,
              dt.rubber_stamp_flag, dt."timestamp"::text as ts
         from gov."Decision_Trace" dt
         join gov."Action_Dispatch" ad on ad.decision_trace_id = dt.trace_id
        where ad.tenant_id = $1 and dt.origin = 'auto'
        order by dt."timestamp" desc limit 50`,
      [ctx.tenantId],
    );
    return r.map((x) => ({
      traceId: x.trace_id, action: x.action, effectiveLevelApplied: x.effective_level_applied,
      escalationAxis: x.escalation_axis, proposerId: x.proposer_id, confirmerId: x.confirmer_id,
      independenceGuaranteed: x.independence_guaranteed, gateResult: x.gate_result,
      timeToSignatureSec: x.time_to_signature_sec, rubberStampFlag: x.rubber_stamp_flag, ts: x.ts,
    }));
  }),
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm test:integration -- observatory_traces`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routers/observatory.ts tests/integration/observatory_traces.test.ts
git commit -m "feat(observatory): auto-origin traces read (Action_Dispatch.tenant_id anchor)"
```

---

### Task 5: Confirm router wiring + anti-fake check

**Files:** `server/routers/_app.ts` (already edited in Task 2).

- [ ] **Step 1: Confirm registration + full backend gate**

Run: `pnpm typecheck && pnpm lint && pnpm test:antifake && pnpm test:integration -- observatory_`
Expected: PASS. (`test:antifake` must stay green — Observatory writes nothing, so seed→pre-producer NULL invariants are untouched.)

- [ ] **Step 2: Commit (only if `_app.ts` needed a follow-up tweak; otherwise skip)**

```bash
git add -A && git commit -m "chore(observatory): confirm router wiring + green backend gate" || true
```

---

### Task 6: `EvalStatusBadge` — honest (status × provenance) label

**Files:**
- Create: `client/src/features/observatory/EvalStatusBadge.tsx`
- Test: `tests/unit/eval_status_badge.test.tsx`

> Why a new badge, not `ProvenanceBadge`: `ProvenanceBadge` maps `[V]`→the word "measured" (`ProvenanceBadge.tsx:8`). An `[I]` eval floor or a human cap edit is NOT "measured"; reusing that label would fake a golden-set pass. This badge renders the honest eval semantics; `ProvenanceBadge` stays unchanged (surgical).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvalStatusBadge } from "../../client/src/features/observatory/EvalStatusBadge";

describe("EvalStatusBadge — never fakes a measured pass", () => {
  it("green + [I] provenance reads as inferred floor, NOT measured", () => {
    render(<EvalStatusBadge status="green" prov="[I]" />);
    expect(screen.getByText(/inferred floor/i)).toBeInTheDocument();
    expect(screen.queryByText(/measured/i)).toBeNull();
  });
  it("green + [V] provenance reads as a measured pass", () => {
    render(<EvalStatusBadge status="green" prov="[V]" />);
    expect(screen.getByText(/measured/i)).toBeInTheDocument();
  });
  it("null status reads as not yet evaluated", () => {
    render(<EvalStatusBadge status={null} prov={undefined} />);
    expect(screen.getByText(/not yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm test -- eval_status_badge`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
// Honest eval status: color + icon + text (WCAG, never color-only). green is a PASS only when the
// producer measured it (provenance [V]); the current floor is [I] ⇒ "inferred floor (not yet measured)".
// null status ⇒ not yet evaluated. Never renders the word "measured" for an [I] floor (§14 UI face).
export function EvalStatusBadge({ status, prov }: { status: "red" | "green" | null; prov?: string }) {
  if (status === null) {
    return <span className="text-mxm-content-tertiary text-xs" title="No verdict produced yet">○ not yet evaluated</span>;
  }
  if (status === "green" && prov === "[V]") {
    return <span className="text-mxm-green text-xs" title="Measured pass — golden set ran ([V])">✓ measured pass</span>;
  }
  if (status === "green") {
    return <span className="text-mxm-amber text-xs" title="Inferred conservative floor, not a measured pass ([I])">◐ inferred floor</span>;
  }
  return <span className="text-mxm-red text-xs" title="Did not pass">✕ red</span>;
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm test -- eval_status_badge`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/observatory/EvalStatusBadge.tsx tests/unit/eval_status_badge.test.tsx
git commit -m "feat(observatory): honest EvalStatusBadge (never 'measured' for [I] floor)"
```

---

### Task 7: `ObservatoryPage` scaffold — route, nav, Posture hero

**Files:**
- Create: `client/src/pages/ObservatoryPage.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create the page with the Posture hero (mirrors CostPage dev-login + read pattern)**

```tsx
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";

// Observatory — read-only awareness of what the AI does on its own. Awareness screen: the signal is the
// hero (Posture), actions are quiet/guarded. Every number is read from a producer (§14); nothing computed
// here. dev-login mints the POOL-PAY operator; tenant resolved server-side.
export function ObservatoryPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function login(attempt = 0): Promise<void> {
      try {
        const r = await fetch("/auth/dev-login", {
          method: "POST", headers: { "content-type": "application/json" },
          credentials: "include", body: JSON.stringify({ user_id: "U-PAY-001" }),
        });
        if (!r.ok) throw new Error(String(r.status));
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled && attempt < 15) setTimeout(() => void login(attempt + 1), 500);
        else if (!cancelled) setReady(true);
      }
    }
    void login();
    return () => { cancelled = true; };
  }, []);

  const week = trpc.cockpit.weekSummary.useQuery(undefined, { enabled: ready });
  const cost = trpc.cost.summary.useQuery(undefined, { enabled: ready });

  return (
    <main className="mx-auto max-w-screen-xl p-[clamp(1rem,2vw,2rem)]">
      <header className="mb-6">
        <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-mxm-content">Observatory</h1>
        <p className="mt-1.5 max-w-[64ch] text-sm leading-relaxed text-mxm-content-secondary">
          What the AI is doing on its own — what it acted on, what it learned, how far it may go, and the cost.
          Read-only; every number is measured by a producer, never invented.
        </p>
      </header>

      {!ready || week.isLoading ? (
        <LoadingState label={!ready ? "Signing in…" : "Reading activity…"} />
      ) : week.isError || !week.data ? (
        <ErrorState />
      ) : (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="AI posture this week">
          <Stat label="Acted alone (7d)" value={String(week.data.auto_acted)} />
          <Stat label="Released by you" value={String(week.data.released)} />
          <Stat label="Paused by you" value={String(week.data.paused)} />
          <Stat
            label="Tokens (total)"
            value={cost.data ? `$${(cost.data.total.costUsd ?? 0).toFixed(2)}` : "—"}
            sub="see /cost"
          />
        </section>
      )}
      {/* Freedom / Learning / Activity tiers added in Tasks 8-10 */}
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-mxm border border-mxm-border p-4">
      <div className="text-xs text-mxm-content-secondary">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-mxm-content">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-mxm-content-tertiary">{sub}</div> : null}
    </div>
  );
}
```

- [ ] **Step 2: Wire the route + nav in `client/src/App.tsx`**

Add the import beside the other page imports:
```tsx
import { ObservatoryPage } from "@/pages/ObservatoryPage";
```
Add the route inside `<Switch>` **before** the catch-all `<Route>` (wouter matches in order):
```tsx
<Route path="/observatory" component={ObservatoryPage} />
```
Add a nav link in the `<nav>` (mirror the existing `NavLink` usage):
```tsx
<NavLink href="/observatory" active={loc.startsWith("/observatory")}>Observatory</NavLink>
```

- [ ] **Step 3: Verify build + typecheck**

Run: `pnpm typecheck && pnpm build`
Expected: PASS; `/observatory` is reachable.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/ObservatoryPage.tsx client/src/App.tsx
git commit -m "feat(observatory): page scaffold + route + Posture hero"
```

---

### Task 8: Freedom tier — read-only eval grid + cap edit (reuses cockpit config upload)

**Files:**
- Modify: `client/src/pages/ObservatoryPage.tsx`
- Create: `client/src/features/observatory/FreedomTier.tsx`

- [ ] **Step 1: Build the tier (eval grid read-only via `observatory.evalList` + `EvalStatusBadge`; cap edit reuses `cockpit.configTemplate`/`cockpit.uploadConfig`)**

```tsx
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";
import { EvalStatusBadge } from "./EvalStatusBadge";
import { AutonomyControls } from "@/features/cockpit/AutonomyControls";

// Freedom = how far the AI may go. The eval grid is READ-ONLY (the grade is producer-measured; the
// human cannot type it — §14). The human lever is the CAP, edited via the EXISTING cockpit config
// template/upload (managerProcedure, [V], version-immutable). Deep tier/knob controls reuse the
// existing AutonomyControls modal.
export function FreedomTier({ ready }: { ready: boolean }) {
  const evals = trpc.observatory.evalList.useQuery(undefined, { enabled: ready });
  const tmpl = trpc.cockpit.configTemplate.useQuery(undefined, { enabled: false });
  const upload = trpc.cockpit.uploadConfig.useMutation();
  const utils = trpc.useUtils();
  const [controlsOpen, setControlsOpen] = useState(false);

  return (
    <section className="mt-6" aria-label="How far the AI may go">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium text-mxm-content">Freedom — the autonomy boundary</h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setControlsOpen(true)}>Adjust limit…</Button>
        </div>
      </div>

      {evals.isLoading ? (
        <div className="h-24 animate-pulse rounded-mxm border border-mxm-border" />
      ) : evals.isError ? (
        <p className="text-sm text-mxm-red">Couldn’t read evals — retry.</p>
      ) : (evals.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-mxm-content-secondary">No eval cells yet. Prepare the cockpit to seed the floor.</p>
      ) : (
        <div className="overflow-hidden rounded-mxm border border-mxm-border">
          <table className="w-full text-sm">
            <thead className="bg-mxm-bg-secondary text-left text-xs text-mxm-content-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">Cohort</th>
                <th className="px-3 py-2 font-medium">Intent</th>
                <th className="px-3 py-2 font-medium">Allowed level</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {evals.data!.map((e) => (
                <tr key={`${e.cohortId}-${e.intent}-${e.version}`} className="border-t border-mxm-border">
                  <td className="px-3 py-2 text-mxm-content">{e.cohortId}</td>
                  <td className="px-3 py-2 text-mxm-content-secondary">{e.intent}</td>
                  <td className="px-3 py-2 text-mxm-content">{e.releasedEvals ?? "not yet measured"}</td>
                  <td className="px-3 py-2">
                    <EvalStatusBadge status={e.status} prov={e.provenanceByField?.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AutonomyControls open={controlsOpen} onClose={() => { setControlsOpen(false); void utils.observatory.evalList.invalidate(); }} />
      {/* Cap-via-template: download cockpit.configTemplate, edit tier_cap, cockpit.uploadConfig — same
          managerProcedure path as the cockpit "upload config". Surfaced as a quiet secondary action;
          full UI mirrors the existing cockpit config modal. tmpl/upload wired here for that flow. */}
    </section>
  );
}
```

> Implementation note for the executor: the cap-edit upload UI is the SAME shape as the cockpit's existing config-upload modal — reuse that component if it is extractable, else mirror it. Do not write a new upload endpoint; `cockpit.uploadConfig` already writes `Policy_Tier.tier_cap` (managerProcedure, allowlist, version-immutable, `[V]`/operator, resets `measured_result`).

- [ ] **Step 2: Mount it in `ObservatoryPage` (pass `ready`)** — add `<FreedomTier ready={ready} />` after the Posture section.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/features/observatory/FreedomTier.tsx client/src/pages/ObservatoryPage.tsx
git commit -m "feat(observatory): Freedom tier — read-only eval grid + cap edit (reuses cockpit config)"
```

---

### Task 9: Learning tier — cases + queue, approve/reject (reuses motor.controls.set)

**Files:**
- Modify: `client/src/pages/ObservatoryPage.tsx`
- Create: `client/src/features/observatory/LearningTier.tsx`

- [ ] **Step 1: Build the tier (`observatory.learningCases` list + `motor.escalations` + `motor.controls.get.pending_cases`; expand shows the "why": pattern + discarded branches; approve via `motor.controls.set({approve_case_id})`)**

```tsx
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";

// Learning = what the AI took from cases. Read-only list with the "why" on expand (cite-don't-assert).
// Vetting state is `reviewed` (there is no human_authored/verification_status). Approve reuses the
// existing motor.controls.set; nothing is recomputed here.
export function LearningTier({ ready }: { ready: boolean }) {
  const cases = trpc.observatory.learningCases.useQuery({}, { enabled: ready });
  const utils = trpc.useUtils();
  const approve = trpc.motor.controls.set.useMutation({
    onSuccess: () => { void utils.observatory.learningCases.invalidate(); },
  });

  return (
    <section className="mt-6" aria-label="What the AI learned">
      <h2 className="mb-2 text-sm font-medium text-mxm-content">Learning</h2>
      {cases.isLoading ? (
        <div className="h-24 animate-pulse rounded-mxm border border-mxm-border" />
      ) : cases.isError ? (
        <p className="text-sm text-mxm-red">Couldn’t read learning — retry.</p>
      ) : (cases.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-mxm-content-secondary">Nothing learned yet.</p>
      ) : (
        <ul className="space-y-2">
          {cases.data!.map((c) => (
            <li key={c.kbCaseId} className="rounded-mxm border border-mxm-border p-3">
              <details>
                <summary className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="text-mxm-content">{c.pattern ?? c.areaType}</span>
                  <span className="flex items-center gap-2 text-xs">
                    <span className={c.outcome === "resolved" ? "text-mxm-green" : "text-mxm-amber"}>
                      {c.outcome ?? "—"}
                    </span>
                    <span className="text-mxm-content-tertiary">{c.reviewed ? "✓ vetted" : "awaiting OK"}</span>
                  </span>
                </summary>
                <div className="mt-2 text-xs text-mxm-content-secondary">
                  {c.resolution ?? c.notResolvedReason ?? "—"}
                  {!c.reviewed && (
                    <div className="mt-2">
                      <Button
                        variant="ghost"
                        disabled={approve.isPending}
                        onClick={() => {
                          if (confirm("Approve this learned case so the AI may reuse it?")) {
                            approve.mutate({ approve_case_id: c.kbCaseId });
                          }
                        }}
                      >
                        Approve
                      </Button>
                    </div>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

> Confirm-before: approve uses `confirm()` (the case becomes groundable, an autonomy-affecting act). `motor.controls.set` is `managerProcedure`; a non-manager mutation will reject — surface the error.

- [ ] **Step 2: Mount `<LearningTier ready={ready} />` in `ObservatoryPage` after Freedom.**

- [ ] **Step 3: Verify** — `pnpm typecheck && pnpm build` → PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/features/observatory/LearningTier.tsx client/src/pages/ObservatoryPage.tsx
git commit -m "feat(observatory): Learning tier — cases + why-on-expand + approve (reuses motor.controls.set)"
```

---

### Task 10: Activity tier — auto-actions + governance traces, release/pause confirm-before

**Files:**
- Modify: `client/src/pages/ObservatoryPage.tsx`
- Create: `client/src/features/observatory/ActivityTier.tsx`

- [ ] **Step 1: Build the tier (`cockpit.autoActions` + `observatory.traces`; NULL result fields render honest-pending; release/pause reuses `cockpit.release` with confirm-before since Decision_Trace is append-only)**

```tsx
import { trpc } from "@/lib/trpc";

// Activity = what the AI did alone + its governance gates. NULL result fields (time-to-sign, gates,
// rubber-stamp) render an explicit "not measured", never 0 or a fake value (§14). Traces are an
// append-only audit — read-only here; release/pause is the existing guarded cockpit action.
export function ActivityTier({ ready }: { ready: boolean }) {
  const traces = trpc.observatory.traces.useQuery(undefined, { enabled: ready });
  return (
    <section className="mt-6" aria-label="What the AI did alone">
      <h2 className="mb-2 text-sm font-medium text-mxm-content">Activity &amp; trace</h2>
      {traces.isLoading ? (
        <div className="h-24 animate-pulse rounded-mxm border border-mxm-border" />
      ) : traces.isError ? (
        <p className="text-sm text-mxm-red">Couldn’t read traces — retry.</p>
      ) : (traces.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-mxm-content-secondary">No autonomous actions recorded yet.</p>
      ) : (
        <div className="overflow-hidden rounded-mxm border border-mxm-border">
          <table className="w-full text-sm">
            <thead className="bg-mxm-bg-secondary text-left text-xs text-mxm-content-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Level</th>
                <th className="px-3 py-2 font-medium">Independent?</th>
                <th className="px-3 py-2 font-medium">Time to sign</th>
              </tr>
            </thead>
            <tbody>
              {traces.data!.map((t) => (
                <tr key={t.traceId} className="border-t border-mxm-border">
                  <td className="px-3 py-2 text-mxm-content-secondary">{t.ts.slice(0, 10)}</td>
                  <td className="px-3 py-2 text-mxm-content">{t.action}</td>
                  <td className="px-3 py-2 text-mxm-content">{t.effectiveLevelApplied ?? "—"}</td>
                  <td className="px-3 py-2 text-mxm-content-secondary">
                    {t.independenceGuaranteed === null ? "—" : t.independenceGuaranteed ? "yes" : "no"}
                  </td>
                  <td className="px-3 py-2 text-mxm-content-secondary">
                    {t.timeToSignatureSec === null ? "not measured" : `${t.timeToSignatureSec}s`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

> Release/pause: if surfaced inline, it reuses `cockpit.release` with a `confirm()` (append-only ⇒ no undo) and renders as a quiet ghost control — never a resting coral button (awareness screen, §1).

- [ ] **Step 2: Mount `<ActivityTier ready={ready} />` after Learning.**

- [ ] **Step 3: Verify** — `pnpm typecheck && pnpm build` → PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/features/observatory/ActivityTier.tsx client/src/pages/ObservatoryPage.tsx
git commit -m "feat(observatory): Activity tier — auto-actions + governance traces (honest NULL rendering)"
```

---

### Task 11: e2e render + a11y + full gate

**Files:**
- Create: `e2e/observatory.spec.ts`

- [ ] **Step 1: Write a render + a11y e2e (mirror an existing `e2e/*.spec.ts`)**

```typescript
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("observatory renders posture + tiers and passes axe", async ({ page }) => {
  await page.goto("/observatory");
  await expect(page.getByRole("heading", { name: "Observatory" })).toBeVisible();
  await expect(page.getByLabel("AI posture this week")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});
```

- [ ] **Step 2: Run the full gate (one DB suite at a time)**

Run:
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:antifake
pnpm test:integration -- observatory_
pnpm build && pnpm test:e2e -- observatory && pnpm test:a11y -- observatory
```
Expected: all PASS, with output captured as evidence (§5 — command + output, not "it passes").

- [ ] **Step 3: Commit**

```bash
git add e2e/observatory.spec.ts
git commit -m "test(observatory): e2e render + a11y"
```

---

### Task 12: Review-chain + ship (no autonomous merge)

- [ ] **Step 1: Adversarial review** — `/codex` on the full diff (refute vs the spec Done-when; macOS: run `codex exec` directly / `gtimeout`, the `timeout` wrapper is broken). Fix anything real; re-review.
- [ ] **Step 2: `/qa`** — browser pass on `/observatory` (it has UI). Verify: green-cell with `[I]` provenance reads "inferred floor", NULL result fields read "not measured", cross-pool returns nothing.
- [ ] **Step 3: `/finishing-a-development-branch`** — confirm green gate with evidence; present merge/PR options.
- [ ] **Step 4: Push the branch + open the PR** citing the spec; **stop and wait for the operator's merge** (human owns the merge).

---

## Self-review (run against the spec)

- **Spec coverage:** Posture (Task 7) · Evals read + cap edit (Task 8) · Learning + approve (Task 9) · Activity + traces + release/pause (Task 10) · Cost folded into Posture (Task 7) + link to /cost · Boundary via AutonomyControls (Task 8). All spec zones mapped.
- **§14:** no result written anywhere; eval grade read-only (Task 8); green gated on `[V]` provenance (Tasks 6/8); NULL results render honest-pending (Tasks 6/10). ✓
- **Tenant:** evalList joins cohort→membership→Restaurant.tenant_id + version pin (Task 2); traces anchor Action_Dispatch.tenant_id+origin='auto' (Task 4); learningCases WHERE tenant_id (Task 3); each has a cross-pool test. ✓
- **k-anon ABSENT:** no suppression in any read; own-tenant full traceability (spec invariant; tests assert un-suppressed owner rows). ✓
- **Corrections folded:** eval has NO freshness (no timestamp column) — dropped from the grid (Task 1/2); `human_authored`/`verification_status` absent — use `reviewed` (Task 3/9); `version`=golden-set identity, not cohort_rule_version (Task 1). ✓
- **Type consistency:** `releasedEvals`/`status`/`provenanceByField` names consistent across contract (Task 1), router (Tasks 2-4), and UI (Tasks 6/8). ✓
- **No placeholders:** every code step has real code; the only deferred detail is the cap-upload modal markup (Task 8), which explicitly reuses the existing cockpit config-upload component/endpoint (no new code).
