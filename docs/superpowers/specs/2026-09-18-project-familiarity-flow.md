# Project Familiarity 鏈路圖

對應設計：[2026-09-18-project-familiarity-design.md](./2026-09-18-project-familiarity-design.md)

一句話：`.project-brain/` 仍是唯一事實源；人第一屏和 Agent 注入共用 `buildProjectBriefing`；變更史是派生圖，不是新庫。

---

## 1. 讀寫總覽

```mermaid
flowchart LR
  subgraph write [寫入]
    INIT[init / 手動 rescan]
    DISP[session/disposed]
    MEM[admitMemory]
    TODO[todo_*]
  end

  subgraph store [儲存]
    P[(project.json)]
    A[(architecture.json)]
    M[(memory.jsonl)]
    TD[(todo.jsonl)]
    T[(timeline.jsonl)]
  end

  subgraph derive [派生 禁止當第二事實源]
    B[buildProjectBriefing]
    G[buildSessionGraph]
  end

  subgraph read [讀取]
    UI1[第一屏]
    INJ[system prompt]
    UI2[任務動態圖]
    GIT[Git Tab]
    ASK[project_ask]
  end

  INIT --> P
  INIT --> A
  DISP --> T
  DISP -->|light / full| P
  DISP -->|full 才改| A
  MEM --> M
  TODO --> TD
  TODO --> T
  P --> B
  A --> B
  TD --> B
  T --> B
  M --> B
  T --> G
  TD --> G
  M --> G
  B --> UI1
  B --> INJ
  M -->|Core| INJ
  G --> UI2
  GIT --> GIT
  M --> ASK
```

---

## 2. Session 結束

```mermaid
flowchart TB
  D[session/disposed]
  D --> INITD{已 init?}
  INITD -->|否| SKIP[不寫]
  INITD -->|是| GIT[detectSessionChanges：工作樹 mtime + 視窗內 commit]
  GIT --> EXT[LLM：summary + durable]
  EXT --> ADM[admitMemory]
  ADM --> SUM{summary 過 changelog 閘?}
  SUM -->|否| T0[timeline session_summary summary 空]
  SUM -->|是| T1[timeline 結構化 files + summary]
  T0 --> HK[housekeep]
  T1 --> HK
  HK --> SRC{sourceChangeFiles?}
  SRC -->|是| L[scanAndWrite light]
  SRC -->|否| TRIG
  L --> TRIG{architectureTriggerFiles: manifest/入口/增刪?}
  TRIG -->|是| F[scanAndWrite full]
  TRIG -->|否| KEEP[不動 stale 標記]
  F -->|失敗| LOG[日誌 + markArchitectureStale true]
  F -->|成功| CLEAR[scanAndWrite 寫 stale=false]
  L -->|失敗| LOG
```

---

## 3. 注入組裝

```mermaid
flowchart TB
  R[讀 brain] --> HK[ensureHousekeepOnRead]
  HK --> BR[buildProjectBriefing]
  BR --> STALE{architectureStale?}
  STALE -->|是| SH[startHere = entrypoints only]
  STALE -->|否| KF[entrypoints + keyFiles ≤ 5]
  SH --> MD[briefing markdown]
  KF --> MD
  MD --> TODO[活躍待辦段，空則跳過]
  TODO --> CORE[拼接 Core 全量]
  CORE --> OUT[injector / continue.injection]
```

---

## 4. 主幹圖派生

```mermaid
flowchart TB
  IN[timeline + todos + memories] --> GRP[按 sessionId；否則按日桶]
  GRP --> GATE{非空摘要 或 files 或 todo/非changelog memory?}
  GATE -->|否| C[collapsedEmptyCount++]
  GATE -->|是| N[trunk 節點]
  N --> LAB{有合格 summary?}
  LAB -->|是| L1[label = 第一句]
  LAB -->|否 有非changelog標題| L2[label = memory/todo title]
  LAB -->|否 有 files| L3[label = 程式碼有變更（無摘要）]
  N --> TIME[按時間連 time 邊]
  N --> EV[todo 閉環 / supersede / rescan∩files]
  EV --> E2[evidence 邊]
```
