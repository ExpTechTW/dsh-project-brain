# dsh-project-brain v1.0.0 · 首個穩定版本

> **第一個穩定版。** 39/39 端到端驗收全過 + 使用者實測 DSH Desktop UI 通過。
> npm dist-tag: `latest` (從 `0.7.0-beta.2` 升級)
> 安裝: `dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.0.0`

## 🎉 v1.0.0 是首個穩定版本

之前所有釋出都是 `0.x` / `beta`，現在通過 39 項端到端驗收（16 smoke suite + 23 host-acceptance scenarios），可以放心推薦給所有 DSH 使用者使用。

## ✅ 升級路徑

- **資料相容**：`.project-brain/` 全部資料格式與 `0.7.0-beta.2` 完全相容，無需遷移
- **工具相容**：16 個 `project_*` 工具的名稱、簽名與返回值不變
- **配置相容**：`config.json` 欄位相容，新增欄位都有預設值
- **必須重啟**：升級後完全退出 DSH Desktop 並重新開啟（hot reload 不支援 host bundle 改動）

## 🌟 v1.0.0 與 v0.7.0-beta.2 的差異（僅關鍵項）

### Fixed（P0 釋出阻塞修復）

- `npm install` ERESOLVE 復發（v0.7.0-beta.1 修復過的同類問題）—— 加 `overrides.tree-sitter` 強制統一
- `npm test` 在乾淨 node 環境 `ERR_MODULE_NOT_FOUND` —— 拆分 `scanAndWrite` 純邏輯層，去除 `dsh-tools` 對 smoke 的傳遞依賴
- Windows 下 `execFileSync('npm')` ENOENT —— `npm.cmd + shell: true`，接住 DEP0190
- 單 suite 失敗阻斷後續 —— `run-smoke.mjs` 改為收集全部失敗
- `smoke-append-line` / `smoke-runtime-workspace` / `smoke-theme-tokens` Windows 相容

### Added

- `@deepseek-ai/dsh-tools` / `@deepseek-ai/schemastery` 加到 devDependencies
- 智慧續接 `project_suggest_next`（v0.4.15）—— Session 開始時主動給出"💡 你今天可能想推進 X"+依據
- 技術棧推斷大幅擴充套件（v0.4.14）：JS / Python / Go / Rust 框架與 ORM 補全；techStack 欄位支援多值
- 本地 AST 分析支援 6 種語言：JS / Python / Go / Java / Rust / C/C++
- API endpoint + DB schema 跨語言適配
- config.json `languages` 白名單
- `scripts/dev-reload.mjs` 一鍵開發過載
- `scripts/host-acceptance.mjs` 39 項端到端驗收
- `ACCEPTANCE.md` / `USER_VERIFICATION.md` 文件

### Changed

- npm keywords 增加 `dsh-plugin` / `cordis` / `cordis-plugin` / `ai-coding`
- README + README.zh-CN + STORE_LISTING + CHANGELOG 同步 v1.0.0

## 🛠 安裝

```bash
# Web / Desktop 通用
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.0.0

# 升級已有使用者
dsh plugin --profile web update dsh-project-brain
```

升級後**完全退出 DSH Desktop 並重新開啟**。

## 🧪 驗證

```bash
git clone https://github.com/yj-liuzepeng/dsh-project-brain.git
cd dsh-project-brain
git checkout v1.0.0
npm install
npm test                    # 16 / 16 smoke suites
npm run test:acceptance     # 39 / 39 host-acceptance
npm run build               # runtime-rpc 模式
npm run verify:release      # 14 / 14
npm run verify:install      # CLEAN_TARBALL_INSTALL_PASS
npm audit                   # 0 vulnerabilities
```

## 📚 文件

- [README](./README.md) · [README.zh-TW](./README.zh-TW.md)
- [INSTALL](./INSTALL.md)
- [CHANGELOG](./CHANGELOG.md)
- [ACCEPTANCE](./ACCEPTANCE.md)
- [USER_VERIFICATION](./USER_VERIFICATION.md)
- [DESIGN](./DESIGN.md) · [SPEC](./SPEC.md)
- [STORE_LISTING](./STORE_LISTING.md)
- [RELEASE_CHECKLIST](./RELEASE_CHECKLIST.md)

## 💬 反饋

- [Discussions](https://github.com/yj-liuzepeng/dsh-project-brain/discussions) · [DSH 社群展示帖](https://github.com/deepseek-ai/deepseek-harness/discussions/5121)
- [MyDSH 外掛市場](https://mydsh.dev/plugin?repo=yj-liuzepeng%2Fdsh-project-brain)
- [Issues](https://github.com/yj-liuzepeng/dsh-project-brain/issues)（bug 用 `bug_report.yml` 模板；feature 用 `feature_request.yml`；用法問題用 `question.yml` 或去 Discussions）

## 🛡 安全

發現安全問題請走 [GitHub Security Advisories](https://github.com/yj-liuzepeng/dsh-project-brain/security/advisories/new) 私密渠道，不要在 issue 公開。

---

構建者：[@yj-liuzepeng](https://github.com/yj-liuzepeng) · 授權：[MIT](./LICENSE)