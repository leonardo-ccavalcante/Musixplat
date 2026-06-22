import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count, rows } from "../helpers/db";
import { runDiagnosis } from "../../server/diagnosis/orchestrator";
import type { DiagnosisReasoning, GroundingCase } from "../../server/diagnosis/reasoning";
import { getDescriptor } from "../../shared/problem_types";

// EPIC-B1 orchestrator — assembles B.2→B.8 over the real modules. Numbers are SQL (§8/§14); the
// AGENTE provider here is the deterministic stub so the gate needs no key/network. Proves the machine
// RUNS end-to-end (working prototype, not a demo): classify → issue-tree → silent-hunt → impact →
// route → dossier, plus the proactive monitor (BR-B12) and the fail-closed degrade (BR-B3).
//
// Fixture (POOL-DIAG), 4 failed-payment restaurants, 2 with a Conversation (complained), 2 silent:
//   affected = 4 · silent = 2 · revenue_lost = 4 × (100 − 20) = 320 (net_value = gross − fee, failed only).
const N_AFFECTED = 4;
const SILENT = 2;
const REVENUE_LOST = 320;

let pool: pg.Pool;

/** Reactive fixture: returns the open problem_id anchored to R-ORC-1's episode (intent ⇒ finance). */
async function seedReactive(): Promise<string> {
  await pool.query(`
    insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date)
    values ('R-ORC-1','POOL-DIAG','long_tail','long_tail', date '2026-01-01'),
           ('R-ORC-2','POOL-DIAG','long_tail','long_tail', date '2026-01-01'),
           ('R-ORC-3','POOL-DIAG','long_tail','long_tail', date '2026-01-01'),
           ('R-ORC-4','POOL-DIAG','long_tail','long_tail', date '2026-01-01');

    insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
    values ('R-ORC-1', current_date, 100, 20, 'failed', 'Centro'),
           ('R-ORC-2', current_date, 100, 20, 'failed', 'Centro'),
           ('R-ORC-3', current_date, 100, 20, 'failed', 'Centro'),
           ('R-ORC-4', current_date, 100, 20, 'failed', 'Norte');

    insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
    values ('R-ORC-1:C1','R-ORC-1:conv1','POOL-DIAG','R-ORC-1','billing'),
           ('R-ORC-2:C1','R-ORC-2:conv1','POOL-DIAG','R-ORC-2','billing');
  `);
  const r = await pool.query<{ problem_id: string }>(`
    insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status)
    values ('POOL-DIAG','R-ORC-1','R-ORC-1:conv1','critical','open')
    returning problem_id;
  `);
  return r.rows[0]!.problem_id;
}

beforeAll(async () => {
  pool = makePool();
}, 60_000);
beforeEach(async () => {
  await resetDb(pool);
});
afterAll(async () => {
  await pool.end();
});

