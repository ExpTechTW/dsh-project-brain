// project_todo_add / project_todo_list / project_todo_done Tools
// P0.7-lite 工具面：TODO CRUD（add/list/done），資料在 .project-brain/todo.jsonl。
// SidebarPreview 的 Phase 進度與 Stats 待辦數由 build.js 從 todo.jsonl 統計（build-time embed）。

import { defineTool } from "@deepseek-ai/dsh-tools";
import { brainPath, appendJsonl, readJsonl, writeText, serializeJsonl } from "../host/store/brain-files.js";
import { TODO_PRIORITIES, TODO_STATUSES, makeTodoEntry, activeTodos, todoStats, findTodo, normalizePriority, normalizeStatus } from "../host/store/brain-logic.js";
import { resolveProjectPath } from "../host/store/path-resolver.js";

function emitPreviewChanged(exec, projectPath) {
  try {
    const executor = (exec && exec.ctx) || null;
    if (executor && typeof executor.emit === "function") {
      executor.emit("project_brain/preview.changed", { projectPath: projectPath });
    }
  } catch (e) { /* ignore */ }
}

export function buildTodoAddTool({ fs, sandboxPolicy }) {
  return defineTool({
    name: "project_todo_add",
    description:
      "dsh-project-brain: 為當前專案新增一條開發待辦（寫入 .project-brain/todo.jsonl）。" +
      "規劃出下一步任務、或使用者提出新需求時呼叫；完成時用 project_todo_done 關閉。",
    parameters: {
      title: { type: "string", description: "待辦標題（一句話）" },
      description: { type: "string", description: "詳情（可選）" },
      priority: { type: "string", description: "優先順序：urgent | high | medium（預設） | low" },
      relatedFiles: { type: "array", items: { type: "string" }, description: "相關檔案（可選）" },
      path: { type: "string", description: "專案根路徑（預設從 session cwd 推斷；不傳會用當前工作區）" },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean" },
          data: { type: "object", additionalProperties: true },
        },
      },
      render: (_args, value) => {
        if (value.ok) {
          const d = value.data || {};
          return [{ type: "text", text: `dsh-project-brain: todo added [${d.priority}] ${d.title} (${d.id})，活躍待辦 ${d.activeCount}` }];
        }
        return [{ type: "text", text: `dsh-project-brain: todo add FAILED - ${value && value.code}: ${value && value.message}` }];
      },
    },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        if (!args || !args.title || !String(args.title).trim()) {
          return { ok: false, code: "E_NO_TITLE", message: "title 必填" };
        }
        const now = Date.now();
        const entry = makeTodoEntry({ title: args.title, description: args.description, priority: args.priority, relatedFiles: args.relatedFiles }, now);
        const wrote = await appendJsonl(fs, brainPath(projectPath, "todo.jsonl"), entry);
        if (!wrote) return { ok: false, code: "E_WRITE_FAILED", message: "failed to write todo.jsonl" };
        await appendJsonl(fs, brainPath(projectPath, "timeline.jsonl"), {
          id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
          title: "新增待辦：" + entry.title,
          eventType: "todo",
          occurredAt: now,
        });
        emitPreviewChanged(exec, projectPath);
        const todos = await readJsonl(fs, brainPath(projectPath, "todo.jsonl"));
        return { ok: true, data: { id: entry.id, title: entry.title, priority: entry.priority, activeCount: todoStats(todos).pendingTodos } };
      } catch (e) {
        return { ok: false, code: "E_TODO_ADD_FAILED", message: String((e && e.message) || e) };
      }
    },
  });
}

