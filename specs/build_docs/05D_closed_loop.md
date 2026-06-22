# 05D Closed Loop — diagnosis that proves it resolved & learns · [target: CÓDIGO + AGENTE + HUMANO] · [build: Claude + Codex-review]

> Co-designed with Leo 2026-06-22 (post-retro session). Unifies the unbuilt `REMAINING_WORK §3` roadmap (02D · F2 · F3 · F4 · F5 · F6 · F7) into ONE coherent loop + adds the missing piece (prove-it-resolved). Grounded in this session's reads + 3 background workflows (motor-gap map, adversarial design review, per-type measurability map). Rules live in `CLAUDE.md`. Companion: `05D_diagnosis_engine_live.md` (the 2-brain spec intent).

---

## 0. Governing principle (the spine)

**MEASURE is the gate, not the AI's "acted".** Today the loop is OPEN: `outcome='resolved'` means *"the AI acted alone"*, never *"measured-fixed"* (`server/motor/learn.ts:12`); and it only learns cases a human flags. This spec CLOSES it:

- A precedent is valid ONLY if **measured-verified** (not just "acted") **AND** its key sub-hypothesis re-confirms on current data (deterministic SQL, never LLM — §8/§14).
- Every NUMBER from SQL; the LLM only proposes/ranks TEXT (§8). Fail-closed to human everywhere (§7).
- Every sub-hypothesis carries a **validation tier** (`deterministic` vs `human/LLM`); the LLM never stamps `[V]` on a cause the data cannot isolate.

