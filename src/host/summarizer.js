// summarizer.js - P0.5 Session 摘要（v0.4.3 改為純 node git 客戶端）
//
// 目標：會話安靜一段時間後，自動把本 session 的開發活動落到專案腦。
// 主路徑是 session/flush（DSH Desktop 會派發）：每次有動靜就把鬧鐘往後推，
// 空閒滿 sessionIdleSummaryMs（預設 5 分鐘）才摘要。
// session/disposed 仍監聽：某些宿主會發，發了就立刻摘，不等空閒。
//
// 資料收集（按成本由低到高，任一失敗立刻降級）：
//   1) git diff（v0.4.3 起用 v0.4.2 的 detector 純 node git 客戶端，不再依賴 DSH shell service）
//      → 至少能寫出本次改了哪些檔案，進而生成一條 type=change 的 Memory
//   2) LLM 流式抽取穩定的專案知識；嚴格校驗、隱私清洗與去重，失敗不阻塞 Git 摘要
//
// 寫入：
//   - .project-brain/memory.jsonl：append 一條 change/lesson/bug 等結構化記憶
//   - .project-brain/timeline.jsonl：append 一條 eventType=session_summary 事件
//   - emit('project_brain/preview.changed') → 清 aggregator 快取 + 觸發 bundle rebuild
//
// 全部 try/catch + swallow：summarizer 拋錯不能讓 DSH 崩。

import { brainPath, appendJsonl, readBrain } from "./store/brain-files.js";
import { detectSessionChanges, sessionWindowStart } from "./diff/session-window.js";
import { markArchitectureStale, scanAndWrite } from "./scan-and-write.js";
import { architectureTriggerFiles, resolveSessionRoute, sourceChangeFiles } from "./architecture/analyzer.js";
import { extractSessionMemories } from "./memory/session-extractor.js";
import { admitMemory, isChangelogGenre, persistHousekeep } from "./memory/admit.js";

// 從 session 反推 cwd（不依賴 sandboxPolicy）
function sessionCwd(session) {
  if (!session) return null;
  try {
    if (typeof session.cwd === "string" && session.cwd.trim()) return session.cwd;
    if (session.meta && typeof session.meta.cwd === "string" && session.meta.cwd.trim()) return session.meta.cwd;
    if (session.header && typeof session.header.cwd === "string" && session.header.cwd.trim()) return session.header.cwd;
    if (session.header && session.header.meta && typeof session.header.meta.cwd === "string" && session.header.meta.cwd.trim()) return session.header.meta.cwd;
  } catch (e) {}
  return null;
}

// 同一個會話裡，距上次摘要至少要有這麼多條新訊息才值得再摘一次。
export const MIN_NEW_MESSAGES = 4;

export function countSessionMessages(session) {
  try {
    const messages = session && typeof session.deriveMessages === "function" ? session.deriveMessages() : [];
    return Array.isArray(messages) ? messages.length : 0;
  } catch (e) {
    return 0;
  }
}

// 返回該 session 上次摘要時覆蓋到的訊息數；從未摘要過返回 null。
// 老資料沒有 messageCount 欄位，當 0 處理：讓它們至少還能再摘一次。
export function lastSummarizedMessageCount(timeline, sessionId) {
  if (!sessionId) return null;
  const mine = (timeline || []).filter(
    (e) => e && e.eventType === "session_summary" && e.sessionId === sessionId,
  );
  if (!mine.length) return null;
  return mine.reduce((max, e) => Math.max(max, Number(e.messageCount) || 0), 0);
}

// 單條摘要的處理（純函式 + IO 走 fs 適配）
function changeFingerprint(diff) {
  const files = (diff.files || []).filter(Boolean).slice().sort();
  const commits = (diff.commits || []).map((c) => c && (c.hash || c.id || c.commit || c.message || "")).filter(Boolean);
  const input = JSON.stringify([files, commits, diff.stat || ""]);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return "git-" + (hash >>> 0).toString(16).padStart(8, "0");
}

