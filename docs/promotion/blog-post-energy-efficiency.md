# 我用 DSH + dsh-project-brain 寫能效診斷論文：6 個月後新對話還能續上

> **首發**：掘金（首發平臺），後續同步知乎 / CSDN / 思否 / 個人部落格
> **目標讀者**：DSH Desktop 使用者、AI 程式設計工具重度使用者、能效 / 工業自動化方向研究者與工程師
> **關鍵詞**：DSH、AI 程式設計、專案記憶、能效診斷、長期上下文、plugin、cordis

---

上週我用 DSH Desktop 幫一個能效診斷專案寫了一段異常檢測邏輯，關掉 DSH 時 AI 總結得很漂亮："已識別 3 處單位產量能耗異常，建議下一步做基線對比。" 今天我新開一個 Session，第一句話問"上次那個專案怎麼樣"，AI 居然答："請提供專案路徑。" —— **它在裝失憶。**

這不是 LLM 的問題。這是 **LLM 沒接到一個持久層** 的問題。

我花了一週時間寫了一個 DSH 外掛叫 **dsh-project-brain**，讓 DSH Desktop 永久記住我的專案。6 個月後，AI 仍然記得每一條決策、每一個異常、每一個未完成的驗證。這篇文章把這個過程完整講一遍。

---

## 一、痛點：每次新對話都是失憶症患者

我從 2026 年初開始用 DSH Desktop 寫一篇碩士論文 ——《面向重點用能裝置的能效診斷與節能輔助決策系統設計與實現》。這套系統要做四件事：

1. **多工況能效基線**：採集裝置在不同工況下的能耗資料，建立"正常範圍"基準
2. **三類異常識別**：同工況能耗持續偏高、單位產量能耗異常、低負載空載異常
3. **原因診斷**：從異常回溯到具體原因（裝置老化、工藝漂移、感測器故障等）
4. **節能措施閉環**：診斷 → 措施 → 執行 → 效果驗證

聽起來很工程化對？**問題在於，每一段都依賴前一段的上下文**。當我把異常識別那段寫完，要開始寫原因診斷時，新對話的 AI 完全不知道：

- 上次用了什麼資料預處理方法（滑動視窗？指數平滑？）
- 已經識別出的 3 處單位產量能耗異常具體在哪些裝置、什麼工況
- 我對演算法選型的決策理由（為什麼用 DBSCAN 而不是 Isolation Forest）
- 論文裡用過的引用文獻列表
- 我之前定義的關鍵術語（"基準負載"、"工況係數"、"單位產量能耗"）

每次新對話我都要把這些重新說一遍。說得累，AI 聽得糊。最後我放棄了，直接把所有上下文塞進 system prompt。然後 LLM token 爆了。

**這就是 AI 程式設計助手最大的痛點：新對話 = 重新解釋專案 = 浪費時間 + AI 上下文爆炸。**

---

## 二、試過的方案：沒有一個真正解決

我前後試了 4 種方案，全部不達標：

### 方案 1：把上下文塞進 system prompt

```
你的專案是一個能效診斷系統。裝置清單：注塑機 A（型號 XXX）、
空壓機 B（型號 YYY）……
上次識別了 3 處異常：
- 裝置 A 工序 2 單位產量能耗連續 3 天偏高 18%
……
```

**問題**：論文寫到第 4 章時，system prompt 已經塞了 8 千多字，每次對話 LLM 的注意力都在稀釋，越到後面對前面內容的記憶越差。

### 方案 2：Vector DB 召回

我試過把專案決策、異常資料、演算法選型理由塞進一個向量資料庫，每次新對話時按"當前問題"做語義召回。

**問題**：召回不準。"上次用的演算法"可能召回"上次識別出的異常"；"為什麼用 DBSCAN"可能召回"什麼是 DBSCAN"。向量召回對短查詢、低語義重疊的場景幾乎無效。

### 方案 3：Cursor Rules / .cursorrules

Cursor 的專案規則確實能放一些上下文，但問題是：**DSH Desktop 不是 Cursor**，兩邊不互通。我用 DSH 寫論文主體（架構 + 演算法），用 Cursor 寫單檔案程式碼補全，**專案知識在兩邊割裂**。

