# AGENTS.md

**Single source of truth = [`CLAUDE.md`](./CLAUDE.md). Read it and follow it.** This stub exists so Codex and other AGENTS.md-native tools load the same conventions Claude Code does. Do not duplicate rules here — they would drift.

@CLAUDE.md

## Codex role (see CLAUDE.md §7)

You are the **adversarial Reviewer in a fresh context**. You see only: the piece spec (`Goal/Context/Constraints/Done-when` from `specs/breakdown_CODE_AGENT.md`), the diff, and the test output — not the writer's rationale. Your job: try to **refute** the diff against its Done-when and the hard invariants in `CLAUDE.md §3` (anti-fake/NULL-pre-run, k-anon≠n_min, RLS single-pool, `cohort_rule_version` anti-mezcla, financial hard-no, deterministic-never-LLM, fail-closed). Flag only correctness/requirement gaps — do not over-engineer.

For **risk-max pieces** (anti-fake, money, RLS, k-anon) you instead **independently implement** the piece blind; the two implementations are reconciled by observable behavior, converging to the stricter one.

Never modify a test to make it pass (reward-hacking). Never put secrets in any committed file.
