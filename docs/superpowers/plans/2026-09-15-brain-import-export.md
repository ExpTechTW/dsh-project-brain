# Plan: Project Brain 匯入匯出 v1.3.1 實施步驟

> 與 SPEC `2026-09-15-brain-import-export.md` 一一對應

---

## 階段 1：核心模組（host 端，約 400 行）

### 1.1 `src/host/transfer/bundle.js`
- `createBundle({ projectPath, outputPath, fs, includeCache=true })` → 寫 zip + manifest
  - 呼叫 brain-files.js 讀取所有 `.project-brain/` 檔案
  - 排除項：`.grill/`, `node_modules/`, `.git/`, `tmp-*.txt`, `*.log`
  - sha256 校驗每個檔案
  - 寫 manifest.json
  - 寫 zip（用內建 `node:zlib` + 手寫 zip central directory，避免引入新依賴）
- `parseBundle({ bundlePath, fs })` → 校驗 zip / 讀 manifest / 返回檔案清單
- `applyBundle({ bundlePath, destProjectPath, fs, sandboxPolicy })` → 備份 → 解壓 → 改寫 rootPath → 觸發 rescan
- `previewBundle({ bundlePath, destProjectPath, fs })` → 返回 impact + confirmToken

**zip 實現策略**：使用 `node:zlib` 壓縮每個 entry，手寫 EOCD（end of central directory）。無第三方依賴。

### 1.2 `src/host/transfer/backup.js`
- `createBackup({ projectPath, fs, sandboxPolicy })` → 重新命名 `.project-brain/` → `.project-brain.backup-<ts>/`
- `listBackups({ projectPath, fs })` → 返回 `[{ ts, path, sizeBytes, memCount, todoCount, timelineCount, createdAt }]`
- `cleanupBackups({ projectPath, keepLast, olderThanMs, fs })` → 刪除超限的
- `rollbackBackup({ projectPath, backupTimestamp, fs, sandboxPolicy })` → 把"當前腦"再備份一次 → rename 舊 backup → 當前腦
- `previewRollback({ projectPath, backupTimestamp, fs })` → 返回預覽 + confirmToken

### 1.3 工具集中化
- 備份目錄命名：`backup-<yyyymmdd-hhmm-sss>`（帶毫秒避免衝突）
- confirmToken 由記憶體 Map 持有，統一在 `src/host/transfer/confirm-tokens.js` 管理（5 分鐘 TTL）

---

## 階段 2：Tool 與 RPC（host 端，約 280 行）

### 2.1 `src/tools/export.js`
```js
buildProjectExportTool({ fs, sandboxPolicy })
  → defineTool({ name: "project_export", ... })
```
- 調 `createBundle`
- 返回 bundle 路徑 + manifest 摘要

### 2.2 `src/tools/import.js`
```js
buildProjectImportTool({ fs, sandboxPolicy })
  → defineTool({ name: "project_import", ... })
```
- `dryRun=true` → 調 `previewBundle`，返回 impact + confirmToken
- `dryRun=false` → 校驗 confirmToken → 調 `applyBundle`
- confirmToken 由記憶體級 Map 持有（帶過期時間 5 分鐘）

### 2.3 `src/tools/cleanup-backups.js`
```js
buildCleanupBackupsTool({ fs, sandboxPolicy })
  → defineTool({ name: "project_cleanup_backups", ... })
```

### 2.4 `src/tools/rollback-backup.js`（新增）
```js
buildRollbackBackupTool({ fs, sandboxPolicy })
  → defineTool({ name: "project_rollback_backup", ... })
```
- `dryRun=true` → 校驗 backupTimestamp 對應的目錄存在 + 列出元資訊 → 返回 preview + confirmToken
- `dryRun=false` → 校驗 confirmToken → 把"當前腦"再備份一次 → rename backup → 當前腦 → rescan

### 2.5 `src/host/rpc/sidebar.js` 增加 7 個 handler
- `project_brain/export.run`
- `project_brain/import.preview`
- `project_brain/import.apply`
- `project_brain/backup.list`
- `project_brain/backup.cleanup`
- `project_brain/backup.rollback.preview`
- `project_brain/backup.rollback.apply`

### 2.6 `src/index.js` 串聯
- 匯入 4 個 Tool 工廠
- 在 applyImpl 內呼叫 `registerConnectionRpc` 時掛載 7 個 handler

---

