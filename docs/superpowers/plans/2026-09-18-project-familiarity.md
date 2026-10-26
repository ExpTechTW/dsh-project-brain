# Project Familiarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 人第一屏與 Agent 注入共用四句 briefing；關會話輕掃/稀架構重新整理並標記過期；任務動態升級為 Session 主幹圖（時間邊 + 硬證據邊）。

**Architecture:** 新增兩個無 I/O 純函式 `buildProjectBriefing`、`buildSessionGraph`。Injector / continue / aggregator 只消費它們。`scanAndWrite` 增加 `architectureMode`。`architectureRelevantFiles` 拆成輕掃與架構觸發。不新增 json 庫、不呼叫 LLM 畫邊。

**Tech Stack:** 現有 Node ESM、jsonl、`scripts/smoke-*.mjs`、`npm test` / `npm run test:acceptance`。

**Spec:** `docs/superpowers/specs/2026-09-18-project-familiarity-design.md`  
**Flow:** `docs/superpowers/specs/2026-09-18-project-familiarity-flow.md`

## Global Constraints

- Durable Core 不推翻：`admitMemory` 單寫者，Core 15 / 800，無 Jaccard 刪除。
- briefing 與 injection 四段必須同源；continue.injection === injector markdown。
- `architectureMode: "light"` 不得覆蓋 `architecture.json`。
- README / CHANGELOG / lockfile / 純測試 不得單獨觸發 full 架構。
- 圖純函式禁止 LLM。
- 未初始化專案不寫假節點。
- 使用者未要求時不要 git commit。

---

### Task 1: Briefing 純函式 + 注入改接

**Files:**
- Create: `src/host/memory/briefing.js`
- Modify: `src/host/memory/inject-context.js`
- Modify: `src/tools/continue.js`（若它只調 `buildInjectionContext` 則可能零改）
- Test: `scripts/smoke-project-briefing.mjs`（新建）並加入 `scripts/run-smoke.mjs`

**Interfaces:**

```js
export function buildProjectBriefing(brain, now = Date.now())
// returns { stale, purpose, startHere, stuck, lastWhy, lastWhySource, markdown }

export function isArchitectureStale(brain, now) // used by briefing; fingerprint fields optional in v1
export function buildInjectionContext(brain) // must start with briefing.markdown then Core
```

- [ ] **Step 1: 寫失敗測試** `scripts/smoke-project-briefing.mjs`

覆蓋 PF-1、PF-2、PF-3、PF-9、PF-10：

```js
import { buildProjectBriefing } from "../src/host/memory/briefing.js";
import { buildInjectionContext } from "../src/host/memory/inject-context.js";

const brain = {
  project: { name: "demo", description: "A plugin", techStack: { backend: "Express" }, entrypoints: ["src/index.js"] },
  architecture: { overview: { purpose: "Persistent project brain" }, keyFiles: [{ path: "src/host/injector.js" }] },
  todos: [{ id: "t1", title: "Fix inject", status: "in_progress", priority: "high" }],
  timeline: [{ eventType: "session_summary", summary: "Locked briefing to match the sidebar.", occurredAt: 2 }],
  memories: [{ id: "m1", type: "decision", status: "active", title: "Session cwd wins", content: "Always resolve path from session cwd.", importance: 0.9, createdAt: 1, updatedAt: 1 }],
};

const b = buildProjectBriefing(brain);
assert(b.markdown.includes("從哪改"));
assert(b.startHere.includes("src/index.js"));
assert(b.stuck[0].id === "t1");
assert(b.lastWhySource === "session_summary");
const inj = buildInjectionContext(brain);
assert(inj.includes(b.markdown));
assert(inj.includes("Session cwd wins"));

const changelogBrain = { ...brain, timeline: [{ eventType: "session_summary", summary: "改了 8 個檔案", occurredAt: 2 }] };
const b2 = buildProjectBriefing(changelogBrain);
assert(b2.lastWhySource !== "session_summary" || !/改了\s*\d+\s*個檔案/.test(b2.lastWhy));

const staleBrain = { ...brain, architectureStale: true };
const b3 = buildProjectBriefing(staleBrain);
assert(b3.stale === true);
assert(!b3.startHere.includes("src/host/injector.js"));
```

changelog 否決複用 `isChangelogGenre`（從 `admit.js` import），不要複製一份正則。

- [ ] **Step 2: 跑測試確認失敗**

Run: `node scripts/smoke-project-briefing.mjs`  
Expected: `ERR_MODULE_NOT_FOUND` 或斷言失敗（`buildProjectBriefing` 不存在）。

- [ ] **Step 3: 實現 `briefing.js` 並改 `buildInjectionContext`**

`markdown` 固定中文小標題（注入給當前中文為主的 Agent；UI 第一屏用 i18n，但 **欄位** 仍是同一 `startHere`/`stuck`/`lastWhy`）：

```text
### 這是什麼
### 從哪改
### 現在卡在哪
### 最近為什麼
```

過期時「從哪改」只輸出 entrypoints，並加一行 `架構可能過期，關鍵檔案按掃描入口降級。`

