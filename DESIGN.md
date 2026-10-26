# dsh-project-brain 設計方案

**版本：** v0.6.x
**狀態：** Active
**對應需求文件：** `REQUIREMENTS.md` / **SPEC.md**

> 當前實現說明（優先於本文後續歷史章節）：Client/Host 已通過 DSH `connection.rpc` 即時通訊，Host 每次按 live Session header 解析 workspace；預設釋出構建不嵌入本機專案資料。初始化/重掃會生成語義版 `architecture.json`：本地收集 README、manifest、入口、符號/import 和關鍵原始碼摘要，再複用當前 Session 的 DSH LLM 抽象專案定位、架構風格、概念層、職責元件、關係、執行流程和關鍵檔案。目錄只作為證據。Dashboard 渲染互動式分層架構認知報告；Session 結束檢測到原始碼變化時自動重新整理，並從受限、清洗後的使用者/助手文本中抽取少量穩定語義記憶。下文 v0.3.x 內容保留為歷史記錄。

---

# 0. 寫在前面

本文件回答 4 個問題：

1. dsh-project-brain 在 DSH 生態中是什麼、不是什麼？
2. v0.3.8 實際架構是什麼？模組邊界在哪？
3. MVP 怎麼落地，經歷了哪些階段？
4. 哪些是關鍵設計決策與風險？

> 閱讀建議：先看 §1 定位與原則，再看 §3 實際架構、§4 資料通道、§7 關鍵決策。

---

# 1. 定位與邊界

## 1.1 它是什麼

* **DSH 的專案級長期記憶與認知系統**，專案繫結、跨 Session 持續演進
* 一個 **Cordis static 外掛**（host + client 雙面），通過 `cordis.patch.yml` 嵌入 DSH profile
* 一個 **Project Knowledge Graph**（簡化版）：程式碼 + 記憶 + 時間線 + 摘要的複合知識庫
* 一套 **Local-First** 的本地儲存系統，資料落在目標專案自己的 `.project-brain/` 目錄下

## 1.2 它不是什麼

* **不是**程式碼靜態分析 IDE（雖然內部用 tree-sitter）
* **不是**通用 RAG / 文件檢索系統（主路徑是專案結構化記憶；語義向量僅作為可選召回增強）
* **不是** Session 聊天記錄歸檔（summarizer 只儲存 Git 摘要和少量結構化長期事實，不儲存聊天原文）
* **不是**專案管理系統（Jira / Linear 替代品）

## 1.3 核心設計原則（不變）

| 原則 | 工程含義 |
| --- | --- |
| 只記長期有價值的內容 | Memory 必須有 `importance` 評分；Dream 週期做合併/淘汰 |
| 記錄 What 與 Why | Decision / Architecture / Lesson 型別強制要求 `reason` 欄位 |
| 知識屬於 Project 而非 Session | 所有資料落 `.project-brain/`，跨 Session、跨機器遷移都跟隨專案走 |
| 持續演進 | 靜態掃描 + 寫入即更新（build-time embed）+ Session 摘要 |
| 知識可追溯 | 每條 Memory 有 source / createdAt；Timeline 記錄每次操作 |

---

# 2. 與 DSH 的整合形態

## 2.1 整合形態

dsh-project-brain 作為 **Cordis static 外掛**（不是 dynamic），通過 DSH profile 的 `node_modules/dsh-project-brain/`（本地開發時可連結到外掛工作區）被 DSH 載入。

整合點：

| 整合點 | 提供方 | 接收方 / 註冊目標 |
| --- | --- | --- |
| Tool 工具（Host） | dsh-project-brain | `@deepseek-ai/dsh-tools` → DSH agent 可見 |
| Host Service 呼叫 | dsh-project-brain | 其它外掛可通過 `ctx.tools.execute` 呼叫 |
| Event 訂閱（Host） | dsh-project-brain | `agent/session-start`、`session/disposed`、`preview.changed`（自定） |
| Event 釋出（Host） | dsh-project-brain | `preview.changed` |
| Client Slot 註冊 | dsh-project-brain | `conversation.view`（SidebarPreview）+ `conversation.input.dock`（TODO strip） |
| Client Service（locale / slots / timer） | DSH | dsh-project-brain 的 client 部分使用 |

## 2.2 **不再**整合

* ❌ Client → Host RPC（`host.call`）—— 靜態 plugin fiber 下 `host` builtin 未注入（P0.4.6 確認）
* ❌ webServer route `/plugins/.../preview.json` —— P0.4.5 失敗 + P0.4.6 放棄 + v0.3.0-v0.3.3 多次重試失敗 + v0.3.4 完全回退
* ❌ Dynamic plugin（cordis_inspect_list 列舉可見）—— 當前是 static plugin

