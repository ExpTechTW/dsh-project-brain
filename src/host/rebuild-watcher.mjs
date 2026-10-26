// rebuild-watcher.mjs - v0.3.17 獨立 watcher 子程序
//
// 目的：脫離 Cordis 抽象，用純 Node.js fs.watch + setInterval 監聽 .project-brain/ 變化，
//      觸發 build.js 重 build lib/client.js + lib/index.js。
//
// 由 src/host/rebuild.js 通過 child_process.spawn 啟動。
// 寫 log 到 .project-brain/.dsh-project-brain-watcher.log（繞過 ctx.logger，DSH Desktop 可觀測）。
//
// 設計要點：
// 1. node:fs.watch + 2 秒兜底輪詢（Windows 上 fs.watch 對追加寫入不可靠，對覆蓋寫入可靠；dream.js 用 writeJsonl 是覆蓋寫入）
// 2. 啟動時掃所有已知 workspace（~/.dsh/storages/workspace.json）的 .project-brain/，
//    之後 fs.watch 自動檢測新 workspace 建立的 .project-brain/ 目錄
// 3. build 用 child_process.execFileSync 同步跑（避免 watcher 子程序被 build 搶佔）
// 4. 防 rebuild 風暴：1 秒 debounce
// 5. SIGINT/SIGTERM 優雅退出

import { watch, statSync, existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Source layout: <plugin>/src/host; packaged layout:
// <plugin>/dsh-project-brain/lib/host. In both cases build.js belongs to the
// outer plugin root.
const CANDIDATE_PLUGIN_DIR = join(__dirname, "..", "..");
const PLUGIN_DIR = existsSync(join(CANDIDATE_PLUGIN_DIR, "build.js"))
  ? CANDIDATE_PLUGIN_DIR
  : join(CANDIDATE_PLUGIN_DIR, "..");

const WATCH_FILES = ["project.json", "architecture.json", "memory.jsonl", "todo.jsonl", "timeline.jsonl"];
const POLL_INTERVAL_MS = 2000;
const REBUILD_DEBOUNCE_MS = 1000;
const LOG_FILE = join(PLUGIN_DIR, ".project-brain", ".dsh-project-brain-watcher.log");

// argv 解析：rebuild.js spawn watcher 時會傳 --workspace=<path1> --workspace=<path2> ...
//   避免子程序依賴 USERPROFILE / workspace.json 解析（DSH 子程序環境變數可能為空）
function parseWorkspacesFromArgv() {
  const out = [];
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--workspace=")) {
      const p = a.slice("--workspace=".length).trim();
      if (p) out.push(p);
    }
  }
  return out;
}

// ─── 日誌 ───
function log(level, msg) {
  const ts = new Date().toISOString();
  const line = "[" + ts + "] [" + level + "] " + msg + "\n";
  try {
    // 同步追加寫 log 檔案（不依賴 cordis logger）
    const dir = dirname(LOG_FILE);
    if (!existsSync(dir)) {
      try { mkdirSync(dir, { recursive: true }); } catch (e) {}
    }
    appendFileSync(LOG_FILE, line, "utf8");
  } catch (e) {
    try { process.stderr.write("[watcher-fallback] " + line); } catch (e2) {}
  }
  // 也輸出到 stderr，DSH Desktop 除錯時方便看
  try { (level === "error" ? process.stderr : process.stdout).write(line); } catch (e) {}
}

