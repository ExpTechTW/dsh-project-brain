// project_continue Tool - P0.6 最小實現
// 讀取 .project-brain/ 四類資料（project/timeline/memory/todo），組裝跨 Session 恢復上下文。
// Top-K 記憶選擇：importance*0.5 + recency*0.3 + typeBoost*0.2（brain-logic.memoryScore）。
// Context Injector（會話啟動自動注入）屬於後續 P0.6 完整版，本工具先提供 Agent 主動呼叫通道。

import { defineTool } from "@deepseek-ai/dsh-tools";
import { readBrain } from "../host/store/brain-files.js";
import { buildContinueData } from "../host/store/brain-logic.js";
import { buildInjectionContext } from "../host/memory/inject-context.js";
import { resolveProjectPath } from "../host/store/path-resolver.js";
import { ensureHousekeepOnRead } from "../host/memory/admit.js";

export function buildContinueTool({ fs, sandboxPolicy }) {
  return defineTool({
    name: "project_continue",
    description:
      "dsh-project-brain: 恢復當前專案的開發上下文（使用者說「繼續上次的開發」時呼叫）。" +
      "返回專案概要、全部 Core 記憶、上次會話摘要、活躍待辦與建議下一步，" +
      "據此可直接續接開發，無需使用者重新描述專案。",
    parameters: {
      path: { type: "string", description: "專案根路徑（絕對路徑），預設 sandboxPolicy.workspaceRoot" },
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
          const lines = [{ type: "text", text: `dsh-project-brain: continue context` }];
          if (d.project) {
            lines.push({ type: "text", text: `  Project: ${d.project.name} (${d.project.type})` });
          }
          lines.push({ type: "text", text: `  Suggested next: ${d.suggestedNextStep}` });
          lines.push({ type: "text", text: `  Stats: pending ${d.stats.pendingTodos} / done ${d.stats.completedTodos} / decisions ${d.stats.decisions} / memories ${d.stats.memories}` });
          for (const m of d.topMemories || []) {
            lines.push({ type: "text", text: `  mem[${m.type}] ${m.title}` });
          }
          for (const t of d.pendingTodos || []) {
            lines.push({ type: "text", text: `  todo[${t.priority}] ${t.title} (${t.status})` });
          }
          if (d.warning) lines.push({ type: "text", text: `  warning: ${d.warning}` });
          return lines;
        }
        return [{ type: "text", text: `dsh-project-brain: continue FAILED - ${value && value.code}: ${value && value.message}` }];
      },
    },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        await ensureHousekeepOnRead(fs, projectPath);
        const brain = await readBrain(fs, projectPath);
        const data = buildContinueData(brain, Date.now());
        data.injection = buildInjectionContext(brain);
        if (!data.initialized) {
          return {
            ok: false,
            code: "E_NOT_INITIALIZED",
            message: "該專案還沒有 .project-brain/project.json，請先呼叫 project_init",
          };
        }
        return { ok: true, data: data };
      } catch (e) {
        return { ok: false, code: "E_CONTINUE_FAILED", message: String((e && e.message) || e) };
      }
    },
  });
}
