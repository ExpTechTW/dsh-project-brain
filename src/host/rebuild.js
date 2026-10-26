// rebuild.js - 監聽 .project-brain/ 變化自動重新構建 bundle
// 目的：讓 LLM 調 project_* 工具後，DSH client bundle 自動更新（host bundle 仍需重啟 DSH 載入）
//
// v0.3.14 重大改動：放棄 `ctx.on("project_brain/preview.changed")` 跨 fiber 事件訂閱
//   根因：Cordis 4 Scoped<Context> 模型 ctx.emit/on 預設只在同 fiber 內 dispatch；
//   dsh-project-brain host bundle 在 host fiber 註冊，工具 exec.ctx 是 agent fiber —— 跨 fiber 不通。
//   修復：用 ctx.timer.periodic 5 秒輪詢 .project-brain/{project,memory,todo,timeline}.json* 的 mtime，
//   任意一個變化觸發 runBuild()。跨 fiber 穩定，不依賴自定義事件名。
// 保留原 ctx.on() 作為 fallback（如果未來 DSH 提供跨 fiber 路由能工作）。

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Source runs from <plugin>/src/host, while the packaged bundle runs from
// <plugin>/dsh-project-brain/lib/host. Resolve the outer plugin root in both
// layouts so build.js and the workspace data are addressed consistently.
const CANDIDATE_PLUGIN_DIR = join(__dirname, "..", "..");
const PLUGIN_DIR = existsSync(join(CANDIDATE_PLUGIN_DIR, "build.js"))
  ? CANDIDATE_PLUGIN_DIR
  : join(CANDIDATE_PLUGIN_DIR, "..");

// v0.3.14：監聽檔案列表（每個 workspace 的 .project-brain/ 四個核心檔案）
//   多 workspace 場景：監聽 sandboxPolicy.workspaceRoot 下的 .project-brain/ + 輪詢期間發現的其它 workspace
const WATCH_FILES = ["project.json", "architecture.json", "memory.jsonl", "todo.jsonl", "timeline.jsonl"];

let rebuilding = false;
let pending = false;

async function runBuild() {
  if (rebuilding) { pending = true; return; }
  rebuilding = true;
  try {
    // v0.5.1：只走 DSH ctxShell.run（框架官方通道），徹底撤掉 fallback child_process.spawn
    //   歷史原因：v0.3.6 引入 fallback spawn 是為了應對 DSH 瀏覽器模式，但 DSH Desktop
    //   模式下 ctxShell 始終可用；fallback spawn 讓 host bundle 持有大量短生命週期子程序，
    //   在 DSH Desktop 關閉時與主程序 pipe 關聯，間接觸發 EPIPE/auto-quit。撤掉以根除。
    if (ctxShell && typeof ctxShell.resolve === "function" && typeof ctxShell.run === "function") {
      try {
        const spec = ctxShell.resolve({
          command: process.execPath,
          args: [join(PLUGIN_DIR, "build.js")],
          cwd: PLUGIN_DIR,
        });
        const result = await ctxShell.run(spec);
        if (ctxLog) {
          if (result && result.exitCode === 0) ctxLog("info", "[dsh-project-brain] auto-rebuild OK via shell: " + String(result.stdout || "").slice(0, 200));
          else ctxLog("warn", "[dsh-project-brain] auto-rebuild failed via shell code=" + (result && result.exitCode) + ": " + String((result && (result.stderr || result.stdout)) || "").slice(0, 200));
        }
      } catch (e) {
        if (ctxLog) ctxLog("warn", "[dsh-project-brain] shell.run failed: " + String((e && e.message) || e));
      }
    } else {
      // ctxShell 不可用 → 放棄自動 rebuild，讓 v0.3.18 的工具層同步 rebuild 兜底
      if (ctxLog) ctxLog("warn", "[dsh-project-brain] ctxShell unavailable, skip auto-rebuild (tools.js has sync rebuild fallback)");
    }
    if (pending) {
      pending = false;
      setTimeout(() => runBuild(), 100);
    }
  } finally {
    rebuilding = false;
  }
}

let ctxLog = null;
let ctxShell = null;
let rebuiltCb = null;
// v0.3.14：上次 mtime 快照（path -> mtimeMs）；輪詢對比觸發 rebuild
let lastMtimeSnapshot = new Map();
// v0.3.14：上次掃描到的 watch 路徑集合（來自 sessions / workspaceRegistry 探測）
let watchedPaths = [];
// v0.3.14：ctx.timer interval 的 disposer
let timerDisposer = null;

