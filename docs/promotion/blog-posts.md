# 中文技術部落格 4 個選題 + 完整大綱

> **目標平臺**：掘金（首選，AI/工具圈流量大）、知乎（長文 SEO）、思否、CSDN
> **推薦字數**：3000-5000 字
> **結構模板**：痛點 → 設計 → 實戰 → 反思 → 程式碼片段

---

## 選題 1（首選）：Host/Client 雙層架構

**標題候選**：

1. 「我為什麼給 DSH 外掛設計 Host/Client 雙層架構（v1.0.0 實戰）」
2. 「從 0 到 v1.0.0：一個 DSH 外掛的架構演進之路」
3. 「DSH 外掛開發實戰：如何用 Host/Client 分層讓檔案操作與 UI 解耦」

**大綱**：

```
1. 背景：DSH 外掛的特殊性
   - DSH 是 Cordis 框架的桌面應用
   - 外掛需要同時操作檔案（Node.js）和渲染 UI（瀏覽器）
   - 不能讓 UI 直接調 Node API，也不能讓 Node 直接渲染 React

2. 痛點：單層架構的失敗嘗試
   - 第一版：所有邏輯都在 Host，Client 通過 RPC 呼叫 → UI 響應延遲
   - 第二版：所有邏輯都在 Client → Node API 呼叫受限於瀏覽器安全
   - 第三版（v1.0.0）：Host/Client 嚴格分工 + Package-private JSON RPC

3. Host/Client 分層原則（附圖）
   - Host：所有 Node.js 操作（fs / sandboxPolicy / runtime / llm）
   - Client：所有 React UI（slots / locale / connection）
   - 通訊：harness.handle() ↔ host.call()，JSON-only
   - 資料流：Session 事件 → Host 監聽 → 寫 memory.jsonl → Client RPC 讀預覽

4. 關鍵設計決策
   - 把 scanAndWrite 拆到 src/host/scan-and-write.js（純邏輯，無 dsh-tools）
   - 路徑解析強制走 sandboxPolicy，禁止 Client 傳路徑
   - 持久層路徑強制限制在 .project-brain/

5. 程式碼片段：harness.handle() 實現
   ```js
   harness.handle('project-brain/preview', async (args, ctx) => {
     const workspace = await pathResolver.resolve(args.path ?? ctx.liveCwd)
     return buildWorkspacePreview(workspace)
   })
   ```

6. 驗證：39/39 host-acceptance 自動化覆蓋
   - AC-2 驗證 init / rescan / 4 Dashboard 頁籤
   - AC-7 驗證 Quick Action 4 狀態
   - AC-9 驗證 LLM 不可用降級

7. 反思：什麼能做對 vs 什麼還能更好
   - 做對：明確分層讓 host/client bundle 互不汙染
   - 還能更好：跨 session 的 memory 索引效能還需最佳化

8. 參考
   - GitHub: github.com/yj-liuzepeng/dsh-project-brain
   - SPEC.md §6（完整介面契約）
   - DESIGN.md §3（架構圖）
```

**鉤子（開頭 200 字）**：

> 你有沒有遇到過這種外掛：UI 改了要重啟整個桌面應用，檔案操作要穿透瀏覽器安全模型，不同 profile 之間行為不一致？我做 dsh-project-brain v1.0.0 時也踩了這些坑，最終找到的答案是 Host/Client 雙層架構 + Package-private JSON RPC。這篇文章從失敗嘗試開始，講清楚這個架構為什麼是 DSH 外掛的最優解。

---

## 選題 2：雙通道記憶機制

**標題候選**：

1. 「如何讓 AI 程式設計助手記住你的專案：dsh-project-brain 雙通道記憶設計」
2. 「Context 持久化的 5 個層次：從 Chat History 到 Project Brain」
3. 「不再重複解釋專案：我做了一個讓 DSH 永久記住專案上下文的外掛」

**大綱**：

