# 01 · NBA Issue Tree (diagnóstico → ação) · /problem-solving

> Pediste: quebrar tua lógica de NBA num issue-tree claro que CÓDIGO+AGENTE possam seguir.
> Framework: McKinsey issue-tree MECE. Fonte = tuas respostas (comentário E do DATA_MAP).
> **Grupo B** (NBAs rodam *depois* dos cohorts) — mas já deixo travado pra fechar `NBA_Catalogo A1-A8`.

---

## Governing thought (síntese, o "e daí")

> **Um restaurante abaixo do seu cohort não tem "um" problema — tem um problema num estágio
> específico do funil ordem→GMV. A NBA certa é destravar o PRIMEIRO estágio que falha.**
> Ordem só vira GMV se: (1) está **disponível** → (2) é **atrativa** → (3) há **demanda** →
> (4) é **cumprida** → (5) é **legítima**. Cada estágio = uma alavanca = uma ação fechada.

A ordem importa: sem conexão, nada mais importa (não recebe ordem). Por isso o tree é um
**funil priorizado**, não uma lista paralela. Diagnostica de cima pra baixo, para na 1ª falha.

---

## Issue tree (MECE — 5 estágios, mutuamente exclusivos, exaustivos do caminho ordem→GMV)

```
RAIZ: Restaurante abaixo do percentil-alvo do seu cohort (vende menos que pares comparáveis)
│   (cohort = mesma categoria × mesma região × mesmo tamanho — comparável de verdade)
│
├─ 1. DISPONIBILIDADE — está conectado as horas que prometeu?         [sinal: conexão = h_online/h_prometida]
│     ├─ NÃO (conexão baixa) ──────────────────────────────────────► A1  Aumentar conexão
│     └─ SIM → desce
│
├─ 2. ATRATIVIDADE — dado conectado, a oferta converte?              [sinais: preço vs cohort, qualidade menu]
│     ├─ preço alto vs pares ─────────────────────────────────────► A2  Revisar preço vs concorrência
│     │     └─ (se ajuste de preço insuficiente) ─────────────────► A3  Propor promoção/bono  ⚠️DIRECTA
│     ├─ menu fraco (sem foto / sem descrição) ───────────────────► A4  Melhorar menu (foto+descrição)
│     └─ preço ok + menu ok → desce
│
├─ 3. DEMANDA — conectado + atrativo, mas ainda sem ordens?         [sinal: volume de ordens NA REGIÃO ↓]
│     ├─ demanda da região caindo ────────────────────────────────► A5  Estimular demanda local
│     │     (= problema de LOCAL, não do restaurante — NÃO penalizar a conta)
│     └─ demanda ok → desce
│
├─ 4. CUMPRIMENTO — chega ordem mas não completa (cancelamento)?    [sinais: taxa cancel, cancelado_por]
│     ├─ cancelado pelo RESTAURANTE ──────────────────────────────► A6  Resolver operação (causa do cancel)
│     └─ cancelado pelo USUÁRIO → desce (estágio 5)
│
└─ 5. INTEGRIDADE — cancel/problema ligado a característica do usuário?  [sinal: padrão anômalo no usuário]
      ├─ padrão suspeito (possível abuso/fraude) ─────────────────► A7  Investigar fraude/risco  (→ humano)
      └─ sem causa atribuível ───────────────────────────────────► A8  Observação (sem ação; não inventa causa)
```

**MECE check:** os 5 estágios cobrem todo o caminho ordem→GMV (exaustivo) e cada um é uma alavanca
distinta (mutuamente exclusivo: conexão ≠ preço ≠ demanda ≠ cancel ≠ fraude). ✅

**Nuance-chave que tu levantaste (estágio 3):** conectado + bom menu + sem ordens **não é culpa da
oferta** → é demanda/local. O tree separa explícito *problema de oferta* (1,2,4) de *problema de
demanda/local* (3) e *problema do usuário* (5). Sem isso, penalizaríamos um restaurante bom num
bairro fraco.

---

## NBA_Catalogo A1-A8 (fechado) — `04 §3.4`

| cód | ação (nome curto) | estágio | `clase_financiera` | dispara |
|---|---|---|---|---|
| **A1** | Aumentar conexão (conectar + horas) | 1 disponibilidade | `ninguna` | nudge conexão |
| **A2** | Revisar preço vs concorrência | 2 atratividade | `indirecta` | recomendação preço (só PROPÕE) |
| **A3** | Propor promoção / bono | 2 atratividade | **`directa`** ⚠️ | **AI só PROPÕE; humano libera** (§3.3) |
| **A4** | Melhorar menu (foto + descrição) | 2 atratividade | `ninguna` | checklist qualidade |
| **A5** | Estimular demanda local | 3 demanda | `indirecta` | sinal a growth/marketing local |
| **A6** | Resolver operação de cancelamento | 4 cumprimento | `ninguna` | ticket operação |
| **A7** | Investigar fraude/risco | 5 integridade | `ninguna` | escala humano/risco |
| **A8** | Observação (sem ação atribuível) | fallback | `ninguna` | fail-closed: não inventa causa |

⚠️ **Só A3 é `directa`** (toca dinheiro) → regra-mãe §3.3: IA **nunca** libera, só propõe; humano confirma.
Fail-closed (§3.7): causa não-atribuível ⇒ **A8**, nunca chuta A1-A7.

**`corrigir-callado` do fixture:** mapeava em A3 (default antigo). Com este tree mapeia melhor em
**A6** (cancelamento silencioso = operação). 👉 confirma A6 ou outro.

---

## Como CÓDIGO vs AGENTE se dividem (§8 golden rule)

- **CÓDIGO** = os *sinais determinísticos* (conexão, preço-vs-cohort, taxa cancel, cancelado_por,
  volume-região, qualidade%) — todos `Named_Query` SQL, números nunca do LLM.
- **AGENTE** = lê os sinais, **percorre o tree**, escolhe o A_n e **escreve o texto** da recomendação.
  Nunca fabrica número; causa não-atribuível = `[C]`/`[I]`, nunca `[V]`.
- Contrato: `Evento_Priorizado_NBA{cohort_id, restaurante_id}` → AGENTE `02:1A` propõe a NBA.

---

## Pendências p/ fechar (Grupo B)

- [ ] confirma `corrigir-callado` → A6.
- [ ] estágio 2: ordem A2(preço)→A3(promo) ok? ou A4(menu) antes de preço?
- [ ] estágio 3: como detectar "demanda da região ↓" — precisa de série de ordens por zona (já viável se variar `zona` no seed).
- [ ] estágio 5: que "característica do usuário" sinaliza fraude (Feature B / Support owns) — fora do slice 01.
