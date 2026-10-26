// project_memory_add / project_memory_list Tools
// P0.4 工具面補全：此前 memory 只有 CLI（brain-memory.mjs），Agent 無法在會話內寫入。
// 資料格式與 CLI 一致（memory.jsonl 每行一個 JSON）。

import { defineTool } from "@deepseek-ai/dsh-tools";
import { brainPath, appendJsonl, readJsonl, writeJsonl } from "../host/store/brain-files.js";
import { MEMORY_TYPES, isCoreMemory, isRetrievableMemory, normalizeMemoryType } from "../host/store/brain-logic.js";
import { resolveProjectPath } from "../host/store/path-resolver.js";
import { admitMemory, confirmWithSessionLlm, ensureHousekeepOnRead } from "../host/memory/admit.js";
import { brainTxKey, withWriteLock } from "../host/store/write-lock.js";
import { resolveSessionRoute } from "../host/architecture/analyzer.js";

function emitPreviewChanged(exec, projectPath) {
  try {
    const executor = (exec && exec.ctx) || null;
    if (executor && typeof executor.emit === "function") {
      executor.emit("project_brain/preview.changed", { projectPath: projectPath });
    }
  } catch (e) { /* ignore */ }
}

function executionRoute(exec) {
  if (!exec) return null;
  return resolveSessionRoute(exec.session)
    || resolveSessionRoute(exec.currentSession)
    || resolveSessionRoute(exec.agent && exec.agent.session)
    || resolveSessionRoute(exec.agent)
    || resolveSessionRoute(exec.ctx && exec.ctx.session);
}

function executionSessionId(exec) {
  return exec && (exec.sessionId
    || (exec.session && exec.session.id)
    || (exec.agent && exec.agent.sessionId)
    || (exec.agent && exec.agent.session && exec.agent.session.id)) || null;
}

export function buildMemoryAddTool({ fs, sandboxPolicy, getLlm }) {
  return defineTool({
    name: "project_memory_add",
    description:
      "dsh-project-brain: 寫入一條跨會話仍為真的專案記憶（decision/requirement/architecture/bug/lesson/preference）。" +
      "使用者明確表達的長期協作口徑與工作偏好用 preference。" +
      "不要寫入 changelog、本次改了哪些檔案或會話流水賬；進行中的工作用 project_todo_*。" +
      " content 必須自包含：不要出現「這個/那個/上面說的」這類指代詞，換成它真正指的東西。" +
      " importance 0~1。工具可能因規則或模型確認拒絕，不要改寫成 changelog 再試。",
    parameters: {
      type: { type: "string", description: "記憶型別，列舉：" + MEMORY_TYPES.join(" | ") },
      title: { type: "string", description: "標題（一句話，<=200 字元）" },
      content: { type: "string", description: "正文：what + why（決策需含理由與被否方案）" },
      importance: { type: "number", description: "重要性 0~1，預設 0.5" },
      confidence: { type: "number", description: "可信度 0~1，預設 0.7" },
      relatedFiles: { type: "array", items: { type: "string" }, description: "相關檔案路徑（可選）" },
      tags: { type: "array", items: { type: "string" }, description: "標籤（可選）" },
      path: { type: "string", description: "專案根路徑（預設從 session cwd 推斷）" },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean" },
          data: { type: "object", additionalProperties: true },
          code: { type: "string" },
          message: { type: "string" },
        },
      },
      render: (_args, value) => {
        if (value.ok) {
          const d = value.data || {};
          return [{ type: "text", text: `dsh-project-brain: memory added [${d.type}] ${d.title} (${d.id})` }];
        }
        return [{ type: "text", text: `dsh-project-brain: memory add FAILED - ${value && value.code}: ${value && value.message}` }];
      },
    },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        const type = normalizeMemoryType(args && args.type);
        if (!type) {
          return { ok: false, code: "E_INVALID_TYPE", message: "type 必須是 " + MEMORY_TYPES.join("/") + " 之一" };
        }
        if (!args || !args.title || !String(args.title).trim()) {
          return { ok: false, code: "E_NO_TITLE", message: "title 必填" };
        }
        const now = Date.now();
        const sessionId = executionSessionId(exec);
        const candidate = {
          type: type,
          title: args.title,
          content: args.content,
          importance: args.importance,
          confidence: args.confidence,
          relatedFiles: args.relatedFiles,
          tags: args.tags,
          source: { kind: "agent", ...(sessionId ? { sessionId: String(sessionId) } : {}) },
        };
        const admitted = await admitMemory({
          fs,
          projectPath,
          candidate,
          channel: "automatic",
          now,
          llmConfirm: () => confirmWithSessionLlm({
            llm: getLlm ? getLlm() : null,
            route: executionRoute(exec),
            sessionId,
            candidate,
          }),
        });
        if (!admitted.ok) {
          return {
            ok: false,
            code: admitted.code || "E_ADMIT_REJECTED",
            message: admitted.message || admitted.reason || "memory not admitted",
          };
        }
        if (admitted.action === "insert") {
          const entry = admitted.entry;
          await appendJsonl(fs, brainPath(projectPath, "timeline.jsonl"), {
            id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
            title: "新增記憶[" + entry.type + "]：" + entry.title,
            eventType: "memory",
            occurredAt: now,
          });
          emitPreviewChanged(exec, projectPath);
          return { ok: true, data: { id: entry.id, type: entry.type, title: entry.title, importance: entry.importance, confidence: entry.confidence } };
        }
        emitPreviewChanged(exec, projectPath);
        return { ok: true, data: { id: admitted.id, skipped: true } };
      } catch (e) {
        return { ok: false, code: "E_MEMORY_ADD_FAILED", message: String((e && e.message) || e) };
      }
    },
  });
}

