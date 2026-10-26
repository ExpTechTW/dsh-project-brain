// smoke-suggest.mjs - v0.4.15 智慧續接
//
// 覆蓋：
//   1) buildLocalSuggestion 純規則路徑（in_progress / pending / blocked / 記憶 / 空）
//   2) parseSuggestJson 容錯（圍欄 / 尾逗號 / 非 JSON）
//   3) normalizeSuggestion 欄位裁剪
//   4) buildSuggestPromptForLlm evidence 收集（含 architecture）
//   5) buildSuggestTool 完整路徑：mock fs + mock llm

import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const RESULTS = [];
let _pass = 0, _fail = 0;
function pass(name) { _pass++; RESULTS.push({ ok: true, name }); }
function fail(name, msg) { _fail++; RESULTS.push({ ok: false, name, msg }); console.error("FAIL:", name, "-", msg); }
function assert(cond, name, msg) { cond ? pass(name) : fail(name, msg || "assertion failed"); }

// ── 1) 純規則 fallback ──
const { buildLocalSuggestion, parseSuggestJson, normalizeSuggestion, buildSuggestPromptForLlm, buildEvidence } = await import("../src/host/suggest.js");

const now = Date.now();

// 場景 A：有 in_progress TODO
{
  const brain = {
    project: { name: "demo", techStack: { backend: "FastAPI" } },
    memories: [],
    todos: [{ id: "t1", title: "完成 OAuth 接入", status: "in_progress", priority: "high" }],
    timeline: [],
  };
  const out = buildLocalSuggestion(brain, now);
  assert(out.ok, "scenario A: ok");
  assert(out.data.suggestion.title.includes("OAuth"), `in_progress 命中 (got ${out.data.suggestion.title})`);
  assert(out.data.suggestion.fallback === true, "fallback flag set");
  assert(out.data.source === "local", "source=local");
  assert(out.data.suggestion.confidence >= 0.7, "high confidence for in_progress");
}

// 場景 B：只有 pending TODO
{
  const brain = {
    project: { name: "demo" },
    memories: [],
    todos: [
      { id: "p1", title: "修小 bug", status: "pending", priority: "low" },
      { id: "p2", title: "補文件", status: "pending", priority: "urgent" },
    ],
    timeline: [],
  };
  const out = buildLocalSuggestion(brain, now);
  assert(out.data.suggestion.suggestedTodoId === "p2", `urgent 優先 (got ${out.data.suggestion.suggestedTodoId})`);
}

// 場景 C：只有 blocked
{
  const brain = {
    project: { name: "demo" },
    memories: [],
    todos: [{ id: "b1", title: "等 review", status: "blocked", priority: "high" }],
    timeline: [],
  };
  const out = buildLocalSuggestion(brain, now);
  assert(out.data.suggestion.title.includes("阻塞"), `blocked 路徑 (got ${out.data.suggestion.title})`);
}

// 場景 D：只有記憶
{
  const brain = {
    project: { name: "demo" },
    memories: [{ id: "m1", type: "decision", title: "使用 SQLite", importance: 0.9, createdAt: now - 8640 * 1000 }],
    todos: [],
    timeline: [],
  };
  const out = buildLocalSuggestion(brain, now);
  assert(out.data.suggestion.title.includes("SQLite") || out.data.suggestion.title.includes("回顧") || out.data.suggestion.title.includes("記憶"), `記憶路徑 (got ${out.data.suggestion.title})`);
}

// 場景 E：完全空
{
  const brain = { project: { name: "demo" }, memories: [], todos: [], timeline: [] };
  const out = buildLocalSuggestion(brain, now);
  assert(out.data.suggestion.confidence <= 0.3, "空資料 → 低置信度");
  assert(out.data.suggestion.title.includes("規劃") || out.data.suggestion.title.includes("初始化"), `空資料 title (got ${out.data.suggestion.title})`);
}

// 場景 F：relatedFiles 關聯的 TODO + 記憶
{
  const brain = {
    project: { name: "demo" },
    memories: [{ id: "m1", type: "lesson", title: "CORS 配置坑", importance: 0.8, createdAt: now - 8640 * 1000, relatedFiles: ["src/api/users.ts"] }],
    todos: [{ id: "p1", title: "修跨域", status: "pending", priority: "high", relatedFiles: ["src/api/users.ts"] }],
    timeline: [],
  };
  const out = buildLocalSuggestion(brain, now);
  assert(out.data.suggestion.suggestedMemoryIds.includes("m1"), `relatedFiles 關聯記憶被選出 (got ${out.data.suggestion.suggestedMemoryIds.join(",")})`);
}

