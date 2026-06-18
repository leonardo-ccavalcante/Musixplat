-- 05A FOUNDATION — gov-zone governance/autonomy DDL (04 §3.2 / §3.3 / §3.9 / §14).
-- Foundation owns ALL DDL (CLAUDE.md "Build-doc per feature" + §3.9): the 6 governance
-- entities (Eval_Cell, NBA_Propuesta, Politica_Tier, Credencial, Liberacion_Lote,
-- Decision_Trace) + the Conversa_Episodio extension that 05A/05B/P02 consume. DDL ONLY —
-- every RESULT column is NULL pre-run and the seed inserts ZERO rows in these tables;
-- their rows are produced at runtime by their named producers (Eval golden-set, the min()
-- motor, the operator cockpit P02), §14 anti-fake. RLS deferred per 04 §13 (active
-- enforcement = server-side tRPC tenant guard), matching the existing migrations.
--
-- Verbatim sources (quoted in the build report): NBA_Propuesta 04 L221 · Eval_Cell 04 L212 ·
-- Politica_Tier 04 L246 · Credencial 04 L255 · Liberacion_Lote 04 L262 · Decision_Trace
-- 04 L269-270 · Conversa_Episodio 04 L107/L112. NBA_Propuesta is NOT on the §3.9 phantom
-- denylist (L483-494) — it is a real persisted entity (§3.2 inventory L63).
--
-- Closed label sets as ordered/unordered ENUMs. public.nivel_autonomia (ordered) is reused
-- for every autonomy ceiling so least()/min() fail-closed to BAJA (04 §3 note).
create type public.clase_financiera   as enum ('directa', 'indirecta', 'ninguna');
create type public.clase_palanca      as enum ('operacional', 'estrategica', 'area');
create type public.destino_ruteo      as enum ('NBA', 'Strategy', 'Soporte', 'descartar');
create type public.estado_eval        as enum ('rojo', 'verde');
create type public.accion_liberacion  as enum ('LIBERAR', 'PAUSAR');
create type public.accion_trace       as enum ('liberar', 'pausar', 'override');
create type public.eje_escalacion     as enum ('quien', 'efecto', 'confianza', 'estado', 'anomalia', 'reincidencia', 'auto_flag', 'none');
create type public.origen_trace       as enum ('desktop', 'movil');
create type public.estado_credencial  as enum ('activa', 'suspendida', 'revocada');
create type public.rol_credencial     as enum ('agent_manager_junior', 'agent_manager_senior', 'gov_admin', 'policy_owner', 'finanzas');

-- ── NBA_Propuesta (04 L221): closed catalog A1-A8 + "no-act" instanced per cohort/subgroup.
--    Produced by P02 (the AI instances, never invents). Foundation creates it EMPTY so 05A /
--    min_calculo / Conversa_Episodio can FK it; seed inserts NO rows (§14). impacto_realizado
--    is a RESULT (NULL pre-run · §14 L684); before_after_esperado / impacto_estimado are
--    projection-NOT-measured ([C], labeled in UI, never a min() arm · §14 L688). ─────────────
create table gov."NBA_Propuesta" (
  nba_id                uuid primary key default gen_random_uuid(),
  tipo_accion           text,                                              -- [deferred FK → NBA_Catalogo.codigo {A1..A8|no-act}] catalog not built yet
  cohort_id             text not null references cohort."Cohort"(cohort_id),
  subgrupo_id           text references cohort."Subgrupo"(subgrupo_id),
  intent                text references catalog."Intent_Catalog"(intent_id),
  causa_raiz            text,                                              -- bruto/proposal text (the AI proposes text, never a number · §3.6)
  pedido_NBA            public.nivel_autonomia,                            -- 1 arm of the min() (an instanced row supplies it; NULL until P02 instances)
  before_after_esperado jsonb default null,                               -- projection-NOT-measured [C] (§14 L688)
  clase_financiera      public.clase_financiera,                          -- 'directa' moves balance ⇒ AI only proposes (04 §7 hard-no)
  clase_palanca         public.clase_palanca,                             -- routing
  destino_ruteo         public.destino_ruteo,                             -- {NBA|Strategy|Soporte|descartar}
  risk_class            public.nivel_autonomia default null,              -- RESULT (derived worst-case, born in P02 · §14)
  impacto_estimado      jsonb default null,                               -- projection-NOT-measured [C] (§14 L688)
  impacto_realizado     jsonb default null,                               -- RESULT §14 L684 (only from real signal, never copied from estimado · BR-HON-1)
  cohort_rule_version   text not null references catalog."Cohort_Rule_Version"(version_id),  -- stamped per row (anti-mezcla, 04 §6/§7)
  provenance_por_campo  jsonb not null default '{}'::jsonb,               -- per-field provenance (04 §7)
  created_at            timestamptz not null default now()
);
create index nba_propuesta_cohort_idx on gov."NBA_Propuesta"(cohort_id);
create index nba_propuesta_intent_idx on gov."NBA_Propuesta"(intent);

