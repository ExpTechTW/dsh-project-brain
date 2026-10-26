// scan-and-write.js
//
// 從 tools.js 拆出的純邏輯層：掃描專案 + 寫入 .project-brain/ 目錄 + 調架構分析。
// **不依賴 @deepseek-ai/dsh-tools**，可被 smoke 測試和純 Node 指令碼直接 import，
// 不被 DSH 工具 runtime 拖入。
//
// 設計動機（v0.7.0-beta.3 release-fix）：
//   舊實現把 scanAndWrite 與 defineTool 混在 src/tools.js 裡，導致：
//     - src/host/summarizer.js / src/host/rpc/sidebar.js / scripts/smoke-*.mjs
//       任何 import scanAndWrite 的位置都會傳遞拉起 @deepseek-ai/dsh-tools，
//       在乾淨 node 環境（沒裝 optional peer）下整樹 ERR_MODULE_NOT_FOUND。
//   拆分後 tools.js 只保留 DSH tool 適配層（執行時必須），純邏輯下沉到這裡。
//
// 行為與原 tools.js 完全一致：相同的入參/出參/錯誤碼，呼叫方零改動。

import { sanitizeProjectDescription, scanProject } from "../scanner.js";
import { assertSafeProjectPath, brainPath, readJson, writeJson, appendJsonl } from "./store/brain-files.js";
import { makeId } from "./store/brain-logic.js";
import { buildArchitecture, resolveSessionRoute } from "./architecture/analyzer.js";

// 拿一個寬鬆的沙箱 policy（fs.writeText 第 5 引數）
// P0.4.4 修復：之前用 mode 'workspace-write' 仍然限制在 workspaceRoot
// (外掛 fiber 啟動時 = dsh-project-brain 自身目錄，不隨 session 切換)。
// 改用 mode 'danger-full-access' 完全跳過檔案路徑限制（參考 DSH sandbox 文件：
// "danger-full-access bypasses confinement"）。
// 安全邊界：Host 服務需要跨動態 workspace 寫入，因此底層 policy 必須放寬；應用層
// 始終讓 live Session cwd 優先，並由 assertSafeProjectPath + brainPath 把目標限制到
// 已解析專案的 .project-brain/，拒絕缺失路徑、檔案系統根目錄和路徑逃逸。
export function resolveWritePolicy(sandboxPolicy) {
  if (!sandboxPolicy) return null;
  try {
    if (typeof sandboxPolicy.resolve === "function") {
      return sandboxPolicy.resolve({ mode: "danger-full-access" });
    }
  } catch (e) { /* fallthrough */ }
  return sandboxPolicy;
}

// 只改 project.json 的架構過期標記，不重掃、不碰 architecture.json。
// 用於「觸發檔案變了，但這次架構重新整理沒跑成」——此時舊泳道不能再當真理。
export async function markArchitectureStale(fs, sandboxPolicy, projectPath, stale) {
  try {
    assertSafeProjectPath(projectPath);
    const target = brainPath(projectPath, "project.json");
    const project = await readJson(fs, target);
    if (!project || project.__error) return false;
    if (Boolean(project.architectureStale) === Boolean(stale)) return true;
    project.architectureStale = Boolean(stale);
    project.updatedAt = Date.now();
    return Boolean(await writeJson(fs, target, project, resolveWritePolicy(sandboxPolicy)));
  } catch (e) {
    return false;
  }
}

export function emitPreviewChanged(exec, projectPath) {
  try {
    const executor = (exec && exec.ctx) || null;
    if (executor && typeof executor.emit === "function") {
      executor.emit("project_brain/preview.changed", { projectPath: projectPath });
    }
  } catch (e) { /* ignore */ }
}

