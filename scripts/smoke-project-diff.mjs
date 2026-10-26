// smoke-project-diff.mjs - v0.4.2/v0.4.5 project_diff 工具驗證
//
// v0.4.2 關鍵變化：
//   - detector 重寫用 node 內建 fs + zlib 讀 .git（不依賴 DSH shell service）
//   - llm.js 重寫用 node:fetch 調 user-configured OpenAI 相容 API
//
// v0.4.4/v0.4.5 關鍵變化：
//   - fixture 改 deflateSync（zlib 格式，匹配真實 git）
//   - detector 移除"存在 pack 就整體拒絕"（diff 只比 hash 不讀 blob，commit/tree 在 loose 即可工作）
//
// 覆蓋：
//   1) buildDiffPrompt 構造（含檔案列表 / commit / stat / 中文指引）
//   2-4) detectChanges 真實 git 倉庫 fixture（add/modify/delete 檔案 + commit 鏈）
//   5) detectChanges 不是 git 倉庫 → error
//   6) detectChanges 有 .pack 但 commit/tree 在 loose → 仍能 diff（v0.4.5）
//   7) detectChanges detached HEAD
//   8) parseLLMArchitectureResponse JSON 解析
//   9) parseLLMArchitectureResponse 非 JSON 降級
//   10-11) callLLMWithFallback mock fallback（無 apiUrl/apiKey / fetch 失敗）
//   12) realFetchLLM 路徑（mock fetch API）
//   13) buildDiffPrompt maxChars 截斷
//   14) since 含危險字元過濾
//   15) detectChanges since=10 大數（commit 鏈不足時取全部）
//
// 退出碼：0 = PASS，1 = FAIL

import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

let pass = 0;
let fail = 0;
const check = (name, ok, extra) => {
  if (ok) { console.log(`  [PASS] ${name}`); pass++; }
  else { console.log(`  [FAIL] ${name}${extra ? "  -> " + extra : ""}`); fail++; }
};

// ─── 工具函式：寫 loose git object ───
function hashBytes(bytes) {
  return createHash("sha1").update(bytes).digest("hex");
}

// 構造 git object bytes（"type size\0content"）
function makeGitObject(type, content) {
  const header = Buffer.from(`${type} ${content.length}\0`, "binary");
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  return Buffer.concat([header, body]);
}

// 寫 loose object 到 .git/objects/aa/bbcc...
// ⚠️ v0.4.3 修復：真實 git 用 zlib deflate（帶 zlib header，首位元組 0x78），必須用 deflateSync。
//    v0.4.2 誤用 deflateRawSync（raw deflate 無 header）→ fixture 不符合真實 git 格式，
//    detector 也誤用 inflateRawSync → 測試假陽性 PASS，但真實 git 倉庫讀不了 commit。
function writeLooseObject(gitDir, type, content) {
  const obj = makeGitObject(type, content);
  const hash = hashBytes(obj);
  const dir = join(gitDir, "objects", hash.slice(0, 2));
  const path = join(dir, hash.slice(2));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, deflateSync(obj));
  return hash;
}

// 構造 tree object（root tree only）
function makeTree(entries) {
  // entries: [{mode, name, hash}]
  // 格式：<mode> <name>\0<20-byte-binary-hash>
  const parts = [];
  // tree entries 按 binary name 排序
  entries.sort((a, b) => {
    const ab = Buffer.from(a.name, "binary");
    const bb = Buffer.from(b.name, "binary");
    return ab < bb ? -1 : ab > bb ? 1 : 0;
  });
  for (const e of entries) {
    parts.push(Buffer.from(`${e.mode} ${e.name}\0`, "binary"));
    parts.push(Buffer.from(e.hash, "hex"));
  }
  return Buffer.concat(parts);
}

// 構造 commit object
function makeCommit({ tree, parents = [], author = "test <test@test>", message = "test" }) {
  const lines = [];
  lines.push(`tree ${tree}`);
  for (const p of parents) lines.push(`parent ${p}`);
  lines.push(`author ${author}`);
  lines.push(`committer ${author}`);
  lines.push("");
  lines.push(message);
  return lines.join("\n");
}

