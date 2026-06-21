import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";
import { CHAT_MODEL } from "../_core/llm.js";
import {
  ticketCostInput,
  setActiveModelInput,
  setPriceInput,
  type CostSummary,
  type TicketCost,
  type CostConfig,
} from "../../shared/contracts_cost.js";

const ACTIVE_MODEL_KNOB = "llm_chat_model";
const priceKey = (dir: "in" | "out", model: string): string => `llm_price_${dir}_per_mtok:${model}`;

async function upsertKnob(key: string, value: string): Promise<void> {
  // Operator-set ⇒ provenance [V] (a human chose it), §3.8 by name.
  await query(
    `insert into catalog."Config_Knobs"(key, value, provenance, owner) values ($1,$2,'[V]','operator')
     on conflict (key) do update set value = excluded.value, provenance = '[V]', owner = 'operator'`,
    [key, value],
  );
}

// P07 AI Cost — read-only VITRINA over gov.v_llm_cost. Every number is SQL (§3.6): this router only
// AGGREGATES the produced view, never computes a cost itself. tenant resolved server-side (§3.4).
// cost_usd is NULL for an unpriced model ⇒ excluded from sums (honest), surfaced via `unpriced` (§3.7).
export const costRouter = router({
  summary: tenantProcedure.query(async ({ ctx }): Promise<CostSummary> => {
    const t = ctx.tenantId;
    const total = (
      await query<{ cost: number | null; in_tok: number; out_tok: number; calls: number }>(
        `select sum(cost_usd)::float8 as cost, coalesce(sum(in_tok),0)::int as in_tok,
                coalesce(sum(out_tok),0)::int as out_tok, count(*)::int as calls
           from gov.v_llm_cost where tenant_id = $1`,
        [t],
      )
    )[0]!;
    const byProcess = await query<{
      process_type: string;
      cost: number | null;
      calls: number;
      in_tok: number;
      out_tok: number;
    }>(
      `select process_type, sum(cost_usd)::float8 as cost, count(*)::int as calls,
              coalesce(sum(in_tok),0)::int as in_tok, coalesce(sum(out_tok),0)::int as out_tok
         from gov.v_llm_cost where tenant_id = $1
         group by process_type order by sum(cost_usd) desc nulls last`,
      [t],
    );
    const byTicket = await query<{ ref_id: string; cost: number | null; calls: number }>(
      `select ref_id, sum(cost_usd)::float8 as cost, count(*)::int as calls
         from gov.v_llm_cost where tenant_id = $1 and ref_id is not null
         group by ref_id order by sum(cost_usd) desc nulls last limit 20`,
      [t],
    );
    const unpriced = (
      await query<{ calls: number; models: string[] }>(
        `select count(*)::int as calls, coalesce(array_agg(distinct model), '{}')::text[] as models
           from gov.v_llm_cost where tenant_id = $1 and cost_usd is null`,
        [t],
      )
    )[0]!;
    return {
      total: { costUsd: total.cost, inTok: total.in_tok, outTok: total.out_tok, calls: total.calls },
      byProcess: byProcess.map((r) => ({
        processType: r.process_type,
        costUsd: r.cost,
        calls: r.calls,
        inTok: r.in_tok,
        outTok: r.out_tok,
      })),
      byTicket: byTicket.map((r) => ({ refId: r.ref_id, costUsd: r.cost, calls: r.calls })),
      unpriced: { calls: unpriced.calls, models: unpriced.models },
    };
  }),

  ticket: tenantProcedure.input(ticketCostInput).query(async ({ ctx, input }): Promise<TicketCost> => {
    const rows = await query<{
      process_type: string;
      cost: number | null;
      calls: number;
      in_tok: number;
      out_tok: number;
    }>(
      `select process_type, sum(cost_usd)::float8 as cost, count(*)::int as calls,
              coalesce(sum(in_tok),0)::int as in_tok, coalesce(sum(out_tok),0)::int as out_tok
         from gov.v_llm_cost where tenant_id = $1 and ref_id = $2
         group by process_type order by sum(cost_usd) desc nulls last`,
      [ctx.tenantId, input.refId],
    );
    const costUsd = rows.some((r) => r.cost !== null)
      ? rows.reduce((s, r) => s + (r.cost ?? 0), 0)
      : null;
    const calls = rows.reduce((s, r) => s + r.calls, 0);
    return {
      costUsd,
      calls,
      byProcess: rows.map((r) => ({
        processType: r.process_type,
        costUsd: r.cost,
        calls: r.calls,
        inTok: r.in_tok,
        outTok: r.out_tok,
      })),
    };
  }),

  // Model & pricing config (operator surface). Reads the active chat model + every per-model price knob.
  config: tenantProcedure.query(async (): Promise<CostConfig> => {
    const active = (
      await query<{ value: string }>(`select value from catalog."Config_Knobs" where key = $1`, [
        ACTIVE_MODEL_KNOB,
      ])
    )[0]?.value;
    const knobs = await query<{ key: string; value: string }>(
      `select key, value from catalog."Config_Knobs" where key like 'llm\\_price\\_%'`,
    );
    const byModel = new Map<string, { inPerMtok: number | null; outPerMtok: number | null }>();
    for (const k of knobs) {
      const m = /^llm_price_(in|out)_per_mtok:(.+)$/.exec(k.key);
      if (!m) continue;
      const entry = byModel.get(m[2]!) ?? { inPerMtok: null, outPerMtok: null };
      if (m[1] === "in") entry.inPerMtok = Number(k.value);
      else entry.outPerMtok = Number(k.value);
      byModel.set(m[2]!, entry);
    }
    return {
      activeModel: active || CHAT_MODEL,
      prices: [...byModel.entries()].map(([model, p]) => ({ model, ...p })),
    };
  }),

  // Operator picks the chat model the agents will use (takes effect via getActiveChatModel on next call).
  setActiveModel: tenantProcedure.input(setActiveModelInput).mutation(async ({ input }) => {
    await upsertKnob(ACTIVE_MODEL_KNOB, input.model);
    return { ok: true as const };
  }),

  // Operator sets a model's price ($ per 1M tokens, in + out). Feeds gov.v_llm_cost (BY NAME, §3.8).
  setPrice: tenantProcedure.input(setPriceInput).mutation(async ({ input }) => {
    await upsertKnob(priceKey("in", input.model), String(input.inPerMtok));
    await upsertKnob(priceKey("out", input.model), String(input.outPerMtok));
    return { ok: true as const };
  }),
});
