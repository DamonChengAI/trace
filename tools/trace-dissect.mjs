#!/usr/bin/env node
// 确定性补充信号（纯规则，零 LLM）：权威源数、token 分解、执行风格、trace 逐步解剖。
// 不动 compare-traces；为「执行路径」维度和「trace 解剖」提供数据。输出 comparison/trace-extra.json。
import fs from "node:fs";
import path from "node:path";
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
// 权威媒体白名单（官方+权威媒体）——任务适配层，换主体时替换
const AUTHORITATIVE = new Set(["xinhuanet.com","stcn.com","stdaily.com","chinadaily.com.cn","nbd.com.cn","thepaper.cn","gmw.cn","caixinglobal.com","caixin.com","sznews.com","people.com.cn","cctv.com","yicai.com","21jingji.com","doubao.com","volcengine.com"]);
const runIds = process.argv.slice(2).filter(Boolean);
if (!runIds.length) { console.error("用法: node tools/trace-dissect.mjs <runId> [runId...]"); process.exit(1); }

function parse(p){ const out=[]; if(!fs.existsSync(p)) return out; for(const l of fs.readFileSync(p,"utf8").split(/\r?\n/)){ if(l.trim()){ try{out.push(JSON.parse(l));}catch{} } } return out; }
// 脱敏：把本地绝对路径压成 basename，避免 /Users/... 入公开库
const san=(s)=>String(s||"").replace(/\/(?:Users|home)\/[^\s"')]+/g,(p)=>p.split("/").pop());
function readJson(p,f=null){ try{return JSON.parse(fs.readFileSync(p,"utf8"));}catch{return f;} }
// 复用 compare-traces 已抽的 sourceDomains（保证“权威源 ⊆ 来源数”同一份域名列表）
function sourceDomainsFromMetrics(runDir, mid){ const m=readJson(path.join(runDir,"comparison","metrics.json")); const model=m&&Array.isArray(m.models)?m.models.find(x=>x.id===mid):null; return (model&&model.artifacts&&model.artifacts.research&&model.artifacts.research.sourceDomains)||[]; }

function phaseOf(tool, brief){
  const b=(brief||"").toLowerCase();
  if(tool==="WebSearch") return "联网研究";
  if(/real-media:smoke|real-image/.test(b)) return "出图";
  if(/real-audio|tts/.test(b)) return "配音";
  if(/video:compose/.test(b)) return "拼接";
  if(/video:check|security:check|hook:check|npm run check/.test(b)) return "检查";
  if(tool==="Agent") return "复核(子代理)";
  if(/storyboard|research-notes|video:report/.test(b)) return "脚本/研究产出";
  if(["Read","Glob","Grep"].includes(tool)) return "读/探索";
  if(["TaskCreate","TaskUpdate"].includes(tool)) return "规划";
  if(["Write","Edit"].includes(tool)) return "写文件";
  return "其它Bash";
}

function analyze(runDir, mid){
  const evs=parse(path.join(runDir,mid,"trace.stream.jsonl"));
  const lines=evs.length;
  const tc={}; let think=0, explore=false, steps=[];
  for(const e of evs){
    const msg=e.message&&typeof e.message==="object"?e.message:null;
    const content=msg&&Array.isArray(msg.content)?msg.content:null;
    // thinking
    const walk=(x)=>{ if(x&&typeof x==="object"){ if(x.type==="thinking"&&x.thinking) think++; if(x.type==="tool_use"){ tc[x.name]=(tc[x.name]||0)+1; if(x.name==="Agent"&&/explor/i.test(String((x.input||{}).subagent_type||""))) explore=true; } for(const v of Object.values(x)) walk(v);} else if(Array.isArray(x)) x.forEach(walk); };
    walk(e);
    if(e.type==="assistant"&&content) for(const c of content) if(c.type==="tool_use"){ const a=c.input||{}; steps.push({tool:c.name, brief:san(a.command||a.file_path||a.query||a.pattern||a.subagent_type||""), err:null}); }
    if(e.type==="user"&&content) for(const c of content) if(c.type==="tool_result"&&steps.length&&steps[steps.length-1].err===null) steps[steps.length-1].err=Boolean(c.is_error);
    if(e.type==="result"){ const mu=e.modelUsage||{}; let tok=0; for(const u of Object.values(mu)) tok+=["inputTokens","cacheReadInputTokens","cacheCreationInputTokens","outputTokens"].reduce((s,k)=>s+(u[k]||0),0); analyze._tok=tok; }
  }
  // 阶段解剖
  const phases={};
  for(const s of steps){ const p=phaseOf(s.tool,s.brief); phases[p]=phases[p]||{steps:0,errors:0}; phases[p].steps++; if(s.err) phases[p].errors++; }
  // 权威源（用 compare-traces 已抽的 sourceDomains，去 www. 前缀后匹配白名单）
  const ds=sourceDomainsFromMetrics(runDir,mid).map(d=>d.replace(/^www\./,""));
  const auth=ds.filter(d=>AUTHORITATIVE.has(d)).length;
  return {
    style:{ thinkingVisible: think>0, thinkingBlocks: think, read: tc.Read||0, glob: tc.Glob||0, grep: tc.Grep||0, webSearch: tc.WebSearch||0, exploreAgent: explore, traceLines: lines, totalSteps: steps.length, edits: tc.Edit||0 },
    research:{ domainCount: ds.length, authoritativeCount: auth, authoritativeDomains: ds.filter(d=>AUTHORITATIVE.has(d)) },
    tokensTotal: analyze._tok||0,
    dissection: phases,
    errorSteps: steps.map((s,i)=>({i:i+1,...s})).filter(s=>s.err).map(s=>({step:s.i,tool:s.tool,brief:s.brief.slice(0,50)}))
  };
}

for(const runId of runIds){
  const runDir=path.join(repoRoot,"runs",runId);
  const out={ runId, generatedFrom:"trace-dissect (纯规则)", opus: analyze(runDir,"opus"), deepseek: analyze(runDir,"deepseek") };
  const dir=path.join(runDir,"comparison"); fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,"trace-extra.json"), JSON.stringify(out,null,2));
  console.log(`wrote runs/${runId}/comparison/trace-extra.json  权威源 opus=${out.opus.research.authoritativeCount} deepseek=${out.deepseek.research.authoritativeCount}`);
}
