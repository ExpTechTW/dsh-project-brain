// SidebarPreview RPC handlers
// - project_brain/sidebar.getPreview: 按 sessionId 反查 cwd，聚合資料（5 區塊）
// - project_brain/initProject: 橋接 project_init tool（給 Onboarding 按鈕用）
// - project_brain/continueSession: 橋接 project_continue tool（給"繼續上次開發"按鈕用）
//
// harness 來自 host builtin（DSH 啟動時 cordis-loader 注入）。
// dshmarket 熱掛載的子 fiber 不注入 host builtin，所以 harness 可能 undefined。
// 這裡做降級：harness 缺失時僅 warn，不註冊 RPC，apply 不會拋錯。
// ctx 用於可選探測 sessions service（按 sessionId 反查 cwd 拿到"當前 workspace"）。

import { buildSidebarPreview, buildWorkspacePreview, invalidateAggregatorCache } from "../sidebar/aggregator.js";
import { scanAndWrite } from "../scan-and-write.js";
import { buildSuggestTool } from "../../tools/suggest.js";
import { publicMemoryConfig, normalizeMemoryConfig } from "../memory/config.js";
import { resolveSessionRoute } from "../architecture/analyzer.js";
import { probeEmbedding, probeSessionLlm } from "../settings-probe.js";
import { getGitHistory, getGitBranches, getWorkTreeChanges } from "../git/history.js";
import { unwrapToolResult } from "../transfer/tool-result.js";
import { shapeImportPreviewData, shapeRollbackPreviewData } from "../transfer/rpc-payload.js";
import { applyMemoryDelete, applyMemoryEdit, applyMemoryStatus } from "../memory/edit.js";
import { appendJsonl, brainPath, readJsonl, writeJsonl } from "../store/brain-files.js";
import { brainTxKey, withWriteLock } from "../store/write-lock.js";
import { promises as fsp } from "node:fs";
import path from "node:path";

// 把 normalizeMemoryConfig 的凍結物件轉成可 JSON 序列化的普通物件（供 RPC 傳回 Client）。
function sanitizeSettings(config) {
  const source = normalizeMemoryConfig(config);
  return {
    retrievalMode: source.retrievalMode,
    vectorEnabled: source.vectorEnabled,
    embeddingBaseURL: source.embeddingBaseURL,
    embeddingModel: source.embeddingModel,
    embeddingApiKeyEnv: source.embeddingApiKeyEnv,
    embeddingDimensions: source.embeddingDimensions == null ? 0 : source.embeddingDimensions,
    embeddingBatchSize: source.embeddingBatchSize,
    embeddingMaxIndexPerRun: source.embeddingMaxIndexPerRun,
    embeddingTimeoutMs: source.embeddingTimeoutMs,
    keywordWeight: source.keywordWeight,
    vectorWeight: source.vectorWeight,
    importanceWeight: source.importanceWeight,
    confidenceWeight: source.confidenceWeight,
    recencyWeight: source.recencyWeight,
    sessionSemanticMemoryEnabled: source.sessionSemanticMemoryEnabled,
    sessionSemanticMaxChars: source.sessionSemanticMaxChars,
    sessionSemanticMaxItems: source.sessionSemanticMaxItems,
    sessionSemanticTimeoutMs: source.sessionSemanticTimeoutMs,
    sessionIdleSummaryMs: source.sessionIdleSummaryMs,
    realtimeMemoryEnabled: source.realtimeMemoryEnabled,
    realtimeMemoryTimeoutMs: source.realtimeMemoryTimeoutMs,
    coreMaxItems: source.coreMaxItems,
    coreMaxTokens: source.coreMaxTokens,
    vacuumMemoryRetainDays: source.vacuumMemoryRetainDays,
    vacuumMemoryMinRetained: source.vacuumMemoryMinRetained,
    vacuumTimelineMaxEvents: source.vacuumTimelineMaxEvents,
    vacuumTimelineRetainDays: source.vacuumTimelineRetainDays,
    architectureEnabled: source.architectureEnabled,
    architectureLlmEnabled: source.architectureLlmEnabled,
    architectureLlmIncludeSource: source.architectureLlmIncludeSource,
    architectureMaxFiles: source.architectureMaxFiles,
    architectureMaxNodes: source.architectureMaxNodes,
    architectureLlmTimeoutMs: source.architectureLlmTimeoutMs,
  };
}

export const PROJECT_BRAIN_RPC_CHANNEL = "/project-brain";

export function getCwdBySession(ctx, sessionId) {
  if (!sessionId) return null;
  let sessions;
  try { sessions = ctx.get ? ctx.get("sessions") : ctx.sessions; } catch (e) { sessions = undefined; }
  if (!sessions || typeof sessions.get !== "function") return null;
  try {
    const session = sessions.get(sessionId);
    if (!session) return null;
    return (session.meta && session.meta.cwd) || (session.header && session.header.cwd) || (session.cwd) || null;
  } catch (e) {
    return null;
  }
}

function getSession(ctx, sessionId) {
  if (!sessionId) return null;
  let sessions;
  try { sessions = ctx.get ? ctx.get("sessions") : ctx.sessions; } catch (e) { sessions = null; }
  try { return sessions && typeof sessions.get === "function" ? sessions.get(sessionId) : null; } catch (e) { return null; }
}

function rpcOk(value) {
  return { ok: true, value };
}

