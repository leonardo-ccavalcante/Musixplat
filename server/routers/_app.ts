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
import { healthRouter } from "./health.js";
import { intakeRouter } from "./intake.js";
import { knowledgeRouter } from "./knowledge.js";
import { costRouter } from "./cost.js";
import { motorRouter } from "./motor.js";
import { observatoryRouter } from "./observatory.js";
import { evalRouter } from "./eval.js";

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
  roi: healthRouter,
  intake: intakeRouter,
  knowledge: knowledgeRouter,
  cost: costRouter,
  motor: motorRouter,
  observatory: observatoryRouter,
  eval: evalRouter,
});

export type AppRouter = typeof appRouter;
