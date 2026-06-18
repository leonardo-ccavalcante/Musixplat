# 01 · Cohort MODEL v2 — síntese das tuas respostas (o que vou construir)

> Não é "simplificar" — é **redesenhar o cohort em métricas operacionais reais** (tuas respostas no
> DATA_MAP). Aqui está o que TRAVEI das tuas respostas + o que isso obriga a mudar no schema/seed +
> os **3 pontos que ainda travam código**. Responde os 3 e eu rodo `/autoplan`→TDD→`/review`.

---

## A. O que travei (das tuas respostas — não mexo sem teu OK)

### A.1 — Eixos do cohort = comparável de verdade
Tu disseste: *"não pode criar cohort com categorias diferentes — sushi com sushi, região com região,
mesmo tamanho (manager ou não)."*
➡️ **Cohort = `tipo_comida` × `zona` × `tier`** (categoria × região × tamanho). É a célula onde
todos são comparáveis. (Hoje só agrupava `tier×tenure`; `tipo_comida`/`zona` eram constantes →
**vou variar no seed**.) ⚠️ cardinalidade = **decisão D-A abaixo** (poucos restaurantes p/ muitas células).

### A.2 — Score composto = define o percentil dentro do cohort
Tu deste os pesos:
```
score = 0.40·P(ordens)  +  0.30·P(conexão)  +  0.20·P(qualidade)  +  0.10·P(cancelamento_inv)
```
- `P(x)` = percentil da métrica x dentro do cohort.
- `ordens` = volume de ordens · `conexão` = h_online/h_prometida · `qualidade` = (%foto+%descrição)/2
- `cancelamento_inv` = invertido (cancelar menos = melhor).
➡️ `percentil_en_cohort` = rank do `score`. **Isto substitui** o `recurrencia` simples de hoje.

### A.3 — Subgrupo = tercil do score composto
Não há atributo de cadastro sobrando → subgrupo = **tercil do `score`** dentro do cohort
(alto / médio / baixo). n_min + k-anon aplicados **por subgrupo** (spec F-1.1).

### A.4 — KPIs do perfil (teus 10, agrupados em 4 famílias)
| família | KPIs (fórmula SQL determinística) | fonte |
|---|---|---|
| **Volume** | Σordens · ticket médio = Σvalor/Σordens · GMV | Orden |
| **Conexão** | Σh_online / Σh_prometida | Restaurante+telemetria |
| **Cumprimento** | %entregue=Σentregue/Σtotal · taxa_cancel_rest=canc_rest/Σtotal · taxa_cancel_user=canc_user/Σtotal · share_cancel_rest=canc_rest/canc_total · share_cancel_user=canc_user/canc_total | Orden |
| **Qualidade** | %foto=Σfoto/Σtotal · %descrição=Σdesc/Σtotal | Orden |
| (+tickets) | Σconversas / janela (sinal Support) | Conversa |
➡️ `cross_sell` **dropado** (não está no teu modelo). `conexión` agora é **real** (horas).

### A.5 — Topo-vs-base = dois pares
`P90 ↔ P10` **e** `P75 ↔ P25`. Mostro n de cada banda (k-anon/n_min podem suprimir banda fina).

### A.6 — Upside = modelo de lift de ordens (ponderado)
*"se a base fechasse os gaps até o topo, quantas ordens a mais?"*
```
Δordens_base = n_base · Σ_f  w_f · (topo_f − base_f)
   f ∈ {conexão, preço, qualidade, cancelamento}      (médias do grupo)
   w_f = peso do fator no nº de ordens   ← [C] D-B abaixo
```
unidade = **nº ordens** (→ R$ via ticket médio). Sempre `[C]` (projeção, nunca [V]).

### A.7 — at_risk = caiu de percentil; raiz = ordens
`at_risk` = caiu de percentil (ou < umbral). **Causa-raiz = ordens↓** (também cancel↑, qualidade↓,
conexão↓ — mas o crux é vender menos). pre-churn = vende menos que pares / começou a cair.

