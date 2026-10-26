# Show HN 帖文（4 標題變體 + 完整正文）

> **目標平臺**：[news.ycombinator.com](https://news.ycombinator.com/) 的 Show HN
> **最佳釋出時機**：週二 / 週三 / 週四 美東上午 8-10 點（Pacific 5-7am / 北京 21-23 點）
> **準備清單**：landing page、3 張截圖、demo video（如有）、issue tracker、discussion 區

---

## 標題候選（A/B 測試）

### 變體 1（推薦）：明確痛點 + 解決方案

> **Show HN: dsh-project-brain – Persistent project memory for DSH (1.0.0)**

### 變體 2：差異化定位

> **Show HN: dsh-project-brain – A plugin that gives your AI coding assistant a long-term memory of your codebase**

### 變體 3：技術賣點

> **Show HN: dsh-project-brain – Host/Client split architecture + 6-language AST analysis for AI coding tools**

### 變體 4：本地化 / 隱私強調

> **Show HN: dsh-project-brain – Local-first project memory for DSH (no cloud, no lock-in)**

---

## 正文模板（推薦長度 400-800 字）

```markdown
Hi HN,

I've been working on **dsh-project-brain** for the past few months — a plugin
for [DSH (Development Shell Host)](https://github.com/deepseek-ai/deepseek-harness)
that gives your AI coding assistant a persistent, project-aware memory.

## The problem

Every new AI conversation starts from scratch: the model doesn't know your
project structure, your past decisions, the bugs you fixed last week, or which
files form the critical path. You're constantly re-explaining your codebase.

## What it does

dsh-project-brain turns each DSH workspace into a local "project brain":

- **Auto-architecture analysis** — scans the repo, identifies languages,
  frameworks, entry points, and produces a layered architecture report
  (project purpose, architecture style, components, flows, key files,
  reading order, risks). Uses the current DSH model if available, falls back
  to local analysis if not.
- **Cross-session memory** — decisions, requirements, architecture notes,
  bugs, lessons, changes, and TODOs persist in `<workspace>/.project-brain/`.
  New sessions automatically receive high-value memories, active TODOs,
  and recent activity through the system prompt.
- **Workspace isolation** — Host resolves the live Session workspace;
  one project's memory is never guessed from another project.
- **Git history + worktree** — pure-Node git history view (no shell
  dependency) with VSCode-style timeline UI.
- **In-Dashboard settings** — retrieval mode, embedding config, all live.

## How it's built

- **Host/Client split**: Host runs in Node.js (file ops, scanning,
  memory, RPC); Client runs in the browser (Dashboard UI, TodoStrip,
  SuggestionCard). Communication via Package-private JSON methods.
- **No language lock-in**: 16 tools, 6 languages supported for local
  AST analysis (JS/TS/Python/Go/Java/Rust/C++).
- **Local-first**: BM25 retrieval is the default. Embedding is an
  optional upgrade. All project data lives in your workspace.

## Verification

- 39/39 host-acceptance scenarios pass (`npm run test:acceptance`)
- 16/16 smoke suites pass (`npm test`)
- `verify:install` produces a clean tarball install with 0 vulnerabilities
- DSH Desktop UI verified manually on 2026-09-09

## Install

```bash
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.0.0
```

## Links

- GitHub: https://github.com/yj-liuzepeng/dsh-project-brain
- npm: https://www.npmjs.com/package/dsh-project-brain
- Screenshots in README

Happy to answer any questions — and looking forward to your feedback!
```

---

## HN 釋出 checklist（釋出前 30 分鐘）

- [ ] 在 https://news.ycombinator.com/shownew.html 準備草稿（先不提交）
- [ ] GitHub README 頂部 demo gif / 影片連結就位（目前沒有，待錄）
- [ ] Social preview 圖已設到 GitHub repo（Settings → Social preview）
- [ ] 至少 3 個 issues 已關閉或回應（避免 "issues are empty" 批評）
- [ ] Discussion 區有 1-2 個種子帖（讓使用者有地方討論）
- [ ] Twitter 上同步發同一條，@hn_frontpage_pages 之類賬號
- [ ] 自己 + 1-2 個朋友準備好 1 小時內回應評論（HN 前 2 小時評論密度決定上首頁）

## HN 後續動作（前 24 小時）

- 1 小時內回應每一條評論（HN 演算法看早期評論密度）
- 準備 3-5 條 FAQ 答案（避免重複回答）
- 如果被頂到首頁：發 Twitter 慶祝，連結回 HN
- 如果被拍：感謝批評，記錄到 issue，不要反駁（HN 文化）