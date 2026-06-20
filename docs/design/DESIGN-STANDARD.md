# DESIGN-STANDARD.md — project design standard (canonical)

> **Status: VALIDATED by the operator — 2026-06-20.** Master rule confirmed: every screen starts from its own governing thought (action screens → one primary action; awareness screens → the signal is the hero). Pillar 3 confirmed as "cite, don't assert." /knowledge density = roomy cards. This is now the canonical design standard; refine only with operator sign-off.

AI-first Customer-Ops platform (Uber Eats domain). This file is the **single source of truth for WHAT a screen must look and behave like to ship.** It sits beside `CLAUDE.md` (which governs *how* code is built) and `Design/musixmatch-pro-design-spec.md` (which defines the raw tokens). Where this standard and the brand spec conflict, the conflict is flagged inline with **[OPERATOR DECIDES]** — do not silently pick one.

## §0 — Governing thought

> **Great UI for this product is calm and honest: a quiet dark canvas, the next decision revealed only when reached, and never a number, status, or success rendered before the system actually computed it.**

**The master rule — start from the screen's own governing thought.** Before any layout, name in one sentence what THIS screen must let the operator *do* or *know*; every element then earns its place by serving that thought, and whatever does not serve it recedes or leaves. The philosophy above (calm, honest, progressive) is *how* every screen looks; the per-screen governing thought is *what* it must make obvious. The pillars below are in service of that thought — not a substitute for it, and never a uniform template stamped onto every screen.

Two worked governing thoughts:
- **/knowledge** (a narrative *action* screen): "drop a document, the assistant tells me what it is and I confirm, then I can ask the base questions." → one guided path, one primary action at a time.
- **/cohorts** (a situational-*awareness* screen): "see at a glance how my cohorts are doing, where the opportunities are, and how to act." → the health signal and the opportunities must be legible in one look; here the 'primary' is *comprehension*, and actions are secondary — not a single CTA.

Density is not power; clarity is the product. The operator is escaping SAP/Salesforce walls of equal-weight controls — but the cure is **hierarchy in service of the governing thought**, not minimalism for its own sake. **Karpathy mentality (operator-named):** design to the root need, reuse the screens and components that already exist, and do not overengineer or rebuild what already works (existing screens are refactored toward this standard surgically, not from scratch). The seven pillars are MECE: **Focus · Disclosure · AI-trust · Honest async · Accessibility-as-law · Motion · Voice & scale.**

---

## §1 — Pillar 1: Hierarchy serves the screen's governing thought

One thing dominates each state — the thing the governing thought says matters most — and everything else recedes. On an *action* screen that dominant thing is a single primary action; on an *awareness* screen it is the key signal or answer. This is the antidote to the 20-button toolbar of equal-weight controls — **not** a blanket "one button" law.

