// Preview HTTP route - 動態按當前 workspace 讀 .project-brain/ 資料
// P0.4.5：修"切換 workspace 不更新"問題
//
// 路徑：GET /dsh-project-brain/preview.json（避開 /plugins/ 字首，避開 DSH 靜態 server fallback 搶先 404）
// 行為：
//   ① 優先用 client 傳的 ?session=<sessionId> 反查當前 workspace 的 cwd（sessions.get(sessionId).meta.cwd）
//   ② 反查失敗則 fallback 到 sandboxPolicy.workspaceRoot
//   已生成 -> 返回完整 preview 資料；未生成 -> 返回 { initialized:false }（Onboarding）
// 關鍵：讀檔案是純 IO，零 token；用 danger-full-access 模式避免 cordis fiber 啟動時的
// workspaceRoot 限制（之前 commit c14ae42 已經驗證了此 pattern 寫入可用）
//
// webServer / sessions 來自 host service（ctx.get 探測，避免 dshmarket 子 fiber 缺失拋錯）。

import { buildWorkspacePreview } from "../sidebar/aggregator.js";

function log(logger, level, msg) {
  try {
    if (logger && typeof logger[level] === "function") logger[level]("[dsh-project-brain] " + msg);
    else if (typeof console !== "undefined") console.log("[dsh-project-brain] " + msg);
  } catch (e) {}
}

// 從 sessionId 反查當前 workspace 的 cwd（若 sessions service 可用）
function sessionCwd(sessions, sessionId) {
  if (!sessions || !sessionId) return null;
  try {
    const session = sessions.get ? sessions.get(sessionId) : null;
    if (!session) return null;
    // SessionHeader 的 cwd 可能在 meta / header 欄位，容錯取
    return (session.meta && session.meta.cwd) || (session.header && session.header.cwd) || (session.cwd) || null;
  } catch (e) {
    return null;
  }
}

export function registerPreviewRoute({ ctx, fs, sandboxPolicy, logger }) {
  const disposers = [];

  let webServer;
  try { webServer = ctx.get ? ctx.get("webServer") : ctx.webServer; } catch (e) { webServer = undefined; }
  // 探測 sessions service（不強制要 writePolicy —— buildWorkspacePreview 只讀）
  let sessions;
  try { sessions = ctx.get ? ctx.get("sessions") : ctx.sessions; } catch (e) { sessions = undefined; }

  log(logger, "info", "[diagnose] webServer available: " + (!!webServer && typeof webServer.register === "function"));
  log(logger, "info", "[diagnose] sessions service available: " + (!!sessions));
  if (!webServer || typeof webServer.register !== "function") {
    log(logger, "warn", "[diagnose] webServer unavailable, preview route NOT registered");
    return disposers;
  }

  // v0.3.3：改用 prefix 路由 + 更獨特的路徑（避開 DSH frontend-static 的 SPA fallback 搶先 404）
  //   - 路徑用 /__dsh_brain__/... （下劃線名稱空間，DSH 內部約定，不易衝突）
  //   - kind: "prefix" 比 "exact" 容錯；exact 要求絕對匹配，prefix 匹配 p/* 任意子路徑
  const ROUTE_PATH = "/__dsh_brain__/preview.json";

  try {
    const route = {
      kind: "prefix",
      path: ROUTE_PATH,
      handler: async (req, res) => {
        try {
          // 優先用 client 傳的 session 反查當前 workspace；否則 fallback 到 sandboxPolicy.workspaceRoot
          let wsRoot = null;
          let sessionId = null;
          try {
            if (req && req.url) {
              const qIdx = req.url.indexOf("?");
              if (qIdx >= 0) {
                const params = new URLSearchParams(req.url.slice(qIdx + 1));
                sessionId = params.get("session");
                if (sessionId) wsRoot = sessionCwd(sessions, sessionId);
              }
            }
          } catch (e) { /* ignore */ }
          if (!wsRoot) wsRoot = (sandboxPolicy && sandboxPolicy.workspaceRoot) || ".";

          // v0.3.2 診斷：寫一個 hit-marker 檔案到 .project-brain/，方便驗證 route 是否被調到
          // （DSH Desktop 下 fetch 走 IPC 橋可能不通，這個 marker 是關鍵診斷訊號）
          try {
            const markerPath = (wsRoot || ".").replace(/[\\/]+$/, "") + "/.project-brain/.webserver-last-hit.json";
            const marker = {
              hitAt: Date.now(),
              sessionId: sessionId,
              workspaceRoot: wsRoot,
              url: req && req.url,
              method: req && req.method,
            };
            // 非同步寫、不阻塞響應（即使失敗也不影響主響應）
            const target = await fs.resolve(markerPath);
            fs.writeText(target, JSON.stringify(marker, null, 2)).catch(() => {});
          } catch (e) { /* ignore marker write */ }

          log(logger, "info", "[diagnose] preview.json request, resolved workspaceRoot=" + wsRoot);
          const data = await buildWorkspacePreview(fs, wsRoot);
          log(logger, "info", "[diagnose] preview.json ok, initialized=" + data.initialized + ", name=" + ((data.project && data.project.name) || "(none)"));
          res.statusCode = 200;
          res.setHeader("content-type", "application/json; charset=utf-8");
          // CORS for Electron WebView / browser
          res.setHeader("access-control-allow-origin", "*");
          res.setHeader("cache-control", "no-store");
          res.end(JSON.stringify(data));
        } catch (e) {
          log(logger, "error", "[diagnose] preview.json handler error: " + String((e && e.message) || e));
          try {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
          } catch (e2) { /* res already closed */ }
        }
      },
    };
    const disposer = webServer.register(route);
    disposers.push(disposer);
    log(logger, "info", "[diagnose] preview route registered: " + ROUTE_PATH);
  } catch (e) {
    log(logger, "warn", "[diagnose] preview route registration failed: " + String((e && e.message) || e));
  }

  return disposers;
}
