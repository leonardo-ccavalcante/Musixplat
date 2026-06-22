# Fix doc — "View in Cockpit" lands on the whole cockpit, not the handed-off restaurant

> Built with the discipline Leo asked for: `/systematic-debugging` + `/investigate` (root cause, Iron Law),
> `/problem-solving` (governing thought + MECE issue tree), `/karpathy` (surgical scope, success criteria,
> surface assumptions), `/grill-with-docs` (glossary sharpen + scenario stress-test vs the domain model).
> Status: **Path A IMPLEMENTED 2026-06-22** on branch `fix/cockpit-focus` (TDD; 534/534 unit + typecheck + lint green;
> e2e added for the absent-cue case — runs in CI). Decisions locked after a `/sat` + `/problem-solving` double-check
> (see §0). **Path B (per-restaurant artifact) is documented & deferred — see §10.** Pending: prod test.

## §0 — DECISION (locked post-`/sat`)

**Approach: Alt 1 — "guide the eye"** (highlight + scroll + one-line cue inside the *full* board), **client-only**.
The SAT killed my earlier "filter the board" pick: a board that snaps to 1 row reads as *broken* to a design-eye
(Marco/ex-Uber), and the focused empty-state branch is over-scope for the deadline. What disarms the panel isn't the
mechanism — it's the **cue** ("where your handoff landed → cohort X"), which is also exactly the operator's (Michele's)
question. Grain = **cohort** (`D1b`); per-restaurant stays out (no `restaurant_id` → `§3` contract change).
**Demo flow confirmed by Leo: prepare base → prepare cockpit, with the deterministic NBA as always-on support** → the
cockpit is already populated when the operator explores, so the async-empty case is rare → **demoted to a toast**, no
empty-state screen. §5 is revised to this; §8 is resolved.

## Governing thought (the "y qué")

The link is **not** missing a filter — it promises a *grain the system does not have*. The cockpit holds **no
per-restaurant object**: a cockpit row is an `NBA_Proposal` at **(cohort × action)** grain, and it is produced by an
**async step** that runs *after* the handoff. So the honest fix is to focus the cockpit on the handed-off
restaurant's **cohort** (async-aware, client-side), and to **not** invent a per-restaurant view — that would require
an `§3`/contract change. A naive "add a `restaurant_id` filter" fix cannot even compile and would hide the async gap.

---

## 1. Symptom → root cause (systematic-debugging Phase 1 — evidence read this session)

**Symptom:** after clicking "Send to NBA" on a restaurant row, the "View in Cockpit →" link opens the *entire pool*
board, not the restaurant the operator just acted on.

**Three layers, all lacking a focus dimension (not a regression — focus was never built):**

| Layer | File:line | What it does | Gap |
|---|---|---|---|
| Link | [`HandoffButton.tsx:30-34`](../../client/src/features/cohorts/HandoffButton.tsx#L30-L34) | `<Link href="/cockpit">View in Cockpit →</Link>` | static path, **zero params** — even though `restaurant_id`/`cohort_id` are in scope (lines 8-9) |
| Route + page | [`App.tsx:58`](../../client/src/App.tsx#L58) → [`CockpitPage.tsx:47`](../../client/src/pages/CockpitPage.tsx#L47) | `/cockpit` → `trpc.cockpit.list.useQuery(undefined)` | no filter input; renders the whole pool |
| Endpoint | [`cockpit.ts:362`](../../server/routers/cockpit.ts#L362) | `list: tenantProcedure.query(({ctx}) => listCockpitRows(ctx.tenantId, query))` | scoped to tenant only; no per-cohort/per-restaurant arg |

Pattern (investigate table) = **missing capability**, not race / null / cache / regression.

---

## 2. The real problem (synthesis — why the obvious fix is wrong)

Two domain facts, both verified in code, make per-restaurant focus impossible *and* incorrect:

- **(a) There is no per-restaurant cockpit object.** A cockpit row = an `NBA_Proposal` at **(cohort × action)**
  grain, reaching a *set* of restaurants. Rows carry `cohort_id` ([`CockpitPage.tsx:120`](../../client/src/pages/CockpitPage.tsx#L120))
  and `nba_id`, **never `restaurant_id`**. `restaurant_id` shows up in [`cockpit.ts`](../../server/routers/cockpit.ts)
  only inside tenant-scoping JOINs and the dispatch `reach_preview` (lines 76/109/181/259/265-277). `NBA_Proposal`
  has no `restaurant_id` column (matches the known smell, `rl-iteration-log` iter 37).
- **(b) Async producer gap.** The handoff only **emits** `Evento_Priorizado_NBA` (spec `01:F-5.2`). The cockpit row
  appears *later*, when the NBA engine runs (`cockpit.proposePool` / "Run NBA",
  [`CockpitPage.tsx:50,59`](../../client/src/pages/CockpitPage.tsx#L50-L59)). So immediately after a handoff, the
  restaurant's cohort may have **no row yet**.

→ Filtering the board to `restaurant_id` (the symptom fix) references a field that doesn't exist **and** would mask
(b). The correct focus grain is **the restaurant's cohort proposal**, with an honest "not generated yet" state.

---

## 3. Domain stress-test (grill-with-docs — sharpen language, then probe with scenarios)

**Glossary sharpen** — "this restaurant" must resolve to a real domain object:

- **Restaurant** — a single tenant member. The handoff is per-restaurant: `Evento_Priorizado_NBA{restaurant_id, cohort_id}`.
- **Cohort** — the comparable cell (`cuisine_zone_tier_version`). **This is the proposal grain.**
- **NBA proposal** — per `(cohort × action)`; reaches many restaurants. **There is no "the restaurant's cockpit entry."**

→ "View *this restaurant* in cockpit" sharpens to **"view the cohort proposal this restaurant's handoff feeds."**

**Scenarios (these *prove* the grain is cohort, not restaurant):**

| # | Setup | Expected focused behavior |
|---|---|---|
| S1 happy | R ∈ cohort C; C already has a proposal | focus shows C's proposal row(s) |
| S2 async gap | R ∈ C; C has **no** proposal yet | honest CTA "handoff queued — Run NBA to generate", **not a blank board** |
| S3 multi-send | send R1 *and* R2, both ∈ C | **one** cohort proposal; cohort-focus is *correct* (the NBA acts on the cohort, reaching both) |
| S4 suppressed | C is k-suppressed / n_min-collapsed (`§3.2`) | focus empty with the honest reason |

**S3 is the clincher:** the cohort grain is not a limitation to work around — it *is* the product's model. A
per-restaurant view would actively lie about how the AI proposes.

---

## 4. Fix options (MECE issue tree)

**D1 — Focus grain?**
- `D1a` per-restaurant → **BLOCKED**: needs `restaurant_id` on `NBA_Proposal` (`§3`/contract change). Out of scope; ask Leo before ever doing.
- **`D1b` per-cohort (RECOMMENDED)** — `cohort_id` is on the row; matches the proposal grain; S3 proves it correct.
- `D1c` copy-only, no focus → ignores the operator's actual ask ("só esse").

**D2 — Implementation (given D1b)?**
- **`D2a` client-only `/cockpit?cohort=<id>` (RECOMMENDED)** — CockpitPage reads the query param, filters `rows` to
  that cohort + shows a "focused" banner + auto-expands the matching group(s). **Zero server change, zero
  invariant-bearing code touched** (karpathy surgical; preflight "prefer smallest surface").
- `D2b` new route `/cockpit/cohort/:cohortId` — mirrors the existing `/cockpit/dispatch/:nbaId` &
  `/cockpit/action/:code` sub-routes ([`App.tsx:56-57`](../../client/src/App.tsx#L56-L57)). Cleaner shareable
  deep-link; a bit more code. Acceptable alternative.
- `D2c` server filter (add `cohortId` input to `cockpit.list`) — touches the invariant-bearing list query for no
  gain over a client filter. **Reject.**

**D3 — Async / empty state?** The focused view MUST distinguish "cohort has rows" vs "no proposal yet" → honest CTA
(Run NBA), never a confusing blank (`§7` fail-closed, `§14` no green-fake).

**D4 — Copy honesty?** "View in Cockpit →" → "View cohort in Cockpit →" (sets the right expectation; tiny).

---

## 5. The fix — Alt 1 "guide the eye" (LOCKED, surgical, client-only)

The full board stays; we guide the operator to the relevant cohort and explain it. No filtering, no empty-state screen.

1. **[`HandoffButton.tsx`](../../client/src/features/cohorts/HandoffButton.tsx)** — carry the scope:
   `href={`/cockpit?focus=${encodeURIComponent(cohort_id)}`}`, relabel to "View cohort in Cockpit →".
   (`restaurant_id` deliberately **not** passed — no per-restaurant object exists.)
2. **[`CockpitPage.tsx`](../../client/src/pages/CockpitPage.tsx)** — read `focus` from the location search
   (wouter `useSearch` or `new URLSearchParams(window.location.search)`); when present and a row with that
   `cohort_id` exists: (a) auto-expand the group holding it, (b) `scrollIntoView` + a brief highlight ring on that
   cohort's rows, (c) a dismissible one-line cue *"Where your handoff landed → cohort &lt;id&gt;. Show all →"*
   (clearing it drops the param). **The board is never narrowed.**
3. **Async fallback = toast, not a screen.** If `focus` is set but no row matches (cohort not proposed yet — rare,
   since "prepare cockpit" populates the pool deterministically) → a transient toast *"Proposal not generated yet —
   run Prepare cockpit / Run NBA."* No empty-state branch (out of scope for the deadline, `/karpathy`).

**No server / SQL / contract change. No `§3`/governance touch.** ~2 files, additive.

---

## 6. Success criteria + verification (karpathy goal-driven + TDD)

Done = every scenario is a passing check:

- **S1** → component/e2e: cohort with a proposal, navigate `?focus=C` → its group auto-expands, rows highlighted, cue shown (board still whole).
- **S2 async** → `?focus=C` with no matching row → transient toast; **never** blank or stuck. (Rare — prepare populates.)
- **S3** → focus from R1 and R2 (both ∈ C) → both land on the same cohort, highlighted.
- **"Show all →"** drops the param → cue clears, board unchanged.
- **Regression** → bare `/cockpit` (no param) renders exactly as today.
- **Gate** → typecheck · lint · unit/component · a11y (cue focusable; dismiss returns focus, `aria-live`) · existing cockpit e2e still green.

Write the failing tests first (the scenarios above), then implement until green (red→green).

---

## 7. Scope lock / blast radius (investigate)

Edits restricted to:
- [`client/src/features/cohorts/HandoffButton.tsx`](../../client/src/features/cohorts/HandoffButton.tsx)
- [`client/src/pages/CockpitPage.tsx`](../../client/src/pages/CockpitPage.tsx)
- (optional) a small `CockpitFocusBanner` in `client/src/features/cockpit/`

~2-3 files, **client-only**. If any step wants to touch [`server/routers/cockpit.ts`](../../server/routers/cockpit.ts)
or `NBA_Proposal` → **STOP**, that's D1a/D2c = out of scope, needs Leo's OK.

---

## 8. Decisions — RESOLVED (Leo, 2026-06-22)

1. **Grain → cohort (`D1b`).** Per-restaurant (`D1a`) is OUT (would need `restaurant_id` on `NBA_Proposal` = `§3` change).
2. **Mechanism → Alt 1 guide-the-eye**, `?focus=` query param (not a filter, not a new route). Demo flow = prepare base
   → prepare cockpit (deterministic NBA always-on) → cockpit pre-populated → async-empty demoted to a toast.

---

## 9. What I will NOT do (anti-scope-creep, karpathy)

- No `restaurant_id` on `NBA_Proposal` / no `§3` change (without OK).
- No server `cockpit.list` filter (the client filter suffices).
- No refactor of the cockpit board / grouping beyond a small additive `focusCohort` prop.

---

## 10. Path B — per-restaurant dispatch artifact (DEFERRED, documented per Leo)

> Not built. Documented now so it's ready to pick up if there's time after the prod test. It is a real piece
> (server + a contract decision), **not** a same-day add. Surfaced by Leo's question: "the operator needs to adjust
> the artifact with restaurant-level SQL info, per restaurant, even though the template is the same per NBA."

### The gap (verified in code)
Today the dispatch artifact is rendered ONCE at **cohort** grain and sent identically to all N restaurants:
- [`dispatchDetail` (cockpit.ts:282-305)](../../server/routers/cockpit.ts#L282-L305) builds `renderInput` from cohort fields only (no per-restaurant data).
- [`DispatchView` (DispatchPage.tsx)](../../client/src/pages/DispatchPage.tsx) edits ONE `body`; the CTA is "Send to all N restaurants".
- `sendDispatch` writes ONE `Action_Dispatch` row with `target_count` (the whole cohort) — **no `restaurant_id`**.

### The goal
Same template **per NBA**, but each restaurant's copy is filled with **its own [V] SQL figures**, and the operator can adjust per restaurant before sending.

### Design (5 steps)
1. **Per-restaurant SQL read.** Extend `dispatchDetail` to return one row per restaurant in the cohort with its measured figures — already in SQL: `Cohort_Membership_Snapshot` carries `percentile_in_cohort`/`gap_to_top` per restaurant; orders/connection/quality are one query from the brutos. Version-stamped (§3.5), tenant-scoped.
2. **Template + merge fields.** The artifact template stays per-NBA (the action playbook) with placeholders (`{connection}`, `{gap}`, `{orders}`, `{restaurant}`).
3. **Per-restaurant render (§14).** Fill the [V] numbers from SQL per restaurant; the LLM (`restaurantCopy`) only wraps prose and its number-guard keeps the measured figures verbatim — never an LLM-invented number.
4. **UI.** On the dispatch screen, list the N restaurants; expand one → see/edit its personalized artifact. Default: edit the template once + preview per restaurant; optional per-restaurant override.
5. **Records — THE contract decision.** Today `Action_Dispatch` is cohort-level. Per-restaurant records need either (a) `Action_Dispatch` gains a `restaurant_id` dimension, or (b) one row whose `content` is a per-restaurant jsonb array. This is a `§3`/governance change → **needs Leo's explicit OK** before building.

### Effort / risk
Server read + per-restaurant render + dispatch UI + the `Action_Dispatch` contract change. Bigger than Path A; touches invariant-bearing server code → must be TDD'd with the §14 number-guard pinned. **Not same-day.**

### Open question (for when we build it)
One `Action_Dispatch` row with per-restaurant `content` jsonb, vs N rows (one per restaurant)? Decides the audit grain (one dispatch event vs N).
