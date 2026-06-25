import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool } from "../helpers/db";

// §3.10 autonomy fail-closed — gov.compute_effective_level is least() over the ORDERED enum
// (LOW<MEDIUM<HIGH); a null arm ⇒ LOW. This is the gate that stops the AI escalating its OWN autonomy:
// if the enum is reordered (e.g. to alphabetical) or the function rewritten, the AI could silently pick
// HIGH instead of capping down. Until now this was tested ONLY in pgTAP (supabase/tests/min_calculo_test.sql),
// which runs in NO CI workflow — so a reorder shipped green. This pins the min-arm / tier-cap / null-arm /
// all-high semantics in the CI integration gate (mirrors the pgTAP cases). No seed needed — pure function.
const A = "public.autonomy_level";
let pool: pg.Pool;
beforeAll(() => {
  pool = makePool();
});
afterAll(async () => {
  await pool.end();
});

async function eff(p: string | null, e: string | null, t: string | null): Promise<string> {
  const cast = (v: string | null): string => (v === null ? `null::${A}` : `'${v}'::${A}`);
  const r = await pool.query<{ lvl: string }>(
    `select gov.compute_effective_level(${cast(p)}, ${cast(e)}, ${cast(t)}) as lvl`,
  );
  return r.rows[0]!.lvl;
}

describe("gov.compute_effective_level — §3.10 autonomy fail-closed (CI-gated)", () => {
  it("least() picks the min arm (HIGH,MEDIUM,HIGH ⇒ MEDIUM)", async () => {
    expect(await eff("HIGH", "MEDIUM", "HIGH")).toBe("MEDIUM");
  });

  it("tier_cap caps down (HIGH,HIGH,LOW ⇒ LOW)", async () => {
    expect(await eff("HIGH", "HIGH", "LOW")).toBe("LOW");
  });

  it("a null arm ⇒ LOW (fail-closed, never skipped to a permissive default)", async () => {
    expect(await eff(null, "HIGH", "HIGH")).toBe("LOW");
  });

  it("all HIGH ⇒ HIGH (the ONLY way the AI reaches HIGH)", async () => {
    expect(await eff("HIGH", "HIGH", "HIGH")).toBe("HIGH");
  });

  it("the enum is ordered LOW<MEDIUM<HIGH, not alphabetical (the silent-escalation trap)", async () => {
    // If the enum were declared alphabetically (HIGH,LOW,MEDIUM) least() would return HIGH here — the
    // exact silent autonomy escalation this guards. Declared in rank order ⇒ MEDIUM is the min.
    expect(await eff("MEDIUM", "HIGH", "HIGH")).toBe("MEDIUM");
  });
});
