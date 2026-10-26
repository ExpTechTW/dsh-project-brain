// git/history.js - 專案 git 歷史讀取（純 node，不依賴 shell）
//
// 複用 detector.js 的底層 git object 讀取能力（loose + pack），提供高層 API：
//   - isGitRepo(projectPath): bool
//   - getGitHistory({ projectPath, limit, branch, maxCommits }): { available, currentBranch, head, total, commits, error }
//   - getGitBranches(projectPath): { branches, currentBranch }
//   - getWorkTreeChanges({ projectPath, maxFiles }): HEAD tree vs 工作樹對比
//     → untracked / deleted 檔案列表（不依賴 git binary）
//
// 限制：
//   - 多 parent commit 預設走 first-parent（與 git log --first-parent 一致）
//   - merge commit 的額外 parent 標記在 extraParents 欄位
//   - 提交時間用 authorTimestamp（unix seconds → ISO）
//   - 工作樹 vs HEAD 只產出 untracked + deleted；modified 檢測需要 hash 工作樹檔案（IO 大）暫不做

import { join, relative, sep } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readGitObject, readHead, readCommitFull, parseTree, collectTreeFiles } from "../diff/detector.js";

// 計算兩個 commit 之間的 file-level 變化（基於 tree object diff）
// 返回 { files: [path], totalFiles, added, modified, removed, truncated }
// 限制：files 最多返回前 MAX_FILES 個檔案路徑（避免響應體過大）
const MAX_FILES = 8;
function diffCommitTrees(gitDir, currentTreeHash, parentTreeHash) {
  const currentFiles = collectTreeFiles(gitDir, currentTreeHash);
  const parentFiles = parentTreeHash ? collectTreeFiles(gitDir, parentTreeHash) : {};
  const allPaths = new Set([...Object.keys(currentFiles), ...Object.keys(parentFiles)]);
  const added = [];
  const modified = [];
  const removed = [];
  const files = [];
  for (const path of allPaths) {
    const cur = currentFiles[path];
    const par = parentFiles[path];
    if (par === undefined) {
      added.push(path);
      files.push(path);
    } else if (cur === undefined) {
      removed.push(path);
      files.push(path);
    } else if (cur !== par) {
      modified.push(path);
      files.push(path);
    }
  }
  return {
    files: files.slice(0, MAX_FILES),
    totalFiles: files.length,
    added: added.length,
    modified: modified.length,
    removed: removed.length,
    truncated: files.length > MAX_FILES,
  };
}

const GIT_DIR_NAMES = [".git"];

function findGitDir(projectPath) {
  if (!projectPath) return null;
  for (const name of GIT_DIR_NAMES) {
    const candidate = join(projectPath, name);
    if (existsSync(candidate)) {
      try {
        if (existsSync(join(candidate, "HEAD"))) return candidate;
      } catch (e) {}
    }
  }
  return null;
}

export function isGitRepo(projectPath) {
  return Boolean(findGitDir(projectPath));
}

// 讀 refs/heads/* 分支列表
function readHeadsBranches(gitDir) {
  const out = [];
  const headsDir = join(gitDir, "refs", "heads");
  if (!existsSync(headsDir)) return out;
  const walk = (dir, prefix) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, prefix + entry.name + "/");
      } else if (entry.isFile()) {
        try {
          const hash = readFileSync(full, "utf8").trim();
          if (/^[0-9a-f]{40}$/i.test(hash)) {
            out.push({ name: prefix + entry.name, commit: hash.toLowerCase() });
          }
        } catch (e) {}
      }
    }
  };
  walk(headsDir, "");
  return out;
}

// 從 packed-refs 讀分支
function readPackedBranches(gitDir) {
  const out = [];
  const path = join(gitDir, "packed-refs");
  if (!existsSync(path)) return out;
  try {
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (line.startsWith("#") || !line.trim()) continue;
      const m = line.match(/^([0-9a-f]{40})\s+refs\/heads\/(.+)$/);
      if (m) out.push({ name: m[2], commit: m[1].toLowerCase() });
    }
  } catch (e) {}
  return out;
}

export function getGitBranches(projectPath) {
  const gitDir = findGitDir(projectPath);
  if (!gitDir) return { available: false, branches: [], currentBranch: null };
  const head = readHead(gitDir);
  const fromLoose = readHeadsBranches(gitDir);
  const fromPacked = readPackedBranches(gitDir);
  // 合併（loose 優先於 packed-refs）
  const map = new Map();
  for (const b of fromPacked) map.set(b.name, b);
  for (const b of fromLoose) map.set(b.name, b);
  const branches = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  return {
    available: true,
    currentBranch: (head && head.branch) || null,
    branches,
  };
}

