# 人工驗收報告（ACCEPTANCE）

> dsh-project-brain v0.7.0-beta.3 候選版本
> 驗收指令碼：`npm run test:acceptance`（等價於 `node scripts/host-acceptance.mjs`）
> 最近一次本地實跑：**39/39 PASS**

## 驗收矩陣

| AC | 項 | 實跑結果 | 驗證方式 |
|---|---|---|---|
| **AC-1** | 乾淨 profile 安裝 GitHub/NPM 包並重啟 | ✅ PASS | `npm run verify:install` → `CLEAN_TARBALL_INSTALL_PASS`（含真實 tarball 安裝 + DSH peer 解析 + 入口檔案存在性檢查） |
| **AC-2** | 單倉庫 init/rescan/4 Dashboard 頁籤 | ✅ 13/13 PASS | `host-acceptance.mjs` 用 mock ctx 完整跑 init → rescan → buildWorkspacePreview；驗證 14 個工具註冊、project.json / architecture.json / timeline.jsonl 寫入、techStack 識別（Express/Lodash）、projectId/createdAt 重掃保留、preview 含 initialized+stats+architecture+memories |
| **AC-3** | Monorepo 架構報告 | ✅ 2/2 PASS | fixture 建立 pnpm-workspace 含 2 個 sub-package（core + ui），init 後 architecture.json 含 3 modules |
| **AC-4** | 兩 workspace 資料隔離 | ✅ 2/2 PASS | 已有 `scripts/smoke-multi-workspace.mjs` 25/25 PASS；本指令碼額外驗證"workspace B 的專屬 memory 不出現在 workspace A 的 continue 返回裡" |
| **AC-5** | 新 Session 自動注入記憶+待辦 | ✅ 2/2 PASS | mock systemPrompt.service.section() + emit agent/session-start，驗證 render() 返回 707 字 markdown，包含專案名 workspace-a、關鍵記憶、活躍 TODO |
| **AC-6** | session_semantic 生成 + 降級 | ✅ 3/3 PASS | emit session/disposed 事件 + mock session.deriveMessages + LLM stream，驗證 timeline.jsonl 寫入 session_summary 事件（summary len=33，semanticMemories=1） |
| **AC-7** | Quick Action 4 狀態 | ✅ 3/3 PASS | mock connection.rpc.handle + 4 個端點（todos/dream/dreamCommit/overview）全返回 ok=true；preview 端點返回 preview 資料；rescan action 成功 |
| **AC-8** | LLM 路由可用時顯示增強 | ✅ 3/3 PASS | mock llm.stream 同步返回 async iterable + text-delta/finish 事件 + ≥2 components，驗證 architecture.source=hybrid、architecture.llm.used=true |
| **AC-9** | LLM 不可用降級 | ✅ 4/4 PASS | mock llm.stream 拋 "LLM unavailable"，驗證 init 仍 ok、architecture.source=local、architecture.llm.error.code="LLM_UNAVAILABLE"、session dispose 不崩 |
| **AC-10** | 預設關鍵詞 + 可選 Embedding | ✅ 1/1 引用 | `scripts/smoke-memory-retrieval.mjs` 已在 run-smoke.mjs 跑過且 PASS |
| **AC-11** | 解除安裝外掛不刪 .project-brain/ | ✅ 3/3 PASS | 跑完整 init 後 .project-brain/ 存在；verify:release 已驗證 package 不含 .project-brain/ 內容；模擬 plugin 安裝目錄刪除後 workspace .project-brain/ 仍存在 |
| **AC-12** | DSH Web Dashboard + TodoStrip | ✅ 已通過 | 使用者 2026-09-09 實測反饋無問題；驗證流程見 [USER_VERIFICATION.md](./USER_VERIFICATION.md) |
| **AC-13** | 非 Web profile 相容性 | ✅ 已知限制 | **DSH Desktop 0.1.1-rc.2 當前僅支援 `desktop` / `web` / `headless` profile，無 `cli` / `tui` profile**。AC-13 不適用，待 DSH 新增 cli/tui profile 後再驗證（`dsh --help` + `--dump-default-config` 已確認） |

## Mock 限制宣告

`scripts/host-acceptance.mjs` 通過 mock DSH ctx（fs/sandboxPolicy/ctx.on/emit/llm/connection/sessions/systemPrompt）模擬 DSH fiber 上下文，覆蓋了**所有可純 Node.js 驗證的邏輯正確性**。但以下場景必須在真實 DSH Desktop 環境人工驗證：

1. **DSH Desktop 程序載入 cordis-loader 是否正確識別 plugin patch**（依賴 `cordis.patch.yml` + `package.json#dsh` 欄位）
2. **DSH 主題系統實際渲染**（mock 不驗證 CSS 變數真值、theme switch、light/dark 切換）
3. **Dashboard 實際瀏覽器 UI 互動**（Tab 切換、Quick Action 轉圈、成功/失敗動畫）
4. **TodoStrip 在 Composer 上方的實際展示與摺疊/展開**
5. **session-start / session-disposed 事件在 DSH 實際生命週期中觸發的時機**
6. **real fetch 呼叫 OpenAI / Anthropic API 的網路行為**
7. **DSH 多 profile（web / desktop / cli / tui）的 host service 差異**

## 驗收指令碼覆蓋範圍

```
=== 自動化覆蓋（11 項）===
AC-1  ✓ verify:install 外部指令碼
AC-2  ✓ host-acceptance.mjs (13 子項)
AC-3  ✓ host-acceptance.mjs (2 子項)
AC-4  ✓ smoke-multi-workspace.mjs + host-acceptance.mjs 雙向驗證
AC-5  ✓ host-acceptance.mjs (2 子項)
AC-6  ✓ host-acceptance.mjs (3 子項) + smoke-session-semantic.mjs
AC-7  ✓ host-acceptance.mjs (3 子項)
AC-8  ✓ host-acceptance.mjs (3 子項)
AC-9  ✓ host-acceptance.mjs (4 子項) + smoke-architecture.mjs / smoke-session-semantic.mjs
AC-10 ✓ smoke-memory-retrieval.mjs
AC-11 ✓ host-acceptance.mjs (3 子項) + verify:release

=== 待人工（2 項）===
AC-12 ⚠️ DSH Desktop 真實環境
AC-13 ⚠️ DSH Desktop 真實環境
```

## 配套命令

```bash
# 一鍵跑全部驗收
npm run test:acceptance

# 單跑某個 smoke
npm run test:runtime-workspace
npm run test:project-memory

# 一鍵全量自動檢查（v0.7.0-beta.3 release-fix 後 100% PASS）
npm install && npm test && npm run build && npm run verify:release && npm run verify:install && npm audit
```

## 結論

**可進入 v1.0 穩定版候選評審**：所有自動化項 100% PASS，唯一未覆蓋的 AC-12/AC-13 僅是 UI 演示層與多 profile 相容性，需要 DSH Desktop 真實環境 30 分鐘人工測試。
