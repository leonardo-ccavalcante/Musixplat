# Design Spec — Dark SaaS Style (Musixmatch-derived)

Reusable visual language for a NEW platform. Product-specific structure stripped — style/system only.

Character: dark-only, near-black canvas, heavy Gordita headlines, coral primary + purple upgrade accent, flat rounded border-defined surfaces, fluid 4px grid. Two densities: roomy marketing, compact data tooling.

Posture: **fluid, modern, award-tier UI/UX**. Responsive by default. Accessible by default. EU-law compliant (see §11).

Rules for code agent:
- Dark theme only. Set `color-scheme: only dark`.
- Use exact tokens. No invented colors.
- Fluid first: type + layout space scale with `clamp()`. No fixed-px page layout.
- Logical properties everywhere (`*-inline`, `*-block`, `inset-*`) → RTL/i18n + reflow ready.
- Match radius/border/motion ladders.
- `TBD` = pick deliberately. `~` = approx, tune to comp.

---

## 1. Color tokens

```css
:root {
  color-scheme: only dark;

  /* surfaces */
  --mxm-backgroundPrimary: #131313;          /* page bg */
  --mxm-backgroundPrimaryElevated: #1F1F1F;  /* cards, overlays */
  --mxm-backgroundSecondary: #343434;        /* input border, option hover, toggle-off */
  --mxm-backgroundTertiary: #757575;         /* checkbox border, toggle-on, input hover border */
  --mxm-backgroundHover: rgba(255,255,255,0.05);
  --mxm-backgroundPress: rgba(255,255,255,0.05);  /* same as hover — see §13 */

  /* content */
  --mxm-contentPrimary: #FFFFFF;
  --mxm-contentPrimaryInverted: #131313;
  --mxm-contentSecondary: #BDBDBD;
  --mxm-contentTertiary: #828282;

  /* brand accents */
  --mxm-paletteBrand100: #FC532E;            /* PRIMARY action + active nav */
  --mxm-palettePurple100: #9013FE;           /* upgrade / premium accent */
  --mxm-paletteGreen100: #00CC99;            /* success */

  /* status */
  --mxm-systemRed100: #F54B40;     --mxm-systemRed200: #D32F2F;
  --mxm-systemGreen100: #4CAF50;   --mxm-systemGreen200: #388E3C;
  --mxm-systemYellow100: #F0A83B;  --mxm-systemYellow200: #B37922;
  --mxm-systemBlue100: #2979FF;    --mxm-systemBlue200: #0039CB;
  --mxm-systemMagenta100: #FF0E83; --mxm-systemMagenta200: #AD0959;

  --mxm-shadow: rgba(19,19,19,0.08);

  /* derive hover/press tints from any token w/ color-mix — modern, no hardcode */
  /* ex: background: color-mix(in oklab, var(--mxm-paletteBrand100) 88%, black); */
}
```

### Palette ramps (10/20/70/100/200/300)

| Hue | 10 | 20 | 70 | 100 | 200 | 300 |
|---|---|---|---|---|---|---|
| Blue | #171F30 | #25325D | #415AB8 | #5677FC | #3859D7 | #2433B6 |
| Brand | #380B01 | #661300 | #A02208 | #FC532E | #A02208 | #661300 |
| Green | #0E2726 | #00493E | #058567 | #00CC99 | #00AE7B | #008666 |
| Grey | #1B2023 | #323638 | #545454 | #828282 | #CCCCCC | #F2F2F2 |
| Purple | #1D1530 | #36145E | #6A14B9 | #9013FE | #6F05D6 | #5709A3 |
| Yellow | #272516 | #554611 | #B08707 | #F5B800 | #EB920C | #D06503 |

Brand 20==300, 70==200 (dup, keep).

### System status ramps (10/70/100/200)

| Hue | 10 | 70 | 100 | 200 |
|---|---|---|---|---|
| Blue | #17335E | — | #2979FF | #0039CB |
| Green | #1C3424 | — | #4CAF50 | #388E3C |
| Magenta | #40142E | — | #FF0E83 | #AD0959 |
| Red | #3E2021 | #82302D | #F54B40 | #D32F2F |
| Yellow | #534123 | — | #F0A83B | #B37922 |

