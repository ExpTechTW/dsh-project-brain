// smoke-session-refresh.mjs — 會話摘要全鏈路
//
// 用真實 setupSummarizer + 偽 ctx，覆蓋：
//   A) session/disposed + 只改普通原始碼 → 寫 session_summary + 輕掃；**不得**跑 full 架構
//   B) 新增原始碼檔案 → 結構變化 → 跑 full 架構 → architectureStale=false
//   C) full 架構失敗 → markArchitectureStale 兜底寫 architectureStale=true
//   D) 主路徑 session/flush：事件往往只有 id，cwd 在 live session 上；
//      空閒未滿不摘要，持續 flush 把鬧鐘往後推，安靜夠久才寫 session_summary
//
// 同時校驗 session_summary.files 是真實路徑（不是 init detail 裡的檔案計數）。

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scanAndWrite } from "../src/host/scan-and-write.js";
import { setupSummarizer } from "../src/host/summarizer.js";

const HOUR = 3600_000;
const NOW = Date.now();
const root = mkdtempSync(join(tmpdir(), "dsh-pb-refresh-"));
const brainDir = join(root, ".project-brain");
const SENTINEL = { version: "sentinel", overview: { purpose: "keep me" }, keyFiles: [] };

let blockArchitectureWrite = false;

const fsAdapter = {
  async resolve(p, opts) { return opts && opts.cwd ? join(opts.cwd, p) : p; },
  async readText(target) { return readFileSync(target, "utf8"); },
  async writeText(target, content) {
    // fs 適配層的契約是「失敗拋錯」（brain-files.writeText 只 catch 異常），樁必須照做
    if (blockArchitectureWrite && String(target).endsWith("architecture.json")) {
      throw new Error("EACCES: simulated architecture.json write failure");
    }
    const dir = target.slice(0, Math.max(target.lastIndexOf("/"), target.lastIndexOf("\\")));
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(target, content, "utf8");
    return true;
  },
  async listDir(target) {
    return readdirSync(target, { withFileTypes: true })
      .map((e) => ({ name: e.name, isFile: e.isFile(), isDirectory: e.isDirectory() }));
  },
};

const write = (rel, body, atMs) => {
  const full = join(root, rel);
  mkdirSync(full.slice(0, Math.max(full.lastIndexOf("/"), full.lastIndexOf("\\"))), { recursive: true });
  writeFileSync(full, body, "utf8");
  if (atMs) utimesSync(full, atMs / 1000, atMs / 1000);
};

const readProject = () => JSON.parse(readFileSync(join(brainDir, "project.json"), "utf8"));
const readArchitecture = () => JSON.parse(readFileSync(join(brainDir, "architecture.json"), "utf8"));
const timeline = () => readFileSync(join(brainDir, "timeline.jsonl"), "utf8")
  .trim().split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

// ── fixture ──
write("package.json", JSON.stringify({ name: "refresh-fixture", dependencies: { express: "4.19.0" } }));
write("src/index.js", "module.exports = require('./host/thing');\n");
write("src/host/thing.js", "module.exports = 1;\n");

const init = await scanAndWrite(fsAdapter, null, { path: root }, "project_init", {});
assert.equal(init.ok, true, JSON.stringify(init));

// fixture 檔案的「出生時間」就是剛剛，沒法改。所以視窗錨點必須取在 fixture 建好之後，
// 這樣已有檔案才算「視窗前就存在」（modified），本輪新建的才算 added。
const FIXTURE_DONE_AT = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pastAll = () => {
  for (const rel of ["package.json", "src/index.js", "src/host/thing.js", "src/host/new-module.js"]) {
    const full = join(root, rel);
    if (existsSync(full)) {
      const at = (FIXTURE_DONE_AT - HOUR) / 1000;
      utimesSync(full, at, at);
    }
  }
};
const setWindowAnchor = () => {
  const p = readProject();
  p.lastScannedAt = FIXTURE_DONE_AT + 5;
  writeFileSync(join(brainDir, "project.json"), JSON.stringify(p), "utf8");
};

// LLM 樁：產出一條 durable 記憶 + 一句人話摘要
const llmResponse = JSON.stringify({
  summary: "把注入上下文收斂成一份 briefing，避免每輪重複介紹專案。",
  memories: [{
    type: "decision",
    title: "注入統一走 briefing 組裝",
    content: "人第一屏與 Agent 注入共用同一個組裝函式，避免兩套文案各寫各的。",
    evidence: "統一 briefing",
    durable: true,
    importance: 0.8,
    confidence: 0.9,
  }],
});
const llm = {
  async *stream() {
    yield { type: "text-delta", index: 0, text: llmResponse };
    yield { type: "finish", reason: { kind: "stop" } };
  },
};

function makeSession(id) {
  return {
    id,
    cwd: root,
    meta: { cwd: root },
    header: { cwd: root },
    requestContext() { return { provider: "stub", model: "stub-model" }; },
    deriveMessages() {
      return [
        { role: "user", content: [{ type: "text", text: "統一 briefing，把注入和第一屏合成一份。" }] },
        { role: "assistant", content: [{ type: "text", text: "已完成，原因是兩套文案會漂移。" }] },
      ];
    },
  };
}

