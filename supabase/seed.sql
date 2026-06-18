-- ============================================================================
-- SEED — BRUTOS ONLY (04 §6, §14). Populates ONLY raw business inputs + catalog/config.
-- Every RESULT (percentil, gap, baselines, n_cuentas, delta_status, valor_hoy, conexión RATIO,
-- upside, ...) stays NULL/empty until its producer runs. pnpm test:antifake fails if broken.
--
-- MODEL v2 (Leo ratified 2026-06-18): 5000 restaurantes; cohort axes = tipo_comida × zona × tier;
-- operational signals (conexión horas, cancelado_por, desconto, qualidade foto/descrição) GENERATED
-- DETERMINISTICALLY with the real correlations Leo described:
--   qualidade↑ → vendas↑ · conexão↑ → recebe + ordens · cancel↑ penaliza · cada zona tem demanda própria
--   (→ permite detectar "bom restaurante, zona fraca" = problema de demanda, não de oferta).
-- Same input ⇒ same seed (reproducible). det_int lives in migration 20260617000006.
-- ============================================================================

-- ── Catalog: knobs BY NAME (CLAUDE.md §3.8). Values ratified by Leo. ──
insert into catalog."Config_Perillas"(key, valor, provenance, owner) values
  ('k_anon_threshold',         '5',  '[V]', 'leo'),
  ('n_min_threshold',          '20', '[V]', 'leo'),
  ('tenure_border_1_months',   '3',  '[V]', 'leo'),
  ('tenure_border_2_months',   '6',  '[V]', 'leo'),
  ('tenure_border_3_months',   '12', '[V]', 'leo'),
  ('TTL_baseline_days',        '7',  '[C]', 'leo'),
  ('D_dias_verde',             '14', '[C]', 'leo'),
  ('cohort_rule_version_vigente', 'v1', '[V]', 'leo'),
  ('p90_percentil_corte',      '90', '[C]', 'leo'),
  ('at_risk_percentil_max',    '25', '[C]', 'leo'),
  -- MODEL v2 composite-ranking weights (Leo ratified 2026-06-18) — read BY NAME, never literals.
  ('peso_score_ordens',        '0.40', '[V]', 'leo'),
  ('peso_score_conexion',      '0.30', '[V]', 'leo'),
  ('peso_score_qualidade',     '0.20', '[V]', 'leo'),
  ('peso_score_cancel',        '0.10', '[V]', 'leo'),
  -- MODEL v2 upside weights (Leo ratified 2026-06-18) — factor impact on orders ([C] projection).
  ('peso_upside_conexion',     '0.40', '[C]', 'leo'),
  ('peso_upside_qualidade',    '0.25', '[C]', 'leo'),
  ('peso_upside_cancel',       '0.20', '[C]', 'leo'),
  ('peso_upside_preco',        '0.15', '[C]', 'leo');

-- ── 05B Diagnóstico knobs ([C] placeholders, read BY NAME). ──
insert into catalog."Config_Perillas"(key, valor, provenance, owner) values
  ('umbral_clasificacion',      '0.60', '[C]', 'leo'),
  ('piso_confianza_path',       '0.50', '[C]', 'leo'),
  ('cap_profundidad_arbol',     '5',    '[C]', 'leo'),
  ('tolerancia_doublecheck',    '0.05', '[C]', 'leo'),
  ('tolerancia_reconciliacion', '0',    '[C]', 'leo'),
  ('ventana_silenciosos',       '30',   '[C]', 'leo');

-- ── Catalog: Cohort_Rule_Version (vigente v1 + prior v0 for anti-mezcla F-4.3 tests). ──
insert into catalog."Cohort_Rule_Version"(version_id, fecha, que_cambio, efecto_en_baseline, provenance) values
  ('v0', date '2026-01-01', 'regla inicial de buckets', 'baseline v0', '[C]'),
  ('v1', date '2026-06-01', 'ajuste de bordes de tenure', 'rebaseline v1', '[V]');

-- ── Catalog: Intent_Catalog (v2: + menu, revision_orden, cancelamento per Leo). ──
insert into catalog."Intent_Catalog"(intent_id, label, version) values
  ('cobranca',       'Cobrança / pagos',     'v1'),
  ('entrega',        'Entrega',              'v1'),
  ('calidad',        'Calidad',              'v1'),
  ('promo',          'Promociones',          'v1'),
  ('menu',           'Problemas de menu',    'v1'),
  ('revision_orden', 'Revisión de orden',    'v1'),
  ('cancelamento',   'Cancelación de orden', 'v1');

