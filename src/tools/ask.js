// project_ask Tool - 自然語言查詢專案腦（v0.3.0：可選 LLM RAG）
//
// MVP 實現：純規則檢索（標題 / 內容 / 相關檔案關鍵詞匹配）。
// v0.3.0 升級：當 useLLM=true 且 llm service 可用時，調 llm.stream 合成答案。
//              llm 不可用 / 失敗時 fallback 到純規則版。
// 引數：
//   - question (必填)
//   - topK: 返回 source 數（預設 5）
//   - useLLM: 是否調 LLM 合成答案（預設 false，相容零 token 用法）
//   - path: 專案路徑
// 返回：sources（Top-K）+ answer（LLM 合成，可選）+ counts + confidence

import { defineTool } from "@deepseek-ai/dsh-tools";
import { brainPath, readJson, readJsonl } from "../host/store/brain-files.js";
import { techStackToType } from "../host/store/brain-logic.js";
import { resolveProjectPath } from "../host/store/path-resolver.js";
import { activeMemories, retrieveMemories } from "../host/memory/retrieval.js";
import { recordMemoryAccess } from "../host/memory/access.js";
import { embedQuery, ensureEmbeddingIndex } from "../host/memory/embeddings.js";
import { normalizeMemoryConfig } from "../host/memory/config.js";
import { resolveSessionRoute, streamLlmText } from "../host/architecture/analyzer.js";
import { ensureHousekeepOnRead } from "../host/memory/admit.js";

const baseOutputSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
  },
};

function tokenize(s) {
  if (!s) return [];
  const out = [];
  const en = String(s).toLowerCase().split(/[^a-z0-9_\u4e00-\u9fff]+/i);
  for (const tok of en) {
    const t = tok && tok.trim();
    if (t && t.length >= 2) out.push(t);
  }
  return out;
}

function scoreEntry(entry, tokens, fields) {
  if (!entry || tokens.length === 0) return 0;
  let score = 0;
  let hits = 0;
  for (const tok of tokens) {
    for (const f of fields) {
      const v = entry[f];
      if (v == null) continue;
      const s = String(v).toLowerCase();
      if (s.indexOf(tok) >= 0) {
        score += 1;
        hits += 1;
        if (f === "title") score += 1;
        break;
      }
    }
  }
  return hits > 0 ? score : -1;
}

// 用 sources 構造 RAG prompt
function buildRagPrompt(question, sources, projectInfo) {
  const parts = [];
  parts.push("你是 dsh-project-brain 助手。使用者問了一個關於專案的問題，請僅基於下面提供的 sources 回答，不要編造資訊。");
  parts.push("");
  if (projectInfo) {
    parts.push("【專案概況】");
    parts.push("- 名稱: " + (projectInfo.name || "(未命名)"));
    if (projectInfo.type) parts.push("- 型別: " + projectInfo.type);
    parts.push("");
  }
  parts.push("【相關 Memory / TODO / Timeline（Top sources）】");
  sources.forEach((s, i) => {
    const tag = s.kind + " + " + (s.type || s.status || s.eventType || "");
    parts.push(`[${i + 1}] (${tag}) ${s.title}`);
    if (s.snippet) parts.push("    " + s.snippet);
    parts.push("");
  });
  parts.push("【使用者問題】");
  parts.push(question);
  parts.push("");
  parts.push("請用簡潔的中文回答（3-5 句話），並在末尾列出引用的來源編號 [1][2]...。如果 sources 無法回答，直接說『資訊不足』。");
  return parts.join("\n");
}

// 從 exec 解析 session model route（與 tools/suggest.js 一致）
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

// 調 LLM 合成答案；失敗返回 null（讓 caller fallback 到純 BM25）
// 修復：改用 apply 時快取的 llm service（getLlm）+ 完整 model route，
//      不再從 exec.ctx 現場取 llm（工具執行上下文拿不到，導致 useLLM 靜默失效）。
async function synthesizeAnswer({ llm, route, sessionId, question, sources, projectInfo }) {
  if (!sources || sources.length === 0) return null;
  if (!llm || typeof llm.stream !== "function") return null;
  if (!route || !route.provider || !route.model) return null;

  const prompt = buildRagPrompt(question, sources, projectInfo);
  try {
    const text = await streamLlmText(llm, route, prompt, sessionId, 30000, {
      system: "你是 dsh-project-brain 助手，僅基於提供的 sources 回答，不要編造資訊。",
      maxTokens: 800,
      purpose: "project-brain-ask",
    });
    return text && text.trim() ? text.trim() : null;
  } catch (e) {
    return null;
  }
}

