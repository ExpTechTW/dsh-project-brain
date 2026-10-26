# DSH 外掛市場文案

> 釋出狀態：`1.3.0` 穩定版（v1.2.0 的 minor 版本，Durable Core 站立記憶 + 架構並列泳道 + 技術棧分層重構 + 截圖從 7 張擴到 10 張）。

## 名稱

dsh-project-brain

## 一句話描述

讓 DSH 持久理解當前專案：自動分析工作區，跨對話保留決策、變更、待辦和開發上下文。

## 長描述

dsh-project-brain 為每個 DSH workspace 建立獨立的本地“專案大腦”。首次啟動會生成架構認知報告，說明專案定位、架構風格、概念分層、職責元件、執行流程、關鍵檔案和閱讀順序；目錄只作為證據。預設複用當前 DSH Session 的模型深入分析，模型不可用時自動使用本地職責模型。後續把架構決策、需求約束、Bug 根因、經驗教訓、Git 變化和待辦持續沉澱到專案自己的 `.project-brain/`。

切換對話時，外掛會自動恢復當前專案的關鍵記憶、活躍待辦和最近活動。切換 workspace 時，Host 根據 live Session 安全解析對應目錄，專案之間不會串資料。Sidebar 與 TodoStrip 使用執行時 RPC 即時讀取，無需重新構建外掛。

所有專案腦資料儲存在本地。架構分析預設向當前 DSH 模型傳送 README、manifest、結構事實和有限關鍵原始碼摘要，可關閉原始碼摘要或完全關閉 LLM。記憶查詢預設使用本地 BM25；Embedding 服務仍需使用者主動配置。

## 能力

- 任意 DSH workspace 自動識別和初始化
- 初始化/重掃自動維護架構認知報告，原始碼變化後按內容指紋增量重新整理
- 當前 DSH LLM 零配置語義增強 + 本地靜態分析降級
- 13 個專案分析、記憶、待辦、查詢和 Git diff 工具
- 跨 Session 專案上下文注入
- 預設本地檢索 + 可選混合向量語義召回
- Memory V2 狀態、來源與可信度欄位，歸檔內容不會汙染上下文
- Session Git 變更摘要 + 當前 DSH LLM 語義記憶抽取，並帶隱私過濾、數量限制、去重與失敗降級
- 多 workspace 強隔離
- 中英文介面與 DSH 主題適配
- 釋出構建不攜帶開發者本機專案資料

## 標籤

`developer-tools`, `project-management`, `memory`, `context`, `local-first`, `sidebar`, `ai-assistant`

## 隱私摘要

- 專案資料儲存在 `<workspace>/.project-brain/`
- Client 無法指定任意 Host 檔案路徑
- 架構分析預設複用當前 DSH 模型併發送有限關鍵原始碼摘要，不傳送絕對路徑；原始碼摘要與 LLM 均可分別關閉
- 向量快取位於 `.project-brain/cache/`，屬於可刪除、可重建的派生資料
- 釋出包不嵌入本地 Session ID、workspace 路徑或專案記憶

## 釋出前檢查

- [x] `npm test`：13 組 smoke suite（含架構、Session 語義記憶、Memory V2 與混合檢索）通過
- [x] 預設構建為 release-safe runtime RPC 模式
- [x] npm 釋出檔案 allowlist
- [x] 釋出隱私自動檢查：無本機路徑、Session ID、憑據或 `.project-brain/` 資料
- [x] `npm audit`：0 vulnerabilities
- [x] MIT License
- [x] README 已包含專案大腦啟動入口、專案狀態卡、Dashboard 概覽、架構並列泳道（概覽 + 展開）、任務動態、專案記憶、自建設定（向量 + 權重）和 Git 歷史截圖（共 10 張）
- [ ] 在目標 DSH profile 與客戶端環境完成一次真實安裝和跨專案切換驗收