describe("05B EPIC-B1 — runDiagnosis (E2E sequencing, §14 anti-fake, fail-closed)", () => {
  it("anti-fake §14: RESULT columns + Affected are empty BEFORE the orchestrator runs", async () => {
    const problemId = await seedReactive();
    const before = await rows<{ area_type: string | null; issue_tree: unknown; revenue_lost: string | null }>(
      pool,
      `select area_type, issue_tree, revenue_lost from tenant."Diagnosed_Problem" where problem_id=$1`,
      [problemId],
    );
    expect(before[0]?.area_type).toBeNull();
    expect(before[0]?.issue_tree).toBeNull();
    expect(before[0]?.revenue_lost).toBeNull();
    expect(await count(pool, `tenant."Affected" where problem_id='${problemId}'`)).toBe(0);
  });

  it("reactive E2E: classify→issue-tree→silent→impact→route→dossier, every number from SQL", async () => {
    const problemId = await seedReactive();
    const out = await runDiagnosis(problemId, "POOL-DIAG");

    expect(out.areaType).toBe("finance"); // classified from the episode intent (text, §8)
    expect(out.degraded).toBe(false); // confidence ≥ floor
    expect(out.affected).toBe(N_AFFECTED); // PRODUCED by fn_hunt_silent, never seeded (§14)
    expect(out.silent).toBe(SILENT);
    expect(out.silentStatus).toBe("evaluable");
    expect(out.revenueLost).toBe(REVENUE_LOST); // Named_Query sum(net_value failed) over Affected
    expect(out.route).toBe("fix_internal"); // routeStub(finance)
    expect(["now", "queue"]).toContain(out.nowQueue);

    // The producer actually wrote the columns + the Affected set (counts read from the DB).
    const after = await rows<{ area_type: string; issue_tree: { paths: unknown[] }; suggested_route: string; prov: Record<string, string> }>(
      pool,
      `select area_type, issue_tree, suggested_route, provenance_by_field as prov
         from tenant."Diagnosed_Problem" where problem_id=$1`,
      [problemId],
    );
    expect(after[0]?.area_type).toBe("finance");
    expect(after[0]?.issue_tree.paths.length).toBeGreaterThan(0);
    expect(after[0]?.prov.area_type).toBe("[C]"); // classification is [C], never promoted to a fact (§8)
    expect(await count(pool, `tenant."Affected" where problem_id='${problemId}'`)).toBe(N_AFFECTED);

    // BR-B17/B18: the dossier is honestly PARTIAL — f5_how_much gaps because churn_risk is fail-closed
    // NULL (no pre-churn producer) + cost/value are NULL pre-resolution. The gate WORKS (it gates).
    expect(out.dossier.emitted).toBe(false);
    expect(out.dossier.gaps).toContain("f5_how_much");
  });

  it("BR-B3 grounding: a REVIEWED Knowledge_Case for the area is fed to the agent (fetch→pass wiring)", async () => {
    const problemId = await seedReactive();
    // A reviewed prior case (negative polarity): 'balance mismatch' was falsified before ⇒ grounding
    // should hand it to the agent so it ranks that dead branch lower. reviewed=true is the gate (BR-B16).
    await pool.query(`
      insert into tenant."Knowledge_Case"
        (tenant_id, area_type, pattern, outcome, not_resolved_reason, discarded_branches, reviewed)
      values ('POOL-DIAG','finance','late payout pattern','not_resolved','still open',
              '["balance mismatch"]'::jsonb, true);`);

    // Spy provider: records the examples it RECEIVES, returns a valid permutation so the run completes.
    const seen: { classify?: GroundingCase[]; rank?: GroundingCase[] } = {};
    const spy: DiagnosisReasoning = {
      classifyArea: async (i) => {
        seen.classify = i.examples;
        return { areaType: "finance", confidence: 0.9 };
      },
      rankPaths: async (i) => {
        seen.rank = i.examples;
        return i.hypotheses.map((hypothesis, idx) => ({
          path_id: idx + 1,
          hypothesis,
          probability: (i.hypotheses.length - idx) / i.hypotheses.length,
        }));
      },
    };

    await runDiagnosis(problemId, "POOL-DIAG", spy);
    // classify is grounded on tenant-recent reviewed cases; rank is grounded on the SAME area's cases.
    expect(seen.rank?.length).toBeGreaterThan(0);
    expect(seen.rank?.[0]?.pattern).toBe("late payout pattern");
    expect(seen.rank?.[0]?.discardedBranches).toEqual(["balance mismatch"]);
    expect(seen.classify?.some((c) => c.pattern === "late payout pattern")).toBe(true);
  });

  it("BR-B3 fail-closed: a provider rank failure degrades the case to needs_human (not left open)", async () => {
    // The live set-equality guard THROWS when the model invents/drops/duplicates a hypothesis. The
    // orchestrator must translate that into the needs_human degrade (BR-B3) — never leave the case 'open'
    // as if it were never touched. (Codex P1: the guard threw but runDiagnosis didn't catch → stayed open.)
    const problemId = await seedReactive();
    const throwingRank: DiagnosisReasoning = {
      classifyArea: async () => ({ areaType: "finance", confidence: 0.9 }),
      rankPaths: async () => {
        throw new Error("rankPaths: output is not a permutation of the seed hypotheses");
      },
    };
    await expect(runDiagnosis(problemId, "POOL-DIAG", throwingRank)).rejects.toThrow();
    const r = await rows<{ status: string }>(
      pool,
      `select status from tenant."Diagnosed_Problem" where problem_id=$1`,
      [problemId],
    );
    expect(r[0]?.status).toBe("needs_human"); // degraded, not left 'open'
  });

  it("BR-B3 fail-closed: unclassifiable text + no KB ⇒ degrade-to-human (status needs_human)", async () => {
    await pool.query(`
      insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date)
      values ('R-MUTE-1','POOL-DIAG','long_tail','long_tail', date '2026-01-01');
      insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
      -- 'promo' is genuinely unclassifiable: NO diagnosis-type family (finance/product/performance/operations)
      -- matches it. ('menu' now maps to product via 05D F1 menu_quality, so it is no longer a mute example —
      -- the assertion below is unchanged; only the unclassifiable INPUT is updated to a still-unmatched intent.)
      values ('R-MUTE-1:C1','R-MUTE-1:conv1','POOL-DIAG','R-MUTE-1','promo');`);
    const r = await pool.query<{ problem_id: string }>(`
      insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status)
      values ('POOL-DIAG','R-MUTE-1','R-MUTE-1:conv1','low','open') returning problem_id;`);
    const problemId = r.rows[0]!.problem_id;

    const out = await runDiagnosis(problemId, "POOL-DIAG");
    expect(out.areaType).toBe("unclassified");
    expect(out.degraded).toBe(true);
    const st = await rows<{ status: string }>(
      pool,
      `select status from tenant."Diagnosed_Problem" where problem_id=$1`,
      [problemId],
    );
    expect(st[0]?.status).toBe("needs_human"); // never an optimistic default (§7)
  });
});

