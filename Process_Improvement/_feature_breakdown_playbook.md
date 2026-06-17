# Playbook — usar o Feature Breakdown Engine para chegar rápido ao resultado

> **Companion de** `specs/_prompt_feature_breakdown.md`. **Meta:** que a PRÓXIMA feature chegue à qualidade de `specs/02_NBA Playbooks best actions screen.md` SEM repetir os erros do `rl-iteration-log.md`. Não é ensaio — é runbook com checkboxes. Termos canônicos do projeto preservados: `min()`, `[V]`/`[I]`/`[C]`, fail-closed, sub-proceso, build-readiness.

---

## GOVERNING THOUGHT (1 frase)

O processo só foi lento porque **gastei compute caro (workflows de 6 agentes, ~393k tok / ~21 min) ANTES de validar o problema e o contrato de interação com o Leo** — invertendo cheap-before-expensive 3 vezes — e o remédio já está destilado mas **não está cabeado no Engine**: subir o gate de problema-primeiro + contrato-antes-do-compute para o início, como precondição dura (fail-closed), não como diário à parte.

## TL;DR — a sequência mínima (não pule nenhum passo)

1. **PRE-FLIGHT** → fixar grounding-doc + resolver permissão de escrita de memory + perguntar "qual é a BASE validada?"
2. **GATE-0 (fail-closed)** → "este problema + funcionalidade mínima já validamos NÓS nesta sessão, ou só existe escrito?" → se doc-only, o problema é `[I]`, valida-se ANTES de qualquer solução/compute.
3. **CONTRATO** → alinhar cadência (sweep vs grill), idioma/tono (PT-BR Feynman), escopo da sessão — com perguntas BARATAS.
4. **Só então** rodar o DIVERGE-ONCE (Stage 0) + Stage 1 grill.
5. **SÍNTESE anti-truncamento** → spec longa = fan-out 1 agente por sub-proceso + build em partes + crítico de completude.
6. **CONVERGENCE GATE + PRE-EMIT (build-readiness binário)** → emitir só com 0 `[I]` bloqueantes.
7. **RITUAL RL** → retro `/sat` + `/problem-solving`, sem dados sintéticos, e operacionalizar a lição como item de gate (não como diário).

---

## 1 · PRE-FLIGHT (antes do 1º turno)

| [ ] | Ação | por quê (erro real do rl-log) |
|---|---|---|
| [ ] | Fixar versão+data do grounding-doc (`specs/00_vision_completa.md`); todos os sub-agentes leem a MESMA cópia | Engine hard-no: drift → halt + re-ground |
| [ ] | Resolver plan-mode / permissão de escrever memory AGORA, no início | Iter.3-Cockpit: "Plan mode bloqueou escrever memory a sessão inteira; Leo pediu 3x; só resolvi no fim" |
| [ ] | Perguntar: **"Existe um artefato já validado que seja a BASE? Qual é?"** | Iter.3-Cockpit: Leo colou um artefato MAIS evoluído que minha moldura → "parte do meu workflow virou descartável" |
| [ ] | Rodar `gate-pre-response.md` (11 itens) como checklist binário fail-closed | "diário não muda comportamento; gate muda" |

## 2 · GATE-0 — CONTRATO ANTES DO COMPUTE (fail-closed, o mais caro)

> **HARD-NO: zero budget de sub-agente / zero solução até estes dois estarem respondidos.** "Os specs existem" ≠ "validado por NÓS".

| [ ] | Pergunta de validação (BARATA, primeiro) | por quê (erro real) |
|---|---|---|
| [ ] | **"Este problema + a funcionalidade mínima já validamos VOCÊ e EU nesta sessão, ou só existem num doc?"** Doc-only → problema = `[I]`, validar COM o operador antes de qualquer solução/UI/workflow/compute | REPEAT 3ª vez (o mais grave): "rodei 2 workflows ANTES de validar o problema... Leo: o cockpit agora é overengineering... o problema ainda não está validado por nós" |
| [ ] | **"Qual é a BASE — há um artefato seu mais novo que minha moldura?"** Se sim, esse artefato é a base; enxerto incremental, nunca reescrever | Iter.3-Cockpit: 7 enxertos REAIS aceitos por respeitar o artefato como base, não reescrever |
| [ ] | Alinhar **cadência** (sweep vs grill), **idioma/tono** (PT-BR Feynman), **escopo** da sessão — antes de gastar agentes | Iter.2: "~393k tokens / ~21 min de workflow autônomo ANTES de alinhar cadência/escopo. Cheap-before-expensive invertido" |