// ─── 解析 workspace 路徑（掃 ~/.dsh/storages/workspace.json）───
function readDSHWorkspaces() {
  // Windows: %USERPROFILE%\.dsh\storages\workspace.json
  // Mac/Linux: ~/.dsh/storages/workspace.json
  const home = process.env.USERPROFILE || process.env.HOME || homedir();
  const wsFile = join(home, ".dsh", "storages", "workspace.json");
  if (!existsSync(wsFile)) {
    log("warn", "workspace.json not found at " + wsFile + " — watch will only listen to plugin's own .project-brain/");
    return [];
  }
  try {
    const text = readFileSync(wsFile, "utf8");
    const json = JSON.parse(text);
    const list = Array.isArray(json) ? json : (Array.isArray(json.workspaces) ? json.workspaces : []);
    const paths = [];
    for (const w of list) {
      const p = w && (w.path || (w.rootPath));
      if (typeof p === "string" && p.trim()) {
        // 過濾 DSH Desktop 安裝路徑
        if (/[\\/]Programs[\\/]DSH Desktop$/i.test(p)) continue;
        if (/[\\/]DSH Desktop\.app/.test(p)) continue;
        paths.push(p);
      }
    }
    return paths;
  } catch (e) {
    log("error", "parse workspace.json failed: " + String((e && e.message) || e));
    return [];
  }
}

// ─── 監測 .project-brain/ 變化 ───
const watchedDirs = new Set();      // 已註冊的 fs.watch handle
let lastMtimeSnapshot = new Map();  // path -> mtimeMs
let rebuildTimer = null;           // debounce timer
let rebuildCount = 0;              // 累計 rebuild 次數
let startTime = Date.now();

function statMtimeMs(p) {
  try {
    if (!existsSync(p)) return 0;
    const s = statSync(p);
    return s.mtimeMs || (s.mtime && s.mtime.getTime()) || 0;
  } catch (e) { return 0; }
}

function snapshotAll() {
  const snap = new Map();
  for (const dir of watchedDirs) {
    for (const f of WATCH_FILES) {
      const p = join(dir, f);
      snap.set(p, statMtimeMs(p));
    }
  }
  return snap;
}

function triggerRebuild(reason, path) {
  if (rebuildTimer) return;
  log("info", "rebuild scheduled (" + reason + (path ? ": " + path : "") + ")");
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    runBuild();
  }, REBUILD_DEBOUNCE_MS);
}

function runBuild() {
  const t0 = Date.now();
  rebuildCount += 1;
  log("info", "rebuild #" + rebuildCount + " starting...");
  try {
    const out = execFileSync(process.execPath, [join(PLUGIN_DIR, "build.js")], {
      cwd: PLUGIN_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
      windowsHide: true,
    });
    const stdout = String(out || "").slice(0, 300);
    log("info", "rebuild #" + rebuildCount + " OK in " + (Date.now() - t0) + "ms | " + stdout.replace(/\n/g, " "));
  } catch (e) {
    log("error", "rebuild #" + rebuildCount + " FAILED in " + (Date.now() - t0) + "ms: " + String((e && e.message) || e) + " | stderr=" + String((e && e.stderr) || "").slice(0, 300));
  }
}

// fs.watch 回撥（事件驅動）
function watchDir(dir) {
  if (watchedDirs.has(dir)) return;
  watchedDirs.add(dir);
  log("info", "watching dir: " + dir);

  // 初始化 snapshot
  for (const f of WATCH_FILES) {
    const p = join(dir, f);
    lastMtimeSnapshot.set(p, statMtimeMs(p));
  }

  // fs.watch 監聽整個 .project-brain/ 目錄（recursive: true 在 Windows 上有限制，這裡不用）
  try {
    const watcher = watch(dir, { persistent: true }, (eventType, filename) => {
      if (!filename) return;
      // 只關心我們關心的 4 個檔案
      if (!WATCH_FILES.includes(filename)) return;
      const p = join(dir, filename);
      const cur = statMtimeMs(p);
      const prev = lastMtimeSnapshot.get(p) || 0;
      if (cur > prev) {
        lastMtimeSnapshot.set(p, cur);
        triggerRebuild("fs.watch " + eventType, p);
      }
    });
    watcher.on("error", (err) => {
      log("error", "fs.watch error on " + dir + ": " + String((err && err.message) || err));
    });
  } catch (e) {
    log("warn", "fs.watch failed on " + dir + ": " + String((e && e.message) || e) + " (fallback to polling only)");
  }
}

