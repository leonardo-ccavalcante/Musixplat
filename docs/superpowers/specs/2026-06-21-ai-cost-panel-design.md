# AI Cost panel — design (P07 read surface)

Approved by Leo 2026-06-21. Read-only surface over `gov.v_llm_cost` (built in commit 3e623e6).
Every number is SQL (§3.6); unpriced model ⇒ NULL cost shown honestly, never $0 (§3.7).

## Goal
Let the operator SEE token cost: total, per process, per ticket ("custo da atención"). Two surfaces:
1. **Standalone page `/cost`** (nav "AI Cost") — the whole picture.
2. **Embedded in the diagnosis dossier** — the cost of THIS ticket (ref_id = problem_id).

## Backend — `server/routers/cost.ts` (register in `_app.ts` as `cost`)
- `summary` (tenantProcedure.query): reads `gov.v_llm_cost where tenant_id`, returns
  - `total`: { costUsd, inTok, outTok, calls }
  - `byProcess[]`: { processType, costUsd, calls, inTok, outTok } (group by process_type)
  - `byTicket[]`: top 20 by cost, { refId, processType, costUsd, calls } (ref_id not null)
  - `unpriced`: { calls, models[] } — rows where cost_usd is null (honest gap, §3.7)
- `ticket` (tenantProcedure.input({refId}).query): one ticket's { costUsd, calls, byProcess[] } — for the dossier embed.
- Zod contracts in `shared/contracts_cost.ts`.

## Frontend
- `client/src/pages/CostPage.tsx`: total (big stat) + by-process table + top-tickets table + amber banner only if unpriced > 0. Mirrors HealthPage (dev-login, `--mxm-*`, LoadingState/ErrorState, `Stat`).
- Route `/cost` + nav link "AI Cost" in `App.tsx`.
- `TicketCost` (small inline block) in the diagnosis dossier: "AI cost for this ticket: $X (N calls)".

## Out of scope (YAGNI)
Date filter; charts; per-user breakdown; budgets/alerts. Add later if needed.

## Tests
- Pure helpers `formatUsd`/`formatTokens` — vitest (TDD).
- Aggregation SQL — verified vs real PG (rolled back), like the cost view.
- Router/integration — runs on CI (`supabase db reset`); local DB is stale.
- UI — typecheck/lint + visual check.