-- ── Eval_Cell (04 L212): golden-set per (cohort × intent × version). estado rojo→verde
--    produces liberado_evals (1 arm of the min()). PK surrogate eval_cell_id + UNIQUE
--    (cohort_id, intent, version) — references point at eval_cell_id (04 L217). The golden-set
--    CASES are bruto (seedable elsewhere) but the VERDICT columns (estado/kappa/n/liberado_evals/
--    redteam_resultado) are RESULT: run the golden-set, never type "verde"/"BAJA" (§14 L681).
--    Foundation seeds NO rows here. estado conservative-initial = 'rojo' (§14 L690) when a row
--    is later inserted by its producer. ───────────────────────────────────────────────────────
create table gov."Eval_Cell" (
  eval_cell_id                    uuid primary key default gen_random_uuid(),
  cohort_id                       text not null references cohort."Cohort"(cohort_id),
  intent                          text not null references catalog."Intent_Catalog"(intent_id),  -- intent never a bare FK-target (04 L217)
  version                         text not null,                          -- golden-set version
  liberado_evals                  public.nivel_autonomia default null,    -- RESULT §14 L681 (1 arm of min(); public.nivel_autonomia per task)
  estado                          public.estado_eval     default null,    -- RESULT §14 L681 (conservative 'rojo' when producer writes; never seeded)
  n_cohort_x_intent               integer                default null,    -- RESULT §14 L676 (count)
  kappa                           numeric                default null,    -- RESULT §14 L681 (inter-rater agreement)
  redteam_independencia_flag      boolean                default null,    -- RESULT (judge↔human independence, Red_Team_Set absorbed · 04 L488)
  redteam_resultado_juez_vs_humano text                  default null,    -- RESULT §14 L681
  provenance_por_campo            jsonb not null default '{}'::jsonb,     -- per-field provenance (04 §7)
  unique (cohort_id, intent, version)                                     -- 04 L212 / L217
);
create index eval_cell_cohort_intent_idx on gov."Eval_Cell"(cohort_id, intent);

-- ── Credencial (04 L255): human authority PER-TENANT (eligibility gate BEFORE the min(), NOT a
--    4th arm). RBAC materialized as a jsonb matrix (rol × accion_clase → nivel_max_liberable,
--    requiere_2_ojos, origen_permitido). nivel_max_liberable never exceeds teto_tier (enforced
--    at validation time, 04 L585 — not a row CHECK because teto_tier lives on Politica_Tier).
--    audit_divergencia is a RESULT (NULL pre-run · §14 L686). Foundation seeds NO rows. ────────
create table gov."Credencial" (
  credencial_id        text primary key,
  usuario_id           text not null references gov."Usuario"(usuario_id),
  tenant_id            text not null,                                      -- per-tenant scope (no global bypass · 04 L585); RLS frontier server-side
  rol                  public.rol_credencial not null,
  estado               public.estado_credencial not null default 'activa',
  credential_policy_pin text,                                              -- pinned credential-policy version
  rbac_matriz          jsonb not null default '{}'::jsonb,                 -- RBAC matrix (rol×accion_clase → nivel_max_liberable/requiere_2_ojos/origen_permitido)
  audit_divergencia    jsonb default null,                                 -- RESULT §14 L686 (cross-check vs policy: policy wins)
  emitida_por_id       text references gov."Usuario"(usuario_id),
  expira_at            timestamptz
);
create index credencial_usuario_idx on gov."Credencial"(usuario_id);
create index credencial_tenant_idx  on gov."Credencial"(tenant_id);

-- ── Politica_Tier (04 L246): produces teto_tier (3rd arm of min()). The versioned .md is the
--    source-of-truth. teto_tier/permitido_hoy/regra_cross_tenant/como_se_mide are bruto (the
--    .md); resultado_medido is a RESULT (NULL pre-run · §14 L669/L686). nacida_de_trace is
--    NULLABLE (seed circularity fix 04 L251): a root policy has nacida_de_trace=NULL; only 2nd-
--    generation policies fill it. The FK → Decision_Trace is added AFTER Decision_Trace exists
--    (see ALTER below) to break the Politica_Tier↔Decision_Trace cycle. ─────────────────────────
create table gov."Politica_Tier" (
  policy_id            text primary key,
  tier_id              text,                                               -- maps to Restaurante.tier_base (no FK: tier_base is an enum, not a table)
  policy_version       text not null,                                      -- semver
  teto_tier            public.nivel_autonomia not null,                    -- bruto (the .md) — 3rd arm of min()
  permitido_hoy        jsonb not null default '{}'::jsonb,                 -- bruto (the .md)
  resultado_medido     text default null,                                  -- RESULT §14 L669/L686 (NOT in the .md)
  como_se_mide         text,                                               -- bruto (the .md)
  regra_cross_tenant   text,                                               -- bruto (the .md · cross-tenant hard-no)
  nacida_de_trace      text default null,                                  -- FK → Decision_Trace.trace_id (NULLABLE, added below · 04 L251)
  firma_humana         text references gov."Usuario"(usuario_id),
  provenance_por_campo jsonb not null default '{}'::jsonb,                 -- per-field provenance (04 §7)
  unique (policy_version)                                                  -- Liberacion_Lote/Decision_Trace FK policy_version (04 L262/L269)
);
create index politica_tier_version_idx on gov."Politica_Tier"(policy_version);