## 3 · INPUTS QUE O LEO DEVE TRAZER (checklist, de uma vez)

| [ ] | Input | por quê |
|---|---|---|
| [ ] | Vivido `[V]` do domínio (Uber Eats): problema real + momento de struggle | "o vivido é a única fonte `[V]`" (gate item 2) |
| [ ] | Artefato-base, se existir | Iter.3-Cockpit (acima) |
| [ ] | Tenant / unidade de isolamento (ex.: restaurante individual; fuga = re-id de campanha de 1 restaurante) | Iter.3-Cockpit: as 2 perguntas que fecharam os últimos `[I]` |
| [ ] | Fronteira financeira (ex.: só saldo; palancas não-operacionais ruteadas a Strategy/Soporte) | idem |
| [ ] | Método de atribuição (bloqueia funnel-correlacional), horizonte, janela de medição | Iter.3-Cockpit: enxertos REAIS (método de atribuição, duplo horizonte) |
| [ ] | O que sinaliza o que ele tria como BLOQUEANTE | foca o grill no que importa |

## 4 · MECÂNICA DE SÍNTESE — ANTI-TRUNCAMENTO

| [ ] | Regra | por quê |
|---|---|---|
| [ ] | Spec longa / OUTPUT 3 / ≥2 sub-procesos nomeados → **fan-out 1 agente por sub-proceso DESDE O INÍCIO** (nunca 1 agente para o workflow inteiro) | Iter.3-Cockpit: "OUTPUT 3 num ÚNICO agente e TRUNCOU (2H/2I + seções de fecho ausentes)" |
| [ ] | Build em partes: Write inicial do esqueleto + Edits com marcador | Iter.3-Cockpit: "Build em partes (Write + 3 Edits com marcador) evitou o truncamento → 379 linhas" |
| [ ] | **Crítico de completude obrigatório** antes de emitir: enumerar TODOS os sub-procesos (1A…NX) + as 3 seções de fecho; gap não-vazio = BLOCKING | "só o crítico de completude pegou" — esse funcionou |
| [ ] | Escrever EU MESMO o deliverable (não fan-out de drafting); workflow só para VERIFICAÇÃO | Iter.4: "Escrevi eu mesmo (não fan-out de drafting) pra máxima fidelidade ao vivido + anti-invenção" |

## 5 · OS LENTES ADVERSARIAIS (rodar a cada iteração — o que dá a qualidade)

