# Grill: dsh-project-brain 匯入匯出遷移功能
Date: 2026-09-15

## Intent
為 dsh-project-brain 外掛補齊「匯入匯出遷移」能力，支援單專案跨機器同步：使用者在一臺機器匯出 `.project-brain/` → 手動傳檔案 → 在另一臺機器匯入還原。

## 場景約束（已鎖定）
- **核心場景**：單專案跨機器同步/遷移（非多專案批次、非純備份回滾）。
- **傳輸方式**：匯出到本地檔案 + 使用者自傳（USB / Git commit / 網盤 / 微信均可）。不做共享資料夾監聽、不做 P2P、不做 Git 整合。
- **使用邊界**：跨機器意味著 sourcePath ≠ destPath；同一機器多次匯入會觸發 conflict。

## Key decisions

- **Decision**：bundle 範圍 = 全量（含 timeline + cache）。
  Reason：跨機器後體驗一致；體積不是首要問題。
  Alternative：去掉 timeline/cache 壓縮體積 → 拒絕，因為跨機器後 timeline 缺失會讓使用者感覺"記憶丟了"。

- **Decision**：物理格式 = ZIP + manifest.json。
  Reason：跨平臺、使用者可解壓檢視、未來加 schema 演進有 manifest 錨點。
  Alternative：單 JSON → 拒絕（丟失 jsonl 行序、無法保留 cache 目錄結構）。

- **Decision**：conflict 策略 = 預設覆蓋 + 自動備份當前 `.project-brain/` → `.project-brain.backup-<ts>/`。
  Reason：跨機器時本地的腦本身就是舊的；備份提供可逆性。
  Alternative：按 id 去重合並 → 拒絕，v1.x 太複雜且語義模糊；三路合併 → 同理拒絕。

- **Decision**：UI 入口 = Dashboard 頂部兩個按鈕（備份/恢復）+ 兩個 Tool（`project_export` / `project_import`）。
  Reason：手動點 + Agent 指令碼化兩種使用方式都覆蓋。
  Alternative：僅 Tool / 僅 UI → 都太侷限。

- **Decision**：rootPath 在匯入時自動改寫為目的地專案根路徑。
  Reason：project.json 的 rootPath 在跨機器後必然不同；不改寫會讓外掛誤判"腦不屬於這個專案"。
  Alternative：保留原路徑 → 拒絕（必然導致後續功能異常）。

- **Decision**：匯入走"預覽 → 確認 → 執行"兩步（Tool 支援 `dryRun=true`）。
  Reason：匯入會覆蓋現有腦；預覽給出影響清單（被覆蓋的記憶數/待辦數等），使用者可二次確認。
  Alternative：直接執行 + 備份可逆 → 拒絕，因為預覽是零成本的兜底保護。

## Surfaced assumptions
- bundle 內的 cache/embedding 資料直接信任，跨機器可用；快取格式若不相容，由 cache loader 自動重建（已有邏輯）。
- bundle 不包含 `.grill/` / `node_modules` / `.git/` 等無關目錄（匯出時顯式排除）。
- 嵌入模型若 source/dest 不同，匯出的 embedding 可能語義不準；首次注入若發現 hash 不匹配會觸發重建（已支援）。
- 單次匯入只針對單個專案；不提供"批次匯入多個 bundle"能力（場景不要求）。
- 使用者手動遷移，不假設兩臺機器有網路連線或時間同步。

## Open questions（留待 SPEC 階段）
- 備份目錄保留策略：預設永久保留？or 7 天清理？→ SPEC 中明確。
- manifest.schemaVersion 起步值（v1）→ SPEC 中明確。
- 匯入後是否自動調一次 `project_rescan` 校驗完整性？→ SPEC 中明確（建議：自動 rescan 但失敗不阻斷）。
- bundle 檔名規範：`<pluginName>-<projectName>-<yyyymmdd-hhmm>.zip` → SPEC 中明確。
- 舊版本匯出（v0.x）→ v1.x 匯入的遷移路徑：本期不支援（v1.x 是首發）。

## Out of scope
- 多專案批次匯出 / 整個 workspace 備份。
- 共享資料夾監聽自動匯入。
- 端到端加密 bundle（v1.x 不做；如需可後續加）。
- P2P / 區域網裝置發現。
- 跨 dsh-project-brain 大版本（v0.x ↔ v1.x）遷移工具。
- 第三方工具匯入（如從 Cursor / Cline / Aider 的 memories 匯入本外掛）。
- 刪除已備份的 `.project-brain.backup-<ts>/` 工具。
