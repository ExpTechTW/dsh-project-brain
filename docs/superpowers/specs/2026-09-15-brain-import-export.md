# SPEC: Project Brain 匯入匯出（v1.3.1）

> 狀態：Draft → Active（user approval pending）
> 日期：2026-09-15
> 關聯：v1.3.0 Durable Core 站立記憶 + 使用者跨機器同步場景的真實痛點

---

## 1. 目標

為 dsh-project-brain 補齊「匯出 bundle → 檔案傳遞 → 匯入 bundle」的能力。**核心場景是單專案跨機器同步**（公司/家裡兩臺機器開發同一專案），不解決多專案批次、團隊共享、P2P、加密傳輸等需求。

**為什麼是 v1.3.1 (patch)**：純加法功能，不破壞 v1.3.0 資料格式與工具 API，向後相容。

---

## 2. 範圍與非目標

### 範圍內
- 單專案的 `.project-brain/` → zip bundle → 還原到另一臺機器
- 匯出時全量（含 `timeline.jsonl` + `cache/`）
- 匯入時自動備份當前腦 → 改寫 `rootPath` → 觸發 rescan
- Dashboard 頂部"備份 / 恢復"按鈕
- 兩個新 Tool：`project_export`、`project_import`
- 匯入預覽（dry-run）返回影響清單，使用者確認後才實際寫入
- 新 Tool：`project_cleanup_backups`（按需清理歷史備份）

### 不做
- 多專案批次匯出（out of scope）
- 共享資料夾監聽 / 自動同步（out of scope）
- 端到端加密 bundle（v1.x 不做）
- 跨大版本遷移（v0.x ↔ v1.x）
- 第三方工具匯入（Cursor/Cline/Aider）
- 刪除腦資料工具（獨立需求，本次不做）

---

## 3. bundle 格式

**檔案命名**：`dsh-brain-<sanitizedProjectName>-<yyyymmdd-hhmm>.zip`

例：`dsh-brain-my-app-20260915-1430.zip`

**ZIP 內結構**：

```
dsh-brain-my-app-20260915-1430.zip
├── manifest.json
└── .project-brain/
    ├── project.json
    ├── memory.jsonl
    ├── todo.jsonl
    ├── timeline.jsonl
    ├── architecture.json
    └── cache/
        └── ...
```

**`manifest.json` 契約**：

```json
{
  "schemaVersion": 1,
  "pluginVersion": "1.3.1",
  "exportedAt": 1757928600000,
  "sourceProject": {
    "id": "brain-xxx",
    "name": "my-app",
    "rootPath": "C:\\work\\my-app",
    "lastScannedAt": 1757928000000
  },
  "checksum": {
    "algorithm": "sha256",
    "files": {
      "project.json": "abc123...",
      "memory.jsonl": "def456...",
      "todo.jsonl": "...",
      "timeline.jsonl": "...",
      "architecture.json": "...",
      "cache/embedding.json": "..."
    }
  },
  "options": {
    "includeCache": true
  }
}
```

**排除項**（打包時不進入 zip）：`.grill/`、`node_modules/`、`.git/`、`tmp-*.txt`、`*.log`、`debug.log`。

---

## 4. 行為契約

### 4.1 匯出 `project_export`

**輸入**：
- `path?: string`（專案根路徑；預設從 session cwd 推斷）
- `outputPath?: string`（目標 zip 路徑；預設使用者選擇或 `<projectRoot>/dist-backups/...`）
- `includeCache?: boolean`（預設 true）

**輸出**（`ok: true`）：
```ts
{
  ok: true,
  data: {
    bundlePath: string,
    bundleSize: number,
    manifest: { ... },        // 完整 manifest
    fileCount: number,
    durationMs: number
  }
}
```

**錯誤碼**：
- `E_BRAIN_NOT_FOUND`：專案未初始化
- `E_BUNDLE_WRITE_FAILED`：zip 寫入失敗
- `E_PERMISSION_DENIED`：目標路徑無寫許可權

