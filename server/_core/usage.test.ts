import { describe, it, expect } from "vitest";
import { recordUsage, recordUsageOnce, type UsageEntry } from "./usage.js";

// recordUsage persists ONE Llm_Usage_Log row per LLM call. The query executor is injected so this
// unit test runs with no DB: we assert the exact SQL target + param order (the cost is computed later
// in SQL from Config_Knobs prices — this row only stores the raw token COUNTS, §3.6/§14).
describe("recordUsage", () => {
  it("inserts one Llm_Usage_Log row with token counts and process context", async () => {
    const calls: { sql: string; params: readonly unknown[] }[] = [];
    const exec = async (sql: string, params: readonly unknown[]) => {
      calls.push({ sql, params });
      return [];
    };
    await recordUsage(
      {
        tenantId: "t1",
        processType: "diagnosis",
        kind: "chat",
        model: "gpt-4o-mini",
        refId: "prob-9",
        usage: { inputTokens: 100, outputTokens: 20 },
      },
      exec,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/insert into gov\."Llm_Usage_Log"/);
    expect(calls[0]!.params).toEqual(["t1", "diagnosis", "chat", "gpt-4o-mini", "prob-9", 100, 20]);
  });

  it("defaults a missing ref_id to null", async () => {
    let params: readonly unknown[] = [];
    const exec = async (_sql: string, p: readonly unknown[]) => {
      params = p;
      return [];
    };
    await recordUsage(
      {
        tenantId: "t1",
        processType: "kb_search",
        kind: "embedding",
        model: "text-embedding-3-small",
        usage: { inputTokens: 8, outputTokens: 0 },
      },
      exec,
    );
    expect(params[4]).toBeNull();
  });

  it("records a 'motor' process row (02C — autonomous NBA loop token cost)", async () => {
    let params: readonly unknown[] = [];
    const exec = async (_sql: string, p: readonly unknown[]) => {
      params = p;
      return [];
    };
    await recordUsage(
      {
        tenantId: "t1",
        processType: "motor",
        kind: "chat",
        model: "gpt-4o-mini",
        refId: "attempt-1",
        usage: { inputTokens: 10, outputTokens: 5 },
      },
      exec,
    );
    expect(params[1]).toBe("motor");
    expect(params[5]).toBe(10);
  });
});

// B1: the cockpit copy is generated on a tRPC READ (dispatchDetail) that TanStack re-runs on every
// mount/refocus. recordUsageSafe would write a new row each render ⇒ "custo da atención" over-counts a
// single decision. recordUsageOnce keys the cost to the DECISION (ref_id=nba_id): at most one row.
describe("recordUsageOnce (idempotent per decision — B1 cockpit re-log)", () => {
  const entry: UsageEntry = {
    tenantId: "t1",
    processType: "cockpit",
    kind: "chat",
    model: "gpt-4o-mini",
    refId: "nba-1",
    usage: { inputTokens: 100, outputTokens: 20 },
  };

  it("records cost via an idempotent INSERT ... ON CONFLICT DO NOTHING (the DB index enforces one per decision)", async () => {
    const calls: { sql: string; params: readonly unknown[] }[] = [];
    const exec = async (sql: string, params: readonly unknown[]) => {
      calls.push({ sql, params });
      return [];
    };
    await recordUsageOnce(entry, exec);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/insert into gov\."Llm_Usage_Log"/);
    // the partial unique index (migration) makes a re-render a no-op — race-safe, not a check-then-insert
    expect(calls[0]!.sql).toMatch(/on conflict[\s\S]*do nothing/i);
    expect(calls[0]!.params).toEqual(["t1", "cockpit", "chat", "gpt-4o-mini", "nba-1", 100, 20]);
  });

  it("with no ref_id falls back to a normal append (nothing to dedup on)", async () => {
    const inserts: (readonly unknown[])[] = [];
    const exec = async (sql: string, params: readonly unknown[]) => {
      if (/insert into gov\."Llm_Usage_Log"/i.test(sql)) inserts.push(params);
      return [];
    };
    await recordUsageOnce({ ...entry, refId: undefined }, exec);
    expect(inserts).toHaveLength(1); // no decision key ⇒ append (matches recordUsageSafe)
  });
});