---

# 3. 實際架構（v0.3.8）

## 3.1 三層架構

```
┌─────────────────────────────────────────────────────────────┐
│  Client 層（DSH WebView / Electron renderer）                  │
│  ├── SidebarPreview（`conversation.view` order=35）           │
│  │   - 純函式元件 + build-time embed 資料                      │
│  │   - 8 區塊 + Dashboard 摺疊展開                              │
│  ├── TodoStrip（`conversation.input.dock` order=10）          │
│  │   - 10s 輪詢 live preview 資料                              │
│  │   - Top-5 active todos chip，點選複製提示詞                  │
│  └── locale / slots / theme client services                     │
└──────────────────────┬──────────────────────────────────────────┘
                       │ (無 host→client 資料通道)
┌──────────────────────┴──────────────────────────────────────────┐
│  Host 層（DSH Node.js / Electron main process）                │
│  ├── src/index.js                                              │
│  │   - 註冊 12 tools（harness.defineTool）                       │
│  │   - 訂閱 preview.changed → 觸發 setupAutoRebuild             │
│  │   - 呼叫 setupInjector → systemPrompt.service.section()    │
│  │   - 呼叫 setupSummarizer → 監聽 session/disposed             │
│  └── tools.js / scanner.js / tools/{memory,todo,continue,...}   │
└──────────────────────┬──────────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────────┐
│  引擎層（無狀態模組）                                          │
│  ├── scanner.js（FS + FsDirEntry.type + 遞迴 e.target）         │
│  ├── host/store/                                              │
│  │   ├── brain-files.js（jsonl 讀寫 + sandboxPolicy 解析）     │
│  │   ├── brain-logic.js（memory/todo 排序、活躍判斷）           │
│  │   └── path-resolver.js（session cwd 反推 + 跳過汙染）       │
│  ├── host/summarizer.js（git diff + DSH LLM → 去重長期記憶）     │
│  ├── host/injector.js（Top-K 記憶 → system prompt 注入）        │
│  └── host/rebuild.js（spawn build.js → clientModules.rebuilt）   │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                   .project-brain/
                   ├── project.json
                   ├── todo.jsonl
                   ├── memory.jsonl
                   ├── timeline.jsonl
                   ├── codegraph.json
                   └── build-time embed via build.js
```

## 3.2 資料通道（核心）

```
使用者調工具 → execute(args, exec)
            ↓
   resolveProjectPath(args, exec, sandboxPolicy)
            ↓
   優先順序：args.path → exec.session → workspaceRegistry → sandboxPolicy(非 DSH Desktop)
            ↓
   appendJsonl(fs, projectPath/brain.jsonl, entry, danger-full-access)
            ↓
   emitPreviewChanged(exec, projectPath)
            ↓
   ctx.emit("project_brain/preview.changed")
            ↓
   setupAutoRebuild 監聽 → shell.run(node build.js)
            ↓
   build.js 重寫 dsh-project-brain/lib/client.js
            ↓
   clientModules.rebuilt("dsh-project-brain", hash)
            ↓
   DSH renderer 自動熱過載 client bundle
            ↓
   1-3 秒後 sidebar 顯示新資料
```

## 3.3 關鍵模組

| 模組 | 職責 | 狀態 |
| --- | --- | --- |
| `src/index.js` | Host entry：12 tools + summarizer + injector + auto-rebuild | ✅ |
| `src/tools.js` | project_init / rescan / status | ✅ |
| `src/scanner.js` | FS 掃描（FsDirEntry.type + e.target 修復） | ✅ |
| `src/client.js` | SidebarPreview + TodoStrip（純函式元件） | ✅ |
| `src/host/summarizer.js` | session/disposed → git diff → change memory | ✅ |
| `src/host/injector.js` | systemPrompt.service.section() 自動注入 | ✅（需驗證） |
| `src/host/rebuild.js` | preview.changed → shell.run build.js | ✅ |
| `src/host/store/path-resolver.js` | session cwd 反推（v0.3.8） | ✅ |
| `src/host/store/brain-files.js` | jsonl 讀寫 + danger-full-access 預設 | ✅ |
| `src/host/store/brain-logic.js` | memory/todo 排序、active 判斷 | ✅ |
| `build.js` | esbuild 打包 + multi-workspace embed + findBrainsUnder 排除 plugin | ✅ |
| `scripts/smoke-test.mjs` | 30 項離線測試 | ✅ |
| `scripts/codegraph-scan.mjs` | tree-sitter 3 語言掃描 | ✅ |
| `scripts/brain-memory.mjs` | timeline/memory CLI | ✅ |