// 走 commit chain（first-parent）取最近 N 個 commit
// 如果 commit 缺失（pack 不支援），跳過並繼續
export function getGitHistory({ projectPath, limit = 50, branch = null } = {}) {
  const gitDir = findGitDir(projectPath);
  if (!gitDir) return { available: false, error: "not a git repository", commits: [] };
  const head = readHead(gitDir);
  if (!head || !head.commit) return { available: false, error: "no HEAD commit", commits: [] };

  const commits = [];
  const visited = new Set();
  const max = Math.max(1, Math.min(500, Number(limit) || 50));
  let current = head.commit.toLowerCase();
  let truncated = false;

  while (current && !visited.has(current) && commits.length < max) {
    visited.add(current);
    const c = readCommitFull(gitDir, current);
    if (!c) {
      // commit object 讀不到（pack 解析限制） → 停止遍歷，記錄已讀到的
      break;
    }
    // 取 first-parent 作線性歷史；其他 parent 標 extraParents（merge 資訊）
    const firstParent = (c.parents && c.parents[0]) || null;
    const extraParents = (c.parents || []).slice(1);
    // 計算本次 commit 相對 firstParent 的變更檔案（tree object diff）
    // 失敗時不阻塞（pack 限制 / 讀不到 tree 時返回空）
    let diff = { files: [], totalFiles: 0, added: 0, modified: 0, removed: 0, truncated: false };
    try {
      // parentTreeHash: 讀 firstParent commit 的 tree（避免再次依賴 readCommitFull）
      let parentTreeHash = null;
      if (firstParent) {
        const parentObj = readGitObject(gitDir, firstParent);
        if (parentObj && parentObj.type === "commit") {
          const parentText = parentObj.content.toString("utf8");
          const treeMatch = parentText.match(/^tree\s+([0-9a-f]{40})\s*$/m);
          if (treeMatch) parentTreeHash = treeMatch[1];
        }
      }
      diff = diffCommitTrees(gitDir, c.tree, parentTreeHash);
    } catch (e) {
      // tree 讀不到（pack 限制等）— diff 保持空，不阻塞 commit 列表
    }
    commits.push({
      hash: c.hash,
      shortHash: c.shortHash,
      subject: c.subject || "",
      body: c.message && c.message.length > (c.subject || "").length ? c.message.slice((c.subject || "").length).replace(/^\s+/, "").slice(0, 400) : "",
      author: c.author || "",
      authorEmail: c.authorEmail || "",
      timestamp: Number(c.authorTimestamp) || 0,
      isoTime: c.authorTimestamp ? new Date(Number(c.authorTimestamp) * 1000).toISOString() : "",
      firstParent,
      extraParents,
      isMerge: extraParents.length > 0,
      // 檔案變更（基於 tree diff）
      filesChanged: diff.files,
      filesChangedTotal: diff.totalFiles,
      filesAdded: diff.added,
      filesModified: diff.modified,
      filesRemoved: diff.removed,
      filesTruncated: diff.truncated,
    });
    current = firstParent;
  }
  if (current && !visited.has(current) === false) {
    truncated = true;
  }

  return {
    available: true,
    currentBranch: (head && head.branch) || null,
    head: head.commit,
    total: commits.length,
    truncated,
    commits,
  };
}

// ── 工作樹對比（不依賴 git binary，純檔案 IO + git object 讀取） ──

// 常見忽略（git status 預設也會忽略 .git 等）
export const WORKTREE_IGNORE_DIRS = new Set([
  ".git",
  ".project-brain",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  "out",
  "target",
  "__pycache__",
  ".DS_Store",
  ".venv",
  "venv",
  "vendor",
  ".idea",
  ".vscode",
  ".turbo",
  ".cache",
  ".pnpm-store",
]);
export const WORKTREE_IGNORE_SUFFIXES = [".log", ".bak", ".tmp", ".swp", ".swo"];
export const WORKTREE_IGNORE_NAMES = new Set([".DS_Store", "Thumbs.db"]);

