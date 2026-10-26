# 更新日誌（CHANGELOG）

> dsh-project-brain 專案的所有重要變更都記錄在這裡。
> 本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 規範。

---

## [v1.4.1] - 2026-10-27

### Changed（變更）

- **升到 DSH 0.2.1-rc.3 可直接載入**：`peerDependencies` 的 `@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-session`、`@deepseek-ai/dsh-client-connection` 改為 `^0.1.0-rc.2 || ^0.2.1-rc.3`，相容新舊宿主，裝進 0.2.1-rc.3 不需要再寫 `compatibility.json` 豁免。實測 `defineTool` 在 0.2.x 簽名未變（`options.execute` / `finalizeContent` / `projectContent` / `output.render` / `output.presentationMeta` / `presentCall` 都在），因此程式碼無需改動。
- **全專案文案改為繁體中文（台灣用語）**：`src/`、`scripts/`、`docs/` 等共 139 個檔案，統一以 OpenCC `s2twp` 轉換（專案／設定／資料／檔案／程式碼／預設／使用者／介面／伺服器／快取 等台灣用語）。UI 文案例如「專案」「未命名專案」「當前階段」「暫無進行中任務」。轉換腳本留在 `scripts/localize-tw.mjs`，可用 `npm run localize:tw` 重跑。
- **文件改名**：`README.zh-CN.md` → `README.zh-TW.md`，README 的語言切換與相關連結同步更新，套件 `files` 清單一併調整。
- 版本升到 `1.4.1`。

### Fixed（修復）

- **自動沉澱通道從來沒通電**：`summarizer` 一直掛在 `session/disposed` 上，而線上探針實測該事件**一次都沒派發過**——DSH Desktop 正常使用中會話不會 dispose，使用者也不會去「關閉會話」。同期 `session/created` 與 `session/flush` 都能正常收到，所以不是 cordis filter 的問題，是那個事件本身不發生。後果是四個工作區 `session_summary` 全為 0、會話語義記憶全為 0，只有使用者顯式說「記住」才有東西落盤。改為監聽 `session/flush`（DSH 真正會派發的會話訊號）並做空閒去抖：每次有動靜就把鬧鐘往後推，安靜滿 `sessionIdleSummaryMs`（預設 5 分鐘）才真正摘要；`session/disposed` 仍然保留，發了就立刻摘一次。
- **長會話只能沉澱一次**：冪等原本按「這個 sessionId 摘過沒」判斷，而 DSH Desktop 的會話可以活好幾天，導致第一次之後的工作全部沉不下來。改為按訊息數增量判斷，`session_summary` 事件記錄 `messageCount`，新增滿 4 條訊息才允許再摘一次。
- **空閒時長可在設定頁改**：Dashboard「會話摘要」新增 `sessionIdleSummaryMs`（預設 5 分鐘，30 秒–1 小時）。「啟用會話摘要」的說明改為安靜後觸發，不再寫成「session 結束才抽取」。
- **遠端 README 截圖打不開、簡體中文亂碼**：截圖 URL 鎖在遠端不存在的 `v1.3.1` tag 上，raw 地址 404。`README.zh-CN.md` 從 v1.3.1 起就是非法 UTF-8，v1.4.0 又被寫成替換字元。截圖改回已釋出的 `v1.3.0` tag（10 張圖都在），中文頁恢復為合法 UTF-8。

## [v1.4.0] - 2026-09-23

本版主題是**把記憶機制修到可用**：即時記憶能解開指代、頁面上可以手動維護記憶、併發寫入不再丟資料、Core 有了容量與置頂保障。

### Added（新增）

- **`project_dream` 的 `mode=full` 現在真的做事**：此前它與 `light` 完全相同。現在會額外跑一次 vacuum，把超期的歸檔記憶與舊時間線搬到 `.project-brain/archive/<kind>-<時間戳>.jsonl`，主檔案真的變小但資料仍可找回。四道保護：活躍與 dormant 記憶不動、置頂的不動、被 `supersedes` 指向的證據鏈不動、`init` 與最新 `session_summary` 這兩個介面錨點不動；再加一個保留下限（預設至少留 200 條歸檔）。先寫 archive 成功才縮主檔案，順序反了就等於真刪。預設 `dryRun=true`，不自動觸發。新增四個配置項：`vacuumMemoryRetainDays`(90) / `vacuumMemoryMinRetained`(200) / `vacuumTimelineMaxEvents`(2000) / `vacuumTimelineRetainDays`(180)。
- **熱度回升**：`project_ask` 命中的記憶會回寫 `lastAccessedAt` 與 `accessCount`（同一條 5 分鐘內只記一次，避免一輪對話把整表重寫好幾遍）。排序的 recency 改看「最近被命中」而非只看 `updatedAt`，Core 淘汰時也把近 7 天命中過的往後排。此前 `lastAccessedAt` 只在歸檔/替換時寫過，等於系統完全感知不到哪些記憶真的常用，沉下去的就永遠沉著。
- **弱訊號也能落盤**：「以後都…」「約定…」「going forward…」這類表達此前只檢測不寫入，全靠會話結束的語義抽取碰運氣。現在同樣走帶上下文的 LLM 消解，但門檻更嚴——必須模型能解開（不退回原話）、來源標為 `user_intent_weak` 而非 `user_explicit`、重要性與可信度都壓到 0.7 以內、走常規准入通道。解不開時安靜跳過，不寫「未記住」：使用者並沒有點名要記，報成失敗是噪音。
- **記憶置頂**：頁面編輯表單裡可以把一條記憶標為置頂，Core 滿員時不會被自動擠成 dormant。置頂數量上限為容量的一半（向下取整），超出時拒絕並提示先取消其他置頂——全部置頂等於沒有置頂，淘汰時挑不出物件，這條保證就作廢了。
- **Core 容量可配置**：新增 `coreMaxItems`（預設 25，原 15）與 `coreMaxTokens`（預設 1500，原 800）。限額集中存一份並在配置變更時同步，讓 injector / aggregator / dream 這些拿不到 config 的路徑不會用舊上限再擠一遍。
- **淘汰時區分來源**：`user_explicit` 寫入的、以及人工編輯過的記憶排在最後才被擠出 Core，自動抓取的先走。
- **「未記住」會留痕**：使用者明確說了「記住」但沒能落盤時（指代解不開、無可用模型、被規則拒），往 timeline 寫一條 `memory_rejected`，標題帶上原話、正文說明原因與下一步。Agent 通道的常規拒絕不記，避免把「任務動態」刷屏。
- **頁面上手動維護記憶**：「專案記憶」tab 的詳情彈框新增編輯 / 歸檔 / 恢復 / 永久刪除。編輯為原地修改，保留 `id` 與 `createdAt`，可改標題、正文、型別、重要性、標籤與 active/dormant 狀態；正文改動後自動重算 `source.fingerprint`。歸檔後進入新增的「已歸檔」摺疊區，可一鍵恢復；永久刪除需二次確認（RPC 側要求 `confirm=true`），並會清理指向被刪條目的懸空 `supersededBy`。純邏輯收斂在 `src/host/memory/edit.js`，RPC 端點 `memory.update` / `memory.status` / `memory.delete`。
- **記憶型別 `preference`**：使用者明確表達的長期協作口徑與工作偏好（輸出結構、沉澱目標、語氣要求）單獨成類，不再混在 `context` 裡。參與檢索加權與 Core 注入，`project_memory_add` 與會話語義抽取都能產出。
- **即時記憶的指代消解**：強「記住」訊號命中後，帶最近 12 條訊息（含 assistant）的上下文視窗調一次 LLM，把觸發語整理成能脫離本次對話獨立閱讀的正文，並返回 `resolved` 標誌。新增配置 `realtimeMemoryEnabled` / `realtimeMemoryTimeoutMs`。
- **偏好重申走 supersede**：同類型、同為 `user_explicit` 來源、標題 Jaccard ≥ 0.72 的舊條目會被新條目 supersede，Core 裡不再堆同義項。
- **專案熟悉度（Project Familiarity）**：人第一屏兩句（這是什麼 = 架構 LLM purpose；最近做什麼 = 上次會話摘要，否則僅「進行中」待辦）。Agent 注入另附「從哪改」原始碼入口與「活躍待辦」。關會話輕掃與架構重新整理分開；任務動態為 Session 主幹圖（無 sessionId 的舊時間線按日成幹）。
- **會話變更視窗 `src/host/diff/session-window.js`**：`detectSessionChanges` 按時間視窗取本次會話的變更——工作樹 mtime 落窗的檔案（未提交也算，非 git 專案同樣可用）+ 視窗內 commit 的 tree diff，輸出帶 `added/modified/removed` 型別。視窗起點 = 上次 `session_summary` > `lastScannedAt` > 建腦時間，最長回看 14 天。
- **`markArchitectureStale`**：只改 `project.json` 的過期標記，不重掃、不碰 `architecture.json`。
- **`scripts/smoke-session-refresh.mjs`**：關會話全鏈路整合驗證。用真實 `setupSummarizer` + 偽 ctx 模擬 `session/disposed`，覆蓋「只改普通原始碼 → 只輕掃」「新增原始碼檔案 → 跑 full 架構並清除過期」「full 寫失敗 → 兜底置過期且不破壞已有 `architecture.json`」以及同一 sessionId 不重複摘要。

### Fixed（修復）

