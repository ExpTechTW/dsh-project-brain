# DSH Community Showcase 主帖中文版（v1.3.0）

> **帖子**：[discussions/5121](https://github.com/deepseek-ai/deepseek-harness/discussions/5121)
> **作者**：yj-liuzepeng（OP，可編輯主帖）
> **使用方式**：
> - 方式 A：直接替換主帖（中文 DSH 圈主導場景）
> - 方式 B：英文版後追加中文版（雙語覆蓋，推薦）
> - 方式 C：追加為新評論

---

## 帖子正文（中文完整版 · 直接替換或追加主帖）

````
> **Unofficial community plugin** — not maintained or endorsed by the DeepSeek Harness team.
> **非官方社群外掛** —— 不由 DeepSeek Harness 團隊維護或背書。

## dsh-project-brain · v1.3.0 穩定版

[DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 的持久化專案智慧與記憶外掛。

**快速上手，越用越懂，長期把專案做下去。**

- 倉庫地址：https://github.com/yj-liuzepeng/dsh-project-brain
- npm：https://www.npmjs.com/package/dsh-project-brain
- 許可證：MIT
- 文件語言：英文 + 簡體中文 README
- 最新穩定版：**v1.3.0**（2026-09-15）

## 核心功能

- **工作區掃描**：6 語言識別（JS/TS / Python / Go / Java / Rust / C-C++），技術棧按 runtime / 交付 / 結構 / 語言分層
- **架構分析**：專案定位、分層、元件職責、執行流程；架構 Tab 採用並列泳道（LLM 增強 / 本地降級）
- **8 種結構化長期記憶**（`decision` / `change` / `bug` / `lesson` / `requirement` / `architecture` / `issue` / `context`），按 workspace 隔離
- **Durable Core 站立記憶**（v1.3.0）：新 Session 自動注入跨會話仍為真的事實（active 15 條 / 800 token，溢位 dormant）；changelog 走規則門檻
- **主路徑加權檢索**（v1.3.0）：5 因子加權（BM25 + 重要度 + 時效 + 型別穩定性 + 多樣性），向量作加分；可選 Embedding 啟用混合召回
- **即時互動記憶** + Session 結束 LLM 抽取穩定語義記憶（含隱私清洗、長度限制、去重、失敗兜底）
- **Dashboard**：6 Tab（概覽 / 架構 / 任務動態 / 專案記憶 / 設定 / Git 歷史）+ 啟動入口 + SuggestionCard 智慧續接 + 4 個 Quick Action

## 工具清單

**16 個 `project_*` 工具**已註冊到 Host：

| 能力 | 工具 |
|---|---|
| 初始化 / 重掃 | `project_init`, `project_rescan` |
| 狀態 / 續接 | `project_status`, `project_continue`, `project_suggest_next` |
| 長期記憶 | `project_memory_add`, `project_memory_list`, `project_memory_archive`, `project_memory_supersede` |
| 待辦管理 | `project_todo_add`, `project_todo_list`, `project_todo_update`, `project_todo_done` |
| 查詢 / 整理 | `project_ask`, `project_dream` |
| Git + LLM 架構差異 | `project_diff` |

## 快速開始

在你使用的 DSH profile 裡安裝最新穩定版：

```bash
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.3.0
```

`dsh web` 用 `--profile web`；你的 DSH Desktop 分發版通常用 `--profile desktop`。安裝或升級後**必須完全退出並重新開啟** DSH Desktop（host bundle 改動不熱過載）。

詳細安裝：https://github.com/yj-liuzepeng/dsh-project-brain/blob/main/INSTALL.md

## 截圖

**專案大腦啟動入口**（首次掃描前 — 列出 3 項核心能力 + 大號「啟動專案大腦」按鈕）：

![01](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/01.png)

**專案狀態卡** —— 自動識別的技術棧 chip + 即時數字（待辦 / 記憶 / 已完成）+ 階段進度條：

![02](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/02.png)

**Dashboard 概覽**（SuggestionCard「你今天可能想推進」+ 4 個 Quick Action + 6 個 Tab 導航 + 概覽 tab 的技術棧 / 語言 / 開發入口）：

![03](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/03.png)

**架構 tab · 並列泳道** —— 5 層分層圖（介面與橋接 / 工具與掃描 / 儲存 / 記憶 / 構建），層名靠左、元件靠右：

![04](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/04.png)

**架構 tab · 單層展開** —— 點選一層後展開的執行路徑（橫向編號步驟 + 檔案 / 風險附屬）：

![05](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/05.png)

**任務動態 tab** —— 待辦列表 + 專案開發時間線：

![06](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/06.png)

**專案記憶 tab** —— 8 種結構化記憶型別（決策 / 變更 / Bug / 經驗 / 需求 / 架構 / Issue / 上下文），型別徽章 + 重要度星級：

![07](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/07.png)

**設定 · 向量檢索 + Embedding 配置** —— 混合檢索模式 / 啟用開關 / Embedding 地址 / 模型 / API Key / 向量維度：

![08](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/08.png)

**設定 · 檢索權重 + 測試連通** —— 關鍵詞 / 向量 / 重要性 / 可信度 / 時新性五項權重 + 一鍵探測 Embedding 端點：

![09](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/09.png)

**Git 歷史 tab** —— VSCode 風格時間線（分支切換器 + HEAD hash + 自動重新整理開關 + 提交標題 / hash / 作者 / 改動檔案數）：

![10](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/10.png)

## 版本更新摘要（v0.7.0 → v1.3.0）

**v1.3.0**（2026-09-15）—— Durable Core 站立記憶（active 15 條全量注入 / 溢位 dormant）+ 設定頁聯通測試與 API Key 直填；架構圖改為並列泳道（5 層鳥瞰 + 單層展開執行路徑）+ 初始化頁收斂 3 條重點；技術棧抽 `stack-taxonomy` 模組，按 runtime / 交付 / 結構 / 語言四層口徑分層（Dockerfile 即 Docker、LangGraph / MCP 識別、Python 拼寫相容）；截圖從 7 張擴到 10 張（啟動入口 / 專案狀態卡 / 設定·向量 / 設定·權重）。
**v1.2.0**（2026-09-15）—— 6 項客戶端/Host 修復 + 功能：Onboarding 升級為 8 項能力清單；記憶卡片檢視改彈框模式；架構兜底條人話化 + 內聯重試；語言 chip 按使用率排序 + 百分比 + 長尾聚合；切專案時顯示 loading 佔位；切專案/切 session banner 閃退修復。
**v1.1.1**（2026-09-12）—— Patch：修復 npm README 截圖渲染（用 SHA 鎖定的絕對 URL）。
**v1.1.0**（2026-09-12）—— 雙通道檢索：關鍵詞 + 向量 + Reciprocal Rank Fusion（k=60）。新增 3 個 embedding smoke / e2e 指令碼。
**v1.0.0**（2026-09-09）—— **首個穩定版本。** 修復 7 項 P0 釋出阻塞（npm install ERESOLVE、dsh-tools peer 阻塞 smoke、Windows verify ENOENT）。拆分 `scanAndWrite` 純邏輯層。39/39 host-acceptance 全過。
**v0.7.0** —— SuggestionCard、TodoStrip 摺疊、GitTab VSCode 風格 UI、Dashboard 自建設定入口、雙通道記憶機制、6 語言 AST 分析。

## 驗證資料

```bash
npm test                        # 19 / 19 smoke suites
npm run test:runtime-workspace  # 30 / 30 runtime workspace RPC
npm run test:project-memory     # 59 / 59 project memory isolation
npm run test:acceptance         # 39 / 39 host-acceptance scenarios
npm run verify:release          # 14 / 14 checks（版本、檔案白名單、隱私）
npm run verify:install          # CLEAN_TARBALL_INSTALL_PASS
npm audit                       # 0 vulnerabilities
```

## 隱私與安全

- 所有專案資料儲存在 `<workspace>/.project-brain/`，**完全本地化**，不離開本機
- 架構分析複用當前 DSH LLM 路由，僅傳送 README + manifest + 相對路徑 + 受長度限制的原始碼摘要（不傳送絕對路徑）；原始碼摘要與 LLM 可分別關閉
- Client RPC 不能接收任意檔案路徑，Host 嚴格使用即時 Session 工作區
- Embedding（啟用時）會向配置的端點發送記憶標題 + 正文 + 標籤 + 檔名
- 釋出包不含開發者工作區資料、Session ID、憑據或本機路徑

## 反饋邀請

不同 DSH profile、客戶端、Harness 版本、專案型別（單倉庫 / monorepo / 多語言混合 / 學術寫作）會對外掛的不同側面形成驗證。特別歡迎以下反饋：

- Session 開始上下文注入選錯記憶的邊界情況
- Embedding 兜底行為（純 BM25 vs 混合檢索）
- Monorepo 中跨 workspace 的隔離
- 非 Web Host 相容性（DSH Desktop / headless）

可復現的問題請到：https://github.com/yj-liuzepeng/dsh-project-brain/issues

如果你有真實工作流想分享，歡迎在本 Discussions 區開一個 **Show and tell** 帖 —— 真實使用者故事是目前最有價值的貢獻。
````

---

## 🚀 三種釋出方式

### 方式 A：中文版替換主帖

適合 DSH 中文圈主導場景，**與國際使用者觸達會減少**。

### 方式 B：英文 + 中文雙語版（推薦）

英文版後追加中文 section。覆蓋國際 + 中文，觸達最優。

合併版結構示意：

```
[英文版正文...]

---

## 中文版

> **非官方社群外掛** —— 不由 DeepSeek Harness 團隊維護或背書。
...

[中文版正文...]

---

## Feedback / 反饋

...
```

### 方式 C：中文版追加為新評論

適合"主帖保留英文，附加中文"場景。

---

## ⚠️ 截圖 URL 鎖 v1.3.0 tag（不是 commit SHA）

歷史版本各自指向當時 tag 的 commit；現在發 v1.4 時主帖不動，新版本自動指向 v1.3.0 截圖（如要更新需改 discussion body）。