# Durable Core Memory 鏈路圖

對應設計：[2026-09-15-durable-core-memory-design.md](./2026-09-15-durable-core-memory-design.md)

一句話：所有寫入進同一扇門 `admitMemory()`；能進 prompt 的只有 Core（`active`）加上 timeline 裡的上次會話摘要。

---

## 1. 總覽

左邊寫、中間存、右邊讀。**寫 `memory.jsonl` 事實行只有 `admitMemory`。** `project_diff` / 抽取 / 工具 / 記住 全部進這扇門。向量快取是派生資料，注入不用。

```mermaid
flowchart LR
  subgraph write [寫入]
    U[使用者說記住]
    A[project_memory_add]
    S[session/disposed]
    F[project_diff]
  end

  ADM[admitMemory]

  subgraph store [儲存]
    M[(memory.jsonl)]
    T[(timeline.jsonl)]
    D[(todo.jsonl)]
  end

  subgraph read [讀取]
    I[新 session 注入]
    Q[project_ask]
    L[memory_list / Dashboard]
  end

  U --> ADM
  A --> ADM
  S --> ADM
  F --> ADM
  ADM -->|過門| M
  ADM -->|change / 摘要| T
  ADM -->|issue| D
  M -->|active 全量| I
  T -->|最近 session_summary| I
  M -->|active + dormant| Q
  M -->|預設 active| L
```

---

## 2. 四條寫入通道

只有使用者原話「記住」免 LLM。Agent 工具、會話抽取、`project_diff` 都是自動通道，必須過門。mock 禁止落盤。

```mermaid
flowchart TB
  subgraph ch1 [通道 1 使用者顯式]
    IN1["agent/inbox/claimed"] --> RX{"強訊號？記住 / 記一下 / remember"}
    RX -->|否| DROP1[不寫]
    RX -->|是| C1["candidate · user_explicit"]
  end

  subgraph ch2 [通道 2 Agent 工具]
    IN2[project_memory_add] --> C2["candidate · agent · 永遠不算顯式"]
  end

  subgraph ch3 [通道 3 會話結束]
    IN3["session/disposed"] --> LLM["一次 LLM：summary + durable 標記"]
    LLM --> C3["durable=true 的條目 · session_semantic"]
    LLM --> SUM["summary 寫入 timeline"]
  end

  subgraph ch4 [通道 4 project_diff]
    IN4[project_diff] --> DRY{dryRun 預設 true}
    DRY -->|是| SKIPD[不寫]
    DRY -->|否且非 mock| C4["candidate · project_diff"]
  end

  C1 --> ADMIT[admitMemory]
  C2 --> ADMIT
  C3 --> ADMIT
  C4 --> ADMIT
```

弱訊號（以後都 / 約定）**當場不寫**，最多等通道 3 的 LLM 判斷是否耐久。

---

## 3. admitMemory 門

所有通道共用。規則一票否決；LLM 不能推翻規則失敗。

```mermaid
flowchart TD
  C[candidate] --> INIT{已 project_init?}
  INIT -->|否| R0[拒絕：不建半殘目錄]
  INIT -->|是| RULE{ruleGate}

  RULE -->|失敗| ROUTE{改道}
  ROUTE -->|changelog 或 change| TL[timeline]
  ROUTE -->|issue| TODO[todo]
  ROUTE -->|其它| DROP[丟棄]

  RULE -->|通過| CH{通道}
  CH -->|user_explicit| DEDUPE[去重 / 衝突]
  CH -->|automatic| LLM{llmConfirm}
  LLM -->|admit=false 或 LLM 掛| DROP2[不寫 memory]
  LLM -->|admit=true| DEDUPE

  DEDUPE --> FP{fingerprint 已存在?}
  FP -->|是| SKIP[冪等：不插第二條]
  FP -->|否| EXP{顯式 supersedes id?}
  EXP -->|是| SUP[舊行改為 superseded]
  EXP -->|否| NEW[新行 status=active · 標題相似只建議]
  SUP --> NEW
  NEW --> CAP[enforceCoreCap]
  CAP --> FILE[(memory.jsonl)]
```

規則門硬拒絕（可單測）：

- type 不在 `decision | requirement | architecture | bug | lesson`（`context` 僅 `user_explicit`）
- 標題/正文像 changelog（版本號、patch、檔案清單、「本次改了 N 個檔案」）
- 正文過短，或整段只是本次活動報告（不是標題裡出現「剛才」就拒絕）

---

## 4. 狀態機

寫入成功後只有排程，沒有「注入時再截斷」。

```mermaid
stateDiagram-v2
  [*] --> active: admit 成功

  active --> dormant: Core 超限，先踢更舊的 active
  active --> superseded: 被新決策替換
  active --> archived: 使用者 archive 或回掃硬命中

  dormant --> active: 一般不自動升回
  dormant --> superseded: 被新決策替換
  dormant --> archived: 使用者 archive

  archived --> [*]
  superseded --> [*]
```