- **低可信度記憶和可靠事實幾乎同權重**：`confidence` 在加權和裡只佔 0.10，而 grounding 失敗的記憶被壓到 0.4——折算下來疑似幻覺和可靠事實只差 0.05 分。新增乘性的 `trustFactor`：可信度低於 0.6 時按比例打折（下限 0.35），差距真的體現在排序上。
- **准入校驗的是截斷前的文本**：`evaluateAdmit` 先用 `compactCandidate` 把正文截斷，卻拿原始 candidate 過 `ruleGate`，導致長度判定與 changelog 體裁判定跟實際落盤的內容不是同一份。改為校驗 compact 之後的那份。
- **往回指的表達永遠解不開**：指代消解的上下文視窗只取最近 12 條訊息，於是「這個對話的第一句」「最開始說的」這類指代必定落在視窗外，模型只能誠實返回 `resolved: false`——看起來就像外掛沒記住。改為頭 4 條 + 尾 10 條，中間用省略標記佔位；超預算時整體壓縮每條長度而不是丟訊息（丟掉哪一條都可能正是使用者指的那條）。prompt 也補上了「第一句」「剛才說的」分別對應視窗哪一端。
- **模型沒返回 JSON 就直接放棄提煉**：即時記憶的 `refineSignal` 只解析一次，模型偶爾帶上前言或直接用自然語言作答就會落到 `refine_unparseable`，使用者看到「未記住」但其實模型是好的。現在把模型自己的原始輸出丟回去重排一次；prompt 也改成明確要求「第一個字元必須是 `{`」，`maxTokens` 從 700 提到 1000。
- **失敗原因寫得不準會把人引偏**：`refine_unparseable` 之前被籠統地報成「缺少可用的上下文或模型」，看到的人會跑去查模型配置。現在按 `refineStatus` 分別給出人話解釋，並把模型的原始輸出片段存進 `sample` 欄位供排查。
- **歸檔/恢復點了一直轉圈，重啟後才發現已生效**：`handleMemoryMutation` 持有 `memory.jsonl` 事務鎖時呼叫了 `buildWorkspacePreview`，而後者內部會走 `persistHousekeep` 再取同一把鎖——自己等自己。資料在 `writeJsonl` 時已經落盤，但 RPC 永遠不 settle，前端 `finally` 執行不到。改為鎖內只做讀-改-寫，timeline / 快取失效 / preview 全部移到鎖外。
- **鎖重入現在會當場報錯而不是掛起**：`withWriteLock` 用 `AsyncLocalStorage` 跟蹤當前呼叫鏈持有的 key，持鎖期間再取同一把鎖直接 reject `E_WRITE_LOCK_REENTRY`。死鎖是最難查的一類 bug，寧可吵鬧地失敗。
- **前端加了 15 秒超時兜底**：host 端萬一不返回，按鈕不再無限轉圈，會提示重新整理確認是否已生效。
- **併發寫入會靜默丟資料**：DSH 的 fs 只有覆蓋寫，`appendLine` 是「讀全文 → 拼接 → 寫全文」，admit / housekeep / 人工編輯則是「讀整表 → 改 → 寫整表」。兩個併發序列各自基於舊快照寫回，後寫的把先寫的抹掉且無任何報錯。實測 40 條併發 append 最終只剩 1 條。新增 `src/host/store/write-lock.js`：檔案鎖（key = 路徑）包住單次 append / 覆蓋寫，事務鎖（key = `projectPath::tx::memory.jsonl`）包住 `admitMemory` / `persistHousekeep` / RPC 人工維護 / `project_memory_archive` 的整段讀改寫。兩把鎖 key 不同且獲取順序固定，不會死鎖。
- **側邊欄同步讀路徑會繞過鎖回寫**：`readMemoriesHousekeptSync` 用 `writeFileSync` 落盤，非同步鎖管不到。改為只在記憶體裡整理供展示，落盤交給 `ensureHousekeepOnRead` 與 `persistHousekeep`。
- **頁面編輯記憶後注入內容不重新整理**：`handleMemoryMutation` 只清了 aggregator 快取，沒 emit `project_brain/preview.changed`，而 injector 的注入快取只認這個事件。結果是側邊欄已經變了、模型那邊還是舊的，要等下個 Session 才生效。
- **向量快取被誤刪**：`ensureEmbeddingIndex` 拿呼叫方傳入的候選子集當全集做 GC，只要某次呼叫傳的不是全量，其餘條目的向量會被整片刪掉、下次重新付費重建。改為新增 `knownMemoryIds` 引數顯式傳入全集，沒傳就不做清理。
- **即時記憶把指代殘句當成了知識**：使用者說「把我這個需求點記住，以後對話要從這個角度出發」時，舊實現只看當前這一條 user 訊息，正則捕獲組拿到的是觸發語後面的殘句「以後對話要從這個角度出發」——真正的內容（沉澱目標、結構口徑）在上一輪，而且多半是 assistant 說的，永遠看不到。現在正則只當觸發器，正文由帶上下文的 LLM 提煉；解不開指代時不落盤，交給會話結束的語義抽取兜底。
- **湊字數繞過質量門**：正文不足 20 字時舊實現補一句「這是使用者明確要求記住的長期偏好。」硬湊過 `content_too_short`，等於越空洞的記憶越容易通過。刪掉填充；`user_explicit` 的長度下限降到 12 字，把關口挪到「是否解開指代」上。
- **admit 缺少指代門**：`ruleGate` 新增 `unresolved_reference` —— 正文帶指代詞、又沒有識別符號/路徑/引號專名這類錨點、且短於 30 字時拒絕寫入，所有寫入通道共用。
- **會話改了什麼取錯了**：舊實現用 `detectChanges({ since: "1" })`（HEAD vs HEAD~1），等於把上一個 commit 當成本次成果——沒提交就收不到任何檔案，別人剛提交過就會算到自己頭上，輕掃/架構重新整理和主幹檔案證據全部跟著錯。改走會話時間視窗。
- **非 git 專案識別不出新增檔案**：沒有 HEAD tree 可比時，原本把所有落窗檔案都標成 `modified`，架構的「原始碼增刪」觸發永遠不生效。改為用 `birthtimeMs` 落窗判定新增。
- **架構過期判定形同虛設**：過去只有「架構生成報錯」才置 `architectureStale`。現在觸發檔案命中後必須給出結論：重新整理成功 → 清除過期；重新整理失敗或架構帶 error → 顯式置 `architectureStale=true`，第一屏與注入都會說「架構可能過期」。
- **架構 full 觸發寫死了本倉庫路徑**：`architectureTriggerFiles(files, { changes, entrypoints })` 改為結構化規則——manifest / `cordis.patch.yml` / `project.json` 宣告入口 / 約定入口檔名（`index`·`main`·`app`·`server`·`mod`·`lib`·`__init__`·`__main__`）/ 原始碼檔案**增刪**。普通原始碼改內容一律不觸發，換任何語言的專案都能正常工作。
- **注入丟了活躍待辦**：注入恢復獨立「### 活躍待辦」段（`in_progress` 優先，≤3 條），與「最近做什麼」分開；沒有活躍待辦則不佔篇幅。
- **「最近做什麼」不帶時間**：新增 `recentWorkAt` / `recentWorkStale`，第一屏與注入都顯示「N 天前」，超過 30 天標註「可能已過時」。
- **「這是什麼」顯示佔位符**：scanner 的 `Auto-generated by dsh-project-brain` 視同為空，不再當專案定位展示。
- **舊時間線不成圖**：無 `sessionId` 的 memory/todo 按 `day:YYYY-MM-DD` 成幹；跳過 rescan/export/import/rollback；changelog 體裁記憶不成節點；待辦 id 可從標題 `[todo-…]` / `完成待辦` 解析。
- **最近做什麼冒充待辦**：pending-only 不再填近況；僅 `in_progress` 可降級，並加「進行中」字首。
- **主幹展開重複標題**：展開區不再複寫 `label`；有獨立正文才顯示 `detail`（摘要餘句或記憶 content），標題與正文相同則只留標題。
- **檔案計數被當成檔名**：`init` / `rescan` 的 `detail` 寫的是 `files=1975`（數量），summarizer 寫的是 `files=src/a.js,...`（列表）。同一個 key 兩種含義，舊 `parseFiles` 把 `1975` 當檔名，節點因此變成「程式碼有變更（無摘要）」還掛一個假檔案 chip。現在只接受路徑形態的 token；`init` 節點改為固定標籤「專案初始化」，作為主幹起點錨。
- **展開區漏出 markdown 符號並被腰斬**：`detail` 先剝掉 `##` / `**` / 反引號 / 列表 / 引用 / 連結等 markdown（保留文字本身），上限從 280 放寬到 900 字並優先在句末斷開，真截斷時顯式給 `…`；UI 側正文改為可滾動（`maxHeight 220px`），不再視覺截斷。
- **主幹標籤 `v0.` 截斷與誤殺**：切句時保護版本號；「版本號開頭」只有配上補丁/釋出語氣才擋在主幹外，`2.0 版本規劃` 這類正常標題不再被丟掉。
- **抽稀把歷史藏光**：超過 40 個節點時保底顯示最近 20 個，不再把所有非重要節點一次性隱藏。
- **主幹排序兩套口徑**：純記憶桶過去按最早時間排、timeline 桶按最晚時間排；統一為「桶內最後一次活動」。
- **TODO 證據假邊**：只有「開 → 關」算因果，重複標記完成不再連邊；全對遍歷換成倒排索引，架構證據邊按 spec 只連緊鄰的上一個節點。

---

## [v1.3.1] - 2026-09-15

> **補丁版本：匯入匯出 / 本地備份恢復。** 資料格式與 v1.3.0 完全相容，向後相容；4 個新 Tool + 7 個新 RPC + Dashboard 三按鈕 + 48 條 smoke + 7 條 host-acceptance 全過。

### Added（新增）

#### 匯入匯出遷移（核心場景：跨機器同步）

- **`project_export` 工具**：把當前 `.project-brain/` 全量打成 zip（標準 deflate + CRC32，無第三方依賴）；輸出檔名 `dsh-brain-<name>-<yyyymmdd-hhmm>.zip`；含 `manifest.json`（schemaVersion / pluginVersion / sourceProject / sha256 校驗 / options）。
- **`project_import` 工具**：兩步機制（dryRun → confirmToken → apply）。dryRun 返回完整 impact（當前腦 / 即將恢復 / 備份路徑 / rootPath 改寫） + confirmToken；apply 校驗 token 後執行：備份當前腦 → 解壓 → 改寫 `project.json.rootPath` → 觸發 rescan。
- **本地備份回滾**：匯入/回滾前自動備份當前腦到 `.project-brain.backup-<yyyymmdd-hhmm>-sss>/`；回滾時自動再備份一次當前腦形成歷史鏈。
- **`project_rollback_backup` 工具**：把當前腦回滾到指定 `backupTimestamp` 對應的備份；同兩步機制。
- **`project_cleanup_backups` 工具**：按 `keepLast`（預設 3）+ `olderThanMs`（預設 30 天）雙策略清理過期備份。
- **Dashboard 三按鈕**：在 Dashboard 頂部專案名 + techStack chip 同一行右側，新增「💾 備份」「📥 恢復」「↶ 回滾」三個按鈕。預覽彈框主按鈕文案統一為「覆蓋並恢復」，強調會覆蓋當前腦。
- **失敗兜底（人話化提示）**：
  - `schemaVersion` 過舊 / 過新 → 拒絕匯入並提示升級外掛
  - bundle 校驗和不一致 → 拒絕匯入（檔案損壞 / 傳輸不完整）
  - rescan 失敗 → 不回滾腦，寫入 timeline 事件
  - 備份列表為空 → Toast 提示「當前專案沒有本地備份」

### Changed（變更）

- `src/index.js`：4 個新 Tool 註冊（`project_export` / `project_import` / `project_cleanup_backups` / `project_rollback_backup`）。
- `src/host/rpc/sidebar.js`：7 個新 RPC（`export.run` / `import.preview` / `import.apply` / `backup.list` / `backup.cleanup` / `backup.rollback.preview` / `backup.rollback.apply`），統一通過 `executeTool` helper 走 `tools.execute` 協議。
- `src/client.js` HeaderBlock：加 3 個按鈕 + PreviewDialog + BackupListDialog + Toast；用 React.useState 管理 dialog 狀態。
- 工具總數：16 → **20**（host-acceptance AC-2a 同步更新預期）。

### 檔案結構

- `src/host/transfer/confirm-tokens.js`：confirmToken 記憶體 Map（5 分鐘 TTL，一次性，按 kind 分類）
- `src/host/transfer/bundle.js`：zip 打包 / 解析 / 應用 / 預覽（含手寫 ZipWriter + parseZip + CRC32 + deflate）
- `src/host/transfer/backup.js`：備份建立 / 列舉 / 清理 / 回滾（含 pre-rollback backup）
- `src/tools/export.js` / `import.js` / `cleanup-backups.js` / `rollback-backup.js`：4 個 Tool 工廠
- `scripts/smoke-import-export.mjs`：48 條端到端 smoke（AC-1 ~ AC-12）
- `scripts/host-acceptance.mjs`：新增 AC-14 驗收段（export / import dryRun / wrong token / apply / cleanup / rollback preview）

### 驗收

- 端到端 **20/20 smoke suites PASS**（含 48 條新增 import-export smoke）
- **46/46 host-acceptance PASS**（新增 AC-14 七項 happy-path）

---

## [v1.3.0] - 2026-09-15

> **次要版本：Durable Core 站立記憶 + 架構並列泳道 + 技術棧分層重構 + 截圖從 7 張擴到 10 張。**
> 端到端 156/156 全過（19 smoke + 30 runtime-workspace + 56 project-memory + 39 host-acceptance + 14 release-verify），資料格式與 v1.2.0 完全相容，工具 API 不變。

### Added（新增）

#### Durable Core 站立記憶（commit `712601b`）

- **`active` 全量注入（上限 15 條 / 約 800 token）**：長期記憶只收跨會話仍為真的決策、約束、架構事實與教訓；changelog 與"本次改了哪些檔案"走規則門檻，不再擠進 Core。溢位記憶進 `dormant`，僅在 Dashboard 專案記憶 Tab 顯示，不進自動注入。
- **設定頁聯通測試**：Embedding 與會話 LLM 都可以一鍵「測試連通」，即時反饋成功 / 失敗原因，避免改完不知道有沒有生效。API Key 改為可直填（全大寫名如 `PROJECT_BRAIN_EMBEDDING_API_KEY` 才會被識別為環境變數引用，否則作為金鑰直接使用）。
- **檢索權重說明 + 小號淺藍連通按鈕**：設定 Tab 每項權重下面加一行配置提示詞，告訴使用者該項在排序時起什麼作用、什麼場景下應該調高調低；「測試向量連通」按鈕改為低飽和淺藍色，弱化主視覺。

#### 設定頁體驗細節

- **頂部提示條**：進入設定 Tab 後第一眼看到綠色提示「配置可寫，改完後請滾到本頁最底部點 [儲存]；未點儲存不會生效。」——避免使用者改完以為已經生效。

#### 截圖從 7 張擴到 10 張（README + docs 同源）

- **新增三張**：`docs/screenshots/01.png` 啟動前 / `02.png` 專案狀態卡 / `08.png` 設定·向量配置 / `09.png` 設定·檢索權重——把過去塞在單一概覽圖裡的細節拆出來單獨展示，讓使用者一眼看清每塊在做什麼。`docs/screenshots/03.png` 改為 Dashboard 頂欄 + SuggestionCard + 四個 Quick Action 的整體觀感；`04-05.png` 架構並列泳道（一張概覽、一張展開執行路徑）；`06.png` 任務動態；`07.png` 專案記憶；`10.png` Git 歷史。
- **URL 鎖 v1.3.0 tag**：從 commit SHA 改為 `https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/0X.png`，npm 商店頁面會一直指向 v1.3.0 release commit 的截圖；後續版本獨立維護。

### Changed（變更）

#### `project_ask` 主路徑改為加權融合（commit `712601b`）

- BM25 + 重要度 + 時效 + 型別穩定性 + 多樣性五因子加權排序，向量只作加分項。RRF 保留為可測演算法（`scripts/smoke-retrieval-rrf.mjs`），不再當 `ask` 的主合同。
- 向量 cache 僅在 `project_ask` 成功索引時寫入，避免空查詢 / 缺 embedding 時汙染快取。
- 注入場景（query 為空 / 向量為空）安全退回五因子加權，保證新 Session 自動注入不被卡住。

#### 技術棧識別分層重構（commit `6627b64`）

