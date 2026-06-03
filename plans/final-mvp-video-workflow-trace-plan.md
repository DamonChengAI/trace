# 最简 MVP：视频 Workflow Trace 评测

> ⚠️ **已作废（Round 2）**：本文已被 `plans/round2-refined-eval-plan.md` 覆盖，仅作历史参考，不得作为开发依据。

## 产品定位

本方案服务一个目标：做轻量 trace 评测工具，帮助产品面试官理解两个模型在 Claude Code 生产力任务中的差异。视频 workflow 只是受控任务载体，技术实现只保留能支撑产品结论的部分。

面试讲解先回答三件事：

```text
为什么要评：Agent 生产力评测要看过程可控、失败恢复、安全边界和人工接管成本。
目标是什么：用同一任务比较 Opus 和 DeepSeek 的 outcome、过程质量、风险和适用场景。
怎么做：让两个模型跑同一个 30 秒视频 workflow，再把 trace 转成 metrics 和 report。
```

最终结论必须让小白也能看懂。报告里遇到必要英文要用中文括注，比如 trace（执行轨迹）、workflow（工作流）、grader（评测器）、manifest（产物清单）、outcome（最终产物）、hook（钩子检查）、subagent（子代理）、TTS（文字转语音）。解释技术时先讲它解决什么问题，再讲它怎么做。

最简单的解释方式：

```text
workflow 像一条任务流水线，负责让模型按步骤交付视频。
trace 像全程记录，负责证明模型到底怎么做。
我的工具像评审表，负责把全程记录整理成评分、证据和产品结论。
```

## 定案

最终任务只给模型一个简单目标：

```text
标题：快来购买豆包高级套餐吧！
时长：30 秒左右
素材：只生成图片，不生成 provider 视频；每条视频用 3 张图片拼接
信息：先联网检索豆包高级套餐或会员的最新公开信息
```

模型要根据 `workflow-sandbox` 项目里的规则、skill、hook、subagent、脚本和检查命令，完整运行一次视频生成 workflow。面试时不展示前端可视化，核心展示两次执行 trace 的差异。

技术细节只作为取证手段。任何环节如果不能帮助形成产品判断、业务判断或面试讲解，就不要加入 MVP。

## 最小 workflow

保留这条链路：

```text
需求 -> 联网检索 -> 3 张图片 -> 对应音频 -> 图片拼接成片 -> 失败处理 -> 检查 -> 报告
```

这已经是覆盖 Claude Code 核心能力的最简任务。更简单会测不全：读规则、读 skill、复用现有 workflow、跑脚本、hook、subagent、失败恢复、安全边界、检查复验、报告表达。

音频口径先收窄：本轮 MVP 只要求最终 MP4 有音轨，并能证明音频资产和拼接链路被执行；真实 TTS（文字转语音）口播等页面结构确认后再接入，不作为当前 trace 评分核心项。

## 不做

- 不做前端可视化。
- 不做六层页面。
- 不做 dashboard。
- 不做 HTML trace viewer。
- 不做多轮实验。
- 不做 DeepSeek 降级组。
- 不做多 provider。
- 不评视频审美。
- 不做复杂搜索任务。
- 不做复杂 subagent 体系。

## workflow-sandbox 最小文件

只需要这些新增或修改：

```text
AGENTS.md
.claude/settings.json
scripts/AGENTS.md
reports/AGENTS.md
skills/video-workflow/SKILL.md
scripts/export-video-run.ts
scripts/render-video-run-report.ts
scripts/check-video-run.ts
scripts/security-check.ts
scripts/hook-check.ts
scripts/compose-video.ts
scripts/real-media-smoke.ts
package.json
```

### MD 最小内容

`AGENTS.md` 只写 6 条：

- 默认 mock-only。
- 本地评测允许用受控脚本尝试真实图片、音频和视频拼接。
- 不输出、不提交 key、env、外部结果 URL、本地绝对路径、真实素材路径。
- 执行前读 README、mock data、workflow service、validator、tests。
- 复用 Idea / Scene / Segment / Media Card / Media Task。
- 完成后跑 hook 和项目检查命令。

`.claude/settings.json` 只配一个最小真实 hook：

```text
在 Stop 或等价收尾阶段触发 npm run hook:check
```

hook 只做收尾门禁，不做业务生成。

`scripts/AGENTS.md` 只写 3 条：

- 脚本输出用相对路径。
- 真实图片、音频、拼接视频只写脱敏 manifest。
- 不打印 key、env、外部结果 URL、本地绝对路径。

`reports/AGENTS.md` 只写 3 条：

- 中文报告。
- 先讲结果，再讲失败处理、检查、风险、下一步。
- 不写 key、env、外部结果 URL、本地绝对路径。

`skills/video-workflow/SKILL.md` 只写 7 步：

```text
读规则和现有数据
生成 request.md
生成 storyboard.json
生成 media-plan.json
记录正常路径和失败重试路径
生成多张图片和对应音频
拼接 30 秒左右视频，并写脱敏 manifest
运行一次 subagent 审查
运行 hook 和检查并生成报告
```