// DSH Connection RPC 的 result 型別用 schemastery discriminated union：
//   - ok=true  → value
//   - ok=false → { code: <one of DSH_ERROR_CODES>, message, details }
//   任何 ok=false 的 error.code 不在 DSH_ERROR_CODES 裡都會被 schemastery 拒絕，
//   reject 到客戶端 .catch，讓使用者看到一坨 invalid_union 錯誤。
// 修復：自動把不在白名單的 code 降級到 "internal"，並把原 code 放進 details.originalCode。
const DSH_ERROR_CODES = new Set([
  "bad-request", "cancelled", "session-not-found", "model-unavailable", "session-conflict", "invalid-time-zone",
  "workspace-attach-failed", "workspace-not-found", "workspace-invalid-path", "workspace-name-conflict", "workspace-move-invalid",
  "directory-unreadable", "directory-exists", "directory-create-failed", "directory-picker-unavailable",
  "agent-preset-read-only", "agent-preset-locked", "agent-preset-conflict", "agent-preset-not-found", "agent-preset-invalid",
  "agent-busy", "attachment-error", "queue-item-not-found", "steer-unavailable",
  "command-error", "unknown-command",
  "settings-rejected", "settings-conflict",
  "credential-rejected", "model-discovery-failed",
  "title-invalid", "fork-unavailable",
  "subagent-parent-unavailable", "subagent-not-found", "subagent-catalog-diagnostic", "subagent-not-resumable", "subagent-unauthorized", "subagent-delivery-unavailable",
  "internal",
]);
function normalizeDshErrorCode(code, details) {
  if (typeof code === "string" && DSH_ERROR_CODES.has(code)) {
    return { code, details: details && typeof details === "object" ? details : {} };
  }
  // 不在白名單 → 降級到 "internal"，保留原 code 供 client 端診斷
  const merged = Object.assign({}, details && typeof details === "object" ? details : {});
  if (typeof code === "string" && code.length > 0 && !merged.originalCode) merged.originalCode = code;
  return { code: "internal", details: merged };
}

function rpcError(code, message, details) {
  const normalized = normalizeDshErrorCode(code, details);
  return {
    ok: false,
    error: {
      code: normalized.code,
      message,
      details: normalized.details,
    },
  };
}

// v1.1.x-fix：DSH 冷啟動 race condition —— sessions service 非同步註冊 session workspace，
//   第一次 getCwdBySession 可能返回 null（切到全新 session 後 ~300~500ms 才到位）。
//   一次短暫重試（500ms 後）能消除絕大多數切專案/切 session 時的 workspace-not-found 閃退。
const PROJECT_PATH_RETRY_DELAY_MS = 500;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function resolveRpcProjectPath(ctx, payload) {
  // Never trust a browser-provided filesystem path. The live Session header is
  // the authority for project isolation; it was created by DSH Host and cannot
  // be redirected by a crafted Client request.
  const sid = payload && payload.sessionId;
  const first = getCwdBySession(ctx, sid);
  if (first) return first;
  // 第一次 null → 等 500ms 再讀一次（DSH 內部通常幾百 ms 內完成註冊）
  await sleep(PROJECT_PATH_RETRY_DELAY_MS);
  return getCwdBySession(ctx, sid);
}

/**
 * Register the supported Client↔Host bridge on DSH's canonical Connection RPC.
 * Unlike the build-time session map, this resolves the live Session header on
 * every request, so Sessions created after the bundle was built work without a
 * rebuild or a Desktop restart.
 */
