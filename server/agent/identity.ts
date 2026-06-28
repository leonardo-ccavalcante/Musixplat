import type pg from "pg";
import type { Binding } from "./chat.js";

// Channel identity = the only authorization for a chat session. The tenant is resolved SERVER-SIDE from
// the restaurant_id at bind time (anti-spoofing, 04 §7) — the channel never supplies tenant_id.

type Exec = <T extends pg.QueryResultRow>(sql: string, params: readonly unknown[]) => Promise<T[]>;

export async function getBinding(
  exec: Exec,
  channel: string,
  externalId: string,
): Promise<Binding | null> {
  const r = await exec<Binding>(
    `select channel, external_id, restaurant_id, tenant_id, user_id
       from gov."Channel_Identity" where channel = $1 and external_id = $2`,
    [channel, externalId],
  );
  return r[0] ?? null;
}

/** Resolve a restaurant id to its tenant + a representative user (for the createCaller ctx), entirely
 *  server-side. Fail-closed: unknown restaurant OR a tenant with no user ⇒ null (no binding, no leak). */
export async function resolveRestaurant(
  exec: Exec,
  restaurantId: string,
): Promise<{ tenantId: string; userId: string } | null> {
  const r = await exec<{ tenant_id: string; user_id: string | null }>(
    `select r.tenant_id,
            (select u.user_id from gov."User" u
              where u.tenant_id = r.tenant_id and u.role <> 'ai_agent'
              order by u.user_id limit 1) as user_id
       from tenant."Restaurant" r where r.restaurant_id = $1`,
    [restaurantId],
  );
  const row = r[0];
  if (!row || !row.user_id) return null;
  return { tenantId: row.tenant_id, userId: row.user_id };
}

export async function upsertBinding(exec: Exec, b: Binding): Promise<void> {
  await exec(
    `insert into gov."Channel_Identity"(channel, external_id, restaurant_id, tenant_id, user_id)
       values ($1, $2, $3, $4, $5)
     on conflict (channel, external_id)
       do update set restaurant_id = excluded.restaurant_id,
                     tenant_id     = excluded.tenant_id,
                     user_id       = excluded.user_id`,
    [b.channel, b.external_id, b.restaurant_id, b.tenant_id, b.user_id],
  );
}
