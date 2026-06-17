# Musixmatch Customer-Ops — Slice 01 (Cohorts Explorer)

AI-first Customer-Ops platform (Uber Eats domain). This repo implements **Screen 01 ·
Cohorts Explorer** end-to-end per `CLAUDE.md` (the canonical operating guide) and the specs in
`specs/`. Build doc: `specs/build_docs/01_cohorts.md` · data model: `specs/spec_ready/04_*.md`.

## What's here (slice 01 — 29 CÓDIGO pieces)

Deterministic P01 batch (math in SQL, never LLM) → read-only screen → one mutant handoff to NBA.

- **Producers (SQL, §14 NULL-pre-run):** `F-1.1` cell/subgroup assignment · `F-1.2` percentil +
  gap + baselines · `F-1.3` n_min gate · `F-1.3b` k-anon gate · `F-1.4` P90+ baseline ·
  `F-1.7` UPSIDE projection · `F-1.8` KPI baseline · `F-2.2` delta diff · `F-2.6` movement log ·
  `F-5.3` weekly snapshot · `F-5.4` n_cohort_x_intent · `F-5.5` scope_owner_ref · `F-4.3` anti-mezcla.
- **Handoff `F-5.2`:** emits exactly one `Evento_Priorizado_NBA` (+ `Evento_Uso`), idempotent,
  `tenant_id` resolved server-side, cross-pool blocked + logged. Payload matches `02:1A`.
- **UI:** semáforo (`F-2.1`), delta panel at_risk-first (`F-2.3`), top-vs-base (`F-1.6`),
  money (`F-3.1/3.2`), tickets (`F-3.3/3.4`), changelog (`F-4.2`), drill (`F-5.1`), modal (`F-4.1`).
- **Sandbox `EPIC-6` / `F-6.1-6.3`:** ephemeral, read-only, no-commit re-segmentation.

### The §14 anti-fake invariant (the heart)

The seed populates **only brutos**. Every RESULT (percentil, gap, baselines, n_cuentas,
delta_status, suppression, …) is `NULL`/empty until its named producer runs. `pnpm test:antifake`
fails the build if any result is non-NULL post-seed. The 47/k-anon/n_min/delta numbers **emerge
from the P01 run**, never the seed.

## Stack

Vite 7 · React 19 + wouter · tRPC v11 + Express · Zod v3 · TanStack Query v5 · Zustand v5 ·
XState v5 · Tailwind + `--mxm-*` tokens (dark-only, WCAG 2.1 AA) · Supabase Postgres ·
Vitest · pgTAP · Playwright + axe.

## Run locally

```bash
pnpm install
pnpm db:start          # supabase local (docker). If healthcheck flaps under load:
                       #   pnpm exec supabase start --ignore-health-check
pnpm db:reset          # apply migrations + seed (brutos only)
pnpm db:p01            # run the P01 batch → results emerge (cohorts, percentil, deltas)
pnpm dev               # client :5173  +  server :3000
```

## Test gate (CLAUDE.md §1)

```bash
pnpm lint && pnpm typecheck
pnpm test              # unit + React component
pnpm test:antifake     # §14 NULL-pre-run gate
pnpm test:sql          # pgTAP (determinism + k-anon/n_min boundaries + anti-mezcla)
pnpm test:integration  # P01 producers + handoff + sandbox (RLS, idempotency, cross-pool)
pnpm test:e2e          # Playwright + axe (a11y WCAG 2.1 AA)
```

## Deploy

- **GitHub:** `git remote add origin <url> && git push -u origin main` (CI gate in `.github/workflows/ci.yml`).
- **Supabase (hosted, EU):** put the project ref + access token / DB password in `.env`
  (see `.env.example` — names only, never values), then `pnpm exec supabase link --project-ref <ref>`
  and `pnpm db:push`.

## Notes

- Local supabase runs on non-default ports (`54521/54522/54523`) to coexist with another project.
- `server/pieces/` contains a PII piece for **screen 05A** authored outside this slice — left
  intact, excluded from this slice's lint scope.
