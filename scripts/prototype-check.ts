import { pool, query } from "../server/db/pool.js";
import { appRouter } from "../server/routers/_app.js";
import { stagePayScenario, POOL_PAY, PAY_USER } from "./scenario_pay.js";
import type { Context } from "../server/_core/context.js";

// prototype:check — panel pre-flight smoke. Drives the WHOLE spine at the API level and asserts each step
// produced real state, then checks a fail-closed path. Clear PASS/FAIL lines; exits non-zero on any red so
// it is safe to run right before a demo. Idempotent (re-stages POOL-PAY). Numbers are PRODUCED, never seeded.
function ctx(tenant: string, user: string): Context {
  return { session: { user_id: user, tenant_id: tenant, org_level: "team" }, tenantId: tenant, userId: user };
}

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.warn(`${ok ? "PASS" : "FAIL"} · ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  // 1. DB up + migrations applied (the spine's newest tables exist).
  try {
    await query(`select 1 from gov."Generated_Artifact" limit 1`);
    await query(`select 1 from gov."Artifact_Decision" limit 1`);
    check("db up + 05C migrations applied", true);
  } catch (e) {
    check("db up + 05C migrations applied", false, String(e));
    console.warn("\nprototype:check FAILED — db not ready. Run: pnpm db:start && bash scripts/rebuild_db.sh");
    await pool.end();
    process.exit(1);
  }

  // 2. scenario staged (idempotent, even after a prior decision).
  await stagePayScenario();
  const rest = (await query<{ n: number }>(`select count(*)::int n from tenant."Restaurant" where tenant_id=$1`, [POOL_PAY]))[0]!.n;
  check("scenario staged (47 restaurants, empty board)", rest === 47, `restaurants=${rest}`);

  const caller = appRouter.createCaller(ctx(POOL_PAY, PAY_USER));

  // 3. spine happy path: report → run → COMPLETE dossier → artifact → human gate → 1:10.
  const rep = await caller.diagnosis.reportProblem({
    restaurantId: "R-PAY-001",
    conversationId: "R-PAY-001:conv1",
    criticality: "critical",
  });
  const run = await caller.diagnosis.run({ problemId: rep.problem_id });
  check("diagnosis.run produces the reverse-cascade", run.affected === 47 && run.silent === 35, `affected=${run.affected} silent=${run.silent} €=${run.revenue_lost}`);
  check("dossier COMPLETE (happy path)", run.dossier_emitted === true, run.dossier_emitted ? "" : `gaps=${run.dossier_gaps.join(",")}`);

  const art = await caller.artifact.generate({ problemId: rep.problem_id });
  check("05C artifact generated + persisted (metric-bound)", art.status === "generated", `status=${art.status}`);
  if (art.status === "generated") {
    const dec = await caller.artifact.decide({ artifactId: art.artifact_id, action: "approve" });
    check("human gate: approve writes a 4-eyes trace", Boolean(dec.trace_id) && dec.status === "approved", `status=${dec.status}`);
  }

  const health = await caller.roi.summary();
  check(
    "1:10 team-equivalent capacity DERIVED (non-null after a human touch)",
    health.ratio !== null && health.unitsPerTouch !== null,
    `team_equivalent=${health.ratio}:1 units_per_touch=${health.unitsPerTouch} tickets/day=${health.ticketsPerDay}`,
  );

  const dossier = await caller.diagnosis.getDossier({ problemId: rep.problem_id });
  check("getDossier returns the gate verdict", typeof dossier.emitted === "boolean");

  // 4. fail-closed: a foreign pool cannot run another pool's problem (BR-B6).
  let crossBlocked = false;
  try {
    await appRouter.createCaller(ctx("POOL-OTHER", "U-OTHER")).diagnosis.run({ problemId: rep.problem_id });
  } catch {
    crossBlocked = true;
  }
  check("fail-closed: cross-pool run blocked", crossBlocked);

  // restore the empty board so the operator drives it live (the check leaves no half-state).
  await stagePayScenario();

  console.warn(failures === 0 ? "\nprototype:check GREEN — panel-safe." : `\nprototype:check FAILED — ${failures} check(s) red.`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
