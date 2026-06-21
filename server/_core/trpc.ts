import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context.js";
import { query } from "../db/pool.js";

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

// managerProcedure: governance-role gate on top of tenantProcedure (02C P1-2). Changing the autonomy
// boundary — the approved action range, the loop knobs, or approving a learning — is a §6 "human owns the
// decision" act, so only a senior agent manager may do it. Fail-closed: a missing user / non-manager role ⇒
// FORBIDDEN. The role is read server-side from gov."User", never trusted from the client.
export const managerProcedure = tenantProcedure.use(async ({ ctx, next }) => {
  const u = await query<{ role: string }>(
    `select role from gov."User" where user_id=$1 and tenant_id=$2`,
    [ctx.userId, ctx.tenantId],
  );
  if (u[0]?.role !== "agent_manager_senior") {
    throw new TRPCError({ code: "FORBIDDEN", message: "autonomy controls require a senior manager role" });
  }
  return next();
});
