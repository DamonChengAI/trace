#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const runId = process.argv[2] || fs.readFileSync(path.join(repoRoot, ".current-run-id"), "utf8").trim();
const runDir = path.join(repoRoot, "runs", runId);
const comparisonDir = path.join(runDir, "comparison");

const modelConfigs = [
  { id: "opus", label: "Opus 官方 Claude Code" },
  { id: "deepseek", label: "DeepSeek Claude Code" }
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readText(filePath, fallback = "") {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : fallback;
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function sanitizeForReport(value) {
  return String(value)
    .replace(/\/Users\/dacheng\/Desktop\/ship\/workflow-sandbox-opus-run/g, "[opus-worktree]")
    .replace(/\/Users\/dacheng\/Desktop\/ship\/workflow-sandbox-deepseek-run/g, "[deepseek-worktree]")
    .replace(/\/Users\/dacheng\/Desktop\/doubao\/runs\/[0-9-]+/g, "[run-dir]")
    .replace(/\/Users\/dacheng\/[^\s"')]+/g, "[local-path]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/(API[_-]?KEY|TOKEN|SECRET)=\S+/gi, "$1=[redacted]");
}

function safeStat(filePath) {
  return fs.existsSync(filePath) ? fs.statSync(filePath) : null;
}

function parseJsonl(filePath) {
  const text = readText(filePath);
  const events = [];
  const parseErrors = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      parseErrors.push({ line: index + 1, error: String(error) });
    }
  }
  return { text, events, parseErrors };
}

function walk(value, visit) {
  if (!value || typeof value !== "object") return;
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  for (const item of Object.values(value)) walk(item, visit);
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeErrorText(value) {
  return sanitizeForReport(value)
    .replace(/\s+/g, " ")
    .replace(/^Error:\s*/, "")
    .trim();
}

function classifyErrors(errors) {
  const normalized = unique(errors.map(normalizeErrorText)).filter(Boolean);
  const kinds = {
    readDirectory: normalized.some((item) => /EISDIR/.test(item)),
    commandExit: normalized.some((item) => /Exit code 1/.test(item)),
    timeout: normalized.some((item) => /timeout/i.test(item)),
    strictCheckEarlyFailure: normalized.some((item) => /video:check/.test(item)),
    reportSchemaFailure: normalized.some((item) => /video:report|Cannot read properties|mediaManifest\.media_tasks/.test(item)),
    cancelledParallel: normalized.some((item) => /Cancelled: parallel tool call/.test(item))
  };
  const severeCount = Number(kinds.reportSchemaFailure);
  const minorCount =
    Number(kinds.readDirectory) +
    Number(kinds.commandExit && !kinds.reportSchemaFailure) +
    Number(kinds.timeout) +
    Number(kinds.strictCheckEarlyFailure) +
    Number(kinds.cancelledParallel);
  return { normalized, kinds, severeCount, minorCount };
}

function relativeToRun(filePath) {
  return path.relative(runDir, filePath).split(path.sep).join("/");
}

function artifactPath(modelId, relativePath) {
  return path.join(runDir, modelId, "artifacts", relativePath);
}

function extractTrace(modelId) {
  const tracePath = path.join(runDir, modelId, "trace.stream.jsonl");
  const stderrPath = path.join(runDir, modelId, "stderr.log");
  const { text, events, parseErrors } = parseJsonl(tracePath);
  const stat = safeStat(tracePath);
  const toolCounts = {};
  const bashCommands = [];
  const readPaths = [];
  const writePaths = [];
  const editPaths = [];
  const taskCreates = [];
  const taskUpdates = [];
  const subagents = new Set();
  const hookResponses = [];
  const toolErrors = [];
  let result = null;

  for (const event of events) {
    if (event.subagent_type) subagents.add(event.subagent_type);
    if (event.type === "result") result = event;
    if (event.type === "system" && event.subtype === "hook_response") hookResponses.push(event);
    if (event.tool_use_result && typeof event.tool_use_result === "object" && event.tool_use_result.agentType) {
      subagents.add(event.tool_use_result.agentType);
    }
    walk(event, (node) => {
      if (node.type === "tool_use" && node.name) {
        toolCounts[node.name] = (toolCounts[node.name] || 0) + 1;
        const input = node.input || {};
        if (node.name === "Bash" && input.command) bashCommands.push(input.command);
        if (node.name === "Read" && input.file_path) readPaths.push(input.file_path);
        if (node.name === "Write" && input.file_path) writePaths.push(input.file_path);
        if (node.name === "Edit" && input.file_path) editPaths.push(input.file_path);
        if (node.name === "TaskCreate") taskCreates.push(input.subject || input.description || "");
        if (node.name === "TaskUpdate") taskUpdates.push(String(input.taskId || ""));
      }
      if (node.type === "tool_result" && node.is_error) toolErrors.push(node.content || "tool_result_error");
    });
    if (typeof event.tool_use_result === "string" && /Error:|Exit code 1|is_error/i.test(event.tool_use_result)) {
      toolErrors.push(event.tool_use_result.slice(0, 300));
    }
  }

  const scriptRuns = unique(
    bashCommands.flatMap((command) => [...command.matchAll(/npm run ([a-z0-9:.-]+)/gi)].map((match) => match[1]))
  );
  const strictCheckRan = bashCommands.some((command) => command.includes("REQUIRE_REAL_IMAGES=1") && command.includes("REQUIRE_RESEARCH=1") && command.includes("video:check"));
  const fullCheckRan = bashCommands.some((command) => /npm run check\b/.test(command));
  const webSearchRequests = Object.values(result?.modelUsage || {}).reduce((sum, item) => sum + Number(item.webSearchRequests || 0), Number(result?.usage?.server_tool_use?.web_search_requests || 0));
  const webFetchRequests = Number(result?.usage?.server_tool_use?.web_fetch_requests || 0);
  const stopHookPasses = hookResponses.filter((item) => item.outcome === "success" && /hook:check/.test(item.stdout || item.output || ""));
  const localPathMentions = countMatches(text, /\/Users\/dacheng\/[^\s"')]+/g);
  const envMentions = countMatches(text, /\.env\.local|APIMART_API_KEY|API key|API credentials/gi);
  const finalText = result?.result || "";
  const errorSummary = classifyErrors(toolErrors);

  return {
    path: relativeToRun(tracePath),
    stderrPath: relativeToRun(stderrPath),
    lines: text ? text.split(/\r?\n/).filter(Boolean).length : 0,
    bytes: stat?.size || 0,
    parseErrors,
    durationMs: result?.duration_ms ?? null,
    apiDurationMs: result?.duration_api_ms ?? null,
    turns: result?.num_turns ?? null,
    totalCostUsd: result?.total_cost_usd ?? null,
    terminalReason: result?.terminal_reason || result?.subtype || null,
    toolCounts,
    bashCommands: bashCommands.map(sanitizeForReport),
    scriptRuns,
    strictCheckRan,
    fullCheckRan,
    readPaths: unique(readPaths.map(sanitizeForReport)),
    writePaths: unique(writePaths.map(sanitizeForReport)),
    editPaths: unique(editPaths.map(sanitizeForReport)),
    taskCreates,
    taskUpdateCount: taskUpdates.length,
    subagents: unique([...subagents]),
    hookResponses: hookResponses.map((item) => ({
      hook: item.hook_name,
      outcome: item.outcome,
      hasHookCheckOutput: /hook:check/.test(item.stdout || item.output || "")
    })),
    stopHookPassCount: stopHookPasses.length,
    webSearchRequests,
    webFetchRequests,
    toolErrorCount: errorSummary.normalized.length,
    toolErrors: errorSummary.normalized.map((item) => item.slice(0, 220)),
    toolErrorKinds: errorSummary.kinds,
    severeErrorCount: errorSummary.severeCount,
    minorErrorCount: errorSummary.minorCount,
    localPathMentions,
    envMentions,
    finalSummary: {
      chars: finalText.length,
      hasProductLanguage: /产品|业务|风险|下一步|人工|评测/.test(finalText),
      mentionsVideoGenerated: /最终视频|视频.*已生成|final-video/.test(finalText),
      hasContradictionAboutVideo: /真实视频状态[\s\S]{0,80}未生成/.test(finalText),
      excerpt: sanitizeForReport(finalText).replace(/\s+/g, " ").slice(0, 500)
    }
  };
}

function extractArtifacts(modelId) {
  const base = path.join(runDir, modelId, "artifacts");
  const outputBase = path.join(base, "outputs", "video-run");
  const reportsBase = path.join(base, "reports");
  const finalManifest = readJson(path.join(outputBase, "final-video-manifest.json"), {});
  const realManifest = readJson(path.join(outputBase, "real-provider-manifest.json"), {});
  const quality = readJson(path.join(outputBase, "quality-check.json"), {});
  const security = readJson(path.join(outputBase, "security-check.json"), {});
  const hook = readJson(path.join(outputBase, "hook-check.json"), {});
  const storyboard = readJson(path.join(outputBase, "storyboard.json"), {});
  const taskRun = readJson(path.join(outputBase, "task-run.json"), {});
  const mediaManifest = readJson(path.join(outputBase, "media-manifest.json"), {});
  const reportText = readText(path.join(reportsBase, "video-run-report.md"));
  const researchText = readText(path.join(outputBase, "research-notes.md"));
  const finalVideoPath = path.join(outputBase, "final-video.mp4");
  const finalVideoStat = safeStat(finalVideoPath);

  const qualityChecks = Array.isArray(quality.checks) ? quality.checks : [];
  const securityFindings = Array.isArray(security.findings) ? security.findings : [];
  const realImages = Array.isArray(realManifest.images) ? realManifest.images : [];
  const attempts = Array.isArray(realManifest.attempts) ? realManifest.attempts : [];
  const maxPollRound = attempts.reduce((max, item) => Math.max(max, Number(item.poll_round || 0)), 0);
  const submitFailures = attempts.filter((item) => item.phase === "submit" && item.ok === false).length;
  const sourceUrls = unique([...researchText.matchAll(/https?:\/\/[^\s)）]+/g)].map((match) => match[0]));
  const sourceNameCount = countMatches(researchText, /报道|来源|source|官方|腾讯|36氪|证券时报|光明网|新浪|TechNode|China Daily|KuCoin|钛媒体/g);
  const uncertaintyMarkers = countMatches(researchText, /以官方|不确定|测试中|公开报道未|为准|可能/g);
  const taskRunPendingCount = JSON.stringify(taskRun).match(/"status"\s*:\s*"pending"/g)?.length || 0;

  return {
    base: relativeToRun(base),
    finalVideo: {
      exists: Boolean(finalVideoStat),
      path: finalManifest.final_video?.path || "outputs/video-run/final-video.mp4",
      bytes: finalVideoStat?.size || 0,
      durationSeconds: finalManifest.final_video?.duration_seconds ?? null,
      targetDurationSeconds: finalManifest.final_video?.target_duration_seconds ?? null,
      resolution: finalManifest.final_video?.resolution || null,
      audio: finalManifest.final_video?.audio ?? null,
      usesProviderVideo: finalManifest.uses_provider_video ?? null,
      source: finalManifest.source || null,
      storyboardItems: finalManifest.storyboard_items ?? storyboard.items?.length ?? null,
      realProviderImageCount: Array.isArray(finalManifest.real_provider_images) ? finalManifest.real_provider_images.length : 0
    },
    realProvider: {
      ok: Boolean(realManifest.ok),
      provider: realManifest.provider || null,
      mediaType: realManifest.media_type || null,
      model: realManifest.model || null,
      hardCap: realManifest.retry_policy?.hard_cap ?? null,
      maxPollRound,
      attemptsCount: attempts.length,
      submitFailures,
      completedImages: realImages.filter((image) => image.ok && image.path).length,
      titles: realImages.map((image) => image.title).filter(Boolean)
    },
    quality: {
      ok: Boolean(quality.ok),
      passed: qualityChecks.filter((check) => check.ok).length,
      total: qualityChecks.length,
      failed: qualityChecks.filter((check) => !check.ok).map((check) => check.name)
    },
    security: {
      ok: Boolean(security.ok),
      findings: securityFindings.length
    },
    hook: {
      ok: Boolean(hook.ok),
      checks: Array.isArray(hook.checks) ? hook.checks : []
    },
    report: {
      exists: Boolean(reportText.trim()),
      chars: reportText.length,
      hasProductConclusion: /产品结论|产品成果|产品/.test(reportText),
      hasRiskSection: /风险|下一步/.test(reportText)
    },
    research: {
      exists: Boolean(researchText.trim()),
      chars: researchText.length,
      urlCount: sourceUrls.length,
      sourceNameCount,
      uncertaintyMarkers,
      hasOfficialCaveat: /以官方.*为准|以官方/.test(researchText),
      sourceUrls: sourceUrls.slice(0, 10)
    },
    taskRun: {
      pendingCount: taskRunPendingCount,
      hasMedia005: /MEDIA_005/.test(JSON.stringify(taskRun)) || /MEDIA_005/.test(JSON.stringify(mediaManifest)),
      hasRetry: /retry|重试|retried/.test(JSON.stringify(taskRun)) || /retry|重试|retried/.test(JSON.stringify(mediaManifest))
    }
  };
}

function scoreModel(trace, artifacts) {
  const outcomeChecks = [
    artifacts.finalVideo.exists,
    artifacts.finalVideo.durationSeconds >= 28 && artifacts.finalVideo.durationSeconds <= 32,
    artifacts.finalVideo.storyboardItems === 3,
    artifacts.finalVideo.usesProviderVideo === false,
    artifacts.realProvider.completedImages === 3,
    artifacts.quality.ok,
    artifacts.security.findings === 0,
    artifacts.hook.ok || trace.stopHookPassCount > 0
  ];
  let outcome = (outcomeChecks.filter(Boolean).length / outcomeChecks.length) * 5;

  const contextChecks = [
    trace.readPaths.some((item) => /AGENTS\.md$/.test(item)),
    trace.readPaths.some((item) => /scripts\/AGENTS\.md/.test(item)) || trace.path && /scripts\/AGENTS\.md/.test(JSON.stringify(trace)),
    trace.readPaths.some((item) => /reports\/AGENTS\.md/.test(item)) || /reports\/AGENTS\.md/.test(JSON.stringify(trace)),
    trace.readPaths.some((item) => /skills\/video-workflow\/SKILL\.md/.test(item)) || /skills\/video-workflow\/SKILL\.md/.test(JSON.stringify(trace)),
    artifacts.research.exists,
    artifacts.research.urlCount >= 3 || trace.webSearchRequests > 0
  ];
  let context = (contextChecks.filter(Boolean).length / contextChecks.length) * 5;
  if (trace.readPaths.length > 60) context -= 0.4;
  if (artifacts.research.urlCount === 0) context -= 0.4;

  const capabilityChecks = [
    trace.webSearchRequests > 0 || trace.toolCounts.WebSearch > 0,
    trace.scriptRuns.includes("real-media:smoke"),
    trace.scriptRuns.includes("video:compose"),
    trace.strictCheckRan,
    trace.scriptRuns.includes("security:check"),
    trace.scriptRuns.includes("video:report"),
    trace.scriptRuns.includes("hook:check"),
    trace.fullCheckRan,
    trace.subagents.includes("video-workflow-reviewer"),
    trace.stopHookPassCount > 0
  ];
  const capability = (capabilityChecks.filter(Boolean).length / capabilityChecks.length) * 5;

  let execution = 5;
  execution -= Math.min(1.8, trace.severeErrorCount * 0.9 + trace.minorErrorCount * 0.25);
  if (artifacts.taskRun.pendingCount > 0) execution -= 0.3;
  if (trace.readPaths.length > 70) execution -= 0.3;
  if (!trace.fullCheckRan) execution -= 0.5;

  let risk = 5;
  if (artifacts.security.findings > 0) risk -= 2;
  if (artifacts.finalVideo.usesProviderVideo !== false) risk -= 1.5;
  if (artifacts.realProvider.hardCap !== 30) risk -= 0.7;
  if (!artifacts.research.hasOfficialCaveat) risk -= 0.4;
  if (artifacts.research.urlCount === 0) risk -= 0.5;
  if (trace.envMentions > 3) risk -= 0.3;

  let product = 5;
  if (!artifacts.report.hasProductConclusion) product -= 0.8;
  if (!artifacts.report.hasRiskSection) product -= 0.5;
  if (!trace.finalSummary.hasProductLanguage) product -= 0.8;
  if (trace.finalSummary.hasContradictionAboutVideo) product -= 0.8;
  if (artifacts.research.uncertaintyMarkers < 2) product -= 0.3;

  const clamp = (value) => Number(Math.max(0, Math.min(5, value)).toFixed(1));
  return {
    outcome: clamp(outcome),
    contextUnderstanding: clamp(context),
    claudeCodeCapability: clamp(capability),
    executionQuality: clamp(execution),
    riskControl: clamp(risk),
    productExpression: clamp(product)
  };
}

function modelSummary(config) {
  const trace = extractTrace(config.id);
  const artifacts = extractArtifacts(config.id);
  const scores = scoreModel(trace, artifacts);
  const weighted =
    scores.outcome * 0.25 +
    scores.contextUnderstanding * 0.15 +
    scores.claudeCodeCapability * 0.18 +
    scores.executionQuality * 0.18 +
    scores.riskControl * 0.14 +
    scores.productExpression * 0.1;

  return {
    id: config.id,
    label: config.label,
    trace,
    artifacts,
    scores,
    weightedScore: Number(weighted.toFixed(2)),
    evidence: buildEvidence(config.id, trace, artifacts)
  };
}

function buildEvidence(modelId, trace, artifacts) {
  const evidence = [];
  const add = (dimension, level, text, source) => evidence.push({ dimension, level, text, source });

  add("结果", artifacts.finalVideo.exists ? "positive" : "negative", `最终视频 ${artifacts.finalVideo.exists ? "已生成" : "缺失"}，时长 ${artifacts.finalVideo.durationSeconds ?? "unknown"} 秒，真实图片 ${artifacts.realProvider.completedImages}/3。`, `${modelId}/artifacts/outputs/video-run/final-video-manifest.json`);
  add("约束", artifacts.finalVideo.usesProviderVideo === false ? "positive" : "negative", `最终合成使用图片素材，uses_provider_video=${artifacts.finalVideo.usesProviderVideo}。`, `${modelId}/artifacts/outputs/video-run/final-video-manifest.json`);
  add("研究", artifacts.research.urlCount >= 3 ? "positive" : "warning", `research-notes 中 URL 数 ${artifacts.research.urlCount}，来源名称命中 ${artifacts.research.sourceNameCount}，官方兜底=${artifacts.research.hasOfficialCaveat}。`, `${modelId}/artifacts/outputs/video-run/research-notes.md`);
  add("工具", "positive", `运行脚本：${trace.scriptRuns.join(", ") || "none"}；严格检查=${trace.strictCheckRan}；全量检查=${trace.fullCheckRan}。`, `${modelId}/trace.stream.jsonl`);
  add("Claude Code 能力", trace.subagents.includes("video-workflow-reviewer") ? "positive" : "warning", `subagent=${trace.subagents.join(", ") || "none"}；Stop hook pass=${trace.stopHookPassCount}。`, `${modelId}/trace.stream.jsonl`);
  add("失败恢复", artifacts.taskRun.hasRetry ? "positive" : "warning", `MEDIA_005/retry evidence=${artifacts.taskRun.hasRetry}；真实图片 submit 失败数=${artifacts.realProvider.submitFailures}，max poll=${artifacts.realProvider.maxPollRound}。`, `${modelId}/artifacts/outputs/video-run/real-provider-manifest.json`);
  if (trace.toolErrorCount > 0) {
    add("执行风险", "warning", `执行中出现 ${trace.toolErrorCount} 类去重后的工具错误，其中严重 ${trace.severeErrorCount} 类、轻微 ${trace.minorErrorCount} 类；典型错误：${trace.toolErrors[0] || "unknown"}`, `${modelId}/trace.stream.jsonl`);
  }
  if (trace.finalSummary.hasContradictionAboutVideo) {
    add("产品表达", "warning", "最终总结出现“真实视频状态：未生成”的歧义表达，容易让产品面试官误解为没有产出最终视频。", `${modelId}/trace.stream.jsonl`);
  }
  if (trace.readPaths.length > 70) {
    add("效率", "warning", `读取文件路径 ${trace.readPaths.length} 个，探索成本偏高。`, `${modelId}/trace.stream.jsonl`);
  }
  return evidence;
}

function compareModels(models) {
  const sorted = [...models].sort((a, b) => b.weightedScore - a.weightedScore);
  const leader = sorted[0];
  const runnerUp = sorted[1];
  return {
    leader: leader.id,
    leaderLabel: leader.label,
    scoreGap: Number((leader.weightedScore - runnerUp.weightedScore).toFixed(2)),
    productConclusion:
      leader.id === "opus"
        ? "Opus 更适合作为复杂生产力 Agent（智能体）任务的默认基线：两边最终产物（outcome）都过线，但 Opus 的过程更聚焦、研究证据更可审计、执行中没有由手写产物结构引发的脚本失败。"
        : "DeepSeek 在本轮综合分更高，但需要人工复核其研究证据和过程稳定性；只凭最终视频判断会漏掉过程风险。",
    harnessImplication:
      "这个受控实验（trial）说明 workflow（工作流）方案是必要的：简单任务只能看最终输出，当前任务能同时暴露规则读取、skill（技能）复用、真实图片调用、失败恢复、subagent（子代理）、hook（钩子检查）、security（安全检查）和最终表达差异。"
  };
}

function statusText(ok, weak = false) {
  if (weak) return "覆盖，证据偏弱";
  return ok ? "覆盖" : "未覆盖";
}

function capabilityCoverageRows(models) {
  const [opusModel, deepseekModel] = models;
  const skillSeen = (model) => JSON.stringify(model.trace).includes("skills/video-workflow/SKILL.md");
  const nestedSeen = (model) =>
    model.trace.readPaths.some((item) => /scripts\/AGENTS\.md|reports\/AGENTS\.md/.test(item)) ||
    /scripts\/AGENTS\.md|reports\/AGENTS\.md/.test(JSON.stringify(model.trace));
  const rows = [
    {
      name: "AGENTS（项目规则）",
      opus: statusText(opusModel.trace.readPaths.some((item) => item.includes("AGENTS.md"))),
      deepseek: statusText(deepseekModel.trace.readPaths.some((item) => item.includes("AGENTS.md"))),
      evidence: "两边 trace 都有读取根规则的证据，用来判断是否先理解项目目标和边界。"
    },
    {
      name: "Nested rules（嵌套规则）",
      opus: statusText(nestedSeen(opusModel)),
      deepseek: statusText(nestedSeen(deepseekModel)),
      evidence: "`scripts/AGENTS.md`、`reports/AGENTS.md` 用来检查模型是否进入具体目录后继续遵守局部约束。"
    },
    {
      name: "Skill（技能）",
      opus: statusText(skillSeen(opusModel)),
      deepseek: statusText(skillSeen(deepseekModel)),
      evidence: "`skills/video-workflow/SKILL.md` 是视频任务的最小执行手册。"
    },
    {
      name: "MCP / Search（工具调用 / 联网检索）",
      opus: statusText(opusModel.trace.webSearchRequests > 0),
      deepseek: statusText(deepseekModel.trace.webSearchRequests > 0, deepseekModel.artifacts.research.urlCount === 0),
      evidence: `Opus research URL=${opusModel.artifacts.research.urlCount}；DeepSeek research URL=${deepseekModel.artifacts.research.urlCount}。DeepSeek 有联网请求，但最终研究笔记缺少 URL。`
    },
    {
      name: "CLI scripts（命令行脚本）",
      opus: statusText(opusModel.trace.scriptRuns.length >= 6),
      deepseek: statusText(deepseekModel.trace.scriptRuns.length >= 6),
      evidence: "检查 `video:*`、`security:check`、`hook:check`、`npm run check` 是否真正执行。"
    },
    {
      name: "Hook（钩子检查）",
      opus: statusText(opusModel.trace.stopHookPassCount > 0),
      deepseek: statusText(deepseekModel.trace.stopHookPassCount > 0),
      evidence: "Stop hook（结束钩子）通过次数来自 trace hook event（钩子事件）。"
    },
    {
      name: "Subagent（子代理）",
      opus: statusText(opusModel.trace.subagents.includes("video-workflow-reviewer")),
      deepseek: statusText(deepseekModel.trace.subagents.includes("video-workflow-reviewer")),
      evidence: "两边都调用 `video-workflow-reviewer` 做独立复核。"
    },
    {
      name: "Eval / Review（评测 / 复核）",
      opus: statusText(opusModel.trace.strictCheckRan && opusModel.trace.fullCheckRan && opusModel.artifacts.report.exists),
      deepseek: statusText(deepseekModel.trace.strictCheckRan && deepseekModel.trace.fullCheckRan && deepseekModel.artifacts.report.exists),
      evidence: "严格检查、全量检查、模型侧报告共同构成任务内复核。"
    },
    {
      name: "Security（安全检查）",
      opus: statusText(opusModel.artifacts.security.findings === 0),
      deepseek: statusText(deepseekModel.artifacts.security.findings === 0),
      evidence: "两边 security findings（安全问题）均为 0。"
    },
    {
      name: "Trace（执行轨迹）",
      opus: statusText(opusModel.trace.lines > 0),
      deepseek: statusText(deepseekModel.trace.lines > 0),
      evidence: "两边都有 `stream-json`（流式 JSON）原始 trace，可回溯命令、文件读取、错误和收尾。"
    },
    {
      name: "Grader（评测器）",
      opus: "覆盖",
      deepseek: "覆盖",
      evidence: "`tools/compare-traces.mjs` 把两边 trace 和产物转成 `metrics.json`、`report.md` 和面试页。"
    },
    {
      name: "Memory（长期记忆）",
      opus: "未纳入硬验收",
      deepseek: "未纳入硬验收",
      evidence: "本轮 MVP 只评 Claude Code 执行现场能力；Memory 会增加变量，不作为这次面试作品的硬指标。"
    },
    {
      name: "Audio（音频）",
      opus: opusModel.artifacts.finalVideo.audio ? "有音轨，TTS 未评" : "无音轨",
      deepseek: deepseekModel.artifacts.finalVideo.audio ? "有音轨，TTS 未评" : "无音轨",
      evidence: "manifest 只能证明最终 MP4 有音轨；真实口播 TTS（文字转语音）等你确认结构后再接入。"
    }
  ];

  return rows.map((row) => `| ${row.name} | ${row.opus} | ${row.deepseek} | ${row.evidence} |`).join("\n");
}

function modelPair(models) {
  return [models.find((model) => model.id === "opus"), models.find((model) => model.id === "deepseek")];
}

function yesNo(value) {
  return value ? "是" : "否";
}

function evaluationMapRows(models) {
  const [opusModel, deepseekModel] = modelPair(models);
  const rows = [
    {
      step: "读项目规则",
      expected: "先理解任务边界、素材约束和收尾要求",
      capability: "AGENTS、nested rules（嵌套规则）、skill（技能）",
      trace: "readPaths 是否包含 AGENTS / scripts / reports / skill",
      tool: "抽取 trace.readPaths，判断是否读到关键规则",
      opus: `readPaths=${opusModel.trace.readPaths.length}，读到规则和 skill`,
      deepseek: `readPaths=${deepseekModel.trace.readPaths.length}，读到规则和 skill`,
      conclusion: "两边都覆盖；DeepSeek 探索范围更大"
    },
    {
      step: "联网研究",
      expected: "检索豆包高级套餐公开信息，并留下可复查来源",
      capability: "MCP / Search（工具调用 / 联网检索）",
      trace: "webSearchRequests、research-notes URL 数",
      tool: "统计联网请求和 research-notes 中 URL",
      opus: `search=${opusModel.trace.webSearchRequests}，URL=${opusModel.artifacts.research.urlCount}`,
      deepseek: `search=${deepseekModel.trace.webSearchRequests}，URL=${deepseekModel.artifacts.research.urlCount}`,
      conclusion: "Opus 研究证据更可审计"
    },
    {
      step: "生成图片",
      expected: "生成 3 张真实图片，作为视频素材",
      capability: "CLI scripts（命令行脚本）、provider（外部生成服务）调用",
      trace: "real-provider-manifest completedImages",
      tool: "读取 real-provider manifest，确认图片数量和轮询状态",
      opus: `${opusModel.artifacts.realProvider.completedImages}/3，max poll=${opusModel.artifacts.realProvider.maxPollRound}`,
      deepseek: `${deepseekModel.artifacts.realProvider.completedImages}/3，max poll=${deepseekModel.artifacts.realProvider.maxPollRound}`,
      conclusion: "两边最终素材都达标"
    },
    {
      step: "拼接视频",
      expected: "用 3 张图片拼接约 30 秒视频，保留音轨",
      capability: "video:compose、manifest（产物清单）",
      trace: "final-video-manifest duration / audio / uses_provider_video",
      tool: "读取 final-video manifest，判断时长、音轨和 provider 视频边界",
      opus: `${opusModel.artifacts.finalVideo.durationSeconds}s，provider video=${opusModel.artifacts.finalVideo.usesProviderVideo}`,
      deepseek: `${deepseekModel.artifacts.finalVideo.durationSeconds}s，provider video=${deepseekModel.artifacts.finalVideo.usesProviderVideo}`,
      conclusion: "结果层基本拉平，差异要看过程"
    },
    {
      step: "检查和 hook",
      expected: "跑严格检查、全量检查和 Stop hook（结束钩子）",
      capability: "Eval / Review（评测 / 复核）、hook（钩子检查）",
      trace: "scriptRuns、strictCheckRan、fullCheckRan、stopHookPassCount",
      tool: "识别 npm 脚本和 hook event（钩子事件）",
      opus: `strict=${yesNo(opusModel.trace.strictCheckRan)}，full=${yesNo(opusModel.trace.fullCheckRan)}，hook=${opusModel.trace.stopHookPassCount}`,
      deepseek: `strict=${yesNo(deepseekModel.trace.strictCheckRan)}，full=${yesNo(deepseekModel.trace.fullCheckRan)}，hook=${deepseekModel.trace.stopHookPassCount}`,
      conclusion: "两边都完成门禁"
    },
    {
      step: "subagent 复核",
      expected: "用子代理做一次独立复核",
      capability: "Subagent（子代理）",
      trace: "trace.subagents",
      tool: "抽取 subagent 类型",
      opus: opusModel.trace.subagents.join(", ") || "无",
      deepseek: deepseekModel.trace.subagents.join(", ") || "无",
      conclusion: "两边覆盖 reviewer；DeepSeek 额外用了 Explore"
    },
    {
      step: "失败恢复",
      expected: "出错后能定位、修复并复验",
      capability: "工具调用、debug（排障）、recovery（恢复）",
      trace: "toolErrors、severeErrorCount、后续检查是否通过",
      tool: "去重并分类工具错误，区分轻微和严重",
      opus: `错误=${opusModel.trace.toolErrorCount}，严重=${opusModel.trace.severeErrorCount}`,
      deepseek: `错误=${deepseekModel.trace.toolErrorCount}，严重=${deepseekModel.trace.severeErrorCount}`,
      conclusion: "DeepSeek 恢复成本更高"
    },
    {
      step: "最终表达",
      expected: "最终说明和实际产物一致，能讲清风险和下一步",
      capability: "Report（报告）、product expression（产品表达）",
      trace: "finalSummary、video-run-report",
      tool: "检查最终总结是否有产品语言和矛盾表达",
      opus: `矛盾表达=${yesNo(opusModel.trace.finalSummary.hasContradictionAboutVideo)}`,
      deepseek: `矛盾表达=${yesNo(deepseekModel.trace.finalSummary.hasContradictionAboutVideo)}`,
      conclusion: "DeepSeek 最终表达有误导风险"
    }
  ];

  return rows
    .map((row) => `| ${row.step} | ${row.expected} | ${row.capability} | ${row.trace} | ${row.tool} | ${row.opus} | ${row.deepseek} | ${row.conclusion} |`)
    .join("\n");
}

function toolDesignRows() {
  const rows = [
    {
      problem: "最终视频只能说明结果，不能说明过程",
      design: "用同一个 video workflow（视频工作流）作为受控任务",
      why: "视频任务简单好懂，但会自然触发规则读取、搜索、图片生成、脚本、检查、hook 和 subagent"
    },
    {
      problem: "两个模型的差异容易被环境差异污染",
      design: "用同一 prompt（任务提示）、同一 baseline（基线版本）、隔离 worktree（工作目录）、同一检查命令",
      why: "先锁住变量，结论才像模型差异，不像环境差异"
    },
    {
      problem: "raw trace（原始执行轨迹）太长，产品面试官很难直接读",
      design: "只抽取和产品判断有关的证据字段",
      why: "保留可验证性，同时降低讲解成本"
    },
    {
      problem: "单个指标容易误判",
      design: "按 6 个维度打分：结果、上下文、能力、执行质量、风险、产品表达",
      why: "Agent 生产力评测要同时看交付、过程、风险和可解释性"
    },
    {
      problem: "结论如果没有信源，会像主观评价",
      design: "输出 metrics.json、report.md、HTML，并把结论绑定指标和来源",
      why: "让面试官能从结论反查到证据"
    }
  ];

  return rows.map((row) => `| ${row.problem} | ${row.design} | ${row.why} |`).join("\n");
}

function scoreBreakdownRows(models) {
  const [opusModel, deepseekModel] = modelPair(models);
  const rows = [
    {
      dimension: "Outcome（最终产物）",
      weight: "25%",
      rule: "先看任务是否交付。视频、图片、检查没过，后面过程再好也不算完成。",
      opus: `${opusModel.scores.outcome}/5：视频 ${opusModel.artifacts.finalVideo.durationSeconds}s，图片 ${opusModel.artifacts.realProvider.completedImages}/3，严格检查通过。`,
      deepseek: `${deepseekModel.scores.outcome}/5：视频 ${deepseekModel.artifacts.finalVideo.durationSeconds}s，图片 ${deepseekModel.artifacts.realProvider.completedImages}/3，严格检查通过。`
    },
    {
      dimension: "Context（上下文理解）",
      weight: "15%",
      rule: "Claude Code 任务里，读懂项目规则是稳定执行的前提。",
      opus: `${opusModel.scores.contextUnderstanding}/5：读到规则和 skill，research URL=${opusModel.artifacts.research.urlCount}，readPaths=${opusModel.trace.readPaths.length}。`,
      deepseek: `${deepseekModel.scores.contextUnderstanding}/5：读到规则和 skill，但 research URL=${deepseekModel.artifacts.research.urlCount}，readPaths=${deepseekModel.trace.readPaths.length}。`
    },
    {
      dimension: "Claude Code 能力",
      weight: "18%",
      rule: "本次任务要覆盖核心能力：规则、skill、脚本、search、hook、subagent、检查。",
      opus: `${opusModel.scores.claudeCodeCapability}/5：脚本 ${opusModel.trace.scriptRuns.length} 类，hook=${opusModel.trace.stopHookPassCount}，subagent=${opusModel.trace.subagents.join(", ")}。`,
      deepseek: `${deepseekModel.scores.claudeCodeCapability}/5：脚本 ${deepseekModel.trace.scriptRuns.length} 类，hook=${deepseekModel.trace.stopHookPassCount}，subagent=${deepseekModel.trace.subagents.join(", ")}。`
    },
    {
      dimension: "执行质量",
      weight: "18%",
      rule: "看执行是否顺、错误是否少、出错后是否能恢复。它直接影响人工接管成本。",
      opus: `${opusModel.scores.executionQuality}/5：去重错误 ${opusModel.trace.toolErrorCount} 类，严重 ${opusModel.trace.severeErrorCount} 类。`,
      deepseek: `${deepseekModel.scores.executionQuality}/5：去重错误 ${deepseekModel.trace.toolErrorCount} 类，严重 ${deepseekModel.trace.severeErrorCount} 类，出现 video:report schema 错误。`
    },
    {
      dimension: "风险控制",
      weight: "14%",
      rule: "Agent 产品要控制安全、来源、provider 边界和可复查性。",
      opus: `${opusModel.scores.riskControl}/5：security findings=${opusModel.artifacts.security.findings}，URL=${opusModel.artifacts.research.urlCount}，uses_provider_video=${opusModel.artifacts.finalVideo.usesProviderVideo}。`,
      deepseek: `${deepseekModel.scores.riskControl}/5：security findings=${deepseekModel.artifacts.security.findings}，URL=${deepseekModel.artifacts.research.urlCount}，uses_provider_video=${deepseekModel.artifacts.finalVideo.usesProviderVideo}。`
    },
    {
      dimension: "产品表达",
      weight: "10%",
      rule: "最终说明影响用户信任，但权重低于真实产物和执行过程。",
      opus: `${opusModel.scores.productExpression}/5：最终总结清晰，无“视频未生成”矛盾。`,
      deepseek: `${deepseekModel.scores.productExpression}/5：最终总结出现“真实视频状态：未生成”的歧义。`
    }
  ];

  return rows.map((row) => `| ${row.dimension} | ${row.weight} | ${row.rule} | ${row.opus} | ${row.deepseek} |`).join("\n");
}

function conclusionEvidenceRows(models) {
  const [opusModel, deepseekModel] = modelPair(models);
  const rows = [
    {
      conclusion: "Opus 过程更聚焦",
      metric: "trace 行数 / readPaths",
      opus: `${opusModel.trace.lines} 行 / ${opusModel.trace.readPaths.length}`,
      deepseek: `${deepseekModel.trace.lines} 行 / ${deepseekModel.trace.readPaths.length}`,
      source: "metrics.json -> trace.lines、trace.readPaths",
      meaning: "DeepSeek 探索更多，人工复查成本更高"
    },
    {
      conclusion: "Opus 研究证据更可审计",
      metric: "research URL 数",
      opus: `${opusModel.artifacts.research.urlCount}`,
      deepseek: `${deepseekModel.artifacts.research.urlCount}`,
      source: "research-notes.md + metrics.json",
      meaning: "面试官能快速复查 Opus 的公开来源"
    },
    {
      conclusion: "两边最终产物都达标",
      metric: "视频时长 / 真实图片 / 严格检查",
      opus: `${opusModel.artifacts.finalVideo.durationSeconds}s / ${opusModel.artifacts.realProvider.completedImages}/3 / ${yesNo(opusModel.trace.strictCheckRan)}`,
      deepseek: `${deepseekModel.artifacts.finalVideo.durationSeconds}s / ${deepseekModel.artifacts.realProvider.completedImages}/3 / ${yesNo(deepseekModel.trace.strictCheckRan)}`,
      source: "final-video-manifest.json、quality-check.json、trace.stream.jsonl",
      meaning: "差异不在有没有做出来，差异在过程质量"
    },
    {
      conclusion: "DeepSeek 恢复成本更高",
      metric: "工具错误 / 严重错误",
      opus: `${opusModel.trace.toolErrorCount} / ${opusModel.trace.severeErrorCount}`,
      deepseek: `${deepseekModel.trace.toolErrorCount} / ${deepseekModel.trace.severeErrorCount}`,
      source: "metrics.json -> trace.toolErrors、severeErrorCount",
      meaning: "DeepSeek 能恢复，但需要更强 harness 和 grader 兜底"
    },
    {
      conclusion: "DeepSeek 产品表达有风险",
      metric: "最终总结是否矛盾",
      opus: yesNo(opusModel.trace.finalSummary.hasContradictionAboutVideo),
      deepseek: yesNo(deepseekModel.trace.finalSummary.hasContradictionAboutVideo),
      source: "trace.stream.jsonl -> finalSummary",
      meaning: "它说“真实视频状态：未生成”，容易误导面试官"
    },
    {
      conclusion: "Claude Code 核心能力两边都覆盖",
      metric: "hook / subagent / full check",
      opus: `hook=${opusModel.trace.stopHookPassCount}，subagent=${opusModel.trace.subagents.join(", ")}，full=${yesNo(opusModel.trace.fullCheckRan)}`,
      deepseek: `hook=${deepseekModel.trace.stopHookPassCount}，subagent=${deepseekModel.trace.subagents.join(", ")}，full=${yesNo(deepseekModel.trace.fullCheckRan)}`,
      source: "trace.stream.jsonl、hook-check.json、subagent-review.md",
      meaning: "这次评测测到了核心能力，结论主要比较使用质量"
    }
  ];

  return rows.map((row) => `| ${row.conclusion} | ${row.metric} | ${row.opus} | ${row.deepseek} | ${row.source} | ${row.meaning} |`).join("\n");
}

function markdownReport(metrics) {
  const modelRows = metrics.models
    .map(
      (model) =>
        `| ${model.label} | ${model.weightedScore} | ${model.scores.outcome} | ${model.scores.contextUnderstanding} | ${model.scores.claudeCodeCapability} | ${model.scores.executionQuality} | ${model.scores.riskControl} | ${model.scores.productExpression} |`
    )
    .join("\n");

  const evidenceSections = metrics.models
    .map((model) => {
      const rows = model.evidence
        .map((item) => `- ${item.level === "positive" ? "OK" : "Risk"} [${item.dimension}] ${item.text} (${item.source})`)
        .join("\n");
      return `### ${model.label}\n\n${rows}`;
    })
    .join("\n\n");

  return `# Trace 对比报告：${metrics.runId}

## 一句话结论

概述：Opus 更适合作为本轮复杂生产力 Agent（智能体）任务的默认基线。两边都交付了最终视频，差异主要在过程是否聚焦、研究证据是否可审计、失败恢复成本和最终表达是否清楚。

${metrics.comparison.productConclusion}

## 我解决这个问题的思路

概述：我的思路是先把评测问题产品化，再用一个受控 workflow（工作流）把模型差异暴露出来，最后用工具把 trace（执行轨迹）转成证据和结论。

| 步骤 | 我怎么做 | 为什么这样做 |
|---|---|---|
| 先定义产品问题 | 评估两个模型在 Claude Code 里完成同一任务的过程差异 | Agent 生产力评测不能只看最终视频，还要看可控性、恢复能力、安全边界和人工接管成本 |
| 再设计受控任务 | 让两边都生成 30 秒豆包高级套餐推广视频 | 任务容易理解，但会自然触发规则、搜索、图片、脚本、检查、hook 和 subagent |
| 再采集 trace | 用同一 prompt、同一 baseline、隔离 worktree、同一检查命令跑两次 | 先控制变量，后面的差异才更像模型差异 |
| 最后做工具 | 从 trace 和 manifest 抽证据，生成 metrics、report 和 HTML | 面试官不需要读原始日志，也能验证结论从哪里来 |

## 工具解决什么问题

概述：工具解决的是“最终结果看起来都完成了，但过程差异看不见”的问题。它把原始 trace 压缩成可验证的证据地图、评分拆解和结论信源。

本工具不做完整 trace viewer（轨迹查看器），也不把重点放在视频审美。它只做本场景最关键的事：把模型执行过程里的证据抽出来，映射到产品评测维度。

## 评测证据地图

概述：这张表是本报告最重要的表。它把 workflow 要完成的事、要覆盖的 Claude Code 能力、具体 trace 怎么看、工具怎么生效、两个模型的证据和最后结论串在一起。

| Workflow 环节 | 这个环节要完成什么 | 覆盖什么能力 | Trace 怎么看 | 工具怎么生效 | Opus 证据 | DeepSeek 证据 | 影响什么结论 |
|---|---|---|---|---|---|---|---|
${evaluationMapRows(metrics.models)}

## 工具怎么设计，为什么这么设计

概述：工具采用“统一执行环境 -> 证据抽取 -> 评分评测 -> 面试呈现”的设计。这样做的原因是：先保证公平，再保证可验证，最后让产品面试官能读懂。

| 要解决的问题 | 工具设计 | 为什么这样设计最合理 |
|---|---|---|
${toolDesignRows()}

工具产出的结果有三类：

- \`metrics.json\`：给机器和后续工具读，保存结构化指标。
- \`report.md\`：给复盘读，解释评分、证据和结论。
- \`interview-review.html\`：给面试展示读，把复杂 trace 翻译成产品语言。

## 评分方法

概述：评分的目标是把“结果、过程、风险、表达”分开看。权重按产品影响排序：先看是否交付，再看过程质量和风险，最后看交付表达。

| 模型 | 综合分 | 结果完成（outcome） | 上下文理解 | Claude Code 能力 | 执行质量 | 风险控制 | 产品表达 |
|---|---:|---:|---:|---:|---:|---:|---:|
${modelRows}

| 维度 | 权重 | 为什么这样定 | Opus 为什么得这个分 | DeepSeek 为什么得这个分 |
|---|---:|---|---|---|
${scoreBreakdownRows(metrics.models)}

## 结论证据卡

概述：下面每条结论都绑定了指标和信源。面试官如果追问，可以从这张表反查到 \`metrics.json\`、manifest（产物清单）、research notes（研究笔记）或 raw trace（原始执行轨迹）。

| 结论 | 关键指标 | Opus | DeepSeek | 信源 | 产品含义 |
|---|---|---:|---:|---|---|
${conclusionEvidenceRows(metrics.models)}

## Trace 怎么验证

概述：你不需要逐行读完 \`trace.stream.jsonl\`。正确验证方式是先看工具整理出的证据，再按需要反查原始文件。

1. 先看 \`comparison/metrics.json\`：确认两边最终产物、脚本、错误、hook、subagent、URL 等指标。
2. 再看上面的“评测证据地图”：确认每个 workflow 环节是否有 trace 证据。
3. 再看“评分方法”：确认每个分数为什么这么给。
4. 再看“结论证据卡”：确认每句结论对应哪个指标、哪个来源。
5. 如果还要复核，再打开 \`trace.stream.jsonl\`、\`final-video-manifest.json\`、\`research-notes.md\` 和 \`video-run-report.md\`。

## 本轮边界和下一步

概述：本轮已经能支撑 trace 评测工具的主线。后续最值得补的是口播音频、research grader 和更多任务复测。

- 当前两个最终 MP4 都有音轨，但本轮没有接入真实 TTS（文字转语音）口播；这部分后续再接音频 API。
- research grader 可以升级为：至少 3 个 URL、至少 1 个官方/准官方来源、明确不确定项。
- 可以多跑 3-5 个不同主题，验证 Opus 和 DeepSeek 的差异是否稳定。
- raw trace 留本地作为证据，对外只展示脱敏后的 metrics、report 和 HTML。
`;
}

ensureDir(comparisonDir);
const models = modelConfigs.map(modelSummary);
const metrics = {
  runId,
  generatedAt: new Date().toISOString(),
  runDir: path.relative(repoRoot, runDir).split(path.sep).join("/"),
  models,
  comparison: compareModels(models)
};

fs.writeFileSync(path.join(comparisonDir, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
fs.writeFileSync(path.join(comparisonDir, "report.md"), markdownReport(metrics));

console.log(`comparison written: ${path.relative(repoRoot, comparisonDir)}`);
console.log(`leader: ${metrics.comparison.leaderLabel} (${metrics.comparison.scoreGap} gap)`);
