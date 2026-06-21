import { describe, it, expect } from "vitest";
import { recordUsage } from "./usage.js";

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
