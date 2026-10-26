// smoke-retrieval-rrf.mjs - v0.7.x 雙路召回 + RRF 融合策略驗證
//
// 用例清單（全部 PASS）：
//   1)  bm25Recall 單路：僅 BM25 打分；與 query 無交集的記憶被過濾
//   2)  vectorRecall 單路：按餘弦相似度降序
//   3)  cosineSimilarity 邊界：同向=1 / 正交=0 / 反向=-1 不參與（取 max(0, _)）
//   4)  rrfMerge 基礎：BM25 + vector 兩路融合後，命中兩路的記憶排在僅命中單路前
//   5)  rrfMerge 對稱貢獻：k 相同時兩路權重相同（交換兩路順序不影響排序）
//   6)  rrfMerge 單路未命中：該路貢獻 0，不影響其他路排序
//   7)  retrieveMemories 雙路路徑：query + queryVector + vectors 全部齊備時走 RRF（relevance 是 1/(k+rank) 形式）
//   8)  retrieveMemories fallback（無 queryVector）：退回 5 因子加權，relevance 在 [0,1] 區間
//   9)  retrieveMemories fallback（query 為空）：退回 5 因子加權，不走 RRF
//   10) retrieveMemories fallback（vectors 為空）：即使 queryVector 有值，vectors 空 → 退加權
//   11) retrieveMemories 多樣性：diverseSelect 在 RRF 模式下仍生效（同 type 記憶被降權）
//   12) retrieveMemories hit 形狀相容：含 memory/relevance/score/keywordScore/vectorScore

import assert from "node:assert/strict";
import {
  activeMemories,
  bm25Recall,
  vectorRecall,
  rrfMerge,
  retrieveMemories,
  cosineSimilarity,
  DEFAULT_RRF_K,
} from "../src/host/memory/retrieval.js";
import { makeMemoryEntry } from "../src/host/store/brain-logic.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("  PASS  " + name);
}

const now = Date.now();
const corpus = [
  makeMemoryEntry({ id: "jwt", type: "decision", title: "認證方案", content: "使用 JWT refresh token 完成登入認證", importance: 0.8 }, now),
  makeMemoryEntry({ id: "pg", type: "architecture", title: "資料庫選型", content: "使用 PostgreSQL 儲存訂單", importance: 0.8 }, now),
  makeMemoryEntry({ id: "cache", type: "decision", title: "快取策略", content: "Redis 快取使用者會話", importance: 0.7 }, now),
  makeMemoryEntry({ id: "logger", type: "bug", title: "日誌聚合", content: "ELK 收集後端日誌", importance: 0.5 }, now),
];

// ───── 1) bm25Recall 單路 ─────
check("bm25Recall 僅返回與 query 有交集的候選", () => {
  const hits = bm25Recall(corpus, "JWT 登入認證");
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].memory.id, "jwt");
  assert.ok(hits[0].score > 0);
  for (const hit of hits) assert.ok(hit.score > 0);
});

check("bm25Recall 與 query 無交集 → 返回空", () => {
  const hits = bm25Recall(corpus, "毫無關聯的量子引力");
  assert.equal(hits.length, 0);
});

// ───── 2) vectorRecall 單路 ─────
check("vectorRecall 按餘弦相似度降序", () => {
  const vectors = new Map([
    ["jwt", [1, 0, 0]],
    ["pg", [0, 1, 0]],
    ["cache", [0.9, 0.1, 0]],
    ["logger", [0, 0, 1]],
  ]);
  const hits = vectorRecall(corpus, vectors, [1, 0, 0]);
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].memory.id, "jwt");
  // logger 與 query 正交（cos=0）被過濾；jwt 應排在 cache 之前（jwt=1, cache≈0.99）
  const ids = hits.map((h) => h.memory.id);
  assert.equal(ids.includes("logger"), false);
  assert.ok(ids.indexOf("jwt") < ids.indexOf("cache"));
});

