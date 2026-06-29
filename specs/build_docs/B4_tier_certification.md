# 02:B4-TIER — Certificação de autonomia por TIER (não por cohort concreto) · [target: CÓDIGO] [build: Claude+Codex (risk-max §3)]

> Build-doc TRAVADO (Leo, 2026-06-28) após /problem-solving + /karpathy + /sat. Resolve a dor: hoje 1 golden-set = 1 cohort concreto → autoria infinita a 100k usuários. Decisão final: **certificar por TIER** (mínimo risco; é como o motor já pensa). Regras vivem em CLAUDE.md — referencia, não restate.

## Histórico de decisão (por que ESTE design)
- **/karpathy:** NÃO re-chavear o eval (a "Option A" intent×tier era alto blast-radius). A mudança é cirúrgica: só a RESOLUÇÃO de `released_evals` no `nba_engine.loadArms`.
- **/sat Key Assumptions Check (verificado LENDO o código):**
  - **[V]** `loadArms(cohortId)` NÃO recebe intent; lê `distinct released_evals` do cohort e se >1 valor → LOW (ambíguo). **O motor HOJE é intent-AGNÓSTICO** → por-tier cabe nele; intent×tier exigiria torná-lo intent-aware (descartado por ora).
  - **[V]** observatory já agrega `max(released_evals) group by tier_base` (CTE `proven`, `observatory.ts:88-101`), gate `status='green' AND provenance_by_field->>'released_evals'='[V]'` + membership do tenant. Motor e tela já concordam num nível por-tier.
  - **[V]** caminho conversa/diagnóstico (`sealMinCalculationConversation`) DORMENTE (só teste o chama) → fora do escopo.
  - **[V]** `nba_engine.ts:47` é o ÚNICO fetcher vivo de `released_evals`→teto.
  - **[V]** rede de segurança já existe: `tests/integration/nba_engine.test.ts:155-183` fixa a regra atual.
  - **[V]** dinheiro (A3/A7) é gateado à parte (`financial_class`/`auto_releasable`, §3.3) — by-tier NÃO enfraquece a trava de dinheiro.

## Functionality

- **Goal:** o operador certifica a autonomia da IA por **tier** (~3 por tenant) e todo cohort daquele tier herda o teto — sem autorar um golden-set por cohort.
- **Composes / cites:** `nba_engine.loadArms`/`proposeNba`, observatory CTE `proven`, `gov.compute_effective_level` (05A A.4.6), EPIC-B4 (`runEval`/`promote` INALTERADOS). · **04 §:** §3.2/§3.3/§3.4/§3.9/§14.
- **Contract (E2E):**
  - TRIGGER-IN: nenhum novo. É um read-path change DENTRO do `proposeNba` existente.
  - DATA-IN: `Eval_Cell.released_evals` + `Cohort.tier_base` + `Cohort_Membership_Snapshot` + `Restaurant.tenant_id` (o mesmo conjunto do CTE `proven`).
  - DATA-OUT: nenhuma coluna nova. `min_calculation.released_evals`/`effective_level` continuam PRODUZIDOS por `sealMinCalculationNBA`→`compute_effective_level` (NULL pre-run §14).
  - TRIGGERS-FIRED: idêntico ao de hoje.
- **Workflow — runtime (só o passo 2 muda):**
  1. `proposeNba(input)` resolve o `tenantId` (do `input.restaurantId`, server-side) e ranqueia o funil (`fn_nba_test_all`) — inalterado.
  2. **`loadArms(q, cohortId)` (A MUDANÇA):** `released_evals = least( coalesce(own_cap, tier_default), tier_default )`, default **LOW** — GLOBAL (ver "Resolução final" abaixo). `tier_default` = `max [V]+green` do tier; `own_cap` = floor do cohort ([V] próprio OU `[C]` auto-downgrade-veto). Sem tenant/signer/semana.
     - `own_cell` = a célula `[V]`-promovida do PRÓPRIO cohort (se existir) → **tighten-down de graça** (o `least` garante que só ABAIXA).
  3. `sealMinCalculationNBA({releasedEvals, tierCap, …})` → `compute_effective_level(nba_request, released_evals, tier_cap)` — **INALTERADO**.
- **Constraints (CLAUDE.md §3):** §3 ceiling **fail-closed** (sem cert → LOW; `least` ⇒ nunca afrouxa); §3.4 tenant-scoped server-side (tier_proven NÃO cruza pools — cross-tenant é o follow-up de governança, NÃO entra aqui); §14 (released_evals só [V]-promovido conta; verdict produzido, nunca semeado); §3.11 (loadArms + compute_effective_level invariant-bearing → pin antes/depois).
- **Done-when:**
  - Given tier `long_tail` com 1 cohort certificado MEDIUM ([V]) e um cohort-IRMÃO long_tail SEM cell; When o motor propõe pro irmão; Then `released_evals=MEDIUM` (herdado).
  - Given o irmão com `own_cell=LOW` ([V]); Then `released_evals=LOW` (tighten venceu via least).
  - Given nenhuma cell promovida no tier; Then LOW (fail-closed).
  - Given uma cell `green` mas NÃO promovida (`provenance != '[V]'`); Then NÃO conta pro tier_proven (§14).
  - Given cells promovidas de OUTRO tenant no mesmo tier; Then NÃO contam (tenant-scoped §3.4).
  - **Check ejecutable:** `pnpm test:integration` (nba_engine) + `pnpm typecheck` + pin de `compute_effective_level` em `pnpm test:sql`.

