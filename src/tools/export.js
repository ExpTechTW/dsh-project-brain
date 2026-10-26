// project_export Tool — 把當前專案的 .project-brain/ 打成 zip bundle
//
// 輸出：bundle zip 檔案路徑 + manifest 摘要
//
// 用法（典型跨機器同步）：
//   1. 在源機器調 project_export → 拿到 bundlePath
//   2. 使用者把 zip 檔案通過 Git commit / U 盤 / 網盤 / 微信傳到目標機器
//   3. 在目標機器調 project_import 還原

import { defineTool } from "@deepseek-ai/dsh-tools";
import path from "node:path";
import { resolveProjectPath } from "../host/store/path-resolver.js";
import { readJson, brainPath } from "../host/store/brain-files.js";
import { writeBundleFile, defaultBundleName } from "../host/transfer/bundle.js";

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

export function buildProjectExportTool({ fs, sandboxPolicy, pluginVersion }) {
  return defineTool({
    name: "project_export",
    description:
      "dsh-project-brain: 把當前專案的 .project-brain/ 打成 zip bundle（含 manifest.json + checksum）。" +
      "用於跨機器同步：在源機器呼叫 → 把 bundle 檔案傳到目標機器 → 在目標機器調 project_import 還原。" +
      "會備份 timeline + cache；若不需要 cache 可傳 includeCache=false 縮體積。",
    parameters: {
      path: { type: "string", description: "專案根路徑（預設從 session cwd 推斷）" },
      outputPath: { type: "string", description: "bundle 輸出絕對路徑（可選；預設 <projectRoot>/dist-backups/dsh-brain-<name>-<ts>.zip）" },
      includeCache: { type: "boolean", description: "是否包含 cache/ 目錄（預設 true）" },
    },
    output: { schema: baseOutputSchema, render: renderExport },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        if (projectPath === ".") {
          return { ok: false, code: "E_NO_PATH", message: "無法解析專案路徑（請顯式傳 path）" };
        }
        const includeCache = !!(args && args.includeCache !== false);

        // 校驗腦存在
        const projectMeta = await readJson(fs, brainPath(projectPath, "project.json"));
        if (!projectMeta || projectMeta.__error) {
          return { ok: false, code: "E_BRAIN_NOT_FOUND", message: "專案未初始化，請先呼叫 project_init" };
        }

        // 預設輸出路徑：<projectRoot>/dist-backups/dsh-brain-<name>-<ts>.zip
        let outputPath = args && args.outputPath;
        if (!outputPath) {
          const fname = defaultBundleName(projectMeta);
          outputPath = path.join(projectPath, "dist-backups", fname);
        }

        const startMs = Date.now();
        const written = await writeBundleFile({
          projectPath,
          outputPath,
          pluginVersion: pluginVersion || "1.3.1",
          includeCache,
        });

        // 寫 timeline 事件
        try {
          const now = Date.now();
          const event = {
            id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
            title: "匯出 bundle：" + path.basename(outputPath),
            eventType: "export",
            occurredAt: now,
            payload: {
              bundlePath: outputPath,
              sizeBytes: written.sizeBytes,
              fileCount: written.fileCount,
              schemaVersion: written.manifest.schemaVersion,
            },
          };
          const { appendJsonl } = await import("../host/store/brain-files.js");
          await appendJsonl(fs, brainPath(projectPath, "timeline.jsonl"), event);
        } catch (e) { /* timeline 寫入失敗不影響主流程 */ }

        emitPreviewChanged(exec, projectPath);

        return {
          ok: true,
          data: {
            bundlePath: written.bundlePath,
            bundleName: written.bundleName,
            defaultDirPath: written.defaultDirPath,
            sizeBytes: written.sizeBytes,
            fileCount: written.fileCount,
            durationMs: Date.now() - startMs,
            manifest: {
              schemaVersion: written.manifest.schemaVersion,
              pluginVersion: written.manifest.pluginVersion,
              exportedAt: written.manifest.exportedAt,
              sourceProject: written.manifest.sourceProject,
            },
            message: "匯出成功。下一步：把 bundle 檔案傳到目標機器，呼叫 project_import 還原。",
          },
        };
      } catch (e) {
        return {
          ok: false,
          code: (e && e.code) || "E_EXPORT_FAILED",
          message: String((e && e.message) || e),
        };
      }
    },
  });
}

function renderExport(_args, value) {
  if (!value || typeof value !== "object") {
    return [{ type: "text", text: "dsh-project-brain: export FAILED - " + String(value) }];
  }
  if (value.ok) {
    const d = value.data || {};
    const sizeMB = (d.sizeBytes / (1024 * 1024)).toFixed(2);
    return [
      { type: "text", text: "dsh-project-brain: export OK" },
      { type: "text", text: "  bundle: " + d.bundlePath },
      { type: "text", text: "  size: " + sizeMB + " MB (" + d.fileCount + " files, " + d.durationMs + "ms)" },
      { type: "text", text: "  source: " + (d.manifest && d.manifest.sourceProject && d.manifest.sourceProject.rootPath) },
      { type: "text", text: "  schemaVersion: " + (d.manifest && d.manifest.schemaVersion) },
    ];
  }
  return [{ type: "text", text: "dsh-project-brain: export FAILED - " + (value.code || "") + ": " + (value.message || "") }];
}
