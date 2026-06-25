import { describe, it, expect } from "vitest";
import { assertProdSecrets } from "../../server/_core/env";

// Item 2 (P1) — fail-closed boot guard. assertProdSecrets must abort a production deploy that is missing
// any load-bearing secret (forgeable JWT, local-docker DB fallback, or no LLM key) with a clear message,
// instead of letting a misconfigured deploy boot green and fail mid-request. Pure: reads the passed env.
const REAL: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  JWT_SECRET: "a-real-injected-32-char-secret-value",
  DATABASE_URL: "postgresql://user:pass@db.prod.example.com:5432/app",
  OPENAI_API_KEY: "sk-real-key",
};

describe("assertProdSecrets — fail-closed prod boot guard", () => {
  it("is a no-op outside production", () => {
    expect(() => assertProdSecrets({ NODE_ENV: "development" })).not.toThrow();
    expect(() => assertProdSecrets({})).not.toThrow(); // NODE_ENV unset ⇒ development
  });

  it("passes when every prod secret is a real value", () => {
    expect(() => assertProdSecrets(REAL)).not.toThrow();
  });

  it("refuses the dev JWT_SECRET default", () => {
    expect(() => assertProdSecrets({ ...REAL, JWT_SECRET: "dev-only-insecure-secret-change-me" })).toThrow(
      /JWT_SECRET/,
    );
  });

  it("refuses a missing JWT_SECRET", () => {
    expect(() => assertProdSecrets({ ...REAL, JWT_SECRET: undefined })).toThrow(/JWT_SECRET/);
  });

  it("refuses the local-docker DATABASE_URL default (would target a non-existent DB in prod)", () => {
    expect(() =>
      assertProdSecrets({ ...REAL, DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54522/postgres" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("refuses a missing DATABASE_URL", () => {
    expect(() => assertProdSecrets({ ...REAL, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it("refuses a missing OPENAI_API_KEY (the platform always runs with an LLM)", () => {
    expect(() => assertProdSecrets({ ...REAL, OPENAI_API_KEY: undefined })).toThrow(/OPENAI_API_KEY/);
  });

  it("reports ALL missing secrets at once (one clear deploy-time error)", () => {
    expect(() => assertProdSecrets({ NODE_ENV: "production" })).toThrow(
      /JWT_SECRET.*DATABASE_URL.*OPENAI_API_KEY/,
    );
  });
});
