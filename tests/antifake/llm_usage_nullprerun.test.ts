import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count } from "../helpers/db";

// ── §14 ANTI-FAKE GATE for P07 LLM token-cost tracking ───────────────────────────────────────────
// After a pristine reset (raw seed only) and BEFORE any LLM call runs, NO usage row may exist: a usage
// row is a RESULT a named producer (server/_core/usage.ts recordUsage) writes at runtime — never
// seeded. Consequently gov.v_llm_cost (derived) is empty too: there is no cost until a producer logs a
// call. The PRICES, by contrast, ARE seeded — they are [C] config knobs read BY NAME (§3.8), not
// results. Llm_Usage_Log is not in resetDb's truncate list, so we truncate it here to recreate the
// pristine `supabase db reset` state (clears residue from prior integration runs only).

let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool); // raw seed only, no producers
  await pool.query(`truncate gov."Llm_Usage_Log" restart identity`);
}, 60_000);

afterAll(async () => {
  await pool.end();
});

describe("§14 anti-fake — LLM usage/cost is empty pre-run (only the producer writes it)", () => {
  it("no Llm_Usage_Log row exists before any LLM call (never seeded)", async () => {
    expect(await count(pool, 'gov."Llm_Usage_Log"')).toBe(0);
  });

  it("v_llm_cost is empty pre-run — cost is derived, there is nothing to cost yet", async () => {
    expect(await count(pool, "gov.v_llm_cost")).toBe(0);
  });

  it("token PRICES are seeded BY NAME per model (config [C], not a result, §3.8)", async () => {
    expect(await count(pool, `catalog."Config_Knobs" where key = 'llm_price_in_per_mtok:gpt-4o-mini'`)).toBe(1);
    expect(await count(pool, `catalog."Config_Knobs" where key = 'llm_price_out_per_mtok:gpt-4o-mini'`)).toBe(1);
    expect(await count(pool, `catalog."Config_Knobs" where key like 'llm\\_price\\_%'`)).toBe(4);
  });
});
