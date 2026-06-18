# Musixmatch Customer-Ops

**The product is AI-first, but the core is deterministic.** The LLM proposes text and judgment; code owns tenant boundaries, math, autonomy, money gates, and every number shown on screen. **So what:** the platform is only safe if the deterministic spine is boring, testable, and hard to bypass.

This repo is the deployable spine of the full Customer-Ops system described in `specs/spec_ready/`: cohorts, NBA playbooks, goals/KPIs, atendimento, diagnostico, knowledge generation, and the health dashboard.

Reference map:

- Operating guide: `CLAUDE.md`
- Full product specs: `specs/spec_ready/`
- Data model: `specs/spec_ready/04_arquitectura_de_datos.md`
- Human product map: `specs/breakdown_HUMANO.md`
- Build docs: `specs/build_docs/`

## What Matters

Three rules organize the code:

1. **Code computes; LLM never invents numbers.** Cohorts, percentiles, deltas, baselines, money state, and gates come from SQL/TypeScript producers.
2. **Tenant safety is server-side.** The client never gets to choose `tenant_id`; cross-pool access aborts and is logged.
3. **No producer, no result.** Seed data is raw only. Result fields stay `NULL`/empty until the named producer runs.

## Product Map

The platform is one chain, not one screen:

- **01 · Cohorts Explorer:** prioritize restaurants by cohort movement and operational gap.
- **02 · NBA Playbooks:** turn priority into a best-action proposal with autonomy and money gates.
- **03 · Goals / KPIs:** bind strategy to measurable goals and named queries.
- **05A · Atendimiento:** answer restaurants with integrated context and min() autonomy.
- **05B · Diagnostico:** find root cause and affected-silent restaurants.
- **05C · Knowledge Generation:** turn diagnosis into reusable artifacts.
- **05DE · Health Dashboard:** read-only system health and governance view.

**So what:** every slice must preserve the same hard rules: deterministic measurement, tenant safety, anti-fake data, version sealing, and fail-closed behavior.

## Cohorts Explorer

Cohorts is the first operational chain in the platform:

```text
raw tenant data
  -> P01 deterministic batch
  -> Cohorts Explorer read-only UI
  -> one idempotent handoff to NBA
```

What is inside:

- **P01 producers:** cohort assignment, ranking, n_min, k-anon, baselines, upside, deltas, movement log, and version sealing.
- **Cohorts UI:** semaphore, top-vs-base, delta panel, money signal, ticket intent counts, drilldown, changelog, and modal.
- **Sandbox:** ephemeral re-segmentation inside a rollback transaction; it does not persist cohort or NBA output.
- **Handoff:** emits exactly one prioritized NBA event, with tenant resolved from the session.

## Anti-Fake Rule

The seed populates only raw facts. It must not seed computed outcomes.

`pnpm test:antifake` enforces this: after seed and before producers, result columns must still be empty. **So what:** a green dashboard cannot be created by fixture data pretending to be production logic.

## Stack

Vite 7 · React 19 · wouter · tRPC v11 · Express · Zod v3 · TanStack Query v5 · Zustand v5 · Tailwind · Supabase Postgres · Vitest · pgTAP · Playwright + axe.

UI is dark-only, token-based (`--mxm-*`), and checked for WCAG 2.1 AA.

## Run Locally

```bash
pnpm install
pnpm db:start
pnpm db:reset
pnpm db:p01
pnpm dev
```

Local ports are intentionally non-default:

- Client: `5173`
- Server: `3000`
- Supabase API: `54521`
- Supabase DB: `54522`
- Supabase Studio: `54523`

If Supabase healthchecks flap under load:

```bash
pnpm exec supabase start --ignore-health-check
```

## Test Gate

Run the fast checks first:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Run DB and browser gates before a PR:

```bash
pnpm test:sql
pnpm test:antifake
pnpm test:integration
pnpm db:p01
pnpm test:e2e
```

Notes:

- `test:sql` resets the local DB, then runs pgTAP.
- `test:integration` runs DB-backed tests serially to avoid shared local DB contention.
- `test:e2e` expects cohort data, so run `pnpm db:p01` after a fresh reset.

## Deploy

GitHub:

```bash
git remote add origin <url>
git push -u origin main
```

Supabase hosted:

```bash
pnpm exec supabase link --project-ref <ref>
pnpm db:push
```

Put only env var names in committed files. Real values stay outside the repo; use `.env.example` as the checklist.

## Boundaries

- Do not seed result numbers.
- Do not let client input set tenant identity.
- Do not mix `cohort_rule_version`.
- Do not auto-release financial actions.
- Do not use LLMs for deterministic measurement.

Small rule, big consequence: **if the system is unsure, it fails closed.**