// v0.3.14：拿 fs adapter（DSH fs service，不走 node:fs；sandbox 友好）
function getFs(ctx) {
  try {
    if (ctx && typeof ctx.get === "function") {
      const f = ctx.get("fs");
      if (f && typeof f.stat === "function") return f;
    }
  } catch (e) {}
  return null;
}

// v0.3.14：探測使用者當前 workspace 的路徑（不依賴 sessionCwd；用 sandboxPolicy.workspaceRoot + agents/sessions）
//   單 workspace MVP：取 sandboxPolicy.workspaceRoot（v0.3.8 已過濾 DSH Desktop 安裝路徑）
//   多 workspace MVP：擴充套件時再考慮 workspaceRegistry.list()，但當前大多數場景單 workspace 足夠
function resolveWatchPaths(ctx, sandboxPolicy) {
  const out = new Set();
  // 1) sandboxPolicy.workspaceRoot（v0.3.8 已 safeCwd 過濾 DSH Desktop）
  try {
    if (sandboxPolicy && typeof sandboxPolicy.workspaceRoot === "string" && sandboxPolicy.workspaceRoot.trim()) {
      out.add(sandboxPolicy.workspaceRoot);
    }
  } catch (e) {}
  // 2) workspaceRegistry.list()（DSH 註冊的所有 workspace）
  try {
    const wr = ctx && typeof ctx.get === "function" ? ctx.get("workspaceRegistry") : null;
    if (wr && typeof wr.list === "function") {
      const list = wr.list() || [];
      for (const w of list) {
        if (w && typeof w.path === "string" && w.path.trim()) out.add(w.path);
      }
    }
  } catch (e) {}
  // 3) sessions.list()：拿所有 session 的 cwd（DSH 已知活躍 session）
  try {
    const sessions = ctx && typeof ctx.get === "function" ? ctx.get("sessions") : null;
    if (sessions && typeof sessions.list === "function") {
      const list = sessions.list() || [];
      for (const s of list) {
        const cwd = s && (s.cwd || (s.meta && s.meta.cwd));
        if (typeof cwd === "string" && cwd.trim()) out.add(cwd);
      }
    }
  } catch (e) {}
  // 4) agents.currentInitiator()（當前發起 agent 的 session cwd）
  try {
    const agents = ctx && typeof ctx.get === "function" ? ctx.get("agents") : null;
    if (agents && typeof agents.currentInitiator === "function") {
      const a = agents.currentInitiator();
      if (a && a.session) {
        const cwd = a.session.cwd || (a.session.meta && a.session.meta.cwd);
        if (typeof cwd === "string" && cwd.trim()) out.add(cwd);
      }
    }
  } catch (e) {}
  // 過濾 DSH Desktop 安裝路徑
  return Array.from(out).filter((p) => {
    if (!p) return false;
    if (/[\\/]Programs[\\/]DSH Desktop$/i.test(p)) return false;
    if (/[\\/]DSH Desktop\.app/.test(p)) return false;
    return true;
  });
}

// v0.3.14：用 DSH fs.stat 讀一個檔案的 mtime（毫秒）；失敗返回 0
async function statMtimeMs(fs, path) {
  try {
    if (!fs || typeof fs.stat !== "function") return 0;
    const target = await fs.resolve(path);
    const info = await fs.stat(target);
    if (!info) return 0;
    // FsInfo 通常有 mtimeMs / mtime（Date）；相容兩種
    if (typeof info.mtimeMs === "number") return info.mtimeMs;
    if (info.mtime instanceof Date) return info.mtime.getTime();
    return 0;
  } catch (e) {
    return 0;
  }
}