export async function summarizeOne({ fs, projectPath, sessionId, session, llm, route, config = {}, logger }) {
  const log = (level, msg) => {
    try {
      const tag = "[dsh-project-brain] ";
      if (logger && typeof logger[level] === "function") logger[level](tag + msg);
      else if (typeof console !== "undefined") console.log(tag + msg);
    } catch (e) {}
  };

  // 0) 只處理顯式初始化過的專案。舊實現會在使用者只是開啟一個普通專案時
  //    自動建立半殘的 .project-brain/timeline.jsonl。
  const brain = await readBrain(fs, projectPath);
  if (!brain.project || brain.project.__error) {
    log("info", "summarizer: project not initialized, skip");
    return { skipped: "not_initialized", changedFiles: 0, files: [] };
  }
  // 冪等改成按「訊息數增量」而不是「這個 sessionId 摘過沒」。
  // DSH Desktop 裡會話可以活好幾天，一次性冪等會讓第一次之後的工作全部沉不下來。
  const messageCount = countSessionMessages(session);
  const lastSummarized = lastSummarizedMessageCount(brain.timeline, sessionId);
  if (sessionId && lastSummarized !== null && messageCount - lastSummarized < MIN_NEW_MESSAGES) {
    log("info", "summarizer: only " + (messageCount - lastSummarized) + " new messages since last summary, skip " + sessionId);
    return { skipped: "no_new_messages", changedFiles: 0, files: [] };
  }

  // 1) 本次會話視窗內的變更（工作樹 mtime + 視窗內 commit）。
  //    舊實現取 HEAD vs HEAD~1，等於把上一個 commit 當成本次成果：沒提交就收不到，
  //    別人剛提交過就算到自己頭上。這裡按時間視窗取，未提交的改動同樣算數。
  const windowStart = sessionWindowStart(brain, Date.now());
  let diff;
  try {
    diff = detectSessionChanges({ projectPath, sinceMs: windowStart, now: Date.now() });
  } catch (e) {
    diff = { files: [], changes: [], commits: [], stat: "", error: String((e && e.message) || e) };
  }
  if (diff.error) {
    log("info", "summarizer: session window degraded (" + diff.error + ")");
  }
  const changedFiles = (diff.files || []).filter(Boolean);
  const changeEntries = Array.isArray(diff.changes) ? diff.changes : [];
  diff.stat = changedFiles.length ? changedFiles.length + " files changed in session window" : "";
  const fingerprint = changedFiles.length ? changeFingerprint(diff) : null;
  const duplicateChange = Boolean(fingerprint && (brain.memories || []).some((m) =>
    m && m.source && m.source.kind === "session_summary" && m.source.fingerprint === fingerprint
  ));
  const diffEvidence = changedFiles.length
    ? "改動檔案：\n" + changedFiles.map((f) => "- " + f).join("\n") + (diff.stat ? "\n\nstat:\n" + diff.stat : "")
    : "";

  const now = Date.now();
  const writes = [];
  let semantic = { status: "not_requested", memories: [], summary: "" };
  const admittedIds = [];

  try {
    semantic = await extractSessionMemories({ session, llm, route, sessionId, existingMemories: brain.memories, config, now: now + 1, diffEvidence });
    for (const entry of semantic.memories) {
      const grounded = !(entry.source && entry.source.grounded === false);
      if (!grounded && Number(entry.confidence) < 0.6) continue;
      const result = await admitMemory({
        fs,
        projectPath,
        candidate: {
          type: entry.type,
          title: entry.title,
          content: entry.content,
          importance: entry.importance,
          confidence: entry.confidence,
          relatedFiles: entry.relatedFiles,
          tags: entry.tags,
          source: entry.source,
          supersedes: entry.source && entry.source.supersedes,
        },
        channel: "automatic",
        now: entry.createdAt || now,
        llmConfirm: {
          admit: true,
          type: entry.type,
          supersedes: entry.source && entry.source.supersedes,
        },
        pinnedIds: admittedIds,
      });
      if (result.ok && result.action === "insert" && result.id) {
        admittedIds.push(result.id);
      }
    }
    if (admittedIds.length) log("info", `summarizer: admitted ${admittedIds.length} semantic memories`);
    if (semantic.summary) log("info", "summarizer: session summary generated (" + semantic.summary.length + " chars)");
  } catch (e) {
    semantic = { status: "failed", memories: [], summary: "", error: String((e && e.message) || e) };
    log("warn", "summarizer: semantic extraction degraded: " + semantic.error);
  }

  if (changedFiles.length > 0) {
    log("info", `summarizer: session window noted ${changedFiles.length} files (timeline only, no change memory)`);
  } else if (duplicateChange) {
    log("info", "summarizer: unchanged window already recorded (" + fingerprint + ")");
  } else {
    log("info", "summarizer: no file changes in session window");
  }

  // 4) timeline 事件：session_summary（含會話總結 summary，供下個 Session 續接）
  const rawSummary = String(semantic.summary || "").trim();
  const summaryRejected = rawSummary && isChangelogGenre("", rawSummary) ? "changelog_genre" : "";
  const summary = summaryRejected ? "" : rawSummary;
  const timelineEntry = {
    id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    title: "Session 摘要完成" + (changedFiles.length > 0
      ? "（" + changedFiles.length + " 檔案變更，" + admittedIds.length + " 條語義記憶）"
      : "（" + admittedIds.length + " 條語義記憶）"),
    eventType: "session_summary",
    occurredAt: now,
    detail: "sessionId=" + (sessionId || "?") + " changedFiles=" + changedFiles.length + " semanticMemories=" + admittedIds.length + " semanticStatus=" + semantic.status + (changedFiles.length ? " files=" + changedFiles.slice(0, 20).join(",") : ""),
    sessionId: sessionId || null,
    summary,
    // 下一次摘要靠它判斷「這段之後又聊了多少」，缺了就只能整段重摘。
    messageCount,
    files: changedFiles.slice(0, 20),
    changes: changeEntries.slice(0, 20),
    windowStart,
    summaryRejected: summaryRejected || undefined,
    changeFingerprint: fingerprint,
    deduplicated: duplicateChange,
    semanticStatus: semantic.status,
    semanticMemories: admittedIds.length,
  };
  writes.push(async () => {
    const ok = await appendJsonl(fs, brainPath(projectPath, "timeline.jsonl"), timelineEntry);
    log(ok ? "info" : "warn", `summarizer: timeline event ${ok ? "appended" : "FAILED"} (${timelineEntry.id})`);
  });

  for (const write of writes) await write();

  let autoDreamResult = null;
  try {
    const hk = await persistHousekeep(fs, projectPath, { now: Date.now(), pinnedIds: admittedIds });
    autoDreamResult = {
      triggered: Boolean(hk && hk.changed),
      changed: Boolean(hk && hk.changed),
      actions: (hk && hk.actions) || [],
      archived: hk && hk.actions ? hk.actions.filter((a) => a.action === "archive_rule").length : 0,
      evicted: hk && hk.actions ? hk.actions.filter((a) => a.action === "evict_to_dormant").length : 0,
    };
    if (autoDreamResult.triggered) log("info", "summarizer: housekeep changed memory.jsonl");
  } catch (e) {
    log("warn", "summarizer: housekeep failed: " + String((e && e.message) || e));
  }

  // 5) emit preview.changed（讓 aggregator 清快取 + rebuild 觸發）
  try {
    if (typeof require !== "undefined") {
      // no-op; emit 在下面統一處理
    }
  } catch (e) {}

  return {
    changedFiles: changedFiles.length,
    files: changedFiles,
    changes: changeEntries,
    windowStart,
    entrypoints: (brain.project && brain.project.entrypoints) || [],
    fingerprint,
    deduplicated: duplicateChange,
    semanticStatus: semantic.status,
    semanticMemories: admittedIds.length,
    summary,
    autoDream: autoDreamResult,
  };
}

