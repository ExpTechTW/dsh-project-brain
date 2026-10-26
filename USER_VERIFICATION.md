# 5 分鐘人工驗收操作清單（USER_VERIFICATION）

> 當前狀態：**39/39 自動化驗收全過 + 0 個 DSH Desktop UI bug 已知**
> 待你做的：AC-12（DSH Web/Desktop Dashboard 實際渲染） + AC-13（非 Web profile 相容性）
> 預估時間：**5 分鐘**

## 前置檢查（30 秒）

```bash
# 1. 確認本地 src/ 修改已編譯進 lib/
node scripts/dev-reload.mjs
# 或：npm run dev:reload
```

指令碼會自動：
1. 跑 `node build.js` → 生成 `dsh-project-brain/lib/{index.js,client.js}`
2. 檢查 bundle 大小
3. 檢測 DSH Desktop 程序狀態

如果 DSH Desktop 在跑（PID 輸出有顯示），需要**手動重啟 DSH Desktop**（cordis-loader 靜態 fiber 限制）。

## AC-12：DSH Desktop 真實環境驗證（4 分鐘）

### 步驟 1：完全退出 DSH Desktop（10 秒）

- 看工作列右下角 DSH 圖示 → **右鍵 → Quit**（**不要只關視窗**）
- 或：工作管理員 → 結束所有 "DSH Desktop" 程序（應該有 5-6 個）

### 步驟 2：重新啟動 DSH Desktop（30 秒）

- 雙擊桌面圖示
- 等待主視窗載入（看到側邊欄 / 輸入框 = 已載入完成）
- **首次啟動時觀察 DSH 終端視窗**（如果有），應該看到一行：
  ```
  [dsh-project-brain] host loaded (runtime RPC, tools registered: 14)
  ```
  說明 14 個工具註冊成功 → 通過 ✓

### 步驟 3：開啟一個 workspace（30 秒）

- 頂部選單 → **Open Folder**（或對應中文）
- 選任意一個**已存在的**專案目錄（例如 `C:\Users\liuzp16\Desktop\liuzp\plugins\data-analyst-agent`）
- **不要**用 DSH Desktop 自己的安裝目錄（`AppData\Local\Programs\DSH Desktop\`）—— 那是被沙箱拒絕的

### 步驟 4：啟動專案大腦（30 秒）

- 左側導航 → 找 **「專案」Tab**
- 點選 **「啟動專案大腦」按鈕**
- 預期效果：
  - 按鈕變轉圈（CSS conic-gradient）
  - 底部出現 3 階段步驟條：掃描專案結構 → 寫入專案大腦 → 分析技術棧與依賴
  - 完成後 Dashboard 自動展示

**如果失敗**：
- 看 DSH Desktop 終端視窗輸出，找 `[dsh-project-brain]` 開頭的錯誤資訊
- 或：右鍵 DSH 托盤 → "Open Log Folder" 看最新日誌

### 步驟 5：檢查 4 個 Dashboard Tab（1 分鐘）

頂部 Tab 切換（中文介面，應該是 "概覽 / 架構 / 任務動態 / 專案記憶"）：

| Tab | 檢查項 |
|---|---|
| **概覽** | 專案名 + 技術棧 chip + 4 Quick Actions（重新掃描 / 列出待辦 / 整理記憶 / 專案全景）+ 狀態統計 |
| **架構** | 分層架構圖（藍色卡片）+ 點選元件展開責任/協作/證據檔案 |
| **任務動態** | timeline 事件列表（最近 5 條，含日期 + 事件名） |
| **專案記憶** | memory 卡片列表（按 importance 排序，前 3 條） |

### 步驟 6：檢查 TodoStrip（30 秒）

- 在 DSH 主輸入框（composer）上方看 **TodoStrip**
- 第一次啟動時應該是空的（沒 todo）→ 不顯示 strip
- 手動呼叫 `project_todo_add` 加幾條 → strip 出現，預設摺疊（只有 header）
- 點 header 展開/摺疊
- 點 × 關閉 → strip 消失，留 mini-chip `📋 · n 檢視全部`

### 步驟 7：新建 Session 驗證自動注入（30 秒）

- 頂部 → "New Session"（新建會話）
- 輸入框隨便問一句：「這個專案用的是什麼？」
- 看 LLM 回答時是否引用了：
  - 專案名
  - 關鍵 memory（如 "採用 Express"）
  - 活躍 TODO 標題
- 如果引用了 → **AC-5（自動注入）+ AC-12（實際 UI）全過**

---

## AC-13：非 Web profile 相容性（1 分鐘）

> **結論先行**：DSH Desktop 0.1.1-rc.2 當前**只支援 `desktop` 和 `web` 兩個 profile**，**沒有 `cli` / `tui` profile**（已探測確認）。

如果你想進一步確認：

```bash
# 列出 DSH Desktop 當前支援的所有 profile
dsh --help | grep -i profile

# 完整 config dump
dsh --dump-default-config | head -30
```

輸出只有 `web` 和 `headless`（headless 不是互動式 profile）。

**AC-13 處理結果**：
- 當前版本：**AC-13 不適用**（DSH Desktop 0.1.1-rc.2 無 cli/tui profile）
- 後續行動：當 DSH Desktop 新增 cli/tui profile 後再補做 Host 工具相容性測試
- 在 `ACCEPTANCE.md` 標記為：⚠️ 待 DSH profile 擴充套件後驗證

---

## 完成後的反饋模板

如果全過：
```
✅ AC-12 全過：4 Tab 渲染正常，Quick Action 轉圈工作，TodoStrip 摺疊/展開 ok，
   新 Session 自動注入含專案名+關鍵 memory+活躍 TODO
✅ AC-13 已知：DSH Desktop 0.1.1-rc.2 無 cli/tui profile，標記為"待 profile 擴充套件"
```

如果有 bug：
```
❌ AC-12 部分失敗：
  - 啟動按鈕無反應
  - Dashboard 4 Tab 切到第 3 個崩潰
  - Quick Action 點 "整理記憶" 沒轉圈
  - TodoStrip 不顯示
  - 新 Session 回答不含專案名
DSH 終端日誌：[貼上最後 20 行]
```

---

## 配套命令

```bash
# 一鍵 build + 檢查 DSH 程序
npm run dev:reload

# 單跑某個 smoke
npm run test:acceptance   # 39/39 自動化驗收
npm test                  # 16/16 smoke

# 釋出前自檢
npm run verify:release
npm run verify:install
```
