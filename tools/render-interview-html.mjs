#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const runId = process.argv[2] || fs.readFileSync(path.join(repoRoot, ".current-run-id"), "utf8").trim();
const runDir = path.join(repoRoot, "runs", runId);
const metricsPath = path.join(runDir, "comparison", "metrics.json");
const outputPath = path.join(runDir, "interview-review.html");
const markdownPath = path.join(runDir, "interview-review.md");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pct(score) {
  return Math.max(0, Math.min(100, (Number(score) / 5) * 100));
}

function modelById(metrics, id) {
  return metrics.models.find((model) => model.id === id);
}

function scoreRows(models) {
  const labels = [
    ["outcome", "结果完成"],
    ["contextUnderstanding", "上下文理解"],
    ["claudeCodeCapability", "Claude Code 能力"],
    ["executionQuality", "执行质量"],
    ["riskControl", "风险控制"],
    ["productExpression", "产品表达"]
  ];

  return labels
    .map(([key, label]) => {
      const cells = models
        .map(
          (model) => `
            <td>
              <div class="scoreLine">
                <span>${esc(model.scores[key])}</span>
                <i style="--w:${pct(model.scores[key]).toFixed(0)}%"></i>
              </div>
            </td>`
        )
        .join("");
      return `<tr><th>${esc(label)}</th>${cells}</tr>`;
    })
    .join("");
}

function evidenceList(model) {
  return model.evidence
    .map(
      (item) => `
        <li class="${item.level === "positive" ? "good" : "warn"}">
          <span>${item.level === "positive" ? "OK" : "Risk"}</span>
          <p><b>${esc(item.dimension)}</b>${esc(item.text)}</p>
        </li>`
    )
    .join("");
}

function chainCell(model, key) {
  const trace = model.trace;
  const artifacts = model.artifacts;
  const map = {
    rules: {
      ok:
        trace.readPaths.some((item) => item.includes("AGENTS.md")) &&
        JSON.stringify(trace).includes("skills/video-workflow/SKILL.md"),
      text: "读规则 / skill"
    },
    research: {
      ok: artifacts.research.exists,
      warn: artifacts.research.urlCount === 0,
      text: artifacts.research.urlCount ? `研究有 ${artifacts.research.urlCount} 个 URL` : "研究无 URL"
    },
    real: {
      ok: artifacts.realProvider.completedImages === 3,
      text: `真实图片 ${artifacts.realProvider.completedImages}/3`
    },
    compose: {
      ok: artifacts.finalVideo.exists && artifacts.finalVideo.usesProviderVideo === false,
      text: `${artifacts.finalVideo.durationSeconds}s 图片拼接`
    },
    review: {
      ok: trace.subagents.includes("video-workflow-reviewer"),
      text: trace.subagents.join(", ") || "无 subagent"
    },
    check: {
      ok: trace.strictCheckRan && trace.fullCheckRan,
      text: trace.strictCheckRan && trace.fullCheckRan ? "严格 + 全量检查" : "检查不完整"
    },
    hook: {
      ok: trace.stopHookPassCount > 0,
      text: trace.stopHookPassCount > 0 ? "Stop hook 通过" : "无 hook 证据"
    },
    express: {
      ok: !trace.finalSummary.hasContradictionAboutVideo,
      warn: trace.finalSummary.hasContradictionAboutVideo,
      text: trace.finalSummary.hasContradictionAboutVideo ? "总结有歧义" : "总结清晰"
    }
  };
  const item = map[key];
  const cls = item.warn ? "warn" : item.ok ? "good" : "bad";
  return `<span class="chain ${cls}">${esc(item.text)}</span>`;
}

function capabilityPills(model) {
  const pills = [
    ["AGENTS", model.trace.readPaths.some((item) => item.includes("AGENTS.md"))],
    ["Skill", JSON.stringify(model.trace).includes("skills/video-workflow/SKILL.md")],
    ["Search", model.trace.webSearchRequests > 0],
    ["Scripts", model.trace.scriptRuns.length >= 6],
    ["Subagent", model.trace.subagents.includes("video-workflow-reviewer")],
    ["Hook", model.trace.stopHookPassCount > 0],
    ["Security", model.artifacts.security.findings === 0],
    ["Grader", model.trace.strictCheckRan && model.trace.fullCheckRan]
  ];
  return pills.map(([label, ok]) => `<span class="pill ${ok ? "on" : "off"}">${esc(label)}</span>`).join("");
}

function statusText(ok, weak = false) {
  if (weak) return "覆盖，证据偏弱";
  return ok ? "覆盖" : "未覆盖";
}