export function buildMemoryListTool({ fs, sandboxPolicy }) {
  return defineTool({
    name: "project_memory_list",
    description:
      "dsh-project-brain: 讀取當前專案的專案記憶，按重要度排序返回（可按 type 過濾）。" +
      "回答“為什麼這麼設計/之前踩過什麼坑”類問題前先呼叫。",
    parameters: {
      type: { type: "string", description: "只看該型別（可選）：" + MEMORY_TYPES.join(" | ") },
      limit: { type: "number", description: "返回條數上限，預設 10" },
      includeArchived: { type: "boolean", description: "是否包含 archived/superseded 記憶，預設 false" },
      layer: { type: "string", description: "active（預設 Core）| dormant | all（active+dormant）" },
      path: { type: "string", description: "專案根路徑（預設從 session cwd 推斷）" },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean" },
          data: { type: "object", additionalProperties: true },
          code: { type: "string" },
          message: { type: "string" },
        },
      },
      render: (_args, value) => {
        if (value.ok) {
          const d = value.data || {};
          const lines = [{ type: "text", text: `dsh-project-brain: ${d.total} memories (${d.shown} shown)` }];
          for (const m of d.memories || []) {
            lines.push({ type: "text", text: `  [${m.type}] ${m.title} (imp=${m.importance})` });
          }
          return lines;
        }
        return [{ type: "text", text: `dsh-project-brain: memory list FAILED - ${value && value.code}: ${value && value.message}` }];
      },
    },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        await ensureHousekeepOnRead(fs, projectPath);
        const memories = await readJsonl(fs, brainPath(projectPath, "memory.jsonl"));
        const layer = args && typeof args.layer === "string" ? String(args.layer).toLowerCase() : "active";
        let visible;
        if (args && args.includeArchived) {
          visible = memories;
        } else if (layer === "dormant") {
          visible = memories.filter((m) => m && m.status === "dormant");
        } else if (layer === "all") {
          visible = memories.filter(isRetrievableMemory);
        } else {
          visible = memories.filter(isCoreMemory);
        }
        const filtered = normalizeMemoryType(args && args.type)
          ? visible.filter((m) => m.type === normalizeMemoryType(args.type))
          : visible;
        const limit = Math.max(1, Math.min(50, Number((args && args.limit) || 10)));
        const sorted = filtered.slice().sort((a, b) => {
          const di = (Number(b.importance) || 0) - (Number(a.importance) || 0);
          if (di !== 0) return di;
          return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
        }).slice(0, limit);
        return {
          ok: true,
          data: {
            total: filtered.length,
            shown: sorted.length,
            memories: sorted.map((m) => ({
              id: m.id, type: m.type, title: m.title,
              content: String(m.content || "").slice(0, 300),
              importance: m.importance, createdAt: m.createdAt,
            })),
          },
        };
      } catch (e) {
        return { ok: false, code: "E_MEMORY_LIST_FAILED", message: String((e && e.message) || e) };
      }
    },
  });
}

