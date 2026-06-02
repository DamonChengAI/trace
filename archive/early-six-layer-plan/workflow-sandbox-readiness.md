# Workflow Sandbox 项目准备方案

> 当前最终执行口径见 [final-mvp-video-workflow-trace-plan.md](final-mvp-video-workflow-trace-plan.md)。本文保留为早期准备方案参考，不再作为硬约束。

## 项目定位

本次评测使用：

- 演示项目：`/Users/dacheng/Desktop/ship/workflow-sandbox`
- 原始参考项目：`/Users/dacheng/Desktop/ship/youtube_long`

`workflow-sandbox` 是公开 showcase，默认保持 mock-only，用来展示 AI 视频工作流的结构和状态治理。本次评测可以在本地增加受控真实视频生成模式，用一条样例证明工作流能走到可播放结果。

`youtube_long` 只作为真实工作流经验和 provider 配置口径来源，不直接复制真实内容、素材、密钥或本地路径。

## 需要补齐的能力层

这次目标是让 `workflow-sandbox` 足够支撑 Claude Code 的完整能力展示，同时能在本地生成一条真实视频样例。它仍然保持 showcase 定位，公开默认能力以 mock 和 sample data 为主。

### 1. 常驻规则

根目录 `AGENTS.md` 保持短而明确：

- 项目公开默认模式是 mock-only。
- 真实视频生成只能在本地评测模式开启。
- 不把真实 API key 写入代码、文档、trace 或 commit。
- 不使用真实素材或本地绝对路径作为公开样例。
- 做六层工作流任务前必须读 README、mock 数据、workflow service、validator 和测试。
- 完成后必须运行项目检查命令。

### 2. 局部规则

为不同产物加路径级规则，避免所有约束都堆在根文档：

- 页面规则：六层图要面向产品岗可读，不堆技术字段。
- 报告规则：先讲每层产品含义，再讲当前样例结果。
- 脚本规则：六层 JSON / Markdown 默认只读取 mock 数据；真实生成脚本单独隔离。
- 真实生成规则：只通过本地未提交环境变量调用 provider，输出结果要和 mock storyboard 分开展示。
- 测试规则：检查六层完整性、安全边界和失败样例。

### 3. Skill

新增一个六层工作流整理 skill，用于指导模型把现有对象映射到六层：

- Idea 对应用户目标层。
- Scene / Segment 对应内容结构层。
- Media Card 对应素材需求层。
- Media Task 对应生成任务层。
- validator / failed sample 对应质量检查层。
- report / storyboard / lessons 对应交付复盘层。

skill 的作用是流程化，不承载大量代码细节。

### 4. Scripts / CLI

新增或扩展脚本，让确定性动作由工具完成：

- 从 mock 数据生成六层 JSON。
- 从六层 JSON 生成 Markdown 报告。
- 检查六层标题、字段、状态和风险是否完整。
- 检查输出里不包含密钥值、env 文件内容、真实素材和本地绝对路径。
- 在本地环境变量齐全时，允许触发一条真实视频生成 demo。
- 在真实 provider 不可用时，脚本要明确失败原因，并保留 mock storyboard 兜底。

脚本是这次评测的重要证据。模型不能只靠写页面来证明完成。

### 5. Hook

把必须执行的检查放进 hook 或等价的强制检查脚本。

最低要求：

- 修改后必须跑项目检查命令。
- 如果报告或页面缺少六层任一层，检查失败。
- 如果输出包含真实密钥、本地绝对路径、真实素材路径或 env 文件内容，检查失败。
- 如果真实视频生成被执行，hook 或检查脚本必须确认密钥没有进入输出文件、trace 摘要或 git diff。

如果真实 Claude Code hook 配置来不及做，可以用 `npm run check` 中的强制校验脚本替代，并在方案里说明 hook 是企业化落地形态。

### 6. Subagent

把 subagent 设计成独立审查角色，主开发由主 agent 承担。

建议用途：

- 审查六层图是否产品岗可读。
- 审查报告是否按六层表达。
- 审查有没有违反公开默认 mock-only、本地真实生成受控和隐私边界。
- 审查最终输出是否适合面试展示。

这样能体现上下文隔离：主 agent 做实现，subagent 做独立检查。

### 7. MCP / 联网搜索

允许模型使用 MCP 或联网搜索，但用途要收窄：

- 查询公开信息，用于生成一个虚构但合理的视频选题背景。
- 查询公开趋势或内容表达方式，辅助生成 mock 脚本。
- 不允许抓取真实个人素材、真实品牌素材或需要授权的图片。
- 搜索结果只能进入 mock 样例的背景说明，不能让项目依赖外部网络。

这能体现工具调用能力，但不会把任务变成外部资料收集。

### 8. Eval / Review

项目要保留最终复盘入口：

- 六层输出是否完整。
- mock 链路是否跑通。
- 有问题样例是否被质量检查层识别。
- 新经验应该沉淀到哪一层：AGENTS、nested rules、skill、script、hook、eval case 或不沉淀。

这部分是连接文章里 Agent 经验分层观点的关键。

## 不做的事

- 不把 `youtube_long` 真实业务搬进公开项目。
- 不复制 `youtube_long` 的 API key、`.env` 文件、真实素材或本地路径。
- 不把任务做成完整视频生产系统。
- 不把所有规则写成长文档。
- 不用真实视频审美效果判断两个模型优劣。

## 推荐最终产物

`workflow-sandbox` 最终应具备：

- 一个六层工作流页面。
- 一份六层 Markdown 报告。
- 一份六层 JSON 输出。
- 一条 mock storyboard 预览。
- 一条真实视频样例，使用本地未提交环境变量生成。
- 一条正常样例。
- 一条有问题样例。
- 一组检查命令。
- 一个任务结束后的经验分层复盘。

## API Key 使用边界

真实视频生成可以复用 `youtube_long` 的 provider 变量命名和调用方式，但不能把密钥值复制进 `workflow-sandbox` 仓库。

推荐做法：

1. 在 `workflow-sandbox` 提供 `.env.example`，只写变量名和说明。
2. 用户在本机创建未提交的 `.env.local`。
3. 真实视频生成脚本从 `.env.local` 或运行时环境变量读取 key。
4. `.gitignore` 必须覆盖 `.env`、`.env.*`，如果需要保留 `.env.example`，只允许写空值或占位符。
5. trace 报告只写“读取到 `VIDEO_PROVIDER_API_KEY` 并完成调用”这类状态，不写 key 值。
6. 如果模型需要查看 `youtube_long`，只能读取 provider 接入方式和变量名；看到密钥值时不得输出、复制或写入新项目。
