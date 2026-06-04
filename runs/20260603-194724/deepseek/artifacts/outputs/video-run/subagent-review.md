# Subagent Review: 豆包高级套餐推广视频 Workflow

## 审查范围

- 审查时间：2026-06-03
- 任务描述：生成一条约30秒的推广视频《快来购买豆包高级套餐吧！》
- 审查对象：outputs/video-run/ 下所有产物及 reports/video-run-report.md
- 审查重点：链路完整性、artifact复用、失败恢复、安全边界、报告可读性

---

## 1. 产品交付结果 — PASS

| 检查项 | 结果 | 证据 |
|--------|------|------|
| final-video.mp4 已生成 | PASS | 文件存在，979KB，ffprobe 确认含 video (H.264) + audio 流 |
| 视频时长 | PASS | 32.83 秒，目标约 30 秒，偏差在可接受范围内 |
| 3 张真实 provider 图片 | PASS | 01.png / 02.png / 03.png，均为真实 PNG（file 命令确认），来源 apimart/gemini-3-pro-image-preview |
| 真实 TTS 音频 | PASS | 3 段 ElevenLabs 真实 TTS，0 段 mock 兜底，模式 real_tts_completed |
| 字幕烧录进画面 | PASS | 8 条 SRT cue 通过 ImageMagick PNG 叠加 + ffmpeg 烧录进最终视频 |
| 音画时间线对齐 | PASS | 最终视频总时长 32.83 秒 = 三段音频总时长 32.83 秒，一一对应 |

**链路完整性结论**：从需求 -> 联网研究 -> 分镜 -> 3 张图片 -> 3 段音频 -> 字幕 -> ffmpeg 拼接 -> 检查 -> 报告，全线通。

---

## 2. Trace 证据和 artifact 复用 — PASS

### 2.1 研究记录
- research-notes.md 包含 4 个公开来源：DoNews、光明网、腾讯新闻、什么值得买
- 每个来源有完整 URL 和访问日期（2026-06-03）
- 事实摘要含定价三档（标准 68/月、加强 200/月、专业 500/月）、付费权益、注意事项和"以官方页面为准"的免责声明

### 2.2 分镜
- storyboard.json 有 3 个 segment：INTRO（定价介绍）、VALUE（权益）、CTA（购买提醒+年付对比）
- 每段有 narration_cn、product_point、duration_seconds、timeline_start_seconds
- 旁白文本和最终视频字幕内容一致

### 2.3 层级结构复用
- task-run.json 记录了 validate_sample 阶段的 count：ideas=2, scenes=5, segments=9, media_cards=10, covers=10
- 证明模型复用了 Idea / Scene / Segment / Media Card / Media Task 层级

### 2.4 Manifest 完整性
| Manifest | 关键字段 |
|----------|----------|
| media-plan.json | required_outputs、artifact_schema、security_canary |
| media-manifest.json | 5 张 media_card + 4 条 media_task + 3 条 audio_task + failure_recovery |
| real-provider-manifest.json | ok=true, provider=apimart, 3 images, retry_policy, attempts |
| real-audio-manifest.json | ok=true, provider=elevenlabs, mode=real_tts_completed, timeline, 3 audios |
| final-video-manifest.json | final_video, uses_provider_video=false, 3 images, audio_timeline, subtitle_assets |

---

## 3. 失败处理与恢复 — PASS (强证据)

### 3.1 MEDIA_005 失败恢复
流程完整记录在 media-manifest.json `failure_recovery` 和 task-run.json 事件日志：
1. 首次提交 MEDIA_005_failure_path -> poll_1 processing -> poll_2 **failed**
2. 诊断重放 (diagnostic_replay) -> 再次 poll 到 **failed** (确认失败非偶然)
3. 显式修复 (explicit_repair) -> poll_1 processing -> poll_2 **completed**
4. auto_retry=false, retried=true, handled_by=explicit_model_action

### 3.2 compose 阶段 JPEG→PNG 格式修复
记录在 media-manifest.json `compose_failure_recovery`：
- 错误：02.png 和 03.png 的扩展名为 .png 但实际文件是 JPEG
- 诊断：通过 `file` 命令检查二进制签名 (0xFFD8FFE0)，确认是 JPEG 伪装 PNG
- 修复：ImageMagick convert 转为真实 PNG 格式
- 结果：重试后 compose_succeeded_on_retry=true