Core 段保持現有列表格式。刪掉注入裡重複的「活躍 TODO」大段（TODO 只在 stuck）。「上次會話」blockquote 合併進「最近為什麼」，不要兩段各寫一次 summary。

`architectureStale` v1：若 `brain.architectureStale === true` 或 `brain.architecture.stale === true` 或 `brain.project.architectureStale === true` 則 stale。指紋欄位可在 Task 3 寫入 project.json 後再接到 `isArchitectureStale`。

- [ ] **Step 4: 跑測試確認通過**

Run: `node scripts/smoke-project-briefing.mjs`  
Expected: 程序 exit 0，列印 `PASS`。

- [ ] **Step 5: 把指令碼加入 `scripts/run-smoke.mjs` 列表並跑 `npm test` 確認無迴歸**

---

### Task 2: Session 圖純函式

**Files:**
- Create: `src/host/memory/session-graph.js`
- Test: `scripts/smoke-session-graph.mjs`（新建）並加入 `scripts/run-smoke.mjs`

**Interfaces:**

```js
export function buildSessionGraph(brain)
// {
//   nodes: [{ id, sessionId, occurredAt, label, files, filesMore, important, trunk: true }],
//   edges: [{ from, to, kind: "time" | "evidence", reason: "todo"|"supersede"|"architecture" }],
//   collapsedEmptyCount: number,
//   hiddenCount: number // 抽稀藏起的 trunk 節點
// }
```

- [ ] **Step 1: 寫失敗測試**

```js
import { buildSessionGraph } from "../src/host/memory/session-graph.js";

// PF-6: empty summary, no files, no todo → collapsed
const empty = buildSessionGraph({
  timeline: [{ eventType: "session_summary", sessionId: "s0", summary: "  ", occurredAt: 1 }],
  todos: [], memories: [],
});
assert(empty.nodes.length === 0);
assert(empty.collapsedEmptyCount >= 1);

// PF-7: talk-only with summary
const talk = buildSessionGraph({
  timeline: [{ eventType: "session_summary", sessionId: "s1", summary: "We chose RPC over embed.", occurredAt: 2, files: [] }],
  todos: [], memories: [],
});
assert(talk.nodes.length === 1);
assert(/RPC/.test(talk.nodes[0].label));
assert(talk.edges.length === 0);

// time edges + evidence todo
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
assert(g.nodes.length === 2);
assert(g.edges.some((e) => e.kind === "time"));
assert(g.edges.some((e) => e.kind === "evidence" && e.reason === "todo"));

// PF-8: no hallucinated edges
const chain = buildSessionGraph({
  timeline: [
    { eventType: "session_summary", sessionId: "a", summary: "One.", occurredAt: 1 },
    { eventType: "session_summary", sessionId: "b", summary: "Two.", occurredAt: 2 },
  ],
  todos: [], memories: [],
});
assert(chain.edges.every((e) => e.kind === "time"));
assert(chain.edges.length === 1);

// changelog summary not used as label
const cl = buildSessionGraph({
  timeline: [{ eventType: "session_summary", sessionId: "c", summary: "改了 8 個檔案", occurredAt: 1, files: ["src/x.js"] }],
  todos: [], memories: [],
});
assert(cl.nodes[0].label === "程式碼有變更（無摘要）");
```

現有 `todo` timeline 可能沒有 `todoId`。圖實現應對：`detail` 解析 `id=` 或條目上的 `todoId`；都沒有則 **不畫** todo 證據邊（只 time）。測試裡用顯式 `todoId`。

- [ ] **Step 2: 跑測試確認失敗**

Run: `node scripts/smoke-session-graph.mjs`  
Expected: 模組不存在。

- [ ] **Step 3: 實現 `session-graph.js`**

抽稀：`nodes.length > 40` 時 `important` = 有 evidence 邊端點、或 files、或 label 來自 summary。非 important 計入 `hiddenCount`，預設 `nodes` 仍返回全部並帶 `hidden: true`，方便 UI 摺疊。

- [ ] **Step 4: 測試通過並 `npm test`**

---

### Task 3: 兩檔重新整理 + 觸發檔案拆分 + summary 結構化

**Files:**
- Modify: `src/host/architecture/analyzer.js`（拆 `sourceChangeFiles` / `architectureTriggerFiles`；保留 `architectureRelevantFiles` 作為 deprecated wrapper = trigger，避免漏改呼叫方）
- Modify: `src/host/scan-and-write.js`（`runtime.architectureMode`: `"full"` 預設 | `"light"` | `"none"`）
- Modify: `src/host/summarizer.js`
- Modify: `src/host/memory/session-extractor.js`（prompt：summary 1–3 句 what+why，禁止改了 N 個檔案）
- Test: `scripts/smoke-architecture-triggers.mjs`（新建）+ 擴充套件 `scripts/smoke-session-lifecycle.mjs` 或 durable-core 若已斷言 refresh

**Interfaces:**

```js
export function sourceChangeFiles(files) // boolean, spec §6.1
export function architectureTriggerFiles(files) // boolean, spec §6.1
export async function scanAndWrite(fs, sandboxPolicy, args, toolLabel, runtime)
// runtime.architectureMode === "light" → 寫 project.json，不呼叫 buildArchitecture，不寫 architecture.json
```

