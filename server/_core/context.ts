import type * as trpcExpress from "@trpc/server/adapters/express";
import { readSessionCookie, type Session } from "./auth.js";

export interface Context {
  session: Session | null;
  // tenant_id resolved server-side from the signed cookie (never the body). RLS single-pool.
  tenantId: string | null;
  userId: string | null;
}

export function createContext({ req }: trpcExpress.CreateExpressContextOptions): Context {
  const session = readSessionCookie(req.headers.cookie);
  return {
    session,
    tenantId: session?.tenant_id ?? null,
    userId: session?.user_id ?? null,
  };
}