// ── 2) parseSuggestJson 容錯 ──
assert(parseSuggestJson('{"title":"a","reason":"b"}') !== null, "parse plain JSON");
assert(parseSuggestJson('```json\n{"title":"a","reason":"b"}\n```') !== null, "parse code-fence JSON");
assert(parseSuggestJson('noise {"title":"a","reason":"b"} noise') !== null, "parse balanced sub-object");
assert(parseSuggestJson('{"title":"a","reason":"b",}') !== null, "parse trailing comma");
assert(parseSuggestJson('not json') === null, "reject non-JSON");

// ── 3) normalizeSuggestion 欄位裁剪 ──
{
  const normalized = normalizeSuggestion({ title: "abc", reason: "def", confidence: 0.9, suggestedTodoId: "t1", suggestedMemoryIds: ["m1", "m2"] });
  assert(normalized && normalized.title === "abc", "title preserved");
  assert(normalized && normalized.fallback === false, "fallback false");
  assert(normalized && normalized.suggestedMemoryIds.length === 2, "memory ids preserved");
}
{
  // 缺 title → null
  assert(normalizeSuggestion({ reason: "x" }) === null, "missing title → null");
  // confidence clamp
  const n = normalizeSuggestion({ title: "a", reason: "b", confidence: 1.5 });
  assert(n && n.confidence === 1, "confidence clamped to 1");
  // 空 title → null
  assert(normalizeSuggestion({ title: "", reason: "x" }) === null, "empty title → null");
}

// ── 4) buildSuggestPromptForLlm evidence ──
{
  const brain = {
    project: { name: "demo", techStack: { backend: "FastAPI" } },
    memories: [
      { id: "m1", type: "decision", title: "用 SQLite", importance: 0.9, createdAt: now - 1000 },
      { id: "m2", type: "architecture", title: "分層設計", importance: 0.7, createdAt: now - 2000 },
    ],
    todos: [{ id: "t1", title: "做 X", status: "in_progress", priority: "high" }],
    timeline: [{ id: "e1", title: "上次 session 完成", eventType: "session_summary", occurredAt: now - 86400_000 }],
    architecture: { summary: "整體架構概覽文本" },
  };
  const { prompt, evidence } = buildSuggestPromptForLlm(brain, now);
  assert(prompt.includes("demo"), "prompt includes project name");
  assert(prompt.includes("FastAPI"), "prompt includes techStack");
  assert(prompt.includes("做 X"), "prompt includes in_progress todo");
  assert(prompt.includes("用 SQLite"), "prompt includes memory");
  assert(prompt.includes("整體架構"), "prompt includes architecture summary");
  assert(evidence.activeTodos.inProgress.length === 1, "evidence has in_progress");
  assert(evidence.daysSinceLastSession === 1, "evidence computes daysSinceLastSession");
}