describe("05D Part A — 2-brain agreement gate (02D + F3): area mismatch ⇒ needs_human", () => {
  // Brain 1 = the deterministic keyword FLOOR (run internally); Brain 2 = the injected lead (the real
  // LLM+RAG in prod). seedReactive's episode intent is 'billing' ⇒ Brain 1 classifies 'finance'. The gate
  // (Leo 2026-06-22) keys on AREA only: a different lead area ⇒ degrade-to-human; a same-area difference
  // (confidence/sub-hypothesis) does NOT. Hermetic: the lead is injected, no key/network.
  const rankStub: DiagnosisReasoning["rankPaths"] = async (i) =>
    i.hypotheses.map((hypothesis, idx) => ({
      path_id: idx + 1,
      hypothesis,
      probability: (i.hypotheses.length - idx) / i.hypotheses.length,
    }));

  it("area DISAGREEMENT (Brain 2 ≠ Brain 1) degrades the case to needs_human", async () => {
    const problemId = await seedReactive();
    const disagreeingLead: DiagnosisReasoning = {
      classifyArea: async () => ({ areaType: "product", confidence: 0.95 }), // ≠ finance ⇒ disagreement
      rankPaths: rankStub,
    };
    const out = await runDiagnosis(problemId, "POOL-DIAG", disagreeingLead);
    expect(out.degraded).toBe(true); // the 2-brain gate tripped
    expect(out.areaType).toBe("product"); // proceeds on the lead's read (surfaced for the Fase-4 console)
    const st = await rows<{ status: string }>(
      pool,
      `select status from tenant."Diagnosed_Problem" where problem_id=$1`,
      [problemId],
    );
    expect(st[0]?.status).toBe("needs_human"); // routed to the human console (§7), never an optimistic default
  });

  it("area AGREEMENT proceeds — same area with a different confidence is NOT a disagreement", async () => {
    const problemId = await seedReactive();
    const agreeingLead: DiagnosisReasoning = {
      classifyArea: async () => ({ areaType: "finance", confidence: 0.99 }), // same area as the floor (finance)
      rankPaths: rankStub,
    };
    const out = await runDiagnosis(problemId, "POOL-DIAG", agreeingLead);
    expect(out.degraded).toBe(false); // agree ⇒ the gate does NOT force a degrade
    expect(out.areaType).toBe("finance");
    const st = await rows<{ status: string }>(
      pool,
      `select status from tenant."Diagnosed_Problem" where problem_id=$1`,
      [problemId],
    );
    expect(st[0]?.status).not.toBe("needs_human");
  });

  it("redacts PII from the transcript before it reaches Brain 2 (Codex P1, §3.7)", async () => {
    // conversation.recv persists RAW turnos ⇒ the transcript can carry PII. It must be redacted before the
    // external LLM send (and the KB embedding). Capture what the brain actually receives and assert no leak.
    await pool.query(`
      insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date)
        values ('R-PII-1','POOL-DIAG','long_tail','long_tail', date '2026-01-01');
      insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent, turnos)
        values ('R-PII-1:C1','R-PII-1:conv1','POOL-DIAG','R-PII-1','billing',
                '[{"role":"restaurant","text":"my payment failed, email me at john.doe@example.com"}]'::jsonb);`);
    const r = await pool.query<{ problem_id: string }>(`
      insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status)
        values ('POOL-DIAG','R-PII-1','R-PII-1:conv1','critical','open') returning problem_id;`);
    const problemId = r.rows[0]!.problem_id;

    let sawText = "";
    const capture: DiagnosisReasoning = {
      classifyArea: async (i) => { sawText = i.text; return { areaType: "finance", confidence: 0.9 }; },
      rankPaths: rankStub,
    };
    await runDiagnosis(problemId, "POOL-DIAG", capture);
    expect(sawText).not.toContain("john.doe@example.com"); // the email never reaches Brain 2
    expect(sawText).toContain("[REDACTED:email]"); // ...but the (redacted) message DID — the brain still reads it
  });

  it("provider CONSTRUCTION failure degrades to needs_human (fail-closed boundary, Codex P1)", async () => {
    const problemId = await seedReactive();
    // A factory that rejects (e.g. a missing prod key throwing in diagnosisReasoning) must be caught INSIDE
    // runDiagnosis ⇒ the problem degrades to needs_human, never left 'open' as if untouched.
    const failingFactory = (): Promise<DiagnosisReasoning> => Promise.reject(new Error("provider init failed (no key)"));
    await expect(runDiagnosis(problemId, "POOL-DIAG", failingFactory)).rejects.toThrow();
    const st = await rows<{ status: string }>(
      pool,
      `select status from tenant."Diagnosed_Problem" where problem_id=$1`,
      [problemId],
    );
    expect(st[0]?.status).toBe("needs_human");
  });
});

