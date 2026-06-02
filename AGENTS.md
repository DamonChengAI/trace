# AGENTS.md

## 最高优先级目标

本项目先按产品评测项目处理：做一个轻量工具，评测 Opus 和 DeepSeek 在同一 Claude Code 视频生成任务里的过程差异，并把 trace 转成面试官能直接理解的产品/业务判断。

面试背景要始终放在第一位：岗位是豆包 Agent 生产力评测产品岗，面试官是产品视角。最终输出要先回答“为什么要评、评出了什么差异、这些差异对 Agent 生产力有什么影响”，再讲具体怎么跑 workflow 和怎么取证。

最高优先级判断顺序：

1. 为什么做：Agent 生产力评测不能只看最终视频，要看过程是否可控、失败能否恢复、安全边界是否守住、人工接管成本多高、结果能不能复用成评测体系。
2. 目标是什么：产出一个最小可运行的 trace 评测工具/流程，用同一任务比较两个模型在 outcome、上下文理解、工具使用、执行质量、风险控制和产品表达上的差异。
3. 怎么做：用 30 秒视频生成 workflow 做受控任务，保留必要 Claude Code 核心能力证据，再用 trace comparator 输出 metrics 和 report。

所有技术细节都服从上面的目标。hook、subagent、scripts、MCP/search、grader 只是取证手段；如果某个设计不能帮助形成产品结论、业务判断或面试讲解，就删掉或降到参考层。

trace comparator 可以优先复用开源工具或现成日志/trace 能力，只做本场景需要的轻量定制：指标抽取、证据整理、报告模板和产品结论。不要从零做通用 trace viewer。

所有后续工作都必须服务这件事：

- 任务要简单好讲：生成 30 秒左右视频，主题是“一句需求如何变成一条可交付视频”。
- workflow 要完整但不扩张：需求、分镜、多张图片、对应音频、拼接成片、失败处理、hook、subagent、安全检查、交付报告。
- trace 要可比较：同一 prompt、同一 baseline、同一工具边界、同一检查命令、隔离执行。
- Claude Code 核心能力要有最小证据：AGENTS、nested rules、skill、scripts、hook、subagent、MCP/search、eval/review、security check、grader。
- 面试表达要低成本：先讲产品目标和业务判断，再讲必要 trace 证据；不讲复杂系统，不讲视频审美。

任何新增内容如果不能帮助“模型差异更清楚、产品结论更可信、面试更好讲”，就不要加。

本目录最终执行只认三份文件：

```text
plans/final-mvp-video-workflow-trace-plan.md
execution/task-prompt.md
execution/dual-model-execution-runbook.md
```

其他文件只作参考，不作为硬约束。特别是 `archive/` 和 `references/` 里的“六层页面”“六层可视化”“多轮实验”“HTML trace viewer”等旧口径，不要带入后续执行。

当前最终方案：

- 不做前端可视化。
- 不做六层页面。
- 生成 30 秒左右视频，主题是“一句需求如何变成一条可交付视频”。
- 任务约束写入 `workflow-sandbox` 的 AGENTS、nested rules、skill、hook、subagent、scripts 和 check。
- 用 Opus 和 DeepSeek 两次执行 trace 比较模型差异。

偏航检查：

- 不把任务改成前端展示项目。
- 不把任务改成视频审美评比。
- 不把任务改成完整视频生产系统。
- 不引入多 provider、多轮实验、复杂 trace viewer 或大规模搜索。
- 不让旧的六层页面方案覆盖当前最简 workflow 方案。

后续如果修改方案，先更新 `plans/final-mvp-video-workflow-trace-plan.md`，再同步 `execution/task-prompt.md` 和 `execution/dual-model-execution-runbook.md`。
