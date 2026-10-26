import { isAbsolute, normalize, sep } from "node:path";

import { parseArchitectureJson, streamLlmText } from "../architecture/analyzer.js";
import { isRetrievableMemory, makeMemoryEntry, normalizeMemoryType } from "../store/brain-logic.js";
import { memoryFingerprint } from "./admit.js";

const ALLOWED_TYPES = new Set(["decision", "requirement", "architecture", "bug", "lesson", "context", "preference"]);

function clean(value, limit) {
  return String(value == null ? "" : value).replace(/\u0000/g, "").trim().slice(0, limit);
}

export function redactSessionText(value) {
  return clean(value, 200000)
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, "[REDACTED_PRIVATE_KEY]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\s*[:=]\s*["']?[^\s"']{6,}["']?/gi, "$1=[REDACTED]")
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/g, "[REDACTED_TOKEN]");
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((block) => block && block.type === "text").map((block) => block.text || "").join("\n");
}

// 把 session 裡的 user/assistant 訊息轉成帶角色字首、已脫敏的行。
// 挑哪幾條是呼叫方的事：做會話總結要最近的，做指代消解還得帶上開頭。
export function sessionMessageLines(session, perMessageChars = 6000) {
  let messages = [];
  try {
    messages = session && typeof session.deriveMessages === "function" ? session.deriveMessages() : [];
  } catch (e) { return []; }
  return (Array.isArray(messages) ? messages : []).map((message) => {
    const role = message && message.role;
    if (role !== "user" && role !== "assistant") return "";
    const value = redactSessionText(textFromContent(message.content));
    return value ? `${role.toUpperCase()}: ${value.slice(0, perMessageChars)}` : "";
  }).filter(Boolean);
}

export function boundedSessionTranscript(session, maxChars = 16000, maxMessages = 0) {
  const all = sessionMessageLines(session);
  const parts = maxMessages > 0 ? all.slice(-maxMessages) : all;
  const selected = [];
  let used = 0;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    const remaining = maxChars - used;
    if (remaining <= 0) break;
    selected.unshift(part.slice(Math.max(0, part.length - remaining)));
    used += Math.min(part.length, remaining) + 2;
  }
  return selected.join("\n\n");
}

function safeRelatedFile(value) {
  const file = clean(value, 240).replace(/\\/g, "/");
  if (!file || isAbsolute(file) || file.startsWith("../") || file === "..") return null;
  const normalized = normalize(file).split(sep).join("/");
  return normalized.startsWith("../") || normalized === ".." ? null : normalized;
}

function fingerprint(item) {
  return memoryFingerprint(item);
}

// Grounding check：模糊匹配 evidence 字串是否真實存在於 transcript 裡
//   目的：阻止 LLM 把臨時討論幻覺成決策落盤
//   實現：去掉空格/標點後做 substring 匹配（容忍少量字元差異），允許 evidence 截斷到 80 字
export function evidenceMatchesTranscript(evidence, transcript) {
  if (!evidence || typeof evidence !== "string") return false;
  const evidenceText = evidence.trim().slice(0, 200);
  if (evidenceText.length < 6) return false;
  const normalize = (s) => String(s || "").replace(/\s+/g, "").replace(/[\s\p{P}]/gu, "").toLowerCase();
  const normEvidence = normalize(evidenceText);
  const normTranscript = normalize(transcript);
  if (normEvidence.length < 6) return false;
  // 直接 substring 匹配（容忍標點和大小寫差異）
  if (normTranscript.includes(normEvidence)) return true;
  // 滑動視窗：如果 evidence 較長，按 30 字元視窗部分匹配（容忍 LLM 輕微改寫）
  if (normEvidence.length > 30) {
    const windowSize = 30;
    for (let i = 0; i <= normEvidence.length - windowSize; i += 15) {
      if (normTranscript.includes(normEvidence.slice(i, i + windowSize))) return true;
    }
  }
  return false;
}

function sessionMemoryPrompt(transcript, maxItems, diffEvidence) {
  const parts = [
    "從下面的軟體開發 Session 中提取值得跨會話長期儲存的專案知識，並總結本次會話做了什麼。",
    "只保留有明確證據的架構決策、穩定需求、Bug 根因與修復、可複用教訓、長期問題或重要專案背景。",
    "使用者明確表達的長期協作口徑與工作偏好（輸出結構、沉澱目標、語氣要求等）用 type=preference 記下來，它和技術事實同樣重要。",
    "每條記憶必須能脫離本次對話獨立閱讀：正文裡不允許出現「這個 / 那個 / 上面說的 / 這樣 / this / that」這類指代詞，一律替換成它真正指的東西。",
    "忽略寒暄、臨時步驟、命令輸出、未確認猜測、個人資訊、憑據；沒有穩定知識時 memories 返回空陣列。",
    "summary 用 1–3 句話寫本次做成了什麼重要的以及為什麼，作為下一個 Session 的續接上下文，不編造。禁止寫成「改了 N 個檔案」、驗收清單或 changelog。",
    `最多 ${maxItems} 條記憶。只輸出嚴格 JSON 物件，不要 Markdown。`,
    "每條記憶必須帶 evidence：原文中能直接驗證該記憶的連續片段（建議 8-60 字），用於 grounding 校驗。",
    "如果某條記憶無法在原文中找到對應證據，請降低 confidence 或不輸出。",
    "durable=true 僅當該事實去掉日期/版本號後仍為真；changelog、本次改了哪些檔案、會話流水賬必須 durable=false。",
    "title 寫成站立事實句（例如「路徑以 session cwd 為準」），不要寫成 v1.2.0 patch 或驗收清單。content 用 2–4 句把 what+why 寫完。",
    "格式：" + JSON.stringify({ summary: "本次會話總結（2-4 句話）", memories: [{ type: "decision|requirement|architecture|bug|lesson|preference", title: "簡潔標題", content: "自包含的事實與理由", evidence: "原文片段（8-60 字）", durable: true, importance: 0.8, confidence: 0.9, relatedFiles: ["相對路徑"], tags: ["標籤"], supersedes: null }] }),
  ];
  if (diffEvidence && String(diffEvidence).trim()) {
    parts.push("【git diff 參考證據（僅輔助核對檔案級事實，不要逐條複述為記憶）】\n" + String(diffEvidence).trim());
  }
  parts.push("Session 對話：\n" + transcript);
  return parts.join("\n");
}

