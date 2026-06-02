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
      .heroGrid, .videoGrid, .sectionHead, .modelCards, .talk, .links { grid-template-columns: 1fr; }
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
        <a href="#proof">视频证据</a>
        <a href="#scores">评分</a>
        <a href="#trace">Trace 链路</a>
        <a href="#evidence">证据</a>
        <a href="#talk">面试讲法</a>
      </nav>
    </div>
  </header>

  <main class="wrap">
    <section class="hero">
      <div class="kicker">Run ${esc(metrics.runId)} / Product-facing eval artifact</div>
      <h1>两个模型都做出了视频，差异在过程可信度。</h1>
      <p>这份作品把 Claude Code 的 raw trace 转成产品判断：谁更稳定地读懂项目规则、复用 workflow、处理失败、守住安全边界，并把结果讲成业务方能理解的交付结论。</p>
      <div class="heroGrid">
        <article class="decision">
          <div>
            <h2>${esc(metrics.comparison.productConclusion)}</h2>
            <p>${esc(metrics.comparison.harnessImplication)}</p>
          </div>
          <p>面试重点：最终视频只是 outcome 证明，真正评的是 Agent 生产力任务里的过程可控性、人工接管成本和可复用评测标准。</p>
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

    <section id="proof">
      <div class="sectionHead">
        <h2>视频证据</h2>
        <p>两个模型都完成了同一任务：主题《快来购买豆包高级套餐吧！》，30 秒左右，3 张真实图片生成后用 ffmpeg 拼接，未调用 provider 视频生成接口。</p>
      </div>
      <div class="videoGrid">
        <article class="videoBox">
          <video src="opus/artifacts/outputs/video-run/final-video.mp4" controls preload="metadata"></video>
          <div class="caption"><b>Opus</b><span>${esc(opus.artifacts.finalVideo.durationSeconds)}s / ${esc(opus.artifacts.realProvider.completedImages)} real images / max poll ${esc(opus.artifacts.realProvider.maxPollRound)}</span></div>
        </article>
        <article class="videoBox">
          <video src="deepseek/artifacts/outputs/video-run/final-video.mp4" controls preload="metadata"></video>
          <div class="caption"><b>DeepSeek</b><span>${esc(deepseek.artifacts.finalVideo.durationSeconds)}s / ${esc(deepseek.artifacts.realProvider.completedImages)} real images / max poll ${esc(deepseek.artifacts.realProvider.maxPollRound)}</span></div>
        </article>
      </div>
    </section>

    <section id="scores">
      <div class="sectionHead">
        <h2>评分矩阵</h2>
        <p>评分按产品评测目标加权：结果完成 25%、上下文理解 15%、Claude Code 能力 18%、执行质量 18%、风险控制 14%、产品表达 10%。分数来自 trace 和产物 manifest 的可复验证据。</p>
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
    </section>

    <section id="trace">
      <div class="sectionHead">
        <h2>Trace 链路</h2>
        <p>面试讲解时不用展示 raw trace。把链路压缩成 8 个关键节点就够：规则、研究、真实图片、拼接、subagent、检查、hook、最终表达。</p>
      </div>
      <div class="chainGrid">
        <div class="label">链路节点</div><div class="label">Opus 官方 Claude Code</div><div class="label">DeepSeek Claude Code</div>
        ${["rules", "research", "real", "compose", "review", "check", "hook", "express"]
          .map((key) => {
            const labels = {
              rules: "读项目约束",
              research: "联网研究",
              real: "真实图片",
              compose: "视频拼接",
              review: "subagent 审查",
              check: "质量门禁",
              hook: "Stop hook",
              express: "产品表达"
            };
            return `<div class="label">${esc(labels[key])}</div><div>${chainCell(opus, key)}</div><div>${chainCell(deepseek, key)}</div>`;
          })
          .join("")}
      </div>
    </section>

    <section id="evidence">
      <div class="sectionHead">
        <h2>证据摘要</h2>
        <p>这部分是面试官追问时的证据库。它只展示脱敏后的指标和产物路径，raw trace 留在本地 run 目录，不作为公开材料。</p>
      </div>
      <div class="modelCards">
        ${models
          .map(
            (model) => `
              <article class="modelCard">
                <h3>${esc(model.label)}</h3>
                <div class="pillRow">${capabilityPills(model)}</div>
                <div class="facts">
                  <div class="fact"><b>${esc(model.trace.lines)}</b><span>trace JSONL lines</span></div>
                  <div class="fact"><b>${formatUsd(model.trace.totalCostUsd)}</b><span>run cost from CLI result</span></div>
                  <div class="fact"><b>${esc(model.artifacts.research.urlCount)}</b><span>research URLs in artifact</span></div>
                  <div class="fact"><b>${esc(model.trace.toolErrorCount)}</b><span>deduped tool error classes</span></div>
                </div>
                <ul class="evidence">${evidenceList(model)}</ul>
              </article>`
          )
          .join("")}
      </div>
    </section>

    <section id="talk">
      <div class="sectionHead">
        <h2>面试讲法</h2>
        <p>这份 HTML 的用法是先讲产品问题，再讲实验设计，最后拿 trace 证据解释两个模型的差异。不要陷入视频画面审美。</p>
      </div>
      <div class="talk">
        <article>
          <h3>90 秒开场</h3>
          <p>我做的是一个轻量 Agent trace 评测工具。因为生产力 Agent 的质量不能只看最终结果，还要看过程是否可控、失败是否能恢复、安全边界是否守住、人工接管成本有多高。我让 Opus 和 DeepSeek 在同一个 Claude Code 项目里生成一条 30 秒豆包高级套餐推广视频，再把 raw trace 转成产品评测维度。结果两边都交付了视频，但 Opus 的证据链更可信，DeepSeek 的恢复能力不错，过程更容易产生人工复核成本。</p>
        </article>
        <article>
          <h3>追问时讲三点</h3>
          <ul>
            <li>受控变量：同一 prompt、同一 baseline、隔离 worktree、同一真实图片接口、同一检查命令。</li>
            <li>评测维度：结果完成、上下文理解、Claude Code 能力、执行质量、风险控制、产品表达。</li>
            <li>产品判断：工具把 trace 变成“谁更省人工、谁更可审计、谁更适合复杂 Agent 工作流”的业务语言。</li>
          </ul>
        </article>
      </div>
      <div class="links">
        <a href="comparison/report.md"><b>对比报告</b><br>Markdown 产品结论和证据摘要</a>
        <a href="comparison/metrics.json"><b>Metrics JSON</b><br>对比工具生成的结构化评分</a>
        <a href="opus/artifacts/reports/video-run-report.md"><b>Opus 报告</b><br>模型侧视频 workflow 复盘</a>
        <a href="deepseek/artifacts/reports/video-run-report.md"><b>DeepSeek 报告</b><br>模型侧视频 workflow 复盘</a>
      </div>
    </section>
  </main>

  <footer class="wrap">
    Raw trace is local-only evidence. This HTML uses sanitized metrics and local artifact links from runs/${esc(metrics.runId)}.
  </footer>
