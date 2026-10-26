import assert from "node:assert/strict";
import { buildSessionGraph } from "../src/host/memory/session-graph.js";

const empty = buildSessionGraph({
  timeline: [{ eventType: "session_summary", sessionId: "s0", summary: "  ", occurredAt: 1 }],
  todos: [],
  memories: [],
});
assert.equal(empty.nodes.length, 0);
assert.ok(empty.collapsedEmptyCount >= 1);

const talk = buildSessionGraph({
  timeline: [{ eventType: "session_summary", sessionId: "s1", summary: "We chose RPC over embed.", occurredAt: 2, files: [] }],
  todos: [],
  memories: [],
});
assert.equal(talk.nodes.length, 1);
assert.match(talk.nodes[0].label, /RPC/);
assert.equal(talk.edges.length, 0);

const g = buildSessionGraph({
  timeline: [
    { eventType: "session_summary", sessionId: "a", summary: "Added inject briefing.", occurredAt: 1, files: ["src/a.js"] },
    { eventType: "todo", sessionId: "a", todoId: "t1", occurredAt: 1 },
    { eventType: "session_summary", sessionId: "b", summary: "Finished inject briefing.", occurredAt: 2, files: ["src/b.js"] },
    { eventType: "todo", sessionId: "b", todoId: "t1", todoStatus: "done", occurredAt: 2 },
  ],
  todos: [{ id: "t1", status: "done" }],
  memories: [],
});
assert.equal(g.nodes.length, 2);
assert.ok(g.edges.some((e) => e.kind === "time"));
assert.ok(g.edges.some((e) => e.kind === "evidence" && e.reason === "todo"));

const chain = buildSessionGraph({
  timeline: [
    { eventType: "session_summary", sessionId: "a", summary: "One.", occurredAt: 1 },
    { eventType: "session_summary", sessionId: "b", summary: "Two.", occurredAt: 2 },
  ],
  todos: [],
  memories: [],
});
assert.ok(chain.edges.every((e) => e.kind === "time"));
assert.equal(chain.edges.length, 1);

const cl = buildSessionGraph({
  timeline: [{ eventType: "session_summary", sessionId: "c", summary: "改了 8 個檔案", occurredAt: 1, files: ["src/x.js"] }],
  todos: [],
  memories: [],
});
assert.equal(cl.nodes[0].label, "程式碼有變更（無摘要）");

const hist = buildSessionGraph({
  timeline: [
    { id: "i", eventType: "init", occurredAt: 1 },
    { id: "r", eventType: "rescan", occurredAt: 2, detail: "architecture=hybrid" },
    { id: "m", eventType: "memory", occurredAt: 3, title: "新增記憶[decision]：路徑以 session cwd 為準" },
    { id: "t-open", eventType: "todo", occurredAt: 4, title: "新增待辦[todo-t1]：Fix inject" },
    { id: "t-done", eventType: "todo", occurredAt: 86_400_000 + 5, title: "完成待辦[todo-t1]：Fix inject" },
  ],
  todos: [{ id: "todo-t1", status: "done" }],
  memories: [],
});
assert.ok(hist.nodes.length >= 2, "orphan timeline should still form a trunk");
assert.ok(!hist.nodes.some((n) => /重掃/.test(n.label || "")), "rescans are not trunk nodes");
assert.ok(hist.nodes.some((n) => /cwd|Fix inject/.test(n.label || "")));
assert.ok(hist.edges.some((e) => e.kind === "evidence" && e.reason === "todo"));

const nullSafe = buildSessionGraph({ timeline: [null], memories: [null], todos: [] });
assert.equal(nullSafe.nodes.length, 0);

const versions = buildSessionGraph({
  timeline: [
    { eventType: "memory", occurredAt: 1, title: "新增記憶[decision]：v0.4.13 補丁說明" },
    { eventType: "memory", occurredAt: 86_400_000 + 1, title: "新增記憶[decision]：記憶機制六大維度最佳化完善 (v0.4.13)" },
    { eventType: "session_summary", sessionId: "s-ver", occurredAt: 86_400_000 * 2, summary: "Shipped v0.4.13 injector fix.", files: ["src/host/injector.js"] },
  ],
  todos: [],
  memories: [],
});
assert.ok(!versions.nodes.some((n) => /v0\.$/.test(String(n.label || "").trim()) || String(n.label || "").trim() === "v0."), "version dots are not sentence breaks");
assert.ok(!versions.nodes.some((n) => /^\s*v?\d+(?:\.\d+)+\b/.test(String(n.label || ""))), "version-led patch titles stay off the trunk");
assert.ok(versions.nodes.some((n) => /記憶機制六大維度最佳化完善/.test(n.label || "") && /v0\.4\.13/.test(n.label || "")));
assert.ok(versions.nodes.some((n) => /Shipped v0\.4\.13 injector/.test(n.label || "")));

