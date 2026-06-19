import { query } from "../db/pool.js";
import type { TicketRowInput, UploadConversationsInput } from "../../shared/contracts_intake.js";

// Conversation_Episode.intent is a FK to catalog."Intent_Catalog". Coalesce uploaded values to a valid code
// (else NULL) so an arbitrary label never breaks the insert — the orchestrator classifies from text anyway.
const VALID_INTENTS = new Set(["billing", "cancellation", "delivery", "menu", "order_review", "promo", "quality"]);
const safeIntent = (i?: string): string | null => (i && VALID_INTENTS.has(i) ? i : null);

// Situation Room stagers — turn operator-uploaded rows into REAL pool data (Restaurant/Order/Episode), so
// the orchestrator's producers compute affected/silent/€ FROM the upload (§14, never seeded). Idempotent:
// clear-then-stage REPLACES the pool's diagnosis state, so a re-upload never accumulates. gov.User is left
// intact (the operator + AI proposer for 4-eyes survive). Mirrors scripts/scenario_pay.ts staging.

/** Clear a pool's diagnosis state. Generated_Artifact is APPEND-ONLY downstream (Artifact_Decision blocks
 *  DELETE cascade), so TRUNCATE it first (bypasses the row trigger) — prototype-safe (only the prototype
 *  writes artifacts). Never touches gov."User". */
export async function clearPoolDiagnosis(tenantId: string): Promise<void> {
  await query(`truncate gov."Generated_Artifact" cascade`);
  await query(`delete from tenant."Affected" where tenant_id=$1`, [tenantId]);
  await query(`delete from tenant."Diagnosed_Problem" where tenant_id=$1`, [tenantId]);
  await query(`delete from tenant."Critical_Process" where tenant_id=$1`, [tenantId]);
  await query(`delete from tenant."Knowledge_Case" where tenant_id=$1`, [tenantId]);
  await query(`delete from tenant."Conversation_Episode" where tenant_id=$1`, [tenantId]);
  await query(
    `delete from tenant."Order" o using tenant."Restaurant" r
      where o.restaurant_id=r.restaurant_id and r.tenant_id=$1`,
    [tenantId],
  );
  await query(`delete from tenant."Restaurant" where tenant_id=$1`, [tenantId]);
}

// finance grounding precedent + the watched process — INPUTS (so a billing dossier can ground + complete);
// not results. Mirrors scenario_pay.
async function stageGrounding(tenantId: string): Promise<void> {
  await query(
    `insert into tenant."Knowledge_Case"(tenant_id, area_type, pattern, outcome, resolution, reviewed)
     values ($1,'finance','payment_not_executed','resolved','gateway retry + manual reissue', true)`,
    [tenantId],
  );
  await query(
    `insert into tenant."Critical_Process"(tenant_id, name, impact_score, fails_silently, truth_source_ref, origin, schedule)
     values ($1,'payments',0.95,true,'tenant.Order','policy','daily')`,
    [tenantId],
  );
}

export interface StageTicketsOut {
  staged: number;
  reportOn: string | null; // the restaurant to report the problem on (a complainant, else first failed)
  conversationId: string | null; // set when reporting on a complainant (reactive)
  criticality: string | null;
}

/** Mode 1 — structured situation rows. failed payment = part of the cascade; opened_ticket=true = a
 *  complainant (reactive, with an episode carrying the free-text); false = SILENT (the hunt surfaces it). */
export async function stageTickets(tenantId: string, rows: TicketRowInput[]): Promise<StageTicketsOut> {
  await clearPoolDiagnosis(tenantId);
  for (const r of rows) {
    await query(
      `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
       values ($1,$2,'long_tail','long_tail', date '2026-01-01', $3)
       on conflict (restaurant_id) do update set tenant_id=excluded.tenant_id, zone=excluded.zone`,
      [r.restaurant_id, tenantId, r.zone],
    );
    await query(
      `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
       values ($1, current_date, 100, 20, $2, $3)`,
      [r.restaurant_id, r.payment_status, r.zone],
    );
  }
  // complainants -> a Conversation_Episode whose turnos carry the free-text "what's happening".
  let out: StageTicketsOut = { staged: rows.length, reportOn: null, conversationId: null, criticality: null };
  for (const r of rows) {
    if (!r.opened_ticket) continue;
    const cid = `${r.restaurant_id}:up1`;
    const turnos = r.message ? [{ role: "restaurant", text: r.message }] : [];
    await query(
      `insert into tenant."Conversation_Episode"
         (episode_id, conversation_id, tenant_id, restaurant_id, intent, turnos, conversation_status)
       values ($1,$2,$3,$4,$5,$6::jsonb,'open') on conflict (episode_id) do nothing`,
      [`${r.restaurant_id}:UP`, cid, tenantId, r.restaurant_id, safeIntent(r.intent) ?? "billing", JSON.stringify(turnos)],
    );
    if (!out.reportOn) out = { ...out, reportOn: r.restaurant_id, conversationId: cid, criticality: r.criticality ?? "critical" };
  }
  // no complainant -> proactive monitor path on the first failed restaurant (still a real signal).
  if (!out.reportOn) {
    const failed = rows.find((r) => r.payment_status === "failed") ?? rows[0]!;
    out = { ...out, reportOn: failed.restaurant_id, conversationId: null, criticality: failed.criticality ?? null };
  }
  await stageGrounding(tenantId);
  return out;
}

export interface StageConversationsOut {
  staged: number;
  reportOn: string | null;
  conversationId: string | null;
}

/** Mode 2 — n8n chat histories. Each session -> a Restaurant (S-<session>) + a Conversation_Episode whose
 *  turnos ARE the real turns. Proves real chat-history ingestion into the production DB shape. */
export async function stageConversations(
  tenantId: string,
  conversations: UploadConversationsInput["conversations"],
): Promise<StageConversationsOut> {
  await clearPoolDiagnosis(tenantId);
  let first: { rid: string; cid: string } | null = null;
  for (const c of conversations) {
    const rid = `S-${c.session_id}`;
    const cid = `${rid}:conv`;
    await query(
      `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
       values ($1,$2,'long_tail','long_tail', date '2026-01-01','Centro')
       on conflict (restaurant_id) do update set tenant_id=excluded.tenant_id`,
      [rid, tenantId],
    );
    await query(
      `insert into tenant."Conversation_Episode"
         (episode_id, conversation_id, tenant_id, restaurant_id, intent, turnos, conversation_status)
       values ($1,$2,$3,$4,$5,$6::jsonb,'open') on conflict (episode_id) do nothing`,
      [`${rid}:EP`, cid, tenantId, rid, safeIntent(c.intent), JSON.stringify(c.turns)],
    );
    if (!first) first = { rid, cid };
  }
  await stageGrounding(tenantId);
  return { staged: conversations.length, reportOn: first?.rid ?? null, conversationId: first?.cid ?? null };
}
