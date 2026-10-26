# DSH Community Showcase 主帖 v1.3.0 更新文案

> **帖子**：[discussions/5121](https://github.com/deepseek-ai/deepseek-harness/discussions/5121)
> **作者**：yj-liuzepeng（OP，可編輯主帖）
> **更新策略**：直接重寫主帖（替換 v0.7.0-beta.1 舊內容為 v1.3.0 最新版），保留 GitHub edit history

---

## 帖子正文（v1.3.0 完整版 · 直接替換主帖）

````markdown
> **Unofficial community plugin** — not maintained or endorsed by the DeepSeek Harness team.
> **非官方社群外掛** —— 不由 DeepSeek Harness 團隊維護或背書。

## dsh-project-brain · v1.3.0 stable

Persistent project intelligence and memory plugin for [DSH (DeepSeek Harness)](https://github.com/deepseek-ai/deepseek-harness).

**Get started fast. Learn as you go. Stay with the project for the long haul.**

- Repository: https://github.com/yj-liuzepeng/dsh-project-brain
- npm: https://www.npmjs.com/package/dsh-project-brain
- License: MIT
- Languages: English + 簡體中文 README
- Latest stable: **v1.3.0** (2026-09-15)

## What it does

- **Workspace scan**: 6-language detection (JS/TS / Python / Go / Java / Rust / C-C++), tech stack layered as runtime / delivery / structure / language.
- **Architecture analysis**: positioning, layers, components, runtime flow; lane-based Architecture tab; LLM-enhanced with local fallback.
- **8 structured long-term memory types** (`decision` / `change` / `bug` / `lesson` / `requirement` / `architecture` / `issue` / `context`), isolated per workspace.
- **Durable Core standing memory** (v1.3.0): each new Session automatically gets cross-session-stable facts injected (active cap 15 / ~800 tokens, overflow → dormant); changelog follows a rule-based gate.
- **Weighted retrieval by default** (v1.3.0): 5-factor rank (BM25 + importance + recency + type-stability + diversity); vectors add a bonus; optional Embedding enables hybrid recall.
- **Real-time interaction memory** + Session-end LLM extraction of stable semantic memories (with privacy scrubbing, length limits, dedup, and failure fallback).
- **Dashboard**: 6 tabs (Overview / Architecture / Activity / Memories / Settings / Git History) + activation entry + SuggestionCard for next steps + 4 Quick Actions.

## Tool surface

**16 `project_*` tools** registered with the Host:

| Capability | Tools |
|---|---|
| Init / Rescan | `project_init`, `project_rescan` |
| Status / Continue | `project_status`, `project_continue`, `project_suggest_next` |
| Memory | `project_memory_add`, `project_memory_list`, `project_memory_archive`, `project_memory_supersede` |
| Todos | `project_todo_add`, `project_todo_list`, `project_todo_update`, `project_todo_done` |
| Query / Cleanup | `project_ask`, `project_dream` |
| Git + LLM diff | `project_diff` |

## Quick start

Install the latest stable release into the DSH profile you use:

```bash
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.3.0
```

Use `--profile web` with `dsh web`, or the profile your DSH distribution runs (e.g. `--profile desktop`). After install or upgrade, **completely quit and reopen** DSH Desktop (host bundle changes do not hot-reload).

Detailed setup: https://github.com/yj-liuzepeng/dsh-project-brain/blob/main/INSTALL.md

## Screenshots

**Project Brain activation entry** (initial onboarding with 3 core capabilities):

![01](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/01.png)

**Project card** — auto-detected stack + live status (pending TODOs / memories / completed):

![02](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/02.png)

**Dashboard overview** — SuggestionCard + 4 Quick Actions + 5 tabs (Overview / Architecture / Activity / Memories / Settings / Git History):

![03](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/03.png)

**Architecture tab** — lane-based layered overview (5 layers, left=layer / right=components):

![04](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/04.png)

**Architecture tab** — expanded runtime path for a single layer:

![05](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/05.png)

**Activity tab** — TODOs + development timeline:

![06](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/06.png)

**Memories tab** — structured project memory (8 types, importance stars, view-details modal):

![07](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/07.png)

**Settings — vector retrieval and Embedding config** (hybrid mode, Embedding URL / model / API key, vector dim):

![08](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/08.png)

**Settings — retrieval weights and probe button** (keyword / vector / importance / confidence / recency, live probe):

![09](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/09.png)

**Git history tab** — VSCode-style timeline with branch / commit / file-changes summary:

![10](https://raw.githubusercontent.com/yj-liuzepeng/dsh-project-brain/v1.3.0/docs/screenshots/10.png)

## Changelog highlights (v0.7.0 → v1.3.0)

**v1.3.0** (2026-09-15) — Durable Core 站立記憶 (active 15 條全量注入 / 溢位 dormant) + 設定頁聯通測試與 API Key 直填；架構圖改為並列泳道（5 層鳥瞰 + 單層展開執行路徑）+ 初始化頁收斂 3 條重點；技術棧抽 `stack-taxonomy` 模組，按 runtime / 交付 / 結構 / 語言四層口徑分層（Dockerfile 即 Docker、LangGraph / MCP 識別、Python 拼寫相容）；截圖從 7 張擴到 10 張（啟動入口 / 專案狀態卡 / 設定·向量 / 設定·權重）。
**v1.2.0** (2026-09-15) — 6 fixes & features: Onboarding 升級為 8 項能力清單；記憶卡片檢視改彈框模式；架構兜底條人話化 + 內聯重試；語言 chip 按使用率排序 + 百分比 + 長尾聚合；切專案時顯示 loading 佔位；切專案/切 session banner 閃退修復。
**v1.1.1** (2026-09-12) — Patch: fix npm README screenshot rendering (use SHA-locked absolute URLs).
**v1.1.0** (2026-09-12) — Hybrid retrieval: dual-channel (keyword + vector) with Reciprocal Rank Fusion (k=60). 3 new embedding smoke / e2e scripts.
**v1.0.0** (2026-09-09) — **First stable release.** 7 P0 publish-blocking fixes (npm install ERESOLVE, dsh-tools peer smoke, Windows verify ENOENT). Split `scanAndWrite` pure logic layer. 39/39 host-acceptance scenarios pass.
**v0.7.0** — SuggestionCard, TodoStrip collapse, GitTab VSCode-style UI, Dashboard settings entry, dual-channel memory mechanism, 6-language AST analysis.

## Verification

```bash
npm test                        # 19 / 19 smoke suites
npm run test:runtime-workspace  # 30 / 30 runtime workspace RPC
npm run test:project-memory     # 59 / 59 project memory isolation
npm run test:acceptance         # 39 / 39 host-acceptance scenarios
npm run verify:release          # 14 / 14 checks (version, allowlist, privacy)
npm run verify:install          # CLEAN_TARBALL_INSTALL_PASS
npm audit                       # 0 vulnerabilities
```

## Privacy

- All project data stays in `<workspace>/.project-brain/`; nothing leaves the local machine.
- Architecture analysis uses the current DSH LLM route and sends only README + manifests + relative paths + bounded source excerpts (no absolute paths); both source excerpts and LLM can be disabled separately.
- Client RPC cannot accept arbitrary file paths; Host uses the live Session workspace.
- Embedding (when enabled) sends memory titles + bodies + tags + file names to the configured endpoint.
- Release artifacts contain zero developer workspace data, Session IDs, credentials, or local paths.

## Feedback

Different DSH profiles, clients, Harness versions, and project shapes (single-repo / monorepo / polyglot / academic writing) exercise the plugin differently. Feedback is especially welcome on:

- Edge cases where Session-start context injection picks the wrong memories
- Embedding fallback behavior (BM25-only vs hybrid)
- Cross-workspace isolation in monorepo setups
- Non-Web Host compatibility (DSH Desktop / headless)

Please report reproducible issues at: https://github.com/yj-liuzepeng/dsh-project-brain/issues

If you have a real workflow to share, please open a **Show and tell** in this Discussions section — real user stories are the most valuable contribution right now.
````

---

## 🚀 三種更新方式

### 方式 A：瀏覽器手動編輯（推薦 · 最簡單）

1. 開啟 https://github.com/deepseek-ai/deepseek-harness/discussions/5121
2. 右上角點 **"Edit"** 按鈕（你是 OP，會有這個按鈕）
3. 全選原內容 → 刪除 → 貼上上面的"帖子正文"
4. 點 **"Update comment"**
5. 重新整理頁面，確認 v1.3.0 內容已顯示

⏱️ **耗時：3 分鐘**

### 方式 B：gh CLI 編輯（適合批次 / 自動化）

```bash
# 1. 上面"帖子正文"的 markdown 儲存為本地檔案（去掉外層 ````markdown ... ```` 包裹）
#    檔名: docs/promotion/discussion-5121-new-body.md

# 2. 用 gh CLI 編輯
gh api \
  --method PATCH \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/deepseek-ai/deepseek-harness/discussions/5121 \
  -f body="$(cat docs/promotion/discussion-5121-new-body.md)"
```

⏱️ **耗時：5 分鐘**（包含提取 body）

### 方式 C：追加評論（保留歷史）

如果不想替換原帖，可以在帖子下加一條新評論（你也是 OP，可以加編輯過的置頂評論）：

```
🎉 v1.3.0 stable released (2026-09-15)

After 162 suite-level checks (smoke + runtime-workspace + project-memory + host-acceptance + release-verify) + DSH Desktop user testing, v1.3.0 is now the recommended stable release.

Quick start:
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.3.0

What's new since v1.2.0:
- **Durable Core 站立記憶**：active 全量注入 15 條 / 約 800 token，溢位進 dormant；changelog / 活動彙報走規則門檻，不再擠 Core
- **設定頁聯通測試 + API Key 直填**：可一鍵測試 Embedding 與會話 LLM；API Key 直接貼上（全大寫名才識別為環境變數）
- **架構圖改為並列泳道**：層名靠左、元件靠右；點層才展開經過該層的主鏈路，元件只保留一句職責
- **架構 Tab 分層鳥瞰 + 單層展開執行路徑**：第一屏只保留短定位、風格標籤和分層
- **初始化頁收斂 3 條重點**：讀懂專案 / 跨會話記住 / 接著往下做
- **技術棧抽 stack-taxonomy 模組**：runtime / 交付 / 結構 / 語言四層口徑分層；Dockerfile 即 Docker；LangGraph / MCP 識別；Python 拼寫相容
- **截圖從 7 張擴到 10 張**：新增啟動入口、專案狀態卡、設定·向量、設定·權重
- **smoke 套件 17 → 19**：新增 smoke-durable-core + smoke-settings-probe

Full changelog: https://github.com/yj-liuzepeng/dsh-project-brain/blob/main/CHANGELOG.md
```

⏱️ **耗時：1 分鐘**

---

## 🎯 推薦方式 A

瀏覽器手動編輯最直觀，且 GitHub 會保留 edit history（你可以看每次改了什麼）。

如果你時間緊，先**方式 C**追加一條評論，告知最新版本；後續再**方式 A**替換主帖。

---

## ⚠️ 注意：截圖 URL 鎖定

新的截圖 URL 用 `v1.3.0` tag 鎖定（不是 commit SHA）。這樣：
- 主帖永遠顯示 v1.3.0 時刻的截圖（與 v1.3.0 npm 包一致）
- 未來發 v1.4 時，截圖會自動指向 v1.3.0（如要更新，需改 discussion body）

---

## ✅ 更新後驗證

更新完請：
1. 重新整理 discussion 頁面，確認新內容已顯示
2. 點選 10 個截圖連結，確認 GitHub raw CDN 能正常開啟（注意 CDN 快取，可能需要等幾分鐘或繞過）
3. 24 小時內回覆任何評論，建立 DSH 圈口碑