# 01 · Mapa de Dados (o que EXISTE no DB hoje) + decisões aterradas

> Você pediu: "preciso ver todas as infos que tens hoje pra poder definir métricas/subgrupos".
> Aqui está o terreno real (colunas + exemplos + o que varia), depois as decisões **aterradas em
> colunas concretas** (não mais abstratas). Fonte: query direta no Postgres + o seed que gerei.

---

## A. As tabelas que importam pra cohort

### `tenant.Restaurante` — 1 linha por restaurante (info "de cadastro")
| coluna | exemplo | varia? | serve pra métrica/subgrupo? |
|---|---|---|---|
| `restaurante_id` | `R001` | id | chave |
| `tenant_id` (pool) | `POOL-001` | **sim** (2 pools) | é fronteira de isolamento, não métrica |
| `tier_base` | `long_tail` | **sim** (managed_brand / managed_midmarket / long_tail) | **já é eixo do cohort** |
| `segmento` | `long_tail` | **sim** (managed / long_tail) | **já é eixo do cohort** |
| `fecha_alta` | `2025-09-01` | **sim** | vira `tenure_bucket` = **já é eixo do cohort** |
| `atributos_vivos` (jsonb) | `{fuso:"America/Sao_Paulo", ventana:"noche"}` | **NÃO** (constante) | inútil hoje |
| `estado` | `activo` | **NÃO** (constante) | inútil hoje |
| `tenure_actual` | (NULL→computado) | resultado | derivado de fecha_alta |

➡️ **Conclusão dura:** a nível-restaurante, só variam `tier`, `segmento`, `tenure`, `pool` — e
`tier×tenure` **já são os eixos do cohort**. Ou seja, **não há atributo de cadastro sobrando pra
fazer subgrupo de 2º nível**. Subgrupo terá que vir de **comportamento** (derivado de Orden) ou de
um categórico que eu **passe a variar no seed**.

### `tenant.Orden` — N linhas por restaurante (transações = a fonte RICA de comportamento)
| coluna | exemplo | varia? |
|---|---|---|
| `fecha` | `2026-06-01` | sim (últimos 90d) |
| `valor_bruto` / `fee` / `valor_neto` | 54.00 / 10.80 / 43.20 | sim (R$20–100) |
| `status_pago` | `ok` | **sim** (`ok` / `fallido` / `pendiente`) |
| `zona` | `centro` | **NÃO** (constante) |
| `tipo_comida` | `pizza` | **NÃO** (constante) |
| `canal` | `app` | **NÃO** (constante) |

➡️ Daqui saem métricas reais: **GMV** (`sum(valor_neto ok)`), **recurrencia** (`count(ok)` ou nº
semanas ativas), **ticket médio** (`avg(valor_neto ok)`), **taxa de falha** (`fallido/total` — o sinal
"silenciosos"/cobrança), **volume** (`count`). Os categóricos (`zona/tipo_comida/canal`) hoje são
constantes — se você quiser subgrupo por eles, eu **vario o seed**.

### `tenant.Conversa_Episodio` — tickets (sinal de Support)
`intent` varia: `cobranca`(27), `entrega`(25), `promo`(25), `calidad`(18). ➡️ dá **conteo de tickets**
por restaurante e por intent. (A classificação da causa é da Feature B, não daqui.)

### `tenant.Evento_Uso` — uso da plataforma
⚠️ **VAZIA (0 linhas).** Não há telemetria de uso. ➡️ **não existe fonte real pra "conexion"/atividade
de login.** Se "conexion" for um KPI, ou eu (a) gero esse dado, ou (b) uso um proxy de Orden (ex:
recência/frequência), ou (c) marca `[C]` e fica pra depois.

### `tenant.KPI` + `catalog.Named_Query` — definições de métrica
Hoje só `kpi_recurrencia`. `Named_Query` guarda a fórmula (executada sempre em SQL, nunca LLM).

### `cohort.Cohort` + `cohort.Pertenencia_Cohort_Snapshot` — o RESULTADO
Hoje **vazias** (o P01 não rodou nesta sessão). Quando roda: `Cohort` ganha `n_cuentas`,
`baseline_descriptivo`, flags `colapsada`/`supresion_k`; `Pertenencia` ganha `percentil_en_cohort`,
`gap_hasta_top` por restaurante×semana.

> Nota: o schema cresceu (trabalho paralelo adicionou tabelas de 05A/05B/02: `Afetado`,
> `Problema_Diagnosticado`, `Knowledge_Case`, `NBA_Propuesta`, `Decision_Trace`, `min_calculo`…).
> Essas são de **outras telas** — não entram nas métricas do cohort.

---

## B. Como se relacionam (simples)
```
Restaurante (1) ──< Orden            (transações → GMV, recurrencia, falha)
Restaurante (1) ──< Conversa_Episodio (tickets → conteo por intent)
Restaurante (1) ──< Evento_Uso        (uso → VAZIO hoje)
Restaurante ──(P01 agrupa por tier×tenure)──> Cohort ──< Pertenencia (percentil por restaurante)
```

