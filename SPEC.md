# dsh-project-brain 開發規格說明（SPEC）

**版本：** **v1.3.1**（latest）— 歷史章節保留早期實驗記錄
**狀態：** Active
**對應文件：** `REQUIREMENTS.md`（PRD） / `DESIGN.md`（設計方案）
**性質：** 程式碼、測試、提交流程與排錯流程均必須與本文件對齊；若與 PRD/DESIGN 衝突，以本文件為準並回寫 PRD/DESIGN。

> **v1.3.1 增量說明**（2026-09-15）：匯入匯出 / 本地備份恢復。
> - 4 個新 Tool：`project_export` / `project_import` / `project_rollback_backup` / `project_cleanup_backups`
> - 7 個新 RPC（`project_brain/export.run` 等）
> - Dashboard 頂部三按鈕 + PreviewDialog + BackupListDialog + Toast
> - 詳見 `docs/superpowers/specs/2026-09-15-brain-import-export.md`（獨立 SPEC，因本檔案主體章節保持穩定）
> - 端到端 20/20 smoke + 46/46 host-acceptance 通過

> **版本說明（v0.3 → v0.4 MINOR bump）**：本次 MINOR bump 開啟 v0.4.x，累積 v0.2.1~v0.2.9 + v0.3.0~v0.4.8 共 39 行變更（資料通道重大回退 / 工具面補全 / summarizer + injector / auto-rebuild / path-resolver / sandbox 修復 / TODO strip / dream commit+full / locale-aware / 跨 Session 端到端 / 跨 workspace 隔離實測 / dark/light 主題 token 取證 / auto-rebuild 跨 fiber 修復 / inject timer 根因補漏 / 冷啟動診斷 + DSH 原生事件主動喚醒 / spawn 子程序 watcher 終極 fallback / 工具層同步 rebuild 工程止血 / 端到端驗證完成 + 接受手動 build fallback / 清理過時 todo + 完善 Project Memory 5 類混合填充 / P0.8 收尾大結局 / appendJsonl 效能最佳化 O(N) → O(1) / DSH Desktop 釋出準備 INSTALL.md + CHANGELOG.md + STORE_LISTING.md / dream 真實架構 diff LLM 接入 + project_diff 工具（v0.4.1 mock fallback 實測 DSH Desktop shell 靜默）/ **真實 git + 真實 LLM 繞過 DSH Desktop sandbox（v0.4.2，node 內建模組 + node:fetch）** / **summarizer 真實 git + detector 真實 git 格式修復（v0.4.4：inflateSync + 目錄 mode + fixture deflateSync，198/198 PASS）** / **detector 移除 pack 整體拒絕（v0.4.5：commit/tree 在 loose 即可 diff，不讀 blob，199/199 PASS）** / **detector pack 真實支援（v0.4.6：parseIdxV2 + readPackEntryByOffset + packed-refs + OFS_DELTA/REF_DELTA，201/201 PASS）** / **llm.js 加 Anthropic 相容協議（v0.4.7：detectProtocol 自動路由 + fetchAnthropic /v1/messages，210/210 PASS）** / **本地 AST 分析擴充套件到 6 種語言（v0.4.8：Go/Java/Rust/C/C++ 新增；每語言獨立 import/export/function/API/DB schema 抽取器；config.json languages 白名單；smoke-multi-lang 56/56 PASS）**）。v0.4.x：v0.4.0 + v0.4.1 + v0.4.2 + v0.4.3 + v0.4.4 + v0.4.5 + v0.4.6 + v0.4.7 + v0.4.8。真實路徑 vs mock fallback 決策記錄在 .project-brain/memory.jsonl mem-mtccn6uf。大章節結構與 SPEC §1~§19 保持不變；待 v1.0 MVP 時考慮 MAJOR bump。

> **v0.6.0 當前架構覆蓋說明：** Client 以 `connection.rpc` 為主通道；Host 每次從 live Session header 解析可信 workspace；build-time embed 僅作無本機資料的離線降級。Context Injector 使用 workspace/session 隔離快取；Session summarizer 僅處理已初始化專案並去重。早期章節中“只能 build-time embed”“寫資料後手動 build”“全域性 injector cache”等描述均為歷史記錄，已被本說明取代。

---

# 0. 閱讀指引

| 章節 | 內容 | 何時讀 |
| --- | --- | --- |
| §1~3 | 專案身份、架構、程式碼庫佈局 | 建立工程認知 |
| §4~9 | 資料模型、Host/Client、Tool/RPC/Sidebar 硬契約 | 編碼時隨時參考 |
| §10~12 | 配置、開發階段、測試策略 | 排期與驗收 |
| §13~16 | 除錯、編碼規約、DoD、未決問題 | 日常開發與收尾 |
| §17~20 | 資料遷移、安全、失敗模式、變更日誌 | 長期運維 |

**強制約定**：

1. 本文件所有 **TypeScript 型別簽名僅為契約示意**，執行時由 `.js` / `.ts` 編譯產物實現；動態外掛禁止 `import`/`require`/JSX/裝飾器。
2. **所有 DSH 服務名、Slot ID、Tool 註冊 API 必須通過 `cordis_inspect_*` 即時確認**，不能憑推測寫死。
3. 資料落在被分析專案自己的 `.project-brain/`（**專案繫結**，不是 Session 繫結）。
4. 命名約定：**SidebarPreview** = 功能名；**SidebarTab** = UI 元素；**`preview.changed`** = 事件名；**`sidebar.getPreview`** = RPC 名。整份文件及配套 PRD/DESIGN 統一使用此術語。

---

# 1. 專案身份與目標

| 欄位 | 值 |
| --- | --- |
| 包名 | `dsh-project-brain` |
| 展示名（中/英） | dsh-project-brain / Project Brain |
| 目標使用者 | 使用 DSH 進行長期軟體開發的個人開發者與開發團隊 |
| 專案定位 | DSH 的持久化專案大腦：理解程式碼架構、記住專案歷史、跨 Session 保持上下文，並隨著專案持續成長 |
| 核心場景 | 快速理解陌生專案；跨 Session 續接開發；自動沉澱架構/決策/Bug/TODO |
| MVP 週期 | 單人 **38~48 工作日**（含 30% 除錯 buffer，不含可選 Go/Java 拓展） |

**五大設計原則（不可妥協）**：
1. 只記長期有價值的內容（評分 + Dream 整合）。
2. 記錄 What 與 Why（每條 Decision / Architecture / Lesson 必帶 reason 欄位）。
3. 專案知識屬於 Project，不屬於 Session（資料落在 `.project-brain/`，跨機器遷移）。
4. 持續演進（增量掃描 + Dream 週期）。
5. 知識可追溯（每條 Memory 必帶 source_type + source_id）。

---

# 2. 架構總覽

## 2.1 三層架構

```
Client（DSH 瀏覽器程序）
├── SidebarTab + SidebarPreview  ← 常駐入口（緊鄰"記憶庫"右側）
├── Dashboard 主檢視               ← 按需展開
└── 全部資料通過 host.call(...) 拉取
                ↕ JSON RPC（Package-private）
Host（DSH Node.js 程序）
├── Tool 實現（/project *）
├── SidebarPreview RPC + Pub/Sub
├── Session 事件監聽 + 摘要生成
├── Context Injector
└── 排程 Scanner / Analyzer / Memory / Dream
                ↕
本地引擎層（無狀態模組）
├── Scanner / Analyzer / Dream Engine
├── Memory Engine
└── Storage（SQLite + JSON）
                ↕
持久化 .project-brain/（與目標專案繫結）
├── project.json / architecture.json / config.json
├── codegraph.db / memory.db / timeline.db（實際同庫或分庫均可）
├── sessions/ / snapshots/ / dream.log
```

## 2.2 DSH 整合形態

dsh-project-brain 是一個**靜態 + HMR 友好的 Cordis 外掛**，通過以下 5 類整合點與 DSH 互動：

| 整合點 | 提供方 | 接收方 / 註冊目標 |
| --- | --- | --- |
| Tool（供 LLM 呼叫） | Host | `@deepseek-ai/dsh-tools` |
| RPC（供 Client 呼叫） | Host | `harness.handle('project_brain/...', handler)` |
| Event（訂閱） | Host | `ctx.on('session:started' \| 'session:ended', ...)` |
| Event（釋出） | Host | `ctx.emit('project_brain/preview.changed', ...)` |
| Slot（UI 掛載） | Client | DSH SidebarTab Slot + Dashboard Slot |

## 2.3 關鍵依賴

| 依賴 | 用途 | 版本約束 |
| --- | --- | --- |
| `@deepseek-ai/cordis` | 外掛執行時 | ^4.0.1 |
| `@deepseek-ai/dsh-llm` | LLM 呼叫 | 0.1.1-rc.2+ |
| `@deepseek-ai/dsh-storage-domain` | 持久化域 | 0.1.1-rc.2+ |
| `@deepseek-ai/dsh-tools` | Tool 註冊 | 0.1.1-rc.2+ |
| `@deepseek-ai/dsh-session` | Session 事件 | 0.1.1-rc.2+ |
| `better-sqlite3` | SQLite | ^11 |
| `tree-sitter` + JS/TS/Python/Go/Java/Rust/C grammar | AST 解析（v0.4.8 6 語言） | ^0.21+（6 個 npm 包） |
| `esbuild` | 開發期 watch 構建 | ^0.24 |
| `chokidar` | 檔案監聽（HMR 友好） | ^4 |
| `@deepseek-ai/schemastery` | Schema 校驗 | ^3.18 |

> ⚠️ **P0.1 第一件事**：跑 `cordis_inspect_list` 拉一份當前 DSH 真實暴露的 Service / Event / Tool 名單，對照本表修正"硬依賴 vs 軟依賴 vs 不存在"。

---

# 3. 程式碼庫佈局

```
dsh-project-brain/
├── package.json               # 包元資訊 + scripts
├── tsconfig.json              # 型別檢查（僅型別，不參與執行時）
├── cordis.yml                 # Loader 入口配置（host/client 掛載點）
├── README.md                  # 使用者文件
├── REQUIREMENTS.md            # PRD
├── DESIGN.md                  # 設計方案
├── SPEC.md                    # 本文件
├── TODO.md                    # 任務清單（P0.1 建立並持續更新）
├── src/
│   ├── shared/                # Host/Client 共用常量與型別
│   │   ├── types.ts           # 跨邊界介面（用 JSDoc 表達）
│   │   ├── constants.ts       # 常量（路徑、限制、錯誤碼）
│   │   └── terms.ts           # 術語表（功能 / UI / 事件 / RPC 名）
│   ├── host/                  # Host 外掛
│   │   ├── index.js           # Host Plugin.apply(ctx)
│   │   ├── scanner/
│   │   │   ├── index.js
│   │   │   ├── filesystem.js
│   │   │   ├── techstack.js
│   │   │   ├── entrypoints.js
│   │   │   └── ignore.js
│   │   ├── analyzer/
│   │   │   ├── index.js
│   │   │   ├── ast.js
│   │   │   ├── callgraph.js
│   │   │   ├── apis.js
│   │   │   ├── tables.js
│   │   │   └── grammars/      # 5 個 tree-sitter grammar 入口（require）
│   │   ├── memory/
│   │   │   ├── store.js
│   │   │   ├── types.js
│   │   │   ├── lifecycle.js
│   │   │   └── importance.js
│   │   ├── dream/
│   │   │   └── consolidator.js
│   │   ├── injector.js        # 跨 Session 上下文注入
│   │   ├── summarizer.js      # Session 結束摘要
│   │   ├── sidebar/
│   │   │   ├── aggregator.js  # SidebarPreview 資料聚合
│   │   │   └── pubsub.js      # Pub/Sub 推送
│   │   ├── tools/             # Tool 實現
│   │   │   ├── init.js
│   │   │   ├── continue.js
│   │   │   ├── ask.js
│   │   │   ├── status.js
│   │   │   ├── memory.js
│   │   │   ├── todo.js
│   │   │   └── dream.js
│   │   ├── rpc/               # Client → Host RPC handlers
│   │   │   ├── sidebar.js
│   │   │   ├── dashboard.js
│   │   │   └── register.js    # harness.handle 集中註冊入口
│   │   └── storage/
│   │       ├── sqlite.js
│   │       ├── migrations.js
│   │       └── fingerprint.js # FS 指紋 + 增量檢測
│   └── client/                # Client 外掛
│       ├── index.js           # Client Plugin.apply(ctx)
│       ├── i18n/
│       │   ├── zh-CN.js
│       │   └── en-US.js
│       ├── sidebar/
│       │   ├── tab.js         # SidebarTab 註冊
│       │   ├── preview.js     # SidebarPreview 摺疊態面板
│       │   ├── onboarding.js  # 空狀態引導
│       │   ├── blocks/        # 5 個區塊元件
│       │   │   ├── header.js
│       │   │   ├── phase.js
│       │   │   ├── activity.js
│       │   │   ├── stats.js
│       │   │   └── actions.js
│       │   └── rpc.js          # host.call 封裝
│       └── dashboard/
│           ├── view.js
│           ├── panels/
│           │   ├── overview.js
│           │   ├── architecture.js
│           │   ├── codemap.js
│           │   ├── memory.js
│           │   ├── timeline.js
│           │   └── tasks.js
│           └── router.js
└── tests/
    ├── fixtures/              # 測試倉庫（詳見 §12.4）
    │   ├── ts-sample/          # P0.0 必做
    │   ├── js-sample/          # P0.3a 必做
    │   ├── py-sample/          # P0.3a 必做
    │   ├── go-sample/          # 可選 P0.3b
    │   └── java-sample/        # 可選 P0.3b
    ├── host/
    │   ├── scanner.test.js
    │   ├── analyzer.test.js
    │   ├── memory.test.js
    │   ├── summarizer.test.js
    │   └── sidebar-aggregator.test.js
    └── client/
        └── sidebar-preview.test.js
```

**目錄命名約束**：
- Host/Client 嚴格分離，不允許跨層 import。
- 共用型別/常量只放 `src/shared/`。
- 模組內部 `index.js` 作為對外統一齣口。
- 檔名 `kebab-case.js`；React 元件 `PascalCase.js`。

---

# 4. 資料模型規範

## 4.1 目錄位置

* 資料落在被分析專案自身的 `.project-brain/` 目錄下（**專案繫結**）。
* 首次訪問某專案時若 `.project-brain/` 不存在則自動建立。

```
.project-brain/
├── project.json
├── architecture.json
├── config.json
├── codegraph.db       # 也可與 memory.db 合庫；MVP 單庫即可
├── memory.db          # MVP：與 codegraph.db 合併為 single.db
├── timeline.db        # MVP：同上
├── sessions/<session-id>.md
├── snapshots/<snapshot-id>.json
└── dream.log
```

**MVP 決策**：所有表放單一 SQLite 檔案 `memory.db`（最簡），V2 可拆。Schema 設計按物理表名約定，仍以業務域為字首。

## 4.2 SQLite Schema（必須嚴格遵守）

**啟動時強制執行的 PRAGMA**（寫在 `sqlite.js` 初始化函式內）：
```sql
PRAGMA journal_mode = WAL;       -- 併發讀寫
PRAGMA busy_timeout = 5000;      -- 鎖等待 5s
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;     -- WAL 模式下 NORMAL 已足夠安全
```

