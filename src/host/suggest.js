// suggest.js - v0.4.15 智慧續接（project_suggest_next）
//
// 核心目標：Session 開始時給使用者 1-2 句"今天可能想推進什麼"，讓跨 session 續接不需要使用者重新描述專案。
// 資料來源：
//   - 高重要性 + 近期記憶（decision / architecture / requirement / bug / lesson）
//   - 進行中的 TODO（in_progress > pending > 阻塞）
//   - 最近活動時間線（特別是上次 session 的最後一個事件）
//   - 專案概述（project.description / techStack）
//   - 可選：架構報告（architecture.overview.purpose / layers / components）
//
// LLM 呼叫（可選）：
//   - 複用當前 DSH Session 的 LLM（與 architecture / session-extractor / project_diff 共用 streamLlmText）
//   - prompt：給 LLM 一個結構化輸入，要求 JSON 輸出
//   - 失敗 / 不可用：返回 buildLocalFallback（純規則推薦）
//
// 強約束：純函式 + 不依賴 DSH runtime（便於 smoke 離線測試）。

import { recentTimeline, activeTodos, topMemories, isCoreMemory } from "./store/brain-logic.js";

// ──  收集證據（純函式，input brain 資料） ──

function buildEvidence(brain, now) {
  const nowMs = typeof now === "number" ? now : Date.now();
  const project = (brain && brain.project) || null;
  const memories = ((brain && brain.memories) || []).filter(isCoreMemory);
  const todos = (brain && brain.todos) || [];
  const timeline = (brain && brain.timeline) || [];
  const architecture = brain && brain.architecture;

  // 活躍 TODO（in_progress 優先）
  const inProgress = todos.filter((t) => t && t.status === "in_progress");
  const pending = todos.filter((t) => t && t.status === "pending");
  const blocked = todos.filter((t) => t && t.status === "blocked");

  // Top-5 記憶（按 brain-logic 的 importance*0.5 + recency*0.3 演算法）
  const topMem = topMemories(memories, 5, nowMs);

  // 最近活動時間線（取最近 3 條）
  const recentEvents = recentTimeline(timeline, 3);

  // 距上次 session 摘要多久
  const lastSummary = timeline
    .filter((e) => e && (e.eventType === "session_summary" || e.eventType === "init" || e.eventType === "rescan"))
    .sort((a, b) => (b.occurredAt || 0) - (a.occurredAt || 0))[0];
  const daysSinceLastSession = lastSummary
    ? Math.max(0, Math.round((nowMs - (lastSummary.occurredAt || nowMs)) / 86_400_000))
    : null;

  return {
    project,
    memories: topMem,
    activeTodos: { inProgress, pending, blocked },
    recentEvents,
    architecture,
    daysSinceLastSession,
    now: nowMs,
  };
}

// ──  本地 fallback 推薦（不調 LLM） ──

