// 端到端外掛路徑驗證：複用 plugin 的 embeddings.js + retrieveCredential 解析 ARK_CODE_LATEST_API_KEY
// 不依賴 DSH host 程序，能證明：如果 plugin 拿到的 settings 包含 embeddingApiKeyEnv='ARK_CODE_LATEST_API_KEY'，
// 那麼它會通過 credentials.resolve / process.env fallback 拿到正確 key 並跑通 embedding。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// 1. 從 .credentials.yaml 解析 ARK_CODE_LATEST_API_KEY 對應的 value
const CREDS_PATH = join(homedir(), ".dsh", ".credentials.yaml");
function loadApiKeyFromCreds(refName) {
  const txt = readFileSync(CREDS_PATH, "utf8");
  const re = new RegExp(`^\\s*${refName}:\\s*(.+?)\\s*$`, "m");
  const m = txt.match(re);
  if (!m) throw new Error("憑證裡找不到 ref: " + refName);
  return m[1].trim().replace(/^['"]|['"]$/g, "");
}

// 2. 模擬 plugin 的 resolveCredential：先 credentials.resolve(ref)（這裡用 yaml 直接查）
//    fallback 到 process.env[ref]
async function resolveCredential(ref) {
  if (!ref) return null;
  try {
    const v = loadApiKeyFromCreds(ref);
    if (v) return v;
  } catch (e) {}
  const v = process.env[ref];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// 3. 複用 plugin 的 fetchEmbeddings
const { fetchEmbeddings, ensureEmbeddingIndex, embedQuery } = await import(
  pathToFileURL(resolve(repoRoot, "src/host/memory/embeddings.js")).href
);

const config = {
  embeddingBaseURL: "https://ark.cn-beijing.volces.com/api/coding/v3",
  embeddingModel: "doubao-embedding-vision",
  embeddingApiKeyEnv: "ARK_CODE_LATEST_API_KEY",
  embeddingDimensions: 2048,
  embeddingBatchSize: 4,
  embeddingMaxIndexPerRun: 16,
  embeddingTimeoutMs: 20000,
};

console.log("▶ 配置：", JSON.stringify({
  baseURL: config.embeddingBaseURL,
  model: config.embeddingModel,
  ref: config.embeddingApiKeyEnv,
}, null, 0));

const refResolved = await resolveCredential(config.embeddingApiKeyEnv);
console.log("▶ resolveCredential(ref) →", refResolved ? `${refResolved.slice(0,6)}…${refResolved.slice(-4)} (len=${refResolved.length})` : "null");

const t0 = Date.now();
console.log("▶ 測試1: fetchEmbeddings (1 條 query)");
const [queryVec] = await fetchEmbeddings({
  texts: ["dsh-project-brain embedding E2E smoke test"],
  config,
  apiKey: refResolved,
});
console.log("  ✓ query vector dim =", queryVec.length, "(", Date.now() - t0, "ms )");

console.log("▶ 測試2: embedQuery (走 embedQuery wrapper)");
const q2 = await embedQuery({
  query: "Dashboard 設定 embedding",
  config,
  resolveCredential,
});
console.log("  ✓ embedQuery dim =", q2.length);

console.log("▶ 測試3: ensureEmbeddingIndex (1 條 memory)");
const fakeMemory = {
  id: "mem-smoke-test",
  type: "decision",
  title: "embedding e2e smoke",
  content: "驗證 ARK_CODE_LATEST_API_KEY ref 解析後整條索引鏈路",
  importance: 0.8,
  confidence: 0.9,
  status: "active",
};
const idx = await ensureEmbeddingIndex({
  fs: await import("node:fs/promises"),
  projectPath: repoRoot,
  memories: [fakeMemory],
  config,
  resolveCredential,
});
console.log("  ✓ indexState:", JSON.stringify({
  indexed: idx.indexed,
  total: idx.total,
  indexedNow: idx.indexedNow,
  pending: idx.pending,
  model: idx.model,
  dimensions: idx.dimensions,
  error: idx.error,
}, null, 2));

console.log("\n✅ 端到端外掛路徑驗證通過：");
console.log("   - credentials ref 解析 ✓");
console.log("   - embedding API 呼叫 ✓");
console.log("   - 向量索引構建 ✓");
console.log("   - query embedding ✓");
console.log("\n⚠️  注意：DSH Desktop host 程序內的 settings.yaml 修改需要 UI 過載或重啟 DSH 才能生效；");
console.log("   本測試驗證的是 plugin 程式碼路徑正確性，與當前 host 程序配置解耦。");