export function registerConnectionRpc({ connection, ctx, fs, sandboxPolicy, tools, logger, getMemoryConfig, updateSettings, settingsWritable, getLlm, resolveEmbeddingCredential }) {
  if (!connection || !connection.rpc || typeof connection.rpc.handle !== "function") {
    if (logger && typeof logger.warn === "function") {
      logger.warn("[dsh-project-brain] connection.rpc unavailable; runtime preview disabled");
    }
    return false;
  }

  connection.rpc.handle(
    PROJECT_BRAIN_RPC_CHANNEL,
    async (endpoint, payload) => {
      const projectPath = await resolveRpcProjectPath(ctx, payload || {});
      const session = getSession(ctx, payload && payload.sessionId);
      const architectureRuntime = {
        getMemoryConfig,
        getLlm,
        llmRoute: resolveSessionRoute(session),
        getLlmRoute: () => resolveSessionRoute(getSession(ctx, payload && payload.sessionId)),
        sessionId: payload && payload.sessionId,
      };

      // 外掛級設定：不依賴 session workspace，放在此處在 workspace 校驗之前處理。
      if (endpoint === "settings") {
        const rawAction = payload && payload.action;
        const action = rawAction === "update" || rawAction === "probe" ? rawAction : "get";
        const config = getMemoryConfig ? getMemoryConfig() : normalizeMemoryConfig({});
        const writable = settingsWritable ? settingsWritable() : false;
        if (action === "probe") {
          const target = payload && payload.target;
          const overlay = payload && payload.config && typeof payload.config === "object" ? payload.config : {};
          const merged = normalizeMemoryConfig(Object.assign({}, config, overlay));
          if (target === "embedding") {
            const probe = await probeEmbedding({
              config: merged,
              resolveCredential: resolveEmbeddingCredential,
            });
            return rpcOk({ probe: Object.assign({ target: "embedding" }, probe) });
          }
          if (target === "llm") {
            const llm = getLlm ? getLlm() : null;
            const route = resolveSessionRoute(getSession(ctx, payload && payload.sessionId));
            const probe = await probeSessionLlm({
              llm,
              route,
              sessionId: payload && payload.sessionId,
              timeoutMs: 12000,
            });
            return rpcOk({ probe: Object.assign({ target: "llm" }, probe) });
          }
          return rpcError("bad-request", "未知探測目標，應為 embedding 或 llm", { target: target || null });
        }
        if (action === "get") {
          return rpcOk({
            writable,
            config: sanitizeSettings(config),
            retrieval: publicMemoryConfig(config),
          });
        }
        // action === "update"
        const patch = payload && payload.patch && typeof payload.patch === "object" ? payload.patch : null;
        if (!patch || Object.keys(patch).length === 0) {
          return rpcError("EMPTY_PATCH", "沒有可儲存的欄位", {});
        }
        if (!updateSettings || typeof updateSettings !== "function") {
          return rpcError("SETTINGS_UNAVAILABLE", "當前執行時 settings 服務不可用，配置為只讀", { writable: false });
        }
        if (!writable) {
          return rpcError("SETTINGS_READONLY", "settings provider 只讀，無法儲存", { writable: false });
        }
        try {
          const next = await updateSettings(patch);
          return rpcOk({
            writable,
            config: sanitizeSettings(next),
            retrieval: publicMemoryConfig(next),
          });
        } catch (error) {
          return rpcError(
            (error && error.code) || "SETTINGS_UPDATE_FAILED",
            String((error && error.message) || error),
            { writable },
          );
        }
      }

      if (!projectPath) {
        return rpcError(
          "WORKSPACE_NOT_FOUND",
          "無法從當前 Session 解析 workspace 路徑",
          { sessionId: payload && payload.sessionId ? payload.sessionId : null },
        );
      }

      if (endpoint === "preview") {
        const preview = await buildWorkspacePreview(fs, projectPath);
        preview.retrieval = publicMemoryConfig(getMemoryConfig ? getMemoryConfig() : {});
        return rpcOk({
          projectPath,
          preview,
        });
      }

      if (endpoint === "init") {
        const result = await scanAndWrite(
          fs,
          sandboxPolicy,
          { path: projectPath, dryRun: false },
          "project_init",
          architectureRuntime,
        );
        if (!result || !result.ok) {
          const error = result && result.data && result.data.error;
          return rpcError(
            (error && error.code) || "INIT_FAILED",
            (error && error.message) || "專案大腦初始化失敗",
            { projectPath },
          );
        }
        invalidateAggregatorCache(projectPath);
        const preview = await buildWorkspacePreview(fs, projectPath);
        preview.retrieval = publicMemoryConfig(getMemoryConfig ? getMemoryConfig() : {});
        return rpcOk({
          projectPath,
          scan: result.data,
          preview,
        });
      }

      // v0.4.15：智慧續接 — Session 開始 / Dashboard 載入時調一次
      if (endpoint === "suggest") {
        const useLLM = !(payload && payload.useLLM === false);
        const suggestTool = buildSuggestTool({
          fs,
          sandboxPolicy,
          getLlm: architectureRuntime.getLlm,
        });
        // v0.4.17：客戶端已傳 workspacePath（來自 data._workspacePath），用它作為權威路徑。
        // 不同 session 調同一 endpoint 都拿相同內容（同一 .project-brain/）。
        const trustedPath = (payload && typeof payload.workspacePath === "string" && payload.workspacePath.trim()) ? payload.workspacePath : projectPath;
        const args = { path: trustedPath };
        if (!useLLM) args.useLLM = false;
        // 直接調 suggestTool.execute（session 上下文用於 LLM route / 錯誤日誌，但 projectPath 取 trustedPath）
        let toolResult;
        try {
          toolResult = await suggestTool.execute(args, {
            session: session,
            sessionId: payload && payload.sessionId,
            agent: (ctx && ctx.agent) || null,
            ctx: ctx,
          });
        } catch (error) {
          return rpcError("SUGGEST_FAILED", String((error && error.message) || error), { endpoint });
        }
        if (!toolResult || toolResult.ok === false) {
          const error = toolResult && toolResult.data && toolResult.data.error;
          return rpcError(
            (error && error.code) || "SUGGEST_FAILED",
            (error && error.message) || "智慧續接失敗",
            { endpoint, projectPath: trustedPath },
          );
        }
        return rpcOk({
          projectPath: trustedPath,
          suggestion: toolResult.data,
        });
      }

      // v0.4.x: Git 歷史 — Dashboard Git Tab 資料來源（無 .git 時 available=false 讓 Client 不渲染 tab）
      if (endpoint === "git") {
        const limit = Math.max(1, Math.min(500, Number(payload && payload.limit) || 50));
        const branch = (payload && typeof payload.branch === "string" && payload.branch.trim()) ? payload.branch.trim() : null;
        try {
          const history = getGitHistory({ projectPath, limit, branch });
          const branches = getGitBranches(projectPath);
          // 工作樹 vs HEAD tree 對比（不依賴 git binary）：untracked / deleted
          let workTree = { available: false };
          try {
            workTree = getWorkTreeChanges({ projectPath, maxFiles: 50 });
          } catch (e) {
            workTree = { available: false, error: String((e && e.message) || e) };
          }
          return rpcOk({
            projectPath,
            available: history.available === true,
            currentBranch: history.currentBranch || (branches && branches.currentBranch) || null,
            head: history.head || null,
            total: history.total || 0,
            commits: history.commits || [],
            branches: (branches && branches.branches) || [],
            workTree,
            error: history.error || null,
          });
        } catch (error) {
          return rpcError(
            "GIT_HISTORY_FAILED",
            String((error && error.message) || error),
            { endpoint, projectPath },
          );
        }
      }

      if (endpoint === "action") {
        const action = payload && typeof payload.action === "string" ? payload.action : "";
        const toolActions = {
          todos: { name: "project_todo_list", args: { limit: 50 }, mutates: false },
          dream: { name: "project_dream", args: { mode: "light", dryRun: true }, mutates: false },
          dreamCommit: { name: "project_dream", args: { mode: "light", dryRun: false }, mutates: true },
          overview: { name: "project_continue", args: {}, mutates: false },
        };

        // Rescan uses the same trusted host-side implementation as onboarding.
        // The browser supplies only an action name; the project path always comes
        // from the live Session header above.
        if (action === "rescan") {
          const result = await scanAndWrite(
            fs,
            sandboxPolicy,
            { path: projectPath, dryRun: false },
            "project_rescan",
            architectureRuntime,
          );
          if (!result || !result.ok) {
            const error = result && result.data && result.data.error;
            return rpcError(
              (error && error.code) || "RESCAN_FAILED",
              (error && error.message) || "重新掃描失敗",
              { action, projectPath },
            );
          }
          invalidateAggregatorCache(projectPath);
          const preview = await buildWorkspacePreview(fs, projectPath);
          preview.retrieval = publicMemoryConfig(getMemoryConfig ? getMemoryConfig() : {});
          return rpcOk({
            action,
            projectPath,
            result,
            preview,
          });
        }

        const definition = toolActions[action];
        if (!definition) {
          return rpcError("ACTION_NOT_ALLOWED", "不支援的 Project Brain 操作：" + action, { action });
        }
        if (!tools || typeof tools.execute !== "function") {
          return rpcError("TOOLS_UNAVAILABLE", "DSH tools service unavailable", { action });
        }

        let result;
        try {
          result = await tools.execute({
            name: definition.name,
            args: Object.assign({}, definition.args, { path: projectPath }),
          });
        } catch (error) {
          return rpcError(
            "ACTION_FAILED",
            String((error && error.message) || error),
            { action, tool: definition.name },
          );
        }
        if (!result || result.ok === false) {
          const nested = result && result.data && result.data.error;
          return rpcError(
            (nested && nested.code) || (result && result.code) || "ACTION_FAILED",
            (nested && nested.message) || (result && result.message) || "操作執行失敗",
            { action, tool: definition.name },
          );
        }
        if (definition.mutates) invalidateAggregatorCache(projectPath);
        const preview = await buildWorkspacePreview(fs, projectPath);
        preview.retrieval = publicMemoryConfig(getMemoryConfig ? getMemoryConfig() : {});
        return rpcOk({
          action,
          projectPath,
          result,
          preview,
        });
      }

      // ─── 人工維護記憶：編輯 / 歸檔 / 恢復 / 永久刪除 ───
      if (endpoint === "memory.update" || endpoint === "memory.status" || endpoint === "memory.delete") {
        return handleMemoryMutation({
          endpoint,
          payload: payload || {},
          projectPath,
          fs,
          ctx,
          getMemoryConfig,
        });
      }

      // ─── v1.3.1：匯入匯出 / 備份恢復 RPC ───
      // 不走 tools.execute：Connection RPC 裡它可能 ok 卻不呼叫 tool.execute。

      if (endpoint === "export.run") {
        // 不走 tools.execute：DSH Connection 裡它可能 ok 卻不呼叫 tool.execute，zip 根本不會落盤。
        let outputPath = payload && typeof payload.outputPath === "string" ? payload.outputPath : "";
        try {
          const { defaultBundleName, writeBundleFile } = await import("../transfer/bundle.js");
          if (!outputPath) {
            let projectName = path.basename(projectPath);
            try {
              const raw = await fsp.readFile(path.join(projectPath, ".project-brain", "project.json"), "utf8");
              const meta = JSON.parse(raw);
              if (meta && meta.name) projectName = String(meta.name);
            } catch (e) { /* 用目錄名即可 */ }
            outputPath = path.join(projectPath, "dist-backups", defaultBundleName({ name: projectName }));
          }
          const includeCache = payload && payload.includeCache !== undefined ? !!payload.includeCache : true;
          const written = await writeBundleFile({
            projectPath,
            outputPath,
            includeCache,
          });
          try {
            const { appendJsonl, brainPath } = await import("../store/brain-files.js");
            const now = Date.now();
            await appendJsonl(fs, brainPath(projectPath, "timeline.jsonl"), {
              id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
              title: "匯出 bundle：" + written.bundleName,
              eventType: "export",
              occurredAt: now,
              payload: {
                bundlePath: written.bundlePath,
                sizeBytes: written.sizeBytes,
                fileCount: written.fileCount,
              },
            });
          } catch (e) { /* timeline 失敗不阻斷匯出 */ }
          invalidateAggregatorCache(projectPath);
          const preview = await buildWorkspacePreview(fs, projectPath);
          preview.retrieval = publicMemoryConfig(getMemoryConfig ? getMemoryConfig() : {});
          return rpcOk({
            projectPath,
            preview,
            bundlePath: written.bundlePath,
            bundleName: written.bundleName,
            defaultDirPath: written.defaultDirPath,
            sizeBytes: written.sizeBytes,
            result: {
              ok: true,
              data: {
                bundlePath: written.bundlePath,
                bundleName: written.bundleName,
                defaultDirPath: written.defaultDirPath,
                sizeBytes: written.sizeBytes,
                fileCount: written.fileCount,
              },
            },
          });
        } catch (e) {
          return rpcError(
            (e && e.code) || "internal",
            String((e && e.message) || e),
            { outputPath: outputPath || null, projectPath },
          );
        }
      }

      if (endpoint === "import.preview") {
        const bundlePath = payload && typeof payload.bundlePath === "string" ? payload.bundlePath : "";
        if (!bundlePath) return rpcError("bad-request", "bundlePath 必填", {});
        try {
          const { previewBundle } = await import("../transfer/bundle.js");
          const { getTokenStore } = await import("../transfer/confirm-tokens.js");
          const preview = await previewBundle({ bundlePath, destProjectPath: projectPath });
          const confirmToken = getTokenStore().issue({
            kind: "import",
            payload: { bundlePath, destProjectPath: projectPath },
          });
          const data = shapeImportPreviewData(preview, bundlePath, confirmToken);
          return rpcOk(Object.assign({ projectPath, result: { ok: true, data } }, data));
        } catch (e) {
          return rpcError((e && e.code) || "internal", String((e && e.message) || e), { bundlePath, projectPath });
        }
      }

      if (endpoint === "import.apply") {
        const bundlePath = payload && typeof payload.bundlePath === "string" ? payload.bundlePath : "";
        const confirmToken = payload && typeof payload.confirmToken === "string" ? payload.confirmToken : "";
        if (!bundlePath) return rpcError("bad-request", "bundlePath 必填", {});
        if (!confirmToken) return rpcError("bad-request", "confirmToken 必填（先調 import.preview 拿 token）", {});
        try {
          const { getTokenStore } = await import("../transfer/confirm-tokens.js");
          const tokenPayload = getTokenStore().consume(confirmToken, { kind: "import" });
          if (!tokenPayload) {
            return rpcError("bad-request", "confirmToken 無效、已過期或型別不匹配（請重新預覽）", {});
          }
          if (tokenPayload.bundlePath !== bundlePath || tokenPayload.destProjectPath !== projectPath) {
            return rpcError("bad-request", "confirmToken 與當前引數不匹配（請重新預覽）", {});
          }
          const { applyBundle } = await import("../transfer/bundle.js");
          const applied = await applyBundle({ bundlePath, destProjectPath: projectPath, triggerRescan: false });
          try {
            const { appendJsonl, brainPath } = await import("../store/brain-files.js");
            const now = Date.now();
            await appendJsonl(fs, brainPath(projectPath, "timeline.jsonl"), {
              id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
              title: applied.backupPath
                ? "匯入 bundle（已備份舊腦到 " + path.basename(applied.backupPath) + "）"
                : "匯入 bundle（首次）",
              eventType: "import",
              occurredAt: now,
              payload: {
                bundlePath,
                backupPath: applied.backupPath,
                sourceManifest: applied.sourceManifest,
              },
            });
          } catch (e) { /* timeline 失敗不阻斷匯入 */ }
          const data = {
            mode: "applied",
            bundlePath,
            backupPath: applied.backupPath || "",
            fileCount: applied.fileCount || 0,
          };
          const result = rpcOk(Object.assign({ projectPath, result: { ok: true, data } }, data));
          await attachRescanAndPreview({
            result,
            projectPath,
            fs,
            sandboxPolicy,
            architectureRuntime,
            getMemoryConfig,
          });
          return result;
        } catch (e) {
          return rpcError((e && e.code) || "internal", String((e && e.message) || e), { bundlePath, projectPath });
        }
      }

      if (endpoint === "backup.list") {
        // 只讀列表，不走 cleanup tool（避免誤刪）
        try {
          const { listBackups } = await import("../transfer/backup.js");
          const backups = await listBackups({ projectPath });
          return rpcOk({ projectPath, backups });
        } catch (error) {
          return rpcError(
            (error && error.code) || "BACKUP_LIST_FAILED",
            String((error && error.message) || error),
            { projectPath },
          );
        }
      }

      if (endpoint === "backup.cleanup") {
        const keepLast = payload && typeof payload.keepLast === "number" ? payload.keepLast : 3;
        const olderThanMs = payload && typeof payload.olderThanMs === "number" ? payload.olderThanMs : undefined;
        try {
          const { cleanupBackups } = await import("../transfer/backup.js");
          const cleaned = await cleanupBackups({ projectPath, keepLast, olderThanMs });
          const data = {
            keptCount: Array.isArray(cleaned.kept) ? cleaned.kept.length : 0,
            deletedCount: Array.isArray(cleaned.deleted) ? cleaned.deleted.length : 0,
            kept: cleaned.kept || [],
            deleted: cleaned.deleted || [],
          };
          return rpcOk(Object.assign({ projectPath, result: { ok: true, data } }, data));
        } catch (e) {
          return rpcError((e && e.code) || "internal", String((e && e.message) || e), { projectPath });
        }
      }

      if (endpoint === "backup.rollback.preview") {
        const ts = payload && typeof payload.backupTimestamp === "string" ? payload.backupTimestamp : "";
        if (!ts) return rpcError("bad-request", "backupTimestamp 必填", {});
        try {
          const { previewRollback } = await import("../transfer/backup.js");
          const { getTokenStore } = await import("../transfer/confirm-tokens.js");
          const preview = await previewRollback({ projectPath, backupTimestamp: ts });
          const confirmToken = getTokenStore().issue({
            kind: "rollback",
            payload: { projectPath, backupTimestamp: ts },
          });
          const data = shapeRollbackPreviewData(preview, ts, confirmToken);
          return rpcOk(Object.assign({ projectPath, result: { ok: true, data } }, data));
        } catch (e) {
          return rpcError((e && e.code) || "internal", String((e && e.message) || e), { projectPath });
        }
      }

      if (endpoint === "backup.rollback.apply") {
        const ts = payload && typeof payload.backupTimestamp === "string" ? payload.backupTimestamp : "";
        const confirmToken = payload && typeof payload.confirmToken === "string" ? payload.confirmToken : "";
        if (!ts) return rpcError("bad-request", "backupTimestamp 必填", {});
        if (!confirmToken) return rpcError("bad-request", "confirmToken 必填（先調 backup.rollback.preview 拿 token）", {});
        try {
          const { getTokenStore } = await import("../transfer/confirm-tokens.js");
          const tokenPayload = getTokenStore().consume(confirmToken, { kind: "rollback" });
          if (!tokenPayload) {
            return rpcError("bad-request", "confirmToken 無效、已過期或型別不匹配（請重新選擇）", {});
          }
          if (tokenPayload.projectPath !== projectPath || tokenPayload.backupTimestamp !== ts) {
            return rpcError("bad-request", "confirmToken 與當前引數不匹配（請重新選擇）", {});
          }
          const { applyRollback } = await import("../transfer/backup.js");
          const applied = await applyRollback({ projectPath, backupTimestamp: ts, triggerRescan: false });
          try {
            const { appendJsonl, brainPath } = await import("../store/brain-files.js");
            const now = Date.now();
            await appendJsonl(fs, brainPath(projectPath, "timeline.jsonl"), {
              id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
              title: "回滾到備份 " + ts,
              eventType: "rollback",
              occurredAt: now,
              payload: {
                restoredFrom: applied.restoredFrom,
                preRollbackBackupPath: applied.preRollbackBackupPath,
              },
            });
          } catch (e) { /* timeline 失敗不阻斷回滾 */ }
          const data = {
            mode: "applied",
            backupTimestamp: ts,
            restoredFrom: applied.restoredFrom || "",
            preRollbackBackupPath: applied.preRollbackBackupPath || "",
          };
          const result = rpcOk(Object.assign({ projectPath, result: { ok: true, data } }, data));
          await attachRescanAndPreview({
            result,
            projectPath,
            fs,
            sandboxPolicy,
            architectureRuntime,
            getMemoryConfig,
          });
          return result;
        } catch (e) {
          return rpcError((e && e.code) || "internal", String((e && e.message) || e), { projectPath });
        }
      }

      // v1.3.1：用 Electron shell.openPath 在檔案管理器中開啟資料夾
      // 失敗兜底：返回錯誤，讓 Client 降級到複製路徑
      if (endpoint === "export.openFolder") {
        const folderPath = payload && typeof payload.folderPath === "string" ? payload.folderPath : "";
        if (!folderPath) return rpcError("BAD_REQUEST", "folderPath 必填", {});
        try {
          // 安全檢查：必須是絕對路徑，且不能包含 ..（防穿越）
          if (!/^([A-Za-z]:[\\/]|\/)/.test(folderPath) || folderPath.includes("..")) {
            return rpcError("BAD_REQUEST", "folderPath 必須是絕對路徑且不含 ..", { folderPath });
          }
          // 優先用 DSH 提供的 shell service；fallback 到 electron
          let shellModule = null;
          let opened = false;
          try {
            // 方案 1：通過 ctx.get('shell') 探測 DSH 是否暴露了 shell service
            const shell = ctx.get ? ctx.get("shell") : ctx.shell;
            if (shell && typeof shell.openPath === "function") {
              const r = await shell.openPath(folderPath);
              opened = r === "" || r === undefined || r === null;
              if (!opened) {
                return rpcError("OPEN_FAILED", "shell.openPath 返回錯誤：" + String(r), { folderPath });
              }
              return rpcOk({ opened: true, folderPath });
            }
          } catch (e) { /* fallthrough */ }
          // 方案 2：直接 require electron
          try {
            shellModule = await import("electron");
            if (shellModule && shellModule.shell && typeof shellModule.shell.openPath === "function") {
              const errMsg = await shellModule.shell.openPath(folderPath);
              if (errMsg) {
                return rpcError("OPEN_FAILED", errMsg, { folderPath });
              }
              return rpcOk({ opened: true, folderPath });
            }
          } catch (e) { /* electron not available */ }
          // 方案 3：node child_process spawn explorer / xdg-open
          try {
            const { spawn } = await import("node:child_process");
            const isWin = process.platform === "win32";
            const cmd = isWin ? "explorer" : (process.platform === "darwin" ? "open" : "xdg-open");
            spawn(cmd, [folderPath], { detached: true, stdio: "ignore" }).unref();
            return rpcOk({ opened: true, folderPath, method: cmd });
          } catch (e) {
            return rpcError("OPEN_FAILED", "無法開啟資料夾：" + String((e && e.message) || e), { folderPath });
          }
        } catch (e) {
          return rpcError("OPEN_FAILED", String((e && e.message) || e), { folderPath });
        }
      }

      if (endpoint === "import.pickBundle") {
        try {
          let dialog = null;
          let BrowserWindow = null;
          try {
            const electron = await import("electron");
            const mod = electron && electron.default ? electron.default : electron;
            dialog = mod && mod.dialog;
            BrowserWindow = mod && mod.BrowserWindow;
          } catch (e) { /* electron not available */ }
          if (!dialog || typeof dialog.showOpenDialog !== "function") {
            return rpcError("directory-picker-unavailable", "系統檔案選擇器不可用，請貼上 zip 的完整路徑", {});
          }
          const win = (BrowserWindow && typeof BrowserWindow.getFocusedWindow === "function" && BrowserWindow.getFocusedWindow())
            || (BrowserWindow && typeof BrowserWindow.getAllWindows === "function" && (BrowserWindow.getAllWindows()[0] || null))
            || undefined;
          const picked = await dialog.showOpenDialog(win || undefined, {
            title: "選擇 Project Brain bundle",
            properties: ["openFile"],
            filters: [
              { name: "Brain bundle", extensions: ["zip"] },
              { name: "All files", extensions: ["*"] },
            ],
          });
          if (!picked || picked.canceled || !picked.filePaths || !picked.filePaths[0]) {
            return rpcOk({ canceled: true, bundlePath: null });
          }
          return rpcOk({ canceled: false, bundlePath: picked.filePaths[0] });
        } catch (e) {
          return rpcError("directory-picker-unavailable", "無法開啟檔案選擇器：" + String((e && e.message) || e), {});
        }
      }

      return rpcError("METHOD_NOT_FOUND", "未知 Project Brain RPC 方法：" + endpoint, { endpoint });
    },
    { authority: "loopback" },
  );
  return true;
}

