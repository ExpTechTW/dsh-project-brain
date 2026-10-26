// 跨 Session smoke test（v0.3.12）
//
// 模擬完整生命週期：
//   1. 準備 fixture 專案（package.json + 2 src/*.js）
//   2. 跑 scanner → 生成 .project-brain/project.json + init timeline
//   3. project_memory_add（決策/教訓）
//   4. project_todo_add / project_todo_list
//   5. 模擬 session/disposed → setupSummarizer 寫 change memory + session_summary 事件
//   6. 模擬 agent/session-start → setupInjector 讀 project.jsonl 注入 context
//   7. 驗證：
//      - project.json 正確生成
//      - memory.jsonl 含 init/decision/lesson/change/session_summary
//      - todo.jsonl 含 todo + session_start 列出來了
//      - injector 輸出 markdown 含 briefing 四段 + Core 記憶 + 活躍待辦標題
//
// 退出碼：0 = PASS，1 = FAIL

import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 1. 準備 fixture 專案
const TMP = mkdtempSync(join(tmpdir(), "dsh-pb-session-"));
const PKG_DIR = join(TMP, "my-app");
mkdirSync(join(PKG_DIR, "src"), { recursive: true });
writeFileSync(join(PKG_DIR, "package.json"), JSON.stringify({
  name: "my-app", version: "0.1.0",
  dependencies: { express: "^4.18.0" },
}, null, 2), "utf8");
writeFileSync(join(PKG_DIR, "src", "index.js"), "const app = require('express')();\nmodule.exports = app;\n", "utf8");
writeFileSync(join(PKG_DIR, "src", "routes.js"), "module.exports = function (app) { app.get('/', (req, res) => res.send('hi')); };\n", "utf8");
mkdirSync(join(PKG_DIR, ".project-brain"), { recursive: true });

// 初始化 git 倉庫（summarizer 需要 git diff 才能寫 change memory）
import { spawnSync } from "node:child_process";
try {
  spawnSync("git", ["init", "--quiet"], { cwd: PKG_DIR });
  spawnSync("git", ["config", "user.email", "test@local"], { cwd: PKG_DIR });
  spawnSync("git", ["config", "user.name", "test"], { cwd: PKG_DIR });
  // baseline commit
  spawnSync("git", ["add", "-A"], { cwd: PKG_DIR });
  spawnSync("git", ["commit", "--quiet", "-m", "init"], { cwd: PKG_DIR });
  // 再加一個新檔案作為"上次 session 之後"的變更 → HEAD~1 對比會有 diff
  writeFileSync(join(PKG_DIR, "src", "utils.js"), "module.exports = { greet: () => 'hi' };\n", "utf8");
  spawnSync("git", ["add", "-A"], { cwd: PKG_DIR });
  spawnSync("git", ["commit", "--quiet", "-m", "add utils"], { cwd: PKG_DIR });
} catch (e) {
  console.log("[warn] git init failed:", e.message, "— summarizer change memory step will be skipped");
}

// 2. node-fs adapter
import * as nodefs from "node:fs";
const fsAdapter = {
  resolve: async (p, opts) => {
    if (opts && opts.cwd) return join(opts.cwd, p);
    return p;
  },
  listDir: async (target) => {
    const dir = typeof target === "string" ? target : (target && target.path) || String(target);
    const entries = nodefs.readdirSync(dir, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "directory" : (e.isFile() ? "file" : "other"),
      target: join(dir, e.name),
    }));
  },
  readText: async (target) => {
    try { return nodefs.readFileSync(target, "utf8"); } catch { return null; }
  },
  writeText: async (target, content) => {
    try {
      const dir = String(target).replace(/[\\/][^\\/]*$/, "");
      nodefs.mkdirSync(dir, { recursive: true });
    } catch (e) {}
    nodefs.writeFileSync(target, content, "utf8");
    return true;
  },
};

