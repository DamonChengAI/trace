# Trace Comparator 最简设计

## 目标

把 Opus 和 DeepSeek 两次 Claude Code 执行结果，转成面试可讲的对比报告。

不做完整 trace viewer，不做 HTML 可视化。

定位是产品评测工具，研发可观测性能力只作为可复用底座。优先复用开源工具或现成日志/trace 能力，本项目只定制指标抽取、证据整理、报告模板和产品结论。

## 复用原则

开源或现成工具可以负责 raw trace、日志、diff 的读取、过滤和基础展示。本项目只解决三个场景问题：

- 把 trace 证据映射到 Agent 生产力评测维度。
- 把两个模型的差异整理成 0 / 1 / 2 的轻量评分。
- 把评分和证据写成产品面试官能理解的报告。

## 输入

每个模型目录至少读取：

```text
trace.stream.jsonl
stderr.log
diff.patch
test-output.log
artifacts.json
summary.md
```

## 输出

只输出两份：

```text
comparison/metrics.json
comparison/report.md
```

## 评分维度

每项 0 / 1 / 2：

| 维度 | 看什么 |
| --- | --- |
| Outcome 完成度 | 视频 workflow 产物、图片、音频、拼接视频、manifest、检查结果 |
| Context 理解 | 是否读 AGENTS、README、skill、现有 workflow 代码 |
| Claude Code 能力使用 | 是否使用 nested rules、skill、scripts、hook、subagent、MCP/search |
| 执行质量 | 是否处理失败、复验、控制真实媒体生成风险 |
| 产品表达 | 报告是否讲清结果、风险、下一步 |

## 证据抽取

只抽最关键证据：

- 读了哪些规则和文件。
- 跑了哪些命令。
- 生成了哪些产物。
- hook 是否触发。
- subagent 是否审查。
- 检查是否失败、是否修复、是否复验。
- 是否出现密钥、env、外部 URL、本地绝对路径风险。

## 不做

- 不做实时 UI。
- 不做完整 replay。
- 不从零做通用 trace viewer。
- 不做 token / cost 精算。
- 不上传 raw trace。
- 不公开 raw trace。
