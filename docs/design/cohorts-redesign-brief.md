# /cohorts redesign — design brief (plan-described UI for /design-html)

> Source of truth for the look: `docs/design/DESIGN-STANDARD.md` (validated 2026-06-20). Brand tokens: `client/src/index.css` (`--mxm-*`, dark-only). This brief only states the *cohorts-specific* composition; where it is silent, DESIGN-STANDARD governs.

## Governing thought (locked, DESIGN-STANDARD §0)

> **/cohorts is an awareness screen: see at a glance how my cohorts are doing, where the opportunities are, and how to act — comprehension is primary, action is secondary (no single CTA).**

The hero is *information* (a legible health map + the opportunities on it), never a coral button. Zero filled-coral buttons at rest is correct.

## Problem being fixed (grill, locked)

Today the screen is `grid lg:grid-cols-2` of **7 co-equal Card panels** (Matrix, Delta, TopVsBase, Money, Tickets, Changelog, Sandbox) — the "SAP wall" §1 forbids: nothing dominates, the eye has no entry point. The matrix (the natural hero) **hides its cells behind nested folds** (tier→cuisine→zone), so you cannot read cohort health "in one look."

## Decisions (grill, locked)

1. **Ambition** — a real redesign of the *composition*, karpathy method: reuse existing components/data/producers, change layout not internals, do not break §3/§14 or the existing cohort tests.
2. **Hero** — a **2D heatmap** dominates: a grid **rows = cuisine × cols = zone, one block per tier**, flattening the folds. Cell color = computed `status` only (honest, no invented intensity). Opportunity is read *on* the map.
3. **Recede in 3 altitudes** — hero → secondary band → drill modal → advanced disclosure (mapping below).

## Honest data contract (so the mockup never fakes a number — §14)

Per `shared/contracts.ts`:
- **`CohortCell`** = `{cohort_id, cuisine, zone, tier_base, n_accounts, status: pending|suppressed|collapsed|ok, freshness_ts, stale}`. The only per-cell signal is the **4-state status** → the heatmap is a **status grid**, not a continuous gradient.
- **`DeltaRow`** (per restaurant, carries `cohort_id`) = `{delta_status: cohort_changed|percentile_up|percentile_down|at_risk|new|churn, gap_to_top: number|null, percentile_in_cohort, percentile_delta:{sentido, magnitud, root_cause}}`. → "where the opportunity is" = cells whose `cohort_id` has prioritized deltas; rank/size by `gap_to_top`.
- Suppressed cell never shows its small `n` (k-anon) → render `n = —`. Stale → `FreshnessBadge`. Every rendered number keeps its provenance tag (`[V]/[I]/[C]`) in title/aria.

## Layout spec (the new screen, top to bottom)

### 0. Header (operability — keep, it is not a panel)
- `Cohorts Explorer` title + one-line subtitle.
- The **Run flow** trigger (drives P01) + `aria-live` status line. This is operational chrome, not the hero; keep it quiet, single button. Fail-closed message stays honest (no green-fake).

### 1. HERO — the heatmap (full width, visually dominant)
- **Status filter chips** (reuse `FilterChips`) sit above the map, quiet.
- **Per tier** (`managed_brand`, `managed_midmarket`, `long_tail`, canonical order) a compact 2D grid:
  - **rows = cuisine**, **cols = zone** (axis labels muted, sticky on scroll).
  - each intersection = the cohort `Cell` for that (cuisine, zone). Reuse the existing `Cell` semantics.
  - **cell fill** encodes `status` via color **+ icon + text** (reuse `META`: ok ●/green, collapsed ◐/amber, suppressed ▢/red, pending ○/grey) — color is never the sole carrier (§5).
  - **opportunity overlay**: a cell whose cohort has a prioritized delta gets a **coral corner notch + a small `gap_to_top` readout** (the only coral on the screen — it marks *where to act*, not a CTA). Strength = `gap_to_top` magnitude, honest.
  - empty (cuisine,zone) intersection = a faint placeholder, distinct from `pending`.
