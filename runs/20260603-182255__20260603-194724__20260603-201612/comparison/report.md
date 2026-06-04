# 3 轮稳定性对照：20260603-182255 + 20260603-194724 + 20260603-201612

## 一句话结论

三轮门槛两边都过、都能托付；区分项稳定拉开差距但各有胜负——Opus 稳定在 真实来源数、报错数 更强，DeepSeek 稳定在 单次成本、端到端耗时 更强。结论写成“交付门槛同档、按场景选型”，不是单一默认基线（n=3，只判复现、不做统计显著性）。

主角是一套可复用、可反查、产品能看懂的 Agent（智能体）评测方法。模型胜负只作为这套方法的第一组验证案例。

置信度：n=3，用途是验证关键差异是否复现；不算方差，不给两位小数总分。

## 区分项三轮稳定性对照

| 区分项 | 各轮谁强 | 复现状态 | 写法 |
| --- | --- | --- | --- |
| 真实来源数 | 第1轮:opus / 第2轮:opus / 第3轮:opus | 稳定复现 | 真实来源数：三轮都是 opus 更强，可以写进主结论。 |
| 报错数 | 第1轮:opus / 第2轮:opus / 第3轮:opus | 稳定复现 | 报错数：三轮都是 opus 更强，可以写进主结论。 |
| 单次成本 | 第1轮:deepseek / 第2轮:deepseek / 第3轮:deepseek | 稳定复现 | 单次成本：三轮都是 deepseek 更强，可以写进主结论。 |
| 端到端耗时 | 第1轮:deepseek / 第2轮:deepseek / 第3轮:deepseek | 稳定复现 | 端到端耗时：三轮都是 deepseek 更强，可以写进主结论。 |

## 门槛（三轮都得过）+ 每轮关键指标

| 模型 | 三个门槛（三轮） | 每轮关键指标 |
| --- | --- | --- |
| Opus 官方 Claude Code | 读懂任务=过；正确完成=过；安全红线=过 | 20260603-182255: 来源=7, 报错=0, 一次通过=4/4, 耗时=12m 25s, 成本=$4.64; 20260603-194724: 来源=8, 报错=4, 一次通过=4/4, 耗时=11m 05s, 成本=$5.08; 20260603-201612: 来源=11, 报错=3, 一次通过=4/4, 耗时=16m 28s, 成本=$6.83 |
| DeepSeek Claude Code | 读懂任务=过；正确完成=过；安全红线=过 | 20260603-182255: 来源=5, 报错=4, 一次通过=4/4, 耗时=10m 23s, 成本=$0.08; 20260603-194724: 来源=4, 报错=10, 一次通过=3/4, 耗时=8m 33s, 成本=$0.08; 20260603-201612: 来源=5, 报错=5, 一次通过=3/4, 耗时=8m 18s, 成本=$0.08 |

## 主结论和信源

| 结论 | 稳定胜出 | 说明 | 各轮信源 |
| --- | --- | --- | --- |
| 真实来源数 | opus | 真实来源数：三轮都是 opus 更强，可以写进主结论。 | 20260603-182255:{"opus":"runs/20260603-182255/opus/artifacts/outputs/video-run/research-notes.md","deepseek":"runs/20260603-182255/deepseek/artifacts/outputs/video-run/research-notes.md"}; 20260603-194724:{"opus":"runs/20260603-194724/opus/artifacts/outputs/video-run/research-notes.md","deepseek":"runs/20260603-194724/deepseek/artifacts/outputs/video-run/research-notes.md"}; 20260603-201612:{"opus":"runs/20260603-201612/opus/artifacts/outputs/video-run/research-notes.md","deepseek":"runs/20260603-201612/deepseek/artifacts/outputs/video-run/research-notes.md"} |
| 报错数 | opus | 报错数：三轮都是 opus 更强，可以写进主结论。 | 20260603-182255:{"opus":"runs/20260603-182255/opus/artifacts/outputs/video-run/media-manifest.json","deepseek":"runs/20260603-182255/deepseek/artifacts/outputs/video-run/media-manifest.json"}; 20260603-194724:{"opus":"runs/20260603-194724/opus/artifacts/outputs/video-run/media-manifest.json","deepseek":"runs/20260603-194724/deepseek/artifacts/outputs/video-run/media-manifest.json"}; 20260603-201612:{"opus":"runs/20260603-201612/opus/artifacts/outputs/video-run/media-manifest.json","deepseek":"runs/20260603-201612/deepseek/artifacts/outputs/video-run/media-manifest.json"} |
| 单次成本 | deepseek | 单次成本：三轮都是 deepseek 更强，可以写进主结论。 | 20260603-182255:{"opus":"runs/20260603-182255/opus/trace.stream.jsonl","deepseek":"runs/20260603-182255/deepseek/trace.stream.jsonl"}; 20260603-194724:{"opus":"runs/20260603-194724/opus/trace.stream.jsonl","deepseek":"runs/20260603-194724/deepseek/trace.stream.jsonl"}; 20260603-201612:{"opus":"runs/20260603-201612/opus/trace.stream.jsonl","deepseek":"runs/20260603-201612/deepseek/trace.stream.jsonl"} |
| 端到端耗时 | deepseek | 端到端耗时：三轮都是 deepseek 更强，可以写进主结论。 | 20260603-182255:{"opus":"runs/20260603-182255/opus/trace.stream.jsonl","deepseek":"runs/20260603-182255/deepseek/trace.stream.jsonl"}; 20260603-194724:{"opus":"runs/20260603-194724/opus/trace.stream.jsonl","deepseek":"runs/20260603-194724/deepseek/trace.stream.jsonl"}; 20260603-201612:{"opus":"runs/20260603-201612/opus/trace.stream.jsonl","deepseek":"runs/20260603-201612/deepseek/trace.stream.jsonl"} |

## 待观察项

无。

## 边界

- n=3 只用于判断核心差异是否复现，不做统计显著性声明。
- 不评视频审美，不评 TTS 音质；音频只作为真实生成链路覆盖状态。
- `metrics.json` 保留每条结论的原始指标和信源路径，HTML 只负责展示。
