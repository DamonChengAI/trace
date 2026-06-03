# 参考原则：Agent Eval 怎么设计

> 背景原则：方法论出处。正式方案见 `plans/round2-refined-eval-plan.md`，执行规范见 `execution/rerun-contract.md`。

来源：[Anthropic, Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

这份文档回答一个问题：怎样把"两个模型驱动 Claude Code 做同一任务"设计成一个可解释的 agent eval。

## 1. 先定义评测对象

- **Task**：同一个视频生成 workflow（受控任务载体，不评视频审美）。
- **Trial**：Opus 和 DeepSeek 各跑一次为一轮；两轮用来看关键差异是否复现（稳定性），不是为算方差。
- **Trace**：Claude Code 全部执行过程（stream-json）。
- **Outcome**：最终可验收产物（视频、真实图片/音频、检查结果）。
- **Grader**：检查 outcome 和 trace 的评分逻辑（本项目 = 纯规则工具 `compare-traces.mjs`，零 LLM）。
- **Harness**：Claude Code、workflow-sandbox、prompt、工具权限、初始环境。

评测对象是模型在同一 harness 下的表现，避免凭感觉比较两段输出。

## 2. 先看 Outcome，再读 Trace

outcome 必须先能验收：最终视频生成、3 张真实图片、真实音频、不调 provider 视频、检查门禁通过。
trace 用来解释原因：为什么成功 / 失败、失败在哪一步、有没有自己修复、有没有走错路径。

## 3. Grader 三类组合（对应作品的评测维度）

- **确定性检查**：文件、脚本、检查门禁、安全扫描、canary 诱饵。
- **Trace 行为检查**：是否读规则、用工具、调 skill、触发 hook、处理失败、规划任务。
- **人工产品判断**：作品能否让产品面试官快速看懂、结论能否落到选型决策。

既有可复验结果，也保留产品判断空间。正式落地见 `interview/eval-capability-matrix.md` 的 6 类数据。

## 4. 不按固定路径死扣

不要求模型按固定顺序调工具（本评测用精简 prompt、不给步骤，正是为此）。更稳的判断：outcome 是否达标、关键能力是否有证据、失败是否被发现并修复、安全边界是否守住、结果能否产品化解释。

## 5. 环境要稳定（公平性）

同 baseline commit、同 prompt、同工具权限、同 env 注入方式、同检查命令、隔离执行；后跑的看不到先跑的产物。
另外：跑前用 `check-sandbox-baseline.mjs` 校验 worktree 不含评测文件，防被测模型偷看评分标准（泄题）。

## 6. 任务要明确——但锁标准、不锁路径

任务含糊会让"模型失败"其实是"任务设计失败"。本评测口径：锁**验收标准**（标题 / 时长、只用 3 张真实图片不调 provider 视频、研究可复查、脱敏、检查门禁、真实媒体重试上限），不锁**实现路径**（先做什么、用哪个工具，交给模型自己判断）。

## 7. 报告不要只给分，要解释差异原因

对比报告要说清差异背后是：没读规则 / 读了没执行 / 工具使用失败 / 检查暴露问题 / 任务约束不清 / provider 干扰 / 还是结果达标但产品表达不够好。这是面试里最有价值的部分。

## 8. 评测口径（一句话）

用可验收 outcome 证明任务完成，用 trace 解释模型差异，用产品判断说明这些差异对生产力 Agent 的真实影响（主轴：质量 vs 性价比的选型权衡）。
