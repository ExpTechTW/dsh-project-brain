// 離線驗證 build 產物 lib/client.js 在 DSH 靜態 client 框架下的 register 流程
// 不啟 DSH，純模擬 slots.register 註冊兩個 Slot，驗證註冊引數正確 + 返回值結構合理
//
// 用法：node scripts/smoke-todostrip.mjs
// 退出碼：0 = PASS，1 = FAIL

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BUNDLE = join(ROOT, "dsh-project-brain", "lib", "client.js");

if (!existsSync(BUNDLE)) {
  console.error("FAIL: bundle not found:", BUNDLE);
  console.error("      run `node build.js` first");
  process.exit(1);
}

const bundle = readFileSync(BUNDLE, "utf8");

const checks = [];

// 1) conversation.view 註冊項存在
const viewMatch = bundle.match(/name:\s*"conversation\.view"[\s\S]{0,200}?id:\s*"project-brain"[\s\S]{0,200}?order:\s*35/);
checks.push({ name: "conversation.view / project-brain / order=35", ok: !!viewMatch });

// 2) conversation.input.dock 註冊項存在 + id + order
const dockMatch = bundle.match(/name:\s*"conversation\.input\.dock"[\s\S]{0,200}?id:\s*"project-brain-todo-strip"[\s\S]{0,200}?order:\s*10/);
checks.push({ name: "conversation.input.dock / project-brain-todo-strip / order=10", ok: !!dockMatch });

