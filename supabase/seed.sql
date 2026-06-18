-- ============================================================================
-- SEED — BRUTOS ONLY (04 §6, §14). The seed populates ONLY raw business inputs +
-- catalog/config. Every RESULT (percentil, gap, baselines, n_cuentas, delta_status,
-- valor_hoy, ratio 1:10, ...) stays NULL/empty until its producer runs. The §14
-- anti-fake gate (pnpm test:antifake) fails the build if this rule is broken.
-- Fase-1 manual seed (R001 + ~99 pool), generated deterministically in SQL — NOT the
-- multi-instance generator (§12, Fase 2). Same input ⇒ same seed (reproducible).
-- ============================================================================

-- public.det_int (deterministic generation helper) is created in migration 20260617000006.

-- ── Catalog: knobs BY NAME (CLAUDE.md §3.8). Values ratified by Leo 2026-06-17. ──
insert into catalog."Config_Perillas"(key, valor, provenance, owner) values
  ('k_anon_threshold',         '5',  '[V]', 'leo'),   -- ratified
  ('n_min_threshold',          '20', '[V]', 'leo'),   -- 04 §3.4
  ('tenure_border_1_months',   '3',  '[V]', 'leo'),   -- 0-3m | 3-6m
  ('tenure_border_2_months',   '6',  '[V]', 'leo'),   -- 3-6m | 6-12m
  ('tenure_border_3_months',   '12', '[V]', 'leo'),   -- 6-12m | 12m+
  ('TTL_baseline_days',        '7',  '[C]', 'leo'),
  ('D_dias_verde',             '14', '[C]', 'leo'),
  ('cohort_rule_version_vigente', 'v1', '[V]', 'leo'),
  ('p90_percentil_corte',      '90', '[C]', 'leo'),   -- P90+ band for baseline_descriptivo
  ('at_risk_percentil_max',    '25', '[C]', 'leo');   -- delta below this + dropping ⇒ at_risk (F-2.2)

-- ── 05B Diagnóstico knobs (CIERRE [C] table). Values are [C] placeholders TO DEFINE+DEFEND;
--    every 05B threshold is read BY NAME, never a literal (CLAUDE.md §3.8). ──
insert into catalog."Config_Perillas"(key, valor, provenance, owner) values
  ('umbral_clasificacion',      '0.60', '[C]', 'leo'),  -- min confidence tipo/área before B.2 proceeds
  ('piso_confianza_path',       '0.50', '[C]', 'leo'),  -- min confidence PATH A before acting (B.3)
  ('cap_profundidad_arbol',     '5',    '[C]', 'leo'),  -- max issue-tree levels before degrade (B.3)
  ('tolerancia_doublecheck',    '0.05', '[C]', 'leo'),  -- impact double-check band (B.7, BR-B10)
  ('tolerancia_reconciliacion', '0',    '[C]', 'leo'),  -- pattern↔score divergence before fail-closed (B-block-1)
  ('ventana_silenciosos',       '30',   '[C]', 'leo');  -- caza-silenciosos sweep window in days (B.5, B-block-2)

-- ── Catalog: Cohort_Rule_Version (vigente v1 + prior v0 for anti-mezcla F-4.3 tests). ──
insert into catalog."Cohort_Rule_Version"(version_id, fecha, que_cambio, efecto_en_baseline, provenance) values
  ('v0', date '2026-01-01', 'regla inicial de buckets', 'baseline v0', '[C]'),
  ('v1', date '2026-06-01', 'ajuste de bordes de tenure', 'rebaseline v1', '[V]');

-- ── Catalog: Intent_Catalog (cobrança anchors the fixture). ──
insert into catalog."Intent_Catalog"(intent_id, label, version) values
  ('cobranca', 'Cobrança / pagos', 'v1'),
  ('entrega',  'Entrega',          'v1'),
  ('calidad',  'Calidad',          'v1'),
  ('promo',    'Promociones',      'v1');

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