### 4.2 匯入 `project_import`

**輸入**：
- `path?: string`（目的地專案根路徑）
- `bundlePath: string`（bundle zip 路徑）
- `dryRun?: boolean`（預設 false）
- `confirmToken?: string`（與 dryRun 配套，第二次呼叫時必須與第一次 dryRun 返回的 token 一致）

**輸出**（`dryRun=true`）：
```ts
{
  ok: true,
  data: {
    mode: "preview",
    manifest: { ... },
    impact: {
      currentBrainExists: boolean,
      currentProjectId: string | null,
      currentMemories: number,
      currentTodos: number,
      currentTimeline: number,
      currentArchitecture: boolean,
      incomingMemories: number,
      incomingTodos: number,
      incomingTimeline: number,
      backupPath: string | null,  // 若 currentBrainExists，將要備份到的路徑
      rootPathRewrite: { from: string, to: string },
      confirmToken: string          // 呼叫方下次傳回
    }
  }
}
```

**輸出**（`dryRun=false`，confirmToken 校驗通過）：
```ts
{
  ok: true,
  data: {
    mode: "applied",
    backupPath: string | null,
    rescanTriggered: boolean,
    durationMs: number
  }
}
```

**錯誤碼**：
- `E_BUNDLE_NOT_FOUND`：bundle 檔案不存在
- `E_BUNDLE_INVALID`：zip 損壞 / manifest 缺失 / schemaVersion > 當前支援版本
- `E_BUNDLE_CHECKSUM_MISMATCH`：解壓後文件 sha256 與 manifest 不一致
- `E_CONFIRM_TOKEN_REQUIRED`：dryRun=false 但未傳 confirmToken
- `E_CONFIRM_TOKEN_MISMATCH`：confirmToken 與最近一次 dryRun 不一致

### 4.3 清理備份 `project_cleanup_backups`

**輸入**：
- `path?: string`
- `keepLast?: number`（保留最近 N 個；預設 3）
- `olderThanMs?: number`（刪除超過 X 毫秒的；預設 30 天）

**輸出**：
```ts
{
  ok: true,
  data: {
    candidates: string[],
    deleted: string[],
    kept: string[]
  }
}
```

### 4.4 回滾到本地備份 `project_rollback_backup`

**目的**：從 `.project-brain.backup-<ts>/` 還原成 `.project-brain/`。與匯入 bundle 不同，**回滾是專案本地操作**（不讀取外部檔案）。

**輸入**：
- `path?: string`（專案根路徑）
- `backupTimestamp: string`（必填；形如 `20260915-143022-345`，對應目錄名 `.project-brain.backup-20260915-143022-345/`）
- `dryRun?: boolean`（預設 false）
- `confirmToken?: string`（與 import 一致的兩步機制）

**前置條件**：
- `.project-brain.backup-<backupTimestamp>/` 存在
- 當前 `.project-brain/`（若有）先備份到新的 `.project-brain.backup-<now>/`（**回滾前再備份一次**，形成完整歷史鏈）

**輸出**（`dryRun=true`）：
```ts
{
  ok: true,
  data: {
    mode: "preview",
    sourceBackup: { ts, path, createdAt, sizeBytes, memCount, todoCount, timelineCount },
    currentBrain: { exists, lastUpdateAt, memCount, todoCount } | null,
    willBackupCurrentTo: string | null,  // 回滾前會再備份一次
    confirmToken: string
  }
}
```

**輸出**（`dryRun=false`，confirmToken 校驗通過）：
```ts
{
  ok: true,
  data: {
    mode: "applied",
    restoredFrom: string,
    preRollbackBackupPath: string | null,
    rescanTriggered: boolean
  }
}
```

