import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context.js";

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

// tenantProcedure: fail-closed gate. No server-resolved tenant ⇒ abort (never optimistic).
// Downstream queries MUST scope by ctx.tenantId (cross-pool = abort + security log, 04 §7).
export const tenantProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.tenantId || !ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "No tenant in session" });
  }
  return next({ ctx: { ...ctx, tenantId: ctx.tenantId, userId: ctx.userId } });
});
