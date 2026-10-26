// Shared Core injection assembler — injector and project_continue must render the same markdown.

import { isCoreMemory } from "../store/brain-logic.js";
import { buildProjectBriefing, truncateSummaryToTokens, latestDisposedSessionSummary } from "./briefing.js";

export { truncateSummaryToTokens, latestDisposedSessionSummary, buildProjectBriefing };

export function buildInjectionContext(brain) {
  if (!brain || !brain.project || brain.project.__error) return "";
  const briefing = buildProjectBriefing(brain);
  const memories = ((brain.memories || []).filter(isCoreMemory)).slice()
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

  const lines = [];
  lines.push("## Project Brain");
  lines.push("");
  if (briefing.markdown) {
    lines.push(briefing.markdown);
    lines.push("");
  }

  // 活躍待辦單獨成段：續接靠 TODO，不能只在「記憶約定」裡空口叮囑，也不能混進「最近做什麼」。
  const stuck = Array.isArray(briefing.stuck) ? briefing.stuck : [];
  if (stuck.length > 0) {
    lines.push("### 活躍待辦");
    for (const todo of stuck) {
      const status = todo.status === "in_progress" ? "進行中" : (todo.status === "blocked" ? "阻塞" : "待辦");
      lines.push("- [" + status + "] " + todo.title);
    }
    lines.push("");
  }

  if (memories.length > 0) {
    lines.push("### Core 記憶");
    for (const m of memories) {
      const tag = m.type ? "[" + m.type + "] " : "";
      lines.push("- " + tag + m.title);
      if (m.content) {
        lines.push("  " + String(m.content).replace(/\n+/g, " "));
      }
    }
    lines.push("");
  }

  lines.push("### 專案記憶約定");
  lines.push("- 只對跨會話仍為真的決策、約束、架構事實或教訓呼叫 `project_memory_add`；標題寫成站立事實句，不要寫成 v1.2.0 patch / 驗收清單。");
  lines.push("- 工具可能拒絕，不要把 changelog / 本次改了哪些檔案再寫一遍。正文保持 2–4 句。");
  lines.push("- 進行中的工作用 `project_todo_add` / `project_todo_update` / `project_todo_done` 跟蹤，續接依賴 TODO，而不是把會話流水賬塞進記憶。");
  lines.push("- 專案結構明顯變化後呼叫 `project_rescan`；需要理解最近程式碼變化時呼叫 `project_diff`（預設 dry-run）。");

  return lines.join("\n");
}