// 真實 setupSummarizer + 偽 ctx（DSH 側就是這樣註冊和觸發的）
async function disposeSession(id) {
  let handler = null;
  const pending = [];
  const ctx = {
    logger: { info() {}, warn() {} },
    on(evt, cb) { if (evt === "session/disposed") handler = cb; },
    emit() {},
    effect(fn) { pending.push(fn()); },
  };
  setupSummarizer(ctx, fsAdapter, null, {
    getLlm: () => llm,
    getMemoryConfig: () => ({}),
  });
  assert.ok(handler, "summarizer 必須訂閱 session/disposed");
  handler(makeSession(id));
  await Promise.all(pending);
}

// ── 場景 A：只改普通原始碼 → 輕掃，不跑 full 架構 ──
writeFileSync(join(brainDir, "architecture.json"), JSON.stringify(SENTINEL), "utf8");
pastAll();
setWindowAnchor();
await sleep(60);
write("src/host/thing.js", "module.exports = 2; // touched\n", Date.now());

await disposeSession("sess-a");

const summaryOf = (sid) => timeline().find((e) => e.eventType === "session_summary" && e.sessionId === sid);
const evA = summaryOf("sess-a");
assert.ok(evA, "關會話必須寫 session_summary");
// 輕掃會在摘要之後再追加一條 rescan，所以摘要不一定是最後一條
assert.ok(timeline().some((e) => e.eventType === "rescan" && e.architectureMode === "light"), "改原始碼應觸發輕掃");
assert.match(evA.summary, /briefing/, "人話摘要應寫入 timeline：" + JSON.stringify(evA.summary));
assert.ok(evA.files.includes("src/host/thing.js"), "改動檔案應進 files：" + JSON.stringify(evA.files));
assert.ok(!evA.files.some((f) => /^\d+$/.test(f)), "files 裡不能出現檔案計數");
assert.ok(!evA.files.includes("src/index.js"), "視窗外的檔案不該被算進來");
assert.ok(evA.changes.some((c) => c.path === "src/host/thing.js" && c.type === "modified"));
assert.equal(readArchitecture().version, "sentinel", "改普通原始碼不得觸發 full 架構");

// ── 場景 B：新增原始碼檔案 → 結構變化 → 跑 full 架構 ──
pastAll();
setWindowAnchor();
await sleep(60);
write("src/host/new-module.js", "module.exports = 'new';\n", Date.now());

await disposeSession("sess-b");

const archB = readArchitecture();
assert.notEqual(archB.version, "sentinel", "新增原始碼檔案必須觸發 full 架構重分析");
assert.ok(archB.stats && typeof archB.stats.modules === "number", "應產出真實架構：" + JSON.stringify(Object.keys(archB)));
assert.equal(readProject().architectureStale, false, "full 成功後必須清除過期標記");

// ── 場景 C：full 架構寫失敗 → 必須顯式置過期 ──
writeFileSync(join(brainDir, "architecture.json"), JSON.stringify(SENTINEL), "utf8");
pastAll();
setWindowAnchor();
await sleep(60);
write("src/host/another-module.js", "module.exports = 'another';\n", Date.now());
blockArchitectureWrite = true;

await disposeSession("sess-c");

blockArchitectureWrite = false;
assert.equal(readProject().architectureStale, true, "full 失敗必須置 architectureStale=true，不能拿舊泳道當真理");
assert.equal(readArchitecture().version, "sentinel", "失敗時不得破壞已有 architecture.json");

// 同一會話沒有新增訊息（增量 < 4）→ 不再寫第二條摘要
const before = timeline().length;
await disposeSession("sess-c");
assert.equal(timeline().length, before, "訊息沒有增長時不應寫第二條摘要");

// ── 場景 D：主路徑 session/flush。載荷只有 id，cwd / 轉寫在 live session 上 ──
async function flushIdle(id) {
  const pending = [];
  const handlers = {};
  const live = makeSession(id);
  const idleMs = 200;
  const ctx = {
    logger: { info() {}, warn() {} },
    on(evt, cb) { handlers[evt] = cb; },
    get() { return { get(sid) { return sid === id ? live : null; } }; },
    emit() {},
    effect(fn) { pending.push(fn()); },
  };
  setupSummarizer(ctx, fsAdapter, null, {
    getLlm: () => llm,
    getMemoryConfig: () => ({ sessionIdleSummaryMs: idleMs }),
  });
  assert.ok(handlers["session/flush"], "summarizer 必須訂閱 session/flush");
  assert.ok(handlers["session/disposed"], "disposed 仍要訂閱，發了就立刻摘");
  assert.equal(summaryOf(id), undefined, "flush 之前沒有摘要");
  handlers["session/flush"]({ id });
  await sleep(60);
  assert.equal(summaryOf(id), undefined, "空閒未滿不寫摘要");
  handlers["session/flush"]({ id });
  await sleep(60);
  assert.equal(summaryOf(id), undefined, "持續 flush 會把鬧鐘往後推");
  await sleep(idleMs + 80);
  await Promise.all(pending);
  const ev = summaryOf(id);
  assert.ok(ev, "空閒滿後必須寫 session_summary");
  assert.equal(ev.sessionId, id);
  assert.equal(ev.messageCount, 2, "摘要記下當時覆蓋到的訊息數");
}
await flushIdle("sess-flush");

rmSync(root, { recursive: true, force: true });
console.log("smoke-session-refresh: PASS");