// ── 5) buildSuggestTool 端到端：mock fs + mock llm ──
{
  const FIXTURE = join(process.cwd(), "fixtures-suggest");
  const brainDir = join(FIXTURE, ".project-brain");
  if (existsSync(brainDir)) rmSync(brainDir, { recursive: true, force: true });
  mkdirSync(brainDir, { recursive: true });
  writeFileSync(join(brainDir, "project.json"), JSON.stringify({ name: "demo", techStack: { backend: "FastAPI" }, description: "測試專案" }));
  writeFileSync(join(brainDir, "todo.jsonl"), JSON.stringify({ id: "t1", title: "OAuth", status: "in_progress", priority: "high", createdAt: now }) + "\n");
  writeFileSync(join(brainDir, "memory.jsonl"), "");
  writeFileSync(join(brainDir, "timeline.jsonl"), "");

  // mock fs（node 直讀）
  const fs = {
    resolve: async (p) => ({ path: p }),
    readText: async (target) => {
      const path = typeof target === "string" ? target : target.path;
      try {
        const { readFileSync } = await import("node:fs");
        return readFileSync(path, "utf8");
      } catch { return null; }
    },
    listDir: async () => [],
  };

  // 5a) useLLM=false → 強制本地
  const { buildSuggestTool } = await import("../src/tools/suggest.js");
  const tool = buildSuggestTool({ fs, sandboxPolicy: {}, getLlm: () => null });
  const localResult = await tool.execute({ path: FIXTURE, useLLM: false }, { session: { cwd: FIXTURE } });
  assert(localResult.ok, "tool local: ok");
  assert(localResult.data.source === "local", `local source (got ${localResult.data.source})`);
  assert(localResult.data.suggestion.title.includes("OAuth"), `local suggestion hits in_progress todo (got ${localResult.data.suggestion.title})`);

  // 5b) LLM 成功（mock 返回嚴格 JSON）
  const fakeLlm = {
    stream: async function* () {
      yield { type: "text-delta", index: 0, text: '{"title":"推進 OAuth 整合","reason":"進行中的 OAuth 任務與上次 session 的設計決策一致","confidence":0.88,"suggestedTodoId":"t1","suggestedMemoryIds":[]}' };
      yield { type: "finish", reason: { kind: "stop" } };
    },
  };
  // resolveSessionRoute 從 session.events 找 request/context 或 request/header 事件
  const routeEvent = { type: "request/context", data: { provider: "test", model: "test-1" } };
  const tool2 = buildSuggestTool({ fs, sandboxPolicy: {}, getLlm: () => fakeLlm });
  const llmResult = await tool2.execute({ path: FIXTURE }, { session: { cwd: FIXTURE, events: [routeEvent] } });
  assert(llmResult.ok, "tool LLM: ok");
  assert(llmResult.data.source === "llm", `LLM source (got ${llmResult.data.source})`);
  assert(llmResult.data.suggestion.title === "推進 OAuth 整合", `LLM suggestion title (got ${llmResult.data.suggestion.title})`);
  assert(llmResult.data.suggestion.confidence >= 0.8, "LLM confidence >0.8");

  // 5c) LLM 失敗 → 自動降級到本地
  const fakeLlmFail = {
    stream: async function* () {
      throw new Error("simulated LLM failure");
    },
  };
  const tool3 = buildSuggestTool({ fs, sandboxPolicy: {}, getLlm: () => fakeLlmFail });
  const fallbackResult = await tool3.execute({ path: FIXTURE }, { session: { cwd: FIXTURE, events: [routeEvent] } });
  assert(fallbackResult.ok, "tool fallback: ok");
  assert(fallbackResult.data.source === "llm_failed", `fallback source (got ${fallbackResult.data.source})`);
  assert(fallbackResult.data.llmError && fallbackResult.data.llmError.message, "fallback includes llmError");
  assert(fallbackResult.data.suggestion.title.includes("OAuth"), "fallback still returns useful suggestion");

  // 5d) LLM 無可用 route → source=local_no_route
  const tool4 = buildSuggestTool({ fs, sandboxPolicy: {}, getLlm: () => fakeLlm });
  const noRouteResult = await tool4.execute({ path: FIXTURE }, { session: { cwd: FIXTURE } });
  assert(noRouteResult.ok && noRouteResult.data.source === "local_no_route", `no_route source (got ${noRouteResult.data.source})`);

  // 5e) 專案未初始化
  rmSync(brainDir, { recursive: true, force: true });
  mkdirSync(brainDir, { recursive: true });
  const uninitResult = await tool.execute({ path: FIXTURE, useLLM: false }, { session: { cwd: FIXTURE } });
  assert(!uninitResult.ok, "未初始化 → fail");
  assert(uninitResult.data.error.code === "E_NOT_INITIALIZED", `uninit code (got ${uninitResult.data.error.code})`);

  // cleanup
  rmSync(brainDir, { recursive: true, force: true });
}

// ── 6) buildEvidence 邊界 ──
{
  const ev = buildEvidence({ project: { name: "x" }, memories: [], todos: [], timeline: [] }, now);
  assert(ev.activeTodos.inProgress.length === 0 && ev.activeTodos.pending.length === 0, "empty todos");
  assert(ev.daysSinceLastSession === null, "no session event → null days");
}
{
  const ev = buildEvidence({ project: null, memories: [], todos: [], timeline: [] }, now);
  assert(ev.project === null, "null project tolerated");
}

// ── 輸出 ──
console.log(`\n[smoke-suggest] ${_pass}/${_pass + _fail} PASS`);
for (const r of RESULTS) if (!r.ok) console.error(`  FAIL: ${r.name} - ${r.msg}`);
if (_fail > 0) process.exit(1);