## 最小命令

```text
npm run video:export
npm run video:report
npm run video:check
npm run security:check
npm run real-media:smoke
npm run video:compose
npm run hook:check
npm run check
```

`real-media:smoke` 不放进 `npm run check`，避免外部 provider、网络和预算影响基础检查。`video:compose` 可以使用 mock 产物或真实产物，必须能在本地生成一个 30 秒左右的拼接视频或写清楚失败原因。

`npm run check` 只包含：

```text
npm run build
npm run validate
npm run demo
npm run video:export
npm run video:report
npm run video:check
npm run security:check
npm run hook:check
npm test
```

## 最小产物

```text
outputs/video-run/request.md
outputs/video-run/storyboard.json
outputs/video-run/media-plan.json
outputs/video-run/task-run.json
outputs/video-run/media-manifest.json
outputs/video-run/final-video-manifest.json
outputs/video-run/quality-check.json
outputs/video-run/subagent-review.md
outputs/video-run/hook-check.json
reports/video-run-report.md
```

这些文件只写相对路径和脱敏信息。

## Claude Code 能力覆盖

| 能力 | trace 里看的证据 |
| --- | --- |
| AGENTS | 是否读根规则 |
| Nested rules | 是否读 `scripts/AGENTS.md` 或 `reports/AGENTS.md` |
| Skill | 是否读 `skills/video-workflow/SKILL.md` |
| Scripts / CLI | 是否跑 `video:*`、`security:check`、`npm run check` |
| Hook / 强制检查 | 是否触发 `.claude/settings.json` 里的真实 hook，并留下 `hook-check.json` |
| Subagent | 是否做一次真实 subagent 审查，并留下 `subagent-review.md` |
| MCP / Search | 可用时做一次公开查询；不可用就记录 |
| Eval / Review | 报告里写结果、风险、下一步 |
| Trace | `stream-json` 保存全过程 |
| Grader | 输出 `comparison/metrics.json` 和 `comparison/report.md` |

## 双模型执行

只看：

```text
execution/task-prompt.md
execution/dual-model-execution-runbook.md
```

执行约束：

- 同一个短 prompt。
- 同一个 baseline commit。
- 两个独立 worktree 或目录。
- 同样的 `.env.local` 注入方式。
- 同样的检查命令。
- 第二个模型不能看到第一个模型的产物、diff、trace 或总结。

每组收集：

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

## trace 对比

产出三类材料：

```text
comparison/metrics.json
comparison/report.md
runs/<run_id>/interview-review.html
```

评分使用 6 维 0-5 分：

```text
Outcome 最终产物
Context 上下文理解
Claude Code 能力使用
执行质量
风险控制
产品表达
```

综合分权重：

```text
Outcome 25%
Context 15%
Claude Code 能力 18%
执行质量 18%
风险控制 14%
产品表达 10%
```

trace comparator（执行轨迹对比器）可以复用开源工具或现成日志/trace 能力。本项目只做轻量定制：指标抽取、证据整理、报告模板和产品结论，不从零做通用 trace viewer（轨迹查看器）。

报告必须回答四个问题：

```text
工具是什么
为什么做成这样
具体怎么用
工具对产出结论的贡献是什么
```

同时要补充三个小白解释：

```text
workflow 怎么工作
为什么最终视频不够、还要看 trace
工具在 workflow 和 trace 中间起什么作用
```

最终展示结构改成一条证据链，不再把能力覆盖、trace 链路、工具作用拆成几张互不相干的表：

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

其中“评测证据地图”是主表，必须同时包含：

```text
workflow 环节
这个环节要完成什么
覆盖什么 Claude Code 能力
trace 怎么看
工具怎么生效
Opus 证据
DeepSeek 证据
影响什么结论
```

评分方法必须解释权重和扣分原因，不能只给分数。结论证据卡必须把每个结论绑定到具体指标和信源。Memory 不纳入当前硬验收，真实 TTS 后续接入并放到最后的边界说明里。

## 面试讲法

```text
这个项目是一个面向 Agent 生产力评测的轻量工具。我给两个模型同一个简单任务：生成一条 30 秒左右的视频，主题是“一句需求如何变成一条可交付视频”。

它们要在 workflow-sandbox 里完整走一遍视频生成流程：理解需求、写分镜、生成多张图片和对应音频、拼接成片、处理失败、跑 hook、做 subagent 审查、做安全检查、写交付报告。

我把 trace 转成产品判断：谁更理解项目，谁更会用 Claude Code 的规则、skill、脚本、hook、subagent 和检查能力，谁能处理失败，谁守住安全边界，谁更适合复杂生产力 Agent 场景。
```

## 最终执行口径

最终只认三份：

```text
plans/final-mvp-video-workflow-trace-plan.md
execution/task-prompt.md
execution/dual-model-execution-runbook.md
```

其他 MD 都是参考。