-- ── Decision_Trace (04 L269-270): APPEND-ONLY audit of every liberar/pausar/autonomy eval.
--    "Sin trace no hay acción." 4-eyes CHECK: confirmador_id IS NULL OR confirmador_id <>
--    proponente_id (null = auto-confirmed [C]). independencia_garantida is GENERATED =
--    (confirmador_id IS NOT NULL) (04 L270). XOR origin (liberacion_id vs conversa_id): a trace
--    comes from a governance batch OR a conversation, never both. gate_result / tiempo_a_firma_seg
--    / rubber_stamp_flag are RESULT (NULL pre-run · §14 L686). policy_version NOT NULL (04 L269).
--    Created BEFORE Liberacion_Lote; the liberacion_id FK is added AFTER (cycle break). ──────────
create table gov."Decision_Trace" (
  trace_id                 text primary key,                              -- decision_id canónico
  liberacion_id            text,                                          -- FK → Liberacion_Lote.liberacion_id (added below · cycle break)
  conversa_id              text,  -- [deferred FK → Conversa_Episodio.episodio_id; NO global UNIQUE: conversa_id is tenant-scoped (PK=episodio_id=tenant:conversa), a UNIQUE(conversa_id) collides cross-tenant (§3.4). Confirm w/ Leo if a real FK→episodio_id is wanted] null si origen gobernanza
  calculo_id               uuid references gov."min_calculo"(calculo_id), -- FK → min_calculo log (gate-3, the par · 04 L269 / §3.4)
  accion                   public.accion_trace not null,
  proponente_id            text not null references gov."Usuario"(usuario_id),
  confirmador_id           text references gov."Usuario"(usuario_id),     -- != proponente; null = auto-confirmada [C]
  nivel_efectivo_aplicado  public.nivel_autonomia,                        -- the min() level applied (copy)
  eje_escalacion           public.eje_escalacion default 'none',
  credencial_id            text references gov."Credencial"(credencial_id),  -- gate-1
  policy_version           text not null references gov."Politica_Tier"(policy_version),  -- gate-2 (NOT NULL · 04 L269)
  origen                   public.origen_trace,
  gate_result              jsonb default null,                            -- RESULT §14 L686 (jsonb g1/g2/g3, computed at runtime)
  tiempo_a_firma_seg       integer default null,                          -- RESULT §14 L686
  -- [ASSUMPTION: rubber_stamp_flag is a RESULT column DEFAULT NULL, NOT a STORED GENERATED column.
  --  04 L270 says "(generada) = (tiempo_a_firma_seg < umbral AND origen='movil')" but the umbral
  --  is the Config_Perillas knob 'tiempo_rubber_stamp_seg' read BY NAME (CLAUDE.md §3.8); a STORED
  --  generated expression cannot read a knob (must be immutable, no subquery). The §14 master rule
  --  (RESULT = NULL pre-run · L686 lists it) + threshold-by-name win: the motor (02:BR-LOG-2)
  --  computes it at runtime reading the knob by name. Hardcoding a literal would violate §3.8.]
  rubber_stamp_flag        boolean default null,                          -- RESULT §14 L686 (computed by motor, knob by name)
  independencia_garantida  boolean generated always as (confirmador_id is not null) stored,  -- 04 L270 (GENERATED)
  "timestamp"              timestamptz not null default now(),
  constraint decision_trace_4ojos check (confirmador_id is null or confirmador_id <> proponente_id),  -- 4-eyes (04 L270)
  constraint decision_trace_origen_xor check ((liberacion_id is not null) <> (conversa_id is not null))  -- XOR origin
);
create index decision_trace_liberacion_idx on gov."Decision_Trace"(liberacion_id);
create index decision_trace_conversa_idx   on gov."Decision_Trace"(conversa_id);
create index decision_trace_credencial_idx on gov."Decision_Trace"(credencial_id);

