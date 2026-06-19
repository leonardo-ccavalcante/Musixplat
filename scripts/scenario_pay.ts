import { query } from "../server/db/pool.js";

// POOL-PAY reverse-cascade fixture (the 05B "uau"): 47 restaurants with a failed payment, of which 35
// never opened a ticket (the SILENT ones the hunt surfaces) and 12 complained. INPUTS only — the
// numbers (47/35/€) are PRODUCED by fn_hunt_silent + fn_impact_revenue_lost when the orchestrator runs,
// never seeded into result columns (§14). Shared by run-05b (stage → diagnose, for e2e) and
// prototype:reset (stage only ⇒ the operator drives the spine from the UI, no terminal).
export const POOL_PAY = "POOL-PAY";
export const PAY_USER = "U-PAY-001";
export const PAY_N = 47; // restaurants with a failed payment in the window
export const PAY_SILENT = 35; // of those, never opened a ticket
export const PAY_COMPLAINANTS = PAY_N - PAY_SILENT; // 12 opened a billing ticket (intent billing ⇒ finance)

/** Idempotent: OWNS POOL-PAY — clear then rebuild its scenario (never touches other pools). */
export async function stagePayScenario(): Promise<void> {
  // gov.Artifact_Decision is APPEND-ONLY (DELETE blocked by trigger) and gov.Generated_Artifact cascades
  // into it — a plain DELETE of Diagnosed_Problem would cascade into the append-only table and fail, which
  // would break re-staging after the operator decides an artifact (repeatability is a prototype must).
  // TRUNCATE bypasses the row trigger (it is not a DELETE); only POOL-PAY produces these, so it is safe.
  // Run FIRST so the subsequent deletes' cascade finds nothing append-only.
  await query(`truncate gov."Generated_Artifact" cascade`);
  await query(`delete from tenant."Affected" where tenant_id=$1`, [POOL_PAY]);
  await query(`delete from tenant."Diagnosed_Problem" where tenant_id=$1`, [POOL_PAY]);
  await query(`delete from tenant."Critical_Process" where tenant_id=$1`, [POOL_PAY]);
  await query(`delete from tenant."Knowledge_Case" where tenant_id=$1`, [POOL_PAY]);
  await query(`delete from tenant."Conversation_Episode" where tenant_id=$1`, [POOL_PAY]);
  await query(
    `delete from tenant."Order" o using tenant."Restaurant" r
      where o.restaurant_id=r.restaurant_id and r.tenant_id=$1`,
    [POOL_PAY],
  );
  await query(`delete from tenant."Restaurant" where tenant_id=$1`, [POOL_PAY]);
  await query(`delete from gov."User" where tenant_id=$1`, [POOL_PAY]);

  // dev-login operator (tenant read from THIS row server-side, never the client — §3.4 anti-spoofing) +
  // an independent AI proposer so the artifact human gate has 4-eyes (confirmer != proposer, Gate 4).
  await query(
    `insert into gov."User"(user_id, tenant_id, org_level, role) values
       ($1, $2, 'team', 'agent_manager_senior'),
       ($3, $2, 'team', 'ai_agent')`,
    [PAY_USER, POOL_PAY, PAY_USER + "-AI"],
  );

  // 47 restaurants, one FAILED payment each. zone concentration 30 Centro / 17 Norte (a real pattern).
  await query(
    `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
     select 'R-PAY-'||lpad(g::text,3,'0'), $1, 'long_tail','long_tail', date '2026-01-01',
            case when g <= 30 then 'Centro' else 'Norte' end
       from generate_series(1,$2) g`,
    [POOL_PAY, PAY_N],
  );
  await query(
    `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
     select 'R-PAY-'||lpad(g::text,3,'0'), current_date, 100, 20, 'failed',
            case when g <= 30 then 'Centro' else 'Norte' end
       from generate_series(1,$1) g`,
    [PAY_N],
  );
  // 12 complainants opened a billing ticket; the other 35 are SILENT (the ⭐ population we surface).
  await query(
    `insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
     select 'R-PAY-'||lpad(g::text,3,'0')||':C1','R-PAY-'||lpad(g::text,3,'0')||':conv1',$1,
            'R-PAY-'||lpad(g::text,3,'0'),'billing'
       from generate_series(1,$2) g`,
    [POOL_PAY, PAY_COMPLAINANTS],
  );
  // one prior resolved case so the dossier's similar-cases field grounds (anti-hallucination, BR-B3).
  await query(
    `insert into tenant."Knowledge_Case"(tenant_id, area_type, pattern, outcome, resolution, reviewed)
     values ($1,'finance','payment_not_executed','resolved','gateway retry + manual reissue', true)`,
    [POOL_PAY],
  );
  // the payments process the proactive monitor watches (impact-high × fails-silently × measurable, BR-B12).
  await query(
    `insert into tenant."Critical_Process"(tenant_id, name, impact_score, fails_silently, truth_source_ref, origin, schedule)
     values ($1,'payments',0.95,true,'tenant.Order','policy','daily')`,
    [POOL_PAY],
  );
}