// 初始化 bare git 倉庫（直接寫 loose object，不調 git 命令）
function initTestRepo({ withPack = false } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), "dsh-pb-git-"));
  const gitDir = join(tmp, ".git");
  mkdirSync(join(gitDir, "objects"), { recursive: true });
  mkdirSync(join(gitDir, "refs", "heads"), { recursive: true });

  // 1) blob: README.md
  const blobHash1 = writeLooseObject(gitDir, "blob", "hello world\n");

  // 2) tree: README.md
  const treeHash1 = writeLooseObject(gitDir, "tree", makeTree([
    { mode: "100644", name: "README.md", hash: blobHash1 },
  ]));

  // 3) commit 1: initial
  const commitHash1 = writeLooseObject(gitDir, "commit", makeCommit({ tree: treeHash1, message: "initial" }));

  // 4) blob 2: src/index.js（new file）
  const blobHash2 = writeLooseObject(gitDir, "blob", "console.log('v1');\n");

  // 5) tree 2: README.md + src/index.js
  const treeHash2 = writeLooseObject(gitDir, "tree", makeTree([
    { mode: "100644", name: "README.md", hash: blobHash1 },
    { mode: "100644", name: "src/index.js", hash: blobHash2 },
  ]));

  // 6) commit 2: add src/index.js
  const commitHash2 = writeLooseObject(gitDir, "commit", makeCommit({
    tree: treeHash2,
    parents: [commitHash1],
    message: "add src/index.js",
  }));

  // 7) blob 3: README.md（modified content）
  const blobHash3 = writeLooseObject(gitDir, "blob", "hello world (updated)\n");

  // 8) tree 3: README.md (modified) + src/index.js
  const treeHash3 = writeLooseObject(gitDir, "tree", makeTree([
    { mode: "100644", name: "README.md", hash: blobHash3 },
    { mode: "100644", name: "src/index.js", hash: blobHash2 },
  ]));

  // 9) commit 3: update README.md
  const commitHash3 = writeLooseObject(gitDir, "commit", makeCommit({
    tree: treeHash3,
    parents: [commitHash2],
    message: "update README.md",
  }));

  // 寫 refs/heads/main → commit 3
  writeFileSync(join(gitDir, "refs", "heads", "main"), commitHash3 + "\n");

  // 寫 HEAD → ref: refs/heads/main
  writeFileSync(join(gitDir, "HEAD"), "ref: refs/heads/main\n");

  // 可選：寫 pack 檔案（觸發 pack fallback 測試）
  if (withPack) {
    mkdirSync(join(gitDir, "objects", "pack"), { recursive: true });
    writeFileSync(join(gitDir, "objects", "pack", "fake.pack"), "");
    writeFileSync(join(gitDir, "objects", "pack", "fake.idx"), "");
  }

  return { tmp, gitDir, commits: [commitHash1, commitHash2, commitHash3] };
}

console.log("=== 1) buildDiffPrompt 構造 ===");
const { buildDiffPrompt, detectChanges } = await import("../src/host/diff/detector.js");
const prompt = buildDiffPrompt({
  changes: {
    changes: [
      { path: "src/auth/login.ts", type: "modified" },
      { path: "src/auth/oauth.ts", type: "added" },
    ],
    files: ["src/auth/login.ts", "src/auth/oauth.ts"],
    commits: ["abc123 feat: add oauth", "def456 refactor: split auth"],
    stat: " src/auth/login.ts | 10 +-",
    since: "commit+1",
  },
  projectPath: "/tmp/test-project",
  maxChars: 5000,
});
check("prompt 含專案路徑", prompt.includes("/tmp/test-project"));
check("prompt 含檔案列表", prompt.includes("src/auth/login.ts") && prompt.includes("src/auth/oauth.ts"));
check("prompt 含 commit 列表", prompt.includes("abc123 feat: add oauth"));
check("prompt 含變更統計", prompt.includes("src/auth/login.ts | 10 +-"));
check("prompt 含 since", prompt.includes("since=commit+1"));
check("prompt 含中文架構指引", prompt.includes("架構") && prompt.includes("JSON"));