-- Append-only (04 §3.3): the before/after governance audit never mutates. Reuses the shared
-- public.tg_append_only() (raise exception ⇒ SQLSTATE P0001).
create trigger decision_trace_append_only
  before update or delete on gov."Decision_Trace"
  for each row execute function public.tg_append_only();

-- ── Liberacion_Lote (04 L262): human liberar/pausar override IN BATCH per cohort/subgroup.
--    nivel_resultante <= nivel_efectivo (override ONLY DOWN, AUT-11) — enforced at validation
--    against min_calculo.nivel_efectivo (cannot be a row CHECK: nivel_efectivo lives on
--    min_calculo). proponente_id <> operador_id (4-eyes on the batch · task constraint). Links
--    1-1 to Decision_Trace. Produced by the operator cockpit (P02); seed inserts NO rows. ───────
create table gov."Liberacion_Lote" (
  liberacion_id            text primary key,
  cohort_id                text not null references cohort."Cohort"(cohort_id),
  subgrupo_id              text references cohort."Subgrupo"(subgrupo_id),
  accion                   public.accion_liberacion not null,
  nivel_resultante         public.nivel_autonomia,                        -- <= nivel_efectivo (validated vs min_calculo; override only down · AUT-11)
  proponente_id            text not null references gov."Usuario"(usuario_id),
  operador_id              text not null references gov."Usuario"(usuario_id),  -- firma
  policy_version_validada  text references gov."Politica_Tier"(policy_version),
  etapas_en_vuelo_resueltas boolean default null,                         -- RESULT §14 (resolved by the in-flight-stage check at runtime)
  decision_trace_id        text references gov."Decision_Trace"(trace_id),  -- 1-1 (04 L262/L265)
  created_at               timestamptz not null default now(),
  constraint liberacion_lote_4ojos check (proponente_id <> operador_id)   -- 4-eyes: proposer != signer (task constraint)
);
create index liberacion_lote_cohort_idx on gov."Liberacion_Lote"(cohort_id);
create unique index liberacion_lote_trace_uidx on gov."Liberacion_Lote"(decision_trace_id) where decision_trace_id is not null;  -- 1-1

-- ── Circular FKs resolved now that both ends exist (04 §3 create-order note). ───────────────
alter table gov."Decision_Trace"
  add constraint decision_trace_liberacion_fk
  foreign key (liberacion_id) references gov."Liberacion_Lote"(liberacion_id);

alter table gov."Politica_Tier"
  add constraint politica_tier_nacida_de_trace_fk
  foreign key (nacida_de_trace) references gov."Decision_Trace"(trace_id);  -- NULLABLE 2nd-generation (04 L251)

-- ── Promote the min_calculo provenance refs (deferred plain text in 20260617000013) to real
--    FKs now that their targets exist (04 L277). policy_id is text↔text — promoted. ──────────
--    [ASSUMPTION: min_calculo.nba_id and .eval_cell_ref are typed TEXT in migration 013, but
--     NBA_Propuesta.nba_id and Eval_Cell.eval_cell_id are UUID (04 L221/L212 "PK uuid"). A FK
--     requires identical column types and forbids an expression (no `(eval_cell_ref::uuid)`).
--     Editing migration 013 to retype those columns is out of scope for this foundation pass,
--     so these two refs stay deferred plain text (their value still records provenance; the FK
--     promotion lands when 013 is retyped). Conservative: a deferred ref is honest; a wrong-type
--     FK would not compile.]
alter table gov."min_calculo"
  add constraint min_calculo_policy_fk
  foreign key (policy_id) references gov."Politica_Tier"(policy_id);  -- 04 L277 FK → Politica_Tier.policy_id (text↔text)

-- ── ALTER tenant.Conversa_Episodio (04 L107/L112) — top-level FK-able columns 05B/min() cross.
--    cohort_id and señal_inyeccion are RESULT ⇒ NULL pre-run (§14: cohort dimension derived by
--    F-1.1; señal_inyeccion logged by the data-fencing layer at runtime · §14 L451). nba_usada
--    and lock_posesion are operational links filled at runtime, never seeded. ──────────────────
alter table tenant."Conversa_Episodio"
  add column cohort_id       text references cohort."Cohort"(cohort_id),   -- RESULT §14 (cohort dimension derived, NULL pre-run · 04 L112)
  add column nba_usada       uuid references gov."NBA_Propuesta"(nba_id),  -- FK → NBA_Propuesta (promoted now that the table exists · 04 L107/L112)
  add column lock_posesion   text references gov."Usuario"(usuario_id),    -- possession lock (usuario_id|null · 04 L107)
  add column "señal_inyeccion" jsonb default null;                        -- RESULT §14 L451 (injection signal logged vs tenant, NULL pre-run)
