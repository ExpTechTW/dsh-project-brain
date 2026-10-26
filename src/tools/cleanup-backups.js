// project_cleanup_backups Tool — 清理過期的本地備份

import { defineTool } from "@deepseek-ai/dsh-tools";
import { resolveProjectPath } from "../host/store/path-resolver.js";
import { listBackups, cleanupBackups } from "../host/transfer/backup.js";

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

export function buildCleanupBackupsTool({ fs, sandboxPolicy }) {
  return defineTool({
    name: "project_cleanup_backups",
    description:
      "dsh-project-brain: 清理 .project-brain.backup-<ts>/ 備份目錄。" +
      "兩個策略同時生效：保留最近 N 個（預設 3）+ 刪除超過 X 毫秒的（預設 30 天）。" +
      "建議在每次匯入/回滾後調一次，避免備份無限堆積。",
    parameters: {
      path: { type: "string", description: "專案根路徑（預設從 session cwd 推斷）" },
      keepLast: { type: "number", description: "保留最近幾個（預設 3）" },
      olderThanMs: { type: "number", description: "刪除超過多少毫秒的（預設 30 天 = 2592000000）" },
    },
    output: { schema: baseOutputSchema, render: renderCleanup },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        if (projectPath === ".") {
          return { ok: false, code: "E_NO_PATH", message: "無法解析專案路徑（請顯式傳 path）" };
        }
        const all = await listBackups({ projectPath });
        const result = await cleanupBackups({
          projectPath,
          keepLast: args && typeof args.keepLast === "number" ? args.keepLast : 3,
          olderThanMs: args && typeof args.olderThanMs === "number" ? args.olderThanMs : 30 * 24 * 60 * 60 * 1000,
        });
        return {
          ok: true,
          data: {
            beforeCount: all.length,
            candidates: result.candidates,
            deleted: result.deleted,
            deletedCount: result.deleted.length,
            kept: result.kept,
            keptCount: result.kept.length,
            message: `清理完成：刪除 ${result.deleted.length} 個，保留 ${result.kept.length} 個。`,
          },
        };
      } catch (e) {
        return {
          ok: false,
          code: (e && e.code) || "E_CLEANUP_FAILED",
          message: String((e && e.message) || e),
        };
      }
    },
  });
}

function renderCleanup(_args, value) {
  if (!value || typeof value !== "object") {
    return [{ type: "text", text: "dsh-project-brain: cleanup FAILED - " + String(value) }];
  }
  if (value.ok) {
    const d = value.data || {};
    const lines = [
      { type: "text", text: "dsh-project-brain: cleanup OK" },
      { type: "text", text: `  before: ${d.beforeCount} backups, deleted ${d.deletedCount}, kept ${d.keptCount}` },
    ];
    if (d.deleted && d.deleted.length > 0) {
      for (const p of d.deleted.slice(0, 5)) {
        lines.push({ type: "text", text: "  - " + p });
      }
      if (d.deleted.length > 5) lines.push({ type: "text", text: `  ... and ${d.deleted.length - 5} more` });
    }
    return lines;
  }
  return [{ type: "text", text: "dsh-project-brain: cleanup FAILED - " + (value.code || "") + ": " + (value.message || "") }];
}