**錯誤碼**：
- `E_BACKUP_NOT_FOUND`：指定 timestamp 的備份不存在
- `E_BACKUP_INVALID`：備份目錄缺少必要檔案（project.json 等）
- `E_CONFIRM_TOKEN_REQUIRED` / `E_CONFIRM_TOKEN_MISMATCH`：同 import

---

## 5. Host RPC 與 Client UI

### 5.1 Host RPC（`harness.handle`）

- `project_brain/export.run({path, outputPath?, includeCache?})` → 同 `project_export`
- `project_brain/import.preview({path, bundlePath})` → 同 `project_import(dryRun=true)`
- `project_brain/import.apply({path, bundlePath, confirmToken})` → 同 `project_import(dryRun=false)`
- `project_brain/backup.list({path})` → 列出所有 `.project-brain.backup-<ts>/`
- `project_brain/backup.cleanup({path, keepLast?, olderThanMs?})` → 同 `project_cleanup_backups`
- `project_brain/backup.rollback.preview({path, backupTimestamp})` → 同 `project_rollback_backup(dryRun=true)`
- `project_brain/backup.rollback.apply({path, backupTimestamp, confirmToken})` → 同 `project_rollback_backup(dryRun=false)`

### 5.2 Client UI

**位置**：`HeaderBlock` 內（Dashboard 頂部），與專案名 / 技術棧 chip 同行，靠右（在紅框位置）。

**元件**：三個圖示按鈕（從左到右）
- 💾 「備份」 → 調 `export.run` → 進度條 → 完成 toast（帶 bundle 路徑）
- 📥 「恢復」 → 調 `import.preview` → 彈預覽對話方塊（顯示 impact）→ 使用者點「覆蓋並恢復」→ 調 `import.apply` → 進度條 → 完成 toast
- ↶ 「回滾」 → 調 `backup.list` → 彈備份列表對話方塊（按時間倒序）→ 使用者選一個 → 調 `backup.rollback.preview` → 彈回滾預覽（**再次點「覆蓋並恢復」**）→ 調 `backup.rollback.apply` → 完成 toast

**按鈕文案統一使用「覆蓋並恢復」**（不用「確認恢復」），強調會覆蓋當前腦，避免使用者誤點。

**預覽對話方塊內容**（人話化，符合使用者偏好）：
- "將覆蓋當前腦（X 條記憶 / Y 個待辦 / Z 條 timeline）"
- "舊腦已自動備份到 `<路徑>`，隨時可手動回滾"
- "bundle 來自 `<sourceProject.rootPath>`，本次將改寫到 `<currentProject.rootPath>`"
- "完成後會自動重新掃描專案，失敗不阻斷"

**樣式**：與現有 chip 一致（`var(--dsw-alias-*)` 主題 token），圓角 8px，hover 時顯示 tooltip。

---

## 6. 失敗模式與兜底

按使用者偏好「任何兜底/降級必須附原因+操作建議」：

| 場景 | 兜底行為 | 提示文案 |
|------|---------|---------|
| bundle schemaVersion > 當前支援版本 | 拒絕匯入 | "bundle 由更新版本 dsh-project-brain v1.5.x 匯出，當前外掛 v1.3.1 不支援。請先升級外掛再匯入。" |
| bundle checksum 不匹配 | 拒絕匯入 | "bundle 檔案損壞或傳輸不完整，請重新匯出再傳。" |
| 目的地腦不存在（首次匯入） | 直接寫入 | "這是該專案首次匯入，舊腦無備份可建。" |
| 匯入後 `project_rescan` 失敗 | 不回滾腦，寫入 timeline 事件 `import:success-with-rescan-failed` | "腦資料已寫入，但自動重掃失敗，原因：<err>。建議：手動調 /project_rescan。" |
| ZIP 內 cache/embedding 不相容 | cache loader 自動重建（已有邏輯） | 不提示（透明降級） |
| 使用者在匯入中途取消對話方塊 | 狀態保留（dryRun 已返回，未 apply） | 再次點"恢復"仍可繼續 |

