# Cohort CSV Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Cohorts Explorer, let a human (live demo to CEO/VP) clear the business DB, upload a single CSV (or click "generate example base"), then Run Flow and watch the system auto-cohortize the uploaded base — no terminal, no code edits.

**Architecture:** Three new backend mutations on the existing `cohorts` tRPC router (`clearBusinessData`, `uploadCsv`, `generateExample`) plus one query (`csvTemplate`). The cohort producers are unchanged; instead `cohorts.run` stops using hardcoded `RUN_WEEKS`/`RUN_REF_DATE` and **derives the run window from `max(order_date)`** so any dataset works regardless of its dates (the karpathy root-cause fix). Upload is one Order-grain CSV (each row carries its restaurant's attributes); the server dedups restaurants, bulk-inserts orders, and synthesizes neutral `Weekly_Connection` rows (connected=committed) so the v2 rank's connection INNER JOIN is satisfied. The example-base generator extracts the seed's deterministic business-data SQL into a reusable parameterized function (`public.fn_generate_business_base`), which `seed.sql` then calls (DRY). Frontend adds three header controls + an upload modal, mirroring the (p06-branch) `/knowledge` upload pattern reimplemented here.

**Tech Stack:** tRPC v11 + Express, Zod v3, Postgres (pg), React 19 + Tailwind (`--mxm-*` tokens, dark-only), Vitest (integration uses real Supabase test DB on :54522), Playwright (e2e/a11y), `papaparse` for CSV parsing.

---

## Key facts the implementer must not re-derive

- **Run trigger:** [server/routers/cohorts.ts:68-85](server/routers/cohorts.ts#L68) `run` mutation → calls `runP01` ([server/jobs/p01.ts:12](server/jobs/p01.ts#L12)) twice (two weeks → enables F-2.2 delta). Line 72 already relaxes `k_anon_threshold→1` for the prototype (keep it). `RUN_WEEKS`/`RUN_REF_DATE` are hardcoded at lines 60-61.
- **Rank window contract (the trap):** [20260617000017_cohort_engine_v2.sql:73-93](supabase/migrations/20260617000017_cohort_engine_v2.sql#L73) — orders aggregated over `order_date > p_week - 90 and <= p_week`; connection over `week > p_week - 63 and <= p_week`; a restaurant is ranked **only if it has rows in BOTH** (INNER JOINs `om` and `cm`). Missing either ⇒ `percentile_in_cohort` stays NULL (fail-closed) ⇒ suppressed.
- **Cohort cell = `cuisine × zone × tier_base × cohort_rule_version`** ([…v2.sql:33-38](supabase/migrations/20260617000017_cohort_engine_v2.sql#L33)). `tenure_months` is computed vs `p_ref_date` and a restaurant is assigned only if `signup_date <= p_ref_date AND cuisine IS NOT NULL AND zone IS NOT NULL`.
- **n_min gate** (`n_min_threshold=20`) collapses a cohort/subgroup with `< 20` accounts to qualitative mode ([…v2.sql:147-165](supabase/migrations/20260617000017_cohort_engine_v2.sql#L147)). This is EXPECTED and a feature: small uploads show `status:"collapsed"` (governance story), not blank. Only the "generate example base" path is sized to pass it.
- **Base table columns:**
  - `tenant."Restaurant"` ([20260617000004_tenant.sql:13-24](supabase/migrations/20260617000004_tenant.sql#L13)): `restaurant_id text PK`, `tenant_id text NN`, `tier_base public.tier_base NN`, `segment public.segment NN`, `signup_date date NN`, `live_attributes jsonb`, `grounding_sources jsonb`, `status text`, `tenure_months int (RESULT, NULL pre-run)`, `provenance_by_field jsonb`. Plus from v2 ([…model_v2.sql:17-20](supabase/migrations/20260617000016_model_v2.sql#L17)): `zone text`, `cuisine text`, `committed_hours_week numeric(6,2)`.
  - `tenant."Order"` ([…tenant.sql:29-43](supabase/migrations/20260617000004_tenant.sql#L29)): `order_id identity PK`, `restaurant_id text NN FK`, `order_date date NN`, `gross_value numeric(12,2) NN`, `fee numeric(12,2) NN default 0`, `net_value GENERATED (gross-fee)`, `payment_status public.payment_status NN`, `failure_reason text`, `zone text`, `cuisine text`, `channel text`, `provenance text default '[V]'`. Plus v2: `cancelled_by public.cancelled_by`, `discount_pct numeric(5,2) NN default 0`, `has_photo boolean`, `has_description boolean`.
  - `tenant."Weekly_Connection"` ([…model_v2.sql:32-39](supabase/migrations/20260617000016_model_v2.sql#L32)): `connection_id identity PK`, `restaurant_id text NN FK`, `week date NN`, `connected_hours numeric(6,2) NN`, `committed_hours numeric(6,2) NN`, `unique(restaurant_id, week)`.
- **Enums** ([20260617000001_extensions_enums_schemas.sql](supabase/migrations/20260617000001_extensions_enums_schemas.sql#L20)): `tier_base = managed_brand|managed_midmarket|long_tail`; `segment = managed|long_tail`; `payment_status = ok|failed|pending`; `cancelled_by = restaurant|customer`.
- **Truncate/reset reference:** [tests/helpers/db.ts:31-43](tests/helpers/db.ts#L31) lists the truncate set. The clear mutation truncates only the **business** subset and PRESERVES catalog + `gov."User"`.
- **Seed business generation:** [supabase/seed.sql:158-256](supabase/seed.sql#L158) — Restaurant (5000), Order, Weekly_Connection (9 weeks), Conversation_Episode, all via `public.det_int(key, salt, hi)` ([20260617000006_seed_helpers.sql:3](supabase/migrations/20260617000006_seed_helpers.sql#L3)), anchored to `date '2026-06-17'`.
- **Router mount:** [server/routers/_app.ts:17](server/routers/_app.ts#L17) `cohorts: cohortsRouter`. `tenantProcedure` resolves `ctx.tenantId` server-side ([server/_core/trpc.ts:12](server/_core/trpc.ts#L12)).
- **UI:** [client/src/pages/CohortsExplorerPage.tsx:89-103](client/src/pages/CohortsExplorerPage.tsx#L89) header holds the "Run flow" button + aria-live status. New controls go in this header row.
- **Test pattern:** [tests/integration/cohorts_run.test.ts](tests/integration/cohorts_run.test.ts) — `caller(tenantId)` builds an `appRouter.createCaller(ctx)`; `resetDb(pool)` in `beforeAll`; helpers `rows`/`count`. Mirror this for every backend test.
- **CSV is `;`-free, comma-delimited, UTF-8, first row = header.** Dates `YYYY-MM-DD`. Booleans `true`/`false`. Empty cell = SQL NULL.

---

## CSV contract (single Order-grain file)

One row per order. Columns (exact header order the template emits):

| column | type | required | notes |
|---|---|---|---|
| `tenant_id` | text | yes | pool / RLS frontier (e.g. `POOL-001`) |
| `restaurant_id` | text | yes | groups rows into a restaurant |
| `tier_base` | enum | yes | `managed_brand` \| `managed_midmarket` \| `long_tail` |
| `segment` | enum | yes | `managed` \| `long_tail` |
| `signup_date` | date | yes | `YYYY-MM-DD`, must be `<= max(order_date)` to be assigned |
| `zone` | text | yes | cohort axis |
| `cuisine` | text | yes | cohort axis |
| `committed_hours_week` | numeric | yes | also used as the synthesized connection denominator |
| `order_date` | date | yes | `YYYY-MM-DD` |
| `gross_value` | numeric | yes | ≥ 0 |
| `fee` | numeric | no (def 0) | ≥ 0; `net_value` is GENERATED = gross − fee |
| `payment_status` | enum | yes | `ok` \| `failed` \| `pending` |
| `cancelled_by` | enum | no | `restaurant` \| `customer`; only when `payment_status=failed` |
| `discount_pct` | numeric | no (def 0) | 0–100 |
| `has_photo` | boolean | no | `true`/`false` |
| `has_description` | boolean | no | `true`/`false` |

**Restaurant-attribute consistency rule (fail-closed):** for a given `restaurant_id`, `tenant_id/tier_base/segment/signup_date/zone/cuisine/committed_hours_week` must be identical on every row. A conflict ⇒ reject the whole file, citing the offending `restaurant_id` + the two conflicting row numbers.

---

## Task 1: Clear-business-data mutation

**Files:**
- Modify: `server/routers/cohorts.ts` (add `clearBusinessData` mutation)
- Test: `tests/integration/cohort_admin.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/cohort_admin.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

function caller(tenantId = "POOL-001", userId = "U-OP-001") {
  const ctx: Context = { session: { user_id: userId, tenant_id: tenantId, org_level: "team" }, tenantId, userId };
  return appRouter.createCaller(ctx);
}
let pool: pg.Pool;
beforeAll(async () => { pool = makePool(); await resetDb(pool); }, 60_000);
afterAll(async () => { await pool.end(); });

describe("cohorts.clearBusinessData", () => {
  it("wipes business + cohort tables but PRESERVES catalog + users", async () => {
    expect(await count(pool, 'tenant."Restaurant"')).toBeGreaterThan(0);
    const r = await caller().cohorts.clearBusinessData();
    expect(r.cleared).toBe(true);
    expect(await count(pool, 'tenant."Restaurant"')).toBe(0);
    expect(await count(pool, 'tenant."Order"')).toBe(0);
    expect(await count(pool, 'tenant."Weekly_Connection"')).toBe(0);
    expect(await count(pool, 'cohort."Cohort"')).toBe(0);
    expect(await count(pool, 'cohort."Cohort_Membership_Snapshot"')).toBe(0);
    // preserved:
    expect(await count(pool, 'catalog."Config_Knobs"')).toBeGreaterThan(0);
    expect(await count(pool, 'catalog."Cohort_Rule_Version"')).toBeGreaterThan(0);
    expect(await count(pool, 'gov."User"')).toBeGreaterThan(0);
  }, 60_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `RLS_TESTS_ENABLED=1 pnpm test:integration cohort_admin`
Expected: FAIL — `cohorts.clearBusinessData is not a function`.

- [ ] **Step 3: Add the mutation**

In `server/routers/cohorts.ts`, inside `router({ ... })`, add (after `run`):

```ts
  // Demo operability — clear the business base so the operator can load a fresh dataset live.
  // Truncates ONLY business + cohort-result tables; PRESERVES catalog (knobs by name, rule versions,
  // named queries, NBA/intent catalogs) and gov.User — wiping those would break the producers (§3.8).
  // Destructive + demo-scoped: guarded by a confirm dialog client-side; tenantProcedure = authed.
  clearBusinessData: tenantProcedure.mutation(async (): Promise<{ cleared: true }> => {
    await query(`
      truncate
        cohort."Prioritized_NBA_Event", cohort."Cohort_Membership_Snapshot",
        cohort."Subgroup", cohort."Cohort",
        tenant."Weekly_Connection", tenant."Conversation_Episode",
        tenant."Order", tenant."Restaurant"
      restart identity cascade;
    `);
    return { cleared: true };
  }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `RLS_TESTS_ENABLED=1 pnpm test:integration cohort_admin`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routers/cohorts.ts tests/integration/cohort_admin.test.ts
git commit -m "feat(p01): clear-business-data mutation (preserve catalog/users) — demo onboarding"
```

---

## Task 2: Derive the run window from data (karpathy root-cause fix)

**Files:**
- Modify: `server/jobs/p01.ts` (add `deriveRunWindow`)
- Modify: `server/routers/cohorts.ts` (`run` uses derived window)
- Modify: `tests/integration/cohorts_run.test.ts` (assertion changes — behavior intentionally changes)
- Test: `tests/integration/cohort_window.test.ts` (create)

- [ ] **Step 1: Write the failing test (arbitrary dates must work)**

```ts
// tests/integration/cohort_window.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows, count } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

function caller(tenantId = "POOL-001", userId = "U-OP-001") {
  const ctx: Context = { session: { user_id: userId, tenant_id: tenantId, org_level: "team" }, tenantId, userId };
  return appRouter.createCaller(ctx);
}
let pool: pg.Pool;
beforeAll(async () => { pool = makePool(); await resetDb(pool); }, 60_000);
afterAll(async () => { await pool.end(); });

describe("cohorts.run derives window from data (any dates work)", () => {
  it("ranks a base whose orders are far from the old hardcoded 2026-06 window", async () => {
    // Shift ALL business dates back 2 years → old hardcoded window would find zero orders.
    await pool.query(`update tenant."Order" set order_date = order_date - interval '2 years'`);
    await pool.query(`update tenant."Weekly_Connection" set week = week - interval '2 years'`);
    await pool.query(`update tenant."Restaurant" set signup_date = signup_date - interval '2 years'`);
    const r = await caller().cohorts.run();
    // week2 == max(order_date) of the shifted data:
    const maxd = (await rows<{ d: string }>(pool, `select max(order_date)::text d from tenant."Order"`))[0]!.d;
    expect(r.weeks[1]).toBe(maxd);
    expect(r.cohorts).toBeGreaterThan(0);
    // memberships actually got a percentile (proof the window aligned, not just assigned):
    const ranked = await count(pool, 'cohort."Cohort_Membership_Snapshot" where percentile_in_cohort is not null');
    expect(ranked).toBeGreaterThan(0);
  }, 90_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `RLS_TESTS_ENABLED=1 pnpm test:integration cohort_window`
Expected: FAIL — with the old hardcoded weeks, `ranked` is 0 (window misses the shifted orders).

- [ ] **Step 3: Add `deriveRunWindow` to `server/jobs/p01.ts`**

Append:

```ts
import { query } from "../db/pool.js";

export interface RunWindow { week: string; prevWeek: string; refDate: string; }

// Derive the P01 window from the data itself so ANY uploaded base works regardless of its dates
// (root cause: the window was hardcoded). refDate = week = the latest order date ("as of"); prevWeek
// = week − 21d (mirrors the original 21-day gap so the F-2.2 delta still has two snapshots).
// Fail-closed: no orders ⇒ null (caller no-ops, never invents a date).
export async function deriveRunWindow(): Promise<RunWindow | null> {
  const r = await query<{ d: string | null }>(`select max(order_date)::text d from tenant."Order"`);
  const max = r[0]?.d ?? null;
  if (!max) return null;
  const prev = await query<{ d: string }>(`select ($1::date - 21)::text d`, [max]);
  return { week: max, prevWeek: prev[0]!.d, refDate: max };
}
```

- [ ] **Step 4: Rewrite `run` in `server/routers/cohorts.ts`**

Replace lines 60-85 (the `RUN_WEEKS`/`RUN_REF_DATE` consts + the `run` mutation body). Delete the two consts; import `deriveRunWindow`:

```ts
import { runP01, deriveRunWindow } from "../jobs/p01.js";
```

```ts
  run: tenantProcedure.mutation(async (): Promise<CohortsRunResult> => {
    // Prototype: relax k-anon to 1 so long-tail cells render (still tested at k=5; knob BY NAME §3.8).
    await query(`update catalog."Config_Knobs" set value='1' where key='k_anon_threshold'`);
    const w = await deriveRunWindow();
    if (!w) return { weeks: [], cohorts: 0, memberships: 0 }; // empty base ⇒ honest zero (fail-closed)
    await runP01({ week: w.prevWeek, refDate: w.refDate });
    await runP01({ week: w.week, refDate: w.refDate, prevSemana: w.prevWeek });
    const v = await current();
    const c = await query<{ n: number }>(
      `select count(*)::int n from cohort."Cohort" where cohort_rule_version=$1 and n_accounts is not null`, [v]);
    const m = await query<{ n: number }>(
      `select count(*)::int n from cohort."Cohort_Membership_Snapshot" where cohort_rule_version=$1`, [v]);
    return { weeks: [w.prevWeek, w.week], cohorts: c[0]?.n ?? 0, memberships: m[0]?.n ?? 0 };
  }),
```

- [ ] **Step 5: Update the existing `cohorts_run.test.ts` assertion (behavior changed on purpose)**

In [tests/integration/cohorts_run.test.ts:45](tests/integration/cohorts_run.test.ts#L45), replace the hardcoded-weeks assertion. The seed's max order_date is `2026-06-17`, so:

```ts
    const r = await caller(tenant).cohorts.run();
    // window is now DERIVED from data: week2 = max(order_date), week1 = week2 − 21d.
    const maxd = (await rows<{ d: string }>(pool, `select max(order_date)::text d from tenant."Order"`))[0]!.d;
    expect(r.weeks[1]).toBe(maxd);
    expect(r.weeks).toHaveLength(2);
```

(This is a legitimate contract change, not a test-to-pass hack: `run` no longer emits fixed dates — §6 distinguishes fixing production from faking tests; here production behavior genuinely changed.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `RLS_TESTS_ENABLED=1 pnpm test:integration cohort_window cohorts_run`
Expected: PASS (both files).

- [ ] **Step 7: Commit**

```bash
git add server/jobs/p01.ts server/routers/cohorts.ts tests/integration/cohort_window.test.ts tests/integration/cohorts_run.test.ts
git commit -m "feat(p01): derive run window from max(order_date) — any dataset cohortizes regardless of dates"
```

---

## Task 3: Reusable business-base generator function (DRY with seed)

**Files:**
- Create: `supabase/migrations/20260620000010_fn_generate_business_base.sql`
- Modify: `supabase/seed.sql` (call the function instead of inline inserts)
- Test: `tests/integration/generate_base.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/generate_base.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count } from "../helpers/db";

let pool: pg.Pool;
beforeAll(async () => { pool = makePool(); await resetDb(pool); }, 60_000);
afterAll(async () => { await pool.end(); });

describe("fn_generate_business_base", () => {
  it("seed still produces exactly 5000 restaurants with R001 anchor (parity)", async () => {
    expect(await count(pool, 'tenant."Restaurant"')).toBe(5000);
    expect(await count(pool, `tenant."Restaurant" where restaurant_id='R001'`)).toBe(1);
  });
  it("regenerating with a smaller N truncates+repopulates business only, results stay NULL (§14)", async () => {
    await pool.query(`truncate tenant."Conversation_Episode", tenant."Weekly_Connection", tenant."Order", tenant."Restaurant" restart identity cascade`);
    await pool.query(`select public.fn_generate_business_base(300, date '2026-06-17')`);
    expect(await count(pool, 'tenant."Restaurant"')).toBe(300);
    expect(await count(pool, 'tenant."Order"')).toBeGreaterThan(0);
    expect(await count(pool, 'tenant."Weekly_Connection"')).toBeGreaterThan(0);
    // anti-fake: tenure_months (RESULT) stays NULL before any producer runs:
    expect(await count(pool, `tenant."Restaurant" where tenure_months is not null`)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `RLS_TESTS_ENABLED=1 pnpm test:integration generate_base`
Expected: FAIL — `function public.fn_generate_business_base does not exist`.

- [ ] **Step 3: Create the migration (extract seed business SQL verbatim, parameterized)**

Create `supabase/migrations/20260620000010_fn_generate_business_base.sql`. Copy the four `insert` blocks from [supabase/seed.sql:160-255](supabase/seed.sql#L160) verbatim, replacing `generate_series(1, 5000)` with `generate_series(1, p_n)` and `date '2026-06-17'` with `p_ref`:

```sql
-- Reusable deterministic business-base generator (DRY: seed.sql + the demo "generate example base"
-- button call this). Same (p_n, p_ref) ⇒ identical output (det_int, no randomness). RESULTS stay NULL
-- (§14): tenure_months/percentiles/etc are produced only by P01. Does NOT touch catalog/gov.User.
create or replace function public.fn_generate_business_base(p_n int, p_ref date default date '2026-06-17')
returns void language plpgsql as $$
begin
  insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date,
                                   zone, cuisine, committed_hours_week, live_attributes)
  select s.rid,
         case when s.rid = 'R001' then 'POOL-001'
              when public.det_int(s.rid, 7, 100) < 10 then 'POOL-002' else 'POOL-001' end,
         s.tier, s.seg,
         p_ref - (public.det_int(s.rid, 11, 24) || ' months')::interval,
         s.zone, s.tipo,
         (40 + public.det_int(s.rid, 8, 41))::numeric(6,2),
         jsonb_build_object('timezone', 'America/Sao_Paulo', 'window', 'night')
  from (
    select rid,
           (array['downtown','north','south','east','west','southeast','northwest','coast'])[1 + public.det_int(rid, 5, 8)] as zone,
           (array['pizza','sushi','burger','brazilian','healthy','desserts'])[1 + public.det_int(rid, 6, 6)] as tipo,
           case when public.det_int(rid, 3, 1000) < 30 then 'managed_brand'::public.tier_base
                when public.det_int(rid, 3, 1000) < 50 then 'managed_midmarket'::public.tier_base
                else 'long_tail'::public.tier_base end as tier,
           case when public.det_int(rid, 3, 1000) < 50 then 'managed'::public.segment
                else 'long_tail'::public.segment end as seg
    from (select case when g = 1 then 'R001' else 'R' || lpad(g::text, 4, '0') end as rid
          from generate_series(1, p_n) g) ids
  ) s;

  insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, cancelled_by,
                             discount_pct, has_photo, has_description, zone, cuisine, channel, provenance)
  select r.restaurant_id,
         p_ref - raw.r21,
         raw.v, round(raw.v * 0.20, 2),
         case when raw.r22 < r.p_cancel     then 'failed'::public.payment_status
              when raw.r22 < r.p_cancel + 4 then 'pending'::public.payment_status
              else 'ok'::public.payment_status end,
         case when raw.r22 < r.p_cancel
                then (case when raw.r25 < 65 then 'restaurant' else 'customer' end)::public.cancelled_by
              else null end,
         case when raw.r28 < 25 then (10 + raw.r29)::numeric(5,2) else 0 end,
         raw.r26 < r.q, raw.r27 < r.q,
         r.zone, r.cuisine, 'app', '[V]'
  from (
    select rest.restaurant_id, rest.zone, rest.cuisine,
           public.det_int(rest.restaurant_id, 51, 101) as q,
           round(public.det_int(rest.restaurant_id, 53, 101) * 0.4) as p_cancel,
           (6 + round(( 0.35 * public.det_int(rest.restaurant_id, 52, 101)
                      + 0.25 * (40 + public.det_int(rest.zone, 71, 51))
                      + 0.20 * public.det_int(rest.restaurant_id, 51, 101)
                      + 0.20 * (100 - public.det_int(rest.restaurant_id, 53, 101))
                      ) * 0.30))::int as n_orders,
           case rest.tier_base when 'managed_brand' then 40 when 'managed_midmarket' then 20 else 0 end as tier_bonus
    from tenant."Restaurant" rest
  ) r
  cross join lateral generate_series(1, r.n_orders) g
  cross join lateral (
    select public.det_int(r.restaurant_id || ':' || g, 21, 90)                       as r21,
           (20 + r.tier_bonus + public.det_int(r.restaurant_id || ':' || g, 24, 80))::numeric(12,2) as v,
           public.det_int(r.restaurant_id || ':' || g, 22, 100)                      as r22,
           public.det_int(r.restaurant_id || ':' || g, 25, 100)                      as r25,
           public.det_int(r.restaurant_id || ':' || g, 26, 100)                      as r26,
           public.det_int(r.restaurant_id || ':' || g, 27, 100)                      as r27,
           public.det_int(r.restaurant_id || ':' || g, 28, 100)                      as r28,
           public.det_int(r.restaurant_id || ':' || g, 29, 31)                       as r29
  ) raw;

  insert into tenant."Weekly_Connection"(restaurant_id, week, connected_hours, committed_hours)
  select r.restaurant_id,
         (date_trunc('week', p_ref)::date - (w * 7)),
         least(r.hp, round(r.hp
               * (public.det_int(r.restaurant_id, 52, 101)::numeric / 100)
               * ((70 + public.det_int(r.restaurant_id || ':' || w, 61, 31))::numeric / 100), 2)),
         r.hp
  from (select restaurant_id, committed_hours_week as hp from tenant."Restaurant") r
  cross join generate_series(0, 8) w;

  insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent, ts, transcript_layer)
  select r.restaurant_id || ':C' || c, r.restaurant_id || ':conv' || c, r.tenant_id, r.restaurant_id,
         (array['billing','delivery','quality','promo','menu','order_review','cancellation'])[1 + public.det_int(r.restaurant_id || ':' || c, 41, 7)],
         (p_ref - public.det_int(r.restaurant_id || ':' || c, 44, 60))::timestamptz,
         jsonb_build_object('raw', 'redacted transcript ' || c)
  from tenant."Restaurant" r
  cross join lateral generate_series(1, 1 + public.det_int(r.restaurant_id, 42, 5)) c
  where public.det_int(r.restaurant_id, 43, 100) < 35;
end;
$$;
```

- [ ] **Step 4: Refactor `seed.sql` to call the function (DRY)**

In `supabase/seed.sql`, replace the four business `insert` blocks (lines 158-256, the Restaurant/Order/Weekly_Connection/Conversation_Episode inserts) with a single line (keep the section comment):

```sql
-- ── Business base (Restaurant + Order + Weekly_Connection + Conversation_Episode): 5000 restaurants,
--    deterministic via fn_generate_business_base (DRY — the demo "generate example" button reuses it). ──
select public.fn_generate_business_base(5000, date '2026-06-17');
```

- [ ] **Step 5: Reset DB + run the parity + new tests**

Run: `supabase db reset && RLS_TESTS_ENABLED=1 pnpm test:integration generate_base`
Expected: PASS. (Parity test guards that the refactor reproduces the exact 5000/R001 seed output.)

- [ ] **Step 6: Run the FULL anti-fake + cohort suites (refactor safety net)**

Run: `pnpm test:antifake && RLS_TESTS_ENABLED=1 pnpm test:integration p01_producers cohorts_run cohort_read_routes`
Expected: PASS (proves the seed refactor didn't perturb any downstream numbers).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260620000010_fn_generate_business_base.sql supabase/seed.sql tests/integration/generate_base.test.ts
git commit -m "refactor(seed): extract deterministic business-base into fn_generate_business_base (DRY, reused by demo generator)"
```

---

## Task 4: `generateExample` mutation

**Files:**
- Modify: `server/routers/cohorts.ts`
- Test: `tests/integration/cohort_admin.test.ts` (extend)

- [ ] **Step 1: Add the failing test (append to cohort_admin.test.ts)**

```ts
describe("cohorts.generateExample", () => {
  it("clears then generates a dimensioned base; Run Flow then ranks (gates pass)", async () => {
    const g = await caller().cohorts.generateExample({ restaurants: 1500 });
    expect(g.restaurants).toBe(1500);
    expect(await count(pool, 'tenant."Restaurant"')).toBe(1500);
    expect(await count(pool, `tenant."Restaurant" where tenure_months is not null`)).toBe(0); // §14 pre-run
    const r = await caller().cohorts.run();
    expect(r.cohorts).toBeGreaterThan(0);
    const ranked = await count(pool, 'cohort."Cohort_Membership_Snapshot" where percentile_in_cohort is not null');
    expect(ranked).toBeGreaterThan(0);
  }, 120_000);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `RLS_TESTS_ENABLED=1 pnpm test:integration cohort_admin`
Expected: FAIL — `cohorts.generateExample is not a function`.

- [ ] **Step 3: Add the mutation to `server/routers/cohorts.ts`**

```ts
  // Demo operability — generate a deterministic, gate-passing example base (reuses the seed generator,
  // DRY). Clears business data first so it's a clean load. restaurants bounded [50, 5000]; default 5000.
  // det_int ⇒ reproducible; all RESULTS stay NULL until Run Flow (§14). ref date is wall-clock-free here
  // (today is fine — the run window derives from the generated orders anyway, Task 2).
  generateExample: tenantProcedure
    .input(z.object({ restaurants: z.number().int().min(50).max(5000).default(5000) }))
    .mutation(async ({ input }): Promise<{ restaurants: number }> => {
      await query(`truncate
        cohort."Prioritized_NBA_Event", cohort."Cohort_Membership_Snapshot", cohort."Subgroup", cohort."Cohort",
        tenant."Weekly_Connection", tenant."Conversation_Episode", tenant."Order", tenant."Restaurant"
        restart identity cascade;`);
      await query(`select public.fn_generate_business_base($1, date '2026-06-17')`, [input.restaurants]);
      return { restaurants: input.restaurants };
    }),
```

- [ ] **Step 4: Run to verify pass**

Run: `RLS_TESTS_ENABLED=1 pnpm test:integration cohort_admin`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routers/cohorts.ts tests/integration/cohort_admin.test.ts
git commit -m "feat(p01): generateExample mutation — one-click dimensioned demo base (reuses seed generator)"
```

---

## Task 5: CSV parser + validation (fail-closed) + `uploadCsv` mutation

**Files:**
- Create: `server/cohorts/csvSchema.ts` (Zod row schema + column list)
- Create: `server/cohorts/parseCsv.ts` (parse + validate → rows or structured error)
- Modify: `server/routers/cohorts.ts` (`uploadCsv` mutation)
- Modify: `package.json` (add `papaparse` + `@types/papaparse`)
- Test: `tests/integration/csv_upload.test.ts` (create)

- [ ] **Step 1: Add the dependency**

Run: `pnpm add papaparse && pnpm add -D @types/papaparse`
Expected: added to package.json.

- [ ] **Step 2: Write the failing test**

```ts
// tests/integration/csv_upload.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

function caller(tenantId = "POOL-001", userId = "U-OP-001") {
  const ctx: Context = { session: { user_id: userId, tenant_id: tenantId, org_level: "team" }, tenantId, userId };
  return appRouter.createCaller(ctx);
}
const HEADER = "tenant_id,restaurant_id,tier_base,segment,signup_date,zone,cuisine,committed_hours_week,order_date,gross_value,fee,payment_status,cancelled_by,discount_pct,has_photo,has_description";
function b64(csv: string) { return Buffer.from(csv, "utf8").toString("base64"); }
let pool: pg.Pool;
beforeAll(async () => { pool = makePool(); await resetDb(pool); await pool.query(`truncate tenant."Weekly_Connection", tenant."Order", tenant."Restaurant" restart identity cascade`); }, 60_000);
afterAll(async () => { await pool.end(); });

describe("cohorts.uploadCsv", () => {
  it("inserts restaurants (deduped) + orders + synthesized connection; results stay NULL (§14)", async () => {
    const row = (rid: string, od: string, pay = "ok") =>
      `POOL-001,${rid},long_tail,long_tail,2024-01-01,downtown,pizza,50,${od},100,20,${pay},,0,true,true`;
    const csv = [HEADER, row("RX1", "2026-03-01"), row("RX1", "2026-03-08"), row("RX2", "2026-03-02")].join("\n");
    const r = await caller().cohorts.uploadCsv({ filename: "base.csv", contentBase64: b64(csv) });
    expect(r.restaurants).toBe(2);
    expect(r.orders).toBe(3);
    expect(await count(pool, 'tenant."Restaurant"')).toBe(2);
    expect(await count(pool, 'tenant."Order"')).toBe(3);
    expect(await count(pool, 'tenant."Weekly_Connection"')).toBeGreaterThan(0); // synthesized
    expect(await count(pool, `tenant."Restaurant" where tenure_months is not null`)).toBe(0); // §14
  });

  it("rejects a bad enum value citing the row + column (fail-closed, nothing inserted)", async () => {
    const before = await count(pool, 'tenant."Order"');
    const bad = [HEADER, `POOL-001,RBAD,WRONG_TIER,long_tail,2024-01-01,downtown,pizza,50,2026-03-01,100,20,ok,,0,true,true`].join("\n");
    await expect(caller().cohorts.uploadCsv({ filename: "bad.csv", contentBase64: b64(bad) }))
      .rejects.toThrow(/row 2.*tier_base/i);
    expect(await count(pool, 'tenant."Order"')).toBe(before); // atomic: nothing partial
  });

  it("rejects conflicting restaurant attributes across rows", async () => {
    const conflict = [HEADER,
      `POOL-001,RC1,long_tail,long_tail,2024-01-01,downtown,pizza,50,2026-03-01,100,20,ok,,0,true,true`,
      `POOL-001,RC1,long_tail,long_tail,2024-01-01,north,pizza,50,2026-03-02,100,20,ok,,0,true,true`].join("\n");
    await expect(caller().cohorts.uploadCsv({ filename: "c.csv", contentBase64: b64(conflict) }))
      .rejects.toThrow(/RC1.*conflict/i);
  });
});
```

- [ ] **Step 3: Run to verify fail**

Run: `RLS_TESTS_ENABLED=1 pnpm test:integration csv_upload`
Expected: FAIL — `cohorts.uploadCsv is not a function`.

- [ ] **Step 4: Create `server/cohorts/csvSchema.ts`**

```ts
import { z } from "zod";

// CSV is Order-grain: each row carries its restaurant's attributes. Empty optional cells → undefined.
export const CSV_COLUMNS = [
  "tenant_id", "restaurant_id", "tier_base", "segment", "signup_date", "zone", "cuisine",
  "committed_hours_week", "order_date", "gross_value", "fee", "payment_status", "cancelled_by",
  "discount_pct", "has_photo", "has_description",
] as const;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const num = z.coerce.number();
const optNum = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().optional());
const optBool = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v === "true" ? true : v === "false" ? false : v),
  z.boolean().optional(),
);
const optEmpty = (s: z.ZodTypeAny) => z.preprocess((v) => (v === "" || v == null ? undefined : v), s);

export const csvRowSchema = z.object({
  tenant_id: z.string().min(1),
  restaurant_id: z.string().min(1),
  tier_base: z.enum(["managed_brand", "managed_midmarket", "long_tail"]),
  segment: z.enum(["managed", "long_tail"]),
  signup_date: date,
  zone: z.string().min(1),
  cuisine: z.string().min(1),
  committed_hours_week: num.nonnegative(),
  order_date: date,
  gross_value: num.nonnegative(),
  fee: optNum,
  payment_status: z.enum(["ok", "failed", "pending"]),
  cancelled_by: optEmpty(z.enum(["restaurant", "customer"]).optional()),
  discount_pct: optNum,
  has_photo: optBool,
  has_description: optBool,
});
export type CsvRow = z.infer<typeof csvRowSchema>;

// Restaurant-identity columns that must be consistent across all rows of one restaurant_id.
export const REST_KEYS = ["tenant_id", "tier_base", "segment", "signup_date", "zone", "cuisine", "committed_hours_week"] as const;
```

- [ ] **Step 5: Create `server/cohorts/parseCsv.ts`**

```ts
import Papa from "papaparse";
import { TRPCError } from "@trpc/server";
import { CSV_COLUMNS, REST_KEYS, csvRowSchema, type CsvRow } from "./csvSchema.js";

function bad(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message }); // fail-closed: reject whole file
}

// Parse + validate. Returns typed rows, or throws a TRPCError citing the offending row+column.
export function parseCsv(text: string): CsvRow[] {
  const out = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
  const headers = out.meta.fields ?? [];
  const missing = CSV_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length) bad(`CSV missing required column(s): ${missing.join(", ")}`);
  if (!out.data.length) bad("CSV has no data rows");

  const rows: CsvRow[] = [];
  out.data.forEach((raw, i) => {
    const line = i + 2; // +1 header, +1 to 1-base
    const parsed = csvRowSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      bad(`row ${line}, column "${issue.path.join(".")}": ${issue.message}`);
    }
    rows.push(parsed.data);
  });

  // Restaurant-attribute consistency (fail-closed).
  const seen = new Map<string, { line: number; row: CsvRow }>();
  rows.forEach((row, i) => {
    const line = i + 2;
    const prev = seen.get(row.restaurant_id);
    if (!prev) { seen.set(row.restaurant_id, { line, row }); return; }
    for (const k of REST_KEYS) {
      if (String(prev.row[k]) !== String(row[k])) {
        bad(`restaurant_id "${row.restaurant_id}" has conflicting "${k}" between row ${prev.line} and row ${line}`);
      }
    }
  });
  return rows;
}
```

- [ ] **Step 6: Add `uploadCsv` to `server/routers/cohorts.ts`**

Add imports at top:

```ts
import { parseCsv } from "../cohorts/parseCsv.js";
import { REST_KEYS } from "../cohorts/csvSchema.js";
import { withTx } from "../db/pool.js";
```

Mutation:

```ts
  // Demo onboarding — upload one Order-grain CSV. Server dedups restaurants, bulk-inserts orders, and
  // SYNTHESIZES neutral Weekly_Connection (connected=committed) so the v2 rank's connection INNER JOIN
  // is satisfied (else every percentile NULLs out). Atomic (withTx): a bad row rejects the whole file
  // (fail-closed §7). Only brutos inserted; all RESULTS stay NULL until Run Flow (§14). tenant_id is taken
  // from the CSV per the agreed contract (demo); cross-pool data is allowed here (single operator demo).
  uploadCsv: tenantProcedure
    .input(z.object({ filename: z.string().min(1), contentBase64: z.string().min(1) }))
    .mutation(async ({ input }): Promise<{ restaurants: number; orders: number }> => {
      const text = Buffer.from(input.contentBase64, "base64").toString("utf8");
      const rows = parseCsv(text); // throws TRPCError on any invalid/conflicting row

      const restMap = new Map<string, (typeof rows)[number]>();
      for (const r of rows) if (!restMap.has(r.restaurant_id)) restMap.set(r.restaurant_id, r);
      const rests = [...restMap.values()];

      await withTx(async (c) => {
        // Restaurants
        for (const r of rests) {
          await c.query(
            `insert into tenant."Restaurant"
               (restaurant_id, tenant_id, tier_base, segment, signup_date, zone, cuisine, committed_hours_week, status)
             values ($1,$2,$3,$4,$5,$6,$7,$8,'active')`,
            [r.restaurant_id, r.tenant_id, r.tier_base, r.segment, r.signup_date, r.zone, r.cuisine, r.committed_hours_week],
          );
        }
        // Orders
        for (const o of rows) {
          await c.query(
            `insert into tenant."Order"
               (restaurant_id, order_date, gross_value, fee, payment_status, cancelled_by, discount_pct, has_photo, has_description, zone, cuisine, channel, provenance)
             values ($1,$2,$3,coalesce($4,0),$5,$6,coalesce($7,0),$8,$9,$10,$11,'csv','[V]')`,
            [o.restaurant_id, o.order_date, o.gross_value, o.fee ?? null, o.payment_status,
             o.cancelled_by ?? null, o.discount_pct ?? null, o.has_photo ?? null, o.has_description ?? null, o.zone, o.cuisine],
          );
        }
        // Synthesized neutral connection: 13 weekly rows/restaurant ending at the latest order date,
        // connected=committed (ratio 1 ⇒ uniform percent_rank ⇒ neutral 30% component). Covers both
        // run windows (week2 and week2−21d, each looking back 63d). committed = committed_hours_week.
        await c.query(
          `insert into tenant."Weekly_Connection"(restaurant_id, week, connected_hours, committed_hours)
           select r.restaurant_id,
                  (date_trunc('week', m.maxd)::date - (w * 7)),
                  r.committed_hours_week, r.committed_hours_week
           from tenant."Restaurant" r
           cross join (select max(order_date) maxd from tenant."Order") m
           cross join generate_series(0, 12) w
           on conflict (restaurant_id, week) do nothing`,
        );
      });
      return { restaurants: rests.length, orders: rows.length };
    }),
```

> Note: `REST_KEYS` is imported for symmetry/future use by the consistency check that lives in `parseCsv`; if the linter flags it unused here, drop the import from the router (it's only needed in `parseCsv.ts`).

- [ ] **Step 7: Run to verify pass**

Run: `RLS_TESTS_ENABLED=1 pnpm test:integration csv_upload`
Expected: PASS (all 3 cases).

- [ ] **Step 8: Commit**

```bash
git add server/cohorts/csvSchema.ts server/cohorts/parseCsv.ts server/routers/cohorts.ts package.json pnpm-lock.yaml
git commit -m "feat(p01): CSV upload — Order-grain parse+Zod validate (fail-closed) + synthesized connection"
```

---

## Task 6: `csvTemplate` query (download template with type legend)

**Files:**
- Modify: `server/routers/cohorts.ts`
- Test: `tests/integration/csv_upload.test.ts` (extend) — fast unit-style, no DB needed but lives with the suite

- [ ] **Step 1: Add failing test**

```ts
import { CSV_COLUMNS } from "../../server/cohorts/csvSchema";
describe("cohorts.csvTemplate", () => {
  it("returns a header with every required column + one example row", async () => {
    const t = await caller().cohorts.csvTemplate();
    const [header, ...rest] = t.csv.split("\n");
    expect(header).toBe(CSV_COLUMNS.join(","));
    expect(rest.length).toBeGreaterThanOrEqual(1);
    expect(t.legend.tier_base).toMatch(/managed_brand/);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `RLS_TESTS_ENABLED=1 pnpm test:integration csv_upload`
Expected: FAIL — `cohorts.csvTemplate is not a function`.

- [ ] **Step 3: Add the query to `server/routers/cohorts.ts`**

```ts
import { CSV_COLUMNS } from "../cohorts/csvSchema.js";
```

```ts
  // Demo onboarding — the downloadable CSV template: exact header + 2 example rows + a per-column type
  // legend the modal renders so the operator knows what each field expects. Static (no DB).
  csvTemplate: tenantProcedure.query(async () => {
    const example = [
      "POOL-001,R001,long_tail,long_tail,2025-06-01,downtown,pizza,50,2026-03-01,120.00,24.00,ok,,0,true,true",
      "POOL-001,R001,long_tail,long_tail,2025-06-01,downtown,pizza,50,2026-03-08,90.00,18.00,failed,customer,0,false,true",
    ];
    const legend: Record<string, string> = {
      tenant_id: "text — pool/RLS id, e.g. POOL-001",
      restaurant_id: "text — groups rows into one restaurant",
      tier_base: "enum — managed_brand | managed_midmarket | long_tail",
      segment: "enum — managed | long_tail",
      signup_date: "date YYYY-MM-DD — must be <= latest order_date",
      zone: "text — cohort axis (e.g. downtown)",
      cuisine: "text — cohort axis (e.g. pizza)",
      committed_hours_week: "number — committed weekly hours (also connection denominator)",
      order_date: "date YYYY-MM-DD",
      gross_value: "number >= 0",
      fee: "number >= 0 (optional, default 0)",
      payment_status: "enum — ok | failed | pending",
      cancelled_by: "enum — restaurant | customer (only when payment_status=failed; else blank)",
      discount_pct: "number 0-100 (optional, default 0)",
      has_photo: "boolean — true | false (optional)",
      has_description: "boolean — true | false (optional)",
    };
    return { csv: [CSV_COLUMNS.join(","), ...example].join("\n"), legend };
  }),
```

- [ ] **Step 4: Run to verify pass**

Run: `RLS_TESTS_ENABLED=1 pnpm test:integration csv_upload`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routers/cohorts.ts tests/integration/csv_upload.test.ts
git commit -m "feat(p01): csvTemplate query — downloadable template + per-column type legend"
```

---

## Task 7: Frontend — Clear + Generate buttons in the header

**Files:**
- Modify: `client/src/pages/CohortsExplorerPage.tsx`

- [ ] **Step 1: Add the mutations + handlers**

In `CohortsExplorerPage`, after `const run = trpc.cohorts.run.useMutation();` add:

```tsx
  const clearDb = trpc.cohorts.clearBusinessData.useMutation();
  const genExample = trpc.cohorts.generateExample.useMutation();
  const [uploadOpen, setUploadOpen] = useState(false);

  async function invalidateAll() {
    await Promise.all([
      utils.cohorts.list.invalidate(), utils.cohorts.deltas.invalidate(),
      utils.cohorts.intentCounts.invalidate(), utils.cohorts.changelog.invalidate(),
      utils.money.summary.invalidate(),
    ]);
  }
  async function onClear() {
    if (!window.confirm("Clear ALL business data (restaurants, orders, cohorts)? Catalog/config is kept.")) return;
    setRunMsg({ status: "running" });
    try { await clearDb.mutateAsync(); await invalidateAll(); setRunMsg({ status: "done", text: "Business data cleared — upload a CSV or generate an example base." }); }
    catch (e) { setRunMsg({ status: "error", text: e instanceof Error ? e.message : "Clear failed" }); }
  }
  async function onGenerate() {
    setRunMsg({ status: "running" });
    try { const g = await genExample.mutateAsync({ restaurants: 5000 }); await invalidateAll(); setRunMsg({ status: "done", text: `Example base generated · ${g.restaurants} restaurants. Now press Run flow.` }); }
    catch (e) { setRunMsg({ status: "error", text: e instanceof Error ? e.message : "Generate failed" }); }
  }
```

- [ ] **Step 2: Add the buttons to the header row**

In the header `<div className="mt-3 flex flex-wrap items-center gap-3">` (after the existing Run flow `<Button>`), add:

```tsx
            <Button type="button" variant="secondary" onClick={() => void onGenerate()} disabled={running}>
              Generate example base
            </Button>
            <Button type="button" variant="secondary" onClick={() => setUploadOpen(true)} disabled={running}>
              Upload CSV
            </Button>
            <Button type="button" variant="ghost" onClick={() => void onClear()} disabled={running} className="text-mxm-red">
              Clear database
            </Button>
```

> If `Button` lacks a `variant` prop, check [client/src/components/ui/Button.tsx](client/src/components/ui/Button.tsx) and use the existing API (e.g. className overrides). Match whatever the component actually exposes — do not invent props.

- [ ] **Step 3: Verify build + typecheck**

Run: `pnpm typecheck`
Expected: PASS (0 errors).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/CohortsExplorerPage.tsx
git commit -m "feat(p01): Cohorts header — Clear DB + Generate example base controls"
```

---

## Task 8: Frontend — Upload modal (template download + CSV upload)

**Files:**
- Create: `client/src/features/cohorts/CsvUploadModal.tsx`
- Modify: `client/src/pages/CohortsExplorerPage.tsx` (render the modal)

- [ ] **Step 1: Create the modal**

Mirror the (p06) `/knowledge` upload pattern: file picker → `FileReader.readAsDataURL` → strip the `data:...;base64,` prefix → send `contentBase64`. a11y: `role="dialog"`, `aria-modal`, Esc to close, focus trap, focus-return; error state in red text + icon (never color-only).

```tsx
// client/src/features/cohorts/CsvUploadModal.tsx
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/Button";

export function CsvUploadModal({ open, onClose, onUploaded }: { open: boolean; onClose: () => void; onUploaded: () => void }) {
  const template = trpc.cohorts.csvTemplate.useQuery(undefined, { enabled: open });
  const upload = trpc.cohorts.uploadCsv.useMutation();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function downloadTemplate() {
    if (!template.data) return;
    const blob = new Blob([template.data.csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "cohort_base_template.csv"; a.click();
    URL.revokeObjectURL(a.href);
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null); setBusy(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result);
        const contentBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
        const r = await upload.mutateAsync({ filename: file.name, contentBase64 });
        setBusy(false); onUploaded();
        onClose();
        void r;
      } catch (e2) { setBusy(false); setErr(e2 instanceof Error ? e2.message : "Upload failed"); }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-labelledby="csv-modal-title">
      <div className="w-full max-w-lg rounded-lg bg-mxm-surface p-6 shadow-xl">
        <h2 id="csv-modal-title" className="text-lg font-semibold text-mxm-content">Upload cohort base (CSV)</h2>
        <p className="mt-1 text-sm text-mxm-content-secondary">One row per order; each row carries its restaurant's attributes. Download the template to see every expected field + type.</p>

        <div className="mt-4">
          <Button type="button" variant="secondary" onClick={downloadTemplate} disabled={!template.data}>Download template</Button>
        </div>

        {template.data && (
          <dl className="mt-4 max-h-48 overflow-auto rounded border border-mxm-border p-3 text-xs">
            {Object.entries(template.data.legend).map(([col, desc]) => (
              <div key={col} className="flex gap-2 py-0.5"><dt className="font-mono text-mxm-content">{col}</dt><dd className="text-mxm-content-secondary">{desc}</dd></div>
            ))}
          </dl>
        )}

        <div className="mt-4">
          <label className="text-sm text-mxm-content">Choose CSV file
            <input type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy} className="mt-1 block w-full text-sm" />
          </label>
        </div>

        {busy && <p className="mt-3 text-sm text-mxm-content-secondary" aria-live="polite">Uploading + validating…</p>}
        {err && <p className="mt-3 text-sm text-mxm-red" role="alert">⚠ Rejected: {err}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Button ref={closeRef} type="button" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
```

> Verify `Button` forwards a `ref` and supports the `variant`s used; if not, adapt to its real API (check the component). Verify token names (`bg-mxm-surface`, `border-mxm-border`, `text-mxm-red`) exist in the Tailwind config / design tokens — use the real ones.

- [ ] **Step 2: Render it in the page**

In `CohortsExplorerPage.tsx`, import and render near `<CohortModal …/>`:

```tsx
import { CsvUploadModal } from "@/features/cohorts/CsvUploadModal";
```

```tsx
      <CsvUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={() => void invalidateAll()} />
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/features/cohorts/CsvUploadModal.tsx client/src/pages/CohortsExplorerPage.tsx
git commit -m "feat(p01): CSV upload modal — template download + type legend + a11y dialog"
```

---

## Task 9: E2E + a11y + full gate

**Files:**
- Create: `e2e/cohort_csv_onboarding.spec.ts`

- [ ] **Step 1: Write the E2E (the CEO/VP story end-to-end)**

```ts
// e2e/cohort_csv_onboarding.spec.ts
import { test, expect } from "@playwright/test";

test("clear → generate example base → run flow → cohorts appear", async ({ page }) => {
  await page.goto("/cohorts");
  await page.getByRole("button", { name: "Clear database" }).click();
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Generate example base" }).click();
  await expect(page.getByText(/Example base generated/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Run flow" }).click();
  await expect(page.getByText(/cohorts ·/)).toBeVisible({ timeout: 60_000 });
  // a cohort cell rendered:
  await expect(page.locator("[data-cohort-cell]").first()).toBeVisible();
});

test("upload modal exposes the template + type legend", async ({ page }) => {
  await page.goto("/cohorts");
  await page.getByRole("button", { name: "Upload CSV" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("tier_base")).toBeVisible();
  await expect(page.getByText(/managed_brand/)).toBeVisible();
});
```

> If `CohortMatrix` cells lack a stable selector, add `data-cohort-cell` to the cell element in [client/src/features/cohorts/CohortMatrix.tsx](client/src/features/cohorts/CohortMatrix.tsx) (minimal, test-only attribute) and commit with this task.

- [ ] **Step 2: Run e2e + a11y**

Run: `pnpm test:e2e cohort_csv_onboarding && pnpm test:a11y`
Expected: PASS.

- [ ] **Step 3: Run the FULL gate with evidence**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:sql && pnpm test:antifake && RLS_TESTS_ENABLED=1 pnpm test:integration && pnpm test:e2e`
Expected: all green. Paste command + tail output as evidence (CLAUDE.md §1/§5 — "done" requires evidence).

- [ ] **Step 4: Commit**

```bash
git add e2e/cohort_csv_onboarding.spec.ts client/src/features/cohorts/CohortMatrix.tsx
git commit -m "test(p01): e2e clear→generate→run + upload-modal a11y; full gate green"
```

---

## Self-Review

**Spec coverage:**
- ✅ Clear-DB button → Task 1 (mutation) + Task 7 (UI).
- ✅ CSV template with per-column types → Task 6 (`csvTemplate` + legend) + Task 8 (modal renders legend, download).
- ✅ Upload CSV updates DB → Task 5 (`uploadCsv`, fail-closed validation, synthesized connection).
- ✅ Run Flow re-cohortizes any base regardless of dates → Task 2 (derive window).
- ✅ Generate dimensioned example base → Tasks 3 (DRY function) + 4 (mutation) + 7 (button).
- ✅ Reuse `/knowledge` upload pattern (base64) → Task 8.
- ✅ Anti-fake §14 (results NULL pre-run) asserted in Tasks 3, 4, 5.
- ✅ Fail-closed (§7): bad/conflicting rows reject whole file (Task 5); empty base → honest zero (Task 2).
- ✅ Catalog/knobs-by-name preserved on clear (Task 1).

**Open risks flagged (decide at execution if hit):**
- `Button` variant/`ref` API and `--mxm-*` token names are assumed — Tasks 7/8 say to verify against the real components before finalizing.
- The seed refactor (Task 3) is guarded by the antifake + p01 suites; if any number shifts, the extraction wasn't byte-identical — re-diff the SQL.
- `tenant_id` from CSV means uploaded rows can span pools; the read APIs are tenant-scoped, so the operator only SEES their pool. Acceptable for the single-operator demo; note if multi-tenant isolation in the demo matters.

**Type consistency:** `CohortsRunResult` (weeks/cohorts/memberships) unchanged; new return shapes (`{cleared}`, `{restaurants}`, `{restaurants,orders}`, `{csv,legend}`) are local to each mutation and consumed only by their handlers. `CsvRow`/`CSV_COLUMNS`/`REST_KEYS` defined once in `csvSchema.ts`, imported everywhere.