const MEMORY_TIMELINE_EVENTS = {
  edit: { eventType: "memory_edit", verb: "編輯記憶" },
  archived: { eventType: "memory_archive", verb: "歸檔記憶" },
  active: { eventType: "memory_restore", verb: "恢復記憶" },
  dormant: { eventType: "memory_archive", verb: "休眠記憶" },
  delete: { eventType: "memory_delete", verb: "永久刪除記憶" },
};

// 編輯 / 歸檔 / 恢復 / 永久刪除共用一條通道。
//
// 分兩段很關鍵：鎖內只做「讀整表 → 改 → 寫整表」，preview 必須留在鎖外——
// buildWorkspacePreview 內部會調 persistHousekeep，那也要搶 memory.jsonl 的事務鎖，
// 在鎖裡調它就是自己等自己：資料寫進去了，RPC 卻永遠不返回，前端一直轉圈。
export async function handleMemoryMutation(args) {
  const { endpoint, projectPath, fs, ctx, getMemoryConfig } = args;
  const id = typeof args.payload.id === "string" ? args.payload.id.trim() : "";
  if (!id) return rpcError("bad-request", "id 必填", { endpoint });

  // 和 admit / housekeep 搶同一把事務鎖，避免人工編輯和自動寫入互相覆蓋。
  const result = await withWriteLock(brainTxKey(projectPath, "memory.jsonl"), () => mutateMemoryFile(args, id));
  if (!result.ok) return rpcError(result.code || "internal", result.message || "記憶操作失敗", { endpoint, id });

  const { outcome, changed, now, timelineKey } = result;

  if (changed) {
    const meta = MEMORY_TIMELINE_EVENTS[timelineKey] || MEMORY_TIMELINE_EVENTS.edit;
    try {
      await appendJsonl(fs, brainPath(projectPath, "timeline.jsonl"), {
        id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
        title: meta.verb + "[" + outcome.entry.type + "]：" + outcome.entry.title,
        eventType: meta.eventType,
        occurredAt: now,
        detail: "id=" + outcome.entry.id + " by=user",
      });
    } catch (e) { /* timeline 失敗不阻斷本次操作 */ }

    invalidateAggregatorCache(projectPath);
    // 注入用的是 injector 自己的快取，只認這個事件。不發的話頁面已經變了、模型那邊還是舊的。
    try {
      if (ctx && typeof ctx.emit === "function") {
        ctx.emit("project_brain/preview.changed", { projectPath });
      }
    } catch (e) { /* emit 失敗不阻斷本次操作 */ }
  }

  const preview = await buildWorkspacePreview(fs, projectPath);
  preview.retrieval = publicMemoryConfig(getMemoryConfig ? getMemoryConfig() : {});
  return rpcOk({
    projectPath,
    preview,
    changed,
    memory: endpoint === "memory.delete" ? null : outcome.entry,
    deletedId: endpoint === "memory.delete" && changed ? outcome.entry.id : null,
  });
}

