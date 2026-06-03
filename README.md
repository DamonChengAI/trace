# 豆包 Agent 生产力评测 · Doubao Agent Eval

> 一个轻量评测工具 + 方法：用同一个「30 秒视频生成」任务当**统一考场**，比较 **Opus** 与 **DeepSeek** 在 Claude Code 里完成任务的**执行轨迹（trace，执行轨迹）差异**，再把 trace 转成产品 / 业务能直接读的**选型判断**。
>
> 面向**豆包 Agent 生产力评测产品岗**的面试作品。最高优先级目标见 [AGENTS.md](AGENTS.md)。

---

## TL;DR — 一轮干净对比的诚实结论

两个模型都交付了视频：3 张真实图片 + 3 段真实 `TTS`（文字转语音）拼片、硬字幕烧录、**55/55 质量检查全过、4/4 门禁一次通过、0 安全泄露**，并且都从一个注入的失败里自己恢复了。**门槛层面两边都过关，差异在过程画像：**

| 维度 | Opus | DeepSeek |
|---|---|---|
| 研究可审计性 | **7** 个去重来源域名 | 5 个 |
| 执行干净度 | **0** 工具错误 | 4 个（2 轻微） |
| 速度 | 12m25s | **10m23s（快约 16%）** |
| 成本 | $4.64 / run | **$4.20（省约 10%）** |
| 时长控制 | 32.88s | **30.00s（精确达标）** |

**选型建议：** 关键 / 研究严谨 / 低容错任务 → **Opus**；规模化 / 成本速度敏感 / 流程清晰任务 → **DeepSeek**。
**边界（诚实标注）：** 单轮观察（n=1），差距温和，只能作为信号、不是定论，需第二轮确认是否复现。

📄 **完整报告**（先产品结论、后技术证据）→ [runs/20260603-182255/interview-review.md](runs/20260603-182255/interview-review.md)

---

## 为什么这么评

把生产力任务托付给 Agent（智能体），风险从来不在"它能不能做出一个视频"，而在过程：有没有读懂项目规则、会不会复用现成 `workflow`（工作流）、失败后能不能自己爬起来、安全边界守不守得住、人工要盯多紧。**所以不评最终视频好不好看，评 trace 暴露出的过程差异**——这才是决定"能不能规模化托付"的东西。视频只是统一任务载体。

## 怎么评（受控方法）

同一个视频 workflow 当统一考场，锁四个变量：

- **同一份精简 prompt** — 只给目标和边界，不喂步骤、不点名工具，看模型自己读懂项目。
- **同一 sandbox baseline** — 跑前用 [`check-sandbox-baseline.mjs`](tools/check-sandbox-baseline.mjs) 校验不含评测文件，**防泄题**。
- **同一工具边界与检查命令**。
- **隔离 worktree** — 后跑的看不到先跑的。

判断只来自 trace 与 `manifest`（产物清单），纯规则抽取，归入 6 个维度：结果交付 `outcome`、上下文理解 `context`、能力覆盖 `capability`、执行质量 `execution`、风险控制 `risk`、产品表达 `product`。

## 我做的工具（grader，评测器）

raw trace 又长又技术，产品面试官没法直接读。三个工具把它压成"能看懂的证据、档位、结论"——**全是纯规则代码、零 LLM 调用**：同一份 trace 跑十遍结果完全一样，每个档位都能反查到源文件。

| 工具 | 角色 | 原理 |
|---|---|---|
| [`tools/compare-traces.mjs`](tools/compare-traces.mjs) | grader（评测器） | 读 trace + manifest，用计数 / 正则抽信号 → 写死规则打档 → 输出 `metrics.json` + `report.md` |
| [`tools/render-interview-html.mjs`](tools/render-interview-html.mjs) | 渲染器 | 读 `metrics.json` 套模板出 HTML |
| [`tools/check-sandbox-baseline.mjs`](tools/check-sandbox-baseline.mjs) | 公平性校验 | 跑前扫 sandbox baseline，确认不含评分标准，防被测模型偷看（防泄题） |

**可复用性：** 工具天然分两层——换任务时**引擎层不动**（trace 解析、指标抽取、脱敏、档位映射、n=2 稳定性聚合），只换**任务适配层**（outcome 验收项、manifest 字段、研究域名 / 错误正则）。交付的是评测能力，不是一次性结论。

## 仓库怎么读

```text
AGENTS.md     最高优先级目标与偏航检查（项目宪法）
plans/        当前权威评测方案 round2-refined-eval-plan.md
execution/    执行规范：task-prompt + dual-model-execution-runbook + rerun-contract
interview/    作品结构 report-structure + 能力主表 eval-capability-matrix
references/   背景原则（只作参考）
tools/        grader 与校验工具（纯规则、零 LLM）
runs/         一个完整代表性 run：双模型 raw trace + 产物 + 报告 + metrics
```

建议阅读顺序：本 README → [完整报告](runs/20260603-182255/interview-review.md) → [grader 源码](tools/compare-traces.mjs) → [评测方案](plans/round2-refined-eval-plan.md)。

## 工程与安全边界（既是评测维度，也在作品自己身上落实）

- **密钥永不入库：** `.env` / `.env.*` 由 [`.gitignore`](.gitignore) 拦截；provider `manifest` 只记录 `loaded_env_files` 文件名与 `task_id_present` 布尔值，**从不落地 API key 或真实 task_id**。
- **防泄题：** baseline 校验确保被测模型看不到评分标准。
- **防自满：** workflow 内置强制 `hook`（钩子检查）+ `subagent`（子代理）独立复核——本轮 DeepSeek 的 reviewer 真的抓出"视频 54 秒 vs 目标 30 秒"并被修正。
- **客观可反查：** grader 零 LLM；结论层（`metrics` / `report`）脱敏，证据层（`runs/` 下 raw trace）保真。

## 复现

```bash
# 1. 跑前校验 sandbox 干净(防泄题)
node tools/check-sandbox-baseline.mjs <workflow-sandbox 路径>

# 2. 两个模型各执行(详见 execution/dual-model-execution-runbook.md)

# 3. 抽指标 + 出报告
node tools/compare-traces.mjs
node tools/render-interview-html.mjs
```

> `runs/` 下只随仓库附带一个完整代表性 run 作为可复查证据；其余 run、原始 env 与密钥保留在本地、不入库。

## 相关链接

- 📊 面试讲解文档（飞书）：`<在此粘贴飞书「分享」生成的公开链接>`

  > ⚠️ 浏览器地址栏的 `my.feishu.cn/wiki/...` 链接默认需登录授权，外部面试官点开会是 403。请在飞书文档里「分享 → 开启『互联网上获得链接的人可阅读』→ 复制链接」，把那条公开链接贴在这里。
