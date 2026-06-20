# Cockpit Release → Artifact Dispatch (Feature 1a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pressing Release on an NBA opens a dispatch screen showing how many restaurants it reaches and the generated artifact to review, and Send writes the release trace + a dispatch record atomically.

**Architecture:** A new cockpit-owned `gov.Action_Dispatch` entity (no Support coupling). The artifact `content` is a **deterministic render** of the NBA proposal's produced fields + the `NBA_Catalogo` playbook for that action (mirrors `server/artifact/generateFromDossier.ts` — NO LLM, §14-safe; `server/_core/llm.ts` does not exist on this branch). Send reuses the existing `recordRelease` (Release_Batch + Decision_Trace, 4-eyes, override-only-down) inside one tx and adds the dispatch row.

**Tech Stack:** TS, tRPC v11, Zod, Postgres (supabase migrations), React 19 + wouter, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-cockpit-release-artifact-dispatch-design.md`

**Deviation from spec (grounded):** spec said "generation via `server/_core/llm.ts`". That helper is NOT on this branch (it's in the unmerged P06 branch) and the 05C precedent renders deterministically with no LLM. Plan uses deterministic render. Swapping to LLM drafting is a localized follow-up once `llm.ts` merges.

---

## File structure

- `supabase/migrations/<ts>_p02_action_dispatch.sql` — new `gov.Action_Dispatch` table + `public.dispatch_status` enum.
- `shared/contracts.ts` — add `dispatchDetail` output + `sendDispatchInput` Zod schemas (append near `cockpitWeekSummary`).
- `server/cockpit/renderArtifact.ts` — pure deterministic content render (action → artifact kind + body). DB-free, unit-testable.
- `server/routers/cockpit.ts` — add `dispatchDetail` query + `sendDispatch` mutation (reuse `recordRelease`).
- `client/src/features/cockpit/artifactKind.ts` — client mirror of the action→kind label map (display only).
- `client/src/pages/DispatchPage.tsx` — the `/cockpit/dispatch/:nbaId` screen.
- `client/src/App.tsx` — register the route.
- `client/src/pages/CockpitPage.tsx` — RELEASE → navigate (not mutate); PAUSE unchanged.
- Tests: `tests/integration/cockpit_dispatch.test.ts`, `server/cockpit/renderArtifact.test.ts`, `client/src/pages/DispatchPage.test.tsx`.

---

## Task 1: `Action_Dispatch` migration

**Files:** Create `supabase/migrations/20260621000000_p02_action_dispatch.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 02:1a — cockpit-owned dispatch of a released NBA's artifact to a cohort's restaurants.
-- NOT the Support Generated_Artifact (no problem_id/dossier coupling). content is PRODUCED
-- (deterministic render of the proposal + catalog playbook), never seeded (§14). One dispatch
-- per nba_id (idempotent). decision_trace_id ties it to the release ("sin trace no acción").
do $$ begin
  if not exists (select 1 from pg_type where typname = 'dispatch_status') then
    create type public.dispatch_status as enum ('draft', 'sent');
  end if;
end $$;

create table if not exists gov."Action_Dispatch" (
  dispatch_id        uuid primary key default gen_random_uuid(),
  nba_id             text not null,                     -- [deferred FK → NBA_Proposal] path P02
  cohort_id          text not null,
  tenant_id          text not null,                     -- RLS frontier (server-side)
  artifact_kind      text not null,                     -- email_offer | ops_memo | price_rec | ... (code map)
  content            jsonb not null,                    -- RESULT §14: rendered at send, never seeded
  target_count       integer not null,                 -- restaurants reached (computed at send)
  status             public.dispatch_status not null default 'sent',
  decision_trace_id  text references gov."Decision_Trace"(trace_id),
  created_at         timestamptz not null default now(),
  constraint action_dispatch_nba_uniq unique (nba_id)   -- no double dispatch
);
create index if not exists action_dispatch_tenant_idx on gov."Action_Dispatch"(tenant_id);
```

- [ ] **Step 2: Apply + verify**

Run: `pnpm db:reset && docker exec supabase_db_musixmatch-customer-ops psql -U postgres -d postgres -tA -c "select to_regclass('gov.\"Action_Dispatch\"')"`
Expected: `gov."Action_Dispatch"`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260621000000_p02_action_dispatch.sql
git commit -m "feat(p02:1a): Action_Dispatch table — cockpit-owned NBA dispatch (§14, idempotent)"
```