---

# 4. 資料通道詳解（v0.3.8）

## 4.1 為什麼放棄 webServer live fetch

v0.3.0 重新啟用 webServer route，**v0.3.4 徹底回退**。理由：

1. **static plugin fiber 沒有 webServer service**：`webServer.register` 在 `dsh-market` 子 fiber 裡呼叫時要麼拋錯要麼靜默失敗（v0.3.5 實測返回 HTTP 404）
2. **DSH Desktop Electron fetch 走 IPC bridge**：renderer 的 `fetch('/preview.json')` 不直接打 webServer HTTP，需要 IPC 橋接
3. **DSH 靜態 fallback 搶先 404**：即使繞過 IPC，DSH `frontend-static` fallback 會響應 404 給所有 named route
4. **browser 模式也是 404**：使用者實測 `http://127.0.0.1:43120/` 也是 404，證明不只是 Electron 問題

**結論**：在 DSH 當前架構下，static plugin 無法實現真正的 host→client 即時資料通道。build-time embed + auto-rebuild 是唯一可行方案。

## 4.2 build-time embed + auto-rebuild

### build-time（同步）

- `build.js` 掃 `~/.dsh/storages/workspace.json` 拿所有 DSH workspace
- 對每個 `workspace.path` 遞迴找 `.project-brain/`（plugin 自己目錄有 `cordis.patch.yml` 會被排除）
- 產出 previewData：project / phase / recentActivity / memories / todos / timeline / stats
- 構建 `(sessionId → workspaceId → previewData)` map + `workspacePaths` map
- 全部 inline 進 `lib/client.js` 的 `__ALL_WORKSPACES_JSON__` 常量

### auto-rebuild（非同步）

- 任意工具呼叫 `project_*_add/list/done/update` 都會 `emit("project_brain/preview.changed")`
- `setupAutoRebuild` 監聽 → 調 DSH `shell.service.run(node build.js)`（v0.3.7 改用 shell service 避開 sandbox EPERM）
- build.js 重寫 `lib/client.js` → 計算 sha256 hash → 調 `ctx.clientModules.rebuilt("dsh-project-brain", hash)`
- DSH Electron renderer 收到 `clientModules.rebuilt` 通知 → 自動重新載入 `lib/client.js`
- 1-3 秒後 sidebar 顯示新資料

### 代價與收益

| 維度 | build-time embed | webServer live fetch（不可行） |
| --- | --- | --- |
| 即時性 | 1-3 秒延遲（build 時間） | <100ms（理論） |
| 實現複雜度 | 低（已有 build.js） | 高（需要 IPC + webServer） |
| Token 消耗 | 0 | 0 |
| DSH 相容性 | ✅ 全相容 | ❌ static plugin fiber 不可用 |
| 使用者體驗 | 等待 1-3 秒 | 即時（但當前無法實現） |

**結論**：build-time embed 是當前架構下"即時同步"的唯一可行實現。1-3 秒延遲在使用者視角"重大更新"語義下可接受。

---

# 5. Context Injector（v0.3.0 起，待驗證）

## 5.1 設計目標

新 session 自動注入 Top-K 記憶 + 專案概況 + 活躍 TODO 到 system prompt，**無需使用者主動調 `project_continue`**。

## 5.2 實現

- `src/host/injector.js` 通過 `systemPrompt.service.section()` 註冊 `project-brain-context` section
- section.text 是 `(context) => string` 函式（**不是 render**，DSH PromptSection 合約 v0.3.1 修復）
- 監聽 `agent/session-start` 預讀 `.project-brain/` 到 module cache
- 監聽 `preview.changed` 重新整理 cache
- Top-K 選擇演算法（SPEC §4.5）：`score = importance * 0.5 + recency_score * 0.3 + moduleMatch * 0.2`
- recency：7 天內 = 1.0，90 天線性衰減到 0
- moduleMatch：cwd 命中 relatedFiles/relatedModules 加分（弱相關）
- token 預算 1500，超出按段落截斷
- 輸出 markdown：`## Project Brain Context` 標題 + 專案概況 + Top-5 記憶 + 活躍 TODO + 最近活動 + 當前進行中提示

## 5.3 風險

