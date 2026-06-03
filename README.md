# Doubao Agent Eval

最高优先级目标见 [AGENTS.md](AGENTS.md)。后续执行先按 AGENTS 的目标和偏航检查判断是否跑偏。

本项目面向豆包 Agent 生产力评测产品岗。评测对象是两个模型在 Claude Code 中完成同一任务的过程差异，最终输出要先讲产品/业务判断，再讲技术证据。

## 当前执行入口

只看这三份：

```text
plans/round2-refined-eval-plan.md
execution/task-prompt.md
execution/dual-model-execution-runbook.md
```

## 目录

```text
plans/      当前权威方案：round2-refined-eval-plan.md（其余为历史作废）
execution/  双模型执行 prompt 和 runbook
interview/  面试讲解稿
references/ 背景原则，只作参考
```

## 当前任务

```text
生成一条 30 秒左右视频。
标题：快来购买豆包高级套餐吧！
要求：先联网检索最新公开信息；只生成图片，不生成 provider 视频；每条视频用 3 张图片拼接。
```

最终比较聚焦 Claude Code 执行 trace（每个模型各跑两次，验证差异是否稳定），不用视频审美判断：

- 谁读懂项目规则和现有 workflow。
- 谁使用 skill、scripts、hook、subagent 和检查命令。
- 谁能处理失败和复验。
- 谁守住密钥、env、本地路径和素材边界。
- 谁能把 trace 转成业务方能理解的判断。

## 当前工具口径

后续讲解按这个简单口径：

```text
workflow（工作流）：任务流水线，让模型按步骤生成视频。
trace（执行轨迹）：全程记录，让我们看到模型怎么完成任务。
grader（评测器）：我的工具，把记录整理成评分、证据和产品结论。
```

最终材料必须让产品面试官和非研发同学也能看懂。必要英文要加中文括注，比如 trace（执行轨迹）、workflow（工作流）、outcome（最终产物）、manifest（产物清单）、hook（钩子检查）、subagent（子代理）、grader（评测器）、TTS（文字转语音）。

当前音频已升级为接真实 TTS（文字转语音，带 mock 兜底、失败不阻断），作为“能力覆盖”纳入两个模型的对比；定位是“多一类真实生成链路”，不是“让视频更完整”。
