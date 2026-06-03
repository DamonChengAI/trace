# 豆包 Agent 生产力评测 · Trace Grader(轨迹评测工具)

> 把 Agent(智能体)在 Claude Code 里执行任务的**原始轨迹(trace,执行轨迹)**,用**纯规则程序**压成可比、可复现、可反查的指标。
>
> **本仓库是评测工具的代码 + 一份执行样例。** 完整评测方案、三轮数据与选型结论见面试讲解材料,不在此重复。

---

## 工具解决什么问题

一份原始执行轨迹又长又技术,产品同学没法直接读。三个纯规则小程序把它压成"能看懂的证据、档位、结论"——**不拿 AI 当裁判**:同一份记录跑十遍结果完全一样,每个数都能反查到出处。

## 三个工具

| 程序 | 角色 | 怎么干 |
|---|---|---|
| [`tools/check-sandbox-baseline.mjs`](tools/check-sandbox-baseline.mjs) | 公平性校验 | 开跑前扫"考场",确认没夹带评测文件与评分标准,防被测模型偷看(防泄题) |
| [`tools/compare-traces.mjs`](tools/compare-traces.mjs) | grader(评测器) | 读 `trace` + 各 `manifest`(产物清单),用**计数与正则**抽信号 → **写死规则**打档 → 输出 `metrics.json` + `report.md` |
| [`tools/render-interview-html.mjs`](tools/render-interview-html.mjs) | 展示器(备用) | 读 `metrics.json` 套模板渲染 HTML;叙事由人写,工具版仅作数据对照 |

## 为什么坚持纯规则、不用 LLM 当裁判

同一份 trace 跑十遍结果完全一样,每个档位都能反查到**哪条规则、哪个字段**算出来的。这避免了"用一个 AI 主观评判另一个 AI"的不可复现问题。**客观 = 标准人定、数据机器从轨迹自动抽,不是拍脑袋打分。**

## 一套引擎 + 一个适配器(可复用性)

工具天生分两层。换一个 Claude Code 任务来评,**引擎层一行不动,只换适配层**——交付的是一套能持续用的评测方法,不是"这次谁赢"的一次性答案。

- **可复用引擎层(换任务不动):** 读执行记录、数工具调用 / 文件读写 / 复核 / 检查、成本重算、错误分级、一次通过率、脱敏、打档映射、多轮稳定性聚合、渲染外壳。
- **任务适配层(换任务才改):** 验收标准、各 manifest 字段、脚本名、官方来源判定、安全诱饵——全集中在 [`compare-traces.mjs`](tools/compare-traces.mjs) 顶部的 `TASK_PROFILE` 与 `PRICE_TABLE` 两个配置里,换任务只动这两块。

## 工具吃的原始数据长什么样

执行记录就是一行行 JSON,每行是模型的一个动作或一个结果(已脱敏):

```jsonl
{"type":"tool_use","name":"Bash","input":{"command":"npm run video:compose"}}
{"type":"tool_result","is_error":true,"content":"ffmpeg ... Exit code 1"}
{"type":"tool_use","name":"WebSearch","input":{"query":"豆包 高级套餐 价格"}}
{"type":"result","num_turns":82,"total_cost_usd":4.20,"modelUsage":{ ... }}
```

工具纯靠计数和正则,从这种行里数出:调了哪些工具、报了几次错、跑了哪些脚本、读了哪些规则、查了几次网、用了多少 token、调没调复核——这些是所有指标的原料。

## 两个"不信自报、自己核"的例子(纯规则的价值)

1. **成本核出错**:第三方 wrapper 在记录里把某轮成本报成 `$4.20`,工具不采信,用 `PRICE_TABLE` 里的**真实 token × 官方价**重算得 `¥0.59`——发现它把缓存 token 按贵约 200 倍的价算了。成本从此能被对方在自己控制台核对上。
2. **自检拦矛盾**:某轮内部一致性自检发现"失败恢复判平、执行档位却不平"前后打架,**直接拒绝出结果**,逼我把判定逻辑改对。规则裁判的好处就在这:错了能查、能修、能复现。

## 仓库怎么读

```text
tools/        ★ 三个 grader 工具(纯规则、零 LLM)—— 本仓库重点
runs/         一个执行轮次的完整样例:双模型原始 trace + 产物 + manifest + metrics
              （作为工具的「输入 / 输出样例」,证明它真的跑过真实数据）
AGENTS.md     项目目标与边界
plans/ execution/ references/   评测任务与执行规范（背景,按需翻）
```

读法:先看 [grader 源码](tools/compare-traces.mjs),再用 [`runs/20260603-182255/`](runs/20260603-182255) 里的原始 `trace` 与 `comparison/metrics.json` 对照它如何把一行行轨迹变成指标。

## 安全边界(工具自身落实)

- **密钥永不入库:** `.env` 由 [`.gitignore`](.gitignore) 拦截;`manifest` 只记 `loaded_env_files` 文件名,不落地 key。
- **脱敏:** trace 里的本地路径 / `Bearer` token / key 在抽取阶段脱敏后才落地。
- **防泄题:** baseline 校验确保被测模型看不到评分标准。

## 复现

```bash
# 1. 跑前校验 sandbox 干净(防泄题)
node tools/check-sandbox-baseline.mjs <workflow-sandbox 路径>

# 2. 抽指标 + 出报告
node tools/compare-traces.mjs
node tools/render-interview-html.mjs
```