-- ── tenant.Restaurante: R001 ancla + 99 pool. ~5% managed/95% long_tail; ~10% in POOL-002. ──
-- fecha_alta spread across 0-23 months so all tenure buckets fill. tenure_actual stays NULL
-- (RESULT — computed by F-1.1 relative to the run's reference date).
insert into tenant."Restaurante"(restaurante_id, tenant_id, tier_base, segmento, fecha_alta, atributos_vivos)
values ('R001', 'POOL-001', 'long_tail', 'long_tail', date '2025-09-01',
        jsonb_build_object('fuso', 'America/Sao_Paulo', 'ventana', 'noche'));

insert into tenant."Restaurante"(restaurante_id, tenant_id, tier_base, segmento, fecha_alta, atributos_vivos)
select rid,
       case when public.det_int(rid, 7, 100) < 10 then 'POOL-002' else 'POOL-001' end,
       tb, sg, date '2026-06-17' - (public.det_int(rid, 11, 24) || ' months')::interval,
       jsonb_build_object('fuso', 'America/Sao_Paulo', 'ventana', 'noche')
from (
  select 'R' || lpad(g::text, 3, '0') as rid,
         m.tier_base as tb, m.segmento as sg
  from generate_series(2, 100) g
  cross join lateral (
    select case
             when public.det_int('R' || lpad(g::text, 3, '0'), 3, 100) < 3 then 'managed_brand'::public.tier_base
             when public.det_int('R' || lpad(g::text, 3, '0'), 3, 100) < 5 then 'managed_midmarket'::public.tier_base
             else 'long_tail'::public.tier_base
           end as tier_base,
           case
             when public.det_int('R' || lpad(g::text, 3, '0'), 3, 100) < 5 then 'managed'::public.segmento
             else 'long_tail'::public.segmento
           end as segmento
  ) m
) src;

-- ── tenant.Orden: 50-300 orders/restaurante; 2-8% fallido (per-restaurante), some pendiente. ──
-- valor_neto is GENERATED (not seeded). The "47/R$X" cascade DERIVES from these brutos.
insert into tenant."Orden"(restaurante_id, fecha, valor_bruto, fee, status_pago, zona, tipo_comida, canal, provenance)
select r.restaurante_id,
       date '2026-06-17' - public.det_int(r.restaurante_id || ':' || g, 21, 90),
       vb.v,
       round(vb.v * 0.20, 2),
       case
         when public.det_int(r.restaurante_id || ':' || g, 22, 100) < r.pct_fallido then 'fallido'::public.status_pago
         when public.det_int(r.restaurante_id || ':' || g, 23, 100) < 4 then 'pendiente'::public.status_pago
         else 'ok'::public.status_pago
       end,
       'centro', 'pizza', 'app', '[V]'
from (
  select restaurante_id,
         50 + public.det_int(restaurante_id, 31, 251) as n_orders,        -- 50..300
         2 + public.det_int(restaurante_id, 32, 7)    as pct_fallido       -- 2..8 %
  from tenant."Restaurante"
) r
cross join lateral generate_series(1, r.n_orders) g
cross join lateral (select (20 + public.det_int(r.restaurante_id || ':' || g, 24, 80))::numeric(12,2) as v) vb;

-- ── tenant.Conversa_Episodio: raw tickets for ~35% of restaurantes (panels F-3.3/F-3.4/F-5.4). ──
-- intent is bruto; estado conservative 'abierta'; capa_metricas RESULT → NULL.
insert into tenant."Conversa_Episodio"(episodio_id, conversa_id, tenant_id, restaurante_id, intent, capa_transcripcion)
select r.restaurante_id || ':C' || c,
       r.restaurante_id || ':conv' || c,
       r.tenant_id,
       r.restaurante_id,
       (array['cobranca','entrega','calidad','promo'])[1 + public.det_int(r.restaurante_id || ':' || c, 41, 4)],
       jsonb_build_object('raw', 'redacted transcript ' || c)
from tenant."Restaurante" r
cross join lateral generate_series(1, 1 + public.det_int(r.restaurante_id, 42, 5)) c
where public.det_int(r.restaurante_id, 43, 100) < 35;
