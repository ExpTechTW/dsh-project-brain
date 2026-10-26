# Twitter / X 構建日記 5 條

> **目標賬號**：@yj_liuzepeng（如果有）或個人賬號
> **節奏**：每天 1 條，共 5 天
> **標籤**：#buildinpublic #DSH #AIcoding #LocalAI

---

## Day 1（v0.6.0 → v0.7.0-beta 基礎）

**Tweet**：
```
🚀 啟動 dsh-project-brain：讓 DSH 持久理解你的專案

每次新對話都要重新介紹專案嗎？架構、決策、踩過的坑、關鍵檔案 —— 你說得累，AI 聽得糊。

dsh-project-brain 把每個 DSH 工作區變成一個本地「專案大腦」：
✅ 自動架構分析
✅ 跨 Session 長期記憶
✅ 工作區隔離

v0.6.0-beta 已釋出在 npm。

#buildinpublic #DSH
```

---

## Day 2（v0.7.0-beta.1 多語言 AST）

**Tweet**：
```
🌳 v0.7.0-beta.1：把 6 種語言納入本地 AST 分析

之前只能用 JS/TS + Python。現在支援：
• Go（gin / gorm）
• Java（Spring / JPA）
• Rust（tokio / axum）
• C/C++（基礎 #include）

為什麼？DSH LLM 不一定可用，本地分析必須兜底完整。

#buildinpublic #AIcoding #LocalAI
```

---

## Day 3（v0.7.0 記憶機制最佳化）

**Tweet**：
```
🧠 記憶機制 v2：雙通道 + 跨對話高保真續接

dsh-project-brain 預設 BM25 檢索（零配置），可選 Embedding 混合。
Session 關閉時自動抽取語義記憶，注入到下次對話的 system prompt。

關鍵設計：本地規則 vs LLM 升級失敗降級，絕對不阻塞 Session 啟動。

#DSH #LocalFirst
```

---

## Day 4（v0.7.0 TodoStrip + GitTab）

**Tweet**：
```
✨ v0.7.0 UI 進化：
• TodoStrip 摺疊 —— composer 上方不擋視野
• GitTab VSCode 風格時間線 —— 純 Node.js，無 shell 依賴
• Dashboard 自建設定入口 —— Embedding 配置即時生效

每一個改動都從真實使用場景出發，不是為了炫技。

#buildinpublic #UI
```

---

## Day 5（v1.0.0 stable 釋出）

**Tweet**：
```
🎉 dsh-project-brain v1.0.0 穩定版釋出

7 項 P0 修復 + 39/39 端到端驗收 + 使用者實測通過。

第一個真正可以推薦給所有 DSH 使用者的版本。

📦 npm: dsh-project-brain@1.0.0
🚀 安裝：dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.0.0
⭐ GitHub: github.com/yj-liuzepeng/dsh-project-brain

下一個里程碑：v1.1 跨 Session 共享模式 + 多 Workspace 聯動。

#DSH #buildinpublic
```

---

## Twitter 釋出 checklist

- [ ] 每條配 1 張截圖（01.png ~ 07.png）
- [ ] 每條獨立成 thread，第一條 hook 最強
- [ ] 時間：每個工作日 10:00 AM（本地時間），中國時間 22:00 也行
- [ ] @deepseek_ai（DSH 官方）+ 幾個 DSH 圈 KOL
- [ ] 24 小時內回應所有 reply
- [ ] 把這些 thread 歸檔到 GitHub Discussions：[Show and tell] tag

## Bonus：發完 5 條後做什麼

- 週報：把 5 條串成一篇 blog post（中文 + 英文）
- 資料：觀察哪些推文 engagement 最高，下一輪針對該主題深挖
- 轉化：在 bio 裡加 GitHub 連結，置頂一條「我是做什麼的」
- 長期：每月一條 update，1 週年時回顧完整歷程（最容易上 trending）