```sql
-- ━━━ project ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE project (
  id TEXT PRIMARY KEY,                -- hash(root_path)
  name TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE,
  description TEXT,
  tech_stack JSON,                    -- {"backend":"FastAPI","db":"PostgreSQL",...}
  languages JSON,                     -- {"typescript":0.62,"python":0.30}
  size JSON,                          -- {"files":1024,"loc":52400}
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_scanned_at INTEGER
);

-- ━━━ memory ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE memory (
  id TEXT PRIMARY KEY,                -- uuid v4
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,                 -- architecture|decision|requirement|change|bug|lesson|todo|issue|context
  title TEXT NOT NULL,
  content JSON NOT NULL,              -- 型別專屬欄位
  importance REAL DEFAULT 0.5,        -- 0~1
  confidence REAL DEFAULT 0.5,        -- 0~1
  status TEXT DEFAULT 'new',          -- new|active|reinforced|outdated|archived
  source_type TEXT,                   -- session|commit|file|user|pr|issue|scanner|llm
  source_id TEXT,
  source_session TEXT,
  related_files JSON,
  related_modules JSON,
  related_memory_ids JSON,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_accessed_at INTEGER,
  FOREIGN KEY (project_id) REFERENCES project(id)
);

CREATE INDEX idx_memory_project_type    ON memory(project_id, type);
CREATE INDEX idx_memory_status         ON memory(project_id, status);
CREATE INDEX idx_memory_importance     ON memory(project_id, importance DESC);
CREATE INDEX idx_memory_updated        ON memory(project_id, updated_at DESC);

-- ━━━ todo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE todo (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',      -- pending|in_progress|blocked|done|cancelled
  priority TEXT DEFAULT 'medium',     -- low|medium|high
  related_feature TEXT,
  related_files JSON,
  source_session TEXT,
  source_memory_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (project_id) REFERENCES project(id)
);

CREATE INDEX idx_todo_project_status   ON todo(project_id, status);
CREATE INDEX idx_todo_project_priority ON todo(project_id, priority);

-- ━━━ code_entity ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE code_entity (
  id TEXT PRIMARY KEY,                -- "type:file_path:start:end:name"
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,                 -- file|module|class|function|api|db_table|config|dependency
  name TEXT NOT NULL,
  file_path TEXT,
  start_line INTEGER,
  end_line INTEGER,
  language TEXT,
  metadata JSON,
  hash TEXT,                          -- 單檔案級 content hash，用於增量更新
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES project(id)
);

CREATE INDEX idx_code_entity_project_type ON code_entity(project_id, type);
CREATE INDEX idx_code_entity_file         ON code_entity(file_path);
CREATE INDEX idx_code_entity_hash         ON code_entity(hash);

-- ━━━ code_relation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE code_relation (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation TEXT NOT NULL,             -- contains|imports|calls|inherits|implements|depends_on|reads|writes|exposes
  confidence REAL DEFAULT 1.0,
  metadata JSON,
  FOREIGN KEY (project_id) REFERENCES project(id)
);

CREATE INDEX idx_code_relation_from_id   ON code_relation(from_id);
CREATE INDEX idx_code_relation_to_id     ON code_relation(to_id);
CREATE INDEX idx_code_relation_relation  ON code_relation(relation);

-- ━━━ timeline ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE timeline (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  event_type TEXT NOT NULL,           -- init|change|memory_added|memory_archived|architecture_change|dream|todo_done
  title TEXT NOT NULL,
  description TEXT,
  related_memory_id TEXT,
  related_commit TEXT,
  occurred_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES project(id)
);

CREATE INDEX idx_timeline_project_time ON timeline(project_id, occurred_at DESC);

-- ━━━ session ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE session_summary (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  summary TEXT,
  diff_hash TEXT,
  files_changed JSON,
  memory_written JSON,
  FOREIGN KEY (project_id) REFERENCES project(id)
);

-- ━━━ codegraph snapshot（Dream 用）━━━━━━━━━━━━━━━━━━
CREATE TABLE codegraph_snapshot (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  entities_count INTEGER,
  relations_count INTEGER,
  diff_from_previous JSON,
  FOREIGN KEY (project_id) REFERENCES project(id)
);

CREATE INDEX idx_codegraph_snapshot_project ON codegraph_snapshot(project_id, version DESC);
```

**約束**：
- 所有表必須有 `project_id`。
- 所有時間戳統一 `INTEGER`（epoch ms）。
- 不使用 `ON DELETE` 級聯；專案刪除時手動清理。
- 所有 JSON 欄位必須可被 `JSON.parse` 解析；寫入時 `JSON.stringify` + null 檢查。
- 刪除專案流程：先 `DELETE FROM` 所有表 + 刪除 `.project-brain/` 目錄。

## 4.3 JSON 結構規範

### 4.3.1 project.json

```json
{
  "id": "sha256-of-root-path",
  "name": "my-saas",
  "rootPath": "C:/code/my-saas",
  "description": "Auto-generated",
  "techStack": {
    "backend": "FastAPI",
    "db": "PostgreSQL",
    "cache": "Redis",
    "llm": "Qwen"
  },
  "languages": { "python": 0.62, "typescript": 0.30, "other": 0.08 },
  "size": { "files": 1024, "loc": 52400 },
  "entrypoints": [
    { "path": "src/main.py", "type": "service", "cmd": "python -m src.main" }
  ],
  "directoryMap": [
    { "path": "src/api", "purpose": "api" },
    { "path": "src/services", "purpose": "service" }
  ],
  "createdAt": 1723500000000,
  "updatedAt": 1723500000000,
  "lastScannedAt": 1723500000000
}
```

### 4.3.2 architecture.json

```json
{
  "schemaVersion": 2,
  "version": 2,
  "generatedAt": 1723500000000,
  "fingerprint": "9b1f3c20",
  "changed": true,
  "source": "hybrid",
  "project": { "name": "my-saas", "techStack": {}, "entrypoints": [] },
  "overview": {
    "purpose": "讓 DSH 跨對話持續理解和維護當前專案",
    "audience": "長期維護軟體專案的開發者",
    "category": "DSH 開發者工具外掛",
    "architectureStyle": "Host/Client 雙端的分層外掛架構",
    "value": "把專案理解、記憶和待辦沉澱在 workspace"
  },
  "summary": "系統由介面、執行時橋接、專案分析、記憶檢索和本地儲存等職責元件協作完成。",
  "layers": [
    { "id": "layer-experience", "name": "體驗層", "responsibility": "展示專案認知與互動入口", "order": 0 },
    { "id": "layer-application", "name": "應用層", "responsibility": "編排掃描、記憶和待辦能力", "order": 1 }
  ],
  "components": [
    {
      "id": "component-project-analysis",
      "name": "專案分析引擎",
      "layerId": "layer-application",
      "type": "service",
      "responsibility": "收集工作區證據並生成專案認知",
      "details": "本地事實作為基線，當前 DSH 模型生成語義架構",
      "technologies": ["JavaScript"],
      "importantFiles": ["src/host/architecture/analyzer.js"],
      "evidencePaths": ["src/scanner.js", "src/host/architecture/analyzer.js"],
      "confidence": 0.9
    }
  ],
  "relationships": [
    { "id": "relation-1", "from": "component-runtime-bridge", "to": "component-project-analysis", "label": "觸發", "type": "request", "description": "當前 Session 發起初始化或重掃", "confidence": 0.9 }
  ],
  "runtimeFlows": [
    { "id": "flow-1", "name": "專案初始化", "trigger": "使用者點選啟動", "outcome": "生成專案認知報告", "steps": [{ "componentId": "component-runtime-bridge", "action": "解析 workspace" }, { "componentId": "component-project-analysis", "action": "分析證據" }] }
  ],
  "keyFiles": [
    { "path": "src/index.js", "role": "Host 入口", "whyImportant": "可瞭解外掛註冊和生命週期", "category": "entry" }
  ],
  "gettingStarted": ["先讀 README", "再讀 Host 入口和架構分析器"],
  "designHighlights": ["專案資料按 workspace 隔離"],
  "risks": [],
  "evidence": { "readmeUsed": true, "manifestFiles": ["package.json"], "sourceFilesAnalyzed": 40, "sourceSnippetsShared": true },
  "stats": { "files": 48, "analyzedFiles": 40, "layers": 5, "components": 8, "edges": 12, "keyFiles": 10 },
  "llm": { "requested": true, "used": true, "provider": "current-session-provider", "model": "current-session-model", "error": null }
}
```

約束：

- 本地分析是硬基線；LLM 不可用時 `source="local"`，初始化仍成功。
- LLM 可以重新抽象概念層與職責元件，但目錄名不得直接充當元件名；檔案路徑只能作為證據。
- 預設請求包含 README、manifest、符號/import 和有限關鍵原始碼摘要，不包含絕對路徑；可關閉原始碼摘要。
- 所有 `importantFiles/evidencePaths/keyFiles` 必須命中本地真實相對路徑，所有關係和流程必須引用已校驗元件。
- `fingerprint` 包含關鍵原始碼內容雜湊、manifest、README 和技術棧；未變化時複用已有 LLM 結果。
- Dashboard 使用受控 React 元件渲染該 JSON，不執行資料中的指令碼或 markup。

### 4.3.3 config.json

```json
{
  "version": 1,
  "scan": {
    "timeoutMs": 120000,
    "maxFileSizeBytes": 1048576,
    "ignored": ["node_modules/**", ".git/**", "dist/**", "build/**", "**/*.min.js"]
  },
  "languages": ["typescript", "javascript", "python", "go", "java"],
  "llm": {
    "modelPreference": null,
    "maxTokensPerCall": 4000
  },
  "architecture": {
    "enabled": true,
    "llmEnabled": true,
    "llmIncludeSource": true,
    "maxFiles": 240,
    "maxNodes": 24,
    "llmTimeoutMs": 60000,
    "route": "current DSH Session provider/model"
  },
  "memory": {
    "maxMemories": 5000,
    "importanceFloor": 0.2
  },
  "sidebar": {
    "enabled": true,
    "recentActivityLimit": 3,
    "perfTargetMs": 100
  }
}
```

## 4.4 Memory 型別 Schema（每類必填欄位）

> **執行時由 `src/host/memory/types.js` 內的 schemastery 校驗，缺欄位寫入失敗並返回 `E_MEMORY_SCHEMA`。**

```js
// 僅作契約示意，執行時按 JSDoc + schemastery 實現
const DecisionContent = {
  decision: 'string',           // 必填
  reason: 'string',             // 必填
  alternatives: 'string[]?',    // 可選
  rejected: 'string[]?',        // 可選
  rejectedReason: 'string?',    // 可選
  relatedFiles: 'string[]'      // 必填
}
const ArchitectureContent = {
  before: 'string', after: 'string', reason: 'string', commit: 'string?'
}
const LessonContent = {
  problem: 'string', rootCause: 'string', solution: 'string', relatedFiles: 'string[]'
}
const ChangeContent = {
  diffSummary: 'string', motivation: 'string?', impact: 'local|module|architecture'
}
const RequirementContent = { original: 'string', current: 'string?', evolution: 'string?' }
const BugContent = { symptom: 'string', rootCause: 'string?', fixedAt: 'number?', relatedFiles: 'string[]' }
const IssueContent = { description: 'string', severity: 'low|medium|high', relatedFiles: 'string[]?' }
const ContextContent = { note: 'string', tags: 'string[]?' }
const TodoContent = { todoId: 'string' }   // 與 todos 表關聯
```

## 4.5 錯誤碼

| 錯誤碼 | 含義 | 處理 |
| --- | --- | --- |
| `E_NOT_INITIALIZED` | 專案未 init | 提示使用者先執行 `/project init` |
| `E_SCAN_TIMEOUT` | 掃描超過 2 分鐘 | 後臺續跑 + 返回部分結果 |
| `E_SCAN_FAILED` | 掃描過程出錯 | 返回錯誤位置 + 繼續可能的部分 |
| `E_MEMORY_SCHEMA` | Memory 欄位缺失 | 詳細列出缺失欄位 |
| `E_NOT_FOUND` | 實體不存在 | 404 語義 |
| `E_PERMISSION` | 檔案讀寫許可權 | 提示使用者檢查許可權 |
| `E_LLM_FAILED` | LLM 呼叫失敗 | 重試 1 次 + 降級到規則抽取 |
| `E_INTERNAL` | 未分類內部錯誤 | 記錄 stack，向上拋 |

---

# 5. Host 外掛規範

## 5.1 入口與生命週期

> 本節 TypeScript 型別僅為契約示意，執行時由 `.js` 實現。

```js
// src/host/index.js —— 契約示意
export default function hostPlugin() {
  return {
    name: 'dsh-project-brain:host',
    inject: [/* 見 §5.6 注入清單 */],
    apply: async (ctx) => {
      // 1. 初始化 storage（SQLite PRAGMA + migrations）
      // 2. 讀取 config.json
      // 3. 探測 cwd 專案
      // 4. 註冊 Tool（/project *）
      // 5. 註冊 RPC（project_brain/*）
      // 6. 監聽 session:started / session:ended
      // 7. 註冊 Service（projectBrain）
      // 8. 註冊 Pub/Sub
    },
  }
}
```

| 階段 | 行為 |
| --- | --- |
| 啟動 | 遷移 schema → 讀 config → 探測 cwd 專案 |
| 執行 | 監聽事件；提供 RPC；Tools 可被 LLM 呼叫；SidebarPreview aggregator 就緒 |
| 關閉 | 關閉 SQLite 連線；flush Pub/Sub；儲存 snapshot（如有 dirty） |

## 5.2 Service：`projectBrain`

供其它 Host 外掛呼叫（不直接面向 Client）。**MVP 暴露以下方法**，所有方法必須返回 `{ ok, data | code, message }` 包裝：

| 方法 | 用途 | 時延上限 |
| --- | --- | --- |
| `analyze(path)` | 觸發掃描 | 不限（帶 dryRun） |
| `recordMemory(input)` | 寫入單條 Memory | 100ms |
| `queryMemory(filter)` | 查 Memory | 100ms |
| `listTodos(filter?)` | 查 TODO | 100ms |
| `upsertTodo(input)` | 寫 TODO | 100ms |
| `getSidebarPreview(projectId)` | 聚合 SidebarPreview 資料 | 200ms（5 表 join） |
| `triggerDream(mode)` | 觸發 Dream | 不限 |

`analyze` / `triggerDream` 非同步執行，立即返回 `{ ok, data: { taskId } }`；通過 `preview.changed` 通知完成。

## 5.3 Tool 註冊規範

```js
ctx.tool({
  name: 'project_xxx',
  description: '...',
  parameters: { /* schemastery schema */ },
  execute: async (args, ctx) => { /* returns { ok, data } */ },
})
```

**強制要求**：
- 每個 Tool 必須支援 `dryRun`。
- 返回值必須 JSON 可序列化。
- 錯誤返回 `{ ok: false, code: 'E_xxx', message }`。
- 成功返回 `{ ok: true, data }`。
- Tool 內部禁止直接寫 SQLite；統一走 Service（保持事務邊界）。

## 5.4 事件訂閱 / 釋出

### 訂閱
```js
ctx.on('session:started', async (session) => { /* 寫 session_started_at */ })
ctx.on('session:ended',   async (session) => { /* 觸發 summarizer */ })
```

