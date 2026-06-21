import { z } from "zod";

// P07 AI Cost — read-only contracts over gov.v_llm_cost. costUsd is nullable: a row whose model has no
// price knob has NULL cost (§3.7 honest gap), and sums over only-unpriced rows are null too.
export const costByProcess = z.object({
  processType: z.string(),
  costUsd: z.number().nullable(),
  calls: z.number(),
  inTok: z.number(),
  outTok: z.number(),
});
export type CostByProcess = z.infer<typeof costByProcess>;

export const costByTicket = z.object({
  refId: z.string(),
  costUsd: z.number().nullable(),
  calls: z.number(),
});
export type CostByTicket = z.infer<typeof costByTicket>;

export const costSummary = z.object({
  total: z.object({
    costUsd: z.number().nullable(),
    inTok: z.number(),
    outTok: z.number(),
    calls: z.number(),
  }),
  byProcess: z.array(costByProcess),
  byTicket: z.array(costByTicket),
  unpriced: z.object({ calls: z.number(), models: z.array(z.string()) }),
});
export type CostSummary = z.infer<typeof costSummary>;

// Model & pricing config (operator-editable). activeModel = the chat model the agents use (knob
// llm_chat_model); prices are $ per 1,000,000 tokens per model (knobs llm_price_*). Embeddings keep a
// fixed model for now. Prices nullable: a model can be listed (active) before its price is set.
export const modelPrice = z.object({
  model: z.string(),
  inPerMtok: z.number().nullable(),
  outPerMtok: z.number().nullable(),
});
export type ModelPrice = z.infer<typeof modelPrice>;

export const costConfig = z.object({
  activeModel: z.string(),
  prices: z.array(modelPrice),
});
export type CostConfig = z.infer<typeof costConfig>;

export const setActiveModelInput = z.object({ model: z.string().min(1).max(80) });
export const setPriceInput = z.object({
  model: z.string().min(1).max(80),
  inPerMtok: z.number().min(0),
  outPerMtok: z.number().min(0),
});

export const ticketCostInput = z.object({ refId: z.string().min(1) });
export const ticketCost = z.object({
  costUsd: z.number().nullable(),
  calls: z.number(),
  byProcess: z.array(costByProcess),
});
export type TicketCost = z.infer<typeof ticketCost>;
