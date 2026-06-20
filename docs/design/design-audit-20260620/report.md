# Design review — /cohorts (live), 2026-06-20

Target: `http://localhost:5173/cohorts` (live, 136 real cohorts) · calibrated against `docs/design/DESIGN-STANDARD.md` (validated 2026-06-20) · branch `design/cohorts`.

## Headline

- **Design score: A−** (was B+ at audit start) — strong bespoke awareness screen; the heatmap hero is the unmistakable focal point (squint test passes), copy is human, async states are honest. 3 of 4 findings fixed; held back from A only by the (pre-existing, app-wide) system-font stack.
- **AI-slop score: B** — no card-grid, no gradient, no centered-everything, no emoji decoration, one accent. The single slop signal is `system-ui` as the primary font (pre-existing, app-wide).

## First impression

"This is a cohort-health map." The eye goes to (1) the dense status grid, (2) the coral opportunity markers, (3) the tier labels. The hero is information, not a CTA — correct for an awareness screen (§0). Before the fix, coral was on 35% of cells and competed with itself; after, it reads as "act here."

## Inferred design system (rendered)

- **Fonts:** `ui-sans-serif, system-ui, …` (2 system stacks). ⚠ not the brand's Gordita — see FINDING-004.
- **Colors:** 7 unique, coherent — `#131313`/`#1f1f1f` surfaces, white/`#bdbdbd`/`#9e9e9e` text, coral `#fc532e` the only accent. Status green/amber/red appear only on cells. Excellent restraint.
- **Headings:** h1 20px/600, h2 14px/600 (card titles). Two weights, per §1.
- **Targets:** 0 interactive elements under 24px CSS (§5 met for fine pointer). 6 under 44px (nav links + chips) — fine on desktop; would want ≥44 on coarse/touch.
- **Console:** 0 errors on load.

## Findings

| ID | Impact | Category | Finding | Status |
|----|--------|----------|---------|--------|
| 001 | HIGH | Hierarchy / Color | Coral opportunity overlay on 48/136 cells (35%) — the "where to act" accent diluted to noise (§1). | **FIXED** — capped to top-12 (commit 054cd0c). Coral 48→12 cells. |
| 002 | MEDIUM | Responsive | At 375px the 2D heatmap shrank to unreadably small cells. | **FIXED** — `useIsMobile` → full-width stacked cells with context under sm (commit cc39be0). |
| 003 | MEDIUM | Layout | `TicketsPanel` rendered the full intent×cohort list, making the secondary band's right column very tall. | **FIXED** — capped to `max-h-80` + scroll (commit e5098ff). |
| 004 | LOW | Typography / AI-slop | Primary font is `system-ui`, not the brand Gordita. | DEFERRED — app-wide (`index.css`), needs the Gordita font asset (.woff2) + a global decision; out of scope for this screen. |

## Per-category grades

| Category | Grade | Note |
|---|---|---|
| Visual hierarchy | A− | hero unmistakable; coral fixed |
| Typography | B | clean 2-weight; system font is the cap |
| Color & contrast | A− | coherent, coral-only accent |
| Spacing & layout | B+ | clean 3 altitudes; tickets column tall |
| Interaction states | A− | focus rings, hover, modal focus-trap |
| Responsive | B+ | mobile stacked layout (002 fixed) |
| Content & microcopy | A− | human labels, honest empty/loading/error |
| AI slop | B | only the system font |
| Motion | A− | transform/opacity + reduced-motion |
| Performance feel | A | 0 console errors, fast |

## Remaining (next iteration)

1. **004** — if the brand wants Gordita, add the font asset (`index.css` + `@font-face`, app-wide). Needs the `.woff2` from the operator.

## Environment note

The local supabase DB (`musixmatch-customer-ops`, :54522) was reset/emptied by an external process several times mid-review (users 4→0 between checks), which produced intermittent 401 / empty-state renders. Not a regression of this redesign — the dev-login + data path are unchanged from `main`. Re-seed: `pnpm db:reset && pnpm db:p01`.

## PR summary

> Design review of /cohorts: 4 findings, fixed 3 (coral overlay 48→12, mobile stacked layout, tickets height). Design score A−, AI-slop B. 1 deferred (brand font — needs asset).