// v0.3.14：掃一遍所有 watch 路徑的 .project-brain/* 檔案 mtime，任意變化就 rebuild
async function pollMtime() {
  const fs = getFs(currentCtx);
  if (!fs) return;  // fs 不可用就跳過（不阻塞 host）

  // 1) 探測當前 watch 路徑集（可能新增 workspace）
  const paths = resolveWatchPaths(currentCtx, currentSandbox);
  // 路徑集變化時也清掉 snapshot 中消失的項
  const pathKey = paths.join("|");
  const prevPathKey = watchedPaths.join("|");
  if (pathKey !== prevPathKey) {
    if (ctxLog) ctxLog("info", "[dsh-project-brain] watch paths changed: " + paths.length + " workspace(s)");
    watchedPaths = paths;
    // 新增路徑初始化 mtime snapshot（立即觸發一次 rebuild，讓新 workspace 首次出現時 sidebar 顯示）
    const newSnapshot = new Map();
    for (const ws of paths) {
      for (const f of WATCH_FILES) {
        const p = join(ws, ".project-brain", f);
        newSnapshot.set(p, await statMtimeMs(fs, p));
      }
    }
    lastMtimeSnapshot = newSnapshot;
    scheduleRebuild("paths changed");
    return;
  }

  // 2) 比對 mtime
  let changed = false;
  for (const ws of paths) {
    for (const f of WATCH_FILES) {
      const p = join(ws, ".project-brain", f);
      const cur = await statMtimeMs(fs, p);
      const prev = lastMtimeSnapshot.get(p) || 0;
      if (cur !== prev && cur > 0) {
        if (ctxLog) ctxLog("info", "[dsh-project-brain] mtime change detected: " + p + " (" + prev + " -> " + cur + ")");
        lastMtimeSnapshot.set(p, cur);
        changed = true;
      } else if (cur > 0 && prev === 0) {
        // 新出現的檔案（之前 mtime=0，現在有 mtime）
        lastMtimeSnapshot.set(p, cur);
        changed = true;
      }
    }
  }
  if (changed) scheduleRebuild("mtime change");
}

// v0.3.14：排程 rebuild（帶 debounce；防止連續 poll 多次觸發）
let scheduleTimer = null;
function scheduleRebuild(reason) {
  if (scheduleTimer) return;  // 已經排程過，等下次 debounce 觸發
  if (ctxLog) ctxLog("info", "[dsh-project-brain] rebuild scheduled (" + reason + ")");
  scheduleTimer = setTimeout(() => {
    scheduleTimer = null;
    runBuild().then(() => { if (rebuiltCb) rebuiltCb(); });
  }, 100);
}

let currentCtx = null;
let currentSandbox = null;

// v0.3.17：徹底脫離 Cordis 抽象（v0.3.14-v0.3.16 連續三次失敗）
//   改用 child_process.spawn 啟動獨立 watcher 子程序跑 rebuild-watcher.mjs
//   完全脫離 ctx.timer / ctx.effect / ctx.on / ctx.logger（所有 silent failure 都被吃）
//   （spawn 已從頂部 import）

let watcherProc = null;  // 當前 spawn 的 watcher 子程序
let watcherDisposer = null;

function tryStartWatcherSubprocess(workspacePaths) {
  if (watcherProc && !watcherProc.killed) {
    return watcherProc;
  }
  // The packaged watcher is emitted beside this module; the source watcher
  // is also beside the source module.
  const scriptPath = existsSync(join(__dirname, "rebuild-watcher.mjs"))
    ? join(__dirname, "rebuild-watcher.mjs")
    : join(__dirname, "host", "rebuild-watcher.mjs");
  if (!existsSync(scriptPath)) {
    if (ctxLog) ctxLog("warn", "[dsh-project-brain] rebuild-watcher.mjs not found: " + scriptPath);
    return null;
  }
  // 準備 argv：node <script> --workspace=<p1> --workspace=<p2> ...
  const args = [scriptPath];
  for (const p of workspacePaths) {
    if (typeof p === "string" && p.trim()) args.push("--workspace=" + p);
  }
  // 優先用 DSH shell service 跑（sandbox 友好）；fallback 用 child_process.spawn
  let proc = null;
  if (ctxShell && typeof ctxShell.start === "function") {
    // shell.start 非同步返回 ShellProcess，不適合作為 watcher 常駐
    // fallback 到 spawn
  }
  try {
    proc = spawn(process.execPath, args, {
      cwd: PLUGIN_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: false,
    });
    if (ctxLog) ctxLog("info", "[dsh-project-brain] watcher subprocess spawned: pid=" + (proc.pid || "?") + " script=" + scriptPath);
    proc.stdout && proc.stdout.on("data", (d) => {
      try { process.stdout.write("[watcher.stdout] " + d.toString()); } catch (e) {}
    });
    proc.stderr && proc.stderr.on("data", (d) => {
      try { process.stderr.write("[watcher.stderr] " + d.toString()); } catch (e) {}
    });
    proc.on("exit", (code, signal) => {
      if (ctxLog) ctxLog("warn", "[dsh-project-brain] watcher subprocess exited code=" + code + " signal=" + signal);
      watcherProc = null;
    });
    proc.on("error", (err) => {
      if (ctxLog) ctxLog("warn", "[dsh-project-brain] watcher subprocess spawn error: " + String((err && err.message) || err));
      watcherProc = null;
    });
    watcherProc = proc;
    return proc;
  } catch (e) {
    if (ctxLog) ctxLog("warn", "[dsh-project-brain] spawn watcher subprocess failed: " + String((e && e.message) || e));
    return null;
  }
}