// 鎖內的那一段。只碰 memory.jsonl，不做任何可能再次取鎖的事。
async function mutateMemoryFile({ endpoint, payload, projectPath, fs }, id) {
  const memoryFile = brainPath(projectPath, "memory.jsonl");
  let rows;
  try {
    rows = await readJsonl(fs, memoryFile);
  } catch (e) {
    return { ok: false, code: "internal", message: "讀取 memory.jsonl 失敗：" + String((e && e.message) || e) };
  }

  const now = Date.now();
  let outcome;
  let timelineKey;
  if (endpoint === "memory.update") {
    const patch = payload.patch && typeof payload.patch === "object" ? payload.patch : null;
    if (!patch) return { ok: false, code: "bad-request", message: "patch 必填" };
    outcome = applyMemoryEdit(rows, { id, patch, now });
    timelineKey = "edit";
  } else if (endpoint === "memory.status") {
    const status = typeof payload.status === "string" ? payload.status : "";
    if (["active", "dormant", "archived"].indexOf(status) < 0) {
      return { ok: false, code: "bad-request", message: "status 只能是 active / dormant / archived" };
    }
    const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 500) : "";
    outcome = applyMemoryStatus(rows, { id, status, reason, now });
    timelineKey = status;
  } else {
    // 物理刪除不可恢復，要求呼叫方顯式帶上 confirm，避免誤點或髒呼叫直接抹掉資料。
    if (payload.confirm !== true) {
      return { ok: false, code: "bad-request", message: "永久刪除需要 confirm=true" };
    }
    outcome = applyMemoryDelete(rows, { id });
    timelineKey = "delete";
  }

  if (!outcome.ok) return { ok: false, code: outcome.code || "internal", message: outcome.message };
  if (outcome.changed === false) return { ok: true, outcome, changed: false, now, timelineKey };

  const wrote = await writeJsonl(fs, memoryFile, outcome.rows);
  if (!wrote) return { ok: false, code: "internal", message: "寫入 memory.jsonl 失敗" };
  return { ok: true, outcome, changed: true, now, timelineKey };
}

