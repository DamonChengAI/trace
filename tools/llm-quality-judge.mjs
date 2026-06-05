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

const RUBRIC = `你是 Agent 评测的软质量评审。下面给你两组匿名产物（A/B），只依据产物本身（research-notes / storyboard / video-run-report）按每个维度给 A、B 各打 0–5 整数（5 最好），不要臆测哪组是哪个模型/品牌，并给一句含"扣分原因"的理由。评分锚点如下，4 分、2 分取相邻档之间：

1 研究质量
  5：多源(≥5)且含权威媒体/官方，关键事实交叉核对，明确标注不确定项（"以官方为准"）
  3：来源中等(3–4)、权威性一般，核对与不确定标注不充分
  1：几乎无来源或以聚合/营销源为主，无法复查，有编造
2 脚本忠实合规
  5：脚本里的事实/数字都能在研究里找到；研究标"测试中/不确定"的(如价格、权益)一律不写死、用"以官方为准"
  3：有少量超出研究的断言，但无硬伤
  1：把不确定的数字/权益当确定写(如把测试期"68元"写死)，或与研究矛盾
3 文案吸引力
  5：推广感强、开头抓人、CTA 明确有力，贴合"推广片"目的
  3：信息准确但偏平实、不够抓人
  1：干瘪、无 CTA、像内部说明
4 失败恢复思路
  5：遇错先定位根因、对症修复、基本不返工
  3：试错为主但最终修好，靠复核/门禁兜住
  1：反复盲目试错、返工多，或没修好
5 产品表达
  5：说人话+业务视角、结构清晰、与产物真实状态无矛盾
  3：基本清楚但偏技术、需读者费劲
  1：技术堆砌或自相矛盾/误导`;

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
  // 盲评：两组产物匿名标 A/B，judge 不知品牌；A/B↔模型映射只在代码里（避免自评偏好）。
  // 顺序固定 A=opus/B=deepseek；如需进一步去位置偏好可随机化此映射并跑多次取多数。
  const A = "opus", B = "deepseek";
  const prompt = `${RUBRIC}\n\n（以下两组产物已匿名，仅标 A/B，请按产物本身评分、勿臆测品牌）\n## 产物组 A\n研究:${artifacts(runDir,A).research.slice(0,4000)}\n脚本:${artifacts(runDir,A).storyboard.slice(0,2000)}\n报告:${artifacts(runDir,A).report.slice(0,2000)}\n\n## 产物组 B\n研究:${artifacts(runDir,B).research.slice(0,4000)}\n脚本:${artifacts(runDir,B).storyboard.slice(0,2000)}\n报告:${artifacts(runDir,B).report.slice(0,2000)}\n\n只输出 JSON：{dims:{维度:{A:分, B:分, reason:"…"}}}`;
  const raw = await callLLM(prompt);
  const rawDims = raw.dims || raw;
  const dims = {};
  for (const [k,v] of Object.entries(rawDims)) dims[k] = { [A]: v.A, [B]: v.B, reason: v.reason };
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(cachePath, JSON.stringify({ runId, judge:`LLM (${LLM_MODEL})`, mode:"live", blind:true, rubric_version:"1.1", dims }, null, 2));
  console.log(`[live] wrote ${cachePath}`);
}
