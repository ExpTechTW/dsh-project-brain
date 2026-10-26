// project_suggest_next Tool - v0.4.15 智慧續接
//
// Session 開始時（或主動呼叫）給使用者一句"今天可能想推進什麼"：
//   1) 預設走純規則：基於 in_progress TODO / 高優先順序 pending / 阻塞 / 近期記憶
//   2) 若 DSH Session 已有可用 model route，組裝 RAG prompt 讓 LLM 推斷
//   3) LLM 失敗 / 不可用 → 自動降級到本地規則
//
// 設計要點：
//   - 不調架構 LLM（architecture.llm）也不調 session_extractor，獨立用 llm service 即可
//   - 完整 try/catch + swallow：不能讓 Session 啟動卡住
//   - 返回結構穩定（source: "llm" / "local" / "error"），UI 據此展示

import { defineTool } from "@deepseek-ai/dsh-tools";
import { readBrain } from "../host/store/brain-files.js";
import { resolveProjectPath } from "../host/store/path-resolver.js";
import { resolveSessionRoute, streamLlmText } from "../host/architecture/analyzer.js";
import { buildLocalSuggestion, buildSuggestPromptForLlm, parseSuggestJson, normalizeSuggestion } from "../host/suggest.js";
import { ensureHousekeepOnRead } from "../host/memory/admit.js";

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

async function tryLlmSuggestion({ llm, route, sessionId, brain, temperature }) {
  const { prompt, evidence } = buildSuggestPromptForLlm(brain, Date.now());
  let text;
  try {
    text = await streamLlmText(llm, route, prompt, sessionId, 20000, {
      system: "You are the dsh-project-brain 'smart continue' advisor. Output strict JSON only. Never invent TODOs, memories or files that were not provided as evidence.",
      maxTokens: 400,
      purpose: "project-suggest-next",
      // v0.4.17：deterministic 輸出，讓同一專案下不同 session 拿到的建議儘量一致
      temperature: typeof temperature === "number" ? temperature : 0,
    });
  } catch (error) {
    return { ok: false, error: error && error.code ? error.code : "STREAM_FAILED", message: String((error && error.message) || error) };
  }
  const parsed = parseSuggestJson(text);
  if (!parsed) return { ok: false, error: "INVALID_JSON", message: "LLM 返回非 JSON" };
  const normalized = normalizeSuggestion(parsed);
  if (!normalized) return { ok: false, error: "INVALID_SCHEMA", message: "LLM JSON 缺少必要欄位" };
  return { ok: true, data: { suggestion: normalized, evidence: summarizeEvidence(evidence), source: "llm" } };
}

function summarizeEvidence(evidence) {
  return {
    activeTodos: {
      inProgress: evidence.activeTodos.inProgress.length,
      pending: evidence.activeTodos.pending.length,
      blocked: evidence.activeTodos.blocked.length,
    },
    memories: evidence.memories.length,
    recentEvents: evidence.recentEvents.length,
    daysSinceLastSession: evidence.daysSinceLastSession,
  };
}