async function attachRescanAndPreview({ result, projectPath, fs, sandboxPolicy, architectureRuntime, getMemoryConfig }) {
  invalidateAggregatorCache(projectPath);
  let rescanTriggered = false;
  let rescanError = null;
  try {
    const scan = await scanAndWrite(
      fs,
      sandboxPolicy,
      { path: projectPath, dryRun: false },
      "project_rescan",
      architectureRuntime,
    );
    rescanTriggered = !!(scan && scan.ok);
    if (!rescanTriggered) {
      const err = scan && scan.data && scan.data.error;
      rescanError = (err && (err.message || err.code)) || (scan && scan.message) || "rescan failed";
    }
  } catch (e) {
    rescanError = String((e && e.message) || e);
  }
  if (result && result.value && result.value.result && typeof result.value.result === "object") {
    result.value.result.rescanTriggered = rescanTriggered;
    if (rescanError) result.value.result.rescanError = rescanError;
  }
  try {
    const preview = await buildWorkspacePreview(fs, projectPath);
    preview.retrieval = publicMemoryConfig(getMemoryConfig ? getMemoryConfig() : {});
    if (result && result.value) result.value.preview = preview;
  } catch (e) { /* preview 重新整理失敗不阻斷匯入/回滾 */ }
  return result;
}