---

## C. ⚠️ As 3 verdades que mudam as decisões
1. **Subgrupo não tem atributo de cadastro livre** → tem que ser comportamental (Orden) OU eu vario um categórico no seed.
2. **Só Orden tem sinal comportamental real**; `zona/tipo_comida/canal` são constantes hoje.
3. **Evento_Uso vazia** → "conexion" e qualquer KPI de uso **não têm fonte**; "cross_sell" idem (tipo_comida constante).

---

## D. Decisões — agora aterradas (menu concreto). Responde só a letra, ou "default".

### D1. Subgrupo — como quebrar a célula em 2º nível
**Plain:** dentro de cada cohort (ex: `long_tail × 6-12m`), criar sub-faixas. Como não há atributo de
cadastro sobrando, as opções reais são:
- **(a) por comportamento** — tercis de uma métrica de Orden (ex: alto/médio/baixo GMV ou recurrencia). *Sem mexer no seed.* ⭐ recomendo.
- **(b) por categórico** — `zona` ou `tipo_comida` ou `canal`. *Eu passo a variar no seed.*
- **(c) sem subgrupo agora** — deixo 1 só (`all`) e fica fase 2.
**👉 escolhe a/b/c** (se b, qual coluna).

### D2. Métrica de ranking (define o percentil do cohort)
**Plain:** qual número ordena os restaurantes dentro do cohort. Menu (tudo de Orden, real):
- **(a) GMV** = `sum(valor_neto ok)` · (b) **recurrencia** = `count(ok)` · (c) **ticket médio** = `avg(valor_neto ok)` · (d) **composta** (você dá os pesos).
+ **janela**: 28d / 90d / tudo.
**👉 letra + janela.** ⭐ default: (a) GMV, 90d, maior=melhor.

### D3. As 4 KPIs do perfil — quais e de onde
**Plain:** o perfil do cohort mostra alguns KPIs. Confirma a fonte de cada (deixei o que dá pra derivar hoje):
| KPI | dá pra derivar HOJE? | fonte sugerida |
|---|---|---|
| recurrencia | ✅ | `count(Orden ok)/janela` |
| tickets | ✅ | `count(Conversa)/janela` |
| **conexion** | ❌ (Evento_Uso vazia) | proxy: nº dias com Orden? ou gero Evento_Uso? **👉 você decide** |
| **cross_sell** | ❌ (tipo_comida constante) | proxy: nº tipos distintos? ou gero variação? **👉 você decide** |
**👉 confirma os 2 ✅ e me diz o que fazer com os 2 ❌** (proxy / gerar dado / dropar).

### D4. Topo-vs-base — "qual é o corte de baixo?"
**Plain:** comparo os melhores (P90+) com os piores do cohort. "P-bajos" = quem entra como "pior"
pra comparação: os 10% de baixo (**P10**), os 25% (**P25**), ou metade de baixo (**P50**)?
**👉 P10 / P25 / P50.** ⭐ default: P25.

### D5. Fórmula do UPSIDE
**Plain:** "se a base operasse como o topo, quanto a mais?". Fórmula = `(métrica_topo − métrica_base) ×
nº_restaurantes_da_base`. Só preciso saber se é assim e em que **unidade** (R$ / nº pedidos).
**👉 confirma a fórmula + unidade.** ⭐ default: essa fórmula, unidade = a da métrica de ranking.

### D6. `at_risk` (conta "em risco")
**Plain:** quando marco uma conta como em risco. Menu (combinável):
- (a) caiu de percentil · (b) percentil < X (ex: 25) · (c) 0 pedidos ok na janela (churn) · (d) taxa de falha subindo.
**👉 escolhe as condições + valores.** ⭐ default: (b) <25 numa queda OU (c) churn.

### D7. Holdout (`baseline_atribucion_segmento`)
**Plain:** pra dizer "a NBA gerou +R$X de verdade", precisaria comparar com um grupo que **não**
recebeu NBA (controle). Isso é holdout. No demo **não temos grupo de controle**. Opções:
- (a) **pré/pós** (compara antes vs depois — simples, imperfeito) · (b) deixar **`[C]` stub** (fase 2, holdout real precisa de desenho experimental).
**👉 a / b.** ⭐ default: (b) — é honesto, holdout real é fase 2.

### D8. TTL + cadência
**Plain:** **TTL** = de quantos dias um cálculo vira "velho/stale" (marca aviso). **Cadência** = de
quanto em quanto tempo o robô re-roda o P01.
**👉 TTL=? dias · cadência=? (semanal/…).** ⭐ default: TTL=7d, semanal.

---

## E. (Grupo B, depois) NBA_Catalogo A1-A8 — como me mandar
**Formato:** uma linha por código:
```
A1 | <nome curto da ação> | <directa|indirecta|ninguna>
A2 | ...                   | ...
...
A8 | ...                   | ...
('corrigir-callado' do fixture mapeia em qual? default A3)
```
Pode mandar aqui no chat ou preencher aqui. Não bloqueia o Grupo A.