export async function extractSessionMemories({ session, llm, route, sessionId, existingMemories = [], config = {}, now = Date.now(), diffEvidence = "" } = {}) {
  if (config.sessionSemanticMemoryEnabled === false) return { status: "disabled", memories: [], summary: "" };
  if (!llm || typeof llm.stream !== "function") return { status: "llm_unavailable", memories: [], summary: "" };
  if (!route || !route.provider || !route.model) return { status: "route_unavailable", memories: [], summary: "" };
  const maxChars = Math.max(2000, Math.min(40000, Number(config.sessionSemanticMaxChars) || 16000));
  const maxItems = Math.max(1, Math.min(8, Number(config.sessionSemanticMaxItems) || 4));
  const transcript = boundedSessionTranscript(session, maxChars);
  if (transcript.length < 40) return { status: "empty_transcript", memories: [], summary: "" };

  const text = await streamLlmText(llm, route, sessionMemoryPrompt(transcript, maxItems, diffEvidence), sessionId, Number(config.sessionSemanticTimeoutMs) || 30000, {
    system: "Extract durable, evidence-based software-project memory as strict JSON only. Never reproduce credentials or personal data.",
    maxTokens: 2600,
    purpose: "project-session-memory",
  });
  const parsed = parseArchitectureJson(text);
  const summary = clean(parsed && parsed.summary, 2000);
  const raw = Array.isArray(parsed && parsed.memories) ? parsed.memories : [];
  const known = new Set((existingMemories || []).filter(isRetrievableMemory).map((item) =>
    item && item.source && item.source.fingerprint ? String(item.source.fingerprint) : fingerprint(item || {})
  ));
  const memories = [];
  let groundedCount = 0;
  let ungroundedCount = 0;
  for (const item of raw.slice(0, maxItems)) {
    const type = normalizeMemoryType(item && item.type);
    const title = clean(item && item.title, 200);
    const content = redactSessionText(clean(item && item.content, 400));
    const evidence = clean(item && item.evidence, 200);
    if (!ALLOWED_TYPES.has(type) || !title || content.length < 20) continue;
    if (item && item.durable !== true) continue;
    const candidate = { type, title, content };
    const hash = fingerprint(candidate);
    if (known.has(hash)) continue;
    known.add(hash);

    // Grounding check：evidence 必須能在 transcript 裡找到，否則降級 confidence
    let groundingConfidence = typeof item.confidence === "number" ? item.confidence : 0.7;
    let groundingPassed = true;
    if (evidence && evidence.length >= 6) {
      if (evidenceMatchesTranscript(evidence, transcript)) {
        groundedCount += 1;
      } else {
        // evidence 給出但無法在 transcript 找到 → 高度疑似幻覺，confidence 大幅降級
        groundingConfidence = Math.min(groundingConfidence, 0.4);
        ungroundedCount += 1;
        groundingPassed = false;
      }
    } else {
      // 沒給 evidence：無法校驗，降級 confidence 但保留記憶（中等懷疑）
      groundingConfidence = Math.min(groundingConfidence, 0.55);
      ungroundedCount += 1;
      groundingPassed = false;
    }

    memories.push(makeMemoryEntry({
      ...candidate,
      importance: item.importance,
      confidence: groundingConfidence,
      relatedFiles: (Array.isArray(item.relatedFiles) ? item.relatedFiles : []).map(safeRelatedFile).filter(Boolean),
      tags: (Array.isArray(item.tags) ? item.tags : []).map((tag) => clean(tag, 50)).filter(Boolean),
      source: {
        kind: "session_semantic",
        fingerprint: hash,
        sessionId: sessionId || null,
        provider: route.provider,
        model: route.model,
        grounded: groundingPassed,
        evidence: evidence || null,
        ...(item && item.supersedes ? { supersedes: String(item.supersedes) } : {}),
      },
    }, now));
  }
  return { status: "completed", memories, summary, transcriptChars: transcript.length, grounded: groundedCount, ungrounded: ungroundedCount };
}
