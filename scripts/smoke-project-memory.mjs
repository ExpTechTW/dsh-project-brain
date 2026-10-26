import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { scanProject } from "../src/scanner.js";
import { resolveProjectPath } from "../src/host/store/path-resolver.js";
import { setupInjector } from "../src/host/injector.js";
import {
  MIN_NEW_MESSAGES,
  countSessionMessages,
  createIdleSummaryScheduler,
  lastSummarizedMessageCount,
  summarizeOne,
} from "../src/host/summarizer.js";
import { evidenceMatchesTranscript, extractSessionMemories } from "../src/host/memory/session-extractor.js";
import { contextWindow, detectSignal, fallbackCandidate, handleOne } from "../src/host/realtime-memory.js";
import { admitMemory, enforceCoreCap, getCoreLimits, hasUnresolvedReference, maxPinnedCount } from "../src/host/memory/admit.js";
import { applyMemoryDelete, applyMemoryEdit, applyMemoryStatus } from "../src/host/memory/edit.js";
import { ACCESS_THROTTLE_MS, applyAccessTouch } from "../src/host/memory/access.js";
import { planMemoryVacuum, planTimelineTrim, vacuumBrain } from "../src/host/memory/vacuum.js";
import { retrieveMemories, trustFactor } from "../src/host/memory/retrieval.js";
import { appendJsonl, readJsonl, writeJsonl } from "../src/host/store/brain-files.js";
import { brainTxKey, pendingLockCount, withWriteLock } from "../src/host/store/write-lock.js";
import { isCoreMemory } from "../src/host/store/brain-logic.js";
import { buildMemoryArchiveTool, buildMemorySupersedeTool } from "../src/tools/memory.js";
import { buildDreamTool } from "../src/tools/dream.js";
import { handleMemoryMutation } from "../src/host/rpc/sidebar.js";
import { createMemoryConfigRuntime } from "../src/host/memory/config.js";

const root = mkdtempSync(join(tmpdir(), "dsh-brain-memory-"));
const projectA = join(root, "project-a");
const projectB = join(root, "project-b");
const uninitialized = join(root, "plain-project");

function target(path) { return { path: resolve(path) }; }
const fsAdapter = {
  async resolve(path, options) {
    const base = options && options.cwd ? (options.cwd.path || String(options.cwd)) : process.cwd();
    return target(resolve(base, path));
  },
  processPath(value) { return value.path; },
  async listDir(value) {
    return readdirSync(value.path, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
      target: target(join(value.path, entry.name)),
    }));
  },
  async readText(value) { try { return readFileSync(value.path, "utf8"); } catch { return null; } },
  async writeText(value, text) {
    mkdirSync(dirname(value.path), { recursive: true });
    writeFileSync(value.path, text, "utf8");
    return true;
  },
  async stat(value) { return statSync(value.path); },
};

function writeBrain(projectPath, name, memoryTitle) {
  mkdirSync(join(projectPath, ".project-brain"), { recursive: true });
  writeFileSync(join(projectPath, ".project-brain", "project.json"), JSON.stringify({
    id: "brain-" + name, name, techStack: { backend: "Node.js" }, createdAt: Date.now(), updatedAt: Date.now(),
  }));
  writeFileSync(join(projectPath, ".project-brain", "memory.jsonl"), JSON.stringify({
    id: "mem-" + name, type: "decision", title: memoryTitle, content: memoryTitle, importance: 0.9, createdAt: Date.now(),
  }) + "\n");
  writeFileSync(join(projectPath, ".project-brain", "todo.jsonl"), "");
  writeFileSync(join(projectPath, ".project-brain", "timeline.jsonl"), "");
}

mkdirSync(join(projectA, "src"), { recursive: true });
mkdirSync(projectB, { recursive: true });
mkdirSync(uninitialized, { recursive: true });
writeFileSync(join(projectA, "package.json"), JSON.stringify({
  name: "publishable-app", description: "A reusable project memory service", dependencies: { fastify: "latest" }, devDependencies: { typescript: "latest" },
}));
writeFileSync(join(projectA, "src", "main.ts"), "export const app = true;\n");
writeFileSync(join(projectA, "script.rb"), "puts 'ok'\n");
writeBrain(projectA, "project-a", "A only decision");
writeBrain(projectB, "project-b", "B only decision");

const scan = await scanProject(fsAdapter, projectA);
assert.equal(scan.projectName, "publishable-app");
assert.equal(scan.description, "A reusable project memory service");
assert.equal(scan.entrypoints.some((entry) => entry.path === "src/main.ts"), true);
assert.equal(scan.languages.ruby, 1);
assert.equal(scan.tooling.includes("TypeScript"), true);

assert.equal(resolveProjectPath(
  { path: projectB },
  { session: { header: { cwd: projectA } } },
  { workspaceRoot: projectB },
), projectA, "live session workspace must win over model-provided path");

// 迴歸保護：dsh-tools 的 ToolRunContext 只暴露 { agent?, ... }，沒有 session/ctx/sessionId。
// 必須能從 exec.agent.session.header.cwd 解析當前專案，否則工具在不顯式傳 path 時全部報錯。
assert.equal(resolveProjectPath(
  { path: projectB },
  { agent: { session: { header: { cwd: projectA } } } },
  { workspaceRoot: projectB },
), projectA, "exec.agent.session.header.cwd (ToolRunContext shape) must resolve project");

// sessionId 走 sessions service 也相容 exec.agent.id
assert.equal(resolveProjectPath(
  { path: projectB },
  { agent: { id: "sess-a", session: { header: { cwd: projectA } } } },
  { workspaceRoot: projectB },
), projectA, "exec.agent with id+session both must resolve");

// 無顯式 path、session cwd 和 workspaceRoot 都是 DSH Desktop 安裝路徑 → 安全降級到 "."
//   （不是靜默串寫到 DSH Desktop 安裝目錄）
assert.equal(resolveProjectPath(
  {},
  { agent: { session: { header: { cwd: "/Users/x/AppData/Local/Programs/DSH Desktop" } } } },
  { workspaceRoot: "/Users/x/AppData/Local/Programs/DSH Desktop" },
), ".", "DSH Desktop install paths must not be silently used as project cwd");

const handlers = new Map();
const sections = [];
const ctx = {
  get(name) {
    if (name === "systemPrompt") return { section(section) { sections.push(section); return () => {}; } };
    if (name === "sessions") return { get() { return null; } };
    return null;
  },
  on(event, handler) { const list = handlers.get(event) || []; list.push(handler); handlers.set(event, list); },
  emit(event, payload) { for (const handler of handlers.get(event) || []) handler(payload); },
  logger: { info() {}, warn() {} },
};
setupInjector(ctx, fsAdapter, null);
ctx.emit("agent/session-start", { agent: { session: { id: "session-a", header: { cwd: projectA } } } });
ctx.emit("agent/session-start", { agent: { session: { id: "session-b", header: { cwd: projectB } } } });
await new Promise((resolveWait) => setTimeout(resolveWait, 80));
const section = sections.find((item) => item.name === "project-brain-context");
assert.ok(section);
const contextA = section.text({ sessionId: "session-a" });
const contextB = section.text({ sessionId: "session-b" });
assert.match(contextA, /A only decision/);
assert.doesNotMatch(contextA, /B only decision/);
assert.match(contextB, /B only decision/);
assert.doesNotMatch(contextB, /A only decision/);

const skipped = await summarizeOne({ fs: fsAdapter, projectPath: uninitialized, sessionId: "plain-session" });
assert.equal(skipped.skipped, "not_initialized");
assert.equal(existsSync(join(uninitialized, ".project-brain")), false);

spawnSync("git", ["init", "--quiet"], { cwd: projectA });
spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: projectA });
spawnSync("git", ["config", "user.name", "Test"], { cwd: projectA });
spawnSync("git", ["add", "-A"], { cwd: projectA });
spawnSync("git", ["commit", "--quiet", "-m", "baseline"], { cwd: projectA });
writeFileSync(join(projectA, "src", "feature.ts"), "export const feature = true;\n");
spawnSync("git", ["add", "-A"], { cwd: projectA });
spawnSync("git", ["commit", "--quiet", "-m", "feature"], { cwd: projectA });

