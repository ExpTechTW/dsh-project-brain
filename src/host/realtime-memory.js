// realtime-memory.js - 即時互動記憶
//
// 分工：正則只負責「要不要記」，LLM 負責「記什麼」。
//   使用者說「把這個記住」時，真正的知識幾乎總在上幾輪裡（而且常常是 assistant 說的），
//   正則捕獲組拿到的只是觸發語後面的殘句。所以命中強訊號後必須帶最近若干輪上下文
//   去做一次指代消解，產出能脫離本次對話獨立閱讀的正文。
// 弱訊號只檢測、不在 ingest 寫入。無法消解指代時寧可不寫，交給會話結束的 session-extractor 兜底。

import { admitMemory, hasUnresolvedReference, isMockLlmPayload, titleJaccard } from "./memory/admit.js";
import { sessionMessageLines } from "./memory/session-extractor.js";
import { parseArchitectureJson, resolveSessionRoute, streamLlmText } from "./architecture/analyzer.js";
import { isRetrievableMemory, makeId, normalizeMemoryType } from "./store/brain-logic.js";
import { appendJsonl, brainPath, readBrain } from "./store/brain-files.js";

const STRONG_SIGNAL_PATTERNS = [
  /(?:記住|記一下|備忘|別忘了|長期記住)\s*[:：]?\s*([^。\n]{4,200})/,
  /以後\s*([^。\n]{2,80})\s*(?:要|請|一定)?\s*(?:做|處理|記得|注意)/,
  /(?:remember|note that|don't forget|never forget|long-term remember)\s*[:：]?\s*([^.\n]{4,200})/i,
  /\b(always|never)\s+([a-z][^.\n]{4,150})/i,
];

const WEAK_SIGNAL_PATTERNS = [
  /(?:以後都|以後請|以後記得|下次記得|下次注意|約定|規則是|從今往後|今後)\s*[:：,，]?\s*([^。\n]{4,150})/,
  /(?:記住這個|注意這個|留意一下|請注意)\s*[:：,，]?\s*([^。\n]{4,150})/,
  /\b(going forward|from now on|henceforth|note this|bear in mind|keep in mind)\b\s*[:：,，]?\s*([^.]{4,150})/i,
  /\b(let'?s (?:always|never))\b\s+([^.]{4,150})/i,
];

const NEGATIVE_CONTEXTS = [
  /\b(?:eslint|prettier|type:|noqa|tsconfig|build\s*error|報錯|編譯|執行)\b/i,
  /\b(?:commit|push|pr|merge|git|分支)\b/i,
];

export function cleanRememberContent(text) {
  return String(text || "").replace(/^[,，、;；:：\s]+/, "").replace(/[,，、;；:：\s]+$/, "").trim();
}

export function rememberTitle(content) {
  const t = cleanRememberContent(content);
  if (!t) return "使用者記住的長期約束";
  return t.length > 40 ? t.slice(0, 40) + "…" : t;
}

export function detectSignal(messageText) {
  const text = String(messageText || "").trim();
  if (text.length < 6 || text.length > 2000) return null;
  for (const re of STRONG_SIGNAL_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    let content = cleanRememberContent(m[1] || m[2] || m[0]);
    if (content.length < 4 || content.length > 500) continue;
    return { kind: "explicit_intent", strength: "strong", content, fullText: text };
  }
  if (NEGATIVE_CONTEXTS.some((re) => re.test(text))) return null;
  for (const re of WEAK_SIGNAL_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    let content = cleanRememberContent(m[1] || m[2] || m[0]);
    if (content.length < 4 || content.length > 500) continue;
    return { kind: "explicit_intent", strength: "weak", content, fullText: text };
  }
  return null;
}

function messageToText(message) {
  if (!message) return "";
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block) => block && (block.type === "text" || typeof block.text === "string"))
      .map((block) => String(block.text || ""))
      .join("\n");
  }
  return "";
}