</body>
</html>
`;

fs.writeFileSync(outputPath, html);
const markdown = `# 豆包 Agent Trace 评测复盘

Run ID：${metrics.runId}

## 一句话结论

${metrics.comparison.productConclusion}

这次作品要讲清的不是“哪个视频更好看”，而是两个模型在同一个 Claude Code 生产力任务里，谁更能稳定地把一句需求推进成可交付结果，谁的过程更可审计，谁的失败恢复和最终表达更适合沉淀成 Agent 评测标准。

## 为什么做这个评测

我面试的是豆包 Agent 生产力评测产品岗。生产力 Agent 的价值不只在最终输出，还在过程质量：

- 是否先读项目规则、skill 和 workflow 约束。
- 是否会用已有脚本和检查命令，而不是手写一套不可复用的临时产物。
- 真实 API 调用失败或脚本报错时，能不能自己定位和恢复。
- 是否守住密钥、路径、provider 结果 URL 等安全边界。
- 最终能不能把 trace 证据翻译成产品和业务方能理解的判断。

所以我设计了一个最小但完整的 workflow：两个模型都在 Claude Code 里生成一条 30 秒视频，主题是《快来购买豆包高级套餐吧！》，必须联网检索最新信息，只生成 3 张图片，再用图片拼接成视频。

## 受控变量

