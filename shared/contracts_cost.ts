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

export const ticketCostInput = z.object({ refId: z.string().min(1) });
export const ticketCost = z.object({
  costUsd: z.number().nullable(),
  calls: z.number(),
  byProcess: z.array(costByProcess),
});
export type TicketCost = z.infer<typeof ticketCost>;