// Helper: 把 tools.execute 的結果包裝成 connection RPC 的 ok 響應
//   相容兩種 tools.execute 返回格式：
//     A) { ok: true, data: { ... }, code?, message? }  ← 標準（v0.x DSH）
//     B) { ...dataField... }                            ← 部分 DSH 版本直接返回資料
//   rpcOk 返回 { ok: true, value: { name, result: <data> } }
// 失敗：把 code/message 傳給 rpcError，並在 details 裡保留原 data
async function executeTool(tools, name, args) {
  if (!tools || typeof tools.execute !== "function") {
    return rpcError("TOOLS_UNAVAILABLE", "DSH tools service unavailable", { name });
  }
  try {
    const result = await tools.execute({ name, args: args || {} });
    if (!result) return rpcError("TOOL_RESULT_EMPTY", "tool returned empty result", { name });
    if (result.ok === false) {
      return rpcError(
        result.code || "TOOL_FAILED",
        result.message || "tool execution failed",
        Object.assign({ name, toolData: result.data }, result.data || {}),
      );
    }
    // unwrap data：相容 A 格式、B 格式，以及 DSH 再包一層 {ok,data:{ok,data}}
    const data = unwrapToolResult(result);
    if (data && data.error === true) {
      return rpcError(
        data.code || "TOOL_FAILED",
        data.message || "tool execution failed",
        Object.assign({ name }, data.data || {}),
      );
    }
    // 保持 tools.execute 的 { ok, data } 形狀（Dashboard Quick Action 已驗證可過 DSH schema）
    return rpcOk({ name, result: { ok: true, data } });
  } catch (error) {
    return rpcError(
      (error && error.code) || "TOOL_EXCEPTION",
      String((error && error.message) || error),
      { name },
    );
  }
}