- v0.3.0 誤傳 `render` 欄位 → DSH 合併 sections 時 `undefined.indexOf` 拋錯（**v0.3.1 修復**成 `text`）
- plugin fiber 下的 `ctx.systemPrompt.section` 可能不可用（與 webServer 類似的子 fiber 限制），需執行時探測

---

# 6. 跨專案隔離

## 6.1 問題

DSH static plugin fiber 裡 `sandboxPolicy.workspaceRoot` 是 **DSH Desktop 安裝目錄**（不是使用者當前 session 的 workspace）。所有不帶 `path` 的工具呼叫都誤寫到那裡。

v0.3.8 驗證：DSH Desktop 安裝目錄下的 `.project-brain/` 曾被錯誤寫入。

## 6.2 解決

`src/host/store/path-resolver.js` 的優先順序鏈：

1. `args.path`（顯式傳入，最可靠）
2. `exec.session.cwd` / `exec.session.meta.cwd` 等
3. `exec.ctx.session` / `exec.ctx.agent.session`
4. `exec.sessionId + ctx.get('sessions').get(sid)`
5. `ctx.get('agents').currentInitiator()` 拿當前 session
6. **`ctx.get('sessions').list()` 拿所有 session 的 cwd**（v0.3.8 新增，繞過 sandboxPolicy）
7. `sandboxPolicy.workspaceRoot`（**v0.3.8 跳過 DSH Desktop 安裝路徑**：`C:\*\Programs\DSH Desktop` 或 `*\DSH Desktop.app`）
8. `"."` 兜底

## 6.3 sandboxPolicy 預設寫許可權

v0.3.7：`brain-files.writeText` 預設從 `fs.sandboxPolicy` 取 `danger-full-access` mode，繞過 workspace 路徑限制。避免工具調 `fs.writeText` 時被 sandbox 拒絕。

---

# 7. 關鍵設計決策（已變更）

| 決策 | 選擇 A | 選擇 B | 選 A 的理由 |
| --- | --- | --- | --- |
| 資料通道 | **build-time embed + auto-rebuild**（v0.3.4） | webServer live fetch（v0.3.0-v0.3.3，已回退） | 實測 webServer 在 static plugin fiber 不可用；build-time 是唯一可行路徑 |
| Client Component | **純函式元件**（v0.3.4） | class component + setInterval + fetch | hooks 在靜態 workspace client 崩潰；fetch 通道不可用；純函式 + build-time embed 已足夠 |
| PromptSection | **`text` 欄位**（v0.3.1） | `render` 欄位（v0.3.0） | DSH `PromptSection` 合約規定 `text`，不是 `render` |
| build 路徑 | **multi-workspace embed**（v0.3.4） | 單 workspace（`--workspace=<path>`） | 切換 workspace 必須重新 build；embed 一次支援所有 workspace |
| Plugin 型別 | **static plugin**（`cordis.patch.yml`） | dynamic plugin（cordis_inspect 可見） | static 效能更好、載入更快；dynamic 適合除錯但不必要 |
| Session 摘要資料來源 | **git diff HEAD~1**（v0.3.0） | LLM 抽取聊天記錄 | LLM 成本 + 隱私；git diff 客觀、可追溯、零 token |
| Memory 去重 | **title Jaccard ≥ 0.92**（v0.3.0） | 向量相似度 | 整理操作保持確定性，不依賴外部服務 |
| 工具實現技術 | **`@deepseek-ai/dsh-tools defineTool`** | 直接註冊 `ctx.tools.register` | defineTool 是官方約定，自帶 schema/render/execute 標準化 |
| 客戶端 React 風格 | **`React.createElement`**（不用 JSX） | JSX | dynamic plugin 執行時 ESM bundle，esbuild 不編譯 JSX |
| 12 工具 vs 合併 | **每場景一工具**（v0.3.0+） | project.do(action, ...) | LLM 選工具更準；schema 嚴格；使用者易除錯 |

---

# 8. 風險 & 緩解（v0.3.8）

