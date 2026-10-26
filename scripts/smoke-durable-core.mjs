// Durable Core Memory — spec 2026-09-15
import { readFileSync, readdirSync, statSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import {
  enforceCoreCap,
  evaluateAdmit,
  housekeepMemories,
  memoryFingerprint,
  persistHousekeep,
  ruleGate,
  admitMemory,
} from "../src/host/memory/admit.js";
import { buildInjectionContext } from "../src/host/memory/inject-context.js";
import { isCoreMemory, isRetrievableMemory, makeMemoryEntry, buildContinueData } from "../src/host/store/brain-logic.js";
import { retrieveMemories, activeMemories } from "../src/host/memory/retrieval.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(__dirname, "..", "src");

let pass = 0;
let fail = 0;
function check(name, ok, extra) {
  if (ok) {
    pass += 1;
    console.log("  PASS  " + name);
  } else {
    fail += 1;
    console.log("  FAIL  " + name + (extra ? "  -> " + extra : ""));
  }
}

console.log("=== ruleGate ===");
check("reject version-led patch title", ruleGate({
  type: "change", title: "v1.2.0 patch #3：markdown 美化", content: "改了 client.js 樣式並驗收 39/39。", source: { kind: "agent" },
}).ok === false);

check("allow standing fact that mentions a version", ruleGate({
  type: "decision",
  title: "codegraph 以 tree-sitter 0.25 為執行時",
  content: "語法掃描繫結 tree-sitter 0.25，不隨發版說明寫入記憶。",
  source: { kind: "agent" },
}).ok === true);

check("reject file-list body", ruleGate({
  type: "decision",
  title: "本次改動",
  content: "- src/a.js\n- src/b.js\n- src/c.js\n- src/d.js",
  source: { kind: "agent" },
}).ok === false);

check("allow lesson starting with 剛才", ruleGate({
  type: "lesson",
  title: "改 host 必須重啟",
  content: "剛才踩了 DSH host 不熱更新，以後改 host 程式碼必須重啟 Desktop。",
  source: { kind: "session_semantic" },
}).ok === true);

check("reject session file-count changelog", ruleGate({
  type: "change",
  title: "本次 session 改動 8 個檔案",
  content: "改動的檔案：\n- a.js\n- b.js",
  source: { kind: "session_summary" },
}).ok === false);

check("context without user_explicit rejected", ruleGate({
  type: "context", title: "偏好", content: "以後都用 PostgreSQL 做主庫不要換。", source: { kind: "agent" },
}).ok === false);

check("context with user_explicit allowed", ruleGate({
  type: "context", title: "記住主庫", content: "以後都用 PostgreSQL 做主庫不要換。", source: { kind: "user_explicit" },
}).ok === true);

check("allow version-led release-fix when body is a durable lesson", ruleGate({
  type: "bug",
  title: "v0.7.0-beta.3 release-fix 四項 P0 阻塞全面修復",
  content: "根因：optional peer 必須在 devDependencies 宣告，否則乾淨 node 環境跑 smoke 會 MODULE_NOT_FOUND。以後發版前必須原生 npm test。",
  source: { kind: "agent" },
}).ok === true);

check("reject version-led patch when body is an acceptance report", ruleGate({
  type: "decision",
  title: "v1.2.0 patch #3：markdown 美化",
  content: "本次驗收 39/39 通過。git 快進 main。全套 smoke 16/16 PASS。改了 client.js 樣式。",
  source: { kind: "agent" },
}).ok === false);

check("reject this-session activity report even without changelog title", ruleGate({
  type: "lesson",
  title: "本次完成情況",
  content: "本次驗收 39/39 通過。git 快進 main。全套 smoke 16/16 PASS。沒有留下跨會話約束。",
  source: { kind: "session_semantic" },
}).ok === false);

const admitFalse = evaluateAdmit({
  type: "decision",
  title: "不該寫入的流水賬決策",
  content: "預設專案路徑必須讀 agent.session.header.cwd，這條只用來驗證 LLM 拒絕。",
  source: { kind: "agent" },
}, { memories: [], channel: "automatic", now: 1_700_000_000_000, llm: { admit: false } });
check("automatic admit:false rejects", admitFalse.action === "reject" && admitFalse.code === "E_ADMIT_REJECTED");

console.log("=== evaluateAdmit ===");
const now = 1_700_000_000_000;
const durable = {
  type: "decision",
  title: "路徑解析以 exec.agent.session 為準",
  content: "ToolRunContext 沒有 exec.session，預設路徑必須讀 agent.session.header.cwd。",
  importance: 0.9,
  source: { kind: "agent" },
};
const fp = memoryFingerprint(durable);
const existing = [makeMemoryEntry({ ...durable, source: { kind: "agent", fingerprint: fp } }, now - 1000)];
existing[0].source = { kind: "agent", fingerprint: fp };

const skip = evaluateAdmit(durable, { memories: existing, channel: "automatic", now, llm: { admit: true } });
check("duplicate fingerprint skips insert", skip.action === "skip");

const twin = {
  type: "decision",
  title: "路徑解析以 exec.agent.session 為準！",
  content: "另一條正文，標題很像但不該自動 superseded。必須保留兩條直到顯式替換。",
  source: { kind: "agent" },
};
const similar = evaluateAdmit(twin, { memories: existing, channel: "automatic", now, llm: { admit: true } });
check("title Jaccard does not auto-supersede", similar.action === "insert" && !similar.supersedesId);
check("title Jaccard recorded as suggestion", (similar.suggestions || []).some((s) => s.action === "suggest_supersede"));

const explicit = evaluateAdmit(twin, {
  memories: existing, channel: "automatic", now,
  llm: { admit: true, supersedes: existing[0].id },
});
check("explicit supersedes id is applied", explicit.action === "insert" && explicit.supersedesId === existing[0].id);

const noLlm = evaluateAdmit(durable, { memories: [], channel: "automatic", now });
check("automatic without LLM is unavailable", noLlm.action === "reject" && noLlm.code === "E_ADMIT_LLM_UNAVAILABLE");

const userOk = evaluateAdmit({
  type: "context",
  title: "不要 force push",
  content: "記住：向 main 提交時不要 force push，以免覆蓋他人歷史。",
  source: { kind: "user_explicit" },
}, { memories: [], channel: "user_explicit", now });
check("user_explicit skips LLM", userOk.action === "insert");

const uninit = evaluateAdmit(durable, { memories: [], channel: "user_explicit", now, initialized: false });
check("uninitialized rejects", uninit.action === "reject" && uninit.code === "E_NOT_INITIALIZED");

console.log("=== cap + housekeep ===");
// 顯式給上限，測的是淘汰行為本身，不跟著預設配置走。
const CAP = { maxItems: 15, maxTokens: 800 };
const actives = [];
for (let i = 0; i < CAP.maxItems; i++) {
  actives.push(makeMemoryEntry({
    type: "decision",
    title: "舊決策 " + i,
    content: "這是一條跨會話仍為真的專案決策內容，長度足夠通過門。編號 " + i,
    importance: 0.4 + (i === 0 ? 0 : 0.3),
  }, now - (20 - i) * 86400000));
}
const pinned = makeMemoryEntry({
  type: "lesson",
  title: "本輪新教訓",
  content: "剛確認：改 host 必須重啟 DSH Desktop，不要指望熱過載。",
  importance: 0.2,
}, now);
const capped = enforceCoreCap(actives.concat([pinned]), { pinnedIds: [pinned.id], now, limits: CAP });
const dormant = capped.rows.filter((m) => m.status === "dormant");
const stillActive = capped.rows.filter((m) => isCoreMemory(m));
check("cap evicts an older row not the pinned one", dormant.some((m) => m.title.startsWith("舊決策")) && stillActive.some((m) => m.id === pinned.id));
check("active count <= cap", stillActive.length <= CAP.maxItems);

const longFact = "這是一條跨會話仍為真的專案約束，預設路徑必須讀 session cwd，不要猜測安裝目錄。" + "必須保留。".repeat(90);
const closeOld = makeMemoryEntry({
  type: "decision",
  title: "較早但分略高的決策",
  content: longFact,
  importance: 0.9,
}, now - 100 * 86400000);
const closeNew = makeMemoryEntry({
  type: "architecture",
  title: "較新且同分檔的架構事實",
  content: longFact,
  importance: 0.85,
}, now);
const closeMid = makeMemoryEntry({
  type: "lesson",
  title: "另一條同分檔教訓",
  content: longFact,
  importance: 0.88,
}, now - 10 * 86400000);
const closeCap = enforceCoreCap([closeOld, closeNew, closeMid], { pinnedIds: [], now, limits: CAP });
const closeDormant = closeCap.rows.filter((m) => m.status === "dormant");
check(
  "close importance evicts older not the newer 0.85",
  closeDormant.some((m) => m.id === closeOld.id) && closeCap.rows.some((m) => m.id === closeNew.id && isCoreMemory(m)),
);

const changelogRow = makeMemoryEntry({
  type: "change",
  title: "v1.2.0 patch #4：同步倉庫",
  content: "git 快進 main，驗收 156/156。",
}, now);
const hk = housekeepMemories(actives.slice(0, 3).concat([changelogRow]), { now, pinnedIds: [] });
check("housekeep archives changelog but keeps row", hk.changed && hk.rows.some((m) => m.id === changelogRow.id && m.status === "archived"));
const nop = housekeepMemories(hk.rows, { now, pinnedIds: [] });
check("second housekeep is no-op", nop.changed === false);

check("dormant is retrievable not core", isRetrievableMemory({ status: "dormant" }) && !isCoreMemory({ status: "dormant" }));
check("missing status counts as core", isCoreMemory({ status: undefined, title: "x" }));

console.log("=== unique writer grep ===");
function walkJs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkJs(p, out);
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}
const offenders = [];
for (const file of walkJs(SRC_ROOT)) {
  if (file.replace(/\\/g, "/").endsWith("/host/memory/admit.js")) continue;
  const text = readFileSync(file, "utf8");
  if (/appendJsonl\s*\([^)]*memory\.jsonl/.test(text) || /appendJsonl\s*\([\s\S]{0,200}["']memory\.jsonl["']/.test(text)) {
    offenders.push(file);
  }
}
check("no memory.jsonl append outside admit.js", offenders.length === 0, offenders.map((f) => f.slice(SRC_ROOT.length)).join(", "));

const expectedFp = createHash("sha256").update("decision a b", "utf8").digest("hex").slice(0, 24);
check("fingerprint stable", memoryFingerprint({ type: "decision", title: "A", content: "B" }) === expectedFp);

console.log("=== admitMemory IO ===");
const root = mkdtempSync(join(tmpdir(), "dsh-admit-"));
const projectPath = join(root, "app");
mkdirSync(join(projectPath, ".project-brain"), { recursive: true });
writeFileSync(join(projectPath, ".project-brain", "project.json"), JSON.stringify({
  id: "p1", name: "app", techStack: { backend: "Node.js" }, createdAt: now, updatedAt: now,
}));
writeFileSync(join(projectPath, ".project-brain", "memory.jsonl"), "");
writeFileSync(join(projectPath, ".project-brain", "todo.jsonl"), "");
writeFileSync(join(projectPath, ".project-brain", "timeline.jsonl"), "");
const fsAdapter = {
  resolve: async (p) => p,
  readText: async (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } },
  writeText: async (p, text) => {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text, "utf8");
    return true;
  },
};
const inserted = await admitMemory({
  fs: fsAdapter,
  projectPath,
  candidate: {
    type: "decision",
    title: "路徑以 session cwd 為準",
    content: "預設專案路徑必須讀 agent.session.header.cwd，而不是猜測 Desktop 安裝目錄。",
    source: { kind: "agent" },
  },
  channel: "automatic",
  llmConfirm: { admit: true },
  now,
});
check("admitMemory writes a row", inserted.ok === true && inserted.action === "insert");
const noLlmWrite = await admitMemory({
  fs: fsAdapter,
  projectPath,
  candidate: {
    type: "lesson",
    title: "第二條不該寫入",
    content: "這條在 LLM 不可用時絕對不能進 memory.jsonl，只用於驗證拒絕。",
    source: { kind: "agent" },
  },
  channel: "automatic",
  now: now + 1,
});
check("automatic without confirm writes nothing extra", noLlmWrite.ok === false && noLlmWrite.code === "E_ADMIT_LLM_UNAVAILABLE");

