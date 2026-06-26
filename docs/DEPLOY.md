# Deploy & database

Prod runs on **Railway** (Nixpacks: `pnpm install` → `pnpm build` → `pnpm start`). `railway.json` sets a
`deploy.preDeployCommand` that runs **before each release goes live** and is **idempotent + fail-closed**
(any error aborts the deploy — no half-applied release):

```
preDeployCommand: node dist/server/scripts/apply-hosted.js
```

`apply-hosted` does two things on every deploy:
1. **Applies pending migrations** via the tracked `public._schema_migrations` ledger (same mechanism as
   `pnpm db:migrate`) — only files not yet recorded run, each in its own transaction.
2. **Seeds ONLY a fresh DB.** If `gov.User` is empty (a brand-new project), it runs `supabase/seed.sql`
   (config knobs + catalog + users incl. `U-OP-001` + the 5000-restaurant base, anchored to **today** via
   `fn_demo_ref()` so the board never ages) and the P01/P02 producers — so a fresh deploy comes up
   **populated AND logged-in** (Cohorts / Cockpit / Observatory). An already-bootstrapped DB **skips** the
   seed entirely, so re-deploys never re-seed or wipe operator data.

## First deploy on a fresh project (do once)

1. **Set the Railway service Variables** (Railway dashboard → Variables):
   - `JWT_SECRET` — a long random value
   - `DATABASE_URL` — the Postgres connection (Supabase session-pooler URL)
   - `OPENAI_API_KEY` — required (embeddings + chat); the app boot refuses production without it
   - `DEMO_LOGIN=1` — **required for the public demo**: without it, `/auth/dev-login` returns 404 in
     production and every screen is blank (there is no other auth path yet).
     **⚠️ Security:** with it set, ANY visitor gets a senior-manager session (write access — uploadConfig,
     autonomy controls). Use only on a disposable demo DB, never on a deploy holding real data.
2. **Deploy** (push to the connected branch). The `preDeployCommand` auto-applies migrations and, on a
   fresh DB, seeds + runs P01/P02.
3. **Open the app.** Login is automatic (DEMO_LOGIN). Cohorts, Cockpit and Observatory already show real
   data. **Diagnosis / Cost / Knowledge / Health** authenticate immediately and fill on the first in-app
   **"Run flow"** (the POOL-PAY diagnosis scenario is intentionally not staged at deploy time).

## Adopting an EXISTING prod DB that predates migration tracking (one-time, exact order)

If the DB was created before `_schema_migrations` existed, **order matters** — baseline before applying a
genuinely-missing migration and that migration is silently marked "applied" and never runs.

1. Apply any genuinely-missing migration manually FIRST (use the Supabase SQL Editor — paste the file).
2. Then baseline so the runner won't re-run already-present (non-idempotent) DDL:
   ```bash
   railway run pnpm db:migrate -- --baseline
   ```
3. From then on every deploy auto-applies only genuinely-new migrations.

> Baseline only marks files as applied; it does not verify the schema. Spot-check recent migrations
> against prod before baselining.

## CI

CI runs `pnpm db:migrate` (the tracked runner) against a fresh Postgres service each run — empty ledger
→ all migrations apply once. `apply-hosted` reuses that same `migrate()`, so CI and prod share one
migration mechanism.