function sessionCwd(session) {
  if (!session) return null;
  try {
    if (typeof session.cwd === "string" && session.cwd.trim()) return session.cwd.trim();
    if (session.meta && typeof session.meta.cwd === "string" && session.meta.cwd.trim()) return session.meta.cwd.trim();
    if (session.header && typeof session.header.cwd === "string" && session.header.cwd.trim()) return session.header.cwd.trim();
    if (session.header && session.header.meta && typeof session.header.meta.cwd === "string" && session.header.meta.cwd.trim()) return session.header.meta.cwd.trim();
  } catch (e) {}
  return null;
}

const projectState = new Map();
const MAX_PER_SESSION = 5;
// 同一個 30 分鐘視窗內最多做這麼多次提煉（含失敗的）。
const MAX_REFINE_CALLS = 12;
const SEEN_CACHE_LIMIT = 50;

// 指代消解用的上下文視窗：必須包含 assistant 訊息，使用者說的「這個角度」十有八九是助手剛寫的東西。
//
// 頭尾都要取。只留最近 N 條的話，「這個對話的第一句」「最開始說的」這類往回指的
// 表達永遠落在視窗外，模型只能誠實地回答解不開——而那看起來就像外掛沒記住。
const CONTEXT_HEAD_MESSAGES = 4;
const CONTEXT_TAIL_MESSAGES = 10;
const CONTEXT_MAX_CHARS = 7000;
const CONTEXT_PER_MESSAGE_CHARS = 1200;
const CONTEXT_GAP_MARK = "（……中間省略若干輪……）";
const REFINE_TIMEOUT_MS = 20000;
// 同一條偏好被反覆重申時走 supersede，否則 Core 裡會堆一排同義條目。
const SUPERSEDE_JACCARD = 0.72;
const REFINE_TYPES = new Set(["preference", "decision", "requirement", "architecture", "bug", "lesson"]);

export function contextWindow(session) {
  try {
    const lines = sessionMessageLines(session, CONTEXT_PER_MESSAGE_CHARS);
    if (lines.length === 0) return "";

    let selected;
    if (lines.length <= CONTEXT_HEAD_MESSAGES + CONTEXT_TAIL_MESSAGES) {
      selected = lines;
    } else {
      selected = lines.slice(0, CONTEXT_HEAD_MESSAGES)
        .concat([CONTEXT_GAP_MARK])
        .concat(lines.slice(-CONTEXT_TAIL_MESSAGES));
    }

    // 還是超預算就整體再壓一檔，而不是丟訊息——丟掉哪一條都可能正是使用者指的那條。
    let text = selected.join("\n\n");
    if (text.length > CONTEXT_MAX_CHARS) {
      const budget = Math.max(200, Math.floor(CONTEXT_MAX_CHARS / selected.length) - 8);
      text = selected
        .map((line) => (line.length > budget ? line.slice(0, budget) + "…" : line))
        .join("\n\n");
    }
    return text;
  } catch (e) {
    return "";
  }
}

function refinePrompt(triggerText, transcript) {
  return [
    "使用者在對話裡明確要求「記住」某件事。把它整理成一條能脫離本次對話獨立閱讀的長期記憶。",
    "",
    "使用者原話（觸發語）：",
    triggerText,
    "",
    "對話上下文（按時間先後排列；若出現省略標記，說明中間輪次未提供，但首尾都在）：",
    transcript || "（無上下文）",
    "",
    "要求：",
    "1. 消解全部指代。正文裡不允許出現「這個 / 那個 / 上面說的 / 這樣 / this / that」，一律替換成上下文裡它真正指的東西（目標、口徑、技術選型、檔名等）。",
    "2. 正文寫 what + why：使用者要求的是什麼、適用範圍和原因，2–4 句，自包含。",
    "3. 使用者說「這個對話的第一句」「最開始說的」時，指的就是上面上下文裡最早那條 USER 訊息；說「剛才說的」則指最後幾條。按這個理解去取內容。",
    "4. 只有上下文裡確實沒有可對應的內容時，resolved 才返回 false。不要因為不確定就放棄，也不要編造。",
    "5. title 寫成站立事實句，不要寫成「記住 XXX」「使用者要求 XXX」。",
    "6. type：對協作方式、輸出結構、長期口徑的要求用 preference；技術選型用 decision；其餘按語義選。",
    "",
    "輸出格式（嚴格遵守）：第一個字元必須是 {，最後一個字元必須是 }。",
    "不要寫任何解釋、前言、結語，不要用 Markdown 程式碼塊包裹。",
    JSON.stringify({ resolved: true, type: "preference", title: "站立事實句", content: "自包含的 what + why", importance: 0.8 }),
  ].join("\n");
}

