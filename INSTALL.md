# 安裝 dsh-project-brain

## 公測試用安裝

當前 `0.7.0-beta.2` 已具備公開試用條件，程式碼與預構建釋出包維護在 [GitHub](https://github.com/yj-liuzepeng/dsh-project-brain)。將已釋出標籤安裝到你正在使用的 DSH profile：

```bash
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v0.7.0-beta.2
```

`dsh web` 可使用 `--profile web`；Desktop 發行版如果執行 `desktop` profile，則使用 `--profile desktop`。安裝命令會使用包內預構建 Host/Client bundle，普通使用者不需要克隆原始碼或執行構建。安裝或升級後需要重啟當前 DSH 程序；使用 DSH Desktop 時請完全退出並重新開啟。

開啟任意專案後進入“專案”頁，點選“啟動專案大腦”。外掛會從當前 Session 自動解析 workspace，不需要填寫路徑或執行構建命令。

## 支援範圍

- DSH Host：提供工作區掃描、13 個專案工具、長期記憶、上下文注入、待辦和架構分析。
- DSH Web / 承載 Web Client 的 Desktop：額外提供 Dashboard、TodoStrip 和後臺互動按鈕。
- 純 CLI/TUI：不會顯示 Web Dashboard；如果 profile 具備所需 Host services，可使用核心工具和記憶能力。當前公測仍在補充非 Web profile 的真實安裝驗證，因此不將其標註為已完整驗收。

## 本地原始碼開發安裝

```bash
git clone https://github.com/yj-liuzepeng/dsh-project-brain.git
cd dsh-project-brain
npm install
npm test
npm run build
npm run verify:release
npm run verify:install
```

把倉庫加入 DSH profile 的 `pnpm-workspace.yaml`，並確保：

```text
~/.dsh/profiles/<profile>/node_modules/dsh-project-brain
```

連結到這個倉庫。隨後在 profile 的 bundle 配置中啟用 `dsh-project-brain`，重新安裝 profile 依賴並完整重啟 DSH Desktop。

## 驗證

安裝成功後應看到：

- 頂部“專案”頁面和輸入框上方 TodoStrip。
- 13 個 `project_*` 工具。
- 新專案點選啟動後立即出現專案概覽。
- 初始化後 Dashboard 出現專案定位、架構分層、職責元件、執行流程和關鍵檔案導覽；右上角標明“本地分析”或“DSH LLM 增強”。
- 切換到另一個專案後顯示另一個 workspace 的資料，不需要重新 build。
- Dashboard 標題預設顯示“本地檢索”；未配置向量模型也能正常查詢和恢復記憶。

架構語義分析預設直接使用當前 DSH Session 的模型，不需要單獨配置 API，併發送有限關鍵原始碼摘要。若模型不可用會顯示本地分析和錯誤碼。設 `architectureLlmIncludeSource: false` 可只發送結構事實；設 `architectureLlmEnabled: false` 可完全本地。

Session 結束時也會預設複用當前模型，從受長度限制的使用者/助手文本中抽取最多 4 條穩定記憶；工具輸出、System 訊息和可識別憑據不會發送。可設定 `sessionSemanticMemoryEnabled: false` 關閉，或通過 `sessionSemanticMaxChars`、`sessionSemanticMaxItems`、`sessionSemanticTimeoutMs` 調整邊界。模型不可用時自動保留純 Git 摘要。

完整公測驗收項見 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)。首次試用建議至少驗證兩個不同 workspace，確認切換專案後名稱、架構、記憶和待辦均隨當前專案變化。

## 可選：向量增強

此步驟不是安裝必需項。預設本地檢索適合多數專案，也不會產生外部 API 成本。

如需語義召回，在 DSH 的外掛設定中為 `dsh-project-brain` 設定：

```yaml
retrievalMode: hybrid
vectorEnabled: true
embeddingBaseURL: https://your-provider.example/v1
embeddingModel: your-embedding-model
embeddingApiKeyEnv: PROJECT_BRAIN_EMBEDDING_API_KEY
```

再在 DSH Credentials 中儲存同名 credential ref。也可通過程序環境變數提供，但不建議把金鑰寫進專案檔案。對於無需鑑權的本地 OpenAI-compatible 服務，可將 `embeddingApiKeyEnv` 設為空。

首次執行 `project_ask` 時會懶載入索引；之後只重算內容發生變化的記憶。狀態可通過 `project_status` 檢視，快取位於 `.project-brain/cache/embeddings.jsonl`。刪除該檔案只會觸發重建，不會刪除原始記憶。

## 升級

```bash
git pull
npm install
npm test
npm run build
```

Host bundle 更新後重啟當前 DSH 程序；使用 DSH Desktop 時完整退出並重新開啟。專案資料更新和切換 Session 不需要重啟。

## 解除安裝

例如使用 `dsh plugin --profile web remove dsh-project-brain`；其他環境請把 `web` 換成實際 profile 名稱。也可以通過對應 DSH 客戶端的外掛管理介面解除安裝。解除安裝不會刪除各專案裡的 `.project-brain/`，因此重新安裝後記憶仍然存在。

如果確實希望清除某個專案的所有長期記憶，請先備份，再手動刪除該專案的 `.project-brain/`。這是不可恢復的資料操作，外掛不會自動執行。

## 常見問題

### 專案頁面提示找不到 workspace

確認該 Session 確實關聯了專案目錄，然後重啟當前 DSH 程序以載入最新 Host bundle。使用 DSH Desktop 時需要完整退出並重新開啟。正常情況下路徑來自 live Session header。

### 專案尚未初始化

進入“專案”頁點選“啟動專案大腦”，或呼叫 `project_init`。在正常 DSH Session 中無需傳 `path`。

### Sidebar 暫時顯示“快照”

說明執行時 Connection RPC 暫時不可用。連線恢復後角標會變為“即時”；釋出包中的快照不包含開發者本機專案資料。

### 是否應該提交 `.project-brain/`

個人專案可以提交以便跨機器同步；團隊或私有專案應先評估其中的架構決策、Bug 和內部上下文是否適合進入 Git 歷史。

通常不建議提交 `.project-brain/cache/`：它是特定模型生成的派生資料，可以隨時重建。更換模型或維度時，外掛會按模型鍵自動忽略舊快取。
