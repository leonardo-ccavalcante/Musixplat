# Deploy & database migrations

Prod runs on **Railway** (Nixpacks: `pnpm install` → `pnpm build` → `pnpm start`).
`railway.json` adds a `deploy.preDeployCommand` that applies pending DB migrations **before each
release goes live**. A failing migration aborts the deploy (fail-closed — no half-applied schema,
no broken release).

## How migrations are tracked

`scripts/apply-migrations.ts` records every applied file in `public._schema_migrations`. On each run
it applies **only files not yet recorded** (idempotent — safe to re-run every deploy). Each migration
runs in its own transaction. Apply order = lexical filename order (every file is timestamp-prefixed).

- `pnpm db:migrate` — apply pending migrations (this is the preDeployCommand, compiled to
  `dist/server/scripts/apply-migrations.js` for prod; CI runs it via `tsx`).
- `pnpm db:migrate -- --baseline` — record ALL current files as applied **without running them**
  (one-time adoption on a DB whose schema predates the tracking table).

## One-time adoption on an existing prod DB (do this ONCE, in this exact order)

The tracking table does not exist on a DB created before this change, so the **order matters** — get
it wrong and a missing migration gets silently marked "applied" and never runs.

1. **Apply any genuinely-missing migration manually, FIRST.** As of this change prod is missing
   `supabase/migrations/20260620000010_fn_generate_business_base.sql` (it is `create or replace`, so
   safe to run):
   ```bash
   railway run node -e "const{Pool}=require('pg'),fs=require('fs');new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}).query(fs.readFileSync('supabase/migrations/20260620000010_fn_generate_business_base.sql','utf8')).then(()=>console.log('applied')).catch(e=>{console.error(e);process.exit(1)})"
   ```
2. **Then baseline**, so the runner won't try to re-run the already-present (non-idempotent) DDL:
   ```bash
   railway run pnpm db:migrate -- --baseline
   ```
3. Merge this PR. From now on every deploy auto-applies only genuinely-new migration files.

> ⚠️ If you baseline **before** step 1, the missing migration is recorded as applied but never runs —
> the original `function ... does not exist` error stays. Step 1 before step 2, always.

If you are unsure which migrations prod is missing, baseline only marks files as applied; it does not
verify the schema. Spot-check the most recent migrations against prod before baselining.

## CI

CI runs `pnpm db:migrate` against a fresh postgres service each run — empty tracking table → all
migrations apply once. Behaviour is unchanged by this tracking (just additive bookkeeping).