// 模型偶爾會在 JSON 前後帶上解釋文字或直接用自然語言作答。與其丟掉這次提煉，
// 不如把它自己的輸出丟回去讓它重排一遍——只要一次就夠，再失敗就認了。
function repairPrompt(rawText) {
  return [
    "下面這段輸出本應是嚴格 JSON，但無法解析。請原樣提取其中的資訊，重新輸出為合法 JSON。",
    "第一個字元必須是 {，最後一個字元必須是 }，不要任何解釋或程式碼塊標記。",
    "欄位：" + JSON.stringify({ resolved: true, type: "preference", title: "", content: "", importance: 0.8 }),
    "",
    "原始輸出：",
    String(rawText || "").slice(0, 2000),
  ].join("\n");
}

async function refineSignal({ llm, route, sessionId, signal, transcript, timeoutMs, log }) {
  if (!llm || typeof llm.stream !== "function" || !route || !route.provider || !route.model) {
    return { status: "llm_unavailable", candidate: null };
  }
  const ask = (prompt) => streamLlmText(llm, route, prompt, sessionId, timeoutMs || REFINE_TIMEOUT_MS, {
    system: "Resolve every deictic reference using the provided conversation. Return strict JSON only, with no prose before or after.",
    maxTokens: 1000,
    purpose: "project-memory-realtime-refine",
  });

  let text;
  try {
    text = await ask(refinePrompt(signal.fullText || signal.content, transcript));
  } catch (e) {
    log("warn", "realtime-memory: refine failed: " + String((e && e.message) || e));
    return { status: "refine_failed", candidate: null };
  }
  if (isMockLlmPayload(text)) return { status: "llm_unavailable", candidate: null };

  let parsed;
  try {
    parsed = parseArchitectureJson(text);
  } catch (e) {
    // 第一次沒給出合法 JSON，把它的原始輸出丟回去重排一次再放棄。
    log("info", "realtime-memory: refine output unparseable, retrying once");
    try {
      parsed = parseArchitectureJson(await ask(repairPrompt(text)));
    } catch (retryError) {
      return { status: "refine_unparseable", candidate: null, sample: String(text || "").slice(0, 160) };
    }
  }
  if (!parsed || parsed.resolved !== true) {
    // 模型說它解不開。把視窗規模記下來——多數情況是窗口裡確實沒有使用者指的那段。
    return {
      status: "unresolved",
      candidate: null,
      sample: "模型判定無法消解；上下文視窗 " + String(transcript || "").length + " 字元",
    };
  }

  const type = normalizeMemoryType(parsed.type);
  const title = cleanRememberContent(parsed.title).slice(0, 120);
  const content = cleanRememberContent(parsed.content).slice(0, 800);
  if (!REFINE_TYPES.has(type) || !title || content.length < 12) {
    return { status: "refine_invalid", candidate: null };
  }
  // 模型自稱 resolved 但正文還帶著指代詞 —— 以正文為準。
  if (hasUnresolvedReference(title, content, { maxSelfContainedChars: 0 })) {
    return { status: "unresolved", candidate: null };
  }
  const importance = Number(parsed.importance);
  return {
    status: "refined",
    candidate: {
      type,
      title,
      content,
      importance: Number.isFinite(importance) ? Math.min(0.95, Math.max(0.5, importance)) : 0.8,
      confidence: 0.85,
      resolved: true,
    },
  };
}