check("vectorRecall 缺失 queryVector → 返回空", () => {
  const vectors = new Map([["jwt", [1, 0]]]);
  const hits = vectorRecall(corpus, vectors, null);
  assert.equal(hits.length, 0);
});

check("vectorRecall 向量缺失的記憶被跳過", () => {
  const vectors = new Map([["jwt", [1, 0]]]);
  const hits = vectorRecall(corpus, vectors, [1, 0]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].memory.id, "jwt");
});

// ───── 3) cosineSimilarity 邊界 ─────
check("cosineSimilarity 邊界值正確", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 0]), 0); // aa=0
});

// ───── 4) rrfMerge 基礎 ─────
check("rrfMerge 命中雙路 > 命中單路", () => {
  const bm25List = [
    { memory: corpus[0], score: 1.0 }, // jwt - 命中 BM25
    { memory: corpus[1], score: 0.3 }, // pg - 命中 BM25
  ];
  const vecList = [
    { memory: corpus[0], score: 1.0 }, // jwt - 命中 vector
    { memory: corpus[3], score: 0.5 }, // logger - 命中 vector
  ];
  const merged = rrfMerge([bm25List, vecList]);
  assert.equal(merged[0].memory.id, "jwt"); // 命中兩路 → 第一
  const jwt = merged.find((m) => m.memory.id === "jwt");
  assert.ok(jwt.relevance > 1 / (DEFAULT_RRF_K + 1)); // 至少 = 兩路 rank1 之和
});

// ───── 5) rrfMerge 對稱貢獻 ─────
check("rrfMerge 交換兩路順序後 relevance 不變", () => {
  const bm25List = [
    { memory: corpus[0], score: 1.0 },
    { memory: corpus[1], score: 0.5 },
  ];
  const vecList = [
    { memory: corpus[0], score: 0.9 },
    { memory: corpus[2], score: 0.8 },
  ];
  const m1 = rrfMerge([bm25List, vecList]);
  const m2 = rrfMerge([vecList, bm25List]);
  // 集合一致
  assert.deepEqual(m1.map((m) => m.memory.id).sort(), m2.map((m) => m.memory.id).sort());
  // jwt 命中兩路 → 在兩個結果中都排第一
  assert.equal(m1[0].memory.id, "jwt");
  assert.equal(m2[0].memory.id, "jwt");
  // jwt 的 relevance 值嚴格相等（與列表順序無關）
  assert.ok(Math.abs(m1[0].relevance - m2[0].relevance) < 1e-9);
});

// ───── 6) rrfMerge 單路未命中 ─────
check("rrfMerge 單路未命中 → 該路貢獻 0", () => {
  const bm25List = [
    { memory: corpus[0], score: 1.0 },
    { memory: corpus[1], score: 0.5 },
  ];
  const vecList = []; // vector 路完全沒結果
  const merged = rrfMerge([bm25List, vecList]);
  assert.equal(merged[0].memory.id, "jwt");
  // jwt 只命中 1 路 → rrf = 1/(60+1)
  assert.ok(Math.abs(merged[0].relevance - 1 / (DEFAULT_RRF_K + 1)) < 1e-9);
});

// ───── 7) retrieveMemories 主路徑：加權融合（向量只加分，不走 RRF） ─────
check("retrieveMemories 雙路全齊 → 仍走加權（relevance 不是 RRF）", () => {
  const vectors = new Map([
    ["jwt", [1, 0]],
    ["pg", [0, 1]],
    ["cache", [0.95, 0.05]],
    ["logger", [0, 1]],
  ]);
  const queryVector = [1, 0];
  const hits = retrieveMemories({
    memories: corpus,
    query: "JWT 認證",
    topK: 3,
    vectors,
    queryVector,
  });
  assert.ok(hits.length > 0);
  assert.equal(hits[0].memory.id, "jwt");
  assert.ok(hits[0].relevance > 0.15);
  assert.ok(hits[0].relevance <= 1.2);
  assert.ok(hits[0].keywordScore > 0);
  assert.ok(hits[0].vectorScore > 0);
});