// ─── project_memory_archive ───
// 軟刪除一條記憶（status → archived）。isActiveMemory 會過濾掉，injector / retrieval 都不再看到它。
// 但 .project-brain/memory.jsonl 中保留這條記錄，便於追溯。
// 使用場景：使用者/agent 發現記憶錯誤、過時或與現實衝突時主動清理。
export function buildMemoryArchiveTool({ fs, sandboxPolicy }) {
  return defineTool({
    name: "project_memory_archive",
    description:
      "dsh-project-brain: 歸檔一條專案記憶（status → archived，從檢索/注入中移除但保留記錄）。" +
      "用於修正錯誤/過時/與現實衝突的記憶。需傳入 id 字首或精確 id。",
    parameters: {
      id: { type: "string", description: "記憶 id 或其字首（唯一匹配）" },
      reason: { type: "string", description: "歸檔原因（記入 source 欄位用於追溯）" },
      path: { type: "string", description: "專案根路徑（預設從 session cwd 推斷）" },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean" },
          data: { type: "object", additionalProperties: true },
          code: { type: "string" },
          message: { type: "string" },
        },
      },
      render: (_args, value) => {
        if (value.ok) {
          const d = value.data || {};
          return [{ type: "text", text: `dsh-project-brain: memory archived [${d.type}] ${d.title} (${d.id}) reason="${d.reason || "(none)"}"` }];
        }
        return [{ type: "text", text: `dsh-project-brain: memory archive FAILED - ${value && value.code}: ${value && value.message}` }];
      },
    },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        const idPrefix = args && typeof args.id === "string" ? args.id.trim() : "";
        const reason = args && typeof args.reason === "string" ? args.reason.trim().slice(0, 500) : "";
        if (!idPrefix) {
          return { ok: false, code: "E_NO_ID", message: "id 必填" };
        }
        const now = Date.now();
        // 讀整表到寫回之間要獨佔，否則和併發的 admit / 人工編輯互相覆蓋。
        const archived = await withWriteLock(brainTxKey(projectPath, "memory.jsonl"), async () => {
          const memories = await readJsonl(fs, brainPath(projectPath, "memory.jsonl"));
          // 唯一匹配：id 等於或以 prefix 開頭
          const matches = memories.filter((m) => m && m.id && (m.id === idPrefix || m.id.indexOf(idPrefix) === 0) && isRetrievableMemory(m));
          if (matches.length === 0) {
            return { ok: false, code: "E_NOT_FOUND", message: `未找到 id=${idPrefix} 的活躍記憶` };
          }
          if (matches.length > 1) {
            return { ok: false, code: "E_AMBIGUOUS_ID", message: `id=${idPrefix} 匹配到 ${matches.length} 條，請提供更精確的 id` };
          }
          const hit = matches[0];
          const updated = memories.map((m) => {
            if (m.id !== hit.id) return m;
            return Object.assign({}, m, {
              status: "archived",
              updatedAt: now,
              lastAccessedAt: now,
              ...(reason ? { archiveReason: reason } : {}),
            });
          });
          const ok = await writeJsonl(fs, brainPath(projectPath, "memory.jsonl"), updated);
          if (!ok) return { ok: false, code: "E_WRITE_FAILED", message: "failed to write memory.jsonl" };
          return { ok: true, target: hit };
        });
        if (!archived.ok) return archived;
        const target = archived.target;
        // timeline 事件
        await appendJsonl(fs, brainPath(projectPath, "timeline.jsonl"), {
          id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
          title: "歸檔記憶[" + target.type + "]：" + target.title + (reason ? "（" + reason + "）" : ""),
          eventType: "memory_archive",
          occurredAt: now,
          detail: "id=" + target.id + (reason ? " reason=" + reason : ""),
        });
        emitPreviewChanged(exec, projectPath);
        return { ok: true, data: { id: target.id, type: target.type, title: target.title, reason: reason || null } };
      } catch (e) {
        return { ok: false, code: "E_MEMORY_ARCHIVE_FAILED", message: String((e && e.message) || e) };
      }
    },
  });
}