### Service brand colors (only if 3rd-party platform icons)
`AmazonMusic #46C3D0` · `AppleMusic #FF2D55` · `Facebook #1877F2` · `Instagram #E1306C` · `Spotify1 #1ED760`/`Spotify2 #1DB954` · `TikTok #FFFFFF` · `Twitter #FFFFFF` · `Vimeo #18D5FF` · `YouTube #FF0000`

### Semantic usage

| Role | Token |
|---|---|
| Page bg | #131313 |
| Card / overlay | #1F1F1F |
| Input border rest/hover/active | #343434 / #757575 / #FFFFFF |
| Table/dropdown border, row hover | rgba(255,255,255,.05) |
| Text primary/muted/faint | #FFFFFF / #BDBDBD / #828282 |
| Primary + active nav | #FC532E |
| Upgrade / premium | #9013FE |
| Success | #00CC99 |

---

## 2. Typography — fluid

- Display: **Gordita Bold** (`gordita-bold.woff2`).
- Body: family TBD. Fallback `system-ui, sans-serif`.
- Self-host woff2, `font-display: swap`, preload display face.
- Numbers in tables: `font-variant-numeric: tabular-nums`.

Fluid scale — `clamp(min, preferred, max)`. Scales smooth 320→1440px. No breakpoint jumps.

```css
:root {
  --font-display: clamp(2.5rem, 1.5rem + 5vw, 3.5rem);    /* 40→56 hero */
  --font-h1:      clamp(2rem, 1.4rem + 3vw, 2.5rem);      /* 32→40 */
  --font-h2:      clamp(1.5rem, 1.2rem + 1.5vw, 1.875rem);/* 24→30 */
  --font-h3:      clamp(1.25rem, 1.15rem + 0.5vw, 1.375rem);/* 20→22 */
  --font-body:    clamp(0.9375rem, 0.9rem + 0.2vw, 1rem); /* 15→16 */
  --font-small:   clamp(0.8125rem, 0.8rem + 0.1vw, 0.875rem);/* 13→14 */
}
```

- Headings sentence case, Gordita Bold, line-height ~1.05–1.15.
- Body line-height ~1.5. Measure 60–75ch max (`max-inline-size: 70ch`).
- Use `rem` not `px` → respects user font-size (EU 1.4.4).
- Big confident headlines = main visual weight.

---

## 3. Spacing & layout — fluid

Grid base **4px** for component internals (fixed). Layout/section rhythm = fluid.

```css
:root {
  /* fixed component scale */
  --space-3xs: 2px; --space-2xs: 4px; --space-xs: 8px;
  --space-sm: 12px; --space-md: 16px; --space-lg: 24px;
  --space-xl: 32px; --space-2xl: 48px; --space-3xl: 64px;

  /* fluid layout space */
  --space-section: clamp(2rem, 1rem + 5vw, 5rem);   /* vertical section rhythm */
  --space-gutter:  clamp(1rem, 0.5rem + 2vw, 2rem);  /* page inline padding */
  --content-max: 1280px;
}
```

- Component insets stay on 4px grid: input `8px 16px`, option `4px 8px`, dropdown row `4px 12px`, panel `16px`.
- Page inline padding = `--space-gutter` (never 0 on mobile). Use `padding-inline`.
- Content column: `max-inline-size: var(--content-max); margin-inline: auto`.
- Two densities by surface: marketing roomy (big hero, `--space-section`); data tooling compact (~40px rows).

---

## 4. Responsive system — MUST

Mobile-first. Fluid carries most of it; breakpoints only for layout SHAPE change.

```css
/* breakpoints (min-width, mobile-first) */
--bp-sm: 480px; --bp-md: 768px; --bp-lg: 1024px; --bp-xl: 1280px;
```

Rules:
- **Container queries** for components (card, table, nav) — component responds to its slot, not viewport. Modern, reusable.
  ```css
  .card-grid { container-type: inline-size; }
  @container (min-width: 480px) { .card { /* 2-up */ } }
  ```
- **Layout transforms** at breakpoints: side-rail → top bar / drawer on `<md`; multi-col → stack; table → cards on `<md` (give each row a labeled card).
- **No fixed widths** on layout. Use `%`, `fr`, `minmax()`, `clamp()`.
- **Touch vs pointer:** `@media (hover: hover)` for hover affordances; `@media (pointer: coarse)` bump target size.
- Test at 320px, 768px, 1024px, 1440px + 200% and 400% zoom.

