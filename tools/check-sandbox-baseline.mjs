#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const sandboxRoot = path.resolve(process.argv[2] || "/Users/dacheng/Desktop/ship/workflow-sandbox");

const forbiddenRootEntries = new Set([
  "CLAUDE.md",
  "plans",
  "execution",
  "references",
  "runs",
  "codex-goal.md"
]);

const forbiddenNamePatterns = [
  /round2-refined-eval-plan\.md$/,
  /dual-model-execution-runbook\.md$/,
  /task-prompt\.md$/,
  /codex-goal\.md$/
];

const ignoredDirs = new Set([".git", "node_modules", ".next", "outputs", "mock-outputs"]);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    files.push(fullPath);
    if (entry.isDirectory()) walk(fullPath, files);
  }
  return files;
}

function toProjectPath(filePath) {
  return path.relative(sandboxRoot, filePath).split(path.sep).join("/");
}

if (!fs.existsSync(sandboxRoot)) {
  console.error(`sandbox root does not exist: ${sandboxRoot}`);
  process.exit(1);
}

const findings = [];
for (const entry of fs.readdirSync(sandboxRoot, { withFileTypes: true })) {
  if (forbiddenRootEntries.has(entry.name)) findings.push(entry.name);
}

for (const filePath of walk(sandboxRoot)) {
  const projectPath = toProjectPath(filePath);
  if (forbiddenNamePatterns.some((pattern) => pattern.test(projectPath))) {
    findings.push(projectPath);
  }
}

const uniqueFindings = [...new Set(findings)].sort();
if (uniqueFindings.length > 0) {
  console.error("sandbox baseline contains eval-repo leakage:");
  for (const finding of uniqueFindings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("sandbox baseline leakage check passed");
console.log(`sandbox=${sandboxRoot}`);
