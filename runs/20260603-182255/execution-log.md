# Execution Log: 20260603-182255

## Scope

- One clean Opus vs DeepSeek round only.
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

- Prepared run directories and detached worktrees at 2026-06-03T10:23:30Z.

- Opus started at 2026-06-03T10:23:49Z.

- Opus Claude result: success; wrapper exit-code write recovered from trace at 2026-06-03T10:37:04Z.

- DeepSeek started at 2026-06-03T10:37:16Z.
- DeepSeek exited with code 0 at 2026-06-03T10:47:42Z.

- DeepSeek evidence collected at 2026-06-03T10:49:43Z.

- Opus evidence collected before DeepSeek start; artifacts copied from model worktree.
- compare-traces generated comparison/metrics.json and comparison/report.md at 2026-06-03T11:00:29Z.
- render-interview-html intentionally not run.
