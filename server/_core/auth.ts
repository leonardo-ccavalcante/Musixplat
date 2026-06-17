import jwt from "jsonwebtoken";
import { env } from "./env.js";

// Session payload. tenant_id (pool) is the RLS frontier — it is minted server-side into the
// signed cookie and NEVER read from a request body (anti-spoofing, 04 §7 / CLAUDE.md §3.4).
export interface Session {
  usuario_id: string;
  tenant_id: string;
  nivel_org: string;
}

const COOKIE = "mxm_session";

export function signSession(s: Session): string {
  return jwt.sign(s, env.JWT_SECRET, { algorithm: "HS256", expiresIn: "8h" });
}

export function verifySession(token: string | undefined): Session | null {
  if (!token) return null;
  try {
    return jwt.verify(token, env.JWT_SECRET) as Session;
  } catch {
    return null; // fail-closed: bad/expired token ⇒ no session
  }
}

export function readSessionCookie(cookieHeader: string | undefined): Session | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  return verifySession(match?.slice(COOKIE.length + 1));
}

export const SESSION_COOKIE = COOKIE;