---

## Task 2: Deterministic artifact render (pure)

**Files:** Create `server/cockpit/renderArtifact.ts`, Test `server/cockpit/renderArtifact.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { renderArtifact, ARTIFACT_KIND } from "./renderArtifact";

describe("02:1a renderArtifact — deterministic, quotes produced fields (§14, no LLM)", () => {
  it("maps action to a kind and renders a body from the proposal + path", () => {
    const a = renderArtifact({
      action_type: "A3",
      action_label: "Propose promo/bonus",
      cohort_id: "long_tail · 0-3m",
      root_cause: "price percentile high",
      before_after_expected: { dimension: "price_pctile", measured: 82, standard: 60, gap: 22 },
      playbook: "AI proposes promo; human releases the money",
    });
    expect(a.artifact_kind).toBe(ARTIFACT_KIND.A3); // "email_offer"
    expect(a.content.action).toBe("Propose promo/bonus");
    expect(a.content.cohort).toBe("long_tail · 0-3m");
    expect(a.content.path).toMatch(/price_pctile/);
    expect(a.content.how).toMatch(/human releases the money/);
  });
  it("unknown action ⇒ generic memo kind, never throws", () => {
    const a = renderArtifact({ action_type: "Z9", action_label: null, cohort_id: "c", root_cause: null, before_after_expected: null, playbook: null });
    expect(a.artifact_kind).toBe(ARTIFACT_KIND.default); // "ops_memo"
    expect(a.content.action).toBe("Z9");
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm vitest run server/cockpit/renderArtifact.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// 02:1a — deterministic render of a released NBA into a dispatchable artifact. Quotes the proposal's
// PRODUCED fields + the NBA_Catalogo playbook for the action; never invents a number (§14, mirrors
// server/artifact/generateFromDossier.ts). NO LLM (server/_core/llm.ts is not on this branch).
export const ARTIFACT_KIND = {
  A1: "ops_memo", A2: "price_rec", A3: "email_offer", A4: "ops_memo",
  A5: "growth_brief", A6: "ops_ticket", A7: "risk_escalation", A8: "ops_memo",
  default: "ops_memo",
} as const;

export interface RenderInput {
  action_type: string | null;
  action_label: string | null;
  cohort_id: string;
  root_cause: string | null;
  before_after_expected: unknown;
  playbook: string | null;
}
export interface RenderedArtifact {
  artifact_kind: string;
  content: { action: string; cohort: string; root: string; path: string; how: string };
}

function pathText(j: unknown): string {
  if (j && typeof j === "object") {
    const o = j as { dimension?: unknown; measured?: unknown; standard?: unknown; gap?: unknown };
    if (typeof o.dimension === "string" && typeof o.measured === "number" && typeof o.standard === "number") {
      const gap = typeof o.gap === "number" ? ` · gap ${o.gap}` : "";
      return `${o.dimension}: ${o.measured} → ${o.standard}${gap}`;
    }
  }
  return "no projected path";
}

export function renderArtifact(i: RenderInput): RenderedArtifact {
  const code = (i.action_type ?? "").toUpperCase();
  const kind = (ARTIFACT_KIND as Record<string, string>)[code] ?? ARTIFACT_KIND.default;
  return {
    artifact_kind: kind,
    content: {
      action: i.action_label ?? i.action_type ?? "—",
      cohort: i.cohort_id,
      root: i.root_cause ?? "no attributable cause",
      path: pathText(i.before_after_expected),
      how: i.playbook ?? "—",
    },
  };
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm vitest run server/cockpit/renderArtifact.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/cockpit/renderArtifact.ts server/cockpit/renderArtifact.test.ts
git commit -m "feat(p02:1a): deterministic artifact render (quotes produced fields + playbook, §14)"
```

---

## Task 3: Contracts

**Files:** Modify `shared/contracts.ts` (append after `nbaCatalogUsage`)

- [ ] **Step 1: Add schemas**

