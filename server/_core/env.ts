import dotenv from "dotenv";

// Local dev/test reads .env.local first, then .env as fallback. Prod injects real env.
dotenv.config({ path: ".env.local" });
dotenv.config();

// Env accessed by NAME only (CLAUDE.md §6) — never bake a secret value into code.
// Local docker defaults let dev/tests run without external creds; prod injects real values.
function name(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${key}`);
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 3000),
  // Local supabase docker for this repo: postgres/postgres on 54522 (supabase/config.toml).
  DATABASE_URL: name("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54522/postgres"),
  // Session cookie HS256 secret. Dev fallback only; prod refuses empty (see assertProdSecrets).
  JWT_SECRET: name("JWT_SECRET", "dev-only-insecure-secret-change-me"),
};

export function assertProdSecrets(): void {
  if (env.NODE_ENV === "production" && env.JWT_SECRET === "dev-only-insecure-secret-change-me") {
    throw new Error("JWT_SECRET must be set in production");
  }
}
