# dsh-project-brain

[English](./README.md) · **簡體中文**

[![Version](https://img.shields.io/badge/version-1.4.0-blue)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.19-339933)](./package.json)
[![Status](https://img.shields.io/badge/status-stable-success)](./RELEASE_CHECKLIST.md)

**DSH 的持久化專案智慧與記憶外掛。** 它分析當前工作區、解釋專案架構、儲存開發決策與歷史，並在後續 Session 中自動恢復正確的專案上下文。

它的目標不是讓每個新對話重新理解倉庫，而是把重要知識沉澱在專案內部，隨著持續開發越來越熟悉專案。

> 當前版本：`1.4.0` —— 把記憶機制修到可用：寫入前先消解指代、頁面上可編輯 / 置頂 / 歸檔 / 刪除記憶、併發寫入不再丟資料、Core 容量可配置且支援置頂。資料格式與 v1.3.x 相容。

**v1.3.1 新特性**：📦 **匯入匯出 / 備份恢復**
- Dashboard 頂部新增 **💾 備份 / 📥 恢復 / ↶ 回滾** 三個按鈕（與專案名 + techStack chip 同一行）
- 一鍵把整個專案腦打成 zip（含 timeline + cache + manifest + sha256 校驗）→ 跨機器傳檔案 → 在另一臺機器一鍵還原
- 匯入前自動預覽影響清單（即將覆蓋的腦 / 舊腦備份路徑 / rootPath 改寫）；主按鈕文案「覆蓋並恢復」明確提醒
- 每次匯入/回滾前自動備份當前腦到 `.project-brain.backup-<ts>/`；可隨時回滾到任一歷史備份
- 4 個新 Tool：`project_export` / `project_import` / `project_rollback_backup` / `project_cleanup_backups`

[GitHub 預釋出](https://github.com/yj-liuzepeng/dsh-project-brain/releases/tag/v1.3.0) · [DSH 社群展示帖](https://github.com/deepseek-ai/deepseek-harness/discussions/5121) · [MyDSH 外掛詳情](https://mydsh.dev/plugin?repo=yj-liuzepeng%2Fdsh-project-brain)

## 介面預覽

### 專案大腦啟動入口（首次掃描前）

![啟動前引導頁：列出三項核心能力（讀懂專案 / 跨會話記住 / 接著往下做），底部展示當前 workspace 路徑與大號「啟動專案大腦」按鈕](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/01.png)

### 專案狀態卡 + 即時數字

![專案卡片：專案名、自動識別的技術棧 chip（GitHub Actions / Monorepo）、專案描述、上次更新時間，下方三欄數字（待辦 0 / 專案記憶 3 / 已完成 3）+ 當前階段進度條 100%](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/02.png)

### Dashboard 概覽 + 智慧續接建議 + Quick Action

![Dashboard · 專案全景頂欄 + SuggestionCard「你今天可能想推進 · AI 推薦 · 置信度 45%」+ 四個 Quick Action（重新掃描 / 整理待辦 / 整理記憶 / 專案全景）+ 概覽 tab 的技術棧 / 語言 / 開發入口三列](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/03.png)

### 架構 tab · 並列泳道分層圖

![架構 tab：專案定位、架構風格標籤、「外掛式分層架構」+「DSH LLM 增強」徽標，5 層泳道（介面與橋接層 / 工具與掃描層 / 儲存層 / 記憶子系統 / 構建與指令碼層），層名靠左、元件靠右](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/04.png)

### 架構 tab · 單層展開執行路徑

![點選「會話抽取與混合檢索」層後展開的執行路徑：橫向編號步驟（記憶子系統 → 記憶子系統 → 記憶子系統 → 記憶子系統 → Brain 儲存），每步一句職責說明，下方附屬檔案/風險](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/05.png)

### 任務動態 · 待辦 + 時間線

![任務動態 tab：左側已完成待辦（即時互動記憶 / 會話摘要重構 / 跨對話高保真續接）+ 右側時間線，按時間倒序展示記憶整理、專案重掃、新增記憶條目](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/06.png)

### 專案記憶 · 型別徽章 + 重要度星級

![專案記憶 tab：當前 Core（每輪注入）· 7 張卡片網格，每張卡片含型別 chip（決策 / Bug / 架構 / 教訓 / 備註）、重要度星級、一行摘要、日期、檢視詳情按鈕；底部可展開休眠記憶](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/07.png)

### 設定 · 向量檢索 + Embedding 配置

![設定 tab · 檢索與向量區域：混合檢索模式、啟用向量檢索開關、Embedding 地址 / 模型 / API Key 輸入框、向量維度，頂部綠色提示「配置可寫，未點儲存不會生效」](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/08.png)

### 設定 · 檢索權重 + 測試連通

![設定 tab · 檢索權重區域：關鍵詞 / 向量 / 重要性 / 可信度 / 時新性五項權重輸入（0.15 / 0.25 / 0.3 / 0.1 / 0.2），每項下方一行配置提示；右下角小號淺藍「測試向量連通」按鈕一鍵探測 Embedding 端點](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/09.png)

### Git 歷史 tab · VSCode 風格時間線

![Git 歷史 tab：分支切換器（main · 32 個提交 · 1 個其他分支）、HEAD bd3df6、自動重新整理 30s 開關；下方 commit 時間線含 graph 圓點、提交標題、short hash、作者、相對時間、改動檔案數摘要；右側分支 chip](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/10.png)

## 為什麼需要它

AI 程式設計對話通常是短期的，但軟體專案會長期演進。架構選擇的原因、生產問題的解決方案、當前正在處理的任務和關鍵程式碼入口，經常散落在不同對話裡。

dsh-project-brain 把這些內容變成按工作區隔離的本地知識層：

- **快速理解倉庫**：識別語言、框架、工具鏈、入口檔案、manifest、README 後設資料、符號和 import。
- **解釋架構而不是羅列目錄**：生成專案定位、架構風格、概念分層、元件職責、關係、執行流程、關鍵檔案、閱讀順序和風險。
- **複用當前 DSH 模型**：架構分析預設使用當前 Session 已選擇的 provider/model，無需單獨填寫對話模型金鑰。
- **跨對話長期記憶**：持續儲存決策、需求、架構、Bug、經驗、變更、待辦和活動記錄。
- **自動恢復上下文**：新 Session 自動獲得高價值記憶、活躍待辦和最近活動。
- **專案嚴格隔離**：Host 根據即時 Session 工作區解析路徑，不從其他專案猜測資料。
- **預設不需要向量模型**：零配置使用本地 BM25；Embedding 是可選語義增強。
- **AI 不可用仍能工作**：架構分析和記憶檢索都有本地降級路徑。

## 工作原理

```text
當前 DSH Session
       │ 可信的即時 Session cwd
       ▼
工作區掃描器 ─────────► 專案事實與原始碼證據
       │
       ├──► 當前 DSH LLM ───► 語義架構報告
       │          │ 不可用 / 超時 / 輸出異常
       │          └─────────► 本地架構降級
       │
       ├──► .project-brain/ ─► 記憶、待辦、時間線、架構
       │
       ├──► 上下文注入器 ───► 新 Session System Prompt
       │
       └──► Connection RPC ─► Dashboard 與 TodoStrip
```

瀏覽器側不能指定任意檔案路徑，所有執行時操作都由 Host 根據當前 DSH Session 解析目標工作區。

## 本地資料

每個專案擁有獨立的資料目錄：

```text
.project-brain/
├── project.json          # 專案後設資料、技術棧、語言和入口
├── architecture.json     # 定位、分層、元件、流程和證據
├── memory.jsonl          # 結構化長期專案記憶
├── todo.jsonl            # 專案待辦及狀態
├── timeline.jsonl        # 掃描、記憶、待辦與 Session 活動
├── codegraph.json        # 可選的舊版 AST 圖
└── cache/
    └── embeddings.jsonl  # 可選、可刪除、可重建的派生快取
```

切換對話或升級外掛不會丟失這些資料，解除安裝外掛也不會刪除 `.project-brain/`。

## 記憶機制

記憶型別包括 `decision`、`requirement`、`architecture`、`change`、`bug`、`lesson`、`issue` 和 `context`。

V2 記憶包含重要性、可信度、生命週期狀態、來源、時間、標籤和相關檔案。已歸檔、已替代或已刪除的記憶不會進入普通檢索、自動上下文注入、狀態統計和 Dashboard。

記憶主要通過三條路徑產生：

1. Agent 使用 `project_memory_add` 主動記錄穩定決策和經驗。
2. Session 結束時，記錄去重後的 Git 變更摘要，並複用當前 DSH 模型抽取少量、有證據的長期專案事實。憑據、工具輸出和非文本內容會被過濾；模型不可用或輸出異常時安全降級為僅 Git 記憶。
3. 架構差異分析生成 architecture/change 型別記憶。

“整理記憶”會先預覽合併和歸檔候選，只有使用者確認後才真正寫入。

Session 抽取可通過 `sessionSemanticMemoryEnabled`、`sessionSemanticMaxChars`、`sessionSemanticMaxItems` 和 `sessionSemanticTimeoutMs` 配置；關閉後仍保留純 Git 摘要。

## 記憶檢索

預設檢索使用本地 BM25，搜尋標題、正文、標籤、相關檔案和型別，並綜合重要性、可信度、時效性、穩定記憶型別和結果多樣性排序。

如需語義增強，可在外掛設定中啟用混合向量檢索：

```yaml
retrievalMode: hybrid
vectorEnabled: true
embeddingBaseURL: https://your-provider.example/v1
embeddingModel: your-embedding-model
embeddingApiKeyEnv: PROJECT_BRAIN_EMBEDDING_API_KEY
```

向量索引按內容雜湊懶載入更新。憑據缺失、網路失敗、響應異常或維度不一致時，會自動降級為本地關鍵詞檢索。

> 啟用遠端 Embedding 後，記憶標題、正文、標籤和相關檔名會發送到配置的服務。私有專案建議使用本地模型或可信服務。

## 架構分析

初始化和重掃會先收集確定性的本地事實。噹噹前 DSH Session 已建立可用模型路由時，外掛會把 README、manifest、相對路徑、符號/import 和受長度限制的關鍵原始碼摘要傳送給當前模型，生成概念架構報告。

主要安全和可靠性措施：

- 不向模型傳送絕對路徑；
- 原始碼摘要、最大檔案數和元件數均可配置；
- 嚴格提取、修復並規範化 JSON；
- 驗證證據檔案路徑和元件關係；
- 不渲染模型生成的 HTML；
- 無路由、超時或非法輸出時自動本地降級；
- 使用架構指紋避免無意義的重複分析。

設定 `architectureLlmIncludeSource: false` 可只發送結構事實；設定 `architectureLlmEnabled: false` 可完全使用本地分析。

## 快速開始

將已釋出的公測標籤安裝到你正在使用的 DSH profile：

```bash
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v0.7.0-beta.2
```

例如，`dsh web` 通常使用 `--profile web`；如果你的 Desktop 發行版執行 `desktop` profile，則使用 `--profile desktop`。安裝或升級後需要重啟當前 DSH 程序；使用 DSH Desktop 時應完全退出並重新開啟。釋出包已包含預構建 Host/Client bundle，普通使用者無需安裝 Node.js 或本地編譯。

### 執行環境相容性

- Host 外掛為相容的 DSH profile 提供工作區分析、13 個 `project_*` 工具、長期記憶、上下文注入、待辦和架構分析。
- Dashboard 與 TodoStrip 是 DSH Web Client 外掛（`platform: web`），可用於 DSH Web，以及承載 DSH Web Client 的 Desktop 發行版。
- 純 CLI/TUI 客戶端不會顯示 Dashboard；當對應 profile 提供外掛所需的 DSH Host services 時，仍可使用核心 Host 能力。非 Web profile 的真實相容矩陣仍在公測驗證中。

參與原始碼開發時需要 Node.js `22.19+` 或 `24+`：

```bash
git clone https://github.com/yj-liuzepeng/dsh-project-brain.git
cd dsh-project-brain
npm install
npm test
npm run build
npm run verify:release
npm run verify:install
```

原始碼貢獻者可將倉庫連結進目標 DSH profile workspace，並在 bundle 配置中啟用 `dsh-project-brain`。

安裝後：

1. 在 DSH 中開啟一個專案工作區。
2. 進入頂部“專案”頁。
3. 點選“啟動專案大腦”。
4. 檢視概覽、架構、任務動態和專案記憶四個頁籤。
5. 新建對話，確認專案上下文能夠自動恢復。

詳細步驟和故障排查見 [INSTALL.md](./INSTALL.md)。

## 工具列表

| 能力 | 工具 |
|---|---|
| 初始化 / 重掃 | `project_init`, `project_rescan` |
| 狀態 / 續接 | `project_status`, `project_continue` |
| 長期記憶 | `project_memory_add`, `project_memory_list` |
| 待辦管理 | `project_todo_add`, `project_todo_list`, `project_todo_update`, `project_todo_done` |
| 查詢 / 整理 | `project_ask`, `project_dream` |
| Git + LLM 架構差異 | `project_diff` |

Dashboard 快捷操作會在後臺執行這些工作流，並提供載入、確認、成功、錯誤和重試狀態。

## 隱私與安全

- 專案知識儲存在 `<workspace>/.project-brain/`；只有顯式啟用的模型能力才會向對應服務傳送受限制的內容。
- Session 語義記憶會把受長度限制的使用者/助手文本傳送給 DSH 當前選擇的模型服務；傳送前會排除工具輸出、System 訊息並清洗可識別憑據。可設定 `sessionSemanticMemoryEnabled: false` 關閉。
- Client RPC 不能傳入檔案路徑，Host 只使用即時 Session 工作區。
- 工具執行優先使用可信 Session 路徑，而不是模型提供的引數。
- 未初始化專案不會被 Session summarizer 靜默建立資料。
- 向量能力預設關閉。
- Embedding 金鑰通過 DSH Credentials 或環境變數引用解析，不寫入記憶檔案或 Client RPC。
- 釋出構建不會嵌入開發者工作區、Session ID、專案記憶、憑據或本機路徑。
- `.project-brain/` 可能包含內部決策和 Bug 歷史，提交 Git 前請先審查。

## 開發與釋出驗證

```bash
npm test
npm run build
npm run verify:release
npm run verify:install
npm audit
```

自動化覆蓋執行時工作區解析、跨專案隔離、跨 Session 記憶、本地/LLM 架構路徑、Memory V2、BM25/混合檢索、Session 去重、Scanner、Dashboard/TodoStrip、主題、Git pack/delta 和 LLM 協議。

`verify:release` 會驗證包後設資料、入口和 npm 檔案白名單，並掃描本機路徑、Session ID、憑據、私鑰、日誌、歸檔檔案和專案腦資料。`verify:install` 會把實際釋出包安裝進臨時空專案，提前發現 peer 依賴衝突或構建產物缺失。

## 當前限制

- Session 語義抽取有嚴格長度與數量限制，只儲存少量穩定事實；關鍵意圖仍建議通過記憶或 TODO 工具顯式沉澱。
- Session 第一次正常模型請求前可能沒有可複用的 DSH 模型路由；此時先進行一次對話再重掃。
- `project_diff` 使用獨立的 OpenAI/Anthropic-compatible 配置；初始化架構分析使用當前 DSH Session 模型。
- Git multi-pack-index（MIDX）尚未完整支援。
- Host bundle 升級後需要重啟當前 DSH 程序；Desktop 使用者應完整退出並重新開啟應用。

## 文件

- [English README](./README.md)
- [安裝說明](./INSTALL.md)
- [釋出檢查清單](./RELEASE_CHECKLIST.md)
- [更新日誌](./CHANGELOG.md)
- [設計說明](./DESIGN.md)
- [技術規格](./SPEC.md)
- [商店文案](./STORE_LISTING.md)

## License

[MIT](./LICENSE)
