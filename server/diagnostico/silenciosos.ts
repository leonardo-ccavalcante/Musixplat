// EPIC-B3 caza-silenciosos + EPIC-B1 reconcile (anti-join in SQL, TS orchestrates). Pieces:
//   B.5.2b      — cazarSilenciosos: calls tenant.fn_cazar_silenciosos (Order fallido ∖ reclamantes)
//   US-B1.3.1   — reconcileAffected: restaurants_afetados = count(Affected); stale ⇒ no_evaluable
// BR-B4 ⭐ the silencioso counts equal. Affected rows are NEVER seeded (§14). ventana via knob.
import { query } from "../db/pool.js";

export interface SilenciososResult {
  afetados: number;
  silenciosos: number;
}

export interface ReconcileResult {
  restaurantsAffecteds: number;
  silenciososEstado: "evaluable" | "no_evaluable";
}

/** B.5.2b — run the anti-join producer for a problema within its tenant + window. */
export async function cazarSilenciosos(
  problemaId: string,
  tenantId: string,
  ventanaDias?: number,
): Promise<SilenciososResult> {
  // ventana BY NAME from catalog (CLAUDE.md §3.8); explicit override wins. Knob is fail-closed:
  // knob_required_num raises if 'window_silent' is absent (never a silent default).
  const ventana =
    ventanaDias ??
    Number(
      (
        await query<{ v: number }>(
          `select catalog.knob_required_num('window_silent') as v`,
        )
      )[0]?.v,
    );

  // The anti-join (Order fallido ∖ Conversation) lives in SQL; TS only orchestrates (§3.6). tenant +
  // ventana are passed to the producer (BR-B6 cross-tenant hard-no; B-block-2 acotado barrido).
  await query(`select tenant.fn_cazar_silenciosos($1::uuid, $2::text, $3::int) as n`, [
    problemaId,
    tenantId,
    ventana,
  ]);

  // Counts are READ from the producer output — never the inserted-rows return (a re-run hits
  // ON CONFLICT DO NOTHING ⇒ 0 inserted, but the Affected set is unchanged). count(*) is truth.
  const rows = await query<{ afetados: number; silenciosos: number }>(
    `select count(*)::int                                  as afetados,
            count(*) filter (where silencioso)::int        as silenciosos
       from tenant."Affected" where problema_id = $1::uuid`,
    [problemaId],
  );
  const r = rows[0];
  return { afetados: r?.afetados ?? 0, silenciosos: r?.silenciosos ?? 0 };
}

/** US-B1.3.1 — reconcile against the Affected set; flag no_evaluable when the source is stale. */
export async function reconcileAffected(problemaId: string): Promise<ReconcileResult> {
  // tenant_id is read from the problema (server-side frontier, BR-B6) — never client-supplied.
  const prob = await query<{ tenant_id: string }>(
    `select tenant_id from tenant."Diagnosed_Problem" where problema_id = $1::uuid`,
    [problemaId],
  );
  if (!prob[0]) throw new Error("problema desconocido (fail-closed): " + problemaId);
  const tenantId = prob[0].tenant_id;

  // restaurants_afetados is ALWAYS a live count, never a stored number (US-B1.3.1).
  const af = await query<{ n: number }>(
    `select count(*)::int as n from tenant."Affected" where problema_id = $1::uuid`,
    [problemaId],
  );
  const restaurantsAffecteds = af[0]?.n ?? 0;

  // Population source = does ANY Order exist for this tenant inside the ventana? No population ⇒
  // 'no_evaluable' (BR-B4 fail-closed: NEVER assume zero silenciosos when we can't observe them).
  const ventana = Number(
    (
      await query<{ v: number }>(
        `select catalog.knob_required_num('window_silent') as v`,
      )
    )[0]?.v,
  );
  const pop = await query<{ has: boolean }>(
    `select exists(
        select 1 from tenant."Order" o
        join tenant."Restaurant" r on r.restaurant_id = o.restaurant_id
        where r.tenant_id = $1::text
          and o.order_date >= (current_date - $2::int)
      ) as has`,
    [tenantId, ventana],
  );
  const silenciososEstado: "evaluable" | "no_evaluable" =
    pop[0]?.has ? "evaluable" : "no_evaluable";

  // Persist the reconcile flag on the case (RESULT column, §14 — written only by this producer).
  await query(
    `update tenant."Diagnosed_Problem"
        set silenciosos_status = $2 where problema_id = $1::uuid`,
    [problemaId, silenciososEstado],
  );

  return { restaurantsAffecteds, silenciososEstado };
}