## 階段 3：Client UI（約 200 行）

### 3.1 `src/client.js` HeaderBlock 改造
- 當前結構：圖示 + 專案名 + techStack chip 一行；下面 description；再下面「上次更新」
- **改造**：在第一行（圖示+專案名+chip）後面追加右側三個圖示按鈕（絕對定位右側）
  - 💾 備份：調 `host.call("project_brain/export.run", {...})`
  - 📥 恢復：調 `host.call("project_brain/import.preview", {...})`
  - ↶ 回滾：調 `host.call("project_brain/backup.list", {...})` → 彈備份列表對話方塊
- 加 PreviewDialog 元件（fixed 居中彈框，列出 impact，主按鈕文案"覆蓋並恢復"）
- 加 BackupListDialog 元件（列出 backup，每行顯示 ts/記憶數/體積，點選進入回滾預覽）
- 加 Toast 元件（fixed 右下角，成功/失敗各 1 種）
- 加 state：`previewOpen`, `previewData`, `exporting`, `importing`, `backupListOpen`, `rollbackPreview`

### 3.2 樣式
- 複用現有 `var(--dsw-alias-*)` token
- 按鈕：`background: var(--dsw-alias-bg-layer-2)`, `borderRadius: 8px`, hover 時 `var(--dsw-alias-brand-primary)` 微染
- 彈框 backdrop：`rgba(0,0,0,0.5)` + 內容卡片
- 主按鈕文案統一為「覆蓋並恢復」，強調會覆蓋當前腦

---

## 階段 4：測試（約 250 行）

### 4.1 `scripts/smoke-import-export.mjs`
- 用 fixtures 專案（新建 `fixtures-import-export/`）跑 AC-1 ~ AC-8
- 匯出 → 解壓 → 檔案清單校驗
- 匯入空腦 → 驗證
- 匯入有腦 → 驗證 backup 目錄建立 + rescan 觸發
- dryRun → 驗證不修改檔案
- 不匹配的 confirmToken → 驗證錯誤碼

### 4.2 `scripts/host-acceptance.mjs` 擴充套件
- 加 `project_export` happy-path（匯出 → 檔案存在 → 解壓 → manifest 校驗）
- 加 `project_import` happy-path（匯入 dryRun → apply → rescan → status 正常）

### 4.3 `scripts/cleanup-backups.mjs` 單測（可選，整合到 host-acceptance）

---

## 階段 5：文件與釋出

### 5.1 CHANGELOG.md Unreleased 段
- 寫 v1.3.1 bullet：匯入匯出、備份按鈕、清理備份
- 引用 commit SHA

### 5.2 SPEC.md
- §5 加一段（約 15 行）：v1.3.1 匯入匯出能力
- 更新頭部版本號 `v1.3.1`

### 5.3 README.md
- 頂部特性區增加一行："📦 v1.3.1: 匯入匯出遷移（跨機器同步）"

### 5.4 驗收
- `node scripts/run-smoke.mjs` 全過
- `node scripts/host-acceptance.mjs` 全過
- 手測 UI：匯出 → 檔案 → 恢復 → 預覽 → 確認 → 完成 toast

---

## 風險點

| 風險 | 緩解 |
|------|------|
| 手寫 zip 相容性（部分 OS unzip 不認） | 用 zip 標準（store + deflate），不加密；先 unit-test 在 Windows / macOS / Linux unzip |
| 備份目錄過大佔空間 | 預設永久保留；提供 cleanup tool；CHANGELOG 說明清理策略 |
| 跨機器 rootPath 不一致導致後續 tool 報錯 | 強制改寫 rootPath + 觸發 rescan；rescan 失敗不阻斷 |
| confirmToken 在記憶體 Map 中，重啟後失效 | 重啟後用戶必須重新 dryRun；屬於可接受行為 |
| cache 內的 embedding 在新機器上語義錯 | cache loader 已有自動重建邏輯；不動 |

---

## 排期

| 階段 | 工時 | 累計 |
|------|------|------|
| 階段 1（核心模組） | 1.5 天 | 1.5 |
| 階段 2（Tool + RPC，含 rollback） | 1.5 天 | 3 |
| 階段 3（Client UI，含回滾彈框） | 1.5 天 | 4.5 |
| 階段 4（測試） | 0.5 天 | 5 |
| 階段 5（文件 + 收尾） | 0.5 天 | 5.5 |

總計 ~5.5 工作日。
