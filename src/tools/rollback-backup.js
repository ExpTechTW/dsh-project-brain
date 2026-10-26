// project_rollback_backup Tool — 從本地 .project-brain.backup-<ts>/ 回滾
//
// 與 import 不同：本操作只讀本機備份，不需 bundle 檔案。
// 流程（dryRun → apply 兩步機制）：
//   1. dryRun=true  → 校驗 backup 存在 → 讀取元資訊 → 發放 confirmToken
//   2. UI 顯示預覽（source / 當前腦 / pre-rollback backup 路徑）
//   3. dryRun=false + confirmToken → 備份當前腦 → 還原 backup → 觸發 rescan

import { defineTool } from "@deepseek-ai/dsh-tools";
import { resolveProjectPath } from "../host/store/path-resolver.js";
import { appendJsonl } from "../host/store/brain-files.js";
import { brainPath } from "../host/store/brain-files.js";
import {
  previewRollback,
  applyRollback,
} from "../host/transfer/backup.js";
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

export function buildRollbackBackupTool({ fs, sandboxPolicy }) {
  return defineTool({
    name: "project_rollback_backup",
    description:
      "dsh-project-brain: 把當前腦回滾到指定的 .project-brain.backup-<ts>/ 備份。" +
      "**兩步機制**：先 dryRun=true 拿 confirmToken，再 dryRun=false + token 真正執行。" +
      "回滾前會先把當前腦再備份一次（形成完整歷史鏈），無需傳 bundle 檔案。",
    parameters: {
      path: { type: "string", description: "專案根路徑（預設從 session cwd 推斷）" },
      backupTimestamp: { type: "string", description: "備份時間戳，格式 yyyymmdd-hhmmss-mmm（如 20260915-143022-345；舊備份 hhmm-mmm 仍可用）" },
      dryRun: { type: "boolean", description: "true=僅預覽（預設 false）" },
      confirmToken: { type: "string", description: "dryRun 返回的 token；dryRun=false 時必填" },
    },
    output: { schema: baseOutputSchema, render: renderRollback },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        if (projectPath === ".") {
          return { ok: false, code: "E_NO_PATH", message: "無法解析專案路徑（請顯式傳 path）" };
        }
        const backupTimestamp = args && args.backupTimestamp;
        if (!backupTimestamp) {
          return { ok: false, code: "E_BACKUP_TIMESTAMP_REQUIRED", message: "backupTimestamp 必填（yyyymmdd-hhmmss-mmm）" };
        }

        const isDryRun = !!(args && args.dryRun);
        const tokenStore = getTokenStore();

        if (isDryRun) {
          let preview;
          try {
            preview = await previewRollback({ projectPath, backupTimestamp });
          } catch (e) {
            return {
              ok: false,
              code: (e && e.code) || "E_BACKUP_INVALID",
              message: String((e && e.message) || e),
            };
          }
          const confirmToken = tokenStore.issue({
            kind: "rollback",
            payload: { projectPath, backupTimestamp },
          });
          return {
            ok: true,
            data: {
              mode: "preview",
              backupTimestamp,
              sourceBackup: preview.sourceBackup,
              currentBrain: preview.currentBrain,
              willBackupCurrentTo: preview.willBackupCurrentTo,
              confirmToken,
              warning: preview.currentBrain && preview.currentBrain.exists
                ? "回滾前會先把當前腦備份到 " + preview.willBackupCurrentTo + "，可繼續回滾。"
                : "當前腦不存在，回滾後會成為當前腦。",
            },
          };
        }

        // Apply
        const token = args && args.confirmToken;
        if (!token) {
          return { ok: false, code: "E_CONFIRM_TOKEN_REQUIRED", message: "dryRun=false 必須傳 confirmToken（先 dryRun=true 拿到 token）" };
        }
        const payload = tokenStore.consume(token, { kind: "rollback" });
        if (!payload) {
          return { ok: false, code: "E_CONFIRM_TOKEN_MISMATCH", message: "confirmToken 無效、已過期或型別不匹配（請重新 dryRun）" };
        }
        if (payload.projectPath !== projectPath || payload.backupTimestamp !== backupTimestamp) {
          return { ok: false, code: "E_CONFIRM_TOKEN_MISMATCH", message: "confirmToken 與當前引數不匹配（請重新 dryRun）" };
        }

        let applied;
        try {
          applied = await applyRollback({ projectPath, backupTimestamp, triggerRescan: false });
        } catch (e) {
          return {
            ok: false,
            code: (e && e.code) || "E_ROLLBACK_FAILED",
            message: String((e && e.message) || e),
          };
        }

        // timeline
        try {
          const now = Date.now();
          const event = {
            id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
            title: "回滾到備份 " + backupTimestamp,
            eventType: "rollback",
            occurredAt: now,
            payload: {
              restoredFrom: applied.restoredFrom,
              preRollbackBackupPath: applied.preRollbackBackupPath,
            },
          };
          await appendJsonl(fs, brainPath(projectPath, "timeline.jsonl"), event);
        } catch (e) {}

        emitPreviewChanged(exec, projectPath);

        return {
          ok: true,
          data: {
            mode: "applied",
            backupTimestamp,
            restoredFrom: applied.restoredFrom,
            preRollbackBackupPath: applied.preRollbackBackupPath,
            rescanTriggered: false,
            warning: "回滾完成。建議手動調 project_rescan 重新整理架構與統計。",
          },
        };
      } catch (e) {
        return {
          ok: false,
          code: (e && e.code) || "E_ROLLBACK_FAILED",
          message: String((e && e.message) || e),
        };
      }
    },
  });
}

function renderRollback(_args, value) {
  if (!value || typeof value !== "object") {
    return [{ type: "text", text: "dsh-project-brain: rollback FAILED - " + String(value) }];
  }
  if (value.ok) {
    const d = value.data || {};
    if (d.mode === "preview") {
      const sb = d.sourceBackup || {};
      const cb = d.currentBrain || {};
      return [
        { type: "text", text: "dsh-project-brain: rollback PREVIEW" },
        { type: "text", text: `  source backup: ${sb.backupName} (${sb.sizeBytes} bytes, ${sb.memCount} mem / ${sb.todoCount} todo / ${sb.timelineCount} timeline)` },
        { type: "text", text: `  current brain: ${cb.exists
          ? `${cb.memCount} mem / ${cb.todoCount} todo / ${cb.timelineCount} timeline`
          : "(無)"}` },
        { type: "text", text: "  pre-rollback backup: " + (d.willBackupCurrentTo || "(無需)") },
        { type: "text", text: "  confirmToken: " + d.confirmToken + " (5 分鐘內傳給 dryRun=false)" },
      ];
    }
    if (d.mode === "applied") {
      return [
        { type: "text", text: "dsh-project-brain: rollback APPLIED" },
        { type: "text", text: "  restored from: " + d.restoredFrom },
        { type: "text", text: "  pre-rollback backup: " + (d.preRollbackBackupPath || "(無)") },
        { type: "text", text: "  " + (d.warning || "") },
      ];
    }
  }
  return [{ type: "text", text: "dsh-project-brain: rollback FAILED - " + (value.code || "") + ": " + (value.message || "") }];
}