```ts
// 02:1a — the dispatch screen payload: the released NBA, who it reaches, and the rendered artifact.
export const cockpitDispatchDetail = z.object({
  nba_id: z.string(),
  action_type: z.string().nullable(),
  action_label: z.string().nullable(),
  cohort_id: z.string(),
  effective_level: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable(),
  reach_count: z.number(),
  reach_preview: z.array(z.object({ restaurant_id: z.string(), tier_base: z.string() })),
  artifact_kind: z.string(),
  content: z.object({ action: z.string(), cohort: z.string(), root: z.string(), path: z.string(), how: z.string() }),
});
export type CockpitDispatchDetail = z.infer<typeof cockpitDispatchDetail>;

// 02:1a — Send: writes Release_Batch + Decision_Trace + Action_Dispatch atomically.
export const cockpitSendDispatchInput = z.object({
  nba_id: z.string().min(1),
  resulting_level: z.enum(["LOW", "MEDIUM", "HIGH"]),
});
export type CockpitSendDispatchInput = z.infer<typeof cockpitSendDispatchInput>;
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck` → Expected: pass
```bash
git add shared/contracts.ts
git commit -m "feat(p02:1a): contracts — cockpit.dispatchDetail + sendDispatch io"
```

---

## Task 4: Server — `dispatchDetail` + `sendDispatch`

**Files:** Modify `server/routers/cockpit.ts`, Test `tests/integration/cockpit_dispatch.test.ts`

- [ ] **Step 1: Write the failing integration test** (rolled-back tx; mirrors `nba_cockpit.test.ts` setup)

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { proposeNba } from "../../server/agente/nba_engine";
import { dispatchDetail, sendDispatch, type Exec } from "../../server/routers/cockpit";

const W1 = "2026-05-25";
const REF = "2026-06-17";
let pool: pg.Pool;
beforeAll(async () => { pool = makePool(); await resetDb(pool); await runP01({ week: W1, refDate: REF }); }, 120_000);
afterAll(async () => { await pool.end(); });

describe("02:1a dispatch — reach + atomic send (§14, idempotent, no cross-pool)", () => {
  it("dispatchDetail reach matches membership; send writes trace + dispatch once; foreign pool rejected", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const exec: Exec = (sql, params) => c.query(sql, params as unknown[]).then((r) => r.rows) as never;
      const tId = (await c.query<{ tenant_id: string }>(`select tenant_id from tenant."Restaurant" limit 1`)).rows[0]!.tenant_id;
      const r = (await c.query<{ restaurant_id: string; cohort_id: string; tier_base: string }>(
        `select cms.restaurant_id, cms.cohort_id, ct.tier_base
         from cohort."Cohort_Membership_Snapshot" cms
         join cohort."Cohort" ct on ct.cohort_id=cms.cohort_id and ct.cohort_rule_version=cms.cohort_rule_version
         where cms.week=$1 and cms.m_connection < 0.50 order by cms.restaurant_id limit 1`, [W1])).rows[0]!;
      const intent = (await c.query<{ intent_id: string }>(`select intent_id from catalog."Intent_Catalog" limit 1`)).rows[0]!.intent_id;
      await c.query(`insert into gov."Policy_Tier"(policy_id, tier_id, policy_version, tier_cap) values ('pt-d', $1, 'pv-d', 'LOW')`, [r.tier_base]);
      await c.query(`insert into gov."Eval_Cell"(cohort_id, intent, version, released_evals, status) values ($1, $2, 'v1', 'LOW', 'green')`, [r.cohort_id, intent]);
      const res = await proposeNba({ restaurantId: r.restaurant_id, cohortId: r.cohort_id, week: W1 }, undefined, c);

      // §14: no dispatch exists before send
      const pre = await c.query(`select count(*)::int n from gov."Action_Dispatch" where nba_id=$1`, [res.nbaId]);
      expect(pre.rows[0]!.n).toBe(0);

      const d = await dispatchDetail(res.nbaId, tId, exec);
      expect(d!.reach_count).toBeGreaterThanOrEqual(1);
      expect(d!.content.action.length).toBeGreaterThan(0);

      // foreign pool sees nothing
      expect(await dispatchDetail(res.nbaId, "tenant-does-not-exist", exec)).toBeNull();

      const out = await sendDispatch({ tenantId: tId, operatorId: (await firstOperator(c, tId)), nbaId: res.nbaId, resultingLevel: "LOW" }, c);
      expect(out.dispatchId).toBeTruthy();
      const post = await c.query(`select status, decision_trace_id from gov."Action_Dispatch" where nba_id=$1`, [res.nbaId]);
      expect(post.rows[0]!.status).toBe("sent");
      expect(post.rows[0]!.decision_trace_id).toBeTruthy(); // sin trace no acción

      // idempotent: second send rejected (unique nba_id)
      await expect(sendDispatch({ tenantId: tId, operatorId: (await firstOperator(c, tId)), nbaId: res.nbaId, resultingLevel: "LOW" }, c)).rejects.toThrow();
    } finally { await c.query("rollback"); c.release(); }
  });
});