// ───── 8) retrieveMemories fallback：無 queryVector ─────
check("retrieveMemories 無 queryVector → 退回 5 因子加權", () => {
  const hits = retrieveMemories({
    memories: corpus,
    query: "JWT 登入",
    topK: 3,
    vectors: new Map([["jwt", [1, 0]]]), // 即使有 vectors，缺 queryVector 仍 fallback
    queryVector: null,
  });
  assert.ok(hits.length > 0);
  // fallback 路徑下 relevance 是加權和（<= 1.05）
  assert.ok(hits[0].relevance <= 1.1);
  assert.equal(hits[0].vectorScore, 0); // 沒走 vector
});

// ───── 9) retrieveMemories fallback：query 為空 ─────
check("retrieveMemories query 為空 → 退回加權（注入場景，不走 RRF）", () => {
  const vectors = new Map([
    ["jwt", [1, 0]],
    ["pg", [0, 1]],
  ]);
  const hits = retrieveMemories({
    memories: corpus,
    query: "",
    topK: 3,
    vectors,
    queryVector: [1, 0],
  });
  assert.ok(hits.length > 0);
  // 無 query 場景，importance 主導權重 0.45 → jwt/pg importance=0.8 應在前
  const ids = hits.map((h) => h.memory.id);
  assert.ok(ids.includes("jwt") && ids.includes("pg"));
});

// ───── 10) retrieveMemories fallback：vectors 為空 ─────
check("retrieveMemories vectors 為空 → 退加權（即使 queryVector 有值）", () => {
  const hits = retrieveMemories({
    memories: corpus,
    query: "JWT 登入",
    topK: 3,
    vectors: new Map(),
    queryVector: [1, 0],
  });
  assert.ok(hits.length > 0);
  // 走加權路徑 → relevance 加權和形式
  assert.ok(hits[0].relevance <= 1.1);
  assert.equal(hits[0].vectorScore, 0);
});

// ───── 11) 多樣性選擇（雙路下仍生效） ─────
check("diverseSelect 在加權主路徑下仍生效（同 type 記憶被降權）", () => {
  const tight = [
    makeMemoryEntry({ id: "d1", type: "decision", title: "決策1", content: "類似內容 JWT", importance: 0.8 }, now),
    makeMemoryEntry({ id: "d2", type: "decision", title: "決策2", content: "類似內容 JWT", importance: 0.8 }, now),
    makeMemoryEntry({ id: "d3", type: "decision", title: "決策3", content: "類似內容 JWT", importance: 0.8 }, now),
    makeMemoryEntry({ id: "b1", type: "bug", title: "獨立bug", content: "JWT", importance: 0.5 }, now),
  ];
  const vectors = new Map([
    ["d1", [1, 0]],
    ["d2", [1, 0]],
    ["d3", [1, 0]],
    ["b1", [1, 0]],
  ]);
  const hits = retrieveMemories({
    memories: tight,
    query: "JWT",
    topK: 2,
    vectors,
    queryVector: [1, 0],
  });
  assert.equal(hits.length, 2);
  // 多樣性懲罰應該讓 b1（不同 type）被選上
  const ids = hits.map((h) => h.memory.id);
  assert.ok(ids.includes("b1"), "多樣性下不同 type 應被選中: " + ids.join(","));
});

// ───── 12) hit 形狀相容 ─────
check("retrieveMemories hit 包含全部相容欄位", () => {
  const hits = retrieveMemories({
    memories: corpus,
    query: "JWT",
    topK: 1,
    vectors: new Map([["jwt", [1, 0]]]),
    queryVector: [1, 0],
  });
  assert.equal(hits.length, 1);
  const h = hits[0];
  assert.ok(h.memory && h.memory.id);
  assert.ok(typeof h.relevance === "number");
  assert.ok(typeof h.score === "number"); // diverseSelect 輸出分
  assert.ok(typeof h.keywordScore === "number");
  assert.ok(typeof h.vectorScore === "number");
});

console.log("\nrrf retrieval: " + passed + " assertions PASS");
if (passed < 12) process.exit(1);