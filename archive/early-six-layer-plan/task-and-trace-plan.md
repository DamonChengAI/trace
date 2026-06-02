# Claude Code 双模型 Agent Eval 主方案

> 当前最终执行口径见 [final-mvp-video-workflow-trace-plan.md](final-mvp-video-workflow-trace-plan.md)。本文保留为早期方案参考，不再作为硬约束。

## 1. 核心目标

这次作业的核心目标是：评测 **Opus 和 DeepSeek 在同一个 Claude Code 框架下完成复杂生产力任务的效果差异**。

六层工作流页面、真实视频样例、storyboard 和报告都是任务产物。最终面试要呈现的是：两个模型在相同 harness、相同项目、相同任务、相同工具权限下，谁更能理解上下文、遵守规则、调用工具、处理失败、完成验证，并把结果讲成产品价值。

## 2. 最终要呈现什么

最终材料分成两组。

第一组是任务结果，用来证明任务真实完成：

- 六层工作流页面：展示用户目标、内容结构、素材需求、生成任务、质量检查、交付复盘。
- 真实视频样例：证明工作流能走到可播放结果。
- storyboard 预览：解释视频生成前后的结构、状态和失败兜底。
- 六层 Markdown 报告：说明每层当前状态、风险、下一步动作和复盘经验。

第二组是评测结果，用来说明两个模型差异：

- Opus vs DeepSeek 对比报告。
- trace 证据摘要：关键读取、修改、命令、失败、修复、验证和总结。
- Claude Code 能力覆盖表：AGENTS、nested rules、skill、scripts、hook、subagent、MCP、eval/review。
- 产品结论：哪个模型在这个任务里更适合复杂 Agent 工作流，风险点是什么，后续怎么改 prompt / harness / 项目规则。

## 3. 本次 Eval 结构

本次评测按 agent eval 的基本对象组织。

| 对象 | 本次定义 |
| --- | --- |
| Task | 把 AI 视频生成工作流做成六层可视化全景，并生成真实视频样例、storyboard 和六层报告 |
| Trial | Opus 执行一次，DeepSeek 执行一次；如果时间允许，每个模型可重复一次 |
| Trace / Transcript | Claude Code 执行全过程，包括读文件、工具调用、编辑、报错、测试、总结 |
| Outcome | 最终项目状态、页面、视频样例、storyboard、报告、测试结果 |
| Grader | 确定性检查 + trace 行为检查 + 人工产品判断 |
| Harness | Claude Code + `workflow-sandbox` + 同一任务 prompt + 同一工具权限 + 同一初始 commit |

如果只各跑一次，报告里要说明这是 controlled case study，不做统计显著性结论。

## 4. 统一任务

任务名称：

```text
把 AI 视频生成工作流做成六层可视化全景，并生成一条真实视频样例、一条 storyboard 预览和六层复盘报告。
```

固定六层：

1. 用户目标层：用户要做什么视频，面向谁，什么结果算好。
2. 内容结构层：选题如何拆成场景、分段、旁白、字幕和画面。
3. 素材需求层：每段需要什么图片、视频、音频、参考图和风格约束。
4. 生成任务层：哪些任务待生成、生成中、完成、失败或需要重试。
5. 质量检查层：哪些信息缺失、哪些约束不满足、哪些地方需要人工确认。
6. 交付复盘层：最终预览、剩余问题、可复用经验和下一轮优化建议。

## 5. Grader 和差异维度

评测不按固定工具调用顺序死扣。重点看 outcome 是否达标，以及 trace 里是否有关键行为证据。

### 确定性检查

- 六层页面是否存在。
- 六层 JSON / Markdown 是否生成。
- 真实视频样例是否生成并可预览。
- storyboard 是否能解释链路结构。
- 正常样例和有问题样例是否都存在。
- 有问题样例是否进入质量检查层。
- 项目检查命令是否通过。
- 输出、报告、diff 和 trace 摘要里是否没有密钥值、env 文件内容、真实素材路径和本地绝对路径。

### Trace 行为检查

| 维度 | 要看的行为 | 说明什么 |
| --- | --- | --- |
| 上下文读取 | 是否读 README、AGENTS、局部规则、现有代码 | 能否理解工作边界 |
| 工作流理解 | 是否复用 Idea / Scene / Segment / Media Card / Media Task | 能否读懂已有产品资产 |
| 规则分层 | 是否使用根规则、路径规则和 skill | 能否按 Claude Code runtime 分层工作 |
| 工具使用 | 是否调用脚本、测试、MCP 搜索、命令行验证 | 能否把真实动作工具化 |
| Hook / 强制检查 | 是否触发或等价执行强制检查 | 能否把关键约束变成硬门槛 |
| Subagent 审查 | 是否有独立审查结果 | 能否隔离验证和主实现上下文 |
| 失败恢复 | 报错后是否定位、修复、复验 | 是否具备稳定交付能力 |
| 安全边界 | 是否避免未受控 provider 调用和密钥泄露 | 是否适合企业权限场景 |
| 结果表达 | 最终总结是否讲清六层产品价值 | 是否适合产品岗和业务方理解 |