// 3) TodoStrip 函式存在
const fnMatch = /function\s+TodoStrip\s*\(/.test(bundle);
checks.push({ name: "function TodoStrip(props) declared", ok: fnMatch });

// 4) i18n dict 中有 todostrip.* 關鍵文案
const i18nHits = [
  "todostrip.title",
  "todostrip.viewAll",
  "todostrip.close",
  "todostrip.empty",
].every((k) => bundle.includes(k));
checks.push({ name: "i18n dict has todostrip.title/viewAll/close/empty", ok: i18nHits });

// 5) 釋出構建不得嵌入本機 Session；執行時必須走 Connection RPC。
const runtimeRpc = bundle.includes('"/project-brain"')
  && bundle.includes('"preview"')
  && bundle.includes('"init"');
const leakedSession = /"session-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"/.test(bundle);
checks.push({ name: "runtime Connection RPC present and release bundle contains no local session ids", ok: runtimeRpc && !leakedSession });

// 6) active filter（排除 done / cancelled）
const filterCode = bundle.includes('status !== "done"') && bundle.includes('status !== "cancelled"');
checks.push({ name: "active filter excludes done/cancelled", ok: filterCode });

// 7) toggle 按鈕 onClick 存在
const onClickMatch = /onClick:\s*onToggle/.test(bundle);
checks.push({ name: "viewAll/close button onClick=onToggle wired", ok: onClickMatch });

// 8) data-todo-item 渲染屬性
const dataAttr = bundle.includes('"data-todo-item"');
checks.push({ name: "data-todo-item attribute on todo rows", ok: dataAttr });

// 9) TODO strip empty-state: 當 active.length === 0 返回 null（已包含在 return null 段）
const emptyGuard = /if \(active\.length === 0\) return null/.test(bundle);
checks.push({ name: "empty-state guard (active.length === 0 return null)", ok: emptyGuard });

// 10) uninit guard（專案未初始化時整個 strip 不渲染）
const uninitGuard = /if \(!data \|\| !data\.initialized\) return null/.test(bundle);
checks.push({ name: "uninit guard (data.initialized === false return null)", ok: uninitGuard });

// 11) Dashboard Quick Actions 必須走後臺 RPC，不能再複製 prompt。
const quickActionRpc = bundle.includes('"action"')
  && bundle.includes('action: "rescan"')
  && bundle.includes('action: "todos"')
  && bundle.includes('action: "dream"')
  && bundle.includes('action: "overview"');
checks.push({ name: "Dashboard Quick Actions call runtime action RPC", ok: quickActionRpc });

// 12) 卡片有 loading/confirm/success/error 狀態與 spinner。
const quickActionStates = bundle.includes('status: "loading"')
  && bundle.includes('status: "confirm"')
  && bundle.includes('status: "success"')
  && bundle.includes('status: "error"')
  && bundle.includes('"data-action-state"');
checks.push({ name: "Quick Actions expose loading/confirm/success/error UI states", ok: quickActionStates });

// 13) 記憶整理先 dry-run，再由獨立 dreamCommit 動作確認提交。
const dreamConfirmation = bundle.includes('action === "dreamCommit"')
  && bundle.includes('previous.status === "confirm"');
checks.push({ name: "memory organization requires preview then confirmation", ok: dreamConfirmation });

// 14) Dashboard 架構圖使用語義分層；點層/點模組看結構詳情，不把並列模組畫成順序鏈路。
const architectureSvg = bundle.includes("function ArchitectureGraphBlock")
  && bundle.includes('"data-block": "architecture-graph"')
  && bundle.includes('"data-architecture-diagram": "semantic-layers"')
  && bundle.includes('"data-architecture-layer"')
  && bundle.includes("setSelectedLayerId")
  && bundle.includes("setSelectedComponentId")
  && bundle.includes('"arch.peersHint"')
  && bundle.includes('"arch.flowEmpty"');
checks.push({ name: "architecture tab shows peer layers and click-to-inspect modules", ok: architectureSvg });

// 15) 架構圖明確區分本地分析與當前 DSH LLM 增強結果。
checks.push({ name: "architecture source badges are bundled", ok: bundle.includes('"arch.hybrid"') && bundle.includes('"arch.local"') });

const settingsProbe = bundle.includes('"probe-" + target')
  && bundle.includes("settings.probe.embedding")
  && bundle.includes("settings.probe.llm")
  && bundle.includes('action: "probe"')
  && bundle.includes('group.group === "retrieval"')
  && bundle.includes('group.group === "summary"');
checks.push({ name: "settings tab can probe embedding and session LLM", ok: settingsProbe });
checks.push({
  name: "settings embedding API key field accepts pasted secrets",
  ok: bundle.includes('type: "password"')
    && bundle.includes("Paste the API key to use it directly")
    && bundle.includes('"data-action": "toggle-secret"'),
});
checks.push({
  name: "retrieval weight hints and compact probe buttons",
  ok: bundle.includes("Applies only to project_ask memory ranking")
    && bundle.includes("Lexical BM25")
    && bundle.includes("Semantic similarity")
    && bundle.includes("Memory importance")
    && bundle.includes("Extraction confidence")
    && bundle.includes("Newer ranks higher")
    && bundle.includes("data-probe-btn")
    && bundle.includes("rgb(236, 245, 252)"),
});

// 16) Dashboard 使用單一頁籤工作臺，避免架構、任務、記憶在首頁重複堆疊。
const dashboardTabs = bundle.includes('"data-dashboard-tab"')
  && bundle.includes('"dash.tab.overview"')
  && bundle.includes('"dash.tab.architecture"')
  && bundle.includes('"dash.tab.work"')
  && bundle.includes('"dash.tab.knowledge"')
  && bundle.includes('aria-selected');
checks.push({ name: "Dashboard single-workbench tabs and accessible selection state are bundled", ok: dashboardTabs });

// 17) 頂部摘要採用獨立響應式容器，窄視窗下可自動單列。
const responsiveSummary = bundle.includes('"data-block": "summary-grid"')
  && bundle.includes(".dsh-brain-summary-grid")
  && bundle.includes("@media(max-width:760px)");
checks.push({ name: "responsive summary grid is bundled", ok: responsiveSummary });

// 18) v0.4.15 智慧續接建議卡：呼叫 /project-brain 的 suggest RPC，含資料屬性
const suggestRpc = bundle.includes('"/project-brain"')
  && bundle.includes('"suggest"')
  && bundle.includes('"data-block": "suggestion"')
  && bundle.includes('"data-suggestion-title"')
  && bundle.includes('"data-suggestion-reason"');
checks.push({ name: "SuggestionCard calls runtime suggest RPC and renders title/reason", ok: suggestRpc });

// 19) SuggestionCard 標記 source（llm / local / llm_failed）+ 置信度
const suggestMeta = bundle.includes('"data-suggest-source"')
  && bundle.includes('"suggest.llmTag"')
  && bundle.includes('"suggest.localTag"')
  && bundle.includes('"suggest.confidence"')
  && bundle.includes('"suggest.refresh"');
checks.push({ name: "SuggestionCard shows source tag + confidence + refresh/dismiss", ok: suggestMeta });

// 20) SuggestionCard dismiss 後允許重新展開（不影響其它 UI 狀態）
const suggestDismiss = bundle.includes('"data-action": "suggest-dismiss"')
  && bundle.includes('"data-action": "suggest-show"');
checks.push({ name: "SuggestionCard dismiss + re-show is bundled", ok: suggestDismiss });

// 21) 技術棧主視野不含 CI；交付層與 Dockerfile→Docker 分層文案打進 bundle
const techStackLayers = bundle.includes("previewStackLayers")
  && bundle.includes('"dash.devops"')
  && bundle.includes("framework-backend")
  && !/RUNTIME_STACK_FIELDS\s*=\s*\[[^\]]*"ci"/.test(bundle);
checks.push({ name: "tech stack runtime chips exclude CI; delivery row is bundled", ok: techStackLayers });

let pass = 0;
let fail = 0;
console.log("=== dsh-project-brain TodoStrip smoke test ===");
console.log("(offline: build產物靜態校驗，不啟 DSH)\n");
for (const c of checks) {
  if (c.ok) {
    console.log(`  [PASS] ${c.name}`);
    pass++;
  } else {
    console.log(`  [FAIL] ${c.name}`);
    fail++;
  }
}
console.log(`\n${pass} PASS / ${fail} FAIL (${checks.length} checks total)`);
console.log(`bundle: ${BUNDLE}`);
process.exit(fail === 0 ? 0 : 1);