// LLM 不可用時的保守兜底：只有使用者原話本身就自包含才落盤，絕不靠補一句套話湊長度。
export function fallbackCandidate(signal) {
  const cleaned = cleanRememberContent(signal && signal.content);
  if (cleaned.length < 12) return null;
  if (hasUnresolvedReference(rememberTitle(cleaned), cleaned, { maxSelfContainedChars: 0 })) return null;
  return {
    type: "preference",
    title: rememberTitle(cleaned),
    content: cleaned,
    importance: 0.7,
    confidence: 0.6,
    resolved: false,
  };
}

// 失敗原因要說準：把「模型返回格式不對」寫成「缺少模型」，會讓人跑去查配置。
// refineStatus 比籠統的 reason 更接近真相，優先用它。
const REJECT_REASON_TEXT = {
  unresolved_reference: "沒能從上下文裡認出「這個 / 那個」指的是什麼",
  needs_context: "缺少可用的上下文，無法整理成自包含的記憶",
};

const REFINE_STATUS_TEXT = {
  llm_unavailable: "當前 Session 還沒有可複用的模型路由，先完成一次正常對話再試",
  refine_failed: "整理記憶時模型呼叫失敗（超時或中斷）",
  refine_unparseable: "模型兩次都沒按要求返回 JSON",
  refine_invalid: "模型返回的內容不完整，缺少標題或正文",
};

const REJECT_NEXT_STEP = "可以補一句更具體的說法，或等本次會話結束後自動歸納。";

// 使用者明確說了「記住」卻沒記成，是最容易讓人誤以為已經記下的場景。
// 留一條 timeline，在側邊欄「任務動態」裡看得到；Agent 通道的常規拒絕不記，避免刷屏。
async function noteRejection({ fs, projectPath, sessionId, signal, reason, refineStatus, sample }) {
  const now = Date.now();
  const trigger = String(signal.fullText || signal.content || "").slice(0, 120);
  const why = REFINE_STATUS_TEXT[refineStatus] || REJECT_REASON_TEXT[reason] || reason;
  try {
    await appendJsonl(fs, brainPath(projectPath, "timeline.jsonl"), {
      id: makeId("evt", now),
      title: "未記住：" + trigger,
      eventType: "memory_rejected",
      occurredAt: now,
      sessionId: sessionId || null,
      detail: why + "。" + REJECT_NEXT_STEP,
      rejectReason: reason,
      refineStatus: refineStatus || null,
      // 模型到底返回了什麼，排查時比任何描述都有用。
      ...(sample ? { sample } : {}),
    });
  } catch (e) { /* 記錄失敗不影響主流程 */ }
}

export const WEAK_SOURCE_KIND = "user_intent_weak";
const REALTIME_SOURCE_KINDS = new Set(["user_explicit", WEAK_SOURCE_KIND]);

// 同類型、同樣來自即時通道、標題高度重合 → 視為對舊口徑的重申，走 supersede。
export function findSupersedable(memories, candidate) {
  let best = null;
  let bestScore = 0;
  for (const m of memories || []) {
    if (!isRetrievableMemory(m) || m.type !== candidate.type) continue;
    if (!(m.source && REALTIME_SOURCE_KINDS.has(m.source.kind))) continue;
    const score = titleJaccard(m.title, candidate.title);
    if (score >= SUPERSEDE_JACCARD && score > bestScore) {
      best = m;
      bestScore = score;
    }
  }
  return best;
}

