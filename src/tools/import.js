// project_import Tool — 從 bundle zip 還原 .project-brain/
//
// 流程（dryRun → apply 兩步機制）：
//   1. dryRun=true  → 解析 bundle → 計算 impact → 發放 confirmToken
//   2. UI 顯示預覽，使用者確認
//   3. dryRun=false + confirmToken → 備份當前腦 → 解壓 → 改寫 rootPath → 觸發 rescan

import { defineTool } from "@deepseek-ai/dsh-tools";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { resolveProjectPath } from "../host/store/path-resolver.js";
import { appendJsonl } from "../host/store/brain-files.js";
import {
  previewBundle,
  applyBundle,
} from "../host/transfer/bundle.js";
import { getTokenStore } from "../host/transfer/confirm-tokens.js";

const baseOutputSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
    code: { type: "string" },
    message: { type: "string" },
  },
};

function emitPreviewChanged(exec, projectPath) {
  try {
    const executor = (exec && exec.ctx) || null;
    if (executor && typeof executor.emit === "function") {
      executor.emit("project_brain/preview.changed", { projectPath });
    }
  } catch (e) {}
}

export function buildProjectImportTool({ fs, sandboxPolicy }) {
  return defineTool({
    name: "project_import",
    description:
      "dsh-project-brain: 從 bundle zip 還原 .project-brain/。**兩步機制**：先 dryRun=true 看預覽，" +
      "把返回的 confirmToken 傳給 dryRun=false 才實際寫入；5 分鐘內必須完成。" +
      "匯入會備份當前腦 → 解壓 → 改寫 rootPath → 觸發 rescan。失敗回滾可調 project_rollback_backup。",
    parameters: {
      path: { type: "string", description: "目的地專案根路徑（預設從 session cwd 推斷）" },
      bundlePath: { type: "string", description: "bundle zip 檔案絕對路徑（必填）" },
      dryRun: { type: "boolean", description: "true=僅預覽，false=實際寫入（預設 false）" },
      confirmToken: { type: "string", description: "dryRun 返回的 token；dryRun=false 時必填" },
    },
    output: { schema: baseOutputSchema, render: renderImport },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        if (projectPath === ".") {
          return { ok: false, code: "E_NO_PATH", message: "無法解析專案路徑（請顯式傳 path）" };
        }
        const bundlePath = args && args.bundlePath;
        if (!bundlePath) {
          return { ok: false, code: "E_BUNDLE_PATH_REQUIRED", message: "bundlePath 必填" };
        }
        // 校驗 bundle 檔案存在
        try {
          await fsp.access(bundlePath);
        } catch (e) {
          return { ok: false, code: "E_BUNDLE_NOT_FOUND", message: "bundle 檔案不存在：" + bundlePath };
        }

        const isDryRun = !!(args && args.dryRun);
        const tokenStore = getTokenStore();

        if (isDryRun) {
          // ─── Preview ───
          let preview;
          try {
            preview = await previewBundle({ bundlePath, destProjectPath: projectPath });
          } catch (e) {
            return {
              ok: false,
              code: (e && e.code) || "E_BUNDLE_INVALID",
              message: String((e && e.message) || e),
              data: { detail: e && e.detail },
            };
          }
          const confirmToken = tokenStore.issue({
            kind: "import",
            payload: { bundlePath, destProjectPath: projectPath, preview },
          });

          return {
            ok: true,
            data: {
              mode: "preview",
              bundlePath,
              manifest: {
                schemaVersion: preview.manifest.schemaVersion,
                pluginVersion: preview.manifest.pluginVersion,
                exportedAt: preview.manifest.exportedAt,
                sourceProject: preview.manifest.sourceProject,
              },
              impact: {
                currentBrainExists: preview.currentBrain.exists,
                currentProjectId: preview.currentBrain.projectId,
                currentMemories: preview.currentBrain.memCount,
                currentTodos: preview.currentBrain.todoCount,
                currentTimeline: preview.currentBrain.timelineCount,
                currentArchitecture: preview.currentBrain.archExists,
                incomingMemories: preview.incoming.memCount,
                incomingTodos: preview.incoming.todoCount,
                incomingTimeline: preview.incoming.timelineCount,
                incomingProjectId: preview.incoming.projectId,
                backupWillCreateAt: preview.backupWillCreateAt,
                rootPathRewrite: preview.rootPathRewrite,
              },
              confirmToken,
              warning: preview.currentBrain.exists
                ? "匯入將覆蓋當前腦，舊腦會自動備份到 " + preview.backupWillCreateAt
                : "這是該專案首次匯入，無備份可建。",
            },
          };
        }

        // ─── Apply ───
        const token = args && args.confirmToken;
        if (!token) {
          return { ok: false, code: "E_CONFIRM_TOKEN_REQUIRED", message: "dryRun=false 必須傳 confirmToken（先 dryRun=true 拿到 token）" };
        }
        const payload = tokenStore.consume(token, { kind: "import" });
        if (!payload) {
          return { ok: false, code: "E_CONFIRM_TOKEN_MISMATCH", message: "confirmToken 無效、已過期或型別不匹配（請重新 dryRun）" };
        }
        // 校驗 token 內 bundlePath 與當前一致（防止 token 複用跨專案）
        if (payload.bundlePath !== bundlePath || payload.destProjectPath !== projectPath) {
          return { ok: false, code: "E_CONFIRM_TOKEN_MISMATCH", message: "confirmToken 與當前引數不匹配（請重新 dryRun）" };
        }

        let applied;
        try {
          applied = await applyBundle({
            bundlePath,
            destProjectPath: projectPath,
            triggerRescan: false, // 由呼叫方排程
          });
        } catch (e) {
          return {
            ok: false,
            code: (e && e.code) || "E_IMPORT_FAILED",
            message: String((e && e.message) || e),
          };
        }

        // 寫 timeline
        try {
          const now = Date.now();
          const event = {
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
          };
          await appendJsonl(fs, brainPath(projectPath, "timeline.jsonl"), event);
        } catch (e) { /* 不阻斷主流程 */ }

        emitPreviewChanged(exec, projectPath);

        return {
          ok: true,
          data: {
            mode: "applied",
            bundlePath,
            backupPath: applied.backupPath,
            rescanTriggered: false, // 留給 RPC 層排程
            fileCount: applied.fileCount,
            sourceManifest: applied.sourceManifest,
            warning: "腦資料已寫入。建議手動調 project_rescan 重新整理架構與統計；" +
              "若需恢復舊腦，可調 project_rollback_backup。",
          },
        };
      } catch (e) {
        return {
          ok: false,
          code: (e && e.code) || "E_IMPORT_FAILED",
          message: String((e && e.message) || e),
        };
      }
    },
  });
}

