# 5 分鐘演示影片指令碼

> **總時長**：5 分鐘
> **畫幅**：1920×1080（16:9）或 1280×720
> **上傳平臺**：YouTube（海外）+ Bilibili（中文），README 頂部嵌入
> **風格**：螢幕錄製 + 旁白，節奏明快，每段 30 秒

---

## 0:00–0:30 痛點

**畫面**：一個空 IDE，新對話
**旁白**：
> 「每次新對話都要重新介紹專案嗎？架構、決策、踩過的坑、關鍵檔案 —— 你說得累，AI 聽得糊。這是個長期被忽視的痛點。」

**字幕**：
> 新對話 = 重新解釋專案 = 浪費時間 + AI 上下文爆炸

---

## 0:30–1:00 一行安裝

**畫面**：終端命令
**旁白**：
> 「今天介紹一個 DSH 外掛，叫 dsh-project-brain。裝它就一行命令。」

**字幕**：
```bash
dsh plugin --profile web add \
  github:yj-liuzepeng/dsh-project-brain#v1.0.0
```

**畫面**：DSH Desktop 完全退出 → 重新開啟 → 外掛列表出現 dsh-project-brain v1.0.0

---

## 1:00–1:30 init + Dashboard 總覽

**畫面**：進入一個專案工作區
**旁白**：
> 「進入專案，點啟動專案大腦。10 秒後 Dashboard 出來了。」

**字幕**：專案識別為 Monorepo，2 個入口，1 個 GitHub Actions

**畫面**：Dashboard 總覽（截圖 01.png 同款）

**旁白**：
> 「頂上自動推薦今天要推進什麼 —— 這是 v0.7.0 新增的 SuggestionCard，用本地規則 + 可選 LLM 升級。下面 4 個 Quick Action 一鍵呼叫。」

---

## 1:30–2:00 架構分層圖

**畫面**：點 "架構" tab
**旁白**：
> 「架構 tab 自動生成 4 層分層圖：介面層、宿主注入層、掃描與分析層、記憶與檢索層。這是 DSH LLM 增強過的，比目錄樹有用 100 倍。」

**字幕**：DSH LLM 增強 · 39/39 驗收 · 6 語言支援

---

## 2:00–2:30 跨 Session 記憶恢復

**畫面**：關閉當前 session，新開一個
**旁白**：
> 「關鍵來了 —— 我關掉當前對話，新開一個，AI 立刻就知道這是哪個專案、上次聊了什麼、還有哪些 TODO 沒完成。」

**字幕**：system prompt 自動注入 Top-K memories + 活躍 TODO

**畫面**：新 Session 第一條訊息 → AI 主動提到上次討論的支付方案

---

## 2:30–3:00 專案記憶型別演示

**畫面**：點 "專案記憶" tab
**旁白**：
> 「記憶分 8 種類型：決策、需求、架構、變更、Bug、經驗、Issue、上下文。每條都能打分、加標籤、關聯檔案。」

**畫面**：切換到"設定" tab
**旁白**：
> 「設定裡可以配置 Embedding，預設本地 BM25 檢索，啟用混合向量後立刻生效 —— 不需要重啟。」

---

## 3:00–3:30 多語言技術棧識別

**畫面**：點 "概覽" tab
**旁白**：
> 「技術棧自動識別 JS、C、Go、Java、Python、Rust，6 種語言全覆蓋。開發入口、CI、框架一次掃清。」

**字幕**：tree-sitter-c/go/java/rust/python/javascript 本地 AST

---

## 3:30–4:00 Git 歷史 VSCode 風格

**畫面**：點 "Git 歷史" tab
**旁白**：
> 「Git 歷史用 VSCode 風格時間線，分支切換、commit 詳情、檔案改動數一目瞭然。純 Node.js 實現，無 shell 依賴。」

---

## 4:00–4:30 完整工作流演示

**畫面**：完整跑一次
**旁白**：
> 「串起來用：init → rescan → 問 AI 一個架構問題 → AI 直接基於記憶回答 → 你寫下決策 → 下次新對話 AI 自動提到這條決策。」

**字幕**：異常發現 → 原因診斷 → 節能措施 → 措施執行 → 效果驗證
> （注：此處可結合論文選題演示能耗異常診斷場景）

---

## 4:30–5:00 總結 + CTA

**畫面**：GitHub repo + npm + 安裝命令
**旁白**：
> 「dsh-project-brain，v1.0.0 穩定版，開箱即用，完全本地優先。GitHub 8k stars、npm 周下載 100+。如果你也想讓 AI 真的懂你的專案，從一條命令開始。」

**字幕**：
```bash
# 安裝
dsh plugin --profile web add \
  github:yj-liuzepeng/dsh-project-brain#v1.0.0

# 反饋
github.com/yj-liuzepeng/dsh-project-brain
```

**片尾**：DSH Logo + 鳴謝 + 訂閱按鈕

---

## 製作 checklist

- [ ] 螢幕錄製軟體：OBS Studio（免費）/ ScreenFlow（mac）
- [ ] 旁白：普通話流利版（中文版）+ 英文版（出海版）
- [ ] 字幕：YouTube 字幕自動生成 + 手動校對
- [ ] 背景音樂：低 BGM（避免干擾旁白），YouTube Audio Library 免費
- [ ] 封面：複用 docs/social-preview.png
- [ ] 標籤：DSH、AI 程式設計、Cordis、專案記憶、Cursor 對比

## 釋出 checklist

- [ ] YouTube：標題含 "dsh-project-brain"、"v1.0.0"、"DSH"
- [ ] Bilibili：分割槽選「科技」→「程式設計」，標籤同上
- [ ] README 頂部加影片嵌入（`<iframe>` 或縮圖連結）
- [ ] 影片描述含 GitHub / npm / MyDSH 連結
- [ ] 釋出後 24 小時內回應前 10 條評論

## 衍生短影片（1 分鐘版，用於 Twitter / 短影片平臺）

- 0:00–0:10 痛點一句話
- 0:10–0:20 安裝命令
- 0:20–0:40 Dashboard 總覽 + SuggestionCard
- 0:40–0:50 跨 Session 記憶恢復
- 0:50–1:00 CTA + 連結

釋出到：YouTube Shorts / Bilibili 短影片 / TikTok / X（Twitter）影片。