// path-resolver.js - 解析"當前專案"路徑
// 解決跨專案汙染：工具預設 sandboxPolicy.workspaceRoot 在靜態外掛下是固定的
//（profile / 外掛所在 workspace），不是使用者當前 session 的 workspace。
// 因此所有讀寫 .project-brain/ 的工具都需要從 session cwd 反推當前專案路徑。
//
// 優先順序：
//   1) exec.session.cwd / exec.session.meta.cwd / exec.session.header.cwd
//      （執行時 session 的當前工作目錄 — 多數情況下 = 使用者實際在哪個 DSH workspace）
//   2) args.path（僅在沒有 live session 時使用，相容 CLI / 舊 DSH）
//   3) sandboxPolicy.workspaceRoot（fallback，向後相容）
//   4) "."（兜底，避免拋錯）
//
// 全部容錯：任一步失敗立刻降級到下一步，不拋錯。
//
// exec 的形狀（DSH defineTool）：execute(args, exec)
//   - exec.ctx 是 Cordis context（已用 exec.ctx.emit）
//   - exec.session 在 DSH 中是 Session 物件（含 meta.cwd）
//   - exec.sessionId 是 SessionId（可用於 ctx.get('sessions').get(id) 反查）

export function readCwdFromSession(session) {
  if (!session) return null;
  try {
    const cwd = session.cwd;
    if (typeof cwd === "string" && cwd.trim()) return cwd;
    if (session.meta && typeof session.meta.cwd === "string" && session.meta.cwd.trim()) return session.meta.cwd;
    if (session.header && typeof session.header.cwd === "string" && session.header.cwd.trim()) return session.header.cwd;
    if (session.header && session.header.meta && typeof session.header.meta.cwd === "string" && session.header.meta.cwd.trim()) return session.header.meta.cwd;
  } catch (e) {}
  return null;
}

// 通過 ctx.get('sessions') 反查 sessionId 的 cwd（fallback 路徑）
function readCwdFromSessionsService(ctx, sessionId) {
  if (!ctx || !sessionId) return null;
  let sessions;
  try { sessions = ctx.get ? ctx.get("sessions") : ctx.sessions; } catch (e) { return null; }
  if (!sessions || typeof sessions.get !== "function") return null;
  try {
    const session = sessions.get(sessionId);
    return readCwdFromSession(session);
  } catch (e) {
    return null;
  }
}

// 通過 agents.currentInitiator() 拿當前 session 的 cwd（更可靠，因為是發起者）
function readCwdFromInitiator(ctx) {
  if (!ctx) return null;
  let agents;
  try { agents = ctx.get ? ctx.get("agents") : ctx.agents; } catch (e) { return null; }
  if (!agents || typeof agents.currentInitiator !== "function") return null;
  let agent;
  try { agent = agents.currentInitiator(); } catch (e) { return null; }
  if (!agent) return null;
  // Agent 通常有 session / sessionId 欄位
  try {
    if (agent.session) {
      const c = readCwdFromSession(agent.session);
      if (c) return c;
    }
    if (agent.sessionId && agents.requireInitiator) {
      // 通過 sessionId 直接取 session 也不可靠（無 get）— 略
    }
    if (agent.header && agent.header.meta) {
      const c = agent.header.meta.cwd;
      if (typeof c === "string" && c.trim()) return c;
    }
    if (agent.meta && typeof agent.meta.cwd === "string" && agent.meta.cwd.trim()) {
      return agent.meta.cwd;
    }
  } catch (e) {}
  return null;
}

// v0.3.8：從 workspaceRegistry 拿當前 session 所屬 workspace 的 path
//   fallback 時如果 sandboxPolicy.workspaceRoot 是 DSH Desktop 安裝目錄，
//   遍歷 workspaceRegistry 拿所有 workspaces，選"非 DSH Desktop"的第一個
function readCwdFromWorkspaceRegistry(ctx) {
  if (!ctx) return null;
  let wr;
  try { wr = ctx.get ? ctx.get("workspaceRegistry") : ctx.workspaceRegistry; } catch (e) { return null; }
  if (!wr) return null;
  // 試 sessions 找當前 session id，再反查
  try {
    const sessions = ctx.get ? ctx.get("sessions") : ctx.sessions;
    if (sessions && sessions.list) {
      const list = sessions.list() || [];
      // 拿最近的 session 的 cwd，再找對應 workspace
      for (const session of list) {
        const cwd = readCwdFromSession(session);
        if (cwd) return cwd;
      }
    }
  } catch (e) {}
  return null;
}

// v0.3.8：探測 DSH Desktop 安裝路徑（典型：<user-home>/AppData/Local/Programs/DSH Desktop）
//   凡是命中這個模式的 sandboxPolicy.workspaceRoot 都不可信，應跳過
function isDshDesktopInstall(p) {
  if (!p || typeof p !== "string") return false;
  // Windows 路徑："...AppData\Local\Programs\DSH Desktop" 或 "...Programs/DSH Desktop"
  if (/[\\/]Programs[\\/]DSH Desktop$/i.test(p)) return true;
  // Mac: "/Applications/DSH Desktop.app/..."
  if (/[\\/]DSH Desktop\.app/.test(p)) return true;
  return false;
}