const uninitDir = join(root, "plain");
mkdirSync(uninitDir, { recursive: true });
const uninitAdmit = await admitMemory({
  fs: fsAdapter,
  projectPath: uninitDir,
  candidate: durable,
  channel: "user_explicit",
  now,
});
check("uninitialized admit creates no brain dir", uninitAdmit.code === "E_NOT_INITIALIZED" && existsSync(join(uninitDir, ".project-brain")) === false);

const injBrain = {
  project: { id: "p1", name: "app", techStack: { backend: "Node.js" } },
  memories: [inserted.entry],
  todos: [{ id: "t1", title: "接著改 admit", status: "pending", priority: "high" }],
  timeline: [{ eventType: "session_summary", occurredAt: now, summary: "上次把寫入通道收口到 admitMemory。" }],
};
const inj = buildInjectionContext(injBrain);
const cont = buildContinueData(injBrain, now);
check("injector assembler has Core heading", /### Core 記憶/.test(inj));
check("continue uses the same Core titles", cont.topMemories.some((m) => m.title === inserted.entry.title));
check("same assembler omits 記住就調 memory_add", !/無需再次確認/.test(inj) && !/使用者說「記住/.test(inj));
check("continue.injection matches injector assembler", buildInjectionContext(injBrain) === inj);

const rejected = await admitMemory({
  fs: fsAdapter,
  projectPath,
  candidate: {
    type: "decision",
    title: "LLM 判定為流水賬",
    content: "預設專案路徑必須讀 agent.session.header.cwd，這條會被 admit:false 擋住。",
    source: { kind: "agent" },
  },
  channel: "automatic",
  llmConfirm: { admit: false },
  now: now + 2,
});
check("admitMemory honor admit:false with no extra row", rejected.ok === false && rejected.code === "E_ADMIT_REJECTED");

writeFileSync(join(projectPath, ".project-brain", "memory.jsonl"), JSON.stringify({
  schemaVersion: 2, id: "mem-old-change", type: "change",
  title: "v1.2.0 patch #4：同步倉庫",
  content: "git 快進 main，驗收 156/156。",
  importance: 0.6, confidence: 1, status: "active",
  source: { kind: "agent" }, createdAt: now, updatedAt: now,
}) + "\n");
const onRead = await persistHousekeep(fsAdapter, projectPath, { now: now + 3, writeTimeline: false });
check("on-read housekeep archives changelog", onRead.ok && onRead.changed && (onRead.rows || []).some((m) => m.id === "mem-old-change" && m.status === "archived"));
const tlAfterRead = readFileSync(join(projectPath, ".project-brain", "timeline.jsonl"), "utf8");
check("on-read housekeep does not append dream timeline", !/trigger=housekeep/.test(tlAfterRead));

const askCorpus = [
  makeMemoryEntry({ type: "decision", title: "主庫用 PostgreSQL", content: "以後都用 PostgreSQL 做主庫不要換。", importance: 0.9 }, now),
  Object.assign(makeMemoryEntry({ type: "architecture", title: "雙路召回 RRF", content: "project_ask 預設可按關鍵詞召回 dormant 的雙路召回架構事實。", importance: 0.85 }, now), { status: "dormant" }),
  Object.assign(makeMemoryEntry({ type: "change", title: "v1.2.0 patch 歸檔說明", content: "這條 changelog 已歸檔，預設 ask 不該命中。", importance: 0.9 }, now), { status: "archived" }),
];
const askHits = retrieveMemories({ memories: askCorpus, query: "雙路召回", topK: 5, now });
check("ask hits dormant by keyword", askHits.some((h) => h.memory.title.includes("雙路召回")));
check("ask default skips archived", !askHits.some((h) => h.memory.status === "archived"));
check("retrievable pool excludes archived", activeMemories(askCorpus).every((m) => m.status !== "archived"));

const vecHits = retrieveMemories({
  memories: [
    makeMemoryEntry({ id: "jwt", type: "decision", title: "認證方案", content: "使用 JWT refresh token 完成登入認證", importance: 0.8 }, now),
  ],
  query: "JWT 認證",
  topK: 3,
  vectors: new Map([["jwt", [1, 0]]]),
  queryVector: [1, 0],
});
check("ask with vectors uses weighted blend not RRF", vecHits.length > 0 && vecHits[0].relevance > 0.15 && vecHits[0].relevance <= 1.2);

rmSync(root, { recursive: true, force: true });

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
