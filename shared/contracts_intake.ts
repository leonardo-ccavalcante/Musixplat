import { z } from "zod";
import { criticality } from "./contracts_05b.js";

// Situation Room intake — operator-supplied data so the spine runs on REAL rows, not the fixed scenario.
// These are INPUTS (which restaurants, payment status, who complained, the free text). The result numbers
// (affected/silent/€) are still PRODUCED by the SQL producers when the spine runs — never seeded (§14).

// Mode 1 — a structured ticket/situation row. payment_status + opened_ticket carry the cascade signal;
// `message` is the free-text "what's happening" (the restaurant's words) stored on the episode.
export const ticketRowInput = z.object({
  restaurant_id: z.string().min(1).max(64),
  zone: z.string().min(1).max(64).default("Centro"),
  payment_status: z.enum(["failed", "ok", "pending"]).default("failed"),
  order_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gross_value: z.number().nonnegative(),
  fee: z.number().nonnegative(),
  opened_ticket: z.boolean().default(false),
  intent: z.string().min(1).max(64).optional(),
  criticality: criticality.optional(),
  message: z.string().max(4000).optional(),
  resolution_how: z.string().min(1).max(2000).optional(),
}).superRefine((row, ctx) => {
  if (row.fee > row.gross_value) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fee"], message: "fee cannot exceed gross_value" });
  }
});
export type TicketRowInput = z.infer<typeof ticketRowInput>;
export const uploadTicketsInput = z.object({ rows: z.array(ticketRowInput).min(1).max(2000) });
export type UploadTicketsInput = z.infer<typeof uploadTicketsInput>;

// Mode 2 — the n8n chat-history shape, grouped by session. Each session -> one Conversation_Episode whose
// `turnos` carry the real turns (restaurant = human, agent = ai). This is the future DB structure an agent
// that handles support tickets would write to.
export const conversationTurnInput = z.object({ role: z.enum(["restaurant", "agent"]), text: z.string().max(8000) });
export const conversationInput = z.object({
  session_id: z.string().min(1).max(96),
  intent: z.string().min(1).max(64).optional(),
  turns: z.array(conversationTurnInput).min(1).max(500),
});
export const uploadConversationsInput = z.object({ conversations: z.array(conversationInput).min(1).max(500) });
export type UploadConversationsInput = z.infer<typeof uploadConversationsInput>;

// What the intake produced (read back from the producers, never seeded). `note` is the honest fail-closed
// caption when the upload lacks the structured signal the cascade needs.
export interface IntakeResult {
  staged: number;
  problems: number;
  affected: number | null; // NULL if the diagnosed type was unmeasurable (no bound producer) — never a fake 0 (§14)
  silent: number | null;
  revenue_lost: number | null;
  dossiers_complete: number;
  artifacts: number;
  note: string;
}