async function firstOperator(c: pg.PoolClient, tId: string): Promise<string> {
  return (await c.query<{ user_id: string }>(`select user_id from gov."User" where tenant_id=$1 and role <> 'ai_agent' order by user_id limit 1`, [tId])).rows[0]!.user_id;
}
```

- [ ] **Step 2: Run → fail**

Run: `pnpm vitest run tests/integration/cockpit_dispatch.test.ts`
Expected: FAIL (dispatchDetail/sendDispatch not exported)

- [ ] **Step 3: Implement in `server/routers/cockpit.ts`** (add after `weekSummary`; reuse `recordRelease`)

```ts
import { renderArtifact } from "../cockpit/renderArtifact.js";

// 02:1a — the dispatch screen read: the released NBA + its reach (cohort restaurants in this pool) + the
// deterministically-rendered artifact. Pool-scoped (foreign pool ⇒ null, no leak). §14: content is rendered
// from PRODUCED fields, never seeded.
export async function dispatchDetail(nbaId: string, tenantId: string, exec: Exec) {
  const p = (await exec<{ nba_id: string; action_type: string | null; cohort_id: string; root_cause: string | null; before_after_expected: unknown; effective_level: "LOW"|"MEDIUM"|"HIGH"|null; label: string | null; playbook: string | null }>(
    `select p.nba_id::text as nba_id, p.action_type, p.cohort_id, p.root_cause, p.before_after_expected,
            m.effective_level::text as effective_level, cat.label, cat.playbook
       from gov."NBA_Proposal" p
       left join catalog."NBA_Catalogo" cat on cat.code = p.action_type
       left join lateral (select effective_level from gov."min_calculation" where nba_id = p.nba_id::text order by computed_at desc limit 1) m on true
      where p.nba_id = $1::uuid
        and exists (select 1 from cohort."Cohort_Membership_Snapshot" cms
                    join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $2
                    where cms.cohort_id = p.cohort_id)`,
    [nbaId, tenantId]))[0];
  if (!p) return null;
  const reach = await exec<{ restaurant_id: string; tier_base: string }>(
    `select r.restaurant_id, r.tier_base::text as tier_base
       from cohort."Cohort_Membership_Snapshot" cms
       join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $2
      where cms.cohort_id = $1 order by r.restaurant_id limit 6`,
    [p.cohort_id, tenantId]);
  const count = (await exec<{ n: number }>(
    `select count(distinct r.restaurant_id)::int as n
       from cohort."Cohort_Membership_Snapshot" cms
       join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $2
      where cms.cohort_id = $1`, [p.cohort_id, tenantId]))[0]?.n ?? 0;
  const art = renderArtifact({ action_type: p.action_type, action_label: p.label, cohort_id: p.cohort_id, root_cause: p.root_cause, before_after_expected: p.before_after_expected, playbook: p.playbook });
  return { nba_id: p.nba_id, action_type: p.action_type, action_label: p.label, cohort_id: p.cohort_id, effective_level: p.effective_level, reach_count: count, reach_preview: reach, artifact_kind: art.artifact_kind, content: art.content };
}