export function buildSuggestTool({ fs, sandboxPolicy, getLlm }) {
  return defineTool({
    name: "project_suggest_next",
    description:
      "dsh-project-brain: 智慧續接。Session 開始時給使用者一句「今天可能想推進什麼」+ 依據，" +
      "結合活躍 TODO / 近期記憶 / 最近活動 / 架構概覽綜合推斷。" +
      "預設走本地規則（in_progress > 最高優先順序 pending > 阻塞 > 記憶），" +
        "若 DSH 當前 Session 有可用 LLM route，會自動調模型升級建議質量；失敗時降級到本地。" +
        "適用於「今天繼續什麼 / 接下來做什麼」等場景。",
    parameters: {
      path: { type: "string", description: "專案根路徑（可選；預設從當前 DSH Session 的 workspace 自動解析）" },
      useLLM: { type: "boolean", description: "是否嘗試調 LLM（預設 true；設 false 強制走本地規則）" },
    },
    output: { schema: baseOutputSchema, render: (_args, value) => renderSuggest(value) },
    async execute(args, exec) {
      const startMs = Date.now();
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        if (projectPath === ".") {
          return { ok: false, data: { error: { code: "E_NO_PATH", message: "無法從當前 Session 解析 workspace 路徑" } } };
        }
        await ensureHousekeepOnRead(fs, projectPath);
        const brain = await readBrain(fs, projectPath);
        if (!brain.project || brain.project.__error) {
          return { ok: false, data: { error: { code: "E_NOT_INITIALIZED", message: "專案還未初始化 .project-brain/project.json，請先呼叫 project_init" } } };
        }
        // 也讀 architecture（LLM prompt 用）
        try {
          const archPath = projectPath.replace(/[\\/]+$/, "") + "/.project-brain/architecture.json";
          const text = await (async () => { try { return await fs.readText(await fs.resolve(archPath)); } catch { return null; } })();
          if (text) brain.architecture = JSON.parse(text);
        } catch (e) { /* ignore */ }

        const useLLM = args && args.useLLM === false ? false : true;
        const llm = getLlm ? getLlm() : null;
        const route = executionRoute(exec);
        const sessionId = executionSessionId(exec);

        let result;
        if (useLLM && llm && route && route.provider && route.model) {
          // v0.4.17：傳 temperature=0 讓同一專案下不同 session 拿到的建議儘量一致
          result = await tryLlmSuggestion({ llm, route, sessionId, brain, temperature: 0 });
          if (result.ok) {
            return { ok: true, data: result.data };
          }
          // LLM 失敗：fallback 到本地
          const fallback = buildLocalSuggestion(brain, Date.now());
          return {
            ok: true,
            data: {
              suggestion: fallback.data.suggestion,
              evidence: fallback.data.evidence,
              source: "llm_failed",
              llmError: { code: result.error, message: result.message },
            },
            durationMs: Date.now() - startMs,
          };
        }

        const local = buildLocalSuggestion(brain, Date.now());
        return {
          ok: true,
          data: Object.assign({}, local.data, { durationMs: Date.now() - startMs, source: llm && !route ? "local_no_route" : "local" }),
        };
      } catch (e) {
        return { ok: false, data: { error: { code: "E_SUGGEST_FAILED", message: String((e && e.message) || e) } } };
      }
    },
  });
}

function renderSuggest(value) {
  if (!value || typeof value !== "object") return [{ type: "text", text: "dsh-project-brain: suggest FAILED - " + String(value) }];
  if (value.ok) {
    const d = value.data || {};
    const s = d.suggestion || {};
    const lines = [{ type: "text", text: `dsh-project-brain: suggest (${d.source || "?"})` }];
    lines.push({ type: "text", text: `  ${s.title || "(無標題)"}` });
    if (s.reason) lines.push({ type: "text", text: `  reason: ${s.reason}` });
    if (s.confidence != null) lines.push({ type: "text", text: `  confidence: ${(s.confidence * 100).toFixed(0)}%` });
    if (s.suggestedTodoId) lines.push({ type: "text", text: `  todo: ${s.suggestedTodoId}` });
    if (s.suggestedMemoryIds && s.suggestedMemoryIds.length) lines.push({ type: "text", text: `  memories: ${s.suggestedMemoryIds.join(", ")}` });
    if (d.llmError) lines.push({ type: "text", text: `  llm_fallback: ${d.llmError.code} - ${d.llmError.message}` });
    return lines;
  }
  if (value.data && value.data.error) return [{ type: "text", text: "dsh-project-brain: suggest FAILED - " + value.data.error.code + ": " + value.data.error.message }];
  return [{ type: "text", text: "dsh-project-brain: suggest FAILED - " + JSON.stringify(value) }];
}