### 人工产品判断

- 六层图是否能让非技术面试官快速看懂。
- 真实视频样例是否增强可信度。
- 报告是否能解释每层状态、风险和下一步。
- 对比报告是否围绕两个模型差异，不跑成单项目复盘。

## 6. 项目准备

`workflow-sandbox` 需要提前具备能让 trace 暴露差异的能力层，详细见 [02-workflow-sandbox-readiness.md](/Users/dacheng/Desktop/doubao/02-workflow-sandbox-readiness.md)。

主方案里只保留准备方向：

- 根 AGENTS：高频默认规则。
- nested rules：页面、报告、脚本、真实生成、测试的局部规则。
- skill：六层工作流整理流程。
- scripts / CLI：六层 JSON、Markdown、检查、真实视频 demo。
- hook 或等价强制检查：防止缺层、泄密、未验证。
- subagent：独立审查产品可读性、安全边界和报告质量。
- MCP / 联网搜索：用于生成公开、虚构但合理的脚本背景。
- eval case：正常样例和有问题样例。

## 7. 双模型执行方式

两个模型使用同一份任务 prompt，同一个起始 commit，同样的项目规则和工具权限。

Opus 版 Claude Code 使用官方入口 `claude`，主对比也使用最高规格：模型显式指定为 `opus`，effort level 为 `max`。

本次 DeepSeek 版 Claude Code 作为独立入口执行：

- 官方 Claude 继续使用 `claude`，DeepSeek 版使用 `claude-ds`，两个会话分开跑。
- DeepSeek 主对比先使用 Pro + max：主模型为 `deepseek-v4-pro[1m]`，effort level 为 `max`。
- DeepSeek 的 subagent 默认走 `deepseek-v4-flash`，用于轻量审查和辅助任务。
- DeepSeek API key 存在 macOS Keychain，不写入项目、不写入 `~/.claude`、不进入 trace 或报告。
- 面试主实验先比较 Opus 和 DeepSeek Pro + max。如果差异不明显，再追加一轮 DeepSeek 降级模型作为补充实验，用来观察能力边界。

正式执行命令、worktree 隔离、MCP 对齐、trace 保存和验收收集见 [dual-model-execution-runbook.md](/Users/dacheng/Desktop/doubao/execution/dual-model-execution-runbook.md)。两个模型共用的任务指令见 [task-prompt.md](/Users/dacheng/Desktop/doubao/execution/task-prompt.md)。

执行顺序：

1. 准备 `workflow-sandbox` 的能力层和样例。
2. 记录初始 commit。
3. 用 Opus 驱动 Claude Code 执行任务，保存 trace、diff、测试输出、页面截图、视频样例和报告。
4. 回到同一个起始 commit。
5. 用 DeepSeek 驱动 Claude Code 执行同一任务，保存同样材料。
6. 用 trace 分析工具生成对比报告。

不要让第二个模型看到第一个模型的结果，也不要在同一个 Claude Code 会话里混用两个供应商。

## 8. Trace 对比报告结构

最终报告按这几块写：

1. 评测结论：一句话说明两个模型在 Claude Code 框架下的主要差异。
2. Outcome 对比：页面、真实视频、storyboard、报告、测试是否完成。
3. 过程对比：读规则、读代码、工具使用、失败恢复、验证习惯。
4. Claude Code 能力覆盖：AGENTS、nested rules、skill、scripts、hook、subagent、MCP、eval/review。
5. 风险对比：越界、泄密风险、未验证、重写已有结构、报告偏技术等问题。
6. 产品判断：哪个模型更适合复杂生产力 Agent 任务，适合什么场景，需要什么 harness 补强。
7. 证据附录：关键 trace 片段、命令结果、文件 diff、最终产物链接。

trace 对比工具的设计、现成工具取舍和可视化方案见 [07-trace-comparator-tool-design.md](/Users/dacheng/Desktop/doubao/07-trace-comparator-tool-design.md)。

## 9. 真实视频策略

本次任务需要生成一条真实视频样例。mock storyboard 仍然保留，用来解释工作流结构和在 provider 失败时做兜底展示。

真实视频的作用是增强现场可信度：面试官能看到这套工作流最终确实能走到可播放结果。评测主判断仍然放在 Claude Code 对复杂工作流的理解、执行、验证和复盘能力上，视频审美效果只作为展示素材，不作为两个模型优劣的核心依据。

真实 provider 调用必须遵守安全边界：

- 不把 API key 写进代码、Markdown、trace 报告或 git commit。
- 不把原项目的 `.env`、密钥文件或真实配置复制进公开仓库。
- 只允许使用未提交的 `.env.local`、运行时环境变量或本机 secret 配置。
- 文档和 trace 只能记录变量名、provider 名、调用状态和生成结果路径，不能记录密钥值。
- 如果需要复用 `youtube_long` 的 provider 配置，只能复用变量命名、调用口径和适配方式；密钥值由用户在本机环境中手动配置，或由执行环境临时注入。
- 真实生成失败时，要保留失败原因、重试动作和 mock storyboard 兜底结果。