Reflow (legal, §11): content works at **320 CSS px** wide, no 2D scroll. No horizontal scroll except data tables (allowed). Sticky chrome must not eat >viewport on small screens.

---

## 5. Radius / border / shadow / z-index

**Radius:** sm 4px (checkbox, chip) · md 8px (inputs, select, table, button, toggle track) · lg 12px (cards, dropdown/menu) · full 9999px (pill, toggle dot, avatar). Use logical: `border-radius` fine, but corners consistent per tier.

**Border:** 1px default. 2px on menu chrome + checkbox. Solid. Use `border-color` from tokens; tint with `color-mix`.

**Shadow:** elevation by layer, restrained.
```css
--shadow-overlay: 0 8px 24px rgba(0,0,0,0.2);  /* dropdown/menu/modal */
```
Cards flat (border-defined). Don't over-shadow. `--mxm-shadow` token unused — skip.

**Z-index scale (use named, layer consistently):**
```css
--z-sticky: 10; --z-toolbar: 20; --z-dropdown: 100;
--z-overlay: 1000; --z-modal: 1100; --z-toast: 1200; --z-tooltip: 1300;
```

---

## 6. Motion — modern, award-tier

Restrained but alive. Every interactive element gives feedback. Choreography, not chaos.

```css
:root {
  /* easing tokens */
  --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);   /* enter — expressive */
  --ease-in:     cubic-bezier(0.7, 0, 0.84, 0);   /* exit */
  --ease-inout:  cubic-bezier(0.65, 0, 0.35, 1);  /* move */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);/* press/pop micro */

  /* duration ladder */
  --dur-micro: 80ms; --dur-short: 160ms; --dur-base: 240ms;
  --dur-med: 320ms; --dur-long: 480ms;
}
```

| Interaction | Property | Dur | Easing |
|---|---|---|---|
| Button/row hover | bg, transform | micro–short | ease-out |
| Button press | transform scale .97 | micro | ease-spring |
| Toggle dot slide | translate | short | ease-spring |
| Dropdown/menu open | opacity + translateY 4px + scale .98→1 | short | ease-out |
| Dropdown close | reverse | micro | ease-in |
| Panel expand | grid-rows 0fr→1fr (or max-height) | base | ease-inout |
| Sticky header move | top | base | ease-inout |
| Modal/drawer | fade scrim + slide/scale content | base | ease-out |

- **Page/route transitions:** View Transitions API (`@view-transition`) where supported, graceful fallback.
- **Micro-interactions:** subtle hover lift, focus ring fade-in, optimistic check on toggle. Tasteful, fast.
- **GPU-cheap props only:** `transform`, `opacity`. Avoid animating layout.
- **Reduced motion MUST:**
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration:.01ms !important; transition-duration:.01ms !important; }
  }
  ```

---

## 7. Modern CSS — use these

- **Logical properties** everywhere: `padding-inline`, `margin-block`, `inset-inline-start`, `border-start-start-radius`. → RTL/i18n + reflow for free.
- **Container queries** for components (§4).
- **`:focus-visible`** for keyboard-only rings (not `:focus`).
- **`color-mix(in oklab, …)`** for hover/press/disabled tints from base tokens — no hardcoded shade soup.
- **`:has()`** for parent/sibling state (e.g. `.field:has(:invalid)`).
- **`accent-color`** for native checkbox/radio fallback.
- **`clamp()`** for fluid type + space (§2,§3).
- **`prefers-reduced-motion`**, **`prefers-contrast`**, **`prefers-reduced-transparency`** honored.
- **`text-wrap: balance`** on headings, `pretty` on body.
- **`scrollbar-gutter: stable`** to stop reflow jank.

---

## 8. Components

### Focus ring (global — define ONCE, use all)
```css
:where(a,button,input,select,textarea,[tabindex]):focus-visible {
  outline: 2px solid var(--mxm-paletteBrand100);
  outline-offset: 2px;
  border-radius: inherit;
}
```
⚠️ Source removed outlines with no replacement. NEVER ship that.

### Table
- `width:100%; border:1px solid var(--mxm-backgroundHover); border-radius:8px`.
- ⚠️ if `border-collapse:collapse` + radius → corners won't round. Use wrapper `overflow:hidden` or `border-collapse:separate`.
- Header/cell height ~40px (compact). Sticky header `top:0; z:--z-sticky`. Pinned cols sticky z 2.
- Row hover bg `rgba(255,255,255,.05)`. Tabular-nums in numeric cols.
- `<md`: collapse to labeled cards (reflow).

### Select / search input
- `padding:8px 16px; gap:8px; radius:8px; border:1px solid var(--mxm-backgroundSecondary)`.
- Overlay: `bg #1F1F1F; border:1px solid #343434; radius:8px; box-shadow:--shadow-overlay`. Options `max-height: min(50vh, 320px); overflow:auto`. Option `padding:4px 8px`.
- Borders: rest #343434 · hover #757575 · active #FFFFFF · active-hover #BDBDBD · option-hover bg #343434.
- Add `:focus-visible` ring. Open anim §6.

