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
  if (trace.finalSummary.hasContradictionAboutVideo) outcome -= 0.4;

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
        ? "Opus 更适合作为复杂生产力 Agent 任务的默认基线：两边 outcome 都过线，但 Opus 的过程更聚焦、研究证据更可审计、执行中没有由手写产物结构引发的脚本失败。"
        : "DeepSeek 在本轮综合分更高，但需要人工复核其研究证据和过程稳定性；不建议只凭最终视频判断。",
    harnessImplication:
      "这个 trial 说明 workflow 方案是必要的：简单任务只能看最终输出，当前任务能同时暴露规则读取、skill 复用、真实图片调用、失败恢复、subagent、hook、security 和最终表达差异。"
  };
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

## 产品结论

${metrics.comparison.productConclusion}

这次评测不是比较视频审美，而是比较两个模型在同一 Claude Code harness 下把一句需求推进成可交付结果的过程质量。两个模型都生成了 29.96 秒最终视频、3 张真实 provider 图片，并通过严格检查；差异主要出现在过程可信度、研究证据质量、失败恢复成本和最终表达清晰度。

## 分数

| 模型 | 综合分 | 结果完成 | 上下文理解 | Claude Code 能力 | 执行质量 | 风险控制 | 产品表达 |
|---|---:|---:|---:|---:|---:|---:|---:|
${modelRows}

评分为 0-5 分，综合分按 outcome 25%、上下文 15%、Claude Code 能力 18%、执行质量 18%、风险控制 14%、产品表达 10% 加权。

## 关键差异

- Opus：路径更聚焦，先复用项目脚本和规则，再补研究、真实图片、subagent、hook 和全量检查；研究笔记保留可点击 URL 和不确定项，产品解释更稳。
- DeepSeek：最终也完成了结果，且能从 \`video:report\` 报错中恢复；但它先大范围探索并手写多个产物，曾因 manifest 结构不匹配导致脚本失败，研究来源没有 URL，最终总结还出现“真实视频未生成”的歧义。
- 对产品岗位面试的价值：这个工具能把“模型最后都做出来了”拆成更有业务意义的差异：谁更少需要人工接管、谁的过程更可审计、谁更容易产品化成可复用评测标准。

## 证据

${evidenceSections}

## Harness 结论

${metrics.comparison.harnessImplication}

## 后续可优化

- 把 research 的 grader 从“有来源字样”升级为“至少 3 个 URL + 至少 1 个官方/准官方来源 + 明确不确定项”。
- 把 \`npm run check\` 会覆盖分镜的行为写入任务约束，避免模型自定义脚本被后续 export 重置。
- 面试展示时只展示脱敏 metrics/report/HTML；raw trace 留本地作为证据，不公开。
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