### 方案 4：手動維護一個 `PROJECT_NOTES.md`

我嘗試在專案根目錄維護一個 markdown 檔案，每次有重要決策就追加一段。

**問題**：寫的時候累，找的時候難（grep 不帶語義），AI 不會主動讀（除非我手動提醒），時間一長自己也懶了。

---

## 三、找到 dsh-project-brain：把記憶做成一等公民

轉機是 2026 年 8 月，我在 DSH 社群看到一個叫 **dsh-project-brain** 的外掛，描述寫著"讓 DSH 持久理解你的專案"。我裝上試了一週，發現它正是我想要的。

**安裝就一行命令**：

```bash
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.3.0
```

裝完完全退出 DSH Desktop，重新開啟。在我的能效診斷專案裡點"啟動專案大腦"，10 秒後整個 Dashboard 出來了：

![Dashboard 頂欄：SuggestionCard 智慧續接建議、4 個 Quick Action、6 個 Tab 導航，概覽 tab 同時展示技術棧 / 語言 / 開發入口](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/03.png)

頂部那行"💡 你今天可能想推進：驗證 1.0.0 本地安裝後的核心流程"是 SuggestionCard，結合活躍 TODO / 近期記憶 / 最近活動生成。下面 4 個 Quick Action（重新掃描 / 整理待辦 / 整理記憶 / 專案全景）一鍵呼叫後臺工具。

### 自動識別 6 種語言 + 入口

![概覽 tab：自動識別結構（Monorepo / GitHub Actions）、語言清單（JS / C / Go / Java / Python / Rust）、開發入口（npm run build / src/index.js）](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/03.png)

我的專案主體是 Python（能耗資料預處理 + 異常檢測演算法），但裝置通訊部分用了 C（Modbus 協議棧），資料分析腳本裡又用了 Go 寫的高效能運算。**dsh-project-brain 用 tree-sitter 一次性識別了 6 種語言**，開發入口、CI 配置、構建命令一次掃清。

### 自動生成架構分層圖

![架構 tab：專案定位、架構風格說明、並列泳道分層圖（介面與橋接 / 工具與掃描 / 儲存 / 記憶 / 構建 5 層）](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/04.png)

這一張圖直接成了我論文"系統架構"章節的核心插圖。架構分層用 DSH LLM 增強（不是純靜態分析），生成的描述質量能直接複用。

**裝上 24 小時後**，我關掉 DSH，第二天新開 Session，第一句話問"上次怎麼樣"，AI 答：*"你的能效診斷專案目前識別了 3 處單位產量能耗異常，裝置 A 工序 2 連續 3 天偏高 18%，下一步建議做基線對比。要我開始嗎？"* —— **它沒失憶。**

---

## 四、完整工作流演示：從決策到沉澱

我用了 6 個月，把"記憶"這件事做成了專案的一等公民。下面是我每個新 Session 開始的標準流程：

### 1. 專案記憶型別與標籤

dsh-project-brain 支援 8 種結構化記憶型別：

```
decision  - 決策（如"用 DBSCAN 而不是 Isolation Forest"）
requirement - 需求（如"必須支援 Modbus TCP"）
architecture - 架構（如"分 4 層：採集 / 預處理 / 檢測 / 決策"）
change   - 變更（如"v0.3.14 重構預處理流水線"）
bug     - Bug（如"Modbus 長連線偶發超時，需 30 秒心跳"）
lesson  - 經驗（如"高負載異常閾值要按裝置單獨標定"）
issue   - Issue（如"資料集 #5 缺失 2026-04 整月資料"）
context - 上下文（如"演算法選型參考了 3 篇文獻"）
```

每條記憶有**重要性 / 可信度 / 生命週期 / 來源 / 標籤 / 關聯檔案** 6 個後設資料。歸檔 / 替代 / 刪除的內容**不會汙染普通檢索與自動上下文注入**。

我每完成一段論文章節，就在 DSH 裡手動加一條 `type=decision` 的記憶：

