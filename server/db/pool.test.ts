// @vitest-environment node
import { describe, expect, it } from "vitest";
import { pool } from "./pool";

// Prod crash-loop guard (§3.11 — change-locked invariant). node-postgres Pools are EventEmitters. When the
// remote DB (Supabase direct 5432 in prod) drops an IDLE connection, the pool emits 'error' on that client.
// Node's rule: an 'error' event with NO listener is rethrown as an uncaught exception → the process exits
// non-zero → under Railway's restartPolicy=ON_FAILURE that becomes a crash-loop (the observed prod symptom:
// boots, logs "server on :PORT", then dies with no app stack, repeatedly). The pool MUST therefore keep an
// 'error' listener so an idle-client drop is logged and swallowed, never fatal. This test fails if it is
// ever removed.
describe("db pool — prod resilience", () => {
  it("registers an 'error' listener so an idle-client drop never crashes the process", () => {
    expect(pool.listenerCount("error")).toBeGreaterThan(0);
  });
});
