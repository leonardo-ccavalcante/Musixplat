# 02:DETAIL — NBA Action Detail (tela-dentro-do-cockpit)   ·   [target: CÓDIGO]   [build: Claude+Codex]

> Pergunta que a tela responde, por ação A1..A8: **"o que é essa ação, e ela funciona?"**
> Dor (Leo, validado 2026-06-19): o sistema manda "faça A1" e ninguém tem onde abrir e ver o que é / como funciona / se costuma acertar. Dói pra **todo** operador que cai no cockpit, não só o novato. Decisão **A** (acerto determinístico) escolhida sobre B (caso-confirmado); ver [[nba-action-detail-screen]].

## Functionality

- **Goal:** abrir, a partir do cockpit, o detalhe de uma ação NBA em **duas visões separadas** — **Definição** (o que é) e **Operação** (funciona?) — sem misturar; números sempre reais (§14), nunca um % cheio mentiroso.
- **Composes / cites:** reusa `02:NBA-CAT` (catálogo) · `03_nba_deterministic_test` (`fn_nba_test_all`, verdict + `n_min_ok`/`k_anon_ok`) · `02:1A` (`nba_engine.proposeNba` — produtor das propostas; **alterado** p/ carimbar evidência) · `02:F-1.1` (cockpit screen/router). **04 §:** §3.1 (NBA_Propuesta) · §3.3 (autonomia) · §14 (anti-fake) · §3.2 (k-anon ≠ n_min) · §7/§8 (terceiro eixo: conhecimento validado flui entre pools; cru fica preso).
- **Contract (E2E):** terminal read-screen — não alimenta AGENTE/N8N. Não há consumidor downstream em `breakdown_N8N.md` (TRIGGERS-FIRED = null). Toca UM contrato de produtor existente: `02:1A` passa a **gravar a evidência do diagnóstico** na proposta.
  - TRIGGER-IN: `sync` — operador clica numa ação no cockpit (`/cockpit` → ação) → abre `/cockpit/action/:code`.
  - DATA-IN: `catalog."NBA_Catalogo"` (definição) + knob `cohort_rule_version_current` (versão vigente) + `gov."NBA_Proposal"` (histórico por `action_type`, com a evidência carimbada).
  - DATA-OUT: nenhum write na tela (read-only). O write novo é **upstream** em `02:1A` (ver Data · P-A2).
  - TRIGGERS-FIRED: null (terminal).
- **Workflow — runtime:**
  1. `sync` operador clica a ação no cockpit → navega ao detalhe com `action_code` (a tela NUNCA recebe `tenant_id` do cliente — resolvido server-side · §3.4).
  2. **Definição** — lê o catálogo + a versão vigente (knob por nome). Sem gate de supressão: é feature **interna** que IDENTIFICA, não suprime (mirror-imaging hard-no, gate-19).
  3. **Operação** — `fn_nba_action_history(action_code)` agrega as propostas: `run_count`, `last_run`, e o **breakdown de acerto** {solid · unconfirmed · no_data}. Determinístico (SQL, §6). Toda contagem NULL pre-run (§14); `acerto_rate` = `solid/(solid+unconfirmed)`, **NULL se denominador 0** (nunca 0-fake).
  4. (nenhum write na tela)
  5. terminal — não dispara nada.
  6. UI: loading / **empty** ("ação ainda não rodou" — nunca "0% acerto") / error. `eco` = card rotulado **"ainda não medido"** (slice futura; não inventa). Selo [V]/[C] + freshness em todo número.
- **Constraints (CLAUDE.md §3):** §14 (counts/booleans só do produtor, NULL antes) · §3.2 (k-anon e n_min SEPARADOS — aqui são o **discriminador** solid↔unconfirmed, não supressão; interno ⇒ surfaça, gate-19) · §3.8 (knob `cohort_rule_version_current` por NOME) · §3.4 (`tenant_id` server-side; cross-tenant → ver scope-[I] abaixo) · §3.10 (provenance por campo; sem provenance ⇒ não renderiza).
- **Done-when:**
  - *Given* uma ação A1 com N propostas gravadas, *When* abro o detalhe, *Then* vejo Definição (catálogo + versão) e Operação (`run_count=N`, `last_run`, breakdown solid/unconfirmed/no_data, `acerto_rate` real).
  - *Given* uma ação que nunca rodou, *Then* Operação mostra estado **empty** explícito e `acerto_rate=NULL` (sem 0-fake).
  - *Given* propostas cravadas em dado ralo (¬n_min_ok ∨ ¬k_anon_ok), *Then* elas contam como **unconfirmed**, fora do numerador do acerto.
  - **Check ejecutable:** `pnpm test:sql` (pgTAP em `fn_nba_action_history`) · `pnpm test:antifake` (counts/rate NULL pré-produtor) · `pnpm test:integration` (tRPC tenant-gate) · `pnpm test:e2e` + `pnpm test:a11y` (detalhe abre do cockpit, axe AA).

## Design