// cwd 解析不出來時，把物件長什麼樣記下來——否則只能靠猜它是 session 還是別的載體。
export function describeSessionShape(value) {
  if (!value || typeof value !== "object") return String(typeof value);
  const own = Object.keys(value).slice(0, 12);
  const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(value) || {})
    .filter((k) => k !== "constructor").slice(0, 12);
  return "own[" + own.join(",") + "] proto[" + proto.join(",") + "]";
}

// 空閒多久算「這段工作告一段落」。
export const IDLE_SUMMARY_MS = 5 * 60 * 1000;

// 正式配置由 schema 夾在 30s–1h。這裡直接採用呼叫方給的正數，
// 不再二次抬到 30s，否則整合測試無法用短空閒驗證 flush 去抖。
function resolveIdleSummaryMs(runtime) {
  let configured = NaN;
  try {
    configured = Number(runtime.getMemoryConfig && runtime.getMemoryConfig().sessionIdleSummaryMs);
  } catch (e) {}
  if (!Number.isFinite(configured) || configured <= 0) return IDLE_SUMMARY_MS;
  return Math.min(3_600_000, configured);
}

// 按 workspace 排隊的空閒摘要。
//
// 為什麼不用 session/disposed：線上實測它一次都沒派發過——DSH Desktop 正常使用中
// 會話不會 dispose，使用者也不會去「關閉會話」。探針同時驗證了 session/created 與
// session/flush 都能正常收到，所以不是 cordis filter 的問題，是那個事件本身不發生。
// 把整條自動沉澱通道掛在它上面，等於這條通道從來沒通電。
//
// 改用空閒觸發：每次會話有動靜就把鬧鐘往後推，安靜滿 IDLE_SUMMARY_MS 才真正摘要。
// 這也更貼近真實節奏——使用者不關會話，但會停下來。
export function createIdleSummaryScheduler(runSummary, idleMs = IDLE_SUMMARY_MS) {
  const pending = new Map();

  function cancel(projectPath) {
    const entry = pending.get(projectPath);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(projectPath);
  }

  function schedule({ projectPath, session, sessionId }) {
    if (!projectPath) return;
    cancel(projectPath);
    const timer = setTimeout(() => {
      pending.delete(projectPath);
      try { runSummary({ projectPath, session, sessionId }); } catch (e) { /* 呼叫方自己兜底 */ }
    }, idleMs);
    // 別因為一個待觸發的摘要把宿主程序釘住。
    if (typeof timer.unref === "function") timer.unref();
    pending.set(projectPath, { timer, session, sessionId });
  }

  function flushAll() {
    for (const projectPath of [...pending.keys()]) {
      const entry = pending.get(projectPath);
      cancel(projectPath);
      try { runSummary({ projectPath, session: entry && entry.session, sessionId: entry && entry.sessionId }); } catch (e) {}
    }
  }

  return { schedule, cancel, flushAll, size: () => pending.size };
}