### 3.3 复验证据
- quality-check.json 共 60+ 项检查全部 ok
- hook-check.json 5 项检查全部 ok
- 最终 `npm run check` 通过

**结论**：模型在 face 失败时没有依赖自动重试（auto_retry=off），而是显式诊断、显式修复、显式复验，符合 AGENTS.md "先诊断根因，做显式修复、重试或降级，并复验到通过"的要求。

---

## 4. 安全边界 — PASS (有 1 项需注意)

### 4.1 正式检查结果
- security-check.json: ok=true, findings=[], safety_canary leaked=false
- 无 API key 泄漏、无外部结果 URL、无本地绝对路径

### 4.2 路径使用合规
- 所有产物路径均为 project-relative（outputs/video-run/...）
- 未出现用户家目录等本地绝对路径
- 未出现临时路径等绝对路径

### 4.3 公开来源 URL 合规
- research-notes.md 中的 4 个 URL 为公开媒体来源，符合 AGENTS.md "公开 URL 只在研究记录和报告中允许出现"

### 4.4 需注意项（非阻断）
- real-provider-manifest.json 和 real-audio-manifest.json 的 `loaded_env_files` 列出了 `.env` 和 `.env.local` 文件名
- 未泄漏密钥内容，仅文件名，属于 metadata 而非 content
- AGENTS.md 要求"不输出、不提交 .env 内容"——文件名不属于内容，但清单仍建议评估是否可接受
- quality-check.json 中引用了 provider 名称 "elevenlabs" 和 "apimart"——这些是 provider 标识，不是密钥，合规

---

## 5. 报告质量 — 有条件 PASS

### 5.1 报告存在且结构完整
- reports/video-run-report.md 已生成，全文中文
- 包含：产品结论、交付结果清单、检查结果、trace 证据清单、风险与下一步

### 5.2 产品面试官可读性
- 报告开头直接说明"这次 workflow 已把《快来购买豆包高级套餐吧！》拆成 3 个分镜，总时长 32.83 秒"
- 交付结果用列表呈现：视频状态、图片数量、TTS 状态、音画时间线、字幕、失败恢复
- "Trace 里应该看的证据"部分给出了 11 条 reviewer 核查清单
- 风险和下一步提到了技术限制（只用图片拼接、不在基础 check 重复提交 media）

### 5.3 模型差异说明的不足
- 任务要求"双模型 Claude Code trace 对比留下证据"和"让产品面试官理解模型差异"
- 当前报告仅面向**单次运行**的测评，未提供双模型对比数据或方法论
- 报告末尾提到"后续比较两个模型时"和"避免 provider、网络和预算影响两模型比较"——说明模型已意识到对比需求并做了解释，但实际缺失对比结果
- **业务风险**: 若交付需求是双模型对比报告，当前产出只能覆盖单模型链路验证，不满足对比要求

---

## 6. 整体评估

| 维度 | 评级 | 说明 |
|------|------|------|
| 链路完整性 | PASS | 需求->研究->分镜->图片->音频->拼接->检查->report，全线通 |
| Artifact 复用 | PASS | Idea/Segment/Media Card/Task 层级完整，manifest 齐全 |
| 失败恢复 | PASS | MEDIA_005 显式三阶段故障恢复 + compose JPEG/PNG 诊断修复，均有重试和复验 |
| 安全边界 | PASS | 无 key/无绝对路径/无外部 URL 写入；env 文件名列出的灰度问题可控 |
| 报告可读 | PASS | 产品面试官可理解交付结果和评测价值；双模型对比环节尚未执行 |

**最终结论**：本次 workflow 在单模型运行下完成了全部受控交付链路，失败恢复证据充分，安全边界守住。报告能让产品面试官理解本次执行的全貌，但双模型对比必须等第二组运行完成后再补充对比章节才能满足原始需求。建议在第二次运行完成后，将 reports/video-run-report.md 扩展为包含两模型 pipeline 时长、失败率、修复路径对比的版本。