console.log("\n=== 2-4) detectChanges 真實 git 倉庫 fixture ===");
const repo = initTestRepo();

// 2) compare HEAD vs HEAD~1（commit 3 vs commit 2）→ 應有 modified README.md
const r2 = await detectChanges({ projectPath: repo.tmp, since: "1" });
check("HEAD vs HEAD~1 → files 含 README.md", r2.files.includes("README.md"));
check("HEAD vs HEAD~1 → 不應含 src/index.js（無變化）", !r2.files.includes("src/index.js"));
check("HEAD vs HEAD~1 → changes 含 modified 型別", r2.changes && r2.changes.some((c) => c.path === "README.md" && c.type === "modified"));
check("HEAD vs HEAD~1 → 1 個 commit", r2.commits.length === 1);

// 3) compare HEAD vs HEAD~2（commit 3 vs commit 1）→ 應有 modified + added
const r3 = await detectChanges({ projectPath: repo.tmp, since: "2" });
check("HEAD vs HEAD~2 → files 含 README.md + src/index.js", r3.files.includes("README.md") && r3.files.includes("src/index.js"));
check("HEAD vs HEAD~2 → changes 含 added src/index.js", r3.changes && r3.changes.some((c) => c.path === "src/index.js" && c.type === "added"));
check("HEAD vs HEAD~2 → 2 個 commit", r3.commits.length === 2);

console.log("\n=== 5) detectChanges 不是 git 倉庫 → error ===");
const r5 = await detectChanges({ projectPath: "/tmp" + Date.now() });
check("無 .git → error", !!r5.error);
check("無 .git → files 空", r5.files.length === 0);

console.log("\n=== 6) detectChanges 有 .pack 但 commit/tree 在 loose → 仍能 diff（v0.4.5）===");
const repoPack = initTestRepo({ withPack: true });
const r6 = await detectChanges({ projectPath: repoPack.tmp, since: "1" });
check("有 .pack → 不因 pack 整體拒絕", !r6.error || !r6.error.includes("pack"));
check("有 .pack → 仍能 diff 出 README.md", r6.files.includes("README.md"));
check("有 .pack → files 非空", r6.files.length > 0);
rmSync(repoPack.tmp, { recursive: true, force: true });

console.log("\n=== 6.5) detectChanges packed-refs（loose ref 不存在，commit 在 loose）—— v0.4.6 ===");
const repoPackedRefs = initTestRepo();
// 把 loose refs 移到 packed-refs（模擬 git gc 後的狀態）
const prPath = join(repoPackedRefs.tmp, ".git", "packed-refs");
const headCommit = repoPackedRefs.commits[2];  // 最新 commit
const packedContent = "# pack-refs with: peeled fully-peeled sorted\n" + headCommit + " refs/heads/main\n";
writeFileSync(prPath, packedContent);
rmSync(join(repoPackedRefs.tmp, ".git", "refs", "heads", "main"));
const r6b = await detectChanges({ projectPath: repoPackedRefs.tmp, since: "1" });
check("packed-refs → 不因 ref 找不到整體拒絕", !r6b.error || !r6b.error.includes("HEAD"));
check("packed-refs → 仍能 diff 出 README.md", r6b.files.includes("README.md"));
rmSync(repoPackedRefs.tmp, { recursive: true, force: true });