## Design

- **Sem UI nova.** O `CoachModal` (PR #77) já deixa autorar por cohort; o operador autora 1 golden-set num cohort REPRESENTATIVO do tier e promove → o tier herda. (Rótulo "certifica o tier" = polish opcional, não-bloqueante.)
- **States/a11y:** inalterados (read-path).
- **Reuse:** o CTE `proven` do observatory é a fonte da verdade do nível-por-tier — extrair pra 1 query reusável OU replicar verbatim (decidir no R0 reuse-scan; preferir extrair se barato).

## Data

- **Tabelas tocadas (read-only):** `gov.Eval_Cell` (released_evals/status/provenance), `cohort.Cohort` (tier_base/version), `cohort.Cohort_Membership_Snapshot`, `tenant.Restaurant` (tenant_id). **Nenhuma escrita nova.**
- **MIGRAÇÃO: ZERO.** É query dentro do `loadArms`. Nenhuma coluna/tabela/enum.
- **Gates:** tenant-scoped server-side (§3.4); `[V]`+`green` gate no tier_proven (§14); `cohort_rule_version` corrente; `least()` fail-closed (§3 ceiling).
- **Config_Perillas:** nenhum knob novo (os `eval_*` seguem usados por runEval, intactos).
- **Phantom check (§4):** cria ZERO tabela.
- **Determinism:** mesmos cells+membership ⇒ mesmo tier_proven (SQL puro). Pin: o teste de caracterização (comportamento de hoje) + os 5 Done-when.

## Plano de build (TDD, goal-driven)
```
R0  reuse-scan: extrair o CTE `proven` em query reusável? (ou replicar)
R1  CARACTERIZAÇÃO: teste fixa o comportamento de HOJE do loadArms
    (cell própria → seu nível; ambíguo/0 → LOW) → VERDE no tronco antes de mexer
R2  impl: loadArms(cohortId, tenantId) → least(coalesce(own, tier_proven), tier_proven), default LOW
R3  testes novos = os 5 Done-when (irmão herda / tighten / fail-closed / [V]-gate / cross-tenant não conta)
R4  atualizo o teste de caracterização que mudou de PROPÓSITO (deliberado + comentado — NÃO "consertar pra passar")
R5  gate: typecheck/lint/integration + pin compute_effective_level (§3.11)
R6  Codex 2× (§3 risk-max) → /qa → PR (1 commit, cita 02:B4-TIER + 04 §3)
```

## Resolução final — GLOBAL (Leo escolheu /karpathy a causa-raiz: dropar o tenant-scope)
`released_evals(cohort) = least( own_cap , tier_default )`, default LOW:
- **`tier_default`** = `max` das células `[V]`-promovidas+green do tier (`tier_base`+`cohort_rule_version`) — **GLOBAL**: a eval certifica o MODELO num tipo-de-cohort pra TODOS os pools, então 1 promoção levanta o tier inteiro. **A trava é o promote humano.** Sem signer/membership/semana.
- **`own_cap`** = `min` (FLOOR) do sinal PRÓPRIO do cohort: (a) sua `[V]` promoção dele (pior cert própria aperta — motor intent-agnóstico), OU (b) **qualquer `[C]` auto-downgrade** (re-eval RED → LOW) que **VETA** a herança (um cohort reprovado não pega o teto do irmão — fail-closed §7).
- Cap-table do observatory **espelha o motor**: `proven` GLOBAL (`max [V] do tier`, versão corrente); o escopo por-tenant fica só na trava de POLÍTICA (`Policy_Tier`, CTE `pol`), não na prova.
- **Por que GLOBAL (a causa-raiz):** 6 rounds de Codex foram sintomas de tenant-isolar um estado de eval que é global (`Eval_Cell` sem `tenant_id`, cohort atravessa pools). Indo global, todo o guard-stack (signer/membership/semana/espelho/overwrite) evapora. **TRADE consciente:** sem o papel `platform_admin`, o manager de QUALQUER pool levanta o teto de todos → o `platform_admin` (quem pode promover globalmente) é o follow-up REQUERIDO pra produção.

## Fora de escopo (follow-ups de QUALIDADE/GOVERNANÇA — não tocam o teto)
- **papel `platform_admin` (REQUERIDO pra produção):** hoje a cert é global mas QUALQUER manager promove → o papel controla quem pode certificar pra plataforma. = eval-global-governance.
- **de-id do `scenario`→padrão-de-sinal** + **amostragem estratificada** (golden-set representativo do tier cruzando cozinhas) → elevam a QUALIDADE da certificação. Separado.
- **intent × tier** (motor intent-aware) → só se a competência variar por tipo-de-problema a ponto de valer.