export function registerSidebarRpc({ harness, ctx, fs, tools, getDefaultProjectPath, logger }) {
  const disposers = [];

  if (!harness || typeof harness.handle !== "function") {
    (logger && typeof logger.warn === "function"
      ? logger
      : { warn: (m) => console.warn(m) }
    ).warn("[dsh-project-brain] harness builtin unavailable, skip RPC registration (host-side features will not work; restart DSH to load normally)");
    return disposers;
  }

  // 1) SidebarPreview 資料
  //    優先按 sessionId 反查當前 workspace 的 cwd（避免 sandboxPolicy.workspaceRoot 是固定值的坑）
  //    回退 getDefaultProjectPath（sandboxPolicy.workspaceRoot）
  const getPreviewDisposer = harness.handle("project_brain/sidebar.getPreview", async (args) => {
    let projectPath = null;
    try {
      if (args && args.sessionId) {
        projectPath = getCwdBySession(ctx, args.sessionId);
      }
    } catch (e) { /* ignore */ }
    if (!projectPath) projectPath = getDefaultProjectPath();
    return buildSidebarPreview(projectPath);
  });
  disposers.push(getPreviewDisposer);

  // 2) 橋接 project_init tool（Onboarding 啟動按鈕）
  //    v0.5.1 修復：支援 sessionId fallback——當 args.path 缺失時（常見於 build-time
  //    sessionToWorkspaceId map miss 的全新 workspace），用 args.sessionId 反查 cwd
  //    （getCwdBySession 已存在，避免每個新建 workspace 都必須先重啟 DSH 讓 build 重新納入）
  const initDisposer = harness.handle("project_brain/initProject", async (args) => {
    if (!tools || typeof tools.execute !== "function") {
      return { ok: false, code: "E_NO_TOOLS", message: "tools service unavailable" };
    }
    const userArgs = Object.assign({}, (args && args.args) || {});
    if (!userArgs.path && userArgs.sessionId) {
      try {
        const resolved = getCwdBySession(ctx, userArgs.sessionId);
        if (resolved) {
          userArgs.path = resolved;
          if (ctx && ctx.logger && typeof ctx.logger.info === "function") {
            try { ctx.logger.info("[dsh-project-brain] initProject: sessionId " + String(userArgs.sessionId).slice(0, 12) + "… → cwd " + resolved); } catch (e) {}
          }
        }
      } catch (e) { /* ignore */ }
    }
    try {
      const result = await tools.execute({
        name: "project_init",
        args: userArgs,
      });
      // project_init 內部已 emit preview.changed；快取會通過 ctx.on('project_brain/preview.changed') 清空
      return result;
    } catch (e) {
      return { ok: false, code: "E_INIT_FAILED", message: String((e && e.message) || e) };
    }
  });
  disposers.push(initDisposer);

  // 3) 橋接 project_continue tool（"繼續上次開發"按鈕）
  const continueDisposer = harness.handle("project_brain/continueSession", async (args) => {
    if (!tools || typeof tools.execute !== "function") {
      return { ok: false, code: "E_NO_TOOLS", message: "tools service unavailable" };
    }
    try {
      const result = await tools.execute({
        name: "project_continue",
        args: (args && args.args) || {},
      });
      return { ok: true, data: result };
    } catch (e) {
      return { ok: false, code: "E_CONTINUE_FAILED", message: String((e && e.message) || e) };
    }
  });
  disposers.push(continueDisposer);

  return disposers;
}
