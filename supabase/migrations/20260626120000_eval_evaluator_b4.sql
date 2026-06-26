-- EPIC-B4 — the golden-set eval evaluator: INPUT tables + a deterministic Fleiss-κ fn + knobs.
-- §14: this migration creates ONLY input/config (golden cases, judge labels, the set→level map,
-- thresholds, the κ math). It writes NO Eval_Cell verdict — that is PRODUCED at runtime by
-- server/eval/runEval.ts (status/kappa/n/redteam) and raised ONLY by the human eval.promote
-- (promote = human + evidence; downgrade = automatic · 00_vision §). Foundation seeds no verdict.

-- ── Eval_Set: the autonomy level a versioned golden set CERTIFIES (e.g. gs-medium → MEDIUM).
create table gov."Eval_Set" (
  version       text primary key,
  target_level  public.autonomy_level not null,          -- the level promotion may raise to on green
  description   text
);

-- ── Eval_Case: one golden case per (cohort × intent × version). INPUT, human-authored [V].
--    correct_label = the right call (an NBA action_code A1–A8) for this scenario.
create table gov."Eval_Case" (
  eval_case_id  uuid primary key default gen_random_uuid(),
  cohort_id     text not null references cohort."Cohort"(cohort_id),
  intent        text not null references catalog."Intent_Catalog"(intent_id),
  version       text not null references gov."Eval_Set"(version),
  scenario      jsonb not null,                           -- the case input the AI-under-eval reads
  correct_label text not null                             -- the human-authored right call [V]
);
create index eval_case_cohort_intent_ver_idx on gov."Eval_Case"(cohort_id, intent, version);

-- ── Eval_Judge_Label: each judge's label per case (≥3 judges/case) — drives Fleiss κ. INPUT [V].
create table gov."Eval_Judge_Label" (
  eval_case_id  uuid not null references gov."Eval_Case"(eval_case_id) on delete cascade,
  judge_id      text not null,
  label         text not null,
  primary key (eval_case_id, judge_id)
);

-- The eval's OWN sample size (golden cases graded) — DISTINCT from Eval_Cell.n_cohort_x_intent, which
-- is the raw-ticket volume produced by a different producer (F-5.4). RESULT §14: written only by runEval.
alter table gov."Eval_Cell" add column if not exists n_golden_cases integer default null;

-- ── Fleiss' kappa over the judge labels of ONE cell's cases (cohort × intent × version) —
--    DETERMINISTIC SQL (§2/§14: the number is math over the human labels, never an LLM output).
--    Per-cell grain matches pass_rate (runEval grades the same cell's cases), so κ never bleeds
--    across cohorts/intents that share a version. NULL when undefined (perfect expected
--    agreement, or <2 raters) — honest, never an optimistic default.
create or replace function gov.fn_fleiss_kappa(p_cohort_id text, p_intent text, p_version text)
returns numeric language sql stable as $$
  with labels as (
    select jl.eval_case_id, jl.label
      from gov."Eval_Judge_Label" jl
      join gov."Eval_Case" ec on ec.eval_case_id = jl.eval_case_id
     where ec.cohort_id = p_cohort_id and ec.intent = p_intent and ec.version = p_version
  ),
  per_subject_n as (                          -- raters per subject (n)
    select eval_case_id, count(*)::numeric as n from labels group by eval_case_id
  ),
  nij as (                                    -- n_ij: raters per (subject, category)
    select eval_case_id, label, count(*)::numeric as cnt from labels group by eval_case_id, label
  ),
  p_i as (                                    -- per-subject agreement
    select s.eval_case_id,
           (coalesce((select sum(cnt*cnt) from nij where nij.eval_case_id = s.eval_case_id), 0) - s.n)
             / nullif(s.n * (s.n - 1), 0) as p_i
      from per_subject_n s
  ),
  totals as ( select sum(n) as total_assign from per_subject_n ),   -- N*n
  p_j as (                                    -- proportion of all assignments to each category
    select label, sum(cnt) / nullif((select total_assign from totals), 0) as p_j
      from nij group by label
  ),
  agg as (
    select (select avg(p_i) from p_i)            as p_bar,
           (select sum(p_j * p_j) from p_j)      as p_bar_e
  )
  select round((p_bar - p_bar_e) / nullif(1 - p_bar_e, 0), 4) from agg
$$;

-- ── Thresholds by NAME (§3.8) — the status gate reads these; never hard-coded literals.
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('eval_pass_threshold', '0.80', '[C]', 'b4'),   -- min pass_rate (AI label == correct_label)
  ('eval_min_n',          '30',   '[C]', 'b4'),   -- min cases (archive: >=30/root-cause)
  ('eval_kappa_min',      '0.60', '[C]', 'b4')    -- min Fleiss κ (substantial judge agreement)
on conflict (key) do nothing;