function getProjectState(projectPath) {
  let st = projectState.get(projectPath);
  if (!st) {
    st = { seenFingerprints: new Set(), count: 0, refineCalls: 0, sessionStartAt: Date.now() };
    projectState.set(projectPath, st);
  }
  if (Date.now() - st.sessionStartAt > 30 * 60 * 1000) {
    st.seenFingerprints.clear();
    st.count = 0;
    st.refineCalls = 0;
    st.sessionStartAt = Date.now();
  }
  return st;
}

export async function handleOne({ fs, projectPath, sessionId, signal, session, llm, route, config = {}, logger }) {
  const log = (level, msg) => {
    try {
      if (logger && typeof logger[level] === "function") logger[level]("[dsh-project-brain] " + msg);
    } catch (e) {}
  };

  if (!signal) return { skipped: "no_signal" };
  const weak = signal.strength !== "strong";

  const brain = await readBrain(fs, projectPath);
  if (!brain.project || brain.project.__error) {
    log("info", "realtime-memory: project not initialized, skip");
    return { skipped: "not_initialized" };
  }

  const st = getProjectState(projectPath);
  if (st.count >= MAX_PER_SESSION) {
    log("info", "realtime-memory: rate limit reached for " + projectPath + ", skip");
    return { skipped: "rate_limit" };
  }
  // 落盤額度只在寫成功時消耗，擋不住「反覆觸發但都提煉失敗」。模型呼叫另算一份額度，
  // 否則一段全是「以後都…」的對話會把模型打爆。
  if (st.refineCalls >= MAX_REFINE_CALLS) {
    log("info", "realtime-memory: refine budget exhausted for " + projectPath + ", skip");
    return { skipped: "refine_budget" };
  }
  st.refineCalls += 1;

  const transcript = contextWindow(session);
  const refined = await refineSignal({
    llm,
    route,
    sessionId,
    signal,
    transcript,
    timeoutMs: Number(config.realtimeMemoryTimeoutMs) || REFINE_TIMEOUT_MS,
    log,
  });

  let candidate = refined.candidate;
  if (!candidate) {
    // 弱訊號（「以後都…」「約定…」）使用者並沒有明確要求記住，模型解不開就安靜跳過：
    // 既不退回原話，也不寫「未記住」——那會把沒人要求的事報成失敗。
    if (weak) {
      log("info", "realtime-memory: weak signal not resolvable (" + refined.status + "), skip");
      return { skipped: "weak_unresolved", refineStatus: refined.status };
    }
    // 模型明確說解不開指代時不要退回原話——那條原話就是解不開的那條。
    const reason = refined.status === "unresolved" ? "unresolved_reference" : null;
    if (reason) {
      log("info", "realtime-memory: reference unresolved, deferring to session summary");
      await noteRejection({
        fs, projectPath, sessionId, signal, reason,
        refineStatus: refined.status, sample: refined.sample,
      });
      return { skipped: reason, refineStatus: refined.status, noted: true };
    }
    candidate = fallbackCandidate(signal);
    if (!candidate) {
      log("info", "realtime-memory: no self-contained fact (" + refined.status + "), deferring to session summary");
      await noteRejection({
        fs, projectPath, sessionId, signal,
        reason: "needs_context", refineStatus: refined.status, sample: refined.sample,
      });
      return { skipped: "needs_context", refineStatus: refined.status, noted: true };
    }
  }
  if (weak) {
    // 弱訊號是從語氣裡推斷出來的，不是使用者點名要記的，可信度和重要性都要壓一檔。
    candidate = Object.assign({}, candidate, {
      confidence: Math.min(candidate.confidence, 0.7),
      importance: Math.min(candidate.importance, 0.7),
    });
  }

  const prior = findSupersedable(brain.memories, candidate);
  const result = await admitMemory({
    fs,
    projectPath,
    candidate: {
      type: candidate.type,
      title: candidate.title,
      content: candidate.content,
      importance: candidate.importance,
      confidence: candidate.confidence,
      tags: ["realtime", "user_intent", weak ? "weak_signal" : "strong_signal"],
      source: {
        kind: weak ? WEAK_SOURCE_KIND : "user_explicit",
        sessionId: sessionId || null,
        signalKind: signal.kind,
        refined: candidate.resolved === true,
        trigger: String(signal.fullText || signal.content).slice(0, 200),
        ...(prior ? { supersedes: prior.id } : {}),
      },
    },
    // 強訊號是使用者點名要記的，准入沒得商量；弱訊號是從語氣裡推斷的，走常規通道，
    // 但內容已經由上面那次提煉產出，不再重複問一遍模型。
    channel: weak ? "automatic" : "user_explicit",
    ...(weak ? { llmConfirm: { admit: true, type: candidate.type } } : {}),
    now: Date.now(),
  });

  if (!result.ok) {
    log("info", "realtime-memory: admit refused " + (result.code || "") + " " + (result.reason || ""));
    await noteRejection({
      fs, projectPath, sessionId, signal,
      reason: result.reason || result.code || "rejected",
      refineStatus: refined.status,
    });
    return { skipped: result.code || "rejected", refineStatus: refined.status, result, noted: true };
  }
  if (result.action === "skip") {
    return { skipped: "duplicate", id: result.id };
  }
  st.count += 1;
  log("info", 'realtime-memory: admitted [' + candidate.type + '] "' + candidate.title + '"'
    + (refined.status === "refined" ? " (refined)" : " (verbatim)")
    + (result.supersedesId ? " supersedes=" + result.supersedesId : ""));
  return { appended: true, entry: result.entry, id: result.id, refineStatus: refined.status, supersedesId: result.supersedesId || null };
}

