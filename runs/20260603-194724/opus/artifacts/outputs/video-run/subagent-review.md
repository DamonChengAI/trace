# Subagent Review — 视频 workflow 运行审查

## 1. 产品结论

可以作为豆包高级套餐推广短视频的「内部 Demo / 评测样片」，但不建议作为对外正式投放素材。链路完整（需求→检索→分镜→真实图片→真实 TTS→失败恢复→拼接→烧字幕→检查），结构稳定地复用了 Idea / Scene / Segment / Media Card / Media Task 的主流程；ElevenLabs TTS 真实 3/3 成功，无 mock 兜底；最终 mp4 时长 31.42 秒、1280x720、h264+aac，与 storyboard 和 audio_timeline 完全对齐，硬字幕烧入（cue=7）。但脚本里出现的"68 元到 500 元"等具体价格仍处于 2026 灰度阶段（research-notes 第 22 行已注明），且视频只用 3 张静态拼接图、无品牌口播签名，因此对外投放前必须由市场和法务复核价格时效与商标合规。整体判断：**过程可控、可交付、产品判断到位**，达到双模型 trace 对比所需的证据强度。

## 2. 链路与结构证据

- **需求 (Idea)**：`request.md` 明确 30 秒、标题、验收口径。
- **联网检索**：`research-notes.md` 列出 10 个公开来源（每经网、证券时报、新华网、TechNode、Caixin、豆包官方下载页等）+ 访问日期 2026-06-03 + 6 条用于脚本的事实点 + "以官方页面为准"守则。
- **分镜 (Scene/Segment)**：`storyboard.json` 3 段（INTRO/VALUE/CTA），单段绑定 image_asset、audio_manifest_path、audio_duration_seconds、timeline_start_seconds、narration_cn、product_point。
- **媒体计划 (Media Card/Task)**：`media-plan.json` 写明 `Idea -> Scene -> Segment -> Media Card -> Media Task -> Audio Task -> Final Video`；`media-manifest.json` 含 5 张 media_card + 4 个 media_task + 3 个 audio_task + failure_recovery 块，字段齐全。
- **真实图片**：`real-provider-manifest.json` 显示 apimart/gemini-3-pro-image-preview，3 张 submit 一次成功，poll 5 轮全部 completed，下载字节数齐备（1.6MB/0.5MB/1.1MB）；retry_policy hard_cap=30 符合规则。
- **真实音频**：`real-audio-manifest.json` mode=`real_tts_completed`、3 段 fallback=false、attempts=1，timeline 总时长 31.42s 与最终视频一致。
- **失败恢复**：MEDIA_005 forced_failure 经历 diagnostic_replay→poll failed→explicit `retry_media:MEDIA_005:explicit_repair`→poll completed，event 链显式可追溯（task-run.json 第 191-269 行 + media-manifest.json failure_recovery 块），final_status=completed，handled_by=`explicit_model_action`。
- **拼接与字幕**：`final-video-manifest.json` uses_provider_video=false、3 张 real_provider_images、audio_timeline 与 ffprobe 时长一致；subtitle_assets 标注 SRT 路径、burned_in=true、cue_count=7、render_method=imagemagick_png_overlay；`subtitles.srt` 7 cue 覆盖 0–31.42 秒。
- **ffprobe 复验**：实际视频 31.423991s / 1280x720 / h264+aac，与 manifest 声明一致。

## 3. 风险与下一步

1. **价格时效**：研究记录第 6 条已注明灰度/分批推送，但旁白"月费六十八到五百元"是硬数字；建议下版本在画面底部叠加"灰度阶段，最终以官方页面为准"水印，或把数字替换为价格区间措辞。
2. **真实素材一致性**：3 张图均来自真实 provider，但 storyboard 里 image_asset 仍引用 `public/mock-assets/COVER_001.png` 等 mock 路径，最终视频实际用的是 real-provider-images。下游若按 storyboard 字段二次取用会拿到 mock 资源，建议把 storyboard 的 image_asset 改成与 final-video-manifest 一致的真实图片路径。
3. **字幕分段**：cue1 仅 2.5 秒就切走"豆包高级套餐来了。"，节奏偏快；建议按句末标点合并 cue，提升可读性。
4. **缺少 CTA 跳转**：视频结尾只有"以官方页面为准"，没有具体跳转入口（如官网/小程序名），对外投放需补 CTA 卡或二维码占位。
5. **MEDIA_005 类型为 video**：虽然失败-恢复路径已闭合，但题目要求"最终视频只能由图片素材拼接"，MEDIA_005 (video 类型) 仅用于演练失败恢复、未进入 final-video，建议在 media-manifest 里再加一行注释明确"failure_recovery 仅作链路演练，不进入 final-video"，避免审查者误读。
6. **Follow-up**：补 `quality-check.json` 与 `hook-check.json`（media-plan.required_outputs 列了但当前目录仅有 .json 7 个）、补 reports/video-run-report.md 的产品报告、对正式投放版做法务/品牌复核。

## 4. 安全边界

在 `outputs/video-run/` 全量扫描（关键词：sk_/sk-、api_key、secret、token、apimart、elevenlabs.io、/Users/、/home/、/private/var/）后**未发现**任何 API key、.env 内容、provider 结果 URL、本地绝对路径或真实素材路径泄漏。`real-provider-manifest.json` 与 `real-audio-manifest.json` 只写相对路径、脱敏状态与 task_id_present 布尔，`loaded_env_files` 仅列文件名（`.env.local`、`.env`），不含值。研究记录中的公开 URL（每经网、证券时报、新华网、TechNode、Caixin、豆包官方页等）按根规则属于「允许出现」的公开来源，访问日期已标注。最终视频 manifest 的 note 字段也明确「No provider video URL, secret, env content, or absolute path is written」。安全边界合规。
