-- 02:NBA-CAT — closed NBA catalog (A1-A8 + no-act): the action set the Autonomy Cockpit's node 1A
-- instances from (workflow §1A: the AI INSTANCES a code, NEVER invents one). Reference data — the
-- ROWS are seeded in seed.sql (like Intent_Catalog), NOT a §14 result (no computed numbers here).
-- Money gate (BR-2 / §3.3): financial_class='direct' (A3,A7) ⇒ the money step never auto-releases.
-- Thresholds live BY NAME in Config_Knobs (§3.8) — this table only NAMES the knob, never a literal.

create table catalog."NBA_Catalogo" (
  code                text primary key,                                  -- A1..A8 (A8 = the no-act contrafactual)
  label               text not null,
  funnel_stage        text not null
    check (funnel_stage in ('availability','attractiveness','demand','fulfillment','integrity','fallback')),
  financial_class     public.financial_class not null,                   -- 'direct' (A3,A7) = moves balance ⇒ AI only proposes (BR-2/§3.3)
  root_cause_signal   text,                                              -- the deterministic signal that keys this action (NULL for A8)
  threshold_knob      text,                                              -- Config_Knobs name for its human-approved range (NULL for A8; §3.8 by name)
  default_nba_request public.autonomy_level not null default 'LOW'       -- the pedido_NBA arm seed; never HIGH (§3.10 fail-closed — autonomy is earned via Evals)
    check (default_nba_request <> 'HIGH'),
  action_hint         text not null                                      -- what the action fires (consumed by the AGENTE 02:1A + the cockpit)
);

-- Wire the deferred FK (mig 15 left action_type as "catalog not built yet"): an instanced proposal's
-- action_type MUST be a catalog code. NBA_Proposal is seeded empty (§14), so this add is safe.
alter table gov."NBA_Proposal"
  add constraint nba_proposal_action_type_fk
  foreign key (action_type) references catalog."NBA_Catalogo"(code);