const twoSent = buildSessionGraph({
  timeline: [{ eventType: "session_summary", sessionId: "s-two", summary: "We chose RPC over embed. Keep session cwd.", occurredAt: 4 }],
  todos: [],
  memories: [],
});
assert.match(twoSent.nodes[0].label, /RPC/);
assert.match(twoSent.nodes[0].detail, /cwd/);
assert.notEqual(twoSent.nodes[0].detail, twoSent.nodes[0].label);

const memDup = buildSessionGraph({
  timeline: [{ eventType: "memory", occurredAt: 5, title: "新增記憶[decision]：記憶詳情彈框 markdown 渲染 + 複製原文 (v1.2.0 patch)" }],
  todos: [],
  memories: [{
    type: "decision",
    status: "active",
    title: "記憶詳情彈框 markdown 渲染 + 複製原文 (v1.2.0 patch)",
    content: "記憶詳情彈框 markdown 渲染 + 複製原文 (v1.2.0 patch)",
    createdAt: 5,
    updatedAt: 5,
  }],
});
assert.match(memDup.nodes[0].label, /記憶詳情彈框/);
assert.equal(String(memDup.nodes[0].detail || "").trim(), "");

const memBody = buildSessionGraph({
  timeline: [{ eventType: "memory", occurredAt: 6, title: "新增記憶[decision]：記憶詳情彈框 markdown 渲染 + 複製原文 (v1.2.0 patch)" }],
  todos: [],
  memories: [{
    type: "decision",
    status: "active",
    title: "記憶詳情彈框 markdown 渲染 + 複製原文 (v1.2.0 patch)",
    content: "彈框用輕量 markdown 渲染正文，複製按鈕只複製原始 markdown。",
    createdAt: 6,
    updatedAt: 6,
  }],
});
assert.match(memBody.nodes[0].label, /記憶詳情彈框/);
assert.match(memBody.nodes[0].detail, /輕量 markdown/);
assert.notEqual(memBody.nodes[0].detail, memBody.nodes[0].label);

// 版本號開頭的「補丁記憶」要擋，但以編號開頭的正常標題不能誤殺
const numbered = buildSessionGraph({
  timeline: [
    { eventType: "memory", occurredAt: 7, title: "新增記憶[decision]：2.0 版本規劃：拆出獨立注入層" },
    { eventType: "memory", occurredAt: 86_400_000 + 7, title: "新增記憶[decision]：v1.2.0 patch：修復彈框渲染" },
  ],
  todos: [],
  memories: [],
});
assert.ok(numbered.nodes.some((n) => /2\.0 版本規劃/.test(n.label || "")), "編號開頭的正常標題不該被當成補丁記憶丟掉");
assert.ok(!numbered.nodes.some((n) => /修復彈框渲染/.test(n.label || "")), "v1.2.0 patch 仍然擋在主幹外");

// TODO 證據邊：只有「開 → 關」算因果，重複 done 不能連出假邊
const dupDone = buildSessionGraph({
  timeline: [
    { eventType: "todo", sessionId: "d1", todoId: "t9", todoStatus: "done", occurredAt: 1, files: ["src/a.js"] },
    { eventType: "todo", sessionId: "d2", todoId: "t9", todoStatus: "done", occurredAt: 2, files: ["src/b.js"] },
  ],
  todos: [],
  memories: [],
});
assert.ok(!dupDone.edges.some((e) => e.kind === "evidence" && e.reason === "todo"), "兩次 done 之間沒有因果");

// 抽稀保底：超過閾值也不能把主幹清空
const many = { timeline: [], todos: [], memories: [] };
for (let i = 0; i < 60; i++) {
  many.timeline.push({ eventType: "memory", occurredAt: (i + 1) * 86_400_000, title: "新增記憶[decision]：第 " + i + " 次結論落地" });
}
const thinned = buildSessionGraph(many);
assert.ok(thinned.nodes.length > 40, "節點本身不刪");
const shown = thinned.nodes.filter((n) => !n.hidden);
assert.ok(shown.length >= 12, "預設檢視至少保留一批節點，不能全藏起來，實際=" + shown.length);
assert.equal(thinned.hiddenCount, thinned.nodes.length - shown.length);
assert.equal(shown[shown.length - 1].id, thinned.nodes[thinned.nodes.length - 1].id, "最新節點必須可見");