describe("05D descriptor-refactor — proactive path is descriptor-authoritative (area + hypotheses)", () => {
  // A proactive/typed problem (no Conversation) has nothing to blind-read, so the REGISTERED type's
  // descriptor drives the pipeline directly — no synthetic-string round-trip through the classifier.
  // This is what makes L3 (a live-taught type) work with zero vocab change, and it never touches the
  // reactive net (the promo/cancellation degrade tests above stay green).
  async function seedProactiveTyped(problemType: string): Promise<string> {
    await pool.query(
      `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date)
       values ('R-PRO-1','POOL-DIAG','long_tail','long_tail', date '2026-01-01')`,
    );
    const r = await pool.query<{ problem_id: string }>(
      `insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, criticality, status, problem_type)
       values ('POOL-DIAG','R-PRO-1','low','open',$1) returning problem_id`,
      [problemType],
    );
    return r.rows[0]!.problem_id;
  }

  it("proactive: descriptor.area_type wins and the blind classifier is NOT consulted (cannot override it)", async () => {
    const problemId = await seedProactiveTyped("connection"); // descriptor area = performance
    let classifyCalled = false;
    let rankHypotheses: string[] | null = null;
    // If consulted, this spy would MIS-classify to finance with sub-floor confidence. The proactive
    // path must ignore it entirely (descriptor authoritative) ⇒ classifyArea never runs.
    const spy: DiagnosisReasoning = {
      classifyArea: async () => {
        classifyCalled = true;
        return { areaType: "finance", confidence: 0.1 };
      },
      rankPaths: async (i) => {
        rankHypotheses = i.hypotheses;
        return i.hypotheses.map((hypothesis, idx) => ({
          path_id: idx + 1,
          hypothesis,
          probability: (i.hypotheses.length - idx) / i.hypotheses.length,
        }));
      },
    };
    const out = await runDiagnosis(problemId, "POOL-DIAG", spy);
    expect(classifyCalled).toBe(false); // no conversation ⇒ never blind-classifies
    expect(out.areaType).toBe("performance"); // descriptor, NOT the spy's 'finance'
    expect(out.degraded).toBe(false); // type is known ⇒ not degraded despite the spy's 0.1 confidence
    expect(out.confidence).toBeNull(); // no classifier inference occurred ⇒ NULL, never a fabricated number (Codex P1)
    expect(rankHypotheses).toEqual(getDescriptor("connection").hypotheses); // descriptor.hypotheses wired (the L3 seed)

    const after = await rows<{
      area_type: string;
      confidence: string | null;
      issue_tree: { paths: { source_consulted: string | null }[] };
      prov: Record<string, string>;
    }>(
      pool,
      `select area_type, confidence, issue_tree, provenance_by_field as prov
         from tenant."Diagnosed_Problem" where problem_id=$1`,
      [problemId],
    );
    expect(after[0]?.area_type).toBe("performance");
    expect(after[0]?.prov.area_type).toBe("[C]"); // a classification marker, never promoted to a fact (§8)
    expect(after[0]?.confidence).toBeNull(); // persisted NULL — honest about the inference that never ran (Codex P1)
    // the consulted source is the descriptor's OWN evidence table, not a regex guess on the hypothesis (Codex P2)
    expect(after[0]?.issue_tree.paths[0]?.source_consulted).toBe(`tenant.${getDescriptor("connection").affected.table}`);
  });
});