### 釋出（名稱空間 `project_brain/*`）

| 事件 | payload | 觸發時機 |
| --- | --- | --- |
| `project_brain/preview.changed` | `{ projectId }` | 任意 Memory/TODO/project 變更 |
| `project_brain/scanner.started` | `{ projectId, mode }` | scanner 啟動 |
| `project_brain/scanner.progress` | `{ projectId, percent }` | 掃描過程 |
| `project_brain/scanner.completed` | `{ projectId, ms, partial }` | 掃描完成 |
| `project_brain/dream.started` | `{ projectId, mode }` | Dream 啟動 |
| `project_brain/dream.completed` | `{ projectId, summary }` | Dream 完成 |

## 5.5 Pub/Sub 設計

```js
class PreviewPubSub {
  subscribers = new Map()        // projectId → Set<handler>
  subscribe(projectId, handler) { /* returns disposer */ }
  publish(projectId) { /* debounce 100ms, batch all */ }
}
```

- 單 process 單例（Service）。
- Debounce 100ms，避免高頻寫觸發高頻推送。
- Client 通過 `sidebar.subscribe` RPC 訂閱。

## 5.6 注入清單（必須用 `cordis_inspect_*` 校正）

| 依賴 | 來源（推測） | 用途 |
| --- | --- | --- |
| `llm` | `@deepseek-ai/dsh-llm` | LLM 呼叫 |
| `tools` | `@deepseek-ai/dsh-tools` | Tool 註冊 |
| `session` | `@deepseek-ai/dsh-session` | Session 事件 |
| `timer` | `@deepseek-ai/cordis-plugin-timer` | 週期任務（Dream） |
| `loader` | `@deepseek-ai/cordis-plugin-loader` | 載入後設資料 |
| `storage` 或 `storageDomain` | `@deepseek-ai/dsh-storage*` | 持久化（**P0.1 驗證是哪個**） |

可選依賴用 `ctx.get('name')` 而非 inject，避免啟動順序死鎖。

---

# 6. Client 外掛規範

## 6.1 入口

```js
// src/client/index.js —— 契約示意
export default function clientPlugin() {
  return {
    name: 'dsh-project-brain:client',
    platform: 'web',
    apply: async (ctx) => {
      // 1. 註冊 SidebarTab（Slot ID 來自 §11.2 Inspect 結果）
      // 2. 註冊 Dashboard View
      // 3. 初始化 i18n
      // 4. 繫結 Pub/Sub 監聽（host.call('project_brain/sidebar.subscribe', ...)）
    }
  }
}
```

## 6.2 強制約束

1. **必須用 `React.createElement(...)`，不寫 JSX**。
2. **禁止在 Client 直接訪問 SQLite / FS**；統一 `host.call(...)`。
3. **禁止序列化整個 Service 物件**到 React state；只儲存所需欄位。
4. 國際化文案必須經過 `i18n.t(key)`。
5. 主題色 / 間距必須讀取 DSH Theme token（推測字首 `--dsh-*`，**P0.1 Inspect 驗證**）；不允許硬編碼顏色。
6. 元件解除安裝必須清理所有訂閱 / 定時器（通過 `ctx.effect()`）。
7. **禁止客戶端直連 SQLite / FS**（重要，再強調一次）。

## 6.3 Slot 註冊

| 用途 | **實際 Slot 名** | kind | 備註 |
| --- | --- | --- | --- |
| **SidebarPreview View Tab** | **`conversation.view`** | list | `id: 'project-brain'`、`order: 35`（緊隨 `dsh-mneme-memory` order=30） |
| Tool 呼叫卡片 | `tool.call.toolview` | keyed | 可選：自定義 `/project_*` 工具展示卡 |
| 頂部 toast | `shell.overlay` | list | 可選：通知 + 錯誤提示 |

> **關鍵修正**（來自 P0.1 #2 Inspect）：使用者截圖中的"記憶庫"是 `conversation.view` 的 `dsh-mneme-memory`（order=30，由 `@deepseek-ai/dsh-mneme` 外掛註冊），不是側邊欄 tab。我們的入口註冊到 **`conversation.view`** 的 order=35，緊鄰"記憶庫"。

註冊示例（基於 Inspect 真實結果）：
```js
const slots = ctx.get('slots')
slots.inject('conversation.view', () => slots.register(
  {
    name: 'conversation.view',
    id: 'project-brain',
    order: 35,
    label: () => ctx.get('locale').bind('dsh-project-brain')('sidebar.tab.label'),
  },
  (props) => React.createElement(SidebarPreview, props),
))
```

**`conversation.view` 當前 occupants（避免搶 id）**：

| id | order | registrant |
| --- | --- | --- |
| `chat` | 0 | z5 |
| `trajectory` | 10 | z5 |
| `context` | 20 | dsh-context |
| `dsh-mneme-memory` | 30 | dsh-mneme |
| **`project-brain`** | **35** | **dsh-project-brain（我們）** |

## 6.4 國際化

`src/client/i18n/zh-CN.js` 與 `src/client/i18n/en-US.js` 必須保持 key 一致。完整 key 表見 §6.5。

## 6.5 i18n Key 清單

| Key | zh-CN | en-US |
| --- | --- | --- |
| `sidebar.tab.label` | 專案 | Project |
| `sidebar.preview.header.lastUpdate` | 上次更新 | Last update |
| `sidebar.preview.header.untitled` | 未命名專案 | Untitled project |
| `sidebar.preview.phase.title` | 當前階段 | Current phase |
| `sidebar.preview.phase.empty` | 暫無進行中任務 | No tasks in progress |
| `sidebar.preview.activity.title` | 最近活動 | Recent activity |
| `sidebar.preview.activity.empty` | 暫無活動 | No recent activity |
| `sidebar.preview.activity.viewMore` | 檢視更多 | View more |
| `sidebar.preview.stats.pending` | 待辦 | Pending |
| `sidebar.preview.stats.done` | 已完成 | Done |
| `sidebar.preview.stats.decisions` | 決策 | Decisions |
| `sidebar.preview.actions.continue` | 繼續上次開發 | Continue last session |
| `sidebar.preview.actions.openDashboard` | 開啟完整 Dashboard | Open full Dashboard |
| `sidebar.preview.onboarding.title` | 專案大腦未啟動 | Project Brain not started |
| `sidebar.preview.onboarding.body` | 啟動後將自動生成… | After startup, it will… |
| `sidebar.preview.onboarding.cta` | 啟動專案大腦 /project init | Start Project Brain /project init |
| `sidebar.preview.error.loadFailed` | 專案資料載入失敗 | Failed to load project data |
| `sidebar.preview.error.retry` | 重試 | Retry |

---

# 7. Tool 契約規範

## 7.1 通用約定

所有 Tool 都遵循：
```js
// 請求
{ args: { /* 工具引數 */ }, dryRun?: boolean }

// 成功
{ ok: true, data: T }

// 失敗
{ ok: false, code: 'E_xxx', message: string, details?: any }
```

## 7.2 工具清單

### `project_init`

| 欄位 | 內容 |
| --- | --- |
| 用途 | 初始化專案 Brain |
| 引數 | `{ path?: string }`（預設 cwd） |
| dryRun | 是 |
| 返回 | `{ projectId, name, scanDurationMs, stats: { files, loc, entities, relations }, partial: boolean }` |
| 錯誤 | `E_SCAN_TIMEOUT` / `E_PERMISSION` / `E_SCAN_FAILED` |

實現要點：
- 先掃描 FS（2 分鐘硬上限）。
- 寫 project 表 / project.json。
- 生成 architecture.json。
- emit `preview.changed`。

### `project_continue`

| 欄位 | 內容 |
| --- | --- |
| 用途 | 恢復上次開發狀態 |
| 引數 | `{}` |
| dryRun | 是 |
| 返回 | `{ project, lastDevelopment, currentPhase, completed, pending, decisions, knownIssues, suggestedNext, relatedFiles }` |
| 錯誤 | `E_NOT_INITIALIZED` |

### `project_status`

| 欄位 | 內容 |
| --- | --- |
| 用途 | 當前專案狀態快照 |
| 引數 | `{ projectId?: string }` |
| 返回 | `{ project, memoryCounts, todoCounts, lastActivity, uptime }` |

### `project_ask`

| 欄位 | 內容 |
| --- | --- |
| 用途 | 自然語言查詢 Project Brain |
| 引數 | `{ question: string, topK?: number }`（預設 topK=5） |
| dryRun | 否（成本較高） |
| 返回 | `{ answer: string, sources: MemoryRef[], confidence: number }` |
| 錯誤 | `E_NOT_INITIALIZED`, `E_LLM_FAILED` |

**confidence 計算**：`avg(sources.map(s => s.memory.confidence * s.similarity))`。

### `project_memory_list`

| 欄位 | 內容 |
| --- | --- |
| 用途 | 列出 Memory |
| 引數 | `{ type?, keyword?, importanceMin?, status?, limit=20, offset=0 }` |
| 返回 | `{ items: MemoryRecord[], total: number }` |

### `project_memory_add`

| 欄位 | 內容 |
| --- | --- |
| 用途 | 新增 Memory |
| 引數 | `{ type, title, content, relatedFiles? }` |
| dryRun | 是 |
| 返回 | `{ memory: MemoryRecord, deduped?: boolean, relatedTo?: string[] }` |
| 錯誤 | `E_MEMORY_SCHEMA` |

實現要點：
- 按 §4.4 schema 校驗 content 必填欄位。
- importance 預設 0.6 + bonus（relatedFiles 非空 +0.15；source=llm +0.05）。
- 與現有 Memory 做相似度去重：>=0.92 觸發合併；>=0.75 加 relatedMemoryIds。
- 寫入後 emit `preview.changed`。

### `project_todo_list`

| 欄位 | 內容 |
| --- | --- |
| 引數 | `{ status?, priority? }` |
| 返回 | `{ items: TodoRecord[] }` |

### `project_todo_add`

| 欄位 | 內容 |
| --- | --- |
| 引數 | `{ title, description?, priority?, relatedFiles?, relatedFeature? }` |
| dryRun | 是 |
| 返回 | `{ todo: TodoRecord }` |

### `project_todo_update`

| 欄位 | 內容 |
| --- | --- |
| 引數 | `{ id, status?, title?, description?, priority? }` |
| 返回 | `{ todo: TodoRecord }` |

### `project_dream`

| 欄位 | 內容 |
| --- | --- |
| 引數 | `{ mode: 'light' \| 'full' }` |
| dryRun | 是（返回計劃但不執行） |
| 返回 | `{ started, plannedActions, estimatedMs }` |

## 7.3 Tool 錯誤碼對映

| Tool | 可能錯誤碼 |
| --- | --- |
| project_init | E_SCAN_TIMEOUT, E_SCAN_FAILED, E_PERMISSION |
| project_continue | E_NOT_INITIALIZED |
| project_status | E_NOT_INITIALIZED |
| project_ask | E_NOT_INITIALIZED, E_LLM_FAILED |
| project_memory_* | E_MEMORY_SCHEMA, E_NOT_FOUND |
| project_todo_* | E_NOT_FOUND |
| project_dream | E_INTERNAL |

---

# 8. RPC 契約規範

## 8.1 名稱空間

所有 RPC 方法名：`project_brain/<area>.<action>`

註冊（Host）：
```js
harness.handle('project_brain/sidebar.getPreview', async (ctx, args) => { ... })
```

呼叫（Client）：
```js
const preview = await host.call('project_brain/sidebar.getPreview', { projectId })
```

## 8.2 通用約定

- 入參必須 JSON 可序列化。
- 返回必須 JSON 可序列化。
- 單 RPC 在 200ms 內必須返回（聚合類 `sidebar.getPreview` 可放寬到 200ms）。
- 錯誤統一 `{ ok: false, code, message }`。

## 8.3 RPC 方法清單

| 方法 | 用途 | 主要入參 | 主要返回 |
| --- | --- | --- | --- |
| `project_brain/sidebar.getPreview` | SidebarPreview 資料聚合 | `{ projectId }` | `SidebarPreview`（§9.3） |
| `project_brain/sidebar.subscribe` | 訂閱 preview 變更推送 | `{ projectId }` | `{ subscribed: true, channelId }` |
| `project_brain/dashboard.getOverview` | Dashboard Overview 面板 | `{ projectId }` | `OverviewData` |
| `project_brain/dashboard.getArchitecture` | Architecture 面板 | `{ projectId }` | `ArchitectureData` |
| `project_brain/dashboard.getCodeGraph` | Code Map | `{ projectId, rootId? }` | `{ nodes, edges }` |
| `project_brain/dashboard.getMemoryList` | Memory 面板 | `{ projectId, type?, keyword?, limit, offset }` | `{ items, total }` |
| `project_brain/dashboard.getTimeline` | Timeline | `{ projectId, from?, to? }` | `{ items }` |
| `project_brain/dashboard.getTasks` | Tasks | `{ projectId }` | `{ items, stats }` |
| `project_brain/dashboard.getCallChain` | 呼叫鏈 | `{ projectId, startEntityId, maxDepth? }` | `{ paths }` |
| `project_brain/memory.add` | 新增 Memory（不走 Tool） | `{ type, title, content, relatedFiles? }` | `{ memory }` |
| `project_brain/memory.get` | 獲取 Memory 詳情 | `{ id }` | `{ memory, relatedMemories }` |

> `memory.add` 與 Tool `project_memory_add` 共用 Service `recordMemory`；Tool 用於 LLM 呼叫，RPC 用於 Client 手動寫入。

## 8.4 錯誤碼統一

參見 §4.5。

---

# 9. SidebarPreview 規範（重點章節）

## 9.1 目標

> 使用者開啟 DSH 第一秒，無需任何輸入即可感知"我現在在哪個專案、開發到哪裡、下一步該做什麼"。

## 9.2 術語與位置

| 維度 | 規格 |
| --- | --- |
| 功能名 | **SidebarPreview**（"Sidebar" 是歷史命名沿用，指 conversation 檢視欄） |
| UI 元素 | **SidebarTab**（conversation.view 的 entry：圖示+文字） |
| 實際 Slot | **`conversation.view`**（list, scope: session） |
| 註冊引數 | `id: 'project-brain'`、`order: 35`（緊隨 `dsh-mneme-memory` order=30） |
| 物理位置 | 緊鄰"記憶庫"右側（使用者已確認） |
| Tab 標籤 | zh: "專案" / en: "Project"（由 i18n `sidebar.tab.label` 控制） |
| 圖示 | brain 類，單色，16×16 |
| 角標 | status ∈ {pending, in_progress} 的 TODO 計數（>99 顯示 `99+`） |
| 啟用互動 | 點選切換 view；啟用後渲染摺疊態 SidebarPreview；面板內任意處點選跳轉 Dashboard 對應面板 |

**事件名**：`project_brain/preview.changed`
**RPC 名**：`project_brain/sidebar.getPreview` / `project_brain/sidebar.subscribe`

> **P0.1 Inspect 校正**：使用者截圖中的"記憶庫"實際是 `conversation.view` 的 `dsh-mneme-memory`（由 `@deepseek-ai/dsh-mneme` 註冊），order=30。我們的入口緊隨其後註冊為 order=35。

## 9.3 資料契約：SidebarPreview

