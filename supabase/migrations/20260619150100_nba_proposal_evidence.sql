-- 02:DETAIL-A2 — persist the diagnosis evidence the engine already computes (fn_nba_test) but discarded.
-- RESULT columns (§14): NULL until 02:1A (nba_engine.proposeNba) writes the proposal — NEVER seeded
-- (NBA_Proposal is seeded empty). These feed fn_nba_action_history's hit-rate split (solid vs thin-data).
alter table gov."NBA_Proposal"
  add column diagnosis_verdict text,     -- the chosen lever's verdict: below|above|ok|no_data ([V] from SQL)
  add column n_min_ok          boolean,  -- sample sufficient at diagnosis time ([V] from fn_nba_test)
  add column k_anon_ok          boolean; -- non-suppressed at diagnosis time ([V] from fn_nba_test)

alter table gov."NBA_Proposal"
  add constraint nba_proposal_diagnosis_verdict_ck
  check (diagnosis_verdict is null or diagnosis_verdict in ('below','above','ok','no_data'));