console.log("\n=== 7) detectChanges detached HEAD（HEAD 直接是 hash）===");
const repo2 = mkdtempSync(join(tmpdir(), "dsh-pb-detached-"));
mkdirSync(join(repo2, ".git", "objects", "ff"), { recursive: true });
// 寫 blob + tree + commit
const bH = writeLooseObject(join(repo2, ".git"), "blob", "detached test\n");
const tH = writeLooseObject(join(repo2, ".git"), "tree", makeTree([{ mode: "100644", name: "test.txt", hash: bH }]));
const cH = writeLooseObject(join(repo2, ".git"), "commit", makeCommit({ tree: tH, message: "detached" }));
writeFileSync(join(repo2, ".git", "HEAD"), cH + "\n");
const r7 = await detectChanges({ projectPath: repo2, since: "1" });
// detached HEAD 沒有 parent → 走 0 步 parent 鏈 → parentHash 仍等於 head.commit
// 行為：parentFiles={}，curFiles={test.txt} → test.txt 報為 added（與 git diff 行為一致）
check("detached HEAD → 1 commit", r7.commits.length === 1);
check("detached HEAD → 1 檔案 added（無 parent 對比時當前所有檔案）", r7.files.length === 1 && r7.changes[0].type === "added");
rmSync(repo2, { recursive: true, force: true });

console.log("\n=== 8) parseLLMArchitectureResponse JSON ===");
const { callLLMWithFallback, parseLLMArchitectureResponse } = await import("../src/host/integrations/llm.js");
const jsonText = JSON.stringify({
  changes: [{ file: "src/auth.ts", type: "modified", summary: "OAuth2 遷移" }],
  architectureMemory: {
    title: "OAuth2 遷移",
    content: "auth.ts 重構為 OAuth2 接入。",
  },
});
const parsed1 = parseLLMArchitectureResponse(jsonText);
check("JSON 解析 → architectureMemory.title 正確", parsed1.architectureMemory.title === "OAuth2 遷移");
check("JSON 解析 → changes 陣列長度", parsed1.changes.length === 1);

console.log("\n=== 9) parseLLMArchitectureResponse 非 JSON 降級 ===");
const parsed2 = parseLLMArchitectureResponse("這是非結構化文本");
check("非 JSON → 包成 fallback title", parsed2.architectureMemory.title === "架構變更（未結構化）");
check("非 JSON → content 截斷 1000 字", parsed2.architectureMemory.content.length <= 1000);

console.log("\n=== 10) callLLMWithFallback 無 apiUrl/apiKey → mock ===");
const r10 = await callLLMWithFallback({ prompt: "test prompt" });
check("無配置 → mock 輸出", r10.length > 0);
check("mock 輸出含 changes", r10.includes("changes"));
check("mock 輸出含 [MOCK_LLM] 警告", r10.includes("MOCK_LLM"));

console.log("\n=== 11) callLLMWithFallback fetch 失敗 → mock fallback ===");
// mock fetch 全域性
const origFetch = globalThis.fetch;
let fetchCalled = 0;
globalThis.fetch = async () => {
  fetchCalled++;
  return { ok: false, status: 401, text: async () => "Unauthorized" };
};
const r11 = await callLLMWithFallback({
  prompt: "test",
  apiUrl: "https://api.example.com/v1",
  apiKey: "fake-key",
});
check("fetch 401 → 降級到 mock", fetchCalled === 1 && r11.includes("MOCK_LLM"));
globalThis.fetch = origFetch;

console.log("\n=== 12) realFetchLLM 路徑（mock fetch OK）===");
let realFetchCalled = 0;
globalThis.fetch = async (url, opts) => {
  realFetchCalled++;
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: '{"architectureMemory":{"title":"LLM 真實回答","content":"test"},"changes":[]}' } }] }),
  };
};
const r12 = await callLLMWithFallback({
  prompt: "test",
  apiUrl: "https://api.example.com/v1",
  apiKey: "test-key",
  model: "test-model",
});
check("fetch OK → 調了 1 次", realFetchCalled === 1);
check("real 路徑 → architectureMemory.title 是 LLM 真實回答", r12.includes("LLM 真實回答"));
globalThis.fetch = origFetch;

