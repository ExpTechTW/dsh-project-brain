# scripts/_archive

一次性診斷 / 除錯指令碼歸檔。**不再隨產品演進維護**，僅保留作為歷史診斷參考。

| 檔案 | 用途 | 歸檔時機 |
| --- | --- | --- |
| `debug-ask.js` | 離線復現 `project_ask` BOM + readJson 修復（v0.3.9） | 修復上線後 |
| `merge-pollution.mjs` | 把誤寫到 DSH Desktop 安裝目錄的 `.project-brain/` 資料合併回 plugins workspace | v0.3.8 path-resolver 修復後 |
| `test-rebuild.mjs` | 手動觸發 `build.js` 看輸出 | v0.3.4 auto-rebuild 上線後 |

> ⚠️ 這裡的指令碼**不參與 build、不被 import**，是 v0.3.0-v0.3.10 治理債清理階段（v0.3.11）的臨時歸檔。
> 永久刪除前請先確認對應 SPEC changelog 已記錄診斷結論（見 `SPEC.md` §20）。