**ACCEPTED**
- Name the state's single most important thing (per the governing thought) and make it unmistakable by contrast/weight/space; demote everything else to ghost, text, or chrome.
- On an **action screen** (/knowledge): exactly **one** filled `--mxm-paletteBrand100` (#FC532E) button per state — empty = "Add a document"; proposal = "Confirm"; otherwise none. Every other control is ghost/outline or plain text.
- On an **awareness screen** (/cohorts): the health signal and where-the-opportunity-is read in one look — the dominant element is *information*, not a CTA; row/cell actions stay quiet and secondary. Zero filled-coral buttons at rest is correct when the governing thought is "let me see," not "let me do."
- Two type weights only (Gordita Bold heads, one body weight). Coral is the *only* action accent; purple `--mxm-palettePurple100` is reserved strictly for upgrade/premium; green `--mxm-paletteGreen100` means a verified success only.

**NOT ACCEPTED**
- A wall of equal-weight controls where nothing dominates and the eye has no entry point (the SAP/Salesforce failure). A persistent toolbar of equal-weight icon buttons at rest.
- *On an action screen:* two coral buttons competing in one viewport; Save / Cancel / Export / Share all solid. Coloring tags, links, and icons coral so nothing reads as *the* action. Purple or a second accent "to spice it up." Any gradient in UI chrome.

**WHY** — A state with no dominant element forces a linear scan of everything (the exhausting enterprise default); a single high-contrast focal point is found pre-attentively in under 200ms (Hick's Law). The discipline is not "always one button" — it is "always one clear answer to *what is this screen for*." Brand spec §8 ("1 primary/panel") is the action-screen case of this rule.

**AWARD-WINNING STRATEGY** — Stripe ships one CTA per viewport on action flows, yet its analytics views lead with the chart, not a button; Linear's board is read-first (the work is the hero) while its dialogs have exactly one commit. The constant is not button-count — it is that the most important thing for that view is obviously the loudest, and the rest is subtracted.

---

## §2 — Pillar 2: Progressive disclosure — show the next decision, hide the rest

The screen is a vertical narrative, not a dashboard. It reveals one objective at a time and keeps available-but-irrelevant data deliberately off-surface — including config, which is a named server-side knob, never a form field.

**ACCEPTED**
- Drive /knowledge as a single-objective vertical sequence: drop → AI proposes type → confirm → row appears → test search. Each zone appears only when reached. On first paint there is a dropzone and *nothing else* (no filter rail, no toolbar, no live search box).
- Advanced metadata (chunk count, embedding model, raw provenance jsonb, `similarity` float, `chunkId`/`docId`) lives behind a row-expand/drawer or `details`/`summary` — never on the list surface.
- The AI's top proposed type is **pre-selected** so the happy path is a single confirm. Thresholds (`kb_similarity_threshold`, `kb_classification_floor`, chunk size, model) are server-side named knobs (`Config_Knobs`), surfaced as UI only inside an explicit "Advanced" disclosure for a proven rare need.

**NOT ACCEPTED**
- Upload + full filterable table + search + bulk-action bar + settings all at once. Surfacing every DB column (id, created_at, mime, bytes, hash, version) as a visible column with a horizontal scrollbar.
- A pre-upload settings form (pick model, chunk overlap, similarity metric, retention) before the operator has dropped one file. "Just in case" toggles.

**WHY** — Working memory holds ~4 chunks; showing only the current decision keeps the operator in flow and makes a capable product *feel* simple. Every visible column is a tax on every scan, even ones never used. The contracts in `shared/contracts_knowledge.ts` expose `chunkId`/`docId`/`similarity` — the line between *data available* and *data shown* is a concrete, testable design decision, not a vibe.

**AWARD-WINNING STRATEGY** — Raycast shows zero chrome until invoked; Superhuman is "no clutter, just focus"; Vercel's zero-config deploy makes the smart default and hides the knobs. Power is *summoned* (a command, an Advanced link), never *displayed*.

---

## §3 — Pillar 3: AI proposes with its reason; the human's click writes

The classifier is a proposal, never an auto-commit — and never a bare verdict. Every AI output shows *why* at a glance so a skeptical operator can judge it, defers the full proof to one expand, and is written only on the human click. Accept and correct sit at equal altitude.

**ACCEPTED**
- After upload the modal advances to one sentence the AI "speaks" — "This looks like a **Policy**" — the type as the focal word, **plus a glanceable reason in plain language** ("it sets refund and cancellation rules"), drawn from the document, not a black box. A **Confirm** button (coral, Enter) sits beside an equal-weight **Change type** (reveals the 6-type select) and **Dismiss** (Esc).
- **Show the why, not just the what.** Every AI/producer output carries a one-glance justification at the point of decision: the type proposal names its evidence; each search hit leads with the matched snippet + the source document ("where this came from"). The *full* proof — the exact matched passages, the per-signal breakdown, the raw score, the provenance jsonb — is one expand/hover away, surfaced on demand, **never dumped inline**.
- The DB write of a confirmed type happens only on the human click (`knowledge.confirmType` flips `status='proposed'` → confirmed, provenance [I]→[V]). The reject/correct path is one click at the same visual weight as accept.
- Confidence (`UploadResult.confidence`) is a humanized [C]-class cue ("High confidence"), the precise float reachable in tooltip/aria only. When confidence is below `kb_classification_floor`, the flow inverts: default the type to "Other" and open the override select by default, turning fail-closed into helpful guidance.

**NOT ACCEPTED**
- A bare verdict that demands faith: "It's a Policy." with no reason; a search hit with no snippet or source. Silently classifying and ingesting with no confirm step. Burying "wrong type? change it" two clicks deep. A loud raw "0.87" as the primary token. A green "looks good" when confidence is below the floor.
- The opposite failure — **dumping all the evidence inline** (every matched chunk, every score, the raw jsonb) so the why becomes noise. Writing the confirmed type to the DB before the human clicks.

**WHY** — This screen serves the skeptical CEO and the creative designer alike — neither will, nor should, take an AI verdict on faith. Visible, glanceable evidence is what earns trust; making it reversible and human-gated (CLAUDE.md §3.7; the P06 contract is literally `proposedType` → human `confirmType`) is what keeps that trust. And the reason must ride at the right *altitude* — a one-line why always visible, the full proof one expand away — or "show the why" becomes the SAP overload it was meant to prevent (this is Pillar 2 applied to evidence). A raw float is both noise and false precision ([C], §3.6/§3.10).

**AWARD-WINNING STRATEGY** — Perplexity earns trust by citing sources inline with the claim, the full passage one click away; Notion AI presents Accept beside Discard, never a silent commit; Linear and GitHub show *why* a result ranked/matched (the matched line) rather than asking you to trust the rank. The pattern is "cite, don't assert" — at a glance, with the proof on demand.

---

## §4 — Pillar 4: Honest async — four states, optimistic only on intent

Every async surface tells the truth about whether it is working, broken, empty, or done. Optimism is allowed on what the human chose, forbidden on what a producer must compute. This pillar is the UI face of the §14 NULL-pre-run anti-fake invariant.

**ACCEPTED**
- Every async surface (DocList, SearchTester, upload) ships four visually distinguishable branches: **empty** (glyph + guiding CTA), **loading** (skeleton rows sized to the *final* layout, not a spinner in a void), **error** (inline message + retry), **success**. "Found nothing" must never read identical to "failed" or "still running."
- Optimistic UI is allowed **only on human-intent fields**: the confirmed doc-type flips [I]→[V] instantly via `setQueryData`, reconciles on success, rolls back with a toast on error.
- Producer-computed result fields (embeddings, similarity, confidence, "Searchable") show an honest pending state — the just-uploaded row appears as "Indexing…" and flips to "Searchable" **only when chunks/embeddings actually exist.**
- **Signature moment (the one delight beat):** when a document moves "Indexing…" → "Searchable," the status pill swaps with a single calm transition (icon+label cross-fade, micro duration) and the row settles — proof the loop closed. Name it, choreograph it, ship it intentionally.
- **Two distinct empty states, two messages:** *base is empty* → onboarding ("Your knowledge base is empty. Drop a policy, FAQ, or runbook — the assistant will read it and suggest what it is."); *base has docs but the query matched nothing* → try-rewording ("Nothing in the base matches that yet — try different wording or add a document"). Never collapse into one blank.

**NOT ACCEPTED**
- A blank flash then content pop. A bare spinner in a content region. A green checkmark/toast before the embedding job finished ("fake-green"). Optimistically rendering an upload as classified+embedded while the embedding column is still NULL.
- A silent empty search reading as a confident "nothing relevant." Blocking the whole UI on the trivially reversible one-click confirm.

**WHY** — Each state answers a different operator question (working / broken / empty / done); collapsing them forces guessing — the exact SAP/Salesforce confusion this product kills. A fake-green success in an Ops tool *asserts a result that does not exist yet* — the §14 anti-fake violation expressed in the UI. Rule of thumb: optimism on user-intent, honesty on producer-computed.

**AWARD-WINNING STRATEGY** — Linear reads from local state and applies mutations synchronously, rolling back only on validation failure; GitHub Actions shows live per-step status, never a premature "done." The repo's current `LoadingState` is a centered text line — upgrade it to skeleton rows sized to the real row height (a real gap to fix).

---

## §5 — Pillar 5: Accessibility is the law here, not a nicety

WCAG 2.1 AA is EU-legally enforced (European Accessibility Act / EN 301 549). These are hard gates checkable with axe/Lighthouse and a keyboard, not taste calls.

**ACCEPTED**
- **Status never color-only:** AI-suggested vs human-confirmed, `parse_failed`, and freshness each combine color + icon + text (reuse `ProvenanceBadge`/`FreshnessBadge`). The human label is the visible token; raw [I]/[V] codes live in `title`/`aria` only.
- **Contrast verified against the actual surface:** body ≥4.5:1 (#FFFFFF or #BDBDBD on #131313/#1F1F1F), large/UI/focus-ring ≥3:1. Never #828282 for body. Measure white-on-coral and white-on-purple with axe (all three are flagged borderline in brand spec §11) — if a brand button fails, darken the shade via `color-mix`, never lighten the text.
- **Keyboard happy path drop→confirm→search is fully mouse-free:** `⌘K` or `/` focuses search from anywhere; Enter runs/opens a result; Confirm=Enter, Dismiss=Esc. Focus is explicitly managed across the upload→confirm step change (React unmounts the focused node) and returns to the trigger on close.
- **Targets ≥24×24 CSS px** (≥44px on coarse pointers). The existing `Modal` close button is `px-2` with no min size — pad it to a ≥24px square before reuse.
- **`prefers-reduced-motion` reaches every animated component**, including JS-driven springs (the global CSS reset is necessary but not sufficient): suppress the motion, **keep the state change** (the new row still appears).
- Async outcomes announce via live regions: search result count `aria-live=polite`; mutation success `polite`, failure `role=alert`.

**NOT ACCEPTED**
- A bare colored dot whose only meaning is hue. #828282 body text. Shipping coral/purple buttons assuming "brand = pass." `outline:none` with no replacement. A 16px `✕`. A drag-only dropzone with no keyboard equivalent. A search that updates the DOM silently for screen-reader users. JS motion that ignores reduced-motion.

**WHY** — ~8% of men have a color-vision deficiency, and on #131313 coral #FC532E and system red #F54B40 are perceptually close — color-only fails them *and* WCAG 1.4.1 Level A. The spec's own §11 names the borderline tokens; ignoring its own warning is a documented defect. Keyboard (2.1.1) is the most fundamental criterion; the async-boundary focus-loss is a concrete, common React bug.

**AWARD-WINNING STRATEGY** — Linear/Superhuman/Raycast make `⌘K` the single entry point for an operator who repeats the loop all day; GitHub status checks pair icon + color + text; Radix Dialog (and the repo's own `Modal.tsx`) prove focus management. The repo's `FreshnessBadge` already does color+icon+text right — the rule is *don't regress it*.

---

## §6 — Pillar 6: Motion encodes causality, GPU-cheap, never decoration

Motion exists to maintain object permanence — where did my click go, what spawned this overlay — not to entertain. It runs on the compositor so it stays at 60fps mid-fetch.

**ACCEPTED**
- Animate **only `transform`/`opacity`** using brand spec §6 tokens (micro 80ms / short 160ms / base 240ms). Modal: fade scrim + scale .98→1 on `--ease-out`; dropdown: opacity + translateY 4px; button press: scale .97 `--ease-spring`; the proposal card pops once on arrival (your move); the confirmed row slides into the list (the eye follows where it landed).
- JS-driven motion independently checks `prefers-reduced-motion` and removes the animation while keeping the resulting state.

**NOT ACCEPTED**
- Animating `width`/`height`/`top`/`margin` (layout thrash → jank). Looping/ambient animation, an "AI thinking" mascot, parallax, durations >~480ms on a tooling surface. Inventing durations/easings instead of the `--dur-*`/`--ease-*` tokens. A spinner where a skeleton would be calmer.

**WHY** — Layout-animating jank is exactly what users consciously read as "cheap." `transform`/`opacity` stay on the compositor → CLS≈0 even during a fetch. Motion that maps to cause-and-effect aids comprehension; gratuitous motion is noise and a vestibular (WCAG 2.3.3) risk.

**AWARD-WINNING STRATEGY** — Stripe and Linear scale-fade overlays *from their trigger* and slide rows in on create; you always know what your action produced. Asymmetric timing (expressive in, faster out) reads as confident, not bouncy.

---

## §7 — Pillar 7: Voice, density, and the path to scale

The words and the row density are part of the design. The standard picks one density and names the growth path so two implementers build the same screen.

**ACCEPTED**
- **Labels speak the operator's language:** "This looks like a Policy," "Confirm: Policy," "Test search." Verbs describe the outcome. English (CLAUDE.md §0).
- **Error copy is a human sentence tied to the cause:** `parse_failed.reason` maps to "We couldn't read this PDF — it may be scanned. Try a text-based file," never "Parse failed." Inline + retry.
- **List density for /knowledge: roomy, card-like rows with breathing room** — *not* the brand spec's 40px compact data-tooling mode, and no sticky toolbar. /knowledge is a narrative screen, not a data grid. **[OPERATOR CONFIRMED 2026-06-20]** — the operator confirmed this override of brand spec §3/§8 (which still governs the data-tooling screens elsewhere in the app); /knowledge ships roomy cards + no toolbar at rest.
- **Destructive actions are guarded:** delete/re-classify asks confirm-before-destroy or ships an undo toast; delete is a quiet text/ghost destructive control, never a second coral button. A single click never irreversibly destroys without an undo path.
- **Latency budgets (measurable, not "feels fast"):** search keystroke→first feedback ≤100ms (optimistic/local); confirm→optimistic [I]→[V] flip ≤60ms; upload→first "Reading…" feedback ≤200ms; embedding/search round-trips show skeleton immediately and may take seconds (honest pending, not "frozen").
- **Responsive (platform is mobile-first, CLAUDE.md §1):** the single column collapses gracefully; the proposal uses the `Modal` on all sizes, the doc detail uses a right drawer on ≥md and a full-height sheet on <md; the ~70ch reading column becomes full-width-minus-gutter on mobile.
- **Scale path:** the "no toolbar at rest" rule holds for a short list; once the base exceeds ~50 docs, a single search/filter-the-list input appears above the list and rows virtualize. This is progressive disclosure applied to the list itself, not a reintroduced toolbar.

**NOT ACCEPTED**
- Schema/enum jargon in the UI ("KB_DOC_TYPE_CD", "chunk_status_enum=2"). "Submit"/"Process"/"Execute" with no object. Centered body text or triplet filler cards. Emoji as section headings. Glassmorphism/backdrop-blur over content (tanks contrast). A 200-doc list with no search-the-list and no pagination.

**WHY** — Jargon forces the operator to maintain a mental translation table — pure extraneous load and the #1 reason enterprise tools "feel built for the database, not for me." Without a number, "feels fast" is unfalsifiable (Linear targets 50–60ms). Without a resolved density and scale path, two implementers ship two screens.

**AWARD-WINNING STRATEGY** — Stripe and Gov.uk win on human error copy; Linear ships explicit latency budgets and virtualizes long lists; Notion's gallery/list views show 3–4 decision fields and defer the rest to a detail panel.

---

## §8 — Applied to the /knowledge screen

The screen has one job, one objective at a time: **drop a file → the AI says "this looks like a Policy" and the human confirms in one click → see it in a list → test the semantic search.**

**DO**
- Lay it as a single centered column (`max-inline-size: ~70ch; margin-inline: auto; padding-inline: var(--space-gutter)`), three stacked zones with `--space-section` rhythm: (1) Add-a-document, (2) doc list, (3) search tester. The eye travels down once.
- First run = the onboarding empty state with one coral "Add a document"; the search tester is de-emphasized (`--mxm-contentSecondary`, disabled, helper "Add a document first") until one confirmed doc exists.
- Upload = a 2-beat calm moment in the reused `Modal` (focus-trap + Esc + focus-return + `aria-modal`). Beat 1: one large dropzone (dashed 1px `--mxm-backgroundSecondary`, radius 12px, accepts `.pdf,.md,.markdown,.txt`), one line of copy, no title/description/tags fields. Skeleton + `aria-live` "Reading your document…" while `knowledge.upload` runs. Beat 2: verdict **plus a one-line reason** — "This looks like a **Policy** — it sets refund and cancellation rules" — + Confirm (coral, Enter) + quiet "Change type" link revealing the select; the fuller classifier evidence sits behind a quiet "Why?" disclosure, never dumped inline.
- Provenance as one calm pill, redundant icon+text: proposed = AI glyph + "Suggested" (muted surface); confirmed = check + "Confirmed" (green at low alpha via `color-mix`). `[I]`/`[V]` live in `title`/aria only. `parse_failed` = distinct error pill (icon + "Could not read") with the human reason on hover.
- Search tester = one full-width input ("Ask the base a question…", `⌘K`/`/` focuses it), skeleton hit-cards + `aria-live` count on submit. Each hit is a flat card that shows *why it matched and where it came from*: the matched ~3-line snippet (the evidence), the source filename + type pill (the provenance), and a humanized match cue ("Strong / Partial match" or a thin tinted track) — the raw `similarity` float and the full matched passage reachable only on expand/tooltip, never the loud token.
- Every color resolves to a named `--mxm-*` token; depth via layered surfaces (#131313 → #1F1F1F → #343434 border), never shadow soup; the only delight is the upload→confirm reveal and the Indexing→Searchable swap.

**DON'T**
- Render `chunkId`, `docId`, raw `similarity` floats, embedding model, or the provenance jsonb on the list surface.
- Open as a populated filterable grid with a toolbar. Show the 6-type select by default (it's a correction path, not the default). Print bare `[I]`/`[V]` strings or a color-only status dot.
- Use purple (no upgrade concept here), any gradient, glassmorphism, or a light-mode variant. Show a search hit or "Searchable" before its producer computed it.
- Re-tokenize risk: any shadcn/ui component used must be re-pointed to `--mxm-*` and the global coral `:focus-visible` ring re-applied — shadcn defaults ship a neutral palette and often strip focus rings.

---

## §9 — Design-review checklist (binary; run against any screen)

A reviewer answers yes/no to each. Any "no" blocks ship.

1. Does this state have **one obviously dominant element** serving the screen's governing thought — on an action screen exactly one filled-coral button (count them in the DOM), on an awareness screen the key signal/answer — with no equal-weight wall?
2. Is every non-primary control ghost/text/monochrome, and is purple absent unless it means upgrade?
3. On first paint, is only the current objective visible (no toolbar/filter rail/columns for deferred features)?
4. Is advanced metadata (ids, raw floats, model, jsonb) off the primary surface, behind expand/drawer?
5. Is every AI output a proposal with a one-click, equal-weight correct/dismiss path, written only on the human click?
6. Does **every** async surface render four *distinguishable* states (empty / loading-skeleton / error+retry / success)?
7. Is optimistic UI applied only to human-intent fields, and is no producer-computed result (similarity, "Searchable") shown before its job ran?
8. Are the two empty states (empty base vs no-match) distinct messages, not one blank?
9. Is every status color + icon + text (passes a grayscale screenshot)?
10. Does axe/Lighthouse pass: body ≥4.5:1, focus-ring/UI ≥3:1, brand buttons measured (not assumed)?
11. Is the full happy path operable mouse-free, with focus managed across async step changes and returned on close?
12. Are all interactive targets ≥24×24 CSS px (≥44 on coarse pointers)?
13. Does motion animate only transform/opacity with spec tokens, and does reduced-motion remove the animation but keep the state change?
14. Is all copy human (no schema/enum jargon), and does each error map to a human sentence tied to its cause?
15. Does a destructive action confirm or offer undo, and is it visually quieter than the primary?
16. **Squint test:** blur the screenshot — is the dominant element (the coral action on an action screen, or the key signal on an awareness screen) still the clearest focal point, and are the major groups still distinct blocks? (no competing co-equal blobs, no even-grey field)
17. Is every color a named `--mxm-*` token, dark-only, with no gradient/glassmorphism in chrome?
18. Does the layout reflow at 320px / 200% / 400% zoom with no 2D scroll, and is the list scale path (search-the-list / virtualize past ~50 rows) handled?

---

## §10 — Definitions

- **Governing thought (per screen)** — the one sentence naming what a screen must let the operator *do* or *know*, declared before layout; every element earns its place by serving it. It is distinct from the global philosophy (calm/honest) — it is *what this screen is for* — and it decides whether the screen is an action narrative (one primary CTA) or an awareness overview (lead with the signal, actions secondary).
- **Progressive disclosure** — reveal only what the current decision needs; defer rare/advanced surfaces (config, raw metadata) to a secondary layer summoned on demand. The mechanism that enforces "one objective at a time."
- **Visual hierarchy** — the order the eye reads elements, set by weight/color/spacing before size. On a near-black canvas, *lightness* (white → #BDBDBD → #828282) is the cheapest hierarchy signal.
- **Optimistic UI** — apply a mutation in the UI immediately and reconcile with the server in the background, rolling back on error. Allowed here **only on human-intent fields** (the type a human picked), forbidden on producer-computed results.
- **The four states** — every async surface must render and visually distinguish: **empty** (guides), **loading** (skeleton sized to final layout), **error** (inline + retry), **success**. Collapsing any two is a defect.
- **Fake-green** — showing a success/result (a checkmark, "Searchable," a search hit) before the producing job actually ran. The UI sibling of seeding a result number (CLAUDE.md §14) — banned.
- **Provenance [I]/[V]** — [I] = inferred/AI-proposed; [V] = verified/human-confirmed. Carried as a human label + icon + color; the raw code lives in `title`/aria only.
- **[C]-class signal** — a classifier/cosine number (confidence, similarity) that is an inference, not a deterministic KPI; shown as a qualitative cue ("High / Strong match"), the float reachable but never the loud token.
- **Squint test** — blur the rendered screen (a review technique, not a build rule): the primary action must remain the brightest blob and group boundaries must survive. If hierarchy survives blur, real users find the action instantly.
- **Skeleton** — a placeholder shaped like the final content (right row height/columns) shown during load, so layout never shifts (CLS≈0) and paint feels instant. Preferred over a spinner for content regions.
- **Latency budget** — an explicit per-interaction time target (e.g. optimistic flip ≤60ms) that makes "feels fast" falsifiable.
- **Signature moment** — the single choreographed beat that proves the loop worked. On /knowledge it is "Indexing…" → "Searchable."
- **[OPERATOR DECIDES]** — a point where this standard overrides or diverges from the brand spec; the operator must confirm the override before ship.