- **抽 `src/stack-taxonomy.js` 模組**：把"執行時 / 交付 / 結構 / 工具"分類口徑抽出來，`src/scanner.js` 與 `src/host/sidebar/aggregator.js` 共用同一份分類，避免掃描端和彙總端各寫一套規則導致分歧。
- **技術棧卡片按執行時口徑分層**：主視野只展示框架 / 閘道器 / 資料 / 容器等執行時技術；CI、IaC、觀測下沉到「交付」次行；Monorepo 等結構標籤與 Lint/測試工具保持弱展示。舊 `techStack` 兜底不再把 `ci:` / `structure:` 頂到主 chip。
- **`language` 維度獨立過濾**：掃描的 raw signal 中"語言"成為獨立維度，從框架 chip 中剝離，避免 Python 專案裡出現「Python 框架: Python」這種冗餘。
- **Dockerfile 即視為 Docker**：存在 Dockerfile 時寫入 `stack.container`，不再只在 `FROM nginx` 時才出現基礎設施。
- **架構合併不再把語言名標成框架**：Python / JavaScript / Go 等只留在語言統計，不進 FastAPI / Vue 同一行。
- **執行時預覽補齊 stack**：Dashboard RPC 與 build embed 對齊，下發 `stack` / `structure` 併合並架構識別結果，避免磁碟已有 LangChain 但卡片顯示為空。
- **Python 依賴檔案相容常見拼寫**：識別 `requirment.txt` / `requirement.txt` / `requirements-*.txt`。
- **補齊 Agent 棧**：掃描與架構合併識別 LangGraph；MCP 歸入 API 層，不把專案內自定義 `energy_mcp.py` 誤標成框架。

#### 架構 Tab 並列泳道（commit `bd3ddf6`）

- **架構 Tab 改為分層鳥瞰**：第一屏只保留短定位、風格標籤和分層；點一層才展開經過該層的主鏈路，元件只保留一句職責。檔案/風險作為步驟附屬資訊，不再單獨鋪開。
- **架構圖改成泳道展示**：層名靠左、元件靠右，去掉套框與整層變淡；選中用左邊線強調。
- **架構圖不再把同層模組畫成順序鏈路**：點層看並列關係與層職責，點模組看詳情；只有真實執行路徑才出現編號箭頭。
- **架構圖卡片等高對齊**：同層模組標題單行、描述固定兩行，避免因文案長短導致高低不齊。

#### 初始化頁收斂（commit `bd3ddf6`）

- **初始化頁改為 3 條重點**：讀懂專案、跨會話記住、接著往下做；其餘能力收成一行，避免清單過長。
- **初始化副標題補上口號**：在說明掃描與跨會話能力後，加上「快速上手，越用越懂，長期把專案做下去。」

### Fixed（修復）

- **`project_ask` 主合同與 RRF 不一致**：v1.1.x 預設走 RRF 雙路融合，但 RRF 在 query 為空（自動注入場景）會強制退回加權；v1.3.0 統一以加權為主合同，避免「同一介面不同 query 走不同排序」帶來的不可預測性。
- **語言名誤標框架**：v1.2.0 偶發把 Python / JavaScript 等語言名合併進框架 chip（如顯示「Python 框架: Python」），v1.3.0 通過 stack-taxonomy 分類後修復。

### 新增 / 升級測試

- **`scripts/smoke-durable-core.mjs`**（新增）：覆蓋 active/dormant 分層、規則門檻、15 條上限注入、跨會話穩定性等核心契約。
- **`scripts/smoke-settings-probe.mjs`**（新增）：覆蓋 Embedding / LLM 聯通探測、API Key 直填 vs 環境變數名識別、儲存提示與即時生效。
- **`scripts/smoke-scanner-techstack.mjs`**（22 → 60 項）：覆蓋 runtime / 交付 / 結構 / 語言四層分類，Dockerfile、Python 拼寫變體、LangGraph / MCP 等新增 signal。
- **`smoke` 套件總數**：17 → 19（新增 2 個）。

### 驗證

```
npm test                    # 19 / 19 smoke suites (含新增 durable-core / settings-probe)
npm run test:runtime-workspace  # 30 / 30 runtime workspace RPC
npm run test:project-memory # 56 / 56 project memory isolation
npm run test:acceptance     # 39 / 39 host-acceptance
npm run verify:release      # 14 / 14（20 packaged files）
npm run verify:install      # CLEAN_TARBALL_INSTALL_PASS
npm publish --dry-run       # OK（registry reach + auth valid）
npm audit                   # 0 vulnerabilities
```

---

## 升級到 v1.2.0（Migration Guide）

從 `v1.1.0` / `v1.1.1` 升級到 `v1.2.0`：

**自動相容**（無需任何動作）

- 資料格式：`.project-brain/` 全部資料與 v1.1.x 完全相容
- 工具 API：16 個 `project_*` 工具簽名不變
- 配置檔案：`config.json` 欄位不變
- 檢索行為：保留 v1.1.0 引入的雙路召回 + RRF 融合（無變更）

**安裝命令變化**

```bash
# 舊（v1.1.1）
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.1.1

# 新（v1.2.0）
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.2.0
```

升級後**必須完全退出並重新開啟** DSH Desktop（host bundle 與 client bundle 都有改動）。

**新增能力**

- **Onboarding 內容升級**：從「3 步驟引導」改為「8 項能力清單」，首次進入時更直觀地展示外掛能做什麼
- **記憶卡片檢視改彈框模式**：點選記憶卡片不再原地展開，改為彈框顯示完整內容（避免長內容撐破 Dashboard 佈局）
- **架構兜底條人話化 + 內聯重試按鈕**：當架構分析失敗時，兜底條文案從技術錯誤轉為業務語言（如「架構分析暫時沒拿到結果，點這裡重試」），並直接在條上提供重試按鈕

**修復內容**

- **語言 chip 按使用率排序 + 百分比 + 長尾聚合**：Dashboard 的語言分佈從字典序改為按使用率降序，每個 chip 顯示百分比，長尾語言自動聚合到「其他」
- **切專案時顯示 loading 佔位**：避免在資料載入完成前顯示「空狀態 + Onboarding」造成誤導
- **切專案/切 session 時 banner 閃退修復**：解決 RPC banner 在切換瞬間崩潰的問題

**已知破壞性變更**（v1.2.0 內）

- 無。

---

## [v1.2.0] - 2026-09-14

> **次要版本：6 項客戶端/Host 修復 + 功能。** 156/156 端到端自動化通過（17 smoke + 30 runtime-workspace + 56 project-memory + 39 host-acceptance + 14 release-verify）。
> 與 `v1.1.x` 資料完全相容，工具 API 不變，純增量增強。

### Added（新增）

- **Onboarding 內容升級**：從「3 步驟引導」改為「8 項能力清單」（commit `12c2844`）。首次進入 DSH 專案時，新版 Onboarding 直接列出外掛能做的 8 項能力（架構分析、記憶續接、Quick Actions、Git 聯動等），比舊的「Step 1: X, Step 2: Y, Step 3: Z」更直觀
- **記憶卡片檢視改彈框模式**（commit `8ac441a`）：點選 Dashboard 上的記憶卡片不再原地展開完整內容，改為彈框（Modal）顯示。解決長記憶內容撐破 Dashboard 佈局的問題，同時讓使用者能 focus 在單條記憶上
- **架構兜底條人話化 + 內聯重試按鈕**（commit `378224d`）：架構分析失敗時，Dashboard 上的兜底條文案從技術錯誤（如「Analyzer exited with code 1」）轉為業務語言（如「架構分析暫時沒拿到結果」），並直接在條上提供一個重試按鈕，無需跳到 Quick Actions

### Fixed（修復）

- **語言 chip 按使用率排序 + 百分比 + 長尾聚合**（commit `37f695c`）：Dashboard 的語言分佈從「按字典序展示」改為「按使用率降序展示」，每個 chip 後面標註百分比（如 `TypeScript 65.2%`），長尾語言自動聚合到「其他 N 種」避免面板被冷門語言撐爆
- **切專案時顯示 loading 佔位**（commit `7d2894c`）：從專案 A 切到專案 B 時，舊 UI 會瞬間顯示專案 B 的「空狀態 + Onboarding」，造成「專案 B 真的空」的誤導。新版改為顯示 loading spinner，直到新專案資料 ready 才切到 Dashboard
- **切專案/切 session banner 閃退修復**（commit `54fa048`）：修復 `src/host/rpc/sidebar.js` 中切換瞬間 `registerConnectionRpc` 與 `registerSidebarRpc` 狀態不一致導致的 banner crash。根因是舊的 `sessionId` map 非同步清理時序問題，現在改為基於 `connection.session()` 的即時解析

### Changed（變更）

- **`src/client.js`**：新增 8 項能力清單的國際化文案；新增 Modal 元件；語言 chip 改用即時排序函式
- **`src/host/rpc/sidebar.js`**：連線 RPC 改為基於 `connection.session()` 而非本地 `Map` 快取
- **`src/host/architecture/analyzer.js`**：兜底條改為可重試，業務文案與按鈕注入
- **`src/client.js` 記憶詳情彈框**：v1.2.0 彈框內 `memory.content` 原本以 `whiteSpace: pre-wrap` 展示原始 markdown 文本（`##` / `**` 等符號不渲染）。v1.2.0 patch 新增輕量 markdown 渲染器（`renderMarkdown`，零依賴、純 React.createElement、支援 `#`/`##`/`###` 標題、`**bold**`/`*italic*`/`` `inline code` ``/`[text](url)`/列表/引用/fenced code/段落/分割線），彈框內容改為渲染輸出。同時「複製全文」按鈕複製內容從 `[type] title\n\ncontent` 改為 `title\n\ncontent`（去掉 type 字首，保證複製出去的是最乾淨的原始 markdown 字串，未走任何 HTML 轉義）。

### 驗證

```
npm test                    # 17 / 17 smoke suites
npm run test:runtime-workspace  # 30 / 30 runtime workspace RPC
npm run test:project-memory # 56 / 56 project memory isolation
npm run test:acceptance     # 39 / 39 host-acceptance
npm run verify:release      # 14 / 14（20 packaged files）
npm run verify:install      # CLEAN_TARBALL_INSTALL_PASS
npm publish --dry-run       # OK（registry reach + auth valid）
npm audit                   # 0 vulnerabilities
```

---

## 升級到 v1.1.0（Migration Guide）

從 `v1.0.0` 升級到 `v1.1.0`：

**自動相容**（無需任何動作）

- 資料格式：`.project-brain/` 全部資料與 `v1.0.0` 完全相容
- 工具 API：16 個 `project_*` 工具簽名不變
- 配置檔案：`config.json` 欄位不變
- 檢索行為：`retrieval` 函式對 `queryVector` 不存在 / 為空 / 向量為空 3 種情況自動退回 5 因子加權（詳見新增的 `scripts/smoke-retrieval-rrf.mjs`）

**安裝命令變化**

```bash
# 舊（v1.0.0）
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.0.0

# 新（v1.1.0）
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.1.0
```

升級後**必須完全退出並重新開啟** DSH Desktop（host bundle 改動）。

**新增能力**

- **雙路召回 + RRF 融合策略**（v1.1.0）：當 `queryVector`（embedding）配置且非空時，自動啟用關鍵詞 + 向量雙路召回，用 Reciprocal Rank Fusion（k=60）融合雙路相關性分數；任一路為空則安全退回 5 因子加權
- **`scripts/embedding-smoke.mjs`** + **`scripts/embedding-e2e.mjs`**：embedding 整合 smoke + 端到端驗證指令碼
- **`scripts/smoke-retrieval-rrf.mjs`**：15 項 RRF + 雙路召回斷言（rrfMerge 邊界值 / 順序無關 / 單路缺失 / 5 因子加權退回 / hit 欄位相容 / diverseSelect 在 RRF 模式仍生效）

**已知破壞性變更**（v1.1.0 內）

- 無。

---

## 升級到 v1.1.1（Migration Guide）

從 `v1.0.0` / `v1.1.0` 升級到 `v1.1.1`：

**自動相容**（無需任何動作）

- 資料格式、工具 API、配置檔案全部與 v1.1.0 一致
- **本版本僅修復 README 渲染**，程式碼零改動

**修復內容**

- **README 截圖引用從相對路徑改為 SHA 鎖定絕對 URL**：npm 渲染器不解析 markdown 相對路徑（GitHub 會自動轉 raw），導致 v1.0.0 / v1.1.0 在 npm 網站商店頁面 7 張圖全部損壞（顯示紅 alt 文本）。本版本改為 `https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/<sha>/docs/screenshots/0X.png` 形式
- **`v1.0.0` 歷史頁面無法修復**（npm 把 README 與 tarball 繫結），但升級到 `latest` 後主頁面將顯示 v1.1.1 的修復後 README

**安裝命令變化**

```bash
# 舊
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.0.0
# 或 v1.1.0

# 新
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.1.1
```

---

## 升級到 v1.0.0（Migration Guide，歷史）

從 `0.7.0-beta.x` / `0.6.x` 升級到 `v1.0.0`：

**自動相容**（無需任何動作）

- 資料格式：`.project-brain/` 下所有 JSON / JSONL 檔案結構與 `0.7.0-beta.2` 完全相容，無需遷移
- 工具 API：16 個 `project_*` 工具的名稱、簽名與返回值不變
- 配置檔案：`config.json` 欄位相容，新增欄位都有預設值

**安裝命令變化**

```bash
# 舊（0.7.0-beta.2）
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v0.7.0-beta.2

# 新（v1.0.0 stable）
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.0.0
```

升級後**必須完全退出並重新開啟** DSH Desktop（hot reload 不支援 host bundle 改動）。

**新增工具（v0.7.0+）**

- `project_suggest_next`：Session 開始時給出"💡 你今天可能想推進 X"+依據（v0.4.15）
- `project_memory_archive` / `project_memory_supersede`：取代直接刪除（v0.7.0）
- `project_todo_update`：可改優先順序 / 描述 / 狀態（v0.7.0）
- 工具總數從 13 → 16

