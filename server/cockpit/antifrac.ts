import type pg from "pg";
import { TRPCError } from "@trpc/server";
import { query } from "../db/pool.js";
import { financialAbort } from "../pieces/financial_abort.js";

// 05A:A.5.3 wiring — anti-fracturing gate on a HUMAN money RELEASE (04 §3.3/§7). The AI only PROPOSES
// money; a human releases it. Before that release, refuse if any restaurant in the cohort shows
// fracturing: its recent order volume (within window_silent) exceeds umbral_antifrac — the splitting of
// micro-orders to dodge a money threshold. The decision is the pure `financialAbort` piece (knob read BY
// NAME, §3.8, fail-closed); the windowSum is a deterministic SQL aggregate, never an LLM number (§3.6/§14).
//
// Scope = MONEY DISBURSEMENT only. 'direct' moves balance (promo budget / refund — the threshold fracturing
// dodges). 'none' (operational) and 'indirect' (propose-only price/marketing signals — disburse nothing)
// skip. A NULL/unknown class fails CLOSED (§3.7): treated as money and checked, never silently skipped.
// 'direct' actions are human-only (the auto-releasable seal is non-money, autoDispatch hard-blocks
// 'direct'), so the AI auto path never disburses money and has no antifrac call site — recordRelease is it.
//
// Members are scoped to the PROPOSAL's cohort_rule_version (anti-mix §3.5) at its latest snapshot week —
// the cohort AS THE PROPOSAL SEES IT, never an ex-member or a stale/other-version row. A gated release that
// finds ZERO current members fails CLOSED (can't assess ⇒ refuse), so an empty/stale cohort can't slip the
// gate on a coalesce-to-0. A blocked attempt logs a Security_Log row on a SEPARATE connection (survives the
// caller's rolled-back tx) and throws FORBIDDEN — never a silent no-op. Window grain: the antifrac window
// reuses window_silent (30d); per-restaurant we take the MAX windowed volume and pass newAmount=0 (the
// release disburses no new order itself) ⇒ the gate fires when a current member already breaches.
export async function assertNoFracturing(
  client: pg.PoolClient,
  tenantId: string,
  cohortId: string,
  cohortRuleVersion: string,
  financialClass: string | null,
): Promise<void> {
  if (financialClass !== "direct" && financialClass != null) return; // only 'direct' (or null ⇒ fail-closed) is money

  const row = (
    await client.query<{ member_count: string; window_sum: string; threshold: string }>(
      `with members as (
         select cms.restaurant_id
         from cohort."Cohort_Membership_Snapshot" cms
         join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $2
         where cms.cohort_id = $1 and cms.cohort_rule_version = $3
           and cms.week = (select max(week) from cohort."Cohort_Membership_Snapshot"
                           where cohort_id = $1 and cohort_rule_version = $3)
       )
       select (select count(*) from members)::text as member_count,
              coalesce(max(rs), 0)::text as window_sum,
              catalog.knob_required_num('umbral_antifrac')::text as threshold
         from (
           select o.restaurant_id, sum(o.gross_value) as rs
           from tenant."Order" o
           where o.order_date >= current_date - catalog.knob_required_num('window_silent')::int
             and o.restaurant_id in (select restaurant_id from members)
           group by o.restaurant_id
         ) per_restaurant`,
      [cohortId, tenantId, cohortRuleVersion],
    )
  ).rows[0]!;

  // Fail-closed (§3.7): a gated money release whose cohort has no current members can't be assessed ⇒ refuse
  // (an empty/stale set must NOT pass on coalesce-to-0).
  if (Number(row.member_count) === 0) {
    await logBlock(tenantId, cohortId, financialClass, 0, Number(row.threshold), "no_current_members");
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "financial release blocked: cohort has no current members to assess for anti-fracturing (fail-closed §3.7)",
    });
  }

  const decision = financialAbort(
    { financialClass: financialClass ?? "direct", autonomous: false, windowSum: Number(row.window_sum), newAmount: 0 },
    Number(row.threshold),
  );
  if (!decision.abort) return;

  await logBlock(tenantId, cohortId, financialClass, Number(row.window_sum), Number(row.threshold), decision.reason);
  throw new TRPCError({
    code: "FORBIDDEN",
    message: `financial release blocked: ${decision.reason} — a cohort restaurant's recent volume exceeds umbral_antifrac (anti-fracturing §3.3)`,
  });
}

// Audit on a SEPARATE connection so the record survives the caller's rolled-back tx (mirror autoDispatch).
async function logBlock(
  tenantId: string,
  cohortId: string,
  financialClass: string | null,
  windowSum: number,
  threshold: number,
  reason: string,
): Promise<void> {
  await query(`insert into gov."Security_Log"(tenant_id, kind, detail) values ($1,'antifrac_block',$2::jsonb)`, [
    tenantId,
    JSON.stringify({ cohort_id: cohortId, financial_class: financialClass, window_sum: windowSum, threshold, reason }),
  ]);
}