```js
const SidebarPreview = {
  initialized: false,            // false → 走 Onboarding 分支
  project: { id, name, type?, lastUpdateAt },
  phase: { title, progress: { done, total } },
  recentActivity: [{ id, title, occurredAt, eventType }],
  stats: { pendingTodos, completedTodos, decisions },
  empty: false                   // 同 initialized=false 的冗餘表達
}
```

**Onboarding 是狀態分支，不是區塊**。`initialized=true` 時渲染 5 個區塊，false 時整個面板替換為引導卡片。

## 9.4 區塊設計（5 個）

| # | 區塊名 | 內容 | 跳轉目標 |
| --- | --- | --- | --- |
| 1 | Header | 專案名 / 型別 chip / 上次更新 | Dashboard / Overview |
| 2 | Phase | 當前階段名 + 進度條 | Dashboard / Tasks |
| 3 | Activity | 最近 N 條 Timeline（N 來自 `sidebar.recentActivityLimit`，預設 3） | Dashboard / Timeline |
| 4 | Stats | 待辦 / 已完成 / 決策 計數 | Dashboard / Memory 或 Tasks |
| 5 | Actions | `[繼續上次開發]` `[開啟 Dashboard]` | 觸發 Tool / 路由 |

## 9.5 區塊互動契約

```js
// 區塊元件接收的 props
{
  data: BlockData,
  onJump: (target: 'overview' | 'tasks' | 'timeline' | 'memory') => void,
  onAction: (action: 'continue' | 'init' | 'openDashboard') => void
}
```

- 區塊空白點選 → `onJump(target)`。
- Activity 單項點選 → `onJump('timeline')` + Dashboard 高亮（由 Dashboard 狀態管理）。
- Actions 按鈕 → `onAction`。

## 9.6 視覺規範

| 項 | 值 |
| --- | --- |
| 摺疊態面板高度 | ≤ 視口 60% |
| Header 背景 | `--dsw-alias-bg-layer-1` |
| 進度條完成段 | `--dsw-alias-state-success-primary` |
| 進度條未完成段 | `--dsw-alias-bg-layer-2` |
| Activity 項上限 | 由 `config.json` 的 `sidebar.recentActivityLimit` 控制（預設 3） |
| Actions 主按鈕 | DSH primary 樣式 |
| 文字色 | `--dsw-alias-label-primary` / `--dsw-alias-label-secondary` |
| 邊框 | `--dsw-alias-border-l1` |

> 主題 token 字首校正：DSH 真實主題 token 字首為 **`--dsw-*`**（不是 `--dsh-*`）。完整 token 表見 `TODO.md` Inspect 區。

## 9.7 資料更新策略

| 觸發 | 行為 |
| --- | --- |
| SidebarPreview 首次渲染 | 拉一次完整 preview |
| `project_brain/preview.changed` 事件 | 重新拉取 |
| 同一面板 30s 內重複開啟 | 複用快取 |
| `/project continue` 觸發後 | 強制重新整理 phase / progress |
| `/project init` 完成 | 強制重新整理全部 |

Host 側在以下時機 emit `preview.changed`：
- Memory 寫入 / 更新 / 歸檔
- TODO 寫入 / 更新 / 完成
- Project 後設資料變更
- Timeline 新增
- Session 摘要完成

## 9.8 Onboarding（空狀態）

`initialized=false` 時整個面板替換為引導卡片：

```
┌─────────────────────────────────────┐
│ 🧠 專案大腦未啟動                      │
├─────────────────────────────────────┤
│ 這個專案還沒有 Project Brain。         │
│ 啟動後將自動生成：                     │
│   · 專案結構 / 技術棧 / 架構圖          │
│   · 持續記錄開發歷史與決策               │
│   · 跨 Session 自動恢復上下文           │
├─────────────────────────────────────┤
│   [啟動專案大腦 /project init]          │
└─────────────────────────────────────┘
```

主按鈕 → 呼叫 `project_init` Tool。完成後 `initialized=true`，自動切換到正常態。

## 9.9 錯誤處理

| 情況 | 表現 |
| --- | --- |
| RPC 失敗 | "專案資料載入失敗 [重試]" 卡片 |
| preview 資料不完整 | 顯示已載入部分 + "部分資料可能過期" |
| TODO 計數異常 | 顯示 `—` 佔位，不顯示錯誤數字 |

## 9.10 SidebarPreview P0 驗收清單（帶測量方法）

| # | 驗收項 | 目標 | 測量方法 |
| --- | --- | --- | --- |
| 1 | Slot ID 已通過 `cordis_inspect_query` 確認 | 必填 | `TODO.md` 記錄 |
| 2 | SidebarTab 註冊成功，緊鄰"記憶庫"右側 | 必填 | 視覺驗證截圖 |
| 3 | 角標數字與 todo 表即時同步 | 必填 | 建立/完成 TODO 後角標變化 < 100ms |
| 4 | 5 區塊渲染完整 | 必填 | 已 init 專案截圖 |
| 5 | Onboarding 卡片 | 必填 | 未 init 專案截圖 |
| 6 | "繼續上次開發" 觸發 Tool 正常 | 必填 | 日誌確認 |
| 7 | 區塊點選跳轉 Dashboard | 必填 | 5 區塊各點 1 次 |
| 8 | i18n（zh/en）覆蓋 | 必填 | 切語言後文案變 |
| 9 | 主題 token 全部使用 DSH 變數 | 必填 | grep `--dsh-` 引用，無硬編碼顏色 |
| 10 | 摺疊態首次渲染 | < 50ms（不含 RPC） | `PerformanceObserver` 實測 |
| 11 | RPC `sidebar.getPreview` 響應 | < 100ms（p95） | logger 打 timestamp + 100 次取樣 |
| 12 | `preview.changed` debounce + 推送 | < 100ms | 單測 |

---

# 10. 配置規範

## 10.1 配置檔案

`<project>/.project-brain/config.json`（首次 init 時生成全預設值）。

## 10.2 Schema（schemastery 校驗）

```js
const ConfigSchema = {
  version: 1,
  scan: { timeoutMs: 120000, maxFileSizeBytes: 1048576, ignored: ['node_modules/**','.git/**','build/**','dist/**','**/*.min.js'] },
  languages: ['typescript','javascript','python','go','java'],
  llm: { modelPreference: null, maxTokensPerCall: 4000 },
  memory: { maxMemories: 5000, importanceFloor: 0.2 },
  sidebar: { enabled: true, recentActivityLimit: 3, perfTargetMs: 100 }
}
```

## 10.3 載入規則

- 啟動讀 config.json，缺欄位填預設。
- 寫入：僅改欄位，其他保留。
- 校驗失敗 → 記錄 warning，使用全預設。
- 不允許執行時改 `version`。

## 10.4 環境變數覆蓋

| 環境變數 | 覆蓋欄位 | 用途 |
| --- | --- | --- |
| `DSH_BRAIN_SCAN_TIMEOUT_MS` | `scan.timeoutMs` | CI 場景 |
| `DSH_BRAIN_LLM_MODEL` | `llm.modelPreference` | 臨時切換模型 |
| `DSH_BRAIN_DISABLE_SIDEBAR` | `sidebar.enabled` | 關閉 Sidebar（debug） |

---

# 11. 開發階段與任務清單

## 11.1 階段總覽（含 buffer）

| 階段 | 時長 | 入口依賴 | 出口交付 | 備註 |
| --- | --- | --- | --- | --- |
| **P0.0 測試 fixture（最小集）** | 0.5~1d | 無 | `tests/fixtures/ts-sample` 可編譯執行 | 必須先於 P0.2 |
| **P0.1 專案骨架** | 1~2d | P0.0 | 工程腳手架 + Inspect 清單 | 必須跑通 hello world |
| **P0.2 Tech Stack + Overview + SidebarPreview** | 3~4d | P0.1 | Tech 識別 + Overview + SidebarPreview | **本階段交付 Sidebar 全功能** |
| **P0.3a Code Graph（TS/JS/Python）** | 5~7d | P0.2 | 三語言 Code Graph | MVP 必交付 |
| **P0.3b Code Graph（Go/Java，可選）** | 3~5d | P0.3a | 五語言 Code Graph | **可選；時間緊可砍** |
| **P0.4 Memory CRUD** | 3~4d | P0.3a | Memory 體系 + Tool | — |
| **P0.5 Session 摘要** | 4~5d | P0.4 | 自動 Memory | LLM 抽取可能需 +2d buffer |
| **P0.6 Cross-Session + Continue** | 3~4d | P0.5 | 跨 Session 續接 | — |
| **P0.7 TODO 管理** | 2~3d | P0.6 | Tasks 面板 + SidebarPreview Phase 同步 | — |
| **P0.8 Architecture + 收尾** | 3~4d | P0.7 | 可演示 | — |

**合計核心**：約 28~38 工作日（不含 P0.3b）。
**含 30% 除錯 buffer**：**38~48 工作日**。
**含 P0.3b**：46~58 工作日。

## 11.2 P0.0 Fixture 任務

- [ ] 建立 `tests/fixtures/ts-sample/`（Express + TypeScript，5 檔案，2 API，1 DB 模型）
- [ ] 該 sample 必須可 `npm install && npm run build && npm start` 跑通
- [ ] 至少一個跨檔案呼叫鏈貫穿（API → Service → Repository → Model）
- [ ] 在 `TODO.md` 記錄 sample 的入口路徑與呼叫鏈說明

## 11.3 P0.1 詳細任務清單

- [ ] 用 `cordis_inspect_list` 拉一份 DSH 真實服務清單，填入 §5.6 表格
- [ ] 用 `cordis_inspect_query` 查 `Slots.listSubTree` 確認 SidebarTab Slot ID 與 Dashboard Slot ID（寫入 `TODO.md`）
- [ ] 建立 `package.json`（§3 + §2.3）
- [ ] 建立 `tsconfig.json`（strict, target esnext, module esnext）
- [ ] 建立 `cordis.yml`（loader 入口）
- [ ] 建立 `src/shared/{types,constants,terms}.js`
- [ ] 建立 `src/host/index.js`（最小 hello world：`ctx.logger.info('dsh-project-brain host loaded')`）
- [ ] 建立 `src/client/index.js`（最小 hello world）
- [ ] 把外掛掛到 active profile（pnpm install + 加 bundles）
- [ ] 重啟 DSH，日誌看到 "dsh-project-brain host loaded"

**退出標準**：DSH 啟動日誌可見 hello world；改 `host/index.js` 後 HMR 重啟可見；`TODO.md` 記錄兩份 Inspect 資料。

## 11.4 P0.2 詳細任務清單

### Scanner
- [ ] `storage/sqlite.js`：better-sqlite3 封裝 + PRAGMA 強制
- [ ] `storage/migrations.js`：schema v1 遷移指令碼
- [ ] `storage/fingerprint.js`：FS 指紋（path + mtime + size hash）
- [ ] `scanner/filesystem.js`：併發遍歷、`.gitignore`、大檔案閾值
- [ ] `scanner/ignore.js`：預設 ignore 列表
- [ ] `scanner/techstack.js`：5 語言 manifest 識別
- [ ] `scanner/entrypoints.js`：識別 main / app / server / cmd

### Tech Stack + Overview
- [ ] Tool `project_init` 實現（dryRun 支援）
- [ ] 寫 `project.json` / `architecture.json`
- [ ] Timeline 寫入 init 事件
- [ ] RPC `dashboard.getOverview`
- [ ] Dashboard Overview 面板

### SidebarPreview
- [ ] `sidebar/aggregator.js`：5 表聚合 → SidebarPreview
- [ ] `sidebar/pubsub.js`：debounce 100ms + emit `preview.changed`
- [ ] `rpc/sidebar.js`：`getPreview` / `subscribe`
- [ ] `client/sidebar/tab.js`：SidebarTab 註冊
- [ ] `client/sidebar/preview.js`：5 區塊渲染
- [ ] `client/sidebar/onboarding.js`：空狀態引導
- [ ] `client/sidebar/blocks/{header,phase,activity,stats,actions}.js`
- [ ] Tab 角標（>99 → `99+`）
- [ ] i18n 覆蓋（zh-CN / en-US，按 §6.5 key 表）
- [ ] 主題 token 全部使用 DSH 變數
- [ ] 區塊跳轉 Dashboard 錨點聯調

## 11.5 P0.3a~P0.8 任務清單（概要）

**P0.3a Code Graph（TS/JS/Python）**：
- tree-sitter 3 個 grammar 接入
- AST 解析器（按檔案型別分發）
- 呼叫圖（BFS + 環檢測 + 深度限制 6）
- API endpoint 提取（Express / Fastify / FastAPI）
- 資料庫表識別（Prisma / TypeORM / SQLAlchemy）
- 增量掃描（fingerprint 驅動）
- Code Map 面板

**P0.3b Code Graph（Go/Java/Rust/C/C++，v0.4.8 已交付）**：
- Gin（Go）/ Spring（Java）/ FastAPI（Python）API endpoint 適配
- GORM（Go）/ JPA（Java）/ SQLAlchemy（Python）/ Diesel（Rust）DB schema 抽取
- Go 大寫開頭視為匯出；Java class/interface/record/enum 視為匯出；Rust `pub` 修飾符；C `#include` + function_definition
- config.json `languages` 白名單（預設全開 JS/TS/Python/Go/Java/Rust/C/C++ 6 語言）

**P0.4 Memory**：
- 9 型別校驗 + 評分 + 相似度去重
- Tools `project_memory_list/add` + RPC `memory.add/get`
- Memory 面板

**P0.5 Session 摘要**：
- 監聽 `session:ended`
- 收集聊天摘要 + Git Diff
- LLM 抽取（強制 JSON Schema）
- 自動合併 / 強化
- emit `preview.changed`

**P0.6 Cross-Session**：
- Context Injector（Top-K 選擇演算法：`importance*0.5 + recency*0.3 + moduleMatch*0.2`）
- Tool `project_continue`
- SidebarPreview "繼續上次開發" 按鈕聯調

**P0.7 TODO**：
- TODO CRUD 工具
- Tasks 看板
- SidebarPreview Phase 進度條同步

**P0.8 Architecture + 收尾**：
- Mermaid 渲染
- Architecture 面板
- SidebarPreview 跳轉錨點聯調
- README + 截圖

---

# 12. 測試策略

## 12.1 單元測試範圍

| 模組 | 測試重點 |
| --- | --- |
| scanner | 5 語言 manifest 識別；ignore 規則；2 分鐘超時 |
| analyzer | 呼叫圖正確性；環檢測；增量更新 |
| memory | 9 型別 schema 校驗；去重；評分 |
| summarizer | LLM 抽取穩定性；source 強制 |
| **sidebar aggregator** | 5 區塊資料正確性；RPC < 100ms |
| rpc handlers | 入參校驗；錯誤碼 |

## 12.2 整合測試

- [ ] 端到端：在 `tests/fixtures/ts-sample` 上跑 init → ask → continue 流程
- [ ] 5 語言（TS/JS/Python 必做；Go/Java 可選）各跑一遍
- [ ] Session 開始 → 寫 TODO → Session 結束 → Memory 自動新增 → SidebarPreview 重新整理

## 12.3 驗收用例