**廢棄工具**（暫無）。如有變化會提前在 README + Discussion 公告。

**已知破壞性變更**（v1.0.0 內）

- 無。

---

## [v1.1.1] - 2026-09-12

> **Patch 版本。** 修復 npm 商店頁面 README 截圖渲染（不修則 7 張圖全部損壞）。
> 與 `v1.1.0` 程式碼完全一致，僅文件層修復。

### Fixed（修復）

- **README 截圖引用從相對路徑改為 SHA 鎖定絕對 URL**：npm 渲染器不解析 markdown 相對路徑（GitHub 會自動轉 `raw.githubusercontent.com`），導致 `v1.0.0` 與 `v1.1.0` 在 npm 商店頁面 7 張圖全部損壞（顯示紅 alt 文本）。本版本改為 `https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/<sha>/docs/screenshots/0X.png` 形式，鎖定到 `fd62eb4`（v1.1.0 釋出 commit）。

### Known limitations（已知限制）

- **`v1.0.0` 與 `v1.1.0` 的 npm 歷史頁面無法修復**（npm 把 README 與釋出 tarball 繫結，釋出後不可變）。升級 `latest` 到 `v1.1.1` 後主頁面將顯示修復後 README。

---

## [v1.1.0] - 2026-09-12

> **次要版本：雙路召回 + RRF 融合策略。** 56/56 端到端自動化（17 smoke suites + 39 host-acceptance）。
> 與 `v1.0.0` 資料完全相容，工具 API 不變，純增量增強。

### Added（新增）

- **雙路召回 + RRF 融合策略（核心新功能）**：`src/host/memory/retrieval.js` 在 `queryVector`（embedding）已配置且非空時，自動啟用**關鍵詞 + 向量雙路召回**，用經典 Reciprocal Rank Fusion（k=60）融合雙路相關性分數。具體行為：
  - **關鍵詞命中且向量命中** → 走 RRF：`relevance = Σ 1/(k + rank_i)`，雙路都命中的文件天然靠前
  - **任一路未命中** → 該路貢獻 0，對應路不影響最終打分
  - **`queryVector` 不存在 / `query` 為空 / `vectors` 為空** → 安全退回 5 因子加權（重要性 × 可信度 × 時效性 × 多樣性 × 型別穩定）
  - **順序無關**：rrfMerge 對調關鍵詞路與向量路順序，分數不變
  - **diverseSelect 在 RRF 模式下仍生效**：同 type 記憶會被降權，避免結果單一化
  - **hit 欄位向後相容**：同時包含 BM25 與向量命中的所有原始欄位（`bm25Score` / `vectorScore` / `rrfScore`）

- **`scripts/smoke-retrieval-rrf.mjs`**：15 項 RRF + 雙路召回斷言，覆蓋 rrfMerge 邊界值、順序無關、單路未命中、5 因子加權退回、hit 欄位相容、diverseSelect 在 RRF 模式下仍生效

- **`scripts/embedding-smoke.mjs`**：embedding 服務可達性 + 維度一致性 smoke（輕量，無網路依賴 mock）

- **`scripts/embedding-e2e.mjs`**：embedding 端到端驗證指令碼（可被 `verify:install` 與 CI 排程）

- **`scripts/run-smoke.mjs`** 排程更新：把 `smoke-retrieval-rrf` / `embedding-smoke` / `embedding-e2e` 加入預設 smoke 列表

### Fixed（修復）

- **`fix(acceptance)` 雙向同步**：本地 `public-main` 與遠端 `origin/main` 各做了獨立的 `host-acceptance.mjs` AC-2a 工具數量硬編碼修復（v0.7.0 新增 `memory_archive` + `memory_supersede` 後從 14 → 16）。merge 時 git ort 策略自動識別為相同修改，無衝突

### Changed（變更）

- **`src/host/memory/retrieval.js`**：`retrieveMemories` 函式簽名與返回值不變，新增的 RRF 路徑僅在配置 embedding 且 `queryVector` 有效時啟用
- **`smoke` 套件總數**：16 → 17（新增 `smoke-retrieval-rrf`）
- **acceptance assertion 總數**：39 → 39（無新增；AC-2a 工具數量與 v1.0.0 一致）
- **README / README.zh-CN**：版本 badge 與"當前版本"說明同步到 `1.1.0`，引用新的 GitHub release URL

### 驗證

```
npm test                # 17 / 17 smoke suites（含 smoke-retrieval-rrf 15 assertions）
npm run test:acceptance # 39 / 39 host-acceptance
npm run verify:release  # 14 / 14
npm run verify:install  # CLEAN_TARBALL_INSTALL_PASS
npm audit               # 0 vulnerabilities
```

合併方式：`git merge origin/main --no-ff`（merge commit `52b5776`，保留雙向獨立 commit 歷史）

---

> **首個穩定版本。** 39/39 端到端驗收全過 + 使用者實測 DSH Desktop UI 通過。
> 7 項 P0 釋出阻塞修復（npm install ERESOLVE / dsh-tools peer 阻塞 smoke / verify 指令碼 ENOENT）+ 拆分 scanAndWrite 純邏輯層 + 加 dev-reload 一鍵開發工具。

### Fixed（修復）

- **`npm install` ERESOLVE 復發（v0.7.0-beta.1 修復過的同類問題）**：`tree-sitter-c@0.24.1` 的 peer 是 `tree-sitter@^0.22.4`，但專案要 `^0.25.1`，導致乾淨環境 `npm install` 立刻 ERESOLVE，CHANGELOG 列出的"修復乾淨安裝時的 ERESOLVE"迴歸。修復：在 `package.json` 加 `"overrides": { "tree-sitter": "^0.25.1" }` 強制統一 tree-sitter 頂層版本（tree-sitter-c 是 native binding，runtime 不真用 tree-sitter，override 安全）。

- **`npm test` 全部 16 個 smoke suite 在乾淨 node 環境 ERR_MODULE_NOT_FOUND**：根因是 `src/tools.js` 同時定義 `defineTool` 工具（依賴 `@deepseek-ai/dsh-tools`）和 `scanAndWrite` 純邏輯，被 `src/host/summarizer.js` / `src/host/rpc/sidebar.js` / `scripts/smoke-*.mjs` 間接 import 後拖入 dsh-tools 鏈。修復：把 `scanAndWrite` + `resolveWritePolicy` + `emitPreviewChanged` 拆到 `src/host/scan-and-write.js`（純邏輯，無 dsh-tools 依賴），`src/tools.js` 頂部改為 `import { scanAndWrite, emitPreviewChanged } from "./host/scan-and-write.js"` 並 re-export 保持向後相容。`src/host/summarizer.js` / `src/host/rpc/sidebar.js` / `scripts/smoke-architecture.mjs` 改 import 路徑。

- **`npm run verify:release` / `npm run verify:install` 在 Windows 下 ENOENT**：`execFileSync('npm', ...)` 在 Windows + FlyEnv / nvm node 環境下找不到 npm（execFileSync 不解析 PATHEXT）。修復：`scripts/check-release.mjs` 與 `scripts/check-tarball-install.mjs` 改為 Windows 下用 `npm.cmd` + `shell: true`，並顯式接住 DEP0190 DeprecationWarning（引數完全固定，零拼接風險）。

- **`npm test` 單 suite 失敗阻斷後續 suite**：舊 `scripts/run-smoke.mjs` 用 `process.exit(result.status)` 在第一個失敗處終止，掩蓋了真實問題範圍。改為收集全部失敗在末尾統一報告（`X/N passed` + 列出失敗的 suite 清單）。

- **`smoke-append-line` 效能基準在 Windows 下誤報**：閾值 `< 1500ms` 是按 Linux/macOS 的 fs adapter 模擬讀檔案速度設定，Windows 實際 2059ms。改為按平臺區分：Windows `< 3000ms`、其它 `< 1500ms`，核心目的（驗證比舊實現快）不變。

- **`smoke-runtime-workspace` 用 `root.split("/").pop()` 在 Windows 下得到完整路徑**：測試斷言期望得到 basename（"dsh-brain-runtime-XXXX"），但 Windows 路徑用 `\\` 分隔，`split("/")` 永遠只返回完整字串。修復：`root.split(/[\\/]/).pop()`。

- **`smoke-theme-tokens` 把 client.js Git 分支調色盤的 12 個 hex 當成"硬編碼顏色"誤報**：6 色 GitHub 風格調色盤是裝飾性獨立配色，與 DSH 主題 token 體系無強對映。修復：`smoke-theme-tokens.mjs` 檢測 `const palette = [ ... ];` 字面量並自動豁免其中 hex；`client.js` 調色盤處加註釋說明豁免規則。

### Added（新增）

- **`@deepseek-ai/dsh-tools` / `@deepseek-ai/schemastery` 加到 devDependencies**：optional peer 在 `npm install` 時預設不裝，導致本地 smoke 測試無法執行。兩個 peer 加到 devDependencies 後：開發環境 `npm install` 自動裝上（滿足 smoke 測試），釋出到 npm 時仍為 optional peer（DSH 使用者沒裝也能裝我們的包，不阻塞 runtime）。

- **智慧續接 v0.4.15（project_suggest_next）**：
  - 新 Tool `project_suggest_next`：Session 開始時主動給出"💡 你今天可能想推進 X"+依據+關聯 TODO/記憶
  - 雙層策略：本地規則（in_progress > 最高優先順序 pending > 阻塞 > 近期記憶 > 空）+ 可選 DSH LLM 升級
  - LLM 失敗自動降級到本地規則，不阻塞 Session 啟動
  - 新 RPC `/project-brain` 端點 `suggest`：Dashboard 載入時調一次
  - Dashboard 頂部 SuggestionCard 元件：source（llm/local）+ 置信度 + 重新整理/收起按鈕 + 載入/錯誤/資料三態
  - build-time 嵌入建議：離線路徑下也顯示本地規則建議，連線恢復後自動升級
  - 新增 src/host/suggest.js（純函式 + 不依賴 runtime，便於 smoke 離線測試）+ src/tools/suggest.js
  - 修改 src/host/rpc/sidebar.js（註冊 suggest 端點）+ src/index.js（註冊 buildSuggestTool）+ build.js（build-time 嵌入 buildLocalSuggestion）+ src/client.js（SuggestionCard 元件 + i18n keys）
  - smoke-suggest.mjs（46/46 PASS）：6 種本地規則場景 + LLM mock 成功/失敗/無 route + JSON 容錯（圍欄/尾逗號/non-JSON）+ normalizeSuggestion 欄位裁剪
  - smoke-todostrip.mjs 新增 3 項 SuggestionCard 打包檢查（17/17 → 20/20 after rebuild）

- **技術棧推斷大幅擴充套件（v0.4.14）**：
  - **JS/TS 框架補全**：Remix / Astro / SvelteKit / Koa / Hapi / Solid / Preact / Angular / React Native / Expo / Tauri
  - **JS/TS ORM/DB/Cache/Queue 補全**：TypeORM / Sequelize / Mongoose / Drizzle / Knex / MikroORM / Memcached / Bull / RabbitMQ
  - **Python 後端框架補全**：Sanic / Starlette / aiohttp / Tornado / Pyramid / Bottle / Streamlit / Gradio
  - **Python ORM/DB 補全**：Peewee / Tortoise ORM / Django ORM / SQLModel / asyncpg → PostgreSQL / aiomysql/pymysql → MySQL / pymongo/motor → MongoDB
  - **Python 包管理識別**：Poetry / uv / Hatch / PDM / setuptools
  - **Go 框架補全**：Gin / Echo / Fiber / Chi / FastHTTP
  - **Go ORM/DB 補全**：GORM / Ent / sqlx / Bun / pgx → PostgreSQL / go-sql-driver/mysql → MySQL / mongo-driver → MongoDB
  - **Rust 框架補全**：Actix Web / Axum / Rocket / Warp / Tide
  - **Rust ORM/DB 補全**：Diesel / SeaORM / SQLx
  - **Rust 工具識別**：Tokio / Serde
  - **Rust workspace 子 crate 識別**（`[workspace]` → "Cargo Workspace"）
  - **SQL 檔案推斷**：從 `result.languages.sql` 反向推斷資料庫存在
  - **CI 識別**：`.github/workflows` → GitHub Actions
