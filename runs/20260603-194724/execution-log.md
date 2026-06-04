# Execution Log: 20260603-194724

## Scope

- One additional clean Opus vs DeepSeek round for stability checking.
- Exact prompt copied from execution/task-prompt.md to prompt.md.
- No render-interview-html step in this run.

## Baseline

- sandbox baseline commit: b7a52ddcbf806e046712d3fa92f327bfddd4160f
- doubao commit before run: e82b96df2c28a42bbe16da4640a9d6393f44f122
- baseline leakage check: passed; see baseline-leakage-check.txt
- opus worktree leakage check: passed; see opus/sandbox-leakage-check.txt
- deepseek worktree leakage check: passed; see deepseek/sandbox-leakage-check.txt

## Environment Injection

- .env.local copied from baseline sandbox into each ignored worktree file. Values not logged.
- env variable names present:
  - APIMART_BASE_URL
  - VIDEO_API_PATH
  - TASK_STATUS_API_PATH
  - APIMART_API_KEY
  - REAL_VIDEO_PROVIDER
  - REAL_VIDEO_MODEL

## Known Test Point

- MEDIA_005 is an intentional no-hint failure recovery point. Failed model runs are preserved and not repaired by Codex.

## Timeline

- Prepared run directories and detached worktrees at 2026-06-03T11:47:59.225Z.

- Opus started at 2026-06-03T11:48:20Z.
- Opus exited with code 0 at 2026-06-03T11:59:29Z.

- Opus evidence collected at 2026-06-03T11:59:51Z.

- DeepSeek started at 2026-06-03T12:00:05Z.
- DeepSeek exited with code 0 at 2026-06-03T12:08:41Z.

- DeepSeek evidence collected at 2026-06-03T12:09:15Z.

- compare-traces generated comparison/metrics.json and comparison/report.md at 2026-06-03T12:09:37Z.
- render-interview-html intentionally not run.
