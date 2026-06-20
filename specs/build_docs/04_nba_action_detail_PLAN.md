# NBA Action Detail — Impl Plan (caveman)

> **Agentic workers:** REQUIRED SUB-SKILL — superpowers:subagent-driven-development (rec) OR superpowers:executing-plans. Steps = checkbox (`- [ ]`).
> Prose = caveman (compressed). Code blocks + commands = verbatim, exact (CLAUDE.md §0). Triple-checked /sat + /problem-solving; 1 robustness fix folded into Task 3 test.

**Goal:** screen-in-cockpit per NBA action (A1..A8): **Definition** (what is) + **Operation** (works?). Hit rate = deterministic DIAGNOSTIC rate — pick "solid" only if chosen dim out-of-standard AND backed by enough non-suppressed evidence.

**Architecture:** reuse `catalog."NBA_Catalogo"` → definition. Derive operation history from `gov."NBA_Proposal"` company-wide (Leo) via new SQL fn. Engine (`nba_engine.proposeNba`) extended → STAMP evidence (`verdict`,`n_min_ok`,`k_anon_ok`) it already has but discards → hit rate computable. No new table. Spec: [04_nba_action_detail.md](04_nba_action_detail.md).

**Tech:** TS strict · Postgres (Supabase) · tRPC v11 + Zod v3 · React 19 + wouter + TanStack Query · Tailwind `--mxm-*` · Vitest · pgTAP · Playwright.

**Order:** A1 + A2 = independent DDL. B needs A2. C needs A1+B. D needs C. Green-before-commit each.

---

## File Structure

| File | Does | Task |
|---|---|---|
| `supabase/migrations/20260619150000_nba_detail_catalog.sql` | + `playbook`,`created_at` on NBA_Catalogo (ref data) | 1 |
| `supabase/seed.sql` (mod) | seed playbook + created_at A1..A8 (English §0) | 1 |
| `supabase/tests/nba_detail_test.sql` | pgTAP: catalog cols filled + fn zero-run NULL | 1,3 |
| `supabase/migrations/20260619150100_nba_proposal_evidence.sql` | + `diagnosis_verdict`,`n_min_ok`,`k_anon_ok` (RESULT §14) | 2 |
| `server/agente/nba_engine.ts` (mod) | stamp evidence it already has | 2 |
| `tests/integration/nba_engine.test.ts` (mod) | assert evidence stamped [V] | 2 |
| `supabase/migrations/20260619150200_nba_action_history.sql` | `cohort.fn_nba_action_history(action_code)` company-wide | 3 |
| `tests/integration/nba_action_history.test.ts` | solid/unconfirmed/no_data split + rate + §14 | 3 |
| `shared/contracts.ts` (mod) | `nbaDetailInput` + `nbaActionDefinition/History/Detail` | 4 |
| `server/routers/nba.ts` (mod) | `nba.detail` (auth-gated; history company-wide) | 4 |
| `tests/integration/nba_routes.test.ts` (mod) | detail returns def+history; unknown ⇒ NOT_FOUND | 4 |
| `client/src/features/cockpit/useDevLogin.ts` | DRY dev-login (cockpit + detail share) | 5 |
| `client/src/pages/ActionDetailPage.tsx` | the 2-view screen | 5 |
| `client/src/App.tsx` (mod) | route `/cockpit/action/:code` | 5 |
| `client/src/features/cockpit/NbaModal.tsx` (mod) | link → track record | 5 |
| `e2e/action_detail.spec.ts` | @a11y axe + 2 views render | 5 |

---

## Task 1: Catalog — `playbook` + `created_at` (02:DETAIL-A1)

**Files:**
- Create: `supabase/migrations/20260619150000_nba_detail_catalog.sql`
- Modify: `supabase/seed.sql` (after slice-3 metadata UPDATE, ~line 114)
- Test: `supabase/tests/nba_detail_test.sql`

- [ ] **Step 1: failing pgTAP test**

Create `supabase/tests/nba_detail_test.sql`:

```sql
-- pgTAP — 02:DETAIL — catalog definition fields + fn_nba_action_history NULL-safety (CLAUDE.md §1 test:sql).
-- Runs against the freshly reset+seeded DB (NBA_Proposal is empty post-seed, §14).
begin;
select plan(2);

-- 02:DETAIL-A1 — every action carries a playbook + a real created_at (reference data, seeded).
select is(
  (select count(*)::int from catalog."NBA_Catalogo" where playbook is not null and created_at is not null),
  8, 'all 8 NBA actions have a playbook + created_at');

select is(
  (select playbook is not null from catalog."NBA_Catalogo" where code='A1'),
  true, 'A1 has a playbook');

select * from finish();
rollback;
```

