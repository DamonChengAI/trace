#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function currentRunId() {
  return fs.readFileSync(path.join(repoRoot, ".current-run-id"), "utf8").trim();
}

const runId = process.argv[2] || currentRunId();
const runDir = path.join(repoRoot, "runs", runId);
const metricsPath = path.join(runDir, "comparison", "metrics.json");
const outputPath = path.join(runDir, "interview-review.html");
const markdownPath = path.join(runDir, "interview-review.md");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value.endsWith("\n") ? value : `${value}\n`);
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mdTable(rows, columns) {
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => String(column.value(row)).replace(/\n/g, " ")).join(" | ")} |`);
  return [header, divider, ...body].join("\n");
}

function htmlTable(rows, columns) {
  return `
    <table>
      <thead><tr>${columns.map((column) => `<th>${esc(column.label)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows
          .map((row) => `<tr>${columns.map((column) => `<td>${esc(column.value(row))}</td>`).join("")}</tr>`)
          .join("")}
      </tbody>
    </table>`;
}

function formatDurationMs(value) {
  if (!Number.isFinite(Number(value))) return "n/a";
  const totalSeconds = Math.round(Number(value) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}

function tierLabel(model, key) {
  return model.tiers?.[key]?.label || model.scores?.tiers?.[key]?.label || "n/a";
}

function modelRows(metrics) {
  if (metrics.kind === "stability-aggregate") {
    return metrics.models.map((model) => ({
      model: model.label,
      outcome: tierLabel(model, "outcome"),
      context: tierLabel(model, "contextUnderstanding"),
      capability: tierLabel(model, "claudeCodeCapability"),
      execution: tierLabel(model, "executionQuality"),
      risk: tierLabel(model, "riskControl"),
      product: tierLabel(model, "productExpression"),
      key: model.perRun
        .map((item) => `${item.runId}: URL=${item.keyMetrics.research_urls}, errors=${item.keyMetrics.tool_errors}, time=${item.keyMetrics.duration_label || formatDurationMs(item.keyMetrics.duration_ms)}, TTS=${item.keyMetrics.tts_status}`)
        .join("; ")
    }));
  }

  return metrics.models.map((model) => ({
    model: model.label,
    outcome: tierLabel(model, "outcome"),
    context: tierLabel(model, "contextUnderstanding"),
    capability: tierLabel(model, "claudeCodeCapability"),
    execution: tierLabel(model, "executionQuality"),
    risk: tierLabel(model, "riskControl"),
    product: tierLabel(model, "productExpression"),
    key: `URL=${model.artifacts.research.urlCount}; errors=${model.trace.toolErrorCount}; safety=${model.artifacts.security.findings}; time=${formatDurationMs(model.trace.durationMs)}; TTS=${model.artifacts.audioProvider.status}`
  }));
}

function stabilityRows(metrics) {
  if (metrics.kind === "stability-aggregate") {
    return metrics.stability.rows.map((row) => ({
      label: row.label,
      run1: `${row.perRun[0]?.leader || "n/a"}: ${row.perRun[0]?.reason || ""}`,
      run2: `${row.perRun[1]?.leader || "n/a"}: ${row.perRun[1]?.reason || ""}`,
      status:
        row.conclusionLevel === "stable_difference"
          ? "稳定复现"
          : row.conclusionLevel === "stable_tie"
            ? "稳定同档"
            : "待观察",
      conclusion: row.conclusionText
    }));
  }

  return metrics.comparison.keyFindings.map((row) => ({
    label: row.label,
    run1: row.leader === "tie" ? "同档" : `${row.leader} 更强`,
    run2: "等待第二轮",
    status: "单轮观察",
    conclusion: row.reason
  }));
}

function evidenceRows(metrics) {
  if (metrics.kind === "stability-aggregate") {
    return metrics.comparison.promotedConclusions.map((row) => ({
      conclusion: row.label,
      level: "稳定结论",
      source: row.perRun.map((item) => `${item.runId}: ${JSON.stringify(item.sources)}`).join("; "),
      meaning: row.conclusion
    }));
  }

  return metrics.models.flatMap((model) =>
    model.evidence.map((item) => ({
      conclusion: `${model.label} - ${item.dimension}`,
      level: item.level,
      source: item.source,
      meaning: item.claim
    }))
  );
}

function timingRows(metrics) {
  const rows = [];
  for (const model of metrics.models) {
    if (metrics.kind === "stability-aggregate") {
      rows.push({
        model: model.label,
        duration: model.perRun.map((item) => `${item.runId}: ${item.keyMetrics.duration_label || formatDurationMs(item.keyMetrics.duration_ms)}`).join("; "),
        apiDuration: model.perRun.map((item) => `${item.runId}: ${item.keyMetrics.api_duration_label || formatDurationMs(item.keyMetrics.api_duration_ms)}`).join("; "),
        turns: model.perRun.map((item) => `${item.runId}: ${item.keyMetrics.turns ?? "n/a"}`).join("; "),
        meaning: "端到端耗时用于衡量一次 Agent 交付成本；API 耗时只作辅助参考。"
      });
    } else {
      rows.push({
        model: model.label,
        duration: formatDurationMs(model.trace.durationMs),
        apiDuration: formatDurationMs(model.trace.apiDurationMs),
        turns: model.trace.turns ?? "n/a",
        meaning: "端到端耗时包含模型思考、工具调用、provider 等待、检查和最终总结。"
      });
    }
  }
  return rows;
}

function capabilityRows(metrics) {
  const rows = [];
  const models = metrics.kind === "stability-aggregate" ? metrics.models : metrics.models;
  for (const model of models) {
    if (metrics.kind === "stability-aggregate") {
      rows.push({
        model: model.label,
        planning: model.perRun.map((item) => `${item.runId}: 已记录`).join("; "),
        search: model.perRun.map((item) => `${item.runId}: URL=${item.keyMetrics.research_urls}`).join("; "),
        scripts: "见每轮 metrics.json",
        review: "hook / subagent 见每轮 metrics.json",
        safety: model.perRun.map((item) => `${item.runId}: findings=${item.keyMetrics.security_findings}`).join("; "),
        tts: model.perRun.map((item) => `${item.runId}: ${item.keyMetrics.tts_status}`).join("; "),
        workTime: model.perRun.map((item) => `${item.runId}: ${item.keyMetrics.duration_label || formatDurationMs(item.keyMetrics.duration_ms)}`).join("; ")
      });
    } else {
      rows.push({
        model: model.label,
        planning: `plan events=${model.trace.planning.taskCreateCount + model.trace.planning.taskUpdateCount}`,
        search: `search=${model.trace.webSearchRequests}, URL=${model.artifacts.research.urlCount}`,
        scripts: `${model.trace.scriptRuns.length} scripts`,
        review: `hook=${model.trace.stopHookPassCount}, subagent=${model.trace.subagents.join(", ") || "none"}`,
        safety: `findings=${model.artifacts.security.findings}`,
        tts: `${model.artifacts.audioProvider.status}, fallback=${model.artifacts.audioProvider.fallback}`,
        workTime: `${formatDurationMs(model.trace.durationMs)}, API=${formatDurationMs(model.trace.apiDurationMs)}`
      });
    }
  }
  return rows;
}

function confidenceText(metrics) {
  return metrics.confidence?.statement || "当前 metrics 未写入置信度说明。";
}

function subtitle(metrics) {
  return metrics.kind === "stability-aggregate"
    ? `Round 2 / ${metrics.runIds.join(" + ")}`
    : `Single run / ${metrics.runId}`;
}

function heroTitle(metrics) {
  if (metrics.kind === "stability-aggregate") {
    return "一套可复用、可反查的 Agent 评测方法。";
  }
  return "先把过程证据整理清楚，再等第二轮确认稳定性。";
}

function markdown(metrics) {
  return [
    `# 豆包 Agent 生产力评测作品：${metrics.runId}`,
    "",
    `## 结论`,
    "",
    metrics.comparison.productConclusion,
    "",
    metrics.comparison.harnessImplication,
    "",
    `置信度：${confidenceText(metrics)}`,
    "",
    "## 维度档位",
    "",
    "面试页展示定性档位和关键指标差，避免两位小数总分带来的伪精确。",
    "",
    mdTable(modelRows(metrics), [
      { label: "模型", value: (row) => row.model },
      { label: "结果", value: (row) => row.outcome },
      { label: "上下文", value: (row) => row.context },
      { label: "能力覆盖", value: (row) => row.capability },
      { label: "执行质量", value: (row) => row.execution },
      { label: "风险控制", value: (row) => row.risk },
      { label: "产品表达", value: (row) => row.product },
      { label: "关键指标", value: (row) => row.key }
    ]),
    "",
    "## 工作时间 / 过程成本",
    "",
    "工作时间来自 trace（执行轨迹）最后的 `duration_ms`。它是端到端耗时，包含模型思考、工具调用、provider 等待、检查和最终总结；`duration_api_ms` 只作辅助参考。",
    "",
    mdTable(timingRows(metrics), [
      { label: "模型", value: (row) => row.model },
      { label: "端到端耗时", value: (row) => row.duration },
      { label: "API 耗时", value: (row) => row.apiDuration },
      { label: "turns", value: (row) => row.turns },
      { label: "口径", value: (row) => row.meaning }
    ]),
    "",
    "## 稳定性 / 差异对照",
    "",
    mdTable(stabilityRows(metrics), [
      { label: "差异点", value: (row) => row.label },
      { label: "第 1 次", value: (row) => row.run1 },
      { label: "第 2 次", value: (row) => row.run2 },
      { label: "状态", value: (row) => row.status },
      { label: "写法", value: (row) => row.conclusion }
    ]),
    "",
    "## 能力覆盖",
    "",
    mdTable(capabilityRows(metrics), [
      { label: "模型", value: (row) => row.model },
      { label: "Planning（任务规划）", value: (row) => row.planning },
      { label: "Search（联网检索）", value: (row) => row.search },
      { label: "Scripts（命令脚本）", value: (row) => row.scripts },
      { label: "Review（复核）", value: (row) => row.review },
      { label: "Security（安全）", value: (row) => row.safety },
      { label: "TTS（文字转语音）", value: (row) => row.tts },
      { label: "Work Time（工作时间）", value: (row) => row.workTime }
    ]),
    "",
    "## 结论信源",
    "",
    mdTable(evidenceRows(metrics), [
      { label: "结论", value: (row) => row.conclusion },
      { label: "级别", value: (row) => row.level },
      { label: "信源", value: (row) => row.source },
      { label: "产品含义", value: (row) => row.meaning }
    ]),
    "",
    "## 边界",
    "",
    "- 不评视频审美。",
    "- 音频只讲真实生成链路覆盖和降级状态，不讲成视频观感卖点。",
    "- Memory（长期记忆）未纳入硬验收。",
    "- raw trace、env 内容、provider URL、本地绝对路径不进入公开材料。"
  ].join("\n");
}

function html(metrics) {
  const modelTable = htmlTable(modelRows(metrics), [
    { label: "模型", value: (row) => row.model },
    { label: "结果", value: (row) => row.outcome },
    { label: "上下文", value: (row) => row.context },
    { label: "能力覆盖", value: (row) => row.capability },
    { label: "执行质量", value: (row) => row.execution },
    { label: "风险控制", value: (row) => row.risk },
    { label: "产品表达", value: (row) => row.product },
    { label: "关键指标", value: (row) => row.key }
  ]);
  const stabilityTable = htmlTable(stabilityRows(metrics), [
    { label: "差异点", value: (row) => row.label },
    { label: "第 1 次", value: (row) => row.run1 },
    { label: "第 2 次", value: (row) => row.run2 },
    { label: "状态", value: (row) => row.status },
    { label: "写法", value: (row) => row.conclusion }
  ]);
  const timingTable = htmlTable(timingRows(metrics), [
    { label: "模型", value: (row) => row.model },
    { label: "端到端耗时", value: (row) => row.duration },
    { label: "API 耗时", value: (row) => row.apiDuration },
    { label: "turns", value: (row) => row.turns },
    { label: "口径", value: (row) => row.meaning }
  ]);
  const capabilityTable = htmlTable(capabilityRows(metrics), [
    { label: "模型", value: (row) => row.model },
    { label: "Planning（任务规划）", value: (row) => row.planning },
    { label: "Search（联网检索）", value: (row) => row.search },
    { label: "Scripts（命令脚本）", value: (row) => row.scripts },
    { label: "Review（复核）", value: (row) => row.review },
    { label: "Security（安全）", value: (row) => row.safety },
    { label: "TTS（文字转语音）", value: (row) => row.tts },
    { label: "Work Time（工作时间）", value: (row) => row.workTime }
  ]);
  const evidenceTable = htmlTable(evidenceRows(metrics), [
    { label: "结论", value: (row) => row.conclusion },
    { label: "级别", value: (row) => row.level },
    { label: "信源", value: (row) => row.source },
    { label: "产品含义", value: (row) => row.meaning }
  ]);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>豆包 Agent 评测作品 ${esc(metrics.runId)}</title>
  <style>
    :root {
      --paper: #f4efe5;
      --ink: #181612;
      --muted: #6d655a;
      --line: #d6cbb8;
      --panel: #fffaf0;
      --green: #0f6b5f;
      --blue: #2d5a87;
      --red: #9b3a2a;
      --gold: #b78614;
      --charcoal: #24211d;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background:
        linear-gradient(90deg, rgba(24, 22, 18, .04) 1px, transparent 1px),
        linear-gradient(rgba(24, 22, 18, .03) 1px, transparent 1px),
        var(--paper);
      background-size: 28px 28px;
      font-family: "Avenir Next", "PingFang SC", "Hiragino Sans GB", sans-serif;
      letter-spacing: 0;
    }
    .wrap { width: min(1180px, calc(100vw - 32px)); margin: 0 auto; }
    header {
      border-bottom: 2px solid var(--ink);
      padding: 22px 0;
      background: rgba(244, 239, 229, .94);
      position: sticky;
      top: 0;
      z-index: 3;
      backdrop-filter: blur(10px);
    }
    nav { display: flex; gap: 16px; flex-wrap: wrap; justify-content: space-between; align-items: center; }
    nav b { font-family: "Iowan Old Style", "Songti SC", serif; font-size: 18px; }
    nav a { color: var(--muted); text-decoration: none; font-size: 13px; margin-left: 12px; }
    .hero { padding: 54px 0 30px; }
    .kicker { color: var(--green); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
    h1 {
      font-family: "Iowan Old Style", "Songti SC", serif;
      font-size: clamp(40px, 7vw, 84px);
      line-height: .98;
      letter-spacing: 0;
      max-width: 1050px;
      margin: 14px 0 18px;
    }
    .lead {
      max-width: 860px;
      color: var(--charcoal);
      font-size: 19px;
      line-height: 1.72;
      margin: 0;
    }
    .heroGrid {
      display: grid;
      grid-template-columns: 1.2fr .8fr;
      gap: 18px;
      margin-top: 26px;
    }
    .statement, .side {
      border: 2px solid var(--ink);
      background: var(--panel);
      padding: 22px;
    }
    .statement h2 {
      font-family: "Iowan Old Style", "Songti SC", serif;
      font-size: 30px;
      line-height: 1.18;
      margin: 0 0 14px;
    }
    .statement p, .side p {
      color: var(--muted);
      line-height: 1.68;
      margin: 0;
    }
    .side {
      background: var(--charcoal);
      color: var(--paper);
      display: grid;
      gap: 14px;
    }
    .side b { color: #eadfc9; }
    .side p { color: #eadfc9; }
    section { padding: 34px 0; border-top: 1px solid var(--line); }
    .sectionHead {
      display: grid;
      grid-template-columns: 260px 1fr;
      gap: 24px;
      align-items: start;
      margin-bottom: 18px;
    }
    h2 {
      font-family: "Iowan Old Style", "Songti SC", serif;
      font-size: 34px;
      line-height: 1.06;
      margin: 0;
    }
    .sectionHead p { margin: 0; color: var(--muted); line-height: 1.7; max-width: 780px; }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 2px solid var(--ink);
      background: rgba(255, 250, 240, .82);
    }
    th, td {
      border: 1px solid var(--line);
      padding: 12px;
      text-align: left;
      vertical-align: top;
      font-size: 14px;
      line-height: 1.55;
    }
    th { background: #efe5d4; font-weight: 800; }
    .method {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
    }
    .step {
      border: 2px solid var(--ink);
      background: var(--panel);
      padding: 16px;
      min-height: 150px;
    }
    .step b { display: block; font-size: 15px; margin-bottom: 8px; color: var(--green); }
    .step p { margin: 0; color: var(--muted); line-height: 1.6; font-size: 14px; }
    .boundary {
      border: 2px solid var(--gold);
      background: #fbf0ce;
      padding: 16px;
      color: var(--charcoal);
      line-height: 1.68;
    }
    footer { color: var(--muted); padding: 26px 0 46px; font-size: 12px; }
    @media (max-width: 860px) {
      header { position: static; }
      .heroGrid, .sectionHead, .method { grid-template-columns: 1fr; }
      h1 { font-size: 42px; }
      h2 { font-size: 28px; }
      th, td { font-size: 13px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <nav>
        <b>Doubao Agent Trace Eval</b>
        <span>
          <a href="#method">方法</a>
          <a href="#tiers">档位</a>
          <a href="#timing">耗时</a>
          <a href="#stability">稳定性</a>
          <a href="#coverage">覆盖</a>
          <a href="#evidence">信源</a>
        </span>
      </nav>
    </div>
  </header>

  <main class="wrap">
    <section class="hero">
      <div class="kicker">${esc(subtitle(metrics))} / Product-facing eval artifact（产品评测作品）</div>
      <h1>${esc(heroTitle(metrics))}</h1>
      <p class="lead">这份作品把 Claude Code 的 trace（执行轨迹）翻译成产品判断：谁更稳定地读懂项目规则、复用 workflow（工作流）、处理失败、守住安全边界，并把结果讲成业务方能理解的交付结论。</p>
      <div class="heroGrid">
        <article class="statement">
          <h2>${esc(metrics.comparison.productConclusion)}</h2>
          <p>${esc(metrics.comparison.harnessImplication)}</p>
        </article>
        <aside class="side">
          <p><b>置信度</b><br>${esc(confidenceText(metrics))}</p>
          <p><b>展示原则</b><br>主展示定性档位和关键指标差，不展示两位小数总分。</p>
          <p><b>边界</b><br>不评视频审美；TTS（文字转语音）只看链路覆盖和降级状态。</p>
        </aside>
      </div>
    </section>

    <section id="method">
      <div class="sectionHead">
        <h2>怎么评</h2>
        <p>任务本身是一条 30 秒豆包高级套餐推广视频。评测重点放在 Agent（智能体）完成生产力任务的过程：上下文、规划、工具使用、失败恢复、安全和表达。</p>
      </div>
      <div class="method">
        <div class="step"><b>1. 锁环境</b><p>同一 prompt（任务提示）、同一 baseline（基线版本）、隔离 worktree（工作目录）、同一检查命令。</p></div>
        <div class="step"><b>2. 留 trace</b><p>从启动命令开始保留 stream-json（流式 JSON）、stderr、diff、产物清单和模型总结。</p></div>
        <div class="step"><b>3. 抽证据</b><p>把原始轨迹压成指标：研究来源、脚本、hook（钩子检查）、subagent（子代理）、错误和安全检查。</p></div>
        <div class="step"><b>4. 做判断</b><p>只把稳定复现的差异写进主结论，偶发差异标待观察。</p></div>
      </div>
    </section>

    <section id="tiers">
      <div class="sectionHead">
        <h2>维度档位</h2>
        <p>档位服务产品判断：能不能交付、过程是否可控、人工复查成本高不高。数值只留在 metrics（指标）里做审计。</p>
      </div>
      ${modelTable}
    </section>

    <section id="timing">
      <div class="sectionHead">
        <h2>工作时间 / 过程成本</h2>
        <p>端到端耗时取自 trace（执行轨迹）最后的 duration_ms，包含模型思考、工具调用、provider 等待、检查和最终总结。API 耗时只作辅助参考。</p>
      </div>
      ${timingTable}
    </section>

    <section id="stability">
      <div class="sectionHead">
        <h2>稳定性对照</h2>
        <p>两轮实验用于确认关键差异是否复现。稳定项进入结论，偶发项只做观察。</p>
      </div>
      ${stabilityTable}
    </section>

    <section id="coverage">
      <div class="sectionHead">
        <h2>能力覆盖</h2>
        <p>这里检查 Claude Code 核心能力是否真的被任务触发：规划、联网检索、脚本、复核、安全和 TTS（文字转语音）链路。</p>
      </div>
      ${capabilityTable}
    </section>

    <section id="evidence">
      <div class="sectionHead">
        <h2>结论信源</h2>
        <p>每条结论都能回到 metrics.json、manifest（产物清单）、research notes（研究笔记）或 raw trace（原始执行轨迹）。</p>
      </div>
      ${evidenceTable}
    </section>

    <section>
      <div class="boundary">
        公开作品只保留脱敏后的判断和相对信源。raw trace、env 内容、provider URL、本地绝对路径和真实素材路径留在本地证据层。
      </div>
    </section>
  </main>

  <footer class="wrap">
    Generated from ${esc(path.relative(repoRoot, metricsPath))}. HTML/MD are derived artifacts; rerun tools after trace changes.
  </footer>
</body>
</html>`;
}

const metrics = readJson(metricsPath);
writeText(outputPath, html(metrics));
writeText(markdownPath, markdown(metrics));
console.log(`wrote ${path.relative(repoRoot, outputPath)}`);
console.log(`wrote ${path.relative(repoRoot, markdownPath)}`);
