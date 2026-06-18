# 01 · Cohorts — Inputs que preciso de você (Grupo A)

> Preenche o `👉` de cada item (ou escreve **"default"** que eu uso o meu).
> O spec marca estes como `[I] needs-prototype` / `[C]` = **juízo de produto**, não dá pra eu derivar
> sozinho sem chutar. Quando você responder, eu: `/autoplan` → TDD → `/review`+`/codex` → PR por chunk.
> Os itens **sem input** (sandbox real, percentil_delta completo, único|cross, provenance-por-campo,
> TTL/stale) eu construo direto pelo spec — não precisam de você.

---

## 1. Subgrupo — por qual dimensão particionar a célula?  *(F-1.1, EPIC-1)*

**Por quê:** o spec quer cohort→subgrupo (2 níveis). Hoje é stub (`'all'`). Preciso saber por qual
atributo quebrar cada célula `(tenure×tier)` num 2º nível, com `N_subgrupo` + gates n_min/k por subgrupo.

**Clareza:** 1 dimensão (ou regra simples). Se for uma coluna que hoje é constante no seed
(`zona/tipo_comida/canal` estão fixos), eu **vario o seed** nessa dimensão — só me diz qual.

**Formato da resposta:**
```
dimensão = < zona | tipo_comida | canal | faixa_de_atividade(tertil de recurrencia)
            | atributo de Restaurante.atributos_vivos:<qual> >
(opcional) nº de subgrupos alvo por célula = <ex: 3>
```
**👉 SUA RESPOSTA:**
**Meu default:** `tipo_comida` (3-4 valores), e vario o seed pra ter variação real.

---

## 2. Métrica de ranking — o que define o `percentil_en_cohort`?  *(F-1.2)*

**Por quê:** TODO o percentil/gap depende disso. Hoje uso `recurrencia = count(Orden ok, 28d)`.

**Clareza:** 1 fórmula (sobre quais colunas/tabelas) + janela.

**Formato:**
```
métrica = <ex: GMV = sum(Orden.valor_neto ok) | recurrencia = count(Orden ok)
           | atividade = count(Evento_Uso) | composta = w1*GMV + w2*recurrencia >
janela = <ex: 28d | 90d | all>
sentido = <maior é melhor | menor é melhor>
```
**👉 SUA RESPOSTA:**
**Meu default:** `recurrencia = count(Orden ok)`, janela 28d, maior=melhor.

---

## 3. As 4 KPIs do `baseline_cohort`  *(F-1.8, BR-25)*

**Por quê:** o perfil do cohort precisa de `valor_actual_kpi` por `{conexion, tickets, recurrencia, cross_sell}`.
Hoje só calculo 1. `recurrencia`/`tickets` eu derivo fácil; **`conexion` e `cross_sell` não tenho como derivar**
dos brutos atuais sem você definir (ou eu invento + flago `[C]`).

**Clareza:** pra cada KPI, a fórmula (coluna/tabela) + janela. Preenche a tabela:

| KPI | fórmula (tabela.coluna) | janela | meu default se vazio |
|---|---|---|---|
| recurrencia | 👉 | 👉 | `count(Orden ok)/28d` |
| tickets | 👉 | 👉 | `count(Conversa_Episodio)/28d` |
| conexion | 👉 | 👉 | `count(distinct dia c/ Evento_Uso)/28d` `[C]` |
| cross_sell | 👉 | 👉 | `count(distinct Orden.tipo_comida)` `[C]` |

**👉 Confirma a tabela ou corrige as linhas que quiser.**

---

## 4. Topo-vs-base — bordas dos "P-bajos"  *(F-1.6)*

**Por quê:** comparo P90+ vs base. Hoje "base" = `<P90`. O spec sugere P10/P25.
**Formato:** `borda_base = < P10 | P25 | <P50 | percentil:<N> >`
**👉 SUA RESPOSTA:**  **Default:** P90+ vs P≤25.

---

## 5. Fórmula do UPSIDE  *(F-1.7, BR-16 — sempre `[C]`, projeção)*

**Por quê:** "se a base operasse como o topo, quanto a mais?". Hoje: `(top.métrica − base.métrica) × n_base`.
**Formato:**
```
upside = <fórmula, ex: (top.GMV_medio − base.GMV_medio) × n_base × fator:<0..1>>
unidade = < R$ | nº pedidos | % >
```
**👉 SUA RESPOSTA:**  **Default:** `(top.métrica − base.métrica) × n_base`, unidade = da métrica de ranking.

---

## 6. `at_risk` / pre-churn  *(BR-21)*

**Por quê:** classificar `at_risk` no delta. Hoje: `percentil < 25` numa queda.
**Formato:**
```
at_risk = < percentil < X(=25) numa queda | caiu de cohort | sem Orden ok há Y dias | combinação >
```
**👉 SUA RESPOSTA:**  **Default:** `percentil < 25 numa queda` OR `churn (0 Orden ok na janela)`.

---

## 7. Holdout / `baseline_atribucion_segmento`  *(BR-17 — o difícil)*

**Por quê:** Goals/North Star precisa de baseline **contrafactual** (incremento vs gross), separado do descriptivo.
Holdout real precisa de grupo-controle (desenho experimental) — não tem no demo.
**Formato:**
```
abordagem = < pre/post simples (antes vs depois da NBA) | holdout aleatório (% controle)
              | diferença-em-diferenças | DEIXA [C] stub por enquanto >
(se holdout) % controle = <ex: 10%>
```
**👉 SUA RESPOSTA:**  **Default:** `pre/post simples`, flagado `[C]` (holdout real = fase 2).

---

## 8. TTL + cadência do agente  *(BR-12, BR-20)*

**Formato:** `TTL_baseline = <dias>` · `cadência_agente = < semanal | diária | <N>d >`
**👉 SUA RESPOSTA:**  **Default:** TTL=7d, cadência=semanal (já está nos knobs).

---

## (Grupo B — depois, mas já deixo aqui) NBA_Catalogo A1-A8  *(04 §3.4)*

**Por quê:** os 8 códigos de ação fechados — o spec diz pra ratificar com você. Não bloqueia Grupo A.
**Formato:**
```
A1 = <nome curto> · clase_financiera_default <directa|indirecta|ninguna>
... A8
('corrigir-callado' do fixture mapeia em qual? default A3)
```
**👉 SUA RESPOSTA (pode deixar pra depois):**

---

### Resumo do que NÃO precisa de você (construo direto)
sandbox re-segmentação real · `percentil_delta{sentido,magnitud,ventana,n_min_ok}` ·
`distribución{único|cross}` · provenance-por-campo · TTL/stale marking · subgrupo gates n_min/k
(uma vez definida a dimensão no item 1).