console.log("\n=== 12.5) realFetchLLM Anthropic 協議（baseUrl 含 anthropic → POST /v1/messages）—— v0.4.7 ===");
let anthropicUrl = "";
let anthropicHeaders = {};
let anthropicBody = {};
globalThis.fetch = async (url, opts) => {
  anthropicUrl = url;
  anthropicHeaders = opts.headers;
  anthropicBody = JSON.parse(opts.body);
  return {
    ok: true,
    status: 200,
    json: async () => ({
      id: "msg_123",
      type: "message",
      role: "assistant",
      model: "MiniMax-M3",
      content: [{ type: "text", text: '{"architectureMemory":{"title":"Anthropic LLM 回答","content":"v0.4.7 test"},"changes":[]}' }],
    }),
  };
};
const r12b = await callLLMWithFallback({
  prompt: "test",
  apiUrl: "https://api.minimaxi.com/anthropic",
  apiKey: "test-key",
  model: "MiniMax-M3",
});
check("Anthropic 路徑用 /v1/messages", anthropicUrl === "https://api.minimaxi.com/anthropic/v1/messages");
check("Anthropic header 用 x-api-key", anthropicHeaders["x-api-key"] === "test-key");
check("Anthropic header 含 anthropic-version", !!anthropicHeaders["anthropic-version"]);
check("Anthropic body.model = MiniMax-M3", anthropicBody.model === "MiniMax-M3");
check("Anthropic 真實路徑 → 拿到 Anthropic LLM 回答", r12b.includes("Anthropic LLM 回答"));
globalThis.fetch = origFetch;

console.log("\n=== 12.6) detectProtocol 自動選擇協議 —— v0.4.7 ===");
import { detectProtocol } from "../src/host/integrations/llm.js";
check("baseUrl 含 anthropic → anthropic 協議", detectProtocol("https://api.minimaxi.com/anthropic") === "anthropic");
check("baseUrl 含 /anthropic 路徑 → anthropic 協議", detectProtocol("https://api.example.com/anthropic/v1") === "anthropic");
check("普通 baseUrl → openai 協議", detectProtocol("https://api.example.com/v1") === "openai");
check("api.deepseek.com → openai 協議", detectProtocol("https://api.deepseek.com") === "openai");
check("空 url → 預設 openai 協議", detectProtocol("") === "openai");

console.log("\n=== 13) buildDiffPrompt maxChars 截斷 ===");
const longPrompt = buildDiffPrompt({
  changes: {
    changes: Array.from({ length: 200 }, (_, i) => ({ path: `src/file_${i}.ts`, type: "added" })),
    files: Array.from({ length: 200 }, (_, i) => `src/file_${i}.ts`),
    commits: Array.from({ length: 100 }, (_, i) => `commit_${i}: change`),
    stat: "x".repeat(2000),
    since: "24 hours ago",
  },
  projectPath: "/tmp/test",
  maxChars: 2000,
});
check("maxChars=2000 → 輸出 <= 2000", longPrompt.length <= 2000);
check("截斷後仍含核心欄位", longPrompt.includes("JSON") || longPrompt.includes("架構"));

console.log("\n=== 14) since 含危險字元過濾 ===");
const r14 = await detectChanges({ projectPath: repo.tmp, since: '`echo evil`; rm -rf /' });
check("since 反引號被過濾", r14.since.indexOf("`") < 0);
check("since 分號被過濾", r14.since.indexOf(";") < 0);
check("since 美元符被過濾", r14.since.indexOf("$") < 0);
check("since 截斷到 80 字元內", r14.since.length <= 80);

console.log("\n=== 15) detectChanges since=10 大數（commit 鏈不足時取全部）===");
const r15 = await detectChanges({ projectPath: repo.tmp, since: "10" });
check("since=10 但只有 3 commit → 仍能跑", !r15.error);
// 3 commit：c1 c2 c3（c3 = HEAD）。since=10 走 10 步 parent 鏈但只到 c1（c1 無 parents 自然停）
// commits 陣列含 [HEAD=c3, c2, c1] 共 3 個
check("since=10 → commit 鏈 = 3（HEAD + 2 個 parent，到 c1 自然停）", r15.commits.length === 3);

console.log(`\n${pass} PASS / ${fail} FAIL`);
rmSync(repo.tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
