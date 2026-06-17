# QUICKSTART — chegar rápido com o Feature Breakdown Engine

> **Fast-path** de `specs/_prompt_feature_breakdown.md`. **NÃO** repete o runbook completo — para PRE-FLIGHT, anti-truncamento, lentes adversariais, convergence/PRE-EMIT e Definition-of-Done, veja **[`_feature_breakdown_playbook.md`](_feature_breakdown_playbook.md)**.
> Este doc cobre só o eixo que falta: **o que o Leo traz + o que eu faço DIFERENTE** para não pagar os 3 reworks conhecidos. Destilado do triple-check (`/sat` + `/grill-me` + `/problem-solving`) sobre a sessão Pantalla 3 → Goals & KPIs (iter 0-14).

## GOVERNING THOUGHT (a lição-mãe)

O salto de velocidade **não vem de escrever mais gates em prosa**. As edições E1–E12 já estavam aplicadas e verificadas CLEAN — e a iteração 0 **repetiu o anti-pattern #1 pela 4ª vez** (manufaturei problema/épicas/cola-de-13 como `[V]` antes de perguntar nada). **Um gate redigido como prosa, lido pelo mesmo agente que pode pulá-lo, é fail-OPEN.** A cura dos 3 gaps abaixo é **artefato/gatilho executável** (idealmente um hook), não mais texto.
> ⚠️ **Este doc é TEXTO → por si só também é fail-OPEN.** É necessário, não suficiente.
> ✅ **Hook configurado** (`.claude/settings.local.json`): **UserPromptSubmit** injeta o GATE-0 a cada turno + **PreToolUse** em `Agent|Workflow|Task` injeta o lembrete **no momento do compute** (a hora do pecado R1). *Caveat honesto:* o hook força **atenção** (o gate aparece sempre, harness-injected), não força **comportamento** — ainda preciso AGIR sobre ele; é o mais fail-closed possível sem um deny semântico. Gerenciar/desativar: `/hooks`.

---

## DIAGNÓSTICO (triple-check) — funcionou / perdeu tempo / melhorou o prompt

### ✅ O que FUNCIONOU (reproduzir)
- **Verificação adversarial build-readiness = o keystone real** (não ritual): crítico independente, critério binário (um code-agent lê os 3 outputs e faz 0 follow-up; não-vazio = BLOCKING). Pegou **os dois** over-claims (iter 5 e 13) — funciona porque opera *depois* do erro e **não depende da minha disciplina**.
- **Problema-primeiro + pedir um CASO CONCRETO** quebra abstração subdesenhada: o caso "churn↑" reframeou o tipo-B de "o sistema executa" → Investigation Workbench. Quando o vivido contradiz meu modelo, pedir o episódio específico (não mais abstração).
- **"Opções COM o porquê → Leo aprova/rejeita/adiciona"** — só em decisão de **design** (≠ extração, onde opção = anchor). Iter 11: rejeitou S6, refinou S7, adicionou S10/S11.
- **`/grill-me`** fez o modelo do operador vencer o meu (reframe do break-point). Houve mudança de estado, não confirmação performativa.
- **Eu escrevo o deliverable + workflow só VERIFICA** + edições cirúrgicas (karpathy). Fidelidade ao vivido, anti-invenção, sem churn.
- **"Verify the verifier"** — o consolidador disse "vision=v1.1", era v1.2; li a fonte e **não toquei**. Crítico também é `[I]` até cotejar.

### ⏱️ O que fez PERDER TEMPO (raízes)
- **R1 — liderar com solução / supor (4ª vez, a mais cara):** iter 0 = workflow autônomo que inventou tudo como `[V]` antes de falar com o Leo → descarte total. Raiz: gate em prosa é fail-OPEN.
- **R2 — over-claim de ENCAIXE:** afirmei "X executa via Y / alimenta P02" **sem ler o contrato de Y** (iter 4, 8, 13 — 3×). A falsify-probe só dispara em hard-no/número/acesso, **não em claim de composição** — "duas peças conectam" não parece invenção, então o guarda não dispara. O build-readiness pega *depois* de emitir (paga o rework).
- **R3 — ground-truth INCOMPLETO ao crítico → falso-positivo de provenance (3×):** passei só a vision, não as **tabelas/respostas vividas** do Leo → o crítico marcou como over-claim coisas que ERAM `[V]`. Problema de **artefato**, não de disciplina.
- **Stale-read estrutural (3-4×):** linter/sessão-paralela mudaram o arquivo ENTRE meu Read e meu Edit. Modo de falha estrutural, não azar.
- **META-raiz:** o ritual RL diagnostica ótimo mas **operacionaliza inconsistente** — viola a própria regra "lição = gate, não diário". Nada verifica que a lição de N virou gate antes de N+1.

