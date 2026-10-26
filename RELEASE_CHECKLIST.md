# 釋出檢查清單

當前釋出版本：`1.3.0`（v1.2.0 的 minor 版本，Durable Core 站立記憶 + 架構並列泳道 + 技術棧分層重構 + 截圖從 7 張擴到 10 張）。

## 自動檢查

釋出前依次執行：

```bash
npm install
npm test
npm run build
npm run verify:release
npm run verify:install
npm audit
```

`verify:release` 會檢查版本一致性、Host/Client 入口、DSH patch、npm 檔案白名單，以及釋出檔案中是否出現本機使用者路徑、臨時目錄、Session ID、GitHub Token、私鑰或專案腦資料。

`verify:install` 會從當前原始碼生成真實 tarball，在臨時空專案中讓 npm 正常解析可選 DSH peers 並安裝，再驗證 Host、Client 和 patch 入口；用於提前發現使用者安裝時的 `ERESOLVE` 或缺少構建產物問題。

## DSH profile 與客戶端人工驗收

> v0.7.0-beta.3 起：13 項中 **11 項已通過 `npm run test:acceptance` 自動化覆蓋**（39/39 PASS）。
> 詳細報告：[ACCEPTANCE.md](./ACCEPTANCE.md)。

- [x] 從乾淨 profile 安裝 GitHub/NPM 包並重啟當前 DSH 程序（`verify:install`）
- [x] 普通單倉庫初始化、重掃、四個 Dashboard 頁籤正常（host-acceptance AC-2，13/13）
- [x] Monorepo 初始化後生成職責級架構報告（host-acceptance AC-3，2/2）
- [x] 在兩個 workspace 間切換，專案資料和記憶不串臺（smoke-multi-workspace 25/25 + host-acceptance AC-4）
- [x] 新建 Session 能自動注入當前專案的關鍵記憶與待辦（host-acceptance AC-5，2/2）
- [x] 結束含穩定決策的 Session 後生成 `session_semantic` 記憶；無路由時僅降級、不影響關閉（host-acceptance AC-6，3/3）
- [x] Quick Action 展示執行中、成功、確認和錯誤重試狀態（host-acceptance AC-7，3/3）
- [x] 當前 DSH LLM 路由可用時顯示"DSH LLM 增強"（host-acceptance AC-8，3/3）
- [x] LLM 不可用、超時或 JSON 異常時正確降級為本地分析（host-acceptance AC-9，4/4）
- [x] 預設關鍵詞檢索正常；可選 Embedding 配置後混合檢索正常（smoke-memory-retrieval）
- [x] 解除安裝外掛不會刪除 workspace 中的 `.project-brain/`（host-acceptance AC-11，3/3 + verify:release 檔案白名單）
- [x] 在 DSH Web 或承載 Web Client 的 Desktop 環境驗證 Dashboard 與 TodoStrip（使用者 2026-09-15 實測通過；流程詳見 `USER_VERIFICATION.md`）
- [x] 在至少一個非 Web profile 驗證 Host 工具相容性，或明確記錄缺失的 required service（**已知限制**：DSH Desktop 0.1.1-rc.2 當前僅支援 `desktop` / `web` / `headless` profile，無 `cli` / `tui` profile，待 DSH 新增後再驗證）

## 釋出分級

- `0.7.0-beta.2`：可以邀請使用者試用並收集不同 DSH 版本、模型和專案型別的反饋。
- 穩定版：完成上述人工驗收，補齊商店截圖，並至少驗證一個普通倉庫和一個 Monorepo 後再發布。

## 已知邊界

- Session 自動摘要會記錄 Git 變化並抽取最多 4 條穩定語義記憶；輸入受長度限制且不會包含工具輸出，關鍵意圖仍建議顯式記錄。
- 架構 LLM 依賴當前 Session 已建立可用模型路由；否則自動使用本地分析。
- `project_diff` 的獨立 LLM 路徑仍需要相容的 OpenAI 或 Anthropic API 配置。
- Git multi-pack-index（MIDX）尚未完整支援。
