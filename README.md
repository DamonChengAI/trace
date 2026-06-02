# Doubao Agent Eval

最高优先级目标见 [AGENTS.md](AGENTS.md)。后续执行先按 AGENTS 的目标和偏航检查判断是否跑偏。

本项目面向豆包 Agent 生产力评测产品岗。评测对象是两个模型在 Claude Code 中完成同一任务的过程差异，最终输出要先讲产品/业务判断，再讲技术证据。

## 当前执行入口

只看这三份：

```text
plans/final-mvp-video-workflow-trace-plan.md
execution/task-prompt.md
execution/dual-model-execution-runbook.md
```

## 目录

```text
plans/      当前最终方案和 trace comparator 设计
execution/  双模型执行 prompt 和 runbook
interview/  面试讲解稿
references/ 背景原则，只作参考
archive/    早期六层方案，只作历史记录
```

## 当前任务

```text
生成一条 30 秒左右视频。
主题：一句需求如何变成一条可交付视频。
```

最终比较聚焦两次 Claude Code 执行 trace，不用视频审美判断：

- 谁读懂项目规则和现有 workflow。
- 谁使用 skill、scripts、hook、subagent 和检查命令。
- 谁能处理失败和复验。
- 谁守住密钥、env、本地路径和素材边界。
- 谁能把 trace 转成业务方能理解的判断。