// 02:1a — Send: the release (Release_Batch + Decision_Trace, reusing recordRelease) AND the Action_Dispatch
// row in ONE tx. Trace failure ⇒ nothing persists. Unique nba_id ⇒ no double dispatch.
export async function sendDispatch(i: ReleaseInput, client: pg.PoolClient): Promise<{ dispatchId: string; traceId: string }> {
  const rel = await recordRelease({ ...i, action: "RELEASE" }, client);
  const d = (await client.query<{ nba_id: string; action_type: string | null; cohort_id: string; root_cause: string | null; before_after_expected: unknown; label: string | null; playbook: string | null }>(
    `select p.nba_id::text as nba_id, p.action_type, p.cohort_id, p.root_cause, p.before_after_expected, cat.label, cat.playbook
       from gov."NBA_Proposal" p left join catalog."NBA_Catalogo" cat on cat.code = p.action_type where p.nba_id=$1::uuid`, [i.nbaId])).rows[0]!;
  const count = (await client.query<{ n: number }>(
    `select count(distinct r.restaurant_id)::int n from cohort."Cohort_Membership_Snapshot" cms
      join tenant."Restaurant" r on r.restaurant_id=cms.restaurant_id and r.tenant_id=$2
      where cms.cohort_id=$1`, [d.cohort_id, i.tenantId])).rows[0]!.n;
  const art = renderArtifact({ action_type: d.action_type, action_label: d.label, cohort_id: d.cohort_id, root_cause: d.root_cause, before_after_expected: d.before_after_expected, playbook: d.playbook });
  const ins = await client.query<{ dispatch_id: string }>(
    `insert into gov."Action_Dispatch"(nba_id, cohort_id, tenant_id, artifact_kind, content, target_count, status, decision_trace_id)
     values ($1,$2,$3,$4,$5::jsonb,$6,'sent',$7) returning dispatch_id::text as dispatch_id`,
    [i.nbaId, d.cohort_id, i.tenantId, art.artifact_kind, JSON.stringify(art.content), count, rel.traceId]);
  return { dispatchId: ins.rows[0]!.dispatch_id, traceId: rel.traceId };
}
```

Add to `cockpitRouter`:
```ts
  dispatchDetail: tenantProcedure.input(z.object({ nba_id: z.string().min(1) })).query(({ ctx, input }) => dispatchDetail(input.nba_id, ctx.tenantId, query)),
  sendDispatch: tenantProcedure.input(cockpitSendDispatchInput).mutation(({ ctx, input }) =>
    withTx((client) => sendDispatch({ tenantId: ctx.tenantId, operatorId: ctx.userId, nbaId: input.nba_id, resultingLevel: input.resulting_level }, client))),
