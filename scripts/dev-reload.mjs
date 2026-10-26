// scripts/dev-reload.mjs — 本地開發一鍵 reload
//
// 用途：改完 src/ 後跑一次，自動 build lib/ + 檢查 DSH Desktop 程序 + 提示下一步。
// 不會自動重啟 DSH Desktop（破壞使用者會話，只提示使用者手動重啟）。
//
// 用法：
//   node scripts/dev-reload.mjs
//   或：npm run dev:reload

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");

console.log("[dev-reload] start\n");

// 1) npm run build
console.log("[dev-reload] step 1/3: building lib/ ...");
try {
  execFileSync(process.execPath, [join(PKG_ROOT, "build.js")], {
    cwd: PKG_ROOT,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development" },
  });
} catch (e) {
  console.error("[dev-reload] build FAILED:", e.message);
  process.exit(1);
}

// 2) 確認 bundle 產物存在
const hostBundle = join(PKG_ROOT, "dsh-project-brain", "lib", "index.js");
const clientBundle = join(PKG_ROOT, "dsh-project-brain", "lib", "client.js");
console.log("\n[dev-reload] step 2/3: verifying bundles ...");
if (!existsSync(hostBundle) || !existsSync(clientBundle)) {
  console.error(`[dev-reload] FAIL: missing bundle(s):
  ${existsSync(hostBundle) ? "✓" : "✗"} ${hostBundle}
  ${existsSync(clientBundle) ? "✓" : "✗"} ${clientBundle}`);
  process.exit(1);
}
const hostSize = (statSync(hostBundle).size / 1024).toFixed(1);
const clientSize = (statSync(clientBundle).size / 1024).toFixed(1);
console.log(`[dev-reload]   ✓ lib/index.js  ${hostSize}KB`);
console.log(`[dev-reload]   ✓ lib/client.js ${clientSize}KB`);

// 3) 檢查 DSH Desktop 程序（僅檢測，不重啟）
console.log("\n[dev-reload] step 3/3: checking DSH Desktop processes ...");
let dshRunning = false;
try {
  const ps = execFileSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    "Get-Process -Name 'DSH Desktop' -ErrorAction SilentlyContinue | Select-Object Id, StartTime | ConvertTo-Json -Compress",
  ], { encoding: "utf8" }).trim();
  if (ps && ps !== "null") {
    const procs = JSON.parse(ps);
    const list = Array.isArray(procs) ? procs : [procs];
    dshRunning = true;
    console.log(`[dev-reload]   ✓ DSH Desktop running (${list.length} process(es)):`);
    for (const p of list) console.log(`[dev-reload]     - PID ${p.Id}  started ${p.StartTime}`);
  }
} catch (e) {
  // ignore
}

if (!dshRunning) {
  console.log("[dev-reload]   ℹ DSH Desktop NOT running. 啟動方式：");
  console.log("[dev-reload]     - 雙擊桌面 DSH Desktop 圖示");
  console.log("[dev-reload]     - 或：C:\\Users\\liuzp16\\AppData\\Local\\Programs\\DSH Desktop\\DSH Desktop.exe");
}

console.log("\n[dev-reload] done.\n");
console.log("─────────────────────────────────────────────────────────────");
console.log("下一步操作：");
if (dshRunning) {
  console.log("  ⮕ 完全退出 DSH Desktop（右鍵托盤 → Quit，不要只關視窗）");
  console.log("  ⮕ 重新啟動 DSH Desktop（cordis-loader 會重新載入 host bundle）");
} else {
  console.log("  ⮕ 啟動 DSH Desktop");
}
console.log("  ⮕ 開啟任意 workspace → 頂部「專案」Tab → 「啟動專案大腦」");
console.log("  ⮕ 驗證 4 個 Dashboard Tab（概覽 / 架構 / 任務動態 / 專案記憶）");
console.log("  ⮕ 如果失敗，DSH Desktop 終端視窗會輸出 [dsh-project-brain] 日誌");
console.log("─────────────────────────────────────────────────────────────");
