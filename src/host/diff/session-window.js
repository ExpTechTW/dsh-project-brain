// session-window.js — 「本次會話改了什麼」的變更視窗
//
// 舊實現用 detectChanges({ since: "1" })（HEAD vs HEAD~1），等於把上一個 commit
// 當成本次會話的成果：沒提交就什麼都收不到，別人剛提交過就會被算到自己頭上。
//
// 這裡改成時間視窗：
//   1) 工作樹裡 mtime 落在 (sinceMs, now] 的檔案（未提交的改動也算，非 git 專案同樣可用）
//   2) git 倉庫裡 committer 時間落在視窗內的 commit，逐個與 first parent 做 tree diff
// 兩路合併去重。讀不到 git 不算錯誤，降級為純工作樹。

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { readHead, readCommitFull, collectTreeFiles } from "./detector.js";
import { WORKTREE_IGNORE_DIRS, WORKTREE_IGNORE_NAMES, WORKTREE_IGNORE_SUFFIXES } from "../git/history.js";

const MAX_WINDOW_MS = 14 * 86_400_000;
const MAX_COMMITS = 30;
const DEFAULT_MAX_FILES = 40;

// 會話視窗起點：上次 session_summary > 上次掃描 > 建腦時間 > 24 小時前，且最長只回看 14 天。
export function sessionWindowStart(brain, now = Date.now()) {
  const timeline = Array.isArray(brain && brain.timeline) ? brain.timeline : [];
  let last = 0;
  for (const e of timeline) {
    if (!e || e.eventType !== "session_summary") continue;
    const at = Number(e.occurredAt) || 0;
    if (at > last) last = at;
  }
  const project = (brain && brain.project) || {};
  const fallback = Number(project.lastScannedAt) || Number(project.createdAt) || 0;
  const picked = last || fallback || now - 86_400_000;
  return Math.max(picked, now - MAX_WINDOW_MS);
}

function walkWorkTree(projectPath, onFile) {
  const stack = [projectPath];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const entry of entries) {
      const name = entry.name;
      if (WORKTREE_IGNORE_NAMES.has(name) || WORKTREE_IGNORE_DIRS.has(name)) continue;
      if (entry.isSymbolicLink()) continue;
      const full = join(dir, name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (WORKTREE_IGNORE_SUFFIXES.some((suf) => name.endsWith(suf))) continue;
      let rel;
      try { rel = relative(projectPath, full).split(sep).join("/"); } catch (e) { continue; }
      if (!rel || rel.startsWith("..")) continue;
      onFile(rel, full);
    }
  }
}

function worktreeChangedSince(projectPath, sinceMs, now) {
  const out = [];
  walkWorkTree(projectPath, (rel, full) => {
    let stat = null;
    try { stat = statSync(full); } catch (e) { return; }
    const mtime = stat.mtimeMs;
    if (!(mtime > sinceMs && mtime <= now + 1000)) return;
    // 沒有 git 時，「視窗內才出生」是判斷新增檔案的唯一線索；有 git 時以 HEAD tree 為準。
    const birth = Number(stat.birthtimeMs) || 0;
    out.push({ path: rel, born: Boolean(birth) && birth > sinceMs && birth <= now + 1000 });
  });
  return out;
}

function diffTrees(gitDir, treeHash, parentTreeHash) {
  const cur = collectTreeFiles(gitDir, treeHash);
  const par = parentTreeHash ? collectTreeFiles(gitDir, parentTreeHash) : {};
  const out = [];
  const seen = new Set([...Object.keys(cur), ...Object.keys(par)]);
  for (const path of seen) {
    const a = cur[path];
    const b = par[path];
    if (a === b) continue;
    if (b === undefined) out.push({ path, type: "added" });
    else if (a === undefined) out.push({ path, type: "removed" });
    else out.push({ path, type: "modified" });
  }
  return out;
}

// 返回 { files, changes, commits, windowStart, source, truncated, error }
export function detectSessionChanges({ projectPath, sinceMs, now = Date.now(), maxFiles = DEFAULT_MAX_FILES }) {
  const result = {
    files: [],
    changes: [],
    commits: [],
    windowStart: sinceMs,
    source: "worktree",
    truncated: false,
    error: "",
  };
  if (!projectPath) {
    result.error = "no project path";
    return result;
  }

  const byPath = new Map();
  const note = (path, type) => {
    const p = String(path || "").replace(/\\/g, "/");
    if (!p) return;
    const prev = byPath.get(p);
    // added 比 modified 更有資訊量（結構變化），removed 優先順序最高
    if (!prev || type === "removed" || (type === "added" && prev !== "removed")) byPath.set(p, type);
  };

  const gitDir = join(projectPath, ".git");
  let headTreeFiles = null;
  if (existsSync(gitDir)) {
    try {
      const head = readHead(gitDir);
      const headCommit = head && head.commit ? readCommitFull(gitDir, head.commit) : null;
      if (headCommit) {
        headTreeFiles = collectTreeFiles(gitDir, headCommit.tree);
        result.source = "git+worktree";
        let cursor = headCommit;
        let depth = 0;
        while (cursor && depth < MAX_COMMITS) {
          const ts = (Number(cursor.committerTimestamp) || Number(cursor.authorTimestamp) || 0) * 1000;
          if (!ts || ts <= sinceMs) break;
          result.commits.push({ hash: cursor.hash, at: ts, subject: cursor.subject });
          const parentHash = cursor.parents && cursor.parents[0];
          const parent = parentHash ? readCommitFull(gitDir, parentHash) : null;
          for (const change of diffTrees(gitDir, cursor.tree, parent ? parent.tree : null)) {
            note(change.path, change.type);
          }
          cursor = parent;
          depth += 1;
        }
      } else {
        result.error = "cannot read HEAD commit";
      }
    } catch (e) {
      result.error = String((e && e.message) || e);
    }
  }

  for (const item of worktreeChangedSince(projectPath, sinceMs, now)) {
    const tracked = headTreeFiles
      ? Object.prototype.hasOwnProperty.call(headTreeFiles, item.path)
      : !item.born;
    note(item.path, tracked ? "modified" : "added");
  }

  const all = Array.from(byPath.entries())
    .map(([path, type]) => ({ path, type }))
    .sort((a, b) => a.path.localeCompare(b.path));
  result.truncated = all.length > maxFiles;
  result.changes = all.slice(0, maxFiles);
  result.files = result.changes.map((c) => c.path);
  return result;
}