### 🔧 O que MELHOROU o prompt (E1-E12) vs o que ainda FALTA
| Já melhorado (funcionou) | Gap que ainda paga rework |
|---|---|
| **E5** anti-truncamento (fan-out por sub-proceso + crítico de completude) — único gate claramente preventivo | **GATE-0 sem GATILHO** (R1): redefinir "aplicado" = "provou que bloqueia o erro numa sessão", não "texto presente" |
| **E3** 2 modos de elicitação (sweep/grill) + sinal vivo supersede | **Probe de CONTRATO** (R2): todo `[V]` de "X-alimenta/executa-via-Y" exige ter LIDO+CITADO o contrato de Y nesta sessão, senão `[I]` — mata iter 4/8/13 |
| **E4** Recomendo condicional (extração SEM / design COM) | **Ledger do verificador** (R3): falta `FACTS[V]` persistente (vision + TODAS as respostas/tabelas vividas) passado ÍNTEGRO ao crítico |
| **E6** anti-jargão (operador dispara "não entendi" como detector) | **Bloco de reconciliação** obrigatório quando o modelo diverge do doc aprovado, antes de qualquer `[V]` |
| **E12** env-precheck turno 1 | **Verify-the-verifier** + **micro-gate de stale-read** + **check de fecho do RL** não são itens do PRE-EMIT |

---

## O FAST-PATH (o que eu faço DIFERENTE da próxima vez)

### 1 · TURNO-0 BLOQUEANTE (a regra que teria matado o maior desperdício)
**Antes de invocar QUALQUER sub-agente/Task ou gastar compute, meu PRIMEIRO output são as perguntas de contrato (GATE-0).** Se eu não tenho ≥1 resposta do Leo *desta sessão* registrada → **self-halt visível**. ("specs existem" ≠ "validado por nós"). Versão enforceable do GATE-0, não a prosa do engine.

### 2 · O QUE O LEO TRAZ (checklist de arranque, de uma vez)
- O **problema vivido** nas suas palavras + o momento de struggle (a única fonte `[V]`).
- As **tabelas/rosters vividos** (ex.: a tabela dos 10 papéis) — **isto vira o `FACTS[V]`**, não a vision.
- **Base:** existe um artefato seu mais novo que minha moldura? (se sim, é a base; enxerto, não reescrita).
- Tenant/unidade de isolamento · fronteira financeira · método de atribuição · o que ele tria como **bloqueante**.
> Por que o `FACTS[V]` importa: é o ground-truth que o verificador precisa **íntegro**, ou gera falso-positivo (R3).

### 3 · OS 3 CHECKS PRÉ-AFIRMAÇÃO (baratos, ANTES de escrever — não depois)
1. **Claim de encaixe A→B** ("X executa via Y / alimenta Y"): eu **li e citei o contrato de entrada de Y nesta sessão**? Se não → `[I]` automático. (mata R2)
2. **Modelo diverge do doc aprovado** → **bloco de reconciliação obrigatório** antes de qualquer `[V]`.
3. **Ledger do verificador** = vision pinada + `FACTS[V]` completo, passado ÍNTEGRO ao crítico. (mata R3)

### 4 · VERIFY-THE-VERIFIER
Todo achado de crítico **contra um pin/fato** é `[I]` até eu cotejar a **fonte primária**. O crítico pode estar errado por ground-truth incompleto.

### 5 · MICRO-GATE DE EDIÇÃO (stale-read)
Em doc compartilhado / com linter / com sessões paralelas: **Read imediatamente antes de cada Edit**; nunca confiar no Read anterior nem na minha memória do que outra sessão fez. (Também evita "corrigir" algo que já está certo.)

### 6 · QUEM ESCREVE O QUÊ
**Eu** redijo o deliverable (fidelidade ao vivido, anti-invenção). O **workflow SÓ verifica** (adversarial independente). Spec longa → fan-out por sub-proceso + crítico de completude (playbook §4).

### 7 · CHECK DE FECHO POR ITERAÇÃO
Antes de começar a iteração N+1: a **lição bloqueante de N já é um gate executável**, não uma nota no log? Se ainda é nota → não avanço (resolvo o gate primeiro).

---

## DEPOIS
Para tudo o mais (PRE-FLIGHT completo, GATE-0 detalhado, inputs, anti-truncamento, lentes adversariais, convergence/PRE-EMIT, ritual RL, anti-patterns, tracker E1-E12, Definition-of-Done) → **[`_feature_breakdown_playbook.md`](_feature_breakdown_playbook.md)**.

**✅ Enforcement configurado:** §1 (turno-0) e §3 (checks pré-afirmação) viraram **hook** em `.claude/settings.local.json` — `UserPromptSubmit` (todo turno) + `PreToolUse` em `Agent|Workflow|Task` (momento do compute). Gerenciar/desativar: `/hooks`. *Por que importa:* como diz a governing thought, **texto é fail-OPEN; o gatilho da harness é o mais perto de fail-closed que dá** (força atenção, não comportamento).
