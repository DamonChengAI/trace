#!/usr/bin/env node
// LLM 软质量层（非确定性）：评规则碰不到的软质量。
// key 留空 → 读缓存 comparison/llm-quality.json（本仓库交付用）；配 key → 调 API 重跑、覆盖缓存。
// 本轮缓存由 Opus 4.8 按下方 rubric 评、已落盘；与 compare-traces 的确定性判定物理分开。
import fs from "node:fs";
import path from "node:path";
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const LLM_API_KEY  = process.env.LLM_API_KEY || "";          // 故意留空：不写死密钥
const LLM_MODEL    = process.env.LLM_MODEL  || "claude-opus-4.8";
const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://api.anthropic.com/v1/messages";

const RUBRIC = `按 0–5 给两个模型各打分（5 最好），每项一句理由。维度：
1 研究质量：研究深度、来源权威性、是否标注不确定项。
2 脚本忠实合规：脚本是否忠实研究、有没有把"测试中/不确定"的价格权益写成确定事实。
3 文案吸引力：作为推广视频，文案是否抓人、CTA 是否有力。
4 失败恢复思路：遇错是挖根因还是试错、复核意见是否采纳。
5 产品表达：最终报告是否说人话、有业务视角、前后无矛盾。
只读 research-notes / storyboard / video-run-report，不看另一模型的结论。`;

function readText(p){ try{ return fs.readFileSync(p,"utf8"); }catch{ return ""; } }
function artifacts(runDir, mid){ const b=path.join(runDir,mid,"artifacts"); return {
  research: readText(path.join(b,"outputs/video-run/research-notes.md")),
  storyboard: readText(path.join(b,"outputs/video-run/storyboard.json")),
  report: readText(path.join(b,"reports/video-run-report.md")),
}; }

// 配 key 时的真实调用（Anthropic messages 格式）；本仓库默认走缓存分支，不触发。
async function callLLM(prompt){
  const res = await fetch(LLM_BASE_URL, { method:"POST",
    headers:{ "content-type":"application/json", "x-api-key": LLM_API_KEY, "anthropic-version":"2023-06-01" },
    body: JSON.stringify({ model: LLM_MODEL, max_tokens: 1500, temperature: 0, messages:[{role:"user",content:prompt}] }) });
  const j = await res.json();
  return JSON.parse((j.content?.[0]?.text||"{}").replace(/^[^{]*/,"").replace(/[^}]*$/,""));
}

const runIds = process.argv.slice(2).filter(Boolean);
for (const runId of runIds){
  const dir = path.join(repoRoot,"runs",runId,"comparison");
  const cachePath = path.join(dir,"llm-quality.json");
  if (!LLM_API_KEY){
    if (fs.existsSync(cachePath)){ const c=JSON.parse(fs.readFileSync(cachePath,"utf8")); console.log(`[cached] ${runId} · ${c.judge} · ${Object.keys(c.dims).length} 维`); }
    else console.error(`[skip] ${runId} 无缓存且无 LLM_API_KEY（配 key 可生成）`);
    continue;
  }
  // 配 key：真跑（多投票取多数可在此扩展）
  const runDir = path.join(repoRoot,"runs",runId);
  const prompt = `${RUBRIC}\n\n## OPUS\n研究:${artifacts(runDir,"opus").research.slice(0,4000)}\n脚本:${artifacts(runDir,"opus").storyboard.slice(0,2000)}\n报告:${artifacts(runDir,"opus").report.slice(0,2000)}\n\n## DEEPSEEK\n研究:${artifacts(runDir,"deepseek").research.slice(0,4000)}\n脚本:${artifacts(runDir,"deepseek").storyboard.slice(0,2000)}\n报告:${artifacts(runDir,"deepseek").report.slice(0,2000)}\n\n只输出 JSON：{dims:{维度:{opus,deepseek,reason}}}`;
  const dims = await callLLM(prompt);
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(cachePath, JSON.stringify({ runId, judge:`LLM (${LLM_MODEL})`, mode:"live", rubric_version:"1.0", dims }, null, 2));
  console.log(`[live] wrote ${cachePath}`);
}