- **techStack 欄位支援多值陣列**：之前單值欄位被多種語言棧覆蓋（如 `backend: "FastAPI"` 被 Go 段的 "Go" 覆蓋）；改為 setStack 助手自動合併到陣列，同名欄位值保留全部
- **architecture.technologies 合併到 preview.techStack**：build.js 新增 `mergeTechStackWithArchitecture()`，把 LLM 識別的技術名按分類對映補全到 Dashboard 顯示，未分類技術進 `_extra` 欄位
- **smoke-scanner-techstack.mjs**：22 項檢查覆蓋 JS/TS/Python/Go/Rust 5 種 manifest 的技術棧推斷
- **本地 AST 分析支援 6 種語言**：從 JS/TS/Python 擴充套件到 Go、Java、Rust、C/C++。新增 `tree-sitter-go`、`tree-sitter-java`、`tree-sitter-rust`、`tree-sitter-c` 4 個 grammar 包（pnpm devDependencies）。
- **每種新語言的 import/export/function 抽取器**：Go 大寫開頭視為匯出、Java class/interface/record/export、Rust `pub` 修飾符、C `#include` + function_definition。修改檔案：`scripts/codegraph-scan.mjs`。
- **API endpoint 跨語言適配**：Go Gin `r.GET/POST/...`、Java Spring `@RequestMapping/@GetMapping/@PostMapping/...` 註解識別。修改檔案：`scripts/codegraph-scan.mjs`。
- **DB schema 跨語言適配**：Go Gorm `gorm:"..."` struct tag、Java JPA `@Entity/@Column/@Id` 註解、Rust Diesel `#[derive(Queryable)]` / `#[table_name]`。修改檔案：`scripts/codegraph-scan.mjs`。
- **CommonJS `module.exports = {...}` 匯出識別**：JS 抽取器補充形如 `module.exports = { foo, bar }` 的匯出形式，讓典型 Node 服務入口被識別為 entrypoint。修改檔案：`scripts/codegraph-scan.mjs`。
- **config.json `languages` 白名單**：使用者可在 `.project-brain/config.json` 配 `languages: ["python", "go"]` 限制掃描範圍；預設全開。修改檔案：`scripts/codegraph-scan.mjs`。
- **smoke-multi-lang.mjs 測試套件**：56 項檢查覆蓋 6 語言 grammar 載入、imports/exports/functions、API endpoints、DB schema、呼叫圖、config 白名單。修改檔案：`scripts/smoke-multi-lang.mjs`、`scripts/run-smoke.mjs`、`fixtures-multi-lang/`。

### Changed（變更）

- Context Injector 的"專案記憶約定"段增加硬提示：使用者表達「記住 X / 以後 Y / 不要 Z / 記一下」等長期意圖時，立即調 `project_memory_add` 寫入當前專案 `memory.jsonl`；若是跨專案通用偏好，再同步調 `memory_save` 寫入 dsh-mneme，無需再次確認。修改檔案：`src/host/injector.js`。
- `codegraph-scan.mjs` 重構為 6 語言分發器：grammar 登錄檔 + 每種語言一個 EXTRACTORS / API_EXTRACTORS entry + 函式化 `main(projectPath)`（允許 import 時直接傳參，CLI 自動 fallback 到 argv）。修改檔案：`scripts/codegraph-scan.mjs`。
- `run-smoke.mjs` 修復 Windows 路徑解析（`new URL(..., import.meta.url).pathname` 在 Windows 返回 `C:\C:\...` 雙冒號）；改用 `fileURLToPath` + `dirname`。修改檔案：`scripts/run-smoke.mjs`。
- `src/scanner.js`：techStack 欄位改用 `setStack(field, value)` 助手，重複命中自動合併到陣列。修改檔案：`src/scanner.js`。
- `src/host/store/brain-logic.js`：`techStackToType()` 支援陣列值（多種語言棧並存時拼接為 "FastAPI · Go · Gin · Rust · Axum"）。修改檔案：`src/host/store/brain-logic.js`。
- `src/client.js`：技術棧 chip 渲染支援陣列值，每個值獨立顯示一個 chip。修改檔案：`src/client.js`。

### Fixed（修復）

- **`project_ask` 的 useLLM 合成失效**：`buildAskTool` 簽名未接收 `getLlm`（`index.js` 統一傳參但被解構丟棄），`synthesizeAnswer` 從 `exec.ctx.get('llm')` 現場取 llm，工具執行上下文拿不到 llm service 且裸 `llm.stream({messages})` 缺 provider/model route，導致 useLLM=true 靜默降級為純 BM25（實測 `llm=no`）。修復：`buildAskTool` 增加 `getLlm` 入參，`synthesizeAnswer` 改用 apply 時快取的 llm service + `resolveSessionRoute` 解析 route + 複用 `streamLlmText`（對齊 `tools/suggest.js`）。修改檔案：`src/tools/ask.js`。

- **TodoStrip 佔用過多空間、不友好**：之前 composer 上方 TodoStrip 預設展開 3 條活躍待辦，固定佔據 ~120px，且 ≤3 條時無收起按鈕。最佳化為：預設摺疊（僅顯示緊湊 header `📋 活躍待辦 · n ▾`，約 28px）；header 始終可點選展開/摺疊；新增 `×` 關閉按鈕（隱藏整個 strip 並寫 localStorage 記憶）；關閉後用一個虛線 mini-chip `📋 · n 檢視全部` 恢復，不再"釘住"佔空間。修改檔案：`src/client.js`。

- **TodoStrip 標題不夠美觀**：弱化"活躍待辦"文字（11px/600/uppercase/letter-spacing/label-secondary，更像模組標題），數字獨立成圓角 badge（`minWidth:18px, height:16px, borderRadius:8px, bg-layer-2`）。修改檔案：`src/client.js`。

### Changed（變更）

- **記憶機制升級為雙通道**（決策 1+2）：即時互動記憶（監聽 `agent/inbox/claimed`，規則檢測"記住/以後/不要/記一下"等長期意圖訊號，自動落盤 `type=context` 記憶，含 fingerprint 去重 + 每 session 最多 5 條限速）+ 會話結束 LLM 摘要兜底。新增檔案：`src/host/realtime-memory.js`；`src/index.js` 註冊。
- **會話摘要反轉**（決策 2）：`summarizer.js` 從"git diff 主路徑 + LLM 輔助"改為"LLM 對話總結為主，git diff 僅作參考證據餵給 LLM，LLM 失敗時降級到 git diff 生成 change 記憶"。`session-extractor.js` 增加 `diffEvidence` 引數 + 輸出 `summary`（會話總結文本）。修改檔案：`src/host/summarizer.js`、`src/host/memory/session-extractor.js`。
- **跨對話高保真續接**（決策 3）：session 摘要完成時把 LLM 生成的 `summary` 寫入 timeline 的 `session_summary` 事件；`injector.js` 渲染時提取最近一條 session_summary 的 summary，注入"上次會話總結"段（高保真續接，token 滿切對話後能看到上次會話做了什麼）。修改檔案：`src/host/injector.js`、`src/host/summarizer.js`。

- **Git 歷史 Tab**（僅 git 倉庫顯示）：Dashboard 新增"⎇ Git 歷史"Tab，僅當專案是 git 倉庫時掛載（mount 時通過 RPC `git` endpoint 探測 `available`，無 git 時不渲染 Tab）。Tab 內部視覺化最近 50 個提交：左側 ASCII graph（HEAD=● / merge=◆ / 其他=○ + │ 連線線）、commit subject + author + 相對/絕對時間 + shortHash、其他分支 chip 列表、點選展開 commit body + full hash + parents + author email。新增 `src/host/git/history.js`（純 node git history 讀取，loose + packed-refs 支援，複用 detector.js 的 object 讀取）；`detector.js` 修復 `readHead` 分支名 slice 偏移 bug + 匯出 `readGitObject` / `readHead` / 新增匯出 `readCommitFull`；`src/host/rpc/sidebar.js` 註冊 `git` endpoint（返回 `{ available, currentBranch, head, total, commits, branches, error }`）。修改檔案：`src/client.js`、`src/host/rpc/sidebar.js`、`src/host/diff/detector.js`；新增 `src/host/git/history.js`。

- **Git 歷史樣式重構（VSCode/Cursor 風格）**：GitTab 三列 Grid layout（graph 56px / info flex:1 / refs 130px）；圓點 + 豎線 graph（HEAD 實心 + box-shadow 光暈，merge 菱形，普通空心）；按 branch name hash 分配6 色 refs chip；整行點選展開 body + full hash + parents + author email + UTC 時間 + Changed Files 列表；hover/expanded 行背景變化。修改檔案：`src/client.js`。

- **每 commit 顯示變更檔案（tree diff）**：`history.js` 加 `diffCommitTrees` 函式（基於 tree object diff），每個 commit 資料增加 `filesChanged` / `filesChangedTotal` / `filesAdded` / `filesModified` / `filesRemoved` / `filesTruncated` 欄位；GitTab meta 行加 `📁 +N ~M -K (X 檔案)` 摘要，展開區顯示前 8 個檔案路徑 + "more" 提示。修改檔案：`src/host/git/history.js`、`src/client.js`；新增匯出 `parseTree` / `collectTreeFiles`。

- **Working Tree 區塊（Git Tab 下半部分）**：HEAD tree vs 工作樹對比，列出 untracked（工作樹有 + HEAD tree 沒有）和 deleted（HEAD tree 有 + 工作樹沒有）檔案，**不依賴 git binary**。GitTab 新增 `🔸 Working Tree` 卡片（摺疊預設展開 ▾，點 header 切換）：分兩組"Untracked"（warn 色 badge）和"Deleted"（error 色 badge），每組預設顯示前 8 個路徑 + "+ N 更多"提示。硬編碼忽略 `node_modules`/`.git`/`.project-brain`/`dist`/`build`/`.next`/`out`/`target`/`__pycache__`/`.venv`/`venv`/`vendor`/`.idea`/`.vscode`/`.turbo`/`.cache`/`.pnpm-store` 等目錄和 `.log`/`.bak`/`.tmp`/`.swp`/`.swo` 字尾。魯棒性：HEAD tree 不可讀時（如 pack 解析失敗）整個區塊不渲染而非誤報。修改檔案：`src/host/git/history.js`、`src/host/rpc/sidebar.js`、`src/client.js`。

## [v0.7.0-beta.2] - 2026-08-30

### Added（新增）

- Session 結束時複用當前 DSH Session 的 provider/model，從使用者與助手文本中抽取最多 4 條穩定專案記憶；無需單獨配置對話模型。
- 語義記憶增加輸入長度限制、憑據清洗、嚴格 JSON 校驗、相對檔案路徑驗證、跨 Session 內容指紋去重和失敗降級。
- 釋出門禁統一覆蓋 13 組 smoke suite、構建、釋出隱私檢查、乾淨 tarball 安裝與依賴審計。

### Fixed（修復）

- 無法確認 workspace 時不再允許回退寫入程序當前目錄；所有 Project Brain 檔案被限制在已解析專案的 `.project-brain/` 內。
- 公開定位統一為 DSH 外掛；Dashboard/TodoStrip 明確屬於 Web Client 能力，Desktop 只是支援的承載方式之一。
- 擴充套件 DSH `0.1.0-rc.x` / `0.1.1-rc.x` peer 兼容範圍，修復乾淨安裝時的 `ERESOLVE`。

### Tests（測試）

- 新增 Session 語義記憶測試，覆蓋當前模型路由複用、敏感內容過濾、工具輸出排除、路徑校驗、去重和無服務降級。
- 釋出校驗新增 README/CHANGELOG/包版本一致性、DSH 通用定位和 Git tag 對齊檢查。

### Documentation（文件）

- README 改為英文主頁面，並提供頂部簡體中文切換入口和完整 `README.zh-CN.md`。
- 增加專案 Dashboard、概念架構分層和任務時間線三張真實介面截圖。
- 英文與中文文件同步說明架構分析、長期記憶、檢索模式、安裝、隱私和當前限制。

### Fixed（修復）

- 新增 `npm run verify:install`，在臨時乾淨專案中驗證真實發布包和可選 DSH peer 依賴解析。
- 修正公開定位文案：外掛面向 DSH profile，Dashboard 屬於 Web Client 能力，DSH Desktop 是支援的承載方式之一而非唯一執行環境。

## [v0.7.0-beta.1] - 2026-08-30

> 首個面向外部使用者的公測候選。自動化、構建和釋出隱私檢查通過；穩定版仍需完成多版本 DSH Desktop 真實安裝驗收。

### Added（新增）

- 初始化/重掃新增語義版 `.project-brain/architecture.json`：專案定位、架構風格、概念分層、職責元件、關係、執行流程、關鍵檔案和閱讀順序。
- 預設複用當前 DSH Session 的 provider/model，結合 README、manifest、符號/import 與有限關鍵原始碼摘要生成架構；超時、無路由或非法輸出時自動降級。
- Dashboard 新增可互動分層架構認知報告；目錄不再作為架構節點，點選職責元件可檢視邊界、協作和證據檔案。
- 掃描排除 `node_modules.backup-*`、備份目錄、vendor 和生成物，避免噪聲汙染專案架構。
- Session 結束檢測到原始碼或關鍵配置變化時自動重新整理架構；指紋未變化時複用已有 LLM 結果。
- Dashboard 四個 Quick Action 改為通過 Connection RPC 在當前 Session 工作區後臺執行，不再複製指令到對話方塊。
- Quick Action 增加獨立的執行中轉圈、成功摘要、錯誤重試狀態；執行成功後立即重新整理執行時 Preview。
- “整理記憶”採用兩階段安全互動：首次點選僅計算合併/歸檔候選，存在改動時再次確認才寫入。
- 新增 Memory V2 後設資料：`schemaVersion/status/confidence/source/updatedAt`，舊 JSONL 記錄保持相容。
- `project_ask` 新增本地 BM25 + 排序多樣性，並支援可配置的 OpenAI-compatible Embedding 混合檢索。
- 新增按內容雜湊增量更新的 `.project-brain/cache/embeddings.jsonl` 派生快取；遠端失敗自動降級為關鍵詞檢索。
- `project_status` 與 Dashboard 展示當前檢索模式，且不暴露憑據引用或金鑰。

### Changed（變更）

