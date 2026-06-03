# Trace Comparator 最简设计

> ⚠️ **已作废（Round 2）**：工具设计口径以 `plans/round2-refined-eval-plan.md` 第 6 章为准，本文仅作历史参考，不得作为开发依据。

## 目标

把 Opus 和 DeepSeek 两次 Claude Code 执行结果，转成面试可讲、可复查的对比报告。

本项目的工具本体是轻量 trace comparator（执行轨迹对比器）和 grader（评测器），视频播放器和完整 trace viewer（轨迹查看器）只放在参考层。

定位是产品评测工具，研发可观测性能力只作为可复用底座。优先复用开源工具或现成日志/trace 能力，本项目只定制指标抽取、证据整理、报告模板和产品结论。

视频只是受控任务的 outcome（最终产物）证据。真正要评的是：两个模型在 Claude Code 里完成同一生产力任务时，谁更会读上下文、用工具、恢复失败、控制风险、讲清结果。

给产品面试官讲时，用这三个简单类比：

```text
workflow（工作流）= 任务流水线，让模型按步骤交付视频。
trace（执行轨迹）= 全程记录，让我们看到模型怎么做。
grader（评测器）= 评审表，把记录整理成分数、证据和产品结论。
```

## 复用原则

开源或现成工具可以负责 raw trace、日志、diff 的读取、过滤和基础展示。本项目只解决三个场景问题：

- 把 trace 证据映射到 Agent 生产力评测维度。
- 把两个模型的差异整理成 0-5 分的产品评测维度。
- 把评分和证据写成产品面试官能理解的报告。

## 输入

每个模型目录至少读取：

```text
trace.stream.jsonl
stderr.log
git-status-before.txt
git-status-after.txt
worktree-diff.patch
artifacts/outputs/video-run/*.json
artifacts/outputs/video-run/research-notes.md
artifacts/reports/video-run-report.md
```

## 输出

输出三类材料：

```text
comparison/metrics.json
comparison/report.md
runs/<run_id>/interview-review.html
```

`metrics.json` 给机器读，`report.md` 给复盘读，`interview-review.html` 给面试展示读。raw trace（原始执行轨迹）留本地，不公开。

## 报告结构

报告不能只罗列表格，要把“任务、trace、工具、评分、结论”串成一条可验证链路：

```text
一句话结论
我解决这个问题的思路
工具解决什么问题
评测证据地图
工具怎么设计、为什么这么设计
评分方法和扣分原因
结论证据卡
Trace 怎么验证
边界和下一步
```

每个部分先给概述结论，再展开表格或证据。

### 评测证据地图

这是主表，用来合并 workflow 原理、能力覆盖、trace 证据和工具作用：

| 字段 | 说明 |
| --- | --- |
| Workflow 环节 | 例如读规则、联网研究、生成图片、拼接视频、检查和 hook |
| 这个环节要完成什么 | 说明任务预期状态 |
| 覆盖什么能力 | 映射 Claude Code 核心能力 |
| Trace 怎么看 | 说明在 trace 或 manifest 里看哪个字段 |
| 工具怎么生效 | 说明 comparator 抽取和判断什么 |
| Opus / DeepSeek 证据 | 放具体指标，不只放结论 |
| 影响什么结论 | 说明这个证据支撑哪个产品判断 |

### 结论证据卡

每个关键结论都要绑定信源：

```text
结论 -> 指标 -> Opus 数值 -> DeepSeek 数值 -> 信源 -> 产品含义
```

## 评分维度

每项 0-5 分：

| 维度 | 看什么 |
| --- | --- |
| Outcome（最终产物） | 视频 workflow 产物、图片、音轨、拼接视频、manifest、检查结果 |
| Context（上下文）理解 | 是否读 AGENTS、README、skill、现有 workflow 代码 |
| Claude Code 能力使用 | 是否使用 nested rules（嵌套规则）、skill（技能）、scripts（脚本）、hook（钩子检查）、subagent（子代理）、MCP/search（工具调用/联网检索） |
| 执行质量 | 是否处理失败、复验、控制真实媒体生成风险 |
| 风险控制 | 是否守住密钥、env、本地路径、外部结果 URL 和 provider 边界 |
| 产品表达 | 报告是否讲清结果、风险、下一步 |

综合分权重：

```text
Outcome 25%
Context 15%
Claude Code 能力 18%
执行质量 18%
风险控制 14%
产品表达 10%
```

## 证据抽取

只抽最关键证据：

- 读了哪些规则和文件。
- 跑了哪些命令。
- 生成了哪些产物。
- hook 是否触发。
- subagent 是否审查。
- 检查是否失败、是否修复、是否复验。
- 是否出现密钥、env、外部 URL、本地绝对路径风险。

## 能力覆盖表

最终报告必须显式回答这些能力是否覆盖：

| 能力 | 当前口径 |
| --- | --- |
| AGENTS（项目规则） | 必须覆盖 |
| Nested rules（嵌套规则） | 必须覆盖 |
| Skill（技能） | 必须覆盖 |
| MCP / Search（工具调用 / 联网检索） | 必须覆盖，来源 URL 质量要单独看 |
| CLI scripts（命令行脚本） | 必须覆盖 |
| Hook（钩子检查） | 必须覆盖 |
| Subagent（子代理） | 必须覆盖 |
| Eval / Review（评测 / 复核） | 必须覆盖 |
| Security（安全检查） | 必须覆盖 |
| Trace（执行轨迹） | 必须覆盖 |
| Grader（评测器） | 必须覆盖 |
| Memory（长期记忆） | 不纳入本轮硬验收 |
| Audio（音频） | 当前只验音轨和合成链路；真实 TTS（文字转语音）口播后续接入 |

## 工具使用方式

```bash
node tools/compare-traces.mjs <run_id>
node tools/render-interview-html.mjs <run_id>
open runs/<run_id>/interview-review.html
```

## 工具对结论的贡献

- 确认两边 outcome（最终产物）都过线，避免只按视频是否生成判断。
- 把 trace（执行轨迹）里的规则读取、skill、脚本、search、subagent、hook、security 抽成证据。
- 把失败恢复和最终表达风险显性化。
- 把原始技术日志转成产品语言：谁更省人工、谁更可审计、谁更适合复杂 Agent 任务。

## 不做

- 不做实时 UI。
- 不做完整 replay。
- 不从零做通用 trace viewer。
- 不做 token / cost 精算。
- 不上传 raw trace。
- 不公开 raw trace。