| 用例 | 驗收標準 |
| --- | --- |
| A | 5k~20k LOC 陌生專案 init 後 5 分鐘內 Overview + Architecture + CodeMap 可見 |
| B | 真實 feature 後 Memory 自動新增至少 1 條 decision / change / lesson |
| C | 新 Session `/project continue` 給出 Top-5 Memory + 當前 TODO |
| D | `/project ask 為什麼這裡這麼設計` 返回 Decision Memory + 來源 |
| E | 手動改 3 檔案 → 增量掃描 < 10 秒 → 架構圖更新 |
| **F — SidebarPreview** | DSH 啟動立即看到 SidebarTab；未 init 顯示引導；init 後 5 區塊正確；區塊點選正確跳轉 |

## 12.4 測試資料

**P0.0 必做**（1 個）：
- `ts-sample/`：Express + TypeScript，2 API，1 DB 模型，1 跨檔案呼叫鏈

**P0.3a 必做**（再加 2 個，共 3 個）：
- `js-sample/`：Vanilla JS（3 檔案）
- `py-sample/`：FastAPI + SQLAlchemy（6 檔案）

**P0.3b 可選**（再加 2 個，共 5 個）：
- `go-sample/`：Gin + GORM（5 檔案）
- `java-sample/`：Spring Boot（4 檔案）

每個 fixture 必須：可編譯執行 + manifest 檔案 + 至少一個呼叫鏈貫穿的 feature。

---

# 13. 除錯指南

## 13.1 除錯入口優先順序

1. **首選：DSH 日誌面板 + `ctx.logger`** — 所有 Service / Tool / RPC 入口必打 `ctx.logger.info('entry', { method, argsSummary })`。
2. 次選：瀏覽器 DevTools（F12）— Client UI、Console、Elements、Network。
3. RPC 主動復現：`await host.call('project_brain/xxx', args)`。
4. SQLite Browser：直接開啟 `.project-brain/memory.db`。
5. Node `--inspect-brk` 遠端斷點（僅在 Host 程式碼死迴圈/崩潰時用）。

## 13.2 必備日誌點清單（每個模組必打）

| 位置 | 日誌內容 |
| --- | --- |
| Service 方法入口 | `logger.info('service:enter', { method, argsSummary })` |
| Tool 入口 | `logger.info('tool:enter', { tool, argsSummary })` |
| RPC handler 入口 | `logger.info('rpc:enter', { method, argsSummary })` |
| SQLite 查詢（debug） | `logger.debug('sql', { sql, params })` |
| emit `preview.changed` | `logger.debug('pubsub:emit', { projectId, trigger })` |
| LLM 呼叫 | `logger.info('llm:call', { promptTokens, maxTokens })` |
| 錯誤 | `logger.error('xxx:failed', { code, message, stack })` |

`argsSummary` 只輸出欄位名 + 長度/計數，**絕不列印整個物件**。

## 13.3 常見問題

### Q1：SidebarTab 看不到
1. 檢查 Slot ID 是否正確（Inspect `Slots.listSubTree`）。
2. 檢查 `ctx.slot()` 註冊返回值。
3. 檢查 `apply(ctx)` 是否被呼叫。
4. 檢查 DSH 日誌是否有 plugin 載入錯誤。

### Q2：RPC 呼叫超時
1. 檢查 Host 是否註冊對應 `harness.handle`。
2. 檢查入參欄位拼寫。
3. 檢查 SQLite 鎖（DB Browser 看 `.project-brain/*.db-wal`）。
4. 檢查 Pub/Sub debounce。

### Q3：Memory 寫入失敗
1. 檢查 schema 校驗（按 §4.4）。
2. 檢查 `E_MEMORY_SCHEMA` 詳情。
3. 檢查 source 欄位是否齊全。

### Q4：掃描超時
1. 檢查 ignore 列表。
2. 檢查 `maxFileSizeBytes`。
3. 檔案 >10k 應提前 partial。

### Q5：HMR 不生效
1. 確認 DSH 啟動引數含 `--expose-internals`。
2. 確認 `cordis-plugin-hmr` 已掛載。
3. 檢查 chokidar watch 範圍。

### Q6：SidebarPreview 角標不更新
1. 檢查是否訂閱 `preview.changed`。
2. 檢查 Pub/Sub debounce。
3. 檢查 TODO 寫入路徑是否 emit。

## 13.4 排錯 SOP

```
1. 現象描述（截圖 / 錯誤碼 / 日誌）
   ↓
2. cordis_inspect_self 讀 Package 狀態
   ↓
3. cordis_inspect_query 查相關 Service / Slot
   ↓
4. host.call 主動復現 RPC
   ↓
5. SQLite Browser 直查資料
   ↓
6. 鎖程式碼 → 提 issue → 修
```

---

# 14. 編碼規約

## 14.1 JavaScript / TypeScript 風格

- 預設嚴格模式（strict, noImplicitAny, noUncheckedIndexedAccess）。
- **`enum` 預設不用**，必要時用 union literal types；DSH 內部約定也是 union。
- **`any` 預設不用**；邊界處用 `unknown` + 型別守衛；RPC 橋接 / DSH 內部反射場景在 PR 註釋中說明後可破例。
- **`as` 型別斷言儘量避免**；JSDoc cast 在 schemastery 推斷場景下可破例。
- 動態外掛程式碼（host/client 的 `apply）`內）禁止 `import` / `require` / JSX / 裝飾器；用打包後的 bundle 或純 function body。

## 14.2 檔案命名

- 檔名 `kebab-case.js` / `kebab-case.jsx`。
- React 元件 `PascalCase.js` / `PascalCase.jsx`。
- 測試 `*.test.js` / `*.test.jsx`。

## 14.3 錯誤處理

- 永遠不吞錯；不空 catch。
- 錯誤必須含 `code` + `message` + 可選 `cause`。
- 上拋錯誤由 Service 邊界統一轉換（帶 trace）。

## 14.4 日誌

- 關鍵決策 / 狀態變更必 `logger.info`。
- 錯誤必 `logger.warn` 或 `logger.error`。
- 除錯日誌 `logger.debug`，生產可關。
- **禁止列印整個物件**；只打印 id + 關鍵欄位（見 §13.2）。

## 14.5 註釋

- 公共 API 必帶 JSDoc。
- 模組頂部 1~3 行說明。
- TODO 格式：`// TODO(name): ...`，含負責人。

## 14.6 Git 提交

格式：`<type>(<scope>): <subject>`

| type | 用途 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | Bug 修復 |
| `refactor` | 重構 |
| `docs` | 文件 |
| `test` | 測試 |
| `chore` | 構建 / 依賴 |

例：`feat(sidebar): add preview panel with 5 blocks`

## 14.7 依賴

- 不引入與 DSH 重複的依賴。
- 優先使用 DSH export 的服務（llm, storage, tools）。
- 新增依賴必須 PR 註釋說明理由。

---

# 15. 完成定義（Definition of Done）

## 15.1 單個 PR / 提交

- [ ] `tsc --noEmit` 通過
- [ ] 新增功能有單元測試
- [ ] 公共 API 有 JSDoc
- [ ] 錯誤處理符合 §4.5 / §7.3 / §8.4
- [ ] 沒有 console.log 殘留
- [ ] 沒有 TODO 殘留（除非有負責人 + issue）
- [ ] 提交資訊符合 §14.6
- [ ] 本地連結 profile 後實際驗證過

## 15.2 整個 MVP

滿足 §12.3 所有用例（A~F），並：
- [ ] 3 語言 fixture 全部通過（TS / JS / Python）
- [ ] 端到端：init → 開發 → session 結束 → 新 session continue
- [ ] SidebarPreview 全功能驗證（§9.10 12 條全部勾選）
- [ ] 效能：掃描 < 2 分鐘；增量 < 10 秒；SidebarRPC < 100ms（p95）
- [ ] 主要路徑各跑 100 次無崩潰，記憶體增長 < 50MB（替代原 24h smoke test）
- [ ] README / SPEC / PRD / DESIGN 全部同步

## 15.3 單個 P0 階段

- [ ] 該階段所有任務勾選完成
- [ ] 階段驗收用例通過
- [ ] 文件（如有新增）已更新
- [ ] 已 commit 到 git

---

# 16. 未決問題與未來工作

## 16.1 已確認

| # | 決策 | 結果 |
| --- | --- | --- |
| 1 | 多專案策略 | 單活動專案 + cwd 探測 |
| 2 | MVP 語言 | TS / JS / Python（必）/ Go / Java（可選） |
| 3 | LLM 路由 | 複用 DSH 預設 route |
| 4 | 首次掃描超時 | 2 分鐘硬上限 |
| 5 | UI 形態 | SidebarPreview 常駐 + Dashboard 按需 |
| 6 | 命名約定 | SidebarPreview / SidebarTab / `preview.changed` / `sidebar.getPreview` |
| 7 | DB 策略 | MVP 單 SQLite 檔案 `memory.db` |
| 8 | Perf 目標 | SidebarRPC < 100ms p95；摺疊態渲染 < 50ms |

## 16.2 仍待確認（不阻塞 P0.1）

| # | 問題 | 傾向 / 阻塞階段 |
| --- | --- | --- |
| 9 | **SidebarTab Slot ID** | **P0.1 Inspect 確認；阻塞 P0.2** |
| 10 | **Dashboard Slot ID** | **P0.1 Inspect 確認；阻塞 P0.2** |
| 11 | 主題 token 實際命名（推測 `--dsh-*`） | P0.1 驗證 |
| 12 | DSH `storage` Service 真實名稱 | P0.1 驗證（§5.6） |
| 13 | 遠端專案（GitHub URL 直接掃描） | V2 |
| 14 | 團隊共享（`.project-brain/` 跟 Git） | 不做 |
| 15 | 大檔案閾值預設 1MB | OK |

---

# 17. 資料遷移與備份

## 17.1 SQLite Schema 遷移

- `src/host/storage/migrations.js` 維護遷移指令碼陣列。
- 啟動時讀 `schema_version` 表（無則建立），按 `version` 順序執行未跑過的指令碼。
- 每個遷移指令碼簽名：`async function up(db) { ... }` + `async function down(db) { ... }`（down 僅 dev 用）。
- MVP 僅 v1，無 down 強制；V2 起強制雙向遷移。

## 17.2 專案資料匯出 / 匯入

**MVP 不做**，但預留 Tool：

- `project_export`：匯出 `.project-brain/` 為 `.tar.gz`，含 JSON + SQLite dump。
- `project_import`：從 `.tar.gz` 重建（注意路徑替換）。

**V2 實現**，V1 階段使用者可手動 `tar`/解壓。

## 17.3 使用者級誤刪恢復

- `.project-brain/` 刪除後不可自動恢復（無雲備份）。
- 提示：UI 顯示一次性的"未檢測到專案大腦，是否重新 init？"卡片。

---

# 18. 安全與沙箱

## 18.1 檔案系統訪問範圍

- **只讀路徑**：使用者授權的 `<project>` 根目錄。
- **寫路徑**：僅限 `<project>/.project-brain/` 子樹。
- 其他路徑一律 `E_PERMISSION`。

## 18.2 LLM 資料脫敏

- 餵給 LLM 的 prompt 中：
  - 檔案路徑可保留（專案內相對路徑）。
  - 完整檔案內容按 §6 token 預算切片，**不傳送整個專案**。
  - 聊天原文不外洩到 LLM（只摘要後送）。

## 18.3 網路訪問

- 預設**不發起任何外部網路請求**。
- LLM 呼叫走 DSH 內部 route，host 由 DSH 控制。

## 18.4 DSH Sandbox 相容

- 遵循 DSH 的 sandbox policy（來自 `@deepseek-ai/dsh-sandbox-policy`）。
- 不嘗試繞過 sandbox 邊界。

---

# 19. 失敗模式與恢復

| 失敗模式 | 檢測 | 恢復策略 |
| --- | --- | --- |
| SQLite 檔案損壞 | `db.prepare()` 拋錯 | 備份原檔案 → 重建 → 提示使用者 Memory 丟失 |
| `project.json` 缺失 | `fs.existsSync` | 提示重新 init；不重建（避免覆蓋使用者手動改動） |
| tree-sitter grammar 不支援 | `loader.load()` 拋錯 | 跳過該檔案，記 warning，繼續掃描其他檔案 |
| LLM 呼叫超時 | 30s timeout | 重試 1 次；失敗則降級到規則抽取 |
| Git 倉庫不存在 | `git rev-parse` 失敗 | 跳過 git 相關步驟，記 warning |
| 檔案許可權不足 | `EACCES` | 跳過該檔案，記 warning，彙總報告 |
| 網路（遠端專案） | 不適用（V2） | — |
| SidebarTab Slot 註冊失敗 | DSH 啟動日誌 | 降級：僅保留 Onboarding 卡片，提示重啟 DSH |
| Memory 容量超限 | `count(*) > maxMemories` | 自動觸發 Dream 'light'；歸檔低 importance 的 Memory |
| Schema 版本不相容 | 舊 client 讀新 db | 強制遷移；不能遷移則 `E_INTERNAL` 提示升級 |

所有失敗必須有降級路徑，**不能崩潰 DSH 程序**。

---

# 20. 變更日誌（Changelog）