function buildLocalFallback(evidence) {
  const { project, memories, activeTodos: t, recentEvents, daysSinceLastSession } = evidence;

  // 優先順序 1：進行中的任務
  if (t.inProgress.length > 0) {
    const top = t.inProgress[0];
    const relatedMem = pickRelatedMem(top, memories);
    return {
      title: "繼續推進：" + truncate(top.title, 60),
      reason: relatedMem
        ? "上次中斷在 “" + truncate(relatedMem.title, 30) + "” 相關工作"
        : "你正在處理這條任務（in_progress）",
      confidence: 0.85,
      suggestedTodoId: top.id || null,
      suggestedMemoryIds: relatedMem ? [relatedMem.id] : [],
      fallback: true,
    };
  }

  // 優先順序 2：最高優先順序 pending TODO
  if (t.pending.length > 0) {
    const sorted = sortTodosByPriority(t.pending);
    const top = sorted[0];
    const relatedMem = pickRelatedMem(top, memories);
    return {
      title: "建議開始：" + truncate(top.title, 60),
      reason: relatedMem
        ? "與已記錄的 “" + truncate(relatedMem.title, 30) + "” 決策/教訓相關"
        : "這是當前最高優先順序待辦（" + (top.priority || "medium") + "）",
      confidence: 0.7,
      suggestedTodoId: top.id || null,
      suggestedMemoryIds: relatedMem ? [relatedMem.id] : [],
      fallback: true,
    };
  }

  // 優先順序 3：被阻塞的任務
  if (t.blocked.length > 0) {
    return {
      title: "解決阻塞：" + truncate(t.blocked[0].title, 60),
      reason: "有 " + t.blocked.length + " 個任務被阻塞，先解決阻塞可解鎖後續工作",
      confidence: 0.5,
      suggestedTodoId: t.blocked[0].id || null,
      suggestedMemoryIds: [],
      fallback: true,
    };
  }

  // 優先順序 4：基於記憶的推斷
  if (memories.length > 0) {
    const recents = memories.filter((m) => {
      const age = (evidence.now - (m.updatedAt || m.createdAt || 0)) / 86_400_000;
      return age <= 7;
    });
    if (recents.length > 0) {
      return {
        title: "回顧近期記憶：" + truncate(recents[0].title, 60),
        reason: daysSinceLastSession != null && daysSinceLastSession > 0
          ? "距上次 Session " + daysSinceLastSession + " 天，先回顧近期專案知識"
          : "最近記錄的專案決策可作為下一步起點",
        confidence: 0.45,
        suggestedTodoId: null,
        suggestedMemoryIds: [recents[0].id],
        fallback: true,
      };
    }
  }

  // 優先順序 5：無任何資料
  if (recentEvents.length > 0) {
    return {
      title: "回顧上次活動：" + truncate(recentEvents.title, 60),
      reason: "專案無活躍任務，可從最近活動入手",
      confidence: 0.3,
      suggestedTodoId: null,
      suggestedMemoryIds: [],
      fallback: true,
    };
  }

  return {
    title: project ? "規劃下一步" : "初始化專案腦",
    reason: project
      ? "暫無待辦和近期記憶，建議用 project_todo_add 規劃下一步"
      : "專案腦還未初始化，呼叫 project_init 開始",
    confidence: 0.2,
    suggestedTodoId: null,
    suggestedMemoryIds: [],
    fallback: true,
  };
}

function sortTodosByPriority(todos) {
  const order = { urgent: 0, high: 1, medium: 2, low: 3 };
  return todos.slice().sort((a, b) => {
    const pa = order[a.priority || "medium"] != null ? order[a.priority || "medium"] : 2;
    const pb = order[b.priority || "medium"] != null ? order[b.priority || "medium"] : 2;
    return pa - pb;
  });
}

function pickRelatedMem(todo, memories) {
  if (!todo || memories.length === 0) return null;
  // 優先找 relatedFiles / tags 重疊的記憶
  const todoFiles = new Set((todo.relatedFiles || []).map(String));
  const todoTags = new Set((todo.tags || []).map(String));
  for (const m of memories) {
    const overlap = (m.relatedFiles || []).some((f) => todoFiles.has(f));
    const tagOverlap = (m.tags || []).some((t) => todoTags.has(t));
    if (overlap || tagOverlap) return m;
  }
  // 退化：最近一條同類型記憶
  return memories[0] || null;
}

function truncate(s, limit) {
  s = String(s || "").trim();
  if (s.length <= limit) return s;
  return s.slice(0, limit - 1) + "…";
}

// ──  LLM prompt ──

function buildSuggestPrompt(evidence) {
  const payload = {
    project: evidence.project
      ? { name: evidence.project.name, type: evidence.project.type || evidence.project.techStack, description: truncate(evidence.project.description, 300) }
      : null,
    daysSinceLastSession: evidence.daysSinceLastSession,
    inProgress: evidence.activeTodos.inProgress.slice(0, 3).map(compactTodo),
    pendingTop: sortTodosByPriority(evidence.activeTodos.pending).slice(0, 3).map(compactTodo),
    blocked: evidence.activeTodos.blocked.slice(0, 2).map(compactTodo),
    topMemories: evidence.memories.slice(0, 5).map(compactMem),
    recentEvents: evidence.recentEvents.slice(0, 3).map((e) => ({ eventType: e.eventType, title: truncate(e.title, 80), occurredAt: e.occurredAt })),
    architectureSummary: evidence.architecture && evidence.architecture.summary
      ? truncate(evidence.architecture.summary, 400)
      : null,
  };
  return [
    "你是 dsh-project-brain 的「智慧續接」助手。Session 開始時給使用者 1-2 句話 + 一條「理由」，讓他不需要重新描述專案就知道今天能做什麼。",
    "根據下面提供的專案狀態（活躍 TODO / 記憶 / 時間線 / 架構概況）判斷：今天最值得推進的一件事是什麼？理由是什麼？",
    "規則：",
    "1) title 必須簡潔（≤ 30 字），是動詞開頭（「繼續 X」「建議開始 X」「回顧 X」「解決 X」「規劃 X」）；",
    "3) reason 必須有依據：引用具體的 TODO id、記憶 title、或者時間線事件；",
    "4) suggestedTodoId 必須填 1 個（最相關的那個 active todo），suggestedMemoryIds 填 1-3 個最相關的記憶；",
    "5) confidence 0~1：進行中任務 ≥0.8，最高階 pending 0.5-0.8，記憶推斷 0.3-0.5，純空白 ≤0.3；",
    "6) 不允許編造資訊；只能基於提供的 evidence；如果完全沒資料，title 寫「初始化專案腦」或「規劃下一步」；",
    "7) 輸出嚴格 JSON 物件，不要 Markdown。",
    "格式：" + JSON.stringify({ title: "動詞 + 內容", reason: "依據 + 上下文", confidence: 0.7, suggestedTodoId: "todo id 或 null", suggestedMemoryIds: ["memory id"] }),
    "證據：" + JSON.stringify(payload),
  ].join("\n");
}