// v0.3.9：過濾 DSH Desktop 安裝路徑（所有步驟都查一遍）
function safeCwd(cwd) {
  if (typeof cwd !== "string" || !cwd.trim()) return null;
  const value = cwd.trim();
  if (value.includes("\u0000") || value === "/" || /^[A-Za-z]:[\\/]?$/.test(value)) return null;
  if (isDshDesktopInstall(value)) return null;
  return value;
}

export function resolveProjectPath(args, exec, sandboxPolicy) {
  // 1) 從 exec 推斷 live session cwd。釋出版預設只操作當前會話專案，
  //    不能讓模型通過 args.path 把讀寫重定向到另一個工作區。
  try {
    // 1a) exec.agent.session —— dsh-tools ToolRunContext 的文件欄位
    //     （"the agent on whose behalf the call runs"）。這是工具執行上下文裡
    //     唯一可靠的 session 入口：ToolRunContext 只暴露 { callId, token, args,
    //      agent?, parent?, signal, ... }，沒有 exec.session / exec.ctx / exec.sessionId。
    const agentSession = exec && exec.agent && exec.agent.session;
    const agentCwd = safeCwd(readCwdFromSession(agentSession));
    if (agentCwd) return agentCwd;
    // 1b) exec.session 直接有 cwd（舊宿主 / 相容把 Session 掛 exec 上）
    const direct = safeCwd(readCwdFromSession(exec && exec.session));
    if (direct) return direct;
    // 1c) exec.ctx 上掛的 session
    const ctxSession = exec && exec.ctx && (exec.ctx.session || (exec.ctx.agent && exec.ctx.agent.session));
    const ctxCwd = safeCwd(readCwdFromSession(ctxSession));
    if (ctxCwd) return ctxCwd;
    // 1d) sessionId + sessions service
    const sid = exec && (exec.sessionId || (exec.session && exec.session.id) || (exec.agent && exec.agent.id));
    const ctx = exec && (exec.ctx || null);
    const svcCwd = safeCwd(readCwdFromSessionsService(ctx, sid));
    if (svcCwd) return svcCwd;
    // 1e) 通過 agents.currentInitiator() 拿當前 session
    const initiatorCwd = safeCwd(readCwdFromInitiator(ctx));
    if (initiatorCwd) return initiatorCwd;
  } catch (e) {}

  // 2) 無 live session 時才接受顯式 path（CLI / 測試 / 舊宿主相容）。
  try {
    const explicit = args && typeof args.path === "string" && args.path.trim();
    if (explicit) {
      const safe = safeCwd(explicit.trim());
      return safe || ".";
    }
  } catch (e) {}

  // 不再遍歷 workspaceRegistry 並選擇“第一個/最近一個” workspace。
  // 多專案環境中該猜測會造成最危險的靜默串寫；寧可返回明確錯誤。

  // 3) sandboxPolicy.workspaceRoot fallback（跳過 DSH Desktop 安裝目錄汙染）
  try {
    if (sandboxPolicy && typeof sandboxPolicy.workspaceRoot === "string" && sandboxPolicy.workspaceRoot.trim()) {
      const root = sandboxPolicy.workspaceRoot;
      const safe = safeCwd(root);
      if (safe) return safe;
      // DSH Desktop 安裝路徑不可信：返回 "."
    }
  } catch (e) {}

  // 4) 兜底
  //    v0.3.10：如果所有 fallback 都失敗（或都是 DSH Desktop 汙染），返回 "."（相容舊行為）
  //    工具層可檢測 . 路徑 + 提示使用者傳 path（但預設行為：寫到 process.cwd()/.project-brain/）
  console.warn("[dsh-project-brain:path-resolver] All fallback cwd candidates were DSH Desktop installs (or missing). User should pass args.path explicitly.");
  return ".";
}

// v0.3.10：tool 輔助函式：檢測 path-resolver 的返回結果並打包友好錯誤
export function resolveProjectOrFail(args, exec, sandboxPolicy) {
  const path = resolveProjectPath(args, exec, sandboxPolicy);
  if (path === ".") {
    // 兜底路徑：所有 fallback 都被 DSH Desktop 過濾 → 工具將寫到 process.cwd() 下的 .project-brain/
    return {
      __noPath: true,
      __fallbackPath: ".",
      error: {
        code: "E_NO_PATH_RESOLVED",
        message: "無法解析專案路徑（所有 fallback 都被 DSH Desktop 安裝路徑過濾或缺失）。當前會寫到 process.cwd()/.project-brain/，請顯式傳 path 引數。",
      },
    };
  }
  return { __noPath: false, path };
}