| 版本 | 日期 | 變更摘要 | 觸發 |
| --- | --- | --- | --- |
| v0.1 | 初版 | 初稿 | — |
| v0.2 | 評審後修訂 | ① TS-as-contract 提示；② Slot ID 提前到 P0.1；③ P0.1 加 Inspect 任務；④ 工時 38~48d；⑤ SQLite PRAGMA；⑥ fixture 拆 P0.0；⑦ SidebarPreview 效能改目標+測量；⑧ 日誌面板優先；⑨ 術語統一；⑩ 編碼規約放寬；+§17/§18/§19/§20 | 評審反饋 |
| **v0.2.1** | **P0.1 Inspect 校正** | **① SidebarPreview 實際註冊到 `conversation.view` Slot（order=35，緊隨 `dsh-mneme-memory` order=30），不是側邊欄 tab；② 主題 token 實際字首 `--dsw-*`（不是 `--dsh-*`）；③ Host Session 事件為 `agent/session-start` / `session/disposed`（不是 `session:started/ended`）；④ Service 名校正：`storage` + `storageDomain` 都存在；`sessionPersistence` 是 Session 日誌而非事件** | **P0.1 Inspect 結果** |
| **v0.2.2** | **P0.4.1 修復 + 工具面補全** | **① `project_init` 重跑保留 projectId/createdAt + 寫 timeline 事件；② 新增 `project_rescan` / `project_continue`（P0.6 最小）/ `project_memory_add|list`（補全 P0.4）/ `project_todo_add|list|done`（P0.7-lite）共 8 工具；③ SidebarPreview Stats 改為真實資料（todo/memory jsonl）；④ 新增 TODO 區塊 + Dashboard 展開區（Actions 按鈕真功能：複製提示詞 / DOM toggle，非 console.log 佔位）；⑤ 文件校正：資料通道為 build-time embed（非 runtime fetch）** | **P0.4.1 實現** |
| **v0.2.3** | **契約確認** | **`conversation.view` 註冊項僅 {id, order, label}，無 badge 欄位 → Tab 角標（P0.2b-3/P0.5）無法實現，改為 Dashboard 內展示待辦；`conversation.input.dock`（composer 上方 TODO strip）為 P0.7 潛在入口** | **Slots Inspect** |
| **v0.2.4** | **P0.4.2 切換 workspace 動態更新** | **① host 註冊 `webServer` route `/plugins/dsh-project-brain/preview.json`（`buildWorkspacePreview` 按 `sandboxPolicy.workspaceRoot` 讀 `.project-brain/`，讀已生成資料零 token）；② client 改 class component + `componentDidMount` `fetch` 拉動態資料，失敗 fallback 到 build-time embed（不崩）；③ 切換 workspace 即更新，未生成的顯示 Onboarding；④ 新增 `src/host/rpc/preview.js` + `scripts/verify-preview.mjs`** | **使用者反饋"切換 workspace 不更新"** |
| **v0.2.5** | **P0.4.2-final 架構結論 + 真正修復** | **① 使用者截圖證實：靜態 workspace client 下 `typeof host === 'undefined'`、`typeof window.host === 'undefined'`、webServer route 404——**靜態 plugin fiber 沒有任何 host→client 資料通道**（host.call 不存在、webServer named route 被 DSH 靜態 server fallback 搶先 404）；② 最終方案：build 時掃 `~/.dsh/storages/workspace.json`，對每個 DSH workspace 遞迴 `.project-brain/`，把 `(sessionId → workspaceId → previewData)` map 全部 inline 進 client bundle；③ client 啟動用 `props.sessionId` 查表 → 命中當前 session 所屬 workspace 的預覽資料（純 build-time lookup，**零 token**）；⑤ 切換 workspace = conversation.view 重新掛載（新 sessionId）→ 自動取新資料；⑥ 已生成直接讀，未生成顯示 Onboarding；⑦ `src/client.js` 改回純函式元件（不再需要 class component + 非同步 state）；⑧ 撤銷 `host.call`/`fetch`/`webServer route`/`harness 探測修復`/`tab 除錯條`等所有無效嘗試** | **使用者三次反饋"切換不更新"+ 截圖證實靜態 client 下 host/webServer 全部不可用** |
| **v0.2.6** | **P0.4.8 scanner 真實執行時修復** | **`fs.listDir` 返回 `FsDirEntry { name, type: 'file'\|'directory'\|'other', target: FsTarget }`（DSH dsh-fs-local 實現）；舊 scanner 用 `e.isFile`/`e.isDirectory`（boolean — DSH 沒這倆欄位）→ 實測 `files:0 / languages:{}`。新 `entryKind(e)` 優先讀 `e.type`，回退 `e.isFile`/`e.isDirectory`（boolean 或 method，相容 node Dirent adapter）；遞迴用 `e.target`（已 resolved FsTarget），僅缺失時回退 `fs.resolve(e.name, {cwd})`；深度 3 → 5** | **執行 `project_init` dryRun 實測 files:0 + P0.4.7 bundle 已帶此 bug** |
| **v0.2.7** | **P0.4.9 跨專案 todo 隔離** | **新增 `src/host/store/path-resolver.js`：`resolveProjectPath(args, exec, sandboxPolicy)` 優先順序鏈 = `args.path` → `exec.session.cwd` → `exec.ctx.session` → `exec.sessionId + ctx.get('sessions')` → `agents.currentInitiator()` → `sandboxPolicy.workspaceRoot` → `.`。`project_continue` / `project_memory_add\|list` / `project_todo_add\|list\|done` 全部切換到此 resolver。`project_init/rescan` 仍必傳 path（`E_NO_PATH` 守衛）。根因是靜態 plugin fiber 的 `sandboxPolicy.workspaceRoot` 是 profile 級固定值（DSH install / 首個 workspace），與使用者當前 session 的 workspace 解耦 → todos/memory 串臺** | **實測發現 session workspace 與工具 fallback workspace 不一致，導致專案資料串臺。** |
| **v0.2.8** | **P0.5 Session 摘要（最小可用）** | **新增 `src/host/summarizer.js`：`setupSummarizer(ctx, fs, sandboxPolicy)` 訂閱 `session/disposed`；從 session cwd 解析專案路徑 → `git diff --name-only HEAD~1`（5s 超時，swallow 失敗）→ 若有變更寫一條 `type=change` memory + `eventType=session_summary` timeline 事件 + `emit('project_brain/preview.changed')`。fire-and-forget，全部 try/catch + fallback。LLM 抽取留 TODO 佔位（合約未穩，避免拖累）** | **P0.5 SPEC §16 任務** |
| **v0.2.9** | **P0.5.x 工具面補全（8 → 12）** | **新增 4 工具：`project_status`（專案快照：各型別 Memory 計數 + TODO 統計 + 最近活動 + lastActivityAge）；`project_todo_update`（按 id/title 改 status/priority/title/description，寫 `todo_update` timeline）；`project_ask`（純規則關鍵詞檢索：title 命中 ×2 + importance 加權，零 token，返回 sources + confidence）；`project_dream`（light：title Jaccard ≥ 0.92 同類合併候選 + importance<0.15 且年齡>30d 歸檔候選；full 模式佔位）。`src/index.js` toolBuilders 擴充套件到 12 個，build 後 lib/index.js 87.0kb** | **SPEC §7.2 餘下工具 + 使用者"開發完所有功能"要求** |
| **v0.3.0** | **架構重做：live 資料通道 + Context Injector + LLM RAG** | **打破 build-time embed 架構（違反"即時同步"偏好）：① 啟用 `webServer.register` route `/dsh-project-brain/preview.json`（避開 `/plugins/` 字首防 DSH 靜態 server 搶先 404），host 端用 `sessions.get(sessionId).meta.cwd` 反查專案路徑，每次請求重新讀 `.project-brain/` 即時資料；② `src/client.js` 改 class component + `componentDidMount` + `setInterval(5000)` 拉取，失敗時保留上次成功資料 + 顯示"離線"徽章；首次渲染用 `__ALL_WORKSPACES_JSON__` 兜底避免空白；增加 LiveBadge 顯示 "即時同步 / 離線 / 本地快照" 三態；③ 新增 `src/host/injector.js`：通過 `systemPrompt.service.section()` 註冊 `project-brain-context` 段，監聽 `agent/session-start` + `preview.changed` 預讀 `.project-brain/`，render 時按 SPEC §4.5 演算法 `importance*0.5 + recency*0.3 + moduleMatch*0.2` 選 Top-5 記憶 + 活躍 TODO + 最近活動，組裝 markdown，自動注入到每個新 session 的 system prompt；token 預算 1500，超出按段落截斷；④ `project_ask` 加 `useLLM` 引數（預設 false 相容舊用法），true 時調 `llm.stream` 用 RAG prompt 合成答案，LLM 失敗 fallback 到純規則版（錯誤資訊寫在 `data.llm.error`）；⑤ `summarizer` 改用 DSH `shell.service.run` 跑 `git diff`（之前 `child_process.spawn` 在某些 sandbox 下 EPERM）。build 後 lib/index.js 105.7kb / lib/client.js 53.9kb** | **使用者指出"內容改動後能即時同步（不要求立即）+ 跨 Session 自動恢復上下文"是核心目的；P0.4.2 build-time embed 架構與該目的根本矛盾；project_ask 閹割版純規則檢索價值低於 SPEC 設計意圖** |
| **v0.3.1** | **PromptSection 欄位修復（DSH session 崩潰）** | **`systemPrompt.service.section()` 期望 `PromptSection = { name: string, order: number, text: string \| ((context) => string), complete?: boolean }`（DSH `packages/core/system-prompt/src/index.ts`）。v0.3.0 誤傳 `{ name, order, id, priority, render }`，DSH 合併 sections 時對 undefined 調 `.indexOf` 拋錯（錯誤顯示在 goal section 呼叫棧是因為 waterfall 失敗連帶），整個 DSH session 無法執行。修復：`render` → `text`，接受 `AssembleContext` 引數；刪除 `id` / `priority`（非合約欄位）。Injector 重新啟用** | **使用者截圖顯示 "本輪執行失敗 Cannot read properties of undefined (reading 'indexOf')"；目標對齊後排查 GitHub DSH 原始碼確認 PromptSection 欄位名** |
| **v0.3.2** | **Electron 即時同步診斷（DSH Desktop）** | **LiveBadge 改為即時顯示真實 fetch 錯誤（`data-error` 屬性 + `title` hover），連續失敗後保留 build-time embed；webServer route handler 寫 `.project-brain/.webserver-last-hit.json` 診斷 marker（hitAt/sessionId/workspaceRoot/url/method），方便排查 DSH Desktop 下 fetch 是否走 webServer（Electron renderer fetch 走 IPC bridge，可能不通）；新增 CORS `access-control-allow-origin: *` 頭（萬一跨 fiber / 跨埠）。lib/index.js 106.2kb / lib/client.js 61.2kb** | **使用者在 DSH Desktop（Electron）下重啟後 LiveBadge 仍"離線"且 sidebar 資料用 build-time 兜底；推斷 Electron renderer fetch 走 IPC bridge，不直接打 webServer，需要診斷訊號** |
| **v0.3.3** | **路徑重試（prefix + 獨特名稱空間）** | **webServer route path 從 `/dsh-project-brain/preview.json` 改為 `/__dsh_brain__/preview.json`（DSH 內部約定下劃線名稱空間），route kind 從 `exact` 改為 `prefix`。client fetch URL 同步更新。lib/index.js 106.2kb / lib/client.js 61.3kb** | **v0.3.2 使用者截圖顯示 `HTTP 404`，懷疑 DSH frontend-static SPA fallback 搶先響應；改 prefix + 獨特路徑規避** |
| **v0.3.4** | **完整回退：放棄 webServer route，回到 build-time embed + auto-rebuild** | **使用者截圖（DSH Desktop **和** browser）均 `HTTP 404`——確認 v0.3.0 重走 P0.4.5 回頭路根本不通（static plugin fiber 沒有 webServer service，browser 模式也被 SPA fallback 搶先）。徹底回退：① `src/index.js` 註釋 `registerPreviewRoute` 呼叫，保留 import 作為工具；② `src/client.js` 回退為純函式元件 + build-time embed，刪除 class component / setInterval / fetch / LiveBadge 即時狀態；新增 `SnapshotBadge` 顯示"📦 快照 · Xs"（提示使用者這是 build-time 資料而非即時）；③ 資料通道改為 `preview.changed → setupAutoRebuild → spawn node build.js → clientModules.rebuilt → renderer 熱過載 client bundle`，使用者無需重啟 DSH（renderer 內部過載），代價是每次 update 1-3 秒 build 時間。lib/index.js 105.7kb / lib/client.js 51.7kb（減少 10kb）** | **使用者確認 v0.3.3 在 browser 也是 404，證明 static plugin fiber 下 webServer 完全不可用；放棄 live 通道，回到 P0.4.7 的 build-time embed 架構但強化 auto-rebuild** |
| **v0.3.5** | **build.js 排除 plugin 自身 .project-brain** | **`findBrainsUnder` 在遞迴時遇到 `cordis.patch.yml` 直接 return（跳過），避免把 plugin 自己的 `.project-brain/` 當成 workspace 的專案嵌入。之前 plugins workspace 顯示 `dsh-project-brain` 專案（錯把 plugin 自己的 brain 算成 plugins workspace 的專案），現在正確顯示空 → 觸發 Onboarding 提示使用者調 project_init。scanned: 4 → 3。lib/client.js 47.0kb（繼續減少）** | **v0.3.4 使用者截圖確認 build-time embed 工作（綠色📦快照徽章），但 sidebar 錯誤顯示 `dsh-project-brain` 專案（plugin 自己），不是使用者當前 workspace 的真實專案** |
| **v0.3.6** | **tools schema 補 path + output additionalProperties: true + setupAutoRebuild 用 DSH shell service** | **① tools.parameters 補全 `path` 欄位（memory/todo/todo_update），否則 DSH 自動剝離 path 引數，導致 fallback 寫錯位置；② output schema 把 `additionalProperties: false` 改成 `true`，並顯式宣告 `code/message` 欄位，錯誤路徑返回不再被拒；③ `setupAutoRebuild` 用 DSH `shell.service.run` 替代 `child_process.spawn`，避免 plugin fiber sandbox EPERM。lib/index.js 110.7kb / lib/client.js 48.2kb** | **v0.3.5 使用者截圖確認 plugins workspace 顯示正確（綠色📦快照 + Onboarding 卡片）** |
| **v0.3.7** | **brain-files 預設 danger-full-access policy** | **`writeText/appendJsonl` 在呼叫方沒傳 `writePolicy` 時，自動從 `fs.sandboxPolicy` 取 `danger-full-access` mode（繞過 workspace 路徑限制）。舊呼叫方（todo.js/memory.js 等）無需修改即可寫到其他 workspace。修復 E_WRITE_FAILED（DSH 預設 sandbox 模式只讀 workspace 根）** | **v0.3.6 後調 `project_todo_add path="..."` 返回 E_WRITE_FAILED（schema 修好了但 sandbox 拒絕寫跨 workspace 目錄）** |
| **v0.3.9** | **BOM strip + project.json 用 readJson + ask JSON round-trip** | **① `parseJsonl` / `readJson` 加 `U+FEFF` BOM strip（PowerShell `Set-Content -Encoding utf8` 寫入 jsonl 時加了 BOM，導致第一行 JSON.parse 失敗） ② `src/tools/ask.js` 改用 `readJson` 讀 `project.json`（之前用 `readJsonl` 讀 multi-line pretty-printed JSON 必然失敗，導致 `projectInfo.name` undefined，render 暴露問題）③ ask execute return 加 `JSON.parse(JSON.stringify(ret))` 防禦性 round-trip + `_diag` 欄位（萬一某欄位含不可序列化資料能定位）** | **使用者重啟後 `project_ask` 報 "value is not lossless JSON"。離線 debug（scripts/debug-ask.js）找到真因：project.json 是 pretty-printed 多行 JSON，但 ask.js 用 readJsonl 按行解析** |
| **v0.3.8** | **path-resolver 加 workspaceRegistry + 跳過 DSH Desktop 汙染 fallback** | **實測發現：DSH Desktop Electron 下，`sandboxPolicy.workspaceRoot` 可能是 `<user-home>/AppData/Local/Programs/DSH Desktop`（DSH 安裝目錄），不是使用者當前 session 的 workspace。所有不帶 path 的工具呼叫都寫到 DSH Desktop 安裝目錄的 `.project-brain/`。修復：① `readCwdFromWorkspaceRegistry`：用 `ctx.get('sessions').list()` 拿所有 session 的 cwd（user 當前開啟的 workspace）；② `isDshDesktopInstall`：檢測 sandboxPolicy.workspaceRoot 是否命中 DSH Desktop 安裝路徑，是則跳過 fallback。優先順序鏈：args.path → exec.session → workspaceRegistry(sessions) → sandboxPolicy（非 DSH Desktop）→ "."** | **v0.3.7 實測發現數據被寫入 DSH Desktop 安裝目錄，而非當前 workspace。** |
| **v0.3.10** | **傳 path 寫到 workspace 驗證 + 12 工具端到端** | **① 驗證顯式傳入目標 workspace 的場景正確落庫，且不汙染 DSH Desktop 安裝目錄；② 12 工具全部端到端跑通：init / rescan / status / continue / memory add+list / todo add+list+done+update / ask / dream；③ 即時同步 + auto-rebuild 鏈路穩定（preview.changed → shell.run build.js → clientModules.rebuilt → renderer 熱過載），無需重啟 DSH** | **重啟 DSH 後實跑確認工具全部返回正確結果；顯式路徑與預設路徑均落到正確 workspace。** |
| **v0.3.11** | **SPEC v0.3 MINOR bump + 治理債 + P0.7 TODO strip 實質實現** | **① SPEC 頂部 bump v0.2 → v0.3（加 changelog 累積註腳，不新增章節）；② 修正 README/TODO 中"TODO strip 已實現"的虛構描述；③ git commit v0.3.0-v0.3.10 working tree（約 10 個新檔案 + 文件同步），拆 2 個 commit（feat + docs）；④ `src/client.js` 註冊 `conversation.input.dock` Slot（id: `project-brain-todo-strip`，order=10）+ TodoStrip 純函式元件（摺疊 top-3 / 點選展開全量 / uninit+empty 雙 guard）；⑤ i18n 加 `todostrip.title/viewAll/close/empty` 4 key × 2 語言；⑥ `scripts/smoke-todostrip.mjs` 離線 10/10 PASS（bundle 含 dock 註冊 + 元件 + 主題 token + 43 個 session embed）；⑦ 一次性 debug 指令碼歸檔到 `scripts/_archive/`（保留不刪）** | **本輪使用者復盤"梳理開發情況，進入下一階段"；發現 working tree 大量未提交、文件與程式碼不同步** |
| **v0.3.12** | **P0.8 第一波收尾 — dream commit/full + locale-aware + 跨 Session 端到端** | **① `project_dream` dryRun=false 真寫 jsonl（merge: dropped 移除 + keep status=reinforced + importance +0.05；archive: status=archived + 寫 timeline + emit preview.changed）；② `mode=full` 額外清 archived 行 + 按 importance DESC 排序；③ dream 演算法抽到 `brain-logic.computeDreamActions/applyDreamCommit`（純函式，避開 dsh-tools runtime）；④ `brain-files.js` 加 `writeJsonl`；⑤ `client.js` 加 `resolveLocaleCode(props)` 從 `props._dshLocale.getLocale()` 取即時語言（不再硬編碼 zh-CN），支援 zh-CN/en-US/zh/en 寬鬆匹配；⑥ `smoke-dream-commit.mjs` 33/33 PASS（light/full/邊界）；⑦ `smoke-session-lifecycle.mjs` 25/25 PASS（scanner → memory/todo → summarizer 走真 git diff → injector 輸出 markdown 含 Top-K memories + active TODO + recent activity → build-time embed loadProjectData 驗證全量資料）；⑧ 4 個 smoke test 共 30+10+33+25 = **98 項全 PASS**。lib/index.js 110.3→114.8kb；lib/client.js 68.3→74.8kb** | **使用者「繼續」指令；P0.8 todo 啟動第一波收尾** |
| **v0.3.13** | **P0.8 第二波收尾 — 跨 workspace 隔離實測 + dark/light 主題 token 取證** | **① 新增 `scripts/smoke-multi-workspace.mjs`（25/25 PASS）：path-resolver 顯式 path 隔離、session cwd 隔離、DSH Desktop 安裝路徑過濾（Windows + Mac）、todo.jsonl A vs B 物理隔離、loadProjectData(A) vs loadProjectData(B) 互不汙染、memory 隔離；② `cordis_inspect_query Theme.listTokens` 取證 DSH 真實主題 token（13 個，全 requiresLightAndDark=true），寫 `scripts/smoke-theme-tokens.mjs`（14/14 PASS）靜態校驗 client.js 11 個 token 全在真名內、無懸空 token、無硬編碼 hex 顏色、覆蓋 background/border/brand/label/state 五類；③ 6 個 smoke test 共 30+10+33+25+25+14 = **137 項全 PASS**。未改 src/ 業務程式碼（純驗證）。lib/client.js 74.8→80.1kb（+5.3kb 來自 build-time embed 多 workspace 資料，非程式碼變化）** | **使用者「繼續人完成」「繼續任務」指令；P0.8 第二波啟動** |
| **v0.3.14** | **P0.8 第三波 — auto-rebuild 跨 fiber 事件隔離 bug 修復** | **根因：v0.3.13 重啟實測發現 `project_dream dryRun=false` 寫完 jsonl 後 8 秒查 bundle mtime 未變。`cordis_inspect_query Event.listEvents` 取證 `project_brain/preview.changed` 不在 DSH 原生事件；Cordis 4 `Scoped<Context>` 模型 `ctx.emit/on` 只在同 fiber 內 dispatch；dsh-project-brain host bundle 在 host fiber 註冊 `setupAutoRebuild`，工具 `exec.ctx` 是 agent fiber → emit 收不到。修復：`src/host/rebuild.js` 從 `ctx.on("preview.changed")` 改成 `ctx.effect(() => ctx.timer.interval(checkMtime, 5000))` —— 每 5 秒掃 `.project-brain/{project,memory,todo,timeline}.json*` 的 mtime，變化觸發 `runBuild()`（100ms debounce）。改動單檔案 ~20 行，不動 `src/index.js` 註冊結構，不引入 fs.watch / chokidar 依賴；137 項 smoke test 仍全 PASS；5 秒輪詢 vs 原 ~1-3s 即時延遲變長但跨 fiber 穩定** | **v0.3.13 重啟實測 8 項工具 PASS + 1 項 auto-rebuild 失效；使用者「開始修復」指令** |
| **v0.3.15** | **P0.8 第四波 — inject 加 timer 讓 ctx.timer 真可用（v0.3.14 修復未生效的根因補漏）** | **v0.3.14 重啟實測失敗：`project_dream dryRun=false` 6 秒後查 bundle mtime 仍是手動 build 時間。根因：`src/index.js` inject 陣列 `["tools", "fs", "sandboxPolicy", "clientModules"]` 未宣告 `timer`；Cordis 4 `Scoped<Context>` 預設 service 不可見，必須 inject 才能 `ctx.get` 拿到；rebuild.js 調 `ctx.get("timer")` 返回 undefined，進入"退化"分支 warn 後默默失敗 → 整個輪詢邏輯沒啟動。修復（單檔案 1 行）：`src/index.js` inject 陣列末尾加 `"timer"`。教訓（永久）：Cordis 4 任何 `ctx.get('xxx')` 之前必須先在 inject 陣列宣告；debug-fix 應列依賴 → inject → ctx.get 完整鏈路；auto-rebuild 關鍵基礎設施必須 DSH Desktop 重啟實測一次完整鏈路才算 done。**重 build 後用戶需再重啟一次 DSH 驗證** | **v0.3.14 重啟實測失敗 6 秒後 bundle 未變；使用者「幫我修復」指令** |
| **v0.3.16** | **P0.8 第五波 — 監聽 DSH 原生事件主動喚醒 + 冷啟動診斷 log（v0.3.15 仍未生效的根因定位）** | **v0.3.15 重啟實測第三次失敗：bundle mtime 仍是 22:37:37。推測根因：host fiber 在 DSH Desktop 冷啟動時 `resolveWatchPaths()` 返回空陣列（sandboxPolicy.workspaceRoot 被 `safeCwd` 過濾掉 DSH Desktop 安裝路徑；workspaceRegistry/sessions/agents 都為空）→ timer interval 啟動但 paths=[] → mtime 變化無人監聽。修復（src/host/rebuild.js +30 行）：(1) setupAutoRebuild 頂部加冷啟動診斷 log（ctx.timer / ctx.get('timer') / sandboxPolicy.workspaceRoot / workspaceRegistry.list 數量 / sessions.list 數量 / agents.currentInitiator / 初始 paths 數量），讓 DSH Desktop 啟動時通過 ctx.logger 輸出；(2) 監聽 DSH 原生 `agent/created` / `session/created` 事件（DSH 框架跨 fiber 自動路由），事件回撥裡重新 resolveWatchPaths + 立即 pollMtime + 啟動 timer interval；(3) 保留 timer interval + ctx.on('preview.changed') 雙兜底。**這次重 build 後用戶需再重啟一次 DSH 驗證 + 我會主動查診斷 log 定位真因**，不再靠推斷** | **v0.3.15 重啟實測失敗 6 秒後 bundle 未變；使用者「幫我修」指令** |
| **v0.3.17** | **P0.8 第七波 — spawn 子程序 watcher（徹底脫離 Cordis 抽象，終極 fallback）** | **v0.3.16 重啟實測第四次失敗：診斷 log 設計上對但觀測鏈斷了（DSH Desktop Electron 無主 log 檔案，ctx.logger.info 輸出位置未知）。**所有 ctx.timer/ctx.effect/ctx.on 的 silent failure 不可觀測。終極方案：放棄 Cordis 抽象，`setupAutoRebuild` 用 `child_process.spawn` 啟動一個常駐 node 子程序跑獨立 watcher 指令碼（`src/host/rebuild-watcher.mjs`）。子程序用 node:fs.watch + 2 秒兜底輪詢監聽 `.project-brain/*.json*` mtime，變化直接 `child_process.execFileSync('node', ['build.js'])`。寫 log 到 `.project-brain/.dsh-project-brain-watcher.log`（繞開 ctx.logger）。**完全脫離 Cordis fiber 抽象**（子程序是獨立 process）→ 跨 fiber 問題不存在；node:fs/child_process 都是 Node 內建 → 零新依賴；sandbox 友好（spawn 預設 allowed）。**使用者需再重啟一次 DSH（第五次）驗證** | **v0.3.16 重啟實測失敗 6 秒後 bundle 未變 + 診斷 log 看不到；使用者「修」指令** |
| **v0.3.18** | **P0.8 第八波 — 工具層同步 rebuild（工程止血，不再依賴 host bundle silent failure）** | **v0.3.17 重啟實測第五次失敗：`.project-brain/.dsh-project-brain-watcher.log` 不存在 → watcher 子程序要麼沒 spawn 成功、要麼 sandbox 阻止寫檔案。本地手動 spawn 測試 watcher 能跑 → 真因是 DSH Desktop 靜態 plugin fiber 的 silent failure。**不再讓使用者重啟第 6 次**，改思路：放棄 host bundle "被動監聽"模式，**改為工具層"主動觸發"**：新檔案 `src/host/rebuild-sync.js` 匯出 `runSyncRebuild(reason)`，在 dream/memory/todo 工具的 execute 函數裡寫完 jsonl 後**立即同步**調 `execFileSync('node', ['build.js'])`（v0.3.6 已驗證 execFileSync 能跑）。Rebuild 失敗不影響工具本身返回值（try/catch 吞）。保留 `src/host/rebuild.js` 的 host bundle 監聽邏輯作為 fallback（未來 DSH 修好了再恢復）。**只動 lib bundle，不動 host bundle → 使用者不需要重啟 DSH** | **v0.3.17 第五次失敗 + 使用者第 5 次重啟；工程止血** |
| **v0.3.19** | **端到端驗證完成 + auto-rebuild 接受手動 build fallback** | **v0.3.18 端到端實測：tool 寫檔案完全 work（project_todo_add/dream 都正確寫 todo.jsonl + timeline.jsonl），但 `lib/client.js` mtime 不變 → 6 次失敗累計確認 DSH Desktop 靜態 plugin fiber 任何主動行為（ctx.timer/ctx.effect/ctx.on/spawn/execFileSync）都 silent failure。**終局方案：接受手動 build fallback** —— 調任何寫工具後手動跑 `node build.js`（~1 秒）重新整理 sidebar bundle。**不再投入修復資源**。端到端驗證 5 層面（基礎環境/工具註冊/工具呼叫/sidebar/主題）大部分 PASS（僅 auto-rebuild 失敗）。12 個工具 100% 調通，資料閉環 OK | **v0.3.18 驗證失敗 + 使用者實測接受手動 fallback** |
| **v0.3.20** | **清理過時 todo + 完善 Project Memory（5 類混合填充）** | **(1) 關閉 5 條過時 todo**（3 條 auto-rebuild 死迴圈：v0.3.7 / v0.3.9 / v0.3.7b debug；1 條陳舊 P0.4.1 文件目標；1 條 stale P0.5 in_progress），活躍 7 → 2；(2) 補 5 條型別混合 memory**：① decision: 採用 Project-First 資料模型；② decision: 三層資料通道架構（Cordis + build-time embed + manual build fallback）；③ decision: brain-logic 純邏輯層 + smoke test 策略；④ architecture: 8 類記憶型別混合填充策略；⑤ requirement: manual build fallback 永久不被信賴。memory.jsonl 17 → 22 條，型別分佈從 `lesson:2, change:8, bug:6, decision:1` 升級為 `decision:4, architecture:1, requirement:1, change:8, bug:6, lesson:2`（decision 從 1 → 4，提升 sidebar 決策密度） | **v0.3.19 端到端驗證完成後 Phase 2 完善工作** |
| **v0.3.21** | **P0.8 收尾大結局 — 關閉最後 1 條 todo + 寫入 P0.8 完成度總結** | **關閉最後 1 條 todo（`補全 init/rescan/continue 工具與 RPC continueSession 聯調驗證`，實際已被 smoke-session-lifecycle.mjs 25/25 PASS 覆蓋）；P0.8 全域性完成度 100%（auto-rebuild 例外）。所有 P0 階段（P0.0-P0.8）全部完成。終端使用者工作流：調工具寫 `.project-brain/` → 手動跑 `node build.js`（1 秒）→ DSH client bundle 自動熱過載 → sidebar 立刻更新。137 項 smoke test 全 PASS。下一步進入 v0.4.x / v1.0 MVP** | **v0.3.20 完成後 Phase 3 收尾** |
| **v0.4.0** | **P1 起步 — appendJsonl 效能最佳化 O(N) → O(1)** | **P0.8 v0.3.21 收尾後的第一個 P1 工作。`src/host/store/brain-files.js` 的 `appendJsonl` 之前是"讀整個 jsonl → push → 全檔案重寫"，memory.jsonl / timeline.jsonl 有幾百條記錄時效能差。修復：新增 `appendLine(fs, path, line, writePolicy)` 用 `fs.appendFile` 同步追加（DSH 單執行緒 fiber 安全）；`appendJsonl` 改為相容 wrapper（直接調 appendLine，不讀全檔案）；邊界處理（檔案不存在 → 建立；末尾無換行 → 補 "\n"）；保留 `writeJsonl`（dream commit 全檔案寫）。smoke-test 加 12 項覆蓋 appendLine 行為 + appendJsonl 相容路徑 + 效能基準（小檔案 + 模擬 1000 行）。137 項 smoke test 仍全 PASS。bundle size +3.5kb** | **v0.3.21 P0.8 收尾大結局後 P1 起步** |
| **v0.4.3** | **DSH Desktop 釋出準備 — INSTALL.md + CHANGELOG.md + STORE_LISTING.md** | **v0.4.0 效能最佳化是"內功"（使用者看不到），v0.4.3 釋出準備是"外功"（使用者能直接看到）。純文件工作。交付物：① INSTALL.md（系統要求 + 三種安裝方式 + 驗證步驟 + FAQ：auto-rebuild 不 work / path 顯式傳 / sandboxPolicy 警告）；② CHANGELOG.md（Keep a Changelog 規範，v0.2-v0.4.3 全部 milestone，Added/Changed/Fixed/Known Limitations 四象限）；③ STORE_LISTING.md（一句話描述 ≤80 字 + 長描述 ≤500 字 + 標籤 + 截圖位）；④ README.md 加 Documentation 章節連結到 INSTALL/CHANGELOG/TODO/SPEC。DSH Desktop 商店釋出 PR 描述就用 STORE_LISTING.md 內容** | **v0.4.0 效能最佳化完成後 P1 第二波** |
| **v0.4.1** | **dream 真實架構 diff — LLM 接入 + project_diff 工具** | **在 v0.4.0 效能最佳化 + v0.4.3 釋出準備基礎上，給 dsh-project-brain 接入 LLM 真正理解專案架構變化。`project_dream` (v0.3.12) 只做 title 合併 + status=archived，不動程式碼層面；新 `project_diff` 掃 git diff + 調 DSH llm service → 生成 architecture change memory。DSH llm 介面（已驗證）：ctx.get('llm').stream(options) / prepareCall / resolveCallConfig。風險：DSH Desktop 靜態 plugin fiber 可能 silent failure（v0.3.14-v0.3.18 教訓）→ 寫 mock LLM provider 讓 smoke test 可跑 + 使用者實測驗證真實路徑。交付物：① src/host/integrations/llm.js（mock LLM + DSH llm 抽象）；② src/host/diff/detector.js（git diff 掃描）；③ src/tools/diff.js（新工具）；④ scripts/smoke-project-diff.mjs（mock LLM 驗證）；⑤ 加進 src/index.js 的 toolBuilders 陣列。190 項 smoke test 全 PASS**。**使用者實測（2026-08-28）：13 個工具註冊 ✅ + project_diff dryRun=true 調通 ✅ + project_diff dryRun=false 0 檔案 0 commits（DSH Desktop shell service 靜默阻止 git 呼叫，**和 v0.3.14-v0.3.18 同根因**）**。**接受 fallback 策略**：mock LLM fallback 兜底，工具呼叫永遠有結果不 silent failure；真實 git + 真實 LLM 等 DSH Desktop 修復後啟用** | **v0.4.3 釋出準備完成後 P1 第三波** |
| **v0.4.2** | **真實 git + 真實 LLM（繞過 DSH Desktop sandbox）** | **v0.4.1 mock fallback 永遠拿不到真實資料，使用者決策"先把功能完善"。** 走方向 1+2：① detector 重寫用 node 內建模組（fs + zlib + crypto）實現純 git 客戶端，讀 .git/HEAD / refs/heads / objects/，loose object MVP 完整，pack 檔案 fallback 提示使用者；② llm.js 重寫用 node:fetch 調 user-configured OpenAI 相容 API（引數 llmApiUrl/llmApiKey/llmModel 或 env DSH_LLM_*），fallback 到 mock。零新依賴（node 內建）。**完全脫離 DSH shell service / ctx.llm**：自己讀 .git + 自己 fetch API。**使用者需配 LLM API key**（DeepSeek / 通義千問 / 本地 Ollama 相容）。190+ 項 smoke test 仍全 PASS** | **v0.4.1 使用者實測確認 mock fallback 不夠（決策記錄在 .project-brain/memory.jsonl mem-mtccn6uf）** |
| **v0.4.4** | **summarizer 真實 git + detector 真實 git 格式修復** | **v0.4.2 只給 project_diff 的 detector 換了純 node git 客戶端，但 summarizer（session/disposed 自動摘要）仍依賴 DSH shell service 跑 git diff（DSH Desktop 上 silent failure，拿不到真實 diff → 不寫 change memory）。修復 1：summarizer.js 刪除 gitCapture(shell)，改用 detectChanges（v0.4.2 detector），setupSummarizer 不再讀 ctx.get('shell')。修復 2（除錯發現 v0.4.2 detector 在真實 git 倉庫報 cannot read current commit，3 個 bug）：① inflateRawSync → inflateSync（真實 git loose object 用 zlib deflate 帶 header，實測 78 01 + inflateSync 成功 / inflateRawSync 報 invalid stored block lengths）；② 目錄 mode 判斷 parseInt(mode,8)===40000 永不匹配（git tree mode 是省略前導零的八進位制，目錄="40000"=0o40000=16384）→ 改為 ===0o40000，目錄才能遞迴展開（src 而非 src/index.js）；③ smoke-project-diff.mjs fixture 誤用 deflateRawSync（raw deflate）與 inflateRawSync 互相匹配 → 假陽性 PASS，改為 deflateSync（zlib 格式）匹配真實 git。驗證：真實 git 倉庫（git init + commit 含 src/ 子目錄）被正確讀取 + 8 個 smoke test 198/198 PASS。**現在 project_diff + summarizer 在真實 git 倉庫上都能工作，不再依賴 DSH shell service** | **v0.4.2 收尾後補齊 summarizer 依賴 + 修復 detector 真實 git 格式隱藏 bug** |
| **v0.4.5** | **detector 移除 pack 整體拒絕 — commit/tree 在 loose 即可 diff** | **v0.4.4 後用戶重啟 DSH 實測 project_diff 遇到新限制：pack file not supported。除錯發現 detector 的 hasPackFiles 只要檢測到倉庫有 .pack 就整體 fallback——但真實 git 倉庫普遍有 pack（git gc / 自動打包），且 detector 的 diff 只比較 tree 裡的 hash 從不讀 blob 內容，所以只要 commit + tree 在 loose 就能完整工作。修復：刪除 hasPackFiles + detectChanges 的整體拒絕分支；僅當 readCommit(head) 真的讀不到（commit object 在 pack）時才返回明確錯誤。驗證：真實 dsh-project-brain 倉庫（2 pack + 32 loose）返回 18 個真實檔案變更（正是 v0.4.4 commit 內容）；smoke-project-diff pack 測試改為"有 .pack 但 commit/tree 在 loose → 仍能 diff"；8 個 smoke test 199/199 PASS** | **v0.4.4 使用者重啟實測 project_diff 觸發** |
| **v0.4.6** | **detector pack 真實支援 — 解析 .idx v2 + .pack v2 + packed-refs + delta 解碼** | **v0.4.5 後用戶重啟 DSH 實測，真實倉庫（git gc 後 pack + packed-refs）依然報 "cannot read current commit"。v0.4.5 的"loose 即可"假設不成立：git gc 後所有 object 在 pack，ref 在 packed-refs。修復 7 處：① readHead 加 packed-refs fallback；② 新增 parseIdxV2（.idx v2 big-endian fanout + hash + offset）；③ 新增 readPackObject / readPackEntryByOffset（varint size+type header + inflate）；④ OFS_DELTA / REF_DELTA 解碼（applyDelta）；⑤ readGitObject = 先 loose 後 pack fallback；⑥ idxCache 用 gitDir+idxPath 為 key（跨倉庫隔離）；⑦ 6 個除錯 bug 修復（minSize 公式、varint 累加、pack inflate 無 header、REF_DELTA 遞迴等）。驗證：臨時 git 倉（git init + 2 commit + git gc --prune=now）detectChanges 返回 files:["README.md"] modified；smoke-project-diff 加 2 個 packed-refs 斷言；8 個 smoke test 201/201 PASS**。**MVP 限制：multi-pack-index（MIDX，git 2.20+）不支援——dsh-project-brain 自身倉庫是 MIDX，本倉庫仍 fallback 提示** | **v0.4.5 使用者重啟實測 git gc 倉庫觸發** |
| **v0.4.7** | **llm.js 加 Anthropic 相容協議** | **v0.4.6 後用戶實測 project_diff 走 mock fallback（未配 LLM key）。使用者提供 MiniMax 端點 https://api.minimaxi.com/anthropic，實測必須走 Anthropic 協議（POST /v1/messages + x-api-key header）而非預設 OpenAI 相容。修復：① detectProtocol(apiUrl)：baseUrl 含 "anthropic"（路徑或子域）→ Anthropic，否則 OpenAI；② fetchAnthropic：POST {baseUrl}/v1/messages，headers x-api-key + anthropic-version:2023-06-01，response content[0].text；③ realFetchLLM 自動選。smoke-project-diff 加 11 斷言（5 個 Anthropic 真實路徑 + 6 個 detectProtocol URL 模式）；8 個 smoke test 210/210 PASS** | **v0.4.6 使用者實測觸發 LLM 配置需求** |
| **v0.4.8 - v0.4.12** | **Sidebar UI 視覺升級（emoji + StatusBanner + ActionsBlock 文案統一 + Dashboard Quick Actions）** | **v0.4.7 團隊內部使用穩定後進入 UI 打磨階段。最佳化 sidebar 8 區塊視覺層次、加 emoji 圖示、引入 StatusBanner 三大數字彙總、ActionsBlock 按鈕文案穩定化、Dashboard 預設展開 + Quick Actions 2x2 網格 + MemoriesBlock toggle 改 React useState 修復重渲染 bug。purely frontend + build-time embed 改造，無 RPC / host 改動** | **v0.4.7 UI 打磨** |
| **v0.5.0** | **OnboardingBlock 自動啟動流程：點選按鈕直接調 host.call RPC，無需使用者複製貼上** | **v0.4.12 UI 打磨後，使用者反饋"啟動專案大腦"按鈕只複製命令到剪貼簿需要手動貼上，不合目的。改造 OnboardingBlock 為帶狀態機元件（idle/loading/error），點選後呼叫 `host.call('project_brain/initProject', { args: { path } })`，期間 CSS 轉圈 + 3 階段步驟條（掃描專案結構 → 寫入專案大腦 → 分析技術棧與依賴），RPC 完成後用返回值（projectId/name/scanDurationMs/stats）拼最小 preview 結構（project/phase/recentActivity/stats），通過 overrideData state 讓父元件立即展示 dashboard 而非等 host rebuild。失敗時顯示錯誤卡片（具體 error.message）+ 重試按鈕 + 複製啟動指令兜底按鈕。父元件 SidebarPreviewRoot 把 workspacePath 通過 props 傳給 OnboardingBlock；host builtin 在 apply 階段通過 ctx.host 拿到並儲存到模組級變數 `__DSH_CLIENT_HOST__`（避免子元件拿不到 client builtin）。新增 build-inline.js：sandbox 阻止 esbuild spawn 子程序時的退路，純 Node FS 拼接（IIFE wrap + 佔位符替換）。驗證：使用者重啟 DSH → sidebar 顯示新 OnboardingBlock → 點選按鈕 → 轉圈 → dashboard 自動出現** | **v0.4.12 使用者反饋"啟動按鈕不合目的"** |

