# Grill: First-screen briefing v2
Date: 2026-09-21

## Intent
第一屏給「自己隔天回來接著幹」看懂專案、看見最近在做什麼。不要再塞入口路徑和「為什麼」獨立行。

## Constraints
- 開啟 Tab 不再調 LLM；purpose 複用 `architecture.overview.purpose`。
- 人第一屏與 Agent 欄位同源；Agent 仍保留「從哪改」。
- Durable Core 不推翻；擠佔時先截 recentWork。
- changelog 體裁 summary 不當「最近做什麼」。

## Key decisions
- Decision: 人第一屏只留「這是什麼」「最近做什麼」。Reason: 四句標籤失敗、內容錯位。Alternative considered: 修文案仍保留四句。
- Decision: 「這是什麼」只用 LLM purpose（否則 description / 專案名）。Reason: `名字 · CI · Monorepo` 不是專案定義。Alternative considered: 每次開啟再調 LLM。
- Decision: 「最近做什麼」= 上次合格 session_summary；否則僅 `in_progress` 待辦並加「進行中」字首。pending-only 不當近況。Reason: 已完成/排隊待辦不是最近工作。Alternative considered: 退回任何活躍 TODO。
- Decision: 「從哪改」只進注入，且丟掉 npm script 入口。Reason: 人第一屏不靠它動手；Agent 仍需要檔案錨點。Alternative considered: 人屏也留、或注入也刪。

## Out of scope
- 為 briefing 新增獨立 LLM 呼叫。
- 手動釘里程碑。