- **Screen/component:** detalhe dentro do cockpit (`client/src/features/cockpit/*` + rota `/cockpit/action/:code`). Ref `Design/musixmatch-pro-design-spec.md`. Duas visões separadas (abas/seções) — **Definição** | **Operação**.
- **Tokens:** `--mxm-*` (dark-only) · fluido `clamp()` + logical properties. **Cuidado a11y conhecido:** botão primário branco-no-brand (#fc532e) reprova axe AA — usar ghost brand-outlined (ver [[project-nba-build]]).
- **States:** loading skeleton · **empty** ("ainda não rodou") · error · `eco` = "ainda não medido". NULL ⇒ vazio conservador, nunca 0/verde-fake. Acerto mostrado como **3 estados** (solid/unconfirmed/no_data), não um donut de % isolado.
- **a11y (WCAG 2.1 AA):** cor nunca é o único portador (estado de acerto leva texto+ícone, não só verde/vermelho) · foco/ordem de teclado na navegação cockpit→detalhe→voltar · `aria-live` no carregamento dos números.
- **Reuse:** reusa os componentes do cockpit (linha/modal de proposta), os selos de provenance/freshness do P01 polish, e o primitivo de badge `[V]/[C]`. Criar novo só p/ a aba de Operação (gráfico de barras de estados) com razão declarada.

## Data

- **Canonical tables touched (04 §3):**
  - `catalog."NBA_Catalogo"` (catalog) — **P-A1:** + `playbook text` (passo-a-passo, **texto livre v1**) + `created_at timestamptz` (data real do seed, NÃO inventada). São **bruto/reference** (não-§14, como o resto do catálogo).
  - `gov."NBA_Proposal"` (gov) — **P-A2:** + `diagnosis_verdict text` (verdict do lever escolhido: below/above/ok/no_data) + `n_min_ok bool` + `k_anon_ok bool`. **RESULT §14, NULL pre-run**, carimbados pelo `nba_engine.proposeNba` (já tem `sel.lever.n_min_ok`/`k_anon_ok` em escopo — hoje só passa pro min(), não persiste). provenance `[V]` (vêm de `fn_nba_test`).
- **DATA-IN → DATA-OUT (produtores):**
  - definição: leitura pura do catálogo + knob.
  - histórico: **`cohort.fn_nba_action_history(action_code)`** (NEW, Named_Query determinística) → `{action_code, run_count, last_run_at, solid_count, unconfirmed_count, no_data_count, acerto_rate}`. `solid` = `diagnosis_verdict ∈ {below,above} ∧ n_min_ok ∧ k_anon_ok`; `unconfirmed` = breach mas ¬(n_min_ok ∧ k_anon_ok); `no_data` = resto (inclui A8 no-act). `acerto_rate = solid/NULLIF(solid+unconfirmed,0)` (NULL-safe, §14). Reuso do padrão `fn_nba_test_all` (mesma família de verdict).
- **Gates:** tRPC `nba.detail` exige **operador autenticado** (server-side), MAS o agregado de confiabilidade é **company-wide** (sem filtro `tenant_id` — [V] Leo 2026-06-19: empresa inteira). Legítimo por 04 §7/§8 (terceiro eixo: conhecimento-validado da AÇÃO flui entre pools; só o dado cru por restaurante fica preso ao pool — e aqui não exponho cru, só contagens da ação). **Sem fronteira k-anon no v1** (agregado por ação, não célula por tenant). **k-anon ≠ n_min:** ambos são leitura do verdict carimbado (discriminador solid↔unconfirmed), NÃO supressão — interno IDENTIFICA (gate-19) · `cohort_rule_version` já stampado por linha (anti-mix) · sem novo UNIQUE.
- **Config_Perillas by NAME:** `cohort_rule_version_current` (versão vigente). `n_min_threshold`/`k_anon_threshold` já aplicados DENTRO do `fn_nba_test` (não relidos aqui).
- **Phantom check (§4):** cria SÓ colunas + 1 função. **Nenhuma** tabela denylistada. O "histórico por ação" é **derivado** (função sobre `NBA_Proposal`), não uma tabela materializada.
- **Determinism:** mesmas propostas ⇒ mesmo `fn_nba_action_history` (pgTAP fixa 3 propostas: 2 solid + 1 thin ⇒ `acerto_rate=0.5`).

## Pieces (MECE — viram o plano em writing-plans)

1. **02:DETAIL-A1** (catalog) — migration + seed: `NBA_Catalogo.playbook` + `created_at` p/ A1..A8. ≤100 ln.
2. **02:DETAIL-A2** (proposal evidence stamp) — migration: `NBA_Proposal.diagnosis_verdict/n_min_ok/k_anon_ok` + alterar `nba_engine.proposeNba` p/ carimbar (test: thin-data ⇒ unconfirmed). **Documenta o engine-gap** (select escolhe sem checar evidência — só MEDE; mudar a SELEÇÃO = peça separada, fora de escopo).
3. **02:DETAIL-B** (SQL) — `cohort.fn_nba_action_history` + pgTAP + antifake.
4. **02:DETAIL-C** (tRPC) — `nba.detail(action_code)` tenant-gated {definition, history}.
5. **02:DETAIL-D** (UI) — rota `/cockpit/action/:code` + 2 visões + states + a11y + e2e.

## Decisões resolvidas (com Leo)

- **Escopo do histórico = EMPRESA INTEIRA** [V, Leo 2026-06-19]: `fn_nba_action_history` agrega as propostas de **todos os pools** (confiabilidade da AÇÃO = conhecimento-validado sobre a política, flui entre pools por 04 §7/§8 terceiro-eixo; só agregados, sem dado cru por restaurante ⇒ sem fronteira k-anon no v1). tRPC ainda exige operador autenticado. Breakdown por cohort/tenant = slice futura e aí SIM gateado por k-anon.
- **Acerto = A (determinístico)** [V]; passo-a-passo = texto livre v1 [V]; versão = knob `cohort_rule_version_current` + `created_at` real no seed [V]. Ver [[nba-action-detail-screen]].
