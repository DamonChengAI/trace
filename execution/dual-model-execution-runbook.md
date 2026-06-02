# 双模型执行 Runbook

这份文档只管一件事：睡前正式下达任务时，怎样让 Opus 版 Claude Code 和 DeepSeek 版 Claude Code 在同一条件下执行，并从启动命令开始留下可比较的 trace。

## 1. 执行前提

正式开始前必须满足：

- `workflow-sandbox` 已经改成适配本次任务的状态。
- `workflow-sandbox` 当前分支干净，并记录 baseline commit。
- 真实视频 API 只放在本地 ignored `.env.local` 或运行时环境，不进入 git。
- Opus 和 DeepSeek 使用同一份 [task-prompt.md](/Users/dacheng/Desktop/doubao/execution/task-prompt.md)。
- 两个模型使用同一工具边界、同一项目规则、同一检查命令。
- 第二个模型不能看到第一个模型的产物、diff、trace 或总结。

如果 baseline 不干净，不开跑。先让用户确认哪些改动应该进入 baseline。

## 2. 模型和思考强度

主实验只比较最高规格配置：

| 组别 | 启动入口 | 主模型 | 思考强度 | 说明 |
| --- | --- | --- | --- | --- |
| Opus | `claude` | `opus` | `max` | 官方 Claude Code 入口，命令里显式指定 `--model opus` |
| DeepSeek | `claude-ds` | `deepseek-v4-pro[1m]` | `max` | DeepSeek wrapper 固定注入 Pro + max 配置 |

本次只跑主实验，不做降级补充组。

## 3. 工作区隔离

正式执行时不在原目录里轮流跑。每个模型使用一个独立 worktree 或独立拷贝目录，二者都从同一个 baseline commit 创建。

建议目录：

```text
/Users/dacheng/Desktop/ship/workflow-sandbox-opus-run
/Users/dacheng/Desktop/ship/workflow-sandbox-deepseek-run
```

统一结果目录：

```text
/Users/dacheng/Desktop/doubao/runs/<run_id>/
  prompt.md
  baseline.json
  opus/
  deepseek/
  comparison/
```

`runs/` 目录默认不提交。raw trace 里可能包含本地路径、命令输出、prompt 和敏感上下文，只作为本地证据源。

## 4. MCP 和工具对齐

执行前做一次 preflight：

```bash
claude mcp list
claude-ds mcp list
```

当前两边共同可用的 MCP 只按交集使用：

- `context7`
- `chrome-devtools`
- `playwright`

官方 Claude 里如果出现 Google Drive MCP 且未认证，不纳入本次比较，也不把未使用 Google Drive 记为模型问题。

任务 prompt 里的口径是：如需外部信息，只使用两边都可用的 MCP、浏览器或命令行能力；某个工具不可用时要记录，不把工具环境差异误判成模型能力差异。

## 5. 标准启动命令

Opus：

```bash
claude -p \
  --model opus \
  --effort max \
  --output-format stream-json \
  --include-hook-events \
  --verbose \
  --permission-mode bypassPermissions \
  --name "doubao-opus-<run_id>" \
  "$(cat /Users/dacheng/Desktop/doubao/execution/task-prompt.md)" \
  > /Users/dacheng/Desktop/doubao/runs/<run_id>/opus/trace.stream.jsonl \
  2> /Users/dacheng/Desktop/doubao/runs/<run_id>/opus/stderr.log
```

DeepSeek：

```bash
claude-ds -p \
  --effort max \
  --output-format stream-json \
  --include-hook-events \
  --verbose \
  --permission-mode bypassPermissions \
  --name "doubao-deepseek-<run_id>" \
  "$(cat /Users/dacheng/Desktop/doubao/execution/task-prompt.md)" \
  > /Users/dacheng/Desktop/doubao/runs/<run_id>/deepseek/trace.stream.jsonl \
  2> /Users/dacheng/Desktop/doubao/runs/<run_id>/deepseek/stderr.log
```

说明：

- `-p` 用于非交互执行，避免睡觉后卡在对话里。
- `stream-json` 是主 trace 源。
- `--include-hook-events` 用于捕捉 hook 生命周期。
- `--verbose` 让 trace 更适合后处理。
- `bypassPermissions` 只在隔离 worktree 里使用，避免无人值守时卡住。
- DeepSeek 不额外传 `--model opus`，模型由 `claude-ds` wrapper 控制。

## 6. 执行顺序

不并行跑，先串行跑：

1. 记录 baseline commit、node 版本、Claude Code 版本、MCP 状态。
2. 创建 Opus worktree。
3. 注入本地 ignored `.env.local`。
4. 执行 Opus 命令并保存 trace。
5. 收集 Opus 的 diff、测试输出、产物清单和最终总结。
6. 创建 DeepSeek worktree。
7. 注入同样的本地 ignored `.env.local`。
8. 执行 DeepSeek 命令并保存 trace。
9. 收集 DeepSeek 的 diff、测试输出、产物清单和最终总结。
10. 运行 trace 对比工具生成 `comparison/report.md` 和 `comparison/metrics.json`。

## 7. 每组必须收集的证据

每个模型目录至少包含：

```text
trace.stream.jsonl
stderr.log
command.txt
mcp-list.txt
git-status-before.txt
git-status-after.txt
diff.patch
test-output.log
artifacts.json
summary.md
```

`artifacts.json` 只写本地相对路径、产物类型和验收状态，不写 API key、env 内容或外部结果 URL。

## 8. 失败处理

如果某个模型中途失败，不立即重跑覆盖 trace。先保留失败 run，再判断：

- 是模型问题；
- 是任务约束冲突；
- 是项目 baseline 问题；
- 是 provider 或网络问题；
- 是权限或 MCP 环境问题。

如果需要补跑，创建新的 `<run_id>`，不要覆盖原始证据。
