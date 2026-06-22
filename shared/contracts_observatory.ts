import { z } from "zod";

// Observatory — read-only contracts over EXISTING produced tables. Nothing here is computed; every
// RESULT field is passed through as-stored and may be NULL pre-run (§14). provenanceByField is the raw
// per-field tag map ([I]/[V]/[C]); the UI gates "green = pass" on provenanceByField.status == '[V]'.
export const AUTONOMY_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export const EVAL_STATUSES = ["red", "green"] as const;

const provMap = z.record(z.string()); // { released_evals: '[I]', status: '[I]', ... }

// One eval cell (the AI's autonomy "grade" per cohort × intent × golden-set version). version is the
// golden-set version (identity, e.g. 'gs-1'), NOT cohort_rule_version. Eval_Cell has NO timestamp ⇒ no
// freshness field here (showing one would fabricate it).
export const observatoryEvalCell = z.object({
  cohortId: z.string(),
  intent: z.string(),
  version: z.string(),
  releasedEvals: z.enum(AUTONOMY_LEVELS).nullable(),
  status: z.enum(EVAL_STATUSES).nullable(),
  nCohortXIntent: z.number().nullable(),
  kappa: z.number().nullable(),
  redteamIndependenceFlag: z.boolean().nullable(),
  redteamJudgeVsHumanResult: z.string().nullable(),
  provenanceByField: provMap,
  cuisine: z.string().nullable(),
  zone: z.string().nullable(),
  tierBase: z.string().nullable(),
});
export type ObservatoryEvalCell = z.infer<typeof observatoryEvalCell>;

// One learned case. outcome is a RESULT [V]; narratives are [C]; reviewed is the human-vetting gate
// (there is NO human_authored / verification_status column). probability/similarLinks are always NULL
// for motor-written cases today.
export const observatoryLearningCase = z.object({
  kbCaseId: z.string(),
  areaType: z.string(),
  pattern: z.string().nullable(),
  outcome: z.string().nullable(),
  resolution: z.string().nullable(),
  notResolvedReason: z.string().nullable(),
  discardedBranches: z.unknown(),
  probability: z.number().nullable(),
  reviewed: z.boolean(),
  provenanceByField: provMap,
  createdAt: z.string(),
});
export type ObservatoryLearningCase = z.infer<typeof observatoryLearningCase>;

export const learningCasesInput = z.object({
  areaType: z.string().min(1).optional(),
  outcome: z.enum(["resolved", "not_resolved", "escalated"]).optional(),
});

// One auto-origin governance trace (what the AI did alone + its gates). gateResult/timeToSignatureSec/
// rubberStampFlag are RESULT, NULL pre-run; independenceGuaranteed is a generated column (trustworthy).
export const observatoryTrace = z.object({
  traceId: z.string(),
  action: z.string(),
  effectiveLevelApplied: z.enum(AUTONOMY_LEVELS).nullable(),
  escalationAxis: z.string().nullable(),
  proposerId: z.string(),
  confirmerId: z.string().nullable(),
  independenceGuaranteed: z.boolean().nullable(),
  gateResult: z.unknown().nullable(),
  timeToSignatureSec: z.number().nullable(),
  rubberStampFlag: z.boolean().nullable(),
  ts: z.string(),
});
export type ObservatoryTrace = z.infer<typeof observatoryTrace>;