function unwatchDir(dir) {
  // fs.watch 沒有官方 close API 在 event callback 裡直接拿 handle；這裡是 best-effort
  // watchedDirs Set 用於追蹤，新一輪 scanUnseenWorkspaces 會跳過已有的
  watchedDirs.delete(dir);
  log("info", "unwatched dir: " + dir);
}

// ─── 兜底：每 2 秒輪詢所有 watch 檔案的 mtime ───
let lastPollSnapshot = new Map();
function pollLoop() {
  for (const dir of watchedDirs) {
    for (const f of WATCH_FILES) {
      const p = join(dir, f);
      const cur = statMtimeMs(p);
      const prev = lastPollSnapshot.get(p) || 0;
      if (cur > 0 && cur > prev) {
        lastPollSnapshot.set(p, cur);
        triggerRebuild("poll mtime change", p);
      }
      lastPollSnapshot.set(p, cur);
    }
  }
}

// ─── 週期掃描：發現新增 workspace 自動 watch ───
function scanUnseenWorkspaces() {
  const wsPaths = readDSHWorkspaces();
  for (const p of wsPaths) {
    const brainDir = join(p, ".project-brain");
    if (existsSync(brainDir) && !watchedDirs.has(brainDir)) {
      watchDir(brainDir);
    }
  }
}

// ─── 啟動 ───
function main() {
  log("info", "=== dsh-project-brain rebuild-watcher v0.3.17 starting ===");
  log("info", "PLUGIN_DIR = " + PLUGIN_DIR);
  log("info", "process.execPath = " + process.execPath);
  log("info", "process.pid = " + process.pid);
  log("info", "process.platform = " + process.platform);
  log("info", "node version = " + process.version);
  log("info", "argv = " + JSON.stringify(process.argv.slice(2)));

  // 0. argv 優先：spawn 時顯式傳入 --workspace=<path>（最穩，避免依賴 USERPROFILE / workspace.json）
  const argvWs = parseWorkspacesFromArgv();
  if (argvWs.length > 0) {
    log("info", "workspaces from argv: " + argvWs.length + " (skip workspace.json scan)");
    for (const p of argvWs) {
      const brainDir = join(p, ".project-brain");
      if (existsSync(brainDir)) watchDir(brainDir);
      else log("warn", "argv workspace has no .project-brain/: " + p);
    }
  }

  // 1. fallback：掃描已知 workspace（DSH storages）
  if (watchedDirs.size === 0) {
    log("info", "no workspaces from argv, falling back to workspace.json scan");
    scanUnseenWorkspaces();
  }

  // 2. 啟動兜底輪詢（2 秒一次）
  setInterval(pollLoop, POLL_INTERVAL_MS);
  log("info", "fallback polling started (" + POLL_INTERVAL_MS + "ms interval)");

  // 3. 週期掃描新 workspace（30 秒一次）
  setInterval(scanUnseenWorkspaces, 30000);
  log("info", "workspace scan loop started (30s interval)");

  // 4. 立即觸發一次 rebuild（確保 watcher 啟動後第一次 sidebar 重新整理）
  log("info", "initial rebuild trigger (after 3s grace period)");
  setTimeout(() => triggerRebuild("watcher startup"), 3000);

  // 5. 優雅退出
  process.on("SIGINT", () => {
    log("info", "SIGINT received, exiting...");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    log("info", "SIGTERM received, exiting...");
    process.exit(0);
  });
  process.on("uncaughtException", (err) => {
    log("error", "uncaughtException: " + String((err && err.stack) || err));
  });
  process.on("unhandledRejection", (reason) => {
    log("error", "unhandledRejection: " + String(reason));
  });

  log("info", "watcher ready. uptime will be reported every 5 minutes.");
  setInterval(() => {
    const uptimeMin = Math.round((Date.now() - startTime) / 60000);
    log("info", "watcher alive: uptime=" + uptimeMin + "min rebuilds=" + rebuildCount + " watchedDirs=" + watchedDirs.size);
  }, 5 * 60 * 1000);
}

main();
