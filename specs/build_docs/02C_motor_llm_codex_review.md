# 02C MOTOR-LLM — Codex adversarial review (vs origin/main)

> Run: `~/.local/bin/codex review --base origin/main` on branch `feat/p02-motor-llm`. Verdict: production-blocking config/authz/fail-closed/audit-atomicity defects; the ≤3 falsification loop is unreachable with the real provider; the controls don't manipulate the runtime action identifiers. 9×P1 + 5×P2.

## P1 (production-blocking)

1. **Knobs via migration, not just seed.sql** — `supabase/seed.sql:198`. Hosted upgrades run migrations but NOT `seed.sql`, so existing DBs never get the motor knobs → every `runMotorAttempt` fails at `knob_required_num`. → add an idempotent migration. **[GENUINE — fix]**
2. **Authorize control writes by role** — `server/routers/motor.ts:28`. `tenantProcedure` only checks auth+tenant; any role can change knobs/policy/approvals. → require the governance role. **[GENUINE — fix]**
3. **Scope tier UPDATE to caller's policy** — `server/motor/controls.ts:45`. `where tier_id=$1` updates every pool's policy for that tier. → scope to a policy signed within `tenantId`. **[GENUINE — the multi-tenant gap I flagged; fix]**
4. **validateHypothesis against caller's signed policy** — `server/motor/validateHypothesis.ts:29`. Reads the lexicographically-latest GLOBAL policy without tenant scoping → a cross-pool `allowed_today` can authorize; autoDispatch checks in-pool signer but not that policy's allowed_today. → thread tenantId + scope the read. **[GENUINE — fix]**
5. **Controls use real NBA action codes** — `client/src/features/cockpit/AutonomyControls.tsx:17`. UI writes invented names (`menu_nudge`) but the runtime whitelist compares `A1/A4/A6` → the UI can't edit the actions the motor evaluates. **[GENUINE — fixture-reality leaked into UI; fix]**
6. **Commit dispatch + learning atomically** — `server/motor/runMotor.ts:78`. autoDispatch commits in one tx, writeMotorCase in a separate tx → action sent without its learning record if the 2nd fails; catch can misclassify an already-sent action as `dispatch_failed`. → one tx. **[GENUINE — fix]**
7. **Escalate provider failures (fail-closed)** — `server/motor/runMotor.ts:47`. An LLM/JSON throw escapes the attempt and aborts the whole cohort/pool run with no escalated case. → try/catch → escalate('provider_failed'). **[GENUINE — §7; fix]**
8. **Reject non-finite LLM confidence (NaN bypass)** — `server/motor/llmReasoning.ts:49`. `Number(missing)`→NaN; `NaN < minConf` is false → bypasses the confidence floor. → fail-closed to null on non-finite. **[GENUINE — §7; fix]**
9. **Make SQL-falsification reachable** — `server/motor/llmReasoning.ts:25`. The real provider only sees `below/above` problems → validateHypothesis.confirmed is always true → the falsify-and-retry branch + ≤3 loop are UNREACHABLE in production (only fabrication/null → immediate escalate). → feed ALL verdicts, map-back from all, let SQL falsify an 'ok' pick. **[GENUINE — deepest finding; the ≤3 loop Leo wants degenerates to 1 iter; fix]**

## P2

1. **Bound knob values at the API** — `shared/contracts.ts:309`. Arbitrary strings → `motor_max_loops` huge/negative, confidence outside 0–1 → disable motor / bypass floor / excessive paid calls. → validate ranges. **[GENUINE — fix]**
2. **Named thresholds for candidate selection** — `server/motor/runMotorFanout.ts:15`. The `PROBLEM` prefilter (m_connection<0.55) disagrees with `nba_connection_min_ratio`=0.80 → skips 0.55–0.80 breaches. **[INHERITED from the floor's `proposeAndAutoActForCohort` (same constant); the authoritative gate is fn_nba_test. Defer — aligning the prefilter is a floor-touching change; flag as follow-up, don't silently diverge from the floor §3.11.]**
3. **Grounding includes resolution + discarded** — `server/motor/learn.ts:48`. readGrounding omits `resolution` (what worked) + `discarded_branches` → the LLM can't replicate/prune the approved learning. → include them. **[GENUINE — fix]**
4. **EscalatedList reads `action_code`** — `client/src/features/cockpit/EscalatedList.tsx:31`. discarded items are `{action_code, reason}` but the renderer looks for `hypothesis`/`branch` → the reasoning trail is hidden. → render action_code+reason. **[GENUINE — fix]**
5. **Render motor mutation failures** — `client/src/pages/CockpitPage.tsx:67`. Only success handled; on failure busy vanishes with no error, stale success persists. → onError + error state. **[GENUINE — fix]**

## Triage summary
- **Fix now (12):** all 9 P1 + P2-1/3/4/5.
- **Defer w/ rationale (1):** P2-2 (inherited floor prefilter; the named-threshold gate is fn_nba_test; aligning the prefilter touches the floor — separate follow-up).
- **Pattern:** the tenant-scoping class (P1-3/4) is the SAME class Codex caught in CP2 (I flagged it but didn't fully enforce) → the shared tenant-scoping primitive is overdue. The fail-closed gaps (P1-7/8) + loop-unreachability (P1-9) are the deepest — the green gate + self-review missed all of them.
