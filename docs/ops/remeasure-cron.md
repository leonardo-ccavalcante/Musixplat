# Re-measurement cron — closing the learning loop (05D Part D)

**What it does.** Re-runs the *same deterministic signal* a window later on every acted-but-unverified
`Knowledge_Case`, and stamps the 3-valued `verification_status` (`verified_fixed` / `verified_reopened` /
`unmeasurable`). `verification_status` is the **only `[V]` field** (§14) and is written **only** by this job.
A `verified_fixed` is what **activates precedent-first reuse + LLM grounding** (`readGrounding` reads
`reviewed=true OR verification_status='verified_fixed'`) — i.e. it is the trigger that turns the
self-improving loop from *built* into *running*.

**Why a cron.** The verdict is gated by **data-time, not wall-clock**: a case whose verify-window
(`acted_week + resolution_verify_window`, a named knob, seeded `1` week) has no snapshot yet returns
`no_data → unmeasurable` and is **re-queued** for the next run. So the job is safe to run on a fixed
cadence — it only ever acts on cases whose window has actually elapsed in the data.

**Safety (why it can run unattended).** Pure deterministic re-measurement — **no money, no LLM, no
crafted number** (the verdict is whatever `fn_nba_test_all` measures, §14). Tenant-scoped (§3.4),
baseline-pinned (§3.5 — never re-measures a v0 fix against v1 standards), and **idempotent** (only flips
rows still `unverified`; a verified row is never re-touched). The §59 carve-outs (non-attributable
signals, confounded overlapping actions) route to a human instead of auto-verifying.

## Run it

| Where | Command |
|---|---|
| Local / dev | `pnpm db:remeasure` |
| Prod (Railway cron service) | `node dist/server/scripts/run-remeasure.js` |
| On-demand (operator) | Observatory → **Learning → "Re-measure now"** (calls `motor.verifyResolutions`) |

## Schedule it on Railway (GUI)

The cadence lives in the deploy, not the code. In the Railway dashboard:

1. Add a **Cron** service to the project (or a scheduled job on the existing service).
2. **Command:** `node dist/server/scripts/run-remeasure.js`
3. **Schedule (cron expr):** weekly is the natural cadence — it matches `resolution_verify_window=1`
   (week). Example: `0 6 * * 1` (Mondays 06:00 UTC). A more frequent schedule is harmless (idempotent,
   data-time gated) but mostly logs `unmeasurable` until a window elapses.
4. Ensure `DATABASE_URL` is set for the service (same as the app).

The job logs one line per run, e.g.:

```
remeasure: 1 tenant(s) · verified_fixed=2 reopened=1 unmeasurable=5 skipped(non_attributable=0, confounded=1)
```

> No pg_cron / n8n is used — the repo's job pattern is `scripts/run-*.ts` invoked by the deploy
> scheduler, mirroring `db:p01` / `db:p02`. Keeping the cadence in Railway keeps the logic pure and the
> schedule operator-controlled.