function renderImport(_args, value) {
  if (!value || typeof value !== "object") {
    return [{ type: "text", text: "dsh-project-brain: import FAILED - " + String(value) }];
  }
  if (value.ok) {
    const d = value.data || {};
    if (d.mode === "preview") {
      const impact = d.impact || {};
      return [
        { type: "text", text: "dsh-project-brain: import PREVIEW" },
        { type: "text", text: "  bundle: " + d.bundlePath },
        { type: "text", text: "  source: " + (d.manifest && d.manifest.sourceProject && d.manifest.sourceProject.rootPath) },
        { type: "text", text: "  current brain: " + (impact.currentBrainExists
          ? `${impact.currentMemories} mem / ${impact.currentTodos} todo / ${impact.currentTimeline} timeline`
          : "(無)") },
        { type: "text", text: "  incoming: " + `${impact.incomingMemories} mem / ${impact.incomingTodos} todo / ${impact.incomingTimeline} timeline` },
        { type: "text", text: "  backup will create: " + (impact.backupWillCreateAt || "(無腦，無需備份)") },
        { type: "text", text: "  rootPath rewrite: " + (impact.rootPathRewrite && impact.rootPathRewrite.from) + " → " + (impact.rootPathRewrite && impact.rootPathRewrite.to) },
        { type: "text", text: "  confirmToken: " + d.confirmToken + " (5 分鐘內傳給 dryRun=false 才會真正執行)" },
      ];
    }
    if (d.mode === "applied") {
      return [
        { type: "text", text: "dsh-project-brain: import APPLIED" },
        { type: "text", text: "  backup: " + (d.backupPath || "(無)") },
        { type: "text", text: "  files restored: " + d.fileCount },
        { type: "text", text: "  " + (d.warning || "") },
      ];
    }
  }
  return [{ type: "text", text: "dsh-project-brain: import FAILED - " + (value.code || "") + ": " + (value.message || "") }];
}
