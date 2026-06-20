export const meta = {
  name: 'design-standard-research',
  description: 'Research award-winning UI/UX, de-slop via SAT critique, synthesize a grounded DESIGN-STANDARD.md for validation',
  phases: [
    { title: 'Research', detail: '5 parallel lenses: exemplar teardown, principles canon, anti-patterns, interaction+a11y, applied-to-our-context' },
    { title: 'Critique', detail: 'SAT Devil-Advocacy de-slop: cut generic advice, sharpen real differentiators' },
    { title: 'Synthesize', detail: 'write docs/design/DESIGN-STANDARD.md (Pyramid: thesis -> MECE pillars -> applied to /knowledge -> checklist)' },
  ],
}

const REPO_CONTEXT = [
  'PROJECT: an AI-first Customer-Ops platform (Uber Eats domain), dark-only, brand tokens --mxm-* defined in Design/musixmatch-pro-design-spec.md, WCAG 2.1 AA required (CLAUDE.md §4). Stack: React 19 + wouter + Tailwind + shadcn/ui.',
  'THE OPERATOR PAIN (the reason this standard exists): existing enterprise screens (SAP, Salesforce style) are cluttered walls of controls where nobody understands anything. The operator wants modern, clean, award-winning UI/UX: focus, clear hierarchy, breathing room, progressive disclosure. Density is NOT power; clarity is the product.',
  'FIRST TARGET SCREEN: /knowledge (P06 Knowledge Base / RAG). Its job, one objective at a time: drop a file -> the AI says "this looks like a Policy" and the human confirms in one click -> see it in a list -> test the semantic search. No 20-button toolbar.',
].join('\n')

const LENSES = [
  {
    key: 'exemplars',
    prompt: [
      'LENS: Teardown of award-winning UI/UX products. Pick 5-6 genuinely acclaimed products for FOCUSED, data/productivity B2B-ish interfaces (e.g. Linear, Stripe Dashboard/Docs, Vercel, Notion, Raycast, Superhuman, Things, Height, Arc). For EACH, extract the SPECIFIC, CONCRETE patterns that make it feel premium — not vibes. Examples of the granularity required: Linear command palette + keyboard-first + instant optimistic UI; Stripe restrained palette + generous whitespace + one primary action per view; Raycast progressive disclosure + zero chrome until needed.',
      'You MAY use WebSearch/WebFetch to ground specifics and verify they are current — but every finding must name the product AND the concrete pattern (no generic "use whitespace").',
      'For each finding, also state how it would translate to the /knowledge screen described below.',
    ].join('\n'),
  },
  {
    key: 'principles',
    prompt: [
      'LENS: The operational design-principles canon. Distill the load-bearing, TEACHABLE rules from: Refactoring UI (Wathan/Schoger), Apple HIG, Material 3, Dieter Rams 10 principles, Gestalt laws, typographic scale + vertical rhythm, an 8pt spacing system, color/contrast theory, visual hierarchy (size/weight/color/space), and the "squint test".',
      'Convert each into an OPERATIONAL rule a reviewer can check (e.g. "establish one clear primary action per view, de-emphasize the rest" / "limit to 2 font weights and a single accent hue" / "space groups by relationship, not uniform gaps"). State the WHY (the perceptual/cognitive reason) for each.',
    ].join('\n'),
  },
  {
    key: 'antipatterns',
    prompt: [
      'LENS: Anti-pattern + AI-slop catalog. Enumerate precisely WHY enterprise UIs (SAP, Salesforce, classic admin panels) feel exhausting: cognitive overload, no hierarchy (everything same weight), dense data tables as default, modal-on-modal, jargon labels, premature configurability, no empty/loading/error care. ALSO enumerate the modern "AI slop" tells (generic purple gradients, centered everything, emoji headings, three identical feature cards, fake-green success states, meaningless glassmorphism).',
      'For EACH anti-pattern give: the tell (how to spot it), why it hurts the user, and the concrete fix. These become the "NOT ACCEPTED" column of the standard.',
    ].join('\n'),
  },
  {
    key: 'interaction-a11y',
    prompt: [
      'LENS: Interaction, motion, state, and accessibility. Cover: feedback + perceived performance (optimistic UI, skeletons vs spinners), the four states every component must design (empty / loading / error / success) and why never green-fake, micro-interactions and motion that informs (not decorates) with sane durations/easing, progressive disclosure patterns, keyboard-first + focus management (trap/Esc/return, aria-modal), and WCAG 2.1 AA specifics (contrast ratios, color-never-the-sole-carrier, hit targets, reduced-motion).',
      'Output operational ACCEPTED rules with the WHY, plus the matching NOT-ACCEPTED failure.',
    ].join('\n'),
  },
  {
    key: 'applied',
    prompt: [
      'LENS: Apply everything to OUR context. READ these repo files: Design/musixmatch-pro-design-spec.md (the --mxm-* brand), CLAUDE.md (§4 quality-per-unit), docs/superpowers/plans/2026-06-20-knowledge-base-rag.md (the /knowledge screen plan + flow), and shared/contracts_knowledge.ts if it exists (the data the screen shows).',
      'Produce CONCRETE accepted/not-accepted guidance for the /knowledge screen specifically: layout (single-column, one-objective-at-a-time), the upload->AI-proposes-type->confirm flow as a calm guided moment (not a form dump), how to show provenance ([I] proposed vs [V] confirmed) without clutter, how the search tester should feel, and how to stay strictly within --mxm-* dark-only tokens while still feeling premium. Flag any tension between the existing brand spec and the award-winning bar.',
    ].join('\n'),
  },
]

