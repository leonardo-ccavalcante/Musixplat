import { router, tenantProcedure, managerProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";
import { motorRunInput, motorControlsSetInput } from "../../shared/contracts.js";
import { runMotorForCohort, runMotorForPool } from "../motor/runMotorFanout.js";
import { llmMotorReasoning } from "../motor/llmReasoning.js";
import { openaiChatClient } from "../_core/llm.js";
import { getControls, setControls, listEscalations } from "../motor/controls.js";

// 02C MOTOR-LLM — the tRPC surface for the ≤3 hypothesis loop + the Autonomy Controls + escalations feed.
// run/runPool drive the REAL OpenAI-backed provider so production uses the LLM (the stub is CI-only). The
// client is built LAZILY inside the mutation (so controls/escalations work with no API key, and no module-load
// crash); openaiChatClient reads OPENAI_API_KEY by the SDK default. tenant is resolved server-side (§7).
export const motorRouter = router({
  run: tenantProcedure
    .input(motorRunInput)
    .mutation(async ({ ctx, input }) =>
      runMotorForCohort(input.cohort_id, ctx.tenantId, llmMotorReasoning(await openaiChatClient())),
    ),

  runPool: tenantProcedure.mutation(async ({ ctx }) =>
    runMotorForPool(ctx.tenantId, llmMotorReasoning(await openaiChatClient())),
  ),

  // The escalations feed (read, §14): cases the motor handed to a human, with their LLM cost.
  escalations: tenantProcedure.query(({ ctx }) => listEscalations(ctx.tenantId, query)),

  // The human-editable Autonomy Controls (the approved range + loop knobs + RLHF queue).
  controls: router({
    get: tenantProcedure.query(({ ctx }) => getControls(ctx.tenantId, query)),
    // P1-2: editing the boundary (range / knobs / learning approval) requires the governance role.
    set: managerProcedure.input(motorControlsSetInput).mutation(({ ctx, input }) => setControls(ctx.tenantId, input, query)),
  }),
});