**Leo's 3 locked decisions** (drive the whole design):
1. **Number per SUB-hypothesis** where measurable; human elsewhere (the decision human makes becomes that cause's "number" for the future).
2. **Measurement counts as learning** (`reviewed_by_human OR verified_by_measurement`) — but the human must have **visibility** of what was auto-approved.
3. **A human decision becomes a STRONG precedent only AFTER** measurement (Part D) confirms it.

---

## 1. What this delivers — `REMAINING_WORK §3` unified

| §3 item | Where it lands in the loop | Status |
|---|---|---|
| **02D** wire diagnosis LLM into product | **Part A** — the 2-brain needs the LLM live (today `runDiagnosis` defaults to deterministic; product callers never pass `llmReasoning`). PRECONDITION. | net-new wiring |
| **F3** 2-brain classification | **Part A** — the agreement gate | net-new |
| **F2** pgvector precedent memory | **Part B** — `Knowledge_Case += embedding` + kNN to FIND the candidate precedent | net-new |
| **F7** anti-SAP console | **Part C** — the human decision console (reuses the existing "Needs your decision" section) | partial reuse |
| **F5** L2/L3 teach-a-type | **Part C** + building the 5 new sub-hypothesis signals | adjacent |
| **F4** batch ticket ingestion + dedup | **adjacent** — intake at volume (extends the existing Situation Room seam) | adjacent |
| **F6** stage-proofing | **cross-cutting** — the carve-outs, fail-closed, + Fase 0 prod bugs | cross-cutting |
| **NEW** prove-it-resolved re-measurement | **Part D** — the MISSING piece (not in §3); closes the learning loop | net-new |
| **Fase 0** | the 2 live prod bugs on `/diagnosis` | immediate |

---

## 1b. Reactive vs Proactive — the operator's model (Leo, 2026-06-22)

Reactive and proactive are **phases, not opposite origins**. The current code (`origin = conversation_id ? "reactive" : "proactive"`, orchestrator.ts:55) conflates *"no conversation"* with *"proactive"* — conceptually wrong, and a **pre-existing model bug** (NOT introduced by the Fase-0 400 fix; that fix only made the demo "Run flow" hit the proactive branch).
- **TODAY all tickets arrive via CSV** (Situation Room: a conversations CSV or a problems CSV). A CSV upload IS the inbound ⇒ **every case today is reactive** (a real signal came in). There is no "case without a signal".
- **Proactive = the ACTIVE search for similar / silent cases** from that input (= Part B: precedent kNN + the silent-hunt). It is an action the system *takes*, not the absence of a conversation.
- **FUTURE (WhatsApp / live chat):** a live channel would give reactive-live AND the proactive search at once. Until then, CSV-only.
- **Implication:** derive `origin` from *"did a real inbound arrive"* (true for any CSV intake today), and treat the proactive similar-search as a distinct phase — never from `conversation_id` presence. (Folds into Part A/B; tracked here, not fixed in the Fase-0 bug PR.)

## 2. The loop (4 parts)

**Part A — 2-brain classify (02D + F3).** Both brains run independently on the ticket: Brain 1 = deterministic keyword (the stable FLOOR), Brain 2 = LLM+RAG (read what the customer said + retrieve precedent). Lead-by-**agreement**: agree → proceed; disagree OR similarity<threshold OR no valid precedent → **human console** (Part C). NOTE: Brain 1 confidence is a constant `0.70` (`reasoning.ts:88`) — the disagreement gate keys on **categorical area/verdict mismatch**, NOT on Brain 1's number. **Strictness (Leo, 2026-06-22): AREA mismatch ONLY forces the console** — same `area_type` with a differing sub-hypothesis PROCEEDS (Part B re-validates the precedent + Part D measures before any non-money action; autonomy is kept wherever the brains agree on *what* is wrong). The console fires on a genuine area conflict, not on every categorical difference. Wire = pass `llmReasoning(openaiChatClient(), usageSink, getActiveChatModel())` into `runDiagnosis` at the 2 product call-sites (`diagnosis.run`, `intake.runSpine`), mirroring `motor.ts:17`; cost logged (P07); fail-closed already in the orchestrator catch.

**Part B — precedent-first w/ hypothesis re-validation (F2 + Leo's hard rule).** kNN over `Knowledge_Case` embeddings finds a *candidate* precedent. **ACCEPT only if BOTH:** (a) it was **measured-verified** before (`verification_status='verified_fixed'`, never raw `outcome='resolved'`), AND (b) the precedent's **structured sub-hypothesis signal re-confirms** on the current case's data (deterministic SQL — see §3). Else discard the precedent (never import a past judgment that no longer holds). Accepted → propose its resolution through the **existing** `proposeNba → sealMinCalculationNBA → autoDispatch` authority (never a bespoke shortcut — keeps the §3 money hard-no + auto_releasable seal).

**Part C — human decision console (F7 + decisions #2/#3).** On disagreement / unmeasurable sub-cause: the existing `/diagnosis` "Needs your decision" section (`DiagnosisBoard.tsx:49`) shows **both brain verdicts side-by-side**, the disagreement explicit, and the candidate precedents (what worked / what was discarded — progressive disclosure, anti-SAP). The human picks area/sub-hypothesis, **writes the WHY** (required short structured reason + optional note), dispatches. Writes a `Knowledge_Case` with `human_authored=true`, `rationale` ([C]), `reviewed` for **surfacing only** — it becomes a **STRONG precedent only after Part D verifies it** (decision #3). The human also sees an **audit view** of what measurement auto-approved (decision #2 visibility).

**Part D — prove-it-resolved re-measurement (NEW).** After an action + a **per-signal window** (`resolution_verify_window`, §3.8): re-run `cohort.fn_nba_test_all` for the restaurant/week. **3-valued, never binary:**
- `verified_fixed` — ONLY when `n_min_ok ∧ k_anon_ok ∧ non-null gap_after < gap_before` (on the lever's dimension) → `Diagnosed_Problem.status='resolved'` + STRONG precedent.
- `not_closed` — `gap_after ≥ gap_before` → reopen (status `reopened` ≠ fresh `open`, suppresses re-dispatch, routes to human as NEGATIVE precedent).
- `unmeasurable` — `gap_after null OR !n_min_ok OR !k_anon_ok` → keep open, write NO verified flag, re-queue (never auto-resolve on absence of data — §14 master rule).

**Attribution carve-out (per-signal):** zone/cohort-SHARED signals (`zone_demand_trend`) = auto-verify FORBIDDEN, always human (non-attributable). Cohort-RELATIVE (`price_pctile`) requires the restaurant's OWN absolute metric to move, not its rank. Overlapping action on the same restaurant within the window → `confounded → human`. Persistence ≥N consecutive measured weeks before resolve/reopen (anti-oscillation on noisy thresholds).

---

## 3. Decision #1 reality — per-type sub-hypothesis measurability (`[V]`, this session)

Of 15 sub-hypotheses: **0 measurable today · 5 buildable as new SQL signals · 10 honest human-only.** Every buildable signal is a DECOMPOSITION of a column the umbrella already reads; every human-only cause needs a column the schema does not have.

| Type | Buildable signal(s) — the F-build list | Human-only (data cannot isolate) |
|---|---|---|
| **menu_quality** | `photo_coverage = avg(has_photo)` · `description_coverage = avg(has_description)` (split the fused metric; `has_photo`/`has_description` at `20260617000016_model_v2.sql:27-28`) | "stale listing" — no `last_menu_edit` timestamp / no menu-item table |
| **adoption** | `never_onboarded = COUNT(Usage_Event)=0 ever` · `churned = had events ∧ max(ts)<cutoff ∧ min older` (split the merged anti-join, `20260621000008…:50,69`) | "value not understood" — no activation-event concept |
| **payment** | `non_cancel_failure = payment_status='failed' AND cancelled_by IS NULL` (`Order.payment_status` + `cancelled_by`) | "refund dispute" (no refund/chargeback column) · "balance mismatch" (no settlement ledger) — **→ human also satisfies §3 financial-hard-no** |
| **cancellation** | — (0/3) | `failure_reason` always NULL · `order_date` has no time-of-day · Order is order-grained (no line items, §4 denylist) → re-validate the UMBRELLA cancel-rate only, all 3 sub-causes → human |
| **connection** | — (0/3) | device / POS / staff all alias into one `connection_ratio`; producer records `evidence=NULL` by design → entire sub-cause layer human until a session/heartbeat or integration-error table exists |

**v1 stance (Leo, 2026-06-22 — "entrega tudo"):** build the 5 immediate signals **AND** the missing data sources — maximize measurability instead of falling back to human. The honest re-map after the sources exist (every claim tied to the blocker §3 names above, never broader):
- **menu_quality → 3/3** — photo/description coverage (now) + `stale_listing` via a **menu-item table** (`last_menu_edit`).
- **payment → 3/3 measurable** — non-cancel-failure (now) + `refund_dispute`/`balance_mismatch` via a **settlement ledger**. These two are `clase_financiera=directa` ⇒ the diagnosis is measurable but the **action stays PROPOSE-only (§7 financial hard-no)** — measurability ≠ autonomy.
- **connection → 3/3** — device/POS/staff isolate once a **session/heartbeat + integration-error log** exists (the exact unblock §3 named; `evidence` stops being NULL).
- **cancellation → time-of-day** via an **order timestamp** column; the other 2 sub-causes need MORE than the 4 named sources — `failure_reason` must be **populated** (producer/seed fix) and line-items need an **order-item table** (not §4-denylisted, but re-grains `Order` — heaviest surface). Built too per "entrega tudo", flagged as the most expensive.
- **adoption "value not understood" = the ONE genuinely-unmeasurable cause** — it is intent; no column separates "understood-but-declined" from "never-grasped". Stays human/LLM honestly (§14).

Net: 5 → ~12 buildable signals; exactly **1 honest-human cause** (intent) + the 2 heavy cancellation sub-causes gated behind their producers. Each source is its own ordered deliverable (**Fase 6**).

---

## 4. Structural musts (from the adversarial review — non-optional)

- **Persist the STRUCTURED lever** (`dimension/operator/threshold_knob/action_code` from `descriptor.affected` — the motor already holds it at `runMotor.ts:82`) into `Knowledge_Case` at write-time. Without it Part B has no machine-readable predicate to re-validate (§8 would force an LLM-parse). *Without this field, Part B is cut.*
- **`verification_status` enum** (`unverified|verified_fixed|verified_reopened`, default `unverified`) = the ONLY `[V]` field, written solely by the Part D job. **Fix the existing `outcome` provenance stamp `[V]→[C]`** in the same migration (`learn.ts:21` — today a result-flavored verdict no producer measured).
- **RL-guard split** (decision #2): grounding reads `reviewed_by_human=true OR verification_status='verified_fixed'` — with a human-visible audit of auto-approvals. (Else Part D produces zero learning.)
- **New `Diagnosed_Problem` statuses** `verifying` / `reopened` (today status is set `resolved` at dispatch — a black hole; reopen must not re-trigger as fresh).
- **`resolution_verify_window` knob by NAME, PER-SIGNAL** (§3.8) — a 90d-rolling cancel ratio cannot be verified in 1 week.
- Re-measure depends on / triggers the **cohort snapshot producer for W+window**; `no_data` = re-queue, never resolved, never a negative precedent.

---

## 5. Phased plan (ordered deliverables; each gets its own build-doc section + Done-when)

- **Fase 0 — 2 prod bugs** (`F6` hardening, immediate): (a) duplicate React keys (`R0012…`) in a `/diagnosis` sub-render; (b) `reportProblem` 400 = the "Run flow" button hardcodes `restaurantId:"R-PAY-001"` (demo fixture absent in prod, `DiagnosisPage.tsx:80`) — the real prod entry is the Situation Room; guard/remove the demo button outside dev. *Done-when: clean `/diagnosis` in prod, no 400 on primary action, no dup-key warning.*
- **Fase 1 — Part A (02D + F3):** wire `llmReasoning` into the 2 product call-sites + the agreement gate (categorical mismatch → human). *Done-when: a disagreement E2E routes to needs_human; cost logged; tests inject deterministic so CI stays hermetic.*
- **Fase 2 — Part B (F2) + structured lever:** embedding column on `Knowledge_Case` + pgvector kNN + embed-on-write in `learn.ts`; persist the structured lever; precedent-accept gates on `verified_fixed` + re-validation SQL. *Done-when: a candidate precedent is accepted only when verified AND its signal re-confirms.*
- **Fase 3 — Part D (re-measurement):** `verification_status`, new statuses, per-signal window knob, 3-valued verdict, attribution carve-outs, persistence guard. *Done-when: an acted case auto-promotes to `verified_fixed` only on measured gap-close; unmeasurable re-queues; zone-shared → human.*
- **Fase 4 — Part C console (F7) + RL-guard split:** both-brain row, rationale capture, human-visible auto-approval audit, strong-only-after-verify. *Done-when: a human decision generates a reviewed case that grounds future runs only after Part D verifies.*
- **Fase 5 — the 5 sub-hypothesis signals (decision #1 buildable list):** photo/description coverage, never_onboarded/churned, non_cancel_failure — each a named SQL signal re-validated independently. *Done-when: per-type re-validation discriminates the buildable sub-causes; the 10 human-only stamped as such.*
- **Fase 6 — data sources for full measurability (Leo "entrega tudo"):** order timestamp + populate `failure_reason` (cancellation) · menu-item table `last_menu_edit` (menu stale-listing) · session/heartbeat + integration-error log (connection device/POS/staff) · settlement ledger (payment refund/balance — **diagnosis only; money action stays §7 propose**) · order-item table (cancellation line-items, heaviest — re-grains `Order`). Each = its own migration+producer+seed+named signal, §3/§4/§14-safe; ordered **cheapest-first** (timestamp → menu-item → session log → ledger → order-item). *Done-when: connection 3/3, cancellation time-of-day + the 2 producer-gated sub-causes, menu stale-listing, and payment refund/balance each re-validate as named SQL signals; only adoption "value not understood" remains human.*
- **Adjacent (follow-ons):** F4 batch ingestion · F5 teach-a-type.

---

## Decisions resolved (Leo, 2026-06-22)
- **Missing data sources → "entrega tudo":** build all of them (now **Fase 6**), not deferred and not cut. Maximize measurability; only adoption "value not understood" stays human (intent — unmeasurable by construction). Money causes (refund/balance) become measurable diagnoses but the **action stays §7 propose-only** — measurability ≠ autonomy.
- **Part A disagreement strictness → AREA mismatch only:** same-area sub-hypothesis differences PROCEED (Part B re-validation + Part D measurement gate the action); the console fires only on a categorical **area** conflict. Keeps autonomy where the brains agree on *what* is wrong.

*Spec complete — all sections + phased plan + both owed decisions resolved. Next: build Fase 1 (Part A: wire `llmReasoning` + the area-mismatch gate) when Leo gives the go.*
