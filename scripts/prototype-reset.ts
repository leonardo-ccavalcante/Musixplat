import { pool } from "../server/db/pool.js";
import { stagePayScenario, POOL_PAY, PAY_USER, PAY_N, PAY_SILENT } from "./scenario_pay.js";

// prototype:reset — stage the operable-demo to a clean, repeatable state. Stages POOL-PAY raw INPUTS
// ONLY (no diagnosis, no result columns) so the operator drives the WHOLE spine from the UI ("Run
// flow") — no terminal. Idempotent: OWNS POOL-PAY (clear+rebuild); never touches other pools.
// Panel-safe: run before a demo, run it 10x, identical result.
async function main(): Promise<void> {
  await stagePayScenario();
  console.warn(
    `prototype:reset ok — pool ${POOL_PAY} staged: ${PAY_N} failed-payment restaurants (${PAY_SILENT} silent). ` +
      `Board EMPTY (no diagnosis yet). Dev-login as ${PAY_USER} on /diagnosis → click "Run flow".`,
  );
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