- [ ] **Step 2: run → fails**

Run: `pnpm test:sql`
Expected: FAIL — `column "playbook" does not exist`.

- [ ] **Step 3: migration (DDL)**

Create `supabase/migrations/20260619150000_nba_detail_catalog.sql`:

```sql
-- 02:DETAIL-A1 — definition fields for the NBA action-detail screen. Reference data (like the rest of
-- NBA_Catalogo), NOT a §14 result: the ROWS are seeded in seed.sql. The table is empty at migration time
-- (seed runs after migrations), so plain ADD COLUMN is safe. playbook = the step-by-step "path" the action
-- gives (free text v1, Leo). created_at = the real date the closed catalog was defined (the catalog
-- migration date) — an honest date, never invented at render time.
alter table catalog."NBA_Catalogo"
  add column playbook   text,            -- step-by-step path (free text v1; seeded, English §0)
  add column created_at timestamptz;     -- when the action was defined (seeded real date)
```

- [ ] **Step 4: seed values**

In `supabase/seed.sql`, right after the slice-3 metadata `update ... where c.code = v.code;` block (ends ~line 114), add:

```sql
-- 02:DETAIL-A1 — definition fields (playbook = the path; created_at = the day the closed catalog was
-- defined, mig 20260618). English (§0). Reference data, not a §14 result.
update catalog."NBA_Catalogo" c set
  created_at = '2026-06-18'::timestamptz,
  playbook   = v.playbook
from (values
  ('A1','1) Detect a connection drop (connected ÷ committed hours below the minimum). 2) Nudge the restaurant to reconnect during committed hours. 3) Re-check connection next week.'),
  ('A2','1) Compare the restaurant''s price against same-cohort peers. 2) Propose a price adjustment (propose only). 3) Human decides.'),
  ('A3','1) Detect low attractiveness driven by price. 2) Propose a promo/bonus. 3) A HUMAN releases the money (financial hard-no, BR-2).'),
  ('A4','1) Detect low menu quality (photo/description). 2) Open a menu-quality checklist. 3) Re-check.'),
  ('A5','1) Detect a demand drop in the zone (not the restaurant''s fault). 2) Signal local growth/marketing. 3) Track the trend.'),
  ('A6','1) Detect high restaurant-side cancellations. 2) Open an ops ticket for the cancel cause. 3) Re-check.'),
  ('A7','1) Detect a customer-side cancellation pattern (risk/fraud). 2) Escalate to human risk/fraud review (money at stake). 3) Human decides.'),
  ('A8','No attributable cause — observe. Fail-closed: never invent a cause.')
) as v(code, playbook)
where c.code = v.code;
```

- [ ] **Step 5: run → passes**

Run: `pnpm test:sql`
Expected: PASS — `all 8 NBA actions have a playbook + created_at`.

- [ ] **Step 6: commit**

```bash
git add supabase/migrations/20260619150000_nba_detail_catalog.sql supabase/seed.sql supabase/tests/nba_detail_test.sql
git commit -m "feat(02:DETAIL): NBA_Catalogo playbook + created_at for the action-detail definition (02:DETAIL-A1)"
```

---

## Task 2: Proposal evidence stamp (02:DETAIL-A2)

