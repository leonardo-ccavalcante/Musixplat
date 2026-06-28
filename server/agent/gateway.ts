import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { env } from "../_core/env.js";
import { appRouter } from "../routers/_app.js";
import type { Context } from "../_core/context.js";
import { chatText, openaiChatClient } from "../_core/llm.js";
import { handleChatTurn, type ChatDeps, type EngineCaller } from "./chat.js";
import { getBinding, resolveRestaurant, upsertBinding } from "./identity.js";
import { loadHistory, appendTurn } from "./memory.js";

// POST /api/chat — the single channel-agnostic entry point (Opção B). A relay (n8n today) authenticates
// with the service Bearer token and posts {channel, external_id, text}; the platform runs the agent loop
// in-process (reusing the engines via createCaller) and returns {reply}. Telegram today, Intercom tomorrow:
// same contract, only the relay differs.

const chatInput = z.object({
  channel: z.string().min(1).max(40),
  // Telegram sends a numeric chat id; normalize to string for the binding key.
  external_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  text: z.string().min(1).max(4000),
});

// Constant-time Bearer check. Compare fixed-length SHA-256 digests so neither the token length nor a
// shared prefix is observable via timing (hashing is only for equal-length comparison, not secrecy).
function tokenOk(authHeader: string | undefined): boolean {
  const provided = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(env.AGENT_GATEWAY_TOKEN).digest();
  return crypto.timingSafeEqual(a, b);
}

export function registerAgentGateway(app: Express): void {
  app.post("/api/chat", async (req: Request, res: Response) => {
    if (!tokenOk(req.headers.authorization)) return res.status(401).json({ error: "unauthorized" });

    const parsed = chatInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "bad request" });

    try {
      const client = await openaiChatClient();
      const deps: ChatDeps = {
        chat: async (system, user, maxTokens) => (await chatText(client, system, user, maxTokens ?? 300)).text,
        getBinding: (c, e) => getBinding(query, c, e),
        resolveRestaurant: (rid) => resolveRestaurant(query, rid),
        upsertBinding: (b) => upsertBinding(query, b),
        loadHistory: (s) => loadHistory(query, s),
        appendTurn: (s, h, a, t) => appendTurn(query, s, h, a, t),
        caller: (ctx: Context): EngineCaller => {
          const c = appRouter.createCaller(ctx);
          return {
            diagnosis: {
              reportProblem: (i) => c.diagnosis.reportProblem(i),
              run: (i) => c.diagnosis.run(i),
            },
          };
        },
      };
      const out = await handleChatTurn(
        { channel: parsed.data.channel, externalId: parsed.data.external_id, text: parsed.data.text },
        deps,
      );
      res.json({ reply: out.reply });
    } catch (e) {
      // Fail-OPEN to a graceful human-handoff reply (200) — a transient LLM/DB error must not surface a
      // raw 500 to the owner. The cause is logged for observability, never swallowed silently.
      console.warn("[/api/chat] turn failed:", e);
      res.json({ reply: "Tive uma dificuldade aqui - já estou chamando uma pessoa do time pra te ajudar." });
    }
  });
}