function compactTodo(t) {
  return { id: t.id, title: truncate(t.title, 80), priority: t.priority || "medium", status: t.status, tags: (t.tags || []).slice(0, 3) };
}
function compactMem(m) {
  return { id: m.id, type: m.type, title: truncate(m.title, 80), importance: m.importance, tags: (m.tags || []).slice(0, 3) };
}

// ──  解析 LLM 輸出（與 analyzer.js 共享的 JSON 容錯） ──

function parseSuggestJson(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const candidates = [];
  // 1) 原始
  candidates.push(text);
  // 2) 去 ```json 圍欄
  candidates.push(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim());
  // 3) 找首個 { 到末尾最後一個 } 的 balanced 子串
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  // 4) 清理尾逗號（防止 LLM 輸出 {"foo":"a",}）
  const stripTrailing = (s) => s.replace(/,\s*([}\]])/g, "$1");
  for (const c of candidates) {
    if (!c) continue;
    try { return JSON.parse(stripTrailing(c)); } catch (e) {}
  }
  return null;
}

function normalizeSuggestion(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const title = String(parsed.title || "").trim().slice(0, 80);
  const reason = String(parsed.reason || "").trim().slice(0, 200);
  if (!title || !reason) return null;
  const confidence = Number(parsed.confidence);
  const suggestedTodoId = parsed.suggestedTodoId && typeof parsed.suggestedTodoId === "string" ? parsed.suggestedTodoId.slice(0, 64) : null;
  const suggestedMemoryIds = Array.isArray(parsed.suggestedMemoryIds)
    ? parsed.suggestedMemoryIds.filter((x) => typeof x === "string").slice(0, 5)
    : [];
  return {
    title,
    reason,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    suggestedTodoId,
    suggestedMemoryIds,
    fallback: false,
  };
}

// ──  公開 API ──

// buildLocalSuggestion 不調 LLM，只走規則（供 RPC fallback / build-time embed）
export function buildLocalSuggestion(brain, now) {
  const evidence = buildEvidence(brain, now);
  const local = buildLocalFallback(evidence);
  return {
    ok: true,
    data: {
      suggestion: local,
      evidence: {
        activeTodos: {
          inProgress: evidence.activeTodos.inProgress.length,
          pending: evidence.activeTodos.pending.length,
          blocked: evidence.activeTodos.blocked.length,
        },
        memories: evidence.memories.length,
        recentEvents: evidence.recentEvents.length,
        daysSinceLastSession: evidence.daysSinceLastSession,
      },
      source: "local",
    },
  };
}

// buildLlmSuggestion 給 caller 用的低階 helper：返回 { text, attempt }，讓上層 streamLlmText 呼叫
//   實際在 tools/suggest.js 包裝，避免 host 模組直接依賴 llm service 介面
export function buildSuggestPromptForLlm(brain, now) {
  const evidence = buildEvidence(brain, now);
  return { prompt: buildSuggestPrompt(evidence), evidence };
}

export { parseSuggestJson, normalizeSuggestion, buildEvidence, buildLocalFallback };

// 給 smoke test / build embed 用的純資料組裝（不依賴 llm service）
export function buildSuggestionData(brain, now) {
  return buildLocalSuggestion(brain, now);
}