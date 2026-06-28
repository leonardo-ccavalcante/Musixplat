import dotenv from "dotenv";

// Local dev/test reads .env.local first, then .env as fallback. Prod injects real env.
dotenv.config({ path: ".env.local" });
dotenv.config();

// Env accessed by NAME only (CLAUDE.md §6) — never bake a secret value into code.
// Local docker defaults let dev/tests run without external creds; prod injects real values.
// These two are the SINGLE source of the dev fallbacks: `name()` uses them so local dev/tests run, and
// assertProdSecrets() refuses them in production (so a deploy that forgot to inject a real value
// fails-closed at boot, not mid-request).
const DEV_JWT_SECRET = "dev-only-insecure-secret-change-me";
const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54522/postgres";
// Service token the channel relay (n8n) sends as `Authorization: Bearer …` to POST /api/chat.
// Dev fallback only; prod refuses it (assertProdSecrets) so a deploy that forgot to inject a real
// token can't accept unauthenticated chat traffic.
const DEV_AGENT_GATEWAY_TOKEN = "dev-only-agent-gateway-token-change-me";

function name(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${key}`);
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 3000),
  // Local supabase docker for this repo: postgres/postgres on 54522 (supabase/config.toml).
  DATABASE_URL: name("DATABASE_URL", LOCAL_DATABASE_URL),
  // Session cookie HS256 secret. Dev fallback only; prod refuses empty (see assertProdSecrets).
  JWT_SECRET: name("JWT_SECRET", DEV_JWT_SECRET),
  // Bearer token for the channel relay → POST /api/chat. Dev fallback only; prod refuses it.
  AGENT_GATEWAY_TOKEN: name("AGENT_GATEWAY_TOKEN", DEV_AGENT_GATEWAY_TOKEN),
};

// Fail-closed boot guard (called from server/index.ts BEFORE serving). In production every load-bearing
// secret must be a REAL injected value — never a dev default or empty — so a misconfigured deploy aborts
// with a clear message at boot instead of a confusing mid-request failure later:
//   · JWT_SECRET  — the dev fallback would sign forgeable sessions.
//   · DATABASE_URL — the local-docker fallback would silently target a non-existent DB in prod.
//   · OPENAI_API_KEY — the platform always runs with an LLM (diagnosis Brain-2 + the motor throw without
//     it); requiring it at boot turns a 500-on-first-diagnosis into a clear deploy-time error.
// Reads process.env at CALL time (not the import-time `env` snapshot) so it is unit-testable with a fake
// env; defaults to the real process.env for the production call site.
export function assertProdSecrets(e: NodeJS.ProcessEnv = process.env): void {
  if ((e.NODE_ENV ?? "development") !== "production") return;
  const missing: string[] = [];
  if (!e.JWT_SECRET || e.JWT_SECRET === DEV_JWT_SECRET) missing.push("JWT_SECRET");
  if (!e.DATABASE_URL || e.DATABASE_URL === LOCAL_DATABASE_URL) missing.push("DATABASE_URL");
  if (!e.OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  if (!e.AGENT_GATEWAY_TOKEN || e.AGENT_GATEWAY_TOKEN === DEV_AGENT_GATEWAY_TOKEN)
    missing.push("AGENT_GATEWAY_TOKEN");
  if (missing.length > 0) {
    throw new Error(
      `Production requires real values for: ${missing.join(", ")} ` +
        `(dev defaults / empty are refused — fail-closed boot guard).`,
    );
  }
}