export function buildAskTool({ fs, sandboxPolicy, getMemoryConfig, resolveEmbeddingCredential, getLlm }) {
  return defineTool({
    name: "project_ask",
    description:
      "dsh-project-brain: 自然語言查詢專案腦。預設 BM25 + 重要度/時效（含 dormant）；向量若已配置只作為加分。" +
      " 返回 Top-K sources + 專案概覽。useLLM=true 時額外調 LLM 合成答案（RAG 風格）。" +
      "可用於回答「為什麼這麼設計 / 之前踩過什麼坑 / 最近改了什麼」等問題。",
    parameters: {
      question: { type: "string", description: "自然語言問題（必填）" },
      topK: { type: "number", description: "返回條目數上限，預設 5" },
      useLLM: { type: "boolean", description: "是否調 LLM 合成答案（預設 false，純規則返回 sources）" },
      includeArchived: { type: "boolean", description: "是否檢索 archived/superseded，預設 false" },
      path: { type: "string", description: "專案根路徑（預設從 session cwd 推斷）" },
    },
    output: { schema: baseOutputSchema, render: (_args, value) => renderAsk(value) },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        await ensureHousekeepOnRead(fs, projectPath);
        const question = args && args.question ? String(args.question).trim() : "";
        if (!question) return { ok: false, data: { error: { code: "E_NO_QUESTION", message: "question 必填" } } };
        const topK = Math.max(1, Math.min(20, Number(args && args.topK) || 5));
        const useLLM = Boolean(args && args.useLLM);
        const tokens = tokenize(question);
        const memoryConfig = normalizeMemoryConfig(getMemoryConfig ? getMemoryConfig() : {});

        const projectJson = await readJson(fs, brainPath(projectPath, "project.json")).catch(() => null);
        const memories = await readJsonlSafe(fs, brainPath(projectPath, "memory.jsonl"));
        const todos = await readJsonlSafe(fs, brainPath(projectPath, "todo.jsonl"));
        const timeline = await readJsonlSafe(fs, brainPath(projectPath, "timeline.jsonl"));

        const includeArchived = Boolean(args && args.includeArchived);
        const activeMemoryList = includeArchived ? (memories || []).filter(Boolean) : activeMemories(memories);
        let vectors = null;
        let queryVector = null;
        let vectorState = {
          requested: memoryConfig.vectorEnabled && memoryConfig.retrievalMode === "hybrid",
          used: false,
          indexed: 0,
          total: activeMemoryList.length,
          pending: activeMemoryList.length,
          model: memoryConfig.embeddingModel || null,
          dimensions: memoryConfig.embeddingDimensions,
          fallbackReason: null,
        };
        if (vectorState.requested) {
          if (!memoryConfig.embeddingBaseURL || !memoryConfig.embeddingModel) {
            vectorState.fallbackReason = { code: "EMBEDDING_NOT_CONFIGURED", message: "向量檢索已啟用，但 endpoint 或 model 未配置" };
          } else {
            const indexState = await ensureEmbeddingIndex({
              fs,
              projectPath,
              memories: activeMemoryList,
              config: memoryConfig,
              resolveCredential: resolveEmbeddingCredential,
              knownMemoryIds: (memories || []).map((m) => m && m.id).filter(Boolean),
            });
            vectors = indexState.vectors;
            vectorState = { ...vectorState, ...indexState, requested: true, used: false, fallbackReason: indexState.error };
            try {
              queryVector = await embedQuery({
                query: question,
                config: memoryConfig,
                resolveCredential: resolveEmbeddingCredential,
              });
              const indexedVector = vectors.size > 0 ? vectors.values().next().value : null;
              if (indexedVector && indexedVector.length !== queryVector.length) {
                queryVector = null;
                vectorState.fallbackReason = {
                  code: "EMBEDDING_DIMENSION_MISMATCH",
                  message: "查詢向量維度與索引不一致，請檢查模型配置或刪除派生快取後重試",
                };
              } else {
                vectorState.used = vectors.size > 0;
              }
            } catch (error) {
              vectorState.fallbackReason = {
                code: error.code || "EMBEDDING_QUERY_FAILED",
                message: String(error.message || error),
              };
            }
          }
        }
        const memScored = retrieveMemories({
          memories: activeMemoryList,
          query: question,
          topK,
          vectors,
          queryVector,
          config: memoryConfig,
        });

        const todoScored = (todos || []).map((t) => {
          const s = scoreEntry(t, tokens, ["title", "description"]);
          return s < 0 ? null : { ...t, _score: s };
        }).filter(Boolean);
        todoScored.sort((a, b) => (b._score || 0) - (a._score || 0));

        const tlScored = (timeline || []).map((e) => {
          const s = scoreEntry(e, tokens, ["title", "detail"]);
          return s < 0 ? null : { ...e, _score: s };
        }).filter(Boolean);
        tlScored.sort((a, b) => (b._score || 0) - (a._score || 0));

        // 命中即「用過」：排序和淘汰都靠 lastAccessedAt 才能認出哪些記憶真的常用。
        await recordMemoryAccess({
          fs,
          projectPath,
          ids: memScored.map((hit) => hit.memory && hit.memory.id).filter(Boolean),
        });

        const memSources = memScored.map((hit) => ({
          kind: "memory", id: hit.memory.id, type: hit.memory.type, title: hit.memory.title,
          snippet: String(hit.memory.content || "").slice(0, 200),
          score: Number(Math.max(0, hit.relevance || 0).toFixed(4)),
          keywordScore: Number((hit.keywordScore || 0).toFixed(4)),
          vectorScore: Number((hit.vectorScore || 0).toFixed(4)),
          importance: hit.memory.importance, confidence: hit.memory.confidence,
          relatedFiles: hit.memory.relatedFiles || null,
        }));
        const todoSources = todoScored.slice(0, Math.max(1, Math.floor(topK / 2))).map((t) => ({
          kind: "todo", id: t.id, status: t.status, priority: t.priority, title: t.title,
          snippet: String(t.description || "").slice(0, 120),
          score: Number((t._score || 0).toFixed(2)),
        }));
        const tlSources = tlScored.slice(0, 2).map((e) => ({
          kind: "timeline", id: e.id, eventType: e.eventType, title: e.title,
          occurredAt: e.occurredAt,
          score: Number((e._score || 0).toFixed(2)),
        }));
        const sources = memSources.concat(todoSources).concat(tlSources);

        const projectInfo = projectJson ? {
          name: projectJson.name,
          type: techStackToType(projectJson.techStack),
          lastUpdateAt: projectJson.updatedAt || projectJson.lastScannedAt || null,
        } : null;

        // 可選 LLM 合成
        let answer = null;
        let llmUsed = false;
        let llmError = null;
        if (useLLM) {
          try {
            answer = await synthesizeAnswer({
              llm: getLlm ? getLlm() : null,
              route: executionRoute(exec),
              sessionId: executionSessionId(exec),
              question,
              sources,
              projectInfo,
            });
            llmUsed = answer != null;
          } catch (e) {
            llmError = String((e && e.message) || e);
          }
        }

        // v0.3.9 修復：之前 "value is not lossless JSON" 是因為 sources 數組裡某項含不可序列化欄位
        // 強制 JSON round-trip 把 undefined/Symbol/Function 都剝掉
        const ret = {
          ok: true,
          data: {
            projectPath,
            question,
            tokens,
            project: projectInfo,
            sources,
            counts: {
              memories: activeMemoryList.length,
              archivedMemories: (memories || []).length - activeMemoryList.length,
              todos: (todos || []).length,
              timeline: (timeline || []).length,
              matched: sources.length,
            },
            confidence: sources.length > 0 ? Math.min(1, memSources.length > 0 ? memSources[0].score : 0.3) : 0,
            retrieval: {
              requestedMode: memoryConfig.retrievalMode,
              actualMode: vectorState.used ? "hybrid" : "keyword",
              vectorRequested: vectorState.requested,
              vectorUsed: vectorState.used,
              indexed: vectorState.indexed,
              total: vectorState.total,
              pending: vectorState.pending,
              model: vectorState.model,
              dimensions: vectorState.dimensions,
              fallbackReason: vectorState.fallbackReason,
            },
            answer: answer,
            llm: {
              used: llmUsed,
              requested: useLLM,
              error: llmError,
            },
            hint: sources.length === 0 ? "沒有匹配條目。可考慮放寬關鍵詞，或先呼叫 project_init / project_memory_add 錄入更多上下文。" : null,
          },
        };
        // 診斷：先嚐試 JSON round-trip，如果失敗就在 data 裡加 _diag
        try {
          const roundtrip = JSON.parse(JSON.stringify(ret));
          return roundtrip;
        } catch (e) {
          ret.data._diag = "JSON.stringify FAIL: " + String((e && e.message) || e);
          return ret;
        }
      } catch (e) {
        return { ok: false, data: { error: { code: "E_ASK_FAILED", message: String((e && e.message) || e) } } };
      }
    },
  });
}