describe("05B BR-B12 — proactive monitor (fn_monitor_critical, reverse-cascade)", () => {
  async function seedProcess(tenantId: string): Promise<string> {
    const r = await pool.query<{ process_id: string }>(
      `insert into tenant."Critical_Process"(tenant_id, name, impact_score, fails_silently, truth_source_ref, origin, schedule)
         values ($1,'payments',0.9,true,'tenant.Order','policy','daily') returning process_id`,
      [tenantId],
    );
    return r.rows[0]!.process_id;
  }

  it("catches a non-payment BEFORE a ticket, then the orchestrator runs the cascade", async () => {
    await seedReactive(); // failed-payment population (R-ORC-1 already has an open reactive problem)
    const processId = await seedProcess("POOL-DIAG");

    const monitored = await rows<{ pid: string | null }>(
      pool,
      `select tenant.fn_monitor_critical('POOL-DIAG', $1) as pid`,
      [processId],
    );
    const proactiveProblem = monitored[0]?.pid;
    expect(proactiveProblem).toBeTruthy(); // a problem was opened proactively (conversation_id NULL)

    const st = await rows<{ state: string; conversation_id: string | null }>(
      pool,
      `select cp.state, dp.conversation_id
         from tenant."Critical_Process" cp, tenant."Diagnosed_Problem" dp
        where cp.process_id=$1 and dp.problem_id=$2`,
      [processId, proactiveProblem],
    );
    expect(st[0]?.state).toBe("triggered");
    expect(st[0]?.conversation_id).toBeNull(); // proactive: no episode

    const out = await runDiagnosis(proactiveProblem!, "POOL-DIAG");
    expect(out.affected).toBe(N_AFFECTED); // the cascade zooms out to the whole affected population
    expect(out.silent).toBe(SILENT); // R-ORC-1/2 complained; the rest are the silent ones we surface
  });

  it("BR-B12 fail-closed: source down ⇒ monitoring_degraded, never assume all-good", async () => {
    // POOL-MUTE has a restaurant but NO Order ⇒ the truth source carries no signal.
    await pool.query(`
      insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date)
      values ('R-NOPAY','POOL-MUTE','long_tail','long_tail', date '2026-01-01');`);
    const processId = await seedProcess("POOL-MUTE");
    const monitored = await rows<{ pid: string | null }>(
      pool,
      `select tenant.fn_monitor_critical('POOL-MUTE', $1) as pid`,
      [processId],
    );
    expect(monitored[0]?.pid).toBeNull();
    const st = await rows<{ state: string }>(
      pool,
      `select state from tenant."Critical_Process" where process_id=$1`,
      [processId],
    );
    expect(st[0]?.state).toBe("monitoring_degraded");
  });

  it("BR-B5/B8: a degraded (needs_human) case is NOT re-opened as a duplicate by the next sweep", async () => {
    // one silent failed-payment restaurant whose problem has degraded to needs_human (out of 'open').
    await pool.query(`
      insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date)
        values ('R-DEG-1','POOL-DEG','long_tail','long_tail', date '2026-01-01');
      insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status)
        values ('R-DEG-1', current_date, 100, 20, 'failed');
      insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status)
        values ('POOL-DEG','R-DEG-1', null, 'critical', 'needs_human');`);
    const processId = await seedProcess("POOL-DEG");

    // degraded ⇒ still an ACTIVE case ⇒ the monitor must skip it; nothing else to pick ⇒ null (no dup).
    const swept = await rows<{ pid: string | null }>(
      pool, `select tenant.fn_monitor_critical('POOL-DEG', $1) as pid`, [processId]);
    expect(swept[0]?.pid).toBeNull();
    const after = await rows<{ n: number }>(
      pool,
      `select count(*)::int n from tenant."Diagnosed_Problem" where tenant_id='POOL-DEG' and restaurant_id='R-DEG-1'`,
      [],
    );
    expect(after[0]?.n).toBe(1); // still ONE problem — no duplicate opened (BR-B5/B8)

    // boundary: once fully RESOLVED, a genuine recurrence MAY open a fresh case.
    await pool.query(`update tenant."Diagnosed_Problem" set status='resolved' where tenant_id='POOL-DEG'`);
    const reopened = await rows<{ pid: string | null }>(
      pool, `select tenant.fn_monitor_critical('POOL-DEG', $1) as pid`, [processId]);
    expect(reopened[0]?.pid).toBeTruthy();
  });
});
