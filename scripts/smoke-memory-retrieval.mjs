import assert from "node:assert/strict";
import { makeMemoryEntry } from "../src/host/store/brain-logic.js";
import { activeMemories, cosineSimilarity, retrieveMemories } from "../src/host/memory/retrieval.js";
import { ensureEmbeddingIndex, fetchEmbeddings } from "../src/host/memory/embeddings.js";
import { normalizeMemoryConfig, publicMemoryConfig } from "../src/host/memory/config.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("  PASS  " + name);
}

const now = Date.now();
const memories = [
  makeMemoryEntry({ id: "auth", type: "decision", title: "認證方案", content: "使用 JWT refresh token 完成登入認證", importance: 0.8 }, now),
  makeMemoryEntry({ id: "db", type: "architecture", title: "資料庫選型", content: "使用 PostgreSQL 儲存訂單", importance: 0.8 }, now),
  { ...makeMemoryEntry({ id: "old", type: "bug", title: "舊認證故障", content: "JWT 過期", importance: 1 }, now), status: "archived" },
];

check("Memory V2 預設欄位完整", () => {
  assert.equal(memories[0].schemaVersion, 2);
  assert.equal(memories[0].status, "active");
  assert.equal(memories[0].confidence, 0.7);
});
check("歸檔記憶不進入活躍集合", () => assert.deepEqual(activeMemories(memories).map((m) => m.id), ["auth", "db"]));
check("BM25 將認證記憶排在資料庫記憶前", () => {
  const hits = retrieveMemories({ memories, query: "JWT 登入認證", topK: 2 });
  assert.equal(hits[0].memory.id, "auth");
  assert.ok(hits[0].keywordScore > hits[1].keywordScore);
});
check("混合檢索使用向量相似度", () => {
  const hits = retrieveMemories({
    memories,
    query: "完全無關鍵詞",
    topK: 2,
    vectors: new Map([["auth", [1, 0]], ["db", [0, 1]]]),
    queryVector: [0, 1],
    config: { keywordWeight: 0, vectorWeight: 1, importanceWeight: 0, confidenceWeight: 0, recencyWeight: 0 },
  });
  assert.equal(hits[0].memory.id, "db");
});
check("餘弦相似度邊界正確", () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
});
check("預設配置無需向量服務", () => {
  const config = normalizeMemoryConfig({});
  assert.equal(config.vectorEnabled, false);
  assert.equal(publicMemoryConfig(config).configuredMode, "keyword");
});
check("顯式向量配置公開狀態不含憑據", () => {
  const status = publicMemoryConfig({ vectorEnabled: true, retrievalMode: "hybrid", embeddingBaseURL: "http://localhost:11434/v1", embeddingModel: "embed" });
  assert.equal(status.configuredMode, "hybrid");
  assert.equal(Object.hasOwn(status, "embeddingApiKeyEnv"), false);
});
const requests = [];
const vectors = await fetchEmbeddings({
  texts: ["a", "b"],
  config: normalizeMemoryConfig({ embeddingBaseURL: "http://example.test/v1", embeddingModel: "embed-test" }),
  apiKey: "secret",
  fetchImpl: async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] }) };
  },
});
check("相容 OpenAI embeddings endpoint", () => assert.equal(requests[0].url, "http://example.test/v1/embeddings"));
check("embedding 響應按 index 還原順序", () => assert.deepEqual(vectors, [[1, 0], [0, 1]]));
check("embedding 請求攜帶模型和 Bearer 憑據", () => {
  assert.equal(JSON.parse(requests[0].options.body).model, "embed-test");
  assert.equal(requests[0].options.headers.Authorization, "Bearer secret");
});

const files = new Map();
const memoryFs = {
  resolve: async (path) => path,
  readText: async (path) => {
    if (!files.has(path)) throw new Error("ENOENT");
    return files.get(path);
  },
  writeText: async (path, value) => { files.set(path, value); },
  mkdir: async () => {},
};
const indexState = await ensureEmbeddingIndex({
  fs: memoryFs,
  projectPath: "/project",
  memories,
  config: normalizeMemoryConfig({ vectorEnabled: true, embeddingBaseURL: "http://local/v1", embeddingModel: "local", embeddingApiKeyEnv: "" }),
  fetchImpl: async (_url, options) => ({
    ok: true,
    json: async () => ({ data: JSON.parse(options.body).input.map((_text, index) => ({ index, embedding: index === 0 ? [1, 0] : [0, 1] })) }),
  }),
});
check("增量索引只處理活躍記憶並寫派生快取", () => {
  assert.equal(indexState.indexed, 2);
  assert.equal(indexState.total, 2);
  assert.ok([...files.keys()].some((path) => path.endsWith("cache/embeddings.jsonl")));
});
const failedIndex = await ensureEmbeddingIndex({
  fs: { ...memoryFs, readText: async () => { throw new Error("ENOENT"); } },
  projectPath: "/failed",
  memories,
  config: normalizeMemoryConfig({ vectorEnabled: true, embeddingBaseURL: "http://bad/v1", embeddingModel: "bad", embeddingApiKeyEnv: "" }),
  fetchImpl: async () => ({ ok: false, status: 503, text: async () => "unavailable" }),
});
check("向量服務失敗返回診斷而不丟擲", () => {
  assert.equal(failedIndex.indexed, 0);
  assert.equal(failedIndex.error.code, "EMBEDDING_API_ERROR");
});

console.log("memory retrieval: " + passed + " assertions PASS");