export function buildTodoListTool({ fs, sandboxPolicy }) {
  return defineTool({
    name: "project_todo_list",
    description:
      "dsh-project-brain: 讀取當前專案待辦列表（預設活躍項，按優先順序排序）。" +
      "恢復開發上下文、確定下一步時呼叫。",
    parameters: {
      status: { type: "string", description: "過濾狀態（可選）：pending | in_progress | blocked | done | cancelled | all（預設活躍項）" },
      limit: { type: "number", description: "返回條數上限，預設 20" },
      path: { type: "string", description: "專案根路徑（預設從 session cwd 推斷）" },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean" },
          data: { type: "object", additionalProperties: true },
        },
      },
      render: (_args, value) => {
        if (value.ok) {
          const d = value.data || {};
          const lines = [{ type: "text", text: `dsh-project-brain: todos - ${d.active} active / ${d.done} done` }];
          for (const t of d.todos || []) {
            lines.push({ type: "text", text: `  [${t.priority}/${t.status}] ${t.title} (${t.id})` });
          }
          return lines;
        }
        return [{ type: "text", text: `dsh-project-brain: todo list FAILED - ${value && value.code}: ${value && value.message}` }];
      },
    },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        const todos = await readJsonl(fs, brainPath(projectPath, "todo.jsonl"));
        const stats = todoStats(todos);
        const statusFilter = normalizeStatus(args && args.status);
        const wantAll = args && args.status === "all";
        let list;
        if (wantAll || statusFilter) {
          list = todos.filter((t) => (wantAll ? true : t.status === statusFilter));
          list.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
        } else {
          list = activeTodos(todos);
        }
        const limit = Math.max(1, Math.min(100, Number((args && args.limit) || 20)));
        return {
          ok: true,
          data: {
            active: stats.pendingTodos,
            done: stats.completedTodos,
            total: stats.total,
            todos: list.slice(0, limit).map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, updatedAt: t.updatedAt })),
          },
        };
      } catch (e) {
        return { ok: false, code: "E_TODO_LIST_FAILED", message: String((e && e.message) || e) };
      }
    },
  });
}

export function buildTodoDoneTool({ fs, sandboxPolicy }) {
  return defineTool({
    name: "project_todo_done",
    description:
      "dsh-project-brain: 關閉一條待辦（status -> done，寫 timeline 事件）。" +
      "按 todo id（支援字首）或標題精確匹配。",
    parameters: {
      id: { type: "string", description: "todo id 或其字首（與 title 二選一）" },
      title: { type: "string", description: "todo 標題精確匹配（與 id 二選一）" },
      path: { type: "string", description: "專案根路徑（預設從 session cwd 推斷）" },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean" },
          data: { type: "object", additionalProperties: true },
        },
      },
      render: (_args, value) => {
        if (value.ok) {
          const d = value.data || {};
          return [{ type: "text", text: `dsh-project-brain: todo done ✓ ${d.title}，剩餘活躍 ${d.activeCount}` }];
        }
        return [{ type: "text", text: `dsh-project-brain: todo done FAILED - ${value && value.code}: ${value && value.message}` }];
      },
    },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        const ref = (args && (args.id || args.title)) || "";
        if (!ref) return { ok: false, code: "E_NO_REF", message: "id 或 title 必填一項" };
        const todoPath = brainPath(projectPath, "todo.jsonl");
        const todos = await readJsonl(fs, todoPath);
        const target = findTodo(todos, ref);
        if (!target) {
          return { ok: false, code: "E_NOT_FOUND", message: "未找到匹配的活躍待辦：" + ref };
        }
        const now = Date.now();
        for (const t of todos) {
          if (t.id === target.id) {
            t.status = "done";
            t.updatedAt = now;
          }
        }
        const wrote = await writeText(fs, todoPath, serializeJsonl(todos));
        if (!wrote) return { ok: false, code: "E_WRITE_FAILED", message: "failed to rewrite todo.jsonl" };
        await appendJsonl(fs, brainPath(projectPath, "timeline.jsonl"), {
          id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
          title: "完成待辦：" + target.title,
          eventType: "todo",
          occurredAt: now,
        });
        emitPreviewChanged(exec, projectPath);
        return { ok: true, data: { id: target.id, title: target.title, activeCount: todoStats(todos).pendingTodos } };
      } catch (e) {
        return { ok: false, code: "E_TODO_DONE_FAILED", message: String((e && e.message) || e) };
      }
    },
  });
}