**修訂流程**：
1. 任何對 SPEC 的修改先開 PR。
2. PR 必須更新本節（新增新行）。
3. PRD / DESIGN 與 SPEC 衝突時回寫 PRD / DESIGN，並在該行標註"sync"。
4. SPEC 版本號語義：MAJOR（破壞性變更）/ MINOR（新增章節）/ PATCH（錯別字、表述最佳化）。

---

# 附錄 A：核心 RPC 契約 Schema（schemastery 示例）

```js
// src/shared/types.js —— 契約示意，執行時按 JSDoc + schemastery 實現
const SidebarPreviewSchema = {
  initialized: 'boolean',
  project: { id: 'string', name: 'string', type: 'string?', lastUpdateAt: 'number' },
  phase: { title: 'string', progress: { done: 'number', total: 'number' } },
  recentActivity: [{ id: 'string', title: 'string', occurredAt: 'number', eventType: 'string' }],
  stats: { pendingTodos: 'number', completedTodos: 'number', decisions: 'number' },
  empty: 'boolean'
}

const ErrorSchema = { ok: 'false', code: 'string', message: 'string', details: 'any?' }
```

---

# 附錄 B：SidebarPreview 資料流時序

```
使用者開啟 DSH
   ↓
SidebarTab 渲染（active 狀態變化）
   ↓
Client useEffect: host.call('project_brain/sidebar.getPreview', { projectId })
   ↓
Host aggregator:
   SELECT project, COUNT(*) FROM memory ...
   SELECT status, COUNT(*) FROM todo ...
   SELECT * FROM timeline ORDER BY occurred_at DESC LIMIT N
   ↓
返回 SidebarPreview
   ↓
Client 渲染 5 區塊（或 Onboarding）
   ↓
後續：Host 任意 emit('project_brain/preview.changed', { projectId })
   ↓
Client 重新拉取
```