---

## 7. 驗收清單（DoD）

- [ ] AC-1 匯出 → bundle 檔案存在 → 解壓 → 檔案清單與 `.project-brain/` 完全一致（sha256 一致）
- [ ] AC-2 匯入空專案（無腦）→ 直接生效，無 backup 目錄，timeline 寫入 `import:first-time` 事件
- [ ] AC-3 匯入有腦專案 → 舊目錄被備份成 `.project-brain.backup-<ts>/` → 新目錄正確寫入 → `project_status` 正常讀取
- [ ] AC-4 `dryRun=true` 不修改任何檔案，返回完整 impact + confirmToken
- [ ] AC-5 `dryRun=false` 但未傳 confirmToken → `E_CONFIRM_TOKEN_REQUIRED`
- [ ] AC-6 confirmToken 與最近 dryRun 不匹配 → `E_CONFIRM_TOKEN_MISMATCH`
- [ ] AC-7 manifest.schemaVersion > 當前支援版本 → `E_BUNDLE_INVALID`，錯誤碼區分原因
- [ ] AC-8 rootPath 自動改寫為目的地路徑，bundle 內的 sourcePath 不影響新腦
- [ ] AC-9 Dashboard 頂部紅框位置顯示「備份」「恢復」「回滾」三個按鈕，與 chip 同行不換行
- [ ] AC-10 匯入預覽對話方塊與回滾預覽對話方塊，主按鈕文案統一為「覆蓋並恢復」
- [ ] AC-11 匯入預覽對話方塊顯示「將被覆蓋的記憶/待辦/timeline 數」+ 「舊腦備份路徑」+ 「路徑改寫」三項
- [ ] AC-12 「回滾」按鈕 → 彈備份列表（按 ts 倒序，含每條記錄的 ts / 記憶數 / 體積）→ 選一個進入回滾預覽
- [ ] AC-13 回滾預覽顯示「舊腦將被再備份一次到新 backup」+ 「舊 backup 將被還原成當前腦」
- [ ] AC-14 回滾完成 → 當前腦 = 舊 backup 內容；舊的"當前腦"在新的 backup 目錄裡可繼續回滾
- [ ] AC-15 smoke 測試：新建指令碼 `scripts/smoke-import-export.mjs`，覆蓋 AC-1 ~ AC-8 + rollback
- [ ] AC-16 host-acceptance.mjs 增加 3 個工具的 happy-path 測試（export / import / rollback）
- [ ] AC-17 CHANGELOG.md Unreleased 段寫完 v1.3.1 說明
- [ ] AC-18 SPEC.md §5 章節加一段 v1.3.1 匯入匯出能力描述（最小變更）
- [ ] AC-19 README.md 頂部增加一行 v1.3.1 新特性 bullet

---

## 8. 實現路徑（高層）

1. **新檔案 `src/host/transfer/bundle.js`**：匯出打包 / 匯入解壓 / manifest 讀寫 / sha256 校驗
2. **新檔案 `src/host/transfer/backup.js`**：備份目錄建立 / 列舉 / 清理
3. **新檔案 `src/tools/export.js` + `src/tools/import.js` + `src/tools/cleanup-backups.js`**：三個 Tool 工廠
4. **`src/host/rpc/sidebar.js`** 增加 5 個 RPC handler
5. **`src/index.js`** 註冊 3 個 Tool + 5 個 RPC
6. **`src/client.js` `HeaderBlock`**：加兩個圖示按鈕 + 預覽對話方塊 + toast
7. **`scripts/smoke-import-export.mjs`**：端到端 smoke
8. **`scripts/host-acceptance.mjs`**：擴 2 條用例
9. **CHANGELOG.md / SPEC.md / README.md** 同步

預計 ~600 行新程式碼（含 smoke 測試 + 文件）。
