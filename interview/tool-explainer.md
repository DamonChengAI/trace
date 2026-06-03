# Trace 工具说明稿

## 一句话

这是一个为本次面试任务定制的轻量 trace（执行轨迹）评测工具。它让 Opus 和 DeepSeek 在同一个 Claude Code workflow（工作流）里完成同一条视频生成任务，再把两边的执行过程整理成证据、评分和产品结论。

## 准确口径

这两个工具是本项目里从 0 到 1 写的本地脚本，没有 fork 或改造某个开源 trace 工具。

但它也没有从 0 到 1 做完整平台。底层复用了 Claude Code 已经输出的 `stream-json` trace（流式 JSON 执行轨迹）、项目已有的 manifest（产物清单）、检查结果和报告文件。我自己定制的是中间这一层：

```text
证据抽取 -> 评分规则 -> 产品结论 -> 面试展示
```

这个取舍符合本次目标：面试作品重点展示 Agent（智能体）生产力评测思路，通用研发可观测平台只放在参考层。

## 为什么要做这个工具

如果只看最终视频，两个模型都能交付，差异会被抹平。产品评测真正关心的是过程：

- 谁更会读项目规则和 workflow 约束。
- 谁更会复用已有脚本和检查命令。
- 谁的研究证据更容易复查。
- 谁出错更少，失败后恢复成本更低。
- 谁能把结果、风险和下一步讲清楚。

原始 trace 很长，产品面试官不适合逐行读。所以工具的作用是把原始过程压缩成能讲清楚的证据链：

```text
raw trace + artifacts -> metrics -> report -> interview page
```

## 两个工具分别做什么

| 工具 | 角色 | 输入 | 输出 | 作用 |
|---|---|---|---|---|
| `compare-traces.mjs` | 评测器 / 证据抽取器 | 两个模型的 raw trace、stderr、manifest、research notes、检查结果 | `metrics.json`、`report.md` | 负责抽指标、算分、生成结论 |
| `render-interview-html.mjs` | 展示器 / 面试页生成器 | `comparison/metrics.json` | `interview-review.html`、`interview-review.md` | 负责把评测结果讲成产品面试官能读懂的页面 |

## compare-traces.mjs

概述：这是核心工具，负责把两次模型运行从“原始日志”变成“可评分证据”。

它主要做 5 件事：

| 步骤 | 做什么 | 例子 |
|---|---|---|
| 解析 trace | 读取 `trace.stream.jsonl`，解析 Claude Code 的执行事件 | 读了哪些文件、跑了哪些命令、用了哪些工具 |
| 抽取产物 | 读取视频、图片、质量检查、安全检查、研究笔记等 manifest | 视频时长、图片 3/3、security findings |
| 识别风险 | 去重并分类工具错误 | DeepSeek 出现 `video:report` schema（数据结构）错误 |
| 计算评分 | 按 6 个维度打分 | outcome、上下文、能力、执行质量、风险、产品表达 |
| 生成报告 | 输出结构化和人读材料 | `metrics.json`、`report.md` |

它的核心价值是把“我感觉 Opus 更稳”变成可复查证据：

```text
Opus trace 行数 241，readPaths 26，research URL 6，严重错误 0
DeepSeek trace 行数 460，readPaths 68，research URL 0，严重错误 1
```

## render-interview-html.mjs

概述：这是展示工具，负责把 `metrics.json` 翻译成面试作品页面。

它不重新解析 raw trace，也不重新打分。它读取 `comparison/metrics.json`，生成两份材料：

```text
interview-review.html
interview-review.md
```

它主要展示 5 类内容：

| 内容 | 作用 |
|---|---|
| 解决思路 | 说明为什么用 workflow + trace + 工具 |
| 评测证据地图 | 把 workflow 环节、能力覆盖、trace 证据、工具作用和结论串起来 |
| 工具设计 | 解释为什么采用统一环境、证据抽取、6 维评分、结论信源 |
| 评分方法 | 说明每个维度为什么这样定、两个模型为什么得这个分 |
| 结论证据卡 | 每条结论都绑定指标和信源 |

所以它的价值是降低面试官理解成本：不用读原始 trace，也能看懂任务、证据、评分和结论。

## 数据链路

当前结论的生成链路是：

```text
Opus / DeepSeek 原始 trace 和 artifacts
  -> compare-traces.mjs
  -> comparison/metrics.json + comparison/report.md
  -> render-interview-html.mjs
  -> interview-review.html + interview-review.md
```

这里要讲清楚两个点：

- `metrics.json` 是结构化评测结果，是 HTML / MD 的直接数据来源。
- `report.md` 和 `metrics.json` 是同一轮生成的兄弟产物；HTML 的输入是 `metrics.json`。

## 评分维度

工具把 trace 证据映射到 6 个产品评测维度：

| 维度 | 看什么 | 为什么重要 |
|---|---|---|
| Outcome（最终产物） | 视频、图片、检查是否达标 | 没有交付结果，任务就失败 |
| Context（上下文理解） | 是否读规则、skill、research 证据是否完整 | 影响模型能不能按项目约束做事 |
| Claude Code 能力 | 是否使用 rules、skill、scripts、search、hook、subagent、check | 证明任务覆盖 Claude Code 核心能力 |
| 执行质量 | 错误数量、严重错误、恢复过程 | 影响人工接管成本 |
| 风险控制 | 安全检查、来源可复查、provider 边界 | 影响产品可信度和上线风险 |
| 产品表达 | 最终总结是否清楚、是否自相矛盾 | 影响业务方理解和用户信任 |

## 面试时的解释

可以这样说：

```text
这两个工具是为这次评测任务定制的轻量工具，通用 trace 平台只作为参考方向。

第一个工具 compare-traces 负责评测：它从两个模型的 trace 和产物里抽取证据，计算 6 个维度的分数，并生成 metrics 和 report。

第二个工具 render-interview-html 负责讲清楚：它读取 metrics，把复杂 trace 翻译成面试官能看懂的证据地图、评分表和结论证据卡。

我这样设计，是因为产品评测不能只看最终视频。最终视频只能证明任务交付了，trace 才能证明模型怎么交付、哪里出错、是否能恢复、是否值得产品化。
```

## 一句话总结

`compare-traces.mjs` 负责把原始执行过程变成评测数据，`render-interview-html.mjs` 负责把评测数据变成面试官能看懂的作品展示。两个工具共同完成的事，是把 Claude Code trace 从研发日志转成产品评测结论。