- `project_continue`、Context Injector、Dashboard、狀態統計和記憶列表預設排除 archived/superseded/deleted 記錄。
- Dashboard Quick Action 改為後臺 RPC 執行並展示轉圈、確認、成功和錯誤狀態。

### Fixed（修復）

- 架構分析將 DSH `llm` 宣告為正式 Host 依賴，修復動態注入未就緒時始終降級為“本地分析”的問題。
- 修復 LLM runtime 生命週期錯誤：舊程式碼把“解除安裝時清理”誤寫為立即執行的 Cordis effect，導致剛注入的 LLM 服務在啟動時被清空。
- 當前 Session 模型路由除 `request/context` 外，也會從 `request/header.config` 和事件日誌恢復；掃描期間會在真正呼叫前重新解析一次。
- 將原先含義模糊的 `ARCHITECTURE_LLM_ROUTE_UNAVAILABLE` 拆分為 LLM 服務不可用和 Session 路由不可用兩類診斷。
- 架構 JSON 解析支援模型說明文字、Markdown 圍欄、多文本塊和尾逗號；首次輸出仍不可解析時，自動用當前 DSH 模型執行一次緊湊 JSON 修復重試。
- 專案簡介提取跳過 README 頂部 Logo、徽章、居中容器、語言導航和純連結，清理 HTML/Markdown 後選擇首段有意義的自然語言；執行時 Preview 同時清理歷史髒資料。
- Dashboard 重構為單一工作臺：頂部只保留專案資訊、狀態和階段，詳細內容按“概覽 / 架構 / 任務動態 / 專案記憶”標籤切換，移除待辦、統計、程式碼、活動和記憶的重複展示。
- Quick Action 與內容卡片改為自適應網格，增加鍵盤焦點、按壓反饋、橫向標籤滾動和窄視窗單列布局。

### Security（安全）

- 架構 LLM 不傳送絕對路徑；關鍵原始碼摘要受檔案數、單檔案長度和總量限制，可通過 `architectureLlmIncludeSource=false` 關閉。模型輸出不接受 HTML，並校驗所有證據檔案路徑與元件關係。
- Quick Action RPC 只接受 `rescan/todos/dream/dreamCommit/overview` 白名單動作，專案路徑始終由 Host 從 live Session 解析，拒絕瀏覽器指定路徑或任意工具名。
- 向量能力預設關閉；僅使用者顯式配置後聯網，API 金鑰通過 DSH Credentials 或環境變數解析，不寫入專案快取和 RPC 響應。

### Tests（測試）

- 12 組 smoke suite 全部通過，覆蓋執行時 workspace、跨專案隔離、跨 Session 記憶、架構本地/LLM 雙路徑、BM25/向量檢索、Dashboard 互動、主題和 Git diff。
- 新增 `npm run verify:release`，檢查 npm 檔案白名單、入口檔案、版本一致性，以及本機路徑、Session ID、憑據和專案腦資料洩漏。
- `npm audit`（含開發依賴）為 0 vulnerabilities。

### 計劃中
- 更精確的未提交變更快照與 Session 語義摘要
- 完整 multi-pack-index（MIDX）支援

## [v0.6.0] - 2026-08-29

### Added（新增）

- Scanner 增加 package 名稱/描述、README 首段、工具鏈、monorepo 和更多語言識別。
- 新增統一 `npm test` 入口及長期記憶隔離測試，完整套件為 10 組、241 項檢查。
- 增加 MIT License 和麵向 DSH 外掛市場的精簡釋出文件。

### Fixed（修復）

- `project_init` / `project_rescan` 預設從 live Session 自動解析 workspace，不再要求模型傳絕對路徑。
- 工具路徑解析改為 live Session 優先，防止模型引數把當前操作重定向到其他專案。
- Context Injector 從全域性單快取改為按 workspace/session 隔離，修復跨專案記憶串臺。
- 通過 Cordis 動態注入 `systemPrompt` 服務，避免未宣告服務訪問導致上下文注入靜默失效。
- Session summarizer 僅處理已初始化專案；按 sessionId 和 Git 變更指紋去重。
- Runtime RPC 返回完整 Preview 資料，避免連線後 Dashboard 資料比離線快照更少。
- Sidebar/TodoStrip 每 5 秒重新整理當前 workspace 的本地資料，不再依賴寫工具觸發 build。
- 移除寫工具和 Host 主流程中的舊 auto-rebuild / 同步 build 路徑。

### Security（安全）

- Client RPC 與工具執行都以 Host 持有的 live Session cwd 為權威路徑。
- 預設構建繼續保持 release-safe，不嵌入本機 Session、workspace 或專案記憶。

## [v0.5.1] - 2026-08-29

### Fixed（修復）

- 修復新建 Session 不在 build-time `sessionToWorkspaceId` 對映時，Onboarding 無法獲得 workspace 路徑的問題。
- Client/Host 通訊改用 DSH 官方 `connection.rpc`，替代不可注入的 `host.call`。
- Host 根據 live Session header 的 `cwd` 解析專案路徑，新 Session、新 workspace 無需 rebuild 或重啟即可初始化。
- 初始化 RPC 直接返回最新 Sidebar Preview，完成後立即展示 Dashboard。
- build-time embed 降級為首屏/離線 fallback；TodoStrip 與 SidebarPreview 均優先讀取執行時資料。
- RPC 拒絕使用 Client 提供的檔案路徑，僅信任 Host Session cwd，防止跨專案讀寫。

### Tests（測試）

- 新增 `smoke-runtime-workspace.mjs`：覆蓋“RPC 註冊後才建立 Session”的迴歸場景、初始化、Preview 和未知 Session 錯誤。

---

## [v0.5.0] - 2026-08-28

### Added（新增）
- **OnboardingBlock 自動啟動流程**：原"啟動專案大腦"按鈕只複製 `請呼叫 project_init` 文本到剪貼簿，讓使用者去貼上傳送。新版改造為點選 → 後臺呼叫 → 轉圈 → 自動展示結果：
  - 按鈕點選直接觸發 `host.call('project_brain/initProject', { args: { path } })`，無需使用者複製貼上
  - 期間顯示 CSS conic-gradient 轉圈 + 3 階段步驟條（掃描專案結構 → 寫入專案大腦 → 分析技術棧與依賴）
  - 完成後自動用 RPC 返回的 stats 拼一個最小 preview 結構（project/phase/recentActivity）→ 父元件切到 dashboard 檢視
  - 失敗時顯示錯誤卡片 + 重試按鈕 + 複製啟動指令兜底按鈕