// 排序口徑統一：同一個桶取最後一次活動時間
const ordering = buildSessionGraph({
  timeline: [
    { eventType: "session_summary", sessionId: "s-early", summary: "Early work.", occurredAt: 10 },
    { eventType: "session_summary", sessionId: "s-late", summary: "Late work.", occurredAt: 100 },
  ],
  todos: [],
  memories: [
    { type: "decision", status: "active", title: "早期結論", content: "內容不同於標題的一段話。", createdAt: 20, updatedAt: 20, source: { sessionId: "s-early" } },
    { type: "decision", status: "active", title: "後期結論", content: "另一段不同於標題的內容。", createdAt: 200, updatedAt: 200, source: { sessionId: "s-late" } },
  ],
});
assert.deepEqual(ordering.nodes.map((n) => n.id), ["s-early", "s-late"]);
assert.ok(ordering.nodes[0].occurredAt < ordering.nodes[1].occurredAt);

// 展開區正文是給人讀的純文本：不能把 markdown 符號原樣丟出來
const md = buildSessionGraph({
  timeline: [{ eventType: "memory", occurredAt: 8, title: "新增記憶[decision]：Dashboard 設定入口" }],
  todos: [],
  memories: [{
    type: "decision",
    status: "active",
    title: "Dashboard 設定入口",
    content: [
      "## 背景",
      "使用者原話：「embedding endpoint 可以去配置」。",
      "核心需求：**給外掛一個顯式的設定入口**，配了就用、不配就降級。",
      "## 現狀核實",
      "- ✅ **降級邏輯已實現**（`config.js` 裡的 `resolveEmbeddingApiKey`）",
      "- [參考文件](https://example.com/docs) 裡有說明",
      "> 引用一句旁白",
    ].join("\n"),
    createdAt: 8,
    updatedAt: 8,
  }],
});
const mdDetail = md.nodes[0].detail || "";
assert.ok(mdDetail, "應當有正文");
assert.doesNotMatch(mdDetail, /##/, "標題符號要去掉");
assert.doesNotMatch(mdDetail, /\*\*/, "加粗符號要去掉");
assert.doesNotMatch(mdDetail, /`/, "反引號要去掉");
assert.doesNotMatch(mdDetail, /\]\(/, "連結語法要去掉");
assert.doesNotMatch(mdDetail, /(?:^|\s)>\s/, "引用符號要去掉");
assert.doesNotMatch(mdDetail, /(?:^|\s)-\s\u2705/, "列表符號要去掉");
assert.match(mdDetail, /背景/);
assert.match(mdDetail, /降級邏輯已實現/);
assert.match(mdDetail, /resolveEmbeddingApiKey/, "去符號但不丟內容");
assert.match(mdDetail, /參考文件/);

// 不該在幾十字處就砍斷；真的超長時要有明確省略號，而不是斷在半個詞上
const longBody = "這是一段足夠長的專案結論說明。".repeat(100);
const longNode = buildSessionGraph({
  timeline: [{ eventType: "memory", occurredAt: 9, title: "新增記憶[decision]：超長結論" }],
  todos: [],
  memories: [{ type: "decision", status: "active", title: "超長結論", content: longBody, createdAt: 9, updatedAt: 9 }],
});
const longDetail = longNode.nodes[0].detail || "";
assert.ok(longDetail.length > 280, "正文上限要放寬，實際=" + longDetail.length);
assert.ok(longDetail.length <= 1000);
assert.ok(longDetail.endsWith("…"), "截斷必須顯式給省略號");

const shortNode = buildSessionGraph({
  timeline: [{ eventType: "memory", occurredAt: 10, title: "新增記憶[decision]：短結論" }],
  todos: [],
  memories: [{ type: "decision", status: "active", title: "短結論", content: "一句話就說完了。", createdAt: 10, updatedAt: 10 }],
});
assert.equal(shortNode.nodes[0].detail, "一句話就說完了。");

// init/rescan 的 detail 裡 files= 後面是**檔案數量**，不是檔案列表。
// 舊的 parseFiles 會把 "1975" 當成一個檔名，節點因此變成「程式碼有變更（無摘要）」並掛一個假檔案。
const initEvt = buildSessionGraph({
  timeline: [{
    eventType: "init",
    occurredAt: 1,
    title: "完成 project_init 掃描",
    detail: "languages=javascript/typescript files=1975 architectureMode=full modules=12 edges=18 architecture=hybrid",
  }],
  todos: [],
  memories: [],
});
assert.equal(initEvt.nodes.length, 1);
assert.deepEqual(initEvt.nodes[0].files, [], "檔案計數不是檔名");
assert.notEqual(initEvt.nodes[0].label, "程式碼有變更（無摘要）");
assert.match(initEvt.nodes[0].label, /初始化/);

// 真正的檔案列表仍然要解析出來
const realFiles = buildSessionGraph({
  timeline: [{ eventType: "session_summary", sessionId: "sf", occurredAt: 2, summary: "Did a thing.", detail: "sessionId=sf changedFiles=2 files=src/a.js,docs/b.md" }],
  todos: [],
  memories: [],
});
assert.deepEqual(realFiles.nodes[0].files, ["src/a.js", "docs/b.md"]);

console.log("smoke-session-graph: PASS");