const first = await summarizeOne({ fs: fsAdapter, projectPath: projectA, sessionId: "summary-1" });
assert.equal(first.changedFiles > 0, true);
// 同一會話沒有新訊息 → 跳過（冪等按訊息增量算，不再是「這個 session 摘過就永不再摘」）
const sameSession = await summarizeOne({ fs: fsAdapter, projectPath: projectA, sessionId: "summary-1" });
assert.equal(sameSession.skipped, "no_new_messages");
// 同一會話又聊了若干輪 → 必須能再沉澱一次，否則長會話第一次之後的工作全丟
const grownSession = await summarizeOne({
  fs: fsAdapter, projectPath: projectA, sessionId: "summary-1",
  session: { deriveMessages: () => Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "m" + i })) },
});
assert.equal(grownSession.skipped == null, true, "同一會話有足夠新訊息時可以再次摘要");
const secondSession = await summarizeOne({ fs: fsAdapter, projectPath: projectA, sessionId: "summary-2" });
assert.equal(secondSession.skipped == null, true, "不同 session 仍會寫 timeline 摘要");
assert.equal(secondSession.semanticMemories || 0, 0, "無 LLM 時 git diff 不寫 change 記憶");
const semanticJson = JSON.stringify({ memories: [
  { type: "decision", title: "選擇事務資料庫", content: "專案決定使用支援事務的資料庫，以保障訂單寫入一致性。", evidence: "業務資料庫必須支援事務能力", durable: true, importance: 0.8, confidence: 0.9 },
  { type: "requirement", title: "訂單必須保持一致", content: "訂單建立流程必須保證跨表寫入的一致性和可恢復性。", evidence: "跨表寫入的一致性和故障恢復", durable: true, importance: 0.85, confidence: 0.9 },
] });
const semanticSession = { deriveMessages() { return [{ role: "user", content: [{ type: "text", text: "我們經過方案評審，決定業務資料庫必須支援事務能力，用於保證訂單建立時跨表寫入的一致性和故障恢復。請把這個長期約束記錄下來。" }] }]; } };
const semanticLlm = { async *stream() { yield { type: "text-delta", index: 0, text: semanticJson }; yield { type: "finish", reason: { kind: "stop" } }; } };
const semanticResult = await summarizeOne({
  fs: fsAdapter, projectPath: projectA, sessionId: "summary-3", session: semanticSession,
  llm: semanticLlm, route: { provider: "test", model: "test-model" },
});
assert.equal(semanticResult.semanticMemories, 2);
const memories = readFileSync(join(projectA, ".project-brain", "memory.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
assert.equal(memories.filter((item) => item.source && item.source.kind === "session_summary").length, 0);
assert.equal(memories.filter((item) => item.source && item.source.kind === "session_semantic").length, 2);

// ───────── 改動 6: 即時記憶弱訊號檢測 ─────────
const weak1 = detectSignal("以後都用 PostgreSQL，別再用 MySQL 了");
assert.ok(weak1 && weak1.strength === "weak", "以後都... → weak signal");
assert.match(weak1.content, /PostgreSQL/);
const weak2 = detectSignal("下次記得先跑測試再提交");
assert.ok(weak2 && weak2.strength === "weak", "下次記得... → weak signal");
const weak3 = detectSignal("約定所有 API 必須用 POST");
assert.ok(weak3 && weak3.strength === "weak", "約定... → weak signal");
const weak4 = detectSignal("going forward, use TypeScript for all new modules");
assert.ok(weak4 && weak4.strength === "weak", "going forward... → weak signal");
const strong1 = detectSignal("記住：PostgreSQL 是首選資料庫");
assert.ok(strong1 && strong1.strength === "strong", "記住：... → strong signal");
const strong2 = detectSignal("以後都要做事務處理");
assert.ok(strong2 && strong2.strength === "strong", "以後要... → strong signal");
const none1 = detectSignal("今天天氣不錯");
assert.equal(none1, null, "無訊號 → null");
const neg1 = detectSignal("記住：commit 時不要 force push");
assert.ok(neg1 && neg1.strength === "strong", "記住 + git 詞仍是強訊號");
const spokenComma = detectSignal("幫我記住，我喜歡簡潔高效，言簡意賅的回答方式");
assert.ok(spokenComma && spokenComma.strength === "strong", "幫我記住，… → strong");
assert.equal(String(spokenComma.content).startsWith("，"), false, "記住後的中文逗號不能進正文");
assert.match(spokenComma.content, /^我喜歡簡潔高效/);

// ───────── 改動 3: Grounding check ─────────
const transcript = "USER: 我們經過方案評審，決定業務資料庫必須支援事務能力。\nASSISTANT: 好的，記錄下來。";
assert.equal(evidenceMatchesTranscript("業務資料庫必須支援事務能力", transcript), true, "evidence 完全匹配");
assert.equal(evidenceMatchesTranscript("使用 PostgreSQL 14", transcript), false, "evidence 完全不匹配");
assert.equal(evidenceMatchesTranscript("業務資料庫必須", transcript), true, "evidence 子串匹配");
assert.equal(evidenceMatchesTranscript("記", transcript), false, "evidence 太短 → false");
assert.equal(evidenceMatchesTranscript("", transcript), false, "空 evidence → false");
assert.equal(evidenceMatchesTranscript(null, transcript), false, "null evidence → false");

// extractSessionMemories: evidence 正確 → grounded=true + 正常 confidence
const longTranscript = "我們決定業務資料庫必須支援事務能力，用於保障訂單寫入一致性和故障恢復。請把這個長期約束記錄下來並應用到所有訂單相關的開發任務。";
const goodEvidenceJson = JSON.stringify({ summary: "s", memories: [
  { type: "decision", title: "支援事務的資料庫", content: "專案決定業務資料庫必須支援事務能力，用於保障訂單寫入一致性。", evidence: "業務資料庫必須支援事務能力", durable: true, importance: 0.9, confidence: 0.9 },
] });
const goodLlm = { async *stream() { yield { type: "text-delta", index: 0, text: goodEvidenceJson }; yield { type: "finish", reason: { kind: "stop" } }; } };
const goodResult = await extractSessionMemories({
  session: { deriveMessages() { return [{ role: "user", content: [{ type: "text", text: longTranscript }] }]; } },
  llm: goodLlm, route: { provider: "test", model: "test-model" }, sessionId: "g-1",
});
assert.equal(goodResult.grounded, 1, "grounded 計數 = 1");
assert.equal(goodResult.ungrounded, 0, "ungrounded 計數 = 0");
assert.equal(goodResult.memories[0].source.grounded, true, "source.grounded = true");
assert.equal(goodResult.memories[0].confidence, 0.9, "grounded confidence 保持 0.9");

// extractSessionMemories: evidence 錯誤 → confidence 被壓低 + source.grounded=false
const badTranscript = "我們討論了資料庫選型，經過評審一致認為應該選用 PostgreSQL 14，支援事務能力與 JSONB 資料型別。";
const badEvidenceJson = JSON.stringify({ summary: "s", memories: [
  { type: "decision", title: "使用 MongoDB", content: "專案決定使用 MongoDB 替代關聯式資料庫。", evidence: "MongoDB 效能比 PostgreSQL 好三倍", durable: true, importance: 0.8, confidence: 0.95 },
] });
const badLlm = { async *stream() { yield { type: "text-delta", index: 0, text: badEvidenceJson }; yield { type: "finish", reason: { kind: "stop" } }; } };
const badResult = await extractSessionMemories({
  session: { deriveMessages() { return [{ role: "user", content: [{ type: "text", text: badTranscript }] }]; } },
  llm: badLlm, route: { provider: "test", model: "test-model" }, sessionId: "g-2",
});
assert.equal(badResult.grounded, 0, "grounded 計數 = 0（evidence 是幻覺）");
assert.equal(badResult.ungrounded, 1, "ungrounded 計數 = 1");
assert.equal(badResult.memories[0].source.grounded, false, "source.grounded = false");
assert.ok(badResult.memories[0].confidence <= 0.4, "grounding 失敗的 confidence 必 ≤ 0.4（避免幻覺汙染）");

// extractSessionMemories: 沒給 evidence → confidence 壓到 0.55
const noEvTranscript = "我學到了測試很重要，每次發版前都應該跑全套測試覆蓋，否則會出生產事故。";
const noEvidenceJson = JSON.stringify({ summary: "s", memories: [
  { type: "lesson", title: "測試很重要", content: "每次發版前都應該跑全套測試覆蓋，否則可能出生產事故。", durable: true, importance: 0.7, confidence: 0.9 },
] });
const noEvLlm = { async *stream() { yield { type: "text-delta", index: 0, text: noEvidenceJson }; yield { type: "finish", reason: { kind: "stop" } }; } };
const noEvResult = await extractSessionMemories({
  session: { deriveMessages() { return [{ role: "user", content: [{ type: "text", text: noEvTranscript }] }]; } },
  llm: noEvLlm, route: { provider: "test", model: "test-model" }, sessionId: "g-3",
});
assert.equal(noEvResult.memories[0].source.grounded, false, "無 evidence → grounded=false");
assert.ok(noEvResult.memories[0].confidence <= 0.55, "無 evidence → confidence ≤ 0.55");

// ───────── 改動 4: 注入器決策鏈段 ─────────
const projectC = join(root, "project-c");
mkdirSync(projectC, { recursive: true });
writeBrain(projectC, "project-c", "基礎決策");
mkdirSync(join(projectC, ".project-brain"), { recursive: true });
// 寫入多條 decision/architecture/其他型別記憶
const nowTs = Date.now();
const decisionMemories = [
  { id: "mem-d1", type: "decision", title: "使用 PostgreSQL 14", content: "選用 PG 14，支援事務 + JSONB。", importance: 0.95, createdAt: nowTs - 3000 },
  { id: "mem-d2", type: "decision", title: "API 用 Fastify", content: "Fastify 效能優於 Express。", importance: 0.85, createdAt: nowTs - 2000 },
  { id: "mem-d3", type: "decision", title: "前端用 Vue 3", content: "團隊熟悉 Vue，遷移成本低。", importance: 0.80, createdAt: nowTs - 1000 },
  { id: "mem-a1", type: "architecture", title: "分層架構", content: "Router → Service → Repository", importance: 0.75, createdAt: nowTs - 500 },
  { id: "mem-b1", type: "bug", title: "修復某個 bug", content: "修了某處的記憶體洩漏。", importance: 0.5, createdAt: nowTs },
];
writeFileSync(join(projectC, ".project-brain", "memory.jsonl"), decisionMemories.map((m) => JSON.stringify(m)).join("\n") + "\n");
const handlersC = new Map();
const sectionsC = [];
const ctxC = {
  get(name) {
    if (name === "systemPrompt") return { section(section) { sectionsC.push(section); return () => {}; } };
    if (name === "sessions") return { get() { return null; } };
    return null;
  },
  on(event, handler) { const list = handlersC.get(event) || []; list.push(handler); handlersC.set(event, list); },
  emit(event, payload) { for (const handler of handlersC.get(event) || []) handler(payload); },
  logger: { info() {}, warn() {} },
};
setupInjector(ctxC, fsAdapter, null);
ctxC.emit("agent/session-start", { agent: { session: { id: "session-c", header: { cwd: projectC } } } });
await new Promise((resolveWait) => setTimeout(resolveWait, 80));
const sectionC = sectionsC.find((item) => item.name === "project-brain-context");
const renderedC = sectionC.text({ agent: { session: { id: "session-c", header: { cwd: projectC } } } });
assert.match(renderedC, /### Core 記憶/, "injector 必須渲染 Core 記憶");
assert.match(renderedC, /使用 PostgreSQL 14/, "Core 含全部 active，包括較早的決策");
assert.match(renderedC, /前端用 Vue 3/);
assert.match(renderedC, /API 用 Fastify/);
assert.match(renderedC, /分層架構/);
assert.match(renderedC, /修復某個 bug/, "Core 含 bug 型別，不再用決策鏈 Top-3 截斷");
assert.doesNotMatch(renderedC, /最近決策鏈/, "已移除最近決策鏈段");
assert.doesNotMatch(renderedC, /無需再次確認/, "不得再提示記住就調 memory_add");

// ───────── 改動 5: project_memory_archive / project_memory_supersede ─────────
const archiveExec = { sessionId: "arch-1", session: { id: "arch-1", header: { cwd: projectC } } };
const archiveTool = buildMemoryArchiveTool({ fs: fsAdapter, sandboxPolicy: null });
const archiveResult = await archiveTool.execute({ id: "mem-d1", reason: "已經遷移到新方案", path: projectC }, archiveExec);
assert.equal(archiveResult.ok, true, "archive tool 成功");
assert.equal(archiveResult.data.id, "mem-d1");
const archivedBrain = readFileSync(join(projectC, ".project-brain", "memory.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const d1 = archivedBrain.find((m) => m.id === "mem-d1");
assert.equal(d1.status, "archived", "mem-d1.status = archived");
assert.equal(d1.archiveReason, "已經遷移到新方案");
// 重複 archive 已 archived 的 → 應該失敗
const reArchive = await archiveTool.execute({ id: "mem-d1", path: projectC }, archiveExec);
assert.equal(reArchive.ok, false, "重複 archive 已 archived → 失敗");
assert.equal(reArchive.code, "E_NOT_FOUND");

// supersede
const supersedeTool = buildMemorySupersedeTool({ fs: fsAdapter, sandboxPolicy: null });
const supResult = await supersedeTool.execute({
  oldId: "mem-d2",
  type: "decision",
  title: "API 用 Hono",
  content: "經過效能評估，Hono 比 Fastify 快 2x，更適合邊緣計算場景。",
  importance: 0.9,
  confidence: 0.85,
  reason: "Fastify 在邊緣環境表現不佳",
  path: projectC,
}, archiveExec);
assert.equal(supResult.ok, true, "supersede tool 成功");
assert.ok(supResult.data.newId, "返回 newId");
const afterSup = readFileSync(join(projectC, ".project-brain", "memory.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const oldD2 = afterSup.find((m) => m.id === "mem-d2");
const newD2 = afterSup.find((m) => m.id === supResult.data.newId);
assert.equal(oldD2.status, "superseded", "舊 mem-d2 → superseded");
assert.equal(oldD2.supersededBy, supResult.data.newId, "supersededBy 指向 newId");
assert.equal(oldD2.supersededReason, "Fastify 在邊緣環境表現不佳");
assert.equal(newD2.type, "decision");
assert.match(newD2.title, /Hono/);
assert.equal(newD2.source.supersedes, "mem-d2", "新記憶 source.supersedes 指向舊 id");

// ambiguous id
const ambiResult = await archiveTool.execute({ id: "mem", path: projectC }, archiveExec);
assert.equal(ambiResult.ok, false, "字首匹配多條 → 拒絕");
assert.equal(ambiResult.code, "E_AMBIGUOUS_ID");

// ───────── 改動 2: summarizer auto-dream ─────────
const projectD = join(root, "project-d");
mkdirSync(join(projectD, ".project-brain"), { recursive: true });
mkdirSync(join(projectD, "src"), { recursive: true });
writeFileSync(join(projectD, "package.json"), JSON.stringify({ name: "p-d", description: "d" }));
// 寫入 32 條重複 title 的 decision 記憶（超過預設閾值 30，且 Jaccard 可合併）
let allMemLines = [];
for (let i = 0; i < 32; i++) {
  const nowMs = Date.now() - i * 60000;
  allMemLines.push(JSON.stringify({
    id: "mem-d-" + i, type: "decision",
    title: "重複的決策標題用於觸發合併",
    content: "內容 " + i,
    importance: 0.9, confidence: 0.8, status: "active", createdAt: nowMs, updatedAt: nowMs,
  }));
}
writeFileSync(join(projectD, ".project-brain", "memory.jsonl"), allMemLines.join("\n") + "\n");
writeFileSync(join(projectD, ".project-brain", "project.json"), JSON.stringify({
  id: "p-d", name: "p-d", techStack: { backend: "Node.js" }, createdAt: Date.now(), updatedAt: Date.now(),
}));
writeFileSync(join(projectD, ".project-brain", "todo.jsonl"), "");
writeFileSync(join(projectD, ".project-brain", "timeline.jsonl"), "");

// 第一次 summarizeOne → auto-dream 應觸發（32 >= 30）
const initGit = spawnSync("git", ["init", "--quiet"], { cwd: projectD });
spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: projectD });
spawnSync("git", ["config", "user.name", "Test"], { cwd: projectD });
spawnSync("git", ["add", "-A"], { cwd: projectD });
spawnSync("git", ["commit", "--quiet", "--allow-empty", "-m", "baseline"], { cwd: projectD });
writeFileSync(join(projectD, "src", "feature.ts"), "export const x = 1;\n");
spawnSync("git", ["add", "-A"], { cwd: projectD });
spawnSync("git", ["commit", "--quiet", "-m", "feat"], { cwd: projectD });
const autoDreamResult = await summarizeOne({
  fs: fsAdapter, projectPath: projectD, sessionId: "dream-1",
  llm: null, route: null, config: {},
});
assert.ok(autoDreamResult.autoDream, "autoDream 欄位存在");
assert.equal(autoDreamResult.autoDream.triggered, true, "housekeep 因 Core cap 觸發寫盤");
assert.ok(autoDreamResult.autoDream.evicted > 0, "超額 active 被標 dormant");
const afterHousekeep = readFileSync(join(projectD, ".project-brain", "memory.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
assert.equal(afterHousekeep.length, 32, "housekeep 不得因標題相似刪除行");
assert.ok(afterHousekeep.filter((m) => isCoreMemory(m)).length <= getCoreLimits().maxItems, "Core 條數不超過配置上限");
assert.ok(afterHousekeep.filter((m) => m.status === "dormant").length >= 32 - getCoreLimits().maxItems, "超出上限的 Core 進入 dormant");
assert.equal(afterHousekeep.filter((m) => m.status === "deleted").length, 0);

const dreamTimeline = readFileSync(join(projectD, ".project-brain", "timeline.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
assert.ok(dreamTimeline.some((e) => e.eventType === "dream" && /記憶整理完成/.test(e.title)), "timeline 寫了 housekeep 事件");

const afterDream = await summarizeOne({
  fs: fsAdapter, projectPath: projectD, sessionId: "dream-2",
  llm: null, route: null, config: {},
});
assert.ok(afterDream.autoDream, "autoDream 欄位存在");
assert.equal(afterDream.autoDream.triggered, false, "第二次 housekeep 無變化不寫盤");

// ───────── 改動 7: Settings runtime — Dashboard 設定入口底層 ─────────
// 無 settings 服務（hotMount/不可用環境）：writable=false, updateSettings 拋 SETTINGS_UNAVAILABLE
const runtimeNoSettings = createMemoryConfigRuntime({}, { retrievalMode: "hybrid", vectorEnabled: true, embeddingBaseURL: "https://x.test/v1", embeddingModel: "m", embeddingDimensions: 8 });
assert.equal(typeof runtimeNoSettings.get, "function", "runtime 提供 get()");
assert.equal(typeof runtimeNoSettings.updateSettings, "function", "runtime 提供 updateSettings()");
assert.equal(runtimeNoSettings.settingsWritable(), false, "無 settings 服務 → writable=false");
let threwNoSettings = false;
try { await runtimeNoSettings.updateSettings({ vectorEnabled: false }); } catch (e) { threwNoSettings = true; assert.equal(e.code, "SETTINGS_UNAVAILABLE", "updateSettings 在無 settings 時拋 SETTINGS_UNAVAILABLE"); }
assert.ok(threwNoSettings, "updateSettings 必須拋錯（無 settings）");
assert.equal(runtimeNoSettings.get().embeddingDimensions, 8, "無 settings 時仍用 entryConfig 初始化");
// 驗證 getSettingsService/getSettingsScope 都是 null（可安全呼叫）
assert.equal(runtimeNoSettings.getSettingsService(), null, "無 settings 時 getSettingsService() = null");
assert.equal(runtimeNoSettings.getSettingsScope(), null, "無 settings 時 getSettingsScope() = null");

// Mock settings 服務（結構正確）：writable=true, updateSettings 呼叫 settings.update
const mockStore = { current: { retrievalMode: "hybrid", vectorEnabled: false, embeddingBaseURL: "", embeddingModel: "", embeddingApiKeyEnv: "PROJECT_BRAIN_EMBEDDING_API_KEY", embeddingDimensions: 0 } };
let mockWatcher = null;
const mockSettings = {
  writable: true,
  register() {
    return {
      get: () => mockStore.current,
      watch: (cb) => { mockWatcher = cb; cb(mockStore.current); },
    };
  },
  get() { return mockStore.current; },
  async update(_ns, patch) {
    mockStore.current = Object.assign({}, mockStore.current, patch);
    // 真實 settings.update commit 後會 emit `settings/updated`，scope.watch 會被呼叫
    if (typeof mockWatcher === "function") mockWatcher(mockStore.current);
  },
};
const mockCtxSettings = { inject(names, cb) { cb({ get(k) { return k === "settings" ? mockSettings : null; } }); } };
const runtimeWithSettings = createMemoryConfigRuntime(mockCtxSettings, { retrievalMode: "keyword" });
assert.equal(runtimeWithSettings.settingsWritable(), true, "有 settings 服務且 writable=true → settingsWritable()=true");
const next = await runtimeWithSettings.updateSettings({ vectorEnabled: true, embeddingBaseURL: "https://api.openai.com/v1", embeddingModel: "text-embedding-3-small" });
assert.equal(next.vectorEnabled, true, "updateSettings 後 vectorEnabled=true");
assert.equal(next.embeddingBaseURL, "https://api.openai.com/v1");
assert.equal(next.embeddingModel, "text-embedding-3-small");
assert.equal(next.retrievalMode, "hybrid", "base entryConfig 在 mock 裡被 user layer 覆蓋");
// getMemoryConfig 應反映新值（scope.watch 已掛上）
assert.equal(runtimeWithSettings.get().vectorEnabled, true, "get() 反映 user layer 新值");

// readonly settings：updateSettings 拋 SETTINGS_READONLY（需要 writable=false 但 update 方法存在）
const readonlySettings = { writable: false, register() { return { get: () => ({}), watch: () => {} }; }, get() { return {}; }, async update() {} };
const readonlyCtx = { inject(names, cb) { cb({ get(k) { return k === "settings" ? readonlySettings : null; } }); } };
const readonlyRuntime = createMemoryConfigRuntime(readonlyCtx, {});
assert.equal(readonlyRuntime.settingsWritable(), false, "writable=false 時 settingsWritable()=false");
let threwReadonly = false;
try { await readonlyRuntime.updateSettings({ vectorEnabled: true }); } catch (e) { threwReadonly = true; assert.equal(e.code, "SETTINGS_READONLY"); }
assert.ok(threwReadonly, "writable=false 必須拋錯");

// ───────── 即時記憶：指代消解 ─────────
// 復現真實缺陷：使用者說「把這個記住」，真正的內容在上一輪（且是 assistant 說的），
// 舊實現把正則捕獲到的殘句「以後對話要從這個角度出發」當成了記憶正文。
const projectRt = join(root, "project-c");
writeBrain(projectRt, "realtime", "初始決策");

const priorTurns = [
  { role: "user", content: [{ type: "text", text: "我要以面試的角度，去沉澱這些專案，把平常工作中的一些專案經歷及時沉澱總結，為以後跳槽面試準備" }] },
  { role: "assistant", content: [{ type: "text", text: "目標：面試素材庫（AI 應用 / Agent 工程師方向）。結構：STAR 法則 + 技術亮點 + 可深挖點。身份：主要開發者。" }] },
];
const triggerText = "需要你把我這個需求點記住，以後對話要從這個角度出發";
const realtimeSession = { id: "rt-1", cwd: projectRt, deriveMessages() { return priorTurns; } };
const realtimeRoute = { provider: "test", model: "test-model" };
const mockLlm = (payload) => ({ async *stream() {
  yield { type: "text-delta", index: 0, text: payload };
  yield { type: "finish", reason: { kind: "stop" } };
} });

const triggerSignal = detectSignal(triggerText);
assert.ok(triggerSignal && triggerSignal.strength === "strong", "「把這個記住」是強訊號");
assert.equal(triggerSignal.content, "以後對話要從這個角度出發", "正則捕獲到的仍然是那句殘句");
assert.equal(hasUnresolvedReference(triggerSignal.content, triggerSignal.content), true, "殘句被判定為未消解指代");
assert.equal(fallbackCandidate(triggerSignal), null, "指代未消解時兜底不產出候選，且不再湊字數");

// LLM 不可用 → 不寫入，留給會話結束的 session-extractor
const noLlm = await handleOne({ fs: fsAdapter, projectPath: projectRt, sessionId: "rt-1", signal: triggerSignal, session: realtimeSession, llm: null, route: null });
assert.equal(noLlm.skipped, "needs_context", "無 LLM 且指代未消解 → 不落盤");
assert.equal(readFileSync(join(projectRt, ".project-brain", "memory.jsonl"), "utf8").trim().split("\n").length, 1, "無 LLM 時 memory.jsonl 沒有新增行");

// LLM 說解不開 → 同樣不寫入，不退回原話
const unresolved = await handleOne({
  fs: fsAdapter, projectPath: projectRt, sessionId: "rt-1", signal: triggerSignal, session: realtimeSession,
  llm: mockLlm(JSON.stringify({ resolved: false })), route: realtimeRoute,
});
assert.equal(unresolved.skipped, "unresolved_reference", "模型判定解不開 → 不落盤");

// 使用者說了「記住」卻沒記成，必須在 timeline 裡留痕，否則使用者以為已經記下了
assert.equal(unresolved.noted, true, "未記住的情況被記錄下來");
const rtTimeline = readFileSync(join(projectRt, ".project-brain", "timeline.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const rejectEvents = rtTimeline.filter((e) => e.eventType === "memory_rejected");
assert.equal(rejectEvents.length, 2, "無 LLM 和解不開指代各留一條「未記住」");
assert.match(rejectEvents[0].title, /^未記住：/, "標題一眼能看出沒記成");
assert.match(rejectEvents[0].title, /以後對話要從這個角度出發/, "標題帶上使用者的原話");
assert.equal(rejectEvents[1].rejectReason, "unresolved_reference", "記錄了具體原因");
assert.match(rejectEvents[1].detail, /指的是什麼/, "原因寫成人話而不是錯誤碼");

// 正常路徑：帶上下文消解成自包含的 preference
const refinedPayload = JSON.stringify({
  resolved: true,
  type: "preference",
  title: "專案沉澱一律按面試素材庫的口徑組織",
  content: "所有專案沉澱的目標是面試素材庫，方向為 AI 應用 / Agent 工程師。結構預設 STAR 法則加技術亮點與可深挖點，突出本人角色、難點、決策與量化結果，不寫成專案復盤或團隊交接文件。",
  importance: 0.9,
});
const refined = await handleOne({
  fs: fsAdapter, projectPath: projectRt, sessionId: "rt-1", signal: triggerSignal, session: realtimeSession,
  llm: mockLlm(refinedPayload), route: realtimeRoute,
});
assert.equal(refined.appended, true, "帶上下文消解後成功落盤");
assert.equal(refined.refineStatus, "refined", "走的是 LLM 提煉路徑");
const rtRows = readFileSync(join(projectRt, ".project-brain", "memory.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const rtEntry = rtRows[rtRows.length - 1];
assert.equal(rtEntry.type, "preference", "使用者工作偏好落成 preference 型別");
assert.match(rtEntry.content, /面試素材庫/, "正文帶上了上一輪裡的真實指代物件");
assert.match(rtEntry.content, /STAR/, "正文帶上了 assistant 那輪說的結構口徑");
assert.equal(/這個角度/.test(rtEntry.content), false, "正文不再包含未消解的指代");
assert.equal(/這是使用者明確要求記住的長期偏好/.test(rtEntry.content), false, "不再用套話湊長度");
assert.equal(rtEntry.source.refined, true, "source 標記為已提煉");
assert.equal(rtEntry.source.trigger, triggerText, "source 保留使用者觸發原話");

// 重申同一條偏好 → supersede 舊條目，而不是在 Core 裡堆同義項
const restatedPayload = JSON.stringify({
  resolved: true,
  type: "preference",
  title: "專案沉澱一律按面試素材庫的口徑組織",
  content: "所有專案沉澱的目標是面試素材庫，方向為 AI 應用 / Agent 工程師。結構預設 STAR 法則加技術亮點與可深挖點，並補充難點與踩坑復盤。",
  importance: 0.9,
});
const restated = await handleOne({
  fs: fsAdapter, projectPath: projectRt, sessionId: "rt-2", signal: detectSignal("記住：沉澱口徑不要變"), session: realtimeSession,
  llm: mockLlm(restatedPayload), route: realtimeRoute,
});
assert.equal(restated.appended, true, "重申時仍然落盤");
assert.equal(restated.supersedesId, rtEntry.id, "重申走 supersede 而不是新增同義條目");
const afterRestate = readFileSync(join(projectRt, ".project-brain", "memory.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
assert.equal(afterRestate.find((m) => m.id === rtEntry.id).status, "superseded", "舊條目被標記 superseded");
assert.equal(afterRestate.filter((m) => m.type === "preference" && isCoreMemory(m)).length, 1, "Core 裡只剩一條偏好");

// 模型沒按格式返回 JSON 時要重試一次，而不是一次失敗就放棄
let refineCalls = 0;
const flakyJsonLlm = { async *stream() {
  refineCalls += 1;
  const payload = refineCalls === 1
    ? "好的，我來整理一下：\n這條記憶講的是回答風格要求。"   // 第一次答成自然語言
    : JSON.stringify({ resolved: true, type: "preference", title: "回答須言簡意賅直擊重點", content: "使用者要求所有回答言簡意賅、直擊重點，不鋪墊不囉嗦，適用於全部對話場景。", importance: 0.85 });
  yield { type: "text-delta", index: 0, text: payload };
  yield { type: "finish", reason: { kind: "stop" } };
} };
const retriedSignal = detectSignal("幫我記住我說的首句");
const retried = await handleOne({
  fs: fsAdapter, projectPath: projectRt, sessionId: "rt-retry", signal: retriedSignal, session: realtimeSession,
  llm: flakyJsonLlm, route: realtimeRoute,
});
assert.equal(refineCalls, 2, "第一次輸出不是 JSON 時會重排一次");
assert.equal(retried.appended, true, "重試成功後正常落盤，而不是報「未記住」");

// 兩次都不是 JSON → 放棄，但失敗原因要說準，並留下模型的原始輸出供排查
const badJsonLlm = { async *stream() {
  yield { type: "text-delta", index: 0, text: "我覺得這條不用記吧，你看呢？" };
  yield { type: "finish", reason: { kind: "stop" } };
} };
const badJson = await handleOne({
  fs: fsAdapter, projectPath: projectRt, sessionId: "rt-badjson", signal: detectSignal("幫我記住我說的準則"), session: realtimeSession,
  llm: badJsonLlm, route: realtimeRoute,
});
assert.equal(badJson.refineStatus, "refine_unparseable", "兩次都解析不了才放棄");
const badJsonTimeline = readFileSync(join(projectRt, ".project-brain", "timeline.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const badJsonEvent = badJsonTimeline.filter((e) => e.eventType === "memory_rejected").pop();
assert.match(badJsonEvent.detail, /沒按要求返回 JSON/, "原因寫的是格式問題，不是「缺少模型」");
assert.doesNotMatch(badJsonEvent.detail, /缺少可用的.*模型/, "模型明明可用，不能把人引去查配置");
assert.match(badJsonEvent.sample, /我覺得這條不用記吧/, "留下模型的原始輸出，排查時比任何描述都有用");

// 弱訊號（「以後都…」）現在也會落盤，但門檻更嚴、標記不同
const weakSignal = detectSignal("以後都用 PostgreSQL，別再用 MySQL 了");
assert.equal(weakSignal.strength, "weak", "「以後都…」仍歸為弱訊號");

// 弱訊號 + 無 LLM → 安靜跳過，不寫「未記住」（使用者並沒要求記）
const weakNoLlm = await handleOne({
  fs: fsAdapter, projectPath: projectRt, sessionId: "rt-w0", signal: weakSignal, session: realtimeSession,
  llm: null, route: null,
});
assert.equal(weakNoLlm.skipped, "weak_unresolved", "弱訊號解不開就跳過");
assert.equal(weakNoLlm.noted, undefined, "弱訊號失敗不寫「未記住」，避免報沒人要求的事");

const weakPayload = JSON.stringify({
  resolved: true,
  type: "decision",
  title: "訂單庫統一用 PostgreSQL",
  content: "專案約定訂單相關資料一律存 PostgreSQL，不再新增 MySQL 依賴，理由是需要事務能力。",
  importance: 0.95,
});
const weakAdmitted = await handleOne({
  fs: fsAdapter, projectPath: projectRt, sessionId: "rt-w1", signal: weakSignal, session: realtimeSession,
  llm: mockLlm(weakPayload), route: realtimeRoute,
});
assert.equal(weakAdmitted.appended, true, "弱訊號經 LLM 消解後可以落盤");
const weakRows = readFileSync(join(projectRt, ".project-brain", "memory.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const weakEntry = weakRows[weakRows.length - 1];
assert.equal(weakEntry.source.kind, "user_intent_weak", "弱訊號不冒充 user_explicit");
assert.ok(weakEntry.tags.includes("weak_signal"), "打上 weak_signal 標籤");
assert.ok(weakEntry.importance <= 0.7, "弱訊號重要性被壓一檔，不能靠模型自報 0.95");
assert.ok(weakEntry.confidence <= 0.7, "弱訊號可信度被壓一檔");

// 上下文視窗必須帶上 assistant 訊息，否則指代永遠解不開
const window = contextWindow(realtimeSession);
assert.match(window, /ASSISTANT: /, "上下文視窗包含 assistant 訊息");
assert.match(window, /面試素材庫/, "上下文視窗帶上了真正的指代物件");

// 長對話裡「這個對話的第一句」也要能解開：只取末尾 N 條的話，開頭永遠在視窗外
const longSession = { deriveMessages() {
  const msgs = [{ role: "user", content: [{ type: "text", text: "開場白：這個專案要沉澱成面試素材庫" }] }];
  for (let i = 0; i < 40; i++) {
    msgs.push({ role: i % 2 === 0 ? "assistant" : "user", content: [{ type: "text", text: "中間第 " + i + " 輪的閒聊內容" }] });
  }
  msgs.push({ role: "user", content: [{ type: "text", text: "最後一句：收尾確認" }] });
  return msgs;
} };
const longWindow = contextWindow(longSession);
assert.match(longWindow, /開場白：這個專案要沉澱成面試素材庫/, "長對話裡開頭那句仍在視窗內");
assert.match(longWindow, /最後一句：收尾確認/, "最近的訊息也在視窗內");
assert.match(longWindow, /中間省略/, "中間輪次被省略時有明確標記");
assert.equal(longWindow.includes("中間第 20 輪"), false, "中間大段確實被省略，不會撐爆預算");
assert.ok(longWindow.length <= 7000, "視窗不超過字元預算");

// 帶錨點的正文不該被指代門誤傷
assert.equal(hasUnresolvedReference("閘道器約定", "所有對外 API 必須走這個閘道器，內網呼叫不走。"), false, "含識別符號錨點的短正文不算未消解");
assert.equal(hasUnresolvedReference("事務約定", "業務資料庫必須支援事務能力，用於保障訂單寫入一致性和故障恢復。"), false, "無指代詞的正文直接放行");

// ───────── 人工維護記憶：編輯 / 歸檔 / 恢復 / 永久刪除 ─────────
const editRows = [
  { id: "mem-edit-1", type: "context", title: "舊標題", content: "這條記憶的內容需要被人工修正，原文寫得不清楚。", importance: 0.5, status: "active", tags: ["realtime"], source: { kind: "user_explicit", fingerprint: "stale-fingerprint" }, createdAt: 1000, updatedAt: 1000 },
  { id: "mem-edit-2", type: "decision", title: "另一條決策", content: "專案決定用 PostgreSQL 承載訂單資料，因為需要事務能力。", importance: 0.8, status: "active", createdAt: 2000, updatedAt: 2000 },
];

// 編輯：原地改，id 與 createdAt 不變
const edited = applyMemoryEdit(editRows, {
  id: "mem-edit-1",
  patch: { title: "專案沉澱按面試素材庫口徑組織", content: "所有專案沉澱的目標是面試素材庫，結構預設 STAR 加技術亮點。", type: "preference", importance: 0.9, status: "active", tags: ["preference", "user"] },
  now: 5000,
});
assert.equal(edited.ok, true, "編輯成功");
assert.equal(edited.changed, true, "編輯標記為已改動");
assert.equal(edited.entry.id, "mem-edit-1", "編輯保留原 id");
assert.equal(edited.entry.createdAt, 1000, "編輯保留原 createdAt");
assert.equal(edited.entry.updatedAt, 5000, "編輯重新整理 updatedAt");
assert.equal(edited.entry.type, "preference", "型別可改");
assert.equal(edited.entry.importance, 0.9, "重要性可改");
assert.deepEqual(edited.entry.tags, ["preference", "user"], "標籤可改");
assert.equal(edited.entry.source.kind, "user_explicit", "來源 kind 保留");
assert.notEqual(edited.entry.source.fingerprint, "stale-fingerprint", "正文改了必須重算 fingerprint");
assert.equal(edited.entry.source.editedBy, "user", "留下人工編輯痕跡");
assert.equal(edited.rows.length, 2, "編輯不新增行");

// 編輯校驗
assert.equal(applyMemoryEdit(editRows, { id: "mem-edit-1", patch: { title: "   " } }).code, "E_NO_TITLE", "空標題被拒");
assert.equal(applyMemoryEdit(editRows, { id: "mem-edit-1", patch: { content: "太短" } }).code, "E_CONTENT_TOO_SHORT", "正文過短被拒");
assert.equal(applyMemoryEdit(editRows, { id: "mem-edit-1", patch: { type: "nonsense" } }).code, "E_INVALID_TYPE", "非法型別被拒");
assert.equal(applyMemoryEdit(editRows, { id: "mem-edit-1", patch: { importance: 3 } }).code, "E_INVALID_IMPORTANCE", "越界重要性被拒");
assert.equal(applyMemoryEdit(editRows, { id: "mem-edit-1", patch: { status: "archived" } }).code, "E_INVALID_STATUS", "歸檔不能走編輯表單");
assert.equal(applyMemoryEdit(editRows, { id: "mem-nope", patch: { title: "x" } }).code, "E_NOT_FOUND", "id 不存在");
assert.equal(applyMemoryEdit(editRows, { id: "mem-edit", patch: { title: "x" } }).code, "E_AMBIGUOUS_ID", "字首命中多條要報歧義");
assert.equal(applyMemoryEdit(editRows, { id: "mem-edit-1", patch: { title: "舊標題" }, now: 5000 }).changed, false, "沒有實際變化 → changed=false");

// 歸檔 → 從 Core 消失但行還在
const archived = applyMemoryStatus(editRows, { id: "mem-edit-1", status: "archived", reason: "內容空洞", now: 6000 });
assert.equal(archived.ok, true, "歸檔成功");
assert.equal(archived.rows.length, 2, "歸檔保留行");
assert.equal(archived.entry.status, "archived", "狀態變 archived");
assert.equal(archived.entry.archiveReason, "內容空洞", "歸檔理由被記下");
assert.equal(archived.rows.filter(isCoreMemory).length, 1, "歸檔後不再算 Core");

// 恢復 → 清掉歸檔痕跡，否則 housekeep 下輪又按舊理由歸回去
const restored = applyMemoryStatus(archived.rows, { id: "mem-edit-1", status: "active", now: 7000 });
assert.equal(restored.ok, true, "恢復成功");
assert.equal(restored.entry.status, "active", "狀態回到 active");
assert.equal(restored.entry.archiveReason, undefined, "恢復清掉 archiveReason");
assert.equal(restored.rows.filter(isCoreMemory).length, 2, "恢復後重新進 Core");

// 歸檔態的記憶仍可被 id 命中並恢復；但重複歸檔是 no-op
assert.equal(applyMemoryStatus(archived.rows, { id: "mem-edit-1", status: "archived", now: 8000 }).changed, false, "重複歸檔 → changed=false");

// 永久刪除 → 物理刪行，並清理指向它的懸空 supersededBy
const withPointer = archived.rows.map((m) => (m.id === "mem-edit-2" ? Object.assign({}, m, { supersededBy: "mem-edit-1" }) : m));
const deleted = applyMemoryDelete(withPointer, { id: "mem-edit-1" });
assert.equal(deleted.ok, true, "刪除成功");
assert.equal(deleted.rows.length, 1, "刪除後物理少一行");
assert.equal(deleted.rows.find((m) => m.id === "mem-edit-1"), undefined, "目標行已消失");
assert.equal(deleted.rows[0].supersededBy, undefined, "指向被刪條目的懸空指標被清理");
assert.equal(applyMemoryDelete(editRows, { id: "mem-nope" }).code, "E_NOT_FOUND", "刪除不存在的 id 會報錯");

// ───────── 空閒觸發摘要（原先掛 session/disposed，線上一次都沒派發過）─────────
const idleJobs = [];
const sched = createIdleSummaryScheduler((job) => idleJobs.push(job), 40);

// 會話還在動 → 鬧鐘一直往後推，不該摘要
sched.schedule({ projectPath: "/p", session: { id: "s1" }, sessionId: "s1" });
await new Promise((r) => setTimeout(r, 25));
sched.schedule({ projectPath: "/p", session: { id: "s1" }, sessionId: "s1" });
await new Promise((r) => setTimeout(r, 25));
assert.equal(idleJobs.length, 0, "會話持續有動靜時不觸發摘要");

// 安靜夠久 → 觸發一次
await new Promise((r) => setTimeout(r, 60));
assert.equal(idleJobs.length, 1, "空閒滿時長後觸發一次摘要");
assert.equal(idleJobs[0].projectPath, "/p", "帶上正確的 workspace");
assert.equal(sched.size(), 0, "觸發後佇列清空");

// 不同 workspace 各自排隊，互不干擾
sched.schedule({ projectPath: "/a", sessionId: "sa" });
sched.schedule({ projectPath: "/b", sessionId: "sb" });
assert.equal(sched.size(), 2, "兩個 workspace 各排各的");
await new Promise((r) => setTimeout(r, 70));
assert.equal(idleJobs.length, 3, "兩個 workspace 都觸發了");

// disposed 真發生時要能取消待觸發的鬧鐘，避免重複摘要
sched.schedule({ projectPath: "/c", sessionId: "sc" });
sched.cancel("/c");
await new Promise((r) => setTimeout(r, 60));
assert.equal(idleJobs.filter((j) => j.projectPath === "/c").length, 0, "取消後不再觸發");

// flushAll 必須帶上排隊時的 session，不能只剩 sessionId
const keptSession = { id: "s-keep", cwd: "/keep" };
sched.schedule({ projectPath: "/keep", session: keptSession, sessionId: "s-keep" });
assert.equal(sched.size(), 1, "flushAll 前佇列裡有這一條");
sched.flushAll();
assert.equal(sched.size(), 0, "flushAll 後佇列清空");
const flushed = idleJobs.find((j) => j.projectPath === "/keep");
assert.ok(flushed, "flushAll 會立刻跑摘要");
assert.equal(flushed.session, keptSession, "flushAll 帶上排隊時的 session");
assert.equal(flushed.sessionId, "s-keep", "flushAll 帶上 sessionId");
await new Promise((r) => setTimeout(r, 60));
assert.equal(idleJobs.filter((j) => j.projectPath === "/keep").length, 1, "flushAll 取消了鬧鐘，不會再觸發第二次");

// 冪等改成按訊息增量算：長會話必須能多次沉澱
const fakeSession = (n) => ({ deriveMessages: () => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "m" + i })) });
assert.equal(countSessionMessages(fakeSession(7)), 7, "能數出會話訊息數");
assert.equal(countSessionMessages(null), 0, "拿不到會話時返回 0 而不是炸");

const tlWithSummary = [
  { eventType: "session_summary", sessionId: "s1", messageCount: 10 },
  { eventType: "session_summary", sessionId: "s1", messageCount: 26 },
  { eventType: "session_summary", sessionId: "other", messageCount: 99 },
];
assert.equal(lastSummarizedMessageCount(tlWithSummary, "s1"), 26, "取該會話最新一次的覆蓋點");
assert.equal(lastSummarizedMessageCount(tlWithSummary, "never"), null, "沒摘過返回 null");
assert.equal(lastSummarizedMessageCount([{ eventType: "session_summary", sessionId: "s1" }], "s1"), 0, "老資料缺欄位時當 0，讓它還能再摘一次");
assert.ok(MIN_NEW_MESSAGES > 0, "增量門檻是正數");

// ───────── 熱度回升：命中即「用過」 ─────────
const accessRows = [
  { id: "mem-hot", type: "decision", title: "常被查到的決策", content: "這條會被反覆命中，用來驗證熱度回升。", importance: 0.5, status: "dormant", createdAt: 1000, updatedAt: 1000 },
  { id: "mem-cold", type: "decision", title: "沒人查的決策", content: "這條從來沒被命中過，用來做對照組。", importance: 0.5, status: "active", createdAt: 1000, updatedAt: 1000 },
];
const touched = applyAccessTouch(accessRows, ["mem-hot"], 500000);
assert.equal(touched.changed, true, "首次命中會寫 lastAccessedAt");
assert.equal(touched.rows.find((m) => m.id === "mem-hot").lastAccessedAt, 500000, "記錄命中時間");
assert.equal(touched.rows.find((m) => m.id === "mem-hot").accessCount, 1, "命中次數從 1 開始");
assert.equal(touched.rows.find((m) => m.id === "mem-cold").lastAccessedAt, undefined, "沒命中的不動");

// 節流：一輪對話裡連續 ask 不該把整表重寫好幾遍
const throttled = applyAccessTouch(touched.rows, ["mem-hot"], 500000 + 60_000);
assert.equal(throttled.changed, false, "節流視窗內重複命中不再寫盤");
const afterWindow = applyAccessTouch(touched.rows, ["mem-hot"], 500000 + ACCESS_THROTTLE_MS + 1);
assert.equal(afterWindow.changed, true, "超過節流視窗後重新記一次");
assert.equal(afterWindow.rows.find((m) => m.id === "mem-hot").accessCount, 2, "命中次數累加");

// 排序：常被查到的記憶不該因為很久沒改就沉下去
const hotNow = Date.now();
const rankRows = [
  { id: "r-hot", type: "decision", title: "事務一致性約定", content: "訂單寫入必須走事務，用於保障跨表一致性。", importance: 0.6, confidence: 0.8, status: "active", createdAt: hotNow - 200 * 86400000, updatedAt: hotNow - 200 * 86400000, lastAccessedAt: hotNow },
  { id: "r-cold", type: "decision", title: "事務一致性備註", content: "訂單寫入必須走事務，用於保障跨表一致性。", importance: 0.6, confidence: 0.8, status: "active", createdAt: hotNow - 200 * 86400000, updatedAt: hotNow - 200 * 86400000 },
];
const ranked = retrieveMemories({ memories: rankRows, query: "事務", topK: 2, now: hotNow });
assert.equal(ranked[0].memory.id, "r-hot", "近期被命中過的排在前面");

// 淘汰：最近用過的比沒人用的更晚被擠出 Core
const evictRows = [
  { id: "e-used", type: "decision", title: "用過的", content: "最近被檢索命中過的記憶，應該更晚被淘汰。", importance: 0.5, status: "active", createdAt: 1, updatedAt: 1, lastAccessedAt: hotNow, source: { kind: "agent" } },
  { id: "e-idle", type: "decision", title: "沒用過的", content: "從來沒被命中過的記憶，應該先被擠出 Core。", importance: 0.5, status: "active", createdAt: 9000, updatedAt: 9000, source: { kind: "agent" } },
];
const evicted = enforceCoreCap(evictRows, { limits: { maxItems: 1, maxTokens: 100000 }, now: hotNow });
assert.equal(evicted.rows.find((m) => m.id === "e-used").status, "active", "最近用過的留在 Core");
assert.equal(evicted.rows.find((m) => m.id === "e-idle").status, "dormant", "沒人用的先被擠成 dormant");

// ───────── 低可信度記憶要被打折 ─────────
assert.equal(trustFactor(0.9), 1, "可信度達標不打折");
assert.equal(trustFactor(0.6), 1, "剛好到閾值不打折");
assert.ok(trustFactor(0.4) < 0.7, "grounding 失敗（0.4）明顯打折");
assert.ok(trustFactor(0.4) > trustFactor(0.2), "可信度越低折扣越狠");
assert.ok(trustFactor(0.01) >= 0.35, "打折有下限，不會把記憶完全抹掉");

const trustNow = Date.now();
const trustRows = [
  { id: "t-solid", type: "decision", title: "資料庫選型", content: "訂單庫選 PostgreSQL，因為需要事務能力。", importance: 0.7, confidence: 0.9, status: "active", createdAt: trustNow, updatedAt: trustNow },
  { id: "t-shaky", type: "decision", title: "資料庫選型備選", content: "訂單庫選 PostgreSQL，因為需要事務能力。", importance: 0.75, confidence: 0.4, status: "active", createdAt: trustNow, updatedAt: trustNow },
];
const trustRanked = retrieveMemories({ memories: trustRows, query: "資料庫", topK: 2, now: trustNow });
assert.equal(trustRanked[0].memory.id, "t-solid", "重要性略低但可信的，排在疑似幻覺前面");

// ───────── Core 保障：置頂 / 容量 / 來源優先順序 ─────────
const capLimits = { maxItems: 3, maxTokens: 100000 };
const makeRow = (id, extra) => Object.assign({
  id,
  type: "decision",
  title: "記憶 " + id,
  content: "用來驗證 Core 容量淘汰順序的佔位正文，長度足夠通過校驗。",
  importance: 0.5,
  status: "active",
  createdAt: 1000,
  updatedAt: 1000,
}, extra || {});

// 置頂的不被擠掉，哪怕它重要性最低、最舊
const pinRows = [
  makeRow("m-pinned", { pinned: true, importance: 0.1, updatedAt: 1 }),
  makeRow("m-a", { importance: 0.9, updatedAt: 9000 }),
  makeRow("m-b", { importance: 0.8, updatedAt: 8000 }),
  makeRow("m-c", { importance: 0.7, updatedAt: 7000 }),
  makeRow("m-d", { importance: 0.6, updatedAt: 6000 }),
];
const pinCapped = enforceCoreCap(pinRows, { limits: capLimits, now: 10000 });
assert.equal(pinCapped.rows.find((m) => m.id === "m-pinned").status, "active", "置頂的記憶不會被容量淘汰擠掉");
assert.equal(pinCapped.rows.filter(isCoreMemory).length, 3, "淘汰到配置上限為止");

// 使用者親手寫的比自動抓的更晚被淘汰
const authorRows = [
  makeRow("m-auto-1", { importance: 0.5, updatedAt: 9000, source: { kind: "agent" } }),
  makeRow("m-auto-2", { importance: 0.5, updatedAt: 8000, source: { kind: "session_semantic" } }),
  makeRow("m-user", { importance: 0.5, updatedAt: 1, source: { kind: "user_explicit" } }),
  makeRow("m-edited", { importance: 0.5, updatedAt: 2, source: { kind: "agent", editedBy: "user" } }),
];
const authorCapped = enforceCoreCap(authorRows, { limits: { maxItems: 2, maxTokens: 100000 }, now: 10000 });
assert.equal(authorCapped.rows.find((m) => m.id === "m-user").status, "active", "user_explicit 的記憶最後才被淘汰");
assert.equal(authorCapped.rows.find((m) => m.id === "m-edited").status, "active", "人工編輯過的記憶最後才被淘汰");
assert.equal(authorCapped.rows.find((m) => m.id === "m-auto-1").status, "dormant", "自動抓的先被擠成 dormant");

// 置頂有數量上限：全部置頂等於沒有置頂
const pinLimit = maxPinnedCount(capLimits);
assert.equal(pinLimit, 1, "置頂上限 = 容量的一半（向下取整，至少 1）");
const alreadyPinned = [
  makeRow("p-1", { pinned: true }),
  makeRow("p-2"),
];
const pinRejected = applyMemoryEdit(alreadyPinned, { id: "p-2", patch: { pinned: true }, limits: capLimits });
assert.equal(pinRejected.code, "E_PIN_LIMIT", "超出置頂上限時拒絕並給出原因");
const pinAccepted = applyMemoryEdit(alreadyPinned, { id: "p-1", patch: { pinned: false }, limits: capLimits });
assert.equal(pinAccepted.ok, true, "取消置頂不受上限限制");
assert.equal(pinAccepted.entry.pinned, undefined, "取消置頂後欄位被移除而不是留 false");

// ───────── vacuum：主檔案瘦身，但絕不真刪 ─────────
const vacNow = Date.now();
const old = (days) => vacNow - days * 86400000;
const vacConfig = { vacuumMemoryRetainDays: 90, vacuumMemoryMinRetained: 0, vacuumTimelineMaxEvents: 3, vacuumTimelineRetainDays: 180 };
const vacRows = [
  { id: "v-active", type: "decision", title: "活躍決策", content: "還在用的決策，任何情況下都不該被搬走。", status: "active", updatedAt: old(999) },
  { id: "v-dormant", type: "decision", title: "休眠決策", content: "休眠只是不注入，仍然可檢索，不該被搬走。", status: "dormant", updatedAt: old(999) },
  { id: "v-old", type: "decision", title: "過期歸檔", content: "歸檔很久且沒人引用，可以搬到 archive。", status: "archived", updatedAt: old(200) },
  { id: "v-fresh", type: "decision", title: "新歸檔", content: "剛歸檔不久，還在保留期內，先留著。", status: "archived", updatedAt: old(10) },
  { id: "v-pinned", type: "decision", title: "置頂但已歸檔", content: "使用者置頂過的條目，即使歸檔也別動。", status: "archived", pinned: true, updatedAt: old(300) },
  { id: "v-referenced", type: "decision", title: "被引用的舊版", content: "它是某條現行記憶的前身，證據鏈要留著。", status: "superseded", updatedAt: old(300) },
  { id: "v-successor", type: "decision", title: "現行版本", content: "取代了上面那條舊版，指向它作為證據鏈。", status: "active", supersededBy: null, source: { supersedes: "v-referenced" }, updatedAt: vacNow },
];
const vacPlan = planMemoryVacuum(vacRows, { now: vacNow, config: vacConfig });
const evictedIds = vacPlan.evict.map((m) => m.id);
assert.deepEqual(evictedIds, ["v-old"], "只搬走過期、無人引用、非置頂的歸檔行");
assert.equal(vacPlan.keep.length, 6, "其餘全部留在主檔案");
assert.equal(vacPlan.keep.some((m) => m.id === "v-active"), true, "活躍記憶絕不被搬走");
assert.equal(vacPlan.keep.some((m) => m.id === "v-dormant"), true, "dormant 仍可檢索，不被搬走");
assert.equal(vacPlan.keep.some((m) => m.id === "v-pinned"), true, "置頂的即使歸檔也不搬");
assert.equal(vacPlan.keep.some((m) => m.id === "v-referenced"), true, "被 supersedes 指向的證據鏈留著");

// 保留下限：寧可不瘦身也別把歸檔區一次清空
const floorPlan = planMemoryVacuum(vacRows, { now: vacNow, config: Object.assign({}, vacConfig, { vacuumMemoryMinRetained: 200 }) });
assert.equal(floorPlan.evict.length, 0, "歸檔總數沒超過保留下限時一行都不搬");

// timeline 截斷要留住第一屏依賴的錨點
const vacEvents = [
  { id: "e-init", eventType: "init", title: "專案初始化", occurredAt: old(900) },
  { id: "e-sum-old", eventType: "session_summary", title: "舊摘要", occurredAt: old(800) },
  { id: "e-sum-new", eventType: "session_summary", title: "最新摘要", occurredAt: old(400) },
  { id: "e-noise-1", eventType: "memory", title: "雜項 1", occurredAt: old(500) },
  { id: "e-noise-2", eventType: "memory", title: "雜項 2", occurredAt: old(3) },
  { id: "e-noise-3", eventType: "memory", title: "雜項 3", occurredAt: old(2) },
  { id: "e-noise-4", eventType: "memory", title: "雜項 4", occurredAt: old(1) },
];
const trimPlan = planTimelineTrim(vacEvents, { now: vacNow, config: vacConfig });
const trimKeptIds = trimPlan.keep.map((e) => e.id);
assert.ok(trimKeptIds.includes("e-init"), "init 是任務動態的主幹起點，再舊也留");
assert.ok(trimKeptIds.includes("e-sum-new"), "最新 session_summary 是第一屏「最近做什麼」的來源，必須留");
assert.equal(trimKeptIds.includes("e-sum-old"), false, "舊摘要超出保留視窗，可以搬走");
assert.equal(trimKeptIds.includes("e-noise-1"), false, "超出保留天數的雜項被搬走");
assert.ok(trimPlan.evict.length > 0, "確實有事件被搬走");
assert.equal(trimPlan.keep.length + trimPlan.evict.length, vacEvents.length, "搬走的加留下的等於總數，沒有憑空消失");

// 端到端：先寫 archive 再縮主檔案，資料找得回來
const vacProject = join(root, "vacuum");
writeBrain(vacProject, "vacuum", "基線決策");
writeFileSync(join(vacProject, ".project-brain", "memory.jsonl"), vacRows.map((m) => JSON.stringify(m)).join("\n") + "\n");
writeFileSync(join(vacProject, ".project-brain", "timeline.jsonl"), vacEvents.map((e) => JSON.stringify(e)).join("\n") + "\n");

const vacDry = await vacuumBrain({ fs: fsAdapter, projectPath: vacProject, config: vacConfig, now: vacNow, dryRun: true });
assert.equal(vacDry.dryRun, true, "dryRun 預設只出計劃");
assert.equal(vacDry.plan.memory.evicted, 1, "計劃裡報了會搬走多少條記憶");
assert.equal(readFileSync(join(vacProject, ".project-brain", "memory.jsonl"), "utf8").trim().split("\n").length, 7, "dryRun 不碰檔案");

const vacRun = await vacuumBrain({ fs: fsAdapter, projectPath: vacProject, config: vacConfig, now: vacNow, dryRun: false });
assert.equal(vacRun.ok, true, "vacuum 執行成功");
assert.equal(vacRun.changed, true, "確實做了改動");
const vacMain = readFileSync(join(vacProject, ".project-brain", "memory.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
assert.equal(vacMain.length, 6, "主檔案真的變小了");
assert.equal(vacMain.some((m) => m.id === "v-old"), false, "過期歸檔已移出主檔案");

const memArchive = vacRun.archives.find((a) => a.kind === "memory");
assert.ok(memArchive, "記錄了歸檔檔案路徑");
const archivedRows = readFileSync(join(vacProject, ".project-brain", memArchive.path), "utf8").trim().split("\n").map(JSON.parse);
assert.equal(archivedRows.length, 1, "被搬走的行完整落在 archive 裡");
assert.equal(archivedRows[0].id, "v-old", "搬走的就是那條過期歸檔，資料沒丟");

// 重複跑不該再動任何東西
const vacAgain = await vacuumBrain({ fs: fsAdapter, projectPath: vacProject, config: vacConfig, now: vacNow, dryRun: false });
assert.equal(vacAgain.changed, false, "已經沒有可搬的行時不再寫檔案");
assert.equal(vacAgain.archives.length, 0, "空跑不產生新的 archive 檔案");

// project_dream 工具層：light 不碰主檔案體積，full 才 vacuum
const dreamProject = join(root, "dream-full");
writeBrain(dreamProject, "dream-full", "基線決策");
writeFileSync(join(dreamProject, ".project-brain", "memory.jsonl"), vacRows.map((m) => JSON.stringify(m)).join("\n") + "\n");
writeFileSync(join(dreamProject, ".project-brain", "timeline.jsonl"), vacEvents.map((e) => JSON.stringify(e)).join("\n") + "\n");
const dreamTool = buildDreamTool({ fs: fsAdapter, sandboxPolicy: null, getMemoryConfig: () => vacConfig });
const dreamExec = { sessionId: "dream-1", session: { id: "dream-1", header: { cwd: dreamProject } } };

const lightRun = await dreamTool.execute({ mode: "light", dryRun: false, path: dreamProject }, dreamExec);
assert.equal(lightRun.ok, true, "light 模式執行成功");
assert.equal(lightRun.data.vacuum, undefined, "light 模式不做 vacuum");
assert.equal(readFileSync(join(dreamProject, ".project-brain", "memory.jsonl"), "utf8").trim().split("\n").length, 7, "light 不減少主檔案行數");

const fullDry = await dreamTool.execute({ mode: "full", dryRun: true, path: dreamProject }, dreamExec);
assert.ok(fullDry.data.vacuum, "full + dryRun 會給出 vacuum 計劃");
assert.equal(fullDry.data.summary.vacuumCandidates > 0, true, "計劃裡報了待搬行數");
assert.equal(readFileSync(join(dreamProject, ".project-brain", "memory.jsonl"), "utf8").trim().split("\n").length, 7, "full + dryRun 仍然不碰檔案");

const fullRun = await dreamTool.execute({ mode: "full", dryRun: false, path: dreamProject }, dreamExec);
assert.equal(fullRun.ok, true, "full 模式執行成功");
assert.ok(fullRun.data.committed.vacuumed > 0, "報告了實際搬走多少行");
assert.ok(fullRun.data.archives.length > 0, "返回 archive 檔案路徑供使用者查詢");
const dreamMain = readFileSync(join(dreamProject, ".project-brain", "memory.jsonl"), "utf8").trim().split("\n");
assert.ok(dreamMain.length < 7, "full 模式讓主檔案真的變小");
assert.match(fullRun.data.note, /archive/, "note 裡說明資料搬到哪了");

// ───────── 併發寫入不丟資料 ─────────
// fs 只有覆蓋寫，append 是「讀全文 → 拼接 → 寫全文」。沒有序列化時，
// 併發的 append 會各自基於舊快照寫回，後寫的把先寫的抹掉。
const concurrentDir = join(root, "concurrent");
mkdirSync(join(concurrentDir, ".project-brain"), { recursive: true });
const concurrentFile = join(concurrentDir, ".project-brain", "timeline.jsonl");
writeFileSync(concurrentFile, "");

const APPEND_N = 40;
await Promise.all(
  Array.from({ length: APPEND_N }, (_, i) =>
    appendJsonl(fsAdapter, concurrentFile, { id: "evt-" + i, seq: i })),
);
const appendedRows = readFileSync(concurrentFile, "utf8").trim().split("\n").map(JSON.parse);
assert.equal(appendedRows.length, APPEND_N, APPEND_N + " 條併發 append 全部落盤，一條都不丟");
assert.equal(new Set(appendedRows.map((r) => r.seq)).size, APPEND_N, "併發 append 沒有重複或覆蓋");

// 併發 admit：兩條不同記憶同時寫入，必須都在
const concurrentBrain = join(root, "concurrent-admit");
writeBrain(concurrentBrain, "concurrent", "基線決策");
const admitCandidate = (n) => ({
  type: "decision",
  title: "併發決策 " + n,
  content: "第 " + n + " 條併發寫入的決策，用於驗證讀整表到寫回之間沒有被別的序列插進來。",
  importance: 0.6,
  source: { kind: "agent" },
});
const admitResults = await Promise.all(
  Array.from({ length: 6 }, (_, i) =>
    admitMemory({
      fs: fsAdapter,
      projectPath: concurrentBrain,
      candidate: admitCandidate(i),
      channel: "automatic",
      llmConfirm: { admit: true },
    })),
);
assert.equal(admitResults.filter((r) => r.ok && r.action === "insert").length, 6, "6 條併發 admit 全部 insert");
const admitRows = readFileSync(join(concurrentBrain, ".project-brain", "memory.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
assert.equal(admitRows.filter((m) => /^併發決策/.test(m.title)).length, 6, "併發 admit 的 6 條都在檔案裡");

// admit 與整表重寫（歸檔）併發：兩邊的結果都必須保留
const mixedTarget = admitRows.find((m) => m.title === "併發決策 0");
await Promise.all([
  admitMemory({
    fs: fsAdapter,
    projectPath: concurrentBrain,
    candidate: admitCandidate(99),
    channel: "automatic",
    llmConfirm: { admit: true },
  }),
  withWriteLock(brainTxKey(concurrentBrain, "memory.jsonl"), async () => {
    const rows = await readJsonl(fsAdapter, join(concurrentBrain, ".project-brain", "memory.jsonl"));
    const next = applyMemoryStatus(rows, { id: mixedTarget.id, status: "archived", reason: "併發驗證" });
    return writeJsonl(fsAdapter, join(concurrentBrain, ".project-brain", "memory.jsonl"), next.rows);
  }),
]);
const mixedRows = readFileSync(join(concurrentBrain, ".project-brain", "memory.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
assert.equal(mixedRows.filter((m) => m.title === "併發決策 99").length, 1, "整表重寫沒有吞掉併發 append 的新記憶");
assert.equal(mixedRows.find((m) => m.id === mixedTarget.id).status, "archived", "append 沒有回滾掉併發的整表重寫");
assert.equal(pendingLockCount(), 0, "所有寫入完成後鎖佇列應排空，不洩漏");

// 重入檢測：持鎖期間再取同一把鎖必須當場報錯，而不是自己等自己
await assert.rejects(
  withWriteLock("reentry-key", () => withWriteLock("reentry-key", async () => "inner")),
  (e) => e.code === "E_WRITE_LOCK_REENTRY",
  "巢狀獲取同一把鎖立刻拋 E_WRITE_LOCK_REENTRY，不掛起",
);
// 不同 key 的巢狀是合法的（事務鎖套檔案鎖就是這麼用的）
assert.equal(
  await withWriteLock("outer-key", () => withWriteLock("inner-key", async () => "ok")),
  "ok",
  "不同 key 的巢狀正常放行",
);
// 報錯之後鎖要正常釋放，不能把後續任務堵死
assert.equal(await withWriteLock("reentry-key", async () => "after"), "after", "重入報錯不影響後續取鎖");

// 人工維護的完整鏈路必須真的返回。這條曾經因為在鎖內調 buildWorkspacePreview
// （內部會再取同一把事務鎖）而永遠不 settle：資料寫進去了，前端一直轉圈。
const rpcProject = join(root, "rpc-mutation");
writeBrain(rpcProject, "rpc-mutation", "基線決策");
writeFileSync(join(rpcProject, ".project-brain", "memory.jsonl"), JSON.stringify({
  id: "mem-rpc-1", type: "decision", title: "會被歸檔的決策",
  content: "用來驗證歸檔 RPC 能在鎖釋放後正常返回，而不是掛起。",
  importance: 0.6, status: "active", createdAt: Date.now(), updatedAt: Date.now(),
}) + "\n");

const mutationArgs = (endpoint, payload) => ({
  endpoint, payload, projectPath: rpcProject, fs: fsAdapter, ctx: null, getMemoryConfig: () => ({}),
});
const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error("timeout: " + label)), ms)),
]);

const archiveRpc = await withTimeout(
  handleMemoryMutation(mutationArgs("memory.status", { id: "mem-rpc-1", status: "archived" })),
  5000,
  "歸檔 RPC 未在 5 秒內返回（疑似死鎖）",
);
assert.equal(archiveRpc.ok, true, "歸檔 RPC 正常返回");
assert.equal(archiveRpc.value.changed, true, "歸檔確實生效");
assert.ok(archiveRpc.value.preview, "返回裡帶上了最新 preview");

const restoreRpc = await withTimeout(
  handleMemoryMutation(mutationArgs("memory.status", { id: "mem-rpc-1", status: "active" })),
  5000,
  "恢復 RPC 未在 5 秒內返回（疑似死鎖）",
);
assert.equal(restoreRpc.ok, true, "恢復 RPC 正常返回");
assert.equal(restoreRpc.value.memory.status, "active", "恢復後狀態回到 active");

const editRpc = await withTimeout(
  handleMemoryMutation(mutationArgs("memory.update", { id: "mem-rpc-1", patch: { title: "改過標題的決策" } })),
  5000,
  "編輯 RPC 未在 5 秒內返回（疑似死鎖）",
);
assert.equal(editRpc.value.memory.title, "改過標題的決策", "編輯 RPC 正常返回並生效");

const deleteRpc = await withTimeout(
  handleMemoryMutation(mutationArgs("memory.delete", { id: "mem-rpc-1", confirm: true })),
  5000,
  "刪除 RPC 未在 5 秒內返回（疑似死鎖）",
);
assert.equal(deleteRpc.value.deletedId, "mem-rpc-1", "刪除 RPC 正常返回被刪 id");
assert.equal(pendingLockCount(), 0, "RPC 跑完鎖佇列排空");

rmSync(root, { recursive: true, force: true });
console.log("project memory isolation: 230 assertions PASS");
