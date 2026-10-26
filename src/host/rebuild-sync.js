// rebuild-sync.js - v0.3.18 工具層同步 rebuild
//
// 目的：放棄 host bundle "被動監聽" 模式（v0.3.4-v0.3.17 連續 5 次失敗），
//      改為工具層 "主動觸發" — 工具寫完 jsonl 後立即同步 execFileSync('node', ['build.js'])。
//
// 已知能跑：v0.3.6 已驗證 child_process.execFileSync 在 DSH host bundle 裡能跑（summarizer 走 shell service 跑 git diff 同源機制）。
//
// 不依賴：
// - dsh-tools（讓多個工具檔案都能 import）
// - ctx.timer / ctx.effect / ctx.on（避免再次 silent failure）
// - 子程序 / spawn（不再依賴 host fiber 行為）
//
// 失敗處理：所有 catch 都吞（不能因為 rebuild 失敗影響工具本身的返回值）。

import { execFileSync } from "node:child_process";
import { existsSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_DIR = join(__dirname, "..", "..");  // src/host/..→src/..→plugins/
const BUILD_SCRIPT = join(PLUGIN_DIR, "build.js");
const SKIP_FILE = join(PLUGIN_DIR, ".project-brain", ".dsh-project-brain-skip-sync");
const LOG_FILE = join(PLUGIN_DIR, ".project-brain", ".dsh-project-brain-sync.log");

// v0.3.18：寫檔案 log（繞過 DSH Desktop 黑盒除錯）
function log(level, msg) {
  try {
    appendFileSync(LOG_FILE, "[" + new Date().toISOString() + "] [" + level + "] " + msg + "\n", "utf8");
  } catch (e) {
    try { process.stderr.write("[dsh-project-brain:sync] " + msg + "\n"); } catch (e2) {}
  }
}

// v0.3.18：備用 log 路徑 — 如果 PLUGIN_DIR/.project-brain/ 寫不了，寫到 process.cwd()/.project-brain/ 或使用者 HOME
const FALLBACK_LOG_PATHS = [
  LOG_FILE,
  join(process.cwd(), ".dsh-project-brain-sync.log"),
  join(process.env.USERPROFILE || process.env.HOME || ".", ".dsh-project-brain-sync.log"),
];
function logFallback(level, msg) {
  // 多路徑嘗試，找到第一個能寫的
  for (const p of FALLBACK_LOG_PATHS) {
    try {
      appendFileSync(p, "[" + new Date().toISOString() + "] [" + level + "] " + msg + "\n", "utf8");
      return p;
    } catch (e) {}
  }
  return null;
}

// 是否啟用（預設啟用；可通過 .dsh-project-brain-skip-sync 檔案臨時關閉）
function isEnabled() {
  try {
    return !existsSync(SKIP_FILE);
  } catch (e) {
    return true;
  }
}

// 同步 rebuild（吞所有錯誤）
// reason: 簡短描述寫入 stderr（DSH Desktop 可能不可見，但 stdout 至少能透傳）
let rebuildCount = 0;
let lastError = null;

export function runSyncRebuild(reason) {
  // 多路徑 log 寫入（繞開 sandbox 攔截）
  const fallbackLogWrittenTo = logFallback("info", "runSyncRebuild called: reason=" + reason + " enabled=" + isEnabled() + " PLUGIN_DIR=" + PLUGIN_DIR + " BUILD_SCRIPT=" + BUILD_SCRIPT + " process.cwd=" + process.cwd());
  log("info", "fallback log written to: " + fallbackLogWrittenTo);
  if (!isEnabled()) return;
  rebuildCount += 1;
  const t0 = Date.now();
  try {
    const stdout = execFileSync(process.execPath, [BUILD_SCRIPT], {
      cwd: PLUGIN_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
      windowsHide: true,
    });
    const elapsed = Date.now() - t0;
    const out = String(stdout || "").slice(0, 200).replace(/\n/g, " ");
    log("info", "rebuild #" + rebuildCount + " (" + reason + ") OK in " + elapsed + "ms | " + out);
    logFallback("info", "rebuild #" + rebuildCount + " (" + reason + ") OK in " + elapsed + "ms | " + out);
    try { process.stderr.write("[dsh-project-brain] sync rebuild #" + rebuildCount + " (" + reason + ") OK in " + elapsed + "ms\n"); } catch (e) {}
  } catch (e) {
    const elapsed = Date.now() - t0;
    const errMsg = String((e && e.message) || e).slice(0, 500);
    lastError = errMsg;
    log("error", "rebuild #" + rebuildCount + " (" + reason + ") FAILED in " + elapsed + "ms: " + errMsg);
    logFallback("error", "rebuild #" + rebuildCount + " (" + reason + ") FAILED in " + elapsed + "ms: " + errMsg + " | stderr=" + String((e && e.stderr) || "").slice(0, 300) + " | stdout=" + String((e && e.stdout) || "").slice(0, 300));
    try { process.stderr.write("[dsh-project-brain] sync rebuild #" + rebuildCount + " (" + reason + ") FAILED: " + errMsg + "\n"); } catch (e2) {}
  }
}

// 診斷介面（讓 agent / 使用者能查詢 rebuild 狀態）
export function getSyncRebuildStats() {
  return { rebuildCount, lastError };
}