### Checkbox
- `18×18; border:2px solid #757575; radius:4px; bg #131313; appearance:none`.
- Checked: bg+border #FFFFFF, tick `:after` 5×10 rotate45 #131313.
- ≥24px hit area (pad/pseudo). Add focus-visible.

### Toggle
- Track `28×16 radius:8px`; dot `12×12 radius:50% left:2px`. Off #343434 · On #757575 dot left:14px.
- Spring slide §6. ≥24px hit area. Focus-visible.

### Dropdown / menu
- `min-width:280px; radius:12px; border:2px solid var(--mxm-backgroundHover); box-shadow:--shadow-overlay; z:--z-dropdown`.
- Header `8px 12px`; list `max-height:360px; overflow-y:auto`; row `4px 12px`, hover bg `--mxm-backgroundHover`.

### Toolbar / filter bar
- `bg #131313; border-block-end:1px solid var(--mxm-backgroundHover); position:sticky; top:0; z:--z-toolbar`.
- Collapsible panel: animate `grid-template-rows 0fr→1fr` (cleaner than max-height).

### Buttons
- Primary solid coral #FC532E / Upgrade solid purple #9013FE / Ghost dark fill — white text.
- radius 8px, padding `~8px 16px`, min-height 44px on touch. Verb-first ≤3 words. 1 primary/panel.
- States: hover (lift + color-mix tint), press (scale .97 spring), focus-visible (ring), disabled (reduce opacity + `cursor:not-allowed`), loading (spinner + disable, keep width).

### Cards
- Bg #1F1F1F, radius ~12px, flat, border-defined. `container-type: inline-size`.
- Anatomy: optional media → title → body → meta/icon row → action. Clickable card: whole-card focus-visible + hover lift.

### Side-rail nav item
- Icon (outline) + label, white. Active: coral left-edge marker + lighter tint. ONE active style everywhere.
- `<md`: collapse to bottom bar or drawer (focus-trap when open).

### Badges / pills
- Accent pill purple #9013FE (premium/highlight). Emphasis labels ALL-CAPS. radius full.

### Empty / loading / error states (award-tier — define for EVERY async surface)
- Empty: glyph + heading + body + primary action. Guide, don't blank.
- Loading: **skeleton** placeholders (shimmer via transform, off under reduced-motion). Prefer skeleton over spinner for content.
- Error: inline message + retry. Never silent fail.

### Inventory
Confirmed: table, select/search, input, checkbox, toggle, dropdown/menu, toolbar, buttons(3), cards, badges, avatars, empty/loading/error states, side-rail nav.
Build from system: radio, textarea, slider, tabs, modal, drawer, toast, tooltip, accordion, breadcrumb, stepper, pagination, spinner, skeleton.

---

## 9. Icons & imagery

- Nav icons: outline, single weight, white. Active + coral marker. One consistent set.
- Icon + label paired. Decorative icons `aria-hidden`; icon-only buttons need `aria-label`.
- 3rd-party platform glyphs: full-color, circular chips, official brand colors (§1).
- Spot art: glossy 3D tiles, photography, bold gradient promo banners. **Gradients only in artwork — never UI chrome.**
- Images: `aspect-ratio` set, `object-fit:cover`, lazy-load, width/height attrs (no CLS). Meaningful images need `alt`.