> Engine already has `sel.lever.verdict / n_min_ok / k_anon_ok` ([nba_engine.ts:136-137](../../server/agente/nba_engine.ts#L136-L137)) — passes to autonomy gate, NOT persisted. Persist → hit rate computable. = the engine-gap finding (MEASURE on thin data; changing SELECTION to avoid thin data = separate piece, out of scope).

**Files:**
- Create: `supabase/migrations/20260619150100_nba_proposal_evidence.sql`
- Modify: `server/agente/nba_engine.ts` (insert + provenance, [lines 108-116](../../server/agente/nba_engine.ts#L108-L116))
- Test: `tests/integration/nba_engine.test.ts` (add `e6`)

- [ ] **Step 1: failing test**

In `tests/integration/nba_engine.test.ts`, add inside the `describe(...)` block (after `e1`):

```ts
  it("e6: stamps the diagnosis evidence (verdict + n_min_ok + k_anon_ok) on the proposal [V]", async () => {
    const rid = await pick("m_connection < 0.50"); // a real breach exists
    const cohort = await cohortOf(rid);
    const res = await proposeNba({ restaurantId: rid, cohortId: cohort, week: W1 });
    expect(res.levered).toBe(true);

    const p = await rows<{ diagnosis_verdict: string | null; n_min_ok: boolean | null; k_anon_ok: boolean | null }>(
      pool,
      `select diagnosis_verdict, n_min_ok, k_anon_ok from gov."NBA_Proposal" where nba_id=$1`,
      [res.nbaId],
    );
    expect(["below", "above"]).toContain(p[0]?.diagnosis_verdict); // a chosen lever is a breach
    expect(p[0]?.n_min_ok).not.toBeNull(); // evidence booleans are stamped from fn_nba_test (not invented)
    expect(p[0]?.k_anon_ok).not.toBeNull();
  });
```

- [ ] **Step 2: run → fails**

Run: `pnpm test:integration -- nba_engine`
Expected: FAIL — `column "diagnosis_verdict" does not exist`.

- [ ] **Step 3: migration (DDL)**

Create `supabase/migrations/20260619150100_nba_proposal_evidence.sql`:

```sql
-- 02:DETAIL-A2 — persist the diagnosis evidence the engine already computes (fn_nba_test) but discarded.
-- RESULT columns (§14): NULL until 02:1A (nba_engine.proposeNba) writes the proposal — NEVER seeded
-- (NBA_Proposal is seeded empty). These feed fn_nba_action_history's hit-rate split (solid vs thin-data).
alter table gov."NBA_Proposal"
  add column diagnosis_verdict text,     -- the chosen lever's verdict: below|above|ok|no_data ([V] from SQL)
  add column n_min_ok          boolean,  -- sample sufficient at diagnosis time ([V] from fn_nba_test)
  add column k_anon_ok          boolean; -- non-suppressed at diagnosis time ([V] from fn_nba_test)

alter table gov."NBA_Proposal"
  add constraint nba_proposal_diagnosis_verdict_ck
  check (diagnosis_verdict is null or diagnosis_verdict in ('below','above','ok','no_data'));
```

- [ ] **Step 4: stamp evidence in engine**

In `server/agente/nba_engine.ts`, replace the `provenance` line + the `insert` block ([lines 108-116](../../server/agente/nba_engine.ts#L108-L116)) with:

```ts
  // root_cause is templated interpretation ⇒ [C]. before_after_expected carries the measured diagnosis
  // snapshot ⇒ [V]. diagnosis_verdict/n_min_ok/k_anon_ok come straight from fn_nba_test ⇒ [V] (02:DETAIL-A2).
  const provenance = JSON.stringify({
    root_cause: "[C]",
    before_after_expected: "[V]",
    diagnosis_verdict: "[V]",
    n_min_ok: "[V]",
    k_anon_ok: "[V]",
  });

  const ins = await q<{ nba_id: string }>(
    `insert into gov."NBA_Proposal"(action_type, cohort_id, root_cause, nba_request,
        before_after_expected, financial_class, cohort_rule_version, provenance_by_field,
        diagnosis_verdict, n_min_ok, k_anon_ok)
     values ($1,$2,$3,$4::public.autonomy_level,$5::jsonb,$6::public.financial_class,$7,$8::jsonb,$9,$10,$11)
     returning nba_id`,
    [
      code, cohortId, sel.rootCause, cat.default_nba_request, beforeAfter, cat.financial_class, version, provenance,
      // no lever (A8) ⇒ no_data + null evidence (fail-closed §14 — never a fabricated boolean)
      sel.lever?.verdict ?? "no_data", sel.lever?.n_min_ok ?? null, sel.lever?.k_anon_ok ?? null,
    ],
  );
```

- [ ] **Step 5: run → passes**

Run: `pnpm test:integration -- nba_engine`
Expected: PASS — `e1`..`e6` green (existing tests still pass; `e6` stamps evidence).

- [ ] **Step 6: commit**

```bash
git add supabase/migrations/20260619150100_nba_proposal_evidence.sql server/agente/nba_engine.ts tests/integration/nba_engine.test.ts
git commit -m "feat(02:DETAIL): stamp diagnosis evidence (verdict/n_min/k_anon) on NBA_Proposal (02:DETAIL-A2)"
```

---

## Task 3: `cohort.fn_nba_action_history` (02:DETAIL-B)

**Files:**
- Create: `supabase/migrations/20260619150200_nba_action_history.sql`
- Modify: `supabase/tests/nba_detail_test.sql` (append fn asserts, bump plan)
- Test: `tests/integration/nba_action_history.test.ts`

- [ ] **Step 1: failing integration test** (hermetic — /sat fix: clear produced proposals in-tx so company-wide count = exactly ours; zero-run via nonexistent code)

Create `tests/integration/nba_action_history.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";

// 02:DETAIL-B — per-action operation history, company-wide (Leo: empresa inteira). hit rate is the
// DIAGNOSTIC rate: a pick is "solid" only when its dimension is a breach (below/above) AND backed by
// sufficient, non-suppressed evidence (n_min_ok ∧ k_anon_ok); thin/suppressed breaches = "unconfirmed".
const W1 = "2026-05-25";
const REF = "2026-06-17";
let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  await runP01({ week: W1, refDate: REF });
}, 120_000);
afterAll(async () => {
  await pool.end();
});

type Hist = {
  run_count: number; solid_count: number; unconfirmed_count: number; no_data_count: number; acerto_rate: number | null;
};
async function history(code: string): Promise<Hist> {
  const r = await rows<Hist>(
    pool,
    `select run_count::int as run_count, solid_count::int as solid_count,
            unconfirmed_count::int as unconfirmed_count, no_data_count::int as no_data_count,
            acerto_rate::float8 as acerto_rate
     from cohort.fn_nba_action_history($1)`,
    [code],
  );
  return r[0]!;
}

describe("02:DETAIL-B — fn_nba_action_history (deterministic diagnostic hit rate)", () => {
  it("splits solid / unconfirmed / no_data and computes acerto_rate = solid/(solid+unconfirmed)", async () => {
    const cohort = (
      await rows<{ cohort_id: string }>(pool, `select cohort_id from cohort."Cohort" order by cohort_id limit 1`)
    )[0]!.cohort_id;

    const c = await pool.connect();
    try {
      await c.query("begin");
      // HERMETIC (rolled back): clear any produced proposals so the company-wide count is exactly our 3
      // — independent of whatever runP01 / autodispatch may have produced (/sat robustness fix).
      await c.query(`delete from gov."min_calculation"`);
      await c.query(`delete from gov."NBA_Proposal"`);
      // 3 A1 proposals: 1 solid (breach + evidence), 1 unconfirmed (breach + thin sample), 1 no_data.
      const insert = `insert into gov."NBA_Proposal"
        (action_type, cohort_id, nba_request, cohort_rule_version, diagnosis_verdict, n_min_ok, k_anon_ok)
        values ('A1',$1,'LOW','v1',$2,$3,$4)`;
      await c.query(insert, [cohort, "below", true, true]);   // solid
      await c.query(insert, [cohort, "below", false, true]);  // unconfirmed (thin sample)
      await c.query(insert, [cohort, "no_data", null, null]); // no_data

      const h = (
        await c.query<Hist>(
          `select run_count::int as run_count, solid_count::int as solid_count,
                  unconfirmed_count::int as unconfirmed_count, no_data_count::int as no_data_count,
                  acerto_rate::float8 as acerto_rate
           from cohort.fn_nba_action_history('A1')`,
        )
      ).rows[0]!;
      expect(h.run_count).toBe(3);
      expect(h.solid_count).toBe(1);
      expect(h.unconfirmed_count).toBe(1);
      expect(h.no_data_count).toBe(1);
      expect(h.acerto_rate).toBe(0.5); // 1 / (1+1)
    } finally {
      await c.query("rollback");
      c.release();
    }
  });

  it("§14 — zero runs ⇒ run_count 0 and acerto_rate NULL (never 0-fake)", async () => {
    const h = await history("ZZ"); // nonexistent code ⇒ guaranteed zero, independent of what runP01 produced
    expect(h.run_count).toBe(0);
    expect(h.acerto_rate).toBeNull();
  });
});
```

- [ ] **Step 2: run → fails**

Run: `pnpm test:integration -- nba_action_history`
Expected: FAIL — `function cohort.fn_nba_action_history(text) does not exist`.

- [ ] **Step 3: migration (the fn)**

Create `supabase/migrations/20260619150200_nba_action_history.sql`:

```sql
-- 02:DETAIL-B — per-action OPERATION history. COMPANY-WIDE (Leo 2026-06-19: empresa inteira — action
-- reliability is validated knowledge about the POLICY, flows across pools · 04 §7/§8). Derived (no table).
-- Deterministic (§6). §14: counts are real; acerto_rate is NULL when there is no breach-class proposal
-- (never a 0-fake). "solid" = the chosen dimension is a breach AND backed by sufficient, non-suppressed
-- evidence (n_min_ok ∧ k_anon_ok); a breach on thin/suppressed data = "unconfirmed" (não-atribuível).
create or replace function cohort.fn_nba_action_history(p_action_code text)
returns table (
  action_code       text,
  run_count         bigint,
  last_run_at       timestamptz,
  solid_count       bigint,
  unconfirmed_count bigint,
  no_data_count     bigint,
  acerto_rate       numeric
)
language sql
stable
as $$
  select
    p_action_code,
    count(*),
    max(created_at),
    count(*) filter (where diagnosis_verdict in ('below','above') and n_min_ok and k_anon_ok),
    count(*) filter (where diagnosis_verdict in ('below','above')
                       and not (coalesce(n_min_ok,false) and coalesce(k_anon_ok,false))),
    count(*) filter (where diagnosis_verdict is null or diagnosis_verdict not in ('below','above')),
    round(
      count(*) filter (where diagnosis_verdict in ('below','above') and n_min_ok and k_anon_ok)::numeric
      / nullif(count(*) filter (where diagnosis_verdict in ('below','above')), 0)
    , 4)
  from gov."NBA_Proposal"
  where action_type = p_action_code;
$$;
```

- [ ] **Step 4: run → passes**

Run: `pnpm test:integration -- nba_action_history`
Expected: PASS — both cases green.

- [ ] **Step 5: append pgTAP NULL-safety**

In `supabase/tests/nba_detail_test.sql`, change `select plan(2);` → `select plan(4);` and add before `select * from finish();`:

```sql
-- 02:DETAIL-B — the function exists; with NBA_Proposal empty post-seed (§14) it returns a conservative row.
select is(
  (select run_count from cohort.fn_nba_action_history('A1')),
  0::bigint, 'zero runs ⇒ run_count 0');
select is(
  (select acerto_rate from cohort.fn_nba_action_history('A1')),
  null::numeric, 'zero runs ⇒ acerto_rate NULL (no 0-fake, §14)');
```

- [ ] **Step 6: run → passes**

Run: `pnpm test:sql`
Expected: PASS — plan(4) all green.

- [ ] **Step 7: commit**

```bash
git add supabase/migrations/20260619150200_nba_action_history.sql supabase/tests/nba_detail_test.sql tests/integration/nba_action_history.test.ts
git commit -m "feat(02:DETAIL): fn_nba_action_history — company-wide deterministic diagnostic hit rate (02:DETAIL-B)"
```

---

## Task 4: tRPC `nba.detail` (02:DETAIL-C)

**Files:**
- Modify: `shared/contracts.ts` (append detail schemas, after `nbaTestAllInput` ~line 72)
- Modify: `server/routers/nba.ts` (add `detail` + import `TRPCError`)
- Test: `tests/integration/nba_routes.test.ts` (add a test)

- [ ] **Step 1: Zod contracts**

In `shared/contracts.ts`, after `nbaTestAllInput` (~line 72), add:

```ts
// 02:DETAIL-C — NBA action-detail io. definition = catalog (global) + current_version (knob). history =
// company-wide diagnostic rates (fn_nba_action_history). acerto_rate is NULL when no breach-class run (§14).
export const nbaDetailInput = z.object({ action_code: z.string().min(1) });

export const nbaActionDefinition = z.object({
  code: z.string(),
  label: z.string(),
  funnel_stage: z.string(),
  financial_class: z.enum(["direct", "indirect", "none"]),
  root_cause_signal: z.string().nullable(),
  threshold_knob: z.string().nullable(),
  action_hint: z.string(),
  playbook: z.string().nullable(),
  created_at: z.string().nullable(),
  current_version: z.string().nullable(),
});
export type NbaActionDefinition = z.infer<typeof nbaActionDefinition>;

export const nbaActionHistory = z.object({
  action_code: z.string(),
  run_count: z.number(),
  last_run_at: z.string().nullable(),
  solid_count: z.number(),
  unconfirmed_count: z.number(),
  no_data_count: z.number(),
  acerto_rate: z.number().nullable(),
});
export type NbaActionHistory = z.infer<typeof nbaActionHistory>;

export const nbaActionDetail = z.object({ definition: nbaActionDefinition, history: nbaActionHistory });
export type NbaActionDetail = z.infer<typeof nbaActionDetail>;
```

- [ ] **Step 2: failing route test**

In `tests/integration/nba_routes.test.ts`, add inside the `describe(...)` block:

```ts
  it("nba.detail returns the action definition + COMPANY-WIDE history; unknown code ⇒ NOT_FOUND", async () => {
    const t = (await rows<{ tenant_id: string }>(pool, `select distinct tenant_id from tenant."Restaurant" limit 1`))[0]!.tenant_id;
    const d = await caller(t).nba.detail({ action_code: "A1" });
    expect(d.definition.code).toBe("A1");
    expect(d.definition.label).toBeTruthy();
    expect(d.definition.playbook).toBeTruthy(); // 02:DETAIL-A1
    expect(d.definition.current_version).toBe("v1");
    expect(typeof d.history.run_count).toBe("number"); // bigint cast to number server-side
    expect(d.history.action_code).toBe("A1");

    await expect(caller(t).nba.detail({ action_code: "ZZ" })).rejects.toThrow(/unknown action_code/);
  });
```

- [ ] **Step 3: run → fails**

Run: `pnpm test:integration -- nba_routes`
Expected: FAIL — `nba.detail is not a function`.

- [ ] **Step 4: implement procedure**

In `server/routers/nba.ts`, change imports (lines 1-4) → add `TRPCError` + `nbaDetailInput`:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";
import { nbaTestInput, nbaTestAllInput, nbaDetailInput, type nbaVerdict } from "../../shared/contracts.js";
```

Add inside `router({ ... })`, after `testAll`:

```ts
  // 02:DETAIL-C — the action-detail surface. Auth-gated (tenantProcedure), but the history is COMPANY-WIDE
  // (no tenant filter): action reliability is validated knowledge about the policy, flows across pools
  // (04 §7/§8; Leo 2026-06-19). Only aggregates are exposed (no per-restaurant raw) ⇒ no k-anon frontier.
  detail: tenantProcedure.input(nbaDetailInput).query(async ({ input }) => {
    const def = await query<{
      code: string; label: string; funnel_stage: string; financial_class: string;
      root_cause_signal: string | null; threshold_knob: string | null; action_hint: string;
      playbook: string | null; created_at: string | null; current_version: string | null;
    }>(
      `select c.code, c.label, c.funnel_stage, c.financial_class::text as financial_class,
              c.root_cause_signal, c.threshold_knob, c.action_hint, c.playbook,
              c.created_at::text as created_at,
              (select value from catalog."Config_Knobs" where key='cohort_rule_version_current') as current_version
       from catalog."NBA_Catalogo" c where c.code=$1`,
      [input.action_code],
    );
    if (!def[0]) throw new TRPCError({ code: "NOT_FOUND", message: "unknown action_code" });

    const hist = await query<{
      action_code: string; run_count: number; last_run_at: string | null;
      solid_count: number; unconfirmed_count: number; no_data_count: number; acerto_rate: number | null;
    }>(
      `select action_code, run_count::int as run_count, last_run_at::text as last_run_at,
              solid_count::int as solid_count, unconfirmed_count::int as unconfirmed_count,
              no_data_count::int as no_data_count, acerto_rate::float8 as acerto_rate
       from cohort.fn_nba_action_history($1)`,
      [input.action_code],
    );
    return { definition: def[0], history: hist[0]! };
  }),
```

- [ ] **Step 5: run → passes**

Run: `pnpm test:integration -- nba_routes`
Expected: PASS.

- [ ] **Step 6: typecheck** (shared contract crosses client+server)

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: commit**

```bash
git add shared/contracts.ts server/routers/nba.ts tests/integration/nba_routes.test.ts
git commit -m "feat(02:DETAIL): nba.detail tRPC — definition + company-wide history (02:DETAIL-C)"
```

---

## Task 5: UI — 2-view detail screen (02:DETAIL-D)

**Files:**
- Create: `client/src/features/cockpit/useDevLogin.ts`
- Create: `client/src/pages/ActionDetailPage.tsx`
- Modify: `client/src/App.tsx` (route)
- Modify: `client/src/pages/CockpitPage.tsx` (use shared hook — DRY)
- Modify: `client/src/features/cockpit/NbaModal.tsx` (link → detail)
- Test: `e2e/action_detail.spec.ts`

- [ ] **Step 1: extract dev-login hook (DRY)**

Create `client/src/features/cockpit/useDevLogin.ts`:

```ts
import { useEffect, useState } from "react";

// dev-login mints the local operator session (stands in for Manus OAuth); tenant_id is resolved
// server-side. Shared by the cockpit and the action-detail screen so the effect lives in ONE place.
export function useDevLogin(userId = "U-OP-001"): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function login(attempt = 0): Promise<void> {
      try {
        const r = await fetch("/auth/dev-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ user_id: userId }),
        });
        if (!r.ok) throw new Error(String(r.status));
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled && attempt < 15) setTimeout(() => void login(attempt + 1), 500);
        else if (!cancelled) setReady(true);
      }
    }
    void login();
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return ready;
}
```

- [ ] **Step 2: use hook in CockpitPage** (replace inline effect)

In `client/src/pages/CockpitPage.tsx`: drop the `useEffect`/`ready` block (lines 13, 17-38) + unused imports; replace top with the hook. Change imports line 1 + component top:

```tsx
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";
import { CockpitBoard } from "@/features/cockpit/CockpitBoard";
import { NbaModal } from "@/features/cockpit/NbaModal";
import { useDevLogin } from "@/features/cockpit/useDevLogin";
import { type RowAction, type RowState } from "@/features/cockpit/CockpitRow";
import type { NbaCockpitRow } from "@shared/contracts";

export function CockpitPage() {
  const ready = useDevLogin();
  const [openNba, setOpenNba] = useState<NbaCockpitRow | null>(null);
  const [actionState, setActionState] = useState<Record<string, RowState | undefined>>({});
```

(Rest of CockpitPage unchanged.)

- [ ] **Step 3: detail page**

Create `client/src/pages/ActionDetailPage.tsx`:

```tsx
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/EmptyState";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { useDevLogin } from "@/features/cockpit/useDevLogin";

// 02:DETAIL-D — NBA action detail (a screen-within-the-cockpit): two separate views — Definition
// ("what it is") and Operation ("does it work?"). The hit rate is the deterministic DIAGNOSTIC rate;
// it shows three states (solid / thin-data / no-data), never a single fake %. Numbers are read, never
// recomputed (§14); acerto_rate NULL ⇒ "not enough confirmed runs", never 0%.
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-mxm-content-tertiary">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums text-mxm-content">{value}</p>
    </div>
  );
}

export function ActionDetailPage() {
  const ready = useDevLogin();
  const [, params] = useRoute("/cockpit/action/:code");
  const code = params?.code ?? "";
  const q = trpc.nba.detail.useQuery({ action_code: code }, { enabled: ready && code.length > 0 });

  return (
    <main className="mx-auto max-w-screen-md p-[clamp(1rem,2vw,2rem)]">
      <Link href="/cockpit" className="text-sm text-mxm-brand hover:underline">← Back to cockpit</Link>

      {!ready || q.isLoading ? (
        <LoadingState label="Loading action…" />
      ) : q.isError ? (
        <ErrorState label="Action not found" />
      ) : !q.data ? (
        <EmptyState>No data.</EmptyState>
      ) : (
        <>
          <header className="mb-6 mt-2">
            <h1 className="text-2xl font-semibold text-mxm-content">
              {q.data.definition.code} · {q.data.definition.label}
            </h1>
            <p className="mt-1 text-sm text-mxm-content-secondary">
              {q.data.definition.funnel_stage} · {q.data.definition.financial_class === "direct"
                ? "⚠ touches money (human releases)"
                : "does not touch money"}
            </p>
          </header>

          {/* VIEW 1 — Definition */}
          <section aria-labelledby="def-h" className="mb-8 space-y-3">
            <h2 id="def-h" className="text-xs font-semibold uppercase tracking-wide text-mxm-content-tertiary">
              Definition — what it is
            </h2>
            <div className="rounded-mxm border border-mxm-border p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-mxm-content-tertiary">What it fires</p>
              <p className="mt-0.5 text-mxm-content">{q.data.definition.action_hint}</p>
            </div>
            <div className="rounded-mxm border border-mxm-border p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-mxm-content-tertiary">How it works — the path</p>
              <p className="mt-0.5 whitespace-pre-line text-mxm-content-secondary">
                {q.data.definition.playbook ?? "—"}
              </p>
            </div>
            <div className="rounded-mxm border border-mxm-border p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-mxm-content-tertiary">Signal it reads · approved range</p>
              <p className="mt-0.5 text-mxm-content-secondary">
                {q.data.definition.root_cause_signal ?? "—"} · knob {q.data.definition.threshold_knob ?? "—"}
              </p>
            </div>
            <p className="text-xs text-mxm-content-tertiary">
              Born {q.data.definition.created_at?.slice(0, 10) ?? "—"} · current version {q.data.definition.current_version ?? "—"}
            </p>
          </section>

          {/* VIEW 2 — Operation */}
          <section aria-labelledby="op-h" aria-live="polite" className="space-y-3">
            <h2 id="op-h" className="text-xs font-semibold uppercase tracking-wide text-mxm-content-tertiary">
              Operation — does it work? <ProvenanceBadge prov="[V]" className="ml-1" /> measured
            </h2>
            {q.data.history.run_count === 0 ? (
              <EmptyState>This action has not run yet.</EmptyState>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-10 gap-y-3 rounded-mxm border border-mxm-border p-4">
                  <Stat label="Times run (company-wide)" value={String(q.data.history.run_count)} />
                  <Stat
                    label="Hit rate (diagnosis)"
                    value={q.data.history.acerto_rate == null ? "not enough confirmed runs" : `${Math.round(q.data.history.acerto_rate * 100)}%`}
                  />
                  <Stat label="Last run" value={q.data.history.last_run_at?.slice(0, 10) ?? "—"} />
                </div>
                <ul className="space-y-1 text-sm">
                  <li className="text-mxm-content">✓ solid (breach + enough, non-suppressed data): <span className="tabular-nums">{q.data.history.solid_count}</span></li>
                  <li className="text-mxm-content-secondary">~ unconfirmed (breach on thin/suppressed data): <span className="tabular-nums">{q.data.history.unconfirmed_count}</span></li>
                  <li className="text-mxm-content-tertiary">· no attributable cause: <span className="tabular-nums">{q.data.history.no_data_count}</span></li>
                </ul>
                <div className="rounded-mxm border border-mxm-border p-3 text-sm text-mxm-content-tertiary">
                  Recurrence ("eco" — resolved then re-opened): not measured yet.
                </div>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 4: register route**

In `client/src/App.tsx`, add import + route (more-specific BEFORE `/cockpit` under `Switch`):

```tsx
import { ActionDetailPage } from "@/pages/ActionDetailPage";
```

```tsx
        <Route path="/cockpit/action/:code" component={ActionDetailPage} />
        <Route path="/cockpit" component={CockpitPage} />
```

- [ ] **Step 5: link from modal**

In `client/src/features/cockpit/NbaModal.tsx`: add wouter import at top + a link in the "Recommended action" block. Change line 1 imports → add:

```tsx
import { Link } from "wouter";
```

Inside the first `<div>` (after line 55 `cohort {row.cohort_id}`), add:

```tsx
            {row.action_type && (
              <Link
                href={`/cockpit/action/${row.action_type}`}
                className="mt-1 inline-block text-xs text-mxm-brand hover:underline"
              >
                What is {row.action_type}? See its track record →
              </Link>
            )}
```

- [ ] **Step 6: e2e (a11y + render)**

Create `e2e/action_detail.spec.ts`. **Copy the exact axe + `test`/`expect` import lines from `e2e/cockpit.spec.ts`** (same Playwright+axe setup), then:

```ts
// (imports copied from e2e/cockpit.spec.ts — test, expect, AxeBuilder)

test("@a11y NBA action detail: two views render + no axe violations", async ({ page }) => {
  await page.goto("/cockpit/action/A1");
  await expect(page.getByRole("heading", { name: /A1/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Definition/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Operation/i })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

- [ ] **Step 7: gates**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

Run: `pnpm test:e2e -- action_detail` (dev server running — mirror how `e2e/cockpit.spec.ts` runs)
Expected: PASS — heading + both views visible, zero axe violations.

- [ ] **Step 8: commit**

```bash
git add client/src/features/cockpit/useDevLogin.ts client/src/pages/ActionDetailPage.tsx client/src/App.tsx client/src/pages/CockpitPage.tsx client/src/features/cockpit/NbaModal.tsx e2e/action_detail.spec.ts
git commit -m "feat(02:DETAIL): NBA action-detail screen — Definition + Operation views, linked from cockpit (02:DETAIL-D)"
```

---

## Final gate (before PR)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:antifake && pnpm test:sql && pnpm test:integration && pnpm test:e2e
```
All green → surface diff for human review (§6 — human owns merge). gstack chain after: `/review` → `/codex` (adversarial, risk-max: §14 + producer + cross-pool) → `/ship` → human merge.

---

## Self-Review

**Spec coverage:** Definition → T1 (playbook/created_at) + T4 (current_version) + T5 (render). Operation → T2 (evidence) + T3 (history fn) + T5 (render). Hit rate deterministic, 3-state, NULL-not-0 → T3 + T5. Company-wide → T3 (no tenant filter) + T4 (comment). eco not-measured → T5 label. screen-in-cockpit + linked → T5 (route + NbaModal link). Engine-gap surfaced not auto-fixed → T2 (stamp/measure only). All map. ✓

**Placeholder scan:** no TBD/TODO; every code step full; two "copy from existing file" notes (e2e axe import; dev-server launch) point at concrete in-repo refs. ✓

**Type consistency:** fn cols == `nbaActionHistory` Zod == `nba.detail` aliases == `ActionDetailPage` reads. `nbaActionDefinition` == `def` query aliases == render. bigint→number via `::int`/`::float8` at every read boundary. ✓

**/sat residuals (non-blocking, monitor):** (1) hit rate near-100% if fleet rarely picks on thin data — becomes discriminating when LLM brain replaces the deterministic rule (same screen, reasoning.ts seam). (2) aggregate mixes cohort_rule_versions; low run_count from a single pool nears the k-anon edge — per-tenant breakdown is future + gated.
