# dsh-project-brain v1.1.0 · 雙路召回 + RRF 融合

> **次要版本。** 在 v1.0.0 基礎上新增雙路召回 + Reciprocal Rank Fusion（RRF）融合策略。
> 與 `v1.0.0` 資料完全相容，工具 API 不變。
> 安裝: `dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.1.0`

## 🆕 v1.1.0 是什麼

v1.0.0 解決了 7 項 P0 釋出阻塞並通過 39 項驗收。v1.1.0 在此基礎上加入 **雙路召回 + RRF 融合** —— 當專案腦配置了 Embedding 服務後，記憶檢索會自動從"純關鍵詞 BM25"升級為"關鍵詞 + 向量"雙路融合，融合演算法是業界經典的 **Reciprocal Rank Fusion（k=60）**。

**為什麼是 RRF**

- 不依賴單一相關性分數（關鍵詞和向量的 score 量綱不同，不能直接相加）
- 雙路都命中的文件天然靠前（雙路高 rank = 雙路高分）
- 演算法簡單（10 行程式碼）、無需訓練、對引數 k 不敏感（k=60 是經典值）
- 與現有 5 因子加權完美協同：`diverseSelect` 在 RRF 模式下仍生效

**未啟用 Embedding 的使用者**

行為完全不變，仍是 5 因子加權關鍵詞檢索。RRF 是**可選升級路徑**。

## ✅ 升級路徑

```bash
# 舊（v1.0.0）
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.0.0

# 新（v1.1.0）
dsh plugin --profile web add github:yj-liuzepeng/dsh-project-brain#v1.1.0
```

升級後**完全退出 DSH Desktop 並重新開啟**。

**資料完全相容**：`.project-brain/` 所有 JSON / JSONL 與 `v1.0.0` 一致，無需遷移。

## 🌟 v1.1.0 新增能力

### Added

- **雙路召回 + RRF 融合**（核心）：`src/host/memory/retrieval.js` 在 `queryVector` 有效時自動啟用
- `scripts/smoke-retrieval-rrf.mjs`：15 項 RRF 斷言（rrfMerge 邊界 / 順序無關 / 單路缺失 / 加權退回 / diverseSelect / hit 相容）
- `scripts/embedding-smoke.mjs`：embedding 服務可達性 + 維度一致性
- `scripts/embedding-e2e.mjs`：embedding 端到端驗證

### Fixed

- `host-acceptance.mjs` AC-2a 工具數量硬編碼 14 → 16（雙向同步：本地 + 遠端都修了）

### Changed

- smoke suites：16 → 17（新增 RRF）
- acceptance：39 → 39（AC-2a 與 v1.0.0 一致）
- README / README.zh-CN / RELEASE_CHECKLIST / CHANGELOG 同步 v1.1.0

## 🛠 啟用雙路召回

在 DSH 外掛設定（或 `.project-brain/config.json`）中：

```yaml
retrieval:
  mode: hybrid              # keyword | hybrid
  embedding:
    baseURL: https://your-provider.example/v1
    model: your-embedding-model
    apiKeyEnv: PROJECT_BRAIN_EMBEDDING_API_KEY
```

啟動後第一次檢索會自動用 embedding service 生成 query 向量，第二次起快取。

## 🧪 驗證

```bash
git clone https://github.com/yj-liuzepeng/dsh-project-brain.git
cd dsh-project-brain
git checkout v1.1.0
npm install
npm test                          # 17 / 17 smoke suites
npm run test:acceptance           # 39 / 39 host-acceptance
npm run build                     # runtime-rpc 模式
npm run verify:release            # 14 / 14
npm run verify:install            # CLEAN_TARBALL_INSTALL_PASS
npm audit                         # 0 vulnerabilities
```

## 📚 文件

- [README](./README.md) · [README.zh-TW](./README.zh-TW.md)
- [CHANGELOG](./CHANGELOG.md) 頂部有 v1.1.0 / v1.0.0 完整 migration guide
- [DESIGN](./DESIGN.md) · [SPEC](./SPEC.md)
- [ACCEPTANCE](./ACCEPTANCE.md) · [USER_VERIFICATION](./USER_VERIFICATION.md)

## 💬 反饋

- [Discussions](https://github.com/yj-liuzepeng/dsh-project-brain/discussions) · [DSH 社群展示帖](https://github.com/deepseek-ai/deepseek-harness/discussions/5121)
- [MyDSH 外掛市場](https://mydsh.dev/plugin?repo=yj-liuzepeng%2Fdsh-project-brain)
- [Issues](https://github.com/yj-liuzepeng/dsh-project-brain/issues)（請用對應模板：bug / feature / question）

## 🛡 安全

安全問題請走 [GitHub Security Advisories](https://github.com/yj-liuzepeng/dsh-project-brain/security/advisories/new) 私密渠道。

---

構建者：[@yj-liuzepeng](https://github.com/yj-liuzepeng) · 授權：[MIT](./LICENSE)

## 與 v1.0.0 的差異（diff 概要）

```
src/host/memory/retrieval.js    | 144 ++++++++++++++++++++----
scripts/embedding-e2e.mjs       | 109 ++++++++++++++++
scripts/embedding-smoke.mjs     |  50 ++++++++
scripts/run-smoke.mjs           |   1 +
scripts/smoke-retrieval-rrf.mjs | 266 ++++++++++++++++++++++++++++++++++++++
scripts/host-acceptance.mjs     |   2 +- (AC-2a 14→16 雙向同步)
6 files changed, 543 insertions(+), 28 deletions(-)
```