| [ ] | Lente | por quê (achado REAL não rejeitado) |
|---|---|---|
| [ ] | Stage 0: expert-blindspot pass + pre-mortem | gera os enxertos: confirmação independente, k-anonymity, supressão multi-etapa, sinal-fraco |
| [ ] | Triple-check: `/sat` (Devil's Advocacy / ACH / Key Assumptions) + `/problem-solving` + mapeo edge/falha | Iter.2: SAT+pre-mortem+CEO acharam "email = instrumento de vaidade", "funil = duplo-conteo", "uma tela é folha, raiz = contrato do laço 2↔5↔6↔3" — `[V]` não contestados |
| [ ] | **Build-readiness binário como keystone** (não ritual) | Iter.5: pegou o over-claim `[V]` do modelo evolutivo sem flag de divergência ANTES de declarar pronto |
| [ ] | `[I]` / `needs-prototype` em vez de fabricar GWT | Iter.3-Cockpit: EPIC-2/3 marcadas `[I]`; recorrido móvel `needs-prototype` — integridade de provenance mantida |
| [ ] | Problema-primeiro + opções abertas com 'Other' | Iter.3-Cockpit: "o reframe real (agent-manager) veio no 'Other', NÃO nas minhas 3 opções ancoradas" |
| [ ] | **Triple-check de UX do recorrido**: SAT (suposições) + design-review + UI/UX; estados vazio/carga/erro obrigatórios | Rigor que o Leo exigiu ([[feedback-agile-rigor]]); fundido do antigo `_USAGE` |

## 6 · CONVERGENCE GATE + PRE-EMIT (espelha o Engine, binário)

- [ ] **11/11 dims cobertas** · 0 `[I]` BLOQUEANTE · GLOSSARY sem termo com 2 sentidos · nenhum `[V]` contradiz o doc · ÉPICAS MECE (cobrem a tela, sem solape, cada uma desarrollable)
- [ ] **Provenance:** toda linha taggeada; integridade mantida (nenhum `[V]` vindo do meu próprio Recomendo; doc `[I]` continua `[I]`); hard-nos presentes
- [ ] **Build-readiness:** simular um code-agent lendo os 3 outputs → enumerar TODA pergunta de follow-up → não-vazio = cada uma vira `[I]` BLOQUEANTE → volta ao grill
- [ ] Confirmar com o Leo o `READY-TO-SYNTH` (cobertura 11/11 + lista de `[I]` não-bloqueantes) — **nunca sintetizar antes do gate**

## 7 · RITUAL RL (fim de cada iteração)

- [ ] Terminar com **artefato visível** (seção de plano / fragmento de spec) que o Leo possa ver
- [ ] Rodar retro `/sat` + `/problem-solving`: **não-funcionou / funcionou / melhorar**, grounded, **sem dados sintéticos** → nova entrada no TOPO de `rl-iteration-log.md`
- [ ] **Operacionalizar a lição como item de gate**, não como diário | por quê: "causa-raiz dos 2 repeats: lição era diário, não gate"

---

## Anti-padrões (o que faz perder tempo — direto do rl-log)

| Anti-padrão | Sinal de alarme | Fix |
|---|---|---|
| **Liderar com SOLUÇÃO/compute antes de validar o problema COM o Leo** (REPEAT 3x — o mais grave) | "estou abrindo um workflow" / "os specs existem" | HALT → GATE-0; validar problema primeiro |
| **Compute-de-solução disfarçado de "divergência legítima do Stage 0"** (rodei cockpit + dataviz Cairo/Knaflic "pra divergir") | abrindo lente de UI/IA/layout/roteamento dentro do Stage 0 | divergência = problema + 11 dims ONLY; lente de solução só após o CONVERGENCE GATE (E9) |
| **Compute pesado antes do contrato** (~393k tok / ~21 min) | budget de agente gasto sem cadência/escopo alinhados | cheap-before-expensive: perguntas baratas primeiro |
| **Moldura própria descartável** | Leo tem artefato mais novo | perguntar "qual é a BASE?" antes de gerar |
| **OUTPUT 3 truncado num único agente** | spec >~150 linhas / ≥2 sub-procesos | fan-out por sub-proceso + crítico de completude |
| **"Recomendo" em pergunta de extração** | ancorei o Leo; valor veio do 'Other' | extração = pergunta ABERTA, sem Recomendo |
| **"Uma-pergunta-por-vez" tratada como lei** | sinal vivo do Leo era "todas de uma vez" | 2 modos: cold-start sweep vs dependent grill; sinal vivo supersede |
| **Jargão do doc não-vivido** (slider/break-point/"fila"/"1:10"/"P2↔B3") | "não entendi" (repetido 4x) | aterrissar o conceito na linguagem dele + analogia Feynman ANTES de usar |
| **Registro denso/ES/Pyramid para humano que pediu Feynman PT-BR** | redirect de tono | Pyramid governa ESTRUTURA, não densidade; ES denso só nos deliverables |
| **Plan-mode bloqueando memory** | Leo pede 3x para escrever | resolver o modo no PRE-FLIGHT |
| **Rigor que o Leo teve que pedir** | ele pede estimativa-de-impacto / matriz risco×impacto | antecipar: cada ação executável carrega hipótese + como validar + matriz + credenciais/logs/políticas |
| **IDs renumerados por agente de fan-out** (EC/BR/MF driftam entre OUTPUTs) | crítico dá "regenerar" por cross-ref colidente; crosswalk vira band-aid | congelar registro de IDs na ESPINHA antes do fan-out; agentes só referenciam (E13) |
| **Preâmbulo de agente vazado no assembly** ("I have enough context…") | limpeza pós-hoc com awk a partir do header | contrato do agente: "output = só o corpo a partir do header, zero preâmbulo" (E14) |
| **Contrato cross-screen UNILATERAL** (só o produtor tem os campos) | `scope_owner_ref` 16x em P1, 0x em NBA/Goals | contrato = `[I]` BILATERAL; micro-grep no doc-alvo antes de "folrado"; painel no PRE-FLIGHT (E15) |
| **Header que se autocontradiz** ("sin drift" mas há residual) | claim do header ≠ pendente do build-readiness | PRE-EMIT: claims do header batem com os pendentes |
| **Lição deixada como "candidato a gate" (diário)** | retro diz "operacionalizar depois" e fecha a iteração | a lição vira item DURO no gate/engine/playbook ANTES de fechar (gate-em-memória ≠ gate-no-prompt — reincidiu) |

---

## Edições recomendadas ao próprio prompt (`specs/_prompt_feature_breakdown.md`)

> Cada uma ataca uma causa-raiz de (B), ordenadas por ameaça-à-velocidade. **STATUS (pós triple-check da sessão Cockpit; engine = 206 linhas; verificado CLEAN por agente independente): E1–E12 ✅ APLICADAS no engine. E9–E12 = deste triple-check.** Tracker: `[x]` aplicado / `[ ]` pendente. *(Refs de linha abaixo são indicativas — o conteúdo é a fonte da verdade; a numeração drifta a cada edição.)*

- [x] **E1 — [inserir GATE-0 antes da linha 27 "EXECUTION MODEL"] — ataca o erro mais caro (REPEAT 3x).**
  Texto: *"GATE 0 — CONTRATO ANTES DO COMPUTE (fail-closed): nunca gastar budget de sub-agente / web antes de (a) PROBLEMA+OUTCOME validados COM o operador NESTA sessão ('specs existem' ≠ 'validado por nós'); (b) contrato de interação alinhado (cadência/escopo) via perguntas baratas; (c) perguntar 'qual é a BASE — há artefato seu mais novo?'. Violação = halt."* (operacionaliza gate itens 7 e 10).

- [x] **E2 — [linha 39, STAGE 0] adicionar Stage 0.0 como PRIMEIRO gate, antes de "PROBLEMA + OUTCOME".**
  Texto: *"VALIDATION-vs-EXISTENCE gate (ask FIRST): doc-only → problema é `[I]`, validar COM operador antes de QUALQUER solução/compute. Contratos que o operador NÃO especificou = OPEN `[I]`, jamais invenção."* (Iter.5: "contrato que o Leo não especificou = OPEN QUESTION, jamais invenção").

- [x] **E3 — [linhas 32 e 57] substituir "ALWAYS ONE QUESTION AT A TIME / Never batch" pelos 2 modos.**
  Texto: *"HUMAN Q&A modes: COLD-START SWEEP (Stage 1 opening, muitos `[I]` independentes) = todas as perguntas de uma vez; DEPENDENT GRILL (depois, `[I]` encadeados) = uma por vez, re-sort após cada resposta. **Preferência viva do operador supersede ambos.**"* (Iter.2: tratei a regra como lei sobre o sinal do Leo).

- [x] **E4 — [linhas 62-63 + few-shot 161-163] tornar `↳ Recomendo:` CONDICIONAL.**
  Texto: *"Pergunta de EXTRAÇÃO do vivido → ABERTA, SEM Recomendo (anchoring; operador é a única fonte `[V]`). Pergunta de DESIGN/ENG → opcional `↳ Sugiro [I]: …`."* No few-shot, mostrar ao menos uma pergunta de extração SEM Recomendo, para não modelar o anti-pattern (gate item 3).

- [x] **E5 — [linha 30, EXECUTION MODEL] subir o fan-out de nota a regra dura disparada por longitud.**
  Texto: *"Regra anti-truncamento: OUTPUT 3 e qualquer deliverable com ≥2 sub-procesos nomeados OU >~150 linhas → fan-out OBRIGATÓRIO 1 agente por sub-proceso DESDE O INÍCIO + build em partes (Write esqueleto + Edits com marcador) + crítico de completude antes de emitir (enumera todos os sub-procesos + 3 seções de fecho; gap não-vazio = BLOCKING)."* Adicionar o crítico de completude como **item 5 do PRE-EMIT CHECK** (linhas 76-81).

- [x] **E6 — [linha 10, AGREEMENT #1 / linha 67] regra anti-jargão.**
  Texto: *"Operator-vocabulary check: nunca usar scaffolding interno (Dim N, P2↔B3, R1-R6, slider/break-point/fila/n_min) como linguagem compartilhada. Aterrissar o CONCEITO nas palavras do operador + analogia Feynman ANTES de usar; termo do doc que não é dele → explicar de primeiros princípios primeiro."* (gate item 9; Iter.0/1/2/3 — "não entendi" 4x).

- [x] **E7 — [linhas 1-3, header] afinar regra de idioma.**
  Texto: *"Questions to user = PT-BR, Feynman (primeiros princípios + analogia), enxuto. Pyramid governa ESTRUTURA, não densidade — nunca dump. ES denso só dentro dos 3 deliverables."* (gate item 5; Iter.2 erro de registro).

- [x] **E8 — [após linha 190, START] per-iteration close + rigor antecipado.**
  Texto: *"Cada iteração TERMINA com artefato revisável; cada intervenção carrega hipótese + como validar impacto + estimativa-de-impacto vs KPI + (onde há execução) matriz risco×impacto + credenciais/logs/cruzamento de políticas. DEPOIS: retro RL + atualizar memory."* (gate item 11; Iter.3-Cockpit: rigor que o Leo teve que pedir).

- [x] **E9 — [EXECUTION MODEL, Stage 0] delimitar o EIXO da divergência (novo, deste triple-check Cockpit).**
  Texto: *"Divergence axis = PROBLEMA + 11 dims ONLY; os 3 research agents são TODO o fan-out do Stage 0; NENHUMA lente de UI/info-arch/dataviz/skill-routing/CEO-ambition (= solution-compute, proibido até o CONVERGENCE GATE)."* — eu disfarcei cockpit+Cairo/Knaflic de "divergência legítima"; o gate só proibia solução ANTES do problema, não delimitava o eixo DENTRO do Stage 0.
- [x] **E10 — [STAGE 0.0] pergunta de identidade do ator + micro-check de 3 suposições (novo).**
  Texto: *"¿el operador GESTIONA CLIENTES o GESTIONA la IA? + liste 3 suposições que, se falsas, colapsam a tela (cada uma com evidência VIVIDA)."* — a pergunta de 1 linha que teria pego o reframe agent-manager no minuto zero (em vez do passo 6).
- [x] **E11 — [FEW-SHOT] disclaimer anti-anchor (novo).**
  Texto: *"ILUSTRATIVO; o ator é OUTPUT do Stage 0, não premissa; não ancorar em Cohorts-Explorer/operador=gere-clientes — uma sessão real reframeou pra agent-manager."* — o few-shot ancorava exatamente a moldura que a sessão descartou.
- [x] **E12 — [START] env-precheck no turno 1 (novo).**
  Texto: *"Confirmar memory/RL graváveis (plan-mode off, perms OK); se bloqueado, dizer no turno 1 e resolver no 1º fracasso — nunca adiar a persistência do RL."* — plan mode bloqueou a memory a sessão inteira; Leo pediu 3x.

> **E13–E16 (deste triple-check do build do Cohorts):** ✅ **APLICADAS** — [[gate-pre-response]] itens 14-16 + engine `_prompt_feature_breakdown.md` (EXECUTION MODEL fan-out = E13/E14; PRE-EMIT itens 6-8 = ID-consistency / E15-bilateral / no-self-contradiction). E16 (FS-paralelo) = comportamento+gate. *(Re-li o engine ANTES de editar — E16 em ação — a sessão paralela não o havia tocado.)*

- [x] **E13 — [EXECUTION MODEL, fan-out] ID-REGISTRY FREEZE.** Antes do fan-out de spec multi-OUTPUT, gerar na ESPINHA a tabela canônica de IDs (EC/BR/MF/EPIC/US) e passá-la CONGELADA a cada agente como namespace read-only ("só referencie por ID; proibido criar/renumerar; ID novo volta à espinha"). Crítico ganha: "todo ID referenciado resolve a uma fila do mesmo número — zero dangling/colisão". Crosswalk = band-aid, não conserto. Distinto do E5 (E5=anti-truncamento; E13=anti-drift entre agentes paralelos). **Causa direta do único blocker (2x) do Cohorts.**
- [x] **E14 — [contrato dos agentes de fan-out] OUTPUT-PURO.** "output = SÓ o corpo a partir do header `#…`; zero preâmbulo / meta-comentário / 'I have enough context'". O assembly não deve precisar de limpeza pós-hoc.
- [x] **E15 — [build-readiness + PRE-FLIGHT] CONTRATO CROSS-SCREEN BILATERAL.** Contrato com outra tela = `[I]` BILATERAL; só `[V]` quando OS DOIS docs nomeiam os campos (micro-grep no doc-alvo). Painel de contrato cross-screen roda no PRE-FLIGHT (antes do 1º build de tela com consumidores já specados), não entre rodadas. — no Cohorts ficou unilateral (P1 tem os campos, NBA/Goals não).
- [x] **E16 — [PRE-FLIGHT / antes de cada Write] FS-PARALELO.** Re-verificar existência+nome dos arquivos-fonte/dependência antes de cada Write/assembly (sessão paralela renomeia/deleta no meio — cockpit→02_NBA, pantalla_01 deletado). "Qual é a BASE?" vale pros ARQUIVOS, não só pro Leo.

---

## Definition of Done (binário — espelha o build-readiness do Engine)

A próxima feature está PRONTA quando TODOS forem verdadeiros:

- [ ] **GATE-0 passou:** problema + funcionalidade mínima validados COM o Leo nesta sessão (não doc-only); BASE confirmada
- [ ] **Cobertura 11/11 dims** · 0 `[I]` BLOQUEANTE · ÉPICAS MECE (cobrem a tela, sem solape, cada uma desarrollable)
- [ ] **Provenance íntegra:** toda linha `[V]`/`[I]`/`[C]`; nenhum `[V]` veio do meu Recomendo; doc `[I]` continua `[I]`; hard-nos presentes (cross-tenant, financeiro-nunca-autônomo, `min()`, PII/anti-injection, versioning, n_min)
- [ ] **Build-readiness vazio:** um code-agent lê os 3 outputs e faz ZERO follow-up
- [ ] **Crítico de completude passou:** todos os sub-procesos (1A…NX) + 3 seções de fecho presentes (anti-truncamento)
- [ ] **IDs consistentes (anti-drift):** todo ID referenciado (EC/BR/MF) resolve a uma fila do mesmo número; zero dangling/colisão; registro congelado na espinha (E13) — crosswalk NÃO conta como conserto
- [ ] **Header não se autocontradiz:** todo claim do header/síntese ("sin drift", "contrato folrado") bate com o que o build-readiness lista como pendente
- [ ] **Contrato cross-screen ratificado ou marcado `[I]` bilateral:** os campos prometidos a consumidores existem NOS DOIS docs (micro-grep), senão = `[I]` BILATERAL (não `[V]`)
- [ ] **Sem jargão não-aterrissado** nas perguntas; registro to-user em PT-BR Feynman
- [ ] **Recorrido (fluxos) passou pelo triple-check de UX** (SAT + design-review + UI/UX); estados vazio/carga/erro presentes
- [ ] **Ritual RL feito:** retro `/sat`+`/problem-solving` grounded (sem dados sintéticos) no topo de `rl-iteration-log.md`; lição virou item de gate
- [ ] **Qualidade-alvo atingida:** o deliverable está no nível de `specs/02_NBA Playbooks best actions screen.md`