// 3. mock ctx（emit + on + logger + shell service）
const emitCalls = [];
const eventHandlers = {};
import { spawn as childSpawn } from "node:child_process";
const shellService = {
  resolve: (spec) => spec,
  run: (spec) => {
    return new Promise((resolve) => {
      try {
        const child = childSpawn(spec.command, spec.args, { cwd: spec.cwd, stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        let err = "";
        child.stdout.on("data", (d) => { out += d.toString(); });
        child.stderr.on("data", (d) => { err += d.toString(); });
        child.on("close", (code) => resolve({ exitCode: code, stdout: out, stderr: err }));
        child.on("error", (e) => resolve({ exitCode: -1, stdout: "", stderr: String(e) }));
      } catch (e) {
        resolve({ exitCode: -1, stdout: "", stderr: String(e) });
      }
    });
  },
};
const ctx = {
  logger: { info: (m) => console.log("[ctx.info]", m), warn: (m) => console.log("[ctx.warn]", m), error: (m) => console.log("[ctx.error]", m), debug: () => {} },
  on: (event, handler) => { (eventHandlers[event] = eventHandlers[event] || []).push(handler); },
  emit: (event, payload) => { emitCalls.push({ event, payload }); const hs = eventHandlers[event]; if (hs) for (const h of hs) try { h(payload); } catch (e) { console.log("emit handler error:", e.message); } },
  get: (name) => {
    if (name === "shell") return shellService;
    return undefined;
  },
};
const sandboxPolicy = { workspaceRoot: PKG_DIR };

let pass = 0;
let fail = 0;
const check = (name, ok) => { if (ok) { console.log(`  [PASS] ${name}`); pass++; } else { console.log(`  [FAIL] ${name}`); fail++; } };

// ─── Step 2: scanner ───
console.log("\n=== Step 2: scanner ===");
const { scanProject } = await import("../src/scanner.js");
const scan = await scanProject(fsAdapter, PKG_DIR);
console.log("languages:", scan.languages);
console.log("techStack:", scan.techStack);
console.log("entrypoints:", scan.entrypoints);
console.log("fileCount:", scan.fileCount);
check("scanner 識別 javascript 語言", scan.languages.javascript === 2 || scan.languages.javascript > 0);
check("scanner 識別 express 技術棧", scan.techStack.backend && /express/i.test(String(scan.techStack.backend)));
check("scanner entrypoints 欄位存在（陣列）", Array.isArray(scan.entrypoints));
check("scanner fileCount 包含 src/*.js", scan.fileCount >= 2);

// 寫 project.json
const projectId = "test-" + Date.now().toString(36);
const projectJson = {
  id: projectId,
  name: "my-app",
  rootPath: PKG_DIR,
  techStack: scan.techStack,
  languages: scan.languages,
  size: { files: scan.fileCount, loc: 0 },
  entrypoints: scan.entrypoints,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  lastScannedAt: Date.now(),
};
writeFileSync(join(PKG_DIR, ".project-brain", "project.json"), JSON.stringify(projectJson, null, 2), "utf8");
check("project.json 寫入成功", existsSync(join(PKG_DIR, ".project-brain", "project.json")));

// 寫 init timeline
writeFileSync(join(PKG_DIR, ".project-brain", "timeline.jsonl"),
  JSON.stringify({
    id: "evt-init-1",
    title: "完成 project_init 掃描",
    eventType: "init",
    occurredAt: Date.now(),
    detail: "files=" + scan.fileCount,
  }) + "\n",
  "utf8",
);

// ─── Step 3: project_memory_add（直接用 brain-files + brain-logic，避開 dsh-tools） ───
console.log("\n=== Step 3: memory_add ===");
const { brainPath, appendJsonl } = await import("../src/host/store/brain-files.js");
const { makeMemoryEntry } = await import("../src/host/store/brain-logic.js");

const now = Date.now();
const mem1 = makeMemoryEntry({ type: "decision", title: "採用 Express 框架", content: "選擇 Express 因為生態最成熟", importance: 0.8, relatedFiles: ["package.json"] }, now);
const mem2 = makeMemoryEntry({ type: "lesson", title: "DSH host bundle 不會自動熱過載", content: "改 host 程式碼必須重啟 DSH", importance: 0.85 }, now + 1);
await appendJsonl(fsAdapter, brainPath(PKG_DIR, "memory.jsonl"), mem1);
await appendJsonl(fsAdapter, brainPath(PKG_DIR, "memory.jsonl"), mem2);

const memFile = readFileSync(join(PKG_DIR, ".project-brain", "memory.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
check("memory.jsonl 寫入 2 條", memFile.length === 2);
check("mem1 type = decision", memFile[0].type === "decision");
check("mem1.importance = 0.8", memFile[0].importance === 0.8);

// ─── Step 4: project_todo_add ───
console.log("\n=== Step 4: todo_add ===");
const { makeTodoEntry } = await import("../src/host/store/brain-logic.js");
const todo1 = makeTodoEntry({ title: "實現使用者註冊 API", description: "POST /api/register", priority: "high", relatedFiles: ["src/routes.js"] }, now);
const todo2 = makeTodoEntry({ title: "新增單元測試", priority: "medium" }, now + 1);
await appendJsonl(fsAdapter, brainPath(PKG_DIR, "todo.jsonl"), todo1);
await appendJsonl(fsAdapter, brainPath(PKG_DIR, "todo.jsonl"), todo2);
const todoFile = readFileSync(join(PKG_DIR, ".project-brain", "todo.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
check("todo.jsonl 寫入 2 條", todoFile.length === 2);
check("todo1 priority = high", todoFile[0].priority === "high");
check("todo1 status = pending", todoFile[0].status === "pending");

// ─── Step 5: 模擬 session/disposed → summarizer ───
console.log("\n=== Step 5: summarizer ===");
const { setupSummarizer } = await import("../src/host/summarizer.js");
const { setupInjector } = await import("../src/host/injector.js");

// 先註冊 summarizer（訂閱 session/disposed）
setupSummarizer(ctx, fsAdapter, sandboxPolicy);

// 模擬 session 離開
ctx.emit("session/disposed", {
  id: "session-test-1",
  meta: { cwd: PKG_DIR, id: "session-test-1" },
});

// 給 summarizer 非同步時間（git diff + 寫檔案 + emit preview.changed）
await new Promise((r) => setTimeout(r, 1000));

const memAfterSummary = readFileSync(join(PKG_DIR, ".project-brain", "memory.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const tlAfterSummary = readFileSync(join(PKG_DIR, ".project-brain", "timeline.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
check("summarizer 後 memory.jsonl 不含 change 型別", !memAfterSummary.some((m) => m.type === "change"));
check("summarizer 後 timeline.jsonl 含 session_summary", tlAfterSummary.some((e) => e.eventType === "session_summary"));
console.log("  (memory rows:", memAfterSummary.length, ", timeline entries:", tlAfterSummary.length, ")");

// ─── Step 6: agent/session-start → injector 注入 ───
console.log("\n=== Step 6: injector ===");
// 模擬 systemPrompt service（injector 註冊的 section render 需要）
const sections = [];
const systemPromptMock = {
  section: (s) => { sections.push(s); return () => {}; },
};
// 替換 ctx.get 讓 systemPrompt service 可用（保留 shell）
ctx.get = (name) => {
  if (name === "systemPrompt") return systemPromptMock;
  if (name === "shell") return shellService;
  if (name === "sessions") return { list: () => [] };
  return undefined;
};

// 先 setupInjector（註冊 section + 訂閱 agent/session-start）
setupInjector(ctx, fsAdapter, sandboxPolicy);
// 等註冊完成
await new Promise((r) => setTimeout(r, 50));
const ourSection = sections.find((s) => s.name === "project-brain-context");
check("systemPrompt section 註冊成功", !!ourSection);

// 然後 emit session-start（injector handler 才會被調到 + refreshCache）
ctx.emit("agent/session-start", {
  agent: { session: { meta: { cwd: PKG_DIR }, cwd: PKG_DIR, header: { cwd: PKG_DIR } } },
});
await new Promise((r) => setTimeout(r, 300));  // 等 refreshCache (async read file)

// 調 render
if (ourSection) {
  const md = typeof ourSection.text === "function" ? ourSection.text({}) : ourSection.text;
  console.log("\n--- injected context ---\n" + md + "\n---");
  check("injected context 包含 'Project Brain'", /## Project Brain/.test(md));
  check("injected context 包含專案介紹", /### 這是什麼/.test(md) && !/### 這是什麼\s*\nmy-app/.test(md));
  check("injected context 包含 briefing 標題", /### 最近做什麼/.test(md) && /### 這是什麼/.test(md));
  check("injected context 包含 decision memory '採用 Express'", /採用 Express/.test(md));
  check("injected context 包含 lesson memory 'DSH host bundle'", /DSH host bundle/.test(md));
  check("injected briefing 不把 pending TODO 當最近做什麼", /### 最近做什麼/.test(md) && !/### 最近做什麼[\s\S]*實現使用者註冊/.test((md.split("### 從哪改")[0] || md)));
}

// ─── Step 7: build-time embed（build.js loadProjectData）───
console.log("\n=== Step 7: build-time embed ===");
const { loadProjectData } = await import("../build.js");
const preview = loadProjectData(PKG_DIR);
console.log("preview.initialized:", preview.initialized);
console.log("preview.project.name:", preview.project && preview.project.name);
console.log("preview.memories:", preview.memories.length);
console.log("preview.todos:", preview.todos.length);
console.log("preview.stats:", preview.stats);
check("build embed initialized=true", preview.initialized === true);
check("build embed project.name='my-app'", preview.project && preview.project.name === "my-app");
check("build embed memories count >= 2", preview.memories.length >= 2);
check("build embed todos count >= 2", preview.todos.length >= 2);
check("build embed stats.pendingTodos >= 2", preview.stats.pendingTodos >= 2);
check("build embed stats.decisions >= 1", preview.stats.decisions >= 1);

console.log(`\n${pass} PASS / ${fail} FAIL`);

// 清理
rmSync(TMP, { recursive: true, force: true });

process.exit(fail === 0 ? 0 : 1);