```
(import `z`, `cockpitSendDispatchInput` at top of file.)

- [ ] **Step 4: Run → pass**

Run: `pnpm vitest run tests/integration/cockpit_dispatch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/routers/cockpit.ts tests/integration/cockpit_dispatch.test.ts
git commit -m "feat(p02:1a): cockpit.dispatchDetail + sendDispatch (atomic release+dispatch, §14)"
```

---

## Task 5: Dispatch screen + route

**Files:** Create `client/src/pages/DispatchPage.tsx`, `client/src/features/cockpit/artifactKind.ts`; Modify `client/src/App.tsx`; Test `client/src/pages/DispatchPage.test.tsx`

- [ ] **Step 1: artifactKind label map**

```ts
// display-only labels for the dispatch artifact kinds (server decides the kind).
export const ARTIFACT_KIND_LABEL: Record<string, string> = {
  email_offer: "Email offer", price_rec: "Price recommendation", ops_memo: "Ops memo",
  ops_ticket: "Ops ticket", growth_brief: "Growth brief", risk_escalation: "Risk escalation",
};
```

- [ ] **Step 2: Failing test for the page (loading + reach + send button)**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DispatchView } from "./DispatchPage";

const detail = { nba_id: "n1", action_type: "A3", action_label: "Propose promo/bonus", cohort_id: "long_tail · 0-3m",
  effective_level: "LOW" as const, reach_count: 17, reach_preview: [{ restaurant_id: "R1", tier_base: "long_tail" }],
  artifact_kind: "email_offer", content: { action: "Propose promo/bonus", cohort: "long_tail · 0-3m", root: "x", path: "price_pctile: 82 → 60", how: "human releases the money" } };

describe("02:1a DispatchView", () => {
  it("shows reach + artifact + a single Send primary", () => {
    render(<DispatchView detail={detail} sending={false} onSend={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/Reaches/)).toHaveTextContent("17");
    expect(screen.getByText(/Email offer/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send to all 17/ })).toBeInTheDocument();
  });
  it("Send fires onSend", () => {
    const onSend = vi.fn();
    render(<DispatchView detail={detail} sending={false} onSend={onSend} onCancel={() => {}} />);
    screen.getByRole("button", { name: /Send to all 17/ }).click();
    expect(onSend).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run → fail**

Run: `pnpm vitest run client/src/pages/DispatchPage.test.tsx` → Expected: FAIL

- [ ] **Step 4: Implement `DispatchPage.tsx`** (split `DispatchView` presentational + page wires trpc)

```tsx
import { useLocation, useRoute, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { LoadingState, ErrorState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useDevLogin } from "@/features/cockpit/useDevLogin";
import { ARTIFACT_KIND_LABEL } from "@/features/cockpit/artifactKind";
import type { CockpitDispatchDetail } from "@shared/contracts";

export function DispatchView({ detail, sending, onSend, onCancel }: { detail: CockpitDispatchDetail; sending: boolean; onSend: () => void; onCancel: () => void }) {
  const kind = ARTIFACT_KIND_LABEL[detail.artifact_kind] ?? detail.artifact_kind;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-mxm-content-tertiary">Releasing</p>
        <h1 className="text-2xl font-semibold text-mxm-content">{detail.action_label ?? detail.action_type ?? "—"}</h1>
        <p className="text-sm text-mxm-content-secondary">cohort {detail.cohort_id} · {detail.content.path}</p>
      </div>
      <section className="rounded-mxm border border-mxm-border bg-mxm-bg-elevated p-[clamp(1rem,2vw,1.4rem)]">
        <p className="text-sm text-mxm-content">Reaches <b className="tabnum">{detail.reach_count}</b> restaurants in this cohort</p>
        <ul className="mt-2 flex flex-wrap gap-2 text-xs text-mxm-content-tertiary">
          {detail.reach_preview.map((r) => (<li key={r.restaurant_id} className="rounded-full border border-mxm-border px-2 py-0.5">{r.restaurant_id} · {r.tier_base}</li>))}
          {detail.reach_count > detail.reach_preview.length && <li className="px-1">and {detail.reach_count - detail.reach_preview.length} more</li>}
        </ul>
      </section>
      <section className="rounded-mxm border border-mxm-border bg-mxm-bg-elevated p-[clamp(1rem,2vw,1.4rem)]">
        <p className="text-xs uppercase tracking-wide text-mxm-content-tertiary">The artifact · {kind} <span className="ml-1 text-mxm-content-tertiary">draft</span></p>
        <dl className="mt-2 space-y-1 text-sm">
          <div><dt className="inline text-mxm-content-secondary">Root: </dt><dd className="inline text-mxm-content">{detail.content.root}</dd></div>
          <div><dt className="inline text-mxm-content-secondary">How: </dt><dd className="inline text-mxm-content">{detail.content.how}</dd></div>
        </dl>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onSend} disabled={sending} aria-busy={sending}>{sending ? "Sending…" : `Send to all ${detail.reach_count} restaurants`}</Button>
        <Button variant="ghost" disabled title="Experiment — coming soon">Experiment ▸</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export function DispatchPage() {
  const ready = useDevLogin();
  const [, params] = useRoute("/cockpit/dispatch/:nbaId");
  const [, setLocation] = useLocation();
  const nbaId = params?.nbaId ?? "";
  const q = trpc.cockpit.dispatchDetail.useQuery({ nba_id: nbaId }, { enabled: ready && nbaId.length > 0 });
  const send = trpc.cockpit.sendDispatch.useMutation();
  const onSend = () => {
    const lvl = q.data?.effective_level ?? "LOW";
    send.mutate({ nba_id: nbaId, resulting_level: lvl }, { onSuccess: () => setLocation("/cockpit") });
  };
  return (
    <main className="mx-auto max-w-screen-md p-[clamp(1rem,2.5vw,2.25rem)]">
      <Link href="/cockpit" className="text-sm text-mxm-brand hover:underline">← Back to cockpit</Link>
      <div className="mt-4">
        {!ready || q.isLoading ? <LoadingState label="Loading dispatch…" />
          : q.isError || !q.data ? <ErrorState />
          : <DispatchView detail={q.data} sending={send.isPending} onSend={onSend} onCancel={() => setLocation("/cockpit")} />}
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Register route in `client/src/App.tsx`** (before `/cockpit`)

```tsx
import { DispatchPage } from "@/pages/DispatchPage";
// ...
<Route path="/cockpit/dispatch/:nbaId" component={DispatchPage} />
```

- [ ] **Step 6: Run → pass + typecheck**

Run: `pnpm vitest run client/src/pages/DispatchPage.test.tsx && pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/DispatchPage.tsx client/src/features/cockpit/artifactKind.ts client/src/App.tsx
git commit -m "feat(p02:1a): /cockpit/dispatch/:nbaId screen — reach + artifact + Send"
```

---

## Task 6: Wire Release → navigate (Pause unchanged)

**Files:** Modify `client/src/pages/CockpitPage.tsx`

- [ ] **Step 1: Change the RELEASE handler to navigate**

In `CockpitPage`, import `useLocation` from wouter; in `onAction`, branch:
```tsx
const [, setLocation] = useLocation();
const onAction = (row: NbaCockpitRow, action: RowAction) => {
  if (action === "RELEASE") { setLocation(`/cockpit/dispatch/${row.nba_id}`); return; }
  // PAUSE keeps the inline mutation (unchanged below)
  const resulting_level = "LOW";
  setActionState((s) => ({ ...s, [row.nba_id]: { status: "pending" } }));
  release.mutate({ nba_id: row.nba_id, action, resulting_level }, { /* existing onSuccess/onError */ });
};
```

- [ ] **Step 2: Update the cockpit test** so RELEASE asserts navigation (not mutation). In `CockpitBoard.test.tsx`, the "Release fires onAction(row, RELEASE)" test still holds (onAction is injected) — no change. Add/adjust a `CockpitPage`-level note only if a page test exists (none today). Run the suite.

Run: `pnpm vitest run client/src/features/cockpit` → Expected: PASS (18)

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/CockpitPage.tsx
git commit -m "feat(p02:1a): Release navigates to the dispatch screen (Pause stays inline)"
```

---

## Task 7: Full gate + PR

- [ ] **Step 1: Gate with evidence**

Run: `pnpm typecheck && pnpm lint && pnpm build && pnpm vitest run server/cockpit client/src/features/cockpit client/src/pages/DispatchPage.test.tsx tests/integration/cockpit_dispatch.test.ts`
Expected: all green.

- [ ] **Step 2: Live verify** (preflight per playbook; seed; screenshot the dispatch flow)

`pnpm db:reset && pnpm db:p01 && pnpm db:p02`; dev server; Playwright: cockpit → Release → dispatch screen shows reach + artifact → Send → back to cockpit, "you released" ticks.

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin <branch>
gh pr create --title "feat(p02:1a): Cockpit Release → Artifact Dispatch" --body "<summary + spec link + deviation note (deterministic render, not LLM)>"
```

---

## Self-review

- **Spec coverage:** Release→navigate (T6) ✓; dispatch screen reach+artifact+Send (T5) ✓; new Action_Dispatch entity (T1) ✓; atomic write reusing recordRelease (T4) ✓; deterministic render not LLM (T2, deviation noted) ✓; §14 anti-fake test (T4) ✓; experiment placeholder disabled (T5) ✓; rename Generated_Artifact→Generated_Analysis = OUT of scope (sequenced) — not in plan, by design.
- **Placeholders:** none — code shown for every code step.
- **Type consistency:** `dispatchDetail`/`sendDispatch` signatures match between contract (T3), server (T4), and client (T5); `ReleaseInput` reused from existing cockpit.ts; `ARTIFACT_KIND` keys (T2) ↔ `ARTIFACT_KIND_LABEL` (T5) cover the same kinds.