- [ ] **Step 1: 失敗測試 PF-4 PF-5**

```js
import { sourceChangeFiles, architectureTriggerFiles } from "../src/host/architecture/analyzer.js";

assert(sourceChangeFiles(["src/index.js"]) === true);
assert(architectureTriggerFiles(["README.md"]) === false);
assert(architectureTriggerFiles(["package-lock.json"]) === false);
assert(architectureTriggerFiles(["src/foo.test.js"]) === false);
assert(architectureTriggerFiles(["package.json"]) === true);
assert(architectureTriggerFiles(["src/host/injector.js"]) === true);
```

再測 `scanAndWrite` light：用現有 smoke 的 memfs/fixture，斷言呼叫前後 `architecture.json` mtime/內容不變，`project.json` 更新。若 fixture 過重，測 `architectureMode` 分支：light 時 spy/flag `buildArchitecture` 未被呼叫（把 analyzer 呼叫包在 `if (mode !== "light")`）。

- [ ] **Step 2: 跑測試確認失敗**（README 當前會令 `architectureRelevantFiles` 為 true）

- [ ] **Step 3: 實現拆分與 summarizer 順序**

`summarizeOne` timeline 條目增加 `files: changedFiles.slice(0, 20)`。`summary` 經 `isChangelogGenre(title, summary)` 則清空。

重新整理：

```js
if (sourceChangeFiles(r.files)) {
  await scanAndWrite(fs, sandboxPolicy, { path: projectPath }, "auto_light_refresh", { ...runtime, architectureMode: "light" });
}
if (architectureTriggerFiles(r.files)) {
  await scanAndWrite(fs, sandboxPolicy, { path: projectPath }, "auto_architecture_refresh", { ...runtime, architectureMode: "full" });
}
```

`project_init` / `project_rescan` / 手動 RPC 保持預設 `full`。

light 失敗、full 失敗：不 throw。full 失敗時 `project.json.architectureStale = true`（能寫則寫）。full 成功則 `architectureStale = false`。

- [ ] **Step 4: 測試通過；`isArchitectureStale` 讀 `project.architectureStale`**

- [ ] **Step 5: `npm test`**

---

### Task 4: Aggregator + Client 第一屏 + 任務動態圖

**Files:**
- Modify: `src/host/sidebar/aggregator.js`（preview 增加 `briefing`、`sessionGraph`）
- Modify: `src/client.js`（概覽主視野四句；任務動態 Tab 渲染節點+邊；i18n zh/en）
- Test: 擴充套件 `scripts/smoke-todostrip.mjs` 或新建 `scripts/smoke-familiarity-client.mjs` 對 **原始碼字串** 斷言（與現有 todostrip 一樣掃 `src/client.js` / 構建產物）

**Interfaces:** preview JSON 增加：

```js
briefing: buildProjectBriefing(...)
sessionGraph: buildSessionGraph(...)
```

- [ ] **Step 1: 失敗測試**

Client 原始碼須含 `data-block="briefing"`、`data-block="session-graph"`、`data-graph-kind`。Aggregator 單元：對記憶體 brain 調 `buildSidebarPreview` 或抽出的 `buildRuntimePreview`（若 preview 組裝在 aggregator 後半段 `buildPreviewFromParts`，優先抽 20 行純函式避免 fs）。

若 `buildSidebarPreview` 強依賴磁碟，則測 `buildRuntimePreview(p, architecture, timeline, memories, todos)` —— **本任務允許**從 aggregator 抽出該函式，避免新 fs fixture。

- [ ] **Step 2: 跑測試確認失敗**

- [ ] **Step 3: UI**

概覽：四句用 `briefing` 欄位，不要再拼一套。stale 時 Callout 文案「架構可能過期」。  
任務動態：按 `occurredAt` 豎向時間鏈畫 trunk 節點；`evidence` 邊用短標註（TODO / 替代 / 架構）。`collapsedEmptyCount > 0` 顯示「已摺疊 N 次空會話」。點節點展開 `label` 全文 + files。Git Tab 不動。

不要把 40+ 節點預設全展開：`hidden === true` 預設不畫，提供「展開全部」。

- [ ] **Step 4: 測試通過 + `npm run build` + `npm test` + `npm run test:acceptance`**

驗收 AC：host-acceptance 若斷言 injection 含「活躍 TODO」標題，改為斷言含「現在卡在哪」或 briefing 小標題。改測試以符合 spec，不要為遷就舊文案破壞 PF-1。

---

## Spec coverage

| Spec | Task |
| --- | --- |
| §4 第一屏四句 | 1, 4 |
| §5 共用 briefing / 不重複 TODO | 1 |
| §6 過期與兩檔重新整理 | 3 |
| §7 summary 合同 | 3 |
| §8 圖 | 2, 4 |
| PF-1..10 | 見各 task 測試 |

## Placeholder scan

無 TBD。手動里程碑明確不做。`todoId` 缺失則不強行畫證據邊。