### A.8 — Cadência em 3 ritmos
- **diário** — monitora melhora + **alerta de spike** (cancel spike / conexão down rompe range) → atuar já.
- **semanal** — revisa se a conta continua no cohort + ação.
- **mensal** — reassign de cohort (muda ou não).
TTL das métricas de alerta = diário; baseline = 7d.

### A.9 — Holdout = botão de experimento (fase 2)
Tu queres *"um botãozinho que cria o experimento, mede, gera o próximo"*. Isso é **scaffolding de
experimento real** (> que o stub). Marco como **Grupo B / fase 2** (precisa desenho experimental).
No slice 01 fica `[C]` stub honesto + o botão entra no design de fase 2.

---

## B. O que isso OBRIGA a mudar no schema/seed (deltas)

| onde | delta | porquê |
|---|---|---|
| `tenant.Restaurante` | + `horas_prometidas` (committed) | denominador da conexão |
| telemetria | + `horas_conectadas` (gerar, determinístico) | numerador da conexão (Evento_Uso hoje vazia) |
| `tenant.Orden` | + `cancelado_por` enum(`restaurante`/`usuario`/`null`) | taxas/shares de cancel |
| `tenant.Orden` | + `descuento_pct` numeric | sinal promo/preço |
| `tenant.Orden` | + `tiene_foto` bool, `tiene_descripcion` bool | qualidade menu |
| `tenant.Orden` | **variar** `zona`, `tipo_comida` (hoje constantes) | eixos do cohort |
| `tenant.Conversa_Episodio` | + intents `menu`, `revision_orden`, `cancelamento` | sinais Support |
| `seed` | escalar nº restaurantes? | cardinalidade do cohort (D-A) |

Tudo gerado **determinístico por semente** (números derivam → sempre coerentes; §14: brutos só, zero
resultado semeado). As correlações que tu descreveste (qualidade↑→vendas↑, conexão→recebe ordem,
cancel↑→problema, promo→vende+) entram na **semente** pra os números contarem uma história real.

---

## C. ⚠️ Os 3 pontos que ainda travam código (responde só a letra / o número)

### D-A. Cardinalidade do cohort (o único bloqueio duro)
`tipo_comida × zona × tier` com 100 restaurantes = células minúsculas → quase tudo cai em k-anon(5)/
n_min(20). Não dá pra comparar "sushi-sushi-região" com n=2. Opções:
- **(a)** escalar seed p/ **~400-600 restaurantes** → 3 eixos funcionam com n≥20. *(usa o gerador multi-instância do Grupo B já agora)* ⭐ recomendo.
- **(b)** **2 eixos só**: `tier × tipo_comida` (dropa zona como eixo; zona vira filtro/sinal de demanda). Cabe em 100.
- **(c)** `tier × zona` (dropa tipo_comida como eixo).
👉 **a / b / c.**

### D-B. Pesos do upside (`w_f`)
Quanto cada fator move ordens (tua ponderação). Ex default que proponho:
`conexão 0.40 · qualidade 0.25 · cancelamento(inv) 0.20 · preço 0.15`. Sempre `[C]`.
👉 **confirma esses pesos OU me dá os teus** (ou "default").

### D-C. Confirmo gerar os dados que faltam?
Conexão (horas), cancelado_por, desconto, foto/descrição, variação de zona/tipo_comida **não existem
hoje** — vou **gerar determinístico** (com as correlações reais que descreveste). Confirma?
👉 **sim / ajustes.**

---

## D. Sequência depois das 3 respostas
`/autoplan` → schema+seed v2 (TDD: anti-fake gate primeiro) → composite ranking → subgrupos+gates →
KPIs → upside → at_risk → topo-vs-base(2 pares) → sandbox re-seg real → provenance-por-campo →
`/review`+`/codex` → **1 PR por chunk**. Grupo B (RLS, partição, generator formal, A1-A8, botão-experimento) depois.