// 主入口：在 apply() 裡呼叫，訂閱會話事件
export function setupSummarizer(ctx, fs, sandboxPolicy, runtime = {}) {
  if (!ctx || typeof ctx.on !== "function") return;

  let logger = null;
  try { logger = ctx.logger || null; } catch (e) {}

  const log = (level, msg) => {
    try {
      const tag = "[dsh-project-brain] ";
      if (logger && typeof logger[level] === "function") logger[level](tag + msg);
      else if (typeof console !== "undefined") console.log(tag + msg);
    } catch (e) {}
  };

  // 事件裡帶的可能只是 session 投影：既不一定有 cwd，也不一定有 deriveMessages。
  // 拿 id 去 sessions 服務換回 live 例項（RPC 層已經驗證過這條路），
  // 否則語義抽取會因為讀不到轉寫而空轉。
  const resolveSessionContext = (incoming) => {
    const sessionId = incoming && (incoming.id || (incoming.meta && incoming.meta.id));
    let session = incoming;
    let projectPath = sessionCwd(incoming);
    if (projectPath && typeof incoming.deriveMessages === "function") {
      return { projectPath, session, sessionId };
    }
    try {
      const sessions = ctx.get ? ctx.get("sessions") : ctx.sessions;
      const live = sessions && typeof sessions.get === "function" && sessionId ? sessions.get(sessionId) : null;
      if (live) {
        session = live;
        projectPath = projectPath || sessionCwd(live);
      }
    } catch (e) { /* 服務不可用就用事件裡那個 */ }
    return { projectPath: projectPath || null, session, sessionId };
  };

  const idleMs = resolveIdleSummaryMs(runtime);
  const scheduler = createIdleSummaryScheduler((job) => runSummary(job, "idle"), idleMs);

  log("info", "summarizer: subscribed to session/flush + session/disposed（空閒 "
    + Math.round(idleMs / 1000) + "s 觸發摘要）");

  // session/flush 是 DSH 真正會派發的會話訊號（per-request barrier / idle checkpoint /
  // teardown drain）。每來一次就把空閒鬧鐘往後推，安靜夠久才真的去摘要。
  // flush 很頻繁，日誌按 session 去重：通了只說一次，沒通也只抱怨一次。
  const flushSeen = new Set();
  ctx.on("session/flush", (incoming) => {
    try {
      const { projectPath, session, sessionId } = resolveSessionContext(incoming);
      if (!projectPath) {
        // 靜默 return 會讓這條鏈路再次變成啞的——上一輪就是這麼錯過 session/disposed 的。
        const key = "nocwd:" + (sessionId || "?");
        if (!flushSeen.has(key)) {
          flushSeen.add(key);
          log("warn", "summarizer: session/flush 拿不到 cwd，shape=" + describeSessionShape(incoming));
        }
        return;
      }
      if (!flushSeen.has("ok:" + projectPath)) {
        flushSeen.add("ok:" + projectPath);
        log("info", "summarizer: session/flush 鏈路已通，cwd=" + projectPath
          + " messages=" + countSessionMessages(session) + "（空閒後將摘要）");
      }
      scheduler.schedule({ projectPath, session, sessionId });
    } catch (e) {
      log("warn", "summarizer: flush listener failed: " + String((e && e.message) || e));
    }
  });

  // 保留 disposed：某些宿主/profile 下它是會發的，發了就立刻摘一次，不用等空閒。
  ctx.on("session/disposed", (incoming) => {
    try {
      const { projectPath, session, sessionId } = resolveSessionContext(incoming);
      if (!projectPath) {
        log("info", "summarizer: session/disposed without cwd, skip");
        return;
      }
      scheduler.cancel(projectPath);
      runSummary({ projectPath, session, sessionId }, "disposed");
    } catch (e) {
      log("warn", "summarizer: disposed listener failed: " + String((e && e.message) || e));
    }
  });

  function runSummary({ projectPath, session, sessionId }, trigger) {
    // fire-and-forget：summarizer 拋錯不能讓 DSH 崩
    try {
      if (!projectPath) return;
      log("info", `summarizer: ${trigger} 觸發，cwd=${projectPath}`);
      // 用 ctx.effect 讓 summarizer 生命週期受 fiber 控制（即使拋錯也不會 leak）
      const work = summarizeOne({
        fs, projectPath, sessionId, session, logger,
        llm: runtime.getLlm ? runtime.getLlm() : null,
        route: resolveSessionRoute(session),
        config: runtime.getMemoryConfig ? runtime.getMemoryConfig() : {},
      })
        .then(async (r) => {
          // 僅原始碼/配置結構發生變化時重建架構；內容未變時 fingerprint 會複用舊圖，
          // 避免重複呼叫 LLM。失敗只記錄日誌，不影響 Session 關閉。
          const files = (r && r.files) || [];
          const refreshRuntime = {
            getMemoryConfig: runtime.getMemoryConfig,
            getLlm: runtime.getLlm,
            llmRoute: resolveSessionRoute(session),
            sessionId,
            triggerFiles: files.slice(0, 20),
          };
          if (files.length && sourceChangeFiles(files)) {
            try {
              const light = await scanAndWrite(fs, sandboxPolicy, { path: projectPath, dryRun: false }, "auto_light_refresh", Object.assign({}, refreshRuntime, { architectureMode: "light" }));
              if (!light || !light.ok) log("warn", "summarizer: light refresh failed");
            } catch (e) {
              log("warn", "summarizer: light refresh failed: " + String((e && e.message) || e));
            }
          }
          const triggerOptions = { changes: (r && r.changes) || [], entrypoints: (r && r.entrypoints) || [] };
          if (files.length && architectureTriggerFiles(files, triggerOptions)) {
            // 觸發了就必須給出結論：重新整理成功 → scanAndWrite 自己把 architectureStale 清掉；
            // 重新整理失敗 → 顯式置過期，第一屏和注入都會說"架構可能過期"，而不是拿舊泳道當真理。
            let refreshedOk = false;
            try {
              const refreshed = await scanAndWrite(
                fs,
                sandboxPolicy,
                { path: projectPath, dryRun: false },
                "auto_architecture_refresh",
                Object.assign({}, refreshRuntime, { architectureMode: "full" }),
              );
              refreshedOk = Boolean(refreshed && refreshed.ok && !(refreshed.data && refreshed.data.architecture && refreshed.data.architecture.error));
              if (!refreshedOk) log("warn", "summarizer: architecture auto-refresh failed");
            } catch (e) {
              log("warn", "summarizer: architecture auto-refresh failed: " + String((e && e.message) || e));
            }
            if (!refreshedOk) {
              const marked = await markArchitectureStale(fs, sandboxPolicy, projectPath, true);
              log(marked ? "info" : "warn", "summarizer: architectureStale=true " + (marked ? "written" : "write FAILED"));
            }
          }
          // emit preview.changed 觸發 rebuild
          try {
            if (ctx && typeof ctx.emit === "function") {
              ctx.emit("project_brain/preview.changed", { projectPath });
            }
          } catch (e) {}
          return r;
        })
        .catch((e) => log("warn", "summarizer: failed: " + String((e && e.message) || e)));
      if (typeof ctx.effect === "function") {
        try { ctx.effect(() => work, "dsh-project-brain:summarizer"); } catch (e) {}
      }
    } catch (e) {
      log("warn", "summarizer: run failed: " + String((e && e.message) || e));
    }
  }
}