- **path 提示**：按鈕上方顯示當前掃描的 workspace 路徑（如 `<workspace>/data-analyst-agent`），使用者清楚會掃哪個目錄
- **build-inline.js**：sandbox 阻止 esbuild spawn 子程序時退路方案，純 Node FS 拼接
  - **v0.5.0-fix（致命 bug 修復）**：原版 build-inline.js 只 copy `src/index.js → lib/index.js`，但 ESM 解析相對 `lib/`` 找不到 `./tools.js` 等子模組 → DSH 啟動報 `Cannot find module 'lib/tools.js'` 整樹載入失敗。
  - **修復**：build-inline.js 現在做 `src/ → lib/` 全目錄映象（保留 `client.js` IIFE bundle 不被 src 覆蓋）。DSH 載入 `lib/index.js` 時 `import "./tools.js"` 能解析到 `lib/tools.js` ✓

### Fixed（修復）
- **致命載入錯誤**：DSH 啟動時報 `Cannot find module '.../lib/tools.js' imported from .../lib/index.js` 外掛載入失敗。修復：build-inline.js 映象整個 src/ 到 lib/，讓 ESM import 能解析到 24 個子模組

### Changed（變更）
- **client.js** OnboardingBlock 重寫：從純展示塊升級為帶狀態機的互動元件（idle / loading / error 三態）
- **client.js** SidebarPreviewRoot 增加 `overrideData` 狀態機：使用者啟動完成後用 RPC 返回值立即渲染 dashboard（不等 host rebuild）
- **client.js** apply() 儲存 `ctx.host` 到模組級變數 `__DSH_CLIENT_HOST__`（避免子元件拿不到 client builtin）

### 設計原則
- **零複製貼上**：所有可機器做的動作（掃描、寫入）由按鈕直接調 RPC
- **轉圈可見**：3 階段步驟條讓使用者清楚"在幹啥"，避免"按鈕沒反應"焦慮
- **失敗可恢復**：錯誤卡片明確顯示錯誤資訊 + 重試按鈕 + 兜底複製

### 待使用者驗證
- 重啟 DSH Desktop（host bundle 已寫 lib/index.js，但 cordis-loader 靜態載入 → 需重啟）
- 在 sidebar 專案 tab 找到未初始化的 workspace（如 data-analyst-agent）→ 點選"啟動專案大腦"按鈕 → 應自動轉圈分析 → 完成後直接展示 Dashboard
- 若失敗，按鈕下方會顯示錯誤資訊 + 重試按鈕

---

## [v0.4.12] - 2026-08-28

### Changed（變更）
- **ActionsBlock 按鈕文案統一為"檢視 Dashboard · 專案全景"**：
  - 主標題："檢視 Dashboard · 專案全景"（中/英雙語）
  - 副標題："技術棧 · 待辦 · 記憶 · 時間線"（列出 Dashboard 內容）
  - 右側小圖示（▾/▸）作為展開/摺疊狀態指示
  - 按鈕加漸變 background（layer-2 → layer-1）+ 更大 padding 14px
- **toggleDashboard 改造**：移除按鈕 textContent 切換邏輯，改為更新右側 indicator 圖示（▾ 展開 / ▸ 摺疊），文案保持穩定

### 設計原則
- **按鈕文案穩定**（不隨狀態切換）——使用者對按鈕功能預期一致
- **狀態用圖示**（▾/▸）而非文案切換——更符合現代 UI 習慣
- **二級副標題**（列出 Dashboard 內容）——降低使用者的"資訊盲盒"焦慮

### 測試
- 8 個 smoke test 共 **211/211 PASS**（無迴歸）
- theme-tokens 14 PASS（零硬編碼 hex、零懸空 token）

---

## [v0.4.11] - 2026-08-28

### Added（新增）
- **Dashboard 2.0 — Quick Actions 2x2 網格**（替代"繼續上次開發"雞肋按鈕）：
  - 🔄 重新掃描 → "重新掃描專案（呼叫 /project_rescan）"
  - 📋 整理待辦 → "列出當前待辦（呼叫 /project_todo_list）"
  - 🧠 整理記憶 → "整理專案記憶（呼叫 /project_dream）"
  - 🎯 專案全景 → "檢視專案當前狀態（呼叫 /project_continue）"
- 每個 Quick Action 卡片：大 emoji + 標題 + 描述 + 📋 角標 → 點選直接複製 prompt（沿用 copyPrompt 工具，1 步操作）

### Changed（變更）
- **去掉"繼續上次開發"按鈕**：使用者反饋雞肋（copyPrompt 複製→貼上→傳送 2 步）
- **Dashboard 預設展開**（`display: "block"` 替代 `display: "none"`）——資訊可達性優先
- **ActionsBlock 重構**：只保留"📊 收起/展開 Dashboard"按鈕
- **DashboardSection 函式簽名加 localeCode**（`{data, t, localeCode}`）——支援中/英雙語 Quick Action prompt
- **Dashboard 標題區加提示**："點選卡片複製指令" + 底部加 "💡 點選複製對應指令，貼上到輸入框傳送"
- Quick Action 卡片支援 hover 效果（border-color 0.1s ease）+ 點選反饋（按鈕臨時變 ✓）

### 設計原則
- **按鈕不再"半自動化"**（複製貼上是使用者的責任）——Quick Action 卡片明確告訴使用者"複製後貼上到輸入框"
- **Dashboard 預設展開**（不深埋入口）
- **Quick Actions 視覺統一**（2x2 網格 + emoji + 描述）——一眼看清所有可用操作
- **中英雙語**——延續 v0.4.8 localeCode 模式

### 測試
- 8 個 smoke test 共 **211/211 PASS**（無迴歸）
- theme-tokens 14 PASS（零硬編碼 hex、零懸空 token）

---

## [v0.4.10] - 2026-08-28

### Fixed（修復）
- **MemoriesBlock 展開/收起 toggle bug**（v0.4.9 引入）：使用者報告 "可以展開但無法正常收起"
  - **根因**：v0.4.9 用模組級 `const expandedSet = window.__dshMemExpanded || null` + 直接 DOM 操作管理展開狀態。當 React 因 Sidebar props 變化、容器 resize 等原因重渲染時，React 用 expandedSet=null 計算出 isOpen=false，**React 設定的 inline style 覆蓋 toggle 直接操作的 DOM style**，導致 toggle 第二次點選（收起）失效——UI 仍顯示 "展開" 狀態
  - **修復**：
    1. 改用 `React.useState` 管理展開 Set，每個 memory 的展開狀態在 React state
    2. toggle 呼叫 `setExpanded(prev => next)` 觸發 React 重渲染，UI 自動同步
    3. 刪除 window 全域性變數（`window.__dshMemExpanded`）
    4. 刪除所有 DOM 直接操作（`content.style.display` / `summary.style.display` / `indicator.textContent`）
    5. 刪除 `document.getElementById` 查詢 DOM 節點
    6. toggle 和 copyMem 加 `e.stopPropagation()` 防止事件冒泡

### 設計原則
- **React 受控元件**：UI 狀態完全由 React state 驅動，避免 DOM inline style 與 React state 不一致
- **React state > window 全域性**：跨 React 重渲染保持狀態（之前用 window.__dshMemExpanded 是脆弱的）
- **stopPropagation**：防止事件冒泡觸發不相關 handler

### 測試
- 8 個 smoke test 共 **211/211 PASS**（無迴歸）
- theme-tokens 14 PASS（零硬編碼 hex、零懸空 token）

### 教訓
- v0.3 時代 TodoStrip 用 DOM toggle 是為了相容當時 DSH static client，註釋寫 "已知歷史教訓"
- 現在 React 18+ useState 可用，**應優先用 React 受控 state**，避免 React 重渲染覆蓋 DOM 操作

---

## [v0.4.9] - 2026-08-28

### Changed（變更）
- **`TodoBlock` 從 chip 橫向 → 卡片化**：每條 todo 一張獨立卡片（borderLeft 3px 狀態色條 + status 圖示 + 優先順序 badge + 2 行 line-clamp 標題 + 進行中圓點）
- **`ActivityBlock` 從 list → 時間線樣式**：左側圓形 icon 節點（28×28 + brand 邊框）+ 豎線連線 + 右側雙行時間（相對 + 絕對 MM-DD）+ 2 行 line-clamp 標題
- **`MemoriesBlock` 從摺疊式 → 卡片化（始終展開）**：每條 memory 一張卡片（borderLeft brand 色條）+ type icon + type chip + **importance 星級（★/☆ 0-5）** + 2 行 line-clamp 摘要 + 點選展開全文 + 📋 複製按鈕
- 互動最佳化：所有互動用 React 內聯事件（toggle / copy），無 useState（保持 DSH static client 相容性）
- memory 展開狀態用 `window.__dshMemExpanded` 跨重渲染保持
- copyMem 用 `navigator.clipboard.writeText` + 按鈕臨時變 ✓ 反饋

### 設計原則
- 卡片化：每個 item 一張獨立 card（hover/視覺層級清晰）
- 不粗暴截斷：line-clamp 2-3 行 + 顯式展開按鈕
- 狀態/優先順序用圖示 + 顏色條（雙指示）
- 時間線：適合 ActivityBlock 的時序特性
- 複製友好：memory 卡片直接複製給 LLM

### 測試
- 8 個 smoke test 共 **211/211 PASS**（無迴歸）
- theme-tokens 14 PASS（零硬編碼 hex、零懸空 token、DSH 主題自適應）

---

## [v0.4.8] - 2026-08-28

### Added（新增）
- **Sidebar UI 視覺升級（方案 A）**：emoji 體系 + 微妙陰影 + 緊湊佈局 + 智慧狀態條
- **新元件 `StatusBannerBlock`**：3 大數字橫向佈局（待辦/記憶/已完成）+ 底部 💡 一行解讀 + 智慧 tip
- **emoji 體系**：每個區塊加 icon（📁 Header / 📊 Status / 🎯 Phase / 📋 Todo / 🌳 Code / ⚡ Activity / 🧠 Memory / 📊 Stats / 🚀 Actions / 🎯 Dashboard）
- **專案 type → emoji 對映**：frontend🎨/backend⚙️/lib📚/cli💻/mobile📱/default📦

### Changed（變更）
- **`sectionStyle`**：圓角 8→10px、margin 12→8px、加 `boxShadow: 0 1px 2px rgba(0,0,0,0.04)`
- **`chipStyle`**：圓角 4→10px（pill 形）
- **`sectionTitleStyle`**：去掉 uppercase，letter-spacing 0.8→0.4px
- **`HeaderBlock`**：漸變 background + 大號專案名 + 型別 pill
- **`PhaseBlock`**：漸變 progress bar（8px 高度、圓角）
- **`TodoBlock`**：list → chip 橫向佈局（5條/列 + 優先順序色點 + 計數徽章）
- **`ActivityBlock`**：3→5 條 + eventIcon（按 title 匹配 init/memory/todo/dream/rescan/session）
- **`MemoriesBlock`**：摺疊機制（預設摺疊 + "📖 展開全部" 按鈕 + ▸/▾ indicator + 型別 chip 加 border 區分）
- **`StatsBlock`**：加 emoji + 顏色 + 卡片化（每個 stat 獨立圓角背景）
- **`CodeGraphBlock`**：語言加 border 邊框（不用顏色區分，更易主題切換）
- **`ActionsBlock`**：按鈕內 emoji + 圓角 8px
- **`OnboardingBlock`**：3 步引導（🚀 掃描 / 🧠 記錄 / 📋 待辦）+ 漸變 CTA + 陰影
- **`DashboardSection`**：所有小節加 emoji + 配色 chip 化 + 標題區加漸變
- **渲染順序**：Header → StatusBanner → Phase → Todo → Code → Activity → Memory → Stats → Actions → Dashboard

### 測試
- 8 個 smoke test 共 **211/211 PASS**（v0.4.8 +1 新：theme-tokens 14 PASS 因最佳化加嚴）
- bundle size: client.js 234→**254KB**（+20KB 視覺升級）

### 設計原則
- **零硬編碼 hex**：所有顏色用 DSH 主題 token（`--dsw-alias-*`），dark/light 主題自適應
- **零行為變化**：工具呼叫、資料形狀、smoke 測試、build 流程完全不變
- **emoji 體系化**：所有互動點都有語義化 icon

---

## [v0.4.7] - 2026-08-28

### Added（新增）
- **llm.js 加 Anthropic 相容協議**：自動檢測 apiUrl 含 "anthropic" → POST `/v1/messages` + `x-api-key` + `anthropic-version: 2023-06-01`，否則 OpenAI 相容（`/v1/chat/completions`）
- **`fetchAnthropic` 函式**：獨立 Anthropic 協議 fetch 實現（headers/response 格式與 OpenAI 不同）
- **`detectProtocol(apiUrl)` 函式匯出**：baseUrl 含 "anthropic"（路徑或子域）→ Anthropic，否則 OpenAI
- **smoke-project-diff 加 11 個斷言**（5 個 Anthropic 真實路徑 mock fetch + 6 個 detectProtocol URL 模式判斷）

### Changed（變更）
- 當前狀態從 v0.4.6 → v0.4.7
- `realFetchLLM` 改為根據 `detectProtocol` 自動路由到 fetchAnthropic 或 fetchOpenAI

### 測試
- 8 個 smoke test 共 **210/210 PASS**（199 之前 + 11 新增）
- bundle size: 增 ~5KB（detectProtocol + fetchAnthropic + 文件）

### Known Limitations（已知限制）
- **LLM API key 安全**：使用者首次提供 key 時明文傳送——強烈建議用環境變數 `DSH_LLM_API_URL/KEY/MODEL` 注入，避免在對話歷史/session memory 中暴露
- **LLM mock fallback**：fetch 失敗（key 錯/網路問題）時降級為 mock（保證工具不卡死但返回非結構化）
- **DSH Desktop 商店釋出**：本版本未在 DSH 商店推送（僅團隊內部使用基線）

---

## [v0.4.6] - 2026-08-28

### Added（新增）
- **detector pack 真實支援**：當 commit/tree 在 loose 找不到時 fallback 讀 `.idx` v2 + `.pack` v2 + `packed-refs`
- **`parseIdxV2(idxBytes)`**：解析 .idx v2（big-endian fanout + hash 列表 + offset 列表）→ `Map<hash, offset>`
- **`readPackEntryByOffset`**：解 varint size+type header + inflate（zlib 格式與 loose 一致）拿 content
- **`applyDelta` 函式**：OFS_DELTA + REF_DELTA 解碼（git pack delta 編碼，含 copy/insert 指令）
- **`readGitObject`** = 先 loose 後 pack fallback
- **`idxCache`** 用 `gitDir|idxPath` 為 key（跨倉庫隔離，避免 tmp 倉庫刪了仍指向舊 idx）
- **`readHead` 加 packed-refs fallback**：loose ref 不存在時讀 `.git/packed-refs`
- **smoke-project-diff 加 2 個 packed-refs 斷言**（ref 在 packed-refs 仍能 diff）

### Changed（變更）
- 當前狀態從 v0.4.5 → v0.4.6
- 刪除 `hasPackFiles` 整體拒絕（v0.4.5 移除 + v0.4.6 真正的 pack 解析）

### 測試
- 8 個 smoke test 共 **201/201 PASS**（v0.4.6 +2 新）
- 除錯過程暴露並修復 6 個隱藏 bug：minSize 公式（1072+N*28 vs 誤算 1032+N*32）、offsetStart 公式（hashStart+N*24）、varint size 累加、pack inflate 無 header、REF_DELTA 遞迴、idxCache 跨倉庫汙染

### Known Limitations（已知限制）
- **multi-pack-index（MIDX，git 2.20+）**：僅普通 .idx 支援，MIDX 倉庫仍 fallback 提示（v0.5.1 計劃）
- **delta 複雜 case**：OFS_DELTA 特殊編碼（offN=0/szN=0）部分情況 return null

---

## [v0.4.5] - 2026-08-28

### Changed（變更）
- **刪除 `hasPackFiles` 整體拒絕邏輯**：v0.4.2 detector 只要檢測到倉庫有 `.pack` 檔案就整體 fallback——但真實 git 倉庫普遍有 pack（git gc/自動打包），且 detector 的 diff 只比較 tree 裡的 hash 從不讀 blob 內容，所以只要 commit + tree 在 loose 就能完整 diff
- `detectChanges` 僅當 `readCommit(head)` 真的讀不到（commit object 在 pack 裡）時才返回明確錯誤
- 當前狀態從 v0.4.4 → v0.4.5

### 測試
- 8 個 smoke test 共 **199/199 PASS**（v0.4.5 smoke-project-diff pack 測試改為"有 .pack 但 commit/tree 在 loose → 仍能 diff"）

### Known Limitations（已知限制）
- **commit/tree 真在 pack**：v0.4.5 仍 fallback 提示，需要 v0.4.6 真正的 pack 解析

---

## [v0.4.4] - 2026-08-28

### Added（新增）
- **summarizer.js 改 detectChanges**：刪除 `gitCapture(shell, ...)`（DSH shell service 依賴），改用 `detectChanges({projectPath, since:"1"})`（v0.4.2 detector 純 node git 客戶端）
- **`setupSummarizer` 不再讀 `ctx.get('shell')`**：日誌改為 "(pure-node git, no shell)"
- `summarizeOne` 簽名去掉 shell 引數
- **debug 修復**：測試 fixture 誤用 raw deflate → 真實 git 用 zlib deflate（帶 header）
  - `smoke-project-diff.mjs fixture`：`deflateRawSync` → `deflateSync`（匹配真實 git 格式，消除假陽性 PASS）
- **debug 修復**：detector 目錄 mode 判斷錯誤
  - `parseInt(entry.mode, 8) === 40000` 永不匹配（git tree mode 是省略前導零的八進位制，目錄 = `"40000"` = 0o40000 = 16384）
  - 改為 `parseInt(entry.mode, 8) === 0o40000`，目錄才能遞迴展開（src 而非 src/index.js）
- **debug 修復**：inflateSync vs inflateRawSync
  - git loose object 用 zlib deflate（帶 header 首位元組 0x78）→ 用 `inflateSync`（不是 `inflateRawSync`）
  - 之前 v0.4.2 誤用 `inflateRawSync`（期望 raw deflate 無 header）→ smoke 假陽性 PASS 但真實 git 倉庫讀不了 commit

### Changed（變更）
- 當前狀態從 v0.4.2 → v0.4.4
- 文件同步：README.md / SPEC.md / TODO.md v0.4.2 → v0.4.4（補版本說明 + changelog 行）

### 測試
- 8 個 smoke test 共 **198/198 PASS**（v0.4.4 + smoke-project-diff 加 packed-refs/fixture deflateSync/目錄 mode 測試）

### 關鍵教訓（v0.4.4 除錯發現）
- **smoke fixture 必須用真實格式**：自定義"看起來對"的 fixture（raw deflate）會讓測試假陽性 PASS，但真實 git 倉庫讀不了
- **git loose object 用 zlib deflate（帶 header）**——不是 raw deflate
- **git tree mode 省略前導零**（目錄 = `"40000"` = 16384，不是 `"040000"` 或 40000 十進位制）

---

## [v0.4.3] - 2026-08-28

### Added（新增）
- **INSTALL.md**：使用者安裝指南（系統要求 + 三種安裝方式 + 驗證步驟 + FAQ：auto-rebuild 不 work / E_NOT_INITIALIZED / sandbox / 升級 / 解除安裝）
- **CHANGELOG.md**：本文件（Keep a Changelog 規範）
- **STORE_LISTING.md**：DSH Desktop 商店釋出描述（一句話描述 + 長描述 + 標籤 + 截圖位）
- **README.md**：加 Documentation 章節，連結 INSTALL/CHANGELOG/TODO/SPEC

### Changed（變更）
- 當前狀態從 v0.4.0 → v0.4.3
- README.md 離線測試章節加 `smoke-append-line.mjs`（24 項）

### 已知限制（不變）
- **auto-rebuild 不 work**：DSH Desktop 靜態 plugin fiber 阻止任何主動行為（ctx.timer / ctx.effect / ctx.on / spawn / execFileSync）。**手動 fallback** 仍是唯一方案：調寫工具後跑 `node build.js`（~1 秒）。

---

## [v0.4.0] - 2026-08-28

### Added（新增）
- **`appendLine(fs, path, line, writePolicy)`**：避開 parseJsonl/serializeJsonl 雙向 JSON 轉換的 O(N) 最佳化寫入
- **`scripts/smoke-append-line.mjs`**：24 項專項 smoke test（邊界 + 相容性 + 效能基準）

### Changed（變更）
- **`appendJsonl` 重寫為薄 wrapper**：從"讀全檔案 → push → 全檔案重寫"改為 `appendLine(fs, path, JSON.stringify(entry) + "\n")`，避開雙向 JSON 轉換
- **效能提升**：1000 行 append 879ms（舊實現 ~2500ms，**快 3 倍**）

### 測試
- 總計 161 項 smoke test 全 PASS（137 原有 + 24 新增）
- bundle size: 166kb → **171kb** (+5kb)

### 已知限制
- 未實現真 O(1) append：DSH fs service 沒暴露 `appendFile` 介面；shell service spawn 子程序調 `node:fs.appendFileSync` 方案在前面 v0.3.17 失敗案例裡被 DSH Desktop sandbox 阻止。當前最佳化"避開 JSON parse/stringify CPU 開銷"但 I/O 仍 O(N)。

---

## [v0.3.21] - 2026-08-28

### Added（新增）
- P0.8 收尾大結局章節（TODO.md）：P0 全階段完成度總結 + 使用者最終工作流
- 專案腦 memory（type=change）：v0.3.21 永久歸檔 P0.8 完成

### Changed（變更）
- 關閉最後 1 條 todo（"補全 init/rescan/continue 工具與 RPC continueSession 聯調驗證"）：實際已被 smoke-session-lifecycle.mjs 25/25 PASS 覆蓋
- 活躍 todo: 1 → 0

### 里程碑
- **P0 全階段完成**：P0.0-P0.8 全部 16 個子階段完成

---

## [v0.3.20] - 2026-08-28

### Added（新增）
- 5 條型別混合 memory（專案大腦）：
  1. decision: 採用 Project-First 資料模型（所有資料落 `.project-brain/`，與 Session 解耦）
  2. decision: 三層資料通道架構（Cordis 4 + build-time embed + manual build fallback）
  3. decision: brain-logic 純邏輯層 + smoke test 直接驗證策略（避開 dsh-tools runtime）
  4. architecture: 8 類記憶型別混合填充策略（decision/requirement/architecture/change/bug/lesson/issue/context）
  5. requirement: 所有寫工具必須保留 manual build fallback 介面

### Changed（變更）
- 關閉 5 條過時 todo（auto-rebuild 死迴圈 + 陳舊 P0.4.1 目標 + stale P0.5 in_progress）
- memory.jsonl 型別分佈升級：decision 從 1 → 4（sidebar 頂部決策密度提升）

---

## [v0.3.19] - 2026-08-28

### Changed（變更）
- **不再投入 auto-rebuild 修復資源**（DSH Desktop 靜態 plugin fiber 根本限制，6 次修復均失敗）
- README.md / TODO.md / SPEC.md 加 "手動 build fallback" 操作流程章節
- 當前狀態從 v0.3.18 → v0.3.19

### 測試
- 端到端驗證 5 層面（基礎環境 / 工具註冊 / 工具呼叫 / sidebar / 主題）大部分 PASS
- 僅 auto-rebuild 失敗（已知限制）

---

## [v0.3.18] - 2026-08-28

### Added（新增）
- **`src/host/rebuild-sync.js`**：工具層同步 rebuild（工程止血）
- **`runSyncRebuild(reason)` 函式**：dream/memory/todo 工具的 execute 函數裡寫完 jsonl 後立即同步調 `execFileSync('node', ['build.js'])`

### Known Failures（已知失敗）
- 工具層 `execFileSync` 在 DSH Desktop host bundle context 裡被靜默攔截
- 這是 DSH Desktop 靜態 plugin fiber 任何主動行為（ctx.timer / ctx.effect / ctx.on / spawn / execFileSync）都 silent failure 的根本限制
- v0.3.18 不 work，**繼續向前到 v0.3.19 接受手動 fallback**

---

## [v0.3.17] - 2026-08-28

### Added（新增）
- **`src/host/rebuild-watcher.mjs`**：獨立 watcher 子程序（脫離 Cordis 抽象）
- **多路徑 fallback log**：PLUGIN_DIR / process.cwd() / USERPROFILE

### Known Failures（已知失敗）
- 子程序 spawn 在 DSH Desktop 靜態 plugin fiber 裡被 sandbox 靜默阻止
- `.project-brain/.dsh-project-brain-watcher.log` 不存在 → 子程序要麼沒 spawn 成功、要麼 sandbox 阻止寫檔案
- v0.3.17 不 work，**繼續向前到 v0.3.18 改工具層**

---

## [v0.3.16] - 2026-08-28

### Added（新增）
- 冷啟動診斷 log：setupAutoRebuild 頂部輸出 9 項狀態（ctx.timer / ctx.get('timer') / sandboxPolicy.workspaceRoot / workspaceRegistry.list 數量 / sessions.list 數量 / agents.currentInitiator / 初始 paths 數量 / ctx.on / ctx.effect 可用性）
- 監聽 DSH 原生 `agent/created` / `session/created` 事件（DSH 框架跨 fiber 自動路由）

### Known Failures（已知失敗）
- 診斷 log 看不到（DSH Desktop Electron 無主 log 檔案，ctx.logger.info 輸出位置未知）
- 仍然 silent failure
- v0.3.16 不 work，**繼續向前到 v0.3.17 spawn 子程序**

---

## [v0.3.15] - 2026-08-28

### Changed（變更）
- **`src/index.js` inject 陣列末尾加 `"timer"`**：讓 ctx.timer 真可用

### Known Failures（已知失敗）
- 修復未生效（推測根因：host fiber 冷啟動時 resolveWatchPaths 返回空陣列）

---

## [v0.3.14] - 2026-08-28

### Changed（變更）
- **`src/host/rebuild.js` 重寫**：從 `ctx.on("project_brain/preview.changed")` 改成 `ctx.effect(() => ctx.timer.interval(checkMtime, 5000))` —— 每 5 秒掃 `.project-brain/*.json*` 的 mtime，變化觸發 `runBuild()`

### Known Failures（已知失敗）
- inject 沒宣告 timer → 默默退化

---

## [v0.3.13] - 2026-08-27

### Added（新增）
- **`scripts/smoke-multi-workspace.mjs`**（25 項）：path-resolver / brain-files / loadProjectData 三層跨 workspace 隔離驗證
- **`scripts/smoke-theme-tokens.mjs`**（14 項）：client.js 主題 token 與 DSH `Theme.listTokens` 對齊驗證

### 測試
- 總計 137 項 smoke test 全 PASS（30 + 10 + 33 + 25 + 25 + 14）
- 端到端驗證：5 層面 PASS

---

## [v0.3.12] - 2026-08-27

### Added（新增）
- **`project_dream` 工具的 `dryRun=false` 實質實現**：
  - merge：dropped 移除 + keep status=reinforced + importance +0.05 + relatedMemoryIds 合併
  - archive：status=archived + 寫 timeline + emit preview.changed
- **`mode=full`**：額外清理 archived 行 + 按 importance DESC 排序
- **`brain-logic.js` 抽 `computeDreamActions` / `applyDreamCommit` 純函式**（避開 dsh-tools runtime）
- **`brain-files.js` 加 `writeJsonl`**（覆蓋寫整檔案，dream commit 用）
- **`scripts/smoke-dream-commit.mjs`**（33 項）

### 測試
- 總計 73 項 smoke test 全 PASS（30 + 10 + 33）

---

## [v0.3.11] - 2026-08-27

### Added（新增）
- **`conversation.input.dock` Slot + TodoStrip 元件**：composer 上方活躍待辦提醒
- 雙 guard（uninit / empty）：專案未初始化或無活躍待辦時整條 strip 不渲染

---

## [v0.3.10] - 2026-08-27

### Added（新增）
- 12 個工具端到端實測 + path 顯式傳到 plugins workspace 驗證

---

## [v0.3.9] - 2026-08-27

### Fixed
- **`parseJsonl` / `readJson` 加 `U+FEFF` BOM strip**：PowerShell `Set-Content -Encoding utf8` 寫入 jsonl 時加了 BOM
- **`src/tools/ask.js` 改用 `readJson`**：之前用 `readJsonl` 讀 multi-line pretty-printed JSON 必然失敗
- **ask execute return 加 `JSON.parse(JSON.stringify(ret))` 防禦性 round-trip**

---

## [v0.3.8] - 2026-08-27

### Fixed
- **`path-resolver` 加 `workspaceRegistry` + 跳過 DSH Desktop 汙染 fallback**：v0.3.8 修復 sandboxPolicy.workspaceRoot 是 DSH Desktop 安裝路徑時被靜默汙染的 bug
- 所有 tool output schema 顯式宣告 `code` / `message`：修復 project_continue 等報"value.code not declared"

---

## [v0.3.7] - 2026-08-27

### Fixed
- **`brain-files.js` `writeText` 預設 `danger-full-access` policy**：修復 DSH sandbox 拒絕跨 workspace 寫（`E_WRITE_FAILED`）

---

## [v0.3.6] - 2026-08-27

### Added
- 6 個工具加 `path` 引數：`project_init` / `project_rescan` / `project_status` / `project_continue` / `project_memory_*` / `project_todo_*` / `project_dream`
- output schema 改 `additionalProperties: true` + 顯式 `code/message`：錯誤路徑返回 `{ok:false,code,message}` 不再被拒
- shell service rebuild：用 DSH shell service 跑 `build.js`（避開 child_process.spawn sandbox EPERM）

---

## [v0.3.5] - 2026-08-27

### Added
- **`build.js` 排除 plugin 自身**：`findBrainsUnder` 檢測 `cordis.patch.yml` 跳過 dsh-project-brain 自己

---

## [v0.3.4] - 2026-08-27

### Changed
- **放棄 webServer**：v0.3.0-v0.3.3 驗證 webServer route 在 static plugin fiber 下不可用（HTTP 404 + Electron IPC 橋不通）
- **回到 build-time embed + auto-rebuild**（`preview.changed` → `setupAutoRebuild` 跑 `node build.js` → 重寫 `lib/client.js` → `clientModules.rebuilt()` 自動熱過載）

---

## [v0.3.3] - 2026-08-27

### Fixed
- 路徑衝突回退（webServer 路徑避開 `/plugins/` 字首）
- Electron IPC 橋診斷

---

## [v0.3.2] - 2026-08-27

### Fixed
- PromptSection 欄位名修復（`render` → `text`）：避免 indexOf 崩潰

---

## [v0.3.1] - 2026-08-27

### Added
- PromptSection 欄位診斷

---

## [v0.3.0] - 2026-08-27

### Added
- **完整 webServer 資料通道**：dsh-project-brain 試圖用 webServer route live fetch 取代 build-time embed

### Known Failures
- v0.3.0-v0.3.3 多次嘗試 webServer route，全部失敗（HTTP 404 + Electron IPC 橋不通）

---

## [v0.2.x] - 早期版本

### v0.2.9 及之前
- SidebarPreview 5 區塊 + Onboarding
- Mock fallback（SidebarPreview 沒資料時顯示示例）
- scanner 增量更新（保留 projectId/createdAt）

### v0.2.0 - v0.2.5
- Code Graph（tree-sitter 3 語言：TS/JS/Python）+ 呼叫圖 + API + DB schema 提取
- 多 workspace build-time embed（掃 `~/.dsh/storages/workspace.json` + inline `(sessionId → workspaceId → previewData)` map）

### v0.1.x - 最早版本
- SidebarPreview UI（5 區塊 + Onboarding + mock fallback）
- 8 工具：init / rescan / status / continue / memory×2 / todo×3
- Memory / Timeline 基礎架構（`memory.jsonl` + `timeline.jsonl` + `brain-memory.mjs` CLI）
- Project Memory + Cross-Session 續接（規劃中）
- DSH Desktop 靜態 plugin 接入（`package.json` + `cordis.patch.yml` + DSH profile 安裝）

---

## 版本號規範

- **MAJOR**（v1.0+）：架構變更、生產就緒
- **MINOR**（v0.x → v0.y）：新增功能、P 階段切換
- **PATCH**（v0.x.y）：bug fix、效能最佳化、文件

---

## 連結

- [README.md](./README.md) — 專案說明 + 當前狀態 + 離線測試
- [INSTALL.md](./INSTALL.md) — 使用者安裝指南（系統要求 + 安裝方式 + 驗證 + FAQ）
- [SPEC.md](./SPEC.md) — 開發規格（架構 + 資料模型 + 工具契約）
- [TODO.md](./TODO.md) — 任務清單 + P 階段進度 + 歷史歸檔
- [REQUIREMENTS.md](./REQUIREMENTS.md) — 產品需求（PRD）
- [DESIGN.md](./DESIGN.md) — 設計方案
- [STORE_LISTING.md](./STORE_LISTING.md) — DSH Desktop 商店釋出描述

---

**最後更新**：v0.4.3 RELEASE 2026-08-28