| status | 含義 | 注入 | ask |
| --- | --- | --- | --- |
| `active` | Core | 全部 | 是 |
| `dormant` | 合格但擠出 Core | 否 | 是 |
| `archived` | 不合格 / 否決 | 否 | 預設否 |
| `superseded` | 已被替換 | 否 | 預設否 |

`archived` ≠ `dormant`：changelog 進 archived；舊但仍為真的決策進 dormant。

---

## 5. 會話結束（summarizer）

Git 只當證據，不再生成 `type=change` 記憶。

```mermaid
flowchart TD
  D["session/disposed"] --> INIT{已 init?}
  INIT -->|否| SKIP[跳過]
  INIT -->|是| BF[backfill：changelog 標題改為 archived]
  BF --> GIT[git diff 當證據]
  GIT --> LLM[一次 LLM]
  LLM --> SUM[timeline session_summary]
  LLM --> LOOP[逐條檢查抽取結果]
  LOOP --> DUR{durable 且 grounding 過?}
  DUR -->|否| SKIPM[不寫 memory]
  DUR -->|是| ADMIT[admitMemory]
  ADMIT --> CAP[enforceCoreCap]
  GIT -.->|無耐久記憶| SUM
```

---

## 6. 新會話注入

`injector` 和 `project_continue` 共用 `buildInjectionContext()`。不走向量、不做空 query 的 Top-K。

```mermaid
flowchart LR
  START["agent/session-start"] --> READ[讀 project / memory / todo / timeline]
  READ --> CORE["全部 active，按 updatedAt 新到舊"]
  READ --> LAST["timeline 最近一條 session_summary"]
  READ --> TODO[活躍 TODO]
  CORE --> MD[system prompt]
  LAST --> MD
  TODO --> MD
```

Prompt 結構：

```text
## Project Brain
### 專案概況
### Core 記憶      ← 只 active，全量，寫入時已限 15 / 800 token
### 上次會話      ← 只摘要，不進 memory.jsonl；沒有則整段省略
### 活躍 TODO
```

---

## 7. 按需檢索（ask / list）

```mermaid
flowchart TD
  Q[使用者提問 / memory_list] --> KIND{哪個工具}
  KIND -->|list 預設| CORE[只 active]
  KIND -->|list 指定 layer| MIX[dormant 或 active 加 dormant]
  KIND -->|ask 預設| RET[active + dormant]
  RET --> BM25[BM25 + 重要度/時效]
  BM25 --> VEC{配了 embedding?}
  VEC -->|否或失敗| OUT[返回 BM25 結果]
  VEC -->|是| MIX2[可選增強 · 失敗仍用 BM25]
  MIX2 --> OUT
```

注入 **不** 走這張圖。所以不會再出現「list 一套分、prompt 另一套分」。

---

## 8. 模組落點

```mermaid
flowchart TB
  subgraph admit ["src/host/memory/admit.js"]
    G[ruleGate]
    A[admitMemory]
    C[enforceCoreCap]
    B[backfillMemoryStatuses]
  end

  RT["realtime-memory.js"] --> A
  TOOL["tools/memory.js"] --> A
  SUM["summarizer + session-extractor"] --> A
  A --> G
  A --> C
  SUM --> B

  INJ["injector.js"] --> ASM[buildInjectionContext]
  CON["continue.js"] --> ASM
  ASM --> JSONL[(memory.jsonl)]

  ASK["tools/ask.js"] --> RET["retrieval.js 僅 ask"]
```

---

## 9. Dream：只收拾，不刪決策

不是睡覺時再抽一層記憶。會話抽取已經是反射。自動路徑禁止標題相似就刪行。

```mermaid
flowchart TD
  DISP["session/disposed 寫完抽取"] --> HK[housekeepMemories]
  HK --> BF[changelog 標 archived · 行保留]
  HK --> CAP[超限 active 改為 dormant]
  HK --> SUG[相似標題只進建議 不提交]
  BF --> CH{有實際變更?}
  CAP --> CH
  CH -->|否| NOOP[不寫檔案 不寫 timeline]
  CH -->|是| WRITE[寫 memory.jsonl + timeline]
```

手動 `project_dream` 預設 dry-run，確認後只執行上圖的歸檔 + evict，仍然不 Jaccard 刪除。

---

## 10. 讀這張圖時記住的三句話

1. **能進 `memory.jsonl` 的，必須像半年後仍為真的句子。** 發版說明、檔案清單、本次改了什麼，只進 timeline。
2. **門在寫入時關死，不在注入時碰運氣。** Core 超限先踢舊的 active；本輪新寫入免驅逐。不合格 → `archived`；只有顯式 supersede 才替換。收拾房間不刪決策。
3. **新 session 只帶 Core + 上次摘要。** 舊決策要回顧，用 `project_ask` 搜 dormant，不要把檔案塞進 system prompt。