async function readJsonlSafe(fs, path) {
  try {
    return await readJsonl(fs, path);
  } catch (e) {
    return [];
  }
}

function renderAsk(value) {
  if (!value || typeof value !== "object") return [{ type: "text", text: "dsh-project-brain: ask FAILED - " + String(value) }];
  if (value.ok) {
    const d = value.data || {};
    const lines = [{ type: "text", text: `dsh-project-brain: ask — matched ${d.counts.matched} sources (confidence ${(d.confidence || 0).toFixed(2)}, llm=${d.llm && d.llm.used ? "yes" : "no"})` }];
    if (d.answer) {
      lines.push({ type: "text", text: "\n【LLM 答案】" });
      lines.push({ type: "text", text: d.answer });
    }
    for (const s of d.sources || []) {
      lines.push({ type: "text", text: `  [${s.kind}/${s.id}] ${s.title}${s.snippet ? " — " + s.snippet.slice(0, 80) : ""}` });
    }
    if (d.llm && d.llm.error) lines.push({ type: "text", text: `  llm_error: ${d.llm.error}` });
    if (d.hint) lines.push({ type: "text", text: `  hint: ${d.hint}` });
    if (d._diag) lines.push({ type: "text", text: `  ⚠️ DIAG: ${d._diag}` });
    return lines;
  }
  if (value.data && value.data.error) return [{ type: "text", text: "dsh-project-brain: ask FAILED - " + value.data.error.code + ": " + value.data.error.message }];
  return [{ type: "text", text: "dsh-project-brain: ask FAILED - " + JSON.stringify(value) }];
}