- **Squint test (§9.16)**: blurred, the heatmap is the single brightest/biggest block; the coral opportunity notches are the next thing the eye finds.
- States (§4): loading = **skeleton grid sized to the final cells** (not a spinner); empty = "No cohorts computed — Run the flow"; error = inline + retry; success = the map.

### 2. SECONDARY band (below hero, clearly demoted — smaller type, muted surface)
- **Top opportunities** strip: top deltas by `gap_to_top`/`at_risk`, each a quiet row — `cohort · restaurant · why-it-moved (root_cause) · gap_to_top` — click opens that cohort's drill modal. (reuse `DeltaPanel` data, slimmer.)
- **Money** + **Tickets** as small honest stat chips (reuse `MoneyPanel`/`TicketsPanel` data, condensed). Money shows its `seal` honestly (§3 financial: signal only, never an action).
- This band reads as *support*, never competes with the hero (lower contrast, less space).

### 3. DRILL — cohort modal (on cell or opportunity-row click)
- Reuse `CohortModal` hosting: `CohortProfile` + `TopVsBase` + `UpsidePanel` + `AttributionDetail` + `DrillTable` + `HandoffButton` (NBA handoff). This is "how to act," correctly deferred to drill.
- Modal a11y: focus-trap + Esc + focus-return + `aria-modal` (reuse existing `Modal`).

### 4. ADVANCED — summoned disclosure (collapsed at rest)
- One quiet "Advanced" `Disclosure` containing `ChangelogTimeline` (rule-version history) + `SandboxPanel` (re-segmentation). Off the first-paint surface (§2) — occasional tools.

## Component reuse map (karpathy: re-compose, do not rewrite)

| New role | Reused unit |
|---|---|
| Heatmap shell + cells | `CohortMatrix.tsx` re-composed into a 2D grid; `Cell` kept |
| Status semantics (color+icon+text) | `META` in `CohortMatrix.tsx` |
| Opportunity overlay/strip | `DeltaPanel.tsx` data |
| Filters | `FilterChips` |
| Freshness/stale | `FreshnessBadge` |
| Drill | `CohortModal` + `CohortProfile`/`TopVsBase`/`UpsidePanel`/`AttributionDetail`/`DrillTable`/`HandoffButton` |
| Secondary stats | `MoneyPanel`/`TicketsPanel` (condensed) |
| Advanced | `ChangelogTimeline` + `SandboxPanel` inside `Disclosure` |
| Surfaces/states | `Card`, `Disclosure`, `EmptyState`, `LoadingState`, `ErrorState` |

No tRPC contract changes; no producer/SQL changes; `tenant_id` stays server-side.

## Visual system (DESIGN-STANDARD §1/§5/§6)
- Dark-only, `--mxm-*` only; depth via layered surfaces (#131313 → #1F1F1F → #343434 border), no shadow soup, no gradient/glassmorphism.
- Two type weights. Coral (`--mxm-paletteBrand100`) appears **only** as the opportunity marker. Purple absent (no upgrade concept). Green only = verified ok status.
- Motion: `transform`/`opacity` only, spec durations; cells fade-in, modal scale .98→1, opportunity notch a single calm pop. `prefers-reduced-motion` removes motion, keeps state.
- Fluid: `clamp()` + logical properties; reflow clean at 320px / 200% / 400% (no 2D scroll).

## Success criteria (karpathy goal-driven — verifiable, loop until met)
1. **DESIGN-STANDARD §9** binary checklist = all yes (esp. #1 one dominant element = the map; #6 four states; #9 color+icon+text; #16 squint; #17 tokens-only; #18 reflow).
2. Existing cohort tests stay green (`CohortMatrix.test`, `DeltaPanel.test`, `CohortProfile.test`, …) after the React port — contracts unchanged.
3. No §3/§14 regression: no seeded numbers, k-anon `n=—` on suppressed, provenance present, server-side tenant untouched.
4. Mockup verified at desktop + mobile widths before the React port.