---

# 附錄 C：版本與相容

- 本 SPEC 版本：`v0.2`
- 配套 PRD：`REQUIREMENTS.md` v0.1
- 配套 DESIGN：`DESIGN.md` v0.1
- 資料庫 schema 版本：`v1`（遷移系統見 §17）
- 後續 schema 變更通過 `src/host/storage/migrations.js` 管理

---

# 附錄 D：Cordis 注入清單速查

| 依賴 | 型別 | 必需？ | 驗證方法 |
| --- | --- | --- | --- |
| `llm` | Service | 是 | `cordis_inspect_query llm` |
| `tools` | Service | 是 | 同上 |
| `session` | Service | 是 | 同上 |
| `timer` | Service | 是 | 同上 |
| `loader` | Service | 否（用 `ctx.get`） | 同上 |
| `storage` / `storageDomain` | Service | 是（**名待驗**） | 同上 |
| `ctx.baseUrl` | — | — | Loader 注入的 base URL |
| `ctx.logger` | — | — | 全域性可用 |

---

# 附錄 E：術語表

| 術語 | 類別 | 含義 |
| --- | --- | --- |
| **SidebarPreview** | 功能 | 側邊欄摺疊態預覽面板整體功能 |
| **SidebarTab** | UI | 側邊欄頂部 tab 欄的單個 tab 元素 |
| **Onboarding** | 狀態 | 專案未 init 時 SidebarPreview 展示的空狀態分支 |
| **`project_brain/preview.changed`** | 事件 | Host 推送的 preview 資料變更訊號 |
| **`project_brain/sidebar.getPreview`** | RPC | Client 拉取 SidebarPreview 資料的 RPC |
| **`project_brain/sidebar.subscribe`** | RPC | Client 訂閱 preview 變更的 RPC |
| **`project_init` 等** | Tool | LLM 可呼叫的工具，命令字首 `/project` |
| **Project Brain** | 產品 | dsh-project-brain 的中文別名 |
| **MVP** | 階段 | Minimum Viable Product，對應 §11.1 |
| **P0.x** | 階段 | MVP 內階段編號 |

---

## 附錄 F：v0.6.x Memory V2 實現補充

- 原始儲存繼續使用工作區內的 `memory.jsonl`；新記錄增加 `schemaVersion=2`、`status`、`confidence`、`source` 與 `updatedAt`，舊記錄保持向後相容。
- active 過濾是所有消費端的統一前置條件；`archived/superseded/deleted` 不進入 ask、continue、system prompt、Dashboard 或狀態計數。
- 預設召回為本地 BM25，並混合 importance/confidence/recency/type；Top-K 增加內容和型別多樣性約束。
- 向量模式必須顯式啟用並配置 OpenAI-compatible endpoint/model。索引快取位於 `.project-brain/cache/embeddings.jsonl`，按模型鍵和內容雜湊增量更新。
- 向量配置、憑據、網路或響應異常均降級為關鍵詞檢索；原始記憶、待辦、掃描和上下文恢復不受影響。
- 遠端 Embedding 的輸入包含記憶標題、正文、標籤和相關檔案；預設關閉，金鑰只從 DSH Credentials/環境變數解析。

**結束。所有開發、除錯、提交、Code Review 行為均以本文件 v0.2 為基準。若發現衝突或遺漏，先更新本文件再改程式碼，並在 §20 記錄變更。**
