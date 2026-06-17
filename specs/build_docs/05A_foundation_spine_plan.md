# 05A Vertical Spine — Implementation Plan (revised)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (Writer + adversarial Reviewer per piece, CLAUDE.md §7). One piece = one commit citing `piece_id` + `04 §`.

**Status: PAUSED — waiting for the foundation to close** (Leo's call: a parallel builder is actively writing the shared foundation + slice-01 Cohorts; building 05A now would collide). This plan builds the 4 logic pieces ON TOP of the live fresh scaffold once the dependencies below exist.

**Goal:** Implement a 4-piece vertical spine of Pantalla 05A as deterministic, fail-closed logic on the existing scaffold — `A.4.6` min() motor (conversa path), `A.1.2` PII redaction, `A.2.2` grounding gate, `A.1.1` recv+tenant+create Conversa.

**Architecture:** Logic-on-foundation. The data model (all tables) and the shared `min()` motor are owned by the data-architecture/foundation layer. My pieces only READ/WRITE existing tables via `server/db/pool.ts` and resolve `tenant_id` server-side via `tenantProcedure`. No DDL in feature pieces (breakdown contract: "reusar el writer; no inventar tabla").

**Tech Stack (live scaffold, ADOPTED — supersedes the earlier bocatas-bootstrap idea):** Vite 7 · TS strict · React 19 · tRPC v11 · Express · Supabase Postgres via `pg` (raw SQL, no ORM) · `jsonwebtoken` · **Zod v3** · Vitest 3 (projects: unit/antifake/integration) · `supabase test db` (pgTAP) · Playwright+axe · pnpm.

---

## Ownership decision (grounded in `specs/breakdown_CODE_AGENT.md` + `04`)

**Foundation builder owns the tables; I own the logic.**
- Breakdown: every piece "reusa el writer / no inventar tabla" (e.g. A.1.1 L1432). Only DDL piece = `02:MEJORA-D-ENTITIES`.
- `min_calculo` funde P02+P05A (`04 §3.3` L275-289; XOR `nba_id|conversa_id`; FKs `Eval_Cell`,`Politica_Tier`) → shared `gov` zone.
- `Conversa_Episodio` = fat-by-process `tenant` table (`04 §3` L68), consumed by 05B/C/DE.
- Parallel builder already in `gov` zone (`gov.sql`) → it creates `min_calculo`/`Decision_Trace`/`Conversa_Episodio`.

## Readiness signal — RESUME only when ALL exist & stable on the live scaffold

- [ ] `tenant."Conversa_Episodio"` table per `04 §3` L105-112 (episodio_id PK, conversa_id, tenant_id, restaurante_id, canal, estado_conversa, turnos jsonb, capa_transcripcion/estructurada/metricas jsonb, provenance_por_campo).
- [ ] `gov."min_calculo"` table per `04 §3.3` L275-289 + the shared least() motor (`compute`/`v_min_calculo`, from `02:1B`).
- [ ] `gov."Decision_Trace"` table per `04 §3.3` L267-273 (for A.4.8 later; A.4.6 spine needs only min_calculo).
- [ ] `catalog."Config_Perillas"` seeded with `TTL_baseline`, `piso_confianza` (read via `catalog.perilla_required_num`). Table + helper fns already exist.
- [ ] `supabase/seed.sql` present (brutos only — NO result numbers, NO `min_calculo` rows).
- [ ] `pnpm install` done (node_modules present), `pnpm typecheck && pnpm lint` green, local supabase (`pnpm db:start`, docker ✓) reachable.

## Scaffold conventions to honor (verified by reading the live files)

- Tenant server-side: wrap mutations in `tenantProcedure` (`server/_core/trpc.ts`); read `ctx.tenantId` (never body).
- DB access: `query(sql, params)` / `withTx(fn)` from `server/db/pool.ts`. Raw parameterized SQL.
- Thresholds BY NAME: SQL `catalog.perilla_required_num('TTL_baseline')` (raises fail-closed if missing) — never a literal.
- Enums: ordered `public.nivel_autonomia` ('BAJA','MEDIA','ALTA'); `estado_conversa` has no `resuelto`.
- Tests: unit in `server/**/*.test.ts` (vitest project `unit`); anti-fake in project `antifake`; SQL/pgTAP via `supabase test db`.
- Register routers in `server/routers/_app.ts` — **shared file; coordinate to avoid clobbering the parallel builder's edits** (append my router, re-read before edit).

---

## Pieces (each: R0 reuse-scan → R1 contract → R2 RED test → R3 impl ≤100ln → R4 GREEN+anti-fake → R5 gates → R6 observability → R7 commit). Dispatch one Writer subagent + one fresh adversarial Reviewer per piece.

### Piece 1 — `05A:A.1.2` PII redaction (pure TS, no DB — buildable first, zero foundation dep)
**Files:** Test `server/pieces/__tests__/pii.test.ts`; impl `server/pieces/pii.ts`.
- RED test: redacts email/phone/IBAN/card before persist; `residualPII=false` after; fail-closed flag if a known pattern still matches.
```ts
import { describe, it, expect } from 'vitest';
import { redactPII } from '../pii';
describe('redactPII (A.1.2, BR-A2)', () => {
  it('redacts contact PII', () => {
    const r = redactPII('mail juan@acme.com tel 600123456 IBAN ES9121000418450200051332');
    expect(r.texto).not.toMatch(/juan@acme\.com|600123456|ES91/);
    expect(r.residualPII).toBe(false);
  });
});
```
- GREEN: `server/pieces/pii.ts` ≤100 ln — regex set (email/phone/IBAN/card) → `[REDACTED:<type>]`; `residualPII` = any pattern still matches post-redaction (caller must NOT persist if true). Deterministic, no LLM.
- Commit: `feat(05A:A.1.2): deterministic PII redaction, fail-closed on residual (BR-A2, 04 §7)`.

### Piece 2 — `05A:A.2.2` grounding gate (pure TS; TTL by name)
**Files:** Test `server/pieces/__tests__/grounding.test.ts`; impl `server/pieces/grounding.ts`.
- RED: passes iff 4 checks (freshness≤TTL / sourceResponded / unambiguous / tenantMatches); else `{verified:false, estado:'no_verificable'}`.
```ts
import { describe, it, expect } from 'vitest';
import { groundingGate } from '../grounding';
const ok = { freshnessMs:1000, sourceResponded:true, unambiguous:true, tenantMatches:true };
it('all 4 pass → verified', () => expect(groundingGate(ok, 60000).verified).toBe(true));
it.each([['stale',{...ok,freshnessMs:60001}],['nosrc',{...ok,sourceResponded:false}],['ambig',{...ok,unambiguous:false}],['xtenant',{...ok,tenantMatches:false}]])
  ('fail-closed %s', (_n,i)=>{ const r=groundingGate(i as any,60000); expect(r.verified).toBe(false); expect(r.estado).toBe('no_verificable'); });
```
- GREEN: `groundingGate(checks, ttlMs)` ≤100 ln. The tRPC caller supplies `ttlMs` from `catalog.perilla_required_num('TTL_baseline')` — never a literal in the gate.
- Commit: `feat(05A:A.2.2): grounding gate 4-checks fail-closed, TTL by name (BR-A1, 04 §7)`.

### Piece 3 — `05A:A.1.1` recv + tenant + create Conversa (tRPC + DB; needs Conversa_Episodio)
**Files:** Test `server/routers/__tests__/conversa.test.ts`; impl `server/routers/conversa.ts`; register in `server/routers/_app.ts`.
- RED: tenant from `ctx` not body (anti-spoofing); fail-closed if `ctx.tenantId` falsy; idempotent on `(conversa_id, tenant_id)`.
- GREEN: `createConversaHandler(ctx, input)` ≤100 ln — Zod v3 input (canal/restauranteId/conversaId; rejects body tenant_id); `withTx` upsert into `tenant."Conversa_Episodio"` by `(conversa_id, tenant_id)`; throw if no tenant. Wrap as `tenantProcedure` mutation in `conversa.ts`. Reuses `tenantProcedure` + `pool`.
- Commit: `feat(05A:A.1.1): recv + server-side tenant + idempotent Conversa create (BR-A2/A4, 04 §7)`.

### Piece 4 — `05A:A.4.6` min() motor, conversa path (needs gov.min_calculo + shared least() fn)
**Files:** Test `tests/05A_antifake.test.sql` + `server/pieces/__tests__/min.test.ts`; impl `server/pieces/min.ts`.
- RED (anti-fake FIRST, §3): after seed, before any producer, `select count(*) from gov."min_calculo"` = 0 (never seeded).
- RED (determinism): shared least() fn picks min over ordered enum; null arm → BAJA (fail-closed).
- GREEN: `server/pieces/min.ts` ≤100 ln — INSERT a `gov."min_calculo"` row for the conversa path (`conversa_id` set, `nba_id` null) using the **shared** least() motor (reuse `02:1B`; do NOT reimplement the math in TS). Math stays in SQL.
- Commit: `feat(05A:A.4.6): min() motor conversa-path least() + anti-fake gate (04 §14, BR-A5)`.

---

## Final gate + deploy (after pieces)
- `pnpm ci` (lint·typecheck·test·test:sql·test:antifake) green WITH evidence (CLAUDE.md §5).
- Adversarial review of risk-max pieces (A.4.6 anti-fake, A.1.1 tenant) in fresh context vs Done-when before merge.
- Deploy: still needs Leo's Supabase prod creds + GitHub repo + PAT. `git init` (repo isn't git yet) → feature branch → push → CI green on PR.

## Verification (E2E)
1. `pnpm test:antifake` — min_calculo empty pre-run; RESULT cols NULL.
2. `pnpm test:sql` — least() over ordered enum; null→BAJA.
3. `pnpm test` — PII fail-closed; grounding 4-check fail-closed; tenant server-side + idempotent.
4. `pnpm typecheck && pnpm lint` green.