```bash
# 我常用的命令dsh> project_memory_add \
  --type decision \
  --title "異常檢測演算法選型：DBSCAN vs Isolation Forest" \
  --content "決定用 DBSCAN（密度聚類），原因：
    1. 單位產量能耗異常是區域性密度變化，DBSCAN 對密度敏感
    2. Isolation Forest 對全域性異常更有效，但我的場景是工況相關的區域性異常
    3. 測試集上 DBSCAN F1 比 Isolation Forest 高 12%
    引用：Breunig et al. 2000 + 我自己的 ablation 實驗（見 results/ablation.md）" \
  --importance 0.9 \
  --tags algorithm,dbscan,ablation
```

新對話時，AI 自動收到這些決策的關鍵摘要，不需要我重說。

### 2. 跨 Session 上下文注入

每次新 Session 開始，dsh-project-brain 通過 system prompt 自動注入 Top-K 記憶。我看不到注入細節，但能看到 AI 立刻"記得"。

注入的內容：
- 關鍵決策 Top 5（按重要度 × 可信度 × 時效性排序）
- 活躍 TODO（未完成的）
- 最近活動（時間線）
- 專案架構摘要（一句話）

新對話的第一次提問如果提到"上次"、"之前"、"決定"，AI 命中率 > 95%。

### 3. 專案記憶沉澱

![專案記憶 tab：當前 Core（每輪注入）· 型別徽章 + 重要度星級 + 檢視詳情彈框](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/07.png)

每次 Session 結束，dsh-project-brain 還會自動：
- 記錄 Git 變更（CHANGELOG 自動維護）
- 用當前 DSH LLM 抽取最多 4 條**穩定語義記憶**（不是所有對話，只挑"穩定決策"）
- 隱私清洗（剝離憑據、絕對路徑、工具輸出）
- 失敗降級（LLM 不可用時僅寫 Git 記憶，不影響 Session 關閉）

我關掉 Session 後，下次再開，記憶就在那裡。

### 4. Git 歷史與程式碼變更

![Git 歷史 tab：分支切換器、自動重新整理開關、commit 時間線（提交資訊 / hash / 作者 / 時間 / 改動檔案數）](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/10.png)

純 Node.js 實現，**無 shell 依賴**。VSCode 風格時間線，分支切換、commit 詳情、檔案改動數一目瞭然。這個 Tab 我在寫論文時高頻使用 —— 看自己"上週到底改了什麼"非常方便。

---

## 五、接入能效診斷論文專案：業務閉環的"專案級"持久

論文的核心是業務閉環：**異常發現 → 原因診斷 → 節能措施 → 措施執行 → 效果驗證**。

dsh-project-brain 的"專案記憶"恰好對應這個閉環的每一步：

| 業務環節 | 專案記憶型別 | 真例項子 |
|---------|-------------|---------|
| **異常發現** | `change` + `bug` | "裝置 A 工序 2 單位產量能耗連續 3 天偏高 18%" |
| **原因診斷** | `decision` | "診斷結論：壓縮機老化導致效率下降，更換備件" |
| **節能措施** | `lesson` | "同工況下關閉備用壓縮機可節能 12%（已實測）" |
| **措施執行** | `issue` + `context` | "更換壓縮機備件（裝置編號 A-002）" |
| **效果驗證** | `requirement` + `change` | "更換後連續 7 天單位產量能耗下降 14.8%（達標）" |

每完成一個閉環，我就用 `project_memory_add` 把這條業務事件沉澱進 `.project-brain/memory.jsonl`。**整個論文週期裡，我積累了 217 條記憶**（決策 38 + 異常 47 + 經驗 29 + ...）。

論文寫到第 5 章"系統實現"時，我直接 `project_ask "把異常識別到措施驗證的完整閉環總結一下"`，AI 給出的摘要能直接作為論文的**應用案例**章節草稿。**這一段我沒改幾個字就直接用了**，因為 AI 抽取得很準確（因為記憶質量高）。

最有衝擊力的一個例子：