| 風險 | 現狀 | 緩解 |
| --- | --- | --- |
| DSH host bundle 不自動熱過載 | 改 `src/index.js` / `src/tools/*` 必須重啟 DSH | README / TODO 顯式提示；client bundle 通過 `clientModules.rebuilt` 自動熱過載 |
| auto-rebuild 觸發需要 session cwd 在 git repo | summarizer 跳過非 git 專案 | 設計如此；可後續增強 |
| SidebarPreview 效能（多 workspace embed） | bundle 含多個 workspace 資料 | 當前規模（5 workspaces × ~5KB）< 30KB；V2 可拆 dynamic chunks |
| Context Injector 觸發 `system-prompt/assemble` 異常 | v0.3.0 誤傳 render 欄位曾讓整個 DSH 崩 | v0.3.1 修欄位名；injector 註冊 try/catch |
| 跨專案汙染（DSH Desktop 安裝目錄汙染） | v0.3.8 修復 path-resolver | isDshDesktopInstall 檢測跳過 + workspaceRegistry 優先 |
| build.js 單次掃描開銷 | 當前 ~200ms | 可接受；未來可快取 workspace.json 的 mtime |

---

# 9. 階段交付歷史

| 階段 | 交付 | 狀態 |
| --- | --- | --- |
| P0.1 hello world | cordis_inspect + 工程腳手架 | ✅ |
| P0.2a workspace 接入 | project_init + Client tab | ✅ |
| P0.2b SidebarPreview 5 區塊 | 5 區塊 + Onboarding + mock | ✅ |
| P0.3a Code Graph | tree-sitter 3 語言 | ✅ |
| P0.4 Memory / Timeline | jsonl + brain-memory.mjs CLI | ✅ |
| P0.4.1 工具面補全 | 8 工具 + Stats + Dashboard | ✅ |
| P0.4.2 多 workspace embed | build-time `(sessionId → workspaceId)` map | ✅ |
| P0.4.8 scanner 遞迴修復 | FsDirEntry.type + e.target | ✅ |
| P0.4.9 跨專案隔離 | resolveProjectPath 優先順序鏈 | ✅ |
| P0.5 Session 摘要 | session/disposed → git diff | ✅ |
| P0.5.x 工具面補全 | status / todo_update / ask / dream | ✅ |
| v0.3.0 架構重做 | （已回退） | ⚠️ |
| v0.3.4 完整回退 | build-time embed 復活 | ✅ |
| v0.3.5 build.js 排除 plugin | findBrainsUnder 檢測 cordis.patch.yml | ✅ |
| v0.3.6 tools schema path + output schema | 6 工具加 path，output schema 改 true | ✅ |
| v0.3.7 sandbox 寫許可權 | brain-files 預設 danger-full-access | ✅ |
| v0.3.8 path-resolver 完整修復 | workspaceRegistry + 跳過 DSH Desktop | ✅ |

---

# 10. V2 / 遠期（不做承諾）

| 功能 | 描述 | 狀態 |
| --- | --- | --- |
| Git Commit 深度分析 | 自動生成 timeline | 遠期 |
| Memory 向量檢索 | 可選混合增強，失敗回退 BM25 | ✅ |

## Memory V2 與分層檢索（v0.6.x）

原始事實仍以 `memory.jsonl` 為唯一資料來源。新記錄包含 `schemaVersion/status/confidence/source/updatedAt`；缺少這些欄位的舊記錄按 active 和預設可信度讀取。`archived/superseded/deleted` 不參與查詢、自動上下文注入、專案續接和 Dashboard 統計。

檢索分兩層：預設層使用中文 bigram + 英文/程式碼 token 的 BM25，並融合重要度、可信度、時效性和型別穩定性，再用貪心多樣性懲罰避免 Top-K 被重複變更記錄佔滿。可選層呼叫使用者配置的 OpenAI-compatible Embeddings API，將向量餘弦分數與關鍵詞分數混合；任何配置或網路錯誤都只改變 `actualMode` 和診斷資訊，不影響基礎結果。

向量索引是派生快取，不是記憶事實。快取按 `endpoint + model + dimensions + memory content hash` 判定有效性，懶載入、限批更新，可安全刪除。遠端服務只在顯式啟用後呼叫，憑據不進入 JSONL、日誌或 Client RPC。
| Architecture Diff | Dream 輸出程式碼架構差異 | 遠期 |
| 多 DSH Desktop / 多 profile | 跨裝置同步 .project-brain/ | 遠期 |
| Sidebar 子選單 | 專案切換/最近專案 | 可選 |
| 全屏 Dashboard 檢視 | 當前是摺疊展開區，可獨立 route | 可選 |

---

# 11. 一句話總結

> **dsh-project-brain 是一個 Local-First、專案繫結、跨 Session 演進的 DSH 專案大腦外掛，通過 build-time embed + auto-rebuild 實現"重大更新即時同步"，讓 DSH 從"讀程式碼"進化為"懂專案"——所有資料落 `.project-brain/`，零 token，零外部依賴，零網路。**
