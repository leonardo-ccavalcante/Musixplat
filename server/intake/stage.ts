import { createHmac } from "node:crypto";
import type pg from "pg";
import { TRPCError } from "@trpc/server";
import { env } from "../_core/env.js";
import { query, withTx } from "../db/pool.js";
import { redactPII } from "../pieces/pii.js";
import type { TicketRowInput, UploadConversationsInput } from "../../shared/contracts_intake.js";

const VALID_INTENTS = new Set(["billing", "cancellation", "delivery", "menu", "order_review", "promo", "quality"]);
const safeIntent = (i?: string): string | null => (i && VALID_INTENTS.has(i) ? i : null);

class CrossPoolStageError extends Error {
  constructor(readonly restaurantId: string, readonly ownerTenant: string) {
    super(`restaurant ${restaurantId} belongs to another pool`);
  }
}

function redactText(text: string): { text: string; types: string[] } {
  const out = redactPII(text);
  if (out.residualPII) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "residual PII blocked before storage" });
  }
  return { text: out.texto, types: out.tipos };
}

function assertPiiFreeLabel(text: string, field: string): void {
  const out = redactPII(text);
  if (out.tipos.length > 0 || out.residualPII) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${field} contains PII` });
  }
}

function pseudonymizeSession(tenantId: string, sessionId: string): string {
  return createHmac("sha256", env.JWT_SECRET)
    .update(`${tenantId}\0${sessionId}`)
    .digest("hex")
    .slice(0, 24);
}

async function withTenantStage<T>(tenantId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  try {
    return await withTx(fn);
  } catch (e) {
    if (e instanceof CrossPoolStageError) {
      await query(
        `insert into gov."Security_Log"(tenant_id, kind, detail) values ($1, 'cross_pool', $2)`,
        [tenantId, JSON.stringify({ piece: "05B:intake.stage", restaurantId: e.restaurantId, owner: e.ownerTenant })],
      );
      throw new TRPCError({ code: "FORBIDDEN", message: "cross-pool restaurant upload blocked" });
    }
    throw e;
  }
}

/** Supersede the active prototype surface, but preserve immutable artifacts + decisions for audit. */
export async function clearPoolDiagnosis(client: pg.PoolClient, tenantId: string): Promise<void> {
  await client.query(
    `update gov."Generated_Artifact" set superseded_at = coalesce(superseded_at, now())
      where tenant_id = $1 and superseded_at is null`,
    [tenantId],
  );
  // Generated_Artifact.problem_id uses ON DELETE SET NULL; Artifact_Decision remains append-only.
  await client.query(`delete from tenant."Diagnosed_Problem" where tenant_id=$1`, [tenantId]);
  await client.query(`delete from tenant."Critical_Process" where tenant_id=$1`, [tenantId]);
  await client.query(`delete from tenant."Knowledge_Case" where tenant_id=$1`, [tenantId]);
  await client.query(`delete from tenant."Conversation_Episode" where tenant_id=$1`, [tenantId]);
  await client.query(
    `delete from tenant."Order" o using tenant."Restaurant" r
      where o.restaurant_id=r.restaurant_id and r.tenant_id=$1`,
    [tenantId],
  );
  await client.query(`delete from tenant."Restaurant" where tenant_id=$1`, [tenantId]);
  await client.query(`delete from gov."ROI_Operator" where tenant_id=$1`, [tenantId]);
}

async function putRestaurant(
  client: pg.PoolClient,
  tenantId: string,
  restaurantId: string,
  zone: string,
): Promise<void> {
  // Serialize ownership decisions for this global restaurant PK.
  await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [restaurantId]);
  const owner = (
    await client.query<{ tenant_id: string }>(
      `select tenant_id from tenant."Restaurant" where restaurant_id=$1`,
      [restaurantId],
    )
  ).rows[0];
  if (owner && owner.tenant_id !== tenantId) throw new CrossPoolStageError(restaurantId, owner.tenant_id);
  if (owner) {
    await client.query(`update tenant."Restaurant" set zone=$2 where restaurant_id=$1 and tenant_id=$3`, [
      restaurantId,
      zone,
      tenantId,
    ]);
    return;
  }
  await client.query(
    `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
     values ($1,$2,'long_tail','long_tail', current_date, $3)`,
    [restaurantId, tenantId, zone],
  );
}

async function stageUploadedHow(client: pg.PoolClient, tenantId: string, rows: TicketRowInput[]): Promise<void> {
  const how = rows.find((r) => r.resolution_how)?.resolution_how;
  if (!how) return; // missing HOW is an intentional fail-closed 05C path.
  const redacted = redactText(how);
  await client.query(
    `insert into tenant."Knowledge_Case"
       (tenant_id, area_type, pattern, outcome, resolution, reviewed, provenance_by_field)
     values ($1,'finance','payment_not_executed','resolved',$2,true,$3::jsonb)`,
    [tenantId, redacted.text, JSON.stringify({ resolution: "[I]", pii_redacted: redacted.types })],
  );
}

export interface StageTicketsOut {
  staged: number;
  reportOn: string | null;
  conversationId: string | null;
  criticality: string | null;
}

export async function stageTickets(tenantId: string, rows: TicketRowInput[]): Promise<StageTicketsOut> {
  return withTenantStage(tenantId, async (client) => {
    await clearPoolDiagnosis(client, tenantId);
    for (const r of rows) {
      assertPiiFreeLabel(r.restaurant_id, "restaurant_id");
      assertPiiFreeLabel(r.zone, "zone");
      await putRestaurant(client, tenantId, r.restaurant_id, r.zone);
      await client.query(
        `insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
         values ($1,$2::date,$3,$4,$5,$6)`,
        [r.restaurant_id, r.order_date, r.gross_value, r.fee, r.payment_status, r.zone],
      );
    }

    let out: StageTicketsOut = { staged: rows.length, reportOn: null, conversationId: null, criticality: null };
    for (const r of rows) {
      if (!r.opened_ticket) continue;
      const cid = `${r.restaurant_id}:up1`;
      const redacted = r.message ? redactText(r.message) : { text: "", types: [] };
      const turns = redacted.text ? [{ role: "restaurant", text: redacted.text }] : [];
      await client.query(
        `insert into tenant."Conversation_Episode"
           (episode_id, conversation_id, tenant_id, restaurant_id, intent, turnos,
            transcript_layer, conversation_status)
         values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'open')`,
        [
          `${r.restaurant_id}:UP`, cid, tenantId, r.restaurant_id, safeIntent(r.intent), JSON.stringify(turns),
          JSON.stringify({ pii_redacted: redacted.types.length > 0, pii_types: redacted.types }),
        ],
      );
      if (!out.reportOn) {
        out = { ...out, reportOn: r.restaurant_id, conversationId: cid, criticality: r.criticality ?? "critical" };
      }
    }

    if (!out.reportOn) {
      const failed = rows.find((r) => r.payment_status === "failed") ?? rows[0]!;
      out = { ...out, reportOn: failed.restaurant_id, conversationId: null, criticality: failed.criticality ?? null };
    }
    await stageUploadedHow(client, tenantId, rows);
    return out;
  });
}

export interface StageConversationsOut {
  staged: number;
  reportOn: string | null;
  conversationId: string | null;
}

export async function stageConversations(
  tenantId: string,
  conversations: UploadConversationsInput["conversations"],
): Promise<StageConversationsOut> {
  return withTenantStage(tenantId, async (client) => {
    await clearPoolDiagnosis(client, tenantId);
    let first: { rid: string; cid: string } | null = null;
    for (const c of conversations) {
      const rid = `S-${pseudonymizeSession(tenantId, c.session_id)}`;
      const cid = `${rid}:conv`;
      await putRestaurant(client, tenantId, rid, "Centro");
      const piiTypes = new Set<string>();
      const turns = c.turns.map((turn) => {
        const redacted = redactText(turn.text);
        redacted.types.forEach((type) => piiTypes.add(type));
        return { ...turn, text: redacted.text };
      });
      await client.query(
        `insert into tenant."Conversation_Episode"
           (episode_id, conversation_id, tenant_id, restaurant_id, intent, turnos,
            transcript_layer, conversation_status)
         values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'open')`,
        [
          `${rid}:EP`, cid, tenantId, rid, safeIntent(c.intent), JSON.stringify(turns),
          JSON.stringify({ pii_redacted: piiTypes.size > 0, pii_types: [...piiTypes].sort() }),
        ],
      );
      if (!first) first = { rid, cid };
    }
    return { staged: conversations.length, reportOn: first?.rid ?? null, conversationId: first?.cid ?? null };
  });
}
