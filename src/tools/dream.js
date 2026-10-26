// project_dream Tool — 記憶整理。
//   mode=light：歸檔 changelog 體裁、超額 Core 降 dormant、報告標題相似建議。
//   mode=full ：在 light 的基礎上再做一次 vacuum，把過期的歸檔行與舊時間線
//               搬到 .project-brain/archive/，讓主檔案真的變小。
// 兩種模式都禁止 Jaccard merge-and-drop，也都不做不可恢復的刪除。

import { defineTool } from "@deepseek-ai/dsh-tools";
import { brainPath, readJsonl } from "../host/store/brain-files.js";
import { housekeepMemories, persistHousekeep } from "../host/memory/admit.js";
import { vacuumBrain } from "../host/memory/vacuum.js";
import { resolveProjectPath } from "../host/store/path-resolver.js";

const baseOutputSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
  },
};

export function buildDreamTool({ fs, sandboxPolicy, getMemoryConfig }) {
  return defineTool({
    name: "project_dream",
    description:
      "dsh-project-brain: 整理記憶（歸檔 changelog 體裁、超額 Core 降為 dormant、報告標題相似建議）。" +
      "預設 dryRun=true；dryRun=false 時只應用歸檔與休眠，絕不因標題相似刪除。" +
      "mode=full 額外做一次 vacuum：把超期的歸檔記憶與舊時間線搬到 .project-brain/archive/，" +
      "主檔案變小但資料仍可找回；活躍記憶、置頂、證據鏈引用與第一屏依賴的錨點都不會被搬走。",
    parameters: {
      mode: { type: "string", description: "light（預設，只整理狀態）或 full（額外 vacuum 主檔案）" },
      dryRun: { type: "boolean", description: "只返回計劃（預設 true）" },
      path: { type: "string", description: "專案根路徑（預設從 session cwd 推斷）" },
    },
    output: { schema: baseOutputSchema, render: (_args, value) => renderDream(value) },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        const mode = (args && args.mode) || "light";
        const dryRun = args && args.dryRun !== false;
        if (mode !== "light" && mode !== "full") {
          return { ok: true, data: { mode, plannedActions: [], note: "mode 僅支援 light / full（" + mode + " 未實現）" } };
        }

        const memories = await readJsonl(fs, brainPath(projectPath, "memory.jsonl"));
        const now = Date.now();
        const computed = housekeepMemories(memories, { now, pinnedIds: [] });
        const plannedActions = computed.actions || [];
        const archiveCount = plannedActions.filter((a) => a.action === "archive_rule").length;
        const evictCount = plannedActions.filter((a) => a.action === "evict_to_dormant").length;
        const suggestCount = plannedActions.filter((a) => a.action === "suggest_supersede").length;

        const memoryConfig = getMemoryConfig ? getMemoryConfig() : {};
        // full 模式先算一遍 vacuum 計劃，dryRun 時也要讓使用者看到會搬走多少。
        const vacuumPlanned = mode === "full"
          ? await vacuumBrain({ fs, projectPath, config: memoryConfig, now, dryRun: true })
          : null;

        if (dryRun) {
          return {
            ok: true,
            data: {
              mode,
              dryRun: true,
              scannedMemories: memories.length,
              plannedActions,
              ...(vacuumPlanned ? { vacuum: vacuumPlanned.plan } : {}),
              summary: {
                archiveCandidates: archiveCount,
                evictCandidates: evictCount,
                suggestSupersede: suggestCount,
                mergeCandidates: 0,
                vacuumCandidates: vacuumPlanned ? vacuumPlanned.plan.totalEvicted : 0,
                estimatedMs: 0,
              },
              note: mode === "full"
                ? "dryRun=true，未寫檔案；commit 會應用 archive_rule / evict_to_dormant，並把超期死行搬到 archive/。"
                : "dryRun=true，未寫檔案；commit 只應用 archive_rule / evict_to_dormant，不會 Jaccard 刪除。",
            },
          };
        }

        const persisted = await persistHousekeep(fs, projectPath, { now, pinnedIds: [], writeTimeline: computed.changed });
        if (!persisted.ok && persisted.code === "E_NOT_INITIALIZED") {
          return { ok: false, data: { error: { code: "E_NOT_INITIALIZED", message: "project not initialized" } } };
        }
        if (!persisted.ok && persisted.code === "E_WRITE_FAILED") {
          return { ok: false, data: { error: { code: "E_DREAM_WRITE_FAILED", message: "write memory.jsonl failed" } } };
        }

        // vacuum 必須在 housekeep 落盤之後跑：housekeep 可能剛把一批記憶標成 archived，
        // 這一輪才知道它們夠不夠老。
        let vacuum = null;
        if (mode === "full") {
          vacuum = await vacuumBrain({ fs, projectPath, config: memoryConfig, now, dryRun: false });
          if (!vacuum.ok) {
            return { ok: false, data: { error: { code: vacuum.code || "E_VACUUM_FAILED", message: "vacuum 未能完成，主檔案保持原樣" } } };
          }
        }

        try {
          if (exec && exec.ctx && typeof exec.ctx.emit === "function") {
            exec.ctx.emit("project_brain/preview.changed", { projectPath });
          }
        } catch (e) {}

        const vacuumNote = vacuum && vacuum.changed
          ? " vacuum 搬走 " + vacuum.plan.totalEvicted + " 行到 archive/。"
          : (mode === "full" ? " 沒有超期的死行需要搬走。" : "");

        return {
          ok: true,
          data: {
            mode,
            dryRun: false,
            scannedMemories: memories.length,
            plannedActions,
            ...(vacuum ? { vacuum: vacuum.plan, archives: vacuum.archives } : {}),
            committed: {
              beforeCount: memories.length,
              afterCount: (persisted.rows || memories).length,
              archived: archiveCount,
              evicted: evictCount,
              vacuumed: vacuum ? vacuum.plan.totalEvicted : 0,
            },
            summary: {
              archiveCandidates: archiveCount,
              evictCandidates: evictCount,
              suggestSupersede: suggestCount,
              mergeCandidates: 0,
              vacuumCandidates: vacuum ? vacuum.plan.totalEvicted : 0,
              estimatedMs: Date.now() - now,
            },
            note: (persisted.changed
              ? "housekeep 已寫 memory.jsonl；相似標題僅作為 suggest_supersede。"
              : "housekeep 無變化，未寫檔案。") + vacuumNote,
          },
        };
      } catch (e) {
        return { ok: false, data: { error: { code: "E_DREAM_FAILED", message: String((e && e.message) || e) } } };
      }
    },
  });
}