function capabilityCoverageHtml(models) {
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
      evidence: "是否先读根规则，确认任务目标、素材边界和交付口径。"
    },
    {
      name: "Nested rules（嵌套规则）",
      opus: statusText(nestedSeen(opusModel)),
      deepseek: statusText(nestedSeen(deepseekModel)),
      evidence: "是否读到 scripts / reports 下的局部规则。"
    },
    {
      name: "Skill（技能）",
      opus: statusText(skillSeen(opusModel)),
      deepseek: statusText(skillSeen(deepseekModel)),
      evidence: "是否读取 video-workflow skill（视频工作流技能）。"
    },
    {
      name: "MCP / Search（工具调用 / 联网检索）",
      opus: statusText(opusModel.trace.webSearchRequests > 0),
      deepseek: statusText(deepseekModel.trace.webSearchRequests > 0, deepseekModel.artifacts.research.urlCount === 0),
      evidence: `Opus URL=${opusModel.artifacts.research.urlCount}；DeepSeek URL=${deepseekModel.artifacts.research.urlCount}。`
    },
    {
      name: "CLI scripts（命令行脚本）",
      opus: statusText(opusModel.trace.scriptRuns.length >= 6),
      deepseek: statusText(deepseekModel.trace.scriptRuns.length >= 6),
      evidence: "是否执行生成、检查、安全和报告脚本。"
    },
    {
      name: "Hook（钩子检查）",
      opus: statusText(opusModel.trace.stopHookPassCount > 0),
      deepseek: statusText(deepseekModel.trace.stopHookPassCount > 0),
      evidence: "Stop hook（结束钩子）是否在收尾阶段通过。"
    },
    {
      name: "Subagent（子代理）",
      opus: statusText(opusModel.trace.subagents.includes("video-workflow-reviewer")),
      deepseek: statusText(deepseekModel.trace.subagents.includes("video-workflow-reviewer")),
      evidence: "是否有 reviewer（复核子代理）参与。"
    },
    {
      name: "Eval / Review（评测 / 复核）",
      opus: statusText(opusModel.trace.strictCheckRan && opusModel.trace.fullCheckRan && opusModel.artifacts.report.exists),
      deepseek: statusText(deepseekModel.trace.strictCheckRan && deepseekModel.trace.fullCheckRan && deepseekModel.artifacts.report.exists),
      evidence: "严格检查、全量检查和模型侧报告是否齐全。"
    },
    {
      name: "Security（安全检查）",
      opus: statusText(opusModel.artifacts.security.findings === 0),
      deepseek: statusText(deepseekModel.artifacts.security.findings === 0),
      evidence: "密钥、外部 URL、本地路径等风险是否被检查。"
    },
    {
      name: "Trace（执行轨迹）",
      opus: statusText(opusModel.trace.lines > 0),
      deepseek: statusText(deepseekModel.trace.lines > 0),
      evidence: "两边都有 stream-json（流式 JSON）轨迹文件。"
    },
    {
      name: "Grader（评测器）",
      opus: "覆盖",
      deepseek: "覆盖",
      evidence: "compare-traces 输出 metrics（指标）和 report（报告）。"
    },
    {
      name: "Memory（长期记忆）",
      opus: "未纳入硬验收",
      deepseek: "未纳入硬验收",
      evidence: "本轮只评执行现场能力，避免变量膨胀。"
    },
    {
      name: "Audio（音频）",
      opus: opusModel.artifacts.finalVideo.audio ? "有音轨，TTS 未评" : "无音轨",
      deepseek: deepseekModel.artifacts.finalVideo.audio ? "有音轨，TTS 未评" : "无音轨",
      evidence: "当前只证明 MP4 有音轨；TTS（文字转语音）口播等结构确认后再接。"
    }
  ];

  return rows
    .map(
      (row) => `
        <tr>
          <th>${esc(row.name)}</th>
          <td>${esc(row.opus)}</td>
          <td>${esc(row.deepseek)}</td>
          <td>${esc(row.evidence)}</td>
        </tr>`
    )
    .join("");
}

