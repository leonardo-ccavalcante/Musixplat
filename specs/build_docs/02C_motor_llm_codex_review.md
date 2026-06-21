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

---

# Round 2 (re-Codex, after the round-1 fixes) — 7 P1 + 4 P2

The round-1 fixes passed their tests but re-Codex found deeper SEMANTIC/governance violations:

## P1
1. **LLM confidence gates autonomy (§2 violation)** — `runMotor.ts:52`. The model's numeric `confidence < minConf` decides act-vs-escalate ⇒ an LLM NUMBER authorizes autonomy (deterministic-never-LLM). **[GENUINE — fix: drop the numeric gate; the LLM ABSTAINS via lever=null (TEXT/categorical "no-suppose"), confidence becomes [C] display-only. §2-compliant + faithful to "devem dizer".]**
2. **Lexical policy-version ordering** — `validateHypothesis.ts:31`. `order by policy_version desc` ⇒ v9 > v10 (the floor's loadArms warned about exactly this). A removed action on the newer policy stays authorized. **[GENUINE — fix: resolve current/semantic version or fail-closed on ambiguity.]**
3. **Controls rewrite signed policy history** — `controls.ts:56`. The UPDATE mutates a signed policy referenced by historical Decision_Traces ⇒ traces no longer identify the policy that authorized them. **[GENUINE — fix: write a NEW signed policy version, never mutate signed history.]**
4. **Stale-cohort anti-mezcla (§3.5)** — `runMotorFanout.ts:51`. `motor.run(cohortId)` never checks `cohort_rule_version_current`; a historical cohort mixes current-version signals onto an old cohort. **[GENUINE — fix: reject non-current cohorts in fan-out.]**
5. **Dispatch marked as measured 'resolved' (§14)** — `runMotor.ts:80`. A successful SEND writes `Knowledge_Case.outcome='resolved'`, but 'resolved' is a MEASURED outcome — nothing was measured. readGrounding then teaches it as "worked". **[GENUINE — fix: acted ⇒ outcome=NULL (pending measurement) + action in path_used; only a measurement producer sets resolved/not_resolved.]**
6. **Loop cap 3 not enforced** — `contracts.ts:321`. The Zod bound allows motor_max_loops up to 10 while the contract/UI promise ≤3 and the code reports 'exhausted_3_loops' — up to 10 paid calls mislabeled. **[GENUINE — fix: cap the bound at 3 (or make the message use the real cap).]**
7. **cost_usd numeric returned as string ⇒ client crash** — `controls.ts:84`. `sum(cost_usd)` is pg numeric ⇒ node-postgres returns a STRING ⇒ the client's `toFixed` throws ⇒ opening the Escalated list crashes in prod. **[GENUINE — fix: cast `sum(cost_usd)::float8`.]**

## P2
1. **No Security_Log on blocked cross-pool cohort** — `runMotorFanout.ts:30`. The §3.4 audit trail is missing on the FORBIDDEN. **[fix.]**
2. **Duplicate dispatch conflict ⇒ false 'dispatch_failed'** — `runMotor.ts:84`. Fan-out restaurant #2 picking the same cohort-action hits autoDispatch's dedup ⇒ escalates as failed, flooding the human queue. **[fix: treat the dedup conflict as an idempotent skip, not an escalation.]**
3. **Usage swallowed before execution** — `runMotor.ts:49`. recordUsageSafe swallows ⇒ a dispatch with no cost row (done-when wants a motor usage row). **[debatable — telemetry-must-not-fail-the-decision vs cost-attribution; lean: keep best-effort but flag.]**
4. **Escalations lack cohort/restaurant context** — `learn.ts:21`. The case stores only attempt_id ⇒ the human feed can't show which cohort. **[fix: persist restaurant_id + cohort_id on the case.]**