```
1. 痛點：每次新對話都要重新介紹專案
2. 5 層記憶模型（業界對比）
   - L1 Chat History：當前 Session 對話歷史（Claude / Cursor 內建）
   - L2 Vector Store：長期語義召回（Cursor Rules、Copilot Memories）
   - L3 Project File：專案級後設資料（README、CHANGELOG）
   - L4 Project Memory：結構化長期記憶（dsh-project-brain）
   - L5 Tool Logs：工具呼叫歷史（DevTools / OpenTelemetry）
3. dsh-project-brain 雙通道設計
   - Channel 1：本地 BM25（零配置預設）
   - Channel 2：可選 Embedding 混合檢索（OpenAI / 自建）
4. 記憶型別 8 種（decision / requirement / architecture / change / bug / lesson / issue / context）
5. 生命週期：active / archived / superseded
6. 自動寫入路徑
   - 使用者調 project_memory_add
   - Session 結束自動抽取語義記憶（用當前 DSH LLM）
   - Git 變化自動寫 change memory
7. 跨 Session 注入：新 Session system prompt 自動收到 Top-K memories
8. 實戰：如何為你的專案搭建記憶
9. 反思：記憶的"遺忘"機制比"記憶"更重要
```

---

## 選題 3：對比評測 Cursor / Copilot / dsh-project-brain

**標題候選**：

1. 「我試了 3 個 AI 程式設計助手：Cursor / Copilot / dsh-project-brain 哪個最懂你的程式碼庫？」
2. 「AI 程式設計工具橫評：上下文管理能力對比」
3. 「Cursor vs Copilot vs dsh-project-brain：長任務理解能力實測」

**大綱**：

```
1. 評測場景
   - 新加入一個 100k 行 monorepo，讓 AI 幫我找到「支付鏈路」
   - 一週後回來，問 AI「上週的支付改造方案現在到哪一步了」
   - 切換到另一個專案，問 AI「這個專案用了什麼架構」
2. Cursor：專案級索引 + Composer，但跨 Session 記憶有限
3. GitHub Copilot：程式碼補全強，工作區理解弱
4. dsh-project-brain：純專案記憶，依賴 DSH 框架，但語義+結構化最強
5. 實測：哪個最快、哪個最準、哪個最便宜
6. 結論：組合使用建議
7. 截圖對比
```

---

## 選題 4：架構分析演算法深度

**標題候選**：

1. 「如何用 DSH LLM 給一個 100k 行的 monorepo 生成架構報告（帶程式碼）」
2. 「6 語言 AST 分析實戰：從 tree-sitter 到架構分層圖」
3. 「不靠 LLM 也能分析專案架構：本地靜態分析降級路徑」

**大綱**：

```
1. 背景：DSH LLM 不可用怎麼辦？
2. 本地降級 3 層
   - L1：manifest 解析（package.json / go.mod / Cargo.toml / requirements.txt）
   - L2：tree-sitter AST 分析（6 語言：JS / TS / Python / Go / Java / Rust / C/C++）
   - L3：import / API endpoint / DB schema 抽取
3. DSH LLM 增強路徑
   - 準備：README + manifest + 相對路徑 + 受長度限制的原始碼摘要
   - 提示工程：few-shot + 結構化輸出
   - 驗證：JSON schema 校驗 + 路徑安全檢查
4. 架構指紋：避免無意義的重複分析
5. 失敗兜底：超時 / JSON 異常 / 路徑穿越 → 本地降級
6. 實戰：分析一個真實 monorepo
7. 程式碼片段：buildLocalFallback(workspace)
8. 反思：純 LLM 路線 vs 純靜態分析路線的對比
```

---

## 推薦釋出順序

| 周 | 選題 | 平臺 |
|----|------|------|
| W1 | 選題 1（Host/Client 架構） | 掘金 + 知乎 |
| W2 | 選題 2（雙通道記憶） | 掘金 + 思否 |
| W3 | 選題 4（架構分析演算法） | 知乎 + CSDN |
| W4 | 選題 3（對比評測） | 掘金 + 知乎 |

每篇同步釋出到 2 個平臺，最大化曝光。

---

## SEO 關鍵詞清單（每篇都要出現）

- dsh-project-brain
- DSH 外掛
- Cordis
- AI 程式設計助手
- 專案記憶 / Project Memory
- AI 程式設計工具
- Cursor 對比 / Copilot 對比
- DSH Desktop
- 架構分析
- 本地優先 / Local-first