function capabilityCoverageMarkdown(models) {
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
      evidence: "是否先读根规则，确认任务目标、素材边界和交付口径。"
    },
    {
      name: "Nested rules（嵌套规则）",
      opus: statusText(nestedSeen(opusModel)),
      deepseek: statusText(nestedSeen(deepseekModel)),
      evidence: "是否读到 scripts / reports 下的局部规则。"
    },
    {
      name: "Skill（技能）",
      opus: statusText(skillSeen(opusModel)),
      deepseek: statusText(skillSeen(deepseekModel)),
      evidence: "是否读取 video-workflow skill（视频工作流技能）。"
    },
    {
      name: "MCP / Search（工具调用 / 联网检索）",
      opus: statusText(opusModel.trace.webSearchRequests > 0),
      deepseek: statusText(deepseekModel.trace.webSearchRequests > 0, deepseekModel.artifacts.research.urlCount === 0),
      evidence: `Opus URL=${opusModel.artifacts.research.urlCount}；DeepSeek URL=${deepseekModel.artifacts.research.urlCount}。`
    },
    {
      name: "CLI scripts（命令行脚本）",
      opus: statusText(opusModel.trace.scriptRuns.length >= 6),
      deepseek: statusText(deepseekModel.trace.scriptRuns.length >= 6),
      evidence: "是否执行生成、检查、安全和报告脚本。"
    },
    {
      name: "Hook（钩子检查）",
      opus: statusText(opusModel.trace.stopHookPassCount > 0),
      deepseek: statusText(deepseekModel.trace.stopHookPassCount > 0),
      evidence: "Stop hook（结束钩子）是否在收尾阶段通过。"
    },
    {
      name: "Subagent（子代理）",
      opus: statusText(opusModel.trace.subagents.includes("video-workflow-reviewer")),
      deepseek: statusText(deepseekModel.trace.subagents.includes("video-workflow-reviewer")),
      evidence: "是否有 reviewer（复核子代理）参与。"
    },
    {
      name: "Eval / Review（评测 / 复核）",
      opus: statusText(opusModel.trace.strictCheckRan && opusModel.trace.fullCheckRan && opusModel.artifacts.report.exists),
      deepseek: statusText(deepseekModel.trace.strictCheckRan && deepseekModel.trace.fullCheckRan && deepseekModel.artifacts.report.exists),
      evidence: "严格检查、全量检查和模型侧报告是否齐全。"
    },
    {
      name: "Security（安全检查）",
      opus: statusText(opusModel.artifacts.security.findings === 0),
      deepseek: statusText(deepseekModel.artifacts.security.findings === 0),
      evidence: "密钥、外部 URL、本地路径等风险是否被检查。"
    },
    {
      name: "Trace（执行轨迹）",
      opus: statusText(opusModel.trace.lines > 0),
      deepseek: statusText(deepseekModel.trace.lines > 0),
      evidence: "两边都有 stream-json（流式 JSON）轨迹文件。"
    },
    {
      name: "Grader（评测器）",
      opus: "覆盖",
      deepseek: "覆盖",
      evidence: "compare-traces 输出 metrics（指标）和 report（报告）。"
    },
    {
      name: "Memory（长期记忆）",
      opus: "未纳入硬验收",
      deepseek: "未纳入硬验收",
      evidence: "本轮只评执行现场能力，避免变量膨胀。"
    },
    {
      name: "Audio（音频）",
      opus: opusModel.artifacts.finalVideo.audio ? "有音轨，TTS 未评" : "无音轨",
      deepseek: deepseekModel.artifacts.finalVideo.audio ? "有音轨，TTS 未评" : "无音轨",
      evidence: "当前只证明 MP4 有音轨；TTS（文字转语音）口播等结构确认后再接。"
    }
  ];

  return rows.map((row) => `| ${row.name} | ${row.opus} | ${row.deepseek} | ${row.evidence} |`).join("\n");
}

function yesNo(value) {
  return value ? "是" : "否";
}