-- ── Catalog: Named_Query defs (deterministic SQL, never LLM, 04 §2). ──
insert into catalog."Named_Query"(def_version, formula, periodicidad, group_by, source_ref, unit) values
  ('nq_rank_recurrencia_v1',
   'recurrencia = count(distinct date_trunc(''week'', fecha)) over orders ok; rank within cohort',
   'semanal', 'cohort', 'tenant.Orden', 'percentil'),
  ('nq_kpi_recurrencia_v1',
   'avg(valor_neto ok) per restaurante, aggregated to cohort',
   'semanal', 'cohort', 'tenant.Orden', 'BRL');

-- ── tenant.KPI defs (target = config [C]; valor_hoy is a RESULT → NULL). ──
insert into tenant."KPI"(kpi_id, tenant_id, restaurante_id, nivel, clase, kpi_def_version, target, provenance) values
  ('kpi_recurrencia', 'POOL-001', null, 'empresa', 'performance', 'nq_kpi_recurrencia_v1', 0.70, '[C]');

-- ── gov.Usuario (two pools → exercises the RLS guard + cross-pool block). ──
insert into gov."Usuario"(usuario_id, tenant_id, nivel_org, rol) values
  ('U-OP-001', 'POOL-001', 'equipo', 'agent_manager_senior'),
  ('U-OP-002', 'POOL-002', 'equipo', 'agent_manager_senior');

-- ── tenant.Restaurante: 5000. Cohort axes = tipo_comida × zona × tier. ~5% managed/95% long_tail;
--    ~10% POOL-002. fecha_alta spread 0-23m. tenure_actual stays NULL (RESULT, F-1.1). ──
insert into tenant."Restaurante"(restaurante_id, tenant_id, tier_base, segmento, fecha_alta,
                                 zona, tipo_comida, horas_prometidas_semana, atributos_vivos)
select s.rid,
       case when public.det_int(s.rid, 7, 100) < 10 then 'POOL-002' else 'POOL-001' end,
       s.tier, s.seg,
       date '2026-06-17' - (public.det_int(s.rid, 11, 24) || ' months')::interval,
       s.zona, s.tipo,
       (40 + public.det_int(s.rid, 8, 41))::numeric(6,2),         -- 40..80 committed hours/week
       jsonb_build_object('fuso', 'America/Sao_Paulo', 'ventana', 'noche')
from (
  select rid,
         (array['centro','norte','sul','leste','oeste','sudeste','noroeste','litoral'])[1 + public.det_int(rid, 5, 8)] as zona,
         (array['pizza','sushi','burger','brasileira','saudavel','doces'])[1 + public.det_int(rid, 6, 6)] as tipo,
         case when public.det_int(rid, 3, 1000) < 30 then 'managed_brand'::public.tier_base
              when public.det_int(rid, 3, 1000) < 50 then 'managed_midmarket'::public.tier_base
              else 'long_tail'::public.tier_base end as tier,
         case when public.det_int(rid, 3, 1000) < 50 then 'managed'::public.segmento
              else 'long_tail'::public.segmento end as seg
  from (select 'R' || lpad(g::text, 4, '0') as rid from generate_series(1, 5000) g) ids
) s;

-- ── tenant.Orden: volume CORRELATED with conexão/qualidade/zona-demanda, penalizado por cancel.
--    status_pago: 'ok'=entregada · 'fallido'=cancelada (cancelado_por restaurante|usuario) · 'pendiente'.
--    foto/descrição ~ Bernoulli(qualidade). desconto em ~25% das ordens. valor_neto é GENERATED. ──
insert into tenant."Orden"(restaurante_id, fecha, valor_bruto, fee, status_pago, cancelado_por,
                           descuento_pct, tiene_foto, tiene_descripcion, zona, tipo_comida, canal, provenance)