// ─── project_memory_supersede ───
// 用一條新記憶替換一條舊記憶。舊記憶 status → superseded，source.supersededBy 指向新記憶。
// 新記憶正常 append。fingerprint 去重：若已有相同 fingerprint 的記憶，會被去重跳過。
export function buildMemorySupersedeTool({ fs, sandboxPolicy }) {
  return defineTool({
    name: "project_memory_supersede",
    description:
      "dsh-project-brain: 用新記憶替換舊記憶（舊記憶 → superseded，新記憶正常 append）。" +
      "用於決策更新、架構變更等場景。新記憶可由 type/title/content 完整指定。",
    parameters: {
      oldId: { type: "string", description: "被替換的舊記憶 id 或字首" },
      type: { type: "string", description: "新記憶型別（必填）" },
      title: { type: "string", description: "新記憶標題（必填）" },
      content: { type: "string", description: "新記憶正文（必填）" },
      importance: { type: "number", description: "重要性 0~1" },
      confidence: { type: "number", description: "可信度 0~1" },
      relatedFiles: { type: "array", items: { type: "string" }, description: "相關檔案路徑" },
      tags: { type: "array", items: { type: "string" }, description: "標籤" },
      reason: { type: "string", description: "替換原因（寫入舊記憶的 supersededReason）" },
      path: { type: "string", description: "專案根路徑（預設從 session cwd 推斷）" },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean" },
          data: { type: "object", additionalProperties: true },
          code: { type: "string" },
          message: { type: "string" },
        },
      },
      render: (_args, value) => {
        if (value.ok) {
          const d = value.data || {};
          return [{ type: "text", text: `dsh-project-brain: memory superseded ${d.oldId} → ${d.newId} reason="${d.reason || "(none)"}"` }];
        }
        return [{ type: "text", text: `dsh-project-brain: memory supersede FAILED - ${value && value.code}: ${value && value.message}` }];
      },
    },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        const oldId = args && typeof args.oldId === "string" ? args.oldId.trim() : "";
        const type = normalizeMemoryType(args && args.type);
        const title = args && typeof args.title === "string" ? args.title.trim() : "";
        const content = args && typeof args.content === "string" ? args.content : "";
        if (!oldId) return { ok: false, code: "E_NO_OLD_ID", message: "oldId 必填" };
        if (!type) return { ok: false, code: "E_INVALID_TYPE", message: "type 必須是 " + MEMORY_TYPES.join("/") + " 之一" };
        if (!title) return { ok: false, code: "E_NO_TITLE", message: "title 必填" };
        if (!content || String(content).length < 20) return { ok: false, code: "E_NO_CONTENT", message: "content 必填且 ≥ 20 字" };
        const reason = args && typeof args.reason === "string" ? args.reason.trim().slice(0, 500) : "";
        const memories = await readJsonl(fs, brainPath(projectPath, "memory.jsonl"));
        const matches = memories.filter((m) => m && m.id && (m.id === oldId || m.id.indexOf(oldId) === 0) && isRetrievableMemory(m));
        if (matches.length === 0) return { ok: false, code: "E_OLD_NOT_FOUND", message: `未找到 id=${oldId} 的可檢索記憶` };
        if (matches.length > 1) return { ok: false, code: "E_AMBIGUOUS_ID", message: `oldId=${oldId} 匹配到 ${matches.length} 條，請提供更精確的 id` };
        const oldTarget = matches[0];
        const now = Date.now();
        const sessionId = executionSessionId(exec);
        const candidate = {
          type, title, content,
          importance: args.importance,
          confidence: args.confidence,
          relatedFiles: args.relatedFiles,
          tags: args.tags,
          source: { kind: "agent", ...(sessionId ? { sessionId: String(sessionId) } : {}), supersedes: oldTarget.id },
          supersedes: oldTarget.id,
        };
        const admitted = await admitMemory({
          fs,
          projectPath,
          candidate,
          channel: "automatic",
          now,
          llmConfirm: { admit: true, supersedes: oldTarget.id, type },
        });
        if (!admitted.ok) {
          return { ok: false, code: admitted.code || "E_ADMIT_REJECTED", message: admitted.message || admitted.reason || "supersede not admitted" };
        }
        const newEntry = admitted.entry || { id: admitted.id, type, title };
        if (reason && admitted.action === "insert") {
          // 這是整表重寫，必須獨佔。admitMemory 此時已經釋放了鎖，不會重入；
          // 不加鎖的話，讀到寫之間任何併發 append 的新記憶都會被整片吞掉。
          await withWriteLock(brainTxKey(projectPath, "memory.jsonl"), async () => {
            const latest = await readJsonl(fs, brainPath(projectPath, "memory.jsonl"));
            const withReason = latest.map((m) => {
              if (m.id !== oldTarget.id) return m;
              return Object.assign({}, m, { supersededReason: reason, supersededBy: newEntry.id });
            });
            return writeJsonl(fs, brainPath(projectPath, "memory.jsonl"), withReason);
          });
        }
        await appendJsonl(fs, brainPath(projectPath, "timeline.jsonl"), {
          id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
          title: "替換記憶[" + oldTarget.type + "→" + newEntry.type + "]：" + newEntry.title + (reason ? "（" + reason + "）" : ""),
          eventType: "memory_supersede",
          occurredAt: now,
          detail: "oldId=" + oldTarget.id + " newId=" + newEntry.id + (reason ? " reason=" + reason : ""),
        });
        emitPreviewChanged(exec, projectPath);
        return { ok: true, data: { oldId: oldTarget.id, newId: newEntry.id, type: newEntry.type, title: newEntry.title, reason: reason || null } };
      } catch (e) {
        return { ok: false, code: "E_MEMORY_SUPERSEDE_FAILED", message: String((e && e.message) || e) };
      }
    },
  });
}
