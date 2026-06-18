// EPIC-B3 silent-hunter + EPIC-B1 reconcile (anti-join in SQL, TS orchestrates). Pieces:
//   B.5.2b      — huntSilent: calls tenant.fn_hunt_silent (Order failed ∖ complainants)
//   US-B1.3.1   — reconcileAffected: restaurants_affected = count(Affected); stale ⇒ not_evaluable
// BR-B4 ⭐ the silent counts equal. Affected rows are NEVER seeded (§14). window via knob.
import { query } from "../db/pool.js";

export interface SilentResult {
  affected: number;
  silent: number;
}

export interface ReconcileResult {
  restaurantsAffected: number;
  silentStatus: "evaluable" | "not_evaluable";
}

/** B.5.2b — run the anti-join producer for a problem within its tenant + window. */
export async function huntSilent(
  problemId: string,
  tenantId: string,
  windowDays?: number,
): Promise<SilentResult> {
  // window BY NAME from catalog (CLAUDE.md §3.8); explicit override wins. Knob is fail-closed:
  // knob_required_num raises if 'window_silent' is absent (never a silent default).
  const window =
    windowDays ??
    Number(
      (
        await query<{ v: number }>(
          `select catalog.knob_required_num('window_silent') as v`,
        )
      )[0]?.v,
    );

  // The anti-join (Order failed ∖ Conversation) lives in SQL; TS only orchestrates (§3.6). tenant +
  // window are passed to the producer (BR-B6 cross-tenant hard-no; B-block-2 bounded sweep).
  await query(`select tenant.fn_hunt_silent($1::uuid, $2::text, $3::int) as n`, [
    problemId,
    tenantId,
    window,
  ]);

  // Counts are READ from the producer output — never the inserted-rows return (a re-run hits
  // ON CONFLICT DO NOTHING ⇒ 0 inserted, but the Affected set is unchanged). count(*) is truth.
  const rows = await query<{ affected: number; silent: number }>(
    `select count(*)::int                                  as affected,
            count(*) filter (where silent)::int            as silent
       from tenant."Affected" where problem_id = $1::uuid`,
    [problemId],
  );
  const r = rows[0];
  return { affected: r?.affected ?? 0, silent: r?.silent ?? 0 };
}

/** US-B1.3.1 — reconcile against the Affected set; flag not_evaluable when the source is stale. */
export async function reconcileAffected(problemId: string): Promise<ReconcileResult> {
  // tenant_id is read from the problem (server-side frontier, BR-B6) — never client-supplied.
  const prob = await query<{ tenant_id: string }>(
    `select tenant_id from tenant."Diagnosed_Problem" where problem_id = $1::uuid`,
    [problemId],
  );
  if (!prob[0]) throw new Error("unknown problem (fail-closed): " + problemId);
  const tenantId = prob[0].tenant_id;

  // restaurants_affected is ALWAYS a live count, never a stored number (US-B1.3.1).
  const af = await query<{ n: number }>(
    `select count(*)::int as n from tenant."Affected" where problem_id = $1::uuid`,
    [problemId],
  );
  const restaurantsAffected = af[0]?.n ?? 0;

  // Population source = does ANY Order exist for this tenant inside the window? No population ⇒
  // 'not_evaluable' (BR-B4 fail-closed: NEVER assume zero silent when we can't observe them).
  const window = Number(
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
    [tenantId, window],
  );
  const silentStatus: "evaluable" | "not_evaluable" =
    pop[0]?.has ? "evaluable" : "not_evaluable";

  // Persist the reconcile flag on the case (RESULT column, §14 — written only by this producer).
  await query(
    `update tenant."Diagnosed_Problem"
        set silent_status = $2 where problem_id = $1::uuid`,
    [problemId, silentStatus],
  );

  return { restaurantsAffected, silentStatus };
}