const RESEARCH_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    lens: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          principle: { type: 'string' },
          accepted: { type: 'string', description: 'what to DO, operationally' },
          notAccepted: { type: 'string', description: 'the failure/anti-pattern to avoid' },
          why: { type: 'string', description: 'the perceptual/cognitive/business reason' },
          exemplar: { type: 'string', description: 'named product or source that proves it' },
          appliedToKnowledge: { type: 'string' },
        },
        required: ['principle', 'accepted', 'notAccepted', 'why'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['lens', 'findings'],
}

phase('Research')
const research = (await parallel(LENSES.map((l) => () =>
  agent([l.prompt, '', 'OUR CONTEXT:', REPO_CONTEXT, '', 'Return structured findings. Be concrete, opinionated, and verifiable; reject anything generic.'].join('\n'),
    { label: 'research:' + l.key, phase: 'Research', schema: RESEARCH_SCHEMA, effort: 'high' })
))).filter(Boolean)

phase('Critique')
const critique = await agent([
  'You are a skeptical principal product designer running SAT Devil-Advocacy on a draft design standard. Below are research findings from 5 lenses. Your job: REFUTE design-slop. For each principle ask: is this a REAL, verifiable, differentiating rule that a designer at Linear or Stripe would defend, or is it generic filler that sounds nice and changes nothing? Cut the filler. Sharpen the survivors into one crisp, checkable sentence each. Then name what is MISSING that an award-winning standard must include.',
  '',
  'RESEARCH FINDINGS:',
  JSON.stringify(research, null, 2),
  '',
  'OUR CONTEXT:', REPO_CONTEXT,
].join('\n'), {
  label: 'sat-critique', phase: 'Critique', effort: 'high',
  schema: {
    type: 'object', additionalProperties: false,
    properties: {
      kept: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { rule: { type: 'string' }, whyReal: { type: 'string' } }, required: ['rule', 'whyReal'] } },
      cut: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { rule: { type: 'string' }, whySlop: { type: 'string' } }, required: ['rule', 'whySlop'] } },
      missing: { type: 'array', items: { type: 'string' } },
    },
    required: ['kept', 'cut', 'missing'],
  },
})

phase('Synthesize')
const synthesis = await agent([
  'You are writing the project DESIGN STANDARD as a single markdown file at docs/design/DESIGN-STANDARD.md (create the file with the Write tool; create the docs/design directory if needed). DO NOT git add or commit — just write the file. Write in clear English (it is a technical standard, like CLAUDE.md).',
  'Use the McKinsey Pyramid Principle: open with ONE governing thought (one sentence: what great UI for THIS product means), then 5-7 MECE pillars. Each pillar section MUST contain: a short intro, then explicit ACCEPTED (do this) / NOT ACCEPTED (never this) / WHY (the reason) / AWARD-WINNING STRATEGY (what named products like Linear/Stripe/etc do, concretely). Be specific and opinionated — zero generic filler (the critique below already cut the slop; honor it).',
  'Then a section "Applied to the /knowledge screen" with concrete do/dont for that exact screen (single-column, the upload->propose-type->confirm guided moment, provenance [I] vs [V] shown calmly, the search tester, strictly --mxm-* dark-only).',
  'End with a one-page "Design-review checklist" (a numbered, binary-checkable list a reviewer runs against any screen) and a short "Definitions" glossary (progressive disclosure, visual hierarchy, optimistic UI, the four states, squint test, etc).',
  'Ground everything in the brand: --mxm-* tokens only, dark-only, WCAG 2.1 AA. Where the existing brand spec and the award-winning bar conflict, note it explicitly for the operator to decide.',
  '',
  'SURVIVING + SHARPENED RULES (from SAT critique — these are the spine):',
  JSON.stringify(critique, null, 2),
  '',
  'FULL RESEARCH (for detail/exemplars):',
  JSON.stringify(research, null, 2),
  '',
  'OUR CONTEXT:', REPO_CONTEXT,
  '',
  'After writing the file, return: the path, the governing thought, the list of pillar titles, and a 4-6 bullet executive summary for the operator to validate.',
].join('\n'), {
  label: 'synthesis', phase: 'Synthesize', effort: 'high',
  schema: {
    type: 'object', additionalProperties: false,
    properties: {
      path: { type: 'string' },
      governingThought: { type: 'string' },
      pillars: { type: 'array', items: { type: 'string' } },
      executiveSummary: { type: 'array', items: { type: 'string' } },
    },
    required: ['path', 'governingThought', 'pillars', 'executiveSummary'],
  },
})

return { synthesis, critique: { cut: critique.cut, missing: critique.missing }, lensesRun: research.map((r) => r.lens) }