function evaluationMapData(models) {
  const [opusModel, deepseekModel] = models;
  return [
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
}

function rowsToMarkdown(rows, keys) {
  return rows.map((row) => `| ${keys.map((key) => row[key]).join(" | ")} |`).join("\n");
}

function rowsToHtml(rows, keys, firstHeader = true) {
  return rows
    .map(
      (row) => `
        <tr>
          ${keys
            .map((key, index) => `${firstHeader && index === 0 ? "<th>" : "<td>"}${esc(row[key])}${firstHeader && index === 0 ? "</th>" : "</td>"}`)
            .join("")}
        </tr>`
    )
    .join("");
}

function toolDesignData() {
  return [
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
}

function scoreBreakdownData(models) {
  const [opusModel, deepseekModel] = models;
  return [
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
      opus: `${opusModel.scores.contextUnderstanding}/5：readPaths=${opusModel.trace.readPaths.length}，URL=${opusModel.artifacts.research.urlCount}。`,
      deepseek: `${deepseekModel.scores.contextUnderstanding}/5：readPaths=${deepseekModel.trace.readPaths.length}，URL=${deepseekModel.artifacts.research.urlCount}。`
    },
    {
      dimension: "Claude Code 能力",
      weight: "18%",
      rule: "覆盖规则、skill、脚本、search、hook、subagent、检查这些核心能力。",
      opus: `${opusModel.scores.claudeCodeCapability}/5：脚本 ${opusModel.trace.scriptRuns.length} 类，hook=${opusModel.trace.stopHookPassCount}。`,
      deepseek: `${deepseekModel.scores.claudeCodeCapability}/5：脚本 ${deepseekModel.trace.scriptRuns.length} 类，hook=${deepseekModel.trace.stopHookPassCount}。`
    },
    {
      dimension: "执行质量",
      weight: "18%",
      rule: "看执行是否顺、错误是否少、出错后是否能恢复。",
      opus: `${opusModel.scores.executionQuality}/5：错误 ${opusModel.trace.toolErrorCount} 类，严重 ${opusModel.trace.severeErrorCount} 类。`,
      deepseek: `${deepseekModel.scores.executionQuality}/5：错误 ${deepseekModel.trace.toolErrorCount} 类，严重 ${deepseekModel.trace.severeErrorCount} 类。`
    },
    {
      dimension: "风险控制",
      weight: "14%",
      rule: "看安全、来源、provider 边界和可复查性。",
      opus: `${opusModel.scores.riskControl}/5：security=${opusModel.artifacts.security.findings}，URL=${opusModel.artifacts.research.urlCount}。`,
      deepseek: `${deepseekModel.scores.riskControl}/5：security=${deepseekModel.artifacts.security.findings}，URL=${deepseekModel.artifacts.research.urlCount}。`
    },
    {
      dimension: "产品表达",
      weight: "10%",
      rule: "最终说明影响用户信任，但权重低于真实产物和执行过程。",
      opus: `${opusModel.scores.productExpression}/5：总结清晰。`,
      deepseek: `${deepseekModel.scores.productExpression}/5：最终总结出现“真实视频状态：未生成”的歧义。`
    }
  ];
}

function conclusionEvidenceData(models) {
  const [opusModel, deepseekModel] = models;
  return [
    {
      conclusion: "Opus 过程更聚焦",
      metric: "trace 行数 / readPaths",
      opus: `${opusModel.trace.lines} / ${opusModel.trace.readPaths.length}`,
      deepseek: `${deepseekModel.trace.lines} / ${deepseekModel.trace.readPaths.length}`,
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
    }
  ];
}

function formatUsd(value) {
  return typeof value === "number" ? `$${value.toFixed(2)}` : "n/a";
}

const metrics = readJson(metricsPath);
const opus = modelById(metrics, "opus");
const deepseek = modelById(metrics, "deepseek");
const models = [opus, deepseek];

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>豆包 Agent Trace 评测复盘 ${esc(metrics.runId)}</title>
  <style>
    :root {
      --paper: #f5f1e8;
      --ink: #171512;
      --muted: #6e675d;
      --line: #d8d0c1;
      --panel: #fffaf0;
      --teal: #0f6b5f;
      --blue: #2d5a87;
      --red: #a83e2a;
      --gold: #b48a18;
      --charcoal: #24211d;
      --soft: #ebe2d2;
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background:
        linear-gradient(90deg, rgba(23, 21, 18, .035) 1px, transparent 1px),
        linear-gradient(rgba(23, 21, 18, .03) 1px, transparent 1px),
        var(--paper);
      background-size: 28px 28px;
      color: var(--ink);
      font-family: "Avenir Next", "PingFang SC", "Hiragino Sans GB", sans-serif;
      letter-spacing: 0;
    }

    a { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 3px; }
    .wrap { width: min(1180px, calc(100vw - 32px)); margin: 0 auto; }
    header {
      padding: 28px 0 16px;
      border-bottom: 2px solid var(--ink);
      position: sticky;
      top: 0;
      z-index: 5;
      background: rgba(245, 241, 232, .93);
      backdrop-filter: blur(12px);
    }
    .topline { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .mark {
      font-family: "Iowan Old Style", "Songti SC", serif;
      font-size: 18px;
      font-weight: 700;
    }
    nav { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13px; color: var(--muted); }

    .hero { padding: 46px 0 28px; }
    .kicker {
      color: var(--teal);
      text-transform: uppercase;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .08em;
    }
    h1 {
      font-family: "Iowan Old Style", "Songti SC", serif;
      font-size: clamp(40px, 7vw, 86px);
      line-height: .96;
      max-width: 1050px;
      margin: 14px 0 18px;
      letter-spacing: 0;
    }
    .hero p {
      max-width: 830px;
      font-size: 19px;
      line-height: 1.7;
      color: var(--charcoal);
      margin: 0;
    }
    .heroGrid {
      display: grid;
      grid-template-columns: 1.15fr .85fr;
      gap: 18px;
      margin-top: 26px;
      align-items: stretch;
    }
    .decision {
      border: 2px solid var(--ink);
      background: var(--panel);
      padding: 22px;
      min-height: 210px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .decision h2 {
      margin: 0;
      font-family: "Iowan Old Style", "Songti SC", serif;
      font-size: 30px;
      line-height: 1.18;
    }
    .decision p { margin-top: 18px; font-size: 16px; color: var(--muted); }
    .scoreCard {
      border: 2px solid var(--ink);
      background: var(--charcoal);
      color: var(--paper);
      padding: 22px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
    }
    .scoreCard article {
      min-height: 150px;
      border: 1px solid rgba(245, 241, 232, .28);
      padding: 18px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .scoreCard b { font-size: 13px; color: #d6c7ad; }
    .scoreCard strong { display: block; font-size: 48px; line-height: 1; font-family: "Iowan Old Style", "Songti SC", serif; }
    .scoreCard span { font-size: 13px; color: #eadfc9; line-height: 1.45; }

    .toolGrid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      align-items: stretch;
    }
    .toolBox {
      border: 2px solid var(--ink);
      background: var(--panel);
      padding: 18px;
      min-height: 190px;
    }
    .toolBox h3 {
      margin: 0 0 10px;
      font-family: "Iowan Old Style", "Songti SC", serif;
      font-size: 24px;
    }
    .toolBox p, .toolBox li {
      color: var(--charcoal);
      font-size: 14px;
      line-height: 1.7;
    }
    .toolBox ul { margin: 0; padding-left: 18px; }
    .commandBlock {
      border: 2px solid var(--ink);
      background: #171512;
      color: #f5f1e8;
      padding: 14px;
      margin-top: 16px;
      font-size: 13px;
      line-height: 1.55;
      overflow-x: auto;
    }
    .callout {
      border: 2px solid var(--gold);
      background: #fbf2d5;
      padding: 14px 16px;
      margin-top: 14px;
      color: var(--charcoal);
      line-height: 1.65;
      font-size: 14px;
    }

    section { padding: 34px 0; border-top: 1px solid var(--line); }
    .sectionHead {
      display: grid;
      grid-template-columns: 260px 1fr;
      gap: 24px;
      margin-bottom: 18px;
      align-items: start;
    }
    .sectionHead h2 {
      margin: 0;
      font-family: "Iowan Old Style", "Songti SC", serif;
      font-size: 34px;
      line-height: 1.05;
    }
    .sectionHead p {
      margin: 0;
      color: var(--muted);
      line-height: 1.7;
      font-size: 15px;
      max-width: 760px;
    }

    .videoGrid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .videoBox {
      border: 2px solid var(--ink);
      background: var(--panel);
      padding: 12px;
    }
    .videoBox video {
      width: 100%;
      aspect-ratio: 16 / 9;
      display: block;
      background: #111;
    }
    .caption {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-top: 10px;
      font-size: 13px;
      color: var(--muted);
    }
    .caption b { color: var(--ink); }

    table {
      width: 100%;
      border-collapse: collapse;
      background: rgba(255, 250, 240, .7);
      border: 2px solid var(--ink);
    }
    th, td {
      border: 1px solid var(--line);
      padding: 12px;
      vertical-align: top;
      text-align: left;
      font-size: 14px;
    }
    th {
      color: var(--ink);
      background: #efe5d4;
      font-weight: 800;
    }
    .scoreLine {
      display: grid;
      grid-template-columns: 42px 1fr;
      gap: 10px;
      align-items: center;
    }
    .scoreLine span { font-weight: 800; }
    .scoreLine i {
      height: 8px;
      background: linear-gradient(90deg, var(--teal), var(--blue));
      display: block;
      width: var(--w);
      min-width: 6px;
    }

    .chainGrid {
      display: grid;
      grid-template-columns: 170px repeat(2, minmax(0, 1fr));
      border: 2px solid var(--ink);
      background: var(--panel);
    }
    .chainGrid > div {
      border-right: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      padding: 12px;
      min-height: 58px;
      display: flex;
      align-items: center;
    }
    .chainGrid > div:nth-child(3n) { border-right: 0; }
    .chainGrid .label {
      font-weight: 800;
      color: var(--charcoal);
      background: #efe5d4;
    }
    .chain {
      display: inline-flex;
      min-height: 30px;
      align-items: center;
      padding: 6px 10px;
      border: 1px solid currentColor;
      font-size: 13px;
      line-height: 1.35;
    }
    .good { color: var(--teal); }
    .warn { color: var(--red); }
    .bad { color: var(--red); }

    .modelCards {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .modelCard {
      border: 2px solid var(--ink);
      background: var(--panel);
      padding: 18px;
    }
    .modelCard h3 {
      margin: 0 0 10px;
      font-family: "Iowan Old Style", "Songti SC", serif;
      font-size: 26px;
    }
    .pillRow { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 14px; }
    .pill {
      font-size: 12px;
      border: 1px solid currentColor;
      padding: 4px 7px;
      line-height: 1.2;
      font-weight: 700;
    }
    .pill.on { color: var(--teal); }
    .pill.off { color: var(--red); }
    .facts {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-top: 14px;
    }
    .fact {
      border-top: 1px solid var(--line);
      padding-top: 10px;
      min-height: 58px;
    }
    .fact b { display: block; font-size: 20px; font-family: "Iowan Old Style", "Songti SC", serif; }
    .fact span { color: var(--muted); font-size: 12px; line-height: 1.4; }
    .evidence {
      margin: 14px 0 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 9px;
    }
    .evidence li {
      display: grid;
      grid-template-columns: 48px 1fr;
      gap: 10px;
      border-top: 1px solid var(--line);
      padding-top: 9px;
    }
    .evidence li span {
      font-size: 12px;
      font-weight: 900;
    }
    .evidence p { margin: 0; color: var(--charcoal); font-size: 13px; line-height: 1.55; }
    .evidence b { margin-right: 8px; }

    .talk {
      border: 2px solid var(--ink);
      background: var(--charcoal);
      color: var(--paper);
      padding: 22px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }
    .talk h3 {
      margin: 0 0 10px;
      font-family: "Iowan Old Style", "Songti SC", serif;
      font-size: 25px;
    }
    .talk p, .talk li { color: #eadfc9; line-height: 1.7; font-size: 14px; }
    .talk ul { margin: 0; padding-left: 18px; }
    .links {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .links a {
      border: 1px solid var(--ink);
      background: var(--panel);
      padding: 12px;
      min-height: 64px;
      font-size: 13px;
      line-height: 1.45;
      text-decoration: none;
    }
    footer {
      padding: 24px 0 44px;
      color: var(--muted);
      font-size: 12px;
    }

    @media (max-width: 820px) {
      header { position: static; }
      .heroGrid, .toolGrid, .videoGrid, .sectionHead, .modelCards, .talk, .links { grid-template-columns: 1fr; }
      .scoreCard { grid-template-columns: 1fr; }
      .chainGrid { grid-template-columns: 1fr; }
      .chainGrid > div { border-right: 0; }
      h1 { font-size: 42px; }
      .sectionHead h2 { font-size: 28px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap topline">
      <div class="mark">Doubao Agent Trace Eval</div>
      <nav>
        <a href="#approach">思路</a>
        <a href="#problem">工具</a>
        <a href="#map">证据地图</a>
        <a href="#scores">评分</a>
        <a href="#conclusions">结论信源</a>
        <a href="#verify">验证</a>
      </nav>
    </div>
  </header>

  <main class="wrap">
    <section class="hero">
      <div class="kicker">Run ${esc(metrics.runId)} / Product-facing eval artifact（产品评测作品）</div>
      <h1>两个模型都做出了视频，差异在过程可信度。</h1>
      <p>这份作品把 Claude Code 的 raw trace（原始执行轨迹）转成产品判断：谁更稳定地读懂项目规则、复用 workflow（工作流）、处理失败、守住安全边界，并把结果讲成业务方能理解的交付结论。</p>
      <div class="heroGrid">
        <article class="decision">
          <div>
            <h2>${esc(metrics.comparison.productConclusion)}</h2>
            <p>${esc(metrics.comparison.harnessImplication)}</p>
          </div>
          <p>面试重点：最终视频只是 outcome（最终产物）证明，真正评的是 Agent（智能体）生产力任务里的过程可控性、人工接管成本和可复用评测标准。</p>
        </article>
        <aside class="scoreCard">
          ${models
            .map(
              (model) => `
                <article>
                  <b>${esc(model.label)}</b>
                  <strong>${esc(model.weightedScore)}</strong>
                  <span>${model.id === "opus" ? "过程更聚焦，研究证据更可审计。" : "结果可达成，但恢复成本和表达风险更高。"}</span>
                </article>`
            )
            .join("")}
        </aside>
      </div>
    </section>

    <section id="approach">
      <div class="sectionHead">
        <h2>解决思路</h2>
        <p>概述：先把评测问题产品化，再用一个受控 workflow（工作流）暴露模型差异，最后用工具把 trace（执行轨迹）转成证据和结论。</p>
      </div>
      <div class="toolGrid">
        <article class="toolBox">
          <h3>1. 定义产品问题</h3>
          <p>Agent（智能体）评测不能只看最终视频，还要看过程是否可控、失败能否恢复、安全边界是否守住、人工接管成本多高。</p>
        </article>
        <article class="toolBox">
          <h3>2. 设计受控任务</h3>
          <p>两个模型跑同一个 30 秒视频任务。这个任务容易理解，又会自然触发规则、搜索、图片、脚本、检查、hook 和 subagent。</p>
        </article>
        <article class="toolBox">
          <h3>3. 采集 Trace</h3>
          <p>用同一 prompt（任务提示）、同一 baseline（基线版本）、隔离 worktree（工作目录）、同一检查命令跑两次。</p>
        </article>
        <article class="toolBox">
          <h3>4. 做评测工具</h3>
          <p>工具从 trace 和 manifest（产物清单）抽证据，生成 metrics（指标）、report（报告）和 HTML，让结论能反查到来源。</p>
        </article>
      </div>
    </section>

    <section id="problem">
      <div class="sectionHead">
        <h2>工具设计</h2>
        <p>概述：工具解决的是“最终结果都完成了，但过程差异看不见”的问题。设计重点放在把原始 trace 压缩成可验证的证据、评分和产品结论。</p>
      </div>
      <table>
        <thead><tr><th>要解决的问题</th><th>工具设计</th><th>为什么这样设计最合理</th></tr></thead>
        <tbody>${rowsToHtml(toolDesignData(), ["problem", "design", "why"])}</tbody>
      </table>
      <div class="callout">工具产物分三层：<b>metrics.json</b> 给机器读，<b>report.md</b> 给复盘读，<b>interview-review.html</b> 给面试展示读。raw trace（原始执行轨迹）保留本地，用来反查证据。</div>
    </section>

    <section id="map">
      <div class="sectionHead">
        <h2>评测证据地图</h2>
        <p>概述：这张表把任务要完成什么、要评什么、trace 怎么看、工具怎么生效、结论来自哪里全部串在一起。它是整份作品的主表。</p>
      </div>
      <table>
        <thead>
          <tr><th>Workflow 环节</th><th>要完成什么</th><th>覆盖什么能力</th><th>Trace 怎么看</th><th>工具怎么生效</th><th>Opus 证据</th><th>DeepSeek 证据</th><th>影响什么结论</th></tr>
        </thead>
        <tbody>${rowsToHtml(evaluationMapData(models), ["step", "expected", "capability", "trace", "tool", "opus", "deepseek", "conclusion"])}</tbody>
      </table>
    </section>

    <section id="scores">
      <div class="sectionHead">
        <h2>评分方法</h2>
        <p>概述：评分的目标是把“结果、过程、风险、表达”分开看。权重按产品影响排序：先看是否交付，再看过程质量和风险。</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>维度</th>
            ${models.map((model) => `<th>${esc(model.label)} / ${esc(model.weightedScore)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${scoreRows(models)}
        </tbody>
      </table>
      <div class="sectionHead" style="margin-top:18px">
        <h2>扣分原因</h2>
        <p>概述：每个分数都绑定具体证据。DeepSeek 的产物也达标，主要扣在研究证据、执行错误和最终表达。</p>
      </div>
      <table>
        <thead>
          <tr><th>维度</th><th>权重</th><th>为什么这样定</th><th>Opus 得分原因</th><th>DeepSeek 得分原因</th></tr>
        </thead>
        <tbody>${rowsToHtml(scoreBreakdownData(models), ["dimension", "weight", "rule", "opus", "deepseek"])}</tbody>
      </table>
    </section>

    <section id="conclusions">
      <div class="sectionHead">
        <h2>结论证据卡</h2>
        <p>概述：下面每条结论都绑定了指标和信源。面试官如果追问，可以从这张表反查到 metrics、manifest、research notes 或 raw trace。</p>
      </div>
      <table>
        <thead><tr><th>结论</th><th>关键指标</th><th>Opus</th><th>DeepSeek</th><th>信源</th><th>产品含义</th></tr></thead>
        <tbody>${rowsToHtml(conclusionEvidenceData(models), ["conclusion", "metric", "opus", "deepseek", "source", "meaning"])}</tbody>
      </table>
    </section>

    <section id="verify">
      <div class="sectionHead">
        <h2>怎么验证</h2>
        <p>概述：不需要逐行读完 trace.stream.jsonl。正确验证方式是先看工具整理出的证据，再按需要反查原始文件。</p>
      </div>
      <div class="toolGrid">
        <article class="toolBox"><h3>1. 看 metrics</h3><p>先打开 <code>comparison/metrics.json</code>，确认视频、图片、脚本、错误、hook、subagent、URL 等指标。</p></article>
        <article class="toolBox"><h3>2. 看证据地图</h3><p>确认每个 workflow 环节都有对应 trace 证据和工具抽取字段。</p></article>
        <article class="toolBox"><h3>3. 看评分表</h3><p>确认每个维度为什么给这个分，尤其是 DeepSeek 的扣分点。</p></article>
        <article class="toolBox"><h3>4. 看信源</h3><p>从结论证据卡反查到 manifest、research-notes、video-run-report 和 raw trace。</p></article>
      </div>
    </section>

    <section id="files">
      <div class="sectionHead">
        <h2>边界和文件</h2>
        <p>概述：本轮已经能支撑 trace 评测工具主线。音频口播可以最后再补，不影响现在这版结构判断。</p>
      </div>
      <div class="videoGrid">
        <article class="videoBox">
          <video src="opus/artifacts/outputs/video-run/final-video.mp4" controls preload="metadata"></video>
          <div class="caption"><b>Opus</b><span>${esc(opus.artifacts.finalVideo.durationSeconds)}s / ${esc(opus.artifacts.realProvider.completedImages)} 张真实图片</span></div>
        </article>
        <article class="videoBox">
          <video src="deepseek/artifacts/outputs/video-run/final-video.mp4" controls preload="metadata"></video>
          <div class="caption"><b>DeepSeek</b><span>${esc(deepseek.artifacts.finalVideo.durationSeconds)}s / ${esc(deepseek.artifacts.realProvider.completedImages)} 张真实图片</span></div>
        </article>
      </div>
      <div class="links">
        <a href="comparison/report.md"><b>对比报告</b><br>Markdown 产品结论和证据摘要</a>
        <a href="comparison/metrics.json"><b>Metrics JSON</b><br>对比工具生成的结构化评分</a>
        <a href="opus/artifacts/reports/video-run-report.md"><b>Opus 报告</b><br>模型侧视频 workflow 复盘</a>
        <a href="deepseek/artifacts/reports/video-run-report.md"><b>DeepSeek 报告</b><br>模型侧视频 workflow 复盘</a>
      </div>
      <div class="callout">当前两个最终 MP4 都有音轨，但还没有接入真实 TTS（文字转语音）口播。这个问题放到最后补音频 API，不影响本版 trace 评测结构。</div>
    </section>
  </main>

  <footer class="wrap">
    Raw trace（原始执行轨迹）只作为本地证据保存。这个 HTML 使用脱敏 metrics（指标）和 runs/${esc(metrics.runId)} 下的本地产物链接。
  </footer>
</body>
</html>
`;

fs.writeFileSync(outputPath, html);
const markdown = `# 豆包 Agent Trace 评测复盘

Run ID：${metrics.runId}

## 一句话结论

概述：Opus 更适合作为本轮复杂生产力 Agent（智能体）任务的默认基线。两边都交付了最终视频，差异主要在过程是否聚焦、研究证据是否可审计、失败恢复成本和最终表达是否清楚。

${metrics.comparison.productConclusion}

## 我解决这个问题的思路

概述：先把评测问题产品化，再用一个受控 workflow（工作流）把模型差异暴露出来，最后用工具把 trace（执行轨迹）转成证据和结论。

| 步骤 | 我怎么做 | 为什么这样做 |
|---|---|---|
| 先定义产品问题 | 评估两个模型在 Claude Code 里完成同一任务的过程差异 | Agent 生产力评测不能只看最终视频，还要看可控性、恢复能力、安全边界和人工接管成本 |
| 再设计受控任务 | 让两边都生成 30 秒豆包高级套餐推广视频 | 任务容易理解，但会自然触发规则、搜索、图片、脚本、检查、hook 和 subagent |
| 再采集 trace | 用同一 prompt（任务提示）、同一 baseline（基线版本）、隔离 worktree（工作目录）、同一检查命令跑两次 | 先控制变量，后面的差异才更像模型差异 |
| 最后做工具 | 从 trace 和 manifest（产物清单）抽证据，生成 metrics、report 和 HTML | 面试官不需要读原始日志，也能验证结论从哪里来 |

## 工具解决什么问题

概述：工具解决的是“最终结果都完成了，但过程差异看不见”的问题。它把原始 trace 压缩成可验证的证据地图、评分拆解和结论信源。

本工具不做完整 trace viewer（轨迹查看器），也不把重点放在视频审美。它只做本场景最关键的事：把模型执行过程里的证据抽出来，映射到产品评测维度。

## 评测证据地图

概述：这张表把 workflow 要完成的事、要覆盖的 Claude Code 能力、具体 trace 怎么看、工具怎么生效、两个模型的证据和最后结论串在一起。

| Workflow 环节 | 这个环节要完成什么 | 覆盖什么能力 | Trace 怎么看 | 工具怎么生效 | Opus 证据 | DeepSeek 证据 | 影响什么结论 |
|---|---|---|---|---|---|---|---|
${rowsToMarkdown(evaluationMapData(models), ["step", "expected", "capability", "trace", "tool", "opus", "deepseek", "conclusion"])}

## 工具怎么设计，为什么这么设计

概述：工具采用“统一执行环境 -> 证据抽取 -> 评分评测 -> 面试呈现”的设计。这样做的原因是：先保证公平，再保证可验证，最后让产品面试官能读懂。

| 要解决的问题 | 工具设计 | 为什么这样设计最合理 |
|---|---|---|
${rowsToMarkdown(toolDesignData(), ["problem", "design", "why"])}

工具产出的结果有三类：

- \`metrics.json\`：给机器和后续工具读，保存结构化指标。
- \`report.md\`：给复盘读，解释评分、证据和结论。
- \`interview-review.html\`：给面试展示读，把复杂 trace 翻译成产品语言。

## 评分方法

概述：评分的目标是把“结果、过程、风险、表达”分开看。权重按产品影响排序：先看是否交付，再看过程质量和风险，最后看交付表达。

| 模型 | 综合分 | 结果完成（outcome） | 上下文理解 | Claude Code 能力 | 执行质量 | 风险控制 | 产品表达 |
|---|---:|---:|---:|---:|---:|---:|---:|
${models
  .map(
    (model) =>
      `| ${model.label} | ${model.weightedScore} | ${model.scores.outcome} | ${model.scores.contextUnderstanding} | ${model.scores.claudeCodeCapability} | ${model.scores.executionQuality} | ${model.scores.riskControl} | ${model.scores.productExpression} |`
  )
  .join("\n")}

| 维度 | 权重 | 为什么这样定 | Opus 为什么得这个分 | DeepSeek 为什么得这个分 |
|---|---:|---|---|---|
${rowsToMarkdown(scoreBreakdownData(models), ["dimension", "weight", "rule", "opus", "deepseek"])}

## 结论证据卡

概述：下面每条结论都绑定了指标和信源。面试官如果追问，可以从这张表反查到 \`metrics.json\`、manifest、research notes 或 raw trace。

| 结论 | 关键指标 | Opus | DeepSeek | 信源 | 产品含义 |
|---|---|---:|---:|---|---|
${rowsToMarkdown(conclusionEvidenceData(models), ["conclusion", "metric", "opus", "deepseek", "source", "meaning"])}

## Trace 怎么验证

概述：你不需要逐行读完 \`trace.stream.jsonl\`。正确验证方式是先看工具整理出的证据，再按需要反查原始文件。

1. 先看 \`comparison/metrics.json\`：确认两边最终产物、脚本、错误、hook、subagent、URL 等指标。
2. 再看“评测证据地图”：确认每个 workflow 环节是否有 trace 证据。
3. 再看“评分方法”：确认每个分数为什么这么给。
4. 再看“结论证据卡”：确认每句结论对应哪个指标、哪个来源。
5. 如果还要复核，再打开 \`trace.stream.jsonl\`、\`final-video-manifest.json\`、\`research-notes.md\` 和 \`video-run-report.md\`。

## 可展示文件和边界

概述：本轮已经能支撑 trace 评测工具的主线。音频口播可以最后再补，不影响现在这版结构判断。

- HTML 讲解页：\`runs/${metrics.runId}/interview-review.html\`
- 本 MD：\`runs/${metrics.runId}/interview-review.md\`
- 对比报告：\`runs/${metrics.runId}/comparison/report.md\`
- 结构化指标：\`runs/${metrics.runId}/comparison/metrics.json\`
- Opus 视频：\`runs/${metrics.runId}/opus/artifacts/outputs/video-run/final-video.mp4\`
- DeepSeek 视频：\`runs/${metrics.runId}/deepseek/artifacts/outputs/video-run/final-video.mp4\`
- 当前两个最终 MP4 都有音轨，但还没有接入真实 TTS（文字转语音）口播；这个问题放到最后补音频 API。
`;
fs.writeFileSync(markdownPath, markdown);
console.log(`html written: ${path.relative(repoRoot, outputPath)}`);
console.log(`md written: ${path.relative(repoRoot, markdownPath)}`);
