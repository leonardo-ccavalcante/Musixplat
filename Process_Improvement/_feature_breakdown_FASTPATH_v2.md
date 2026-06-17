# FASTPATH v2 — chegar rápido com o Feature Breakdown Engine
### destilado da sessão **Support** (Feature A *atendimento* + Feature B *diagnóstico*, com `/office-hours` no meio)

> **Companion de** `specs/_prompt_feature_breakdown.md`. **NÃO repete** o `_feature_breakdown_playbook.md` nem o `_feature_breakdown_QUICKSTART.md` (v1, destilado da sessão P3). Cobre **só o que ESTA sessão revelou de novo**.
> **Origem:** triple-check de **4 lentes** (`/sat` + `/problem-solving` + `/grill-me` + `/office-hours`) sobre o processo inteiro. As 4 **convergiram** nos mesmos achados — quando 4 lentes independentes apontam o mesmo buraco, é estrutural.

---

## GOVERNING THOUGHT (1 frase)
A **velocidade** veio de 2 coisas que já funcionam (reproduzir sempre): **cheap-first (GATE-0)** + **verificação adversarial (build-readiness + ID-freeze)**. O **tempo perdido** veio de **3 vieses INVISÍVEIS** que o engine ainda não gateia + **1 fragilidade estrutural** — e as 4 lentes apontaram exatamente esses 4. O fast-path = **blindar esses 4** sem perder os 2 que já funcionam.

---

## OS 4 BURACOS (os gates novos) — ordenados por dano

### ① GATE de GRANULARIDADE da feature — *anchoring, o mais perigoso porque é invisível*
**Quando:** ao FIXAR o que é "uma feature" (Stage-0, ANTES de divergir).
**Faça:** liste as **FUNÇÕES** que a feature executa. Se forem **≥3 heterogêneas** (ex.: monitorar + diagnosticar + rotear + redigir + medir) **OU** você não consegue nomear **UM ator** e **UM output** → **é um ORQUESTRADOR**. Decomponha em **1 sub-feature por função (MECE)** ANTES de mapear.
**Por quê:** enquadrei o B como **um** agente fazendo 6 coisas; o MECE-check que existe no engine mira *épicas DENTRO da tela*, nunca a granularidade da *própria feature*. Só o `/office-hours` que o **Leo** pediu pescou — tarde. Eu não consigo grilar uma moldura de dentro da qual estou. **Sinal de alarme:** "não dá pra nomear o ator único".

### ② GATE de DIREÇÃO/AUDIÊNCIA dos hard-nos — *mirror-imaging*
**Quando:** antes de aplicar PII / k-anon / supressão a uma feature.
**Faça:** classifique a saída — **EXTERNA / cross-tenant / agregada** vs **INTERNA** (o operador resolve o próprio caso). Interna → **RESOLVE com o ID completo, NÃO suprime**. Aplicar k-anon a um diagnóstico interno é **falso-positivo**.
**Por quê:** transferi o k-anon (correto na tela de Cohorts, externa/agregada) pro diagnóstico **interno** do B; o Leo corrigiu. O engine lista PII/cross-tenant como hard-no **uniforme**, sem o gate interno-vs-externo.

### ③ GATE de COBERTURA REATIVA — *cego aos silenciosos*
**Quando:** quando o gatilho de entrada é **REATIVO** (depende do cliente/usuário agir — ticket, mensagem).
**Faça:** pergunte em voz alta **"o que esta feature NÃO vê porque ninguém reclamou?"**. Se os casos silenciosos estão no escopo → ela precisa de uma **fonte de população PROATIVA** (o monitor de processos críticos); o sinal reativo sozinho é cego.
**Por quê:** foi **o achado-chave do B** (os restaurantes não-pagos que ninguém reportou), e só apareceu por sorte de eu rodar o painel-de-contrato — nenhuma dimensão FORÇA essa pergunta.

### ④ PROTOCOLO de COMPUTE INTERROMPIDO — *workflows de fundo são frágeis*
**Quando:** ao disparar fan-out de fundo numa sessão **interativa**.
**Faça:** ou **(a)** chunk + checkpoint (persistir artefato por chunk), ou **(b)** dispara e **NÃO grila até voltar**, ou **(c)** autora a fila do material **já completo**. Se um agente morre **0-byte / "[Request interrupted by user]"** → **NUNCA re-roda cego**: inventaria o que completou + autora dos artefatos irmãos.
**Por quê:** a divergência do B foi interrompida **2×** pelo tráfego de mensagens do Leo (morreu 0-byte). O engine trata fan-out como fire-and-forget; numa conversa viva, um job longo **vai** ser interrompido.

### ⑤ GATE de EXAUSTÃO DE BLOQUEANTES — *separado da cobertura de dims*
**Quando:** antes de declarar `READY-TO-SYNTH`.
**Faça:** enumere **CADA `[I]` bloqueante** e confirme que cada um foi **PERGUNTADO ao operador e respondido**. "Dim coberta 11/11" **NÃO** limpa uma sub-pergunta bloqueante.
**Por quê:** **Q2** (executa-vs-fala) e **Q10** (ambiguidade) escaparam **2 lotes** cada; só o build-readiness pós-síntese pegou. O engine rastreia cobertura no nível da DIM, não dos bloqueantes individuais.