function stopWatcherSubprocess() {
  if (watcherProc && !watcherProc.killed) {
    try {
      watcherProc.kill("SIGTERM");
      if (ctxLog) ctxLog("info", "[dsh-project-brain] watcher subprocess SIGTERM sent");
    } catch (e) {}
    watcherProc = null;
  }
}

export function setupAutoRebuild(ctx, fs, sandboxPolicy) {
  if (!ctx) return;
  currentCtx = ctx;
  currentSandbox = sandboxPolicy;
  // v0.3.6：探測 shell service（DSH 提供，sandbox 友好）
  try { ctxShell = ctx.get ? ctx.get("shell") : ctx.shell; } catch (e) { ctxShell = null; }
  ctxLog = (level, msg) => {
    try { if (ctx.logger && typeof ctx.logger[level] === "function") ctx.logger[level]("[dsh-project-brain] " + msg); } catch (e) {}
  };
  rebuiltCb = async () => {
    // 計算 client bundle 的 hash（dsh-project-brain/lib/client.js），用於 clientModules.rebuilt
    try {
      const clientPath = join(PLUGIN_DIR, "dsh-project-brain", "lib", "client.js");
      if (existsSync(clientPath) && ctx.clientModules && typeof ctx.clientModules.rebuilt === "function") {
        const buf = readFileSync(clientPath);
        const hash = createHash("sha256").update(buf).digest("hex").slice(0, 12);
        const newRev = hash;
        const got = ctxModulesRebuilt(ctx, "dsh-project-brain", newRev);
        if (ctxLog) ctxLog("info", "[dsh-project-brain] clientModules.rebuilt('dsh-project-brain', " + newRev + ") => " + (got || "(none)"));
      }
    } catch (e) {
      if (ctxLog) ctxLog("warn", "[dsh-project-brain] clientModules.rebuilt failed: " + String((e && e.message) || e));
    }
  };

  // ───── v0.5.1 緊急修復：撤回 spawn watcher 子程序（v0.3.17）─────
  //   v0.3.17 的 spawn 獨立 watcher 子程序（src/host/rebuild-watcher.mjs）是導致
  //   DSH Desktop "自動退出"的根因：
  //   1) DSH Desktop 關閉時主程序 stdout pipe 關閉
  //   2) watcher 子程序的 stdout pipe 跟主程序關聯（stdio: ["ignore", "pipe", "pipe"]）
  //   3) 子程序持續往自己的 stdout 寫日誌 → 觸發主程序的 stdout EPIPE → IPC 鏈異常
  //   4) 主程序 Electron 檢測到 spawn child pipe 異常 → 主動退出整個 DSH
  //
  //   修復：完全刪除 spawn watcher 子程序。所有 rebuild 觸發改為：
  //   - v0.3.18 已有的"工具層同步 rebuild"（tools.js / tools/*.js 寫完 jsonl 後立即
  //     sync execFileSync('node', ['build.js'])）—— 已知在 DSH sandbox 下能跑
  //   - 手動 `node build.js` —— 使用者主動 build，1 秒完成，client bundle 自動熱過載
  //
  //   接受"DSH Desktop 不再主動 spawn 任何後臺程序"作為 v0.5.1 長期架構約束。
  if (ctxLog) ctxLog("info", "[dsh-project-brain] v0.5.1: host bundle does NOT spawn watcher subprocess (was causing DSH auto-quit)");

  // ───── 兜底：v0.3.4 舊路徑 ctx.on("preview.changed") ─────
  //   自定義事件名跨 fiber 可能不通，但保留以防 DSH 未來支援
  if (ctx.on) {
    try {
      ctx.on("project_brain/preview.changed", () => {
        if (ctxLog) ctxLog("info", "[dsh-project-brain] preview.changed received (fallback), scheduling rebuild");
        runBuild().then(() => { if (rebuiltCb) rebuiltCb(); });
      });
    } catch (e) {}
  }
}

// v0.3.14：ctx.clientModules.rebuilt 可能在不同 fiber（更穩的探測）
function ctxModulesRebuilt(ctx, id, rev) {
  try {
    if (ctx.clientModules && typeof ctx.clientModules.rebuilt === "function") {
      return ctx.clientModules.rebuilt(id, rev);
    }
  } catch (e) {}
  return null;
}