// 共享掃描 + 寫入邏輯（被 project_init / project_rescan tool 與 rescan RPC 共用）
export async function scanAndWrite(fs, sandboxPolicy, args, toolLabel, runtime = {}) {
  const startMs = Date.now();
  // P0.4.2 修復：path 必傳（不傳直接 fail）。
  // 原先 fallback 到 process.cwd() 會掃到 DSH Desktop 安裝目錄。
  const explicit = (args && typeof args.path === "string" && args.path.trim()) ? args.path.trim() : null;
  if (!explicit) {
    return {
      ok: false,
      data: {
        error: { code: "E_NO_PATH", message: "path 引數必傳（不傳會掃到 DSH Desktop 安裝目錄）" },
        scanDurationMs: Date.now() - startMs,
      },
    };
  }
  let projectPath;
  try {
    projectPath = assertSafeProjectPath(explicit);
  } catch (error) {
    return {
      ok: false,
      data: { error: { code: error.code || "E_UNSAFE_PROJECT_PATH", message: String(error.message || error) }, scanDurationMs: Date.now() - startMs },
    };
  }
  const dryRun = Boolean(args && args.dryRun);

  let scan;
  try {
    scan = await scanProject(fs, projectPath);
  } catch (e) {
    return {
      ok: false,
      data: {
        error: { code: "E_SCAN_FAILED", message: String((e && e.message) || e) },
        scanDurationMs: Date.now() - startMs,
      },
    };
  }

  let existing;
  try {
    existing = await readJson(fs, brainPath(projectPath, "project.json"));
  } catch (e) {
    existing = null;
  }
  const isRescan = Boolean(existing && existing.id);

  let previousArchitecture = null;
  try {
    previousArchitecture = await readJson(fs, brainPath(projectPath, "architecture.json"));
  } catch (e) {}
  const architectureConfig = runtime.getMemoryConfig ? runtime.getMemoryConfig() : {};
  const architectureMode = (runtime && runtime.architectureMode) || "full";
  const skipArchitecture = architectureMode === "light" || architectureMode === "none";

  let architecture = null;
  if (!skipArchitecture && architectureConfig.architectureEnabled !== false) {
    try {
      architecture = await buildArchitecture({
        fs,
        projectPath,
        scan,
        previous: previousArchitecture && !previousArchitecture.__error ? previousArchitecture : null,
        config: architectureConfig,
        llm: runtime.getLlm ? runtime.getLlm() : null,
        route: runtime.llmRoute || null,
        getRoute: runtime.getLlmRoute || null,
        sessionId: runtime.sessionId || null,
      });
    } catch (e) {
      architecture = { error: { code: e.code || "ARCHITECTURE_FAILED", message: String((e && e.message) || e) } };
    }
  }

  const now = Date.now();
  const projectName = scan.projectName || projectPath.split(/[\\/]/).filter(Boolean).pop() || "untitled";
  const existingDescription = sanitizeProjectDescription(existing && existing.description);
  const scannedDescription = sanitizeProjectDescription(scan.description);
  const projectData = {
    id: isRescan ? existing.id : makeId("brain", now),
    name: projectName,
    rootPath: projectPath,
    description: (existingDescription && existingDescription !== "Auto-generated by dsh-project-brain")
      ? existingDescription
      : (scannedDescription || "Auto-generated by dsh-project-brain"),
    techStack: scan.techStack,
    stack: scan.stack || {},
    structure: scan.structure || [],
    languages: scan.languages,
    tooling: scan.tooling || [],
    size: { files: scan.fileCount },
    entrypoints: scan.entrypoints,
    topLevel: scan.topLevel,
    directoryMap: (existing && existing.directoryMap) || [],
    createdAt: isRescan ? existing.createdAt : now,
    updatedAt: now,
    lastScannedAt: now,
    architectureStale: skipArchitecture
      ? Boolean(existing && existing.architectureStale)
      : Boolean(architecture && architecture.error),
  };

  if (!dryRun) {
    // P0.4.2 修復：顯式拿 workspace-write policy，傳給 fs.writeText 第 5 引數。
    const writePolicy = resolveWritePolicy(sandboxPolicy);
    const wroteProject = await writeJson(fs, brainPath(projectPath, "project.json"), projectData, writePolicy);
    if (!wroteProject) {
      return {
        ok: false,
        data: {
          error: { code: "E_WRITE_FAILED", message: "failed to write " + brainPath(projectPath, "project.json") + "（可能是 sandbox 拒絕）" },
          scanDurationMs: Date.now() - startMs,
        },
      };
    }
    if (architecture && !architecture.error) {
      const wroteArchitecture = await writeJson(fs, brainPath(projectPath, "architecture.json"), architecture, writePolicy);
      if (!wroteArchitecture) {
        architecture = { error: { code: "ARCHITECTURE_WRITE_FAILED", message: "架構資料寫入失敗，專案基礎掃描仍已完成" } };
      }
    }
    try {
      await appendJsonl(fs, brainPath(projectPath, "timeline.jsonl"), {
        id: makeId("evt", now),
        title: isRescan ? "完成重掃（" + toolLabel + "）" : "完成 project_init 掃描",
        eventType: isRescan ? "rescan" : "init",
        occurredAt: now,
        architectureMode: architectureMode,
        sessionId: runtime.sessionId || null,
        triggerFiles: Array.isArray(runtime.triggerFiles) ? runtime.triggerFiles.slice(0, 20) : undefined,
        detail: "languages=" + (Object.keys(scan.languages).join("/") || "none") + " files=" + scan.fileCount +
          " architectureMode=" + architectureMode +
          (architecture && !architecture.error ? " modules=" + architecture.stats.modules + " edges=" + architecture.stats.edges + " architecture=" + architecture.source : ""),
      }, writePolicy);
    } catch (e) {
      // timeline 寫入失敗不阻塞整體成功
    }
  }

  return {
    ok: true,
    data: {
      projectId: projectData.id,
      name: projectName,
      isRescan: isRescan,
      createdAtPreserved: isRescan,
      scanDurationMs: Date.now() - startMs,
      stats: {
        files: scan.fileCount,
        languages: scan.languages,
        techStack: scan.techStack,
        stack: scan.stack || {},
        structure: scan.structure || [],
        tooling: scan.tooling || [],
        entrypoints: scan.entrypoints,
        topLevel: scan.topLevel,
      },
      partial: Boolean(architecture && architecture.error),
      architecture: architecture && !architecture.error ? {
        generated: true,
        changed: architecture.changed,
        version: architecture.version,
        source: architecture.source,
        modules: architecture.stats.modules,
        edges: architecture.stats.edges,
        llm: architecture.llm,
      } : {
        generated: false,
        error: architecture && architecture.error ? architecture.error : null,
      },
      dryRun: dryRun,
    },
  };
}