### ⑥ PRE-SEND SCAN anti-jargão — *binário, no PRE-EMIT (fluency bias)*
**Quando:** antes de enviar **QUALQUER** mensagem ao operador.
**Faça:** varra o texto por **códigos cross-tela/cross-feature** (`B↔P1`, `EPIC-x`, `dim N`, `05A↔05B`, `R#/BR#`). Cada ocorrência não-aterrissada nas palavras do operador = **HALT + reescrever** (nomear a COISA + analogia Feynman).
**Por quê:** `B↔P1` confundiu o Leo ("não lembro o que é B↔P1") — repetição do anti-jargão pela **5ª vez**. Uma regra em prosa, lida pelo mesmo agente que a viola, é **fail-OPEN**; só um scan no rascunho fecha. (Vira gate item 17 da memória; **estender a NOMES-DE-FEATURE**, não só dims.)

---

## O QUE JÁ FUNCIONA — REPRODUZIR (confirmado pelas 4 lentes)
- **GATE-0 cheap-first** → o reframe-mãe ("é DRAFT, não base" / "Support é ÁREA") veio no minuto 0, **zero compute**. O anti-pattern #1 histórico NÃO repetiu.
- **Build-readiness adversarial** → pegou Q2/Q10, 2 blockers do B, provenance — **independente da minha disciplina** (opera *depois* do erro, critério binário). É o keystone real.
- **ID-FREEZE** (registro canônico congelado) → **zero IDs soltos/colididos** entre 12 agentes paralelos.
- **Fan-out 1-por-sub-proceso** → specs de **1523 / 1263 linhas sem truncar**.
- **Painel de contrato cross-screen** (bilateral) → pegou o gap dos silenciosos + o ponto de k-anon ANTES de sintetizar.
- **`/office-hours` no meio** → pescou a sobrecarga MECE (mas como **resgate externo** → por isso vira o gate ①).
- **Autorar do material existente** quando o compute falha (não re-rodar cego).

---

## LEVERAGE — parar de fazer à mão (o único custo que escala por feature)
- **Gerar** o registro de IDs (gate 14) e o **ledger FACTS[V]** por **comando determinístico** (grep dos headers `#`/`EPIC`/`BR`/`EC` → tabela), e **re-taggear provenance por script** — não à mão. Emitir ambos como **esqueleto-pra-preencher** que os agentes referenciam read-only.
- **Divergência Stage-0 = CONDICIONAL**, não obrigatória: se um painel-de-contrato ou passe anterior **já semeia a fila**, autora dali; os 3 agentes de divergência são caros e frágeis — só rode se a fila estiver vazia.

---

## O FAST-PATH MÍNIMO (a sequência)
1. **PRE-FLIGHT:** memória/plan-mode ok; pin do grounding-doc; "**qual é a BASE** (artefato seu mais novo)?".
2. **GATE-0 cheap-first** (zero compute): problema validado POR NÓS? base? + **① granularidade: 1 feature ou orquestrador de N?**.
3. **Painel de contrato cross-screen** (bilateral) + **③ checagem reativa-coverage** — barato, inline.
4. **Divergência Stage-0** SÓ se a fila ainda não foi semeada (senão autora do painel). **④ se interromper, autora do que completou.**
5. **Grill** (modo certo: sweep vs dependent) + **⑤ blocker-exhaustion** antes de `READY-TO-SYNTH`.
6. **Síntese:** ID-registry + ledger **gerados por script** → fan-out 1-por-sub-proceso (output-puro) → **crítico build-readiness + ID-resolve**.
7. **Fixes no CIERRE** (os `[C]` são perilhas, não bloqueiam) + **emitir**. **⑥ PRE-SEND scan a CADA turno.**
8. **RL:** lição → **gate executável** (scan/hook/esqueleto), nunca diário. **② antes de qualquer hard-no, cheque a direção (interno vs externo).**

---

## EDITS RECOMENDADOS AO PROMPT (E-série, continuação — aplicar a `_prompt_feature_breakdown.md`)
> Cada um operacionaliza um dos 4 buracos. As 4 lentes propuseram os mesmos.
- **E15 — STAGE 0 (após a identidade do ator):** gate de **granularidade da feature** (①). *"Liste as funções; ≥3 heterogêneas OU sem ator/output único → é orquestrador → decomponha em subagentes MECE antes de divergir."* + espelhar no CONVERGENCE GATE: "FEATURE atômica (não é orquestrador disfarçado)".
- **E16 — ENGINE HARD-NOS + dim 8:** **scope por audiência** dos hard-nos de privacidade (②). *"PII/k-anon/supressão = hard-no para saída EXTERNA/cross-tenant/agregada; feature INTERNA que RESOLVE um caso → identifica/resolve, não suprime."*
- **E17 — STAGE 0 dims 2/3:** **reactive-coverage check** (③). *"Gatilho reativo → cego aos silenciosos; pergunte o que NÃO vê porque ninguém reclamou; se in-scope → exige fonte de população proativa."*
- **E18 — EXECUTION MODEL:** **protocolo de compute interrompido** (④) + divergência **condicional**. *"Job de fundo em sessão interativa será interrompido; chunk+checkpoint OU autora do material completo; 0-byte → nunca re-rode cego."*
- **E19 — CONVERGENCE GATE:** **blocker-exhaustion** (⑤), separado da cobertura de dims.
- **E20 — PRE-EMIT CHECK (novo item):** **PRE-SEND scan anti-jargão** (⑥), estendido a nomes-de-feature.
- **E21 — STAGE 2:** nota de **leverage** — gerar ID-registry + ledger por script, não à mão.

---

## DEFINIÇÃO de "chegou mais rápido"
A próxima feature chegou mais rápido quando: **zero compute antes do GATE-0**; **zero re-trabalho por moldura errada** (o gate ① pegou a granularidade no minuto 0, não via resgate do operador); **zero `[I]` bloqueante escapando** (⑤); **zero turno com jargão** (⑥); **zero hard-no mal-aplicado** (②); e o registro de IDs + ledger saíram **por script**, não à mão.
