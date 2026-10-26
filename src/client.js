import { previewStackLayers, RUNTIME_STACK_FIELDS, DEVOPS_STACK_FIELDS } from "./stack-taxonomy.js";

// dsh-project-brain Client 入口（v0.5.1：Connection RPC 即時資料 + 離線快照降級）
// DSH 瀏覽器側模組載入格式：window.__ModuleLoader__.load({id, factory})
//
// 主資料通道：Client 用 connection.rpc 按 live sessionId 請求 Host，Host 從 Session
// header 解析可信 cwd 並讀取對應 .project-brain。build-time embed 只作首屏/離線降級。
//
// 區塊元件不變（Header/Phase/Todo/CodeGraph/Activity/Memories/Stats/Actions/Dashboard），
// 因為它們是純函式，資料來源 embed 即可。

window.__ModuleLoader__.load({
  id: "dsh-project-brain",
  factory: (require) => {
    const React = require("react");
    const NS = "dsh-project-brain";

    // ─── i18n 字典 ───
    const dicts = {
      "zh-CN": {
        "tab.label": "專案",
        "header.section": "專案",
        "header.untitled": "未命名專案",
        "header.lastUpdate": "上次更新",
        "phase.title": "當前階段",
        "phase.empty": "暫無進行中任務",
        "todo.title": "待辦",
        "todo.empty": "暫無待辦",
        "activity.title": "最近活動",
        "activity.empty": "暫無活動",
        "memories.title": "專案記憶",
        "stats.title": "概覽",
        "stats.pending": "待辦",
        "stats.done": "已完成",
        "stats.decisions": "決策",
        "codegraph.title": "程式碼結構",
        "codegraph.files": "檔案",
        "codegraph.edges": "依賴邊",
        "codegraph.langs": "語言",
        "codegraph.noLang": "暫無語言資料",
        "arch.title": "專案架構圖",
        "arch.modules": "模組",
        "arch.edges": "依賴",
        "arch.local": "本地分析",
        "arch.hybrid": "DSH LLM 增強",
        "arch.select": "點一層看同層模組，點模組看職責",
        "arch.flows": "執行路徑",
        "arch.flowEmpty": "還沒有可展示的執行路徑",
        "arch.peersHint": "同層模組是並列關係，沒有固定先後順序",
        "arch.inspectLayer": "層詳情",
        "arch.inspectModule": "模組詳情",
        "arch.related": "協作",
        "arch.runtime": "執行路徑",
        "arch.empty": "還沒有可展示的分層",
        "arch.purpose": "專案定位",
        "arch.risks": "架構提示",
        "arch.style": "架構風格",
        "arch.layers": "架構分層",
        "arch.components": "核心元件",
        "arch.keyFiles": "關鍵檔案導覽",
        "arch.start": "快速熟悉路徑",
        "arch.highlights": "設計要點",
        "arch.trigger": "觸發",
        "arch.outcome": "結果",
        "arch.llmFallback": "DSH LLM 未完成，當前展示本地推斷",
        "arch.actionRetry": "重新掃描",
        "arch.actionChat": "先發一條訊息",
        "arch.actionSettings": "檢查 DSH 模型路由",
        "arch.retrying": "重新掃描中…",
        "arch.retryDone": "已重新生成",
        "arch.retryFailed": "重新掃描失敗",
        "actions.continue": "繼續上次開發",
        "actions.openDashboard": "開啟 Dashboard",
        "actions.closeDashboard": "收起 Dashboard",
        "actions.copied": "已複製，貼上到輸入框傳送",
        "actions.copyFail": "複製失敗，請手動輸入",
        "todostrip.title": "活躍待辦",
        "todostrip.viewAll": "檢視全部",
        "todostrip.close": "收起",
        "todostrip.empty": "🎉 暫無活躍待辦",
        "onboarding.title": "專案大腦未啟動",
        "onboarding.body": "啟動後會掃描專案、生成架構，並在之後的對話裡自動帶上記憶和待辦。快速上手，越用越懂，長期把專案做下去。",
        "onboarding.cta": "啟動專案大腦",
        "onboarding.f1.title": "讀懂專案",
        "onboarding.f1.desc": "識別技術棧與入口，生成分層架構",
        "onboarding.f2.title": "跨會話記住",
        "onboarding.f2.desc": "新對話自動帶上專案上下文，不用重複介紹",
        "onboarding.f3.title": "接著往下做",
        "onboarding.f3.desc": "待辦和記憶留在專案裡，回來就能續上",
        "onboarding.more": "記憶沉澱、Git 歷史可在啟動後使用",
        "onboarding.copyPrompt": "請掃描本專案：呼叫 project_init 工具生成專案大腦",
        "onboarding.copied": "已複製啟動指令，貼上傳送即可",
        "loading": "載入中…",
        "snapshot.label": "快照",
        "snapshot.autoSync": "離線快照；連線恢復後自動切換即時資料",
        "runtime.label": "即時",
        "runtime.synced": "資料來自當前 Session workspace",
        "time.justNow": "剛剛",
        "time.minutesAgo": "{n} 分鐘前",
        "time.hoursAgo": "{n} 小時前",
        "time.daysAgo": "{n} 天前",
        "prio.urgent": "緊急",
        "prio.high": "高",
        "prio.medium": "中",
        "prio.low": "低",
        "st.pending": "待辦",
        "st.in_progress": "進行中",
        "st.blocked": "阻塞",
        "st.done": "已完成",
        "st.cancelled": "已取消",
        "dash.title": "Dashboard · 專案全景",
        "dash.tech": "技術棧",
        "dash.devops": "交付",
        "dash.entry": "開發入口",
        "dash.todo": "待辦（全部）",
        "dash.timeline": "時間線",
        "dash.memory": "專案記憶",
        "dash.memory.core": "當前 Core（每輪注入）",
        "dash.memory.dormant": "休眠（不注入，可用 project_ask）",
        "dash.memory.dormantShow": "展開休眠記憶",
        "dash.memory.dormantHide": "收起休眠記憶",
        "dash.memory.archived": "已歸檔（不注入、不檢索，可恢復或永久刪除）",
        "dash.memory.archivedShow": "展開已歸檔",
        "dash.memory.archivedHide": "收起已歸檔",
        "dash.tab.overview": "概覽",
        "dash.tab.architecture": "架構",
        "dash.tab.work": "任務動態",
        "dash.tab.knowledge": "專案記憶",
        "dash.tab.git": "Git 歷史",
        "dash.tab.settings": "設定",
        "settings.probe.embedding": "測試向量連通",
        "settings.probe.llm": "測試會話 LLM",
        "settings.probe.embeddingHint": "用當前表單值請求一次 embeddings，不寫 cache。未儲存的修改也會用於本次測試。",
        "settings.probe.llmHint": "探測當前 DSH 會話的模型路由，會話摘要和架構增強用的是同一條 LLM。",
        "settings.probe.running": "測試中…",
        "dash.snapshot": "資料快照 · {time}",
        "dash.none": "（空）",
        "briefing.what": "這是什麼",
        "briefing.recent": "最近做什麼",
        "briefing.stale": "架構可能過期，關鍵檔案按掃描入口降級。",
        "briefing.empty": "（暫無）",
        "briefing.recent.empty": "還沒有會話摘要",
        "briefing.recent.outdated": "可能已過時",
        "graph.title": "開發主幹",
        "graph.empty": "還沒有可展示的會話節點",
        "graph.collapsed": "已摺疊 {n} 段無實質產出的記錄",
        "graph.expandAll": "展開全部",
        "graph.collapse": "按重要節點顯示",
        "graph.edge.todo": "TODO",
        "graph.edge.supersede": "替代",
        "graph.edge.architecture": "架構",
        "graph.filesMore": "+{n} 個檔案",
        "suggest.title": "💡 你今天可能想推進",
        "suggest.llmTag": "AI 推薦",
        "suggest.localTag": "本地推薦",
        "suggest.fallbackTag": "AI 暫不可用",
        "suggest.loading": "分析今天的續接建議…",
        "suggest.confidence": "置信度 {pct}%",
        "suggest.refresh": "重新生成",
        "suggest.dismiss": "收起",
        "suggest.empty": "暫無活躍任務和近期記憶，可用 project_todo_add 規劃下一步",
        "suggest.reasonLabel": "依據",
        "mem.type.decision": "決策",
        "mem.type.bug": "Bug",
        "mem.type.lesson": "教訓",
        "mem.type.requirement": "需求",
        "mem.type.architecture": "架構",
        "mem.type.change": "變更",
        "mem.type.context": "備註",
        "mem.type.issue": "問題",
        "mem.type.preference": "偏好",
      },
      "en-US": {
        "tab.label": "Project",
        "header.section": "Project",
        "header.untitled": "Untitled project",
        "header.lastUpdate": "Last update",
        "phase.title": "Current phase",
        "phase.empty": "No tasks in progress",
        "todo.title": "TODO",
        "todo.empty": "No pending todos",
        "activity.title": "Recent activity",
        "activity.empty": "No recent activity",
        "memories.title": "Memories",
        "stats.title": "Stats",
        "stats.pending": "Pending",
        "stats.done": "Done",
        "stats.decisions": "Decisions",
        "codegraph.title": "Code",
        "codegraph.files": "files",
        "codegraph.edges": "edges",
        "codegraph.langs": "langs",
        "codegraph.noLang": "No language data",
        "arch.title": "Project architecture",
        "arch.modules": "modules",
        "arch.edges": "edges",
        "arch.local": "Local analysis",
        "arch.hybrid": "DSH LLM enriched",
        "arch.select": "Click a layer for peer modules, or a module for its duty",
        "arch.flows": "Runtime path",
        "arch.flowEmpty": "No runtime path to show yet",
        "arch.peersHint": "Modules in a layer are peers, not a sequence",
        "arch.inspectLayer": "Layer",
        "arch.inspectModule": "Module",
        "arch.related": "Collaborates with",
        "arch.runtime": "Runtime path",
        "arch.empty": "No layers to show yet",
        "arch.purpose": "Project purpose",
        "arch.risks": "Architecture notes",
        "arch.style": "Architecture style",
        "arch.layers": "Architecture layers",
        "arch.components": "Core components",
        "arch.keyFiles": "Key file guide",
        "arch.start": "Getting started",
        "arch.highlights": "Design highlights",
        "arch.trigger": "Trigger",
        "arch.outcome": "Outcome",
        "arch.llmFallback": "DSH LLM was unavailable; showing local inference",
        "arch.actionRetry": "Rescan",
        "arch.actionChat": "Send a message first",
        "arch.actionSettings": "Check DSH model route",
        "arch.retrying": "Rescanning…",
        "arch.retryDone": "Regenerated",
        "arch.retryFailed": "Rescan failed",
        "actions.continue": "Continue last session",
        "actions.openDashboard": "Open full Dashboard",
        "actions.closeDashboard": "Close Dashboard",
        "actions.copied": "Copied! Paste into input",
        "actions.copyFail": "Copy failed, type it manually",
        "todostrip.title": "Active TODOs",
        "todostrip.viewAll": "View all",
        "todostrip.close": "Collapse",
        "todostrip.empty": "🎉 No active TODOs",
        "onboarding.title": "Project Brain not started",
        "onboarding.body": "Scan the project, map the architecture, and carry memory and todos into later chats. Get up to speed fast, understand more as you go, and keep the project moving long-term.",
        "onboarding.cta": "Start Project Brain",
        "onboarding.f1.title": "Understand the project",
        "onboarding.f1.desc": "Detect stack and entry points, then map layers",
        "onboarding.f2.title": "Remember across sessions",
        "onboarding.f2.desc": "New chats pick up project context automatically",
        "onboarding.f3.title": "Pick up where you left off",
        "onboarding.f3.desc": "Todos and memories stay with the project",
        "onboarding.more": "Memory capture and Git history are available after start",
        "onboarding.copyPrompt": "Please scan this project: call the project_init tool to build the project brain",
        "onboarding.copied": "Command copied, paste & send",
        "loading": "Loading…",
        "snapshot.label": "snapshot",
        "snapshot.autoSync": "Offline snapshot; switches to live data when connected",
        "runtime.label": "live",
        "runtime.synced": "Data resolved from the current Session workspace",
        "time.justNow": "just now",
        "time.minutesAgo": "{n} min ago",
        "time.hoursAgo": "{n}h ago",
        "time.daysAgo": "{n}d ago",
        "prio.urgent": "urgent",
        "prio.high": "high",
        "prio.medium": "medium",
        "prio.low": "low",
        "st.pending": "pending",
        "st.in_progress": "in progress",
        "st.blocked": "blocked",
        "st.done": "done",
        "st.cancelled": "cancelled",
        "dash.title": "Dashboard · Full view",
        "dash.tech": "Tech stack",
        "dash.devops": "Delivery",
        "dash.entry": "Entrypoints",
        "dash.todo": "TODO (all)",
        "dash.timeline": "Timeline",
        "dash.memory": "Memories",
        "dash.memory.core": "Core (injected every session)",
        "dash.memory.dormant": "Dormant (askable, not injected)",
        "dash.memory.dormantShow": "Show dormant memories",
        "dash.memory.dormantHide": "Hide dormant memories",
        "dash.memory.archived": "Archived (not injected or retrieved; restore or delete permanently)",
        "dash.memory.archivedShow": "Show archived",
        "dash.memory.archivedHide": "Hide archived",
        "dash.tab.overview": "Overview",
        "dash.tab.architecture": "Architecture",
        "dash.tab.work": "Work & activity",
        "dash.tab.knowledge": "Knowledge",
        "dash.tab.git": "Git history",
        "dash.tab.settings": "Settings",
        "settings.probe.embedding": "Test embedding",
        "settings.probe.llm": "Test session LLM",
        "settings.probe.embeddingHint": "Sends one embeddings request with the form values. Does not write cache. Unsaved edits are included.",
        "settings.probe.llmHint": "Pings the current DSH session model used by session summary and architecture enrichment.",
        "settings.probe.running": "Testing…",
        "dash.snapshot": "Data snapshot · {time}",
        "dash.none": "(empty)",
        "briefing.what": "What this is",
        "briefing.recent": "What we did recently",
        "briefing.stale": "Architecture may be stale; key files fall back to scan entrypoints.",
        "briefing.empty": "(none)",
        "briefing.recent.empty": "No session summary yet",
        "briefing.recent.outdated": "may be outdated",
        "graph.title": "Development trunk",
        "graph.empty": "No session nodes to show yet",
        "graph.collapsed": "Collapsed {n} records with no substantive output",
        "graph.expandAll": "Expand all",
        "graph.collapse": "Show important nodes",
        "graph.edge.todo": "TODO",
        "graph.edge.supersede": "Supersede",
        "graph.edge.architecture": "Architecture",
        "graph.filesMore": "+{n} files",
        "suggest.title": "💡 Today you may want to continue",
        "suggest.llmTag": "AI",
        "suggest.localTag": "Local",
        "suggest.fallbackTag": "AI unavailable",
        "suggest.loading": "Analyzing today’s continuation…",
        "suggest.confidence": "confidence {pct}%",
        "suggest.refresh": "Refresh",
        "suggest.dismiss": "Dismiss",
        "suggest.empty": "No active tasks or recent memories. Try project_todo_add to plan next steps.",
        "suggest.reasonLabel": "Why",
        "mem.type.decision": "Decision",
        "mem.type.bug": "Bug",
        "mem.type.lesson": "Lesson",
        "mem.type.requirement": "Requirement",
        "mem.type.architecture": "Architecture",
        "mem.type.change": "Change",
        "mem.type.context": "Note",
        "mem.type.issue": "Issue",
        "mem.type.preference": "Preference",
      },
    };

    function interpolate(template, vars) {
      if (!template || !vars) return template || "";
      return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
    }

    function makeT(localeCode) {
      const d = dicts[localeCode] || dicts["zh-CN"];
      return (key, vars) => interpolate(d[key] || dicts["zh-CN"][key] || key, vars);
    }

    function formatRelativeTime(ts, now, localeCode) {
      const diff = now - ts;
      const t = makeT(localeCode);
      if (diff < 60_000) return t("time.justNow");
      const minutes = Math.floor(diff / 60_000);
      if (minutes < 60) return t("time.minutesAgo", { n: minutes });
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return t("time.hoursAgo", { n: hours });
      const days = Math.floor(hours / 24);
      return t("time.daysAgo", { n: days });
    }

    function formatDate(ts) {
      try {
        const d = new Date(ts);
        const p = (n) => (n < 10 ? "0" + n : "" + n);
        return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
      } catch (e) { return ""; }
    }

    // v1.1.x-fix: 語言使用率歸一化（按檔案數降序 + 百分比 + 長尾聚合）
    // 輸入 { lang: count } 或 null/undefined；輸出 { top: [{lang,count,percent}], tail: {count,percent,languages}|null, total, distinctCount }
    // topN 預設 8（典型專案 ≤8 種都能完整展示；更多則把後位合併為"其它"chip）
    function formatLanguagesUsage(languages, opts) {
      const obj = languages && typeof languages === "object" ? languages : {};
      const entries = Object.entries(obj)
        .filter(([, c]) => Number(c) > 0)
        .map(([lang, count]) => ({ lang: String(lang), count: Number(count) || 0 }))
        .sort((a, b) => b.count - a.count || a.lang.localeCompare(b.lang));
      const total = entries.reduce((s, e) => s + e.count, 0);
      const topN = opts && Number.isFinite(opts.topN) ? Math.max(1, opts.topN | 0) : 8;
      const mergeTail = opts && opts.mergeTail === false ? false : true;
      const head = entries.slice(0, topN);
      const tailList = entries.slice(topN);
      const withPct = (e) => Object.assign({}, e, { percent: total > 0 ? (e.count / total) * 100 : 0 });
      const top = head.map(withPct);
      let tail = null;
      if (mergeTail && tailList.length > 0) {
        const tailCount = tailList.reduce((s, e) => s + e.count, 0);
        tail = { count: tailCount, percent: total > 0 ? (tailCount / total) * 100 : 0, languages: tailList.length };
      } else if (!mergeTail && tailList.length > 0) {
        for (const e of tailList) top.push(withPct(e));
      }
      return { top, tail, total, distinctCount: entries.length };
    }

    function copyPrompt(text, ev, okLabel, failLabel) {
      let ok = false;
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText(text);
          ok = true;
        }
      } catch (e) {}
      if (!ok) {
        try {
          if (typeof document !== "undefined" && typeof document.createElement === "function") {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            ok = document.execCommand("copy");
            document.body.removeChild(ta);
          }
        } catch (e) {}
      }
      const btn = ev && (ev.currentTarget || ev.target);
      if (btn && (okLabel || failLabel)) {
        try { btn.textContent = ok ? (okLabel || "OK") : (failLabel || "FAIL"); } catch (e) {}
      }
    }

    function toggleDashboard(ev, t) {
      const el = (typeof document !== "undefined" && typeof document.getElementById === "function")
        ? document.getElementById("dsh-brain-dashboard") : null;
      const btn = ev && (ev.currentTarget || ev.target);
      if (!el) return;
      const open = el.style.display === "none";
      el.style.display = open ? "block" : "none";
      // v0.4.12: 按鈕文案統一為"檢視 Dashboard · 專案全景"，點選後不再切換文案
      // 改用按鈕右側小圖示（▾ 已展開 / ▸ 已摺疊）作為狀態指示
      const indicator = btn && btn.querySelector("[data-dashboard-indicator]");
      if (indicator) indicator.textContent = open ? "▾" : "▸";
      if (open && el.scrollIntoView) {
        try { el.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
      }
    }

    const sectionStyle = {
      padding: "14px 16px",
      background: "var(--dsw-alias-bg-layer-1)",
      color: "var(--dsw-alias-label-primary)",
      borderRadius: "10px",
      margin: "8px 12px",
      border: "1px solid var(--dsw-alias-border-l1)",
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    };
    const sectionTitleStyle = {
      margin: "0 0 10px",
      fontSize: "12px",
      fontWeight: "600",
      letterSpacing: "0.4px",
      color: "var(--dsw-alias-label-secondary)",
      display: "flex",
      alignItems: "center",
      gap: "6px",
    };
    const chipStyle = {
      padding: "2px 8px",
      background: "var(--dsw-alias-bg-layer-2)",
      color: "var(--dsw-alias-label-primary)",
      fontSize: "11px",
      borderRadius: "10px",
      fontWeight: "500",
      marginRight: "4px",
      display: "inline-block",
    };

    // ─── build-time embed 資料 ───
    const __PROJECT_DATA__ = /*#__PURE__*/ JSON.parse(__PROJECT_DATA_JSON__);
    const __CODEGRAPH_EMBED__ = __CODEGRAPH_JSON__ && __CODEGRAPH_JSON__ !== "null"
      ? JSON.parse(__CODEGRAPH_JSON__) : null;
    const __ALL_WORKSPACES__ = (typeof __ALL_WORKSPACES_JSON__ !== "undefined" && __ALL_WORKSPACES_JSON__ !== "null")
      ? JSON.parse(__ALL_WORKSPACES_JSON__) : null;

    const DEMO_ONBOARDING = (typeof location !== "undefined")
      ? location.search.indexOf("dsh_brain_demo=onboarding") >= 0 : false;

    // ─── build-time fallback：解析 embed 多 workspace 索引 ───
    // Connection RPC 請求完成前使用的離線快照降級。
    // v1.1.x-fix: embedded 階段不再預設 hint（hint 是執行時降級訊號，embedded 不知道 host 是否能成功）。
    //   首屏一律走 loading，等 host RPC 真正答覆後再決定渲染 dashboard / Onboarding / 兜底 banner。
    function resolvePreview(props) {
      const sid = (props && props.sessionId) || null;
      const wsMap = __ALL_WORKSPACES__ || {};
      const sessionToWsId = wsMap.sessionToWorkspaceId || {};
      let wsId = sid ? sessionToWsId[sid] : null;
      let projects = (wsId && wsMap.workspaceProjects && wsMap.workspaceProjects[wsId]) || [];
      let wsPath = (wsId && wsMap.workspacePaths && wsMap.workspacePaths[wsId]) || null;
      const picked = projects.length > 0 ? projects[0] : null;
      if (!picked) {
        return {
          data: {
            initialized: false,
            project: null,
            phase: null,
            recentActivity: [],
            memories: [],
            memoriesAll: [],
            todos: [],
            timelineAll: [],
            stats: { pendingTodos: 0, completedTodos: 0, decisions: 0 },
            _workspaceId: wsId,
            _workspacePath: wsPath,
            _sessionId: sid,
          },
          workspaceId: wsId,
          workspacePath: wsPath,
          sessionId: sid,
          hint: "",
          source: "snapshot",
        };
      }
      const merged = Object.assign({}, picked, {
        codegraph: (picked && picked.codegraph) || __CODEGRAPH_EMBED__,
      });
      merged._workspaceId = wsId;
      merged._workspacePath = wsPath;
      merged._sessionId = sid;
      return { data: merged, workspaceId: wsId, workspacePath: wsPath, sessionId: sid, hint: "", source: "snapshot" };
    }

    // 專案 type → emoji
    const projectIcon = (type) => {
      const t = (type || "").toLowerCase();
      if (t.includes("frontend") || t.includes("web") || t.includes("ui")) return "🎨";
      if (t.includes("backend") || t.includes("api") || t.includes("server")) return "⚙️";
      if (t.includes("lib") || t.includes("tool") || t.includes("util")) return "📚";
      if (t.includes("cli")) return "💻";
      if (t.includes("mobile") || t.includes("app")) return "📱";
      return "📦";
    };

    // ─── 區塊元件（純函式） ───
    function pathSep(p) {
      return p && String(p).indexOf("\\") >= 0 ? "\\" : "/";
    }
    function readRpcResult(resp) {
      if (!resp || resp.ok !== true) {
        throw new Error((resp && resp.error && resp.error.message) || "請求失敗");
      }
      const value = resp.value && typeof resp.value === "object" ? resp.value : {};
      const result = value.result && typeof value.result === "object" ? value.result : null;
      const nested = result && result.data && typeof result.data === "object" && !Array.isArray(result.data)
        ? result.data
        : null;
      const out = {};
      const layers = [nested, result, value];
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        if (!layer) continue;
        const keys = Object.keys(layer);
        for (let k = 0; k < keys.length; k++) {
          const key = keys[k];
          if (key === "result" || key === "data" || key === "preview" || key === "ok" || key === "name") continue;
          if (out[key] == null && layer[key] != null) out[key] = layer[key];
        }
      }
      return out;
    }
    function notifyPreviewChanged() {
      try {
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
          window.dispatchEvent(new CustomEvent("project_brain/preview.changed", { detail: {} }));
        }
      } catch (e) {}
    }

    function HeaderBlock({ data, t, sessionId, connection }) {
      const p = data && data.project;
      const icon = p ? projectIcon(p.type) : "";
      const rpc = connection && connection.rpc;
      const [previewState, setPreviewState] = React.useState(null);
      const [backupList, setBackupList] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [toast, setToast] = React.useState(null);
      const [importPick, setImportPick] = React.useState(null); // { path, error }

      if (!p) return null;

      function showToast(kind, text, ttlMs = 4000) {
        setToast({ kind, text, id: Date.now(), copyPath: null, openFolderPath: null });
        if (typeof window !== "undefined") {
          window.setTimeout(() => setToast(null), ttlMs);
        }
      }
      function setToastActions(actions) {
        setToast((prev) => prev ? Object.assign({}, prev, actions || {}) : prev);
      }
      async function openFolderInExplorer(folderPath) {
        if (!folderPath) return;
        try {
          const resp = await callRpc("export.openFolder", { folderPath });
          if (!resp || !resp.ok) {
            throw new Error((resp && resp.error && resp.error.message) || "無法開啟資料夾");
          }
          showToast("info", "已嘗試開啟資料夾：" + folderPath, 3000);
        } catch (e) {
          // 降級：複製路徑，讓使用者自己 Win+R 貼上
          if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard.writeText(folderPath).catch(() => {});
          }
          showToast("error", "開啟資料夾失敗，路徑已複製到剪貼簿：" + folderPath, 6000);
        }
      }
      function sizeFormat(bytes) {
        if (!bytes || bytes < 1024) return (bytes || 0) + " B";
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
        return (bytes / (1024 * 1024)).toFixed(2) + " MB";
      }

      async function callRpc(endpoint, payload) {
        if (!rpc || typeof rpc.call !== "function") {
          throw new Error("DSH Connection RPC 不可用");
        }
        return rpc.call("/project-brain", endpoint, Object.assign({ sessionId: sessionId || undefined }, payload || {}));
      }

      async function handleExport() {
        if (busy) return;
        setBusy(true);
        try {
          const resp = await callRpc("export.run", { includeCache: true });
          const result = readRpcResult(resp);

          const bundlePath = typeof result.bundlePath === "string" ? result.bundlePath : null;
          const bundleName = typeof result.bundleName === "string" ? result.bundleName : null;
          let dirPath = null;
          if (bundlePath && /[\\/]/.test(bundlePath)) {
            const sep = bundlePath.lastIndexOf("\\") > bundlePath.lastIndexOf("/")
              ? bundlePath.lastIndexOf("\\") : bundlePath.lastIndexOf("/");
            dirPath = bundlePath.slice(0, sep);
          } else if (bundlePath) {
            dirPath = ".";
          }
          const fileName = bundleName
            || (bundlePath ? bundlePath.split(/[\\/]/).pop() : null);
          const workspaceRoot = (data && data._workspacePath)
            || (data && data.workspaceRoot)
            || (data && data.project && (data.project.rootPath || data.project.root))
            || null;
          const defaultDir = result.defaultDirPath
            || dirPath
            || (workspaceRoot ? String(workspaceRoot).replace(/[\\/]+$/, "") + pathSep(workspaceRoot) + "dist-backups" : null);

          const copyPath = bundlePath || (defaultDir && fileName ? defaultDir + pathSep(defaultDir) + fileName : defaultDir);
          const openFolderPath = dirPath || defaultDir;

          let toastText;
          if (fileName) {
            toastText = "已匯出 " + fileName + "（" + sizeFormat(result.sizeBytes) + "）"
              + (copyPath ? "\n路徑：" + copyPath : "\n（路徑未返回，請在 dist-backups/ 目錄查詢）");
          } else {
            toastText = "匯出成功（未拿到檔名，請在 dist-backups/ 目錄查詢）"
              + (openFolderPath ? "\n目錄：" + openFolderPath : "");
          }
          showToast("success", toastText, 8000);
          setToastActions({
            copyPath: copyPath || openFolderPath,
            openFolderPath: openFolderPath,
          });
        } catch (e) {
          showToast("error", "匯出失敗：" + String((e && e.message) || e));
        } finally {
          setBusy(false);
        }
      }

      async function handleImportPick() {
        if (busy) return;
        setImportPick({ path: "", error: null });
      }

      async function handleImportBrowse() {
        if (busy) return;
        try {
          const resp = await callRpc("import.pickBundle", {});
          if (!resp || !resp.ok) {
            const msg = (resp && resp.error && resp.error.message) || "系統檔案選擇器不可用";
            setImportPick((prev) => Object.assign({}, prev || { path: "" }, { error: msg + "。請貼上 zip 的完整路徑。" }));
            return;
          }
          const value = (resp && resp.value) || {};
          if (value.canceled) return;
          if (value.bundlePath) {
            setImportPick({ path: String(value.bundlePath), error: null });
          }
        } catch (e) {
          setImportPick((prev) => Object.assign({}, prev || { path: "" }, {
            error: "無法開啟檔案選擇器：" + String((e && e.message) || e) + "。請貼上 zip 的完整路徑。",
          }));
        }
      }

      async function handleImportPreviewFromDialog() {
        if (busy || !importPick) return;
        const bundlePath = String(importPick.path || "").trim();
        if (!bundlePath) {
          setImportPick(Object.assign({}, importPick, { error: "請填寫 bundle zip 的完整路徑" }));
          return;
        }
        setBusy(true);
        try {
          const resp = await callRpc("import.preview", { bundlePath });
          const result = readRpcResult(resp);
          setImportPick(null);
          setPreviewState({ kind: "import", data: result });
        } catch (e) {
          setImportPick(Object.assign({}, importPick, { error: "預覽失敗：" + String((e && e.message) || e) }));
        } finally {
          setBusy(false);
        }
      }

      async function handleImportConfirm() {
        if (!previewState || previewState.kind !== "import" || busy) return;
        const d = previewState.data || {};
        const confirmToken = d.confirmToken;
        const bundlePath = d.bundlePath;
        if (!confirmToken) {
          showToast("error", "缺少 confirmToken，請重新預覽");
          return;
        }
        if (!bundlePath) {
          showToast("error", "缺少 bundle 路徑，請重新預覽");
          return;
        }
        setBusy(true);
        try {
          const resp = await callRpc("import.apply", { bundlePath, confirmToken });
          const result = readRpcResult(resp);
          setPreviewState(null);
          notifyPreviewChanged();
          const extra = result.rescanError
            ? " 腦已寫入，但自動重掃失敗，可手動點「重新掃描」。"
            : (result.backupPath ? " 舊腦已備份。" : "");
          showToast("success", "已恢復。" + extra);
        } catch (e) {
          showToast("error", "匯入失敗：" + String((e && e.message) || e));
        } finally {
          setBusy(false);
        }
      }

      async function handleRollbackOpen() {
        if (busy) return;
        setBusy(true);
        try {
          const resp = await callRpc("backup.list", {});
          const value = readRpcResult(resp);
          const backups = (value && value.backups) || [];
          if (backups.length === 0) {
            showToast("info", "當前專案沒有本地備份");
          } else {
            setBackupList(backups);
          }
        } catch (e) {
          showToast("error", "獲取備份列表失敗：" + String((e && e.message) || e));
        } finally {
          setBusy(false);
        }
      }

      async function handleRollbackPick(backup) {
        if (!backup || busy) return;
        setBusy(true);
        try {
          const resp = await callRpc("backup.rollback.preview", { backupTimestamp: backup.ts });
          const result = readRpcResult(resp);
          setBackupList(null);
          setPreviewState({ kind: "rollback", data: result, backup });
        } catch (e) {
          showToast("error", "預覽失敗：" + String((e && e.message) || e));
        } finally {
          setBusy(false);
        }
      }

      async function handleRollbackConfirm() {
        if (!previewState || previewState.kind !== "rollback" || busy) return;
        const d = previewState.data || {};
        const confirmToken = d.confirmToken;
        const backupTimestamp = d.backupTimestamp || d.sourceBackupTs
          || (d.sourceBackup && d.sourceBackup.ts);
        if (!confirmToken || !backupTimestamp) {
          showToast("error", "缺少 confirmToken，請重新選擇");
          return;
        }
        setBusy(true);
        try {
          const resp = await callRpc("backup.rollback.apply", { backupTimestamp, confirmToken });
          readRpcResult(resp);
          setPreviewState(null);
          notifyPreviewChanged();
          showToast("success", "已回滾到 " + backupTimestamp);
        } catch (e) {
          showToast("error", "回滾失敗：" + String((e && e.message) || e));
        } finally {
          setBusy(false);
        }
      }

      // ─── 按鈕樣式（與 chip 同行不換行，靠右） ───
      const headerBtnBase = {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "4px 10px",
        background: "var(--dsw-alias-bg-layer-2)",
        color: "var(--dsw-alias-label-primary)",
        border: "1px solid var(--dsw-alias-border-l1)",
        borderRadius: "8px",
        fontSize: "11px",
        fontWeight: "500",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "background 0.15s ease, border-color 0.15s ease, transform 0.1s ease",
      };

      function renderButton(emoji, label, onClick, key, opts) {
        opts = opts || {};
        const style = Object.assign({}, headerBtnBase, opts.style || {}, busy ? { opacity: 0.55, cursor: "wait" } : {});
        return React.createElement("button", {
          key: key,
          type: "button",
          "data-brain-action": key,
          title: opts.title || label,
          disabled: busy || !!opts.disabled,
          onClick: onClick,
          style: style,
          onMouseEnter: (e) => { if (!busy) e.currentTarget.style.borderColor = "var(--dsw-alias-brand-primary)"; },
          onMouseLeave: (e) => { e.currentTarget.style.borderColor = "var(--dsw-alias-border-l1)"; },
        },
          React.createElement("span", { style: { fontSize: "13px", lineHeight: "1" } }, emoji),
          React.createElement("span", null, label),
        );
      }

      const actionBar = React.createElement("div", {
        style: { display: "flex", gap: "6px", flexShrink: 0, marginLeft: "auto" },
        "data-brain-action-bar": "1",
      },
        renderButton("💾", "備份", handleExport, "export", { title: "匯出當前腦到 zip 檔案" }),
        renderButton("📥", "恢復", handleImportPick, "import", { title: "從 zip 檔案恢復腦（覆蓋當前）" }),
        renderButton("↩️", "回滾", handleRollbackOpen, "rollback", { title: "從本地歷史備份回滾" }),
      );

      return React.createElement(
        "section",
        { style: Object.assign({}, sectionStyle, { padding: "16px 18px", background: "linear-gradient(135deg, var(--dsw-alias-bg-layer-1) 0%, var(--dsw-alias-bg-layer-2) 100%)" }), "data-block": "header" },
        React.createElement("h3", { style: Object.assign({}, sectionTitleStyle, { fontSize: "11px" }) }, "📁 " + t("header.section")),
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "nowrap", marginTop: "2px", minWidth: 0 } },
          React.createElement("span", { style: { fontSize: "22px", flexShrink: 0 } }, icon),
          React.createElement("span", { style: { fontSize: "18px", fontWeight: "600", letterSpacing: "0.2px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, p.name || t("header.untitled")),
          p.type
            ? React.createElement("span", { style: { padding: "2px 10px", background: "var(--dsw-alias-brand-primary)", color: "var(--dsw-alias-bg-base)", fontSize: "11px", borderRadius: "10px", fontWeight: "600", flexShrink: 0 } }, p.type)
            : null,
          actionBar,
        ),
        p.description && p.description !== "Auto-generated by dsh-project-brain"
          ? React.createElement("p", { style: { margin: "8px 0 0", fontSize: "12px", lineHeight: "1.55", color: "var(--dsw-alias-label-secondary)" } }, String(p.description).slice(0, 280))
          : null,
        p.lastUpdateAt
          ? React.createElement("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)", marginTop: "6px", display: "flex", alignItems: "center", gap: "4px" } },
              React.createElement("span", null, "🕒"),
              React.createElement("span", null, `${t("header.lastUpdate")} · ${formatRelativeTime(p.lastUpdateAt, Date.now(), data._localeCode)}`),
            )
          : null,
        // ─── Dialogs（同一組件內掛載，狀態由 useState 管理） ───
        previewState ? renderPreviewDialog(previewState, { onCancel: () => setPreviewState(null), onConfirm: previewState.kind === "import" ? handleImportConfirm : handleRollbackConfirm, busy }) : null,
        importPick ? renderImportPathDialog(importPick, {
          onCancel: () => setImportPick(null),
          onChange: (path) => setImportPick({ path, error: null }),
          onBrowse: handleImportBrowse,
          onPreview: handleImportPreviewFromDialog,
          busy,
        }) : null,
        backupList ? renderBackupListDialog(backupList, { onCancel: () => setBackupList(null), onPick: handleRollbackPick, busy }) : null,
        toast ? renderToast(toast, () => setToast(null), openFolderInExplorer) : null,
      );
    }

    function renderImportPathDialog(state, { onCancel, onChange, onBrowse, onPreview, busy }) {
      const overlayStyle = {
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999,
      };
      const cardStyle = {
        background: "var(--dsw-alias-bg-base)",
        color: "var(--dsw-alias-label-primary)",
        borderRadius: "12px",
        padding: "20px 24px",
        maxWidth: "560px",
        width: "calc(100% - 32px)",
        boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
      };
      const btnBase = {
        padding: "8px 16px",
        borderRadius: "8px",
        fontSize: "13px",
        fontWeight: "600",
        cursor: busy ? "wait" : "pointer",
        border: "1px solid transparent",
        fontFamily: "inherit",
      };
      return React.createElement("div", {
        style: overlayStyle, onClick: (e) => { if (e.target === e.currentTarget) onCancel(); },
      },
        React.createElement("div", { style: cardStyle, "data-brain-dialog": "import-path" },
          React.createElement("h2", { style: { margin: "0 0 8px", fontSize: "16px", fontWeight: "600" } }, "從 bundle 恢復"),
          React.createElement("p", { style: { margin: "0 0 12px", fontSize: "12px", lineHeight: "1.5", color: "var(--dsw-alias-label-secondary)" } },
            "選擇或貼上匯出的 zip 完整路徑。恢復會覆蓋當前腦，下一步會先給你預覽再確認。"),
          React.createElement("div", { style: { display: "flex", gap: "8px" } },
            React.createElement("input", {
              type: "text",
              value: state.path || "",
              placeholder: "貼上匯出的 zip 完整路徑",
              disabled: busy,
              onChange: (e) => onChange(e.target.value),
              onKeyDown: (e) => { if (e.key === "Enter") onPreview(); },
              style: {
                flex: "1 1 auto",
                padding: "8px 10px",
                borderRadius: "8px",
                border: "1px solid var(--dsw-alias-border-l1)",
                background: "var(--dsw-alias-bg-layer-2)",
                color: "var(--dsw-alias-label-primary)",
                fontSize: "12px",
                fontFamily: "inherit",
              },
            }),
            React.createElement("button", {
              type: "button", onClick: onBrowse, disabled: busy,
              style: Object.assign({}, btnBase, {
                background: "var(--dsw-alias-bg-layer-2)",
                color: "var(--dsw-alias-label-primary)",
                borderColor: "var(--dsw-alias-border-l1)",
                flexShrink: 0,
              }),
            }, "瀏覽…"),
          ),
          state.error ? React.createElement("div", {
            style: { marginTop: "10px", fontSize: "12px", color: "var(--dsw-alias-state-error-primary)", lineHeight: "1.45" },
          }, state.error) : null,
          React.createElement("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" } },
            React.createElement("button", {
              type: "button", onClick: onCancel, disabled: busy,
              style: Object.assign({}, btnBase, { background: "transparent", color: "var(--dsw-alias-label-secondary)", borderColor: "var(--dsw-alias-border-l1)" }),
            }, "取消"),
            React.createElement("button", {
              type: "button", onClick: onPreview, disabled: busy,
              style: Object.assign({}, btnBase, { background: "var(--dsw-alias-brand-primary)", color: "var(--dsw-alias-bg-base)" }),
            }, busy ? "預覽中…" : "預覽影響"),
          ),
        ),
      );
    }

    // ─── 預覽彈框（覆蓋並恢復） ───
    function renderPreviewDialog(state, { onCancel, onConfirm, busy }) {
      const { kind, data } = state;
      const overlayStyle = {
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      };
      const cardStyle = {
        background: "var(--dsw-alias-bg-base)",
        color: "var(--dsw-alias-label-primary)",
        borderRadius: "12px",
        padding: "20px 24px",
        maxWidth: "560px",
        width: "calc(100% - 32px)",
        maxHeight: "calc(100vh - 64px)",
        overflow: "auto",
        boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
      };
      const titleStyle = {
        margin: "0 0 12px",
        fontSize: "16px",
        fontWeight: "600",
      };
      const fieldRow = (label, value) => React.createElement("div", {
        key: label, style: { display: "flex", gap: "8px", padding: "6px 0", borderBottom: "1px solid var(--dsw-alias-border-l1)", fontSize: "12px" },
      },
        React.createElement("span", { style: { color: "var(--dsw-alias-label-secondary)", minWidth: "110px" } }, label),
        React.createElement("span", { style: { flex: "1 1 auto", wordBreak: "break-all" } }, value),
      );
      const btnBase = {
        padding: "8px 16px",
        borderRadius: "8px",
        fontSize: "13px",
        fontWeight: "600",
        cursor: "pointer",
        border: "1px solid transparent",
        fontFamily: "inherit",
      };
      const cancelBtn = React.createElement("button", {
        key: "cancel", type: "button", onClick: onCancel, disabled: busy,
        style: Object.assign({}, btnBase, { background: "transparent", color: "var(--dsw-alias-label-secondary)", borderColor: "var(--dsw-alias-border-l1)" }),
      }, "取消");
      const confirmBtn = React.createElement("button", {
        key: "confirm", type: "button", onClick: onConfirm,
        disabled: busy || !(data && data.confirmToken),
        style: Object.assign({}, btnBase, { background: "var(--dsw-alias-state-warn-primary)", color: "var(--dsw-alias-bg-base)" }),
      }, busy ? "處理中…" : "覆蓋並恢復");
      const footerStyle = { display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "20px" };

      let title, fields, warning;
      const countOf = function () {
        for (let i = 0; i < arguments.length; i++) {
          const v = arguments[i];
          if (typeof v === "number" && Number.isFinite(v)) return v;
        }
        return 0;
      };
      const textOf = function () {
        for (let i = 0; i < arguments.length; i++) {
          const v = arguments[i];
          if (typeof v === "string" && v) return v;
        }
        return "";
      };
      if (kind === "import") {
        const impact = data.impact || {};
        const rewrite = impact.rootPathRewrite || {};
        const currentExists = !!(impact.currentBrainExists || data.currentBrainExists);
        const incomingMem = countOf(impact.incomingMemories, data.incomingMemories);
        const incomingTodos = countOf(impact.incomingTodos, data.incomingTodos);
        const incomingTimeline = countOf(impact.incomingTimeline, data.incomingTimeline);
        const currentMem = countOf(impact.currentMemories, data.currentMemories);
        const currentTodos = countOf(impact.currentTodos, data.currentTodos);
        const currentTimeline = countOf(impact.currentTimeline, data.currentTimeline);
        const backupTo = textOf(impact.backupWillCreateAt, data.backupWillCreateAt);
        const rootFrom = textOf(impact.rootPathFrom, data.rootPathFrom, rewrite.from);
        const rootTo = textOf(impact.rootPathTo, data.rootPathTo, rewrite.to);
        const sourceRoot = textOf(
          data.sourceProjectRoot,
          data.manifest && data.manifest.sourceProjectRoot,
          data.manifest && data.manifest.sourceProject && data.manifest.sourceProject.rootPath,
          data.bundlePath,
        );
        title = "確認從 bundle 恢復腦";
        fields = [
          fieldRow("bundle 來源", sourceRoot || "（未知）"),
          fieldRow("當前腦", currentExists
            ? currentMem + " 記憶 / " + currentTodos + " 待辦 / " + currentTimeline + " timeline"
            : "（無）"),
          fieldRow("即將恢復", incomingMem + " 記憶 / " + incomingTodos + " 待辦 / " + incomingTimeline + " timeline"),
          fieldRow("舊腦將備份到", backupTo || "（無需，無腦）"),
          fieldRow("rootPath 改寫", (rootFrom || "（空）") + " → " + (rootTo || "（空）")),
        ];
        warning = textOf(data.warning) || (currentExists
          ? "⚠️ 這會覆蓋當前腦。舊腦會自動備份到上方的路徑，可繼續回滾。"
          : "這是該專案首次匯入，無舊腦可備份。");
      } else if (kind === "rollback") {
        const sb = data.sourceBackup || {};
        const cb = data.currentBrain || {};
        const currentExists = !!(cb.exists || data.currentBrainExists);
        const sourceName = textOf(sb.backupName, data.sourceBackupName, "（未知備份）");
        const sourceTs = textOf(sb.ts, data.sourceBackupTs, data.backupTimestamp);
        title = "確認回滾到備份";
        fields = [
          fieldRow("目標備份", sourceName + (sourceTs ? "（" + sourceTs + "）" : "")),
          fieldRow("備份內容",
            countOf(sb.memCount, data.sourceMemCount) + " 記憶 / "
            + countOf(sb.todoCount, data.sourceTodoCount) + " 待辦 / "
            + countOf(sb.timelineCount, data.sourceTimelineCount) + " timeline"),
          fieldRow("當前腦", currentExists
            ? countOf(cb.memCount, data.currentMemories) + " 記憶 / "
              + countOf(cb.todoCount, data.currentTodos) + " 待辦 / "
              + countOf(cb.timelineCount, data.currentTimeline) + " timeline"
            : "（無）"),
          fieldRow("當前腦先備份到", textOf(data.willBackupCurrentTo) || "（無需）"),
        ];
        warning = textOf(data.warning) || (currentExists
          ? "⚠️ 當前腦會自動備份到上方的路徑，可繼續回滾。"
          : "當前腦不存在，回滾後會成為當前腦。");
      }

      return React.createElement("div", { style: overlayStyle, onClick: (e) => { if (e.target === e.currentTarget) onCancel(); } },
        React.createElement("div", { style: cardStyle, "data-brain-dialog": "preview" },
          React.createElement("h2", { style: titleStyle }, title),
          React.createElement("div", null, fields),
          warning ? React.createElement("div", {
            style: { marginTop: "14px", padding: "10px 12px", background: "var(--dsw-alias-state-warn-secondary, rgba(255, 180, 0, 0.12))", borderRadius: "6px", fontSize: "12px", lineHeight: "1.5", color: "var(--dsw-alias-label-primary)" },
          }, warning) : null,
          React.createElement("div", { style: footerStyle }, cancelBtn, confirmBtn),
        ),
      );
    }

    // ─── 備份列表彈框 ───
    function renderBackupListDialog(backups, { onCancel, onPick, busy }) {
      const overlayStyle = {
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999,
      };
      const cardStyle = {
        background: "var(--dsw-alias-bg-base)",
        color: "var(--dsw-alias-label-primary)",
        borderRadius: "12px",
        padding: "20px 24px",
        maxWidth: "520px",
        width: "calc(100% - 32px)",
        maxHeight: "calc(100vh - 64px)",
        overflow: "auto",
        boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
      };
      const itemStyle = (hover) => ({
        display: "flex", flexDirection: "column", gap: "4px",
        padding: "10px 12px",
        borderRadius: "8px",
        background: hover ? "var(--dsw-alias-bg-layer-1)" : "var(--dsw-alias-bg-layer-2)",
        cursor: busy ? "wait" : "pointer",
        marginBottom: "6px",
        border: "1px solid var(--dsw-alias-border-l1)",
        transition: "background 0.1s ease",
      });
      return React.createElement("div", {
        style: overlayStyle, onClick: (e) => { if (e.target === e.currentTarget) onCancel(); },
      },
        React.createElement("div", { style: cardStyle, "data-brain-dialog": "backup-list" },
          React.createElement("h2", { style: { margin: "0 0 4px", fontSize: "16px", fontWeight: "600" } }, "選擇要回滾到的備份"),
          React.createElement("div", { style: { margin: "0 0 12px", fontSize: "11px", color: "var(--dsw-alias-label-secondary)" } }, "共 " + backups.length + " 個備份（按時間倒序）"),
          backups.map((b, i) => {
            const sizeKB = Math.max(1, Math.round((b.sizeBytes || 0) / 1024));
            const subtitle = (b.projectExists ? "" : "（不完整）") + ` · ${sizeKB} KB · ${b.memCount} mem / ${b.todoCount} todo`;
            return React.createElement("div", {
              key: b.ts, "data-backup-ts": b.ts,
              style: itemStyle(false),
              onClick: () => !busy && onPick(b),
              onMouseEnter: (e) => { e.currentTarget.style.background = "var(--dsw-alias-bg-layer-1)"; },
              onMouseLeave: (e) => { e.currentTarget.style.background = "var(--dsw-alias-bg-layer-2)"; },
            },
              React.createElement("div", { style: { fontSize: "13px", fontWeight: "600", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" } }, b.ts),
              React.createElement("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)" } }, subtitle),
            );
          }),
          React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", marginTop: "12px" } },
            React.createElement("button", {
              type: "button", onClick: onCancel, disabled: busy,
              style: { padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer", background: "transparent", color: "var(--dsw-alias-label-secondary)", border: "1px solid var(--dsw-alias-border-l1)", fontFamily: "inherit" },
            }, "取消"),
          ),
        ),
      );
    }

    // ─── Toast（右下角提示） ───
    function renderToast(toast, onDismiss, onOpenFolder) {
      const palette = {
        success: { bg: "var(--dsw-alias-state-success-primary)", fg: "var(--dsw-alias-bg-base)" },
        error:   { bg: "var(--dsw-alias-state-error-primary)", fg: "var(--dsw-alias-bg-base)" },
        info:    { bg: "var(--dsw-alias-brand-primary)", fg: "var(--dsw-alias-bg-base)" },
      };
      const p = palette[toast.kind] || palette.info;
      function handleToastClick() {
        if (toast.copyPath && typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText(toast.copyPath).then(
            () => {
              const el = document.querySelector("[data-brain-toast-copy-hint]");
              if (el) el.textContent = "✓ 已複製路徑";
            },
            () => onDismiss(),
          );
        } else {
          onDismiss();
        }
      }
      const hintLine = React.createElement("div", {
        "data-brain-toast-copy-hint": "1",
        style: { fontSize: "10px", opacity: 0.85, marginTop: "4px", fontWeight: "400" },
      },
        toast.copyPath ? "點選複製路徑" : (toast.openFolderPath ? "已嘗試在檔案管理器中開啟" : ""),
      );
      // 「在資料夾中顯示」按鈕（如果有 openFolderPath）
      const openFolderBtn = toast.openFolderPath ? React.createElement("button", {
        type: "button",
        onClick: (e) => { e.stopPropagation(); onOpenFolder(toast.openFolderPath); },
        "data-brain-toast-action": "open-folder",
        style: {
          marginTop: "6px",
          padding: "4px 10px",
          fontSize: "11px",
          fontWeight: "600",
          background: "var(--dsw-alias-bg-base)",
          color: "var(--dsw-alias-state-success-primary, var(--dsw-alias-brand-primary))",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
          fontFamily: "inherit",
        },
      }, "📂 在資料夾中顯示") : null;
      return React.createElement("div", {
        style: {
          position: "fixed", right: "20px", bottom: "20px",
          background: p.bg, color: p.fg,
          padding: "10px 14px",
          borderRadius: "8px",
          fontSize: "12px",
          fontWeight: "500",
          maxWidth: "440px",
          whiteSpace: "pre-line",
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          zIndex: 9999,
          cursor: toast.copyPath ? "pointer" : "default",
        },
        onClick: toast.copyPath ? handleToastClick : onDismiss,
      },
        toast.text,
        hintLine,
        openFolderBtn,
      );
    }

    // 專案狀態總覽（新增 v0.4.8）：3 大數字 + 一行解讀
    function StatusBannerBlock({ data, t, compact }) {
      const s = data.stats || {};
      const todos = (data.todos || []).filter((x) => x && x.status !== "done" && x.status !== "cancelled");
      const memories = data.memories || [];
      const lastAct = (data.recentActivity || [])[0];
      const statBox = (icon, value, label, color) =>
        React.createElement("div", { style: { flex: "1 1 0", textAlign: "center", padding: "10px 6px", borderRadius: "8px", background: "var(--dsw-alias-bg-layer-2)" } },
          React.createElement("div", { style: { fontSize: "20px", lineHeight: "1", marginBottom: "4px" } }, icon),
          React.createElement("div", { style: { fontSize: "20px", fontWeight: "700", lineHeight: "1.1", color: color || "var(--dsw-alias-label-primary)", fontVariantNumeric: "tabular-nums" } }, value),
          React.createElement("div", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)", marginTop: "4px", letterSpacing: "0.3px" } }, label),
        );
      // 一行解讀
      const tips = [];
      if (todos.length > 5) tips.push(`${todos.length} 個待辦較密集`);
      if (memories.length > 30) tips.push("記憶較多，可整理");
      const insight = lastAct ? `最近 ${formatRelativeTime(lastAct.occurredAt, Date.now(), data._localeCode)}` : "暫無活動";
      return React.createElement(
        "section",
        { style: Object.assign({}, sectionStyle, { padding: "12px 14px", margin: compact ? 0 : sectionStyle.margin }), "data-block": "status-banner" },
        React.createElement("div", { style: { display: "flex", gap: "6px" } },
          statBox("📋", todos.length, t("stats.pending"), todos.length > 0 ? "var(--dsw-alias-state-warn-primary)" : "var(--dsw-alias-label-secondary)"),
          statBox("🧠", memories.length, t("memories.title"), memories.length > 0 ? "var(--dsw-alias-brand-primary)" : "var(--dsw-alias-label-secondary)"),
          statBox("⚡", s.completedTodos || 0, t("stats.done"), "var(--dsw-alias-state-success-primary)"),
        ),
        React.createElement("div", { style: { marginTop: "8px", fontSize: "11px", color: "var(--dsw-alias-label-secondary)", display: "flex", alignItems: "center", gap: "4px" } },
          React.createElement("span", null, "💡"),
          React.createElement("span", null, insight + (tips.length > 0 ? " · " + tips.join("，") : "")),
        ),
      );
    }

    function PhaseBlock({ data, t, compact }) {
      const phaseSectionStyle = Object.assign({}, sectionStyle, { margin: compact ? 0 : sectionStyle.margin, height: compact ? "100%" : undefined, boxSizing: "border-box" });
      const phase = data.phase;
      if (!phase || !phase.progress) {
        return React.createElement("section", { style: phaseSectionStyle, "data-block": "phase" },
          React.createElement("h3", { style: sectionTitleStyle }, "🎯 " + t("phase.title")),
          React.createElement("p", { style: { margin: 0, opacity: 0.6, fontSize: "13px" } }, t("phase.empty")),
        );
      }
      const { done, total } = phase.progress;
      const percent = total > 0 ? Math.round((done / total) * 100) : 0;
      return React.createElement("section", { style: phaseSectionStyle, "data-block": "phase" },
        React.createElement("h3", { style: sectionTitleStyle }, "🎯 " + t("phase.title")),
        React.createElement("p", { style: { margin: "0 0 8px", fontSize: "14px", fontWeight: "500" } }, phase.title),
        React.createElement("div", { style: { height: "8px", background: "var(--dsw-alias-bg-layer-2)", borderRadius: "4px", overflow: "hidden", position: "relative" } },
          React.createElement("div", { style: { width: percent + "%", height: "100%", background: "var(--dsw-alias-state-success-primary)", transition: "width 0.4s ease", borderRadius: "4px" } }),
        ),
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "11px", color: "var(--dsw-alias-label-secondary)" } },
          React.createElement("span", null, `${done} / ${total}`),
          React.createElement("span", { style: { fontWeight: "600", color: "var(--dsw-alias-state-success-primary)" } }, percent + "%"),
        ),
      );
    }

    function TodoBlock({ data, t }) {
      const todos = (data.todos || []).filter((x) => x && x.status !== "done" && x.status !== "cancelled");
      if (todos.length === 0) return null;
      const items = todos.slice(0, 5);
      const overflow = todos.length - items.length;
      const statusBorder = (s) => ({ in_progress: "var(--dsw-alias-state-success-primary)", blocked: "var(--dsw-alias-state-error-primary)" })[s] || "var(--dsw-alias-border-l1)";
      const prioIcon = (p) => ({ urgent: "🔴", high: "🟠", medium: "🟡", low: "🟢" })[p] || "⚪";
      const statusIcon = (s) => ({ in_progress: "▶️", blocked: "⛔" })[s] || "📋";
      const todoCard = (x) => {
        const isActive = x.status === "in_progress";
        return React.createElement("div", {
          key: x.id,
          "data-todo-card": "1",
          style: {
            padding: "8px 10px 8px 12px",
            marginBottom: "6px",
            background: "var(--dsw-alias-bg-layer-2)",
            borderRadius: "8px",
            borderLeft: "3px solid " + statusBorder(x.status),
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
            transition: "transform 0.1s ease",
          },
        },
          React.createElement("div", { style: { fontSize: "13px", flex: "0 0 auto", lineHeight: "1.4" } }, statusIcon(x.status)),
          React.createElement("div", { style: { flex: "1 1 auto", minWidth: 0 } },
            React.createElement("div", { style: { fontSize: "13px", fontWeight: "500", color: "var(--dsw-alias-label-primary)", lineHeight: "1.4", marginBottom: "3px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" } }, x.title),
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
              React.createElement("span", { title: t("prio." + (x.priority || "medium")), style: { fontSize: "10px", display: "inline-flex", alignItems: "center", gap: "3px", padding: "1px 6px", borderRadius: "6px", background: "var(--dsw-alias-bg-base)", border: "1px solid var(--dsw-alias-border-l1)" } },
                React.createElement("span", null, prioIcon(x.priority)),
                React.createElement("span", { style: { color: "var(--dsw-alias-label-secondary)", fontWeight: "600" } }, t("prio." + (x.priority || "medium"))),
              ),
              isActive ? React.createElement("span", { style: { fontSize: "10px", color: "var(--dsw-alias-state-success-primary)", fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "3px" } },
                React.createElement("span", { style: { width: "6px", height: "6px", borderRadius: "50%", background: "var(--dsw-alias-state-success-primary)" } }),
                React.createElement("span", null, t("st.in_progress")),
              ) : null,
            ),
          ),
        );
      };
      return React.createElement("section", { style: sectionStyle, "data-block": "todo" },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" } },
          React.createElement("h3", { style: Object.assign({}, sectionTitleStyle, { margin: 0 }) }, "📋 " + t("todo.title") + " · " + todos.length),
          overflow > 0 ? React.createElement("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)", background: "var(--dsw-alias-bg-layer-2)", padding: "2px 8px", borderRadius: "10px", fontWeight: "600" } }, "+" + overflow) : null,
        ),
        React.createElement("div", null, items.map(todoCard)),
      );
    }

    function ActivityBlock({ data, t }) {
      const items = (data.recentActivity || []).slice(0, 6);
      if (items.length === 0) {
        return React.createElement("section", { style: sectionStyle, "data-block": "activity" },
          React.createElement("h3", { style: sectionTitleStyle }, "⚡ " + t("activity.title")),
          React.createElement("p", { style: { margin: 0, opacity: 0.6, fontSize: "13px" } }, t("activity.empty")),
        );
      }
      const eventIcon = (title) => {
        const t0 = (title || "").toLowerCase();
        if (t0.includes("init") || t0.includes("掃描") || t0.includes("scan")) return "🚀";
        if (t0.includes("memory") || t0.includes("記憶")) return "🧠";
        if (t0.includes("todo") || t0.includes("待辦")) return "📋";
        if (t0.includes("dream") || t0.includes("整理")) return "✨";
        if (t0.includes("rescan")) return "🔄";
        if (t0.includes("session") || t0.includes("摘要")) return "📝";
        if (t0.includes("diff") || t0.includes("架構")) return "🌳";
        return "•";
      };
      const timelineItem = (it, isLast) => {
        const icon = eventIcon(it.title);
        return React.createElement("div", { key: it.id, style: { display: "flex", gap: "10px", position: "relative", paddingBottom: isLast ? 0 : "10px" } },
          React.createElement("div", { style: { flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", width: "36px" } },
            React.createElement("div", { style: { width: "28px", height: "28px", borderRadius: "50%", background: "var(--dsw-alias-bg-layer-2)", border: "2px solid var(--dsw-alias-brand-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", lineHeight: "1" } }, icon),
            !isLast ? React.createElement("div", { style: { flex: "1 1 auto", width: "2px", background: "var(--dsw-alias-border-l1)", marginTop: "4px", minHeight: "12px" } }) : null,
          ),
          React.createElement("div", { style: { flex: "1 1 auto", minWidth: 0, paddingBottom: isLast ? 0 : "2px" } },
            React.createElement("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "6px", marginBottom: "2px" } },
              React.createElement("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)", fontWeight: "600", fontVariantNumeric: "tabular-nums" } }, formatRelativeTime(it.occurredAt, Date.now(), data._localeCode)),
              React.createElement("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)", fontVariantNumeric: "tabular-nums" }, title: formatDate(it.occurredAt) }, formatDate(it.occurredAt).slice(5)),
            ),
            React.createElement("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-primary)", lineHeight: "1.4", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" } }, it.title),
          ),
        );
      };
      return React.createElement("section", { style: sectionStyle, "data-block": "activity" },
        React.createElement("h3", { style: sectionTitleStyle }, "⚡ " + t("activity.title")),
        React.createElement("div", null, items.map((it, idx) => timelineItem(it, idx === items.length - 1))),
      );
    }

    function MemoriesBlock({ data, t }) {
      const memories = data.memories || [];
      if (memories.length === 0) return null;
      const typeLabel = (type) => t("mem.type." + type) !== "mem.type." + type ? t("mem.type." + type) : type;
      const typeIcon = (type) => ({ decision: "💡", bug: "🐛", lesson: "📖", requirement: "📌", architecture: "🏛️", change: "🔄", context: "💬", issue: "❓", preference: "🎯" })[type] || "📝";
      const importanceStars = (imp) => {
        const stars = Math.max(0, Math.min(5, Math.round((imp || 0) * 5)));
        return "★".repeat(stars) + "☆".repeat(5 - stars);
      };
      // 用 React state 管理展開狀態（修復 v0.4.9 toggle bug：原版用模組級 const + DOM 直接操作，
      //   React 重渲染時 inline style 被 React state 計算值覆蓋，導致"展開後無法收起"）
      const [expanded, setExpanded] = React.useState(new Set());
      const toggle = (m, e) => {
        if (e) e.stopPropagation();
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(m.id)) next.delete(m.id);
          else next.add(m.id);
          return next;
        });
      };
      const copyMem = (m, e) => {
        try {
          e.stopPropagation();
          const text = "[" + typeLabel(m.type) + "] " + m.title + "\n\n" + (m.content || "");
          if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
          }
          const btn = e && (e.currentTarget || e.target);
          if (btn) {
            const orig = btn.textContent;
            btn.textContent = "✓";
            setTimeout(() => { btn.textContent = orig; }, 1200);
          }
        } catch (e) {}
      };
      const memCard = (m) => {
        const isOpen = expanded.has(m.id);
        const summary = String(m.content || "").slice(0, 100);
        const hasMore = (m.content || "").length > 100;
        return React.createElement("div", {
          key: m.id,
          "data-mem-card": "1",
          "data-mem-open": isOpen ? "1" : "0",
          style: {
            padding: "10px 12px",
            marginBottom: "6px",
            background: "var(--dsw-alias-bg-layer-2)",
            borderRadius: "8px",
            borderLeft: "3px solid var(--dsw-alias-brand-primary)",
          },
        },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" } },
            React.createElement("span", { style: { fontSize: "13px" } }, typeIcon(m.type)),
            React.createElement("span", { style: { fontSize: "10px", padding: "1px 7px", borderRadius: "8px", background: "var(--dsw-alias-bg-base)", color: "var(--dsw-alias-label-primary)", fontWeight: "600", border: "1px solid var(--dsw-alias-border-l1)" } }, typeLabel(m.type)),
            React.createElement("span", { title: "importance " + (m.importance || 0), style: { fontSize: "10px", color: "var(--dsw-alias-brand-primary)", letterSpacing: "1px" } }, importanceStars(m.importance)),
            React.createElement("div", { style: { flex: "1 1 auto" } }),
            React.createElement("button", {
              "data-mem-copy": "1",
              title: "複製到 LLM 幫你整理",
              style: { background: "transparent", border: "none", cursor: "pointer", fontSize: "11px", color: "var(--dsw-alias-label-secondary)", padding: "0 4px", borderRadius: "4px" },
              onClick: (e) => copyMem(m, e),
            }, "📋"),
            React.createElement("span", {
              "data-mem-indicator": "1",
              style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)", cursor: "pointer", padding: "0 4px", userSelect: "none" },
              onClick: (e) => toggle(m, e),
              title: "展開/收起",
            }, isOpen ? "▾" : "▸"),
          ),
          React.createElement("div", { style: { fontSize: "13px", fontWeight: "600", color: "var(--dsw-alias-label-primary)", lineHeight: "1.4", marginBottom: "4px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis" } }, m.title),
          m.content ? React.createElement("div", {
            "data-mem-summary": "1",
            style: { display: isOpen ? "none" : "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis", fontSize: "11px", color: "var(--dsw-alias-label-secondary)", lineHeight: "1.5", marginBottom: hasMore ? "4px" : "0", cursor: "pointer" },
            onClick: (e) => toggle(m, e),
          }, summary + (hasMore ? "..." : "")) : null,
          m.content ? React.createElement("div", {
            "data-mem-content": "1",
            style: { display: isOpen ? "block" : "none", fontSize: "12px", color: "var(--dsw-alias-label-primary)", lineHeight: "1.6", whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: "4px", padding: "8px 10px", background: "var(--dsw-alias-bg-base)", borderRadius: "6px", border: "1px solid var(--dsw-alias-border-l1)", cursor: "pointer" },
            onClick: (e) => toggle(m, e),
          }, m.content) : null,
        );
      };
      return React.createElement("section", { style: sectionStyle, "data-block": "memories" },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" } },
          React.createElement("h3", { style: Object.assign({}, sectionTitleStyle, { margin: 0 }) }, "🧠 " + t("memories.title") + " · " + memories.length),
          React.createElement("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)" } }, "📋 點選 📋 複製給 LLM"),
        ),
        React.createElement("div", null, memories.slice(0, 8).map(memCard)),
        memories.length > 8 ? React.createElement("div", { style: { textAlign: "center", fontSize: "11px", color: "var(--dsw-alias-label-secondary)", marginTop: "6px" } }, "+" + (memories.length - 8) + " 更多 → Dashboard") : null,
      );
    }

    function StatsBlock({ data, t }) {
      const s = data.stats || { pendingTodos: 0, completedTodos: 0, decisions: 0 };
      const statItem = (icon, value, label, color) =>
        React.createElement("div", { style: { textAlign: "center", padding: "8px 4px", background: "var(--dsw-alias-bg-layer-2)", borderRadius: "8px" } },
          React.createElement("div", { style: { fontSize: "13px", marginBottom: "2px" } }, icon),
          React.createElement("div", { style: { fontSize: "18px", fontWeight: "700", lineHeight: "1.1", color: color, fontVariantNumeric: "tabular-nums" } }, value),
          React.createElement("div", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)", marginTop: "2px", letterSpacing: "0.3px" } }, label),
        );
      return React.createElement("section", { style: sectionStyle, "data-block": "stats" },
        React.createElement("h3", { style: sectionTitleStyle }, "📊 " + t("stats.title")),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", marginTop: "4px" } },
          statItem("📋", s.pendingTodos, t("stats.pending"), s.pendingTodos > 0 ? "var(--dsw-alias-state-warn-primary)" : "var(--dsw-alias-label-primary)"),
          statItem("✅", s.completedTodos, t("stats.done"), "var(--dsw-alias-state-success-primary)"),
          statItem("💡", s.decisions, t("stats.decisions"), "var(--dsw-alias-brand-primary)"),
        ),
      );
    }

    function CodeGraphBlock({ data, t }) {
      const architecture = data && data.architecture;
      const cg = data && data.codegraph ? data.codegraph : architecture ? {
        stats: {
          files: architecture.stats && architecture.stats.files || 0,
          edges: architecture.stats && architecture.stats.edges || 0,
          languages: (data.project && data.project.languages) || {},
        },
      } : null;
      if (!cg) return null;
      const stat = (icon, value, label) =>
        React.createElement("div", { style: { textAlign: "center", padding: "8px 4px", background: "var(--dsw-alias-bg-layer-2)", borderRadius: "8px" } },
          React.createElement("div", { style: { fontSize: "13px", marginBottom: "2px" } }, icon),
          React.createElement("div", { style: { fontSize: "18px", fontWeight: "700", lineHeight: "1.1", fontVariantNumeric: "tabular-nums" } }, value),
          React.createElement("div", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)", marginTop: "2px", letterSpacing: "0.3px" } }, label),
        );
      const langUsage = formatLanguagesUsage(cg.stats.languages);
      const langItems = [];
      for (const item of langUsage.top) {
        const pctLabel = langUsage.total > 0 ? Math.round(item.percent) + "%" : "";
        langItems.push(React.createElement("span", {
          key: "lang-" + item.lang,
          title: item.lang + " · " + item.count + " 個檔案",
          style: { display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", background: "var(--dsw-alias-bg-layer-2)", borderRadius: "10px", fontSize: "11px", fontWeight: "500", marginRight: "4px", marginBottom: "4px", border: "1px solid var(--dsw-alias-border-l1)" },
        },
          React.createElement("span", { style: { width: "8px", height: "8px", borderRadius: "50%", background: "var(--dsw-alias-brand-primary)" } }),
          React.createElement("span", null, item.lang),
          React.createElement("span", { style: { color: "var(--dsw-alias-label-secondary)" } }, pctLabel ? " · " + pctLabel : ""),
        ));
      }
      if (langUsage.tail) {
        langItems.push(React.createElement("span", {
          key: "lang-tail",
          title: langUsage.tail.languages + " 種語言共 " + langUsage.tail.count + " 個檔案",
          style: { display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", background: "var(--dsw-alias-bg-layer-2)", borderRadius: "10px", fontSize: "11px", fontWeight: "500", marginRight: "4px", marginBottom: "4px", border: "1px solid var(--dsw-alias-border-l1)", color: "var(--dsw-alias-label-secondary)" },
        },
          React.createElement("span", null, "其它 " + langUsage.tail.languages + " 種"),
          React.createElement("span", null, " · " + Math.round(langUsage.tail.percent) + "%"),
        ));
      }
      return React.createElement("section", { style: sectionStyle, "data-block": "codegraph" },
        React.createElement("h3", { style: sectionTitleStyle }, "🌳 " + t("codegraph.title")),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", marginTop: "4px" } },
          stat("📁", cg.stats.files, t("codegraph.files")),
          stat("🔗", cg.stats.edges, t("codegraph.edges")),
          stat("🗂️", Object.keys(cg.stats.languages || {}).length, t("codegraph.langs")),
        ),
        React.createElement("div", { style: { marginTop: "10px" } },
          langItems.length > 0 ? langItems : React.createElement("span", { style: { opacity: 0.6, fontSize: "12px" } }, t("codegraph.noLang")),
        ),
      );
    }

    function clipPurpose(text) {
      const raw = String(text || "").replace(/\s+/g, " ").trim();
      if (!raw) return "";
      const parts = [];
      let buf = "";
      for (let i = 0; i < raw.length; i++) {
        buf += raw[i];
        if (/[。！？.!?]/.test(raw[i])) {
          parts.push(buf);
          buf = "";
          if (parts.length >= 2) break;
        }
      }
      const out = (parts.length ? parts.join("") : raw).trim();
      return out.length > 160 ? out.slice(0, 159) + "…" : out;
    }
    function clipStyleTag(text) {
      const raw = String(text || "").replace(/\s+/g, " ").trim();
      if (!raw) return "";
      const clause = raw.split(/[（(，,。；;]/)[0].trim();
      return clause.length > 18 ? clause.slice(0, 17) + "…" : clause;
    }
    function oneLine(text, max) {
      const raw = String(text || "").replace(/\s+/g, " ").trim();
      if (!raw) return "";
      const cut = raw.split(/[。！？.!\n]/)[0].trim() || raw;
      return cut.length > max ? cut.slice(0, max - 1) + "…" : cut;
    }
    function stepComponentId(step) {
      if (!step) return null;
      return typeof step === "string" ? step : (step.componentId || step.component || null);
    }
    const ARCH_DIAGRAM_CSS = [
      ".dsh-arch-head{display:flex;align-items:center;gap:8px;margin:0 0 8px}",
      ".dsh-arch-head h3{margin:0}",
      ".dsh-arch-pills{margin-left:auto;display:flex;gap:6px;flex:0 0 auto;align-items:center}",
      ".dsh-arch-pill,.dsh-arch-chip{font-size:10px;line-height:1.2;padding:3px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:transparent;font:inherit;cursor:default}",
      ".dsh-arch-chip{cursor:pointer}",
      ".dsh-arch-pill.is-brand,.dsh-arch-chip.is-active{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}",
      ".dsh-arch-purpose{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary);margin:0 0 12px}",
      ".dsh-arch-llm{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-state-warn-primary);margin:0 0 10px}",
      ".dsh-arch-board{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}",
      ".dsh-arch-lane{display:grid;grid-template-columns:88px minmax(0,1fr);align-items:start;width:100%;margin:0;padding:0;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);border-left:3px solid transparent;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}",
      ".dsh-arch-lane:last-child{border-bottom:0}",
      ".dsh-arch-lane:hover{background:var(--dsw-alias-bg-layer-2)}",
      ".dsh-arch-lane.is-active{background:var(--dsw-alias-bg-layer-2);border-left-color:var(--dsw-alias-brand-primary)}",
      ".dsh-arch-lane.is-active .dsh-arch-rail{color:var(--dsw-alias-brand-primary)}",
      ".dsh-arch-rail{display:flex;align-items:flex-start;padding:14px 10px 12px;font-size:11px;font-weight:600;line-height:1.35;color:var(--dsw-alias-label-secondary);border-right:1px dashed var(--dsw-alias-border-l1)}",
      ".dsh-arch-nodes{display:grid;grid-template-columns:repeat(auto-fill,minmax(156px,1fr));gap:8px;padding:10px 12px;align-items:stretch}",
      ".dsh-arch-node{display:flex;flex-direction:column;box-sizing:border-box;height:100%;min-height:72px;margin:0;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);color:inherit;font:inherit;text-align:left;cursor:pointer;-webkit-appearance:none;appearance:none}",
      ".dsh-arch-lane.is-active .dsh-arch-node{background:var(--dsw-alias-bg-layer-1)}",
      ".dsh-arch-node:hover,.dsh-arch-node.is-picked{border-color:var(--dsw-alias-brand-primary)}",
      ".dsh-arch-node.is-picked{background:var(--dsw-alias-bg-layer-2)}",
      ".dsh-arch-board.is-flowing .dsh-arch-node{opacity:.42}",
      ".dsh-arch-board.is-flowing .dsh-arch-node.is-in-flow{opacity:1;border-color:var(--dsw-alias-brand-primary)}",
      ".dsh-arch-node-name{display:block;height:16px;line-height:16px;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dsh-arch-node-desc{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;height:28px;margin-top:6px;font-size:10px;line-height:14px;color:var(--dsw-alias-label-secondary)}",
      ".dsh-arch-step-card{display:flex;flex-direction:column;box-sizing:border-box;width:156px;min-height:72px;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}",
      ".dsh-arch-step-name{height:16px;line-height:16px;font-size:12px;font-weight:600;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dsh-arch-step-action{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;height:28px;margin-top:4px;font-size:10px;line-height:14px;color:var(--dsw-alias-label-secondary)}",
      ".dsh-arch-inspect{margin-top:12px;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}",
      ".dsh-arch-inspect-kicker{font-size:10px;font-weight:600;letter-spacing:.04em;color:var(--dsw-alias-label-secondary);margin:0 0 6px}",
      ".dsh-arch-inspect-title{font-size:13px;font-weight:600;margin:0 0 4px}",
      ".dsh-arch-inspect-body{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);margin:0}",
      ".dsh-arch-links{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}",
      ".dsh-arch-link{font-size:10px;line-height:1.4;padding:4px 8px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}",
      ".dsh-arch-file{display:block;font-size:10px;color:var(--dsw-alias-label-secondary);margin-top:6px;word-break:break-all}",
      ".dsh-arch-chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0}",
      ".dsh-arch-steps{display:flex;flex-wrap:nowrap;overflow-x:auto;align-items:stretch;gap:0;padding:8px 0 4px}",
      ".dsh-arch-step{display:flex;align-items:stretch;flex:0 0 auto}",
      ".dsh-arch-step-num{font-size:9px;font-weight:700;letter-spacing:.04em;color:var(--dsw-alias-brand-primary)}",
      ".dsh-arch-arrow{display:flex;align-items:center;color:var(--dsw-alias-label-secondary);padding:0 6px;font-size:12px;line-height:1}",
      ".dsh-arch-hint{margin-top:10px;font-size:11px;color:var(--dsw-alias-label-secondary)}",
      "@media(max-width:760px){.dsh-arch-head{align-items:flex-start;flex-wrap:wrap}.dsh-arch-pills{margin-left:0}.dsh-arch-lane{grid-template-columns:1fr}.dsh-arch-rail{border-right:0;border-bottom:1px dashed var(--dsw-alias-border-l1);padding:8px 12px 0}}",
    ].join("");

    function ArchitectureGraphBlock({ data, t, embedded, onRescan }) {
      const architecture = data && data.architecture;
      const [selectedLayerId, setSelectedLayerId] = React.useState(null);
      const [selectedComponentId, setSelectedComponentId] = React.useState(null);
      const [selectedFlowId, setSelectedFlowId] = React.useState(null);
      const [retryState, setRetryState] = React.useState({ status: "idle", message: null });
      const components = ((architecture && (architecture.components || architecture.nodes)) || []).slice(0, 24);
      const layers = ((architecture && architecture.layers) || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      const flows = ((architecture && (architecture.runtimeFlows || architecture.flows)) || []).slice(0, 8);
      const relationships = ((architecture && (architecture.relationships || architecture.edges)) || []).slice(0, 36);
      const keyFiles = (architecture && architecture.keyFiles) || [];
      const risks = (architecture && architecture.risks) || [];
      const overview = (architecture && architecture.overview) || {};
      const purpose = clipPurpose(overview.purpose || (architecture && architecture.summary) || "");
      const styleLabel = clipStyleTag(overview.architectureStyle || "");
      const sourceLabel = architecture && architecture.source === "hybrid" ? t("arch.hybrid") : t("arch.local");
      const layerRows = layers.length ? layers : (components.length ? [{ id: "all", name: t("arch.components"), responsibility: "", order: 0 }] : []);
      const componentsForLayer = (layer) => layer.id === "all" || !layers.length
        ? components
        : components.filter((item) => item.layerId === layer.id);
      const selectedLayer = layerRows.find((layer) => layer.id === selectedLayerId) || null;
      const selectedComponent = components.find((item) => item.id === selectedComponentId) || null;
      const byId = new Map(components.map((item) => [item.id, item]));

      function isGenuineRuntimeFlow(flow) {
        const steps = (flow && flow.steps) || [];
        if (steps.length < 2) return false;
        const name = String(flow.name || "");
        if (/本地推斷|local inference/i.test(name)) return false;
        const ids = steps.map(stepComponentId);
        if (ids.length === components.length && ids.every((id, index) => id === components[index].id)) return false;
        const actions = steps.map((step) => (typeof step === "object" && step && step.action) || "");
        const generic = actions.length > 0 && actions.every((action) => action === "接收請求" || action === "完成處理" || action === "處理並傳遞");
        return !generic;
      }

      const genuineFlows = flows.filter(isGenuineRuntimeFlow);
      const selectedFlow = genuineFlows.find((flow) => flow.id === selectedFlowId) || null;
      const flowIds = selectedFlow
        ? new Set((selectedFlow.steps || []).map(stepComponentId).filter(Boolean))
        : null;

      function componentFile(component) {
        if (!component) return "";
        return ((component.importantFiles || component.files) || [])[0]
          || ((keyFiles.find((item) => (component.importantFiles || []).indexOf(item.path) >= 0) || {}).path)
          || "";
      }

      function componentRisk(component) {
        if (!component) return "";
        const hit = risks.find((item) => String(item).indexOf(component.name || component.label || "") >= 0);
        return hit ? oneLine(hit, 72) : "";
      }

      function relatedOf(component) {
        if (!component) return [];
        return relationships.map((rel) => {
          const from = rel.from || rel.source;
          const to = rel.to || rel.target;
          if (from === component.id && byId.get(to)) return { id: to, name: byId.get(to).name || byId.get(to).label, label: rel.label || t("arch.related") };
          if (to === component.id && byId.get(from)) return { id: from, name: byId.get(from).name || byId.get(from).label, label: rel.label || t("arch.related") };
          return null;
        }).filter(Boolean).slice(0, 6);
      }

      function relatedInLayer(layer) {
        const ids = new Set(componentsForLayer(layer).map((item) => item.id));
        return relationships.map((rel) => {
          const from = rel.from || rel.source;
          const to = rel.to || rel.target;
          if (!ids.has(from) || !ids.has(to) || from === to) return null;
          const left = byId.get(from);
          const right = byId.get(to);
          if (!left || !right) return null;
          return (left.name || left.label) + " · " + (rel.label || t("arch.related")) + " · " + (right.name || right.label);
        }).filter(Boolean).slice(0, 6);
      }

      function stepMeta(step) {
        const id = stepComponentId(step);
        const component = byId.get(id);
        const name = component ? (component.name || component.label) : id;
        const action = typeof step === "object" && step && step.action ? oneLine(step.action, 48) : "";
        return { id, name, action };
      }

      const sectionProps = { style: embedded ? { color: "var(--dsw-alias-label-primary)" } : sectionStyle, "data-block": "architecture-graph", "data-architecture-schema": architecture && architecture.schemaVersion || 1 };

      if (!architecture || !components.length) {
        return React.createElement("section", sectionProps,
          React.createElement("h3", { style: Object.assign({}, sectionTitleStyle, { margin: 0 }) }, t("arch.title")),
          React.createElement("div", { style: { marginTop: "10px", fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } }, t("arch.empty")),
        );
      }

      const llmBar = architecture.llm && architecture.llm.requested && !architecture.llm.used && architecture.llm.error
        ? (function () {
            const err = architecture.llm.error || {};
            const actionKey = err.actionKey || "retry_scan";
            const busy = retryState.status === "loading";
            let actionNode = null;
            if (actionKey === "retry_scan") {
              actionNode = React.createElement("button", {
                type: "button",
                disabled: busy || typeof onRescan !== "function",
                onClick: async () => {
                  if (typeof onRescan !== "function") return;
                  setRetryState({ status: "loading", message: null });
                  try {
                    const out = await onRescan();
                    setRetryState({ status: "success", message: out && out.message ? out.message : t("arch.retryDone") });
                  } catch (e) {
                    setRetryState({ status: "error", message: String((e && e.message) || e) });
                  }
                },
                style: { fontSize: "10px", padding: "2px 7px", borderRadius: "6px", background: "transparent", border: "1px solid var(--dsw-alias-state-warn-primary)", color: "var(--dsw-alias-state-warn-primary)", cursor: busy ? "wait" : "pointer", fontFamily: "inherit" },
              }, busy ? t("arch.retrying") : t("arch.actionRetry"));
            } else if (actionKey === "send_message") {
              actionNode = React.createElement("span", { style: { fontSize: "10px" } }, t("arch.actionChat"));
            } else if (actionKey === "check_settings") {
              actionNode = React.createElement("span", { style: { fontSize: "10px" } }, t("arch.actionSettings"));
            }
            return React.createElement("div", {
              title: err.message || err.code || "",
              className: "dsh-arch-llm",
            },
              React.createElement("span", null, t("arch.llmFallback")),
              actionNode,
              retryState.status === "success" ? React.createElement("span", { style: { color: "var(--dsw-alias-state-success-primary)" } }, retryState.message) : null,
              retryState.status === "error" ? React.createElement("span", null, retryState.message) : null,
            );
          })()
        : null;

      let inspect = null;
      if (selectedFlow) {
        const flowSteps = (selectedFlow.steps || []).slice(0, 7);
        inspect = React.createElement("div", { className: "dsh-arch-inspect", "data-architecture-flow": selectedFlow.id },
          React.createElement("div", { className: "dsh-arch-inspect-kicker" }, t("arch.runtime")),
          React.createElement("div", { className: "dsh-arch-inspect-title" }, selectedFlow.name || t("arch.flows")),
          selectedFlow.trigger ? React.createElement("p", { className: "dsh-arch-inspect-body" }, selectedFlow.trigger) : null,
          React.createElement("div", { className: "dsh-arch-steps" },
            flowSteps.map((step, index) => {
              const meta = stepMeta(step);
              return React.createElement("div", { key: (meta.id || "step") + "-" + index, className: "dsh-arch-step" },
                React.createElement("div", { className: "dsh-arch-step-card" },
                  React.createElement("div", { className: "dsh-arch-step-num" }, String(index + 1).padStart(2, "0")),
                  React.createElement("div", { className: "dsh-arch-step-name" }, meta.name),
                  meta.action ? React.createElement("div", { className: "dsh-arch-step-action" }, meta.action) : null,
                ),
                index < flowSteps.length - 1 ? React.createElement("span", { className: "dsh-arch-arrow", "aria-hidden": "true" }, "→") : null,
              );
            }),
          ),
        );
      } else if (selectedComponent) {
        const desc = oneLine(selectedComponent.responsibility || selectedComponent.description || selectedComponent.details, 120);
        const file = componentFile(selectedComponent);
        const risk = componentRisk(selectedComponent);
        const related = relatedOf(selectedComponent);
        inspect = React.createElement("div", { className: "dsh-arch-inspect", "data-architecture-inspect": selectedComponent.id },
          React.createElement("div", { className: "dsh-arch-inspect-kicker" }, t("arch.inspectModule")),
          React.createElement("div", { className: "dsh-arch-inspect-title" }, selectedComponent.name || selectedComponent.label),
          desc ? React.createElement("p", { className: "dsh-arch-inspect-body" }, desc) : null,
          file ? React.createElement("code", { className: "dsh-arch-file" }, file) : null,
          risk ? React.createElement("p", { className: "dsh-arch-inspect-body", style: { marginTop: "6px" } }, risk) : null,
          related.length ? React.createElement("div", { className: "dsh-arch-links" },
            related.map((item) => React.createElement("span", { key: item.id, className: "dsh-arch-link" }, item.label + " · " + item.name)),
          ) : null,
        );
      } else if (selectedLayer) {
        const layerDesc = oneLine(selectedLayer.responsibility || selectedLayer.description, 120);
        const related = relatedInLayer(selectedLayer);
        inspect = React.createElement("div", { className: "dsh-arch-inspect", "data-architecture-flow": selectedLayer.id },
          React.createElement("div", { className: "dsh-arch-inspect-kicker" }, t("arch.inspectLayer")),
          React.createElement("div", { className: "dsh-arch-inspect-title" }, selectedLayer.name),
          React.createElement("p", { className: "dsh-arch-inspect-body" }, layerDesc || t("arch.peersHint")),
          related.length ? React.createElement("div", { className: "dsh-arch-links" },
            related.map((text, index) => React.createElement("span", { key: String(index), className: "dsh-arch-link" }, text)),
          ) : null,
        );
      }

      return React.createElement("section", sectionProps,
        React.createElement("style", null, ARCH_DIAGRAM_CSS),
        React.createElement("div", { className: "dsh-arch-head" },
          React.createElement("h3", { style: Object.assign({}, sectionTitleStyle, { margin: 0 }) }, t("arch.title")),
          React.createElement("div", { className: "dsh-arch-pills" },
            styleLabel ? React.createElement("span", { className: "dsh-arch-pill", title: overview.architectureStyle || styleLabel }, styleLabel) : null,
            React.createElement("span", { className: "dsh-arch-pill" + (architecture.source === "hybrid" ? " is-brand" : "") }, sourceLabel),
          ),
        ),
        purpose ? React.createElement("p", { className: "dsh-arch-purpose" }, purpose) : null,
        llmBar,
        React.createElement("div", {
          className: "dsh-arch-board" + (selectedFlow ? " is-flowing" : ""),
          "data-architecture-diagram": "semantic-layers",
        },
          layerRows.map((layer) => {
            const items = componentsForLayer(layer);
            if (!items.length) return null;
            const active = selectedLayerId === layer.id;
            return React.createElement("div", {
              key: layer.id,
              role: "button",
              tabIndex: 0,
              className: "dsh-arch-lane" + (active ? " is-active" : ""),
              "data-architecture-layer": layer.id,
              onClick: () => {
                setSelectedFlowId(null);
                if (selectedLayerId === layer.id && !selectedComponentId) setSelectedLayerId(null);
                else {
                  setSelectedLayerId(layer.id);
                  setSelectedComponentId(null);
                }
              },
              onKeyDown: (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.currentTarget.click();
                }
              },
            },
              React.createElement("div", { className: "dsh-arch-rail" }, layer.name),
              React.createElement("div", { className: "dsh-arch-nodes" },
                items.map((component) => {
                  const desc = oneLine(component.responsibility || component.description, 80);
                  const picked = selectedComponentId === component.id;
                  const inFlow = flowIds ? flowIds.has(component.id) : false;
                  return React.createElement("button", {
                    key: component.id,
                    type: "button",
                    className: "dsh-arch-node" + (picked ? " is-picked" : "") + (inFlow ? " is-in-flow" : ""),
                    "data-architecture-component": component.id,
                    onClick: (event) => {
                      event.stopPropagation();
                      setSelectedFlowId(null);
                      setSelectedLayerId(layer.id);
                      setSelectedComponentId(picked ? null : component.id);
                    },
                  },
                    React.createElement("span", { className: "dsh-arch-node-name", title: component.name || component.label }, component.name || component.label),
                    React.createElement("span", { className: "dsh-arch-node-desc", title: desc || "" }, desc || "\u00a0"),
                  );
                }),
              ),
            );
          }),
        ),
        genuineFlows.length ? React.createElement("div", { className: "dsh-arch-chips" },
          genuineFlows.map((flow) => React.createElement("button", {
            key: flow.id,
            type: "button",
            className: "dsh-arch-chip" + (selectedFlowId === flow.id ? " is-active" : ""),
            onClick: () => {
              setSelectedComponentId(null);
              setSelectedLayerId(null);
              setSelectedFlowId(selectedFlowId === flow.id ? null : flow.id);
            },
          }, flow.name || t("arch.flows"))),
        ) : null,
        inspect,
        !inspect ? React.createElement("div", { className: "dsh-arch-hint" }, genuineFlows.length ? t("arch.select") : t("arch.select") + " · " + t("arch.peersHint")) : null,
      );
    }

    function ActionsBlock({ t, localeCode }) {
      const buttonStyle = () => ({
        flex: "1 1 0",
        padding: "9px 14px",
        background: "linear-gradient(135deg, var(--dsw-alias-bg-layer-2) 0%, var(--dsw-alias-bg-layer-1) 100%)",
        color: "var(--dsw-alias-label-primary)",
        border: "1px solid var(--dsw-alias-border-l1)",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: "500",
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        transition: "transform 0.1s ease, opacity 0.1s ease, background 0.15s ease",
      });
      // v0.4.12: 按鈕文案統一為"檢視 Dashboard · 專案全景"（v0.4.11 之前是"開啟/收起 Dashboard" 切換）
      // Dashboard 預設展開，按鈕在摺疊狀態顯示，展開後 dashboard 佔滿，按鈕可摺疊回
      // 右側小圖示（▾/▸）作為狀態指示，文案不變
      return React.createElement("section", { style: Object.assign({}, sectionStyle, { padding: "10px 14px" }), "data-block": "actions" },
        React.createElement("div", { style: { display: "flex", gap: "8px" } },
          React.createElement("button", {
            "data-action": "toggle-dashboard",
            style: buttonStyle(),
            onClick: (e) => toggleDashboard(e, t),
            title: localeCode === "en-US" ? "View full project dashboard" : "檢視專案完整資料快照",
          },
            React.createElement("span", { style: { fontSize: "16px" } }, "📊"),
            React.createElement("span", { style: { flex: "1 1 auto", textAlign: "left" } },
              React.createElement("div", { style: { fontSize: "13px", fontWeight: "600", lineHeight: "1.2" } },
                React.createElement("span", null, localeCode === "en-US" ? "View Dashboard" : "檢視 Dashboard"),
                React.createElement("span", { style: { color: "var(--dsw-alias-label-secondary)", fontWeight: "400", margin: "0 4px" } }, "·"),
                React.createElement("span", { style: { color: "var(--dsw-alias-label-secondary)", fontWeight: "400" } }, localeCode === "en-US" ? "Project Overview" : "專案全景"),
              ),
              React.createElement("div", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)", marginTop: "1px" } },
                localeCode === "en-US" ? "Tech stack · todos · memories · timeline" : "技術棧 · 待辦 · 記憶 · 時間線",
              ),
            ),
            React.createElement("span", { "data-dashboard-indicator": "1", style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } }, "▾"),
          ),
        ),
      );
    }

    // ─── Onboarding 啟動狀態機 ───
    // v0.5.0: 把"複製命令讓人貼"換成"點按鈕直接後臺掃描"。
    //   流程：點選 → host.call('project_brain/initProject') → 期間顯示轉圈 + 階段文案
    //         → 成功：父元件重新整理 preview 後自動切到 dashboard
    //         → 失敗：把錯誤顯示在按鈕上方，使用者可重試
    //
    // 父元件（SidebarPreviewRoot）傳 path / onComplete；
    //   path：當前 workspace 路徑（來自 build-time embed 的 sessionToWorkspaceId 反查）
    //   onComplete：完成後調一下讓父元件重新解析資料
    const ONBOARDING_PHASES = [
      { key: "scanning", icon: "🔍", label: "掃描專案結構…" },
      { key: "graph", icon: "🏛️", label: "構建架構關係…" },
      { key: "analyzing", icon: "🧠", label: "DSH LLM 語義分析…" },
      { key: "done", icon: "✅", label: "架構與專案腦已生成" },
    ];

    const ONBOARDING_FEATURES = [
      { icon: "⌘", titleKey: "onboarding.f1.title", descKey: "onboarding.f1.desc" },
      { icon: "◇", titleKey: "onboarding.f2.title", descKey: "onboarding.f2.desc" },
      { icon: "✓", titleKey: "onboarding.f3.title", descKey: "onboarding.f3.desc" },
    ];

    function OnboardingBlock({ t, path, sessionId, onComplete, connection }) {
      // 三態機：idle / loading / error
      const [phase, setPhase] = React.useState("idle");   // "idle" | "loading" | "error"
      const [phaseStep, setPhaseStep] = React.useState(0); // 0..3，對應 ONBOARDING_PHASES 下標
      const [errMsg, setErrMsg] = React.useState("");
      const [result, setResult] = React.useState(null);

      const rpc = connection && connection.rpc;

      // 啟動按鈕基礎樣式
      const ctaBase = {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        width: "100%",
        padding: "12px 16px",
        background: "linear-gradient(135deg, var(--dsw-alias-brand-primary) 0%, var(--dsw-alias-brand-secondary, var(--dsw-alias-brand-primary)) 100%)",
        color: "var(--dsw-alias-bg-base)",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "600",
        fontFamily: "inherit",
        marginTop: "16px",
        boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
        transition: "transform 0.1s ease, box-shadow 0.15s ease, opacity 0.2s ease",
      };
      const ctaLoading = Object.assign({}, ctaBase, {
        background: "var(--dsw-alias-bg-layer-2)",
        color: "var(--dsw-alias-label-primary)",
        cursor: "wait",
        opacity: 0.85,
        boxShadow: "none",
      });
      const ctaError = Object.assign({}, ctaBase, {
        background: "var(--dsw-alias-state-error-primary)",
      });

      const stepStyle = (num, label, desc) =>
        React.createElement("div", { style: { display: "flex", gap: "10px", padding: "8px 0", alignItems: "flex-start" } },
          React.createElement("div", { style: { flex: "0 0 auto", width: "24px", height: "24px", borderRadius: "50%", background: "var(--dsw-alias-brand-primary)", color: "var(--dsw-alias-bg-base)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "700" } }, num),
          React.createElement("div", null,
            React.createElement("div", { style: { fontSize: "13px", fontWeight: "600", marginBottom: "2px" } }, label),
            React.createElement("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)", lineHeight: "1.4" } }, desc),
          ),
        );

      // 階段推進（僅前端 UX 節奏，讓使用者感知"在幹活"；RPC 自身是單次呼叫）
      function advancePhase(stepIdx) {
        setPhaseStep(stepIdx);
      }
      // 注：stepStyle 函式保留相容（內部不再使用），外部若引用不破壞構建。

      async function startScan() {
        if (phase === "loading") return;
        setErrMsg("");
        setResult(null);
        setPhase("loading");
        advancePhase(0);
        // v0.5.1 修復：當 path 為空（build-time sessionToWorkspaceId miss）時，
        //   用 sessionId 走 host 兜底——host 端 getCwdBySession 會用 ctx.sessions.get
        //   反查真實 cwd，避免每個新建 workspace 都要重啟 DSH 才能用
        if (!sessionId) {
          setPhase("error");
          setErrMsg("未找到當前 Session，請先在 DSH 中開啟該專案");
          return;
        }
        if (!rpc || typeof rpc.call !== "function") {
          setPhase("error");
          setErrMsg("DSH Connection RPC 不可用，請確認外掛依賴已正確安裝");
          return;
        }
        // 階段推進定時器（UX 節奏，~600ms 一步；RPC 通常 1-3s 完成）
        const timers = [];
        timers.push(setTimeout(() => advancePhase(1), 700));
        timers.push(setTimeout(() => advancePhase(2), 1500));
        let resp;
        try {
          resp = await rpc.call(
            "/project-brain",
            "init",
            { sessionId: sessionId || undefined },
          );
        } catch (e) {
          timers.forEach((id) => clearTimeout(id));
          setPhase("error");
          setErrMsg(String((e && e.message) || e));
          return;
        }
        timers.forEach((id) => clearTimeout(id));
        // Connection RPC 統一形態：{ok:true,value:{projectPath,scan,preview}}
        // 或 {ok:false,error:{code,message,details}}。
        const okFlag = resp && resp.ok;
        const dataObj = (resp && resp.value) || {};
        if (okFlag) {
          advancePhase(3);
          setResult(dataObj);
          if (typeof onComplete === "function") {
            try { onComplete(dataObj); } catch (e) {}
          }
        } else {
          const errStr = (resp && resp.error && resp.error.message)
            || "未知錯誤";
          setPhase("error");
          setErrMsg(errStr);
        }
      }

      function retry() {
        setPhase("idle");
        setErrMsg("");
        setResult(null);
      }

      // CTA 渲染：分三態
      let ctaNode;
      if (phase === "loading") {
        ctaNode = React.createElement(
          "div",
          { style: { marginTop: "16px" }, "data-block": "onboarding-loading" },
          // 轉圈圈：CSS conic-gradient 實現（不依賴 framer-motion / 第三方）
          React.createElement(
            "div",
            {
              style: Object.assign({}, ctaLoading),
              "data-loading-state": "scanning",
            },
            React.createElement("span", {
              "data-spinner": "1",
              style: {
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                border: "2px solid var(--dsw-alias-border-l2)",
                borderTopColor: "var(--dsw-alias-brand-primary)",
                animation: "dsh-brain-spin 0.9s linear infinite",
                display: "inline-block",
              },
            }),
            React.createElement("span", null, ONBOARDING_PHASES[phaseStep] ? ONBOARDING_PHASES[phaseStep].label : "分析中…"),
          ),
          // 進度指示（4 步）
          React.createElement(
            "div",
            {
              style: {
                display: "flex",
                gap: "6px",
                justifyContent: "center",
                marginTop: "10px",
                fontSize: "10px",
                color: "var(--dsw-alias-label-secondary)",
              },
            },
            ONBOARDING_PHASES.map((p, i) =>
              React.createElement(
                "span",
                {
                  key: p.key,
                  style: {
                    padding: "2px 8px",
                    borderRadius: "8px",
                    background: i <= phaseStep ? "var(--dsw-alias-brand-primary)" : "var(--dsw-alias-bg-layer-2)",
                    color: i <= phaseStep ? "var(--dsw-alias-bg-base)" : "var(--dsw-alias-label-secondary)",
                    fontWeight: "600",
                  },
                },
                p.icon + " " + p.label,
              ),
            ),
          ),
        );
      } else if (phase === "error") {
        ctaNode = React.createElement(
          "div",
          { style: { marginTop: "16px" }, "data-block": "onboarding-error" },
          React.createElement(
            "div",
            {
              style: {
                padding: "10px 12px",
                background: "rgba(220,38,38,0.08)",
                color: "var(--dsw-alias-state-error-primary)",
                borderRadius: "8px",
                fontSize: "12px",
                lineHeight: "1.5",
                marginBottom: "10px",
                border: "1px solid rgba(220,38,38,0.25)",
              },
            },
            React.createElement("div", { style: { fontWeight: "600", marginBottom: "4px" } }, "❌ 啟動失敗"),
            React.createElement("div", null, errMsg || "未知錯誤"),
          ),
          React.createElement(
            "button",
            {
              style: ctaBase,
              onClick: retry,
              "data-action": "retry",
            },
            React.createElement("span", { style: { fontSize: "16px" } }, "🔁"),
            React.createElement("span", null, "重試"),
          ),
          React.createElement(
            "button",
            {
              style: {
                background: "transparent",
                border: "none",
                color: "var(--dsw-alias-label-secondary)",
                cursor: "pointer",
                fontSize: "11px",
                marginTop: "8px",
                padding: "4px 8px",
                width: "100%",
                fontFamily: "inherit",
              },
              onClick: () => copyPrompt(t("onboarding.copyPrompt"), null, "已複製", "複製失敗"),
            },
            "📋 複製啟動指令（兜底）",
          ),
        );
      } else {
        // idle
        ctaNode = React.createElement(
          "button",
          {
            style: ctaBase,
            onClick: startScan,
            "data-action": "start-brain",
          },
          React.createElement("span", { style: { fontSize: "16px" } }, "▶️"),
          React.createElement("span", null, t("onboarding.cta")),
        );
      }

      return React.createElement(
        "section",
        { style: Object.assign({}, sectionStyle, { padding: "24px", background: "linear-gradient(180deg, var(--dsw-alias-bg-layer-1) 0%, var(--dsw-alias-bg-layer-2) 100%)" }), "data-block": "onboarding" },
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" } },
          React.createElement("span", { style: { fontSize: "28px" } }, "🧠"),
          React.createElement(
            "div",
            null,
            React.createElement("h3", { style: Object.assign({}, sectionTitleStyle, { margin: 0, fontSize: "15px" }) }, t("onboarding.title")),
            React.createElement("p", { style: { margin: "2px 0 0", fontSize: "12px", color: "var(--dsw-alias-label-secondary)", lineHeight: "1.5" } }, t("onboarding.body")),
          ),
        ),
        React.createElement(
          "div",
          {
            "data-block": "onboarding-features",
            style: { margin: "12px 0 4px", padding: "10px 14px", background: "var(--dsw-alias-bg-layer-2)", borderRadius: "8px", border: "1px solid var(--dsw-alias-border-l1)" },
          },
          ...ONBOARDING_FEATURES.map((f, idx) => React.createElement(
            "div",
            { key: f.titleKey, style: { display: "flex", gap: "10px", padding: idx === 0 ? "2px 0 6px" : "6px 0", alignItems: "flex-start" } },
            React.createElement("span", { style: { fontSize: "14px", flex: "0 0 auto", lineHeight: "1.35", width: "18px", textAlign: "center" } }, f.icon),
            React.createElement("div", null,
              React.createElement("div", { style: { fontSize: "13px", fontWeight: "600", lineHeight: "1.4" } }, t(f.titleKey)),
              React.createElement("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)", lineHeight: "1.45", marginTop: "1px" } }, t(f.descKey)),
            ),
          )),
          React.createElement("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)", marginTop: "6px", paddingTop: "8px", borderTop: "1px dashed var(--dsw-alias-border-l1)" } }, t("onboarding.more")),
        ),
        // path 提示（讓使用者知道會掃哪個目錄）
        // v0.5.1：即使 build-time map miss，只要 sessionId 存在，host 端 initProject RPC
        //   會用 getCwdBySession 兜底解析 cwd，所以這裡不應該再顯示"未檢測到 workspace 路徑"
        //   警告；改為顯示"等待從 sessionId 解析"提示，讓使用者知道會自動兜底。
        path
          ? React.createElement(
              "div",
              {
                style: {
                  marginTop: "12px",
                  fontSize: "10px",
                  color: "var(--dsw-alias-label-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  wordBreak: "break-all",
                },
                "data-workspace-path": path,
              },
              React.createElement("span", null, "📂"),
              React.createElement("span", { style: { fontFamily: "monospace" } }, path),
            )
          : sessionId
          ? React.createElement(
              "div",
              {
                style: {
                  marginTop: "12px",
                  fontSize: "10px",
                  color: "var(--dsw-alias-label-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                },
                "data-workspace-session-id": String(sessionId).slice(0, 12) + "…",
              },
              React.createElement("span", null, "🔌"),
              React.createElement("span", null, "build 未納入此 session，點選啟動將由 host 自動解析路徑"),
            )
          : React.createElement(
              "div",
              {
                style: {
                  marginTop: "12px",
                  fontSize: "11px",
                  color: "var(--dsw-alias-state-warn-primary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                },
              },
              React.createElement("span", null, "⚠️"),
              React.createElement("span", null, "未檢測到 workspace 路徑"),
            ),
        ctaNode,
        // 注入轉圈動畫 keyframes（一次性）
        React.createElement("style", null, "@keyframes dsh-brain-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }"),
      );
    }

    // ─── 智慧續接建議卡（v0.4.15 project_suggest_next） ───
    // v0.4.16：模組級快取（跨元件 unmount/mount）+ 5 分鐘 TTL + preview.changed 失效。
    //   - 切 tab / DashboardSection 重 mount 都不重拉（之前用 useRef 失敗，因為 React 重 mount 會清空 ref）
    //   - 使用者點 ↻ 重新生成 / preview 變化 / 跨過 5 分鐘 才重拉
    const SUGGESTION_TTL_MS = 5 * 60 * 1000;
    const suggestionCache = new Map(); // sessionId -> { fetchedAt, status, data, error, dismissed }

    function SuggestionCard({ t, localeCode, sessionId, connection, projectInitialized, embeddedSuggestion, workspacePath }) {
      // v0.4.18：cache key 只用 workspacePath（專案級共享）；workspacePath 還沒解析到時顯示 loading。
      const cacheKey = workspacePath ? String(workspacePath) : null;
      const cached = cacheKey ? suggestionCache.get(cacheKey) : null;
      // workspacePath 未就緒 → 強制走 loading，避免用 sessionId 落到跨 session 串資料
      const initialState = cached
        ? { status: cached.status, data: cached.data, error: cached.error }
        : (workspacePath
            ? { status: embeddedSuggestion ? "ready" : "idle", data: embeddedSuggestion || null, error: null }
            : { status: "loading", data: null, error: null });
      const [state, setState] = React.useState(initialState);
      const [dismissed, setDismissed] = React.useState(Boolean(cached && cached.dismissed));

      const fetchSuggestion = React.useCallback(async (force) => {
        const rpc = connection && connection.rpc;
        if (!sessionId || !rpc || typeof rpc.call !== "function") return;
        // 模組級 TTL：未強制重新整理 + 已快取 + 在 TTL 內 → 直接複用
        const cur = suggestionCache.get(cacheKey);
        if (!force && cur && cur.status === "ready" && cur.data && (Date.now() - (cur.fetchedAt || 0)) < SUGGESTION_TTL_MS) {
          setState({ status: cur.status, data: cur.data, error: cur.error });
          return;
        }
        setState({ status: "loading", data: (cur && cur.data) || state.data || null, error: null });
        try {
          // v0.4.18：傳 sessionId + workspacePath 讓 host 端用工作區路徑（不依賴 sessionId 解析），
          // 保證同一專案下不同 session 拿到的內容完全一致。
          const payload = { sessionId };
          if (cacheKey) payload.workspacePath = cacheKey;
          const res = await rpc.call("/project-brain", "suggest", payload);
          if (!res) {
            setState({ status: "error", data: null, error: "RPC 返回 undefined" });
            return;
          }
          if (res.ok === false) {
            const ec = (res.error && res.error.code) || "?";
            const em = (res.error && res.error.message) || "(no message)";
            setState({ status: "error", data: null, error: "RPC ok=false · " + ec + " · " + em });
            return;
          }
          if (res.ok && res.value && res.value.suggestion && res.value.suggestion.suggestion) {
            suggestionCache.set(cacheKey, {
              fetchedAt: Date.now(),
              status: "ready",
              data: res.value.suggestion,
              error: null,
              dismissed: false,
            });
            setState({ status: "ready", data: res.value.suggestion, error: null });
            return;
          }
          let errMsg = "智慧續接失敗";
          if (res.error && res.error.message) errMsg = res.error.message + " (" + (res.error.code || "?") + ")";
          else if (!res.value) errMsg = "RPC value 為空";
          else if (!res.value.suggestion) errMsg = "value.suggestion 為空";
          else errMsg = "未知狀態：" + JSON.stringify(res).slice(0, 200);
          setState({ status: "error", data: null, error: errMsg });
        } catch (error) {
          setState({ status: "error", data: null, error: "throw: " + String((error && error.message) || error) });
        }
      }, [sessionId, connection, cacheKey, state.data]);

      React.useEffect(() => {
        if (!projectInitialized) {
          setState({ status: "uninitialized", data: null, error: null });
          return;
        }
        if (dismissed) return;
        const rpc = connection && connection.rpc;
        if (!rpc || !sessionId) return;
        // workspacePath 未就緒 → 等；不要用 sessionId 當 cache key（避免跨 session 串資料）
        if (!cacheKey) {
          setState({ status: "loading", data: null, error: null });
          return;
        }
        const cur = suggestionCache.get(cacheKey);
        if (cur && cur.status === "ready" && cur.data && (Date.now() - (cur.fetchedAt || 0)) < SUGGESTION_TTL_MS) {
          return; // 不重拉
        }
        fetchSuggestion(false);
      }, [projectInitialized, dismissed, fetchSuggestion, sessionId, connection, cacheKey]);

      // v0.4.18：preview.changed → 失效 cache（只失效同 workspacePath 的）
      React.useEffect(() => {
        if (typeof window === "undefined" || !window.addEventListener) return undefined;
        const handler = (event) => {
          const ev = event && event.detail;
          const changedPath = ev && typeof ev.projectPath === "string" ? ev.projectPath : null;
          if (changedPath && cacheKey && changedPath !== cacheKey) return; // 不同專案，不影響
          const c = suggestionCache.get(cacheKey);
          if (c) {
            c.fetchedAt = 0;
            suggestionCache.set(cacheKey, c);
          }
        };
        window.addEventListener("project_brain/preview.changed", handler);
        return () => window.removeEventListener("project_brain/preview.changed", handler);
      }, [cacheKey]);

      if (!projectInitialized) {
        // v0.4.15：專案未初始化時顯示輕提示卡片（不阻塞 Onboarding 流程）
        return React.createElement(
          "div",
          {
            style: {
              margin: "0 12px 8px",
              padding: "8px 12px",
              background: "var(--dsw-alias-bg-layer-2)",
              border: "1px dashed var(--dsw-alias-border-l1)",
              borderRadius: "10px",
              color: "var(--dsw-alias-label-secondary)",
              fontSize: "11px",
            },
            "data-block": "suggestion-uninit",
            "data-suggest-status": "uninit",
          },
          React.createElement("span", null, "💡 "),
          React.createElement("span", null, localeCode === "en-US"
            ? "Init project brain to see today's continuation."
            : "初始化專案腦後檢視今天可能推進的內容。"),
        );
      }
      if (dismissed) {
        return React.createElement(
          "div",
          { style: { padding: "0 12px 8px" }, "data-block": "suggestion-dismissed" },
          React.createElement(
            "button",
            {
              type: "button",
              onClick: () => {
                setDismissed(false);
                const c = suggestionCache.get(cacheKey);
                if (c) c.dismissed = false;
                fetchSuggestion(true);
              },
              style: {
                padding: "4px 10px",
                background: "transparent",
                border: "1px dashed var(--dsw-alias-border-l1)",
                borderRadius: "8px",
                color: "var(--dsw-alias-label-secondary)",
                cursor: "pointer",
                fontSize: "11px",
                fontFamily: "inherit",
              },
              "data-action": "suggest-show",
            },
            "💡 " + (localeCode === "en-US" ? "Show suggestion" : "檢視續接建議"),
          ),
        );
      }

      const data = state.data || {};
      const suggestion = data.suggestion || null;
      const source = data.source || (state.status === "loading" ? "loading" : null);

      let tag;
      if (source === "llm") tag = t("suggest.llmTag");
      else if (source === "llm_failed" || source === "local") tag = t("suggest.localTag");
      else if (source === "local_no_route") tag = t("suggest.localTag");
      else tag = null;

      const confidencePct = suggestion && Number.isFinite(suggestion.confidence) ? Math.round(suggestion.confidence * 100) : null;

      const cardStyle = {
        margin: "0 12px 8px",
        padding: "10px 12px",
        background: "linear-gradient(135deg, var(--dsw-alias-bg-layer-2) 0%, var(--dsw-alias-bg-layer-1) 100%)",
        border: "1px solid var(--dsw-alias-border-l1)",
        borderLeft: "3px solid var(--dsw-alias-brand-primary)",
        borderRadius: "10px",
        color: "var(--dsw-alias-label-primary)",
      };

      const titleRow = React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
        React.createElement("span", { style: { fontSize: "13px", fontWeight: "700" } }, t("suggest.title")),
        tag ? React.createElement("span", {
          style: {
            fontSize: "10px", padding: "1px 7px", borderRadius: "8px",
            background: source === "llm" ? "var(--dsw-alias-brand-primary)" : "var(--dsw-alias-bg-layer-2)",
            color: source === "llm" ? "var(--dsw-alias-bg-base)" : "var(--dsw-alias-label-secondary)",
            fontWeight: "600",
          },
          "data-suggest-source": source,
        }, tag) : null,
        confidencePct != null && source === "llm" ? React.createElement("span", {
          style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)" },
        }, t("suggest.confidence", { pct: confidencePct })) : null,
        React.createElement("span", { style: { flex: "1 1 auto" } }),
        state.status === "ready" ? React.createElement("button", {
          type: "button",
          onClick: () => {
            setDismissed(true);
            const c = suggestionCache.get(cacheKey);
            if (c) c.dismissed = true;
          },
          title: t("suggest.dismiss"),
          "data-action": "suggest-dismiss",
          style: { padding: "2px 8px", background: "transparent", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: "8px", color: "var(--dsw-alias-label-secondary)", cursor: "pointer", fontSize: "10px", fontFamily: "inherit" },
        }, t("suggest.dismiss")) : null,
        state.status !== "loading" ? React.createElement("button", {
          type: "button",
          onClick: () => fetchSuggestion(true),
          title: t("suggest.refresh"),
          "data-action": "suggest-refresh",
          style: { padding: "2px 8px", background: "transparent", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: "8px", color: "var(--dsw-alias-label-secondary)", cursor: "pointer", fontSize: "10px", fontFamily: "inherit" },
        }, "↻ " + t("suggest.refresh")) : null,
      );

      let bodyContent;
      if (state.status === "loading") {
        bodyContent = React.createElement("div", { style: { marginTop: "8px", display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
          React.createElement("span", { "data-spinner": "1", style: { width: "12px", height: "12px", borderRadius: "50%", border: "2px solid var(--dsw-alias-border-l2)", borderTopColor: "var(--dsw-alias-brand-primary)", animation: "dsh-brain-spin 0.9s linear infinite", display: "inline-block" } }),
          t("suggest.loading"),
        );
      } else if (state.status === "error") {
        bodyContent = React.createElement("div", { style: { marginTop: "8px", fontSize: "12px", color: "var(--dsw-alias-state-error-primary)" } },
          "❌ " + (state.error || t("suggest.empty")),
        );
      } else if (!suggestion) {
        bodyContent = React.createElement("div", { style: { marginTop: "8px", fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
 t("suggest.empty"),
        );
      } else {
        bodyContent = React.createElement(
          "div",
          { style: { marginTop: "8px" }, "data-suggestion": "ready" },
          React.createElement("div", { style: { fontSize: "13px", fontWeight: "600", lineHeight: "1.5" }, "data-suggestion-title": "1" }, suggestion.title || ""),
          suggestion.reason ? React.createElement("div", { style: { marginTop: "6px", fontSize: "11px", color: "var(--dsw-alias-label-secondary)", lineHeight: "1.5" }, "data-suggestion-reason": "1" },
            React.createElement("span", { style: { fontWeight: "600" } }, t("suggest.reasonLabel") + "："),
            " " + suggestion.reason,
          ) : null,
          data.llmError ? React.createElement("div", { style: { marginTop: "6px", fontSize: "10px", color: "var(--dsw-alias-state-warn-primary)" }, "data-suggestion-llm-error": "1" },
            t("suggest.fallbackTag") + "：" + (data.llmError.message || data.llmError.code || ""),
          ) : null,
        );
      }

      return React.createElement("div", { style: cardStyle, "data-block": "suggestion", "data-source": source || "unknown" },
        titleRow,
        bodyContent,
      );
    }

    // ─── v0.4.x: GitTab — 視覺化 git 提交歷史（僅專案是 git 倉庫時掛載） ───
    // 設計：左側 ASCII graph（| / \ 節點），右側 commit 資訊；點選展開 body + parents。
    // 資料來源：RPC `git` endpoint（已探測 gitInfo.available 控制掛載）。
    function GitTab({ gitInfo, t, onRefresh, autoRefresh, onToggleAutoRefresh }) {
      if (!gitInfo) {
        return React.createElement("div", { style: { padding: "20px", textAlign: "center", fontSize: "12px", color: "var(--dsw-alias-label-secondary)" }, "data-block": "git-loading" }, "⏳ 載入 git 歷史...");
      }
      if (gitInfo.available !== true) {
        return React.createElement("div", { style: { padding: "20px", textAlign: "center", fontSize: "12px", color: "var(--dsw-alias-label-secondary)" }, "data-block": "git-empty" },
          "📂 當前專案不是 git 倉庫",
          gitInfo.error ? React.createElement("div", { style: { marginTop: "6px", fontSize: "10px", opacity: 0.7 } }, gitInfo.error) : null,
        );
      }

      const commits = gitInfo.commits || [];
      const branches = gitInfo.branches || [];
      const currentBranch = gitInfo.currentBranch;
      const [expanded, setExpanded] = React.useState(null);  // 當前展開的 commit hash

      // ── 時間格式化 ──
      const relTime = (ts) => {
        if (!ts) return "";
        const diff = Date.now() / 1000 - ts;
        if (diff < 60) return Math.round(diff) + "秒前";
        if (diff < 3600) return Math.round(diff / 60) + "分鐘前";
        if (diff < 86400) return Math.round(diff / 3600) + "小時前";
        if (diff < 30 * 86400) return Math.round(diff / 86400) + "天前";
        if (diff < 365 * 86400) return Math.round(diff / 2592000) + "個月前";
        return Math.round(diff / 31536000) + "年前";
      };
      const fmtDate = (ts) => {
        if (!ts) return "";
        const d = new Date(ts * 1000);
        return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      };

      // ── 按 commit hash 索引 branch refs（多分支時掛到對應 commit 行） ──
      const refsByHash = new Map();
      for (const b of branches) {
        if (!refsByHash.has(b.commit)) refsByHash.set(b.commit, []);
        refsByHash.get(b.commit).push({ kind: "branch", name: b.name, isCurrent: b.name === currentBranch });
      }

      // ── 分支配色（按 branch name hash 到固定顏色，讓使用者視覺區分分支） ──
      // 注意：這是 GitHub 風格的淺色裝飾調色盤，獨立於 DSH 主題 token 體系。
      // smoke-theme-tokens.mjs 檢測到 `const palette = [ ... ]` 字面量會自動豁免其中的 hex。
      const palette = [
        { fg: "#1f6feb", bg: "#ddf4ff" },  // 藍
        { fg: "#1a7f37", bg: "#dafbe1" },  // 綠
        { fg: "#8250df", bg: "#fbefff" },  // 紫
        { fg: "#cf222e", bg: "#ffebe9" },  // 紅
        { fg: "#9a6700", bg: "#fff8c5" },  // 黃
        { fg: "#0a3069", bg: "#dbeafe" },  // 深藍
      ];
      const colorByBranch = new Map();
      let colorIdx = 0;
      for (const b of branches) {
        if (!colorByBranch.has(b.name)) {
          colorByBranch.set(b.name, palette[colorIdx % palette.length]);
          colorIdx += 1;
        }
      }

      // ── Styles（VSCode / Cursor 風格：緊湊、留白、hover 高亮） ──
      const cardStyle = {
        background: "var(--dsw-alias-bg-layer-2)",
        border: "1px solid var(--dsw-alias-border-l1)",
        borderRadius: "10px",
        padding: "12px 14px",
        marginBottom: "10px",
        fontSize: "12px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        flexWrap: "wrap",
      };
      const branchChipStyle = (isCurrent) => ({
        fontSize: "11px",
        padding: "3px 10px",
        borderRadius: "11px",
        background: isCurrent ? "var(--dsw-alias-brand-primary)" : "var(--dsw-alias-bg-base)",
        color: isCurrent ? "var(--dsh-brain-bg-base, var(--dsw-alias-bg-base))" : "var(--dsw-alias-label-primary)",
        border: isCurrent ? "none" : "1px solid var(--dsw-alias-border-l1)",
        fontWeight: "600",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
      });
      const listStyle = { listStyle: "none", padding: "0", margin: 0 };

      // 每行 layout: [graph 56px] [commit info flex:1] [refs 130px]
      const rowStyle = (expanded) => ({
        display: "grid",
        gridTemplateColumns: "56px minmax(0, 1fr) 130px",
        gap: "10px",
        alignItems: "center",
        padding: "10px 12px",
        borderRadius: "8px",
        marginBottom: "2px",
        cursor: "pointer",
        background: expanded ? "var(--dsw-alias-bg-layer-1)" : "transparent",
        transition: "background-color 0.12s",
      });
      const graphCellStyle = {
        position: "relative",
        height: "36px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      };
      const dotStyle = (idx, isMerge) => ({
        width: "11px",
        height: "11px",
        borderRadius: isMerge ? "2px" : "50%",
        transform: isMerge ? "rotate(45deg)" : "none",
        background: idx === 0 ? "var(--dsw-alias-brand-primary)" : "var(--dsw-alias-bg-base)",
        border: idx === 0 ? "2px solid var(--dsw-alias-brand-primary)" : "2px solid var(--dsw-alias-label-secondary)",
        zIndex: 2,
        boxShadow: idx === 0 ? "0 0 0 3px var(--dsw-alias-bg-layer-1)" : "none",
      });
      const lineStyle = (idx, total) => ({
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--dsw-alias-border-l2)",
        zIndex: 1,
        ...(idx === 0
          ? { top: "calc(50% + 6px)", height: "calc(50% - 6px)" }
          : idx === total - 1
            ? { top: 0, height: "calc(50% - 6px)" }
            : { top: 0, bottom: 0 }),
        width: "2px",
      });

      const subjectStyle = {
        fontSize: "13px",
        color: "var(--dsw-alias-label-primary)",
        fontWeight: "600",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        lineHeight: "1.4",
      };
      const metaStyle = {
        fontSize: "10.5px",
        color: "var(--dsw-alias-label-secondary)",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginTop: "3px",
        flexWrap: "wrap",
      };
      const hashChipStyle = {
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fontSize: "10px",
        padding: "1px 6px",
        background: "var(--dsw-alias-bg-layer-2)",
        color: "var(--dsw-alias-label-secondary)",
        borderRadius: "4px",
        border: "1px solid var(--dsw-alias-border-l1)",
      };
      const refsCellStyle = {
        display: "flex",
        flexWrap: "wrap",
        gap: "4px",
        justifyContent: "flex-end",
        alignItems: "center",
      };
      const refChipStyle = (isCurrent, color) => ({
        fontSize: "10px",
        padding: "1px 7px",
        borderRadius: "9px",
        background: isCurrent ? color.fg : color.bg,
        color: isCurrent ? "var(--dsw-alias-bg-base)" : color.fg,
        border: "1px solid " + (isCurrent ? color.fg : color.bg),
        fontWeight: isCurrent ? "700" : "500",
        whiteSpace: "nowrap",
      });

      // 展開後的詳情塊樣式
      const expandedPanelStyle = {
        gridColumn: "2 / -1",
        marginTop: "8px",
        padding: "12px 14px",
        background: "var(--dsw-alias-bg-layer-2)",
        border: "1px solid var(--dsw-alias-border-l1)",
        borderRadius: "8px",
        fontSize: "11.5px",
        color: "var(--dsw-alias-label-primary)",
      };
      const detailRowStyle = {
        display: "grid",
        gridTemplateColumns: "70px minmax(0, 1fr)",
        gap: "8px",
        padding: "3px 0",
        fontSize: "11px",
      };
      const detailLabelStyle = {
        color: "var(--dsw-alias-label-secondary)",
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.4px",
      };
      const monospaceStyle = {
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fontSize: "10.5px",
      };
      const bodyTextStyle = {
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        lineHeight: "1.55",
        color: "var(--dsw-alias-label-primary)",
        padding: "8px 10px",
        background: "var(--dsw-alias-bg-base)",
        borderRadius: "6px",
        marginBottom: "10px",
        fontSize: "11.5px",
      };

      // ── 行渲染 ──
      const total = commits.length;
      const renderRow = (c, idx) => {
        const isExpanded = expanded === c.hash;
        const refs = refsByHash.get(c.hash) || [];
        return React.createElement("div", {
          key: c.hash,
          style: rowStyle(isExpanded),
          "data-commit": c.hash,
          "data-expanded": isExpanded ? "1" : "0",
          onClick: (ev) => {
            // 阻止展開內部連結/按鈕冒泡
            const tag = ev && ev.target && ev.target.tagName;
            if (tag === "A" || tag === "BUTTON") return;
            setExpanded(isExpanded ? null : c.hash);
          },
        },
          // graph column
          React.createElement("div", { style: graphCellStyle },
            React.createElement("div", { style: lineStyle(idx, total) }),
            React.createElement("div", { style: dotStyle(idx, c.isMerge) }),
          ),
          // info column
          React.createElement("div", { style: { minWidth: 0 } },
            React.createElement("div", { style: subjectStyle, title: c.subject }, c.subject || "(無標題)"),
            React.createElement("div", { style: metaStyle },
              React.createElement("span", { style: hashChipStyle }, c.shortHash),
              React.createElement("span", { style: { fontWeight: "500" } }, c.author || "?"),
              React.createElement("span", null, "·"),
              React.createElement("span", { title: c.isoTime || "" }, relTime(c.timestamp)),
              c.isMerge ? React.createElement("span", { style: { color: "var(--dsw-alias-state-warn-primary)", fontSize: "10px" } }, "⎇ merge") : null,
              // v0.4.x: 變更檔案摘要（來自 history.js 的 tree diff；pack 不可讀時為 0）
              typeof c.filesChangedTotal === "number" && c.filesChangedTotal > 0
                ? (() => {
                    const fileStatText =
                      "\u{1F4C1} " +
                      (c.filesAdded ? "+" + c.filesAdded + " " : "") +
                      (c.filesModified ? "~" + c.filesModified + " " : "") +
                      (c.filesRemoved ? "-" + c.filesRemoved + " " : "") +
                      "(" + c.filesChangedTotal + " \u6587\u4EF6)";
                    return React.createElement("span", {
                      style: { fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-secondary)", display: "inline-flex", alignItems: "center", gap: "4px" },
                    }, fileStatText);
                  })()
                : null,
            ),
            // 展開後的詳情
            isExpanded ? React.createElement("div", { style: expandedPanelStyle },
              c.body ? React.createElement("div", { style: bodyTextStyle }, c.body) : React.createElement("div", { style: Object.assign({}, bodyTextStyle, { opacity: 0.6, fontStyle: "italic" }) }, "（無詳細描述）"),
              React.createElement("div", { style: detailRowStyle },
                React.createElement("div", { style: detailLabelStyle }, "Hash"),
                React.createElement("div", { style: monospaceStyle }, c.hash),
              ),
              c.authorEmail ? React.createElement("div", { style: detailRowStyle },
                React.createElement("div", { style: detailLabelStyle }, "Author"),
                React.createElement("div", null, c.author + " <" + c.authorEmail + ">"),
              ) : null,
              React.createElement("div", { style: detailRowStyle },
                React.createElement("div", { style: detailLabelStyle }, "Date"),
                React.createElement("div", null, fmtDate(c.timestamp) + " " + (c.isoTime || "").slice(11, 19) + " UTC"),
              ),
              c.firstParent ? React.createElement("div", { style: detailRowStyle },
                React.createElement("div", { style: detailLabelStyle }, "Parent"),
                React.createElement("div", { style: monospaceStyle }, c.firstParent),
              ) : null,
              c.extraParents && c.extraParents.length > 0 ? React.createElement("div", { style: detailRowStyle },
                React.createElement("div", { style: detailLabelStyle }, "Merged"),
                React.createElement("div", { style: monospaceStyle, color: "var(--dsw-alias-state-warn-primary)" }, c.extraParents.join(", ")),
              ) : null,
              // v0.4.x: Changed Files 列表（tree diff 失敗時不顯示）
              Array.isArray(c.filesChanged) && c.filesChanged.length > 0 ? React.createElement("div", { style: Object.assign({}, detailRowStyle, { alignItems: "flex-start" }) },
                React.createElement("div", { style: detailLabelStyle }, "Files"),
                React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" } },
                  c.filesChanged.map((f) =>
                    React.createElement("span", {
                      key: f,
                      style: { fontSize: "10px", fontFamily: "ui-monospace, monospace", padding: "1px 6px", background: "var(--dsw-alias-bg-base)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: "3px", color: "var(--dsw-alias-label-primary)", maxWidth: "320px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
                      title: f,
                    }, f),
                  ),
                  c.filesTruncated ? React.createElement("span", {
                    style: { fontSize: "10px", padding: "1px 6px", color: "var(--dsw-alias-label-secondary)", fontStyle: "italic" },
                  }, "… +" + (c.filesChangedTotal - c.filesChanged.length) + " more") : null,
                ),
              ) : null,
            ) : null,
          ),
          // refs column
          React.createElement("div", { style: refsCellStyle },
            refs.map((r) => {
              const color = colorByBranch.get(r.name) || palette[0];
              return React.createElement("span", {
                key: r.name,
                style: refChipStyle(r.isCurrent, color),
                title: "refs/heads/" + r.name + (r.isCurrent ? " (current)" : ""),
              }, r.name);
            }),
          ),
        );
      };

      const otherBranches = branches.filter((b) => b.name !== currentBranch);

      // v0.4.x: Working Tree 區塊（HEAD tree vs 工作樹對比，列出 untracked / deleted）
      const wt = gitInfo && gitInfo.workTree;
      const [wtExpanded, setwtExpanded] = React.useState(false);
      const renderWorkTreeSection = (workTree) => {
        if (!workTree || workTree.available !== true) return null;
        const untrackedTotal = workTree.untrackedTotal || 0;
        const deletedTotal = workTree.deletedTotal || 0;
        if (untrackedTotal === 0 && deletedTotal === 0) return null;
        const wtCardStyle = {
          margin: "12px 0 4px",
          padding: "12px 14px",
          background: "var(--dsw-alias-bg-layer-2)",
          border: "1px solid var(--dsw-alias-border-l1)",
          borderRadius: "10px",
          fontSize: "12px",
        };
        const wtHeaderStyle = {
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: untrackedTotal + deletedTotal > 0 && wtExpanded ? "10px" : 0,
          cursor: "pointer",
          userSelect: "none",
        };
        const fileRowStyle = {
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "3px 0",
          fontFamily: "ui-monospace, monospace",
          fontSize: "10.5px",
          color: "var(--dsw-alias-label-primary)",
        };
        const filePathStyle = {
          padding: "1px 6px",
          background: "var(--dsw-alias-bg-base)",
          border: "1px solid var(--dsw-alias-border-l1)",
          borderRadius: "3px",
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        };
        const statusBadgeStyle = (kind) => ({
          fontSize: "10px",
          padding: "1px 7px",
          borderRadius: "9px",
          fontWeight: "600",
          flex: "0 0 auto",
          background: kind === "untracked" ? "var(--dsw-alias-state-warn-bg, var(--dsw-alias-bg-layer-2))" : "var(--dsw-alias-state-error-bg, var(--dsw-alias-bg-layer-2))",
          color: kind === "untracked" ? "var(--dsw-alias-state-warn-primary)" : "var(--dsw-alias-state-error-primary)",
        });
        const renderFileGroup = (label, kind, sample, total, truncated) => {
          if (total === 0) return null;
          const visible = wtExpanded ? sample : sample.slice(0, 8);
          return React.createElement("div", { style: { marginBottom: "8px" } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" } },
              React.createElement("span", { style: statusBadgeStyle(kind) }, label),
              React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)" } }, total + " 檔案" + (truncated ? "（已截斷）" : "")),
            ),
            visible.length > 0 ? React.createElement("div", { style: { paddingLeft: "8px" } },
              visible.map((f) =>
                React.createElement("div", { key: f, style: fileRowStyle, title: f },
                  React.createElement("span", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: "10px", flex: "0 0 auto" } }, "•"),
                  React.createElement("span", { style: filePathStyle }, f),
                ),
              ),
              !wtExpanded && sample.length > 8
                ? React.createElement("div", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)", paddingLeft: "16px" } }, "+ " + (sample.length - 8) + " 更多（點選展開檢視全部）")
                : null,
              wtExpanded && truncated
                ? React.createElement("div", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)", paddingLeft: "16px" } }, "（後端已截斷，全部 " + total + " 個）")
                : null,
            ) : null,
          );
        };
        return React.createElement("div", { style: wtCardStyle, "data-block": "work-tree" },
          React.createElement("div", { style: wtHeaderStyle, onClick: () => setwtExpanded(!wtExpanded) },
            React.createElement("span", { style: { fontSize: "14px" } }, "🔸"),
            React.createElement("span", { style: { fontWeight: "600", fontSize: "12.5px" } }, "Working Tree"),
            React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)" } },
              untrackedTotal + " untracked" + (deletedTotal > 0 ? " · " + deletedTotal + " deleted" : ""),
            ),
            workTree.reference === "fallback"
              ? React.createElement("span", {
                  style: { fontSize: "10px", padding: "1px 7px", borderRadius: "9px", background: "var(--dsw-alias-state-warn-bg, var(--dsw-alias-bg-layer-1))", border: "1px solid var(--dsw-alias-state-warn-primary)", color: "var(--dsw-alias-state-warn-primary)", fontWeight: "600" },
                  title: "HEAD tree 不可讀（pack 解析限制），已沿 first-parent 鏈回退到 " + (workTree.referenceCommitShort || "?") + " 作為參考，結果可能略有過期",
                }, "vs " + (workTree.referenceCommitShort || "fallback"))
              : null,
            React.createElement("span", { style: { marginLeft: "auto", fontSize: "11px", color: "var(--dsw-alias-label-secondary)" } }, wtExpanded ? "▴" : "▾"),
          ),
          wtExpanded ? React.createElement("div", null,
            renderFileGroup("Untracked", "untracked", workTree.untrackedSample || [], untrackedTotal, workTree.truncatedUntracked),
            renderFileGroup("Deleted", "deleted", workTree.deletedSample || [], deletedTotal, workTree.truncatedDeleted),
          ) : null,
        );
      };

      return React.createElement("div", { style: { padding: "0 4px 16px" }, "data-block": "git-tab" },
        // header card
        React.createElement("div", { style: cardStyle },
          React.createElement("span", { style: branchChipStyle(true) }, "⎇ " + (currentBranch || "detached HEAD")),
          React.createElement("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
            commits.length + " 個提交" + (gitInfo.truncated ? "（已截斷）" : ""),
          ),
          otherBranches.length > 0 ? React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)" } },
            "· " + otherBranches.length + " 個其他分支",
          ) : null,
          gitInfo.head ? React.createElement("span", { style: { marginLeft: "auto", fontFamily: "ui-monospace, monospace", fontSize: "10px", color: "var(--dsw-alias-label-secondary)" } }, "HEAD " + gitInfo.head.substring(0, 7)) : null,
          // v0.4.x: 自動重新整理開關 + 手動重新整理按鈕
          typeof onRefresh === "function" ? React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: "4px", marginLeft: "8px" } },
            typeof onToggleAutoRefresh === "function" ? React.createElement("button", {
              key: "auto",
              type: "button",
              title: autoRefresh ? "自動重新整理已開啟（30s 間隔），點選關閉" : "自動重新整理已關閉，點選開啟",
              onClick: () => onToggleAutoRefresh(!autoRefresh),
              "data-git-auto": autoRefresh ? "1" : "0",
              style: {
                fontSize: "10px",
                padding: "2px 8px",
                borderRadius: "10px",
                border: "1px solid " + (autoRefresh ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-border-l1)"),
                background: autoRefresh ? "var(--dsw-alias-state-success-bg, var(--dsw-alias-bg-layer-2))" : "transparent",
                color: autoRefresh ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-label-secondary)",
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              },
            }, React.createElement("span", { style: { width: "6px", height: "6px", borderRadius: "50%", background: autoRefresh ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-label-secondary)" } }), autoRefresh ? "自動 30s" : "自動關") : null,
            React.createElement("button", {
              key: "refresh",
              type: "button",
              title: "重新整理 Git 資料",
              onClick: onRefresh,
              "data-git-refresh": "1",
              style: {
                fontSize: "14px",
                padding: "2px 8px",
                borderRadius: "6px",
                border: "1px solid var(--dsw-alias-border-l1)",
                background: "transparent",
                color: "var(--dsw-alias-label-primary)",
                cursor: "pointer",
                fontFamily: "inherit",
                lineHeight: "1",
              },
            }, "↻"),
          ) : null,
        ),
        // commits 列表
        commits.length === 0
          ? React.createElement("div", { style: { padding: "20px", textAlign: "center", fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } }, "（無提交歷史）")
          : React.createElement("div", { style: listStyle },
              commits.map((c, idx) => renderRow(c, idx)),
            ),
        // v0.4.x: Working Tree 區塊 — HEAD tree vs 工作樹對比，不依賴 git binary
        renderWorkTreeSection(gitInfo.workTree),
      );
    }

    // ─── dsh-project-brain Settings Tab (v0.7.x) ────────────────────────────
    // 把外掛設定暴露在 Dashboard 的「設定」tab（欄位與 config.js 手寫對齊，不是全量 schema），
    // 不依賴 DSH 桌面設定面板是否渲染第三方外掛 settings。
    //   - 欄位後設資料與 config.js 的 Config schema 保持一致（手寫）
    //   - 讀：rpc.call("/project-brain", "settings", { action: "get" })
    //   - 寫：rpc.call("/project-brain", "settings", { sessionId, action: "update", patch })
    const BRAIN_SETTINGS_META = [
      { group: "retrieval", icon: "🔎", title: { "zh-CN": "檢索與向量", "en-US": "Retrieval & vectors" },
        fields: [
          { key: "retrievalMode", label: { "zh-CN": "檢索模式", "en-US": "Retrieval mode" }, type: "enum",
            options: [{ v: "keyword", l: { "zh-CN": "關鍵詞 (BM25)", "en-US": "Keyword (BM25)" } }, { v: "hybrid", l: { "zh-CN": "混合 (關鍵詞 + 向量)", "en-US": "Hybrid (keyword + vector)" } }],
            hint: { "zh-CN": "hybrid 需要先配置下方 Embedding", "en-US": "hybrid requires Embedding configured below" } },
          { key: "vectorEnabled", label: { "zh-CN": "啟用向量檢索", "en-US": "Vector retrieval" }, type: "boolean",
            hint: { "zh-CN": "關閉時即使配了 embedding 也只用關鍵詞", "en-US": "When off, retrieval is keyword-only even if embedding is configured" } },
          { key: "embeddingBaseURL", label: { "zh-CN": "Embedding 地址", "en-US": "Embedding base URL" }, type: "string",
            placeholder: "https://api.openai.com/v1",
            hint: { "zh-CN": "OpenAI 相容 /v1/embeddings 端點；留空 = 停用向量", "en-US": "OpenAI-compatible /v1/embeddings endpoint; empty = no vectors" } },
          { key: "embeddingModel", label: { "zh-CN": "Embedding 模型", "en-US": "Embedding model" }, type: "string",
            placeholder: "text-embedding-3-small" },
          { key: "embeddingApiKeyEnv", label: { "zh-CN": "API Key", "en-US": "API Key" }, type: "password",
            placeholder: "sk-… 或 PROJECT_BRAIN_EMBEDDING_API_KEY",
            hint: { "zh-CN": "優先直接填寫 API Key。如果填的是 PROJECT_BRAIN_EMBEDDING_API_KEY 這類全大寫名字，則不會把它當作金鑰，而是讀取本機同名環境變數的值；請先在系統或使用者環境變數裡配好該項，並完全退出再開啟 DSH Desktop。", "en-US": "Paste the API key to use it directly. An ALL_CAPS name like PROJECT_BRAIN_EMBEDDING_API_KEY is not the secret: the plugin reads the local environment variable of the same name. Set that env var on this machine, then fully quit and reopen DSH Desktop." } },
          { key: "embeddingDimensions", label: { "zh-CN": "向量維度", "en-US": "Vector dimensions" }, type: "number",
            hint: { "zh-CN": "0 = 由服務自動推斷", "en-US": "0 = auto from service" } },
          { key: "embeddingBatchSize", label: { "zh-CN": "Embedding 批大小", "en-US": "Embedding batch size" }, type: "number", min: 1, max: 128 },
          { key: "embeddingMaxIndexPerRun", label: { "zh-CN": "單次最大索引條目", "en-US": "Max items per indexing run" }, type: "number", min: 1, max: 500 },
          { key: "embeddingTimeoutMs", label: { "zh-CN": "Embedding 超時 (ms)", "en-US": "Embedding timeout (ms)" }, type: "number", min: 1000, max: 120000, step: 1000 },
        ],
      },
      { group: "weights", icon: "⚖️", title: { "zh-CN": "檢索權重", "en-US": "Retrieval weights" },
        hint: { "zh-CN": "只作用於 project_ask 的記憶排序（不管列表和會話注入）。哪項更大哪項更優先，五項相對大小即可，不必湊成 1。儲存後下次提問生效。", "en-US": "Applies only to project_ask memory ranking, not list or session inject. Higher = more influence; need not sum to 1. Takes effect on the next ask after save." },
        fields: [
          { key: "keywordWeight", label: { "zh-CN": "關鍵詞權重", "en-US": "Keyword" }, type: "number", min: 0, max: 1, step: 0.05,
            hint: { "zh-CN": "字面匹配（BM25）。問題裡有專有名詞、檔名、術語時調高。", "en-US": "Lexical BM25. Raise when the question contains names, files, or exact terms." } },
          { key: "vectorWeight", label: { "zh-CN": "向量權重", "en-US": "Vector" }, type: "number", min: 0, max: 1, step: 0.05,
            hint: { "zh-CN": "語義相近。同義改寫、詞對不上時靠這項。未建向量或未開 hybrid 時此項為 0。", "en-US": "Semantic similarity. Helps paraphrases. Stays 0 until vectors are indexed in hybrid mode." } },
          { key: "importanceWeight", label: { "zh-CN": "重要性權重", "en-US": "Importance" }, type: "number", min: 0, max: 1, step: 0.05,
            hint: { "zh-CN": "記憶自帶的重要性。預設最大，讓標過重要的決策排前面。", "en-US": "Memory importance. Highest by default so marked decisions rank first." } },
          { key: "confidenceWeight", label: { "zh-CN": "可信度權重", "en-US": "Confidence" }, type: "number", min: 0, max: 1, step: 0.05,
            hint: { "zh-CN": "抽取可信度。一般保持較低，避免模型自評擠掉事實。", "en-US": "Extraction confidence. Keep low so model self-scores do not dominate." } },
          { key: "recencyWeight", label: { "zh-CN": "時新性權重", "en-US": "Recency" }, type: "number", min: 0, max: 1, step: 0.05,
            hint: { "zh-CN": "越新越高：約 7 天內滿分，約 180 天降到 0。", "en-US": "Newer ranks higher: full score within ~7 days, near 0 by ~180 days." } },
        ],
      },
      { group: "summary", icon: "📝", title: { "zh-CN": "會話摘要 (LLM)", "en-US": "Session summary (LLM)" },
        fields: [
          { key: "sessionSemanticMemoryEnabled", label: { "zh-CN": "啟用會話摘要", "en-US": "Enable session summary" }, type: "boolean",
            hint: { "zh-CN": "會話安靜一段時間後自動調 LLM 抽取語義記憶並做證據校驗。不需要關閉會話。", "en-US": "After the session goes quiet, extract semantic memories with a grounding check. Closing the session is not required." } },
          { key: "sessionIdleSummaryMs", label: { "zh-CN": "空閒多久再摘要 (ms)", "en-US": "Idle before summary (ms)" }, type: "number", min: 30000, max: 3600000, step: 1000,
            hint: { "zh-CN": "每次會話有動靜都重新計時。安靜滿這段時間才摘要，預設 5 分鐘。會話被銷燬時仍會立刻摘要。", "en-US": "Each flush resets the timer. A summary runs after this much quiet time (default 5 minutes). Session dispose still summarizes immediately." } },
          { key: "sessionSemanticMaxChars", label: { "zh-CN": "Transcript 截斷 (chars)", "en-US": "Transcript truncate (chars)" }, type: "number", min: 2000, max: 40000, step: 1000 },
          { key: "sessionSemanticMaxItems", label: { "zh-CN": "每次最多抽取", "en-US": "Max items per extraction" }, type: "number", min: 1, max: 8 },
          { key: "sessionSemanticTimeoutMs", label: { "zh-CN": "LLM 超時 (ms)", "en-US": "LLM timeout (ms)" }, type: "number", min: 5000, max: 120000, step: 1000 },
        ],
      },
      { group: "arch", icon: "🏗️", title: { "zh-CN": "架構分析", "en-US": "Architecture analysis" },
        fields: [
          { key: "architectureEnabled", label: { "zh-CN": "啟用架構分析", "en-US": "Enable" }, type: "boolean" },
          { key: "architectureLlmEnabled", label: { "zh-CN": "LLM 增強", "en-US": "LLM enrichment" }, type: "boolean" },
          { key: "architectureLlmIncludeSource", label: { "zh-CN": "向 LLM 注入原始碼片段", "en-US": "Inject source snippets into LLM" }, type: "boolean" },
          { key: "architectureMaxFiles", label: { "zh-CN": "最大掃描檔案數", "en-US": "Max files scanned" }, type: "number", min: 20, max: 1000 },
          { key: "architectureMaxNodes", label: { "zh-CN": "最大架構節點", "en-US": "Max architecture nodes" }, type: "number", min: 6, max: 60 },
          { key: "architectureLlmTimeoutMs", label: { "zh-CN": "LLM 超時 (ms)", "en-US": "LLM timeout (ms)" }, type: "number", min: 5000, max: 120000, step: 1000 },
        ],
      },
    ];

    function settingsFieldLabel(field, localeCode) {
      const label = field.label && typeof field.label === "object" ? field.label[localeCode] || field.label["zh-CN"] : field.label;
      return label || field.key;
    }
    function settingsFieldHint(field, localeCode) {
      if (!field.hint) return null;
      return field.hint && typeof field.hint === "object" ? field.hint[localeCode] || field.hint["zh-CN"] : field.hint;
    }
    function settingsGroupTitle(group, localeCode) {
      return group.title && typeof group.title === "object" ? group.title[localeCode] || group.title["zh-CN"] : group.title;
    }
    function settingsOptionLabel(opt, localeCode) {
      return opt.l && typeof opt.l === "object" ? opt.l[localeCode] || opt.l["zh-CN"] : opt.l;
    }

    function SettingsTab({ rpc, sessionId, t, localeCode }) {
      const locale = (localeCode === "en-US") ? "en-US" : "zh-CN";
      const initial = { loaded: false, writable: false, config: {}, dirty: {}, saving: false, error: null, info: null };
      const [state, setState] = React.useState(initial);
      const [probes, setProbes] = React.useState({
        embedding: { status: "idle", message: "" },
        llm: { status: "idle", message: "" },
      });
      const [revealSecrets, setRevealSecrets] = React.useState({});

      const loadSettings = React.useCallback(async () => {
        if (!rpc || typeof rpc.call !== "function") {
          setState(Object.assign({}, initial, { loaded: true, error: "DSH Runtime RPC unavailable" }));
          return;
        }
        setState((s) => Object.assign({}, s, { error: null, info: null }));
        try {
          const res = await rpc.call("/project-brain", "settings", { sessionId, action: "get" });
          if (res && res.ok && res.value) {
            setState({ loaded: true, writable: !!res.value.writable, config: res.value.config || {}, dirty: {}, saving: false, error: null, info: null });
          } else {
            const code = (res && res.error && res.error.code) || "E_RPC";
            const msg = (res && res.error && res.error.message) || "無法讀取外掛設定";
            setState((s) => Object.assign({}, s, { loaded: true, error: msg + (code !== "E_RPC" ? " [" + code + "]" : "") }));
          }
        } catch (e) {
          setState((s) => Object.assign({}, s, { loaded: true, error: String((e && e.message) || e) }));
        }
      }, [rpc, sessionId]);

      React.useEffect(() => { loadSettings(); }, [loadSettings]);

      function updateField(key, value) {
        setState((s) => ({
          loaded: s.loaded,
          writable: s.writable,
          config: Object.assign({}, s.config, { [key]: value }),
          dirty: Object.assign({}, s.dirty, { [key]: value }),
          saving: false,
          error: null,
          info: null,
        }));
      }

      async function save() {
        const dirtyKeys = Object.keys(state.dirty);
        if (dirtyKeys.length === 0 || state.saving) return;
        const patch = {};
        for (const key of dirtyKeys) patch[key] = state.dirty[key];
        setState((s) => Object.assign({}, s, { saving: true, error: null, info: null }));
        try {
          const res = await rpc.call("/project-brain", "settings", { sessionId, action: "update", patch });
          if (res && res.ok && res.value) {
            setState({ loaded: true, writable: !!res.value.writable, config: res.value.config || {}, dirty: {}, saving: false, error: null, info: "✓ 已儲存" });
          } else {
            const code = (res && res.error && res.error.code) || "E_RPC";
            const msg = (res && res.error && res.error.message) || "儲存失敗";
            setState((s) => Object.assign({}, s, { saving: false, error: msg + (code !== "E_RPC" ? " [" + code + "]" : "") }));
          }
        } catch (e) {
          setState((s) => Object.assign({}, s, { saving: false, error: String((e && e.message) || e) }));
        }
      }

      function discard() {
        setState((s) => Object.assign({}, s, { dirty: {}, error: null, info: "已丟棄本地修改（點選「重新讀取」會重新整理伺服器值）" }));
      }

      async function runProbe(target) {
        if (!rpc || typeof rpc.call !== "function" || probes[target] && probes[target].status === "running") return;
        setProbes((s) => Object.assign({}, s, { [target]: { status: "running", message: t("settings.probe.running") } }));
        try {
          const res = await rpc.call("/project-brain", "settings", {
            sessionId,
            action: "probe",
            target,
            config: state.config,
          });
          const probe = res && res.ok && res.value && res.value.probe;
          if (!probe) {
            const msg = (res && res.error && res.error.message) || "RPC failed";
            setProbes((s) => Object.assign({}, s, { [target]: { status: "fail", message: msg } }));
            return;
          }
          const latency = probe.details && probe.details.latencyMs != null ? " · " + probe.details.latencyMs + "ms" : "";
          setProbes((s) => Object.assign({}, s, {
            [target]: { status: probe.ok ? "ok" : "fail", message: String(probe.message || probe.code || "") + latency },
          }));
        } catch (e) {
          setProbes((s) => Object.assign({}, s, { [target]: { status: "fail", message: String((e && e.message) || e) } }));
        }
      }

      function renderProbe(target) {
        const probe = probes[target] || { status: "idle", message: "" };
        const running = probe.status === "running";
        const color = probe.status === "ok"
          ? "var(--dsw-alias-state-success-primary)"
          : probe.status === "fail"
            ? "var(--dsw-alias-state-error-primary)"
            : "var(--dsw-alias-label-secondary)";
        const label = target === "embedding" ? t("settings.probe.embedding") : t("settings.probe.llm");
        const hint = target === "embedding" ? t("settings.probe.embeddingHint") : t("settings.probe.llmHint");
        return React.createElement("div", { style: { marginTop: "8px", paddingTop: "10px", borderTop: "1px dashed var(--dsw-alias-border-l1)" } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
            React.createElement("button", {
              type: "button",
              "data-action": "probe-" + target,
              "data-probe-btn": "compact",
              disabled: running || !state.loaded,
              onClick: () => runProbe(target),
              style: {
                padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "500", fontFamily: "inherit",
                border: "1px solid rgb(186, 216, 238)",
                background: "rgb(236, 245, 252)",
                color: "rgb(56, 112, 168)",
                cursor: running ? "not-allowed" : "pointer",
                opacity: running ? 0.6 : 1,
              },
            }, running ? t("settings.probe.running") : label),
            probe.message ? React.createElement("span", { "data-probe-status": probe.status, style: { fontSize: "11px", color } },
              (probe.status === "ok" ? "✓ " : probe.status === "fail" ? "✗ " : "") + probe.message,
            ) : null,
          ),
          React.createElement("div", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)", marginTop: "4px" } }, hint),
        );
      }

      function renderField(field, value) {
        const fieldLabel = settingsFieldLabel(field, locale);
        const hint = settingsFieldHint(field, locale);
        const inputId = "brain-set-" + field.key;
        const labelStyle = { display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px", color: "var(--dsw-alias-label-primary)" };
        const inputBase = {
          width: "100%", boxSizing: "border-box", padding: "6px 9px",
          background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)",
          border: "1px solid var(--dsw-alias-border-l1)", borderRadius: "6px",
          fontFamily: "inherit", fontSize: "12px",
        };

        if (field.type === "boolean") {
          const checked = value === true;
          return React.createElement("div", { key: field.key, style: { marginBottom: "10px" } },
            React.createElement("label", { htmlFor: inputId, style: { display: "flex", alignItems: "center", gap: "8px", cursor: state.writable ? "pointer" : "not-allowed" } },
              React.createElement("input", {
                id: inputId, type: "checkbox",
                checked: checked, disabled: !state.writable || state.saving,
                onChange: (e) => updateField(field.key, e.target.checked === true),
                style: { cursor: state.writable ? "pointer" : "not-allowed" },
              }),
              React.createElement("span", { style: labelStyle }, fieldLabel),
            ),
            hint ? React.createElement("div", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)", marginTop: "2px", marginLeft: "24px" } }, hint) : null,
          );
        }

        if (field.type === "enum") {
          return React.createElement("div", { key: field.key, style: { marginBottom: "10px" } },
            React.createElement("label", { htmlFor: inputId, style: labelStyle }, fieldLabel),
            React.createElement("select", {
              id: inputId, disabled: !state.writable || state.saving,
              value: value == null ? "" : String(value),
              onChange: (e) => updateField(field.key, e.target.value),
              style: Object.assign({}, inputBase),
            }, (field.options || []).map((opt) =>
              React.createElement("option", { key: opt.v, value: opt.v }, settingsOptionLabel(opt, locale)),
            )),
            hint ? React.createElement("div", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)", marginTop: "2px" } }, hint) : null,
          );
        }

        if (field.type === "password") {
          const revealed = !!revealSecrets[field.key];
          return React.createElement("div", { key: field.key, style: { marginBottom: "10px" } },
            React.createElement("label", { htmlFor: inputId, style: labelStyle }, fieldLabel),
            React.createElement("div", { style: { position: "relative" } },
              React.createElement("input", {
                id: inputId,
                type: revealed ? "text" : "password",
                autoComplete: "off",
                disabled: !state.writable || state.saving,
                value: value == null ? "" : String(value),
                placeholder: field.placeholder || "",
                onChange: (e) => updateField(field.key, e.target.value),
                style: Object.assign({}, inputBase, { paddingRight: "36px", fontFamily: "ui-monospace, monospace" }),
              }),
              React.createElement("button", {
                type: "button",
                "data-action": "toggle-secret",
                "aria-label": revealed
                  ? (locale === "en-US" ? "Hide API key" : "隱藏金鑰")
                  : (locale === "en-US" ? "Show API key" : "顯示金鑰"),
                title: revealed ? (locale === "en-US" ? "Hide" : "隱藏") : (locale === "en-US" ? "Show" : "顯示"),
                onClick: () => setRevealSecrets((s) => Object.assign({}, s, { [field.key]: !s[field.key] })),
                style: {
                  position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)",
                  width: "24px", height: "24px", padding: 0, border: "none", borderRadius: "4px",
                  background: "transparent", color: "var(--dsw-alias-label-secondary)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                },
              },
                React.createElement("svg", {
                  width: 16, height: 16, viewBox: "0 0 24 24", fill: "none",
                  stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
                  "aria-hidden": "true",
                },
                  React.createElement("path", { d: "M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" }),
                  React.createElement("circle", { cx: 12, cy: 12, r: 3 }),
                  revealed ? React.createElement("line", { x1: 3, y1: 3, x2: 21, y2: 21 }) : null,
                ),
              ),
            ),
            hint ? React.createElement("div", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)", marginTop: "2px" } }, hint) : null,
          );
        }

        // number / string 共享一個 input
        const isNumber = field.type === "number";
        const inputProps = {
          id: inputId, disabled: !state.writable || state.saving,
          onChange: (e) => {
            const raw = e.target.value;
            if (isNumber) {
              if (raw === "" || raw === "-") { updateField(field.key, raw); return; }
              const num = Number(raw);
              updateField(field.key, Number.isFinite(num) ? num : raw);
            } else {
              updateField(field.key, raw);
            }
          },
          style: Object.assign({}, inputBase, isNumber ? { fontFamily: "ui-monospace, monospace" } : {}),
          placeholder: field.placeholder || "",
        };
        if (isNumber) {
          if (typeof field.min === "number") inputProps.min = field.min;
          if (typeof field.max === "number") inputProps.max = field.max;
          if (typeof field.step === "number") inputProps.step = field.step;
          inputProps.type = "number";
          inputProps.value = value == null ? "" : String(value);
        } else {
          inputProps.type = "text";
          inputProps.value = value == null ? "" : String(value);
        }
        return React.createElement("div", { key: field.key, style: { marginBottom: "10px" } },
          React.createElement("label", { htmlFor: inputId, style: labelStyle }, fieldLabel),
          React.createElement("input", inputProps),
          hint ? React.createElement("div", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)", marginTop: "2px" } }, hint) : null,
        );
      }

      if (!state.loaded) {
        return React.createElement("div", { style: { padding: "20px", textAlign: "center", fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } }, "載入設定中…");
      }

      const dirtyCount = Object.keys(state.dirty).length;

      return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } },
        React.createElement("div", { style: {
          padding: "9px 12px", borderRadius: "8px",
          border: "1px solid " + (state.writable ? "var(--dsw-alias-state-success-primary, var(--dsw-alias-border-l1))" : "var(--dsw-alias-state-warn-primary)"),
          background: "var(--dsw-alias-bg-layer-1)",
          display: "flex", alignItems: "center", gap: "8px", fontSize: "12px",
          color: state.writable ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-state-warn-primary)",
        } },
          React.createElement("span", null, state.writable ? "✅" : "⚠️"),
          React.createElement("span", { style: { flex: "1 1 auto", lineHeight: "1.45" } }, state.writable
            ? (locale === "en-US" ? "Settings are writable. After editing, scroll to the bottom of this page and click Save — unsaved changes do not take effect." : "配置可寫。改完後請滾到本頁最底部點「儲存」；未點儲存不會生效。")
            : (locale === "en-US" ? "Settings read-only in this runtime (DSH settings service unavailable). Configure via DSH settings panel or env vars." : "當前執行時配置為只讀（DSH settings 服務不可用）。請通過 DSH 設定面板或環境變數配置。")),
          React.createElement("span", { style: { marginLeft: "auto", cursor: "pointer", opacity: 0.85 } , onClick: loadSettings, title: locale === "en-US" ? "Reload" : "重新讀取"},
            "⟳"),
        ),
        BRAIN_SETTINGS_META.map((group) =>
          React.createElement("section", {
            key: group.group, style: {
              padding: "12px 14px", background: "var(--dsw-alias-bg-layer-2)",
              borderRadius: "10px", border: "1px solid var(--dsw-alias-border-l1)",
            },
          },
            React.createElement("h3", { style: { fontSize: "13px", fontWeight: "700", margin: "0 0 4px", display: "flex", alignItems: "center", gap: "6px", color: "var(--dsw-alias-label-primary)" } },
              React.createElement("span", null, group.icon),
              React.createElement("span", null, settingsGroupTitle(group, locale)),
            ),
            group.hint ? React.createElement("div", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)", marginBottom: "10px" } }, settingsFieldHint(group, locale)) : null,
            group.fields.map((field) => renderField(field, state.config[field.key])),
            group.group === "retrieval" ? renderProbe("embedding") : null,
            group.group === "summary" ? renderProbe("llm") : null,
          ),
        ),
        React.createElement("div", { style: {
          position: "sticky", bottom: "0", marginTop: "6px",
          padding: "10px 12px", background: "var(--dsw-alias-bg-layer-2)",
          borderRadius: "10px", border: "1px solid var(--dsw-alias-border-l1)",
          display: "flex", alignItems: "center", gap: "10px",
        } },
          state.error ? React.createElement("span", { style: { color: "var(--dsw-alias-state-error-primary)", fontSize: "11px", flex: "1 1 auto" } }, "❌ " + state.error) : null,
          !state.error && state.info ? React.createElement("span", { style: { color: "var(--dsw-alias-state-success-primary)", fontSize: "11px", flex: "1 1 auto" } }, state.info) : null,
          !state.error && !state.info ? React.createElement("span", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: "11px", flex: "1 1 auto" } },
            dirtyCount > 0 ? (dirtyCount + (locale === "en-US" ? " unsaved field(s)" : " 項未儲存")) : (locale === "en-US" ? "No changes" : "無修改")) : null,
          React.createElement("button", {
            type: "button", onClick: discard,
            disabled: dirtyCount === 0 || state.saving,
            style: {
              padding: "6px 12px", borderRadius: "6px",
              border: "1px solid var(--dsw-alias-border-l1)", background: "transparent",
              color: "var(--dsw-alias-label-primary)", cursor: dirtyCount === 0 ? "not-allowed" : "pointer",
              fontSize: "11px", opacity: dirtyCount === 0 ? 0.5 : 1, fontFamily: "inherit",
            },
          }, locale === "en-US" ? "Discard" : "放棄修改"),
          React.createElement("button", {
            type: "button", onClick: save,
            disabled: dirtyCount === 0 || state.saving || !state.writable,
            "data-settings-save": "1",
            style: {
              padding: "6px 14px", borderRadius: "6px",
              border: "none",
              background: (dirtyCount === 0 || !state.writable) ? "var(--dsw-alias-bg-layer-1)" : "var(--dsw-alias-brand-primary)",
              color: (dirtyCount === 0 || !state.writable) ? "var(--dsw-alias-label-secondary)" : "var(--dsw-alias-label-on-brand, var(--dsw-alias-bg-base))",
              cursor: (dirtyCount === 0 || !state.writable || state.saving) ? "not-allowed" : "pointer",
              fontSize: "12px", fontWeight: "600", fontFamily: "inherit",
            },
          }, state.saving ? "儲存中…" : (locale === "en-US" ? "Save" : "儲存")),
        ),
      );
    }

    function BriefingBlock({ briefing, t, localeCode }) {
      const b = briefing || {};
      const empty = t("briefing.empty");
      const row = (key, body) => React.createElement("div", {
        key: key,
        style: { display: "grid", gridTemplateColumns: "84px minmax(0, 1fr)", gap: "10px", padding: "8px 0", borderBottom: "1px solid var(--dsw-alias-border-l1)", fontSize: "12px", alignItems: "start" },
      },
        React.createElement("div", { style: { fontSize: "10px", fontWeight: "700", color: "var(--dsw-alias-label-secondary)", paddingTop: "2px" } }, t(key)),
        React.createElement("div", { style: { minWidth: 0, lineHeight: 1.55, whiteSpace: "normal", overflowWrap: "anywhere" } }, body),
      );
      return React.createElement("section", {
        "data-block": "briefing",
        style: { padding: "14px", background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-primary)", borderRadius: "10px", border: "1px solid var(--dsw-alias-border-l1)" },
      },
        b.stale ? React.createElement("div", {
          style: { fontSize: "11px", marginBottom: "8px", padding: "6px 8px", borderRadius: "8px", border: "1px solid var(--dsw-alias-state-warn-primary)", color: "var(--dsw-alias-state-warn-primary)" },
        }, t("briefing.stale")) : null,
        row("briefing.what", b.purpose || empty),
        row("briefing.recent", b.recentWork
          ? React.createElement("span", null,
            b.recentWork,
            b.recentWorkAt ? React.createElement("span", {
              style: { marginLeft: "6px", fontSize: "10px", color: b.recentWorkStale ? "var(--dsw-alias-state-warn-primary)" : "var(--dsw-alias-label-secondary)", whiteSpace: "nowrap" },
            }, formatRelativeTime(b.recentWorkAt, Date.now(), localeCode) + (b.recentWorkStale ? " · " + t("briefing.recent.outdated") : "")) : null,
          )
          : t("briefing.recent.empty")),
      );
    }

    function SessionGraphBlock({ graph, t }) {
      const g = graph || { nodes: [], edges: [], collapsedEmptyCount: 0, hiddenCount: 0 };
      const [expandAll, setExpandAll] = React.useState(false);
      const [openId, setOpenId] = React.useState(null);
      const nodes = Array.isArray(g.nodes) ? g.nodes.slice().sort((a, b) => (a.occurredAt || 0) - (b.occurredAt || 0)) : [];
      const edges = Array.isArray(g.edges) ? g.edges : [];
      const visible = expandAll ? nodes : nodes.filter((n) => !n.hidden);
      const reasonLabel = (reason) => {
        const key = "graph.edge." + (reason || "todo");
        const label = t(key);
        return label === key ? reason : label;
      };
      const items = [];
      if (!visible.length) {
        items.push(React.createElement("div", { key: "empty", style: { fontSize: "12px", opacity: 0.6 } }, t("graph.empty")));
      }
      visible.forEach((node, index) => {
        if (index > 0) {
          items.push(React.createElement("div", {
            key: "time-" + node.id,
            "data-graph-kind": "time",
            style: { display: "flex", alignItems: "stretch", minHeight: "14px", paddingLeft: "11px" },
          }, React.createElement("div", { style: { width: "2px", background: "var(--dsw-alias-border-l2)", marginRight: "12px" } })));
        }
        const incoming = edges.filter((e) => e.kind === "evidence" && e.to === node.id);
        if (incoming.length) {
          items.push(React.createElement("div", {
            key: "ev-" + node.id,
            style: { display: "flex", flexWrap: "wrap", gap: "4px", padding: "0 0 6px 28px" },
          }, incoming.map((e, i) => React.createElement("span", {
            key: e.from + "-" + e.reason + "-" + i,
            "data-graph-kind": e.kind,
            title: e.from + " → " + e.to,
            style: { fontSize: "10px", fontWeight: "700", padding: "1px 7px", borderRadius: "8px", border: "1px solid var(--dsw-alias-brand-primary)", color: "var(--dsw-alias-brand-primary)" },
          }, reasonLabel(e.reason)))));
        }
        const open = openId === node.id;
        const detailText = String(node.detail || "").replace(/\s+/g, " ").trim();
        const showDetail = Boolean(detailText) && detailText !== String(node.label || "").replace(/\s+/g, " ").trim();
        const fileList = Array.isArray(node.files) ? node.files : [];
        items.push(React.createElement("button", {
          key: node.id,
          type: "button",
          "data-graph-node": node.id,
          onClick: () => setOpenId(open ? null : node.id),
          style: { display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: "8px", border: "1px solid " + (open ? "var(--dsw-alias-brand-primary)" : "var(--dsw-alias-border-l1)"), background: "var(--dsw-alias-bg-layer-1)", color: "inherit", font: "inherit", cursor: "pointer" },
        },
          React.createElement("div", { style: { display: "flex", gap: "8px", alignItems: "baseline" } },
            React.createElement("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)", fontVariantNumeric: "tabular-nums", flex: "0 0 auto" } }, node.occurredAt ? formatDate(node.occurredAt).slice(5) : ""),
            React.createElement("span", { style: { fontSize: "12px", fontWeight: "600", minWidth: 0, overflow: "hidden", textOverflow: open ? "clip" : "ellipsis", whiteSpace: open ? "normal" : "nowrap" } }, node.label || node.sessionId),
          ),
          open && (showDetail || fileList.length) ? React.createElement("div", { style: { marginTop: "8px" } },
            showDetail ? React.createElement("div", {
              "data-graph-detail": "1",
              style: {
                fontSize: "12px",
                lineHeight: 1.6,
                color: "var(--dsw-alias-label-secondary)",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                maxHeight: "220px",
                overflowY: "auto",
              },
            }, node.detail) : null,
            fileList.length ? React.createElement("div", { style: { marginTop: showDetail ? "6px" : "0", display: "flex", flexWrap: "wrap", gap: "4px" } },
              fileList.map((f) => React.createElement("span", {
                key: f,
                style: { fontFamily: "monospace", fontSize: "10px", padding: "2px 6px", borderRadius: "6px", background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l1)" },
              }, f)),
              node.filesMore ? React.createElement("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)" } }, t("graph.filesMore", { n: node.filesMore })) : null,
            ) : null,
          ) : (!open && fileList.length ? React.createElement("div", { style: { marginTop: "4px", fontSize: "10px", color: "var(--dsw-alias-label-secondary)", fontFamily: "monospace" } },
            fileList[0] + (node.filesMore ? " " + t("graph.filesMore", { n: node.filesMore }) : (fileList.length > 1 ? " +" + (fileList.length - 1) : "")),
          ) : null),
        ));
      });
      const toolbar = [];
      if (g.collapsedEmptyCount > 0) {
        toolbar.push(React.createElement("span", { key: "collapsed", style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)" } }, t("graph.collapsed", { n: g.collapsedEmptyCount })));
      }
      if (g.hiddenCount > 0) {
        toolbar.push(React.createElement("button", {
          key: "expand",
          type: "button",
          onClick: () => setExpandAll(!expandAll),
          style: { fontSize: "10px", padding: "2px 7px", borderRadius: "6px", border: "1px solid var(--dsw-alias-border-l1)", background: "transparent", color: "var(--dsw-alias-label-secondary)", cursor: "pointer", fontFamily: "inherit" },
        }, expandAll ? t("graph.collapse") : t("graph.expandAll")));
      }
      return React.createElement("section", {
        "data-block": "session-graph",
        style: { padding: "14px", background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-primary)", borderRadius: "10px", border: "1px solid var(--dsw-alias-border-l1)" },
      },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" } },
          React.createElement("h3", { style: Object.assign({}, sectionTitleStyle, { margin: 0, flex: "1 1 auto" }) }, "⎇ " + t("graph.title")),
          toolbar,
        ),
        items,
      );
    }

    function DashboardSection({ data, t, localeCode, sessionId, connection, onPreviewUpdate }) {
      const p = data.project || {};
      const todos = data.todos || [];
      const timelineAll = data.timelineAll || [];
      const memoriesAll = data.memoriesAll || [];
      const memoriesArchived = data.memoriesArchived || [];
      const retrieval = data.retrieval || {};
      const [quickActionState, setQuickActionState] = React.useState({});
      const [activeTab, setActiveTab] = React.useState("overview");
      // v1.1.x-fix：專案記憶卡片點選 → 彈框展示完整內容（避免 inline 展開撐爆頁面）
      const [memoryModal, setMemoryModal] = React.useState(null);
      const [dormantOpen, setDormantOpen] = React.useState(false);
      const [archivedOpen, setArchivedOpen] = React.useState(false);
      // 人工維護記憶：draft 非空 = 編輯態；confirmDelete = 永久刪除的二次確認
      const [memoryDraft, setMemoryDraft] = React.useState(null);
      const [memoryBusy, setMemoryBusy] = React.useState(false);
      const [memoryError, setMemoryError] = React.useState(null);
      const [confirmDelete, setConfirmDelete] = React.useState(false);
      const resetMemoryEditing = React.useCallback(() => {
        setMemoryDraft(null);
        setMemoryError(null);
        setConfirmDelete(false);
        setMemoryBusy(false);
      }, []);
      const openMemoryModal = React.useCallback((m) => { resetMemoryEditing(); setMemoryModal(m); }, [resetMemoryEditing]);
      const closeMemoryModal = React.useCallback(() => { resetMemoryEditing(); setMemoryModal(null); }, [resetMemoryEditing]);
      const rpc = connection && connection.rpc;
      // 記憶的增刪改共用一條呼叫路徑：失敗留在彈框裡顯示，成功就用 host 回傳的 preview 重新整理頁面。
      const callMemoryRpc = React.useCallback(async (endpoint, extra) => {
        if (!rpc || typeof rpc.call !== "function") {
          setMemoryError("DSH Connection RPC 不可用");
          return null;
        }
        setMemoryBusy(true);
        setMemoryError(null);
        try {
          // host 端萬一不返回（比如寫入路徑裡出現死鎖），沒有超時的話按鈕會一直轉圈，
          // 使用者既看不到結果也不知道該不該重試。
          const res = await Promise.race([
            rpc.call("/project-brain", endpoint, Object.assign({ sessionId: sessionId || undefined }, extra || {})),
            new Promise((_, reject) => setTimeout(() => reject(new Error("操作超時，請重新整理後確認是否已生效")), 15000)),
          ]);
          if (!res || !res.ok || !res.value) {
            setMemoryError((res && res.error && res.error.message) || "操作失敗");
            return null;
          }
          if (res.value.preview && typeof onPreviewUpdate === "function") {
            try { onPreviewUpdate(res.value); } catch (e) {}
          }
          return res.value;
        } catch (e) {
          setMemoryError(String((e && e.message) || e));
          return null;
        } finally {
          setMemoryBusy(false);
        }
      }, [rpc, sessionId, onPreviewUpdate]);

      const startMemoryEdit = React.useCallback((m) => {
        setConfirmDelete(false);
        setMemoryError(null);
        setMemoryDraft({
          title: m.title || "",
          content: m.content || "",
          type: m.type || "context",
          importance: typeof m.importance === "number" ? m.importance : 0.5,
          status: m.status === "dormant" ? "dormant" : "active",
          pinned: m.pinned === true,
          tags: Array.isArray(m.tags) ? m.tags.join(", ") : "",
        });
      }, []);

      const saveMemoryEdit = React.useCallback(async () => {
        if (!memoryModal || !memoryDraft) return;
        const patch = {
          title: memoryDraft.title,
          content: memoryDraft.content,
          type: memoryDraft.type,
          importance: Number(memoryDraft.importance),
          status: memoryDraft.status,
          pinned: memoryDraft.pinned === true,
          tags: String(memoryDraft.tags || "").split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        };
        const value = await callMemoryRpc("memory.update", { id: memoryModal.id, patch });
        if (!value) return;
        setMemoryDraft(null);
        setMemoryModal(value.memory || null);
      }, [memoryModal, memoryDraft, callMemoryRpc]);

      const setMemoryStatus = React.useCallback(async (status) => {
        if (!memoryModal) return;
        const value = await callMemoryRpc("memory.status", { id: memoryModal.id, status });
        if (!value) return;
        // 歸檔後這條已從當前列表移走，留著彈框會讓人以為沒生效。
        if (status === "archived") closeMemoryModal();
        else setMemoryModal(value.memory || null);
      }, [memoryModal, callMemoryRpc, closeMemoryModal]);

      const deleteMemory = React.useCallback(async () => {
        if (!memoryModal) return;
        const value = await callMemoryRpc("memory.delete", { id: memoryModal.id, confirm: true });
        if (!value) return;
        closeMemoryModal();
      }, [memoryModal, callMemoryRpc, closeMemoryModal]);

      // 架構兜底條專用重試：獨立 promise-based（避開 quickActionState 的 stale 閉包）
      const runArchRescan = React.useCallback(async () => {
        if (!sessionId || !rpc || typeof rpc.call !== "function") throw new Error(t("arch.retryFailed"));
        const res = await rpc.call("/project-brain", "action", { sessionId, action: "rescan" });
        if (!res || !res.ok || !res.value) throw new Error((res && res.error && res.error.message) || t("arch.retryFailed"));
        if (res.value && res.value.preview && typeof onPreviewUpdate === "function") {
          try { onPreviewUpdate(res.value); } catch (e) {}
        }
        const stats = res.value && res.value.result && res.value.result.data && res.value.result.data.stats;
        return { message: stats ? t("arch.retryDone") + " · " + (stats.files || 0) + " 檔案" : t("arch.retryDone") };
      }, [sessionId, rpc, onPreviewUpdate, t]);
      // v0.4.x: Git Tab 資料（null=探測中，{available:false}=非 git 倉庫不顯示 tab，{available:true,...}=有 git）
      const [gitInfo, setGitInfo] = React.useState(null);
      // v0.4.x: Git Tab 自動重新整理開關（預設開；localStorage 記憶；切到 git tab 時啟動 30 秒輪詢）
      const [gitAutoRefresh, setGitAutoRefresh] = React.useState(() => {
        try { return localStorage.getItem("dsh-brain-git-auto-refresh") !== "0"; } catch (e) { return true; }
      });
      const refreshGit = React.useCallback(async () => {
        if (!rpc || typeof rpc.call !== "function") return;
        try {
          const res = await rpc.call("/project-brain", "git", { sessionId: sessionId, workspacePath: data._workspacePath || null, limit: 50 });
          if (res && res.ok && res.value) setGitInfo(res.value);
          else setGitInfo({ available: false, error: (res && res.error && res.error.message) || "no git info" });
        } catch (e) {
          setGitInfo({ available: false, error: String((e && e.message) || e) });
        }
      }, [rpc, sessionId, data._workspacePath]);
      React.useEffect(() => {
        let cancelled = false;
        if (!rpc || typeof rpc.call !== "function") return undefined;
        (async () => {
          try {
            const res = await rpc.call("/project-brain", "git", { sessionId: sessionId, workspacePath: data._workspacePath || null, limit: 50 });
            if (cancelled) return;
            if (res && res.ok && res.value) setGitInfo(res.value);
            else setGitInfo({ available: false, error: (res && res.error && res.error.message) || "no git info" });
          } catch (e) {
            if (!cancelled) setGitInfo({ available: false, error: String((e && e.message) || e) });
          }
        })();
        return () => { cancelled = true; };
      }, [rpc, sessionId, data._workspacePath]);
      // v0.4.x: Git Tab 自動輪詢（僅 git tab 啟用 + 開關開時啟動；30 秒間隔）
      React.useEffect(() => {
        if (activeTab !== "git" || !gitAutoRefresh) return undefined;
        const t = setInterval(refreshGit, 30000);
        return () => clearInterval(t);
      }, [activeTab, gitAutoRefresh, refreshGit]);

      function resultMessage(action, value) {
        const result = value && value.result;
        const detail = result && result.data ? result.data : {};
        if (action === "rescan") {
          const stats = detail.stats || {};
          return "掃描完成 · " + (stats.files || 0) + " 個檔案";
        }
        if (action === "todos") {
          return "活躍 " + (detail.active || 0) + " 項 · 已完成 " + (detail.done || 0) + " 項";
        }
        if (action === "overview") {
          return detail.suggestedNextStep ? "下一步：" + detail.suggestedNextStep : "專案全景已重新整理";
        }
        if (action === "dreamCommit") {
          const committed = detail.committed || {};
          return "整理完成 · " + (committed.beforeCount || 0) + " → " + (committed.afterCount || 0) + " 條記憶";
        }
        return "執行完成";
      }

      async function runQuickAction(qa) {
        const previous = quickActionState[qa.id] || {};
        const action = qa.action === "dream" && previous.status === "confirm" ? "dreamCommit" : qa.action;
        if (Object.values(quickActionState).some((state) => state && state.status === "loading")) return;
        setQuickActionState((states) => Object.assign({}, states, {
          [qa.id]: { status: "loading", message: action === "dreamCommit" ? "正在提交整理…" : "正在執行…" },
        }));
        if (!sessionId || !rpc || typeof rpc.call !== "function") {
          setQuickActionState((states) => Object.assign({}, states, {
            [qa.id]: { status: "error", message: !sessionId ? "未找到當前 Session" : "DSH Runtime RPC 不可用" },
          }));
          return;
        }

        let response;
        try {
          response = await rpc.call("/project-brain", "action", { sessionId, action });
        } catch (error) {
          setQuickActionState((states) => Object.assign({}, states, {
            [qa.id]: { status: "error", message: String((error && error.message) || error) },
          }));
          return;
        }
        if (!response || !response.ok || !response.value) {
          setQuickActionState((states) => Object.assign({}, states, {
            [qa.id]: {
              status: "error",
              message: (response && response.error && response.error.message) || "操作執行失敗",
            },
          }));
          return;
        }

        const value = response.value;
        if (action === "dream") {
          const detail = value.result && value.result.data ? value.result.data : {};
          const summary = detail.summary || {};
          const candidates = (summary.mergeCandidates || 0) + (summary.archiveCandidates || 0);
          if (candidates > 0) {
            setQuickActionState((states) => Object.assign({}, states, {
              [qa.id]: { status: "confirm", message: "發現 " + candidates + " 項候選，點選確認整理" },
            }));
            return;
          }
          setQuickActionState((states) => Object.assign({}, states, {
            [qa.id]: { status: "success", message: "檢查完成 · 無需整理" },
          }));
          return;
        }

        if (value.preview && typeof onPreviewUpdate === "function") {
          try { onPreviewUpdate(value); } catch (error) {}
        }
        setQuickActionState((states) => Object.assign({}, states, {
          [qa.id]: { status: "success", message: resultMessage(action, value) },
        }));
      }
      // 技術棧三層：執行時主視野 → 交付（CI/IaC/觀測）→ 工程工具；結構作小角標
      const STACK_ICON = {
        "framework-frontend": "🎨",
        "framework-backend": "⚙️",
        "framework-fullstack": "🧩",
        "webserver": "🌐",
        "database": "💾",
        "cache": "⚡",
        "queue": "📬",
        "search": "🔍",
        "container": "🐳",
        "mobile": "📱",
        "desktop": "🖥️",
        "iac": "🏗️",
        "ci": "🔁",
        "observability": "📊",
        "auth": "🔐",
        "api": "🔌",
        "payment": "💳",
        "ai": "🤖",
        "orm": "🗄️",
      };
      const stackLayers = previewStackLayers({
        stack: p.stack || {},
        techStack: p.techStack || {},
        structure: p.structure || [],
      });
      const stackChips = [];
      for (const field of RUNTIME_STACK_FIELDS) {
        const items = stackLayers.runtime[field] || [];
        for (const item of items) {
          stackChips.push(React.createElement("span", {
            key: "stack-" + field + "-" + item,
            title: field,
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 10px",
              background: "var(--dsw-alias-bg-layer-2)",
              borderRadius: "10px",
              fontSize: "11px",
              fontWeight: "500",
              marginRight: "4px",
              marginBottom: "4px",
              border: "1px solid var(--dsw-alias-border-l1)",
            },
          },
            React.createElement("span", {
              style: {
                fontSize: "10px",
                lineHeight: 1,
                opacity: 0.85,
              },
            }, STACK_ICON[field] || "•"),
            React.createElement("span", {
              style: { fontWeight: "600", color: "var(--dsw-alias-label-primary)" },
            }, String(item)),
          ));
        }
      }
      const devopsChips = [];
      for (const field of DEVOPS_STACK_FIELDS) {
        const items = stackLayers.devops[field] || [];
        for (const item of items) {
          devopsChips.push(React.createElement("span", {
            key: "devops-" + field + "-" + item,
            title: t("dash.devops") + " · " + field,
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              background: "transparent",
              borderRadius: "8px",
              fontSize: "10px",
              fontWeight: "500",
              marginRight: "4px",
              marginBottom: "4px",
              color: "var(--dsw-alias-label-secondary)",
              border: "1px solid var(--dsw-alias-border-l1)",
            },
          },
            React.createElement("span", {
              style: { fontSize: "10px", lineHeight: 1, opacity: 0.85 },
            }, STACK_ICON[field] || "•"),
            React.createElement("span", null, String(item)),
          ));
        }
      }
      const structureChips = (stackLayers.structure || []).map((s) =>
        React.createElement("span", {
          key: "struct-" + s,
          title: "程式碼結構",
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: "3px",
            padding: "2px 8px",
            borderRadius: "8px",
            fontSize: "10px",
            fontWeight: "500",
            marginRight: "4px",
            marginBottom: "4px",
            background: "transparent",
            color: "var(--dsw-alias-label-secondary)",
            border: "1px dashed var(--dsw-alias-border-l1)",
          },
        }, "📦", String(s)),
      );
      const extraChips = (stackLayers.extra || []).map((item) =>
        React.createElement("span", {
          key: "extra-" + item,
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "3px 10px",
            borderRadius: "10px",
            fontSize: "11px",
            fontWeight: "500",
            marginRight: "4px",
            marginBottom: "4px",
            background: "transparent",
            color: "var(--dsw-alias-label-secondary)",
            border: "1px solid var(--dsw-alias-border-l1)",
            borderStyle: "dashed",
          },
        }, "+", String(item)),
      );
      const techChips = stackChips;
      // 工程工具（構建/Lint/測試/型別/包管理）—— 摺疊到小字一行
      const toolingChips = (p.tooling || []).map((tool) =>
        React.createElement("span", { key: "tool-" + tool, style: { display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 7px", background: "transparent", borderRadius: "8px", fontSize: "10px", fontWeight: "500", marginRight: "3px", marginBottom: "4px", color: "var(--dsw-alias-label-secondary)", border: "1px solid var(--dsw-alias-border-l1)" } },
          React.createElement("span", null, "🛠"),
          React.createElement("span", null, String(tool)),
        ),
      );
      const langUsage = formatLanguagesUsage(p.languages);
      const langChips = [];
      for (const item of langUsage.top) {
        const pctLabel = langUsage.total > 0 ? Math.round(item.percent) + "%" : "";
        langChips.push(React.createElement("span", {
          key: "lang-" + item.lang,
          title: item.lang + " · " + item.count + " 個檔案",
          style: { display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", background: "var(--dsw-alias-bg-layer-2)", borderRadius: "10px", fontSize: "11px", fontWeight: "500", marginRight: "4px", marginBottom: "4px", border: "1px solid var(--dsw-alias-border-l1)" },
        },
          React.createElement("span", { style: { width: "8px", height: "8px", borderRadius: "50%", background: "var(--dsw-alias-state-warn-primary)" } }),
          React.createElement("span", null, item.lang),
          React.createElement("span", { style: { color: "var(--dsw-alias-label-secondary)" } }, pctLabel ? " · " + pctLabel : ""),
        ));
      }
      if (langUsage.tail) {
        langChips.push(React.createElement("span", {
          key: "lang-tail",
          title: langUsage.tail.languages + " 種語言共 " + langUsage.tail.count + " 個檔案",
          style: { display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", background: "var(--dsw-alias-bg-layer-2)", borderRadius: "10px", fontSize: "11px", fontWeight: "500", marginRight: "4px", marginBottom: "4px", border: "1px solid var(--dsw-alias-border-l1)", color: "var(--dsw-alias-label-secondary)" },
        },
          React.createElement("span", null, "其它 " + langUsage.tail.languages + " 種"),
          React.createElement("span", null, " · " + Math.round(langUsage.tail.percent) + "%"),
        ));
      }
      const entryItems = (p.entrypoints || []).map((e, i) =>
        React.createElement("div", { key: i, style: { display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", background: "var(--dsw-alias-bg-layer-2)", borderRadius: "8px", fontSize: "12px", marginRight: "4px", marginBottom: "4px" } },
          React.createElement("span", { style: { fontSize: "13px" } }, e.type === "main" ? "🎯" : e.type === "cli" ? "💻" : e.type === "lib" ? "📚" : "📄"),
          React.createElement("span", { style: { fontFamily: "monospace" } }, e.path),
        ),
      );
      const typeLabel = (type) => t("mem.type." + type) !== "mem.type." + type ? t("mem.type." + type) : type;
      const typeChipStyle = { flex: "0 0 auto", fontSize: "10px", padding: "1px 7px", borderRadius: "8px", background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-primary)", fontWeight: "600", border: "1px solid var(--dsw-alias-border-l1)" };
      // 記憶編輯表單：與 host 端 MEMORY_TYPES 保持一致
      const MEMORY_TYPE_OPTIONS = ["decision", "requirement", "architecture", "bug", "lesson", "preference", "context", "issue", "change"];
      const memoryInputStyle = {
        width: "100%",
        boxSizing: "border-box",
        padding: "8px 10px",
        fontSize: "12.5px",
        borderRadius: "8px",
        border: "1px solid var(--dsw-alias-border-l1)",
        background: "var(--dsw-alias-bg-layer-2)",
        color: "var(--dsw-alias-label-primary)",
        fontFamily: "inherit",
      };
      const memoryField = (label, control) => React.createElement("label", { style: { display: "flex", flexDirection: "column", gap: "5px", minWidth: 0 } },
        React.createElement("span", { style: { fontSize: "10.5px", fontWeight: "700", color: "var(--dsw-alias-label-secondary)" } }, label),
        control,
      );
      const updateDraft = (patch) => setMemoryDraft((prev) => (prev ? Object.assign({}, prev, patch) : prev));
      const isArchivedMemory = (m) => Boolean(m) && (m.status === "archived" || m.status === "superseded");
      const memoryButtonStyle = (tone) => {
        const accent = tone === "danger"
          ? "var(--dsw-alias-state-error-primary)"
          : (tone === "primary" ? "var(--dsw-alias-brand-primary)" : null);
        return {
          fontSize: "11px",
          padding: "4px 10px",
          borderRadius: "6px",
          background: accent || "transparent",
          border: "1px solid " + (accent || "var(--dsw-alias-border-l1)"),
          color: accent ? "var(--dsw-alias-bg-base)" : "var(--dsw-alias-label-primary)",
          cursor: memoryBusy ? "wait" : "pointer",
          opacity: memoryBusy ? 0.6 : 1,
          fontFamily: "inherit",
          fontWeight: "500",
        };
      };
      const dashPanelStyle = { padding: "14px", background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-primary)", borderRadius: "10px", border: "1px solid var(--dsw-alias-border-l1)", minWidth: 0 };
      const dashSection = (icon, titleKey, children) =>
        React.createElement("section", { style: dashPanelStyle },
          React.createElement("h3", { style: sectionTitleStyle }, icon + " " + t(titleKey)),
          children,
        );
      const tabDefs = [
        { id: "overview", icon: "◫", label: t("dash.tab.overview") },
        { id: "architecture", icon: "⌘", label: t("dash.tab.architecture") },
        { id: "work", icon: "✓", label: t("dash.tab.work") },
        { id: "knowledge", icon: "◇", label: t("dash.tab.knowledge") },
      ];
      // Git 倉庫才顯示 Git Tab；設定始終在這一排最後
      if (gitInfo && gitInfo.available === true) {
        tabDefs.push({ id: "git", icon: "⎇", label: t("dash.tab.git") });
      }
      tabDefs.push({ id: "settings", icon: "⚙", label: t("dash.tab.settings") });
      const emptyNode = React.createElement("span", { style: { opacity: 0.6, fontSize: "12px" } }, t("dash.none"));
      const todoNode = todos.length > 0
        ? React.createElement("ul", { style: { listStyle: "none", padding: 0, margin: 0 } },
            todos.map((x) => React.createElement("li", { key: x.id, style: { display: "flex", gap: "8px", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--dsw-alias-border-l1)", fontSize: "12px" } },
              React.createElement("span", { style: { fontSize: "10px", padding: "1px 7px", borderRadius: "8px", background: "var(--dsw-alias-bg-layer-1)", fontWeight: "600" } }, t("st." + (x.status || "pending"))),
              React.createElement("span", { style: { flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" } }, x.title),
              React.createElement("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)", fontWeight: "600" } }, t("prio." + (x.priority || "medium"))),
            )))
          : emptyNode;
      const timelineNode = timelineAll.length > 0
        ? React.createElement("ul", { style: { listStyle: "none", padding: 0, margin: 0 } },
            timelineAll.slice(0, 20).map((e) => React.createElement("li", { key: e.id, style: { display: "grid", gridTemplateColumns: "86px minmax(0, 1fr)", gap: "10px", padding: "7px 0", borderBottom: "1px solid var(--dsw-alias-border-l1)", fontSize: "12px", alignItems: "start" } },
              React.createElement("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)", fontVariantNumeric: "tabular-nums" } }, formatDate(e.occurredAt).slice(5)),
              React.createElement("span", { style: { minWidth: 0, lineHeight: 1.45 } }, e.title),
            )))
          : emptyNode;
      // v1.1.x-fix：記憶卡片支援點選展開/收起，hover 高亮，expanded 態左邊框 brand-primary 標記
      //   舊版標題用 ellipsis 截斷看不到全名，內容用 line-clamp + slice 截斷看不到完整——使用者痛點
      const formatMemTime = (ts) => {
        if (!ts) return "";
        try {
          const d = new Date(ts);
          const p = (n) => (n < 10 ? "0" + n : "" + n);
          return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
        } catch (e) { return ""; }
      };
      const importanceStars = (imp) => {
        const stars = Math.max(0, Math.min(5, Math.round((imp || 0) * 5)));
        return "★".repeat(stars) + "☆".repeat(5 - stars);
      };
      // v1.2.x：記憶詳情彈框 markdown 渲染（輕量純函式，零依賴）
      //   支援：# ## ### #### 標題、**粗體**、*斜體*、`行內程式碼`、[text](url) 連結、
      //         - 無序列表、1. 有序列表、> 引用、--- 分割線、```fenced``` 程式碼塊、段落
      //   設計要點：
      //   1) 全部輸出走 React.createElement，不用 dangerouslySetInnerHTML → 天然 XSS 免疫
      //   2) inline 解析用單一正則按 token 切分，避免手寫狀態機出錯
      //   3) block 解析按行掃描，相同字首連續行合併成同一 block（list/quote）
      //   4) 不引第三方庫：DSH 客戶端 esbuild bundle 產物 < 5KB，CSS 複用現有主題變數
      //   5) v1.2.x-patch 美化：黃金比例 type scale、剋制留白、自定義 list marker、暗色 code block
      const mdEscape = (s) => String(s == null ? "" : s);
      // ── 共享樣式 ──
      const mdBaseFont = "13.5px";
      const mdInlineStyle = {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "0.88em",
        background: "var(--dsw-alias-bg-layer-2)",
        color: "var(--dsw-alias-label-primary)",
        padding: "1px 6px",
        borderRadius: "4px",
        margin: "0 2px",
        wordBreak: "break-word",
      };
      const mdLinkStyle = {
        color: "var(--dsw-alias-brand-primary)",
        textDecoration: "none",
        borderBottom: "1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 40%, transparent)",
        wordBreak: "break-word",
        transition: "border-color 0.15s ease",
      };
      const mdStrongStyle = { fontWeight: "700", color: "var(--dsw-alias-label-primary)" };
      const mdEmStyle = { fontStyle: "italic", color: "var(--dsw-alias-label-primary)" };
      const mdRenderInline = (text, React, keyPrefix) => {
        // 單一正則：**|*|`|[text](url) 四類 inline 標籤；其他原樣作為 text token
        const re = /(\*\*([^*\n][^*]*?)\*\*)|(\*([^*\n][^*]*?)\*)|(`([^`\n]+)`)|(\[([^\]\n]+)\]\(([^)\s]+)\))/g;
        const nodes = [];
        let lastIndex = 0;
        let m;
        let i = 0;
        while ((m = re.exec(text)) !== null) {
          if (m.index > lastIndex) nodes.push(React.createElement(React.Fragment, { key: keyPrefix + "-" + (i++) }, text.slice(lastIndex, m.index)));
          if (m[1] !== undefined) {
            nodes.push(React.createElement("strong", { key: keyPrefix + "-" + (i++), style: mdStrongStyle }, m[2]));
          } else if (m[3] !== undefined) {
            nodes.push(React.createElement("em", { key: keyPrefix + "-" + (i++), style: mdEmStyle }, m[4]));
          } else if (m[5] !== undefined) {
            nodes.push(React.createElement("code", { key: keyPrefix + "-" + (i++), style: mdInlineStyle }, m[6]));
          } else if (m[7] !== undefined) {
            nodes.push(React.createElement("a", {
              key: keyPrefix + "-" + (i++),
              href: m[9],
              target: "_blank",
              rel: "noopener noreferrer",
              style: mdLinkStyle,
            }, m[8]));
          }
          lastIndex = re.lastIndex;
        }
        if (lastIndex < text.length) nodes.push(React.createElement(React.Fragment, { key: keyPrefix + "-" + (i++) }, text.slice(lastIndex)));
        if (nodes.length === 0) nodes.push(React.createElement(React.Fragment, { key: keyPrefix + "-0" }, text));
        return nodes;
      };
      const mdRenderBlock = (block, React, keyPrefix) => {
        const k = keyPrefix;
        if (block.kind === "code") {
          return React.createElement("pre", {
            key: k,
            style: {
              background: "var(--dsw-alias-bg-base)",
              borderLeft: "3px solid var(--dsw-alias-brand-primary)",
              borderRadius: "0 6px 6px 0",
              padding: "10px 14px",
              overflowX: "auto",
              margin: "14px 0",
              fontSize: "12px",
              lineHeight: 1.6,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
            },
          }, React.createElement("code", {
            style: {
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              color: "var(--dsw-alias-label-primary)",
              whiteSpace: "pre",
              fontSize: "12px",
            },
          }, block.text));
        }
        if (block.kind === "heading") {
          // 黃金比例 type scale: h1=20 / h2=17 / h3=15 / h4=13.5（正文）
          // h1/h2 加下邊線 brand-primary 漸隱做章節感；h3/h4 純字號 + 字重
          const isMajor = block.level <= 2;
          const sizeMap = { 1: "20px", 2: "17px", 3: "15px", 4: "14px" };
          const marginMap = {
            1: { t: "20px", b: "12px" },
            2: { t: "18px", b: "10px" },
            3: { t: "14px", b: "8px" },
            4: { t: "12px", b: "6px" },
          };
          const m = marginMap[block.level] || { t: "12px", b: "6px" };
          return React.createElement("div", {
            key: k,
            style: {
              fontSize: sizeMap[block.level] || "14px",
              fontWeight: "700",
              lineHeight: 1.35,
              letterSpacing: block.level === 1 ? "-0.2px" : "0",
              margin: (block.level === 1 ? "0 0 " + m.b : m.t + " 0 " + m.b),
              color: "var(--dsw-alias-label-primary)",
              paddingBottom: isMajor ? "6px" : "0",
              borderBottom: isMajor ? "1px solid var(--dsw-alias-border-l1)" : "none",
            },
          }, mdRenderInline(block.text, React, k + "-h"));
        }
        if (block.kind === "hr") {
          // 漸隱分割線：用 linear-gradient 讓兩端融於背景（inline style 支援）
          return React.createElement("div", {
            key: k,
            role: "separator",
            "aria-orientation": "horizontal",
            style: {
              height: "1px",
              background: "linear-gradient(90deg, transparent 0%, var(--dsw-alias-border-l1) 50%, transparent 100%)",
              margin: "18px 0",
            },
          });
        }
        if (block.kind === "ul" || block.kind === "ol") {
          const isOrdered = block.kind === "ol";
          const Tag = isOrdered ? "ol" : "ul";
          // 自定義 marker：flex 佈局，左列固定寬度放 marker，右列放內容
          const listStyle = {
            listStyle: "none",
            padding: "0",
            margin: "10px 0 12px",
            counterReset: isOrdered ? ("md-ol-" + k) : undefined,
          };
          const startIdx = block.start || 1;
          return React.createElement(Tag, {
            key: k,
            start: isOrdered ? startIdx : undefined,
            style: listStyle,
          }, block.items.map((item, idx) => {
            const markerStyle = {
              flex: "0 0 auto",
              width: "22px",
              fontSize: "12px",
              lineHeight: "1.7",
              color: "var(--dsw-alias-brand-primary)",
              fontWeight: "600",
              textAlign: "right",
              paddingRight: "10px",
              boxSizing: "border-box",
              userSelect: "none",
              fontVariantNumeric: "tabular-nums",
            };
            let markerNode;
            if (isOrdered) {
              markerNode = React.createElement("span", { style: markerStyle }, String(startIdx + idx) + ".");
            } else {
              markerNode = React.createElement("span", {
                style: {
                  flex: "0 0 auto",
                  width: "22px",
                  height: "1.7em",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  paddingRight: "10px",
                  boxSizing: "border-box",
                },
              }, React.createElement("span", {
                style: {
                  width: "5px",
                  height: "5px",
                  borderRadius: "50%",
                  background: "var(--dsw-alias-brand-primary)",
                  display: "inline-block",
                },
              }));
            }
            return React.createElement("li", {
              key: k + "-li-" + idx,
              style: {
                display: "flex",
                alignItems: "flex-start",
                margin: "0 0 6px",
                fontSize: mdBaseFont,
                lineHeight: 1.75,
                color: "var(--dsw-alias-label-primary)",
              },
            }, markerNode, React.createElement("span", {
              style: { flex: "1 1 auto", minWidth: 0, wordBreak: "break-word" },
            }, mdRenderInline(item, React, k + "-li-" + idx)));
          }));
        }
        if (block.kind === "quote") {
          return React.createElement("blockquote", {
            key: k,
            style: {
              margin: "14px 0",
              padding: "8px 14px",
              background: "var(--dsw-alias-bg-layer-2)",
              borderLeft: "3px solid var(--dsw-alias-brand-primary)",
              borderRadius: "0 6px 6px 0",
              color: "var(--dsw-alias-label-secondary)",
              fontSize: "13px",
              lineHeight: 1.7,
              fontStyle: "italic",
            },
          }, block.lines.map((ln, idx) => React.createElement("div", {
            key: k + "-q-" + idx,
            style: { marginBottom: idx === block.lines.length - 1 ? 0 : "4px" },
          }, mdRenderInline(ln, React, k + "-q-" + idx))));
        }
        // paragraph（預設）
        return React.createElement("div", {
          key: k,
          style: {
            margin: "10px 0",
            fontSize: mdBaseFont,
            lineHeight: 1.75,
            color: "var(--dsw-alias-label-primary)",
            wordBreak: "break-word",
            letterSpacing: "0.01em",
          },
        }, mdRenderInline(block.text, React, k + "-p"));
      };
      const mdParse = (src) => {
        // 塊級解析：按行掃描，識別 fenced code / heading / hr / list / quote / paragraph
        const lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
        const blocks = [];
        let i = 0;
        while (i < lines.length) {
          const line = lines[i];
          // fenced code: ``` 或 ~~~ 開頭
          const fence = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
          if (fence) {
            const fenceCh = fence[2][0];
            const fenceLen = fence[2].length;
            const codeLines = [];
            i++;
            while (i < lines.length) {
              const close = lines[i].match(new RegExp("^\\s*`{3,}|~{3,}\\s*$"));
              if (close && close[0].trim()[0] === fenceCh && close[0].trim().length >= fenceLen) {
                i++;
                break;
              }
              codeLines.push(lines[i]);
              i++;
            }
            blocks.push({ kind: "code", text: codeLines.join("\n") });
            continue;
          }
          // 空行：跳過（段落分隔）
          if (line.trim() === "") { i++; continue; }
          // hr: --- *** ___ 3+ 連續
          if (/^(\s*)(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
            blocks.push({ kind: "hr" });
            i++;
            continue;
          }
          // heading: # ~ ######
          const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
          if (h) {
            blocks.push({ kind: "heading", level: h[1].length, text: h[2] });
            i++;
            continue;
          }
          // blockquote: > 開頭連續行
          if (/^\s*>\s?/.test(line)) {
            const qlines = [];
            while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
              qlines.push(lines[i].replace(/^\s*>\s?/, ""));
              i++;
            }
            blocks.push({ kind: "quote", lines: qlines });
            continue;
          }
          // unordered list: - * + 開頭連續行
          if (/^\s*[-*+]\s+/.test(line)) {
            const items = [];
            while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
              items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
              i++;
            }
            blocks.push({ kind: "ul", items: items });
            continue;
          }
          // ordered list: 數字. 開頭連續行
          const ol = line.match(/^\s*(\d+)\.\s+(.*)$/);
          if (ol) {
            const items = [];
            const start = parseInt(ol[1], 10);
            while (i < lines.length) {
              const m2 = lines[i].match(/^\s*(\d+)\.\s+(.*)$/);
              if (!m2) break;
              items.push(m2[2]);
              i++;
            }
            blocks.push({ kind: "ol", items: items, start: start });
            continue;
          }
          // paragraph: 收集到下一個空行 / block 起始為止
          const paraLines = [line];
          i++;
          while (i < lines.length) {
            const nxt = lines[i];
            if (nxt.trim() === "") break;
            if (/^(\s*)(`{3,}|~{3,})/.test(nxt)) break;
            if (/^(\s*)(-{3,}|\*{3,}|_{3,})\s*$/.test(nxt)) break;
            if (/^(#{1,6})\s+/.test(nxt)) break;
            if (/^\s*>\s?/.test(nxt)) break;
            if (/^\s*[-*+]\s+/.test(nxt)) break;
            if (/^\s*\d+\.\s+/.test(nxt)) break;
            paraLines.push(nxt);
            i++;
          }
          blocks.push({ kind: "paragraph", text: paraLines.join("\n") });
        }
        return blocks;
      };
      const renderMarkdown = (src, React) => {
        if (!src) return null;
        const blocks = mdParse(src);
        return blocks.map((b, idx) => mdRenderBlock(b, React, "md-" + idx));
      };
      const renderMemoryCard = (m) => {
        const contentStr = m.content ? String(m.content) : "";
        const hasLongContent = contentStr.length > 200;
        const summary = hasLongContent ? contentStr.slice(0, 200) : contentStr;
        return React.createElement("article", {
          key: m.id,
          "data-mem-id": m.id,
          "data-mem-status": m.status || "active",
          onClick: () => openMemoryModal(m),
          title: "點選檢視完整內容",
          style: {
            padding: "12px 14px",
            background: "var(--dsw-alias-bg-layer-1)",
            border: "1px solid var(--dsw-alias-border-l1)",
            borderLeft: "3px solid " + (m.status === "dormant" ? "var(--dsw-alias-label-secondary)" : "var(--dsw-alias-border-l1)"),
            borderRadius: "8px",
            cursor: "pointer",
            transition: "border-color 0.15s ease, transform 0.1s ease",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            minWidth: 0,
            minHeight: "120px",
            opacity: m.status === "dormant" ? 0.82 : 1,
          },
          onMouseEnter: (e) => {
            e.currentTarget.style.borderLeftColor = "var(--dsw-alias-brand-primary)";
            e.currentTarget.style.borderColor = "var(--dsw-alias-brand-primary)";
          },
          onMouseLeave: (e) => {
            e.currentTarget.style.borderLeftColor = m.status === "dormant" ? "var(--dsw-alias-label-secondary)" : "var(--dsw-alias-border-l1)";
            e.currentTarget.style.borderColor = "var(--dsw-alias-border-l1)";
          },
        },
          React.createElement("div", { style: { display: "flex", gap: "8px", alignItems: "flex-start", flexWrap: "wrap" } },
            React.createElement("span", { style: Object.assign({}, typeChipStyle, { marginTop: "1px" }) }, typeLabel(m.type)),
            m.pinned === true ? React.createElement("span", { title: "已置頂：Core 滿員時不會被擠掉", style: { fontSize: "10px", padding: "1px 7px", borderRadius: "8px", background: "var(--dsw-alias-brand-primary)", color: "var(--dsw-alias-bg-base)", fontWeight: "600" } }, "置頂") : null,
            m.status && m.status !== "active" ? React.createElement("span", { style: { fontSize: "10px", padding: "1px 7px", borderRadius: "8px", background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-secondary)", fontWeight: "600" } }, m.status) : null,
            React.createElement("span", { style: { fontSize: "13px", fontWeight: "600", flex: "1 1 200px", minWidth: 0, wordBreak: "break-word", lineHeight: 1.4, color: "var(--dsw-alias-label-primary)" } }, m.title),
          ),
          contentStr ? React.createElement("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", flex: "1 1 auto" } }, summary + (hasLongContent ? "…" : "")) : null,
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "10px", color: "var(--dsw-alias-label-secondary)", marginTop: "auto", paddingTop: "4px", borderTop: "1px dashed var(--dsw-alias-border-l1)" } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" } },
              m.importance ? React.createElement("span", { title: "importance " + m.importance, style: { color: "var(--dsw-alias-brand-primary)", letterSpacing: "1px", fontWeight: "600" } }, importanceStars(m.importance)) : null,
              m.createdAt ? React.createElement("span", { style: { fontVariantNumeric: "tabular-nums" } }, formatMemTime(m.createdAt)) : null,
              Array.isArray(m.tags) && m.tags.length > 0 ? React.createElement("span", { style: { maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: m.tags.map((tag) => "#" + tag).join(" ") }, m.tags.slice(0, 3).map((tag) => "#" + tag).join(" ")) : null,
            ),
            contentStr ? React.createElement("span", { style: { fontSize: "10px", padding: "2px 9px", borderRadius: "10px", background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-primary)", fontWeight: "600", border: "1px solid var(--dsw-alias-border-l1)", flex: "0 0 auto" } }, "▸ 檢視詳情") : null,
          ),
        );
      };
      const coreMemList = memoriesAll.filter((m) => m && m.status !== "dormant");
      const dormantMemList = memoriesAll.filter((m) => m && m.status === "dormant");
      const memoryGrid = (items) => React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "8px" } }, items.slice(0, 20).map(renderMemoryCard));
      // 歸檔區：預設收起。點進卡片就能「恢復」或「永久刪除」，誤清理有地方找回來。
      const archivedSection = memoriesArchived.length > 0
        ? React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
            React.createElement("button", {
              type: "button",
              "data-action": "toggle-archived-memories",
              onClick: () => setArchivedOpen((open) => !open),
              style: {
                alignSelf: "flex-start",
                background: "transparent",
                border: "1px solid var(--dsw-alias-border-l1)",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: "600",
                color: "var(--dsw-alias-label-secondary)",
                padding: "4px 10px",
                fontFamily: "inherit",
              },
            }, (archivedOpen ? t("dash.memory.archivedHide") : t("dash.memory.archivedShow")) + " · " + memoriesArchived.length),
            archivedOpen ? React.createElement("div", null,
              React.createElement("div", { style: { fontSize: "11px", fontWeight: "700", color: "var(--dsw-alias-label-secondary)", marginBottom: "8px" } }, t("dash.memory.archived")),
              memoryGrid(memoriesArchived),
            ) : null,
          )
        : null;
      const memoryNode = memoriesAll.length > 0
        ? React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
            React.createElement("div", { style: { fontSize: "11px", fontWeight: "700", color: "var(--dsw-alias-label-secondary)" } }, t("dash.memory.core") + " · " + coreMemList.length),
            coreMemList.length ? memoryGrid(coreMemList) : emptyNode,
            dormantMemList.length ? React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
              React.createElement("button", {
                type: "button",
                "data-action": "toggle-dormant-memories",
                onClick: () => setDormantOpen((open) => !open),
                style: {
                  alignSelf: "flex-start",
                  background: "transparent",
                  border: "1px solid var(--dsw-alias-border-l1)",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "var(--dsw-alias-label-secondary)",
                  padding: "4px 10px",
                  fontFamily: "inherit",
                },
              }, (dormantOpen ? t("dash.memory.dormantHide") : t("dash.memory.dormantShow")) + " · " + dormantMemList.length),
              dormantOpen ? React.createElement("div", null,
                React.createElement("div", { style: { fontSize: "11px", fontWeight: "700", color: "var(--dsw-alias-label-secondary)", marginBottom: "8px" } }, t("dash.memory.dormant")),
                memoryGrid(dormantMemList),
              ) : null,
            ) : null,
            archivedSection,
          )
        : (memoriesArchived.length > 0
            ? React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } }, emptyNode, archivedSection)
            : emptyNode);

      // v1.1.x-fix：專案記憶詳情彈框（避免 inline 展開撐爆網格）
      const memoryModalNode = memoryModal ? React.createElement(
        "div",
        {
          "data-block": "memory-modal-overlay",
          onClick: (e) => { if (e.target === e.currentTarget) closeMemoryModal(); },
          style: {
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          },
        },
        React.createElement(
          "div",
          {
            "data-block": "memory-modal",
            role: "dialog",
            "aria-modal": "true",
            style: {
              background: "var(--dsw-alias-bg-layer-1)",
              color: "var(--dsw-alias-label-primary)",
              borderRadius: "12px",
              border: "1px solid var(--dsw-alias-border-l1)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              width: "min(720px, 100%)",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            },
            onClick: (e) => e.stopPropagation(),
          },
          // 頭部：type chip + title + close
          React.createElement("div", { style: { padding: "14px 18px", borderBottom: "1px solid var(--dsw-alias-border-l1)", display: "flex", alignItems: "flex-start", gap: "10px", background: "linear-gradient(90deg, var(--dsw-alias-bg-layer-1), var(--dsw-alias-bg-layer-2))" } },
            React.createElement("span", { style: typeChipStyle }, typeLabel(memoryModal.type)),
            memoryModal.pinned === true ? React.createElement("span", { title: "已置頂", style: { flex: "0 0 auto", fontSize: "10px", padding: "1px 7px", borderRadius: "8px", background: "var(--dsw-alias-brand-primary)", color: "var(--dsw-alias-bg-base)", fontWeight: "600" } }, "置頂") : null,
            React.createElement("span", { style: { fontSize: "15px", fontWeight: "600", flex: "1 1 auto", minWidth: 0, wordBreak: "break-word", lineHeight: 1.45 } }, memoryModal.title || "(無標題)"),
            React.createElement("button", {
              type: "button",
              "data-action": "memory-modal-close",
              onClick: closeMemoryModal,
              title: "關閉",
              style: {
                background: "transparent",
                border: "1px solid var(--dsw-alias-border-l1)",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "16px",
                lineHeight: 1,
                width: "28px",
                height: "28px",
                flex: "0 0 auto",
                color: "var(--dsw-alias-label-secondary)",
                fontFamily: "inherit",
              },
            }, "×"),
          ),
          // 主體：只讀時渲染 markdown，編輯態換成表單（v1.2.x 起正文走 markdown：標題/列表/程式碼塊/連結等）
          React.createElement("div", {
            "data-block": "memory-modal-body",
            style: { padding: "20px 24px 24px", overflowY: "auto", flex: "1 1 auto", color: "var(--dsw-alias-label-primary)" },
          }, memoryDraft
            ? React.createElement("div", { "data-block": "memory-edit-form", style: { display: "flex", flexDirection: "column", gap: "14px" } },
                memoryField("標題", React.createElement("input", {
                  type: "text",
                  "data-field": "memory-title",
                  value: memoryDraft.title,
                  maxLength: 200,
                  onChange: (e) => updateDraft({ title: e.target.value }),
                  style: memoryInputStyle,
                })),
                memoryField("正文（至少 12 個字元）", React.createElement("textarea", {
                  "data-field": "memory-content",
                  value: memoryDraft.content,
                  rows: 10,
                  maxLength: 4000,
                  onChange: (e) => updateDraft({ content: e.target.value }),
                  style: Object.assign({}, memoryInputStyle, { resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }),
                })),
                React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" } },
                  memoryField("型別", React.createElement("select", {
                    "data-field": "memory-type",
                    value: memoryDraft.type,
                    onChange: (e) => updateDraft({ type: e.target.value }),
                    style: memoryInputStyle,
                  }, MEMORY_TYPE_OPTIONS.map((v) => React.createElement("option", { key: v, value: v }, typeLabel(v))))),
                  memoryField("重要性 " + Number(memoryDraft.importance).toFixed(2), React.createElement("input", {
                    type: "range",
                    "data-field": "memory-importance",
                    min: 0, max: 1, step: 0.05,
                    value: memoryDraft.importance,
                    onChange: (e) => updateDraft({ importance: Number(e.target.value) }),
                    style: { width: "100%", accentColor: "var(--dsw-alias-brand-primary)" },
                  })),
                  memoryField("狀態", React.createElement("select", {
                    "data-field": "memory-status",
                    value: memoryDraft.status,
                    onChange: (e) => updateDraft({ status: e.target.value }),
                    style: memoryInputStyle,
                  },
                    React.createElement("option", { value: "active" }, "Core（每輪注入）"),
                    React.createElement("option", { value: "dormant" }, "休眠（不注入）"),
                  )),
                  memoryField("置頂", React.createElement("label", {
                    style: { display: "flex", alignItems: "center", gap: "7px", fontSize: "12px", padding: "8px 0", cursor: "pointer", color: "var(--dsw-alias-label-secondary)" },
                  },
                    React.createElement("input", {
                      type: "checkbox",
                      "data-field": "memory-pinned",
                      checked: memoryDraft.pinned === true,
                      onChange: (e) => updateDraft({ pinned: e.target.checked }),
                      style: { accentColor: "var(--dsw-alias-brand-primary)", margin: 0 },
                    }),
                    React.createElement("span", null, "Core 滿員時不被擠掉"),
                  )),
                ),
                memoryField("標籤（逗號分隔）", React.createElement("input", {
                  type: "text",
                  "data-field": "memory-tags",
                  value: memoryDraft.tags,
                  onChange: (e) => updateDraft({ tags: e.target.value }),
                  style: memoryInputStyle,
                })),
              )
            : (memoryModal.content
                ? renderMarkdown(String(memoryModal.content), React)
                : React.createElement("div", { style: { fontSize: "13.5px", color: "var(--dsw-alias-label-secondary)" } }, "（無內容）"))),
          memoryError ? React.createElement("div", {
            "data-block": "memory-modal-error",
            style: { padding: "8px 18px", fontSize: "11.5px", color: "var(--dsw-alias-state-error-primary)", background: "var(--dsw-alias-bg-layer-2)", borderTop: "1px solid var(--dsw-alias-border-l1)" },
          }, "⚠ " + memoryError) : null,
          // 底部：importance + 時間 + tags + 複製
          React.createElement("div", { style: { padding: "10px 18px", borderTop: "1px solid var(--dsw-alias-border-l1)", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", fontSize: "11px", color: "var(--dsw-alias-label-secondary)", background: "var(--dsw-alias-bg-layer-2)" } },
            memoryModal.importance ? React.createElement("span", { title: "importance " + memoryModal.importance, style: { color: "var(--dsw-alias-brand-primary)", letterSpacing: "1px", fontWeight: "600" } }, importanceStars(memoryModal.importance)) : null,
            memoryModal.createdAt ? React.createElement("span", { style: { fontVariantNumeric: "tabular-nums" } }, formatMemTime(memoryModal.createdAt)) : null,
            Array.isArray(memoryModal.tags) && memoryModal.tags.length > 0 ? React.createElement("span", null, memoryModal.tags.map((tag) => "#" + tag).join(" ")) : null,
            React.createElement("span", { style: { flex: "1 1 auto" } }),
            memoryDraft
              ? React.createElement(React.Fragment, null,
                  React.createElement("button", {
                    type: "button",
                    "data-action": "memory-edit-cancel",
                    disabled: memoryBusy,
                    onClick: () => { setMemoryDraft(null); setMemoryError(null); },
                    style: memoryButtonStyle(),
                  }, "取消"),
                  React.createElement("button", {
                    type: "button",
                    "data-action": "memory-edit-save",
                    disabled: memoryBusy,
                    onClick: saveMemoryEdit,
                    style: memoryButtonStyle("primary"),
                  }, memoryBusy ? "儲存中…" : "✓ 儲存"),
                )
              : (confirmDelete
                  ? React.createElement(React.Fragment, null,
                      React.createElement("span", { style: { color: "var(--dsw-alias-state-error-primary)", fontWeight: "600" } }, "永久刪除後無法恢復，確定？"),
                      React.createElement("button", {
                        type: "button",
                        "data-action": "memory-delete-cancel",
                        disabled: memoryBusy,
                        onClick: () => setConfirmDelete(false),
                        style: memoryButtonStyle(),
                      }, "取消"),
                      React.createElement("button", {
                        type: "button",
                        "data-action": "memory-delete-confirm",
                        disabled: memoryBusy,
                        onClick: deleteMemory,
                        style: memoryButtonStyle("danger"),
                      }, memoryBusy ? "刪除中…" : "確認永久刪除"),
                    )
                  : React.createElement(React.Fragment, null,
                      React.createElement("button", {
                        type: "button",
                        "data-action": "memory-modal-copy",
                        onClick: (e) => {
                          // 複製原始 markdown 字串：title 一行 + 空行 + 原文（content 本身就是帶 markdown 格式的原文，未做任何轉換）
                          const text = (memoryModal.title || "") + "\n\n" + (memoryModal.content || "");
                          copyPrompt(text, e, "✓ 已複製", "複製失敗");
                        },
                        style: memoryButtonStyle(),
                      }, "📋 複製全文"),
                      React.createElement("button", {
                        type: "button",
                        "data-action": "memory-edit-start",
                        disabled: memoryBusy,
                        onClick: () => startMemoryEdit(memoryModal),
                        style: memoryButtonStyle(),
                      }, "✏️ 編輯"),
                      isArchivedMemory(memoryModal)
                        ? React.createElement("button", {
                            type: "button",
                            "data-action": "memory-restore",
                            disabled: memoryBusy,
                            onClick: () => setMemoryStatus("active"),
                            style: memoryButtonStyle(),
                          }, "↩ 恢復")
                        : React.createElement("button", {
                            type: "button",
                            "data-action": "memory-archive",
                            disabled: memoryBusy,
                            onClick: () => setMemoryStatus("archived"),
                            title: "從 Core 和檢索中移除，之後可在「已歸檔」裡恢復",
                            style: memoryButtonStyle(),
                          }, "🗂 歸檔"),
                      React.createElement("button", {
                        type: "button",
                        "data-action": "memory-delete",
                        disabled: memoryBusy,
                        onClick: () => setConfirmDelete(true),
                        title: "物理刪除，不可恢復",
                        style: memoryButtonStyle(),
                      }, "🗑 刪除"),
                    )),
          ),
        ),
      ) : null;
      return React.createElement("div", { id: "dsh-brain-dashboard", style: { display: "block", background: "var(--dsw-alias-bg-layer-1)", borderRadius: "10px", margin: "8px 12px", border: "1px solid var(--dsw-alias-border-l2)", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }, "data-block": "dashboard" },
        React.createElement("div", { style: { padding: "12px 16px", borderBottom: "1px solid var(--dsw-alias-border-l1)", display: "flex", alignItems: "center", gap: "8px", fontWeight: "700", fontSize: "15px", background: "linear-gradient(90deg, var(--dsw-alias-bg-layer-1), var(--dsw-alias-bg-layer-2))" } },
          React.createElement("span", { style: { fontSize: "18px" } }, "🎯"),
          React.createElement("span", { style: { flex: "1 1 auto" } }, t("dash.title")),
          React.createElement("span", {
            title: retrieval.vectorConfigured ? (retrieval.embeddingModel || "hybrid") : "無需配置，資料保留在專案內",
            style: { fontSize: "10px", padding: "2px 7px", borderRadius: "8px", background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-secondary)", border: "1px solid var(--dsw-alias-border-l1)" },
          }, retrieval.configuredMode === "hybrid" ? "向量已配置" : "本地檢索"),
          React.createElement("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-secondary)" } }, "點選卡片後臺執行"),
        ),
        // v0.4.15 智慧續接：Session 開始時主動給出"今天可能想推進什麼"
        React.createElement(SuggestionCard, {
          t, localeCode, sessionId, connection,
          projectInitialized: Boolean(data.initialized && data.project),
          embeddedSuggestion: data.suggestion || null,
          workspacePath: data._workspacePath || null,
        }),
        // v0.4.11: Quick Actions 2x2 網格（替代"繼續上次開發"雞肋按鈕）
        (() => {
          const isEn = localeCode === "en-US";
          const quickActions = [
            { id: "qa-rescan", action: "rescan", icon: "🔄", title: isEn ? "Rescan" : "重新掃描", desc: isEn ? "Incrementally refresh project structure" : "增量更新專案結構" },
            { id: "qa-todo", action: "todos", icon: "📋", title: isEn ? "Review todos" : "整理待辦", desc: isEn ? "View active tasks" : "檢視活躍任務" },
            { id: "qa-memory", action: "dream", icon: "🧠", title: isEn ? "Organize memories" : "整理記憶", desc: isEn ? "Deduplicate and archive stale items" : "去重 + 歸檔過期" },
            { id: "qa-summary", action: "overview", icon: "🎯", title: isEn ? "Project overview" : "專案全景", desc: isEn ? "Summarize current status" : "總覽當前狀態" },
          ];
          return React.createElement("div", { style: { padding: "12px 12px 4px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "8px" } },
            quickActions.map((qa) => {
              const state = quickActionState[qa.id] || { status: "idle", message: "" };
              const busy = state.status === "loading";
              const anyBusy = Object.values(quickActionState).some((item) => item && item.status === "loading");
              const trailing = busy
                ? React.createElement("span", { "data-spinner": "1", style: { width: "15px", height: "15px", borderRadius: "50%", border: "2px solid var(--dsw-alias-border-l2)", borderTopColor: "var(--dsw-alias-brand-primary)", animation: "dsh-brain-spin 0.9s linear infinite", display: "inline-block" } })
                : state.status === "success" ? "✅"
                : state.status === "error" ? "❌"
                : state.status === "confirm" ? "確認"
                : "▶";
              return React.createElement("button", {
                key: qa.id,
                type: "button",
                "data-quick-action": qa.id,
                "data-action-state": state.status,
                style: {
                  padding: "10px 12px",
                  background: "var(--dsw-alias-bg-layer-2)",
                  border: "1px solid " + (state.status === "confirm" ? "var(--dsw-alias-state-warn-primary)" : state.status === "error" ? "var(--dsw-alias-state-error-primary)" : "var(--dsw-alias-border-l1)"),
                  borderRadius: "8px",
                  cursor: anyBusy && !busy ? "not-allowed" : busy ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  transition: "transform 0.1s ease, border-color 0.1s ease",
                  opacity: anyBusy && !busy ? 0.55 : 1,
                  color: "var(--dsw-alias-label-primary)",
                  fontFamily: "inherit",
                  textAlign: "left",
                },
                disabled: anyBusy && !busy,
                onClick: () => runQuickAction(qa),
                title: state.message || qa.desc,
              },
                React.createElement("div", { style: { fontSize: "22px", flex: "0 0 auto", lineHeight: "1" } }, qa.icon),
                React.createElement("div", { style: { flex: "1 1 auto", minWidth: 0 } },
                  React.createElement("div", { style: { fontSize: "13px", fontWeight: "600", color: "var(--dsw-alias-label-primary)", marginBottom: "1px" } }, qa.title),
                  React.createElement("div", { style: { fontSize: "10px", color: state.status === "error" ? "var(--dsw-alias-state-error-primary)" : state.status === "confirm" ? "var(--dsw-alias-state-warn-primary)" : "var(--dsw-alias-label-secondary)", lineHeight: "1.3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, state.message || qa.desc),
                ),
                React.createElement("div", { style: { fontSize: state.status === "confirm" ? "10px" : "11px", color: state.status === "confirm" ? "var(--dsw-alias-state-warn-primary)" : "var(--dsw-alias-label-secondary)", flex: "0 0 auto", fontWeight: "700" } }, trailing),
              );
            }),
          );
        })(),
        React.createElement("div", { style: { padding: "0 12px 8px", fontSize: "10px", color: "var(--dsw-alias-label-secondary)", display: "flex", alignItems: "center", gap: "4px" } },
          React.createElement("span", null, "💡"),
          React.createElement("span", null, "操作將在當前工作區後臺執行；整理記憶會先預覽再確認"),
        ),
        React.createElement("style", null, "@keyframes dsh-brain-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }"),
        React.createElement("nav", { style: { display: "flex", gap: "4px", padding: "8px 12px 0", borderTop: "1px solid var(--dsw-alias-border-l1)", overflowX: "auto" }, "aria-label": "Project dashboard sections" },
          tabDefs.map((tab) => {
            const active = activeTab === tab.id;
            return React.createElement("button", { key: tab.id, type: "button", onClick: () => setActiveTab(tab.id), "data-dashboard-tab": tab.id, "aria-selected": active ? "true" : "false", style: { flex: "0 0 auto", padding: "8px 11px", border: "none", borderBottom: "2px solid " + (active ? "var(--dsw-alias-brand-primary)" : "transparent"), background: "transparent", color: active ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-label-secondary)", cursor: "pointer", fontFamily: "inherit", fontSize: "11px", fontWeight: active ? "700" : "500" } }, tab.icon + " " + tab.label);
          }),
        ),
        React.createElement("div", { style: { padding: "12px" }, "data-dashboard-panel": activeTab },
          activeTab === "overview" ? React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
            React.createElement(BriefingBlock, { briefing: data.briefing, t, localeCode }),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "10px" } },
              dashSection("🛠️", "dash.tech", (techChips.length + devopsChips.length + toolingChips.length + structureChips.length + extraChips.length) > 0
                ? React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
                  techChips.length > 0
                    ? React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "2px" } }, techChips)
                    : null,
                  extraChips.length > 0
                    ? React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "2px", marginTop: "2px" } }, extraChips)
                    : null,
                  devopsChips.length > 0
                    ? React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "2px", marginTop: "4px", paddingTop: "6px", borderTop: "1px dashed var(--dsw-alias-border-l1)" } }, devopsChips)
                    : null,
                  structureChips.length > 0
                    ? React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "2px", marginTop: "2px" } }, structureChips)
                    : null,
                  toolingChips.length > 0
                    ? React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "2px", marginTop: "4px", paddingTop: "6px", borderTop: "1px dashed var(--dsw-alias-border-l1)" } }, toolingChips)
                    : null,
                )
                : emptyNode),
              dashSection("🗂️", "codegraph.langs", langChips.length > 0 ? React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" } }, langChips) : emptyNode),
              dashSection("🚪", "dash.entry", entryItems.length > 0 ? React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" } }, entryItems) : emptyNode),
            ),
          ) : null,
          activeTab === "architecture" ? React.createElement(ArchitectureGraphBlock, { data, t, embedded: true, onRescan: runArchRescan }) : null,
          activeTab === "work" ? React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
            React.createElement(SessionGraphBlock, { graph: data.sessionGraph, t }),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "10px", alignItems: "start" } },
              dashSection("📋", "dash.todo", todoNode),
              dashSection("📅", "dash.timeline", timelineNode),
            ),
          ) : null,
          activeTab === "knowledge" ? dashSection("🧠", "dash.memory", memoryNode) : null,
          activeTab === "git" ? React.createElement(GitTab, { gitInfo, t, onRefresh: refreshGit, autoRefresh: gitAutoRefresh, onToggleAutoRefresh: (v) => { try { localStorage.setItem("dsh-brain-git-auto-refresh", v ? "1" : "0"); } catch (e) {} setGitAutoRefresh(v); } }) : null,
          activeTab === "settings" ? React.createElement(SettingsTab, { rpc, sessionId, t, localeCode }) : null,
        ),
        React.createElement("div", { style: { padding: "8px 16px", fontSize: "10px", color: "var(--dsw-alias-label-secondary)", borderTop: "1px solid var(--dsw-alias-border-l1)", display: "flex", alignItems: "center", gap: "4px" } },
          React.createElement("span", null, "🕒"),
          React.createElement("span", null, t("dash.snapshot", { time: formatDate(data.generatedAt || Date.now()) })),
        ),
        // v1.1.x-fix：專案記憶詳情彈框（fixed 定位，掛在 dashboard 末尾不影響佈局）
        memoryModalNode,
      );
    }

    // ─── 快照指示（v0.3.4）：build-time embed 資料通道標識 ───
    function SnapshotBadge({ data, t, source }) {
      const ts = data && data.generatedAt;
      const age = ts ? Math.round((Date.now() - ts) / 1000) : null;
      const ageText = age == null ? "" : age < 60 ? `${age}s` : age < 3600 ? `${Math.round(age/60)}m` : `${Math.round(age/3600)}h`;
      return React.createElement("span", {
        style: {
          display: "inline-block",
          padding: "2px 8px",
          marginLeft: "8px",
          borderRadius: "10px",
          fontSize: "10px",
          fontWeight: "500",
          background: "var(--dsw-alias-state-success-primary)",
          color: "var(--dsw-alias-bg-base)",
        },
        "data-block": "snapshot-badge",
        title: source === "runtime" ? t("runtime.synced") : t("snapshot.autoSync"),
      }, (source === "runtime" ? "● " + t("runtime.label") : "📦 " + t("snapshot.label")) + (ageText ? " · " + ageText : ""));
    }

    // ─── 取 DSH 當前 locale（client builtin locale.getLocale()），fallback zh-CN ───
    //   v0.3.12: 不再硬編碼 zh-CN，即時跟隨 DSH 語言設定
    //   從 props._dshLocale（apply 注入）取；fallback zh-CN
    function resolveLocaleCode(props) {
      try {
        const l = props && props._dshLocale;
        if (l && typeof l.getLocale === "function") {
          const code = l.getLocale();
          if (code && typeof code === "string" && dicts[code]) return code;
          if (code && typeof code === "string") {
            // DSH 可能返回 "zh-CN" / "en-US" / "zh" / "en" 等，匹配字首
            const lower = code.toLowerCase();
            for (const k of Object.keys(dicts)) {
              if (k.toLowerCase() === lower || k.toLowerCase().indexOf(lower + "-") === 0 || lower.indexOf(k.toLowerCase()) === 0) return k;
            }
          }
        }
      } catch (e) {}
      return "zh-CN";
    }

    function useResolvedPreview(props) {
      const embedded = DEMO_ONBOARDING
        ? { data: { initialized: false, project: null, phase: null, recentActivity: [], stats: { pendingTodos: 0, completedTodos: 0, decisions: 0 }, _generatedAt: __PROJECT_DATA__ && __PROJECT_DATA__.generatedAt }, workspaceId: null, workspacePath: null, sessionId: null, hint: "", source: "snapshot" }
        : resolvePreview(props);
      const sid = (props && props.sessionId) || null;
      const [runtime, setRuntime] = React.useState(null);
      // v1.1.x-fix：3 狀態機 + 顯式 runtimeError
      //   - runtimeResolved=false                                       → host RPC 進行中（loading 佔位）
      //   - runtimeResolved=true && runtime != null                     → host RPC 成功（render dashboard / Onboarding）
      //   - runtimeResolved=true && runtime == null && runtimeError!=null → host RPC 失敗（render 顯式降級 banner）
      //   - runtimeResolved=true && runtime == null && runtimeError==null → 離線模式（offlineMode 入口直返）
      // 移除原 4 秒 setTimeout 強制 finish——避免 host 慢時落到 embedded hint 閃現。
      const [runtimeResolved, setRuntimeResolved] = React.useState(DEMO_ONBOARDING || !sid || !__DSH_CONNECTION__ || !__DSH_CONNECTION__.rpc);
      const [runtimeError, setRuntimeError] = React.useState(null);

      // 把 Connection RPC 丟擲的"原始 error"壓縮成人話（避免 banner 裡出現整頁 schemastery JSON）
      function compressRpcError(err) {
        const raw = err && err.message ? err.message : (typeof err === "string" ? err : String(err || ""));
        // schemastery 的 invalid_union / invalid_value 錯誤 → 直接提示 result schema 不匹配
        if (/invalid_union|invalid_value|No matching discriminator/.test(raw)) {
          return "[DSH schema] host 返回的 result 不符合 Connection RPC schema（通常是 DSH 升級/降級引入的協議不相容，或外掛返回了 schema 未宣告的欄位）";
        }
        // Network/connection 類錯誤
        if (/Failed to fetch|NetworkError|ECONNREFUSED|ENOTFOUND|timeout/i.test(raw)) {
          return "[DSH IPC] host 通道不可達（" + raw.slice(0, 80) + "）";
        }
        // 其他：截斷到 200 字元
        return raw.length > 200 ? raw.slice(0, 200) + "…" : raw;
      }

      React.useEffect(() => {
        setRuntime(null);
        setRuntimeError(null);
        const offlineMode = DEMO_ONBOARDING || !sid || !__DSH_CONNECTION__ || !__DSH_CONNECTION__.rpc;
        if (offlineMode) {
          setRuntimeResolved(true);
          return undefined;
        }
        setRuntimeResolved(false);
        let active = true;
        const refresh = () => {
          if (!active) return;
          __DSH_CONNECTION__.rpc.call("/project-brain", "preview", { sessionId: sid })
            .then((result) => {
              if (!active) return;
              if (result && result.ok && result.value) {
                const value = result.value;
                setRuntime({
                  data: value.preview,
                  workspaceId: embedded.workspaceId,
                  workspacePath: value.projectPath || embedded.workspacePath,
                  sessionId: sid,
                  hint: "",
                  source: "runtime",
                });
                setRuntimeError(null);
              } else {
                // host RPC 返回失敗結構（workspace-not-found / bad-request 等）——
                // 顯式記錄錯誤，讓 UI 渲染降級 banner 而不是落到 embedded。
                const err = (result && result.error) || {};
                const originalCode = (err.details && err.details.originalCode) || null;
                setRuntimeError({
                  code: err.code || "RPC_EMPTY",
                  originalCode: originalCode,
                  message: err.message || "host RPC 返回異常",
                  sessionId: sid,
                  at: Date.now(),
                });
              }
              setRuntimeResolved(true);
            })
            .catch((error) => {
              if (!active) return;
              // Keep the embedded snapshot as a graceful offline fallback.
              console.warn("[dsh-project-brain] runtime preview unavailable:", error);
              setRuntimeError({
                code: "RPC_THROW",
                message: compressRpcError(error),
                sessionId: sid,
                at: Date.now(),
              });
              setRuntimeResolved(true);
            });
        };
        refresh();
        // v1.1.x-fix：setInterval 5000→2000ms，縮短切 session 時的"host 慢"等待視窗。
        //   DSH 非同步註冊 session workspace 時首次 preview 可能返回 workspace-not-found，
        //   5s 太長導致 banner 顯示幾秒才消失；2s 通常足夠 DSH 完成註冊。
        const timer = setInterval(refresh, 2000);
        return () => {
          active = false;
          clearInterval(timer);
        };
      }, [sid]);

      return [runtime || embedded, setRuntime, runtimeResolved, runtimeError];
    }

    // ─── 根元件：Connection RPC 為主，build-time embed 為首屏/離線降級 ───
    function SidebarPreviewRoot(props) {
      const localeCode = resolveLocaleCode(props);
      const t = makeT(localeCode);
      const [r, setRuntimePreview, runtimeResolved, runtimeError] = useResolvedPreview(props);
      const data = r.data;

      const handleOnboardingComplete = React.useCallback((value) => {
        if (!value || !value.preview) return;
        setRuntimePreview({
          data: value.preview,
          workspaceId: r.workspaceId,
          workspacePath: value.projectPath || r.workspacePath,
          sessionId: r.sessionId,
          hint: "",
          source: "runtime",
        });
      }, [r.workspaceId, r.workspacePath, r.sessionId]);

      const containerStyle = {
        padding: "10px 0 28px",
        background: "var(--dsw-alias-bg-base)",
        color: "var(--dsw-alias-label-primary)",
        minHeight: "100%",
        boxSizing: "border-box",
      };
      const containerProps = {
        className: "dsh-project-brain-preview",
        "data-version": "v1.1.x-three-runtime-rpc",
        "data-workspace-id": r.workspaceId || "(none)",
        "data-workspace-path": r.workspacePath || "(none)",
        "data-session-id": (r.sessionId || "").toString().slice(0, 8),
        "data-runtime-state": runtimeResolved ? (runtimeError ? "host-error" : (r.source === "runtime" ? "host-ok" : "offline")) : "host-loading",
        style: containerStyle,
      };
      const dataWithLocale = Object.assign({}, data, { _localeCode: localeCode, _workspacePath: r.workspacePath || null });

      const headerWithBadge = React.createElement(
        "section",
        { style: Object.assign({}, sectionStyle, { padding: "12px 16px" }), "data-block": "live-status" },
        React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
          React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)" }, "data-block": "live-label" }, "dsh-project-brain"),
          React.createElement(SnapshotBadge, { data: data, t, source: r.source }),
        ),
      );

      // v1.1.x-fix：3 狀態機渲染
      //   1) host RPC 進行中（!runtimeResolved）→ loading 佔位，**不顯示 Onboarding / hint**，
      //      避免 build miss 時 embedded 階段的 hint 閃現誤導使用者。
      //   2) host RPC 失敗（runtimeError）→ 顯式降級 banner（含原因 + 操作建議，按使用者
      //      preference "任何兜底/降級必須附原因+操作建議"）。
      //   3) host RPC 成功 / 離線模式（runtime）→ 走正常判定：已初始化 → Dashboard，
      //      未初始化 → Onboarding（path 來自 r.workspacePath）。
      if (!dataWithLocale.initialized) {
        // 1) host RPC 進行中
        if (!runtimeResolved) {
          return React.createElement("div", containerProps,
            React.createElement("style", null, "@keyframes dsh-brain-loading-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}.dsh-brain-loading-dot{display:inline-block;width:8px;height:8px;border-radius:50%;border:1.5px solid var(--dsw-alias-brand-primary);border-top-color:transparent;animation:dsh-brain-loading-spin 0.9s linear infinite;vertical-align:middle;margin-right:8px}"),
            headerWithBadge,
            React.createElement("div", {
              style: { padding: "32px 16px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", color: "var(--dsw-alias-label-secondary)", fontSize: "12px" },
              "data-block": "preview-loading",
            },
              React.createElement("div", { style: { display: "flex", alignItems: "center" } },
                React.createElement("span", { className: "dsh-brain-loading-dot" }),
                React.createElement("span", null, localeCode === "en-US" ? "Resolving workspace from Session…" : "正在從 Session 解析 workspace…"),
              ),
              React.createElement("div", { style: { fontSize: "10px", opacity: 0.7 } },
                (r.sessionId ? String(r.sessionId).slice(0, 12) + "…" : "—"),
              ),
            ),
          );
        }

        // 2) host RPC 失敗 → 顯式降級 banner
        if (runtimeError) {
          const errCode = runtimeError.code || "RPC_EMPTY";
          const originalCode = runtimeError.originalCode || null;
          // v1.1.x-fix：host 端會把不在 DSH schema 白名單的 code 降級到 "internal"，原 code 進 details.originalCode。
          //   客戶端 banner 判定時優先用 originalCode（更精確），再用 errCode。這樣切專案時的"workspace-not-found"
          //   不會因為降級顯示成"host 連線失敗"+"檢查網路/重啟"。
          const effectiveCode = originalCode || errCode;
          const isWorkspaceMiss = effectiveCode === "workspace-not-found";
          const isSchema = (errCode === "RPC_THROW" || errCode === "internal") && /\[DSH schema\]/.test(runtimeError.message || "");
          const isNetwork = (errCode === "RPC_THROW" || errCode === "internal") && /\[DSH IPC\]/.test(runtimeError.message || "");
          const bannerTitle = isWorkspaceMiss
            ? (localeCode === "en-US" ? "Workspace path not found for this Session" : "無法從當前 Session 解析 workspace 路徑")
            : isSchema
              ? (localeCode === "en-US" ? "DSH host returned a malformed result" : "DSH host 返回的 result 協議不匹配")
              : isNetwork
                ? (localeCode === "en-US" ? "Cannot reach DSH host" : "無法連線 DSH host")
                : (localeCode === "en-US" ? "Host RPC failed" : "host 連線失敗");
          const bannerReason = isWorkspaceMiss
            ? (localeCode === "en-US"
                ? "DSH Host could not resolve cwd for this sessionId. Usually means DSH has not yet registered the session workspace (cold start) or the session has no cwd header."
                : "DSH Host 暫時無法解析當前 sessionId 對應的 cwd（通常 DSH 還沒把 session workspace 註冊進來，或 session header 缺 cwd 欄位）。")
            : isSchema
              ? (localeCode === "en-US"
                  ? "The result of /project-brain preview did not match Connection RPC schema. This usually means the plugin and DSH Desktop versions are out of sync — try restarting DSH."
                  : "/project-brain preview 返回的 result 不符合 Connection RPC schema，通常是外掛與 DSH 桌面版本不一致導致——重啟 DSH 試試。")
              : (localeCode === "en-US"
                  ? `RPC "${errCode}"${originalCode ? " (was " + originalCode + ")" : ""} — ${runtimeError.message || "(no message)"}`
                  : `RPC "${errCode}"${originalCode ? "（原 code=" + originalCode + "）" : ""} — ${runtimeError.message || "未知錯誤"}`);
          const bannerAction = isWorkspaceMiss
            ? (localeCode === "en-US"
                ? "Action: wait a moment and switch again, or open any file in the project root so DSH registers the workspace, then return."
                : "建議：等 1~2 秒再切一次，或在專案根目錄隨便開啟一個檔案讓 DSH 註冊 workspace 後再回來。")
            : isSchema
              ? (localeCode === "en-US"
                  ? "Action: fully quit DSH Desktop (right-click tray → Quit) and restart. Reopen the project — the bundle will be reloaded."
                  : "建議：完全退出 DSH 桌面（托盤右鍵 → Quit）後重新啟動，再開啟該專案即可重新載入 bundle。")
            : (localeCode === "en-US"
                ? "Action: check DSH Desktop network/plugin health, or restart DSH. The retry interval is 5s."
                : "建議：檢查 DSH 桌面網路/外掛狀態，或重啟 DSH。客戶端每 5 秒會自動重試。");
          const bannerSeverity = isWorkspaceMiss ? "輕" : (isSchema || isNetwork) ? "中" : "中";
          const severityLabel = localeCode === "en-US"
            ? (isWorkspaceMiss ? "Severity: low" : "Severity: medium")
            : `嚴重程度：${bannerSeverity}`;
          const banner = React.createElement(
            "div",
            {
              "data-block": "host-error-banner",
              "data-error-code": errCode,
              style: {
                margin: "8px 16px",
                padding: "12px 14px",
                background: "var(--dsw-alias-state-warn-primary)",
                color: "var(--dsw-alias-bg-base)",
                borderRadius: "8px",
                fontSize: "12px",
                lineHeight: 1.55,
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              },
            },
            React.createElement("div", { style: { fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" } },
              React.createElement("span", null, "⚠️"),
              React.createElement("span", null, bannerTitle),
            ),
            React.createElement("div", { style: { opacity: 0.95 } }, bannerReason),
            React.createElement("div", { style: { opacity: 0.9, fontSize: "11px" } }, bannerAction),
            React.createElement("div", { style: { opacity: 0.85, fontSize: "10px" } }, severityLabel),
          );
          return React.createElement("div", containerProps,
            headerWithBadge,
            banner,
            React.createElement(OnboardingBlock, {
              t,
              path: r.workspacePath || null,
              sessionId: r.sessionId || null,
              onComplete: handleOnboardingComplete,
              connection: __DSH_CONNECTION__,
            }),
          );
        }

        // 3) host RPC 成功且確認未初始化 → Onboarding（path 來自 r.workspacePath）
        return React.createElement("div", containerProps,
          headerWithBadge,
          React.createElement(OnboardingBlock, {
            t,
            path: r.workspacePath || null,
            sessionId: r.sessionId || null,
            onComplete: handleOnboardingComplete,
            connection: __DSH_CONNECTION__,
          }),
        );
      }

      return React.createElement("div", containerProps,
        React.createElement("style", null, [
          ".dsh-project-brain-preview *{box-sizing:border-box}",
          ".dsh-brain-summary-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(260px,.65fr);gap:10px;margin:8px 12px}",
          "@media(max-width:760px){.dsh-brain-summary-grid{grid-template-columns:1fr}}",
          ".dsh-project-brain-preview button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}",
          ".dsh-project-brain-preview button:not(:disabled):active{transform:translateY(1px)}",
          ".dsh-project-brain-preview button.dsh-arch-lane:not(:disabled):active,.dsh-project-brain-preview button.dsh-arch-node:not(:disabled):active,.dsh-project-brain-preview button.dsh-arch-chip:not(:disabled):active{transform:none}",
        ].join("\n")),
        headerWithBadge,
        React.createElement(HeaderBlock, {
          data: dataWithLocale,
          t,
          sessionId: r.sessionId || null,
          connection: __DSH_CONNECTION__,
        }),
        React.createElement("div", { className: "dsh-brain-summary-grid", "data-block": "summary-grid" },
          React.createElement(StatusBannerBlock, { data: dataWithLocale, t, compact: true }),
          React.createElement(PhaseBlock, { data: dataWithLocale, t, compact: true }),
        ),
        React.createElement(DashboardSection, {
          data: dataWithLocale,
          t,
          localeCode,
          sessionId: r.sessionId || null,
          connection: __DSH_CONNECTION__,
          onPreviewUpdate: handleOnboardingComplete,
        }),
      );
    }

    // ─── P0.7: TodoStrip (conversation.input.dock) ───
    // 位置：composer 上方全寬行；摺疊態顯示活躍 TODO Top-3，點選"檢視全部"展開全量；空狀態隱藏整行
    // 資料來源：複用 SidebarPreviewRoot 同源 build-time embed (resolvePreview props -> data.todos)
    // 互動：純 DOM toggle（避免 useState 觸發 DSH static client 相容性 bug，已知歷史教訓）

    function TodoStrip(props) {
      const localeCode = resolveLocaleCode(props);
      const t = makeT(localeCode);
      const [r, , runtimeResolved] = useResolvedPreview(props);
      const data = r.data;
      // v1.1.x-fix：host 拉資料期間（!runtimeResolved）不渲染 strip，避免切專案時
      //   "embedded.data.initialized=true（之前專案的）→ 現在 sid 的 embedded=false"
      //   引起的閃爍。host 回資料後再根據 data.initialized 決定顯示與否。
      if (!runtimeResolved) return null;
      if (!data || !data.initialized) return null;  // 未初始化專案不顯示
      const active = (data.todos || []).filter((x) => x && x.status !== "done" && x.status !== "cancelled");
      if (active.length === 0) return null;        // 無活躍 TODO 不顯示（避免噪音）

      const wsid = r.workspaceId || "default";
      const stripId = "dsh-brain-todo-strip-" + wsid;
      const listId = "dsh-brain-todo-strip-list-" + wsid;
      const toggleBtnId = "dsh-brain-todo-strip-toggle-" + wsid;
      const closeBtnId = "dsh-brain-todo-strip-close-" + wsid;
      const restoreId = "dsh-brain-todo-strip-restore-" + wsid;
      const dismissedKey = "dsh-brain-todo-strip-dismissed:" + wsid;

      const isDismissed = (() => {
        try { return localStorage.getItem(dismissedKey) === "1"; } catch (e) { return false; }
      })();

      const containerStyle = {
        display: "flex",
        flexDirection: "column",
        gap: "0",
        padding: "6px 12px",
        margin: "0 12px 6px",
        background: "var(--dsw-alias-bg-layer-1)",
        border: "1px solid var(--dsw-alias-border-l1)",
        borderRadius: "6px",
        fontSize: "12px",
        color: "var(--dsw-alias-label-primary)",
      };
      const headerStyle = {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        cursor: "pointer",
        userSelect: "none",
        fontWeight: "600",
        fontSize: "11px",
        color: "var(--dsw-alias-label-secondary)",
        textTransform: "uppercase",
        letterSpacing: "0.6px",
      };
      const countBadgeStyle = {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "18px",
        height: "16px",
        padding: "0 6px",
        marginLeft: "6px",
        fontSize: "10px",
        fontWeight: "700",
        lineHeight: "1",
        borderRadius: "8px",
        background: "var(--dsw-alias-bg-layer-2)",
        color: "var(--dsw-alias-label-primary)",
        letterSpacing: "0",
        textTransform: "none",
      };
      const iconBtnStyle = {
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: "var(--dsw-alias-label-secondary)",
        fontSize: "13px",
        fontFamily: "inherit",
        padding: "0 6px",
        borderRadius: "3px",
        lineHeight: "1",
      };
      const prioColor = { urgent: "var(--dsw-alias-state-error-primary)", high: "var(--dsw-alias-state-warn-primary)" };
      const itemStyle = (idx) => ({
        display: "flex",
        alignItems: "baseline",
        gap: "8px",
        padding: "4px 0",
        borderTop: idx === 0 ? "none" : "1px solid var(--dsw-alias-border-l1)",
        fontSize: "13px",
      });
      const chipStyle = (priority) => ({
        flex: "0 0 auto",
        fontSize: "10px",
        padding: "1px 6px",
        borderRadius: "3px",
        background: prioColor[priority] || "var(--dsw-alias-bg-layer-2)",
        color: prioColor[priority] ? "var(--dsw-alias-bg-base)" : "var(--dsw-alias-label-secondary)",
      });

      // 切換展開/摺疊（純 DOM，避免 useState 觸發 DSH static client 相容性 bug）
      const onToggle = (ev) => {
        try {
          if (ev && ev.stopPropagation) ev.stopPropagation();
          const listEl = document.getElementById(listId);
          const btn = document.getElementById(toggleBtnId);
          if (!listEl) return;
          const expanded = listEl.dataset.expanded === "1";
          if (expanded) {
            listEl.style.display = "none";
            listEl.dataset.expanded = "0";
            if (btn) btn.textContent = "▾";
          } else {
            listEl.style.display = "flex";
            listEl.dataset.expanded = "1";
            if (btn) btn.textContent = "▴";
          }
        } catch (e) {}
      };

      // 關閉整個 strip：隱藏 + 寫 localStorage + 顯示恢復 chip
      const onClose = (ev) => {
        try {
          if (ev && ev.stopPropagation) ev.stopPropagation();
          const stripEl = document.getElementById(stripId);
          const restoreEl = document.getElementById(restoreId);
          if (stripEl) stripEl.style.display = "none";
          if (restoreEl) restoreEl.style.display = "";
          try { localStorage.setItem(dismissedKey, "1"); } catch (e) {}
        } catch (e) {}
      };

      // 從關閉態恢復
      const onRestore = (ev) => {
        try {
          if (ev && ev.stopPropagation) ev.stopPropagation();
          const stripEl = document.getElementById(stripId);
          const restoreEl = document.getElementById(restoreId);
          if (restoreEl) restoreEl.style.display = "none";
          if (stripEl) stripEl.style.display = "";
          try { localStorage.removeItem(dismissedKey); } catch (e) {}
        } catch (e) {}
      };

      const items = active.map((x, idx) =>
        React.createElement("div", {
          key: x.id,
          "data-todo-item": "1",
          style: itemStyle(idx),
        },
          React.createElement("span", { style: chipStyle(x.priority) }, t("prio." + (x.priority || "medium"))),
          React.createElement("span", { style: { flex: "1 1 auto" } }, x.title),
          x.status === "in_progress" ? React.createElement("span", { style: { flex: "0 0 auto", fontSize: "11px", color: "var(--dsw-alias-state-success-primary)" } }, t("st.in_progress")) : null,
        ),
      );

      // 主 strip（預設摺疊，列表隱藏）— header 始終可見，點選切換展開
      const strip = React.createElement("div", {
        id: stripId,
        "data-block": "todo-strip",
        "data-workspace-id": r.workspaceId || "",
        style: Object.assign({}, containerStyle, isDismissed ? { display: "none" } : {}),
      },
        React.createElement("div", { style: headerStyle, onClick: onToggle, title: t("todostrip.viewAll") },
          React.createElement("span", { key: "t", style: { display: "inline-flex", alignItems: "center" } },
            "📋 " + t("todostrip.title"),
            React.createElement("span", { style: countBadgeStyle }, String(active.length)),
          ),
          React.createElement("div", { key: "actions", style: { display: "flex", gap: "2px", alignItems: "center" } },
            React.createElement("button", {
              key: "toggle", id: toggleBtnId, type: "button", style: iconBtnStyle,
              onClick: onToggle, title: t("todostrip.viewAll"),
            }, "▾"),
            React.createElement("button", {
              key: "close", id: closeBtnId, type: "button", style: iconBtnStyle,
              onClick: onClose, title: t("todostrip.close"),
            }, "×"),
          ),
        ),
        React.createElement("div", {
          id: listId, "data-expanded": "0",
          style: { display: "none", flexDirection: "column" },
        }, items),
      );

      // 恢復 chip（關閉後顯示，極小佔用，不釘住）
      const restoreChip = React.createElement("button", {
        key: "restore", id: restoreId, type: "button",
        "data-block": "todo-strip-restore",
        "data-workspace-id": r.workspaceId || "",
        style: {
          display: isDismissed ? "" : "none",
          alignItems: "center",
          gap: "4px",
          padding: "2px 8px",
          margin: "0 12px 4px",
          background: "transparent",
          border: "1px dashed var(--dsw-alias-border-l1)",
          borderRadius: "10px",
          fontSize: "11px",
          color: "var(--dsw-alias-label-secondary)",
          cursor: "pointer",
          fontFamily: "inherit",
          alignSelf: "flex-start",
        },
        onClick: onRestore, title: t("todostrip.title"),
      }, "📋 · " + active.length + " " + t("todostrip.viewAll"));

      return React.createElement(React.Fragment, null, strip, restoreChip);
    }

    // ─── apply ───
    let __DSH_CONNECTION__ = null;
    const apply = (ctx, config) => {
      const slots = ctx.slots;
      const dshLocale = ctx.locale;
      try {
        __DSH_CONNECTION__ = ctx.connection || (ctx.get && ctx.get("connection")) || null;
      } catch (e) {}

      if (!slots) {
        console.warn("[dsh-project-brain:client] slots service unavailable");
        return;
      }

      if (dshLocale && typeof dshLocale.register === "function") {
        try {
          dshLocale.register(NS, dicts);
        } catch (e) {
          console.warn("[dsh-project-brain:client] locale.register failed:", e);
        }
      }

      slots.inject("conversation.view", () =>
        slots.register(
          {
            name: "conversation.view",
            id: "project-brain",
            order: 35,
            label: () => "專案",
          },
          (props) => React.createElement(SidebarPreviewRoot, Object.assign({}, props, { _dshLocale: dshLocale })),
        ),
      );

      // P0.7: 註冊 conversation.input.dock（composer 上方 TodoStrip）
      //   id: project-brain-todo-strip, order: 10（DSH 預設 dock 順序）
      //   Slot 型別 list（多個 dock 共存），scope: session
      try {
        slots.inject("conversation.input.dock", () =>
          slots.register(
            {
              name: "conversation.input.dock",
              id: "project-brain-todo-strip",
              order: 10,
              label: () => "TodoStrip",
            },
            (props) => React.createElement(TodoStrip, Object.assign({}, props, { _dshLocale: dshLocale })),
          ),
        );
      } catch (e) {
        console.warn("[dsh-project-brain:client] conversation.input.dock registration failed:", e);
      }
    };

    var module = { exports: {} };
    module.exports = {
      name: "dsh-project-brain:client",
      inject: ["slots", "locale", "connection"],
      apply,
    };
    return module.exports;
  },
});