export function setupRealtimeMemory(ctx, fs, sandboxPolicy, runtime = {}) {
  if (!ctx || typeof ctx.on !== "function") return;
  void sandboxPolicy;

  let logger = null;
  try { logger = ctx.logger || null; } catch (e) {}
  const log = (level, msg) => {
    try {
      if (logger && typeof logger[level] === "function") logger[level]("[dsh-project-brain] " + msg);
      else if (typeof console !== "undefined") console.log("[dsh-project-brain] " + msg);
    } catch (e) {}
  };

  log("info", "realtime-memory: subscribed to agent/inbox/claimed");

  ctx.on("agent/inbox/claimed", (payload) => {
    try {
      const message = payload && payload.message;
      if (!message || message.role !== "user") return;
      const text = messageToText(message);
      if (!text) return;

      const session = payload.agent && payload.agent.session;
      const projectPath = sessionCwd(session);
      if (!projectPath) return;

      const sessionId = session && (session.id || (session.meta && session.meta.id));
      const signal = detectSignal(text);
      if (!signal) return;

      const config = runtime.getMemoryConfig ? runtime.getMemoryConfig() : {};
      if (config.realtimeMemoryEnabled === false) return;

      const work = handleOne({
        fs,
        projectPath,
        sessionId,
        signal,
        session,
        logger,
        config,
        llm: runtime.getLlm ? runtime.getLlm() : null,
        route: resolveSessionRoute(session),
      })
        .then(async (result) => {
          // 落盤和「記了一條未記住」都會改變側邊欄內容，兩種都要通知。
          if (result && (result.appended || result.noted) && ctx && typeof ctx.emit === "function") {
            try { ctx.emit("project_brain/preview.changed", { projectPath }); } catch (e) {}
          }
          return result;
        })
        .catch((e) => log("warn", "realtime-memory: handler failed: " + String((e && e.message) || e)));
      if (typeof ctx.effect === "function") {
        try { ctx.effect(() => work, "dsh-project-brain:realtime-memory"); } catch (e) {}
      }
    } catch (e) {
      log("warn", "realtime-memory: listener failed: " + String((e && e.message) || e));
    }
  });
}