---

## 10. Voice & content

- Headings sentence case. Buttons verb-first ≤3 words. Onboarding warm, second-person.
- Emoji sparingly in headings. Emphasis labels/codes ALL-CAPS. Benefit-led, confident.

---

## 11. Accessibility + EU LAW — MUST comply

**Legal target: European Accessibility Act (Directive (EU) 2019/882), enforced from 28 June 2025.** Many consumer-facing digital products/services in the EU must be accessible. Conformance route = harmonised standard **EN 301 549**, which maps web to **WCAG 2.1 level A + AA**. Build to **WCAG 2.2 AA** to future-proof. (Not legal advice — confirm scope/applicability with counsel.)

Responsiveness-critical success criteria (the ones this section enforces):

| SC | Level | Rule |
|---|---|---|
| 1.4.4 Resize Text | AA | Zoom text to 200%, no loss of content/function. Use `rem`, `clamp`. |
| 1.4.10 Reflow | AA | Reflow to **320 CSS px** wide (≈400% zoom @1280), no 2D scroll. §4. |
| 1.4.12 Text Spacing | AA | Survive user overrides (line-height 1.5, etc). No fixed-height text boxes. |
| 1.3.4 Orientation | AA | Don't lock portrait/landscape. |
| 2.5.8 Target Size (Min) | AA (2.2) | Interactive targets **≥24×24 CSS px** (aim 44 on touch). |
| 1.4.11 Non-text Contrast | AA | UI components/states/focus ring ≥**3:1**. |
| 1.4.3 Contrast (text) | AA | Body **4.5:1**, large **3:1**. |
| 1.3.5 Identify Input Purpose | AA | `autocomplete` on known fields. |
| 2.4.7 Focus Visible | A | Visible focus always (§8 ring). |
| 2.4.11 Focus Not Obscured | AA (2.2) | Sticky chrome must not hide focused element. |

Plus general MUSTs:
- Semantic HTML + ARIA roles, landmarks (`<nav> <main> <header>`), labels. Source had none.
- Keyboard: full operability, logical tab order, no traps (except intentional modal trap w/ restore).
- Status = color + icon/text, never color alone.
- Live regions (`aria-live`) for async/toasts.
- `prefers-reduced-motion` honored (§6).
- Contrast (verify w/ tool): white-on-#131313 pass; #828282-on-#131313 borderline — bump to #BDBDBD for body; white-on-#FC532E borderline; white-on-#9013FE borderline. Confirm all before ship.

---

## 12. Award-tier UX patterns

- **Optimistic UI** for mutations (toggle/like/save) — update instantly, reconcile, rollback on error.
- **Skeletons** over spinners for content load (§8).
- **Every async surface** has loading + empty + error states.
- **Overlays:** focus-trap, restore focus on close, close on Esc + scrim click, scroll-lock body, `aria-modal`.
- **Toasts:** auto-dismiss ~5s, pause on hover/focus, stack, dismissible, `aria-live=polite`.
- **Forms:** inline validate on blur, error at field + summary, `aria-describedby`, never block typing.
- **Consistent feedback:** hover + press + focus on every interactive element.
- **Perf = UX:** no layout shift (CLS≈0), `scrollbar-gutter:stable`, lazy images, fast paint.

---

## 13. Build warnings

- Dark only. No light theme in source — define if needed.
- `border-collapse:collapse` + radius = no rounded corners. Wrapper.
- Source removed focus rings = a11y/legal bug. Restore (§8).
- Active nav style was inconsistent in source. Unify.
- Brand ramp dups (20==300, 70==200). Keep, know.
- `backgroundHover` == `backgroundPress` (same value). Differentiate press if it matters.

---

## 14. Pick before ship

font-family (body) · exact button/card dims · all interaction states · spacing/radius token names + 24/32/48 steps (mapped here) · light theme (if needed) · icon library · final breakpoint behaviors per page · platform IA (nav, layout, surfaces) · run axe/Lighthouse + manual SR + keyboard + 320px/200%/400% zoom audit for EN 301 549 / WCAG 2.2 AA before launch.
