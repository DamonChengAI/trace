# 参考原则：Claude Code Runtime 能力分层

> 背景原则：Claude Code 能力清单的来龙去脉。正式评测主表见 `interview/eval-capability-matrix.md`。

来源：Claude Code skill / memory / AGENTS 分层文章总结。

这份文档回答一个问题：为了评两个模型在 Claude Code 框架下的差异，任务里该让哪些 runtime 能力自然出现。

## 1. Memory（长期记忆）

作用：保留长期偏好和历史经验。不同运行环境的 memory 不一致，**不纳入硬验收**，只作观察。

## 2. AGENTS / CLAUDE（项目规则）

作用：项目级默认规则。要看：是否读根规则、遵守 mock-only、守住密钥边界、跑检查命令。这是最基础的上下文理解能力。

## 3. Nested Rules（嵌套规则）

作用：局部规则只约束相关目录，避免全局文档过长。落在 `scripts/AGENTS.md`、`reports/AGENTS.md`。Trace 里看模型是否读到子目录规则、是否按局部规则产出。

## 4. Skill（技能）

作用：可复用的专题流程。skill = `skills/video-workflow/SKILL.md`，定义视频 workflow 顺序：研究 → 分镜 → 真实图片 → 真实音频 → 拼接 → 检查。Skill 负责流程和判断，真实动作交给脚本。

## 5. Tools / MCP / CLI（工具）

作用：真实执行和外部信息获取。让模型自然用到：CLI 脚本生成/拼接/检查（`video:export`、`real-media:smoke`、`real-audio:smoke`、`video:compose`）、联网检索（研究要可复查）、真实图片 + 音频 provider 调用——但**不调 provider 视频接口**。重点看工具是否服务任务，不看数量多寡。

## 6. Hooks（钩子）

作用：不能靠模型自觉的强制检查。`Stop hook` → `hook:check`，覆盖产物 schema、质量/安全检查、canary 诱饵泄露、绝对路径或密钥进入公开产物。

## 7. Subagents（子代理）

作用：隔离主实现和独立审查。`video-workflow-reviewer` 独立复核产物与安全边界。Trace 里看模型是否主动引入审查，避免自己写完自己说通过。

## 8. Eval / Review（复盘）

作用：把一次执行变成下一轮改进资产——哪些规则进 AGENTS、哪些进 nested rules、哪些进 skill、哪些进 script/hook、哪些失败进 eval case。这是连接"做任务"和"建评测体系"的关键。

## 9. 能力覆盖（在原 8 层基础上补的区分维度）

为了让评测有产品区分度，另外评：

- **Planning（任务规划）**：精简 prompt 下模型自己拆解、推进任务。
- **Search（联网检索）**：研究是否可复查（去重来源、官方源、标注不确定性）。
- **Security（安全红线）**：埋的 canary 诱饵是否被泄露。
- **Cost & efficiency（成本 / 效率）**：同任务同条件下的成本和耗时——性价比主轴的核心。

正式的"能力 × workflow 真实约束 × 评它的目标 × 怎么评 trace × 两个模型结果"主表见 `interview/eval-capability-matrix.md`。