// 遞迴掃描工作樹，返回 { filePath: true } map
function collectWorkTreeFiles(projectPath) {
  const out = Object.create(null);
  if (!projectPath) return out;
  function walk(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const entry of entries) {
      const name = entry.name;
      if (WORKTREE_IGNORE_NAMES.has(name)) continue;
      if (WORKTREE_IGNORE_DIRS.has(name)) continue;
      const full = join(dir, name);
      // 字尾過濾（僅對檔案生效）
      let isDir = entry.isDirectory();
      if (!isDir && entry.isSymbolicLink()) {
        // 跳過 symlink（避免迴圈）
        continue;
      }
      if (!isDir && WORKTREE_IGNORE_SUFFIXES.some((suf) => name.endsWith(suf))) continue;
      if (isDir) {
        walk(full);
      } else if (entry.isFile()) {
        let rel;
        try { rel = relative(projectPath, full).split(sep).join("/"); } catch (e) { continue; }
        if (!rel || rel.startsWith("..")) continue;
        out[rel] = true;
      }
    }
  }
  walk(projectPath);
  return out;
}

// 沿 first-parent 鏈找一個可讀的 commit tree（HEAD tree 讀不到時的 fallback）
// 返回 { files, commitHash, commitShort } 或 null
function findReadableReferenceTree(gitDir, startCommitHash) {
  let current = startCommitHash;
  const visited = new Set();
  while (current && !visited.has(current)) {
    visited.add(current);
    const c = readCommitFull(gitDir, current);
    if (!c) break;
    const files = collectTreeFiles(gitDir, c.tree);
    if (Object.keys(files).length > 0) {
      return { files, commitHash: current, commitShort: current.substring(0, 7) };
    }
    if (!c.parents || !c.parents[0]) break;
    current = c.parents[0];
  }
  return null;
}

// 工作樹 vs HEAD tree 對比
// 返回 { available, untracked, deleted, untrackedTotal, deletedTotal, workFilesTotal, reference }
// 注意：modified 檢測需要 hash 工作樹檔案內容（IO 大），暫不產出
// 限制：
//   - HEAD tree 優先作為參考 tree
//   - 若 HEAD tree 不可讀（pack 解析失敗），沿 first-parent 鏈找一個可讀 tree 作為 fallback
//   - 若完全找不到可讀 tree，整個 workTree 檢測不可用（available=false）
export function getWorkTreeChanges({ projectPath, maxFiles = 50 } = {}) {
  const gitDir = findGitDir(projectPath);
  if (!gitDir) return { available: false, error: "not a git repository" };
  const head = readHead(gitDir);
  if (!head || !head.commit) return { available: false, error: "no HEAD commit" };

  // HEAD tree files
  const headCommit = readCommitFull(gitDir, head.commit);
  if (!headCommit) return { available: false, error: "cannot read HEAD commit" };
  let headTreeFiles = collectTreeFiles(gitDir, headCommit.tree);
  let reference = "head";  // "head" | "fallback"
  let referenceCommit = head.commit;

  // 魯棒性：HEAD tree 不可讀時（detector.js v0.4.6 pack fallback 已知 bug），
  // 沿 first-parent 鏈找一個可讀 tree 作為參考，避免完全顯示不出 Working Tree 區塊
  if (Object.keys(headTreeFiles).length === 0) {
    const fallback = findReadableReferenceTree(gitDir, head.commit);
    if (!fallback) {
      return {
        available: false,
        error: "HEAD tree 不可讀（pack 解析限制），無法可靠檢測工作樹變更",
      };
    }
    headTreeFiles = fallback.files;
    reference = "fallback";
    referenceCommit = fallback.commitHash;
  }
  const headPaths = Object.keys(headTreeFiles);

  // 工作樹 files
  const workFiles = collectWorkTreeFiles(projectPath);
  const workPaths = Object.keys(workFiles);

  const untracked = [];
  const deleted = [];
  for (const p of workPaths) {
    if (!Object.prototype.hasOwnProperty.call(headTreeFiles, p)) untracked.push(p);
  }
  for (const p of headPaths) {
    if (!Object.prototype.hasOwnProperty.call(workFiles, p)) deleted.push(p);
  }
  // 排序
  untracked.sort();
  deleted.sort();
  const cap = Math.max(1, Math.min(200, Number(maxFiles) || 50));
  return {
    available: true,
    head: head.commit,
    reference,
    referenceCommit,
    referenceCommitShort: referenceCommit.substring(0, 7),
    untracked,
    deleted,
    untrackedTotal: untracked.length,
    deletedTotal: deleted.length,
    workFilesTotal: workPaths.length,
    truncatedUntracked: untracked.length > cap,
    truncatedDeleted: deleted.length > cap,
    untrackedSample: untracked.slice(0, cap),
    deletedSample: deleted.slice(0, cap),
  };
}