function renderDream(value) {
  if (!value || typeof value !== "object") return [{ type: "text", text: "dsh-project-brain: dream FAILED - " + String(value) }];
  if (value.ok) {
    const d = value.data || {};
    const lines = [{ type: "text", text: `dsh-project-brain: dream (${d.mode}) — scanned ${d.scannedMemories} memories, dryRun=${d.dryRun}` }];
    if (d.summary) {
      lines.push({ type: "text", text: `  archive: ${d.summary.archiveCandidates || 0}, evict: ${d.summary.evictCandidates || 0}, suggest: ${d.summary.suggestSupersede || 0}` });
    }
    for (const a of (d.plannedActions || []).slice(0, 10)) {
      if (a.action === "archive_rule") lines.push({ type: "text", text: `  [archive_rule] ${a.id} (${a.title})` });
      else if (a.action === "evict_to_dormant") lines.push({ type: "text", text: `  [dormant] ${a.id} (${a.title})` });
      else if (a.action === "suggest_supersede") lines.push({ type: "text", text: `  [suggest_supersede] ${(a.titles || []).join(" ≈ ")}` });
    }
    if (d.vacuum) {
      lines.push({ type: "text", text: `  vacuum: memory ${d.vacuum.memory.evicted}/${d.vacuum.memory.dead} dead rows, timeline ${d.vacuum.timeline.evicted}/${d.vacuum.timeline.total} events` });
    }
    for (const a of d.archives || []) {
      lines.push({ type: "text", text: `  [archived-to] ${a.path} (${a.rows} rows)` });
    }
    if (d.committed) {
      lines.push({ type: "text", text: `  ✓ ${d.committed.beforeCount} -> ${d.committed.afterCount} memories` });
    }
    if (d.note) lines.push({ type: "text", text: `  note: ${d.note}` });
    return lines;
  }
  if (value.data && value.data.error) return [{ type: "text", text: "dsh-project-brain: dream FAILED - " + value.data.error.code + ": " + value.data.error.message }];
  return [{ type: "text", text: "dsh-project-brain: dream FAILED - " + JSON.stringify(value) }];
}