select r.restaurante_id,
       date '2026-06-17' - public.det_int(r.restaurante_id || ':' || g, 21, 90),
       vb.v, round(vb.v * 0.20, 2),
       st.status, st.canc,
       case when public.det_int(r.restaurante_id || ':' || g, 28, 100) < 25
              then (10 + public.det_int(r.restaurante_id || ':' || g, 29, 31))::numeric(5,2)
            else 0 end,                                                          -- desconto 10..40% em ~25%
       public.det_int(r.restaurante_id || ':' || g, 26, 100) < r.q,             -- tiene_foto ~ P(qualidade)
       public.det_int(r.restaurante_id || ':' || g, 27, 100) < r.q,             -- tiene_descripcion ~ P(qualidade)
       r.zona, r.tipo_comida, 'app', '[V]'
from (
  select rest.restaurante_id, rest.zona, rest.tipo_comida,
         public.det_int(rest.restaurante_id, 51, 101) as q,                     -- qualidade 0..100
         public.det_int(rest.restaurante_id, 53, 101) as cancel,               -- cancel propensity 0..100
         (8 + round(                                                            -- n_orders ~ 8..78
              ( 0.35 * public.det_int(rest.restaurante_id, 52, 101)             -- conexão
              + 0.25 * (40 + public.det_int(rest.zona, 71, 51))                 -- demanda da zona
              + 0.20 * public.det_int(rest.restaurante_id, 51, 101)             -- qualidade
              + 0.20 * (100 - public.det_int(rest.restaurante_id, 53, 101))     -- (menos cancel)
              ) * 0.7
           ))::int as n_orders,
         case rest.tier_base when 'managed_brand' then 40 when 'managed_midmarket' then 20 else 0 end as tier_bonus
  from tenant."Restaurante" rest
) r
cross join lateral generate_series(1, r.n_orders) g
cross join lateral (select (20 + r.tier_bonus + public.det_int(r.restaurante_id || ':' || g, 24, 80))::numeric(12,2) as v) vb
cross join lateral (
  select
    case when public.det_int(r.restaurante_id || ':' || g, 22, 100) < round(r.cancel * 0.4)
           then 'fallido'::public.status_pago
         when public.det_int(r.restaurante_id || ':' || g, 22, 100) < round(r.cancel * 0.4) + 4
           then 'pendiente'::public.status_pago
         else 'ok'::public.status_pago end as status,
    case when public.det_int(r.restaurante_id || ':' || g, 22, 100) < round(r.cancel * 0.4)
           then (case when public.det_int(r.restaurante_id || ':' || g, 25, 100) < 65
                      then 'restaurante' else 'usuario' end)::public.cancelado_por
         else null end as canc
) st;

-- ── tenant.Conexion_Semanal: 13 semanas/restaurante. conexão real = conectadas/prometidas.
--    horas_conectadas = prometidas × propensão-conexão × ruído-semanal, capado em prometidas. ──
insert into tenant."Conexion_Semanal"(restaurante_id, semana, horas_conectadas, horas_prometidas)
select r.restaurante_id,
       (date_trunc('week', date '2026-06-17')::date - (w * 7)),
       least(r.hp,
             round(r.hp
                   * (public.det_int(r.restaurante_id, 52, 101)::numeric / 100)            -- propensão conexão
                   * ((70 + public.det_int(r.restaurante_id || ':' || w, 61, 31))::numeric / 100), -- ruído 0.70..1.00
                   2)),
       r.hp
from (select restaurante_id, horas_prometidas_semana as hp from tenant."Restaurante") r
cross join generate_series(0, 12) w;

-- ── tenant.Conversa_Episodio: tickets for ~35% of restaurantes (7 intents v2). capa_metricas RESULT→NULL. ──
insert into tenant."Conversa_Episodio"(episodio_id, conversa_id, tenant_id, restaurante_id, intent, capa_transcripcion)
select r.restaurante_id || ':C' || c,
       r.restaurante_id || ':conv' || c,
       r.tenant_id,
       r.restaurante_id,
       (array['cobranca','entrega','calidad','promo','menu','revision_orden','cancelamento'])[1 + public.det_int(r.restaurante_id || ':' || c, 41, 7)],
       jsonb_build_object('raw', 'redacted transcript ' || c)
from tenant."Restaurante" r
cross join lateral generate_series(1, 1 + public.det_int(r.restaurante_id, 42, 5)) c
where public.det_int(r.restaurante_id, 43, 100) < 35;
