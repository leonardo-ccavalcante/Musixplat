// Piece 05A:A.1.2 — Detección + redacción de PII (transform determinista, fail-closed).
// Invariant BR-A2 (04 §7): every client input is DATA never instruction; PII is redacted
// in input/response/log/write-back BEFORE anything is computed or stored. NO LLM — pure
// deterministic regex. The fail-closed guard `residualPII` uses an INDEPENDENT residual net
// (NOT a replay of the detectors): it strips the injected tokens, removes ALL punctuation,
// and flags any surviving long digit-run or email. So a detector blind spot still trips it
// and the caller MUST NOT persist (CLAUDE.md §3.7). Over-redaction is the safe direction.

export interface RedactResult {
  /** input with every detected PII span replaced by `[REDACTED:<tipo>]` */
  texto: string;
  /** true iff PII may still survive in `texto` (independent net) — caller must not persist */
  residualPII: boolean;
  /** distinct PII types redacted, sorted, e.g. ['email','iban','phone'] */
  tipos: string[];
}

type Tipo = "email" | "phone" | "iban" | "card";

// Detectors run in order: email, iban, card BEFORE phone, so a longer financial token is
// consumed first and its inner digit-run is never re-classified as a phone.
const DETECTORS: ReadonlyArray<readonly [Tipo, RegExp]> = [
  ["email", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  // IBAN: 2 letters + 2 check digits + 11..30 alnum, case-insensitive, optional single spaces.
  ["iban", /\b[A-Za-z]{2}\d{2}(?:[ ]?[A-Za-z0-9]){11,30}\b/gi],
  // Card / long numeric id: 13+ contiguous digits, or 13..19 split by single space/dash.
  ["card", /\b\d{13,}\b|\b(?:\d[ -]?){12,18}\d\b/g],
  // Phone: optional +, then 8..15 digits with any run of separators (space . - ( )) between.
  ["phone", /\+?\d(?:[\s.()-]*\d){7,14}/g],
];

const TOKEN = (t: Tipo): string => `[REDACTED:${t}]`;

// Independent fail-closed net (no /g ⇒ stateless .test):
const REDACT_TOKEN_RE = /\[REDACTED:(?:email|phone|iban|card)\]/g;
const RESID_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/; // any e@d.tld surviving
const RESID_DIGITS = /\d{8,}/; // 8+ digits after ALL punctuation is stripped (phone/card/iban)

/** Deterministically detect & redact PII. Same input ⇒ same output. */
export function redactPII(input: string): RedactResult {
  const found = new Set<Tipo>();
  let texto = input;
  for (const [tipo, re] of DETECTORS) {
    re.lastIndex = 0; // shared literals: reset so calls never share state (determinism)
    texto = texto.replace(re, () => {
      found.add(tipo);
      return TOKEN(tipo);
    });
  }

  // Fail-closed guard: drop the tokens we injected, then strip EVERY non-alnum char so any
  // separator style (space . - ( ) / etc.) collapses — a surviving 8+ digit run or an email
  // shape means PII may have leaked past the detectors. Letters still break digit runs.
  const scrubbed = texto.replace(REDACT_TOKEN_RE, " ");
  const collapsed = scrubbed.replace(/[^A-Za-z0-9]/g, "");
  const residualPII = RESID_EMAIL.test(scrubbed) || RESID_DIGITS.test(collapsed);

  return { texto, residualPII, tipos: [...found].sort() };
}
