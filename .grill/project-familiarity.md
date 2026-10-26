# Grill: Project familiarity (two views, one store)
Date: 2026-09-18

## Intent
做一個專案外掛：隨長期開發越來越熟悉該專案。新手開啟就能建立心智模型；老手越用越好用；能看清從建倉以來重要開發做了什麼、改了什麼。熟悉的主體是「人 + Agent 同一條開發線」，不是一份越堆越大的知識庫。

## Constraints
- 一份 `.project-brain/` 資料，兩套檢視：站立事實給 Agent；架構 / 第一屏 briefing / 變更鏈路給人（Agent 注入複用同一份 briefing，不另造事實源）。
- Precision over recall：changelog、git 檔案清單、聊天原文、工具呼叫軌跡不是 Core，也不當鏈路節點正文。
- Core 硬頂仍有效（約 15 條 / 800 token）；擠佔時先砍 briefing 裡「最近為什麼」的長度，不砍 Core。
- 架構過期不得假裝確定；LLM 不得編造因果邊。
- 不把向量檢索當可靠性主路徑。

## Key decisions
- Decision: 人 + Agent 兩套檢視、一份資料（選項 C）。Reason: 只服務 Agent 則新手仍要讀程式碼；只服務人則每次 prompt 會被歷史汙染。Alternative considered: 只最佳化 Agent 續接，或只最佳化 Dashboard 認知。
- Decision: 專案 Tab 第一屏只回答四件事——這是什麼、從哪改、現在卡在哪、最近為什麼變成這樣。Reason: 認識專案和變更全史搶第一屏。Alternative considered: 第一屏直接鋪變更史。
- Decision: 「從哪改」= 入口 + 最多 5 個關鍵檔案 / 主路徑，不是目錄樹，也不是整張泳道當第一屏。Reason: 新手要能動手，不要先學分層圖。Alternative considered: 目錄、架構泳道佔滿第一屏。
- Decision: 新 Session 注入 = 同一份 4 句 briefing + Core 站立事實。Reason: 人看懂了模型仍亂摸倉，產品失敗。Alternative considered: 人看 4 句、Agent 只吃 Core + TODO。
- Decision: 「最近為什麼」= 上次 `session_summary`，否則最新一條 decision；不放 git 檔案清單。Reason: 檔案列表不是因果。Alternative considered: 把 diff 檔案列表寫入注入。
- Decision: Session 結束且相關檔案有變更 → 自動輕掃；失敗不阻塞關會話，只記 timeline。過期時第一屏和注入標明架構可能過期，「從哪改」降級為掃描入口，舊泳道不當真理。Reason: 共用 briefing 過期會把人和模型一起帶偏。Alternative considered: 過期仍展示上次 LLM 泳道；或僅手動重掃。
- Decision: 輕掃勤、LLM 架構稀。輕掃：原始碼變動即重新整理入口/技術棧/語言。LLM 架構：僅 `architectureRelevantFiles`（入口、分層目錄、manifest、核心模組）。README / CHANGELOG / lockfile / 純測試 / 格式化提交不觸發 LLM。Reason: 每次關會話全量 LLM 又慢又髒。Alternative considered: 關會話一律全量架構分析。
- Decision: 變更史主檢視是專案腦時間鏈路，不是 Git 主史，也不是獨立編年史文件。Reason: Git 不知為何；另寫敘事會和 Core/timeline 搶事實。Alternative considered: 只要 Git；或每里程碑一篇人寫敘事。
- Decision: 鏈路節點 = 一次 Session（或明確里程碑），不是每一輪對話。節點：1 句做成了什麼 + 摺疊的模組/關鍵檔案（預設 3–5）。邊：主幹為時間鏈；額外邊僅硬證據（同一 TODO 生命週期、supersede、架構重掃由哪些相關檔案觸發）。空會話（無摘要、無 git、無記憶/TODO）不進主幹，只保留摺疊計數。Reason: 全量互動圖會變成聊天回放；LLM 因果邊不可信。Alternative considered: 每輪人機互動一個點；模型推斷因果圖。
- Decision: 只討論、沒改程式碼、也沒調記憶/待辦的 Session，只要有非空 `session_summary` 就進主幹（可無檔案）；摘要也空則摺疊。Reason: 設計回合不能從史上消失；聊天原文仍不當節點。Alternative considered: 沒 git 一律不進圖。
- Decision (recommended default, user: 按你建議即可): `session_summary` 合同與記憶閘門一致——1–3 句「做了什麼重要的 + 為什麼」；git 檔案只作節點附件；changelog 體裁不得當摘要。關會話抽取失敗 = 該次互動在圖上等於沒發生，除非使用者當時「記住」或事後補 decision。Reason: 圖、第一屏第 4 條、talk-only 節點都依賴摘要質量。Alternative considered: 用「改了 N 個檔案」當節點標題。
- Decision (recommended default, user: 按你建議即可): 鏈路圖放在現有「任務動態 / 時間線」位置升級為主幹圖，Git Tab 仍是證據檢視；不新造第三套事實儲存。Reason: 減少入口。Alternative considered: 獨立「演進」Tab。

## Surfaced assumptions
- 關會話抽取能穩定產出一句人話摘要；否則 talk-only 重要回合會丟。
- `architectureRelevantFiles` 足以判斷該不該跑 LLM 架構。
- TODO id 能跨 Session 存活，因果邊才畫得出。
- 使用者接受「沒留下摘要的互動，史裡不存在」。
- Durable Core 閘門（changelog 不進 Core、`project_memory_add` 視作自動寫入）仍然有效；本 grill 不推翻 `.grill/durable-core-memory.md`。

## Open questions
- 里程碑是否允許使用者手動釘一個 Session 當「版本節點」（例如 v1.3.1），還是完全由系統抽稀。未問；預設先全自動，手動釘選可後加。
- 主幹圖在超長曆史下的抽稀演算法（按周合併空檔 vs 只按重要度）。未問；預設：超過一屏先按「有決策 / 有架構重掃 / 有 TODO 完成」抽稀，其餘進展開。

## Out of scope
- 聊天原文入庫或可回放。
- 用 LLM 生成獨立「專案編年史」或推斷無證據的因果邊。
- 把變更全史、目錄樹、完整泳道塞進第一屏或每次注入。
- 向量檢索作為續接主路徑。
- 跨專案記憶聯邦、再擴 AST 語言、用本外掛替代 Jira。
- 每輪對話粒度的互動圖。