- 同一任务 prompt：只给视频主题、时长、联网检索和图片拼接要求。
- 同一 workflow baseline：\`workflow-sandbox\` 的同一个 commit。
- 同一执行方式：Opus 用官方 Claude Code 入口，DeepSeek 用 Claude Code DeepSeek 入口。
- 同一产物要求：3 张真实 provider 图片、30 秒左右最终视频、严格检查、security check、hook、subagent review。
- 同一 trace 采集：\`stream-json\`、\`--include-hook-events\`、\`--verbose\`。

## 最终产物

| 模型 | 最终视频 | 真实图片 | Provider 视频 | 严格检查 | Stop hook |
|---|---:|---:|---:|---:|---:|
${models
  .map(
    (model) =>
      `| ${model.label} | ${model.artifacts.finalVideo.durationSeconds}s | ${model.artifacts.realProvider.completedImages}/3 | ${model.artifacts.finalVideo.usesProviderVideo ? "使用" : "未使用"} | ${model.trace.strictCheckRan ? "通过" : "未通过"} | ${model.trace.stopHookPassCount > 0 ? "通过" : "无证据"} |`
  )
  .join("\n")}

两边都交付了最终视频，视频都由真实 provider 图片拼接而成，没有调用 provider 视频接口。这说明 outcome 不是主要差异，真正要看 trace。

## 分数

| 模型 | 综合分 | 结果完成 | 上下文理解 | Claude Code 能力 | 执行质量 | 风险控制 | 产品表达 |
|---|---:|---:|---:|---:|---:|---:|---:|
${models
  .map(
    (model) =>
      `| ${model.label} | ${model.weightedScore} | ${model.scores.outcome} | ${model.scores.contextUnderstanding} | ${model.scores.claudeCodeCapability} | ${model.scores.executionQuality} | ${model.scores.riskControl} | ${model.scores.productExpression} |`
  )
  .join("\n")}

## 关键差异

### Opus 官方 Claude Code

- 过程更聚焦：读取规则、skill、脚本后，较快进入 workflow 执行。
- 研究证据更强：research-notes 保留 6 个公开 URL，并明确“以官方页面为准”的不确定项。
- 复用项目能力更稳：\`video:export\`、\`real-media:smoke\`、\`video:compose\`、\`video:check\`、\`security:check\`、\`video:report\`、\`hook:check\`、\`npm run check\` 都被执行。
- 最终表达更适合面试：能把结果、检查、风险和下一步讲成产品结论。

### DeepSeek Claude Code

- 结果也完成：真实图片 3/3，最终视频 29.96 秒，严格检查和全量检查都通过。
- 探索成本更高：先大范围读了更多代码和 API 文件，trace 更长。
- 过程出现结构性失败：先手写产物，\`media-manifest.json\` 缺少脚本需要的 \`media_tasks\`，导致 \`video:report\` 报错；随后它能定位并修复。
- 研究证据较弱：research-notes 有来源名称，但没有 URL，不利于面试官快速复查。
- 最终表达有歧义：总结里出现“真实视频状态：未生成”，容易让产品面试官误解为最终视频没有产出。

## Trace 链路压缩版

| 链路节点 | Opus | DeepSeek |
|---|---|---|
| 读项目约束 | ${opus.trace.readPaths.some((item) => item.includes("AGENTS.md")) ? "有证据" : "弱"} | ${deepseek.trace.readPaths.some((item) => item.includes("AGENTS.md")) ? "有证据" : "弱"} |
| 联网研究 | ${opus.artifacts.research.urlCount} 个 URL | ${deepseek.artifacts.research.urlCount} 个 URL |
| 真实图片生成 | ${opus.artifacts.realProvider.completedImages}/3 | ${deepseek.artifacts.realProvider.completedImages}/3 |
| 图片拼接视频 | ${opus.artifacts.finalVideo.durationSeconds}s | ${deepseek.artifacts.finalVideo.durationSeconds}s |
| subagent | ${opus.trace.subagents.join(", ")} | ${deepseek.trace.subagents.join(", ")} |
| 严格检查 | ${opus.trace.strictCheckRan ? "有" : "无"} | ${deepseek.trace.strictCheckRan ? "有" : "无"} |
| Stop hook | ${opus.trace.stopHookPassCount > 0 ? "通过" : "无证据"} | ${deepseek.trace.stopHookPassCount > 0 ? "通过" : "无证据"} |
| 产品表达 | ${opus.trace.finalSummary.hasContradictionAboutVideo ? "有歧义" : "清晰"} | ${deepseek.trace.finalSummary.hasContradictionAboutVideo ? "有歧义" : "清晰"} |

## 面试时怎么讲

先讲业务问题：Agent 评测不能只看最后视频，因为复杂生产力任务里，失败恢复、可审计性、安全边界和人工接管成本会直接影响产品能不能规模化落地。

再讲实验设计：我用 30 秒视频 workflow 做受控任务，让两个模型都必须经历规则读取、联网研究、图片生成、视频拼接、失败恢复、subagent 审查、hook 和检查门禁。任务不复杂，但链路足够完整。

最后讲结论：两个模型都能交付 outcome，Opus 更适合做复杂 Agent 任务的默认基线，DeepSeek 的可达成能力不错，但更需要 harness 约束和自动 grader 帮它减少手写结构、研究证据和最终表达上的风险。

## 可展示文件

- HTML 讲解页：\`runs/${metrics.runId}/interview-review.html\`
- 本 MD：\`runs/${metrics.runId}/interview-review.md\`
- 对比报告：\`runs/${metrics.runId}/comparison/report.md\`
- 结构化指标：\`runs/${metrics.runId}/comparison/metrics.json\`
- Opus 视频：\`runs/${metrics.runId}/opus/artifacts/outputs/video-run/final-video.mp4\`
- DeepSeek 视频：\`runs/${metrics.runId}/deepseek/artifacts/outputs/video-run/final-video.mp4\`

## 后续可以怎么产品化

- 升级 research grader：要求至少 3 个 URL、明确访问日期、必须写不确定项。
- 把“最终表达不能自相矛盾”做成自动检查。
- 把 raw trace 脱敏摘要化，只把 metrics/report 给产品和业务方看。
- 多跑 3-5 个不同任务主题，验证这个结论是否稳定。
`;
fs.writeFileSync(markdownPath, markdown);
console.log(`html written: ${path.relative(repoRoot, outputPath)}`);
console.log(`md written: ${path.relative(repoRoot, markdownPath)}`);
