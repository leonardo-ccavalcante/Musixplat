import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { upsertCaseRepo } from "../../server/diagnostico/caso_repo";

// 05B:US-B6.2.1 — upsertCaseRepo (BR-B15 replicable case, BR-B7 PII redaction, §14 anti-fake).
// Unit-of-record test against the local DB: a Problem is inserted directly (its RESULT columns
// stay NULL — case_repo NULL pre-run), then the producer fills/increments. PII in client_id
// must be redacted in the stored jsonb. Modeled on diagnostico_spine.test.ts.

let pool: pg.Pool;
let problemId: string;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool); // seeds R001 in POOL-001
  // Insert the Problem brute (no producers): case_repo + frequency default per DDL.
  const inserted = await rows<{ problem_id: string }>(
    pool,
    `insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, criticality)
       values ('POOL-001', 'R001', 'critical') returning problem_id`,
  );
  problemId = inserted[0]!.problem_id;
}, 60_000);

afterAll(async () => {
  await pool.end();
});

describe("05B:US-B6.2.1 — upsertCaseRepo create-or-increment + PII redaction", () => {
  it("anti-fake §14: case_repo is NULL pre-run (only the producer fills it)", async () => {
    const r = await rows<{ case_repo: unknown }>(
      pool,
      `select case_repo from tenant."Diagnosed_Problem" where problem_id = $1`,
      [problemId],
    );
    expect(r[0]!.case_repo).toBeNull();
  });

  it("first call creates the case (created=true, frequency unchanged) + redacts PII", async () => {
    const out = await upsertCaseRepo(problemId, {
      client_id: "client joao joao.silva@example.com",
      day: "2026-06-17",
      replicable_links: ["repro-step-1"],
      where_concentrated: { zone: "downtown" },
    });
    expect(out.created).toBe(true);
    expect(out.frequency).toBe(1); // unchanged from the DDL default

    const r = await rows<{ case_repo: { client_id: string }; last_seen_ts: string | null }>(
      pool,
      `select case_repo, last_seen_ts from tenant."Diagnosed_Problem" where problem_id = $1`,
      [problemId],
    );
    expect(r[0]!.case_repo).not.toBeNull(); // now set
    expect(r[0]!.last_seen_ts).not.toBeNull(); // bumped
    // BR-B7: the PII-bearing email in client_id is redacted in the STORED jsonb.
    expect(r[0]!.case_repo.client_id).toBe("client joao [REDACTED:email]");
    expect(r[0]!.case_repo.client_id).not.toContain("@example.com");
  });

  it("second call increments frequency (created=false) — frequency is a computed count", async () => {
    const out = await upsertCaseRepo(problemId, { client_id: "client-anon", day: "2026-06-18" });
    expect(out.created).toBe(false); // BR-B15: existing case, no duplicate
    expect(out.frequency).toBe(2); // incremented in SQL, read via RETURNING

    const r = await rows<{ frequency: number }>(
      pool,
      `select frequency from tenant."Diagnosed_Problem" where problem_id = $1`,
      [problemId],
    );
    expect(r[0]!.frequency).toBe(2);
  });
});
