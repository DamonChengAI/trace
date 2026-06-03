# 双模型执行 Runbook（Round 2：跑两轮 / 各 2 次）

> 总方案见 `plans/round2-refined-eval-plan.md`。本文只管一件事：怎样让 Opus 版和 DeepSeek 版 Claude Code 在同一条件下，用**精简 prompt**各执行**两次**，并从启动命令开始留下可比较的 trace（执行轨迹）。
>
> 与 v1 的关键差异：① 用精简 `execution/task-prompt.md`；② 每个模型跑 2 次（共 4 次执行，分装在 2 个 run_id 下）；③ sandbox baseline 必须已包含 Round 2 的改动（schema 显式化、真实 TTS 音频、安全陷阱）。

## 1. 执行前提

正式开始前必须满足：

- `workflow-sandbox` 已完成 Round 2 改动（见总方案 T2–T5：产物 schema 显式化、"研究可复查"标准、真实 TTS 音频带 mock 兜底、1 个对称安全陷阱），并 **commit 为本轮 baseline**。4 次执行全部从这个 baseline 创建。
- baseline 分支干净，记录 baseline commit。
- 真实图片 / 音频 API 只放在本地 ignored `.env.local` 或运行时环境，不进入 git。
- 两个模型、两次执行都用同一份精简 [task-prompt.md](/Users/dacheng/Desktop/doubao/execution/task-prompt.md)。
- 同一工具边界、同一项目规则、同一检查命令。
- 后一次 / 后一个模型不能看到前面的产物、diff、trace 或总结。

如果 baseline 不干净，不开跑。先确认哪些改动应进入 baseline。

## 2. 模型、思考强度与重复次数

主实验只比较最高规格配置，每个模型跑 2 次：

| 组别 | 启动入口 | 主模型 | 思考强度 | 次数 | 说明 |
| --- | --- | --- | --- | --- | --- |
| Opus | `claude` | `opus` | `max` | 2 | 官方入口，命令里显式 `--model opus` |
| DeepSeek | `claude-ds` | `deepseek-v4-pro[1m]` | `max` | 2 | DeepSeek wrapper 固定注入 Pro + max |

不做降级补充组。**跑 2 次的目的是验证关键差异是否复现（稳定性），不是为算方差。**

## 3. run_id 编排（重要，决定目录结构和后续对比）

- 跑**两轮**，每轮是一次完整的 Opus vs DeepSeek 对比，各占一个 run_id：
  - 第一轮 → `runs/<run_id_1>/{opus, deepseek, comparison}`
  - 第二轮 → `runs/<run_id_2>/{opus, deepseek, comparison}`
- 每个 run_id 内部沿用现有结构（`prompt.md`、`baseline.json`、`opus/`、`deepseek/`、`comparison/`）。
- 稳定性对照（总方案 6.2）= 跨 `run_id_1` 和 `run_id_2` 聚合，回答"核心差异两轮是否都复现"。
- `runs/` 默认不提交。raw trace 含本地路径和敏感上下文，只作本地证据源。

## 4. 工作区隔离

每次执行使用独立 worktree（工作目录）或独立拷贝，全部从同一 baseline commit 创建。建议命名带模型与轮次，例如：

```text
/Users/dacheng/Desktop/ship/workflow-sandbox-opus-run-1
/Users/dacheng/Desktop/ship/workflow-sandbox-opus-run-2
/Users/dacheng/Desktop/ship/workflow-sandbox-deepseek-run-1
/Users/dacheng/Desktop/ship/workflow-sandbox-deepseek-run-2
```

## 5. MCP 和工具对齐

执行前做一次 preflight：

```bash
claude mcp list
claude-ds mcp list
```

只按两边共同可用的 MCP 交集使用（当前：`context7`、`chrome-devtools`、`playwright`）。某工具不可用时记录，不把工具环境差异误判成模型能力差异。未认证的 MCP（如未登录的 Google Drive）不纳入比较。

## 6. 标准启动命令

每次执行把 `<run_id>` 替换为当轮 run_id。Opus：

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

说明：`-p` 非交互执行；`stream-json` 是主 trace 源；`--include-hook-events` 捕捉 hook（钩子检查）生命周期；`bypassPermissions` 仅在隔离 worktree 里用；DeepSeek 模型由 `claude-ds` wrapper 控制，不额外传 `--model`。

## 7. 执行顺序（4 次串行，不并行）

1. 记录 baseline commit、node 版本、Claude Code 版本、MCP 状态。
2. 【第一轮】创建 Opus worktree → 注入 `.env.local` → 跑 Opus → 收集证据。
3. 【第一轮】创建 DeepSeek worktree → 注入 `.env.local` → 跑 DeepSeek → 收集证据。
4. 跑 `node tools/compare-traces.mjs <run_id_1>` 生成第一轮对比。
5. 【第二轮】重复 2–4，使用 `<run_id_2>`（全部从同一 baseline 重新创建 worktree）。
6. 跑稳定性聚合，生成跨两轮的稳定性对照（总方案 6.2）。
7. 跑 `node tools/render-interview-html.mjs` 生成面试作品页。

## 8. 每次执行必须收集的证据

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

`artifacts.json` 只写本地相对路径、产物类型和验收状态，不写 API key、env 内容或外部结果 URL。**本轮额外关注**：音频产物状态（真实 TTS 成功 / 降级 mock）、安全陷阱是否被守住（有无把诱饵敏感值写进产物）。

## 9. 失败处理

某次执行中途失败，不立即重跑覆盖 trace。先保留失败 run，判断是：模型问题 / 任务约束冲突 / baseline 问题 / provider 或网络问题 / 权限或 MCP 环境问题。

**音频特别说明**：真实 TTS 失败时，workflow 本应自动降级到占位音轨并继续（见总方案 5.3）。若因音频导致整次 run 中断，属于 sandbox 兜底缺陷，应修复 sandbox 兜底后重跑，**不要**记为模型能力问题。

如需补跑，创建新的 `<run_id>`，不覆盖原始证据。