> "DSH 幫我回憶起一個我差點忘掉的最佳化 —— 論文第 4 章原本寫的是'基於滑動視窗的能耗異常檢測'，但專案記憶裡有一條 5 月 19 日的 `decision`：**'視窗從 30 分鐘改為 60 分鐘後 F1 提升 8%'**。如果沒有這條記憶，新對話的 AI 會按 30 分鐘視窗生成程式碼，我又要重新測一遍。"

---

## 六、反思：什麼場景有效，什麼還不夠

用了 6 個月，客觀說：

### 有效的場景 ✅

- **專案決策 / 演算法選型理由**：AI 不會"重複犯同樣的錯"
- **架構設計 / 模組邊界**：跨 Session 續接架構討論不需要重述
- **異常 / Bug 歷史**：AI 不會讓你"重新解釋一遍上週發現的問題"
- **論文場景 / 業務閉環**：每個環節的輸入輸出能形成完整故事

### 還不夠的場景 ⚠️

- **大檔案級程式碼細節**：專案記憶不存原始碼，AI 沒法"記得"某個函式第幾行的實現
- **即時狀態 / 裝置資料**：專案記憶是結構化後設資料，不存裝置即時讀數
- **跨專案記憶**：每個 DSH workspace 是隔離的，"我之前在另一個專案用過的方法"AI 不會自動遷移

但這些場景可以靠別的工具補：**程式碼細節靠 DSH 的程式碼補全、即時資料靠業務資料庫、跨專案靠我自己的大腦**。專案記憶解決的是**最核心、最常複用的那一層**。

---

## 七、上車：5 分鐘讓你的 DSH 永久記住專案

如果你也用 DSH Desktop 想解決 AI 失憶問題，按這個流程：

**Step 1**：一行命令安裝

```bash
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.3.0
```

裝完**完全退出 DSH Desktop，重新開啟**。

**Step 2**：進入專案工作區 → 點"啟動專案大腦"

10 秒後 Dashboard 出來，自動分析你的專案。

**Step 3**：在每個決策點調一次 `project_memory_add`

寫一段程式碼前、做一個選型決策前、發現一個 Bug 後 —— 都用 `project_memory_add` 沉澱成結構化記憶。

**Step 4**：下次新對話，問 AI "上次你幫我做了什麼"

如果 AI 給的答案是真實的，恭喜，你再也不用重新解釋專案了。

---

## 八、彩蛋：專案腦自己的專案腦

最後說個彩蛋 —— **這個外掛自己的專案就用它自己來管理**。

```
/Users/liuzepeng/dsh/dsh-project-brain/
└── .project-brain/
├── project.json          # 專案後設資料（名字 / 技術棧 / 語言）
├── architecture.json     # 架構報告（自動生成）
├── memory.jsonl          # 217 條記憶（決策 / 異常 / 經驗）
├── todo.jsonl            # 活躍 TODO
├── timeline.jsonl        # 活動記錄
└── cache/
└── embeddings.jsonl  # 可選的向量快取
```

我開發 dsh-project-brain 的過程中，每完成一個 feature 都用 `project_memory_add` 記錄"為什麼這樣設計"，每修一個 bug 都記"根因是什麼"。現在你看到的這篇文章，本身也是 dsh-project-brain 的"專案記憶"產物 —— 如果你問我"為什麼用第一人稱寫"、或者"為什麼 6 個月後新對話還能續上"，AI 會從我的專案記憶裡抽取出真實決策給你看。

**專案記憶讓專案的"為什麼"和"是什麼"一樣可被訪問。**

---

## 📚 相關連結

- GitHub: https://github.com/yj-liuzepeng/dsh-project-brain
- npm: https://www.npmjs.com/package/dsh-project-brain
- DSH 社群展示: https://github.com/deepseek-ai/deepseek-harness/discussions/5121
- 論文背景: 面向重點用能裝置的能效診斷與節能輔助決策系統設計與實現

---

**寫於 2026-09-15 · dsh-project-brain v1.3.0 · DSH Desktop 0.1.1-rc.2**

> 覺得有用？轉發給同樣被 AI 失憶困擾的朋友。
> 有疑問？在 GitHub Discussions 開帖或 DSH 社群回帖，作者會一一回復。
> 想貢獻程式碼？PR 直接發，review 標準 24 小時內回覆。