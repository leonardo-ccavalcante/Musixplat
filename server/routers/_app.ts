import { router, publicProcedure } from "../_core/trpc.js";
import { handoffRouter } from "./handoff.js";
import { cohortsRouter } from "./cohorts.js";
import { moneyRouter } from "./money.js";
import { sandboxRouter } from "./sandbox.js";
import { conversationRouter } from "./conversation.js";
import { diagnosisRouter } from "./diagnosis.js";
import { nbaRouter } from "./nba.js";
import { cockpitRouter } from "./cockpit.js";
import { artifactRouter } from "./artifact.js";

// Root tRPC router.
export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
  cohorts: cohortsRouter,
  money: moneyRouter,
  handoff: handoffRouter,
  sandbox: sandboxRouter,
  conversation: conversationRouter,
  diagnosis: diagnosisRouter,
  nba: nbaRouter,
  cockpit: cockpitRouter,
  artifact: artifactRouter,
});

export type AppRouter = typeof appRouter;
