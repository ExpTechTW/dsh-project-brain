var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};

// src/host/store/write-lock.js
import { AsyncLocalStorage } from "node:async_hooks";
function withWriteLock(key, task) {
  const k = String(key || "default");
  const held = heldKeys.getStore();
  if (held && held.has(k)) {
    return Promise.reject(Object.assign(
      new Error("write-lock re-entered, would deadlock: " + k),
      { code: "E_WRITE_LOCK_REENTRY" }
    ));
  }
  const nextHeld = new Set(held || []);
  nextHeld.add(k);
  const run = () => heldKeys.run(nextHeld, task);
  const prev = chains.get(k);
  const result = prev ? prev.then(run) : (async () => run())();
  let tail;
  const settle = () => {
    if (chains.get(k) === tail) chains.delete(k);
  };
  tail = result.then(settle, settle);
  chains.set(k, tail);
  return result;
}
function brainTxKey(projectPath, file) {
  return String(projectPath || "") + "::tx::" + String(file || "memory.jsonl");
}
var chains, heldKeys;
var init_write_lock = __esm({
  "src/host/store/write-lock.js"() {
    chains = /* @__PURE__ */ new Map();
    heldKeys = new AsyncLocalStorage();
  }
});

// src/host/store/brain-files.js
var brain_files_exports = {};
__export(brain_files_exports, {
  appendJsonl: () => appendJsonl,
  appendLine: () => appendLine,
  assertSafeProjectPath: () => assertSafeProjectPath,
  brainPath: () => brainPath2,
  parseJsonl: () => parseJsonl,
  readBrain: () => readBrain,
  readJson: () => readJson,
  readJsonl: () => readJsonl,
  readText: () => readText2,
  serializeJsonl: () => serializeJsonl,
  writeJson: () => writeJson,
  writeJsonl: () => writeJsonl,
  writeText: () => writeText
});
function assertSafeProjectPath(projectPath) {
  const rawBase = typeof projectPath === "string" ? projectPath.trim() : "";
  if (!rawBase || rawBase === "." || rawBase.includes("\0") || rawBase === "/" || /^[A-Za-z]:[\\/]?$/.test(rawBase) || /[\\/]Programs[\\/]DSH Desktop$/i.test(rawBase) || /[\\/]DSH Desktop\.app(?:[\\/]|$)/.test(rawBase)) {
    const error = new Error("Refusing Project Brain access without a concrete workspace root");
    error.code = "E_UNSAFE_PROJECT_PATH";
    throw error;
  }
  return rawBase.replace(/[\\/]+$/, "");
}
function brainPath2(projectPath, file) {
  const base = assertSafeProjectPath(projectPath);
  const relativeFile = String(file || "").replace(/\\/g, "/");
  if (!relativeFile || relativeFile.startsWith("/") || relativeFile.split("/").includes("..")) {
    const error = new Error("Refusing Project Brain path outside .project-brain");
    error.code = "E_UNSAFE_BRAIN_FILE";
    throw error;
  }
  return base + "/.project-brain/" + relativeFile;
}
async function readText2(fs, path7) {
  try {
    const target = await fs.resolve(path7);
    return await fs.readText(target);
  } catch (e) {
    return null;
  }
}
function resolveWritePolicy(fs, writePolicy) {
  if (writePolicy) return writePolicy;
  try {
    const sp = fs && (fs.sandboxPolicy || fs.ctx && fs.ctx.sandboxPolicy);
    if (sp && typeof sp.resolve === "function") {
      try {
        return sp.resolve({ mode: "danger-full-access" });
      } catch (e) {
      }
    }
  } catch (e) {
  }
  return null;
}
async function writeTextRaw(fs, path7, content, writePolicy) {
  const policy = resolveWritePolicy(fs, writePolicy);
  try {
    try {
      const idx = path7.lastIndexOf("/");
      if (idx > 0 && typeof fs.mkdir === "function") {
        const dirTarget = await fs.resolve(path7.slice(0, idx));
        if (policy && fs.mkdir.length >= 2) {
          try {
            await fs.mkdir(dirTarget, { recursive: true }, { sandboxPolicy: policy });
          } catch (e) {
          }
        } else if (policy) {
          try {
            await fs.mkdir(dirTarget, { recursive: true });
          } catch (e) {
          }
        } else {
          try {
            await fs.mkdir(dirTarget, { recursive: true });
          } catch (e) {
          }
        }
      }
    } catch (e) {
    }
    const target = await fs.resolve(path7);
    if (policy) {
      try {
        await fs.writeText(target, content, void 0, void 0, policy);
        return true;
      } catch (e) {
      }
    }
    await fs.writeText(target, content);
    return true;
  } catch (e) {
    return false;
  }
}
async function writeText(fs, path7, content, writePolicy) {
  return withWriteLock(path7, () => writeTextRaw(fs, path7, content, writePolicy));
}
async function appendLine(fs, path7, line, writePolicy) {
  if (line == null) return false;
  const normalizedLine = String(line).endsWith("\n") ? String(line) : String(line) + "\n";
  return withWriteLock(path7, async () => {
    try {
      const target = await fs.resolve(path7);
      let existing = null;
      try {
        existing = await fs.readText(target);
      } catch (e) {
      }
      let next;
      if (existing == null || existing === "") {
        next = normalizedLine;
      } else if (existing.endsWith("\n")) {
        next = existing + normalizedLine;
      } else {
        next = existing + "\n" + normalizedLine;
      }
      return writeTextRaw(fs, path7, next, writePolicy);
    } catch (e) {
      return false;
    }
  });
}
function parseJsonl(text) {
  if (!text) return [];
  let t = String(text);
  if (t.charCodeAt(0) === 65279) t = t.slice(1);
  const out = [];
  for (const line of t.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      out.push(JSON.parse(s));
    } catch (e) {
    }
  }
  return out;
}
function serializeJsonl(items) {
  if (!items || items.length === 0) return "";
  return items.map((i) => JSON.stringify(i)).join("\n") + "\n";
}
async function readJsonl(fs, path7) {
  return parseJsonl(await readText2(fs, path7));
}
async function appendJsonl(fs, path7, entry, writePolicy) {
  return appendLine(fs, path7, JSON.stringify(entry) + "\n", writePolicy);
}
async function writeJsonl(fs, path7, items, writePolicy) {
  return writeText(fs, path7, serializeJsonl(items || []), writePolicy);
}
async function readJson(fs, path7) {
  const text = await readText2(fs, path7);
  if (text == null) return null;
  let t = text;
  if (typeof t === "string" && t.charCodeAt(0) === 65279) t = t.slice(1);
  try {
    return JSON.parse(t);
  } catch (e) {
    return { __error: String(e && e.message || e) };
  }
}
async function writeJson(fs, path7, obj, writePolicy) {
  return writeText(fs, path7, JSON.stringify(obj, null, 2), writePolicy);
}
async function readBrain(fs, projectPath) {
  const [project, timeline, memories, todos] = await Promise.all([
    readJson(fs, brainPath2(projectPath, "project.json")),
    readJsonl(fs, brainPath2(projectPath, "timeline.jsonl")),
    readJsonl(fs, brainPath2(projectPath, "memory.jsonl")),
    readJsonl(fs, brainPath2(projectPath, "todo.jsonl"))
  ]);
  return { projectPath, project, timeline, memories, todos };
}
var init_brain_files = __esm({
  "src/host/store/brain-files.js"() {
    init_write_lock();
  }
});

// src/host/transfer/confirm-tokens.js
var confirm_tokens_exports = {};
__export(confirm_tokens_exports, {
  _resetTokenStoreForTest: () => _resetTokenStoreForTest,
  createTokenStore: () => createTokenStore,
  getTokenStore: () => getTokenStore
});
import { randomBytes } from "node:crypto";
function createTokenStore({ ttlMs = DEFAULT_TTL_MS } = {}) {
  const store = /* @__PURE__ */ new Map();
  function sweep(now = Date.now()) {
    for (const [key, entry] of store.entries()) {
      if (now - entry.createdAt > ttlMs) {
        store.delete(key);
      }
    }
  }
  return {
    /**
     * 發放一個 confirmToken，附帶 payload。
     * @param {{ kind: string, payload: any }} args
     * @returns {string} token
     */
    issue({ kind, payload }) {
      if (!kind) throw new Error("confirm-tokens: kind is required");
      const token = randomBytes(16).toString("hex");
      store.set(token, { kind, payload, createdAt: Date.now() });
      return token;
    },
    /**
     * 校驗並消費 token。成功返回 payload，失敗返回 null。
     * @param {string} token
     * @param {{ kind?: string }} args 期待的操作型別（可選）
     * @returns {any} payload 或 null
     */
    consume(token, { kind } = {}) {
      if (!token || typeof token !== "string") return null;
      const entry = store.get(token);
      if (!entry) return null;
      store.delete(token);
      if (kind && entry.kind !== kind) return null;
      return entry.payload;
    },
    /**
     * 僅校驗（不消費），用於 dryRun 顯示 / 除錯。
     */
    peek(token, { kind } = {}) {
      const entry = store.get(token);
      if (!entry) return null;
      if (kind && entry.kind !== kind) return null;
      if (Date.now() - entry.createdAt > ttlMs) {
        store.delete(token);
        return null;
      }
      return entry.payload;
    },
    /** 主動清理過期（測試 / 健康檢查用） */
    sweep,
    /** 當前活躍 token 數（除錯用） */
    get size() {
      sweep();
      return store.size;
    }
  };
}
function getTokenStore() {
  if (!_singleton) _singleton = createTokenStore();
  return _singleton;
}
function _resetTokenStoreForTest() {
  _singleton = createTokenStore();
}
var DEFAULT_TTL_MS, _singleton;
var init_confirm_tokens = __esm({
  "src/host/transfer/confirm-tokens.js"() {
    DEFAULT_TTL_MS = 5 * 60 * 1e3;
    _singleton = null;
  }
});

// src/host/transfer/backup.js
var backup_exports = {};
__export(backup_exports, {
  BACKUP_DIR_RE: () => BACKUP_DIR_RE,
  BACKUP_DIR_RE_LEGACY: () => BACKUP_DIR_RE_LEGACY,
  applyRollback: () => applyRollback,
  cleanupBackups: () => cleanupBackups,
  createBackup: () => createBackup,
  extractTsFromDirName: () => extractTsFromDirName,
  generateBackupName: () => generateBackupName,
  issueImportConfirmToken: () => issueImportConfirmToken,
  issueRollbackConfirmToken: () => issueRollbackConfirmToken,
  listBackups: () => listBackups,
  matchBackupDir: () => matchBackupDir,
  previewRollback: () => previewRollback
});
import { promises as fsp } from "node:fs";
import path from "node:path";
async function readJsonlFile(filePath) {
  try {
    const text = await fsp.readFile(filePath, "utf8");
    const out = [];
    for (const line of text.split("\n")) {
      const s = line.trim();
      if (!s) continue;
      try {
        out.push(JSON.parse(s));
      } catch (e) {
      }
    }
    return out;
  } catch (e) {
    return [];
  }
}
async function readJsonFile(filePath) {
  try {
    const text = await fsp.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch (e) {
    return { __error: String(e && e.message || e) };
  }
}
function generateBackupName(now = /* @__PURE__ */ new Date()) {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `.project-brain.backup-${y}${mo}${d}-${h}${mi}${s}-${ms}`;
}
function matchBackupDir(name2) {
  if (typeof name2 !== "string") return null;
  const neu = name2.match(BACKUP_DIR_RE);
  if (neu) return { ts: `${neu[1]}-${neu[2]}-${neu[3]}`, legacy: false };
  const old = name2.match(BACKUP_DIR_RE_LEGACY);
  if (old) return { ts: `${old[1]}-${old[2]}-${old[3]}`, legacy: true };
  return null;
}
function extractTsFromDirName(name2) {
  const m = matchBackupDir(name2);
  return m ? m.ts : null;
}
async function createBackup({ projectPath, customTs = null }) {
  const safe = assertSafeProjectPath(projectPath);
  const brainDir = path.join(safe, ".project-brain");
  let brainStat;
  try {
    brainStat = await fsp.stat(brainDir);
  } catch (e) {
    const err = new Error("\u7576\u524D\u5C08\u6848\u7121\u8166\u53EF\u5099\u4EFD\uFF08.project-brain \u4E0D\u5B58\u5728\uFF09");
    err.code = "E_BRAIN_NOT_FOUND";
    throw err;
  }
  if (!brainStat.isDirectory()) {
    const err = new Error(".project-brain \u4E0D\u662F\u76EE\u9304");
    err.code = "E_BRAIN_NOT_FOUND";
    throw err;
  }
  let backupName = customTs ? `.project-brain.backup-${customTs}` : generateBackupName();
  let backupPath = path.join(safe, backupName);
  let attempt = 0;
  while (true) {
    try {
      await fsp.access(backupPath);
      attempt += 1;
      if (attempt > 50) {
        const err = new Error("\u5099\u4EFD\u76EE\u9304\u885D\u7A81\u6B21\u6578\u904E\u591A\uFF0C\u8ACB\u7A0D\u5F8C\u518D\u8A66");
        err.code = "E_BACKUP_CONFLICT";
        throw err;
      }
      backupName = generateBackupName(new Date(Date.now() + attempt));
      backupPath = path.join(safe, backupName);
    } catch (e) {
      if (e && e.code === "E_BACKUP_CONFLICT") throw e;
      break;
    }
  }
  await fsp.mkdir(path.dirname(backupPath), { recursive: true });
  await fsp.rename(brainDir, backupPath);
  const sizeBytes = await dirSize(backupPath);
  return {
    backupName,
    backupPath,
    ts: extractTsFromDirName(backupName) || null,
    sizeBytes,
    createdAt: brainStat.mtimeMs || Date.now()
  };
}
async function dirSize(dir) {
  let total = 0;
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (e) {
    return 0;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      total += await dirSize(abs);
    } else if (e.isFile()) {
      try {
        total += (await fsp.stat(abs)).size;
      } catch (_) {
      }
    }
  }
  return total;
}
async function listBackups({ projectPath }) {
  const safe = assertSafeProjectPath(projectPath);
  let entries;
  try {
    entries = await fsp.readdir(safe, { withFileTypes: true });
  } catch (e) {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const matched = matchBackupDir(e.name);
    if (!matched) continue;
    const backupPath = path.join(safe, e.name);
    const ts = matched.ts;
    let sizeBytes = 0;
    let memCount = 0;
    let todoCount = 0;
    let timelineCount = 0;
    let projectExists = false;
    let createdAt = 0;
    try {
      const stat = await fsp.stat(backupPath);
      createdAt = stat.mtimeMs || 0;
      sizeBytes = await dirSize(backupPath);
      const mems = await readJsonlFile(path.join(backupPath, "memory.jsonl"));
      const todos = await readJsonlFile(path.join(backupPath, "todo.jsonl"));
      const tline = await readJsonlFile(path.join(backupPath, "timeline.jsonl"));
      memCount = mems.length;
      todoCount = todos.length;
      timelineCount = tline.length;
      projectExists = true;
    } catch (_) {
    }
    out.push({
      ts,
      backupName: e.name,
      backupPath,
      sizeBytes,
      memCount,
      todoCount,
      timelineCount,
      projectExists,
      createdAt
    });
  }
  out.sort((a, b) => b.ts > a.ts ? 1 : b.ts < a.ts ? -1 : 0);
  return out;
}
async function cleanupBackups({
  projectPath,
  keepLast = 3,
  olderThanMs = 30 * 24 * 60 * 60 * 1e3
}) {
  const safe = assertSafeProjectPath(projectPath);
  const all = await listBackups({ projectPath: safe });
  const now = Date.now();
  const candidates = [];
  const kept = [];
  for (let i = 0; i < all.length; i++) {
    const b = all[i];
    const isRecent = i < keepLast;
    const isOld = now - (b.createdAt || 0) > olderThanMs;
    if (isRecent && !isOld) {
      kept.push(b);
    } else {
      candidates.push(b);
    }
  }
  if (kept.length < keepLast) {
    const need = keepLast - kept.length;
    const promoted = candidates.splice(0, need);
    kept.push(...promoted);
  }
  const deleted = [];
  for (const b of candidates) {
    try {
      await fsp.rm(b.backupPath, { recursive: true, force: true });
      deleted.push(b);
    } catch (e) {
    }
  }
  return {
    candidates: candidates.map((b) => b.backupPath),
    deleted: deleted.map((b) => b.backupPath),
    kept: kept.map((b) => b.backupPath)
  };
}
async function previewRollback({ projectPath, backupTimestamp }) {
  const safe = assertSafeProjectPath(projectPath);
  if (!backupTimestamp || !matchBackupDir(`.project-brain.backup-${backupTimestamp}`)) {
    const err = new Error(`\u5099\u4EFD\u6642\u9593\u6233\u683C\u5F0F\u7121\u6548\uFF1A${backupTimestamp}\uFF08\u671F\u671B yyyymmdd-hhmmss-mmm\uFF0C\u76F8\u5BB9\u820A\u7248 hhmm-mmm\uFF09`);
    err.code = "E_BACKUP_INVALID";
    throw err;
  }
  const backupName = `.project-brain.backup-${backupTimestamp}`;
  const backupPath = path.join(safe, backupName);
  let backupStat;
  try {
    backupStat = await fsp.stat(backupPath);
  } catch (e) {
    const err = new Error(`\u5099\u4EFD\u4E0D\u5B58\u5728\uFF1A${backupName}`);
    err.code = "E_BACKUP_NOT_FOUND";
    throw err;
  }
  if (!backupStat.isDirectory()) {
    const err = new Error(`\u5099\u4EFD\u4E0D\u662F\u76EE\u9304\uFF1A${backupName}`);
    err.code = "E_BACKUP_INVALID";
    throw err;
  }
  const mems = await readJsonlFile(path.join(backupPath, "memory.jsonl"));
  const todos = await readJsonlFile(path.join(backupPath, "todo.jsonl"));
  const tline = await readJsonlFile(path.join(backupPath, "timeline.jsonl"));
  const projectMeta = await readJsonFile(path.join(backupPath, "project.json"));
  if (!projectMeta || projectMeta.__error) {
    const err = new Error(`\u5099\u4EFD\u7F3A\u5C11\u6216\u640D\u58DE project.json\uFF1A${backupName}`);
    err.code = "E_BACKUP_INVALID";
    throw err;
  }
  const currentBrainPath = path.join(safe, ".project-brain");
  let currentBrain = null;
  try {
    const stat = await fsp.stat(currentBrainPath);
    if (stat.isDirectory()) {
      const curMems = await readJsonlFile(path.join(safe, ".project-brain", "memory.jsonl"));
      const curTodos = await readJsonlFile(path.join(safe, ".project-brain", "todo.jsonl"));
      const curTline = await readJsonlFile(path.join(safe, ".project-brain", "timeline.jsonl"));
      const curProj = await readJsonFile(path.join(safe, ".project-brain", "project.json"));
      currentBrain = {
        exists: true,
        projectId: curProj && !curProj.__error ? curProj.id : null,
        memCount: curMems.length,
        todoCount: curTodos.length,
        timelineCount: curTline.length,
        lastUpdateAt: stat.mtimeMs || null
      };
    }
  } catch (e) {
    currentBrain = { exists: false };
  }
  const willBackupCurrentTo = currentBrain && currentBrain.exists ? path.join(safe, generateBackupName()) : null;
  return {
    sourceBackup: {
      ts: backupTimestamp,
      backupName,
      backupPath,
      createdAt: backupStat.mtimeMs || null,
      sizeBytes: await dirSize(backupPath),
      memCount: mems.length,
      todoCount: todos.length,
      timelineCount: tline.length
    },
    currentBrain,
    willBackupCurrentTo
  };
}
async function applyRollback({ projectPath, backupTimestamp, triggerRescan = true }) {
  const safe = assertSafeProjectPath(projectPath);
  const preview = await previewRollback({ projectPath: safe, backupTimestamp });
  let preRollbackBackupPath = null;
  const brainDir = path.join(safe, ".project-brain");
  if (preview.currentBrain && preview.currentBrain.exists) {
    const r = await createBackup({ projectPath: safe });
    preRollbackBackupPath = r.backupPath;
  }
  try {
    await fsp.access(brainDir);
    await fsp.rm(brainDir, { recursive: true, force: true });
  } catch (e) {
  }
  await fsp.rename(preview.sourceBackup.backupPath, brainDir);
  return {
    restoredFrom: preview.sourceBackup.backupPath,
    preRollbackBackupPath,
    rescanTriggered: !!triggerRescan
  };
}
async function issueRollbackConfirmToken({ projectPath, backupTimestamp }) {
  const preview = await previewRollback({ projectPath, backupTimestamp });
  return getTokenStore().issue({ kind: "rollback", payload: { backupTimestamp, preview } });
}
async function issueImportConfirmToken({ bundlePath, destProjectPath }) {
  const { previewBundle: previewBundle2 } = await Promise.resolve().then(() => (init_bundle(), bundle_exports));
  const preview = await previewBundle2({ bundlePath, destProjectPath });
  return getTokenStore().issue({
    kind: "import",
    payload: { bundlePath, destProjectPath, preview }
  });
}
var BACKUP_DIR_RE, BACKUP_DIR_RE_LEGACY;
var init_backup = __esm({
  "src/host/transfer/backup.js"() {
    init_brain_files();
    init_confirm_tokens();
    BACKUP_DIR_RE = /^\.project-brain\.backup-(\d{8})-(\d{6})-(\d{3})$/;
    BACKUP_DIR_RE_LEGACY = /^\.project-brain\.backup-(\d{8})-(\d{4})-(\d{3})$/;
  }
});

// src/host/transfer/bundle.js
var bundle_exports = {};
__export(bundle_exports, {
  _internal: () => _internal,
  applyBundle: () => applyBundle,
  buildBundleBuffer: () => buildBundleBuffer,
  defaultBundleName: () => defaultBundleName,
  parseBundle: () => parseBundle,
  previewBundle: () => previewBundle,
  writeBundleFile: () => writeBundleFile
});
import { createHash as createHash3 } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { promises as fsp2 } from "node:fs";
import path2 from "node:path";
async function readJsonFile2(filePath) {
  try {
    const text = await fsp2.readFile(filePath, "utf8");
    let t = text;
    if (typeof t === "string" && t.charCodeAt(0) === 65279) t = t.slice(1);
    return JSON.parse(t);
  } catch (e) {
    return { __error: String(e && e.message || e) };
  }
}
async function readJsonlFile2(filePath) {
  try {
    const text = await fsp2.readFile(filePath, "utf8");
    const out = [];
    for (const line of text.split("\n")) {
      const s = line.trim();
      if (!s) continue;
      try {
        out.push(JSON.parse(s));
      } catch (e) {
      }
    }
    return out;
  } catch (e) {
    return [];
  }
}
function crc32(buf) {
  let c = 4294967295;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 255] ^ c >>> 8;
  }
  return (c ^ 4294967295) >>> 0;
}
function dosTime(date = /* @__PURE__ */ new Date()) {
  const t = (date.getHours() & 31) << 11 | (date.getMinutes() & 63) << 5 | date.getSeconds() / 2 & 31;
  const d = (date.getFullYear() - 1980 & 127) << 9 | (date.getMonth() + 1 & 15) << 5 | date.getDate() & 31;
  return { time: t & 65535, date: d & 65535 };
}
function sanitizeProjectName(name2) {
  return String(name2 || "project").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 60) || "project";
}
function tsString(date = /* @__PURE__ */ new Date()) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${y}${mo}${d}-${h}${mi}`;
}
async function collectBrainFiles(projectPath, { includeCache = true } = {}) {
  const base = path2.join(projectPath, ".project-brain");
  const out = [];
  async function walk(dirAbs, relBase) {
    let entries;
    try {
      entries = await fsp2.readdir(dirAbs, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        if (entry.name === ".DS_Store") continue;
        if (entry.name.startsWith(".backup")) continue;
      }
      const abs = path2.join(dirAbs, entry.name);
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (!includeCache && rel.split("/")[0] === "cache") continue;
      if (BUNDLE_EXCLUDED_FILES.some((rx) => rx.test(entry.name))) continue;
      if (entry.isDirectory()) {
        await walk(abs, rel);
      } else if (entry.isFile()) {
        try {
          const stat = await fsp2.stat(abs);
          const buf = await fsp2.readFile(abs);
          const sha = createHash3("sha256").update(buf).digest("hex");
          out.push({
            relPath: `.project-brain/${rel}`,
            absPath: abs,
            size: stat.size,
            sha256: sha,
            _buf: buf
            // 內部用，外部不匯出
          });
        } catch (e) {
        }
      }
    }
  }
  await walk(base, "");
  return out;
}
async function parseZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) {
    throw new Error("E_BUNDLE_INVALID: not a zip file");
  }
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 101010256) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("E_BUNDLE_INVALID: EOCD not found");
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdSize = buf.readUInt32LE(eocdOffset + 12);
  const cdStart = buf.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let p = cdStart;
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(p) !== 33639248) {
      throw new Error("E_BUNDLE_INVALID: bad central directory entry");
    }
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name2 = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");
    entries.push({ name: name2, method, crc, compSize, size, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const files = [];
  for (const e of entries) {
    const lhSig = buf.readUInt32LE(e.localOffset);
    if (lhSig !== 67324752) throw new Error("E_BUNDLE_INVALID: bad local header");
    const lhNameLen = buf.readUInt16LE(e.localOffset + 26);
    const lhExtraLen = buf.readUInt16LE(e.localOffset + 28);
    const dataStart = e.localOffset + 30 + lhNameLen + lhExtraLen;
    const compData = buf.slice(dataStart, dataStart + e.compSize);
    let data;
    if (e.method === 0) data = compData;
    else if (e.method === 8) {
      const { inflateRawSync } = await import("node:zlib");
      data = inflateRawSync(compData);
    } else {
      throw new Error(`E_BUNDLE_INVALID: unsupported compression method ${e.method}`);
    }
    const actualCrc = crc32(data);
    if (actualCrc !== e.crc) {
      throw new Error(`E_BUNDLE_INVALID: CRC32 mismatch on ${e.name}`);
    }
    files.push({ name: e.name, data, size: e.size, crc: e.crc });
  }
  return files;
}
function isSafeBundleEntry(name2) {
  const n = String(name2 || "").replace(/\\/g, "/");
  if (n === "manifest.json") return true;
  if (!n.startsWith(".project-brain/")) return false;
  const rest = n.slice(".project-brain/".length);
  if (!rest) return false;
  const parts = rest.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return false;
  if (/^[A-Za-z]:/.test(rest) || rest.startsWith("/")) return false;
  return true;
}
async function buildBundleBuffer({ projectPath, pluginVersion, includeCache = true }) {
  const safePath = assertSafeProjectPath(projectPath);
  const projectMeta = await readJsonFile2(path2.join(safePath, ".project-brain", "project.json"));
  if (!projectMeta || projectMeta.__error) {
    const err = new Error("\u5C08\u6848\u672A\u521D\u59CB\u5316\uFF0C\u8ACB\u5148\u547C\u53EB project_init");
    err.code = "E_BRAIN_NOT_FOUND";
    throw err;
  }
  const files = await collectBrainFiles(safePath, { includeCache });
  if (files.length === 0) {
    const err = new Error(".project-brain \u76EE\u9304\u70BA\u7A7A");
    err.code = "E_BRAIN_EMPTY";
    throw err;
  }
  const checksum = { algorithm: "sha256", files: {} };
  for (const f of files) {
    const relInside = f.relPath.replace(/^\.project-brain\//, "");
    checksum.files[relInside] = f.sha256;
  }
  const exportedAt = Date.now();
  const manifest = {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    pluginVersion: pluginVersion || "1.3.1",
    exportedAt,
    sourceProject: {
      id: projectMeta.id,
      name: projectMeta.name,
      rootPath: projectMeta.rootPath || safePath,
      lastScannedAt: projectMeta.lastScannedAt || projectMeta.updatedAt || null
    },
    checksum,
    options: { includeCache },
    fileCount: files.length
  };
  const zw = new ZipWriter();
  const mtime = new Date(exportedAt);
  zw.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"), mtime);
  for (const f of files) {
    zw.addFile(f.relPath, f._buf, mtime);
  }
  const buf = zw.finalize();
  return {
    buffer: buf,
    manifest,
    fileCount: files.length,
    sizeBytes: buf.length
  };
}
function defaultBundleName(projectMeta) {
  const name2 = sanitizeProjectName(projectMeta && projectMeta.name);
  return `dsh-brain-${name2}-${tsString()}.zip`;
}
async function writeBundleFile({ projectPath, outputPath, pluginVersion, includeCache = true }) {
  if (!outputPath || typeof outputPath !== "string") {
    const err = new Error("outputPath \u5FC5\u586B");
    err.code = "E_BUNDLE_WRITE_FAILED";
    throw err;
  }
  const built = await buildBundleBuffer({ projectPath, pluginVersion, includeCache });
  await fsp2.mkdir(path2.dirname(outputPath), { recursive: true });
  await fsp2.writeFile(outputPath, built.buffer);
  let st;
  try {
    st = await fsp2.stat(outputPath);
  } catch (e) {
    const err = new Error("zip \u5BEB\u5165\u5F8C\u7121\u6CD5\u8B80\u53D6\uFF1A" + outputPath + "\uFF08" + String(e && e.message || e) + "\uFF09");
    err.code = "E_BUNDLE_WRITE_FAILED";
    throw err;
  }
  if (!st.isFile() || st.size <= 0) {
    const err = new Error("zip \u5BEB\u5165\u5F8C\u6587\u4EF6\u7121\u6548\uFF1A" + outputPath);
    err.code = "E_BUNDLE_WRITE_FAILED";
    throw err;
  }
  return {
    bundlePath: outputPath,
    bundleName: path2.basename(outputPath),
    defaultDirPath: path2.dirname(outputPath),
    sizeBytes: st.size,
    fileCount: built.fileCount,
    manifest: built.manifest
  };
}
async function parseBundle(bundlePath) {
  let buf;
  try {
    buf = await fsp2.readFile(bundlePath);
  } catch (e) {
    const err = new Error(`bundle \u6A94\u6848\u4E0D\u5B58\u5728\u6216\u4E0D\u53EF\u8B80\uFF1A${bundlePath}`);
    err.code = "E_BUNDLE_NOT_FOUND";
    throw err;
  }
  let files;
  try {
    files = await parseZip(buf);
  } catch (e) {
    const err = new Error("bundle \u6A94\u6848\u640D\u58DE\u6216\u683C\u5F0F\u7121\u6548");
    err.code = "E_BUNDLE_INVALID";
    err.detail = e.message;
    throw err;
  }
  const manifestEntry = files.find((f) => f.name === "manifest.json");
  if (!manifestEntry) {
    const err = new Error("bundle \u7F3A\u5C11 manifest.json");
    err.code = "E_BUNDLE_INVALID";
    err.detail = "manifest.json not found";
    throw err;
  }
  let manifest;
  try {
    manifest = JSON.parse(manifestEntry.data.toString("utf8"));
  } catch (e) {
    const err = new Error("bundle manifest.json \u89E3\u6790\u5931\u6557");
    err.code = "E_BUNDLE_INVALID";
    err.detail = e.message;
    throw err;
  }
  if (!manifest.schemaVersion || manifest.schemaVersion > BUNDLE_SCHEMA_VERSION) {
    const err = new Error(
      `bundle \u7531\u66F4\u65B0\u7248\u672C dsh-project-brain v${manifest.pluginVersion || "?"} \u532F\u51FA\uFF0C\u7576\u524D\u5916\u639B\u50C5\u652F\u63F4 schemaVersion<=${BUNDLE_SCHEMA_VERSION}\uFF0C\u8ACB\u5148\u5347\u7D1A\u5916\u639B\u518D\u532F\u5165\u3002`
    );
    err.code = "E_BUNDLE_SCHEMA_UNSUPPORTED";
    err.detail = `bundle.schemaVersion=${manifest.schemaVersion}, supported<=${BUNDLE_SCHEMA_VERSION}`;
    throw err;
  }
  const fileMap = /* @__PURE__ */ new Map();
  for (const f of files) {
    const zipName = String(f.name || "").replace(/\\/g, "/");
    if (!isSafeBundleEntry(zipName)) {
      const err = new Error("bundle \u542B\u6709\u975E\u6CD5\u8DEF\u5F91\uFF08\u7981\u6B62\u5BEB\u5230 .project-brain/ \u4E4B\u5916\uFF09\uFF1A" + zipName);
      err.code = "E_BUNDLE_INVALID";
      err.detail = "zip-slip:" + zipName;
      throw err;
    }
    if (zipName === "manifest.json") continue;
    const sha = createHash3("sha256").update(f.data).digest("hex");
    const relInside = zipName.replace(/^\.project-brain\//, "");
    const expected = manifest.checksum && manifest.checksum.files && manifest.checksum.files[relInside];
    if (expected && expected !== sha) {
      const err = new Error(`bundle \u6A94\u6848 ${relInside} \u6821\u9A57\u548C\u4E0D\u4E00\u81F4`);
      err.code = "E_BUNDLE_CHECKSUM_MISMATCH";
      err.detail = `expected=${expected}, actual=${sha}`;
      throw err;
    }
    fileMap.set(zipName, f.data);
  }
  if (!fileMap.has(".project-brain/project.json")) {
    const err = new Error("bundle \u7F3A\u5C11 .project-brain/project.json");
    err.code = "E_BUNDLE_INVALID";
    err.detail = "project.json not found";
    throw err;
  }
  return { manifest, files: fileMap };
}
async function previewBundle({ bundlePath, destProjectPath }) {
  const safeDest = assertSafeProjectPath(destProjectPath);
  const { manifest, files } = await parseBundle(bundlePath);
  const currentBrain = {
    exists: false,
    projectId: null,
    memCount: 0,
    todoCount: 0,
    timelineCount: 0,
    archExists: false
  };
  try {
    const currentProject = await readJsonFile2(path2.join(safeDest, ".project-brain", "project.json"));
    if (currentProject && !currentProject.__error) {
      currentBrain.exists = true;
      currentBrain.projectId = currentProject.id || null;
      const mems = await readJsonlFile2(path2.join(safeDest, ".project-brain", "memory.jsonl"));
      const todos = await readJsonlFile2(path2.join(safeDest, ".project-brain", "todo.jsonl"));
      const tline = await readJsonlFile2(path2.join(safeDest, ".project-brain", "timeline.jsonl"));
      currentBrain.memCount = mems.length;
      currentBrain.todoCount = todos.length;
      currentBrain.timelineCount = tline.length;
      try {
        await fsp2.access(path2.join(safeDest, ".project-brain", "architecture.json"));
        currentBrain.archExists = true;
      } catch (e) {
      }
    }
  } catch (e) {
  }
  const incomingProjectBuf = files.get(".project-brain/project.json");
  let incomingProject = null;
  try {
    incomingProject = JSON.parse(incomingProjectBuf.toString("utf8"));
  } catch (e) {
  }
  const incomingMemBuf = files.get(".project-brain/memory.jsonl");
  const incomingMemCount = incomingMemBuf ? incomingMemBuf.toString("utf8").split("\n").filter((l) => l.trim()).length : 0;
  const incomingTodoBuf = files.get(".project-brain/todo.jsonl");
  const incomingTodoCount = incomingTodoBuf ? incomingTodoBuf.toString("utf8").split("\n").filter((l) => l.trim()).length : 0;
  const incomingTimelineBuf = files.get(".project-brain/timeline.jsonl");
  const incomingTimelineCount = incomingTimelineBuf ? incomingTimelineBuf.toString("utf8").split("\n").filter((l) => l.trim()).length : 0;
  return {
    manifest,
    currentBrain,
    incoming: {
      projectId: incomingProject ? incomingProject.id : null,
      memCount: incomingMemCount,
      todoCount: incomingTodoCount,
      timelineCount: incomingTimelineCount
    },
    rootPathRewrite: {
      from: incomingProject ? incomingProject.rootPath : null,
      to: safeDest
    },
    backupWillCreateAt: currentBrain.exists ? path2.join(safeDest, (await Promise.resolve().then(() => (init_backup(), backup_exports))).generateBackupName()) : null
  };
}
async function applyBundle({
  bundlePath,
  destProjectPath,
  backupPath = null,
  triggerRescan = true
}) {
  const safeDest = assertSafeProjectPath(destProjectPath);
  const { manifest, files } = await parseBundle(bundlePath);
  const brainDir = path2.join(safeDest, ".project-brain");
  let actualBackupPath = null;
  let rescanTriggered = false;
  const brainExists = await fsp2.stat(brainDir).then(() => true).catch(() => false);
  if (brainExists) {
    const { createBackup: createBackup2 } = await Promise.resolve().then(() => (init_backup(), backup_exports));
    const r = await createBackup2({ projectPath: safeDest });
    actualBackupPath = r.backupPath;
  }
  await fsp2.mkdir(brainDir, { recursive: true });
  for (const [relPath, data] of files.entries()) {
    const zipName = String(relPath || "").replace(/\\/g, "/");
    if (!isSafeBundleEntry(zipName) || zipName === "manifest.json") continue;
    if (!zipName.startsWith(".project-brain/")) continue;
    const relInside = zipName.replace(/^\.project-brain\//, "");
    const abs = path2.join(brainDir, relInside);
    const resolved = path2.resolve(abs);
    const brainRoot = path2.resolve(brainDir) + path2.sep;
    if (resolved !== path2.resolve(brainDir) && !resolved.startsWith(brainRoot)) continue;
    await fsp2.mkdir(path2.dirname(abs), { recursive: true });
    await fsp2.writeFile(abs, data);
  }
  const projectPath = path2.join(brainDir, "project.json");
  try {
    const projBuf = await fsp2.readFile(projectPath, "utf8");
    const proj = JSON.parse(projBuf);
    proj.rootPath = safeDest;
    proj.updatedAt = Date.now();
    if (!proj.lastScannedAt) proj.lastScannedAt = proj.updatedAt;
    await fsp2.writeFile(projectPath, JSON.stringify(proj, null, 2));
  } catch (e) {
  }
  if (triggerRescan) {
    rescanTriggered = true;
  }
  return {
    backupPath: actualBackupPath,
    rescanTriggered,
    fileCount: files.size,
    sourceManifest: {
      schemaVersion: manifest.schemaVersion,
      pluginVersion: manifest.pluginVersion,
      sourceProjectId: manifest.sourceProject && manifest.sourceProject.id,
      sourceRootPath: manifest.sourceProject && manifest.sourceProject.rootPath
    }
  };
}
var BUNDLE_SCHEMA_VERSION, BUNDLE_EXCLUDED_FILES, CRC_TABLE, ZipWriter, _internal;
var init_bundle = __esm({
  "src/host/transfer/bundle.js"() {
    init_brain_files();
    BUNDLE_SCHEMA_VERSION = 1;
    BUNDLE_EXCLUDED_FILES = [
      /^tmp-.*\.txt$/i,
      /^debug\.log$/i,
      /\.log$/i,
      /\.tmp$/i
    ];
    CRC_TABLE = (() => {
      const t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
          c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
        }
        t[n] = c >>> 0;
      }
      return t;
    })();
    ZipWriter = class {
      constructor() {
        this.chunks = [];
        this.central = [];
        this.offset = 0;
      }
      _push(buf) {
        this.chunks.push(buf);
        this.offset += buf.length;
      }
      addFile(name2, data, mtime = /* @__PURE__ */ new Date()) {
        const nameBuf = Buffer.from(name2, "utf8");
        const dt = dosTime(mtime);
        const crc = crc32(data);
        const raw = Buffer.from(data);
        const compressed = deflateRawSync(raw, { level: 6 });
        const useDeflate = compressed.length < raw.length;
        const compData = useDeflate ? compressed : raw;
        const method = useDeflate ? 8 : 0;
        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(67324752, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt16LE(2048, 6);
        localHeader.writeUInt16LE(method, 8);
        localHeader.writeUInt16LE(dt.time, 10);
        localHeader.writeUInt16LE(dt.date, 12);
        localHeader.writeUInt32LE(crc, 14);
        localHeader.writeUInt32LE(compData.length, 18);
        localHeader.writeUInt32LE(raw.length, 22);
        localHeader.writeUInt16LE(nameBuf.length, 26);
        localHeader.writeUInt16LE(0, 28);
        const headerOffset = this.offset;
        this._push(localHeader);
        this._push(nameBuf);
        this._push(compData);
        this.central.push({
          name: name2,
          nameBuf,
          crc,
          size: raw.length,
          compSize: compData.length,
          offset: headerOffset,
          mtime: dt,
          method
        });
      }
      finalize() {
        const cdStart = this.offset;
        let cdSize = 0;
        for (const e of this.central) {
          const cd = Buffer.alloc(46);
          cd.writeUInt32LE(33639248, 0);
          cd.writeUInt16LE(20, 4);
          cd.writeUInt16LE(20, 6);
          cd.writeUInt16LE(2048, 8);
          cd.writeUInt16LE(e.method, 10);
          cd.writeUInt16LE(e.mtime.time, 12);
          cd.writeUInt16LE(e.mtime.date, 14);
          cd.writeUInt32LE(e.crc, 16);
          cd.writeUInt32LE(e.compSize, 20);
          cd.writeUInt32LE(e.size, 24);
          cd.writeUInt16LE(e.nameBuf.length, 28);
          cd.writeUInt16LE(0, 30);
          cd.writeUInt16LE(0, 32);
          cd.writeUInt16LE(0, 34);
          cd.writeUInt16LE(0, 36);
          cd.writeUInt32LE(0, 38);
          cd.writeUInt32LE(e.offset, 42);
          this._push(cd);
          this._push(e.nameBuf);
          cdSize += cd.length + e.nameBuf.length;
        }
        const eocd = Buffer.alloc(22);
        eocd.writeUInt32LE(101010256, 0);
        eocd.writeUInt16LE(0, 4);
        eocd.writeUInt16LE(0, 6);
        eocd.writeUInt16LE(this.central.length, 8);
        eocd.writeUInt16LE(this.central.length, 10);
        eocd.writeUInt32LE(cdSize, 12);
        eocd.writeUInt32LE(cdStart, 16);
        eocd.writeUInt16LE(0, 20);
        this._push(eocd);
        return Buffer.concat(this.chunks);
      }
    };
    _internal = {
      crc32,
      ZipWriter,
      parseZip,
      collectBrainFiles,
      dosTime,
      sanitizeProjectName,
      tsString,
      isSafeBundleEntry
    };
  }
});

// src/tools.js
import { defineTool } from "@deepseek-ai/dsh-tools";

// src/stack-taxonomy.js
var LANGUAGE_NAMES = /* @__PURE__ */ new Set([
  "JavaScript",
  "TypeScript",
  "Python",
  "Go",
  "Rust",
  "Java",
  "C",
  "C++",
  "Kotlin",
  "Scala",
  "Swift",
  "Dart",
  "C#",
  ".NET",
  "PHP",
  "Ruby"
]);
var TECHSTACK_TO_STACK_FIELD = {
  frontend: "framework-frontend",
  backend: "framework-backend",
  fullstack: "framework-fullstack",
  webserver: "webserver",
  database: "database",
  cache: "cache",
  queue: "queue",
  search: "search",
  container: "container",
  mobile: "mobile",
  desktop: "desktop",
  auth: "auth",
  api: "api",
  payment: "payment",
  ai: "ai",
  orm: "orm",
  iac: "iac",
  ci: "ci",
  observability: "observability"
};
function isLanguageTech(name2) {
  return LANGUAGE_NAMES.has(name2);
}
var STACK_FIELD_TO_TECHSTACK = Object.fromEntries(
  Object.entries(TECHSTACK_TO_STACK_FIELD).map(([legacy, field]) => [field, legacy])
);
var TECHSTACK_CATEGORY_MAP = {
  "React": ["frontend"],
  "Vue": ["frontend"],
  "Svelte": ["frontend"],
  "Angular": ["frontend"],
  "Solid": ["frontend"],
  "Next.js": ["fullstack"],
  "Nuxt": ["fullstack"],
  "Remix": ["fullstack"],
  "Astro": ["fullstack"],
  "Express": ["backend"],
  "Fastify": ["backend"],
  "NestJS": ["backend"],
  "Koa": ["backend"],
  "FastAPI": ["backend"],
  "Django": ["backend"],
  "Flask": ["backend"],
  "Gin": ["backend"],
  "Echo": ["backend"],
  "Fiber": ["backend"],
  "Actix Web": ["backend"],
  "Axum": ["backend"],
  "Rocket": ["backend"],
  "Spring": ["backend"],
  "Spring Boot": ["backend"],
  "Electron": ["desktop"],
  "Tauri": ["desktop"],
  "Tauri Apps": ["desktop"],
  "Prisma": ["orm"],
  "TypeORM": ["orm"],
  "Sequelize": ["orm"],
  "Drizzle": ["orm"],
  "GORM": ["orm"],
  "SQLAlchemy": ["orm"],
  "SQLx": ["orm"],
  "Diesel": ["orm"],
  "SeaORM": ["orm"],
  "PostgreSQL": ["database"],
  "MySQL": ["database"],
  "MongoDB": ["database"],
  "Redis": ["cache"],
  "SQLite": ["database"],
  "LangChain": ["ai"],
  "LangGraph": ["ai"],
  "OpenAI SDK": ["ai"],
  "MCP": ["api"]
};
var STACK_CATEGORY_MAP = {
  "React": ["framework-frontend"],
  "Vue": ["framework-frontend"],
  "Svelte": ["framework-frontend"],
  "Angular": ["framework-frontend"],
  "Solid": ["framework-frontend"],
  "Next.js": ["framework-fullstack"],
  "Nuxt": ["framework-fullstack"],
  "Remix": ["framework-fullstack"],
  "Astro": ["framework-fullstack"],
  "Express": ["framework-backend"],
  "Fastify": ["framework-backend"],
  "NestJS": ["framework-backend"],
  "Koa": ["framework-backend"],
  "Hono": ["framework-backend"],
  "FastAPI": ["framework-backend"],
  "Django": ["framework-backend"],
  "Flask": ["framework-backend"],
  "Streamlit": ["framework-frontend"],
  "Gradio": ["framework-frontend"],
  "Gin": ["framework-backend"],
  "Echo": ["framework-backend"],
  "Fiber": ["framework-backend"],
  "Actix Web": ["framework-backend"],
  "Axum": ["framework-backend"],
  "Rocket": ["framework-backend"],
  "Spring": ["framework-backend"],
  "Spring Boot": ["framework-backend"],
  "Quarkus": ["framework-backend"],
  "Micronaut": ["framework-backend"],
  "Electron": ["desktop"],
  "Tauri": ["desktop"],
  "Tauri Apps": ["desktop"],
  "Flutter": ["mobile"],
  "React Native": ["mobile"],
  "Expo": ["mobile"],
  "Prisma": ["orm"],
  "TypeORM": ["orm"],
  "Sequelize": ["orm"],
  "Drizzle": ["orm"],
  "GORM": ["orm"],
  "SQLAlchemy": ["orm"],
  "SQLx": ["orm"],
  "Diesel": ["orm"],
  "SeaORM": ["orm"],
  "Hibernate": ["orm"],
  "MyBatis": ["orm"],
  "PostgreSQL": ["database"],
  "MySQL": ["database"],
  "MongoDB": ["database"],
  "Redis": ["cache"],
  "SQLite": ["database"],
  "MariaDB": ["database"],
  "ClickHouse": ["database"],
  "Cassandra": ["database"],
  "InfluxDB": ["database"],
  "Elasticsearch": ["search"],
  "OpenSearch": ["search"],
  "Meilisearch": ["search"],
  "Algolia": ["search"],
  "RabbitMQ": ["queue"],
  "Kafka": ["queue"],
  "NATS": ["queue"],
  "Bull": ["queue"],
  "Celery": ["queue"],
  "Nginx": ["webserver"],
  "Caddy": ["webserver"],
  "Traefik": ["webserver"],
  "Apache": ["webserver"],
  "HAProxy": ["webserver"],
  "Docker": ["container"],
  "Docker Compose": ["container"],
  "Podman": ["container"],
  "Kubernetes": ["iac"],
  "Terraform": ["iac"],
  "Pulumi": ["iac"],
  "Ansible": ["iac"],
  "CloudFormation": ["iac"],
  "Bicep": ["iac"],
  "Helm": ["iac"],
  "Kustomize": ["iac"],
  "GitHub Actions": ["ci"],
  "GitLab CI": ["ci"],
  "CircleCI": ["ci"],
  "Jenkins": ["ci"],
  "Travis CI": ["ci"],
  "Azure Pipelines": ["ci"],
  "Prometheus": ["observability"],
  "Grafana": ["observability"],
  "Sentry": ["observability"],
  "OpenTelemetry": ["observability"],
  "Datadog": ["observability"],
  "Loki": ["observability"],
  "Jaeger": ["observability"],
  "Passport.js": ["auth"],
  "Auth.js (NextAuth)": ["auth"],
  "Clerk": ["auth"],
  "Auth0": ["auth"],
  "Keycloak": ["auth"],
  "JWT": ["auth"],
  "OAuth2/OIDC": ["auth"],
  "OAuth2": ["auth"],
  "gRPC": ["api"],
  "GraphQL": ["api"],
  "tRPC": ["api"],
  "OpenAPI/Swagger": ["api"],
  "REST": ["api"],
  "MCP": ["api"],
  "Stripe": ["payment"],
  "PayPal": ["payment"],
  "OpenAI SDK": ["ai"],
  "Anthropic SDK": ["ai"],
  "Google Generative AI": ["ai"],
  "Cohere": ["ai"],
  "LangChain": ["ai"],
  "LangGraph": ["ai"],
  "LlamaIndex": ["ai"],
  "Hugging Face": ["ai"],
  "PyTorch": ["ai"],
  "TensorFlow": ["ai"]
};
function collectArchitectureTechs(architecture) {
  const allTechs = /* @__PURE__ */ new Set();
  if (!architecture || !Array.isArray(architecture.components)) return allTechs;
  for (const component of architecture.components) {
    for (const tech of component.technologies || []) allTechs.add(tech);
  }
  return allTechs;
}
function mergeTechStackWithArchitecture(scanTechStack, architecture) {
  const result = JSON.parse(JSON.stringify(scanTechStack || {}));
  if (!architecture || !Array.isArray(architecture.components)) return result;
  const append = (field, value) => {
    if (!value) return;
    const cur = result[field];
    if (!cur) result[field] = value;
    else if (Array.isArray(cur)) {
      if (!cur.includes(value)) cur.push(value);
    } else if (cur !== value) result[field] = [cur, value];
  };
  const unmatched = [];
  for (const tech of collectArchitectureTechs(architecture)) {
    if (isLanguageTech(tech)) continue;
    const cats = TECHSTACK_CATEGORY_MAP[tech];
    if (cats) {
      for (const cat of cats) append(cat, tech);
    } else {
      unmatched.push(tech);
    }
  }
  if (unmatched.length) result._extra = unmatched;
  return result;
}
function mergeStackWithArchitecture(scanStack, architecture) {
  const result = JSON.parse(JSON.stringify(scanStack || {}));
  const push = (field, value) => {
    if (!value) return;
    if (!Array.isArray(result[field])) result[field] = result[field] ? [result[field]] : [];
    if (!result[field].includes(value)) result[field].push(value);
  };
  if (!architecture || !Array.isArray(architecture.components)) return result;
  const unmatched = [];
  for (const tech of collectArchitectureTechs(architecture)) {
    if (isLanguageTech(tech)) continue;
    const cats = STACK_CATEGORY_MAP[tech];
    if (cats) {
      for (const cat of cats) push(cat, tech);
    } else {
      unmatched.push(tech);
    }
  }
  if (unmatched.length) result._extra = Array.from(/* @__PURE__ */ new Set([...result._extra || [], ...unmatched]));
  return result;
}

// src/scanner.js
var IGNORE_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "__pycache__",
  ".venv",
  "venv",
  ".next",
  "target",
  ".DS_Store",
  ".idea",
  ".vscode",
  "coverage",
  ".turbo",
  ".cache",
  "out",
  ".project-brain"
  // 自身的專案腦資料目錄，不應被掃
]);
function shouldIgnoreDir(name2) {
  return IGNORE_DIRS.has(name2) || /^node_modules(?:[._-].*)?$/i.test(name2) || /(?:^|[._-])backup(?:[._-]|$)/i.test(name2) || /\.bak(?:[._-]|$)/i.test(name2);
}
function isPythonRequirementsName(name2) {
  const lower = String(name2 || "").toLowerCase();
  if (lower === "requirements.txt" || lower === "requirement.txt" || lower === "requirment.txt" || lower === "requirments.txt") return true;
  return /^requirements[-._][a-z0-9._-]+\.txt$/.test(lower);
}
var STACK_POPULARITY = {
  // === framework-frontend ===
  "React": 100,
  "Vue": 95,
  "Angular": 80,
  "Svelte": 70,
  "Solid": 45,
  "Preact": 50,
  "Next.js": 95,
  "Nuxt": 70,
  "SvelteKit": 65,
  "Remix": 55,
  "Astro": 50,
  "Qwik": 40,
  "SolidStart": 40,
  "Mithril": 20,
  "Ember": 25,
  "Stimulus": 35,
  "Lit": 40,
  "Yew": 30,
  "Streamlit": 70,
  "Gradio": 65,
  "Dash": 35,
  "Panel": 30,
  "NiceGUI": 25,
  "Taipy": 20,
  // === framework-backend ===
  "Express": 100,
  "Fastify": 60,
  "NestJS": 85,
  "Koa": 50,
  "Hapi": 35,
  "Hono": 55,
  "AdonisJS": 30,
  "LoopBack": 20,
  "Spring Boot": 100,
  "Spring Framework": 60,
  "Quarkus": 55,
  "Micronaut": 45,
  "FastAPI": 95,
  "Django": 90,
  "Flask": 75,
  "Sanic": 25,
  "Starlette": 35,
  "Litestar": 30,
  "aiohttp": 40,
  "Tornado": 35,
  "Pyramid": 15,
  "Bottle": 10,
  "CherryPy": 12,
  "Falcon": 25,
  "Masonite": 12,
  "Hug": 10,
  "Gin": 75,
  "Echo": 45,
  "Fiber": 50,
  "Chi": 40,
  "FastHTTP": 30,
  "Actix Web": 55,
  "Axum": 65,
  "Rocket": 45,
  "Warp": 25,
  "Tide": 15,
  "Salvo": 25,
  "Leptos": 30,
  "Dioxus": 35,
  "Go": 70,
  "Rust": 60,
  "Java": 70,
  "Kotlin": 55,
  "Scala": 40,
  "Scala (sbt)": 40,
  "Swift": 50,
  "Dart": 45,
  "C++": 55,
  "C#": 55,
  ".NET": 60,
  "PHP": 50,
  "Ruby": 55,
  // === webserver ===
  "Nginx": 100,
  "Apache": 80,
  "Caddy": 50,
  "Traefik": 55,
  "HAProxy": 50,
  // === database ===
  "PostgreSQL": 100,
  "MySQL": 85,
  "MongoDB": 80,
  "MariaDB": 55,
  "SQLite": 65,
  "ClickHouse": 55,
  "Cassandra": 35,
  "InfluxDB": 40,
  "DynamoDB": 55,
  "BigQuery": 50,
  "Snowflake": 45,
  "Redshift": 40,
  "libSQL": 25,
  "SQL": 30,
  // === cache ===
  "Redis": 100,
  "Memcached": 45,
  "Valkey": 60,
  "Node-Cache": 20,
  "Keyv": 15,
  "Dragonfly": 35,
  // === queue ===
  "Kafka": 95,
  "RabbitMQ": 90,
  "NATS": 55,
  "Bull": 50,
  "Celery": 65,
  "RQ": 30,
  "Dramatiq": 25,
  "Huey": 20,
  "arq": 25,
  "Upstash Kafka": 30,
  // === search ===
  "Elasticsearch": 80,
  "OpenSearch": 50,
  "Algolia": 50,
  "Meilisearch": 35,
  "Typesense": 40,
  // === container ===
  "Docker Compose": 100,
  "Docker": 90,
  "Kubernetes": 100,
  "Podman": 45,
  // === mobile / desktop ===
  "Flutter": 90,
  "React Native": 80,
  "Expo": 70,
  "Electron": 85,
  "Tauri": 60,
  "Neutralino": 25,
  "Flet": 30,
  "Wails": 25,
  // === iac ===
  "Terraform": 90,
  "Ansible": 70,
  "Pulumi": 50,
  "CloudFormation": 55,
  "Bicep": 45,
  "Helm": 65,
  "Kustomize": 45,
  // === ci ===
  "GitHub Actions": 100,
  "GitLab CI": 70,
  "Jenkins": 55,
  "CircleCI": 50,
  "Azure Pipelines": 45,
  "Travis CI": 30,
  "Bitbucket Pipelines": 25,
  "Drone": 25,
  // === observability ===
  "Prometheus": 90,
  "Grafana": 85,
  "Sentry": 80,
  "OpenTelemetry": 75,
  "Datadog": 70,
  "Datadog APM": 70,
  "Pino": 50,
  "Winston": 45,
  "Structlog": 40,
  "Loguru": 35,
  "Loki": 60,
  "Jaeger": 45,
  "Micrometer": 50,
  // === auth ===
  "Passport.js": 50,
  "Auth.js (NextAuth)": 70,
  "Clerk": 55,
  "Auth0": 50,
  "Supabase": 75,
  "Firebase": 75,
  "JWT": 60,
  "JOSE": 35,
  "Keycloak": 65,
  "Vault": 60,
  "OAuth2": 50,
  "OAuth2/OIDC": 55,
  "Django Auth": 35,
  "Flask-Login": 25,
  "Authlib": 40,
  "OAuthLib": 40,
  // === api ===
  "GraphQL": 85,
  "gRPC": 75,
  "OpenAPI/Swagger": 65,
  "tRPC": 55,
  "REST": 50,
  "MCP": 70,
  // === payment ===
  "Stripe": 90,
  "PayPal": 50,
  // === ai（v1.2.x patch #4：AI/ML 框架提升到主視野）===
  "LangChain": 90,
  "LangGraph": 88,
  "LlamaIndex": 75,
  "OpenAI SDK": 100,
  "Anthropic SDK": 95,
  "Google Generative AI": 75,
  "Cohere": 55,
  "Hugging Face": 85,
  "PyTorch": 90,
  "TensorFlow": 80,
  "JAX": 45,
  "scikit-learn": 75,
  "Keras": 60,
  "pandas": 70,
  "NumPy": 75,
  "Polars": 50,
  "Dask": 35,
  "Matplotlib": 60,
  "Seaborn": 40,
  "Plotly": 45,
  "Bokeh": 25,
  "Altair": 25,
  "Candle": 25,
  "tch (PyTorch)": 40,
  // === orm ===
  "Prisma": 95,
  "SQLAlchemy": 80,
  "TypeORM": 60,
  "Sequelize": 55,
  "Drizzle": 75,
  "Mongoose": 65,
  "Knex": 50,
  "MikroORM": 40,
  "Objection.js": 30,
  "Bookshelf": 20,
  "Waterline": 15,
  "SQLModel": 50,
  "Django ORM": 40,
  "Peewee": 25,
  "Tortoise ORM": 35,
  "Pony ORM": 20,
  "Ormar": 20,
  "Piccolo": 15,
  "dataset": 15,
  "GORM": 65,
  "Ent": 35,
  "sqlx": 55,
  "Bun": 35,
  "Diesel": 45,
  "SeaORM": 40,
  "Hibernate": 65,
  "MyBatis": 50
};
var STACK_DEFAULT_SCORE = 50;
function sortStackByPopularity(stack) {
  const score = (item) => STACK_POPULARITY[item] != null ? STACK_POPULARITY[item] : STACK_DEFAULT_SCORE;
  for (const field of Object.keys(stack)) {
    if (Array.isArray(stack[field])) {
      stack[field] = stack[field].slice().sort((a, b) => score(b) - score(a));
    }
  }
  return stack;
}
var AI_ML_TOOLING_TO_STACK = {
  "pandas": "pandas",
  "numpy": "NumPy",
  "polars": "Polars",
  "dask": "Dask",
  "scikit-learn": "scikit-learn",
  "pytorch": "PyTorch",
  "tensorflow": "TensorFlow",
  "jax": "JAX",
  "keras": "Keras",
  "transformers": "Hugging Face",
  "datasets": "Hugging Face",
  "huggingface-hub": "Hugging Face"
};
function promoteAIMLToStack(result) {
  if (!Array.isArray(result.tooling)) return;
  const remaining = [];
  for (const item of result.tooling) {
    const aiName = AI_ML_TOOLING_TO_STACK[item];
    if (aiName) {
      result.techStack && (function() {
        if (!Array.isArray(result.techStack.ai)) result.techStack.ai = result.techStack.ai ? [result.techStack.ai] : [];
        if (!result.techStack.ai.includes(aiName)) result.techStack.ai.push(aiName);
      })();
      if (!Array.isArray(result.stack.ai)) result.stack.ai = result.stack.ai ? [result.stack.ai] : [];
      if (!result.stack.ai.includes(aiName)) result.stack.ai.push(aiName);
    } else {
      remaining.push(item);
    }
  }
  result.tooling = remaining;
}
async function fallbackScanImports(fs, rootTarget, result) {
  const hasAny = Object.keys(result.stack).some((k) => Array.isArray(result.stack[k]) && result.stack[k].length > 0);
  if (hasAny) return;
  const MAX_FILES2 = 20;
  const MAX_LINE = 60;
  const candidates = [];
  async function walk(target, depth) {
    if (depth > 3 || candidates.length >= MAX_FILES2) return;
    let entries;
    try {
      entries = await fs.listDir(target);
    } catch (e) {
      return;
    }
    for (const e of entries) {
      if (candidates.length >= MAX_FILES2) return;
      if (!e || !e.name) continue;
      if (shouldIgnoreDir(e.name)) continue;
      const kind = e.type || (e.isDirectory ? "directory" : e.isFile ? "file" : "other");
      if (kind === "file" && /\.(py|js|ts|jsx|tsx|mjs)$/i.test(e.name)) {
        candidates.push(e);
      } else if (kind === "directory") {
        const subT = e.target || await childTarget(fs, target, e);
        if (subT) await walk(subT, depth + 1);
      }
    }
  }
  await walk(rootTarget, 0);
  const IMPORT_HINTS = {
    "fastapi": "framework-backend",
    "django": "framework-backend",
    "flask": "framework-backend",
    "starlette": "framework-backend",
    "aiohttp": "framework-backend",
    "tornado": "framework-backend",
    "sanic": "framework-backend",
    "falcon": "framework-backend",
    "hug": "framework-backend",
    "litestar": "framework-backend",
    "celery": "queue",
    "rq": "queue",
    "dramatiq": "queue",
    "sqlalchemy": "orm",
    "peewee": "orm",
    "tortoise": "orm",
    "pony": "orm",
    "dataset": "orm",
    "piccolo": "orm",
    "ormar": "orm",
    "pydantic": "framework-backend",
    "redis": "cache",
    "aioredis": "cache",
    "pymemcache": "cache",
    "pymongo": "database",
    "motor": "database",
    "asyncpg": "database",
    "psycopg2": "database",
    "psycopg": "database",
    "pymysql": "database",
    "aiomysql": "database",
    "mysqlclient": "database",
    "elasticsearch": "search",
    "opensearchpy": "search",
    "kafka": "queue",
    "aiokafka": "queue",
    "confluent_kafka": "queue",
    "nats": "queue",
    "boto3": "framework-backend",
    "pandas": "ai",
    "numpy": "ai",
    "polars": "ai",
    "dask": "ai",
    "sklearn": "ai",
    "scikit-learn": "ai",
    "scikit_learn": "ai",
    "torch": "ai",
    "tensorflow": "ai",
    "keras": "ai",
    "jax": "ai",
    "transformers": "ai",
    "datasets": "ai",
    "huggingface_hub": "ai",
    "langchain": "ai",
    "langchain_core": "ai",
    "langgraph": "ai",
    "llama_index": "ai",
    "openai": "ai",
    "anthropic": "ai",
    "cohere": "ai",
    "google.generativeai": "ai",
    "tiktoken": "ai",
    "matplotlib": "ai",
    "seaborn": "ai",
    "plotly": "ai",
    "bokeh": "ai",
    "altair": "ai",
    "streamlit": "framework-frontend",
    "gradio": "framework-frontend",
    "dash": "framework-frontend",
    "panel": "framework-frontend",
    "react": "framework-frontend",
    "vue": "framework-frontend",
    "svelte": "framework-frontend",
    "express": "framework-backend",
    "fastify": "framework-backend",
    "koa": "framework-backend",
    "hapi": "framework-backend",
    "hono": "framework-backend",
    "@nestjs/core": "framework-backend",
    "next": "framework-fullstack",
    "nuxt": "framework-fullstack",
    "electron": "desktop",
    "@tauri-apps/api": "desktop",
    "prisma": "orm",
    "typeorm": "orm",
    "sequelize": "orm",
    "drizzle-orm": "orm",
    "mongoose": "orm",
    "passport": "auth",
    "next-auth": "auth",
    "stripe": "payment"
  };
  const NAME_TO_DISPLAY = {
    "fastapi": "FastAPI",
    "django": "Django",
    "flask": "Flask",
    "starlette": "Starlette",
    "aiohttp": "aiohttp",
    "tornado": "Tornado",
    "sanic": "Sanic",
    "falcon": "Falcon",
    "hug": "Hug",
    "litestar": "Litestar",
    "celery": "Celery",
    "rq": "RQ",
    "dramatiq": "Dramatiq",
    "sqlalchemy": "SQLAlchemy",
    "peewee": "Peewee",
    "tortoise": "Tortoise ORM",
    "pony": "Pony ORM",
    "dataset": "dataset",
    "piccolo": "Piccolo",
    "ormar": "Ormar",
    "pydantic": "Pydantic",
    "redis": "Redis",
    "aioredis": "Redis",
    "pymemcache": "Memcached",
    "pymongo": "MongoDB",
    "motor": "MongoDB",
    "asyncpg": "PostgreSQL",
    "psycopg2": "PostgreSQL",
    "psycopg": "PostgreSQL",
    "pymysql": "MySQL",
    "aiomysql": "MySQL",
    "mysqlclient": "MySQL",
    "elasticsearch": "Elasticsearch",
    "opensearchpy": "OpenSearch",
    "kafka": "Kafka",
    "aiokafka": "Kafka",
    "confluent_kafka": "Kafka",
    "nats": "NATS",
    "boto3": "Boto3",
    "pandas": "pandas",
    "numpy": "NumPy",
    "polars": "Polars",
    "dask": "Dask",
    "sklearn": "scikit-learn",
    "scikit-learn": "scikit-learn",
    "scikit_learn": "scikit-learn",
    "torch": "PyTorch",
    "tensorflow": "TensorFlow",
    "keras": "Keras",
    "jax": "JAX",
    "transformers": "Hugging Face",
    "datasets": "Hugging Face",
    "huggingface_hub": "Hugging Face",
    "langchain": "LangChain",
    "langchain_core": "LangChain",
    "langgraph": "LangGraph",
    "llama_index": "LlamaIndex",
    "openai": "OpenAI SDK",
    "anthropic": "Anthropic SDK",
    "cohere": "Cohere",
    "google.generativeai": "Google Generative AI",
    "tiktoken": "tiktoken",
    "matplotlib": "Matplotlib",
    "seaborn": "Seaborn",
    "plotly": "Plotly",
    "bokeh": "Bokeh",
    "altair": "Altair",
    "streamlit": "Streamlit",
    "gradio": "Gradio",
    "dash": "Dash",
    "panel": "Panel",
    "react": "React",
    "vue": "Vue",
    "svelte": "Svelte",
    "express": "Express",
    "fastify": "Fastify",
    "koa": "Koa",
    "hapi": "Hapi",
    "hono": "Hono",
    "@nestjs/core": "NestJS",
    "next": "Next.js",
    "nuxt": "Nuxt",
    "electron": "Electron",
    "@tauri-apps/api": "Tauri",
    "prisma": "Prisma",
    "typeorm": "TypeORM",
    "sequelize": "Sequelize",
    "drizzle-orm": "Drizzle",
    "mongoose": "Mongoose",
    "passport": "Passport.js",
    "next-auth": "Auth.js (NextAuth)",
    "stripe": "Stripe"
  };
  const hits = {};
  for (const entry of candidates) {
    const target = entry.target || await childTarget(fs, rootTarget, entry);
    if (!target) continue;
    let txt;
    try {
      txt = await fs.readText(target);
    } catch (e) {
      continue;
    }
    if (!txt) continue;
    const lines = txt.split(/\n/).slice(0, MAX_LINE).join("\n");
    for (const [hint, field] of Object.entries(IMPORT_HINTS)) {
      const esc = hint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        // 1) Python: import foo (後跟空白/; /行尾)
        new RegExp(`(?:^|\\s)import\\s+['"]?` + esc + `['"]?(?:\\s*as\\s+\\w+|\\s|;|$)`, "m"),
        // 2) Python: from foo import / from foo.bar import
        new RegExp(`(?:^|\\s)from\\s+['"]?` + esc + `(?:\\.\\w+)?['"]?\\s+import`, "m"),
        // 3) JS/TS: from "foo" / from 'foo'
        new RegExp(`(?:^|\\s|;)from\\s+['"]` + esc + `(?:[/.][^'"]+)?['"]`, "m"),
        // 4) JS/TS: import x from "foo" / import "foo" / require("foo")
        new RegExp(`(?:^|\\s|;|\\()(?:import\\s+(?:[^'"]*\\s+from\\s+['"]` + esc + `(?:[/.][^'"]+)?['"]|['"]` + esc + `(?:[/.][^'"]+)?['"])|require\\(\\s*['"]` + esc + `(?:[/.][^'"]+)?['"]\\s*\\))`, "m")
      ];
      for (const re of patterns) {
        if (re.test(lines)) {
          hits[hint] = (hits[hint] || 0) + 1;
          break;
        }
      }
    }
  }
  for (const [hint, count] of Object.entries(hits)) {
    if (count < 1) continue;
    const field = IMPORT_HINTS[hint];
    const display = NAME_TO_DISPLAY[hint] || hint;
    if (!Array.isArray(result.stack[field])) result.stack[field] = result.stack[field] ? [result.stack[field]] : [];
    if (!result.stack[field].includes(display)) result.stack[field].push(display);
    const techField = STACK_FIELD_TO_TECHSTACK[field] || field;
    const cur = result.techStack[techField];
    if (!cur) result.techStack[techField] = display;
    else if (Array.isArray(cur)) {
      if (!cur.includes(display)) cur.push(display);
    } else if (cur !== display) result.techStack[techField] = [cur, display];
  }
}
var EXT_LANG = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".java": "java",
  ".rs": "rust",
  ".c": "c",
  ".h": "c",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".php": "php",
  ".rb": "ruby",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".swift": "swift",
  ".dart": "dart",
  ".scala": "scala",
  ".sh": "shell",
  ".sql": "sql",
  ".vue": "vue",
  ".svelte": "svelte"
};
function decodeReadmeEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, entity) => {
    if (entity[0] === "#") {
      const hex = entity[1].toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code > 0 && code <= 1114111 ? String.fromCodePoint(code) : all;
    }
    return named[entity.toLowerCase()] || all;
  });
}
function sanitizeProjectDescription(value) {
  if (!value) return null;
  const cleaned = decodeReadmeEntities(String(value).replace(/<!--([\s\S]*?)-->/g, " ").replace(/<(script|style|svg|picture)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<img\b[^>]*>/gi, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/<https?:\/\/[^>]+>/gi, " ").replace(/<[^>]+>/g, " ").replace(/https?:\/\/\S+/gi, " ").replace(/^\s{0,3}(?:#{1,6}|>|[-*+]\s+)\s*/gm, "").replace(/[*_~`|]+/g, " ")).replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, 500) : null;
}
function isMeaningfulDescription(value) {
  const text = String(value || "").trim();
  if (text.length < 12) return false;
  if (/^(?:english|中文|簡體中文|繁體中文|docs?|documentation|homepage)(?:\s*[|·/]\s*(?:english|中文|簡體中文|繁體中文|docs?|documentation|homepage))*$/i.test(text)) return false;
  const chinese = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const words = (text.match(/[A-Za-z0-9][A-Za-z0-9'_-]*/g) || []).length;
  return chinese >= 6 || words >= 3;
}
function firstReadmeParagraph(text) {
  if (!text) return null;
  const source = String(text).replace(/^\uFEFF/, "").replace(/<!--([\s\S]*?)-->/g, "");
  const lines = source.split(/\r?\n/);
  const parts = [];
  let started = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^```/.test(line)) {
      if (started && parts.length) break;
      continue;
    }
    if (/^#{1,6}\s+/.test(line) || /^<h[1-6]\b/i.test(line)) {
      if (started && parts.length) break;
      continue;
    }
    const visible = sanitizeProjectDescription(line);
    if (!visible || !isMeaningfulDescription(visible)) {
      if (started && parts.length && /^(?:[-*]\s|\d+\.\s|#{1,6}\s+)/.test(line)) break;
      continue;
    }
    started = true;
    parts.push(visible);
    if (parts.join(" ").length >= 360) break;
  }
  return sanitizeProjectDescription(parts.join(" "));
}
function processPathOf(fs, target) {
  return typeof fs.processPath === "function" ? fs.processPath(target) : String(target);
}
async function readText(fs, rootPath, name2) {
  try {
    const t = await fs.resolve(name2, { cwd: rootPath });
    return await fs.readText(t);
  } catch (e) {
    return null;
  }
}
function entryKind(e) {
  if (!e) return "other";
  if (typeof e.type === "string") {
    if (e.type === "file" || e.type === "directory" || e.type === "other") return e.type;
  }
  if (e.isFile === true) return "file";
  if (e.isDirectory === true) return "directory";
  if (typeof e.isFile === "function" && e.isFile()) return "file";
  if (typeof e.isDirectory === "function" && e.isDirectory()) return "directory";
  return "other";
}
async function childTarget(fs, parentTarget, entry) {
  if (entry && entry.target) return entry.target;
  try {
    return await fs.resolve(entry.name, { cwd: parentTarget });
  } catch (e) {
    return null;
  }
}
async function scanProject(fs, projectPath) {
  const rootTarget = await fs.resolve(projectPath);
  const rootPath = processPathOf(fs, rootTarget);
  function addTo(map, field, value) {
    if (!value) return;
    const cur = map[field];
    if (!cur) map[field] = value;
    else if (Array.isArray(cur)) {
      if (!cur.includes(value)) cur.push(value);
    } else if (cur !== value) map[field] = [cur, value];
  }
  function setStack(field, value) {
    addTo(result.techStack, field, value);
  }
  function pushStack(field, value) {
    if (!value) return;
    if (!Array.isArray(result.stack[field])) result.stack[field] = result.stack[field] ? [result.stack[field]] : [];
    if (!result.stack[field].includes(value)) result.stack[field].push(value);
  }
  const result = {
    projectName: null,
    description: null,
    techStack: {},
    // 老 schema（保留向後相容）
    stack: {},
    // 新 schema（主視野：框架/中介軟體/執行時）
    structure: [],
    // 程式碼結構標籤（Monorepo/Cargo Workspace）單獨
    languages: {},
    tooling: [],
    // 工程工具（構建/Lint/測試/型別/包管理）
    fileCount: 0,
    topLevel: [],
    entrypoints: [],
    files: []
  };
  let entries;
  try {
    entries = await fs.listDir(rootTarget);
  } catch (e) {
    return result;
  }
  result.topLevel = entries.map((e) => e && e.name).filter((n) => n && !shouldIgnoreDir(n)).slice().sort();
  const names = result.topLevel;
  if (names.includes("package.json")) {
    const txt = await readText(fs, rootPath, "package.json");
    if (txt) {
      try {
        const pkg = JSON.parse(txt);
        result.projectName = typeof pkg.name === "string" ? pkg.name : null;
        result.description = typeof pkg.description === "string" ? sanitizeProjectDescription(pkg.description) : null;
        const deps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
        if (deps.next) {
          setStack("fullstack", "Next.js");
          pushStack("framework-fullstack", "Next.js");
        } else if (deps.nuxt) {
          setStack("fullstack", "Nuxt");
          pushStack("framework-fullstack", "Nuxt");
        } else if (deps["@sveltejs/kit"]) {
          setStack("fullstack", "SvelteKit");
          pushStack("framework-fullstack", "SvelteKit");
        } else if (deps["remix"] || deps["@remix-run/react"]) {
          setStack("fullstack", "Remix");
          pushStack("framework-fullstack", "Remix");
        } else if (deps.astro) {
          setStack("fullstack", "Astro");
          pushStack("framework-fullstack", "Astro");
        } else if (deps["@builder.io/qwik"] || deps["@builder.io/qwik-city"]) {
          setStack("fullstack", "Qwik");
          pushStack("framework-fullstack", "Qwik");
        } else if (deps["solid-start"]) {
          setStack("fullstack", "SolidStart");
          pushStack("framework-fullstack", "SolidStart");
        }
        if (deps.express) {
          setStack("backend", "Express");
          pushStack("framework-backend", "Express");
        } else if (deps.fastify) {
          setStack("backend", "Fastify");
          pushStack("framework-backend", "Fastify");
        } else if (deps["@nestjs/core"]) {
          setStack("backend", "NestJS");
          pushStack("framework-backend", "NestJS");
        } else if (deps.koa) {
          setStack("backend", "Koa");
          pushStack("framework-backend", "Koa");
        } else if (deps.hapi || deps["@hapi/hapi"]) {
          setStack("backend", "Hapi");
          pushStack("framework-backend", "Hapi");
        } else if (deps["@adonisjs/core"]) {
          setStack("backend", "AdonisJS");
          pushStack("framework-backend", "AdonisJS");
        } else if (deps["@hono/node-server"] || deps.hono) {
          setStack("backend", "Hono");
          pushStack("framework-backend", "Hono");
        } else if (deps["@loopback/core"]) {
          setStack("backend", "LoopBack");
          pushStack("framework-backend", "LoopBack");
        } else if (deps["@nestjs/platform-express"]) {
        }
        if (deps.react) {
          setStack("frontend", "React");
          pushStack("framework-frontend", "React");
        } else if (deps.vue) {
          setStack("frontend", "Vue");
          pushStack("framework-frontend", "Vue");
        } else if (deps.svelte) {
          setStack("frontend", "Svelte");
          pushStack("framework-frontend", "Svelte");
        } else if (deps.solid || deps["solid-js"]) {
          setStack("frontend", "Solid");
          pushStack("framework-frontend", "Solid");
        } else if (deps.preact) {
          setStack("frontend", "Preact");
          pushStack("framework-frontend", "Preact");
        } else if (deps.angular || deps["@angular/core"]) {
          setStack("frontend", "Angular");
          pushStack("framework-frontend", "Angular");
        } else if (deps["@angular/material"]) {
        } else if (deps.mithril) {
          setStack("frontend", "Mithril");
          pushStack("framework-frontend", "Mithril");
        } else if (deps["ember-source"] || deps.ember) {
          setStack("frontend", "Ember");
          pushStack("framework-frontend", "Ember");
        } else if (deps["@hotwired/stimulus"]) {
          setStack("frontend", "Stimulus");
          pushStack("framework-frontend", "Stimulus");
        } else if (deps["lit-element"] || deps.lit || deps["@lit/reactive-element"]) {
          setStack("frontend", "Lit");
          pushStack("framework-frontend", "Lit");
        }
        if (deps.electron) {
          setStack("desktop", "Electron");
          pushStack("desktop", "Electron");
        }
        if (deps["react-native"]) {
          setStack("mobile", "React Native");
          pushStack("mobile", "React Native");
        }
        if (deps.expo) {
          setStack("mobile", "Expo");
          pushStack("mobile", "Expo");
        }
        if (deps["@tauri-apps/api"] || deps.tauri) {
          setStack("desktop", "Tauri");
          pushStack("desktop", "Tauri");
        }
        if (deps["@neutralino/neu"]) {
          setStack("desktop", "Neutralino");
          pushStack("desktop", "Neutralino");
        }
        if (deps.prisma || deps["@prisma/client"]) {
          setStack("orm", "Prisma");
          pushStack("orm", "Prisma");
        }
        if (deps.typeorm) {
          setStack("orm", "TypeORM");
          pushStack("orm", "TypeORM");
        }
        if (deps.sequelize || deps["sequelize-cli"]) {
          setStack("orm", "Sequelize");
          pushStack("orm", "Sequelize");
        }
        if (deps.mongoose) {
          setStack("orm", "Mongoose");
          pushStack("orm", "Mongoose");
        }
        if (deps["drizzle-orm"] || deps.drizzle) {
          setStack("orm", "Drizzle");
          pushStack("orm", "Drizzle");
        }
        if (deps.knex) {
          setStack("orm", "Knex");
          pushStack("orm", "Knex");
        }
        if (deps.mikro) {
          setStack("orm", "MikroORM");
          pushStack("orm", "MikroORM");
        }
        if (deps["@mikro-orm/core"]) {
          setStack("orm", "MikroORM");
          pushStack("orm", "MikroORM");
        }
        if (deps["@objection.js/objection"]) {
          setStack("orm", "Objection.js");
          pushStack("orm", "Objection.js");
        }
        if (deps.bookshelf) {
          setStack("orm", "Bookshelf");
          pushStack("orm", "Bookshelf");
        }
        if (deps.waterline) {
          setStack("orm", "Waterline");
          pushStack("orm", "Waterline");
        }
        if (deps.pg || deps["pg-promise"]) {
          setStack("database", "PostgreSQL");
          pushStack("database", "PostgreSQL");
        }
        if (deps.mysql || deps.mysql2) {
          setStack("database", "MySQL");
          pushStack("database", "MySQL");
        }
        if (deps["better-sqlite3"] || deps.sqlite3 || deps["@sqlite.org/sqlite-wasm"]) {
          setStack("database", "SQLite");
          pushStack("database", "SQLite");
        }
        if (deps.mongodb || deps["mongodb-memory-server"]) {
          setStack("database", "MongoDB");
          pushStack("database", "MongoDB");
        }
        if (deps["@libsql/client"]) {
          setStack("database", "libSQL");
          pushStack("database", "libSQL");
        }
        if (deps["@databases/mysql"] || deps["@databases/pg"] || deps["@databases/sqlite"]) {
        }
        if (deps["@clickhouse/client"]) {
          setStack("database", "ClickHouse");
          pushStack("database", "ClickHouse");
        }
        if (deps["@elastic/elasticsearch"]) {
          setStack("search", "Elasticsearch");
          pushStack("search", "Elasticsearch");
        }
        if (deps.algoliasearch) {
          setStack("search", "Algolia");
          pushStack("search", "Algolia");
        }
        if (deps.meilisearch) {
          setStack("search", "Meilisearch");
          pushStack("search", "Meilisearch");
        }
        if (deps.ioredis || deps.redis) {
          setStack("cache", "Redis");
          pushStack("cache", "Redis");
        }
        if (deps.memcached || deps.memjs) {
          setStack("cache", "Memcached");
          pushStack("cache", "Memcached");
        }
        if (deps["node-cache"]) {
          setStack("cache", "Node-Cache");
          pushStack("cache", "Node-Cache");
        }
        if (deps["@keyv/redis"] || deps.keyv) {
          setStack("cache", "Keyv");
          pushStack("cache", "Keyv");
        }
        if (deps.bull || deps.bullmq) {
          setStack("queue", "Bull");
          pushStack("queue", "Bull");
        }
        if (deps.amqplib) {
          setStack("queue", "RabbitMQ");
          pushStack("queue", "RabbitMQ");
        }
        if (deps["kafkajs"]) {
          setStack("queue", "Kafka");
          pushStack("queue", "Kafka");
        }
        if (deps["@upstash/kafka"]) {
          setStack("queue", "Upstash Kafka");
          pushStack("queue", "Upstash Kafka");
        }
        if (deps["nats.io"]) {
          setStack("queue", "NATS");
          pushStack("queue", "NATS");
        }
        if (deps["googleapis"]) {
        }
        if (deps.passport || deps["passport-jwt"]) {
          setStack("auth", "Passport.js");
          pushStack("auth", "Passport.js");
        }
        if (deps["next-auth"] || deps["@auth/core"]) {
          setStack("auth", "Auth.js (NextAuth)");
          pushStack("auth", "Auth.js (NextAuth)");
        }
        if (deps["@clerk/nextjs"] || deps["@clerk/clerk-sdk-node"]) {
          setStack("auth", "Clerk");
          pushStack("auth", "Clerk");
        }
        if (deps["@auth0/nextjs-auth0"]) {
          setStack("auth", "Auth0");
          pushStack("auth", "Auth0");
        }
        if (deps["@supabase/supabase-js"]) {
          setStack("auth", "Supabase");
          pushStack("auth", "Supabase");
        }
        if (deps["firebase"]) {
          setStack("auth", "Firebase");
          pushStack("auth", "Firebase");
        }
        if (deps["jsonwebtoken"]) {
          setStack("auth", "JWT");
          pushStack("auth", "JWT");
        }
        if (deps["jose"]) {
          setStack("auth", "JOSE");
          pushStack("auth", "JOSE");
        }
        if (deps["@grpc/grpc-js"] || deps["@grpc/proto-loader"]) {
          setStack("api", "gRPC");
          pushStack("api", "gRPC");
        }
        if (deps["graphql"] || deps["@apollo/server"]) {
          setStack("api", "GraphQL");
          pushStack("api", "GraphQL");
        }
        if (deps["@trpc/server"]) {
          setStack("api", "tRPC");
          pushStack("api", "tRPC");
        }
        if (deps["swagger-ui-express"] || deps["@nestjs/swagger"]) {
          setStack("api", "OpenAPI/Swagger");
          pushStack("api", "OpenAPI/Swagger");
        }
        if (deps["prom-client"]) {
          setStack("observability", "Prometheus");
          pushStack("observability", "Prometheus");
        }
        if (deps["@sentry/node"] || deps["@sentry/react-native"] || deps["@sentry/browser"]) {
          setStack("observability", "Sentry");
          pushStack("observability", "Sentry");
        }
        if (deps["@opentelemetry/api"] || deps["@opentelemetry/sdk-node"]) {
          setStack("observability", "OpenTelemetry");
          pushStack("observability", "OpenTelemetry");
        }
        if (deps["pino"]) {
          setStack("observability", "Pino");
          pushStack("observability", "Pino");
        }
        if (deps.winston) {
          setStack("observability", "Winston");
          pushStack("observability", "Winston");
        }
        if (deps["winston-pino"]) {
        }
        if (deps["dd-trace"]) {
          setStack("observability", "Datadog APM");
          pushStack("observability", "Datadog APM");
        }
        if (deps.stripe) {
          setStack("payment", "Stripe");
          pushStack("payment", "Stripe");
        }
        if (deps["@paypal/checkout-server-sdk"]) {
          setStack("payment", "PayPal");
          pushStack("payment", "PayPal");
        }
        if (deps["openai"]) {
          setStack("ai", "OpenAI SDK");
          pushStack("ai", "OpenAI SDK");
        }
        if (deps["@anthropic-ai/sdk"]) {
          setStack("ai", "Anthropic SDK");
          pushStack("ai", "Anthropic SDK");
        }
        if (deps["@google/generative-ai"]) {
          setStack("ai", "Google Generative AI");
          pushStack("ai", "Google Generative AI");
        }
        if (deps["cohere-ai"]) {
          setStack("ai", "Cohere");
          pushStack("ai", "Cohere");
        }
        if (deps["langchain"] || deps["@langchain/core"]) {
          setStack("ai", "LangChain");
          pushStack("ai", "LangChain");
        }
        if (deps["llamaindex"]) {
          setStack("ai", "LlamaIndex");
          pushStack("ai", "LlamaIndex");
        }
        if (deps.vite) result.tooling.push("Vite");
        if (deps.webpack) result.tooling.push("webpack");
        if (deps.esbuild) result.tooling.push("esbuild");
        if (deps.rollup) result.tooling.push("Rollup");
        if (deps.parcel) result.tooling.push("Parcel");
        if (deps.turbo) result.tooling.push("Turbopack");
        if (deps["@swc/core"]) result.tooling.push("SWC");
        if (deps.babel || deps["@babel/core"]) result.tooling.push("Babel");
        if (deps.tsup) result.tooling.push("tsup");
        if (deps.typescript) result.tooling.push("TypeScript");
        if (deps.eslint) result.tooling.push("ESLint");
        if (deps["@biomejs/biome"]) result.tooling.push("Biome");
        if (deps.prettier) result.tooling.push("Prettier");
        if (deps.jest) result.tooling.push("Jest");
        if (deps.vitest) result.tooling.push("Vitest");
        if (deps.mocha) result.tooling.push("Mocha");
        if (deps["ava"]) result.tooling.push("AVA");
        if (deps.tap) result.tooling.push("tap");
        if (deps["@playwright/test"] || deps.playwright) result.tooling.push("Playwright");
        if (deps.cypress) result.tooling.push("Cypress");
        if (deps.puppeteer) result.tooling.push("Puppeteer");
        if (deps["testcontainers"]) result.tooling.push("Testcontainers");
        if (deps.tailwindcss) result.tooling.push("Tailwind CSS");
        if (deps["styled-components"]) result.tooling.push("styled-components");
        if (deps["@emotion/react"]) result.tooling.push("Emotion");
        if (deps.sass || deps["sass-loader"]) result.tooling.push("Sass");
        if (deps["postcss"]) result.tooling.push("PostCSS");
        if (pkg.workspaces) {
          setStack("structure", "Monorepo");
          if (!result.structure.includes("Monorepo")) result.structure.push("Monorepo");
        }
        if (pkg.scripts && pkg.scripts.dev) {
          result.entrypoints.push({ path: "npm run dev", type: "script" });
        }
        if (pkg.scripts && pkg.scripts.build) {
          result.entrypoints.push({ path: "npm run build", type: "script" });
        }
      } catch (e) {
      }
    }
  }
  const requirementParts = [];
  for (const reqName of names.filter(isPythonRequirementsName)) {
    const txt = await readText(fs, rootPath, reqName);
    if (txt) requirementParts.push(txt);
  }
  const requirements = requirementParts.length ? requirementParts.join("\n") : null;
  const pyProject = names.includes("pyproject.toml") ? await readText(fs, rootPath, "pyproject.toml") : null;
  const pipfile = names.includes("Pipfile") ? await readText(fs, rootPath, "Pipfile") : null;
  const setupCfg = names.includes("setup.cfg") ? await readText(fs, rootPath, "setup.cfg") : null;
  const pyAllSources = [pyProject, requirements, pipfile, setupCfg].filter(Boolean).join("\n");
  const pyHas = (pkg) => {
    const re = new RegExp("(?:^|\\s|\\[|\\b)" + pkg + "(?:\\b|\\s|\\[|>=|<|=|!|~)", "i");
    return pyAllSources ? re.test(pyAllSources) : false;
  };
  if (pyHas("fastapi")) {
    setStack("backend", "FastAPI");
    pushStack("framework-backend", "FastAPI");
  } else if (pyHas("django")) {
    setStack("backend", "Django");
    pushStack("framework-backend", "Django");
  } else if (pyHas("flask")) {
    setStack("backend", "Flask");
    pushStack("framework-backend", "Flask");
  } else if (pyHas("sanic")) {
    setStack("backend", "Sanic");
    pushStack("framework-backend", "Sanic");
  } else if (pyHas("starlette")) {
    setStack("backend", "Starlette");
    pushStack("framework-backend", "Starlette");
  } else if (pyHas("aiohttp")) {
    setStack("backend", "aiohttp");
    pushStack("framework-backend", "aiohttp");
  } else if (pyHas("tornado")) {
    setStack("backend", "Tornado");
    pushStack("framework-backend", "Tornado");
  } else if (pyHas("pyramid")) {
    setStack("backend", "Pyramid");
    pushStack("framework-backend", "Pyramid");
  } else if (pyHas("bottle")) {
    setStack("backend", "Bottle");
    pushStack("framework-backend", "Bottle");
  } else if (pyHas("cherrypy")) {
    setStack("backend", "CherryPy");
    pushStack("framework-backend", "CherryPy");
  } else if (pyHas("falcon")) {
    setStack("backend", "Falcon");
    pushStack("framework-backend", "Falcon");
  } else if (pyHas("hug")) {
    setStack("backend", "Hug");
    pushStack("framework-backend", "Hug");
  } else if (pyHas("masonite")) {
    setStack("backend", "Masonite");
    pushStack("framework-backend", "Masonite");
  } else if (pyHas("litestar")) {
    setStack("backend", "Litestar");
    pushStack("framework-backend", "Litestar");
  } else if (pyHas("nevo")) {
  } else if (pyHas("streamlit")) {
    setStack("frontend", "Streamlit");
    pushStack("framework-frontend", "Streamlit");
  } else if (pyHas("gradio")) {
    setStack("frontend", "Gradio");
    pushStack("framework-frontend", "Gradio");
  } else if (pyHas("dash")) {
    setStack("frontend", "Dash");
    pushStack("framework-frontend", "Dash");
  } else if (pyHas("panel")) {
    setStack("frontend", "Panel");
    pushStack("framework-frontend", "Panel");
  } else if (pyHas("nicegui")) {
    setStack("frontend", "NiceGUI");
    pushStack("framework-frontend", "NiceGUI");
  } else if (pyHas("taipy")) {
    setStack("frontend", "Taipy");
    pushStack("framework-frontend", "Taipy");
  } else if (pyHas("flet")) {
    setStack("desktop", "Flet");
    pushStack("desktop", "Flet");
  }
  if (pyHas("sqlalchemy")) {
    setStack("orm", "SQLAlchemy");
    pushStack("orm", "SQLAlchemy");
  }
  if (pyHas("peewee")) {
    setStack("orm", "Peewee");
    pushStack("orm", "Peewee");
  }
  if (pyHas("tortoise-orm")) {
    setStack("orm", "Tortoise ORM");
    pushStack("orm", "Tortoise ORM");
  }
  if (pyHas("django")) {
    setStack("orm", "Django ORM");
    pushStack("orm", "Django ORM");
  }
  if (pyHas("sqlmodel")) {
    setStack("orm", "SQLModel");
    pushStack("orm", "SQLModel");
  }
  if (pyHas("pony")) {
    setStack("orm", "Pony ORM");
    pushStack("orm", "Pony ORM");
  }
  if (pyHas("ormar")) {
    setStack("orm", "Ormar");
    pushStack("orm", "Ormar");
  }
  if (pyHas("piccolo")) {
    setStack("orm", "Piccolo");
    pushStack("orm", "Piccolo");
  }
  if (pyHas("dataset")) {
    setStack("orm", "dataset");
    pushStack("orm", "dataset");
  }
  if (pyHas("asyncpg") || pyHas("psycopg2") || pyHas("psycopg")) {
    setStack("database", "PostgreSQL");
    pushStack("database", "PostgreSQL");
  }
  if (pyHas("aiomysql") || pyHas("pymysql") || pyHas("mysqlclient") || pyHas("mysql-connector-python")) {
    setStack("database", "MySQL");
    pushStack("database", "MySQL");
  }
  if (pyHas("pymongo") || pyHas("motor")) {
    setStack("database", "MongoDB");
    pushStack("database", "MongoDB");
  }
  if (pyHas("sqlite3") || pyHas("aiosqlite")) {
    setStack("database", "SQLite");
    pushStack("database", "SQLite");
  }
  if (pyHas("clickhouse-driver")) {
    setStack("database", "ClickHouse");
    pushStack("database", "ClickHouse");
  }
  if (pyHas("cassandra-driver")) {
    setStack("database", "Cassandra");
    pushStack("database", "Cassandra");
  }
  if (pyHas("influxdb-client")) {
    setStack("database", "InfluxDB");
    pushStack("database", "InfluxDB");
  }
  if (pyHas("elasticsearch")) {
    setStack("search", "Elasticsearch");
    pushStack("search", "Elasticsearch");
  }
  if (pyHas("opensearchpy")) {
    setStack("search", "OpenSearch");
    pushStack("search", "OpenSearch");
  }
  if (pyHas("redis") || pyHas("aioredis")) {
    setStack("cache", "Redis");
    pushStack("cache", "Redis");
  }
  if (pyHas("pymemcache")) {
    setStack("cache", "Memcached");
    pushStack("cache", "Memcached");
  }
  if (pyHas("celery")) {
    setStack("queue", "Celery");
    pushStack("queue", "Celery");
  }
  if (pyHas("rq")) {
    setStack("queue", "RQ");
    pushStack("queue", "RQ");
  }
  if (pyHas("dramatiq")) {
    setStack("queue", "Dramatiq");
    pushStack("queue", "Dramatiq");
  }
  if (pyHas("huey")) {
    setStack("queue", "Huey");
    pushStack("queue", "Huey");
  }
  if (pyHas("arq")) {
    setStack("queue", "arq");
    pushStack("queue", "arq");
  }
  if (pyHas("kombu")) {
  }
  if (pyHas("pika")) {
    setStack("queue", "RabbitMQ");
    pushStack("queue", "RabbitMQ");
  }
  if (pyHas("confluent-kafka") || pyHas("aiokafka")) {
    setStack("queue", "Kafka");
    pushStack("queue", "Kafka");
  }
  if (pyHas("nats-py")) {
    setStack("queue", "NATS");
    pushStack("queue", "NATS");
  }
  if (pyHas("django-allauth") || pyHas("django.contrib.auth")) {
    setStack("auth", "Django Auth");
    pushStack("auth", "Django Auth");
  }
  if (pyHas("flask-login") || pyHas("flask-security")) {
    setStack("auth", "Flask-Login");
    pushStack("auth", "Flask-Login");
  }
  if (pyHas("authlib")) {
    setStack("auth", "Authlib");
    pushStack("auth", "Authlib");
  }
  if (pyHas("python-jose") || pyHas("pyjwt")) {
    setStack("auth", "JWT");
    pushStack("auth", "JWT");
  }
  if (pyHas("oauthlib")) {
    setStack("auth", "OAuthLib");
    pushStack("auth", "OAuthLib");
  }
  if (pyHas("sentry-sdk")) {
    setStack("observability", "Sentry");
    pushStack("observability", "Sentry");
  }
  if (pyHas("prometheus-client") || pyHas("prometheus_flask_exporter")) {
    setStack("observability", "Prometheus");
    pushStack("observability", "Prometheus");
  }
  if (pyHas("opentelemetry-api") || pyHas("opentelemetry-sdk")) {
    setStack("observability", "OpenTelemetry");
    pushStack("observability", "OpenTelemetry");
  }
  if (pyHas("structlog")) {
    setStack("observability", "Structlog");
    pushStack("observability", "Structlog");
  }
  if (pyHas("loguru")) {
    setStack("observability", "Loguru");
    pushStack("observability", "Loguru");
  }
  if (pyHas("pandas")) {
    setStack("ai", "pandas");
    pushStack("ai", "pandas");
  }
  if (pyHas("numpy")) {
    setStack("ai", "NumPy");
    pushStack("ai", "NumPy");
  }
  if (pyHas("polars")) {
    setStack("ai", "Polars");
    pushStack("ai", "Polars");
  }
  if (pyHas("dask")) {
    setStack("ai", "Dask");
    pushStack("ai", "Dask");
  }
  if (pyHas("scikit-learn")) {
    setStack("ai", "scikit-learn");
    pushStack("ai", "scikit-learn");
  }
  if (pyHas("torch")) {
    setStack("ai", "PyTorch");
    pushStack("ai", "PyTorch");
  }
  if (pyHas("tensorflow") || pyHas("keras")) {
    setStack("ai", "TensorFlow");
    pushStack("ai", "TensorFlow");
  }
  if (pyHas("jax") || pyHas("flax")) {
    setStack("ai", "JAX");
    pushStack("ai", "JAX");
  }
  if (pyHas("openai")) {
    setStack("ai", "OpenAI SDK");
    pushStack("ai", "OpenAI SDK");
  }
  if (pyHas("anthropic")) {
    setStack("ai", "Anthropic SDK");
    pushStack("ai", "Anthropic SDK");
  }
  if (pyHas("google-generativeai")) {
    setStack("ai", "Google Generative AI");
    pushStack("ai", "Google Generative AI");
  }
  if (pyHas("cohere")) {
    setStack("ai", "Cohere");
    pushStack("ai", "Cohere");
  }
  if (pyHas("langchain") || pyHas("langchain-core")) {
    setStack("ai", "LangChain");
    pushStack("ai", "LangChain");
  }
  if (pyHas("langgraph")) {
    setStack("ai", "LangGraph");
    pushStack("ai", "LangGraph");
  }
  if (pyHas("llama-index")) {
    setStack("ai", "LlamaIndex");
    pushStack("ai", "LlamaIndex");
  }
  if (pyHas("huggingface-hub") || pyHas("transformers")) {
    setStack("ai", "Hugging Face");
    pushStack("ai", "Hugging Face");
  }
  if (pyHas("pytest")) result.tooling.push("pytest");
  if (pyHas("ruff")) result.tooling.push("Ruff");
  if (pyHas("black")) result.tooling.push("Black");
  if (pyHas("mypy")) result.tooling.push("mypy");
  if (pyHas("flake8")) result.tooling.push("flake8");
  if (pyHas("isort")) result.tooling.push("isort");
  if (pyHas("pylint")) result.tooling.push("pylint");
  if (pyProject && /\[tool\.poetry\]/.test(pyProject)) result.tooling.push("Poetry");
  if (pyProject && /\[tool\.uv\]/.test(pyProject)) result.tooling.push("uv");
  if (pyProject && /\[tool\.hatch/.test(pyProject)) result.tooling.push("Hatch");
  if (pyProject && /\[tool\.pdm\.projects\]/.test(pyProject)) result.tooling.push("PDM");
  if (pyProject && /\[tool\.rye\]/.test(pyProject)) result.tooling.push("Rye");
  if (pyProject && /\[tool\.pixi\]/.test(pyProject)) result.tooling.push("Pixi");
  if (pyProject && /setup\.py|setuptools/.test(pyProject) && !/Poetry|uv|Hatch|PDM/.test(result.tooling.join(","))) result.tooling.push("setuptools");
  const goMod = names.includes("go.mod") ? await readText(fs, rootPath, "go.mod") : null;
  if (goMod) {
    setStack("backend", "Go");
    pushStack("framework-backend", "Go");
    if (/gorm\.io\/gorm/.test(goMod)) {
      setStack("orm", "GORM");
      pushStack("orm", "GORM");
    }
    if (/ent\.go/.test(goMod)) {
      setStack("orm", "Ent");
      pushStack("orm", "Ent");
    }
    if (/sqlx/.test(goMod)) {
      setStack("orm", "sqlx");
      pushStack("orm", "sqlx");
    }
    if (/bun\.build/.test(goMod)) {
      setStack("orm", "Bun");
      pushStack("orm", "Bun");
    }
    if (/pgx|lib\/pq/.test(goMod)) {
      setStack("database", "PostgreSQL");
      pushStack("database", "PostgreSQL");
    }
    if (/go-sql-driver\/mysql/.test(goMod)) {
      setStack("database", "MySQL");
      pushStack("database", "MySQL");
    }
    if (/mongo-driver/.test(goMod)) {
      setStack("database", "MongoDB");
      pushStack("database", "MongoDB");
    }
    if (/go-redis\/redis/.test(goMod)) {
      setStack("cache", "Redis");
      pushStack("cache", "Redis");
    }
    if (/valkey/.test(goMod)) {
      setStack("cache", "Valkey");
      pushStack("cache", "Valkey");
    }
    if (/clickhouse-go/.test(goMod)) {
      setStack("database", "ClickHouse");
      pushStack("database", "ClickHouse");
    }
    if (/gin-gonic\/gin/.test(goMod)) {
      setStack("backend", "Gin");
      pushStack("framework-backend", "Gin");
    } else if (/labstack\/echo/.test(goMod)) {
      setStack("backend", "Echo");
      pushStack("framework-backend", "Echo");
    } else if (/gofiber\/fiber/.test(goMod)) {
      setStack("backend", "Fiber");
      pushStack("framework-backend", "Fiber");
    } else if (/go-chi\/chi/.test(goMod)) {
      setStack("backend", "Chi");
      pushStack("framework-backend", "Chi");
    } else if (/valyala\/fasthttp/.test(goMod)) {
      setStack("backend", "FastHTTP");
      pushStack("framework-backend", "FastHTTP");
    } else if (/grpc-ecosystem\/grpc-gateway/.test(goMod)) {
      setStack("api", "gRPC");
      pushStack("api", "gRPC");
    } else if (/99designs\/gqlgen/.test(goMod)) {
      setStack("api", "GraphQL");
      pushStack("api", "GraphQL");
    }
    if (/segmentio\/kafka-go/.test(goMod) || /confluentinc\/confluent-kafka-go/.test(goMod)) {
      setStack("queue", "Kafka");
      pushStack("queue", "Kafka");
    }
    if (/nats-io\/nats\.go/.test(goMod)) {
      setStack("queue", "NATS");
      pushStack("queue", "NATS");
    }
    if (/streadway\/amqp/.test(goMod) || /rabbitmq\/amqp091-go/.test(goMod)) {
      setStack("queue", "RabbitMQ");
      pushStack("queue", "RabbitMQ");
    }
    if (/golang-jwt\/jwt/.test(goMod) || /lestrrat-go\/jxw/.test(goMod)) {
      setStack("auth", "JWT");
      pushStack("auth", "JWT");
    }
    if (/coreos\/go-oidc/.test(goMod) || /oauth2/.test(goMod)) {
      setStack("auth", "OAuth2/OIDC");
      pushStack("auth", "OAuth2/OIDC");
    }
    if (/prometheus\/client_golang/.test(goMod)) {
      setStack("observability", "Prometheus");
      pushStack("observability", "Prometheus");
    }
    if (/getsentry\/sentry-go/.test(goMod)) {
      setStack("observability", "Sentry");
      pushStack("observability", "Sentry");
    }
    if (/opentelemetry\/otel/.test(goMod)) {
      setStack("observability", "OpenTelemetry");
      pushStack("observability", "OpenTelemetry");
    }
    if (/sashabaranov\/go-openai/.test(goMod)) {
      setStack("ai", "OpenAI SDK");
      pushStack("ai", "OpenAI SDK");
    }
    if (/anthropics\/anthropic-sdk-go/.test(goMod)) {
      setStack("ai", "Anthropic SDK");
      pushStack("ai", "Anthropic SDK");
    }
  }
  const pomXml = names.includes("pom.xml") ? await readText(fs, rootPath, "pom.xml") : null;
  const buildGradle = names.some((n) => n === "build.gradle" || n === "build.gradle.kts") ? await readText(fs, rootPath, names.find((n) => n === "build.gradle" || n === "build.gradle.kts")) : null;
  if (pomXml || buildGradle) {
    const javaText = (pomXml || "") + "\n" + (buildGradle || "");
    if (/spring-boot-starter|spring-boot-starter-web|spring-boot-starter-data/i.test(javaText)) {
      setStack("backend", "Spring Boot");
      pushStack("framework-backend", "Spring Boot");
    } else if (/spring-framework/i.test(javaText)) {
      setStack("backend", "Spring (Maven)");
      pushStack("framework-backend", "Spring Framework");
    } else if (pomXml || buildGradle) {
      setStack("backend", "Java");
      pushStack("framework-backend", "Java");
    }
    if (/quarkus/.test(javaText)) {
      setStack("framework-backend", "Quarkus");
      pushStack("framework-backend", "Quarkus");
    }
    if (/micronaut/.test(javaText)) {
      setStack("framework-backend", "Micronaut");
      pushStack("framework-backend", "Micronaut");
    }
    if (/jakarta\.ee|javax\.servlet|jakarta\.servlet/.test(javaText)) {
    }
    if (/hibernate|spring-data-jpa/.test(javaText)) {
      setStack("orm", "Hibernate");
      pushStack("orm", "Hibernate");
    }
    if (/mybatis/.test(javaText)) {
      setStack("orm", "MyBatis");
      pushStack("orm", "MyBatis");
    }
    if (/spring-data-mongodb/.test(javaText)) {
      setStack("database", "MongoDB");
      pushStack("database", "MongoDB");
    }
    if (/spring-data-redis/.test(javaText)) {
      setStack("cache", "Redis");
      pushStack("cache", "Redis");
    }
    if (/spring-kafka/.test(javaText)) {
      setStack("queue", "Kafka");
      pushStack("queue", "Kafka");
    }
    if (/rabbitmq|spring-amqp/.test(javaText)) {
      setStack("queue", "RabbitMQ");
      pushStack("queue", "RabbitMQ");
    }
    if (/spring-cloud|micrometer/.test(javaText)) {
      setStack("observability", "Micrometer");
      pushStack("observability", "Micrometer");
    }
    if (pomXml && /gradle/.test(pomXml)) {
    }
  }
  if (names.some((n) => /\.kt$|\.kts$/i.test(n))) {
    setStack("framework-backend", "Kotlin");
    pushStack("framework-backend", "Kotlin");
  }
  if (names.some((n) => /\.scala$|sbt$/i.test(n))) {
    if (names.includes("build.sbt")) {
      setStack("framework-backend", "Scala (sbt)");
      pushStack("framework-backend", "Scala (sbt)");
    } else {
      setStack("framework-backend", "Scala");
      pushStack("framework-backend", "Scala");
    }
  }
  if (names.includes("pubspec.yaml")) {
    const pubspec = await readText(fs, rootPath, "pubspec.yaml");
    if (pubspec) {
      if (/^flutter\s*:/m.test(pubspec) || /\bflutter\s*:\s*[\s\S]*sdk:\s*flutter/m.test(pubspec)) {
        setStack("mobile", "Flutter");
        pushStack("mobile", "Flutter");
      } else {
        setStack("framework-backend", "Dart");
        pushStack("framework-backend", "Dart");
      }
      if (/^name:\s*(\S+)/m.test(pubspec)) {
        const match = pubspec.match(/^name:\s*(\S+)/m);
        if (match && !result.projectName) result.projectName = match[1];
      }
    }
  }
  if (names.some((n) => /\.csproj$|\.sln$|\.fsproj$/i.test(n))) {
    setStack("framework-backend", ".NET");
    pushStack("framework-backend", ".NET");
  }
  if (names.some((n) => /\.csproj$/.test(n))) {
  }
  const cargoToml = names.includes("Cargo.toml") ? await readText(fs, rootPath, "Cargo.toml") : null;
  if (cargoToml) {
    setStack("backend", "Rust");
    pushStack("framework-backend", "Rust");
    if (/\[workspace\]/.test(cargoToml)) {
      setStack("structure", "Cargo Workspace");
      if (!result.structure.includes("Cargo Workspace")) result.structure.push("Cargo Workspace");
    }
    if (/^actix-web\s*=/m.test(cargoToml)) {
      setStack("backend", "Actix Web");
      pushStack("framework-backend", "Actix Web");
    } else if (/^axum\s*=/m.test(cargoToml)) {
      setStack("backend", "Axum");
      pushStack("framework-backend", "Axum");
    } else if (/^rocket\s*=/m.test(cargoToml)) {
      setStack("backend", "Rocket");
      pushStack("framework-backend", "Rocket");
    } else if (/^warp\s*=/m.test(cargoToml)) {
      setStack("backend", "Warp");
      pushStack("framework-backend", "Warp");
    } else if (/^tide\s*=/m.test(cargoToml)) {
      setStack("backend", "Tide");
      pushStack("framework-backend", "Tide");
    } else if (/^salvo\s*=/m.test(cargoToml)) {
      setStack("backend", "Salvo");
      pushStack("framework-backend", "Salvo");
    } else if (/^leptos\s*=/m.test(cargoToml)) {
      setStack("framework-fullstack", "Leptos");
      pushStack("framework-fullstack", "Leptos");
    } else if (/^dioxus\s*=/m.test(cargoToml)) {
      setStack("framework-fullstack", "Dioxus");
      pushStack("framework-fullstack", "Dioxus");
    } else if (/^yew\s*=/m.test(cargoToml)) {
      setStack("framework-frontend", "Yew");
      pushStack("framework-frontend", "Yew");
    } else if (/^tauri\s*=/m.test(cargoToml)) {
      setStack("desktop", "Tauri");
      pushStack("desktop", "Tauri");
    }
    if (/^diesel\s*=/m.test(cargoToml)) {
      setStack("orm", "Diesel");
      pushStack("orm", "Diesel");
    }
    if (/^sea-orm\s*=/m.test(cargoToml)) {
      setStack("orm", "SeaORM");
      pushStack("orm", "SeaORM");
    }
    if (/^sqlx\s*=/m.test(cargoToml)) {
      setStack("orm", "SQLx");
      pushStack("orm", "SQLx");
    }
    if (/^rusqlite\s*=/m.test(cargoToml)) {
      setStack("database", "SQLite");
      pushStack("database", "SQLite");
    }
    if (/^postgres\s*=/m.test(cargoToml)) {
      setStack("database", "PostgreSQL");
      pushStack("database", "PostgreSQL");
    }
    if (/^mysql\s*=/m.test(cargoToml)) {
      setStack("database", "MySQL");
      pushStack("database", "MySQL");
    }
    if (/^redis\s*=/m.test(cargoToml)) {
      setStack("cache", "Redis");
      pushStack("cache", "Redis");
    }
    if (/^tonic\s*=/m.test(cargoToml)) {
      setStack("api", "gRPC");
      pushStack("api", "gRPC");
    }
    if (/^jsonwebtoken\s*=/m.test(cargoToml)) {
      setStack("auth", "JWT");
      pushStack("auth", "JWT");
    }
    if (/^oauth2\s*=/m.test(cargoToml)) {
      setStack("auth", "OAuth2");
      pushStack("auth", "OAuth2");
    }
    if (/async-openai/.test(cargoToml)) {
      setStack("ai", "OpenAI SDK");
      pushStack("ai", "OpenAI SDK");
    }
    if (/anthropic-sdk-rs|anthropic-rs/.test(cargoToml)) {
      setStack("ai", "Anthropic SDK");
      pushStack("ai", "Anthropic SDK");
    }
    if (/candle-core/.test(cargoToml)) {
      setStack("ai", "Candle");
      pushStack("ai", "Candle");
    }
    if (/tch-rs/.test(cargoToml)) {
      setStack("ai", "tch (PyTorch)");
      pushStack("ai", "tch (PyTorch)");
    }
    if (/^tokio\s*=/m.test(cargoToml)) result.tooling.push("Tokio");
    if (/^serde\s*=/m.test(cargoToml)) result.tooling.push("Serde");
  }
  const dockerfileNames = names.filter((n) => /^Dockerfile(\..+)?$/.test(n));
  if (dockerfileNames.length > 0) {
    setStack("container", "Docker");
    pushStack("container", "Docker");
  }
  for (const df of dockerfileNames) {
    const txt = await readText(fs, rootPath, df);
    if (!txt) continue;
    const fromRe = /^\s*FROM\s+([^\s]+)/gm;
    let m;
    while ((m = fromRe.exec(txt)) !== null) {
      const img = m[1].toLowerCase();
      if (/(^|\/)nginx\b/.test(img)) {
        setStack("webserver", "Nginx");
        pushStack("webserver", "Nginx");
      }
      if (/(^|\/)caddy\b/.test(img)) {
        setStack("webserver", "Caddy");
        pushStack("webserver", "Caddy");
      }
      if (/(^|\/)traefik\b/.test(img)) {
        setStack("webserver", "Traefik");
        pushStack("webserver", "Traefik");
      }
      if (/(^|\/)(apache|httpd)\b/.test(img)) {
        setStack("webserver", "Apache");
        pushStack("webserver", "Apache");
      }
    }
  }
  const composeNames = names.filter((n) => /^(docker-compose|compose)(\..+)?\.(yml|yaml)$/.test(n));
  for (const cf of composeNames) {
    const txt = await readText(fs, rootPath, cf);
    if (!txt) continue;
    setStack("container", "Docker Compose");
    pushStack("container", "Docker Compose");
    const lower = txt.toLowerCase();
    if (/image:\s*(nginx|caddy|traefik|httpd|apache)/i.test(txt)) {
    }
    const imageRe = /image:\s*([^\s]+)/gi;
    let m;
    while ((m = imageRe.exec(txt)) !== null) {
      const img = m[1].toLowerCase().replace(/['"]/g, "");
      if (/(^|\/)nginx\b/.test(img)) {
        setStack("webserver", "Nginx");
        pushStack("webserver", "Nginx");
      }
      if (/(^|\/)caddy\b/.test(img)) {
        setStack("webserver", "Caddy");
        pushStack("webserver", "Caddy");
      }
      if (/(^|\/)traefik\b/.test(img)) {
        setStack("webserver", "Traefik");
        pushStack("webserver", "Traefik");
      }
      if (/(^|\/)(apache|httpd)\b/.test(img)) {
        setStack("webserver", "Apache");
        pushStack("webserver", "Apache");
      }
      if (/(^|\/)redis\b/.test(img)) {
        setStack("cache", "Redis");
        pushStack("cache", "Redis");
      }
      if (/(^|\/)postgres\b/.test(img)) {
        setStack("database", "PostgreSQL");
        pushStack("database", "PostgreSQL");
      }
      if (/(^|\/)mysql\b/.test(img)) {
        setStack("database", "MySQL");
        pushStack("database", "MySQL");
      }
      if (/(^|\/)mariadb\b/.test(img)) {
        setStack("database", "MariaDB");
        pushStack("database", "MariaDB");
      }
      if (/(^|\/)mongo\b/.test(img)) {
        setStack("database", "MongoDB");
        pushStack("database", "MongoDB");
      }
      if (/(^|\/)elasticsearch\b/.test(img)) {
        setStack("search", "Elasticsearch");
        pushStack("search", "Elasticsearch");
      }
      if (/(^|\/)rabbitmq\b/.test(img)) {
        setStack("queue", "RabbitMQ");
        pushStack("queue", "RabbitMQ");
      }
      if (/(^|\/)kafka\b/.test(img)) {
        setStack("queue", "Kafka");
        pushStack("queue", "Kafka");
      }
      if (/(^|\/)nats\b/.test(img)) {
        setStack("queue", "NATS");
        pushStack("queue", "NATS");
      }
      if (/(^|\/)clickhouse\b/.test(img)) {
        setStack("database", "ClickHouse");
        pushStack("database", "ClickHouse");
      }
      if (/(^|\/)grafana\b/.test(img)) {
        setStack("observability", "Grafana");
        pushStack("observability", "Grafana");
      }
      if (/(^|\/)prometheus\b/.test(img)) {
        setStack("observability", "Prometheus");
        pushStack("observability", "Prometheus");
      }
      if (/(^|\/)loki\b/.test(img)) {
        setStack("observability", "Loki");
        pushStack("observability", "Loki");
      }
      if (/(^|\/)traefik\b/.test(img)) {
      }
      if (/(^|\/)keycloak\b/.test(img)) {
        setStack("auth", "Keycloak");
        pushStack("auth", "Keycloak");
      }
      if (/(^|\/)vault\b/.test(img)) {
        setStack("auth", "Vault");
        pushStack("auth", "Vault");
      }
    }
  }
  if (names.includes("Caddyfile")) {
    setStack("webserver", "Caddy");
    pushStack("webserver", "Caddy");
  }
  if (names.some((n) => /^nginx(\..+)?\.conf$|^nginx\.conf$/.test(n))) {
    setStack("webserver", "Nginx");
    pushStack("webserver", "Nginx");
  }
  if (names.some((n) => /^traefik(\..+)?\.yml$|^traefik(\..+)?\.yaml$/.test(n))) {
    setStack("webserver", "Traefik");
    pushStack("webserver", "Traefik");
  }
  if (names.includes("k8s") || names.includes("kubernetes")) {
    setStack("iac", "Kubernetes");
    pushStack("iac", "Kubernetes");
  }
  if (names.some((n) => /(^|\/)deployment\.ya?ml$|(^|\/)service\.ya?ml$|(^|\/)ingress\.ya?ml$|(^|\/)statefulset\.ya?ml$|(^|\/)configmap\.ya?ml$/.test(n))) {
    setStack("iac", "Kubernetes");
    pushStack("iac", "Kubernetes");
  }
  if (names.includes("Chart.yaml") || names.some((n) => /^charts?\/[^\/]+\/Chart\.yaml$/.test(n))) {
    setStack("iac", "Helm");
    pushStack("iac", "Helm");
  }
  if (names.includes("kustomization.yaml") || names.includes("kustomization.yml")) {
    setStack("iac", "Kustomize");
    pushStack("iac", "Kustomize");
  }
  if (names.some((n) => n.endsWith(".tf"))) {
    setStack("iac", "Terraform");
    pushStack("iac", "Terraform");
  }
  if (names.some((n) => /\.tfstate$/.test(n))) {
  }
  if (names.includes("Pulumi.yaml") || names.includes("Pulumi.yml")) {
    setStack("iac", "Pulumi");
    pushStack("iac", "Pulumi");
  }
  if (names.includes("ansible.cfg") || names.some((n) => /^playbook\.ya?ml$|roles\//.test(n))) {
    setStack("iac", "Ansible");
    pushStack("iac", "Ansible");
  }
  if (names.some((n) => /^cloudformation\/|\.cf\.json$|\.cfn\.yaml$|\.cfn\.yml$/.test(n))) {
    setStack("iac", "CloudFormation");
    pushStack("iac", "CloudFormation");
  }
  if (names.some((n) => /\.bicep$/.test(n))) {
    setStack("iac", "Bicep");
    pushStack("iac", "Bicep");
  }
  if (names.includes(".github")) {
    setStack("ci", "GitHub Actions");
    pushStack("ci", "GitHub Actions");
  }
  if (names.includes(".gitlab-ci.yml")) {
    setStack("ci", "GitLab CI");
    pushStack("ci", "GitLab CI");
  }
  if (names.includes(".circleci")) {
    setStack("ci", "CircleCI");
    pushStack("ci", "CircleCI");
  }
  if (names.includes("Jenkinsfile")) {
    setStack("ci", "Jenkins");
    pushStack("ci", "Jenkins");
  }
  if (names.includes(".travis.yml")) {
    setStack("ci", "Travis CI");
    pushStack("ci", "Travis CI");
  }
  if (names.some((n) => /^azure-pipelines.*\.yml$/.test(n))) {
    setStack("ci", "Azure Pipelines");
    pushStack("ci", "Azure Pipelines");
  }
  if (names.some((n) => /^bitbucket-pipelines\.yml$/.test(n))) {
    setStack("ci", "Bitbucket Pipelines");
    pushStack("ci", "Bitbucket Pipelines");
  }
  if (names.some((n) => /^\.drone\.yml$|^drone\.yml$/.test(n))) {
    setStack("ci", "Drone");
    pushStack("ci", "Drone");
  }
  if (names.includes("pnpm-lock.yaml") || names.includes("pnpm-workspace.yaml")) result.tooling.push("pnpm");
  if (names.includes("yarn.lock")) result.tooling.push("Yarn");
  if (names.includes("package-lock.json")) result.tooling.push("npm");
  if (names.includes("bun.lockb") || names.includes("bun.lock")) result.tooling.push("Bun");
  if (names.includes("pnpm-workspace.yaml") || names.includes("turbo.json") || names.includes("nx.json")) {
    setStack("structure", "Monorepo");
    if (!result.structure.includes("Monorepo")) result.structure.push("Monorepo");
  }
  if (names.includes("lerna.json")) {
    setStack("structure", "Lerna Monorepo");
    if (!result.structure.includes("Lerna Monorepo")) result.structure.push("Lerna Monorepo");
  }
  if (names.includes("rush.json")) {
    setStack("structure", "Rush Monorepo");
    if (!result.structure.includes("Rush Monorepo")) result.structure.push("Rush Monorepo");
  }
  if (names.includes("Makefile")) result.tooling.push("Make");
  if (result.languages.sql && !result.techStack.database) {
    setStack("database", "SQL");
    pushStack("database", "SQL");
  }
  if (!result.description) {
    const readmeName = names.find((n) => /^readme(?:\.[a-z0-9]+)?$/i.test(n));
    if (readmeName) result.description = firstReadmeParagraph(await readText(fs, rootPath, readmeName));
  }
  const entryCandidates = [
    ["main.ts", "service"],
    ["main.js", "service"],
    ["index.ts", "service"],
    ["index.js", "service"],
    ["app.py", "service"],
    ["server.py", "service"],
    ["manage.py", "cli"],
    ["cmd/main.go", "service"],
    ["main.go", "service"],
    ["src/main.ts", "service"],
    ["src/main.js", "service"],
    ["src/index.ts", "service"],
    ["src/index.js", "service"]
  ];
  const relativeFiles = /* @__PURE__ */ new Set();
  async function scanDepth(target, depth, prefix) {
    if (depth > 5) return;
    let sub;
    try {
      sub = await fs.listDir(target);
    } catch (e) {
      return;
    }
    for (const e of sub) {
      if (!e || !e.name) continue;
      if (shouldIgnoreDir(e.name)) continue;
      const kind = entryKind(e);
      if (kind === "file") {
        result.fileCount += 1;
        const rel = prefix ? prefix + "/" + e.name : e.name;
        relativeFiles.add(rel);
        const lower = e.name.toLowerCase();
        for (const [ext, lang] of Object.entries(EXT_LANG)) {
          if (lower.endsWith(ext)) {
            result.languages[lang] = (result.languages[lang] || 0) + 1;
            break;
          }
        }
      } else if (kind === "directory") {
        const subT = await childTarget(fs, target, e);
        if (!subT) continue;
        const nextPrefix = prefix ? prefix + "/" + e.name : e.name;
        await scanDepth(subT, depth + 1, nextPrefix);
      }
    }
  }
  await scanDepth(rootTarget, 0, "");
  for (const [cand, type] of entryCandidates) {
    if (relativeFiles.has(cand) && !result.entrypoints.some((e) => e.path === cand)) {
      result.entrypoints.push({ path: cand, type });
    }
  }
  result.tooling = Array.from(new Set(result.tooling)).sort();
  result.files = Array.from(relativeFiles).sort();
  promoteAIMLToStack(result);
  await fallbackScanImports(fs, rootTarget, result);
  sortStackByPopularity(result.stack);
  return result;
}

// src/host/store/path-resolver.js
function readCwdFromSession(session) {
  if (!session) return null;
  try {
    const cwd = session.cwd;
    if (typeof cwd === "string" && cwd.trim()) return cwd;
    if (session.meta && typeof session.meta.cwd === "string" && session.meta.cwd.trim()) return session.meta.cwd;
    if (session.header && typeof session.header.cwd === "string" && session.header.cwd.trim()) return session.header.cwd;
    if (session.header && session.header.meta && typeof session.header.meta.cwd === "string" && session.header.meta.cwd.trim()) return session.header.meta.cwd;
  } catch (e) {
  }
  return null;
}
function readCwdFromSessionsService(ctx, sessionId) {
  if (!ctx || !sessionId) return null;
  let sessions;
  try {
    sessions = ctx.get ? ctx.get("sessions") : ctx.sessions;
  } catch (e) {
    return null;
  }
  if (!sessions || typeof sessions.get !== "function") return null;
  try {
    const session = sessions.get(sessionId);
    return readCwdFromSession(session);
  } catch (e) {
    return null;
  }
}
function readCwdFromInitiator(ctx) {
  if (!ctx) return null;
  let agents;
  try {
    agents = ctx.get ? ctx.get("agents") : ctx.agents;
  } catch (e) {
    return null;
  }
  if (!agents || typeof agents.currentInitiator !== "function") return null;
  let agent;
  try {
    agent = agents.currentInitiator();
  } catch (e) {
    return null;
  }
  if (!agent) return null;
  try {
    if (agent.session) {
      const c = readCwdFromSession(agent.session);
      if (c) return c;
    }
    if (agent.sessionId && agents.requireInitiator) {
    }
    if (agent.header && agent.header.meta) {
      const c = agent.header.meta.cwd;
      if (typeof c === "string" && c.trim()) return c;
    }
    if (agent.meta && typeof agent.meta.cwd === "string" && agent.meta.cwd.trim()) {
      return agent.meta.cwd;
    }
  } catch (e) {
  }
  return null;
}
function isDshDesktopInstall(p) {
  if (!p || typeof p !== "string") return false;
  if (/[\\/]Programs[\\/]DSH Desktop$/i.test(p)) return true;
  if (/[\\/]DSH Desktop\.app/.test(p)) return true;
  return false;
}
function safeCwd(cwd) {
  if (typeof cwd !== "string" || !cwd.trim()) return null;
  const value = cwd.trim();
  if (value.includes("\0") || value === "/" || /^[A-Za-z]:[\\/]?$/.test(value)) return null;
  if (isDshDesktopInstall(value)) return null;
  return value;
}
function resolveProjectPath(args, exec, sandboxPolicy) {
  try {
    const agentSession = exec && exec.agent && exec.agent.session;
    const agentCwd = safeCwd(readCwdFromSession(agentSession));
    if (agentCwd) return agentCwd;
    const direct = safeCwd(readCwdFromSession(exec && exec.session));
    if (direct) return direct;
    const ctxSession = exec && exec.ctx && (exec.ctx.session || exec.ctx.agent && exec.ctx.agent.session);
    const ctxCwd = safeCwd(readCwdFromSession(ctxSession));
    if (ctxCwd) return ctxCwd;
    const sid = exec && (exec.sessionId || exec.session && exec.session.id || exec.agent && exec.agent.id);
    const ctx = exec && (exec.ctx || null);
    const svcCwd = safeCwd(readCwdFromSessionsService(ctx, sid));
    if (svcCwd) return svcCwd;
    const initiatorCwd = safeCwd(readCwdFromInitiator(ctx));
    if (initiatorCwd) return initiatorCwd;
  } catch (e) {
  }
  try {
    const explicit = args && typeof args.path === "string" && args.path.trim();
    if (explicit) {
      const safe = safeCwd(explicit.trim());
      return safe || ".";
    }
  } catch (e) {
  }
  try {
    if (sandboxPolicy && typeof sandboxPolicy.workspaceRoot === "string" && sandboxPolicy.workspaceRoot.trim()) {
      const root = sandboxPolicy.workspaceRoot;
      const safe = safeCwd(root);
      if (safe) return safe;
    }
  } catch (e) {
  }
  console.warn("[dsh-project-brain:path-resolver] All fallback cwd candidates were DSH Desktop installs (or missing). User should pass args.path explicitly.");
  return ".";
}

// src/host/architecture/analyzer.js
var SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|py|go|java|kt|kts|rs|cs|php|rb|swift|dart|scala|vue|svelte)$/i;
var MANIFEST_NAMES = /^(?:package\.json|pyproject\.toml|requirements\.txt|go\.mod|pom\.xml|build\.gradle(?:\.kts)?|cargo\.toml|docker-compose\.ya?ml|compose\.ya?ml|dockerfile|makefile|pnpm-workspace\.yaml|turbo\.json|nx\.json)$/i;
var README_NAMES = /^readme(?:\.[a-z0-9]+)?$/i;
var ROLES = [
  { id: "presentation", name: "\u4E92\u52D5\u8207\u5C55\u793A\u5C64", kind: "presentation", order: 0, match: /(?:^|\/)(?:client|frontend|web|ui|views?|pages?|components?|screens?)(?:\/|\.|$)/i },
  { id: "interface", name: "\u4ECB\u9762\u8207\u63A5\u5165\u5C64", kind: "interface", order: 1, match: /(?:^|\/)(?:api|routes?|controllers?|handlers?|rpc|commands?|cli|gateway)(?:\/|\.|$)/i },
  { id: "application", name: "\u61C9\u7528\u7DE8\u6392\u5C64", kind: "application", order: 2, match: /(?:^|\/)(?:services?|use-?cases?|application|agents?|tools?|workflows?|orchestrators?)(?:\/|\.|$)/i },
  { id: "domain", name: "\u6838\u5FC3\u9818\u57DF\u5C64", kind: "domain", order: 3, match: /(?:^|\/)(?:core|domain|engine|business|analysis|scanner|parser|compiler)(?:\/|\.|$)/i },
  { id: "data", name: "\u8CC7\u6599\u8207\u8A18\u61B6\u5C64", kind: "data", order: 4, match: /(?:^|\/)(?:data|db|database|models?|schemas?|repositories?|stores?|storage|memory|cache|migrations?)(?:\/|\.|$)/i },
  { id: "integration", name: "\u5E73\u81FA\u8207\u5916\u90E8\u6574\u5408\u5C64", kind: "integration", order: 5, match: /(?:^|\/)(?:host|integrations?|adapters?|providers?|connectors?|plugins?|infra|runtime)(?:\/|\.|$)/i },
  { id: "support", name: "\u5DE5\u7A0B\u652F\u6490", kind: "support", order: 6, match: /(?:^|\/)(?:tests?|specs?|fixtures?|scripts?|build|config|deploy)(?:\/|\.|$)/i }
];
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function hashText(text) {
  let hash = 2166136261;
  const value = String(text || "");
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function safeId(value) {
  return String(value || "item").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "item";
}
function cleanText(value, limit = 600) {
  return String(value || "").replace(/\0/g, "").replace(/\r/g, "").trim().slice(0, limit);
}
function isGeneratedOrVendor(file) {
  const path7 = String(file || "").replaceAll("\\", "/");
  return /(?:^|\/)(?:node_modules(?:[._-][^/]*)?|vendor|dist|build|coverage|\.next|target|out|__pycache__|\.venv|venv)(?:\/|$)/i.test(path7) || /(?:^|\/)[^/]*(?:backup|\.bak)(?:[-_.][^/]*)?(?:\/|$)/i.test(path7) || /(?:^|\/)dsh-project-brain\/lib(?:\/|$)/i.test(path7);
}
function languageOf(path7) {
  const lower = String(path7 || "").toLowerCase();
  if (/\.tsx?$/.test(lower)) return "typescript";
  if (/\.[cm]?jsx?$/.test(lower)) return "javascript";
  if (/\.py$/.test(lower)) return "python";
  if (/\.go$/.test(lower)) return "go";
  if (/\.java$/.test(lower)) return "java";
  if (/\.rs$/.test(lower)) return "rust";
  if (/\.vue$/.test(lower)) return "vue";
  if (/\.svelte$/.test(lower)) return "svelte";
  return "other";
}
async function readProjectFile(fs, projectPath, relativePath) {
  try {
    const root = await fs.resolve(projectPath);
    const target = await fs.resolve(relativePath, { cwd: root });
    return String(await fs.readText(target));
  } catch (e) {
    return "";
  }
}
function extractImports(text, language) {
  const out = [];
  const add = (value) => {
    const item = String(value || "").trim();
    if (item && !out.includes(item)) out.push(item);
  };
  let match;
  if (["javascript", "typescript", "vue", "svelte"].includes(language)) {
    const re = /(?:from\s*|import\s*\(|require\s*\()\s*["']([^"']+)["']/g;
    while (match = re.exec(text)) add(match[1]);
  } else if (language === "python") {
    const re = /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm;
    while (match = re.exec(text)) add(match[1] || match[2]);
  } else if (language === "go") {
    const block = (text.match(/import\s*(?:\([\s\S]*?\)|["`][^"`]+["`])/) || [""])[0];
    const re = /["`]([^"`\s]+)["`]/g;
    while (match = re.exec(block)) add(match[1]);
  } else if (language === "java") {
    const re = /^\s*import\s+([\w.]+);/gm;
    while (match = re.exec(text)) add(match[1]);
  }
  return out.slice(0, 60);
}
function extractSymbols(text, language) {
  const out = [];
  const add = (kind, name2) => {
    if (name2 && !out.some((item) => item.name === name2)) out.push({ kind, name: String(name2).slice(0, 100) });
  };
  let match;
  if (["javascript", "typescript", "vue", "svelte"].includes(language)) {
    const re = /(?:export\s+(?:default\s+)?)?(?:async\s+)?(class|function|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
    while (match = re.exec(text)) add(match[1], match[2]);
  } else if (language === "python") {
    const re = /^\s*(class|def|async\s+def)\s+([A-Za-z_]\w*)/gm;
    while (match = re.exec(text)) add(match[1], match[2]);
  } else if (language === "go") {
    const re = /^\s*(type|func)\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/gm;
    while (match = re.exec(text)) add(match[1], match[2]);
  } else if (language === "java") {
    const re = /\b(class|interface|enum|record)\s+([A-Za-z_]\w*)/g;
    while (match = re.exec(text)) add(match[1], match[2]);
  }
  return out.slice(0, 24);
}
function sourceExcerpt(text) {
  return cleanText(String(text || "").split("\n").filter((line) => !/^\s*(?:\/\/|#)\s*(?:eslint|prettier|type:|noqa)/i.test(line)).slice(0, 60).join("\n"), 1400);
}
function evidencePriority(file, scan) {
  let score = 0;
  if ((scan.entrypoints || []).some((entry) => entry.path === file)) score += 100;
  if (/(?:^|\/)(?:main|index|app|server|client|plugin|bootstrap)\.[^.]+$/i.test(file)) score += 45;
  if (/(?:scanner|analyzer|service|controller|router|store|memory|rpc|injector|engine|workflow)/i.test(file)) score += 28;
  if (String(file).split("/").length <= 3) score += 12;
  if (/(?:test|spec|fixture|mock|\.d\.ts$)/i.test(file)) score -= 35;
  return score;
}
function roleForFile(file) {
  return ROLES.find((role) => role.match.test(file)) || ROLES[3];
}
function friendlyComponentName(role, files) {
  const hints = files.join(" ").toLowerCase();
  if (role.id === "presentation") return /client|web|page|component/.test(hints) ? "\u4F7F\u7528\u8005\u4ECB\u9762\u8207\u8996\u89BA\u5316" : "\u4E92\u52D5\u5C55\u793A";
  if (role.id === "interface") return /rpc/.test(hints) ? "\u57F7\u884C\u6642 RPC \u4ECB\u9762" : /cli|command/.test(hints) ? "\u547D\u4EE4\u8207\u63A5\u5165\u4ECB\u9762" : "\u4ECB\u9762\u9069\u914D";
  if (role.id === "application") return /tool/.test(hints) ? "\u5C08\u6848\u80FD\u529B\u5DE5\u5177\u96C6" : /agent/.test(hints) ? "Agent \u7DE8\u6392" : "\u61C9\u7528\u670D\u52D9\u7DE8\u6392";
  if (role.id === "domain") return /scan|analy|parser/.test(hints) ? "\u5C08\u6848\u5206\u6790\u5F15\u64CE" : "\u6838\u5FC3\u696D\u52D9\u5F15\u64CE";
  if (role.id === "data") return /memory/.test(hints) ? "\u5C08\u6848\u8A18\u61B6\u8207\u6AA2\u7D22" : "\u5C08\u6848\u8CC7\u6599\u5132\u5B58";
  if (role.id === "integration") return /host|plugin/.test(hints) ? "DSH Host \u6574\u5408" : "\u5E73\u81FA\u8207\u5916\u90E8\u670D\u52D9\u6574\u5408";
  return "\u69CB\u5EFA\u3001\u6E2C\u8A66\u8207\u91CB\u51FA";
}
function localPurpose(scan) {
  if (scan.description) return cleanText(scan.description, 800);
  const stacks = Object.values(scan.techStack || {}).filter(Boolean);
  return (scan.projectName || "\u8A72\u5C08\u6848") + (stacks.length ? " \u662F\u4E00\u500B\u57FA\u65BC " + stacks.join("\u3001") + " \u7684\u8EDF\u9AD4\u5C08\u6848\u3002" : " \u662F\u4E00\u500B\u8EDF\u9AD4\u5C08\u6848\uFF0C\u53EF\u5F9E\u5165\u53E3\u8207\u6838\u5FC3\u5143\u4EF6\u7E7C\u7E8C\u77AD\u89E3\u5176\u8077\u8CAC\u3002");
}
function withAliases(architecture) {
  return {
    ...architecture,
    nodes: (architecture.components || []).map((item) => ({ id: item.id, label: item.name, kind: item.type, layerId: item.layerId, description: item.responsibility, details: item.details, files: item.importantFiles || [], evidencePaths: item.evidencePaths || [], technologies: item.technologies || [], confidence: item.confidence })),
    edges: (architecture.relationships || []).map((item) => ({ ...item })),
    flows: (architecture.runtimeFlows || []).map((flow) => ({ ...flow, label: flow.name, steps: (flow.steps || []).map((step) => step.componentId) }))
  };
}
function buildLocalArchitecture(scan, evidence, previous, config) {
  const grouped = /* @__PURE__ */ new Map();
  for (const fact of evidence.sourceFacts) {
    const role = roleForFile(fact.file);
    if (!grouped.has(role.id)) grouped.set(role.id, { role, facts: [] });
    grouped.get(role.id).facts.push(fact);
  }
  const components = [...grouped.values()].sort((a, b) => a.role.order - b.role.order).slice(0, clamp(Number(config.architectureMaxNodes) || 24, 6, 60)).map(({ role, facts }) => {
    const files = facts.map((fact) => fact.file);
    return {
      id: "component-" + role.id,
      name: friendlyComponentName(role, files),
      layerId: "layer-" + role.id,
      type: role.kind,
      responsibility: role.name + "\uFF1A" + (facts.flatMap((fact) => fact.symbols).slice(0, 5).map((item) => item.name).join("\u3001") || "\u627F\u8F09\u76F8\u95DC\u5C08\u6848\u80FD\u529B"),
      details: "\u7531 " + files.length + " \u500B\u95DC\u9375\u539F\u59CB\u78BC\u6A94\u6848\u6B78\u7D0D\uFF1B\u76EE\u9304\u53EA\u4F5C\u70BA\u5206\u6790\u8B49\u64DA\u3002",
      technologies: [...new Set(facts.map((fact) => fact.language))].filter((item) => item !== "other"),
      importantFiles: files.slice(0, 6),
      evidencePaths: files.slice(0, 12),
      confidence: 0.62
    };
  });
  if (!components.length) components.push({ id: "component-project", name: "\u5C08\u6848\u4E3B\u9AD4", layerId: "layer-domain", type: "domain", responsibility: "\u5C08\u6848\u6838\u5FC3\u80FD\u529B", details: "\u672A\u6AA2\u6E2C\u5230\u53EF\u5206\u6790\u539F\u59CB\u78BC\u3002", technologies: [], importantFiles: [], evidencePaths: [], confidence: 0.35 });
  const componentIds = new Set(components.map((item) => item.id));
  const layers = ROLES.filter((role) => componentIds.has("component-" + role.id)).map((role) => ({ id: "layer-" + role.id, name: role.name, responsibility: role.name, order: role.order }));
  if (!layers.length) layers.push({ id: "layer-domain", name: "\u6838\u5FC3\u9818\u57DF\u5C64", responsibility: "\u5C08\u6848\u6838\u5FC3\u80FD\u529B", order: 0 });
  const relationships = [];
  for (let i = 0; i < components.length - 1; i++) relationships.push({ id: "relation-local-" + (i + 1), from: components[i].id, to: components[i + 1].id, label: "\u547C\u53EB/\u5354\u4F5C", type: "uses", description: "\u4F9D\u64DA\u5E38\u898B\u5206\u5C64\u65B9\u5411\u63A8\u65B7\uFF0C\u9700\u7D50\u5408\u7A0B\u5F0F\u78BC\u9A57\u8B49", confidence: 0.42 });
  const keyFiles = evidence.sourceFacts.slice(0, 12).map((fact) => ({ path: fact.file, role: fact.symbols.length ? "\u5B9A\u7FA9 " + fact.symbols.slice(0, 4).map((item) => item.name).join("\u3001") : "\u95DC\u9375\u5BE6\u73FE\u6A94\u6848", whyImportant: fact.imports.length ? "\u9023\u7DDA " + fact.imports.slice(0, 4).join("\u3001") : "\u4F4D\u65BC\u5C08\u6848\u5165\u53E3\u6216\u6838\u5FC3\u5BE6\u73FE\u8DEF\u5F91", category: roleForFile(fact.file).kind }));
  const fingerprint2 = hashText(JSON.stringify({ files: evidence.sourceFacts.map((fact) => [fact.file, fact.hash, fact.imports]), manifests: evidence.manifests.map((item) => [item.path, item.hash]), readme: hashText(evidence.readme && evidence.readme.content), techStack: scan.techStack }));
  const changed = !previous || previous.schemaVersion !== 2 || previous.fingerprint !== fingerprint2;
  const overview = { purpose: localPurpose(scan), audience: "\u5C08\u6848\u958B\u767C\u8207\u7DAD\u8B77\u4EBA\u54E1", category: Object.values(scan.techStack || {})[0] || "\u8EDF\u9AD4\u5C08\u6848", architectureStyle: layers.length >= 3 ? "\u5206\u5C64\u67B6\u69CB\uFF08\u672C\u5730\u63A8\u65B7\uFF09" : "\u6A21\u7D44\u5316\u67B6\u69CB\uFF08\u672C\u5730\u63A8\u65B7\uFF09", value: "\u5E6B\u52A9\u958B\u767C\u8005\u7406\u89E3\u5C08\u6848\u5165\u53E3\u3001\u6838\u5FC3\u80FD\u529B\u548C\u5354\u4F5C\u908A\u754C\u3002" };
  const runtimeFlows = components.length >= 2 ? [{ id: "flow-main", name: "\u4E3B\u8981\u57F7\u884C\u93C8\u8DEF\uFF08\u672C\u5730\u63A8\u65B7\uFF09", trigger: "\u4F7F\u7528\u8005\u6216\u5BBF\u4E3B\u89F8\u767C\u5C08\u6848\u80FD\u529B", outcome: "\u6838\u5FC3\u80FD\u529B\u5B8C\u6210\u4E26\u8B80\u5BEB\u5C08\u6848\u8CC7\u6599", steps: components.map((component, index) => ({ componentId: component.id, action: index === 0 ? "\u63A5\u6536\u8ACB\u6C42" : index === components.length - 1 ? "\u5B8C\u6210\u8655\u7406" : "\u8655\u7406\u4E26\u50B3\u905E" })) }] : [];
  return withAliases({
    schemaVersion: 2,
    version: previous && previous.version && changed ? previous.version + 1 : previous && previous.version || 1,
    generatedAt: Date.now(),
    fingerprint: fingerprint2,
    changed,
    source: "local",
    project: { name: scan.projectName || "Project", techStack: scan.techStack || {}, entrypoints: scan.entrypoints || [] },
    overview,
    summary: overview.purpose,
    layers,
    components,
    relationships,
    runtimeFlows,
    keyFiles,
    gettingStarted: ["\u5148\u95B1\u8B80 README \u8207\u5C08\u6848\u6E05\u55AE", "\u5F9E\u5165\u53E3\u6A94\u6848\u8DDF\u8E64\u4E3B\u8981\u57F7\u884C\u93C8\u8DEF", "\u7D50\u5408\u95DC\u9375\u6A94\u6848\u7406\u89E3\u8CC7\u6599\u8207\u5E73\u81FA\u908A\u754C"],
    designHighlights: [],
    risks: [],
    evidence: { readmeUsed: Boolean(evidence.readme && evidence.readme.content), manifestFiles: evidence.manifests.map((item) => item.path), sourceFilesAnalyzed: evidence.sourceFacts.length, sourceSnippetsShared: false },
    stats: { files: evidence.allFiles.length, analyzedFiles: evidence.sourceFacts.length, layers: layers.length, modules: components.length, components: components.length, edges: relationships.length, keyFiles: keyFiles.length },
    llm: { requested: false, used: false, provider: null, model: null, error: null }
  });
}
function stripCodeFence(value) {
  return String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}
function withoutTrailingCommas(value) {
  const text = String(value || "");
  let out = "";
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      out += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') {
      quoted = true;
      out += char;
      continue;
    }
    if (char === ",") {
      let next = index + 1;
      while (next < text.length && /\s/.test(text[next])) next += 1;
      if (text[next] === "}" || text[next] === "]") continue;
    }
    out += char;
  }
  return out;
}
function balancedJsonObjects(value) {
  const text = String(value || "");
  const out = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') {
        quoted = true;
        continue;
      }
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          out.push(text.slice(start, index + 1));
          start = index;
          break;
        }
        if (depth < 0) break;
      }
    }
  }
  return out;
}
function parseArchitectureJson(value) {
  const text = String(value || "").trim();
  const candidates = [stripCodeFence(text)];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while (match = fenced.exec(text)) candidates.push(match[1].trim());
  candidates.push(...balancedJsonObjects(text));
  for (const candidate of [...new Set(candidates.filter(Boolean))]) {
    try {
      return JSON.parse(candidate);
    } catch (e) {
    }
    try {
      return JSON.parse(withoutTrailingCommas(candidate));
    } catch (e) {
    }
  }
  throw Object.assign(new Error("LLM returned invalid architecture JSON"), {
    code: "ARCHITECTURE_LLM_INVALID_JSON",
    details: { receivedChars: text.length, balancedObjectFound: balancedJsonObjects(text).length > 0 }
  });
}
function strings(value, max, limit) {
  return (Array.isArray(value) ? value : []).map((item) => cleanText(item, limit)).filter(Boolean).slice(0, max);
}
function parseLlmArchitecture(text, base, knownFiles) {
  const parsed = parseArchitectureJson(text);
  const rawLayers = Array.isArray(parsed.layers) ? parsed.layers : [];
  const layers = rawLayers.slice(0, 10).map((item, index) => ({ id: "layer-" + safeId(item.id || item.name || index + 1), name: cleanText(item.name, 80) || "\u67B6\u69CB\u5C64 " + (index + 1), responsibility: cleanText(item.responsibility, 500), order: index }));
  if (!layers.length) throw Object.assign(new Error("LLM architecture has no layers"), { code: "ARCHITECTURE_LLM_SCHEMA" });
  const layerByRaw = /* @__PURE__ */ new Map();
  rawLayers.slice(0, 10).forEach((item, index) => [item && item.id, item && item.name, layers[index].id].filter(Boolean).forEach((key) => layerByRaw.set(String(key), layers[index].id)));
  const known = new Set(knownFiles);
  const rawComponents = Array.isArray(parsed.components) ? parsed.components : [];
  const components = rawComponents.slice(0, 18).map((item, index) => {
    const evidencePaths = strings(item.evidencePaths, 12, 240).filter((path7) => known.has(path7));
    const importantFiles = strings(item.importantFiles, 8, 240).filter((path7) => known.has(path7));
    return { id: "component-" + safeId(item.id || item.name || index + 1), name: cleanText(item.name, 100) || "\u6838\u5FC3\u5143\u4EF6 " + (index + 1), layerId: layerByRaw.get(String(item.layerId || item.layer || "")) || layers[Math.min(index, layers.length - 1)].id, type: cleanText(item.type, 40) || "component", responsibility: cleanText(item.responsibility, 700), details: cleanText(item.details, 1200), technologies: strings(item.technologies, 10, 80), importantFiles: importantFiles.length ? importantFiles : evidencePaths.slice(0, 5), evidencePaths, confidence: clamp(Number(item.confidence) || 0.78, 0.2, 1) };
  }).filter((item) => item.name && item.responsibility);
  if (components.length < 2) throw Object.assign(new Error("LLM architecture has too few components"), { code: "ARCHITECTURE_LLM_SCHEMA" });
  const componentIds = new Set(components.map((item) => item.id));
  const rawToId = /* @__PURE__ */ new Map();
  rawComponents.slice(0, 18).forEach((item, index) => {
    if (components[index]) [item && item.id, item && item.name, components[index].id].filter(Boolean).forEach((key) => rawToId.set(String(key), components[index].id));
  });
  const relationships = (Array.isArray(parsed.relationships) ? parsed.relationships : []).slice(0, 36).map((item, index) => ({ id: "relation-" + (index + 1), from: rawToId.get(String(item.from || "")), to: rawToId.get(String(item.to || "")), label: cleanText(item.label, 80) || "\u547C\u53EB", type: cleanText(item.type, 40) || "uses", description: cleanText(item.description, 500), confidence: clamp(Number(item.confidence) || 0.75, 0.2, 1) })).filter((item) => componentIds.has(item.from) && componentIds.has(item.to) && item.from !== item.to);
  const runtimeFlows = (Array.isArray(parsed.runtimeFlows) ? parsed.runtimeFlows : []).slice(0, 8).map((flow, index) => ({ id: "flow-" + (index + 1), name: cleanText(flow.name, 100) || "\u57F7\u884C\u6D41\u7A0B " + (index + 1), trigger: cleanText(flow.trigger, 400), outcome: cleanText(flow.outcome, 400), steps: (Array.isArray(flow.steps) ? flow.steps : []).slice(0, 12).map((step) => ({ componentId: rawToId.get(String(step.componentId || step.component || "")), action: cleanText(step.action, 400), file: known.has(step.file) ? step.file : null })).filter((step) => componentIds.has(step.componentId)) })).filter((flow) => flow.steps.length >= 2);
  const keyFiles = (Array.isArray(parsed.keyFiles) ? parsed.keyFiles : []).slice(0, 16).map((item) => ({ path: cleanText(item.path, 240), role: cleanText(item.role, 300), whyImportant: cleanText(item.whyImportant, 600), category: cleanText(item.category, 50) })).filter((item) => known.has(item.path));
  const overviewInput = parsed.overview || {};
  const result = { ...base, source: "hybrid", overview: { purpose: cleanText(overviewInput.purpose, 1200) || base.overview.purpose, audience: cleanText(overviewInput.audience, 500) || base.overview.audience, category: cleanText(overviewInput.category, 160) || base.overview.category, architectureStyle: cleanText(overviewInput.architectureStyle, 300) || base.overview.architectureStyle, value: cleanText(overviewInput.value, 800) || base.overview.value }, summary: cleanText(parsed.summary, 1600) || cleanText(overviewInput.purpose, 1200) || base.summary, layers, components, relationships, runtimeFlows, keyFiles: keyFiles.length ? keyFiles : base.keyFiles, gettingStarted: strings(parsed.gettingStarted, 8, 600), designHighlights: strings(parsed.designHighlights, 10, 600), risks: strings(parsed.risks, 10, 600) };
  result.stats = { ...base.stats, layers: layers.length, modules: components.length, components: components.length, edges: relationships.length, keyFiles: result.keyFiles.length };
  return withAliases(result);
}
function llmPrompt(base, evidence, includeSource) {
  const payload = { project: base.project, localOverview: base.overview, readme: evidence.readme ? { path: evidence.readme.path, content: evidence.readme.content } : null, manifests: evidence.manifests.slice(0, 8).map((item) => ({ path: item.path, content: item.content })), sourceFacts: evidence.sourceFacts.slice(0, 24).map((fact) => ({ path: fact.file, language: fact.language, imports: fact.imports, symbols: fact.symbols, ...includeSource ? { excerpt: fact.excerpt } : {} })), entrypoints: base.project.entrypoints, techStack: base.project.techStack };
  return [
    "\u4F60\u662F\u4E00\u540D\u8CC7\u6DF1\u8EDF\u9AD4\u67B6\u69CB\u5E2B\u3002\u76EE\u6A19\u662F\u8B93\u7B2C\u4E00\u6B21\u63A5\u89F8\u5009\u5EAB\u7684\u958B\u767C\u8005\u5728\u5E7E\u5206\u9418\u5167\u7406\u89E3\u7CFB\u7D71\u8A2D\u8A08\uFF0C\u800C\u4E0D\u662F\u8907\u8FF0\u76EE\u9304\u6A39\u3002",
    "\u56DE\u7B54\u5C08\u6848\u505A\u4EC0\u9EBC\u3001\u670D\u52D9\u8AB0\u3001\u63A1\u7528\u4EC0\u9EBC\u67B6\u69CB\u98A8\u683C\u3001\u6709\u54EA\u4E9B\u6982\u5FF5\u5C64\u548C\u6838\u5FC3\u5143\u4EF6\u3001\u5143\u4EF6\u5982\u4F55\u5354\u4F5C\u3001\u4E3B\u8981\u57F7\u884C\u6D41\u7A0B\u3001\u95DC\u9375\u6A94\u6848\u3001\u8A2D\u8A08\u4EAE\u9EDE\u8207\u98A8\u96AA\u3002",
    "\u898F\u5247\uFF1A\u5143\u4EF6\u5FC5\u9808\u662F\u6709\u8077\u8CAC\u7684\u6982\u5FF5\u5143\u4EF6\uFF0C\u7981\u6B62\u628A src\u3001packages/foo\u3001scripts \u7B49\u76EE\u9304\u540D\u76F4\u63A5\u7576\u5143\u4EF6\u540D\uFF1B\u8DEF\u5F91\u53EA\u80FD\u4F5C\u70BA evidencePaths/importantFiles/keyFiles \u8B49\u64DA\u3002\u5FFD\u7565 vendor\u3001\u5099\u4EFD\u3001\u751F\u6210\u7269\u548C\u6E2C\u8A66\u593E\u5177\u5E72\u64FE\u3002\u53EA\u9673\u8FF0\u8B49\u64DA\u652F\u63F4\u7684\u5167\u5BB9\u3002\u8F38\u51FA\u4E2D\u6587\u56B4\u683C JSON\uFF0C\u4E0D\u8981 Markdown/HTML/Mermaid\u3002",
    "JSON \u683C\u5F0F\uFF1A" + JSON.stringify({ overview: { purpose: "\u5C08\u6848\u89E3\u6C7A\u4EC0\u9EBC\u554F\u984C", audience: "\u4F7F\u7528\u8005", category: "\u5C08\u6848\u578B\u5225", architectureStyle: "\u67B6\u69CB\u98A8\u683C", value: "\u6838\u5FC3\u50F9\u503C" }, summary: "\u6574\u9AD4\u67B6\u69CB\u8AAA\u660E", layers: [{ id: "interface", name: "\u4ECB\u9762\u5C64", responsibility: "\u5C64\u8077\u8CAC" }], components: [{ id: "runtime-bridge", name: "\u57F7\u884C\u6642\u6A4B\u63A5", layerId: "interface", type: "service", responsibility: "\u8077\u8CAC", details: "\u908A\u754C\u8207\u5354\u4F5C", technologies: ["\u6280\u8853"], importantFiles: ["\u771F\u5BE6\u76F8\u5C0D\u8DEF\u5F91"], evidencePaths: ["\u771F\u5BE6\u76F8\u5C0D\u8DEF\u5F91"], confidence: 0.85 }], relationships: [{ from: "runtime-bridge", to: "memory-store", label: "\u8B80\u5BEB", type: "data-flow", description: "\u95DC\u4FC2", confidence: 0.8 }], runtimeFlows: [{ name: "\u521D\u59CB\u5316\u6D41\u7A0B", trigger: "\u89F8\u767C\u689D\u4EF6", outcome: "\u7D50\u679C", steps: [{ componentId: "runtime-bridge", action: "\u52D5\u4F5C", file: "\u53EF\u9078\u771F\u5BE6\u8DEF\u5F91" }] }], keyFiles: [{ path: "\u771F\u5BE6\u76F8\u5C0D\u8DEF\u5F91", role: "\u6A94\u6848\u89D2\u8272", whyImportant: "\u70BA\u4EC0\u9EBC\u5148\u8B80", category: "entry|core|data|integration|config" }], gettingStarted: ["\u95B1\u8B80/\u9664\u932F\u9806\u5E8F"], designHighlights: ["\u8A2D\u8A08\u4EAE\u9EDE"], risks: ["\u98A8\u96AA\u6216\u4E0D\u78BA\u5B9A\u9805"] }),
    "\u5C08\u6848\u8B49\u64DA\uFF1A" + JSON.stringify(payload)
  ].join("\n");
}
function repairArchitecturePrompt(value) {
  return [
    "\u4E0B\u9762\u662F\u4E00\u6B21\u8EDF\u9AD4\u67B6\u69CB\u5206\u6790\u7684\u6A21\u578B\u8F38\u51FA\uFF0C\u4F46\u5B83\u4E0D\u662F\u53EF\u89E3\u6790\u7684\u56B4\u683C JSON\u3002",
    "\u8ACB\u53EA\u4FEE\u5FA9 JSON \u8A9E\u6CD5\u548C\u7F3A\u5931\u7684\u9589\u5408\u7D50\u69CB\uFF0C\u4FDD\u7559\u5DF2\u6709\u4E8B\u5BE6\u8207\u76F8\u5C0D\u6A94\u6848\u8DEF\u5F91\uFF1B\u4E0D\u8981\u65B0\u589E\u89E3\u91CB\u3001Markdown \u6216\u7A0B\u5F0F\u78BC\u570D\u6B04\u3002",
    "\u6700\u7D42\u53EA\u80FD\u8F38\u51FA\u4E00\u500B JSON \u7269\u4EF6\uFF0C\u4E26\u78BA\u4FDD\u81F3\u5C11\u5305\u542B\u975E\u7A7A layers \u548C\u81F3\u5C11\u5169\u500B components\u3002",
    "\u5F85\u4FEE\u5FA9\u8F38\u51FA\uFF1A",
    cleanText(value, 24e3)
  ].join("\n");
}
async function streamLlmText(llm, route, prompt, sessionId, timeoutMs, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("architecture LLM timeout")), timeoutMs || 6e4);
  const chunks = /* @__PURE__ */ new Map();
  const completed = /* @__PURE__ */ new Map();
  let lastFinishKind = null;
  try {
    const request = {
      provider: route.provider,
      model: route.model,
      system: options.system || "Produce an evidence-based conceptual software architecture as strict JSON only.",
      messages: [{ role: "user", content: [{ type: "text", text: prompt }], source: { kind: "plugin", plugin: "dsh-project-brain" } }],
      maxTokens: options.maxTokens || 6200,
      purpose: options.purpose || "project-architecture",
      ...sessionId ? { sessionId } : {},
      ...typeof options.temperature === "number" ? { temperature: options.temperature } : {},
      signal: controller.signal
    };
    for await (const chunk of llm.stream(request)) {
      if (!chunk) continue;
      if (chunk.type === "text-delta") chunks.set(chunk.index, (chunks.get(chunk.index) || "") + String(chunk.text || ""));
      else if (chunk.type === "block-end" && chunk.block && chunk.block.type === "text") completed.set(chunk.index, String(chunk.block.text || ""));
      else if (chunk.type === "finish" && chunk.reason && chunk.reason.kind) lastFinishKind = chunk.reason.kind;
    }
    if (lastFinishKind && lastFinishKind !== "stop") throw Object.assign(new Error("architecture LLM finished with " + lastFinishKind), { code: "ARCHITECTURE_LLM_FINISH", details: { finishKind: lastFinishKind } });
    const indexes = [.../* @__PURE__ */ new Set([...chunks.keys(), ...completed.keys()])].sort((a, b) => a - b);
    const text = indexes.map((index) => chunks.get(index) || completed.get(index) || "").join("").trim();
    if (!text) throw Object.assign(new Error("architecture LLM returned no text"), { code: "ARCHITECTURE_LLM_EMPTY" });
    return text;
  } finally {
    clearTimeout(timer);
  }
}
function explainLlmError(error) {
  const err = error || {};
  const code = err.code || "ARCHITECTURE_LLM_FAILED";
  const message = String(err.message || err);
  const details = err.details && typeof err.details === "object" ? err.details : {};
  if (code === "ARCHITECTURE_LLM_SERVICE_UNAVAILABLE") {
    return { code, message, reasonText: "DSH \u672A\u628A\u6A21\u578B\u670D\u52D9\u66B4\u9732\u7D66\u5C08\u6848\u8166", actionKey: "check_settings" };
  }
  if (code === "ARCHITECTURE_LLM_SESSION_ROUTE_UNAVAILABLE") {
    return { code, message, reasonText: "\u7576\u524D\u6703\u8A71\u9084\u6C92\u6709\u53EF\u7528\u7684\u6A21\u578B\u8DEF\u7531", actionKey: "send_message" };
  }
  if (code === "ARCHITECTURE_LLM_FINISH") {
    const kind = String(details.finishKind || "").toLowerCase();
    if (kind === "length") return { code, message, reasonText: "\u6A21\u578B\u8F38\u51FA\u8D85\u904E max_tokens \u88AB\u622A\u65B7\uFF0C\u672A\u80FD\u5BEB\u51FA\u5B8C\u6574 JSON", actionKey: "retry_scan" };
    if (kind === "content_filter" || kind === "safety") return { code, message, reasonText: "\u6A21\u578B\u56E0\u5167\u5BB9\u5B89\u5168\u7B56\u7565\u4E2D\u65B7\u8F38\u51FA", actionKey: "retry_scan" };
    if (kind === "cancel") return { code, message, reasonText: "\u547C\u53EB\u88AB\u4E3B\u52D5\u53D6\u6D88\uFF08\u53EF\u80FD\u8D85\u6642\uFF09", actionKey: "retry_scan" };
    if (kind === "error" || kind === "upstream") return { code, message, reasonText: "\u6A21\u578B\u4E0A\u6E38\u8FD4\u56DE\u932F\u8AA4\uFF08\u7DB2\u8DEF\u6216\u670D\u52D9\u7570\u5E38\uFF09", actionKey: "retry_scan" };
    return { code, message, reasonText: "\u6A21\u578B\u672A\u6B63\u5E38\u7D50\u675F\uFF08" + (kind || "\u672A\u77E5\u539F\u56E0") + "\uFF09", actionKey: "retry_scan" };
  }
  if (code === "ARCHITECTURE_LLM_EMPTY") return { code, message, reasonText: "\u6A21\u578B\u8FD4\u56DE\u4E86\u7A7A\u5167\u5BB9", actionKey: "retry_scan" };
  if (code === "ARCHITECTURE_LLM_INVALID_JSON") return { code, message, reasonText: "\u6A21\u578B\u8F38\u51FA\u7121\u6CD5\u89E3\u6790\u70BA JSON\uFF08\u81EA\u52D5\u4FEE\u5FA9\u4E5F\u5DF2\u5931\u6557\uFF09", actionKey: "retry_scan" };
  if (code === "ARCHITECTURE_LLM_SCHEMA") return { code, message, reasonText: "\u6A21\u578B\u8F38\u51FA\u4E0D\u7B26\u5408\u67B6\u69CB schema", actionKey: "retry_scan" };
  if (code === "ARCHITECTURE_LLM_TIMEOUT" || /timeout/i.test(message)) return { code, message, reasonText: "\u547C\u53EB\u8D85\u6642\uFF08\u9810\u8A2D 60 \u79D2\uFF09", actionKey: "retry_scan" };
  return { code, message, reasonText: "\u67B6\u69CB\u751F\u6210\u5931\u6557\uFF1A" + (message || "\u672A\u77E5\u932F\u8AA4"), actionKey: "retry_scan" };
}
async function collectEvidence(fs, projectPath, scan, config) {
  const allFiles = (scan.files || []).filter((file) => !isGeneratedOrVendor(file));
  const readmePath = allFiles.find((file) => README_NAMES.test(file.split("/").pop()));
  const readme = readmePath ? { path: readmePath, content: cleanText(await readProjectFile(fs, projectPath, readmePath), 9e3) } : null;
  const manifests = [];
  for (const path7 of allFiles.filter((file) => MANIFEST_NAMES.test(file.split("/").pop())).slice(0, 12)) {
    const content = cleanText(await readProjectFile(fs, projectPath, path7), 6e3);
    manifests.push({ path: path7, content, hash: hashText(content) });
  }
  const sourceFiles = allFiles.filter((file) => SOURCE_EXTENSIONS.test(file)).sort((a, b) => evidencePriority(b, scan) - evidencePriority(a, scan) || a.localeCompare(b)).slice(0, clamp(Number(config.architectureMaxFiles) || 240, 20, 1e3));
  const sourceFacts = [];
  let totalBytes = 0;
  for (const file of sourceFiles) {
    if (totalBytes >= 12e5) break;
    const text = (await readProjectFile(fs, projectPath, file)).slice(0, 1e5);
    totalBytes += text.length;
    const language = languageOf(file);
    sourceFacts.push({ file, language, imports: extractImports(text, language), symbols: extractSymbols(text, language), excerpt: sourceExcerpt(text), hash: hashText(text) });
  }
  return { allFiles, readme, manifests, sourceFacts };
}
function resolveSessionRoute(session) {
  try {
    const context = session && typeof session.requestContext === "function" ? session.requestContext() : null;
    if (context && context.provider && context.model) return { provider: context.provider, model: context.model };
  } catch (e) {
  }
  try {
    const header = session && typeof session.requestHeader === "function" ? session.requestHeader() : null;
    const config = header && header.config;
    if (config && config.provider && config.model) return { provider: config.provider, model: config.model };
  } catch (e) {
  }
  try {
    const events = session && Array.isArray(session.events) ? session.events : [];
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index] || {};
      if (event.type === "request/context") {
        const data = event.data || {};
        if (data.provider && data.model) return { provider: data.provider, model: data.model };
      }
      if (event.type === "request/header") {
        const data = event.data || {};
        const eventConfig = data.header && data.header.config || data.config;
        if (eventConfig && eventConfig.provider && eventConfig.model) {
          return { provider: eventConfig.provider, model: eventConfig.model };
        }
      }
    }
  } catch (e) {
  }
  return null;
}
function createLlmRuntime(ctx, initialService = null) {
  let service = initialService && typeof initialService.stream === "function" ? initialService : null;
  if (!service && ctx) {
    try {
      const current = ctx.get ? ctx.get("llm") : ctx.llm;
      if (current && typeof current.stream === "function") service = current;
    } catch (e) {
    }
  }
  return { get: () => service };
}
async function buildArchitecture({ fs, projectPath, scan, previous, config = {}, llm, route, getRoute, sessionId } = {}) {
  const evidence = await collectEvidence(fs, projectPath, scan, config);
  const local = buildLocalArchitecture(scan, evidence, previous, config);
  const requested = config.architectureLlmEnabled !== false;
  const includeSource = config.architectureLlmIncludeSource !== false;
  local.llm.requested = requested;
  if (!requested) return local;
  if (!local.changed && previous && previous.schemaVersion === 2 && previous.llm && previous.llm.used) return { ...previous, generatedAt: Date.now(), changed: false };
  if (!llm || typeof llm.stream !== "function") {
    local.llm.error = explainLlmError({ code: "ARCHITECTURE_LLM_SERVICE_UNAVAILABLE", message: "DSH \u672A\u5411\u5916\u639B\u63D0\u4F9B LLM \u670D\u52D9\uFF0C\u5DF2\u751F\u6210\u672C\u5730\u6982\u5FF5\u67B6\u69CB", details: { serviceAvailable: false, routeAvailable: Boolean(route) } });
    return local;
  }
  if (!route && typeof getRoute === "function") {
    try {
      route = getRoute();
    } catch (e) {
      route = null;
    }
  }
  if (!route) {
    local.llm.error = explainLlmError({ code: "ARCHITECTURE_LLM_SESSION_ROUTE_UNAVAILABLE", message: "\u7576\u524D Session \u5C1A\u672A\u7522\u751F\u53EF\u8907\u7528\u7684\u6A21\u578B\u8DEF\u7531\uFF0C\u8ACB\u5148\u5B8C\u6210\u4E00\u6B21\u5C0D\u8A71\u5F8C\u91CD\u8A66", details: { serviceAvailable: true, routeAvailable: false, sessionId: sessionId || null } });
    return local;
  }
  local.llm.provider = route.provider;
  local.llm.model = route.model;
  try {
    const text = await streamLlmText(llm, route, llmPrompt(local, evidence, includeSource), sessionId, config.architectureLlmTimeoutMs || 6e4);
    let enriched;
    let repaired = false;
    try {
      enriched = parseLlmArchitecture(text, local, evidence.allFiles);
    } catch (firstError) {
      if (firstError.code !== "ARCHITECTURE_LLM_INVALID_JSON" && firstError.code !== "ARCHITECTURE_LLM_SCHEMA") throw firstError;
      const repairedText = await streamLlmText(
        llm,
        route,
        repairArchitecturePrompt(text),
        sessionId,
        Math.min(config.architectureLlmTimeoutMs || 6e4, 45e3),
        { purpose: "project-architecture-json-repair", maxTokens: 6200, system: "Repair the supplied architecture output into one strict JSON object. Output JSON only." }
      );
      enriched = parseLlmArchitecture(repairedText, local, evidence.allFiles);
      repaired = true;
    }
    enriched.llm = { requested: true, used: true, provider: route.provider, model: route.model, attempts: repaired ? 2 : 1, repaired, error: null };
    enriched.evidence = { ...local.evidence, sourceSnippetsShared: includeSource };
    return enriched;
  } catch (error) {
    local.llm.error = explainLlmError(error);
    return local;
  }
}
var LOCK_NAMES = /^(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|cargo\.lock|go\.sum|composer\.lock|poetry\.lock)$/i;
var CHANGELOG_NAMES = /^changelog(?:\.[a-z0-9]+)?$/i;
function fileNameOf(file) {
  return String(file || "").replaceAll("\\", "/").split("/").pop() || "";
}
function isTestPath(file) {
  const path7 = String(file || "").replaceAll("\\", "/");
  return /(?:^|\/)(?:test|tests|__tests__|spec|specs)(?:\/|$)/i.test(path7) || /\.(?:test|spec)\./i.test(path7);
}
function sourceChangeFiles(files) {
  return (files || []).some((file) => !isGeneratedOrVendor(file) && SOURCE_EXTENSIONS.test(file));
}
var ENTRY_BASENAMES = /^(?:index|main|app|server|mod|lib|__init__|__main__)$/i;
function normalizeTriggerPath(file) {
  return String(file || "").replaceAll("\\", "/").replace(/^\.\//, "");
}
function entrypointPathSet(entrypoints) {
  const set = /* @__PURE__ */ new Set();
  for (const item of entrypoints || []) {
    const raw = typeof item === "string" ? item : item && item.path;
    const type = item && typeof item === "object" ? String(item.type || "") : "";
    if (type === "script") continue;
    const path7 = normalizeTriggerPath(raw);
    if (!path7 || /\s/.test(path7) && !path7.includes("/")) continue;
    set.add(path7.toLowerCase());
  }
  return set;
}
function architectureTriggerFiles(files, options = {}) {
  const entrypoints = entrypointPathSet(options && options.entrypoints);
  const structural = /* @__PURE__ */ new Set();
  for (const change of options && options.changes || []) {
    const type = change && change.type;
    if (type !== "added" && type !== "removed") continue;
    const path7 = normalizeTriggerPath(change && change.path);
    if (path7) structural.add(path7.toLowerCase());
  }
  const candidates = files && files.length ? files : (options && options.changes || []).map((c) => c && c.path);
  return (candidates || []).some((file) => {
    if (!file || isGeneratedOrVendor(file) || isTestPath(file)) return false;
    const path7 = normalizeTriggerPath(file);
    const name2 = fileNameOf(path7);
    if (README_NAMES.test(name2) || LOCK_NAMES.test(name2) || CHANGELOG_NAMES.test(name2)) return false;
    if (MANIFEST_NAMES.test(name2) || /^cordis\.patch\.ya?ml$/i.test(name2)) return true;
    if (entrypoints.has(path7.toLowerCase())) return true;
    if (!SOURCE_EXTENSIONS.test(path7)) return false;
    if (ENTRY_BASENAMES.test(name2.replace(/\.[^.]+$/, ""))) return true;
    if (structural.has(path7.toLowerCase())) return true;
    return false;
  });
}

// src/host/scan-and-write.js
init_brain_files();

// src/host/store/brain-logic.js
var MEMORY_TYPES = [
  "decision",
  "requirement",
  "architecture",
  "change",
  "bug",
  "lesson",
  "issue",
  "context",
  "preference"
];
var TODO_STATUSES = ["pending", "in_progress", "blocked", "done", "cancelled"];
var TODO_PRIORITIES = ["low", "medium", "high", "urgent"];
var PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };
var HIGH_VALUE_MEMORY_TYPES = { decision: true, architecture: true, bug: true, lesson: true, preference: true };
function makeId(prefix, now, rand) {
  const t = (now != null ? now : Date.now()).toString(36);
  const r = rand != null ? rand : Math.random().toString(36).slice(2, 8);
  return prefix + "-" + t + "-" + r;
}
function normalizeMemoryType(type) {
  const s = String(type || "").toLowerCase().trim();
  return MEMORY_TYPES.indexOf(s) >= 0 ? s : null;
}
function normalizePriority(priority) {
  const s = String(priority || "").toLowerCase().trim();
  return TODO_PRIORITIES.indexOf(s) >= 0 ? s : null;
}
function normalizeStatus(status) {
  const s = String(status || "").toLowerCase().trim();
  return TODO_STATUSES.indexOf(s) >= 0 ? s : null;
}
function makeMemoryEntry(input, now) {
  const i = input || {};
  const importance = Number(i.importance);
  const confidence = Number(i.confidence);
  const relatedFiles = Array.isArray(i.relatedFiles) ? i.relatedFiles.map(String).slice(0, 20) : null;
  const tags = Array.isArray(i.tags) ? i.tags.map(String).slice(0, 10) : null;
  return {
    schemaVersion: 2,
    id: i.id || makeId("mem", now),
    type: normalizeMemoryType(i.type) || "context",
    title: String(i.title || "").slice(0, 200),
    content: String(i.content || ""),
    importance: isNaN(importance) ? 0.5 : Math.min(1, Math.max(0, importance)),
    confidence: isNaN(confidence) ? 0.7 : Math.min(1, Math.max(0, confidence)),
    status: "active",
    ...i.source && typeof i.source === "object" ? { source: i.source } : {},
    ...relatedFiles && relatedFiles.length ? { relatedFiles } : {},
    ...tags && tags.length ? { tags } : {},
    createdAt: now,
    updatedAt: now
  };
}
function isCoreMemory(memory) {
  if (!memory) return false;
  const status = memory.status;
  if (status === "archived" || status === "superseded" || status === "deleted" || status === "dormant") return false;
  return true;
}
function isRetrievableMemory(memory) {
  if (!memory) return false;
  const status = memory.status;
  return status !== "archived" && status !== "superseded" && status !== "deleted";
}
function estimateTokens(text) {
  if (!text) return 0;
  const s = String(text);
  const cn = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  const other = s.length - cn;
  return Math.ceil(cn / 1.5 + other / 4);
}
function makeTodoEntry(input, now) {
  const i = input || {};
  const relatedFiles = Array.isArray(i.relatedFiles) ? i.relatedFiles.map(String).slice(0, 20) : null;
  return {
    id: i.id || makeId("todo", now),
    title: String(i.title || "").slice(0, 200),
    description: String(i.description || ""),
    status: "pending",
    priority: normalizePriority(i.priority) || "medium",
    ...relatedFiles && relatedFiles.length ? { relatedFiles } : {},
    createdAt: now,
    updatedAt: now
  };
}
function activeTodos(todos) {
  const list = (todos || []).filter(function(t) {
    return t && t.status !== "done" && t.status !== "cancelled";
  });
  list.sort(function(a, b) {
    const pa = PRIORITY_ORDER[a.priority] != null ? PRIORITY_ORDER[a.priority] : 2;
    const pb = PRIORITY_ORDER[b.priority] != null ? PRIORITY_ORDER[b.priority] : 2;
    if (pa !== pb) return pa - pb;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  return list;
}
function todoStats(todos) {
  const list = todos || [];
  const active = list.filter(function(t) {
    return t && t.status !== "done" && t.status !== "cancelled";
  });
  const done = list.filter(function(t) {
    return t && t.status === "done";
  });
  return { pendingTodos: active.length, completedTodos: done.length, total: list.length };
}
function memoryScore(m, now) {
  const nowMs = now != null ? now : Date.now();
  const importance = typeof m.importance === "number" ? m.importance : 0.5;
  const created = m.createdAt || 0;
  const ageDays2 = Math.max(0, (nowMs - created) / 864e5);
  let recency = 1 - ageDays2 / 90;
  if (recency < 0) recency = 0;
  if (ageDays2 <= 7) recency = 1;
  const typeBoost = HIGH_VALUE_MEMORY_TYPES[m.type] ? 1 : 0.5;
  return importance * 0.5 + recency * 0.3 + typeBoost * 0.2;
}
function topMemories(memories, n, now) {
  const list = (memories || []).filter(isCoreMemory);
  list.sort(function(a, b) {
    const di = (Number(b.importance) || 0) - (Number(a.importance) || 0);
    if (di !== 0) return di;
    const ua = (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
    if (ua !== 0) return ua;
    return memoryScore(b, now) - memoryScore(a, now);
  });
  return list.slice(0, n || 5);
}
function recentTimeline(timeline, n) {
  const list = (timeline || []).slice();
  list.sort(function(a, b) {
    return (b.occurredAt || 0) - (a.occurredAt || 0);
  });
  return list.slice(0, n || 5);
}
function techStackToType(techStack) {
  if (!techStack || typeof techStack !== "object") return "Untyped";
  const parts = [];
  for (const k of Object.keys(techStack)) {
    const v = techStack[k];
    if (Array.isArray(v)) {
      for (const item of v) if (item) parts.push(String(item));
    } else if (v) {
      parts.push(String(v));
    }
  }
  return parts.length > 0 ? parts.join(" \xB7 ") : "Untyped";
}
function buildContinueData(brain, now) {
  const nowMs = now != null ? now : Date.now();
  const p = brain && brain.project;
  const memories = brain && brain.memories || [];
  const todos = brain && brain.todos || [];
  const timeline = brain && brain.timeline || [];
  const activity = recentTimeline(timeline, 5).map(function(e) {
    return { id: e.id, title: e.title, occurredAt: e.occurredAt, eventType: e.eventType };
  });
  const core = memories.filter(isCoreMemory).slice().sort(function(a, b) {
    return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
  });
  const top = core.map(function(m) {
    return {
      id: m.id,
      type: m.type,
      title: m.title,
      content: String(m.content || "").slice(0, 200),
      importance: m.importance,
      createdAt: m.createdAt
    };
  });
  const active = activeTodos(todos);
  const pending = active.slice(0, 10).map(function(t) {
    return { id: t.id, title: t.title, status: t.status, priority: t.priority };
  });
  const stats = todoStats(todos);
  const activeMemories2 = core;
  const decisions = activeMemories2.filter(function(m) {
    return m.type === "decision";
  });
  const inProgress = active.filter(function(t) {
    return t.status === "in_progress";
  })[0];
  let suggestedNextStep;
  if (inProgress) {
    suggestedNextStep = "\u7E7C\u7E8C\u9032\u884C\u4E2D\u4EFB\u52D9\uFF1A" + inProgress.title;
  } else if (active.length > 0) {
    suggestedNextStep = "\u5EFA\u8B70\u958B\u59CB\uFF1A" + active[0].title;
  } else if (activity.length > 0) {
    suggestedNextStep = "\u7121\u5F85\u8FA6\uFF1B\u53EF\u53C3\u8003\u6700\u8FD1\u6D3B\u52D5\uFF1A" + activity[0].title;
  } else {
    suggestedNextStep = "\u66AB\u7121\u5F85\u8FA6\uFF1B\u5EFA\u8B70\u7528 project_todo_add \u898F\u5283\u4E0B\u4E00\u6B65";
  }
  return {
    initialized: Boolean(p && !p.__error),
    projectPath: brain ? brain.projectPath : null,
    project: p && !p.__error ? {
      id: p.id,
      name: p.name,
      type: techStackToType(p.techStack),
      lastUpdateAt: p.updatedAt || p.lastScannedAt || nowMs
    } : null,
    recentActivity: activity,
    topMemories: top,
    pendingTodos: pending,
    stats: {
      pendingTodos: stats.pendingTodos,
      completedTodos: stats.completedTodos,
      decisions: decisions.length,
      memories: activeMemories2.length
    },
    suggestedNextStep
  };
}
function findTodo(todos, ref) {
  const key = String(ref || "").trim();
  if (!key) return null;
  const active = activeTodos(todos);
  for (const t of active) {
    if (t.id === key || t.id.indexOf(key) === 0) return t;
  }
  const lower = key.toLowerCase();
  for (const t of active) {
    if (String(t.title || "").toLowerCase() === lower) return t;
  }
  return null;
}

// src/host/scan-and-write.js
function resolveWritePolicy2(sandboxPolicy) {
  if (!sandboxPolicy) return null;
  try {
    if (typeof sandboxPolicy.resolve === "function") {
      return sandboxPolicy.resolve({ mode: "danger-full-access" });
    }
  } catch (e) {
  }
  return sandboxPolicy;
}
async function markArchitectureStale(fs, sandboxPolicy, projectPath, stale) {
  try {
    assertSafeProjectPath(projectPath);
    const target = brainPath2(projectPath, "project.json");
    const project = await readJson(fs, target);
    if (!project || project.__error) return false;
    if (Boolean(project.architectureStale) === Boolean(stale)) return true;
    project.architectureStale = Boolean(stale);
    project.updatedAt = Date.now();
    return Boolean(await writeJson(fs, target, project, resolveWritePolicy2(sandboxPolicy)));
  } catch (e) {
    return false;
  }
}
function emitPreviewChanged(exec, projectPath) {
  try {
    const executor = exec && exec.ctx || null;
    if (executor && typeof executor.emit === "function") {
      executor.emit("project_brain/preview.changed", { projectPath });
    }
  } catch (e) {
  }
}
async function scanAndWrite(fs, sandboxPolicy, args, toolLabel, runtime = {}) {
  const startMs = Date.now();
  const explicit = args && typeof args.path === "string" && args.path.trim() ? args.path.trim() : null;
  if (!explicit) {
    return {
      ok: false,
      data: {
        error: { code: "E_NO_PATH", message: "path \u5F15\u6578\u5FC5\u50B3\uFF08\u4E0D\u50B3\u6703\u6383\u5230 DSH Desktop \u5B89\u88DD\u76EE\u9304\uFF09" },
        scanDurationMs: Date.now() - startMs
      }
    };
  }
  let projectPath;
  try {
    projectPath = assertSafeProjectPath(explicit);
  } catch (error) {
    return {
      ok: false,
      data: { error: { code: error.code || "E_UNSAFE_PROJECT_PATH", message: String(error.message || error) }, scanDurationMs: Date.now() - startMs }
    };
  }
  const dryRun = Boolean(args && args.dryRun);
  let scan;
  try {
    scan = await scanProject(fs, projectPath);
  } catch (e) {
    return {
      ok: false,
      data: {
        error: { code: "E_SCAN_FAILED", message: String(e && e.message || e) },
        scanDurationMs: Date.now() - startMs
      }
    };
  }
  let existing;
  try {
    existing = await readJson(fs, brainPath2(projectPath, "project.json"));
  } catch (e) {
    existing = null;
  }
  const isRescan = Boolean(existing && existing.id);
  let previousArchitecture = null;
  try {
    previousArchitecture = await readJson(fs, brainPath2(projectPath, "architecture.json"));
  } catch (e) {
  }
  const architectureConfig = runtime.getMemoryConfig ? runtime.getMemoryConfig() : {};
  const architectureMode = runtime && runtime.architectureMode || "full";
  const skipArchitecture = architectureMode === "light" || architectureMode === "none";
  let architecture = null;
  if (!skipArchitecture && architectureConfig.architectureEnabled !== false) {
    try {
      architecture = await buildArchitecture({
        fs,
        projectPath,
        scan,
        previous: previousArchitecture && !previousArchitecture.__error ? previousArchitecture : null,
        config: architectureConfig,
        llm: runtime.getLlm ? runtime.getLlm() : null,
        route: runtime.llmRoute || null,
        getRoute: runtime.getLlmRoute || null,
        sessionId: runtime.sessionId || null
      });
    } catch (e) {
      architecture = { error: { code: e.code || "ARCHITECTURE_FAILED", message: String(e && e.message || e) } };
    }
  }
  const now = Date.now();
  const projectName = scan.projectName || projectPath.split(/[\\/]/).filter(Boolean).pop() || "untitled";
  const existingDescription = sanitizeProjectDescription(existing && existing.description);
  const scannedDescription = sanitizeProjectDescription(scan.description);
  const projectData = {
    id: isRescan ? existing.id : makeId("brain", now),
    name: projectName,
    rootPath: projectPath,
    description: existingDescription && existingDescription !== "Auto-generated by dsh-project-brain" ? existingDescription : scannedDescription || "Auto-generated by dsh-project-brain",
    techStack: scan.techStack,
    stack: scan.stack || {},
    structure: scan.structure || [],
    languages: scan.languages,
    tooling: scan.tooling || [],
    size: { files: scan.fileCount },
    entrypoints: scan.entrypoints,
    topLevel: scan.topLevel,
    directoryMap: existing && existing.directoryMap || [],
    createdAt: isRescan ? existing.createdAt : now,
    updatedAt: now,
    lastScannedAt: now,
    architectureStale: skipArchitecture ? Boolean(existing && existing.architectureStale) : Boolean(architecture && architecture.error)
  };
  if (!dryRun) {
    const writePolicy = resolveWritePolicy2(sandboxPolicy);
    const wroteProject = await writeJson(fs, brainPath2(projectPath, "project.json"), projectData, writePolicy);
    if (!wroteProject) {
      return {
        ok: false,
        data: {
          error: { code: "E_WRITE_FAILED", message: "failed to write " + brainPath2(projectPath, "project.json") + "\uFF08\u53EF\u80FD\u662F sandbox \u62D2\u7D55\uFF09" },
          scanDurationMs: Date.now() - startMs
        }
      };
    }
    if (architecture && !architecture.error) {
      const wroteArchitecture = await writeJson(fs, brainPath2(projectPath, "architecture.json"), architecture, writePolicy);
      if (!wroteArchitecture) {
        architecture = { error: { code: "ARCHITECTURE_WRITE_FAILED", message: "\u67B6\u69CB\u8CC7\u6599\u5BEB\u5165\u5931\u6557\uFF0C\u5C08\u6848\u57FA\u790E\u6383\u63CF\u4ECD\u5DF2\u5B8C\u6210" } };
      }
    }
    try {
      await appendJsonl(fs, brainPath2(projectPath, "timeline.jsonl"), {
        id: makeId("evt", now),
        title: isRescan ? "\u5B8C\u6210\u91CD\u6383\uFF08" + toolLabel + "\uFF09" : "\u5B8C\u6210 project_init \u6383\u63CF",
        eventType: isRescan ? "rescan" : "init",
        occurredAt: now,
        architectureMode,
        sessionId: runtime.sessionId || null,
        triggerFiles: Array.isArray(runtime.triggerFiles) ? runtime.triggerFiles.slice(0, 20) : void 0,
        detail: "languages=" + (Object.keys(scan.languages).join("/") || "none") + " files=" + scan.fileCount + " architectureMode=" + architectureMode + (architecture && !architecture.error ? " modules=" + architecture.stats.modules + " edges=" + architecture.stats.edges + " architecture=" + architecture.source : "")
      }, writePolicy);
    } catch (e) {
    }
  }
  return {
    ok: true,
    data: {
      projectId: projectData.id,
      name: projectName,
      isRescan,
      createdAtPreserved: isRescan,
      scanDurationMs: Date.now() - startMs,
      stats: {
        files: scan.fileCount,
        languages: scan.languages,
        techStack: scan.techStack,
        stack: scan.stack || {},
        structure: scan.structure || [],
        tooling: scan.tooling || [],
        entrypoints: scan.entrypoints,
        topLevel: scan.topLevel
      },
      partial: Boolean(architecture && architecture.error),
      architecture: architecture && !architecture.error ? {
        generated: true,
        changed: architecture.changed,
        version: architecture.version,
        source: architecture.source,
        modules: architecture.stats.modules,
        edges: architecture.stats.edges,
        llm: architecture.llm
      } : {
        generated: false,
        error: architecture && architecture.error ? architecture.error : null
      },
      dryRun
    }
  };
}

// src/tools.js
var baseOutputSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
    code: { type: "string" },
    message: { type: "string" }
  }
};
var pathParam = { type: "string", description: "\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u53EF\u9078\uFF1B\u9810\u8A2D\u5F9E\u7576\u524D DSH Session \u7684 workspace \u81EA\u52D5\u89E3\u6790\uFF09" };
var dryRunParam = { type: "boolean", description: "\u50C5\u9810\u89BD\uFF0C\u4E0D\u5BEB\u6A94\u6848\uFF08\u9810\u8A2D false\uFF09" };
function executionRoute(exec) {
  if (!exec) return null;
  return resolveSessionRoute(exec.session) || resolveSessionRoute(exec.currentSession) || resolveSessionRoute(exec.agent && exec.agent.session) || resolveSessionRoute(exec.agent) || resolveSessionRoute(exec.ctx && exec.ctx.session);
}
function executionSessionId(exec) {
  return exec && (exec.sessionId || exec.session && exec.session.id || exec.agent && exec.agent.sessionId || exec.agent && exec.agent.session && exec.agent.session.id) || null;
}
function buildInitTool({ fs, sandboxPolicy, getMemoryConfig, getLlm }) {
  return defineTool({
    name: "project_init",
    description: "dsh-project-brain: \u6383\u63CF\u76EE\u6A19\u5C08\u6848\u3001\u8B58\u5225\u6280\u8853\u68E7\u3001\u751F\u6210 .project-brain/project.json\uFF08\u542B timeline init \u4E8B\u4EF6\uFF09\u3002\u9996\u6B21\u8A2A\u554F\u65B0\u5C08\u6848\u6642\u547C\u53EB\u4E00\u6B21\uFF1B\u91CD\u8907\u547C\u53EB\u5B89\u5168\uFF08\u4FDD\u7559 projectId/createdAt\uFF09\uFF1B\u589E\u91CF\u66F4\u65B0\u7528 project_rescan\u3002\u9810\u8A2D\u81EA\u52D5\u4F7F\u7528\u7576\u524D DSH Session \u7684 workspace\uFF1B\u50C5 CLI/\u820A\u5BBF\u4E3B\u9700\u8981\u986F\u5F0F\u50B3 path\u3002",
    parameters: { path: pathParam, dryRun: dryRunParam },
    // 關鍵修復（P0.4.3）：render 必須巢狀在 output 裡（dsh-tools 0.1.0-rc.x 期望
    // options.output.render）。之前誤把 render 放 top-level，導致 userRender 變 undefined，
    // 框架呼叫時拋 "userRender is not a function"。
    output: { schema: baseOutputSchema, render: (_args, value) => renderProjectTool(value, "project init") },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        if (projectPath === ".") {
          return { ok: false, data: { error: { code: "E_NO_PATH", message: "\u7121\u6CD5\u5F9E\u7576\u524D Session \u89E3\u6790 workspace \u8DEF\u5F91" } } };
        }
        const resolvedArgs = Object.assign({}, args || {}, { path: projectPath });
        const result = await scanAndWrite(fs, sandboxPolicy, resolvedArgs, "project_init", {
          getMemoryConfig,
          getLlm,
          llmRoute: executionRoute(exec),
          getLlmRoute: () => executionRoute(exec),
          sessionId: executionSessionId(exec)
        });
        if (result.ok && !(args && args.dryRun)) {
          emitPreviewChanged(exec, projectPath);
        }
        return result;
      } catch (e) {
        return {
          ok: false,
          data: { error: { code: "E_SCAN_FAILED", message: String(e && e.message || e) } }
        };
      }
    }
  });
}
function buildRescanTool({ fs, sandboxPolicy, getMemoryConfig, getLlm }) {
  return defineTool({
    name: "project_rescan",
    description: "dsh-project-brain: \u91CD\u6383\u5DF2\u6709 .project-brain \u7684\u5C08\u6848\u4E26\u589E\u91CF\u91CD\u65B0\u6574\u7406 project.json\uFF08\u4FDD\u7559 projectId/createdAt/\u8A18\u61B6/\u5F85\u8FA6\uFF0C\u53EA\u66F4\u65B0\u6280\u8853\u68E7/\u5165\u53E3/\u8A9E\u8A00\u7D71\u8A08\uFF09\uFF0C\u8FFD\u52A0 timeline rescan \u4E8B\u4EF6\u3002\u5C08\u6848\u7D50\u69CB\u8B8A\u5316\u5F8C\u547C\u53EB\uFF1B\u9810\u8A2D\u81EA\u52D5\u4F7F\u7528\u7576\u524D DSH Session \u7684 workspace\u3002",
    parameters: { path: pathParam, dryRun: dryRunParam },
    output: { schema: baseOutputSchema, render: (_args, value) => renderProjectTool(value, "rescan") },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        if (projectPath === ".") {
          return { ok: false, data: { error: { code: "E_NO_PATH", message: "\u7121\u6CD5\u5F9E\u7576\u524D Session \u89E3\u6790 workspace \u8DEF\u5F91" } } };
        }
        const resolvedArgs = Object.assign({}, args || {}, { path: projectPath });
        const result = await scanAndWrite(fs, sandboxPolicy, resolvedArgs, "project_rescan", {
          getMemoryConfig,
          getLlm,
          llmRoute: executionRoute(exec),
          getLlmRoute: () => executionRoute(exec),
          sessionId: executionSessionId(exec)
        });
        if (result.ok && !(args && args.dryRun)) {
          emitPreviewChanged(exec, projectPath);
        }
        return result;
      } catch (e) {
        return {
          ok: false,
          data: { error: { code: "E_SCAN_FAILED", message: String(e && e.message || e) } }
        };
      }
    }
  });
}
function renderProjectTool(value, toolLabel) {
  if (!value || typeof value !== "object") {
    return [{ type: "text", text: `dsh-project-brain: ${toolLabel} FAILED - non-object result: ` + String(value) }];
  }
  if (value.ok) {
    const d = value.data || {};
    if (d.error) {
      return [{ type: "text", text: `dsh-project-brain: ${toolLabel} FAILED - ${d.error.code}: ${d.error.message}` }];
    }
    return [
      { type: "text", text: `dsh-project-brain: ${toolLabel} OK` },
      { type: "text", text: `  projectId: ${d.projectId}` },
      { type: "text", text: `  name: ${d.name}` },
      { type: "text", text: `  isRescan: ${d.isRescan}\uFF08id/createdAt \u5DF2\u4FDD\u7559\uFF09` },
      { type: "text", text: `  scanDurationMs: ${d.scanDurationMs}` },
      { type: "text", text: `  stats: ${JSON.stringify(d.stats)}` },
      { type: "text", text: `  architecture: ${JSON.stringify(d.architecture || {})}` },
      ...d.dryRun ? [{ type: "text", text: "  (dry run)" }] : []
    ];
  }
  if (value.data && value.data.error) {
    return [{ type: "text", text: `dsh-project-brain: ${toolLabel} FAILED - ${value.data.error.code}: ${value.data.error.message}` }];
  }
  return [{ type: "text", text: `dsh-project-brain: ${toolLabel} FAILED - ` + JSON.stringify(value) }];
}
function buildProjectInitTool(opts) {
  return buildInitTool(opts);
}
function buildProjectRescanTool(opts) {
  return buildRescanTool(opts);
}

// src/tools/memory.js
init_brain_files();
import { defineTool as defineTool2 } from "@deepseek-ai/dsh-tools";

// src/host/memory/admit.js
import { createHash } from "node:crypto";
init_brain_files();
init_write_lock();
var CORE_MAX_ITEMS = 25;
var CORE_MAX_TOKENS = 1500;
var TITLE_JACCARD_SUGGEST = 0.85;
var PINNED_RATIO = 0.5;
var coreLimits = { maxItems: CORE_MAX_ITEMS, maxTokens: CORE_MAX_TOKENS };
function setCoreLimits(config) {
  const items = Number(config && config.coreMaxItems);
  const tokens = Number(config && config.coreMaxTokens);
  coreLimits = {
    maxItems: Number.isFinite(items) && items > 0 ? Math.round(items) : CORE_MAX_ITEMS,
    maxTokens: Number.isFinite(tokens) && tokens > 0 ? Math.round(tokens) : CORE_MAX_TOKENS
  };
  return coreLimits;
}
function maxPinnedCount(limits) {
  const resolved = limits || coreLimits;
  return Math.max(1, Math.floor(resolved.maxItems * PINNED_RATIO));
}
function pinnedMemories(rows) {
  return (rows || []).filter((m) => m && m.pinned === true && isCoreMemory(m));
}
var DURABLE_TYPES = /* @__PURE__ */ new Set(["decision", "requirement", "architecture", "bug", "lesson", "preference"]);
var DEIXIS_RE = /(這個|這些|這條|這段|這句|這點|這樣|這種|這方面|這角度|那個|那些|上述|上面(?:說|提|講)?的|前面(?:說|提|講)?的|剛才(?:說|提|講)?的|如上|此事|本次討論|你說的|我說的|上文)|\b(?:this|these|those|the above)\b/i;
var ANCHOR_RE = /[A-Za-z][A-Za-z0-9._/-]{1,}|[「『《"'`\[(][^\s」』》"'`\])]{2,}[」』》"'`\])]/;
var DEIXIS_SELF_CONTAINED_CHARS = 30;
function findDeixis(text) {
  const hit = String(text || "").match(DEIXIS_RE);
  return hit ? hit[0] : "";
}
function hasUnresolvedReference(title, content, { maxSelfContainedChars = DEIXIS_SELF_CONTAINED_CHARS } = {}) {
  const body = String(content || "").trim();
  const blob = String(title || "") + "\n" + body;
  if (!findDeixis(blob)) return false;
  if (maxSelfContainedChars <= 0) return true;
  if (ANCHOR_RE.test(blob)) return false;
  return body.replace(/\s+/g, "").length <= maxSelfContainedChars;
}
function memoryFingerprint(item) {
  const type = String(item && item.type || "").toLowerCase();
  const title = String(item && item.title || "");
  const content = String(item && item.content || "");
  const normalized = (type + "\n" + title + "\n" + content).toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 24);
}
function isMockLlmPayload(text) {
  const s = String(text || "");
  return /\[MOCK_LLM\]/.test(s) || /\[parse-fallback\]/.test(s);
}
function titleBigrams(s) {
  const t = String(s || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, " ").trim();
  if (t.length < 2) return /* @__PURE__ */ new Set([t]);
  const out = /* @__PURE__ */ new Set();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}
function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
function titleJaccard(a, b) {
  return jaccard(titleBigrams(a), titleBigrams(b));
}
function fileListHeavy(content) {
  const lines = String(content || "").split(/\n/).map((l) => l.trim()).filter(Boolean);
  const pathLines = lines.filter((l) => /^[-*]\s+\S+/.test(l) && /[./\\]/.test(l));
  const prose = String(content || "").replace(/^[-*].*$/gm, "").replace(/\s+/g, "");
  return pathLines.length >= 3 && prose.length < 40;
}
function isActivityReport(title, content) {
  const t = String(title || "");
  const c = String(content || "");
  const blob = t + "\n" + c;
  if (/改了\s*\d+\s*個檔案/.test(blob)) return true;
  if (/本次\s*session\s*改動/i.test(blob)) return true;
  if (fileListHeavy(c)) return true;
  if (/^(本次完成|本次工作|完成情況|驗收清單|工作總結)/.test(t.trim()) && /(驗收|PASS|git 快進|改了)/.test(c)) return true;
  const reportHits = (blob.match(/驗收\s*\d+\s*\/\s*\d+|全套 smoke|git 快進|同步至 v\d/gi) || []).length;
  if (reportHits >= 3) return true;
  if (reportHits >= 2 && !/根因/.test(c) && !/以後/.test(c)) return true;
  return false;
}
function isChangelogGenre(title, content) {
  const t = String(title || "");
  const c = String(content || "");
  const versionLed = /^\s*v?\d+\.\d+(?:\.\d+)?\b/i.test(t);
  if (fileListHeavy(c)) return true;
  if (/改了\s*\d+\s*個檔案/.test(t) || /改了\s*\d+\s*個檔案/.test(c)) return true;
  if (/本次\s*session\s*改動/i.test(t) || /本次\s*session\s*改動/i.test(c)) return true;
  if (/^(git\s+)?commit\b/i.test(t.trim()) || /^PR\s*#\s*\d+/i.test(t.trim())) return true;
  if (/\b(changelog|release notes)\b/i.test(t)) return true;
  if (/\bpatch\s*#\s*\d+/i.test(t)) return true;
  if (versionLed && /(release|改動|驗收)/i.test(t) && isActivityReport(t, c)) return true;
  if (isActivityReport(t, c)) return true;
  return false;
}
function compactMemoryText(text, maxChars) {
  const raw = String(text || "").trim();
  const limit = Math.max(40, Number(maxChars) || 400);
  if (raw.length <= limit) return raw;
  const parts = raw.split(/(?<=[。！？.!?])\s*/).filter(Boolean);
  let acc = "";
  for (const part of parts) {
    const next = acc ? acc + part : part;
    if (next.length > limit) break;
    acc = next;
  }
  if (!acc) acc = raw.slice(0, limit);
  return acc.trim();
}
function compactCandidate(candidate, channel) {
  const next = Object.assign({}, candidate);
  const max = channel === "user_explicit" ? 800 : 400;
  next.title = String(next.title || "").trim().slice(0, 120);
  next.content = compactMemoryText(next.content, max);
  if (channel !== "user_explicit" && typeof next.importance === "number") {
    next.importance = Math.min(next.importance, 0.85);
  }
  return next;
}
function ruleGate(candidate) {
  const type = normalizeMemoryType(candidate && candidate.type) || String(candidate && candidate.type || "").toLowerCase();
  const title = String(candidate && candidate.title || "").trim();
  const content = String(candidate && candidate.content || "").trim();
  const sourceKind = candidate && candidate.source && candidate.source.kind;
  if (type === "change") {
    return { ok: false, code: "E_ADMIT_RULE", reason: "type_change", route: "timeline" };
  }
  if (type === "issue") {
    return { ok: false, code: "E_ADMIT_RULE", reason: "type_issue", route: "todo" };
  }
  if (type === "context") {
    if (sourceKind !== "user_explicit") {
      return { ok: false, code: "E_ADMIT_RULE", reason: "context_not_user_explicit" };
    }
  } else if (!DURABLE_TYPES.has(type)) {
    return { ok: false, code: "E_ADMIT_RULE", reason: "type_forbidden" };
  }
  const minContent = sourceKind === "user_explicit" ? 12 : 20;
  if (content.length < minContent) {
    return { ok: false, code: "E_ADMIT_RULE", reason: "content_too_short" };
  }
  if (hasUnresolvedReference(title, content)) {
    return { ok: false, code: "E_ADMIT_RULE", reason: "unresolved_reference" };
  }
  if (isChangelogGenre(title, content)) {
    return { ok: false, code: "E_ADMIT_RULE", reason: "changelog_genre", route: "timeline" };
  }
  return { ok: true };
}
function coreTokenSum(rows) {
  return (rows || []).filter(isCoreMemory).reduce((sum, m) => {
    return sum + estimateTokens(String(m.title || "") + String(m.content || ""));
  }, 0);
}
function isUserAuthored(memory) {
  const source = memory && memory.source;
  if (!source) return false;
  return source.kind === "user_explicit" || source.editedBy === "user";
}
var RECENT_ACCESS_WINDOW_MS = 7 * 864e5;
function wasRecentlyAccessed(memory, now) {
  const at = Number(memory && memory.lastAccessedAt) || 0;
  return at > 0 && now - at <= RECENT_ACCESS_WINDOW_MS;
}
function enforceCoreCap(rows, { pinnedIds = [], now = Date.now(), limits } = {}) {
  const list = (rows || []).map((m) => Object.assign({}, m));
  const pinned = new Set(pinnedIds || []);
  const { maxItems, maxTokens } = limits || coreLimits;
  let changed = false;
  function actives() {
    return list.filter(isCoreMemory);
  }
  function pickVictim(active) {
    const pools = [
      active.filter((m) => !pinned.has(m.id) && m.pinned !== true),
      active.filter((m) => !pinned.has(m.id)),
      active.slice()
    ];
    const pool = pools.find((p) => p.length > 0);
    if (!pool) return null;
    pool.sort((a, b) => {
      const ua = isUserAuthored(a) ? 1 : 0;
      const ub = isUserAuthored(b) ? 1 : 0;
      if (ua !== ub) return ua - ub;
      const ra = wasRecentlyAccessed(a, now) ? 1 : 0;
      const rb = wasRecentlyAccessed(b, now) ? 1 : 0;
      if (ra !== rb) return ra - rb;
      const ia = Math.round((Number(a.importance) || 0) * 10);
      const ib = Math.round((Number(b.importance) || 0) * 10);
      if (ia !== ib) return ia - ib;
      return (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0);
    });
    return pool[0] || null;
  }
  while (true) {
    const active = actives();
    if (active.length <= maxItems && coreTokenSum(active) <= maxTokens) break;
    if (!active.length) break;
    const victim = pickVictim(active);
    if (!victim) break;
    const idx = list.findIndex((m) => m.id === victim.id);
    if (idx < 0) break;
    list[idx] = Object.assign({}, list[idx], { status: "dormant", updatedAt: now });
    changed = true;
  }
  return { rows: list, changed };
}
function backfillMemoryStatuses(rows, now = Date.now()) {
  let changed = false;
  const next = (rows || []).map((m) => {
    if (!m) return m;
    let status = m.status;
    let archiveReason = m.archiveReason;
    if (!status || status === "reinforced") status = "active";
    if (status === "deleted") status = "archived";
    const changelog = m.type === "change" || isChangelogGenre(m.title, m.content);
    if (changelog && status !== "archived" && status !== "superseded") {
      status = "archived";
      archiveReason = "backfill_rule";
    }
    if (status === m.status && archiveReason === m.archiveReason) return m;
    changed = true;
    return Object.assign({}, m, {
      status,
      ...archiveReason && archiveReason !== m.archiveReason ? { archiveReason, updatedAt: now } : status !== m.status ? { updatedAt: now } : {}
    });
  });
  return { rows: next, changed };
}
function collectSuggestSupersede(rows) {
  const items = (rows || []).filter(isRetrievableMemory);
  const actions = [];
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (!a || !b || a.type !== b.type) continue;
      if (titleJaccard(a.title, b.title) < TITLE_JACCARD_SUGGEST) continue;
      const key = [a.id, b.id].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      actions.push({
        action: "suggest_supersede",
        ids: [a.id, b.id],
        titles: [a.title, b.title],
        note: "title Jaccard \u2265 " + TITLE_JACCARD_SUGGEST + "\uFF1B\u9700\u986F\u5F0F supersede\uFF0C\u81EA\u52D5\u8DEF\u5F91\u4E0D\u5408\u4E26"
      });
    }
  }
  return actions;
}
function housekeepMemories(rows, { now = Date.now(), pinnedIds = [], limits } = {}) {
  const before = (rows || []).slice();
  const bf = backfillMemoryStatuses(before, now);
  const cap = enforceCoreCap(bf.rows, { pinnedIds, now, limits });
  const suggestions = collectSuggestSupersede(cap.rows);
  const changed = bf.changed || cap.changed;
  const actions = [];
  const prev = new Map(before.map((m) => [m && m.id, m]));
  for (const m of cap.rows) {
    const o = prev.get(m.id);
    if (!o) continue;
    if (o.status !== m.status && m.status === "archived" && m.archiveReason === "backfill_rule") {
      actions.push({ action: "archive_rule", id: m.id, title: m.title });
    } else if (o.status !== m.status && m.status === "dormant") {
      actions.push({ action: "evict_to_dormant", id: m.id, title: m.title });
    }
  }
  return {
    rows: cap.rows,
    changed,
    actions: actions.concat(suggestions)
  };
}
function findFingerprintHit(memories, fingerprint2) {
  return (memories || []).find((m) => {
    if (!m || !m.source || m.source.fingerprint !== fingerprint2) return false;
    return m.status !== "archived" && m.status !== "superseded" && m.status !== "deleted";
  }) || null;
}
function evaluateAdmit(candidate, ctx) {
  const now = ctx && typeof ctx.now === "number" ? ctx.now : Date.now();
  const memories = ctx && ctx.memories || [];
  const channel = ctx && ctx.channel || "automatic";
  if (ctx && ctx.initialized === false) {
    return { action: "reject", code: "E_NOT_INITIALIZED", reason: "project not initialized" };
  }
  const working = compactCandidate(Object.assign({}, candidate), channel);
  const gated = ruleGate(working);
  if (!gated.ok) {
    return { action: "reject", code: gated.code, reason: gated.reason, route: gated.route };
  }
  if (channel !== "user_explicit") {
    const llm = ctx && ctx.llm;
    if (!llm) return { action: "reject", code: "E_ADMIT_LLM_UNAVAILABLE", reason: "llm confirm required" };
    if (llm.unavailable) return { action: "reject", code: "E_ADMIT_LLM_UNAVAILABLE", reason: llm.reason || "llm unavailable" };
    if (llm.admit !== true) return { action: "reject", code: "E_ADMIT_REJECTED", reason: llm && llm.reason || "admit false" };
    if (llm.type) {
      const nextType = normalizeMemoryType(llm.type);
      if (nextType) working.type = nextType;
    }
  }
  const fingerprint2 = memoryFingerprint(working);
  const existing = findFingerprintHit(memories, fingerprint2);
  if (existing) {
    return { action: "skip", existingId: existing.id, fingerprint: fingerprint2, candidate: working };
  }
  const explicitSupersedes = ctx && ctx.llm && ctx.llm.supersedes || working.supersedes || working.source && working.source.supersedes || null;
  let supersedesId = null;
  if (explicitSupersedes) {
    const old = memories.find((m) => m && m.id === explicitSupersedes);
    if (old && isRetrievableMemory(old)) supersedesId = old.id;
  }
  const suggestions = [];
  for (const m of memories) {
    if (!isRetrievableMemory(m) || m.type !== working.type) continue;
    if (titleJaccard(m.title, working.title) >= TITLE_JACCARD_SUGGEST) {
      suggestions.push({
        action: "suggest_supersede",
        ids: [m.id],
        titles: [m.title, working.title]
      });
    }
  }
  return {
    action: "insert",
    fingerprint: fingerprint2,
    supersedesId,
    suggestions,
    candidate: working,
    now
  };
}
function parseJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const candidates = [
    raw,
    raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim()
  ];
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch (e) {
    }
  }
  return null;
}
function parseAdmitConfirm(text) {
  if (isMockLlmPayload(text)) return { unavailable: true, reason: "mock llm" };
  const parsed = parseJsonObject(text);
  if (!parsed || typeof parsed !== "object" || typeof parsed.admit !== "boolean") {
    return { unavailable: true, reason: "unparseable confirm" };
  }
  return {
    admit: parsed.admit === true,
    type: parsed.type || null,
    reason: parsed.reason || "",
    supersedes: parsed.supersedes || null
  };
}
function admitPrompt(candidate) {
  return [
    "\u5224\u65B7\u4E0B\u9762\u9019\u689D\u5019\u9078\u662F\u5426\u61C9\u5BEB\u5165\u5C08\u6848\u9577\u671F\u8A18\u61B6\uFF08\u8DE8\u6703\u8A71\u4ECD\u70BA\u771F\u7684\u6C7A\u7B56/\u7D04\u675F/\u67B6\u69CB\u4E8B\u5BE6/\u6559\u8A13\uFF09\u3002",
    "changelog\u3001\u672C\u6B21\u6539\u4E86\u54EA\u4E9B\u6A94\u6848\u3001\u6703\u8A71\u6D41\u6C34\u8CEC\u4E0D\u8981 admit\u3002",
    "\u53EA\u8F38\u51FA\u56B4\u683C JSON\uFF1A" + JSON.stringify({ admit: true, type: "decision", reason: "why", supersedes: null }),
    "\u5019\u9078\uFF1A" + JSON.stringify({
      type: candidate.type,
      title: candidate.title,
      content: String(candidate.content || "").slice(0, 800)
    })
  ].join("\n");
}
async function confirmWithSessionLlm({ llm, route, sessionId, candidate }) {
  if (!llm || typeof llm.stream !== "function" || !route || !route.provider || !route.model) {
    return { unavailable: true, reason: "llm or route missing" };
  }
  try {
    const text = await streamLlmText(llm, route, admitPrompt(candidate), sessionId, 15e3, {
      system: "Return strict JSON only. admit=true only for durable project facts, never changelogs.",
      maxTokens: 400,
      purpose: "project-memory-admit"
    });
    return parseAdmitConfirm(text);
  } catch (e) {
    return { unavailable: true, reason: String(e && e.message || e) };
  }
}
async function persistAdmitted({ fs, projectPath, memories, entry, supersedesId, now, pinnedIds }) {
  let rows = (memories || []).slice();
  if (supersedesId) {
    rows = rows.map((m) => {
      if (m.id !== supersedesId) return m;
      return Object.assign({}, m, {
        status: "superseded",
        updatedAt: now,
        lastAccessedAt: now,
        supersededBy: entry.id
      });
    });
  }
  rows.push(entry);
  const capped = enforceCoreCap(rows, { pinnedIds: [...pinnedIds || [], entry.id], now });
  const needRewrite = Boolean(supersedesId) || capped.changed;
  if (needRewrite) {
    const ok3 = await writeJsonl(fs, brainPath2(projectPath, "memory.jsonl"), capped.rows);
    if (!ok3) return { ok: false, code: "E_WRITE_FAILED" };
    return { ok: true, entry, rows: capped.rows };
  }
  const ok2 = await appendJsonl(fs, brainPath2(projectPath, "memory.jsonl"), entry);
  if (!ok2) return { ok: false, code: "E_WRITE_FAILED" };
  return { ok: true, entry, rows: capped.rows };
}
async function admitMemory(options = {}) {
  const { fs, projectPath } = options;
  if (!fs || !projectPath) {
    return { ok: false, code: "E_NOT_INITIALIZED", message: "missing fs/projectPath" };
  }
  return withWriteLock(brainTxKey(projectPath, "memory.jsonl"), () => admitMemoryTx(options));
}
async function admitMemoryTx({
  fs,
  projectPath,
  candidate,
  channel = "automatic",
  llmConfirm,
  now = Date.now(),
  pinnedIds
} = {}) {
  const brain = await readBrain(fs, projectPath);
  if (!brain.project || brain.project.__error) {
    return { ok: false, code: "E_NOT_INITIALIZED", message: "project not initialized" };
  }
  let llm = null;
  if (channel !== "user_explicit") {
    if (typeof llmConfirm === "function") {
      try {
        llm = await llmConfirm(candidate);
      } catch (e) {
        return { ok: false, code: "E_ADMIT_LLM_UNAVAILABLE", message: String(e && e.message || e) };
      }
    } else if (llmConfirm && typeof llmConfirm === "object") {
      llm = llmConfirm;
    }
  }
  const decision = evaluateAdmit(candidate, {
    memories: brain.memories,
    channel,
    now,
    initialized: true,
    llm
  });
  if (decision.action === "reject") {
    if (decision.route === "todo") {
      const title = String(candidate && candidate.title || "").trim();
      if (title) {
        const todo = makeTodoEntry({
          title,
          description: String(candidate && candidate.content || "")
        }, now);
        await appendJsonl(fs, brainPath2(projectPath, "todo.jsonl"), todo);
        return { ok: false, code: decision.code, reason: decision.reason, routed: "todo", todoId: todo.id };
      }
    }
    if (decision.route === "timeline") {
      await appendJsonl(fs, brainPath2(projectPath, "timeline.jsonl"), {
        id: makeId("evt", now),
        title: String(candidate && candidate.title || "rejected change"),
        eventType: "change",
        occurredAt: now,
        detail: "admit rejected: " + (decision.reason || "")
      });
      return { ok: false, code: decision.code, reason: decision.reason, routed: "timeline" };
    }
    return { ok: false, code: decision.code, reason: decision.reason, message: decision.reason };
  }
  if (decision.action === "skip") {
    return { ok: true, action: "skip", id: decision.existingId, fingerprint: decision.fingerprint };
  }
  const working = decision.candidate;
  const fingerprint2 = decision.fingerprint;
  const source = Object.assign({}, working.source || {}, {
    kind: working.source && working.source.kind || (channel === "user_explicit" ? "user_explicit" : "agent"),
    fingerprint: fingerprint2
  });
  const entry = makeMemoryEntry({
    type: working.type,
    title: working.title,
    content: working.content,
    importance: working.importance,
    confidence: working.confidence,
    relatedFiles: working.relatedFiles,
    tags: working.tags,
    source
  }, now);
  if (decision.supersedesId) {
    entry.source = Object.assign({}, entry.source, { supersedes: decision.supersedesId });
  }
  const persisted = await persistAdmitted({
    fs,
    projectPath,
    memories: brain.memories,
    entry,
    supersedesId: decision.supersedesId,
    now,
    pinnedIds: pinnedIds || [entry.id]
  });
  if (!persisted.ok) return { ok: false, code: persisted.code || "E_WRITE_FAILED", message: "failed to write memory.jsonl" };
  return {
    ok: true,
    action: "insert",
    id: entry.id,
    entry,
    supersedesId: decision.supersedesId || null,
    suggestions: decision.suggestions || []
  };
}
async function persistHousekeep(fs, projectPath, options = {}) {
  return withWriteLock(brainTxKey(projectPath, "memory.jsonl"), () => persistHousekeepTx(fs, projectPath, options));
}
async function persistHousekeepTx(fs, projectPath, { now = Date.now(), pinnedIds = [], writeTimeline = true } = {}) {
  const brain = await readBrain(fs, projectPath);
  if (!brain.project || brain.project.__error) {
    return { ok: false, code: "E_NOT_INITIALIZED", changed: false };
  }
  const hk = housekeepMemories(brain.memories || [], { now, pinnedIds });
  if (!hk.changed) return { ok: true, changed: false, actions: hk.actions, rows: hk.rows };
  const wrote = await writeJsonl(fs, brainPath2(projectPath, "memory.jsonl"), hk.rows);
  if (!wrote) return { ok: false, code: "E_WRITE_FAILED", changed: false, actions: hk.actions };
  if (writeTimeline) {
    const archived = hk.actions.filter((a) => a.action === "archive_rule").length;
    const evicted = hk.actions.filter((a) => a.action === "evict_to_dormant").length;
    await appendJsonl(fs, brainPath2(projectPath, "timeline.jsonl"), {
      id: makeId("evt", now),
      title: "\u8A18\u61B6\u6574\u7406\u5B8C\u6210\uFF08\u6B78\u6A94 " + archived + " \xB7 \u4F11\u7720 " + evicted + "\uFF09",
      eventType: "dream",
      occurredAt: now,
      detail: "trigger=housekeep archived=" + archived + " evicted=" + evicted
    });
  }
  return { ok: true, changed: true, actions: hk.actions, rows: hk.rows };
}
async function ensureHousekeepOnRead(fs, projectPath) {
  try {
    return await persistHousekeep(fs, projectPath, { writeTimeline: false, pinnedIds: [] });
  } catch (e) {
    return { ok: false, changed: false, error: String(e && e.message || e) };
  }
}

// src/tools/memory.js
init_write_lock();
function emitPreviewChanged2(exec, projectPath) {
  try {
    const executor = exec && exec.ctx || null;
    if (executor && typeof executor.emit === "function") {
      executor.emit("project_brain/preview.changed", { projectPath });
    }
  } catch (e) {
  }
}
function executionRoute2(exec) {
  if (!exec) return null;
  return resolveSessionRoute(exec.session) || resolveSessionRoute(exec.currentSession) || resolveSessionRoute(exec.agent && exec.agent.session) || resolveSessionRoute(exec.agent) || resolveSessionRoute(exec.ctx && exec.ctx.session);
}
function executionSessionId2(exec) {
  return exec && (exec.sessionId || exec.session && exec.session.id || exec.agent && exec.agent.sessionId || exec.agent && exec.agent.session && exec.agent.session.id) || null;
}
function buildMemoryAddTool({ fs, sandboxPolicy, getLlm }) {
  return defineTool2({
    name: "project_memory_add",
    description: "dsh-project-brain: \u5BEB\u5165\u4E00\u689D\u8DE8\u6703\u8A71\u4ECD\u70BA\u771F\u7684\u5C08\u6848\u8A18\u61B6\uFF08decision/requirement/architecture/bug/lesson/preference\uFF09\u3002\u4F7F\u7528\u8005\u660E\u78BA\u8868\u9054\u7684\u9577\u671F\u5354\u4F5C\u53E3\u5F91\u8207\u5DE5\u4F5C\u504F\u597D\u7528 preference\u3002\u4E0D\u8981\u5BEB\u5165 changelog\u3001\u672C\u6B21\u6539\u4E86\u54EA\u4E9B\u6A94\u6848\u6216\u6703\u8A71\u6D41\u6C34\u8CEC\uFF1B\u9032\u884C\u4E2D\u7684\u5DE5\u4F5C\u7528 project_todo_*\u3002 content \u5FC5\u9808\u81EA\u5305\u542B\uFF1A\u4E0D\u8981\u51FA\u73FE\u300C\u9019\u500B/\u90A3\u500B/\u4E0A\u9762\u8AAA\u7684\u300D\u9019\u985E\u6307\u4EE3\u8A5E\uFF0C\u63DB\u6210\u5B83\u771F\u6B63\u6307\u7684\u6771\u897F\u3002 importance 0~1\u3002\u5DE5\u5177\u53EF\u80FD\u56E0\u898F\u5247\u6216\u6A21\u578B\u78BA\u8A8D\u62D2\u7D55\uFF0C\u4E0D\u8981\u6539\u5BEB\u6210 changelog \u518D\u8A66\u3002",
    parameters: {
      type: { type: "string", description: "\u8A18\u61B6\u578B\u5225\uFF0C\u5217\u8209\uFF1A" + MEMORY_TYPES.join(" | ") },
      title: { type: "string", description: "\u6A19\u984C\uFF08\u4E00\u53E5\u8A71\uFF0C<=200 \u5B57\u5143\uFF09" },
      content: { type: "string", description: "\u6B63\u6587\uFF1Awhat + why\uFF08\u6C7A\u7B56\u9700\u542B\u7406\u7531\u8207\u88AB\u5426\u65B9\u6848\uFF09" },
      importance: { type: "number", description: "\u91CD\u8981\u6027 0~1\uFF0C\u9810\u8A2D 0.5" },
      confidence: { type: "number", description: "\u53EF\u4FE1\u5EA6 0~1\uFF0C\u9810\u8A2D 0.7" },
      relatedFiles: { type: "array", items: { type: "string" }, description: "\u76F8\u95DC\u6A94\u6848\u8DEF\u5F91\uFF08\u53EF\u9078\uFF09" },
      tags: { type: "array", items: { type: "string" }, description: "\u6A19\u7C64\uFF08\u53EF\u9078\uFF09" },
      path: { type: "string", description: "\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u9810\u8A2D\u5F9E session cwd \u63A8\u65B7\uFF09" }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean" },
          data: { type: "object", additionalProperties: true },
          code: { type: "string" },
          message: { type: "string" }
        }
      },
      render: (_args, value) => {
        if (value.ok) {
          const d = value.data || {};
          return [{ type: "text", text: `dsh-project-brain: memory added [${d.type}] ${d.title} (${d.id})` }];
        }
        return [{ type: "text", text: `dsh-project-brain: memory add FAILED - ${value && value.code}: ${value && value.message}` }];
      }
    },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        const type = normalizeMemoryType(args && args.type);
        if (!type) {
          return { ok: false, code: "E_INVALID_TYPE", message: "type \u5FC5\u9808\u662F " + MEMORY_TYPES.join("/") + " \u4E4B\u4E00" };
        }
        if (!args || !args.title || !String(args.title).trim()) {
          return { ok: false, code: "E_NO_TITLE", message: "title \u5FC5\u586B" };
        }
        const now = Date.now();
        const sessionId = executionSessionId2(exec);
        const candidate = {
          type,
          title: args.title,
          content: args.content,
          importance: args.importance,
          confidence: args.confidence,
          relatedFiles: args.relatedFiles,
          tags: args.tags,
          source: { kind: "agent", ...sessionId ? { sessionId: String(sessionId) } : {} }
        };
        const admitted = await admitMemory({
          fs,
          projectPath,
          candidate,
          channel: "automatic",
          now,
          llmConfirm: () => confirmWithSessionLlm({
            llm: getLlm ? getLlm() : null,
            route: executionRoute2(exec),
            sessionId,
            candidate
          })
        });
        if (!admitted.ok) {
          return {
            ok: false,
            code: admitted.code || "E_ADMIT_REJECTED",
            message: admitted.message || admitted.reason || "memory not admitted"
          };
        }
        if (admitted.action === "insert") {
          const entry = admitted.entry;
          await appendJsonl(fs, brainPath2(projectPath, "timeline.jsonl"), {
            id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
            title: "\u65B0\u589E\u8A18\u61B6[" + entry.type + "]\uFF1A" + entry.title,
            eventType: "memory",
            occurredAt: now
          });
          emitPreviewChanged2(exec, projectPath);
          return { ok: true, data: { id: entry.id, type: entry.type, title: entry.title, importance: entry.importance, confidence: entry.confidence } };
        }
        emitPreviewChanged2(exec, projectPath);
        return { ok: true, data: { id: admitted.id, skipped: true } };
      } catch (e) {
        return { ok: false, code: "E_MEMORY_ADD_FAILED", message: String(e && e.message || e) };
      }
    }
  });
}
function buildMemoryListTool({ fs, sandboxPolicy }) {
  return defineTool2({
    name: "project_memory_list",
    description: "dsh-project-brain: \u8B80\u53D6\u7576\u524D\u5C08\u6848\u7684\u5C08\u6848\u8A18\u61B6\uFF0C\u6309\u91CD\u8981\u5EA6\u6392\u5E8F\u8FD4\u56DE\uFF08\u53EF\u6309 type \u904E\u6FFE\uFF09\u3002\u56DE\u7B54\u201C\u70BA\u4EC0\u9EBC\u9019\u9EBC\u8A2D\u8A08/\u4E4B\u524D\u8E29\u904E\u4EC0\u9EBC\u5751\u201D\u985E\u554F\u984C\u524D\u5148\u547C\u53EB\u3002",
    parameters: {
      type: { type: "string", description: "\u53EA\u770B\u8A72\u578B\u5225\uFF08\u53EF\u9078\uFF09\uFF1A" + MEMORY_TYPES.join(" | ") },
      limit: { type: "number", description: "\u8FD4\u56DE\u689D\u6578\u4E0A\u9650\uFF0C\u9810\u8A2D 10" },
      includeArchived: { type: "boolean", description: "\u662F\u5426\u5305\u542B archived/superseded \u8A18\u61B6\uFF0C\u9810\u8A2D false" },
      layer: { type: "string", description: "active\uFF08\u9810\u8A2D Core\uFF09| dormant | all\uFF08active+dormant\uFF09" },
      path: { type: "string", description: "\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u9810\u8A2D\u5F9E session cwd \u63A8\u65B7\uFF09" }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean" },
          data: { type: "object", additionalProperties: true },
          code: { type: "string" },
          message: { type: "string" }
        }
      },
      render: (_args, value) => {
        if (value.ok) {
          const d = value.data || {};
          const lines = [{ type: "text", text: `dsh-project-brain: ${d.total} memories (${d.shown} shown)` }];
          for (const m of d.memories || []) {
            lines.push({ type: "text", text: `  [${m.type}] ${m.title} (imp=${m.importance})` });
          }
          return lines;
        }
        return [{ type: "text", text: `dsh-project-brain: memory list FAILED - ${value && value.code}: ${value && value.message}` }];
      }
    },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        await ensureHousekeepOnRead(fs, projectPath);
        const memories = await readJsonl(fs, brainPath2(projectPath, "memory.jsonl"));
        const layer = args && typeof args.layer === "string" ? String(args.layer).toLowerCase() : "active";
        let visible;
        if (args && args.includeArchived) {
          visible = memories;
        } else if (layer === "dormant") {
          visible = memories.filter((m) => m && m.status === "dormant");
        } else if (layer === "all") {
          visible = memories.filter(isRetrievableMemory);
        } else {
          visible = memories.filter(isCoreMemory);
        }
        const filtered = normalizeMemoryType(args && args.type) ? visible.filter((m) => m.type === normalizeMemoryType(args.type)) : visible;
        const limit = Math.max(1, Math.min(50, Number(args && args.limit || 10)));
        const sorted = filtered.slice().sort((a, b) => {
          const di = (Number(b.importance) || 0) - (Number(a.importance) || 0);
          if (di !== 0) return di;
          return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
        }).slice(0, limit);
        return {
          ok: true,
          data: {
            total: filtered.length,
            shown: sorted.length,
            memories: sorted.map((m) => ({
              id: m.id,
              type: m.type,
              title: m.title,
              content: String(m.content || "").slice(0, 300),
              importance: m.importance,
              createdAt: m.createdAt
            }))
          }
        };
      } catch (e) {
        return { ok: false, code: "E_MEMORY_LIST_FAILED", message: String(e && e.message || e) };
      }
    }
  });
}
function buildMemoryArchiveTool({ fs, sandboxPolicy }) {
  return defineTool2({
    name: "project_memory_archive",
    description: "dsh-project-brain: \u6B78\u6A94\u4E00\u689D\u5C08\u6848\u8A18\u61B6\uFF08status \u2192 archived\uFF0C\u5F9E\u6AA2\u7D22/\u6CE8\u5165\u4E2D\u79FB\u9664\u4F46\u4FDD\u7559\u8A18\u9304\uFF09\u3002\u7528\u65BC\u4FEE\u6B63\u932F\u8AA4/\u904E\u6642/\u8207\u73FE\u5BE6\u885D\u7A81\u7684\u8A18\u61B6\u3002\u9700\u50B3\u5165 id \u5B57\u9996\u6216\u7CBE\u78BA id\u3002",
    parameters: {
      id: { type: "string", description: "\u8A18\u61B6 id \u6216\u5176\u5B57\u9996\uFF08\u552F\u4E00\u5339\u914D\uFF09" },
      reason: { type: "string", description: "\u6B78\u6A94\u539F\u56E0\uFF08\u8A18\u5165 source \u6B04\u4F4D\u7528\u65BC\u8FFD\u6EAF\uFF09" },
      path: { type: "string", description: "\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u9810\u8A2D\u5F9E session cwd \u63A8\u65B7\uFF09" }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean" },
          data: { type: "object", additionalProperties: true },
          code: { type: "string" },
          message: { type: "string" }
        }
      },
      render: (_args, value) => {
        if (value.ok) {
          const d = value.data || {};
          return [{ type: "text", text: `dsh-project-brain: memory archived [${d.type}] ${d.title} (${d.id}) reason="${d.reason || "(none)"}"` }];
        }
        return [{ type: "text", text: `dsh-project-brain: memory archive FAILED - ${value && value.code}: ${value && value.message}` }];
      }
    },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        const idPrefix = args && typeof args.id === "string" ? args.id.trim() : "";
        const reason = args && typeof args.reason === "string" ? args.reason.trim().slice(0, 500) : "";
        if (!idPrefix) {
          return { ok: false, code: "E_NO_ID", message: "id \u5FC5\u586B" };
        }
        const now = Date.now();
        const archived = await withWriteLock(brainTxKey(projectPath, "memory.jsonl"), async () => {
          const memories = await readJsonl(fs, brainPath2(projectPath, "memory.jsonl"));
          const matches = memories.filter((m) => m && m.id && (m.id === idPrefix || m.id.indexOf(idPrefix) === 0) && isRetrievableMemory(m));
          if (matches.length === 0) {
            return { ok: false, code: "E_NOT_FOUND", message: `\u672A\u627E\u5230 id=${idPrefix} \u7684\u6D3B\u8E8D\u8A18\u61B6` };
          }
          if (matches.length > 1) {
            return { ok: false, code: "E_AMBIGUOUS_ID", message: `id=${idPrefix} \u5339\u914D\u5230 ${matches.length} \u689D\uFF0C\u8ACB\u63D0\u4F9B\u66F4\u7CBE\u78BA\u7684 id` };
          }
          const hit = matches[0];
          const updated = memories.map((m) => {
            if (m.id !== hit.id) return m;
            return Object.assign({}, m, {
              status: "archived",
              updatedAt: now,
              lastAccessedAt: now,
              ...reason ? { archiveReason: reason } : {}
            });
          });
          const ok2 = await writeJsonl(fs, brainPath2(projectPath, "memory.jsonl"), updated);
          if (!ok2) return { ok: false, code: "E_WRITE_FAILED", message: "failed to write memory.jsonl" };
          return { ok: true, target: hit };
        });
        if (!archived.ok) return archived;
        const target = archived.target;
        await appendJsonl(fs, brainPath2(projectPath, "timeline.jsonl"), {
          id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
          title: "\u6B78\u6A94\u8A18\u61B6[" + target.type + "]\uFF1A" + target.title + (reason ? "\uFF08" + reason + "\uFF09" : ""),
          eventType: "memory_archive",
          occurredAt: now,
          detail: "id=" + target.id + (reason ? " reason=" + reason : "")
        });
        emitPreviewChanged2(exec, projectPath);
        return { ok: true, data: { id: target.id, type: target.type, title: target.title, reason: reason || null } };
      } catch (e) {
        return { ok: false, code: "E_MEMORY_ARCHIVE_FAILED", message: String(e && e.message || e) };
      }
    }
  });
}
function buildMemorySupersedeTool({ fs, sandboxPolicy }) {
  return defineTool2({
    name: "project_memory_supersede",
    description: "dsh-project-brain: \u7528\u65B0\u8A18\u61B6\u66FF\u63DB\u820A\u8A18\u61B6\uFF08\u820A\u8A18\u61B6 \u2192 superseded\uFF0C\u65B0\u8A18\u61B6\u6B63\u5E38 append\uFF09\u3002\u7528\u65BC\u6C7A\u7B56\u66F4\u65B0\u3001\u67B6\u69CB\u8B8A\u66F4\u7B49\u5834\u666F\u3002\u65B0\u8A18\u61B6\u53EF\u7531 type/title/content \u5B8C\u6574\u6307\u5B9A\u3002",
    parameters: {
      oldId: { type: "string", description: "\u88AB\u66FF\u63DB\u7684\u820A\u8A18\u61B6 id \u6216\u5B57\u9996" },
      type: { type: "string", description: "\u65B0\u8A18\u61B6\u578B\u5225\uFF08\u5FC5\u586B\uFF09" },
      title: { type: "string", description: "\u65B0\u8A18\u61B6\u6A19\u984C\uFF08\u5FC5\u586B\uFF09" },
      content: { type: "string", description: "\u65B0\u8A18\u61B6\u6B63\u6587\uFF08\u5FC5\u586B\uFF09" },
      importance: { type: "number", description: "\u91CD\u8981\u6027 0~1" },
      confidence: { type: "number", description: "\u53EF\u4FE1\u5EA6 0~1" },
      relatedFiles: { type: "array", items: { type: "string" }, description: "\u76F8\u95DC\u6A94\u6848\u8DEF\u5F91" },
      tags: { type: "array", items: { type: "string" }, description: "\u6A19\u7C64" },
      reason: { type: "string", description: "\u66FF\u63DB\u539F\u56E0\uFF08\u5BEB\u5165\u820A\u8A18\u61B6\u7684 supersededReason\uFF09" },
      path: { type: "string", description: "\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u9810\u8A2D\u5F9E session cwd \u63A8\u65B7\uFF09" }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean" },
          data: { type: "object", additionalProperties: true },
          code: { type: "string" },
          message: { type: "string" }
        }
      },
      render: (_args, value) => {
        if (value.ok) {
          const d = value.data || {};
          return [{ type: "text", text: `dsh-project-brain: memory superseded ${d.oldId} \u2192 ${d.newId} reason="${d.reason || "(none)"}"` }];
        }
        return [{ type: "text", text: `dsh-project-brain: memory supersede FAILED - ${value && value.code}: ${value && value.message}` }];
      }
    },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        const oldId = args && typeof args.oldId === "string" ? args.oldId.trim() : "";
        const type = normalizeMemoryType(args && args.type);
        const title = args && typeof args.title === "string" ? args.title.trim() : "";
        const content = args && typeof args.content === "string" ? args.content : "";
        if (!oldId) return { ok: false, code: "E_NO_OLD_ID", message: "oldId \u5FC5\u586B" };
        if (!type) return { ok: false, code: "E_INVALID_TYPE", message: "type \u5FC5\u9808\u662F " + MEMORY_TYPES.join("/") + " \u4E4B\u4E00" };
        if (!title) return { ok: false, code: "E_NO_TITLE", message: "title \u5FC5\u586B" };
        if (!content || String(content).length < 20) return { ok: false, code: "E_NO_CONTENT", message: "content \u5FC5\u586B\u4E14 \u2265 20 \u5B57" };
        const reason = args && typeof args.reason === "string" ? args.reason.trim().slice(0, 500) : "";
        const memories = await readJsonl(fs, brainPath2(projectPath, "memory.jsonl"));
        const matches = memories.filter((m) => m && m.id && (m.id === oldId || m.id.indexOf(oldId) === 0) && isRetrievableMemory(m));
        if (matches.length === 0) return { ok: false, code: "E_OLD_NOT_FOUND", message: `\u672A\u627E\u5230 id=${oldId} \u7684\u53EF\u6AA2\u7D22\u8A18\u61B6` };
        if (matches.length > 1) return { ok: false, code: "E_AMBIGUOUS_ID", message: `oldId=${oldId} \u5339\u914D\u5230 ${matches.length} \u689D\uFF0C\u8ACB\u63D0\u4F9B\u66F4\u7CBE\u78BA\u7684 id` };
        const oldTarget = matches[0];
        const now = Date.now();
        const sessionId = executionSessionId2(exec);
        const candidate = {
          type,
          title,
          content,
          importance: args.importance,
          confidence: args.confidence,
          relatedFiles: args.relatedFiles,
          tags: args.tags,
          source: { kind: "agent", ...sessionId ? { sessionId: String(sessionId) } : {}, supersedes: oldTarget.id },
          supersedes: oldTarget.id
        };
        const admitted = await admitMemory({
          fs,
          projectPath,
          candidate,
          channel: "automatic",
          now,
          llmConfirm: { admit: true, supersedes: oldTarget.id, type }
        });
        if (!admitted.ok) {
          return { ok: false, code: admitted.code || "E_ADMIT_REJECTED", message: admitted.message || admitted.reason || "supersede not admitted" };
        }
        const newEntry = admitted.entry || { id: admitted.id, type, title };
        if (reason && admitted.action === "insert") {
          await withWriteLock(brainTxKey(projectPath, "memory.jsonl"), async () => {
            const latest = await readJsonl(fs, brainPath2(projectPath, "memory.jsonl"));
            const withReason = latest.map((m) => {
              if (m.id !== oldTarget.id) return m;
              return Object.assign({}, m, { supersededReason: reason, supersededBy: newEntry.id });
            });
            return writeJsonl(fs, brainPath2(projectPath, "memory.jsonl"), withReason);
          });
        }
        await appendJsonl(fs, brainPath2(projectPath, "timeline.jsonl"), {
          id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
          title: "\u66FF\u63DB\u8A18\u61B6[" + oldTarget.type + "\u2192" + newEntry.type + "]\uFF1A" + newEntry.title + (reason ? "\uFF08" + reason + "\uFF09" : ""),
          eventType: "memory_supersede",
          occurredAt: now,
          detail: "oldId=" + oldTarget.id + " newId=" + newEntry.id + (reason ? " reason=" + reason : "")
        });
        emitPreviewChanged2(exec, projectPath);
        return { ok: true, data: { oldId: oldTarget.id, newId: newEntry.id, type: newEntry.type, title: newEntry.title, reason: reason || null } };
      } catch (e) {
        return { ok: false, code: "E_MEMORY_SUPERSEDE_FAILED", message: String(e && e.message || e) };
      }
    }
  });
}

// src/tools/todo.js
init_brain_files();
import { defineTool as defineTool3 } from "@deepseek-ai/dsh-tools";
function emitPreviewChanged3(exec, projectPath) {
  try {
    const executor = exec && exec.ctx || null;
    if (executor && typeof executor.emit === "function") {
      executor.emit("project_brain/preview.changed", { projectPath });
    }
  } catch (e) {
  }
}
function buildTodoAddTool({ fs, sandboxPolicy }) {
  return defineTool3({
    name: "project_todo_add",
    description: "dsh-project-brain: \u70BA\u7576\u524D\u5C08\u6848\u65B0\u589E\u4E00\u689D\u958B\u767C\u5F85\u8FA6\uFF08\u5BEB\u5165 .project-brain/todo.jsonl\uFF09\u3002\u898F\u5283\u51FA\u4E0B\u4E00\u6B65\u4EFB\u52D9\u3001\u6216\u4F7F\u7528\u8005\u63D0\u51FA\u65B0\u9700\u6C42\u6642\u547C\u53EB\uFF1B\u5B8C\u6210\u6642\u7528 project_todo_done \u95DC\u9589\u3002",
    parameters: {
      title: { type: "string", description: "\u5F85\u8FA6\u6A19\u984C\uFF08\u4E00\u53E5\u8A71\uFF09" },
      description: { type: "string", description: "\u8A73\u60C5\uFF08\u53EF\u9078\uFF09" },
      priority: { type: "string", description: "\u512A\u5148\u9806\u5E8F\uFF1Aurgent | high | medium\uFF08\u9810\u8A2D\uFF09 | low" },
      relatedFiles: { type: "array", items: { type: "string" }, description: "\u76F8\u95DC\u6A94\u6848\uFF08\u53EF\u9078\uFF09" },
      path: { type: "string", description: "\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u9810\u8A2D\u5F9E session cwd \u63A8\u65B7\uFF1B\u4E0D\u50B3\u6703\u7528\u7576\u524D\u5DE5\u4F5C\u5340\uFF09" }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean" },
          data: { type: "object", additionalProperties: true }
        }
      },
      render: (_args, value) => {
        if (value.ok) {
          const d = value.data || {};
          return [{ type: "text", text: `dsh-project-brain: todo added [${d.priority}] ${d.title} (${d.id})\uFF0C\u6D3B\u8E8D\u5F85\u8FA6 ${d.activeCount}` }];
        }
        return [{ type: "text", text: `dsh-project-brain: todo add FAILED - ${value && value.code}: ${value && value.message}` }];
      }
    },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        if (!args || !args.title || !String(args.title).trim()) {
          return { ok: false, code: "E_NO_TITLE", message: "title \u5FC5\u586B" };
        }
        const now = Date.now();
        const entry = makeTodoEntry({ title: args.title, description: args.description, priority: args.priority, relatedFiles: args.relatedFiles }, now);
        const wrote = await appendJsonl(fs, brainPath2(projectPath, "todo.jsonl"), entry);
        if (!wrote) return { ok: false, code: "E_WRITE_FAILED", message: "failed to write todo.jsonl" };
        await appendJsonl(fs, brainPath2(projectPath, "timeline.jsonl"), {
          id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
          title: "\u65B0\u589E\u5F85\u8FA6\uFF1A" + entry.title,
          eventType: "todo",
          occurredAt: now
        });
        emitPreviewChanged3(exec, projectPath);
        const todos = await readJsonl(fs, brainPath2(projectPath, "todo.jsonl"));
        return { ok: true, data: { id: entry.id, title: entry.title, priority: entry.priority, activeCount: todoStats(todos).pendingTodos } };
      } catch (e) {
        return { ok: false, code: "E_TODO_ADD_FAILED", message: String(e && e.message || e) };
      }
    }
  });
}
function buildTodoListTool({ fs, sandboxPolicy }) {
  return defineTool3({
    name: "project_todo_list",
    description: "dsh-project-brain: \u8B80\u53D6\u7576\u524D\u5C08\u6848\u5F85\u8FA6\u5217\u8868\uFF08\u9810\u8A2D\u6D3B\u8E8D\u9805\uFF0C\u6309\u512A\u5148\u9806\u5E8F\u6392\u5E8F\uFF09\u3002\u6062\u5FA9\u958B\u767C\u4E0A\u4E0B\u6587\u3001\u78BA\u5B9A\u4E0B\u4E00\u6B65\u6642\u547C\u53EB\u3002",
    parameters: {
      status: { type: "string", description: "\u904E\u6FFE\u72C0\u614B\uFF08\u53EF\u9078\uFF09\uFF1Apending | in_progress | blocked | done | cancelled | all\uFF08\u9810\u8A2D\u6D3B\u8E8D\u9805\uFF09" },
      limit: { type: "number", description: "\u8FD4\u56DE\u689D\u6578\u4E0A\u9650\uFF0C\u9810\u8A2D 20" },
      path: { type: "string", description: "\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u9810\u8A2D\u5F9E session cwd \u63A8\u65B7\uFF09" }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean" },
          data: { type: "object", additionalProperties: true }
        }
      },
      render: (_args, value) => {
        if (value.ok) {
          const d = value.data || {};
          const lines = [{ type: "text", text: `dsh-project-brain: todos - ${d.active} active / ${d.done} done` }];
          for (const t of d.todos || []) {
            lines.push({ type: "text", text: `  [${t.priority}/${t.status}] ${t.title} (${t.id})` });
          }
          return lines;
        }
        return [{ type: "text", text: `dsh-project-brain: todo list FAILED - ${value && value.code}: ${value && value.message}` }];
      }
    },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        const todos = await readJsonl(fs, brainPath2(projectPath, "todo.jsonl"));
        const stats = todoStats(todos);
        const statusFilter = normalizeStatus(args && args.status);
        const wantAll = args && args.status === "all";
        let list;
        if (wantAll || statusFilter) {
          list = todos.filter((t) => wantAll ? true : t.status === statusFilter);
          list.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
        } else {
          list = activeTodos(todos);
        }
        const limit = Math.max(1, Math.min(100, Number(args && args.limit || 20)));
        return {
          ok: true,
          data: {
            active: stats.pendingTodos,
            done: stats.completedTodos,
            total: stats.total,
            todos: list.slice(0, limit).map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, updatedAt: t.updatedAt }))
          }
        };
      } catch (e) {
        return { ok: false, code: "E_TODO_LIST_FAILED", message: String(e && e.message || e) };
      }
    }
  });
}
function buildTodoDoneTool({ fs, sandboxPolicy }) {
  return defineTool3({
    name: "project_todo_done",
    description: "dsh-project-brain: \u95DC\u9589\u4E00\u689D\u5F85\u8FA6\uFF08status -> done\uFF0C\u5BEB timeline \u4E8B\u4EF6\uFF09\u3002\u6309 todo id\uFF08\u652F\u63F4\u5B57\u9996\uFF09\u6216\u6A19\u984C\u7CBE\u78BA\u5339\u914D\u3002",
    parameters: {
      id: { type: "string", description: "todo id \u6216\u5176\u5B57\u9996\uFF08\u8207 title \u4E8C\u9078\u4E00\uFF09" },
      title: { type: "string", description: "todo \u6A19\u984C\u7CBE\u78BA\u5339\u914D\uFF08\u8207 id \u4E8C\u9078\u4E00\uFF09" },
      path: { type: "string", description: "\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u9810\u8A2D\u5F9E session cwd \u63A8\u65B7\uFF09" }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean" },
          data: { type: "object", additionalProperties: true }
        }
      },
      render: (_args, value) => {
        if (value.ok) {
          const d = value.data || {};
          return [{ type: "text", text: `dsh-project-brain: todo done \u2713 ${d.title}\uFF0C\u5269\u9918\u6D3B\u8E8D ${d.activeCount}` }];
        }
        return [{ type: "text", text: `dsh-project-brain: todo done FAILED - ${value && value.code}: ${value && value.message}` }];
      }
    },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        const ref = args && (args.id || args.title) || "";
        if (!ref) return { ok: false, code: "E_NO_REF", message: "id \u6216 title \u5FC5\u586B\u4E00\u9805" };
        const todoPath = brainPath2(projectPath, "todo.jsonl");
        const todos = await readJsonl(fs, todoPath);
        const target = findTodo(todos, ref);
        if (!target) {
          return { ok: false, code: "E_NOT_FOUND", message: "\u672A\u627E\u5230\u5339\u914D\u7684\u6D3B\u8E8D\u5F85\u8FA6\uFF1A" + ref };
        }
        const now = Date.now();
        for (const t of todos) {
          if (t.id === target.id) {
            t.status = "done";
            t.updatedAt = now;
          }
        }
        const wrote = await writeText(fs, todoPath, serializeJsonl(todos));
        if (!wrote) return { ok: false, code: "E_WRITE_FAILED", message: "failed to rewrite todo.jsonl" };
        await appendJsonl(fs, brainPath2(projectPath, "timeline.jsonl"), {
          id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
          title: "\u5B8C\u6210\u5F85\u8FA6\uFF1A" + target.title,
          eventType: "todo",
          occurredAt: now
        });
        emitPreviewChanged3(exec, projectPath);
        return { ok: true, data: { id: target.id, title: target.title, activeCount: todoStats(todos).pendingTodos } };
      } catch (e) {
        return { ok: false, code: "E_TODO_DONE_FAILED", message: String(e && e.message || e) };
      }
    }
  });
}

// src/tools/todo-update.js
init_brain_files();
import { defineTool as defineTool4 } from "@deepseek-ai/dsh-tools";
function emitPreviewChanged4(exec, projectPath) {
  try {
    const executor = exec && exec.ctx || null;
    if (executor && typeof executor.emit === "function") {
      executor.emit("project_brain/preview.changed", { projectPath });
    }
  } catch (e) {
  }
}
var baseOutputSchema2 = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    data: { type: "object", additionalProperties: true }
  }
};
function buildTodoUpdateTool({ fs, sandboxPolicy }) {
  return defineTool4({
    name: "project_todo_update",
    description: "dsh-project-brain: \u66F4\u65B0\u4E00\u689D\u5F85\u8FA6\uFF08\u6309 id \u6216 title \u5339\u914D\uFF09\u3002\u53EF\u6539 status\uFF08pending/in_progress/blocked/done/cancelled\uFF09\u3001title\u3001description\u3001priority\uFF08low/medium/high/urgent\uFF09\u3002\u5B8C\u6210\u5F8C\u5BEB timeline \u4E8B\u4EF6\u4E26\u89F8\u767C preview \u91CD\u65B0\u6574\u7406\u3002",
    parameters: {
      id: { type: "string", description: "todo id \u6216\u5176\u5B57\u9996\uFF08\u8207 title \u4E8C\u9078\u4E00\uFF09" },
      title: { type: "string", description: "todo \u6A19\u984C\u7CBE\u78BA\u5339\u914D\uFF08\u8207 id \u4E8C\u9078\u4E00\uFF09" },
      status: { type: "string", description: "\u65B0\u72C0\u614B\uFF1A" + TODO_STATUSES.join(" | ") },
      newTitle: { type: "string", description: "\u65B0\u6A19\u984C\uFF08\u53EF\u9078\uFF09" },
      description: { type: "string", description: "\u65B0\u63CF\u8FF0\uFF08\u53EF\u9078\uFF09" },
      priority: { type: "string", description: "\u65B0\u512A\u5148\u9806\u5E8F\uFF1A" + TODO_PRIORITIES.join(" | ") },
      path: { type: "string", description: "\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u9810\u8A2D\u5F9E session cwd \u63A8\u65B7\uFF09" }
    },
    output: { schema: baseOutputSchema2, render: (_args, value) => renderTodoUpdate(value) },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        const ref = args && (args.id || args.title) || "";
        if (!ref) return { ok: false, data: { error: { code: "E_NO_REF", message: "id \u6216 title \u5FC5\u586B\u4E00\u9805" } } };
        const todoPath = brainPath2(projectPath, "todo.jsonl");
        const todos = await readJsonl(fs, todoPath);
        const target = findTodo(todos, ref);
        if (!target) return { ok: false, data: { error: { code: "E_NOT_FOUND", message: "\u672A\u627E\u5230\u5339\u914D\u7684\u6D3B\u8E8D\u5F85\u8FA6\uFF1A" + ref } } };
        const now = Date.now();
        let changed = [];
        for (const t of todos) {
          if (t.id !== target.id) continue;
          if (args.status != null) {
            const ns = normalizeStatus(args.status);
            if (!ns) return { ok: false, data: { error: { code: "E_INVALID_STATUS", message: "status \u5FC5\u9808\u662F " + TODO_STATUSES.join("/") } } };
            if (t.status !== ns) {
              t.status = ns;
              changed.push("status=" + ns);
            }
          }
          if (args.priority != null) {
            const np = normalizePriority(args.priority);
            if (!np) return { ok: false, data: { error: { code: "E_INVALID_PRIORITY", message: "priority \u5FC5\u9808\u662F " + TODO_PRIORITIES.join("/") } } };
            if (t.priority !== np) {
              t.priority = np;
              changed.push("priority=" + np);
            }
          }
          if (args.newTitle != null && String(args.newTitle).trim()) {
            t.title = String(args.newTitle).slice(0, 200);
            changed.push("title");
          }
          if (args.description != null) {
            t.description = String(args.description);
            changed.push("description");
          }
          t.updatedAt = now;
        }
        const wrote = await writeText(fs, todoPath, serializeJsonl(todos));
        if (!wrote) return { ok: false, data: { error: { code: "E_WRITE_FAILED", message: "failed to rewrite todo.jsonl" } } };
        await appendJsonl(fs, brainPath2(projectPath, "timeline.jsonl"), {
          id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
          title: "\u66F4\u65B0\u5F85\u8FA6[" + target.id + "]\uFF1A" + target.title + (changed.length ? "\uFF08" + changed.join(",") + "\uFF09" : ""),
          eventType: "todo_update",
          occurredAt: now
        });
        emitPreviewChanged4(exec, projectPath);
        const stats = todoStats(todos);
        return { ok: true, data: { id: target.id, title: target.title, status: target.status, priority: target.priority, changed, activeCount: stats.pendingTodos } };
      } catch (e) {
        return { ok: false, data: { error: { code: "E_TODO_UPDATE_FAILED", message: String(e && e.message || e) } } };
      }
    }
  });
}
function renderTodoUpdate(value) {
  if (!value || typeof value !== "object") return [{ type: "text", text: "dsh-project-brain: todo update FAILED - non-object result: " + String(value) }];
  if (value.ok) {
    const d = value.data || {};
    if (d.error) return [{ type: "text", text: "dsh-project-brain: todo update FAILED - " + d.error.code + ": " + d.error.message }];
    return [{ type: "text", text: `dsh-project-brain: todo updated [${d.priority}/${d.status}] ${d.title} (${d.id})${d.changed && d.changed.length ? " \u2014 changed: " + d.changed.join(",") : ""}` }];
  }
  if (value.data && value.data.error) return [{ type: "text", text: "dsh-project-brain: todo update FAILED - " + value.data.error.code + ": " + value.data.error.message }];
  return [{ type: "text", text: "dsh-project-brain: todo update FAILED - " + JSON.stringify(value) }];
}

// src/tools/continue.js
init_brain_files();
import { defineTool as defineTool5 } from "@deepseek-ai/dsh-tools";

// src/host/memory/briefing.js
var SUMMARY_MAX_TOKENS = 400;
var STUCK_LIMIT = 3;
var START_HERE_LIMIT = 5;
function truncateSummaryToTokens(text, maxTokens) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (estimateTokens(raw) <= maxTokens) return raw;
  const parts = raw.split(/(?<=[。！？.!?])\s*/).filter(Boolean);
  let acc = "";
  const suffix = "\uFF08\u6458\u8981\u5DF2\u622A\u65B7\uFF09";
  for (const part of parts) {
    const next = acc + part;
    if (estimateTokens(next + suffix) > maxTokens) break;
    acc = next;
  }
  if (!acc) {
    let cut = raw;
    while (cut.length > 8 && estimateTokens(cut + suffix) > maxTokens) {
      cut = cut.slice(0, Math.floor(cut.length * 0.85));
    }
    acc = cut.trim();
  }
  return acc.replace(/\s+$/, "") + suffix;
}
function qualifiedSummary(text) {
  const summary = String(text || "").trim();
  if (!summary) return "";
  if (isChangelogGenre("", summary) || isChangelogGenre(summary, summary)) return "";
  return summary;
}
function latestQualifiedSummaryEvent(timeline) {
  const summaries = (timeline || []).filter((e) => e && e.eventType === "session_summary").map((e) => Object.assign({}, e, { summary: qualifiedSummary(e.summary) })).filter((e) => e.summary).sort((a, b) => (b.occurredAt || 0) - (a.occurredAt || 0));
  return summaries.length ? summaries[0] : null;
}
function isArchitectureStale(brain) {
  if (!brain) return false;
  if (brain.architectureStale === true) return true;
  if (brain.architecture && brain.architecture.stale === true) return true;
  if (brain.project && brain.project.architectureStale === true) return true;
  return false;
}
function keyFilePaths(architecture) {
  const list = architecture && architecture.keyFiles || [];
  return list.map((item) => {
    if (typeof item === "string") return item.replace(/\\/g, "/");
    return String(item && item.path || "").replace(/\\/g, "/");
  }).filter(Boolean);
}
function flowEndpointFiles(architecture) {
  const flows = architecture && architecture.runtimeFlows || [];
  const out = [];
  for (const flow of flows) {
    const steps = flow && flow.steps || [];
    if (!steps.length) continue;
    const first = steps[0] && steps[0].file;
    const last = steps[steps.length - 1] && steps[steps.length - 1].file;
    if (first) out.push(String(first).replace(/\\/g, "/"));
    if (last && last !== first) out.push(String(last).replace(/\\/g, "/"));
  }
  return out;
}
function asRelPath(path7) {
  if (typeof path7 === "string") return path7.replace(/\\/g, "/").replace(/^\.\//, "");
  if (path7 && typeof path7 === "object") {
    return String(path7.path || "").replace(/\\/g, "/").replace(/^\.\//, "");
  }
  return "";
}
function isSourcePath(item) {
  const p = asRelPath(item);
  if (!p) return false;
  const type = item && typeof item === "object" ? String(item.type || "") : "";
  if (type === "script") return false;
  if (/^(npm|pnpm|yarn|npx|node)\s/i.test(p)) return false;
  if (/\s/.test(p) && !/[\\/]/.test(p)) return false;
  return true;
}
function uniquePaths(paths, limit) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const path7 of paths) {
    const item = typeof path7 === "string" ? { path: path7 } : path7;
    if (!isSourcePath(item)) continue;
    const p = asRelPath(item);
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}
var DESCRIPTION_PLACEHOLDER = /^auto-generated by dsh-project-brain$/i;
function purposeLine(brain) {
  const project = brain.project || {};
  const overview = brain.architecture && brain.architecture.overview || {};
  const fromArch = String(overview.purpose || "").trim();
  const rawDesc = String(project.description || "").replace(/\s+/g, " ").trim();
  const fromDesc = DESCRIPTION_PLACEHOLDER.test(rawDesc) ? "" : rawDesc;
  return (fromArch || fromDesc).slice(0, 300);
}
function startHere(brain, stale) {
  const project = brain.project || {};
  const entries = (Array.isArray(project.entrypoints) ? project.entrypoints : []).filter(isSourcePath);
  if (stale) return uniquePaths(entries, 2);
  return uniquePaths(entries.concat(keyFilePaths(brain.architecture), flowEndpointFiles(brain.architecture)), START_HERE_LIMIT);
}
function stuckTodos(todos) {
  const active = activeTodos(todos || []);
  const inProgress = active.filter((t) => t && t.status === "in_progress");
  const rest = active.filter((t) => t && t.status !== "in_progress");
  return inProgress.concat(rest).slice(0, STUCK_LIMIT).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority
  }));
}
var DAY_MS = 864e5;
var RECENT_WORK_STALE_DAYS = 30;
function ageDays(at, now) {
  if (!at) return 0;
  return Math.max(0, Math.floor((now - at) / DAY_MS));
}
function recentWorkAgeLabel(at, now) {
  if (!at) return "";
  const days = ageDays(at, now);
  if (days <= 0) return "\u4ECA\u5929";
  if (days > RECENT_WORK_STALE_DAYS) return days + " \u5929\u524D\uFF0C\u53EF\u80FD\u5DF2\u904E\u6642";
  return days + " \u5929\u524D";
}
function recentWorkFrom(brain, now) {
  const event = latestQualifiedSummaryEvent(brain.timeline);
  const fromSummary = truncateSummaryToTokens(event ? event.summary : "", SUMMARY_MAX_TOKENS);
  if (fromSummary) {
    const at = Number(event && event.occurredAt) || 0;
    return {
      recentWork: fromSummary,
      recentWorkSource: "session_summary",
      recentWorkAt: at,
      recentWorkStale: Boolean(at) && ageDays(at, now) > RECENT_WORK_STALE_DAYS
    };
  }
  const inProgress = stuckTodos(brain.todos).filter((t) => t.status === "in_progress");
  if (inProgress.length) {
    return {
      recentWork: inProgress.map((t) => "\u9032\u884C\u4E2D " + t.title).join("\uFF1B"),
      recentWorkSource: "todo",
      recentWorkAt: 0,
      recentWorkStale: false
    };
  }
  return { recentWork: "", recentWorkSource: "none", recentWorkAt: 0, recentWorkStale: false };
}
function briefingMarkdown({ stale, purpose, startHere: files, recentWork, recentWorkAt, now }) {
  const lines = [];
  lines.push("### \u9019\u662F\u4EC0\u9EBC");
  lines.push(purpose || "\uFF08\u66AB\u7121\u5C08\u6848\u5B9A\u4F4D\uFF0C\u91CD\u6383\u53EF\u7531\u67B6\u69CB\u5206\u6790\u88DC\u5168\uFF09");
  lines.push("");
  lines.push("### \u6700\u8FD1\u505A\u4EC0\u9EBC");
  if (recentWork) {
    const age = recentWorkAgeLabel(recentWorkAt, now);
    lines.push(recentWork.replace(/\n+/g, " ") + (age ? "\uFF08" + age + "\uFF09" : ""));
  } else {
    lines.push("\uFF08\u66AB\u7121\u6703\u8A71\u6458\u8981\uFF09");
  }
  lines.push("");
  lines.push("### \u5F9E\u54EA\u6539");
  if (stale) lines.push("\u67B6\u69CB\u53EF\u80FD\u904E\u671F\uFF0C\u95DC\u9375\u6A94\u6848\u6309\u6383\u63CF\u5165\u53E3\u964D\u7D1A\u3002");
  if (files.length) {
    for (const f of files) lines.push("- " + f);
  } else {
    lines.push("- \uFF08\u66AB\u7121\u5165\u53E3\uFF09");
  }
  return lines.join("\n");
}
function buildProjectBriefing(brain, now = Date.now()) {
  if (!brain || !brain.project || brain.project.__error) {
    return {
      stale: false,
      purpose: "",
      startHere: [],
      stuck: [],
      recentWork: "",
      recentWorkSource: "none",
      recentWorkAt: 0,
      recentWorkStale: false,
      markdown: ""
    };
  }
  const stale = isArchitectureStale(brain);
  const purpose = purposeLine(brain);
  const files = startHere(brain, stale);
  const stuck = stuckTodos(brain.todos);
  const recent = recentWorkFrom(brain, now);
  const markdown = briefingMarkdown({
    stale,
    purpose,
    startHere: files,
    recentWork: recent.recentWork,
    recentWorkAt: recent.recentWorkAt,
    now
  });
  return {
    stale,
    purpose,
    startHere: files,
    stuck,
    recentWork: recent.recentWork,
    recentWorkSource: recent.recentWorkSource,
    recentWorkAt: recent.recentWorkAt,
    recentWorkStale: recent.recentWorkStale,
    markdown
  };
}

// src/host/memory/inject-context.js
function buildInjectionContext(brain) {
  if (!brain || !brain.project || brain.project.__error) return "";
  const briefing = buildProjectBriefing(brain);
  const memories = (brain.memories || []).filter(isCoreMemory).slice().sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  const lines = [];
  lines.push("## Project Brain");
  lines.push("");
  if (briefing.markdown) {
    lines.push(briefing.markdown);
    lines.push("");
  }
  const stuck = Array.isArray(briefing.stuck) ? briefing.stuck : [];
  if (stuck.length > 0) {
    lines.push("### \u6D3B\u8E8D\u5F85\u8FA6");
    for (const todo of stuck) {
      const status = todo.status === "in_progress" ? "\u9032\u884C\u4E2D" : todo.status === "blocked" ? "\u963B\u585E" : "\u5F85\u8FA6";
      lines.push("- [" + status + "] " + todo.title);
    }
    lines.push("");
  }
  if (memories.length > 0) {
    lines.push("### Core \u8A18\u61B6");
    for (const m of memories) {
      const tag = m.type ? "[" + m.type + "] " : "";
      lines.push("- " + tag + m.title);
      if (m.content) {
        lines.push("  " + String(m.content).replace(/\n+/g, " "));
      }
    }
    lines.push("");
  }
  lines.push("### \u5C08\u6848\u8A18\u61B6\u7D04\u5B9A");
  lines.push("- \u53EA\u5C0D\u8DE8\u6703\u8A71\u4ECD\u70BA\u771F\u7684\u6C7A\u7B56\u3001\u7D04\u675F\u3001\u67B6\u69CB\u4E8B\u5BE6\u6216\u6559\u8A13\u547C\u53EB `project_memory_add`\uFF1B\u6A19\u984C\u5BEB\u6210\u7AD9\u7ACB\u4E8B\u5BE6\u53E5\uFF0C\u4E0D\u8981\u5BEB\u6210 v1.2.0 patch / \u9A57\u6536\u6E05\u55AE\u3002");
  lines.push("- \u5DE5\u5177\u53EF\u80FD\u62D2\u7D55\uFF0C\u4E0D\u8981\u628A changelog / \u672C\u6B21\u6539\u4E86\u54EA\u4E9B\u6A94\u6848\u518D\u5BEB\u4E00\u904D\u3002\u6B63\u6587\u4FDD\u6301 2\u20134 \u53E5\u3002");
  lines.push("- \u9032\u884C\u4E2D\u7684\u5DE5\u4F5C\u7528 `project_todo_add` / `project_todo_update` / `project_todo_done` \u8DDF\u8E64\uFF0C\u7E8C\u63A5\u4F9D\u8CF4 TODO\uFF0C\u800C\u4E0D\u662F\u628A\u6703\u8A71\u6D41\u6C34\u8CEC\u585E\u9032\u8A18\u61B6\u3002");
  lines.push("- \u5C08\u6848\u7D50\u69CB\u660E\u986F\u8B8A\u5316\u5F8C\u547C\u53EB `project_rescan`\uFF1B\u9700\u8981\u7406\u89E3\u6700\u8FD1\u7A0B\u5F0F\u78BC\u8B8A\u5316\u6642\u547C\u53EB `project_diff`\uFF08\u9810\u8A2D dry-run\uFF09\u3002");
  return lines.join("\n");
}

// src/tools/continue.js
function buildContinueTool({ fs, sandboxPolicy }) {
  return defineTool5({
    name: "project_continue",
    description: "dsh-project-brain: \u6062\u5FA9\u7576\u524D\u5C08\u6848\u7684\u958B\u767C\u4E0A\u4E0B\u6587\uFF08\u4F7F\u7528\u8005\u8AAA\u300C\u7E7C\u7E8C\u4E0A\u6B21\u7684\u958B\u767C\u300D\u6642\u547C\u53EB\uFF09\u3002\u8FD4\u56DE\u5C08\u6848\u6982\u8981\u3001\u5168\u90E8 Core \u8A18\u61B6\u3001\u4E0A\u6B21\u6703\u8A71\u6458\u8981\u3001\u6D3B\u8E8D\u5F85\u8FA6\u8207\u5EFA\u8B70\u4E0B\u4E00\u6B65\uFF0C\u64DA\u6B64\u53EF\u76F4\u63A5\u7E8C\u63A5\u958B\u767C\uFF0C\u7121\u9700\u4F7F\u7528\u8005\u91CD\u65B0\u63CF\u8FF0\u5C08\u6848\u3002",
    parameters: {
      path: { type: "string", description: "\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u7D55\u5C0D\u8DEF\u5F91\uFF09\uFF0C\u9810\u8A2D sandboxPolicy.workspaceRoot" }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean" },
          data: { type: "object", additionalProperties: true },
          code: { type: "string" },
          message: { type: "string" }
        }
      },
      render: (_args, value) => {
        if (value.ok) {
          const d = value.data || {};
          const lines = [{ type: "text", text: `dsh-project-brain: continue context` }];
          if (d.project) {
            lines.push({ type: "text", text: `  Project: ${d.project.name} (${d.project.type})` });
          }
          lines.push({ type: "text", text: `  Suggested next: ${d.suggestedNextStep}` });
          lines.push({ type: "text", text: `  Stats: pending ${d.stats.pendingTodos} / done ${d.stats.completedTodos} / decisions ${d.stats.decisions} / memories ${d.stats.memories}` });
          for (const m of d.topMemories || []) {
            lines.push({ type: "text", text: `  mem[${m.type}] ${m.title}` });
          }
          for (const t of d.pendingTodos || []) {
            lines.push({ type: "text", text: `  todo[${t.priority}] ${t.title} (${t.status})` });
          }
          if (d.warning) lines.push({ type: "text", text: `  warning: ${d.warning}` });
          return lines;
        }
        return [{ type: "text", text: `dsh-project-brain: continue FAILED - ${value && value.code}: ${value && value.message}` }];
      }
    },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        await ensureHousekeepOnRead(fs, projectPath);
        const brain = await readBrain(fs, projectPath);
        const data = buildContinueData(brain, Date.now());
        data.injection = buildInjectionContext(brain);
        if (!data.initialized) {
          return {
            ok: false,
            code: "E_NOT_INITIALIZED",
            message: "\u8A72\u5C08\u6848\u9084\u6C92\u6709 .project-brain/project.json\uFF0C\u8ACB\u5148\u547C\u53EB project_init"
          };
        }
        return { ok: true, data };
      } catch (e) {
        return { ok: false, code: "E_CONTINUE_FAILED", message: String(e && e.message || e) };
      }
    }
  });
}

// src/tools/suggest.js
init_brain_files();
import { defineTool as defineTool6 } from "@deepseek-ai/dsh-tools";

// src/host/suggest.js
function buildEvidence(brain, now) {
  const nowMs = typeof now === "number" ? now : Date.now();
  const project = brain && brain.project || null;
  const memories = (brain && brain.memories || []).filter(isCoreMemory);
  const todos = brain && brain.todos || [];
  const timeline = brain && brain.timeline || [];
  const architecture = brain && brain.architecture;
  const inProgress = todos.filter((t) => t && t.status === "in_progress");
  const pending = todos.filter((t) => t && t.status === "pending");
  const blocked = todos.filter((t) => t && t.status === "blocked");
  const topMem = topMemories(memories, 5, nowMs);
  const recentEvents = recentTimeline(timeline, 3);
  const lastSummary = timeline.filter((e) => e && (e.eventType === "session_summary" || e.eventType === "init" || e.eventType === "rescan")).sort((a, b) => (b.occurredAt || 0) - (a.occurredAt || 0))[0];
  const daysSinceLastSession = lastSummary ? Math.max(0, Math.round((nowMs - (lastSummary.occurredAt || nowMs)) / 864e5)) : null;
  return {
    project,
    memories: topMem,
    activeTodos: { inProgress, pending, blocked },
    recentEvents,
    architecture,
    daysSinceLastSession,
    now: nowMs
  };
}
function buildLocalFallback(evidence) {
  const { project, memories, activeTodos: t, recentEvents, daysSinceLastSession } = evidence;
  if (t.inProgress.length > 0) {
    const top = t.inProgress[0];
    const relatedMem = pickRelatedMem(top, memories);
    return {
      title: "\u7E7C\u7E8C\u63A8\u9032\uFF1A" + truncate(top.title, 60),
      reason: relatedMem ? "\u4E0A\u6B21\u4E2D\u65B7\u5728 \u201C" + truncate(relatedMem.title, 30) + "\u201D \u76F8\u95DC\u5DE5\u4F5C" : "\u4F60\u6B63\u5728\u8655\u7406\u9019\u689D\u4EFB\u52D9\uFF08in_progress\uFF09",
      confidence: 0.85,
      suggestedTodoId: top.id || null,
      suggestedMemoryIds: relatedMem ? [relatedMem.id] : [],
      fallback: true
    };
  }
  if (t.pending.length > 0) {
    const sorted = sortTodosByPriority(t.pending);
    const top = sorted[0];
    const relatedMem = pickRelatedMem(top, memories);
    return {
      title: "\u5EFA\u8B70\u958B\u59CB\uFF1A" + truncate(top.title, 60),
      reason: relatedMem ? "\u8207\u5DF2\u8A18\u9304\u7684 \u201C" + truncate(relatedMem.title, 30) + "\u201D \u6C7A\u7B56/\u6559\u8A13\u76F8\u95DC" : "\u9019\u662F\u7576\u524D\u6700\u9AD8\u512A\u5148\u9806\u5E8F\u5F85\u8FA6\uFF08" + (top.priority || "medium") + "\uFF09",
      confidence: 0.7,
      suggestedTodoId: top.id || null,
      suggestedMemoryIds: relatedMem ? [relatedMem.id] : [],
      fallback: true
    };
  }
  if (t.blocked.length > 0) {
    return {
      title: "\u89E3\u6C7A\u963B\u585E\uFF1A" + truncate(t.blocked[0].title, 60),
      reason: "\u6709 " + t.blocked.length + " \u500B\u4EFB\u52D9\u88AB\u963B\u585E\uFF0C\u5148\u89E3\u6C7A\u963B\u585E\u53EF\u89E3\u9396\u5F8C\u7E8C\u5DE5\u4F5C",
      confidence: 0.5,
      suggestedTodoId: t.blocked[0].id || null,
      suggestedMemoryIds: [],
      fallback: true
    };
  }
  if (memories.length > 0) {
    const recents = memories.filter((m) => {
      const age = (evidence.now - (m.updatedAt || m.createdAt || 0)) / 864e5;
      return age <= 7;
    });
    if (recents.length > 0) {
      return {
        title: "\u56DE\u9867\u8FD1\u671F\u8A18\u61B6\uFF1A" + truncate(recents[0].title, 60),
        reason: daysSinceLastSession != null && daysSinceLastSession > 0 ? "\u8DDD\u4E0A\u6B21 Session " + daysSinceLastSession + " \u5929\uFF0C\u5148\u56DE\u9867\u8FD1\u671F\u5C08\u6848\u77E5\u8B58" : "\u6700\u8FD1\u8A18\u9304\u7684\u5C08\u6848\u6C7A\u7B56\u53EF\u4F5C\u70BA\u4E0B\u4E00\u6B65\u8D77\u9EDE",
        confidence: 0.45,
        suggestedTodoId: null,
        suggestedMemoryIds: [recents[0].id],
        fallback: true
      };
    }
  }
  if (recentEvents.length > 0) {
    return {
      title: "\u56DE\u9867\u4E0A\u6B21\u6D3B\u52D5\uFF1A" + truncate(recentEvents.title, 60),
      reason: "\u5C08\u6848\u7121\u6D3B\u8E8D\u4EFB\u52D9\uFF0C\u53EF\u5F9E\u6700\u8FD1\u6D3B\u52D5\u5165\u624B",
      confidence: 0.3,
      suggestedTodoId: null,
      suggestedMemoryIds: [],
      fallback: true
    };
  }
  return {
    title: project ? "\u898F\u5283\u4E0B\u4E00\u6B65" : "\u521D\u59CB\u5316\u5C08\u6848\u8166",
    reason: project ? "\u66AB\u7121\u5F85\u8FA6\u548C\u8FD1\u671F\u8A18\u61B6\uFF0C\u5EFA\u8B70\u7528 project_todo_add \u898F\u5283\u4E0B\u4E00\u6B65" : "\u5C08\u6848\u8166\u9084\u672A\u521D\u59CB\u5316\uFF0C\u547C\u53EB project_init \u958B\u59CB",
    confidence: 0.2,
    suggestedTodoId: null,
    suggestedMemoryIds: [],
    fallback: true
  };
}
function sortTodosByPriority(todos) {
  const order = { urgent: 0, high: 1, medium: 2, low: 3 };
  return todos.slice().sort((a, b) => {
    const pa = order[a.priority || "medium"] != null ? order[a.priority || "medium"] : 2;
    const pb = order[b.priority || "medium"] != null ? order[b.priority || "medium"] : 2;
    return pa - pb;
  });
}
function pickRelatedMem(todo, memories) {
  if (!todo || memories.length === 0) return null;
  const todoFiles = new Set((todo.relatedFiles || []).map(String));
  const todoTags = new Set((todo.tags || []).map(String));
  for (const m of memories) {
    const overlap = (m.relatedFiles || []).some((f) => todoFiles.has(f));
    const tagOverlap = (m.tags || []).some((t) => todoTags.has(t));
    if (overlap || tagOverlap) return m;
  }
  return memories[0] || null;
}
function truncate(s, limit) {
  s = String(s || "").trim();
  if (s.length <= limit) return s;
  return s.slice(0, limit - 1) + "\u2026";
}
function buildSuggestPrompt(evidence) {
  const payload = {
    project: evidence.project ? { name: evidence.project.name, type: evidence.project.type || evidence.project.techStack, description: truncate(evidence.project.description, 300) } : null,
    daysSinceLastSession: evidence.daysSinceLastSession,
    inProgress: evidence.activeTodos.inProgress.slice(0, 3).map(compactTodo),
    pendingTop: sortTodosByPriority(evidence.activeTodos.pending).slice(0, 3).map(compactTodo),
    blocked: evidence.activeTodos.blocked.slice(0, 2).map(compactTodo),
    topMemories: evidence.memories.slice(0, 5).map(compactMem),
    recentEvents: evidence.recentEvents.slice(0, 3).map((e) => ({ eventType: e.eventType, title: truncate(e.title, 80), occurredAt: e.occurredAt })),
    architectureSummary: evidence.architecture && evidence.architecture.summary ? truncate(evidence.architecture.summary, 400) : null
  };
  return [
    "\u4F60\u662F dsh-project-brain \u7684\u300C\u667A\u6167\u7E8C\u63A5\u300D\u52A9\u624B\u3002Session \u958B\u59CB\u6642\u7D66\u4F7F\u7528\u8005 1-2 \u53E5\u8A71 + \u4E00\u689D\u300C\u7406\u7531\u300D\uFF0C\u8B93\u4ED6\u4E0D\u9700\u8981\u91CD\u65B0\u63CF\u8FF0\u5C08\u6848\u5C31\u77E5\u9053\u4ECA\u5929\u80FD\u505A\u4EC0\u9EBC\u3002",
    "\u6839\u64DA\u4E0B\u9762\u63D0\u4F9B\u7684\u5C08\u6848\u72C0\u614B\uFF08\u6D3B\u8E8D TODO / \u8A18\u61B6 / \u6642\u9593\u7DDA / \u67B6\u69CB\u6982\u6CC1\uFF09\u5224\u65B7\uFF1A\u4ECA\u5929\u6700\u503C\u5F97\u63A8\u9032\u7684\u4E00\u4EF6\u4E8B\u662F\u4EC0\u9EBC\uFF1F\u7406\u7531\u662F\u4EC0\u9EBC\uFF1F",
    "\u898F\u5247\uFF1A",
    "1) title \u5FC5\u9808\u7C21\u6F54\uFF08\u2264 30 \u5B57\uFF09\uFF0C\u662F\u52D5\u8A5E\u958B\u982D\uFF08\u300C\u7E7C\u7E8C X\u300D\u300C\u5EFA\u8B70\u958B\u59CB X\u300D\u300C\u56DE\u9867 X\u300D\u300C\u89E3\u6C7A X\u300D\u300C\u898F\u5283 X\u300D\uFF09\uFF1B",
    "3) reason \u5FC5\u9808\u6709\u4F9D\u64DA\uFF1A\u5F15\u7528\u5177\u9AD4\u7684 TODO id\u3001\u8A18\u61B6 title\u3001\u6216\u8005\u6642\u9593\u7DDA\u4E8B\u4EF6\uFF1B",
    "4) suggestedTodoId \u5FC5\u9808\u586B 1 \u500B\uFF08\u6700\u76F8\u95DC\u7684\u90A3\u500B active todo\uFF09\uFF0CsuggestedMemoryIds \u586B 1-3 \u500B\u6700\u76F8\u95DC\u7684\u8A18\u61B6\uFF1B",
    "5) confidence 0~1\uFF1A\u9032\u884C\u4E2D\u4EFB\u52D9 \u22650.8\uFF0C\u6700\u9AD8\u968E pending 0.5-0.8\uFF0C\u8A18\u61B6\u63A8\u65B7 0.3-0.5\uFF0C\u7D14\u7A7A\u767D \u22640.3\uFF1B",
    "6) \u4E0D\u5141\u8A31\u7DE8\u9020\u8CC7\u8A0A\uFF1B\u53EA\u80FD\u57FA\u65BC\u63D0\u4F9B\u7684 evidence\uFF1B\u5982\u679C\u5B8C\u5168\u6C92\u8CC7\u6599\uFF0Ctitle \u5BEB\u300C\u521D\u59CB\u5316\u5C08\u6848\u8166\u300D\u6216\u300C\u898F\u5283\u4E0B\u4E00\u6B65\u300D\uFF1B",
    "7) \u8F38\u51FA\u56B4\u683C JSON \u7269\u4EF6\uFF0C\u4E0D\u8981 Markdown\u3002",
    "\u683C\u5F0F\uFF1A" + JSON.stringify({ title: "\u52D5\u8A5E + \u5167\u5BB9", reason: "\u4F9D\u64DA + \u4E0A\u4E0B\u6587", confidence: 0.7, suggestedTodoId: "todo id \u6216 null", suggestedMemoryIds: ["memory id"] }),
    "\u8B49\u64DA\uFF1A" + JSON.stringify(payload)
  ].join("\n");
}
function compactTodo(t) {
  return { id: t.id, title: truncate(t.title, 80), priority: t.priority || "medium", status: t.status, tags: (t.tags || []).slice(0, 3) };
}
function compactMem(m) {
  return { id: m.id, type: m.type, title: truncate(m.title, 80), importance: m.importance, tags: (m.tags || []).slice(0, 3) };
}
function parseSuggestJson(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const candidates = [];
  candidates.push(text);
  candidates.push(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim());
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  const stripTrailing = (s) => s.replace(/,\s*([}\]])/g, "$1");
  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(stripTrailing(c));
    } catch (e) {
    }
  }
  return null;
}
function normalizeSuggestion(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const title = String(parsed.title || "").trim().slice(0, 80);
  const reason = String(parsed.reason || "").trim().slice(0, 200);
  if (!title || !reason) return null;
  const confidence = Number(parsed.confidence);
  const suggestedTodoId = parsed.suggestedTodoId && typeof parsed.suggestedTodoId === "string" ? parsed.suggestedTodoId.slice(0, 64) : null;
  const suggestedMemoryIds = Array.isArray(parsed.suggestedMemoryIds) ? parsed.suggestedMemoryIds.filter((x) => typeof x === "string").slice(0, 5) : [];
  return {
    title,
    reason,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    suggestedTodoId,
    suggestedMemoryIds,
    fallback: false
  };
}
function buildLocalSuggestion(brain, now) {
  const evidence = buildEvidence(brain, now);
  const local = buildLocalFallback(evidence);
  return {
    ok: true,
    data: {
      suggestion: local,
      evidence: {
        activeTodos: {
          inProgress: evidence.activeTodos.inProgress.length,
          pending: evidence.activeTodos.pending.length,
          blocked: evidence.activeTodos.blocked.length
        },
        memories: evidence.memories.length,
        recentEvents: evidence.recentEvents.length,
        daysSinceLastSession: evidence.daysSinceLastSession
      },
      source: "local"
    }
  };
}
function buildSuggestPromptForLlm(brain, now) {
  const evidence = buildEvidence(brain, now);
  return { prompt: buildSuggestPrompt(evidence), evidence };
}

// src/tools/suggest.js
var baseOutputSchema3 = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
    code: { type: "string" },
    message: { type: "string" }
  }
};
function executionRoute3(exec) {
  if (!exec) return null;
  return resolveSessionRoute(exec.session) || resolveSessionRoute(exec.currentSession) || resolveSessionRoute(exec.agent && exec.agent.session) || resolveSessionRoute(exec.agent) || resolveSessionRoute(exec.ctx && exec.ctx.session);
}
function executionSessionId3(exec) {
  return exec && (exec.sessionId || exec.session && exec.session.id || exec.agent && exec.agent.sessionId || exec.agent && exec.agent.session && exec.agent.session.id) || null;
}
async function tryLlmSuggestion({ llm, route, sessionId, brain, temperature }) {
  const { prompt, evidence } = buildSuggestPromptForLlm(brain, Date.now());
  let text;
  try {
    text = await streamLlmText(llm, route, prompt, sessionId, 2e4, {
      system: "You are the dsh-project-brain 'smart continue' advisor. Output strict JSON only. Never invent TODOs, memories or files that were not provided as evidence.",
      maxTokens: 400,
      purpose: "project-suggest-next",
      // v0.4.17：deterministic 輸出，讓同一專案下不同 session 拿到的建議儘量一致
      temperature: typeof temperature === "number" ? temperature : 0
    });
  } catch (error) {
    return { ok: false, error: error && error.code ? error.code : "STREAM_FAILED", message: String(error && error.message || error) };
  }
  const parsed = parseSuggestJson(text);
  if (!parsed) return { ok: false, error: "INVALID_JSON", message: "LLM \u8FD4\u56DE\u975E JSON" };
  const normalized = normalizeSuggestion(parsed);
  if (!normalized) return { ok: false, error: "INVALID_SCHEMA", message: "LLM JSON \u7F3A\u5C11\u5FC5\u8981\u6B04\u4F4D" };
  return { ok: true, data: { suggestion: normalized, evidence: summarizeEvidence(evidence), source: "llm" } };
}
function summarizeEvidence(evidence) {
  return {
    activeTodos: {
      inProgress: evidence.activeTodos.inProgress.length,
      pending: evidence.activeTodos.pending.length,
      blocked: evidence.activeTodos.blocked.length
    },
    memories: evidence.memories.length,
    recentEvents: evidence.recentEvents.length,
    daysSinceLastSession: evidence.daysSinceLastSession
  };
}
function buildSuggestTool({ fs, sandboxPolicy, getLlm }) {
  return defineTool6({
    name: "project_suggest_next",
    description: "dsh-project-brain: \u667A\u6167\u7E8C\u63A5\u3002Session \u958B\u59CB\u6642\u7D66\u4F7F\u7528\u8005\u4E00\u53E5\u300C\u4ECA\u5929\u53EF\u80FD\u60F3\u63A8\u9032\u4EC0\u9EBC\u300D+ \u4F9D\u64DA\uFF0C\u7D50\u5408\u6D3B\u8E8D TODO / \u8FD1\u671F\u8A18\u61B6 / \u6700\u8FD1\u6D3B\u52D5 / \u67B6\u69CB\u6982\u89BD\u7D9C\u5408\u63A8\u65B7\u3002\u9810\u8A2D\u8D70\u672C\u5730\u898F\u5247\uFF08in_progress > \u6700\u9AD8\u512A\u5148\u9806\u5E8F pending > \u963B\u585E > \u8A18\u61B6\uFF09\uFF0C\u82E5 DSH \u7576\u524D Session \u6709\u53EF\u7528 LLM route\uFF0C\u6703\u81EA\u52D5\u8ABF\u6A21\u578B\u5347\u7D1A\u5EFA\u8B70\u8CEA\u91CF\uFF1B\u5931\u6557\u6642\u964D\u7D1A\u5230\u672C\u5730\u3002\u9069\u7528\u65BC\u300C\u4ECA\u5929\u7E7C\u7E8C\u4EC0\u9EBC / \u63A5\u4E0B\u4F86\u505A\u4EC0\u9EBC\u300D\u7B49\u5834\u666F\u3002",
    parameters: {
      path: { type: "string", description: "\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u53EF\u9078\uFF1B\u9810\u8A2D\u5F9E\u7576\u524D DSH Session \u7684 workspace \u81EA\u52D5\u89E3\u6790\uFF09" },
      useLLM: { type: "boolean", description: "\u662F\u5426\u5617\u8A66\u8ABF LLM\uFF08\u9810\u8A2D true\uFF1B\u8A2D false \u5F37\u5236\u8D70\u672C\u5730\u898F\u5247\uFF09" }
    },
    output: { schema: baseOutputSchema3, render: (_args, value) => renderSuggest(value) },
    async execute(args, exec) {
      const startMs = Date.now();
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        if (projectPath === ".") {
          return { ok: false, data: { error: { code: "E_NO_PATH", message: "\u7121\u6CD5\u5F9E\u7576\u524D Session \u89E3\u6790 workspace \u8DEF\u5F91" } } };
        }
        await ensureHousekeepOnRead(fs, projectPath);
        const brain = await readBrain(fs, projectPath);
        if (!brain.project || brain.project.__error) {
          return { ok: false, data: { error: { code: "E_NOT_INITIALIZED", message: "\u5C08\u6848\u9084\u672A\u521D\u59CB\u5316 .project-brain/project.json\uFF0C\u8ACB\u5148\u547C\u53EB project_init" } } };
        }
        try {
          const archPath = projectPath.replace(/[\\/]+$/, "") + "/.project-brain/architecture.json";
          const text = await (async () => {
            try {
              return await fs.readText(await fs.resolve(archPath));
            } catch {
              return null;
            }
          })();
          if (text) brain.architecture = JSON.parse(text);
        } catch (e) {
        }
        const useLLM = args && args.useLLM === false ? false : true;
        const llm = getLlm ? getLlm() : null;
        const route = executionRoute3(exec);
        const sessionId = executionSessionId3(exec);
        let result;
        if (useLLM && llm && route && route.provider && route.model) {
          result = await tryLlmSuggestion({ llm, route, sessionId, brain, temperature: 0 });
          if (result.ok) {
            return { ok: true, data: result.data };
          }
          const fallback = buildLocalSuggestion(brain, Date.now());
          return {
            ok: true,
            data: {
              suggestion: fallback.data.suggestion,
              evidence: fallback.data.evidence,
              source: "llm_failed",
              llmError: { code: result.error, message: result.message }
            },
            durationMs: Date.now() - startMs
          };
        }
        const local = buildLocalSuggestion(brain, Date.now());
        return {
          ok: true,
          data: Object.assign({}, local.data, { durationMs: Date.now() - startMs, source: llm && !route ? "local_no_route" : "local" })
        };
      } catch (e) {
        return { ok: false, data: { error: { code: "E_SUGGEST_FAILED", message: String(e && e.message || e) } } };
      }
    }
  });
}
function renderSuggest(value) {
  if (!value || typeof value !== "object") return [{ type: "text", text: "dsh-project-brain: suggest FAILED - " + String(value) }];
  if (value.ok) {
    const d = value.data || {};
    const s = d.suggestion || {};
    const lines = [{ type: "text", text: `dsh-project-brain: suggest (${d.source || "?"})` }];
    lines.push({ type: "text", text: `  ${s.title || "(\u7121\u6A19\u984C)"}` });
    if (s.reason) lines.push({ type: "text", text: `  reason: ${s.reason}` });
    if (s.confidence != null) lines.push({ type: "text", text: `  confidence: ${(s.confidence * 100).toFixed(0)}%` });
    if (s.suggestedTodoId) lines.push({ type: "text", text: `  todo: ${s.suggestedTodoId}` });
    if (s.suggestedMemoryIds && s.suggestedMemoryIds.length) lines.push({ type: "text", text: `  memories: ${s.suggestedMemoryIds.join(", ")}` });
    if (d.llmError) lines.push({ type: "text", text: `  llm_fallback: ${d.llmError.code} - ${d.llmError.message}` });
    return lines;
  }
  if (value.data && value.data.error) return [{ type: "text", text: "dsh-project-brain: suggest FAILED - " + value.data.error.code + ": " + value.data.error.message }];
  return [{ type: "text", text: "dsh-project-brain: suggest FAILED - " + JSON.stringify(value) }];
}

// src/tools/status.js
init_brain_files();
import { defineTool as defineTool7 } from "@deepseek-ai/dsh-tools";

// src/host/memory/retrieval.js
function activeMemories(memories) {
  return (memories || []).filter(isRetrievableMemory);
}
function tokenizeMemoryText(value) {
  const text = String(value || "").toLowerCase();
  const tokens = [];
  for (const part of text.match(/[a-z0-9_./:@-]+|[\u4e00-\u9fff]+/g) || []) {
    if (/^[\u4e00-\u9fff]+$/.test(part)) {
      if (part.length === 1) tokens.push(part);
      else {
        for (let i = 0; i < part.length - 1; i++) tokens.push(part.slice(i, i + 2));
      }
    } else if (part.length > 1) {
      tokens.push(part);
    }
  }
  return tokens.slice(0, 2e3);
}
function memoryDocument(memory) {
  return [
    memory && memory.title,
    memory && memory.title,
    memory && memory.content,
    memory && Array.isArray(memory.tags) ? memory.tags.join(" ") : "",
    memory && Array.isArray(memory.relatedFiles) ? memory.relatedFiles.join(" ") : "",
    memory && memory.type
  ].filter(Boolean).join("\n");
}
function termCounts(tokens) {
  const map = /* @__PURE__ */ new Map();
  for (const token of tokens) map.set(token, (map.get(token) || 0) + 1);
  return map;
}
function bm25Scores(memories, query, options = {}) {
  const docs = (memories || []).map((memory) => tokenizeMemoryText(memoryDocument(memory)));
  const queryTokens = [...new Set(tokenizeMemoryText(query))];
  const scores = /* @__PURE__ */ new Map();
  if (docs.length === 0 || queryTokens.length === 0) return scores;
  const avgLength = docs.reduce((sum, doc) => sum + doc.length, 0) / docs.length || 1;
  const k1 = typeof options.k1 === "number" ? options.k1 : 1.2;
  const b = typeof options.b === "number" ? options.b : 0.75;
  const dfs = /* @__PURE__ */ new Map();
  for (const token of queryTokens) {
    let count = 0;
    for (const doc of docs) if (doc.includes(token)) count += 1;
    dfs.set(token, count);
  }
  docs.forEach((doc, index) => {
    const counts = termCounts(doc);
    let score = 0;
    for (const token of queryTokens) {
      const tf = counts.get(token) || 0;
      if (!tf) continue;
      const df = dfs.get(token) || 0;
      const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
      score += idf * (tf * (k1 + 1) / (tf + k1 * (1 - b + b * doc.length / avgLength)));
    }
    scores.set(memories[index].id, score);
  });
  return scores;
}
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]);
    const y = Number(b[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    dot += x * y;
    aa += x * x;
    bb += y * y;
  }
  return aa > 0 && bb > 0 ? dot / Math.sqrt(aa * bb) : 0;
}
function normalizeScoreMap(map) {
  let max = 0;
  for (const value of map.values()) if (value > max) max = value;
  const out = /* @__PURE__ */ new Map();
  for (const [key, value] of map) out.set(key, max > 0 ? value / max : 0);
  return out;
}
function recencyScore(memory, now) {
  const touched = Math.max(
    Number(memory.lastAccessedAt) || 0,
    Number(memory.updatedAt) || 0,
    Number(memory.createdAt) || 0
  );
  const ageDays2 = Math.max(0, (now - touched) / 864e5);
  return ageDays2 <= 7 ? 1 : Math.max(0, 1 - ageDays2 / 180);
}
var TRUSTED_CONFIDENCE = 0.6;
function trustFactor(confidence) {
  const value = typeof confidence === "number" ? confidence : 0.6;
  if (value >= TRUSTED_CONFIDENCE) return 1;
  return Math.max(0.35, value / TRUSTED_CONFIDENCE);
}
function tokenJaccard(a, b) {
  const aa = new Set(tokenizeMemoryText(memoryDocument(a)));
  const bb = new Set(tokenizeMemoryText(memoryDocument(b)));
  if (aa.size === 0 || bb.size === 0) return 0;
  let intersection = 0;
  for (const token of aa) if (bb.has(token)) intersection += 1;
  return intersection / (aa.size + bb.size - intersection);
}
function diverseSelect(ranked, topK) {
  const selected = [];
  const remaining = ranked.slice();
  while (selected.length < Math.max(1, topK) && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      let similarityPenalty = 0;
      let sameType = 0;
      for (const chosen of selected) {
        similarityPenalty = Math.max(similarityPenalty, tokenJaccard(candidate.memory, chosen.memory));
        if (candidate.memory.type === chosen.memory.type) sameType += 1;
      }
      const diversityScore = candidate.relevance - similarityPenalty * 0.22 - Math.max(0, sameType - 1) * 0.08;
      if (diversityScore > bestScore) {
        bestScore = diversityScore;
        bestIndex = i;
      }
    }
    const picked = remaining.splice(bestIndex, 1)[0];
    selected.push({ ...picked, score: bestScore });
  }
  return selected;
}
function retrieveMemories({ memories, query = "", topK = 5, now = Date.now(), vectors, queryVector, config = {} } = {}) {
  const candidates = activeMemories(memories);
  const hasQuery = tokenizeMemoryText(query).length > 0;
  const keyword = normalizeScoreMap(bm25Scores(candidates, query));
  const vectorRaw = /* @__PURE__ */ new Map();
  if (queryVector && vectors) {
    for (const memory of candidates) {
      const vector2 = vectors instanceof Map ? vectors.get(memory.id) : vectors[memory.id];
      if (vector2) vectorRaw.set(memory.id, Math.max(0, cosineSimilarity(queryVector, vector2)));
    }
  }
  const vector = normalizeScoreMap(vectorRaw);
  const weights = {
    keyword: hasQuery ? Number(config.keywordWeight ?? 0.15) : 0,
    vector: vector.size > 0 ? Number(config.vectorWeight ?? 0.25) : 0,
    importance: hasQuery ? Number(config.importanceWeight ?? 0.3) : 0.45,
    confidence: hasQuery ? Number(config.confidenceWeight ?? 0.1) : 0.1,
    recency: hasQuery ? Number(config.recencyWeight ?? 0.2) : 0.25,
    type: hasQuery ? 0 : 0.2
  };
  const ranked = candidates.map((memory) => {
    const importance = typeof memory.importance === "number" ? memory.importance : 0.5;
    const confidence = typeof memory.confidence === "number" ? memory.confidence : 0.6;
    const stableType = ["decision", "requirement", "architecture", "bug", "lesson", "preference"].includes(memory.type) ? 1 : 0.35;
    const weighted = (keyword.get(memory.id) || 0) * weights.keyword + (vector.get(memory.id) || 0) * weights.vector + importance * weights.importance + confidence * weights.confidence + recencyScore(memory, now) * weights.recency + stableType * weights.type;
    const relevance = weighted * trustFactor(confidence);
    return { memory, relevance, keywordScore: keyword.get(memory.id) || 0, vectorScore: vector.get(memory.id) || 0 };
  }).sort((a, b) => b.relevance - a.relevance);
  return diverseSelect(ranked, topK);
}

// src/host/memory/config.js
import z from "@deepseek-ai/schemastery";
var MEMORY_SETTINGS_NS = "dsh-project-brain";
var Config = z.object({
  retrievalMode: z.union(["keyword", "hybrid"]).default("hybrid"),
  vectorEnabled: z.boolean().default(false),
  embeddingBaseURL: z.string().default(""),
  embeddingModel: z.string().default(""),
  embeddingApiKeyEnv: z.string().default("PROJECT_BRAIN_EMBEDDING_API_KEY"),
  embeddingDimensions: z.number().step(1).min(0).default(0),
  embeddingBatchSize: z.number().step(1).min(1).max(128).default(16),
  embeddingMaxIndexPerRun: z.number().step(1).min(1).max(500).default(64),
  embeddingTimeoutMs: z.number().step(1).min(1e3).max(12e4).default(2e4),
  keywordWeight: z.number().min(0).max(1).default(0.15),
  vectorWeight: z.number().min(0).max(1).default(0.25),
  importanceWeight: z.number().min(0).max(1).default(0.3),
  confidenceWeight: z.number().min(0).max(1).default(0.1),
  recencyWeight: z.number().min(0).max(1).default(0.2),
  sessionSemanticMemoryEnabled: z.boolean().default(true),
  sessionSemanticMaxChars: z.number().step(1).min(2e3).max(4e4).default(16e3),
  sessionSemanticMaxItems: z.number().step(1).min(1).max(8).default(4),
  sessionSemanticTimeoutMs: z.number().step(1).min(5e3).max(12e4).default(3e4),
  sessionIdleSummaryMs: z.number().step(1).min(3e4).max(36e5).default(3e5),
  realtimeMemoryEnabled: z.boolean().default(true),
  realtimeMemoryTimeoutMs: z.number().step(1).min(5e3).max(6e4).default(2e4),
  coreMaxItems: z.number().step(1).min(5).max(60).default(25),
  coreMaxTokens: z.number().step(1).min(400).max(4e3).default(1500),
  vacuumMemoryRetainDays: z.number().step(1).min(7).max(3650).default(90),
  vacuumMemoryMinRetained: z.number().step(1).min(0).max(1e4).default(200),
  vacuumTimelineMaxEvents: z.number().step(1).min(200).max(1e5).default(2e3),
  vacuumTimelineRetainDays: z.number().step(1).min(7).max(3650).default(180),
  architectureEnabled: z.boolean().default(true),
  architectureLlmEnabled: z.boolean().default(true),
  architectureLlmIncludeSource: z.boolean().default(true),
  architectureMaxFiles: z.number().step(1).min(20).max(1e3).default(240),
  architectureMaxNodes: z.number().step(1).min(6).max(60).default(24),
  architectureLlmTimeoutMs: z.number().step(1).min(5e3).max(12e4).default(6e4)
});
function normalizeMemoryConfig(value) {
  const input = value && typeof value === "object" ? value : {};
  const num2 = (key, fallback, min, max) => {
    const raw = Number(input[key]);
    if (!Number.isFinite(raw)) return fallback;
    return Math.min(max, Math.max(min, raw));
  };
  const integer = (key, fallback, min, max) => Math.round(num2(key, fallback, min, max));
  return Object.freeze({
    retrievalMode: input.retrievalMode === "keyword" ? "keyword" : "hybrid",
    vectorEnabled: input.vectorEnabled === true,
    embeddingBaseURL: typeof input.embeddingBaseURL === "string" ? input.embeddingBaseURL.trim() : "",
    embeddingModel: typeof input.embeddingModel === "string" ? input.embeddingModel.trim() : "",
    embeddingApiKeyEnv: typeof input.embeddingApiKeyEnv === "string" ? input.embeddingApiKeyEnv.trim() : "PROJECT_BRAIN_EMBEDDING_API_KEY",
    embeddingDimensions: Number.isSafeInteger(input.embeddingDimensions) && input.embeddingDimensions > 0 ? input.embeddingDimensions : null,
    embeddingBatchSize: integer("embeddingBatchSize", 16, 1, 128),
    embeddingMaxIndexPerRun: integer("embeddingMaxIndexPerRun", 64, 1, 500),
    embeddingTimeoutMs: integer("embeddingTimeoutMs", 2e4, 1e3, 12e4),
    keywordWeight: num2("keywordWeight", 0.15, 0, 1),
    vectorWeight: num2("vectorWeight", 0.25, 0, 1),
    importanceWeight: num2("importanceWeight", 0.3, 0, 1),
    confidenceWeight: num2("confidenceWeight", 0.1, 0, 1),
    recencyWeight: num2("recencyWeight", 0.2, 0, 1),
    sessionSemanticMemoryEnabled: input.sessionSemanticMemoryEnabled !== false,
    sessionSemanticMaxChars: integer("sessionSemanticMaxChars", 16e3, 2e3, 4e4),
    sessionSemanticMaxItems: integer("sessionSemanticMaxItems", 4, 1, 8),
    sessionSemanticTimeoutMs: integer("sessionSemanticTimeoutMs", 3e4, 5e3, 12e4),
    sessionIdleSummaryMs: integer("sessionIdleSummaryMs", 3e5, 3e4, 36e5),
    realtimeMemoryEnabled: input.realtimeMemoryEnabled !== false,
    realtimeMemoryTimeoutMs: integer("realtimeMemoryTimeoutMs", 2e4, 5e3, 6e4),
    coreMaxItems: integer("coreMaxItems", 25, 5, 60),
    coreMaxTokens: integer("coreMaxTokens", 1500, 400, 4e3),
    vacuumMemoryRetainDays: integer("vacuumMemoryRetainDays", 90, 7, 3650),
    vacuumMemoryMinRetained: integer("vacuumMemoryMinRetained", 200, 0, 1e4),
    vacuumTimelineMaxEvents: integer("vacuumTimelineMaxEvents", 2e3, 200, 1e5),
    vacuumTimelineRetainDays: integer("vacuumTimelineRetainDays", 180, 7, 3650),
    architectureEnabled: input.architectureEnabled !== false,
    architectureLlmEnabled: input.architectureLlmEnabled !== false,
    architectureLlmIncludeSource: input.architectureLlmIncludeSource !== false,
    architectureMaxFiles: integer("architectureMaxFiles", 240, 20, 1e3),
    architectureMaxNodes: integer("architectureMaxNodes", 24, 6, 60),
    architectureLlmTimeoutMs: integer("architectureLlmTimeoutMs", 6e4, 5e3, 12e4)
  });
}
function isEmbeddingEnvRef(value) {
  return /^[A-Z][A-Z0-9_]{2,127}$/.test(String(value || "").trim());
}
function redactSecret(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (isEmbeddingEnvRef(s)) return s;
  if (s.length <= 8) return "\u2022\u2022\u2022\u2022";
  return "\u2022\u2022\u2022\u2022" + s.slice(-4);
}
async function resolveEmbeddingApiKey(ref, resolveCredential) {
  const s = String(ref || "").trim();
  if (!s) return null;
  if (!isEmbeddingEnvRef(s)) return s;
  if (typeof resolveCredential === "function") {
    try {
      const hit = await resolveCredential(s);
      if (typeof hit === "string" && hit.trim()) return hit.trim();
    } catch (e) {
    }
  }
  return null;
}
function publicMemoryConfig(config) {
  const c = normalizeMemoryConfig(config);
  const configured = Boolean(c.vectorEnabled && c.embeddingBaseURL && c.embeddingModel);
  return {
    requestedMode: c.retrievalMode,
    configuredMode: configured && c.retrievalMode === "hybrid" ? "hybrid" : "keyword",
    fallbackMode: "keyword",
    vectorEnabled: c.vectorEnabled,
    vectorConfigured: configured,
    embeddingModel: c.embeddingModel || null,
    embeddingDimensions: c.embeddingDimensions,
    sessionSemanticMemory: {
      enabled: c.sessionSemanticMemoryEnabled,
      maxChars: c.sessionSemanticMaxChars,
      maxItems: c.sessionSemanticMaxItems
    },
    realtimeMemory: {
      enabled: c.realtimeMemoryEnabled,
      timeoutMs: c.realtimeMemoryTimeoutMs
    },
    core: {
      maxItems: c.coreMaxItems,
      maxTokens: c.coreMaxTokens,
      maxPinned: maxPinnedCount({ maxItems: c.coreMaxItems, maxTokens: c.coreMaxTokens })
    },
    architecture: {
      enabled: c.architectureEnabled,
      llmEnabled: c.architectureLlmEnabled,
      llmIncludeSource: c.architectureLlmIncludeSource,
      maxFiles: c.architectureMaxFiles,
      maxNodes: c.architectureMaxNodes
    }
  };
}
function createMemoryConfigRuntime(ctx, entryConfig) {
  let current = normalizeMemoryConfig(entryConfig);
  setCoreLimits(current);
  let credentials = null;
  let settingsService = null;
  let settingsScope = null;
  if (ctx && typeof ctx.inject === "function") {
    try {
      ctx.inject(["settings"], (settingsCtx) => {
        let settings;
        try {
          settings = settingsCtx.get ? settingsCtx.get("settings") : settingsCtx.settings;
        } catch (e) {
          settings = null;
        }
        if (!settings || typeof settings.register !== "function") return;
        settingsService = settings;
        settingsScope = settings.register(MEMORY_SETTINGS_NS, Config, { base: entryConfig || {} });
        try {
          current = normalizeMemoryConfig(settingsScope.get());
          setCoreLimits(current);
        } catch (e) {
        }
        if (settingsScope && typeof settingsScope.watch === "function") {
          settingsScope.watch((next) => {
            current = normalizeMemoryConfig(next);
            setCoreLimits(current);
          });
        }
      });
    } catch (e) {
    }
    try {
      ctx.inject(["credentials"], (credentialsCtx) => {
        try {
          credentials = credentialsCtx.get ? credentialsCtx.get("credentials") : credentialsCtx.credentials;
        } catch (e) {
          credentials = null;
        }
        if (credentialsCtx && typeof credentialsCtx.effect === "function") {
          try {
            credentialsCtx.effect(() => {
              credentials = null;
            }, "dsh-project-brain:credentials");
          } catch (e) {
          }
        }
      });
    } catch (e) {
    }
  }
  return {
    get: () => current,
    getSettingsService: () => settingsService,
    getSettingsScope: () => settingsScope,
    settingsWritable: () => {
      try {
        return !!(settingsService && settingsService.writable !== false && typeof settingsService.update === "function");
      } catch (e) {
        return false;
      }
    },
    async updateSettings(patch) {
      if (!settingsService || typeof settingsService.update !== "function") {
        const error = new Error("settings service unavailable; config is read-only in this runtime");
        error.code = "SETTINGS_UNAVAILABLE";
        throw error;
      }
      if (settingsService.writable === false) {
        const error = new Error("settings provider is read-only");
        error.code = "SETTINGS_READONLY";
        throw error;
      }
      await settingsService.update(MEMORY_SETTINGS_NS, patch);
      return normalizeMemoryConfig(settingsService.get(MEMORY_SETTINGS_NS));
    },
    async resolveCredential(ref) {
      return resolveEmbeddingApiKey(ref, async (name2) => {
        if (credentials && typeof credentials.resolve === "function") {
          try {
            const hit = await credentials.resolve(name2);
            if (hit && typeof hit.value === "string" && hit.value.trim()) return hit.value.trim();
          } catch (e) {
          }
        }
        const value = typeof process !== "undefined" && process.env ? process.env[name2] : null;
        return typeof value === "string" && value.trim() ? value.trim() : null;
      });
    }
  };
}

// src/tools/status.js
var baseOutputSchema4 = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    data: { type: "object", additionalProperties: true }
  }
};
function buildStatusTool({ fs, sandboxPolicy, getMemoryConfig }) {
  return defineTool7({
    name: "project_status",
    description: "dsh-project-brain: \u8FD4\u56DE\u7576\u524D\u5C08\u6848\u7684\u5FEB\u901F\u72C0\u614B\u5FEB\u7167\uFF08\u5C08\u6848\u5143\u8CC7\u8A0A + \u5404\u578B\u5225 Memory \u8A08\u6578 + TODO \u7D71\u8A08 + \u6700\u8FD1\u6D3B\u52D5 + \u662F\u5426\u521D\u59CB\u5316\uFF09\u3002\u6BD4 project_continue \u66F4\u8F15\u3001\u4E0D\u9700\u8981\u6392\u5E8F\u6F14\u7B97\u6CD5\u3002",
    parameters: {
      path: { type: "string", description: "\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u7D55\u5C0D\u8DEF\u5F91\uFF09\uFF0C\u9810\u8A2D\u5F9E session cwd \u63A8\u65B7" }
    },
    output: { schema: baseOutputSchema4, render: (_args, value) => renderStatus(value) },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        await ensureHousekeepOnRead(fs, projectPath);
        const brain = await readBrain(fs, projectPath);
        const p = brain && brain.project;
        if (!p || p.__error) {
          return { ok: false, data: { error: { code: "E_NOT_INITIALIZED", message: "\u8A72\u5C08\u6848\u5C1A\u672A\u521D\u59CB\u5316\uFF0C\u8ACB\u5148\u547C\u53EB project_init", projectPath }, projectPath } };
        }
        const tStats = todoStats(brain.todos);
        const visibleMemories = activeMemories(brain.memories);
        const memoryCounts = {};
        for (const m of visibleMemories) {
          const k = m.type || "context";
          memoryCounts[k] = (memoryCounts[k] || 0) + 1;
        }
        const recent = recentTimeline(brain.timeline, 3).map((e) => ({
          id: e.id,
          title: e.title,
          occurredAt: e.occurredAt,
          eventType: e.eventType
        }));
        const now = Date.now();
        const lastActivityAt = recent.length > 0 ? recent[0].occurredAt : p.updatedAt || p.lastScannedAt || null;
        return {
          ok: true,
          data: {
            projectPath,
            initialized: true,
            project: {
              id: p.id,
              name: p.name,
              rootPath: p.rootPath,
              type: techStackToType(p.techStack),
              lastUpdateAt: p.updatedAt || p.lastScannedAt || null,
              lastScannedAt: p.lastScannedAt || null
            },
            stats: {
              files: p.size && p.size.files || null,
              memories: visibleMemories.length,
              archivedMemories: (brain.memories || []).length - visibleMemories.length,
              todos: tStats.total,
              pendingTodos: tStats.pendingTodos,
              completedTodos: tStats.completedTodos,
              timelineEvents: (brain.timeline || []).length,
              lastActivityAt,
              uptimeMs: lastActivityAt ? now - lastActivityAt : null
            },
            memoryCounts,
            retrieval: publicMemoryConfig(getMemoryConfig ? getMemoryConfig() : {}),
            recentActivity: recent
          }
        };
      } catch (e) {
        return { ok: false, data: { error: { code: "E_STATUS_FAILED", message: String(e && e.message || e) } } };
      }
    }
  });
}
function renderStatus(value) {
  if (!value || typeof value !== "object") return [{ type: "text", text: "dsh-project-brain: status FAILED - " + String(value) }];
  if (value.ok) {
    const d = value.data || {};
    const lines = [{ type: "text", text: `dsh-project-brain: project status` }];
    if (d.project) lines.push({ type: "text", text: `  Project: ${d.project.name} (${d.project.type})` });
    lines.push({ type: "text", text: `  Memories: ${d.stats.memories} (${Object.entries(d.memoryCounts).map(([k, v]) => k + ":" + v).join(", ")})` });
    lines.push({ type: "text", text: `  Todos: pending ${d.stats.pendingTodos} / done ${d.stats.completedTodos} / total ${d.stats.todos}` });
    lines.push({ type: "text", text: `  Timeline: ${d.stats.timelineEvents} events` });
    if (d.retrieval) {
      lines.push({ type: "text", text: `  Retrieval: ${d.retrieval.configuredMode === "hybrid" ? "hybrid configured (fallback: keyword)" : "local keyword"}` });
    }
    if (d.stats.lastActivityAt) {
      const ageMin = Math.round((Date.now() - d.stats.lastActivityAt) / 6e4);
      lines.push({ type: "text", text: `  Last activity: ${ageMin} min ago` });
    }
    for (const e of d.recentActivity || []) {
      lines.push({ type: "text", text: `  activity: ${e.title}` });
    }
    return lines;
  }
  if (value.data && value.data.error) return [{ type: "text", text: "dsh-project-brain: status FAILED - " + value.data.error.code + ": " + value.data.error.message }];
  return [{ type: "text", text: "dsh-project-brain: status FAILED - " + JSON.stringify(value) }];
}

// src/tools/ask.js
init_brain_files();
import { defineTool as defineTool8 } from "@deepseek-ai/dsh-tools";

// src/host/memory/access.js
init_brain_files();
init_write_lock();
var ACCESS_THROTTLE_MS = 5 * 60 * 1e3;
var MAX_ACCESS_COUNT = 9999;
function applyAccessTouch(rows, ids, now = Date.now(), throttleMs = ACCESS_THROTTLE_MS) {
  const wanted = new Set((ids || []).map(String).filter(Boolean));
  if (wanted.size === 0) return { changed: false, rows: rows || [], touched: [] };
  const touched = [];
  const next = (rows || []).map((m) => {
    if (!m || !wanted.has(String(m.id))) return m;
    const last = Number(m.lastAccessedAt) || 0;
    if (last && now - last < throttleMs) return m;
    touched.push(m.id);
    return Object.assign({}, m, {
      lastAccessedAt: now,
      accessCount: Math.min(MAX_ACCESS_COUNT, (Number(m.accessCount) || 0) + 1)
    });
  });
  return { changed: touched.length > 0, rows: next, touched };
}
async function recordMemoryAccess({ fs, projectPath, ids, now = Date.now() } = {}) {
  if (!fs || !projectPath || !ids || ids.length === 0) return { changed: false, touched: [] };
  try {
    return await withWriteLock(brainTxKey(projectPath, "memory.jsonl"), async () => {
      const file = brainPath2(projectPath, "memory.jsonl");
      const rows = await readJsonl(fs, file);
      const result = applyAccessTouch(rows, ids, now);
      if (!result.changed) return { changed: false, touched: [] };
      const wrote = await writeJsonl(fs, file, result.rows);
      return { changed: wrote, touched: result.touched };
    });
  } catch (e) {
    return { changed: false, touched: [], error: String(e && e.message || e) };
  }
}

// src/host/memory/embeddings.js
init_brain_files();
import { createHash as createHash2 } from "node:crypto";
var CACHE_FILE = "cache/embeddings.jsonl";
function embeddingContentHash(memory) {
  return createHash2("sha256").update(memoryDocument(memory), "utf8").digest("hex");
}
function embeddingModelKey(config) {
  return [config.embeddingBaseURL || "", config.embeddingModel || "", config.embeddingDimensions || "auto"].join("|");
}
function embeddingEndpoint(baseURL) {
  const base = String(baseURL || "").replace(/\/+$/, "");
  return /\/embeddings$/i.test(base) ? base : base + "/embeddings";
}
function validVector(value) {
  return Array.isArray(value) && value.length > 0 && value.every((n) => Number.isFinite(Number(n)));
}
async function fetchEmbeddings({ texts, config, apiKey, signal, fetchImpl = fetch }) {
  if (!config.embeddingBaseURL || !config.embeddingModel) {
    const error = new Error("Embedding endpoint or model is not configured");
    error.code = "EMBEDDING_NOT_CONFIGURED";
    throw error;
  }
  const timeoutSignal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(config.embeddingTimeoutMs || 2e4) : void 0;
  const combinedSignal = signal && timeoutSignal && typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeoutSignal]) : signal || timeoutSignal;
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = "Bearer " + apiKey;
  const body = { model: config.embeddingModel, input: texts };
  if (config.embeddingDimensions) body.dimensions = config.embeddingDimensions;
  const response = await fetchImpl(embeddingEndpoint(config.embeddingBaseURL), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: combinedSignal
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error("Embedding API error " + response.status + (detail ? ": " + detail.slice(0, 160) : ""));
    error.code = "EMBEDDING_API_ERROR";
    throw error;
  }
  const payload = await response.json();
  const data = payload && Array.isArray(payload.data) ? payload.data.slice().sort((a, b) => (a.index || 0) - (b.index || 0)) : [];
  const vectors = data.map((item) => item && item.embedding);
  if (vectors.length !== texts.length || vectors.some((vector) => !validVector(vector))) {
    const error = new Error("Embedding API returned invalid vectors");
    error.code = "EMBEDDING_INVALID_RESPONSE";
    throw error;
  }
  const dimensions = vectors[0].length;
  if (vectors.some((vector) => vector.length !== dimensions)) {
    const error = new Error("Embedding API returned inconsistent dimensions");
    error.code = "EMBEDDING_DIMENSION_MISMATCH";
    throw error;
  }
  return vectors.map((vector) => vector.map(Number));
}
async function readCache(fs, projectPath) {
  try {
    return await readJsonl(fs, brainPath2(projectPath, CACHE_FILE));
  } catch (e) {
    return [];
  }
}
async function ensureEmbeddingIndex({ fs, projectPath, memories, config, resolveCredential, signal, fetchImpl, knownMemoryIds } = {}) {
  const active = activeMemories(memories);
  const modelKey = embeddingModelKey(config);
  const rows = await readCache(fs, projectPath);
  const currentById = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (!row || row.modelKey !== modelKey || !validVector(row.vector)) continue;
    currentById.set(row.memoryId, row);
  }
  const pending = active.filter((memory) => {
    const row = currentById.get(memory.id);
    return !row || row.contentHash !== embeddingContentHash(memory);
  });
  const limit = Math.min(pending.length, config.embeddingMaxIndexPerRun || 64);
  const toIndex = pending.slice(0, limit);
  let error = null;
  let indexedNow = 0;
  if (toIndex.length > 0) {
    try {
      const apiKey = await resolveEmbeddingApiKey(config.embeddingApiKeyEnv, resolveCredential);
      if (config.embeddingApiKeyEnv && !apiKey) {
        const missing = new Error("Embedding credential is not configured");
        missing.code = "EMBEDDING_CREDENTIAL_MISSING";
        throw missing;
      }
      const batchSize = config.embeddingBatchSize || 16;
      for (let offset = 0; offset < toIndex.length; offset += batchSize) {
        const batch = toIndex.slice(offset, offset + batchSize);
        const vectors2 = await fetchEmbeddings({
          texts: batch.map(memoryDocument),
          config,
          apiKey,
          signal,
          fetchImpl
        });
        batch.forEach((memory, index) => {
          currentById.set(memory.id, {
            memoryId: memory.id,
            contentHash: embeddingContentHash(memory),
            modelKey,
            model: config.embeddingModel,
            dimensions: vectors2[index].length,
            vector: vectors2[index],
            updatedAt: Date.now()
          });
          indexedNow += 1;
        });
      }
    } catch (caught) {
      error = caught;
    }
  }
  if (indexedNow > 0) {
    const keepIds = Array.isArray(knownMemoryIds) && knownMemoryIds.length ? new Set(knownMemoryIds.map(String)) : null;
    const nextRows = keepIds ? [...currentById.values()].filter((row) => keepIds.has(String(row.memoryId))) : [...currentById.values()];
    const wrote = await writeJsonl(fs, brainPath2(projectPath, CACHE_FILE), nextRows);
    if (!wrote && !error) {
      error = Object.assign(new Error("Embedding cache could not be written"), { code: "EMBEDDING_CACHE_WRITE_FAILED" });
    }
  }
  const vectors = /* @__PURE__ */ new Map();
  for (const memory of active) {
    const row = currentById.get(memory.id);
    if (row && row.contentHash === embeddingContentHash(memory)) vectors.set(memory.id, row.vector);
  }
  return {
    vectors,
    indexed: vectors.size,
    total: active.length,
    indexedNow,
    pending: Math.max(0, active.length - vectors.size),
    error: error ? { code: error.code || "EMBEDDING_FAILED", message: String(error.message || error) } : null,
    model: config.embeddingModel,
    dimensions: vectors.size ? vectors.values().next().value.length : config.embeddingDimensions
  };
}
async function embedQuery({ query, config, resolveCredential, signal, fetchImpl } = {}) {
  const apiKey = await resolveEmbeddingApiKey(config && config.embeddingApiKeyEnv, resolveCredential);
  if (config && config.embeddingApiKeyEnv && !apiKey) {
    const error = new Error("Embedding credential is not configured");
    error.code = "EMBEDDING_CREDENTIAL_MISSING";
    throw error;
  }
  return (await fetchEmbeddings({ texts: [query], config, apiKey, signal, fetchImpl }))[0];
}

// src/tools/ask.js
var baseOutputSchema5 = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    data: { type: "object", additionalProperties: true }
  }
};
function tokenize(s) {
  if (!s) return [];
  const out = [];
  const en = String(s).toLowerCase().split(/[^a-z0-9_\u4e00-\u9fff]+/i);
  for (const tok of en) {
    const t = tok && tok.trim();
    if (t && t.length >= 2) out.push(t);
  }
  return out;
}
function scoreEntry(entry, tokens, fields) {
  if (!entry || tokens.length === 0) return 0;
  let score = 0;
  let hits = 0;
  for (const tok of tokens) {
    for (const f of fields) {
      const v = entry[f];
      if (v == null) continue;
      const s = String(v).toLowerCase();
      if (s.indexOf(tok) >= 0) {
        score += 1;
        hits += 1;
        if (f === "title") score += 1;
        break;
      }
    }
  }
  return hits > 0 ? score : -1;
}
function buildRagPrompt(question, sources, projectInfo) {
  const parts = [];
  parts.push("\u4F60\u662F dsh-project-brain \u52A9\u624B\u3002\u4F7F\u7528\u8005\u554F\u4E86\u4E00\u500B\u95DC\u65BC\u5C08\u6848\u7684\u554F\u984C\uFF0C\u8ACB\u50C5\u57FA\u65BC\u4E0B\u9762\u63D0\u4F9B\u7684 sources \u56DE\u7B54\uFF0C\u4E0D\u8981\u7DE8\u9020\u8CC7\u8A0A\u3002");
  parts.push("");
  if (projectInfo) {
    parts.push("\u3010\u5C08\u6848\u6982\u6CC1\u3011");
    parts.push("- \u540D\u7A31: " + (projectInfo.name || "(\u672A\u547D\u540D)"));
    if (projectInfo.type) parts.push("- \u578B\u5225: " + projectInfo.type);
    parts.push("");
  }
  parts.push("\u3010\u76F8\u95DC Memory / TODO / Timeline\uFF08Top sources\uFF09\u3011");
  sources.forEach((s, i) => {
    const tag = s.kind + " + " + (s.type || s.status || s.eventType || "");
    parts.push(`[${i + 1}] (${tag}) ${s.title}`);
    if (s.snippet) parts.push("    " + s.snippet);
    parts.push("");
  });
  parts.push("\u3010\u4F7F\u7528\u8005\u554F\u984C\u3011");
  parts.push(question);
  parts.push("");
  parts.push("\u8ACB\u7528\u7C21\u6F54\u7684\u4E2D\u6587\u56DE\u7B54\uFF083-5 \u53E5\u8A71\uFF09\uFF0C\u4E26\u5728\u672B\u5C3E\u5217\u51FA\u5F15\u7528\u7684\u4F86\u6E90\u7DE8\u865F [1][2]...\u3002\u5982\u679C sources \u7121\u6CD5\u56DE\u7B54\uFF0C\u76F4\u63A5\u8AAA\u300E\u8CC7\u8A0A\u4E0D\u8DB3\u300F\u3002");
  return parts.join("\n");
}
function executionRoute4(exec) {
  if (!exec) return null;
  return resolveSessionRoute(exec.session) || resolveSessionRoute(exec.currentSession) || resolveSessionRoute(exec.agent && exec.agent.session) || resolveSessionRoute(exec.agent) || resolveSessionRoute(exec.ctx && exec.ctx.session);
}
function executionSessionId4(exec) {
  return exec && (exec.sessionId || exec.session && exec.session.id || exec.agent && exec.agent.sessionId || exec.agent && exec.agent.session && exec.agent.session.id) || null;
}
async function synthesizeAnswer({ llm, route, sessionId, question, sources, projectInfo }) {
  if (!sources || sources.length === 0) return null;
  if (!llm || typeof llm.stream !== "function") return null;
  if (!route || !route.provider || !route.model) return null;
  const prompt = buildRagPrompt(question, sources, projectInfo);
  try {
    const text = await streamLlmText(llm, route, prompt, sessionId, 3e4, {
      system: "\u4F60\u662F dsh-project-brain \u52A9\u624B\uFF0C\u50C5\u57FA\u65BC\u63D0\u4F9B\u7684 sources \u56DE\u7B54\uFF0C\u4E0D\u8981\u7DE8\u9020\u8CC7\u8A0A\u3002",
      maxTokens: 800,
      purpose: "project-brain-ask"
    });
    return text && text.trim() ? text.trim() : null;
  } catch (e) {
    return null;
  }
}
function buildAskTool({ fs, sandboxPolicy, getMemoryConfig, resolveEmbeddingCredential, getLlm }) {
  return defineTool8({
    name: "project_ask",
    description: "dsh-project-brain: \u81EA\u7136\u8A9E\u8A00\u67E5\u8A62\u5C08\u6848\u8166\u3002\u9810\u8A2D BM25 + \u91CD\u8981\u5EA6/\u6642\u6548\uFF08\u542B dormant\uFF09\uFF1B\u5411\u91CF\u82E5\u5DF2\u914D\u7F6E\u53EA\u4F5C\u70BA\u52A0\u5206\u3002 \u8FD4\u56DE Top-K sources + \u5C08\u6848\u6982\u89BD\u3002useLLM=true \u6642\u984D\u5916\u8ABF LLM \u5408\u6210\u7B54\u6848\uFF08RAG \u98A8\u683C\uFF09\u3002\u53EF\u7528\u65BC\u56DE\u7B54\u300C\u70BA\u4EC0\u9EBC\u9019\u9EBC\u8A2D\u8A08 / \u4E4B\u524D\u8E29\u904E\u4EC0\u9EBC\u5751 / \u6700\u8FD1\u6539\u4E86\u4EC0\u9EBC\u300D\u7B49\u554F\u984C\u3002",
    parameters: {
      question: { type: "string", description: "\u81EA\u7136\u8A9E\u8A00\u554F\u984C\uFF08\u5FC5\u586B\uFF09" },
      topK: { type: "number", description: "\u8FD4\u56DE\u689D\u76EE\u6578\u4E0A\u9650\uFF0C\u9810\u8A2D 5" },
      useLLM: { type: "boolean", description: "\u662F\u5426\u8ABF LLM \u5408\u6210\u7B54\u6848\uFF08\u9810\u8A2D false\uFF0C\u7D14\u898F\u5247\u8FD4\u56DE sources\uFF09" },
      includeArchived: { type: "boolean", description: "\u662F\u5426\u6AA2\u7D22 archived/superseded\uFF0C\u9810\u8A2D false" },
      path: { type: "string", description: "\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u9810\u8A2D\u5F9E session cwd \u63A8\u65B7\uFF09" }
    },
    output: { schema: baseOutputSchema5, render: (_args, value) => renderAsk(value) },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        await ensureHousekeepOnRead(fs, projectPath);
        const question = args && args.question ? String(args.question).trim() : "";
        if (!question) return { ok: false, data: { error: { code: "E_NO_QUESTION", message: "question \u5FC5\u586B" } } };
        const topK = Math.max(1, Math.min(20, Number(args && args.topK) || 5));
        const useLLM = Boolean(args && args.useLLM);
        const tokens = tokenize(question);
        const memoryConfig = normalizeMemoryConfig(getMemoryConfig ? getMemoryConfig() : {});
        const projectJson = await readJson(fs, brainPath2(projectPath, "project.json")).catch(() => null);
        const memories = await readJsonlSafe(fs, brainPath2(projectPath, "memory.jsonl"));
        const todos = await readJsonlSafe(fs, brainPath2(projectPath, "todo.jsonl"));
        const timeline = await readJsonlSafe(fs, brainPath2(projectPath, "timeline.jsonl"));
        const includeArchived = Boolean(args && args.includeArchived);
        const activeMemoryList = includeArchived ? (memories || []).filter(Boolean) : activeMemories(memories);
        let vectors = null;
        let queryVector = null;
        let vectorState = {
          requested: memoryConfig.vectorEnabled && memoryConfig.retrievalMode === "hybrid",
          used: false,
          indexed: 0,
          total: activeMemoryList.length,
          pending: activeMemoryList.length,
          model: memoryConfig.embeddingModel || null,
          dimensions: memoryConfig.embeddingDimensions,
          fallbackReason: null
        };
        if (vectorState.requested) {
          if (!memoryConfig.embeddingBaseURL || !memoryConfig.embeddingModel) {
            vectorState.fallbackReason = { code: "EMBEDDING_NOT_CONFIGURED", message: "\u5411\u91CF\u6AA2\u7D22\u5DF2\u555F\u7528\uFF0C\u4F46 endpoint \u6216 model \u672A\u914D\u7F6E" };
          } else {
            const indexState = await ensureEmbeddingIndex({
              fs,
              projectPath,
              memories: activeMemoryList,
              config: memoryConfig,
              resolveCredential: resolveEmbeddingCredential,
              knownMemoryIds: (memories || []).map((m) => m && m.id).filter(Boolean)
            });
            vectors = indexState.vectors;
            vectorState = { ...vectorState, ...indexState, requested: true, used: false, fallbackReason: indexState.error };
            try {
              queryVector = await embedQuery({
                query: question,
                config: memoryConfig,
                resolveCredential: resolveEmbeddingCredential
              });
              const indexedVector = vectors.size > 0 ? vectors.values().next().value : null;
              if (indexedVector && indexedVector.length !== queryVector.length) {
                queryVector = null;
                vectorState.fallbackReason = {
                  code: "EMBEDDING_DIMENSION_MISMATCH",
                  message: "\u67E5\u8A62\u5411\u91CF\u7DAD\u5EA6\u8207\u7D22\u5F15\u4E0D\u4E00\u81F4\uFF0C\u8ACB\u6AA2\u67E5\u6A21\u578B\u914D\u7F6E\u6216\u522A\u9664\u6D3E\u751F\u5FEB\u53D6\u5F8C\u91CD\u8A66"
                };
              } else {
                vectorState.used = vectors.size > 0;
              }
            } catch (error) {
              vectorState.fallbackReason = {
                code: error.code || "EMBEDDING_QUERY_FAILED",
                message: String(error.message || error)
              };
            }
          }
        }
        const memScored = retrieveMemories({
          memories: activeMemoryList,
          query: question,
          topK,
          vectors,
          queryVector,
          config: memoryConfig
        });
        const todoScored = (todos || []).map((t) => {
          const s = scoreEntry(t, tokens, ["title", "description"]);
          return s < 0 ? null : { ...t, _score: s };
        }).filter(Boolean);
        todoScored.sort((a, b) => (b._score || 0) - (a._score || 0));
        const tlScored = (timeline || []).map((e) => {
          const s = scoreEntry(e, tokens, ["title", "detail"]);
          return s < 0 ? null : { ...e, _score: s };
        }).filter(Boolean);
        tlScored.sort((a, b) => (b._score || 0) - (a._score || 0));
        await recordMemoryAccess({
          fs,
          projectPath,
          ids: memScored.map((hit) => hit.memory && hit.memory.id).filter(Boolean)
        });
        const memSources = memScored.map((hit) => ({
          kind: "memory",
          id: hit.memory.id,
          type: hit.memory.type,
          title: hit.memory.title,
          snippet: String(hit.memory.content || "").slice(0, 200),
          score: Number(Math.max(0, hit.relevance || 0).toFixed(4)),
          keywordScore: Number((hit.keywordScore || 0).toFixed(4)),
          vectorScore: Number((hit.vectorScore || 0).toFixed(4)),
          importance: hit.memory.importance,
          confidence: hit.memory.confidence,
          relatedFiles: hit.memory.relatedFiles || null
        }));
        const todoSources = todoScored.slice(0, Math.max(1, Math.floor(topK / 2))).map((t) => ({
          kind: "todo",
          id: t.id,
          status: t.status,
          priority: t.priority,
          title: t.title,
          snippet: String(t.description || "").slice(0, 120),
          score: Number((t._score || 0).toFixed(2))
        }));
        const tlSources = tlScored.slice(0, 2).map((e) => ({
          kind: "timeline",
          id: e.id,
          eventType: e.eventType,
          title: e.title,
          occurredAt: e.occurredAt,
          score: Number((e._score || 0).toFixed(2))
        }));
        const sources = memSources.concat(todoSources).concat(tlSources);
        const projectInfo = projectJson ? {
          name: projectJson.name,
          type: techStackToType(projectJson.techStack),
          lastUpdateAt: projectJson.updatedAt || projectJson.lastScannedAt || null
        } : null;
        let answer = null;
        let llmUsed = false;
        let llmError = null;
        if (useLLM) {
          try {
            answer = await synthesizeAnswer({
              llm: getLlm ? getLlm() : null,
              route: executionRoute4(exec),
              sessionId: executionSessionId4(exec),
              question,
              sources,
              projectInfo
            });
            llmUsed = answer != null;
          } catch (e) {
            llmError = String(e && e.message || e);
          }
        }
        const ret = {
          ok: true,
          data: {
            projectPath,
            question,
            tokens,
            project: projectInfo,
            sources,
            counts: {
              memories: activeMemoryList.length,
              archivedMemories: (memories || []).length - activeMemoryList.length,
              todos: (todos || []).length,
              timeline: (timeline || []).length,
              matched: sources.length
            },
            confidence: sources.length > 0 ? Math.min(1, memSources.length > 0 ? memSources[0].score : 0.3) : 0,
            retrieval: {
              requestedMode: memoryConfig.retrievalMode,
              actualMode: vectorState.used ? "hybrid" : "keyword",
              vectorRequested: vectorState.requested,
              vectorUsed: vectorState.used,
              indexed: vectorState.indexed,
              total: vectorState.total,
              pending: vectorState.pending,
              model: vectorState.model,
              dimensions: vectorState.dimensions,
              fallbackReason: vectorState.fallbackReason
            },
            answer,
            llm: {
              used: llmUsed,
              requested: useLLM,
              error: llmError
            },
            hint: sources.length === 0 ? "\u6C92\u6709\u5339\u914D\u689D\u76EE\u3002\u53EF\u8003\u616E\u653E\u5BEC\u95DC\u9375\u8A5E\uFF0C\u6216\u5148\u547C\u53EB project_init / project_memory_add \u9304\u5165\u66F4\u591A\u4E0A\u4E0B\u6587\u3002" : null
          }
        };
        try {
          const roundtrip = JSON.parse(JSON.stringify(ret));
          return roundtrip;
        } catch (e) {
          ret.data._diag = "JSON.stringify FAIL: " + String(e && e.message || e);
          return ret;
        }
      } catch (e) {
        return { ok: false, data: { error: { code: "E_ASK_FAILED", message: String(e && e.message || e) } } };
      }
    }
  });
}
async function readJsonlSafe(fs, path7) {
  try {
    return await readJsonl(fs, path7);
  } catch (e) {
    return [];
  }
}
function renderAsk(value) {
  if (!value || typeof value !== "object") return [{ type: "text", text: "dsh-project-brain: ask FAILED - " + String(value) }];
  if (value.ok) {
    const d = value.data || {};
    const lines = [{ type: "text", text: `dsh-project-brain: ask \u2014 matched ${d.counts.matched} sources (confidence ${(d.confidence || 0).toFixed(2)}, llm=${d.llm && d.llm.used ? "yes" : "no"})` }];
    if (d.answer) {
      lines.push({ type: "text", text: "\n\u3010LLM \u7B54\u6848\u3011" });
      lines.push({ type: "text", text: d.answer });
    }
    for (const s of d.sources || []) {
      lines.push({ type: "text", text: `  [${s.kind}/${s.id}] ${s.title}${s.snippet ? " \u2014 " + s.snippet.slice(0, 80) : ""}` });
    }
    if (d.llm && d.llm.error) lines.push({ type: "text", text: `  llm_error: ${d.llm.error}` });
    if (d.hint) lines.push({ type: "text", text: `  hint: ${d.hint}` });
    if (d._diag) lines.push({ type: "text", text: `  \u26A0\uFE0F DIAG: ${d._diag}` });
    return lines;
  }
  if (value.data && value.data.error) return [{ type: "text", text: "dsh-project-brain: ask FAILED - " + value.data.error.code + ": " + value.data.error.message }];
  return [{ type: "text", text: "dsh-project-brain: ask FAILED - " + JSON.stringify(value) }];
}

// src/tools/dream.js
init_brain_files();
import { defineTool as defineTool9 } from "@deepseek-ai/dsh-tools";

// src/host/memory/vacuum.js
init_brain_files();
init_write_lock();
var DAY_MS2 = 864e5;
var VACUUM_DEFAULTS = Object.freeze({
  // 歸檔多久之後才允許搬走
  memoryRetainDays: 90,
  // 即使全都超期，也至少留這麼多條歸檔在主檔案裡
  memoryMinRetained: 200,
  timelineMaxEvents: 2e3,
  timelineRetainDays: 180
});
function resolveOptions(config) {
  const num2 = (key, fallback, min, max) => {
    const raw = Number(config && config[key]);
    if (!Number.isFinite(raw)) return fallback;
    return Math.round(Math.min(max, Math.max(min, raw)));
  };
  return {
    memoryRetainDays: num2("vacuumMemoryRetainDays", VACUUM_DEFAULTS.memoryRetainDays, 7, 3650),
    memoryMinRetained: num2("vacuumMemoryMinRetained", VACUUM_DEFAULTS.memoryMinRetained, 0, 1e4),
    timelineMaxEvents: num2("vacuumTimelineMaxEvents", VACUUM_DEFAULTS.timelineMaxEvents, 200, 1e5),
    timelineRetainDays: num2("vacuumTimelineRetainDays", VACUUM_DEFAULTS.timelineRetainDays, 7, 3650)
  };
}
function ageMs(entry, now) {
  const at = Number(entry && (entry.updatedAt || entry.createdAt || entry.occurredAt)) || 0;
  return at > 0 ? now - at : Infinity;
}
function referencedIds(rows) {
  const referenced = /* @__PURE__ */ new Set();
  for (const m of rows || []) {
    if (!m) continue;
    if (m.supersededBy) referenced.add(String(m.supersededBy));
    if (m.source && m.source.supersedes) referenced.add(String(m.source.supersedes));
  }
  return referenced;
}
function planMemoryVacuum(rows, { now = Date.now(), config } = {}) {
  const opts = resolveOptions(config);
  const all = (rows || []).filter(Boolean);
  const cutoff = opts.memoryRetainDays * DAY_MS2;
  const referenced = referencedIds(all);
  const dead = all.filter((m) => !isCoreMemory(m) && m.status !== "dormant");
  const evictable = dead.filter((m) => !referenced.has(String(m.id))).filter((m) => m.pinned !== true).filter((m) => ageMs(m, now) > cutoff).sort((a, b) => ageMs(b, now) - ageMs(a, now));
  const overflow = Math.max(0, dead.length - opts.memoryMinRetained);
  const evict = evictable.slice(0, overflow);
  const evictIds = new Set(evict.map((m) => String(m.id)));
  return {
    evict,
    keep: all.filter((m) => !evictIds.has(String(m.id))),
    stats: {
      total: all.length,
      dead: dead.length,
      expired: evictable.length,
      evicted: evict.length,
      retainDays: opts.memoryRetainDays,
      minRetained: opts.memoryMinRetained
    }
  };
}
function isTimelineAnchor(event, latestSummaryId) {
  if (!event) return false;
  if (event.eventType === "init") return true;
  return latestSummaryId && event.id === latestSummaryId;
}
function planTimelineTrim(events, { now = Date.now(), config } = {}) {
  const opts = resolveOptions(config);
  const all = (events || []).filter(Boolean);
  const cutoff = opts.timelineRetainDays * DAY_MS2;
  const summaries = all.filter((e) => e.eventType === "session_summary").sort((a, b) => (Number(b.occurredAt) || 0) - (Number(a.occurredAt) || 0));
  const latestSummaryId = summaries.length ? summaries[0].id : null;
  const byRecency = all.slice().sort((a, b) => (Number(b.occurredAt) || 0) - (Number(a.occurredAt) || 0));
  const keepIds = /* @__PURE__ */ new Set();
  for (const event of byRecency) {
    if (isTimelineAnchor(event, latestSummaryId)) {
      keepIds.add(event.id);
      continue;
    }
    if (keepIds.size >= opts.timelineMaxEvents) continue;
    if (ageMs(event, now) > cutoff) continue;
    keepIds.add(event.id);
  }
  const evict = all.filter((e) => !keepIds.has(e.id));
  return {
    evict,
    keep: all.filter((e) => keepIds.has(e.id)),
    stats: {
      total: all.length,
      evicted: evict.length,
      maxEvents: opts.timelineMaxEvents,
      retainDays: opts.timelineRetainDays,
      anchorsKept: all.filter((e) => isTimelineAnchor(e, latestSummaryId)).length
    }
  };
}
function archiveFileName(kind, now) {
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return "archive/" + kind + "-" + stamp + ".jsonl";
}
async function relocate({ fs, projectPath, kind, mainFile, plan, now }) {
  if (!plan.evict.length) return { ok: true, moved: 0, archivePath: null };
  const archiveRel = archiveFileName(kind, now);
  const wroteArchive = await writeJsonl(fs, brainPath2(projectPath, archiveRel), plan.evict);
  if (!wroteArchive) {
    return { ok: false, code: "E_ARCHIVE_WRITE_FAILED", moved: 0, archivePath: archiveRel };
  }
  const wroteMain = await writeJsonl(fs, brainPath2(projectPath, mainFile), plan.keep);
  if (!wroteMain) {
    return { ok: false, code: "E_MAIN_WRITE_FAILED", moved: 0, archivePath: archiveRel };
  }
  return { ok: true, moved: plan.evict.length, archivePath: archiveRel };
}
async function vacuumBrain({ fs, projectPath, config, now = Date.now(), dryRun = true } = {}) {
  const memoryFile = brainPath2(projectPath, "memory.jsonl");
  const timelineFile = brainPath2(projectPath, "timeline.jsonl");
  const [memoryRows, timelineRows] = await Promise.all([
    readJsonl(fs, memoryFile),
    readJsonl(fs, timelineFile)
  ]);
  const memoryPlan = planMemoryVacuum(memoryRows, { now, config });
  const timelinePlan = planTimelineTrim(timelineRows, { now, config });
  const plan = {
    memory: memoryPlan.stats,
    timeline: timelinePlan.stats,
    totalEvicted: memoryPlan.stats.evicted + timelinePlan.stats.evicted
  };
  if (dryRun) return { ok: true, dryRun: true, plan, archives: [] };
  if (plan.totalEvicted === 0) return { ok: true, dryRun: false, plan, archives: [], changed: false };
  return withWriteLock(brainTxKey(projectPath, "memory.jsonl"), async () => {
    const archives = [];
    const memoryMoved = await relocate({ fs, projectPath, kind: "memory", mainFile: "memory.jsonl", plan: memoryPlan, now });
    if (!memoryMoved.ok) return { ok: false, code: memoryMoved.code, plan, archives };
    if (memoryMoved.archivePath) archives.push({ kind: "memory", path: memoryMoved.archivePath, rows: memoryMoved.moved });
    const timelineMoved = await relocate({ fs, projectPath, kind: "timeline", mainFile: "timeline.jsonl", plan: timelinePlan, now });
    if (!timelineMoved.ok) return { ok: false, code: timelineMoved.code, plan, archives };
    if (timelineMoved.archivePath) archives.push({ kind: "timeline", path: timelineMoved.archivePath, rows: timelineMoved.moved });
    return { ok: true, dryRun: false, plan, archives, changed: true };
  });
}

// src/tools/dream.js
var baseOutputSchema6 = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    data: { type: "object", additionalProperties: true }
  }
};
function buildDreamTool({ fs, sandboxPolicy, getMemoryConfig }) {
  return defineTool9({
    name: "project_dream",
    description: "dsh-project-brain: \u6574\u7406\u8A18\u61B6\uFF08\u6B78\u6A94 changelog \u9AD4\u88C1\u3001\u8D85\u984D Core \u964D\u70BA dormant\u3001\u5831\u544A\u6A19\u984C\u76F8\u4F3C\u5EFA\u8B70\uFF09\u3002\u9810\u8A2D dryRun=true\uFF1BdryRun=false \u6642\u53EA\u61C9\u7528\u6B78\u6A94\u8207\u4F11\u7720\uFF0C\u7D55\u4E0D\u56E0\u6A19\u984C\u76F8\u4F3C\u522A\u9664\u3002mode=full \u984D\u5916\u505A\u4E00\u6B21 vacuum\uFF1A\u628A\u8D85\u671F\u7684\u6B78\u6A94\u8A18\u61B6\u8207\u820A\u6642\u9593\u7DDA\u642C\u5230 .project-brain/archive/\uFF0C\u4E3B\u6A94\u6848\u8B8A\u5C0F\u4F46\u8CC7\u6599\u4ECD\u53EF\u627E\u56DE\uFF1B\u6D3B\u8E8D\u8A18\u61B6\u3001\u7F6E\u9802\u3001\u8B49\u64DA\u93C8\u5F15\u7528\u8207\u7B2C\u4E00\u5C4F\u4F9D\u8CF4\u7684\u9328\u9EDE\u90FD\u4E0D\u6703\u88AB\u642C\u8D70\u3002",
    parameters: {
      mode: { type: "string", description: "light\uFF08\u9810\u8A2D\uFF0C\u53EA\u6574\u7406\u72C0\u614B\uFF09\u6216 full\uFF08\u984D\u5916 vacuum \u4E3B\u6A94\u6848\uFF09" },
      dryRun: { type: "boolean", description: "\u53EA\u8FD4\u56DE\u8A08\u5283\uFF08\u9810\u8A2D true\uFF09" },
      path: { type: "string", description: "\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u9810\u8A2D\u5F9E session cwd \u63A8\u65B7\uFF09" }
    },
    output: { schema: baseOutputSchema6, render: (_args, value) => renderDream(value) },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        const mode = args && args.mode || "light";
        const dryRun = args && args.dryRun !== false;
        if (mode !== "light" && mode !== "full") {
          return { ok: true, data: { mode, plannedActions: [], note: "mode \u50C5\u652F\u63F4 light / full\uFF08" + mode + " \u672A\u5BE6\u73FE\uFF09" } };
        }
        const memories = await readJsonl(fs, brainPath2(projectPath, "memory.jsonl"));
        const now = Date.now();
        const computed = housekeepMemories(memories, { now, pinnedIds: [] });
        const plannedActions = computed.actions || [];
        const archiveCount = plannedActions.filter((a) => a.action === "archive_rule").length;
        const evictCount = plannedActions.filter((a) => a.action === "evict_to_dormant").length;
        const suggestCount = plannedActions.filter((a) => a.action === "suggest_supersede").length;
        const memoryConfig = getMemoryConfig ? getMemoryConfig() : {};
        const vacuumPlanned = mode === "full" ? await vacuumBrain({ fs, projectPath, config: memoryConfig, now, dryRun: true }) : null;
        if (dryRun) {
          return {
            ok: true,
            data: {
              mode,
              dryRun: true,
              scannedMemories: memories.length,
              plannedActions,
              ...vacuumPlanned ? { vacuum: vacuumPlanned.plan } : {},
              summary: {
                archiveCandidates: archiveCount,
                evictCandidates: evictCount,
                suggestSupersede: suggestCount,
                mergeCandidates: 0,
                vacuumCandidates: vacuumPlanned ? vacuumPlanned.plan.totalEvicted : 0,
                estimatedMs: 0
              },
              note: mode === "full" ? "dryRun=true\uFF0C\u672A\u5BEB\u6A94\u6848\uFF1Bcommit \u6703\u61C9\u7528 archive_rule / evict_to_dormant\uFF0C\u4E26\u628A\u8D85\u671F\u6B7B\u884C\u642C\u5230 archive/\u3002" : "dryRun=true\uFF0C\u672A\u5BEB\u6A94\u6848\uFF1Bcommit \u53EA\u61C9\u7528 archive_rule / evict_to_dormant\uFF0C\u4E0D\u6703 Jaccard \u522A\u9664\u3002"
            }
          };
        }
        const persisted = await persistHousekeep(fs, projectPath, { now, pinnedIds: [], writeTimeline: computed.changed });
        if (!persisted.ok && persisted.code === "E_NOT_INITIALIZED") {
          return { ok: false, data: { error: { code: "E_NOT_INITIALIZED", message: "project not initialized" } } };
        }
        if (!persisted.ok && persisted.code === "E_WRITE_FAILED") {
          return { ok: false, data: { error: { code: "E_DREAM_WRITE_FAILED", message: "write memory.jsonl failed" } } };
        }
        let vacuum = null;
        if (mode === "full") {
          vacuum = await vacuumBrain({ fs, projectPath, config: memoryConfig, now, dryRun: false });
          if (!vacuum.ok) {
            return { ok: false, data: { error: { code: vacuum.code || "E_VACUUM_FAILED", message: "vacuum \u672A\u80FD\u5B8C\u6210\uFF0C\u4E3B\u6A94\u6848\u4FDD\u6301\u539F\u6A23" } } };
          }
        }
        try {
          if (exec && exec.ctx && typeof exec.ctx.emit === "function") {
            exec.ctx.emit("project_brain/preview.changed", { projectPath });
          }
        } catch (e) {
        }
        const vacuumNote = vacuum && vacuum.changed ? " vacuum \u642C\u8D70 " + vacuum.plan.totalEvicted + " \u884C\u5230 archive/\u3002" : mode === "full" ? " \u6C92\u6709\u8D85\u671F\u7684\u6B7B\u884C\u9700\u8981\u642C\u8D70\u3002" : "";
        return {
          ok: true,
          data: {
            mode,
            dryRun: false,
            scannedMemories: memories.length,
            plannedActions,
            ...vacuum ? { vacuum: vacuum.plan, archives: vacuum.archives } : {},
            committed: {
              beforeCount: memories.length,
              afterCount: (persisted.rows || memories).length,
              archived: archiveCount,
              evicted: evictCount,
              vacuumed: vacuum ? vacuum.plan.totalEvicted : 0
            },
            summary: {
              archiveCandidates: archiveCount,
              evictCandidates: evictCount,
              suggestSupersede: suggestCount,
              mergeCandidates: 0,
              vacuumCandidates: vacuum ? vacuum.plan.totalEvicted : 0,
              estimatedMs: Date.now() - now
            },
            note: (persisted.changed ? "housekeep \u5DF2\u5BEB memory.jsonl\uFF1B\u76F8\u4F3C\u6A19\u984C\u50C5\u4F5C\u70BA suggest_supersede\u3002" : "housekeep \u7121\u8B8A\u5316\uFF0C\u672A\u5BEB\u6A94\u6848\u3002") + vacuumNote
          }
        };
      } catch (e) {
        return { ok: false, data: { error: { code: "E_DREAM_FAILED", message: String(e && e.message || e) } } };
      }
    }
  });
}
function renderDream(value) {
  if (!value || typeof value !== "object") return [{ type: "text", text: "dsh-project-brain: dream FAILED - " + String(value) }];
  if (value.ok) {
    const d = value.data || {};
    const lines = [{ type: "text", text: `dsh-project-brain: dream (${d.mode}) \u2014 scanned ${d.scannedMemories} memories, dryRun=${d.dryRun}` }];
    if (d.summary) {
      lines.push({ type: "text", text: `  archive: ${d.summary.archiveCandidates || 0}, evict: ${d.summary.evictCandidates || 0}, suggest: ${d.summary.suggestSupersede || 0}` });
    }
    for (const a of (d.plannedActions || []).slice(0, 10)) {
      if (a.action === "archive_rule") lines.push({ type: "text", text: `  [archive_rule] ${a.id} (${a.title})` });
      else if (a.action === "evict_to_dormant") lines.push({ type: "text", text: `  [dormant] ${a.id} (${a.title})` });
      else if (a.action === "suggest_supersede") lines.push({ type: "text", text: `  [suggest_supersede] ${(a.titles || []).join(" \u2248 ")}` });
    }
    if (d.vacuum) {
      lines.push({ type: "text", text: `  vacuum: memory ${d.vacuum.memory.evicted}/${d.vacuum.memory.dead} dead rows, timeline ${d.vacuum.timeline.evicted}/${d.vacuum.timeline.total} events` });
    }
    for (const a of d.archives || []) {
      lines.push({ type: "text", text: `  [archived-to] ${a.path} (${a.rows} rows)` });
    }
    if (d.committed) {
      lines.push({ type: "text", text: `  \u2713 ${d.committed.beforeCount} -> ${d.committed.afterCount} memories` });
    }
    if (d.note) lines.push({ type: "text", text: `  note: ${d.note}` });
    return lines;
  }
  if (value.data && value.data.error) return [{ type: "text", text: "dsh-project-brain: dream FAILED - " + value.data.error.code + ": " + value.data.error.message }];
  return [{ type: "text", text: "dsh-project-brain: dream FAILED - " + JSON.stringify(value) }];
}

// src/tools/diff.js
init_brain_files();
import { defineTool as defineTool10 } from "@deepseek-ai/dsh-tools";

// src/host/diff/detector.js
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
function inflateGitObject(compressed) {
  try {
    const inflated = inflateSync(compressed);
    const nullIdx = inflated.indexOf(0);
    if (nullIdx < 0) return null;
    const header = inflated.slice(0, nullIdx).toString("binary");
    const spaceIdx = header.indexOf(" ");
    if (spaceIdx < 0) return null;
    const type = header.slice(0, spaceIdx);
    const content = inflated.slice(nullIdx + 1);
    return { type, content };
  } catch (e) {
    return null;
  }
}
function readLooseObject(gitDir, hash) {
  if (!/^[0-9a-f]{40}$/i.test(hash)) return null;
  const objPath = join(gitDir, "objects", hash.slice(0, 2), hash.slice(2));
  if (!existsSync(objPath)) return null;
  let compressed;
  try {
    compressed = readFileSync(objPath);
  } catch (e) {
    return null;
  }
  return inflateGitObject(compressed);
}
var OBJ_COMMIT = 1;
var OBJ_TREE = 2;
var OBJ_BLOB = 3;
var OBJ_TAG = 4;
var OBJ_OFS_DELTA = 6;
var OBJ_REF_DELTA = 7;
function readBE32(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function parseIdxV2(idxBytes) {
  if (idxBytes.length < 8 + 1024) return null;
  if (idxBytes[0] !== 255 || idxBytes[1] !== 116 || idxBytes[2] !== 79 || idxBytes[3] !== 99) return null;
  const version = readBE32(idxBytes, 4);
  if (version !== 2) return null;
  const n = readBE32(idxBytes, 8 + 255 * 4);
  const minSize = 1072 + n * 28;
  if (idxBytes.length < minSize) return null;
  const hashStart = 8 + 1024;
  const offsetStart = hashStart + n * 20 + n * 4;
  const map = /* @__PURE__ */ new Map();
  let skipped = 0;
  for (let i = 0; i < n; i++) {
    const hStart = hashStart + i * 20;
    const hash = idxBytes.slice(hStart, hStart + 20).toString("hex");
    const oStart = offsetStart + i * 4;
    const packOffset = readBE32(idxBytes, oStart);
    if ((packOffset & 2147483648) !== 0) {
      const largeOffsetStart = offsetStart + n * 4;
      skipped++;
      continue;
    }
    map.set(hash, packOffset);
  }
  return map;
}
var idxCache = /* @__PURE__ */ new Map();
function loadIdxMap(gitDir, idxPath) {
  const key = gitDir + "|" + idxPath;
  if (idxCache.has(key)) return idxCache.get(key);
  let bytes;
  try {
    bytes = readFileSync(idxPath);
  } catch (e) {
    idxCache.set(key, null);
    return null;
  }
  const map = parseIdxV2(bytes);
  idxCache.set(key, map);
  return map;
}
function readPackEntryHead(buf, offset) {
  let b = buf[offset];
  const t = b >> 4 & 7;
  let size = b & 15;
  let p = offset + 1;
  let shift = 4;
  while (b & 128) {
    if (p >= buf.length) return null;
    b = buf[p++];
    size |= (b & 127) << shift;
    shift += 7;
  }
  return { type: t, size, dataOffset: p };
}
function readOFSOffset(buf, offset) {
  let p = offset;
  let b = buf[p++];
  let ofs = b & 127;
  while (b & 128) {
    if (p >= buf.length) return null;
    b = buf[p++];
    ofs = ofs + 1 << 7 | b & 127;
  }
  return { offset: ofs, nextPos: p };
}
function applyDelta(base, deltaBytes) {
  let p = 0;
  function readVarint() {
    let result = 0;
    let shift = 0;
    while (p < deltaBytes.length) {
      const b = deltaBytes[p++];
      result |= (b & 127) << shift;
      if ((b & 128) === 0) return result;
      shift += 7;
      if (shift > 63) return -1;
    }
    return -1;
  }
  const baseLen = readVarint();
  const resultLen = readVarint();
  if (baseLen < 0 || resultLen < 0) return null;
  if (baseLen !== base.length) return null;
  const out = Buffer.alloc(resultLen);
  let outPos = 0;
  while (p < deltaBytes.length && outPos < resultLen) {
    const inst = deltaBytes[p++];
    if (inst === 0) return null;
    if (inst < 128) {
      if (p + inst > deltaBytes.length) return null;
      deltaBytes.copy(out, outPos, p, p + inst);
      p += inst;
      outPos += inst;
    } else {
      const szN = inst >> 4 & 7;
      const offN = inst & 15;
      let copyOff = 0;
      let copySz = 0;
      if (offN > 0 && offN <= 4) {
        for (let i = 0; i < offN; i++) {
          if (p >= deltaBytes.length) return null;
          copyOff = copyOff << 8 | deltaBytes[p++];
        }
      } else if (offN === 0) {
        copyOff = 65536;
      } else {
        return null;
      }
      if (szN > 0 && szN <= 3) {
        for (let i = 0; i < szN; i++) {
          if (p >= deltaBytes.length) return null;
          copySz = copySz << 8 | deltaBytes[p++];
        }
      } else if (szN === 0) {
        copySz = 65536;
      } else {
        return null;
      }
      if (copySz === 0) continue;
      if (copyOff >= base.length) return null;
      const avail = base.length - copyOff;
      const actualSz = Math.min(copySz, avail);
      base.copy(out, outPos, copyOff, copyOff + actualSz);
      outPos += actualSz;
    }
  }
  if (outPos !== resultLen) return null;
  return out;
}
var packCache = /* @__PURE__ */ new Map();
var gitDirCurrent = "";
function readPackEntryByOffset(packPath, packBytes, offset) {
  let cache2 = packCache.get(packPath);
  if (!cache2) {
    cache2 = /* @__PURE__ */ new Map();
    packCache.set(packPath, cache2);
  }
  if (cache2.has(offset)) return cache2.get(offset);
  const head = readPackEntryHead(packBytes, offset);
  if (!head) return null;
  const { type, dataOffset } = head;
  if (type === OBJ_OFS_DELTA) {
    const ofs = readOFSOffset(packBytes, dataOffset);
    if (!ofs) return null;
    const baseOffset = offset - ofs.offset;
    if (baseOffset <= 0) return null;
    const baseRes = readPackEntryByOffset(packPath, packBytes, baseOffset);
    if (!baseRes) return null;
    let delta;
    try {
      delta = inflateSync(packBytes.slice(ofs.nextPos));
    } catch (e) {
      return null;
    }
    if (!delta) return null;
    const result = applyDelta(baseRes.content, delta);
    if (!result) return null;
    const nullIdx = result.indexOf(0);
    if (nullIdx < 0) return null;
    const objType = result.slice(0, nullIdx).toString("binary").split(" ")[0];
    const ret = { type: objType, content: result.slice(nullIdx + 1) };
    cache2.set(offset, ret);
    return ret;
  } else if (type === OBJ_REF_DELTA) {
    const baseHash = packBytes.slice(dataOffset, dataOffset + 20).toString("hex");
    const dataStart = dataOffset + 20;
    let baseRes = readLooseObject(gitDirCurrent, baseHash);
    if (!baseRes) baseRes = readPackObjectInternal(gitDirCurrent, baseHash);
    if (!baseRes) return null;
    let delta;
    try {
      delta = inflateSync(packBytes.slice(dataStart));
    } catch (e) {
      return null;
    }
    if (!delta) return null;
    const result = applyDelta(baseRes.content, delta);
    if (!result) return null;
    const nullIdx = result.indexOf(0);
    if (nullIdx < 0) return null;
    const objType = result.slice(0, nullIdx).toString("binary").split(" ")[0];
    const ret = { type: objType, content: result.slice(nullIdx + 1) };
    cache2.set(offset, ret);
    return ret;
  } else if (type === OBJ_COMMIT || type === OBJ_TREE || type === OBJ_BLOB || type === OBJ_TAG) {
    let content;
    try {
      content = inflateSync(packBytes.slice(dataOffset));
    } catch (e) {
      return null;
    }
    if (!content) return null;
    const typeName = ["", "commit", "tree", "blob", "tag", "", "ofs_delta", "ref_delta"][type];
    const ret = { type: typeName, content };
    cache2.set(offset, ret);
    return ret;
  }
  return null;
}
function readPackObjectInternal(gitDir, hash) {
  const packDir = join(gitDir, "objects", "pack");
  if (!existsSync(packDir)) return null;
  let files;
  try {
    files = readdirSync(packDir);
  } catch (e) {
    return null;
  }
  for (const f of files) {
    if (!f.endsWith(".idx")) continue;
    const idxPath = join(packDir, f);
    const map = loadIdxMap(gitDir, idxPath);
    if (!map) continue;
    const off = map.get(hash);
    if (off === void 0) continue;
    const packFile = idxPath.replace(/\.idx$/, ".pack");
    if (!existsSync(packFile)) continue;
    let packBytes;
    try {
      packBytes = readFileSync(packFile);
    } catch (e) {
      continue;
    }
    return readPackEntryByOffset(packFile, packBytes, off);
  }
  return null;
}
function readPackObject(gitDir, hash) {
  gitDirCurrent = gitDir;
  return readPackObjectInternal(gitDir, hash);
}
function readGitObject(gitDir, hash) {
  const loose = readLooseObject(gitDir, hash);
  if (loose) return loose;
  return readPackObject(gitDir, hash);
}
function readHead(gitDir) {
  const headPath = join(gitDir, "HEAD");
  if (!existsSync(headPath)) return null;
  let head;
  try {
    head = readFileSync(headPath, "utf8").trim();
  } catch (e) {
    return null;
  }
  if (!head) return null;
  if (head.startsWith("ref: ")) {
    const refName = head.slice("ref: ".length);
    const refPath = join(gitDir, refName);
    let commit = null;
    if (existsSync(refPath)) {
      try {
        commit = readFileSync(refPath, "utf8").trim();
      } catch (e) {
      }
    }
    if (!commit) {
      const packedRefsPath = join(gitDir, "packed-refs");
      if (existsSync(packedRefsPath)) {
        try {
          const content = readFileSync(packedRefsPath, "utf8");
          for (const line of content.split(/\r?\n/)) {
            if (line.startsWith("#") || !line.trim()) continue;
            const m = line.match(/^([0-9a-f]{40})\s+(\S+)$/);
            if (m && m[2] === refName) {
              commit = m[1];
              break;
            }
          }
        } catch (e) {
        }
      }
    }
    if (!commit) return null;
    const branch = refName.startsWith("refs/heads/") ? refName.slice("refs/heads/".length) : refName;
    return { branch, commit };
  }
  return { branch: null, commit: head };
}
function parseTree(treeContent) {
  const entries = {};
  let i = 0;
  while (i < treeContent.length) {
    const spaceIdx = treeContent.indexOf(32, i);
    if (spaceIdx < 0) break;
    const mode = treeContent.slice(i, spaceIdx).toString("binary");
    i = spaceIdx + 1;
    const nullIdx = treeContent.indexOf(0, i);
    if (nullIdx < 0) break;
    const name2 = treeContent.slice(i, nullIdx).toString("utf8");
    i = nullIdx + 1;
    if (i + 20 > treeContent.length) break;
    const hashBuf = treeContent.slice(i, i + 20);
    const hash = hashBuf.toString("hex");
    i += 20;
    entries[name2] = { mode, hash };
  }
  return entries;
}
function collectTreeFiles(gitDir, treeHash, prefix = "") {
  const obj = readGitObject(gitDir, treeHash);
  if (!obj || obj.type !== "tree") return {};
  const tree = parseTree(obj.content);
  const files = {};
  for (const [name2, entry] of Object.entries(tree)) {
    const path7 = prefix ? `${prefix}/${name2}` : name2;
    if (entry.mode === "160000" || name2 === "node_modules" || name2 === ".git") {
      continue;
    }
    if (parseInt(entry.mode, 8) === 16384) {
      Object.assign(files, collectTreeFiles(gitDir, entry.hash, path7));
    } else {
      files[path7] = entry.hash;
    }
  }
  return files;
}
function readCommit(gitDir, commitHash) {
  const obj = readGitObject(gitDir, commitHash);
  if (!obj || obj.type !== "commit") return null;
  const text = obj.content.toString("utf8");
  const lines = text.split("\n");
  let tree = null;
  const parents = [];
  for (const line of lines) {
    if (line.startsWith("tree ")) tree = line.slice(5).trim();
    else if (line.startsWith("parent ")) parents.push(line.slice(7).trim());
    else if (line === "") break;
  }
  return tree ? { tree, parents } : null;
}
function readCommitFull(gitDir, commitHash) {
  const obj = readGitObject(gitDir, commitHash);
  if (!obj || obj.type !== "commit") return null;
  const text = obj.content.toString("utf8");
  const headerEnd = text.indexOf("\n\n");
  const headerText = headerEnd >= 0 ? text.slice(0, headerEnd) : text;
  const message = headerEnd >= 0 ? text.slice(headerEnd + 2).replace(/\s+$/, "") : "";
  let tree = null;
  const parents = [];
  let author = "", authorEmail = "", authorTimestamp = 0, authorTz = "";
  let committer = "", committerEmail = "", committerTimestamp = 0, committerTz = "";
  for (const line of headerText.split("\n")) {
    if (line.startsWith("tree ")) tree = line.slice(5).trim();
    else if (line.startsWith("parent ")) parents.push(line.slice(7).trim());
    else if (line.startsWith("author ")) {
      const m = line.match(/^author\s+(.+?)\s+<([^>]+)>\s+(\d+)\s+([+-]\d{4})$/);
      if (m) {
        author = m[1];
        authorEmail = m[2];
        authorTimestamp = Number(m[3]);
        authorTz = m[4];
      }
    } else if (line.startsWith("committer ")) {
      const m = line.match(/^committer\s+(.+?)\s+<([^>]+)>\s+(\d+)\s+([+-]\d{4})$/);
      if (m) {
        committer = m[1];
        committerEmail = m[2];
        committerTimestamp = Number(m[3]);
        committerTz = m[4];
      }
    }
  }
  if (!tree) return null;
  return {
    hash: commitHash,
    shortHash: commitHash.substring(0, 7),
    tree,
    parents,
    author,
    authorEmail,
    authorTimestamp,
    authorTz,
    committer,
    committerEmail,
    committerTimestamp,
    committerTz,
    message,
    subject: message.split("\n")[0] || ""
  };
}
async function detectChanges({ projectPath, since = "1 day ago" }) {
  const gitDir = join(projectPath, ".git");
  if (!existsSync(gitDir)) {
    return { files: [], stat: "", commits: [], error: "not a git repository (no .git directory)" };
  }
  let sinceN = 1;
  const m = String(since).match(/^(\d+)/);
  if (m) sinceN = Math.max(1, Math.min(100, parseInt(m[1], 10)));
  const head = readHead(gitDir);
  if (!head || !head.commit) {
    return { files: [], stat: "", commits: [], error: "cannot read HEAD" };
  }
  if (!/^[0-9a-f]{40}$/i.test(head.commit)) {
    return { files: [], stat: "", commits: [], error: "HEAD is not a valid commit hash: " + head.commit };
  }
  const curCommit = readCommit(gitDir, head.commit);
  if (!curCommit) {
    return {
      files: [],
      stat: "",
      commits: [],
      error: "cannot read current commit " + head.commit + "\uFF08commit object \u53EF\u80FD\u5728 .pack \u4E2D\uFF0C\u9700 pack \u652F\u63F4\uFF0C\u6216 git repack -d \u89E3\u958B loose object\uFF09"
    };
  }
  const curFiles = collectTreeFiles(gitDir, curCommit.tree);
  let parentHash = head.commit;
  let parentCommit = null;
  for (let i = 0; i < sinceN; i++) {
    const cur = readCommit(gitDir, parentHash);
    if (!cur || !cur.parents || cur.parents.length === 0) {
      break;
    }
    parentHash = cur.parents[0];
  }
  if (parentHash !== head.commit) {
    parentCommit = readCommit(gitDir, parentHash);
  }
  const parentFiles = parentCommit ? collectTreeFiles(gitDir, parentCommit.tree) : {};
  const files = [];
  for (const [path7, hash] of Object.entries(curFiles)) {
    if (!parentFiles[path7]) {
      files.push({ path: path7, type: "added", hash });
    } else if (parentFiles[path7] !== hash) {
      files.push({ path: path7, type: "modified", hash });
    }
  }
  for (const path7 of Object.keys(parentFiles)) {
    if (!curFiles[path7]) {
      files.push({ path: path7, type: "deleted" });
    }
  }
  const commits = [head.commit];
  let p = curCommit.parents[0];
  let depth = 1;
  while (p && depth < sinceN) {
    commits.push(p);
    const pc = readCommit(gitDir, p);
    p = pc ? pc.parents[0] : null;
    depth++;
  }
  return {
    files: files.map((f) => f.path),
    // 簡化為路徑陣列（相容 v0.4.1 smoke）
    changes: files,
    // 詳細 change 列表（new field）
    stat: files.length === 0 ? "" : ` ${files.filter((f) => f.type === "added").length} files added, ${files.filter((f) => f.type === "modified").length} modified, ${files.filter((f) => f.type === "deleted").length} deleted`,
    commits,
    since: "commit+" + sinceN,
    scannedAt: Date.now()
  };
}
function buildDiffPrompt({ changes, projectPath, maxChars = 4e3 }) {
  const fileList = (changes.changes || changes.files || []).map(
    (f) => typeof f === "string" ? `  - ${f}` : `  - [${f.type}] ${f.path}`
  ).join("\n") || "  (\u7121\u6A94\u6848\u8B8A\u66F4)";
  const commitList = (changes.commits || []).map((c) => `  - ${c}`).join("\n") || "  (\u7121 commit \u8A18\u9304)";
  const prompt = `\u4F60\u662F\u4E00\u500B\u5C08\u6848\u67B6\u69CB\u5206\u6790\u5E2B\u3002\u8ACB\u57FA\u65BC\u4EE5\u4E0B git diff \u8CC7\u8A0A\uFF0C\u8F38\u51FA JSON \u683C\u5F0F\u7684\u67B6\u69CB\u8B8A\u66F4\u5206\u6790\u3002

\u5C08\u6848\u8DEF\u5F91: ${projectPath}
\u6383\u63CF\u6642\u9593\u8996\u7A97: since=${changes.since || "commit+1"}

\u8B8A\u66F4\u6A94\u6848:
${fileList}

\u6700\u8FD1 commit:
${commitList}

\u8B8A\u66F4\u7D71\u8A08:
${changes.stat ? changes.stat : "(\u7121\u7D71\u8A08)"}

\u8ACB\u8F38\u51FA JSON\uFF08\u4E0D\u8981 markdown code block\uFF0C\u4E0D\u8981\u5176\u4ED6\u6587\u5B57\uFF09\uFF1A
{
  "changes": [{"file": "\u76F8\u5C0D\u8DEF\u5F91", "type": "added|modified|deleted", "summary": "\u4E00\u53E5\u8A71\u63CF\u8FF0"}],
  "architectureMemory": {
    "title": "\u67B6\u69CB\u8B8A\u66F4\u4E00\u53E5\u8A71\u6A19\u984C\uFF08<=50 \u5B57\uFF09",
    "content": "what + why\uFF08200-400 \u5B57\uFF0C\u8AAA\u660E\u67B6\u69CB\u5C64\u9762\u7684\u8B8A\u5316\uFF09"
  }
}

\u8981\u6C42\uFF1A
- \u95DC\u6CE8\u67B6\u69CB\u5C64\u9762\u8B8A\u5316\uFF08\u65B0\u6A21\u7D44\u3001\u65B0\u4F9D\u8CF4\u3001\u65B0\u6A21\u5F0F\uFF09\uFF0C\u4E0D\u8981\u9010\u6A94\u6848\u63CF\u8FF0
- \u5982\u679C\u53EA\u662F\u6587\u4EF6\u4FEE\u6539\u6216\u96DC\u9805\u8B8A\u66F4\uFF0CarchitectureMemory.title \u5BEB "\u975E\u67B6\u69CB\u8B8A\u66F4\uFF08\u96DC\u9805\uFF09"
- content \u7528\u4E2D\u6587`;
  return prompt.slice(0, maxChars);
}

// src/host/integrations/llm.js
var MOCK_RESPONSE_TEXT = JSON.stringify({
  changes: [
    { file: "src/auth/login.ts", type: "modified", summary: "\u8A8D\u8B49\u908F\u8F2F\u8ABF\u6574" },
    { file: "src/auth/oauth.ts", type: "added", summary: "\u65B0\u589E OAuth2 \u63A5\u5165" }
  ],
  architectureMemory: {
    title: "\u67B6\u69CB\u8B8A\u66F4\uFF1A\u5F9E session \u8A8D\u8B49\u9077\u79FB\u5230 OAuth2",
    content: "\u672C\u6B21\u91CD\u69CB\u5C07 auth \u6A21\u7D44\u5F9E session-based \u8A8D\u8B49\u9077\u79FB\u5230 OAuth2\uFF0C\u65B0\u589E oauth.ts \u6A21\u7D44\u5C01\u88DD OAuth2 client\uFF0C\u8655\u7406 token \u91CD\u65B0\u6574\u7406 + \u56DE\u64A5\u8DEF\u7531\u3002"
  },
  commit: "git@HEAD",
  note: "[MOCK_LLM] DSH llm service \u4E0D\u53EF\u7528\u6216\u672A\u914D\u7F6E API key\uFF0C\u8FD4\u56DE mock \u8CC7\u6599\u3002\u8ACB\u914D\u7F6E llmApiUrl/llmApiKey/llmModel \u5F15\u6578\u6216 DSH_LLM_API_URL/KEY/MODEL env\u3002"
});
async function mockFetchLLM({ prompt }) {
  const preview = prompt.slice(0, 200).replace(/"/g, '\\"');
  return MOCK_RESPONSE_TEXT.replace(
    '"[MOCK_LLM] DSH llm service \u4E0D\u53EF\u7528\u6216\u672A\u914D\u7F6E API key\uFF0C\u8FD4\u56DE mock \u8CC7\u6599\u3002\u8ACB\u914D\u7F6E llmApiUrl/llmApiKey/llmModel \u5F15\u6578\u6216 DSH_LLM_API_URL/KEY/MODEL env\u3002"',
    `"[MOCK_LLM] \u4F7F\u7528\u8005 prompt \u524D 200 \u5B57: ${preview}\u3002\u8ACB\u914D\u7F6E llmApiUrl/llmApiKey/llmModel \u5F15\u6578\u6216 DSH_LLM_API_URL/KEY/MODEL env\u3002"`
  );
}
function detectProtocol(apiUrl) {
  if (!apiUrl) return "openai";
  if (/anthropic/i.test(apiUrl)) return "anthropic";
  return "openai";
}
async function fetchAnthropic({ prompt, maxTokens, apiUrl, apiKey, model, signal }) {
  if (!apiUrl || !apiKey) throw new Error("apiUrl/apiKey not configured");
  const url = apiUrl.replace(/\/$/, "") + "/v1/messages";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: model || "claude-3-5-sonnet-20240620",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens || 2e3
    }),
    signal
  });
  if (!res.ok) {
    const text2 = await res.text();
    throw new Error("LLM API error " + res.status + ": " + text2.slice(0, 200));
  }
  const data = await res.json();
  const text = data && data.content && data.content[0] && data.content[0].text;
  if (!text) throw new Error("LLM API returned empty content: " + JSON.stringify(data).slice(0, 200));
  return String(text);
}
async function fetchOpenAI({ prompt, maxTokens, apiUrl, apiKey, model, signal }) {
  if (!apiUrl || !apiKey) throw new Error("apiUrl/apiKey not configured");
  const url = apiUrl.replace(/\/$/, "") + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages: [
        { role: "user", content: prompt }
      ],
      max_tokens: maxTokens || 2e3,
      stream: false
    }),
    signal
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error("LLM API error " + res.status + ": " + text.slice(0, 200));
  }
  const data = await res.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error("LLM API returned empty content: " + JSON.stringify(data).slice(0, 200));
  return String(content);
}
async function realFetchLLM({ prompt, maxTokens, apiUrl, apiKey, model, signal }) {
  const protocol = detectProtocol(apiUrl);
  if (protocol === "anthropic") {
    return await fetchAnthropic({ prompt, maxTokens, apiUrl, apiKey, model, signal });
  }
  return await fetchOpenAI({ prompt, maxTokens, apiUrl, apiKey, model, signal });
}
async function callLLMWithFallback({ prompt, maxTokens, apiUrl, apiKey, model, signal } = {}) {
  if (apiUrl && apiKey) {
    try {
      return await realFetchLLM({ prompt, maxTokens, apiUrl, apiKey, model, signal });
    } catch (e) {
      return await mockFetchLLM({ prompt });
    }
  }
  return await mockFetchLLM({ prompt });
}
function parseLLMArchitectureResponse(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.architectureMemory && parsed.architectureMemory.title) {
      return parsed;
    }
  } catch (e) {
  }
  return {
    changes: [],
    architectureMemory: {
      title: "\u67B6\u69CB\u8B8A\u66F4\uFF08\u672A\u7D50\u69CB\u5316\uFF09",
      content: text.slice(0, 1e3)
    },
    note: "[parse-fallback] LLM \u8F38\u51FA\u975E JSON\uFF0C\u5DF2\u5305\u6210 fallback"
  };
}

// src/tools/diff.js
function buildDiffTool({ fs, sandboxPolicy }) {
  return defineTool10({
    name: "project_diff",
    description: "dsh-project-brain: \u8B80\u53D6 git diff \u4E26\u7528 LLM \u5206\u6790\u67B6\u69CB\u8B8A\u5316\u3002 dryRun \u9810\u8A2D true\uFF08\u53EA\u6383\u63CF\u4E0D\u5BEB\u8A18\u61B6\uFF09\uFF1BdryRun=false \u6642\u50C5\u771F\u5BE6 LLM \u8F38\u51FA\u53EF\u7D93 admit \u5BEB\u5165 architecture \u8A18\u61B6\u3002 mock / fallback \u7981\u6B62\u5BEB\u5165\u3002",
    parameters: {
      path: { type: "string", description: "\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u7D55\u5C0D\u8DEF\u5F91\uFF0C\u5FC5\u50B3\uFF09" },
      since: { type: "string", description: "git diff \u8996\u7A97\uFF08commit \u6578\uFF0C\u9810\u8A2D 1\uFF09" },
      maxTokens: { type: "number", description: "LLM \u8F38\u51FA token \u9810\u7B97\uFF08\u9810\u8A2D 2000\uFF09" },
      dryRun: { type: "boolean", description: "\u53EA\u6383\u63CF\u4E0D\u5BEB memory\uFF08\u9810\u8A2D true\uFF09" },
      llmApiUrl: { type: "string", description: "LLM API endpoint\uFF08\u53EF\u9078\uFF09" },
      llmApiKey: { type: "string", description: "LLM API key\uFF08\u53EF\u9078\uFF09" },
      llmModel: { type: "string", description: "LLM \u6A21\u578B\u540D\uFF08\u9810\u8A2D gpt-4o-mini\uFF09" }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean" },
          data: { type: "object", additionalProperties: true },
          code: { type: "string" },
          message: { type: "string" }
        }
      },
      render: (_args, value) => renderDiff(value)
    },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        const since = args && typeof args.since === "string" && args.since.trim() ? args.since.trim() : "1";
        const maxTokens = args && typeof args.maxTokens === "number" ? args.maxTokens : 2e3;
        const dryRun = !(args && args.dryRun === false);
        const llmApiUrl = args && typeof args.llmApiUrl === "string" && args.llmApiUrl.trim() ? args.llmApiUrl.trim() : typeof process !== "undefined" && process.env && process.env.DSH_LLM_API_URL || null;
        const llmApiKey = args && typeof args.llmApiKey === "string" && args.llmApiKey.trim() ? args.llmApiKey.trim() : typeof process !== "undefined" && process.env && process.env.DSH_LLM_API_KEY || null;
        const llmModel = args && typeof args.llmModel === "string" && args.llmModel.trim() ? args.llmModel.trim() : typeof process !== "undefined" && process.env && process.env.DSH_LLM_MODEL || "gpt-4o-mini";
        const changes = await detectChanges({ projectPath, since });
        if (changes.error) {
          return { ok: false, code: "E_DIFF_SCAN_FAILED", message: changes.error };
        }
        if (!changes.files.length && !changes.changes.length) {
          return { ok: true, data: { changes, llmSkipped: "no changes detected", note: "\u7121\u7A0B\u5F0F\u78BC\u8B8A\u66F4\uFF0C\u7121\u9700\u8ABF LLM", dryRun } };
        }
        const prompt = buildDiffPrompt({ changes, projectPath });
        const rawText = await callLLMWithFallback({
          prompt,
          maxTokens,
          apiUrl: llmApiUrl,
          apiKey: llmApiKey,
          model: llmModel
        });
        const parsed = parseLLMArchitectureResponse(rawText);
        const mock = isMockLlmPayload(rawText) || isMockLlmPayload(parsed && parsed.note);
        if (!dryRun && mock) {
          return {
            ok: false,
            code: "E_ADMIT_MOCK_FORBIDDEN",
            message: "mock / fallback LLM \u8F38\u51FA\u7981\u6B62\u5BEB\u5165 memory.jsonl",
            data: {
              changes: {
                files: changes.files || [],
                changes: changes.changes || [],
                stat: changes.stat,
                commits: changes.commits,
                since: changes.since
              },
              architectureMemory: parsed.architectureMemory,
              note: parsed.note || "[MOCK_LLM]",
              dryRun
            }
          };
        }
        if (!dryRun && parsed.architectureMemory && parsed.architectureMemory.title) {
          const now = Date.now();
          const admitted = await admitMemory({
            fs,
            projectPath,
            candidate: {
              type: "architecture",
              title: parsed.architectureMemory.title,
              content: parsed.architectureMemory.content || "",
              importance: 0.75,
              confidence: 0.7,
              relatedFiles: (parsed.changes || []).map((c) => c.file).filter(Boolean).slice(0, 20),
              source: { kind: "project_diff", model: llmModel, since }
            },
            channel: "automatic",
            now,
            llmConfirm: { admit: true, type: "architecture" }
          });
          if (!admitted.ok) {
            return {
              ok: false,
              code: admitted.code || "E_ADMIT_REJECTED",
              message: admitted.message || admitted.reason || "architecture memory not admitted",
              data: { architectureMemory: parsed.architectureMemory, dryRun }
            };
          }
          if (admitted.action === "insert") {
            await appendJsonl(fs, brainPath2(projectPath, "timeline.jsonl"), {
              id: "evt-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
              title: "project_diff \u5B8C\u6210\uFF08" + (parsed.changes ? parsed.changes.length : 0) + " \u6A94\u6848\u8B8A\u5316\uFF09",
              eventType: "diff",
              occurredAt: Date.now(),
              detail: "since=" + since + " files=" + (changes.files ? changes.files.length : 0)
            });
          }
        }
        return {
          ok: true,
          data: {
            changes: {
              files: changes.files || [],
              changes: changes.changes || [],
              stat: changes.stat,
              commits: changes.commits,
              since: changes.since
            },
            architectureMemory: parsed.architectureMemory,
            changeDetails: parsed.changes || [],
            dryRun,
            note: parsed.note || "dr=" + (dryRun ? "true" : "false") + " llm=" + (mock ? "mock" : "ok")
          }
        };
      } catch (e) {
        return { ok: false, code: "E_DIFF_FAILED", message: String(e && e.message || e) };
      }
    }
  });
}
function renderDiff(value) {
  if (!value || typeof value !== "object") return [{ type: "text", text: "dsh-project-brain: project_diff FAILED - " + String(value) }];
  if (!value.ok) {
    return [{ type: "text", text: "dsh-project-brain: project_diff FAILED - " + (value.code || "") + ": " + (value.message || "") }];
  }
  const d = value.data || {};
  const lines = [{ type: "text", text: "dsh-project-brain: project_diff \u5B8C\u6210" }];
  if (d.changes) {
    const files = d.changes.files || [];
    const commits = d.changes.commits || [];
    const detailed = d.changes.changes || [];
    lines.push({ type: "text", text: "  \u8B8A\u66F4\u6A94\u6848: " + files.length + " \u500B / commits: " + commits.length + " \u689D / detailed: " + detailed.length + " \u689D" });
    if (d.changes.since) lines.push({ type: "text", text: "  \u6642\u9593\u8996\u7A97: " + d.changes.since });
  }
  if (d.architectureMemory && d.architectureMemory.title) {
    lines.push({ type: "text", text: "  \u2713 architecture memory: " + d.architectureMemory.title });
  }
  if (d.changeDetails && d.changeDetails.length) {
    for (const c of d.changeDetails.slice(0, 5)) {
      lines.push({ type: "text", text: "    [" + (c.type || "?") + "] " + (c.file || "?") + " \u2014 " + (c.summary || "") });
    }
  }
  if (d.note) lines.push({ type: "text", text: "  note: " + d.note });
  if (d.dryRun) lines.push({ type: "text", text: "  dryRun=true\uFF0C\u672A\u5BEB memory" });
  return lines;
}

// src/tools/export.js
import { defineTool as defineTool11 } from "@deepseek-ai/dsh-tools";
import path3 from "node:path";
init_brain_files();
init_bundle();
var baseOutputSchema7 = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
    code: { type: "string" },
    message: { type: "string" }
  }
};
function emitPreviewChanged5(exec, projectPath) {
  try {
    const executor = exec && exec.ctx || null;
    if (executor && typeof executor.emit === "function") {
      executor.emit("project_brain/preview.changed", { projectPath });
    }
  } catch (e) {
  }
}
function buildProjectExportTool({ fs, sandboxPolicy, pluginVersion }) {
  return defineTool11({
    name: "project_export",
    description: "dsh-project-brain: \u628A\u7576\u524D\u5C08\u6848\u7684 .project-brain/ \u6253\u6210 zip bundle\uFF08\u542B manifest.json + checksum\uFF09\u3002\u7528\u65BC\u8DE8\u6A5F\u5668\u540C\u6B65\uFF1A\u5728\u6E90\u6A5F\u5668\u547C\u53EB \u2192 \u628A bundle \u6A94\u6848\u50B3\u5230\u76EE\u6A19\u6A5F\u5668 \u2192 \u5728\u76EE\u6A19\u6A5F\u5668\u8ABF project_import \u9084\u539F\u3002\u6703\u5099\u4EFD timeline + cache\uFF1B\u82E5\u4E0D\u9700\u8981 cache \u53EF\u50B3 includeCache=false \u7E2E\u9AD4\u7A4D\u3002",
    parameters: {
      path: { type: "string", description: "\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u9810\u8A2D\u5F9E session cwd \u63A8\u65B7\uFF09" },
      outputPath: { type: "string", description: "bundle \u8F38\u51FA\u7D55\u5C0D\u8DEF\u5F91\uFF08\u53EF\u9078\uFF1B\u9810\u8A2D <projectRoot>/dist-backups/dsh-brain-<name>-<ts>.zip\uFF09" },
      includeCache: { type: "boolean", description: "\u662F\u5426\u5305\u542B cache/ \u76EE\u9304\uFF08\u9810\u8A2D true\uFF09" }
    },
    output: { schema: baseOutputSchema7, render: renderExport },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        if (projectPath === ".") {
          return { ok: false, code: "E_NO_PATH", message: "\u7121\u6CD5\u89E3\u6790\u5C08\u6848\u8DEF\u5F91\uFF08\u8ACB\u986F\u5F0F\u50B3 path\uFF09" };
        }
        const includeCache = !!(args && args.includeCache !== false);
        const projectMeta = await readJson(fs, brainPath2(projectPath, "project.json"));
        if (!projectMeta || projectMeta.__error) {
          return { ok: false, code: "E_BRAIN_NOT_FOUND", message: "\u5C08\u6848\u672A\u521D\u59CB\u5316\uFF0C\u8ACB\u5148\u547C\u53EB project_init" };
        }
        let outputPath = args && args.outputPath;
        if (!outputPath) {
          const fname = defaultBundleName(projectMeta);
          outputPath = path3.join(projectPath, "dist-backups", fname);
        }
        const startMs = Date.now();
        const written = await writeBundleFile({
          projectPath,
          outputPath,
          pluginVersion: pluginVersion || "1.3.1",
          includeCache
        });
        try {
          const now = Date.now();
          const event = {
            id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
            title: "\u532F\u51FA bundle\uFF1A" + path3.basename(outputPath),
            eventType: "export",
            occurredAt: now,
            payload: {
              bundlePath: outputPath,
              sizeBytes: written.sizeBytes,
              fileCount: written.fileCount,
              schemaVersion: written.manifest.schemaVersion
            }
          };
          const { appendJsonl: appendJsonl2 } = await Promise.resolve().then(() => (init_brain_files(), brain_files_exports));
          await appendJsonl2(fs, brainPath2(projectPath, "timeline.jsonl"), event);
        } catch (e) {
        }
        emitPreviewChanged5(exec, projectPath);
        return {
          ok: true,
          data: {
            bundlePath: written.bundlePath,
            bundleName: written.bundleName,
            defaultDirPath: written.defaultDirPath,
            sizeBytes: written.sizeBytes,
            fileCount: written.fileCount,
            durationMs: Date.now() - startMs,
            manifest: {
              schemaVersion: written.manifest.schemaVersion,
              pluginVersion: written.manifest.pluginVersion,
              exportedAt: written.manifest.exportedAt,
              sourceProject: written.manifest.sourceProject
            },
            message: "\u532F\u51FA\u6210\u529F\u3002\u4E0B\u4E00\u6B65\uFF1A\u628A bundle \u6A94\u6848\u50B3\u5230\u76EE\u6A19\u6A5F\u5668\uFF0C\u547C\u53EB project_import \u9084\u539F\u3002"
          }
        };
      } catch (e) {
        return {
          ok: false,
          code: e && e.code || "E_EXPORT_FAILED",
          message: String(e && e.message || e)
        };
      }
    }
  });
}
function renderExport(_args, value) {
  if (!value || typeof value !== "object") {
    return [{ type: "text", text: "dsh-project-brain: export FAILED - " + String(value) }];
  }
  if (value.ok) {
    const d = value.data || {};
    const sizeMB = (d.sizeBytes / (1024 * 1024)).toFixed(2);
    return [
      { type: "text", text: "dsh-project-brain: export OK" },
      { type: "text", text: "  bundle: " + d.bundlePath },
      { type: "text", text: "  size: " + sizeMB + " MB (" + d.fileCount + " files, " + d.durationMs + "ms)" },
      { type: "text", text: "  source: " + (d.manifest && d.manifest.sourceProject && d.manifest.sourceProject.rootPath) },
      { type: "text", text: "  schemaVersion: " + (d.manifest && d.manifest.schemaVersion) }
    ];
  }
  return [{ type: "text", text: "dsh-project-brain: export FAILED - " + (value.code || "") + ": " + (value.message || "") }];
}

// src/tools/import.js
import { defineTool as defineTool12 } from "@deepseek-ai/dsh-tools";
import { promises as fsp3 } from "node:fs";
import path4 from "node:path";
init_brain_files();
init_bundle();
init_confirm_tokens();
var baseOutputSchema8 = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
    code: { type: "string" },
    message: { type: "string" }
  }
};
function emitPreviewChanged6(exec, projectPath) {
  try {
    const executor = exec && exec.ctx || null;
    if (executor && typeof executor.emit === "function") {
      executor.emit("project_brain/preview.changed", { projectPath });
    }
  } catch (e) {
  }
}
function buildProjectImportTool({ fs, sandboxPolicy }) {
  return defineTool12({
    name: "project_import",
    description: "dsh-project-brain: \u5F9E bundle zip \u9084\u539F .project-brain/\u3002**\u5169\u6B65\u6A5F\u5236**\uFF1A\u5148 dryRun=true \u770B\u9810\u89BD\uFF0C\u628A\u8FD4\u56DE\u7684 confirmToken \u50B3\u7D66 dryRun=false \u624D\u5BE6\u969B\u5BEB\u5165\uFF1B5 \u5206\u9418\u5167\u5FC5\u9808\u5B8C\u6210\u3002\u532F\u5165\u6703\u5099\u4EFD\u7576\u524D\u8166 \u2192 \u89E3\u58D3 \u2192 \u6539\u5BEB rootPath \u2192 \u89F8\u767C rescan\u3002\u5931\u6557\u56DE\u6EFE\u53EF\u8ABF project_rollback_backup\u3002",
    parameters: {
      path: { type: "string", description: "\u76EE\u7684\u5730\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u9810\u8A2D\u5F9E session cwd \u63A8\u65B7\uFF09" },
      bundlePath: { type: "string", description: "bundle zip \u6A94\u6848\u7D55\u5C0D\u8DEF\u5F91\uFF08\u5FC5\u586B\uFF09" },
      dryRun: { type: "boolean", description: "true=\u50C5\u9810\u89BD\uFF0Cfalse=\u5BE6\u969B\u5BEB\u5165\uFF08\u9810\u8A2D false\uFF09" },
      confirmToken: { type: "string", description: "dryRun \u8FD4\u56DE\u7684 token\uFF1BdryRun=false \u6642\u5FC5\u586B" }
    },
    output: { schema: baseOutputSchema8, render: renderImport },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        if (projectPath === ".") {
          return { ok: false, code: "E_NO_PATH", message: "\u7121\u6CD5\u89E3\u6790\u5C08\u6848\u8DEF\u5F91\uFF08\u8ACB\u986F\u5F0F\u50B3 path\uFF09" };
        }
        const bundlePath = args && args.bundlePath;
        if (!bundlePath) {
          return { ok: false, code: "E_BUNDLE_PATH_REQUIRED", message: "bundlePath \u5FC5\u586B" };
        }
        try {
          await fsp3.access(bundlePath);
        } catch (e) {
          return { ok: false, code: "E_BUNDLE_NOT_FOUND", message: "bundle \u6A94\u6848\u4E0D\u5B58\u5728\uFF1A" + bundlePath };
        }
        const isDryRun = !!(args && args.dryRun);
        const tokenStore = getTokenStore();
        if (isDryRun) {
          let preview;
          try {
            preview = await previewBundle({ bundlePath, destProjectPath: projectPath });
          } catch (e) {
            return {
              ok: false,
              code: e && e.code || "E_BUNDLE_INVALID",
              message: String(e && e.message || e),
              data: { detail: e && e.detail }
            };
          }
          const confirmToken = tokenStore.issue({
            kind: "import",
            payload: { bundlePath, destProjectPath: projectPath, preview }
          });
          return {
            ok: true,
            data: {
              mode: "preview",
              bundlePath,
              manifest: {
                schemaVersion: preview.manifest.schemaVersion,
                pluginVersion: preview.manifest.pluginVersion,
                exportedAt: preview.manifest.exportedAt,
                sourceProject: preview.manifest.sourceProject
              },
              impact: {
                currentBrainExists: preview.currentBrain.exists,
                currentProjectId: preview.currentBrain.projectId,
                currentMemories: preview.currentBrain.memCount,
                currentTodos: preview.currentBrain.todoCount,
                currentTimeline: preview.currentBrain.timelineCount,
                currentArchitecture: preview.currentBrain.archExists,
                incomingMemories: preview.incoming.memCount,
                incomingTodos: preview.incoming.todoCount,
                incomingTimeline: preview.incoming.timelineCount,
                incomingProjectId: preview.incoming.projectId,
                backupWillCreateAt: preview.backupWillCreateAt,
                rootPathRewrite: preview.rootPathRewrite
              },
              confirmToken,
              warning: preview.currentBrain.exists ? "\u532F\u5165\u5C07\u8986\u84CB\u7576\u524D\u8166\uFF0C\u820A\u8166\u6703\u81EA\u52D5\u5099\u4EFD\u5230 " + preview.backupWillCreateAt : "\u9019\u662F\u8A72\u5C08\u6848\u9996\u6B21\u532F\u5165\uFF0C\u7121\u5099\u4EFD\u53EF\u5EFA\u3002"
            }
          };
        }
        const token = args && args.confirmToken;
        if (!token) {
          return { ok: false, code: "E_CONFIRM_TOKEN_REQUIRED", message: "dryRun=false \u5FC5\u9808\u50B3 confirmToken\uFF08\u5148 dryRun=true \u62FF\u5230 token\uFF09" };
        }
        const payload = tokenStore.consume(token, { kind: "import" });
        if (!payload) {
          return { ok: false, code: "E_CONFIRM_TOKEN_MISMATCH", message: "confirmToken \u7121\u6548\u3001\u5DF2\u904E\u671F\u6216\u578B\u5225\u4E0D\u5339\u914D\uFF08\u8ACB\u91CD\u65B0 dryRun\uFF09" };
        }
        if (payload.bundlePath !== bundlePath || payload.destProjectPath !== projectPath) {
          return { ok: false, code: "E_CONFIRM_TOKEN_MISMATCH", message: "confirmToken \u8207\u7576\u524D\u5F15\u6578\u4E0D\u5339\u914D\uFF08\u8ACB\u91CD\u65B0 dryRun\uFF09" };
        }
        let applied;
        try {
          applied = await applyBundle({
            bundlePath,
            destProjectPath: projectPath,
            triggerRescan: false
            // 由呼叫方排程
          });
        } catch (e) {
          return {
            ok: false,
            code: e && e.code || "E_IMPORT_FAILED",
            message: String(e && e.message || e)
          };
        }
        try {
          const now = Date.now();
          const event = {
            id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
            title: applied.backupPath ? "\u532F\u5165 bundle\uFF08\u5DF2\u5099\u4EFD\u820A\u8166\u5230 " + path4.basename(applied.backupPath) + "\uFF09" : "\u532F\u5165 bundle\uFF08\u9996\u6B21\uFF09",
            eventType: "import",
            occurredAt: now,
            payload: {
              bundlePath,
              backupPath: applied.backupPath,
              sourceManifest: applied.sourceManifest
            }
          };
          await appendJsonl(fs, brainPath(projectPath, "timeline.jsonl"), event);
        } catch (e) {
        }
        emitPreviewChanged6(exec, projectPath);
        return {
          ok: true,
          data: {
            mode: "applied",
            bundlePath,
            backupPath: applied.backupPath,
            rescanTriggered: false,
            // 留給 RPC 層排程
            fileCount: applied.fileCount,
            sourceManifest: applied.sourceManifest,
            warning: "\u8166\u8CC7\u6599\u5DF2\u5BEB\u5165\u3002\u5EFA\u8B70\u624B\u52D5\u8ABF project_rescan \u91CD\u65B0\u6574\u7406\u67B6\u69CB\u8207\u7D71\u8A08\uFF1B\u82E5\u9700\u6062\u5FA9\u820A\u8166\uFF0C\u53EF\u8ABF project_rollback_backup\u3002"
          }
        };
      } catch (e) {
        return {
          ok: false,
          code: e && e.code || "E_IMPORT_FAILED",
          message: String(e && e.message || e)
        };
      }
    }
  });
}
function renderImport(_args, value) {
  if (!value || typeof value !== "object") {
    return [{ type: "text", text: "dsh-project-brain: import FAILED - " + String(value) }];
  }
  if (value.ok) {
    const d = value.data || {};
    if (d.mode === "preview") {
      const impact = d.impact || {};
      return [
        { type: "text", text: "dsh-project-brain: import PREVIEW" },
        { type: "text", text: "  bundle: " + d.bundlePath },
        { type: "text", text: "  source: " + (d.manifest && d.manifest.sourceProject && d.manifest.sourceProject.rootPath) },
        { type: "text", text: "  current brain: " + (impact.currentBrainExists ? `${impact.currentMemories} mem / ${impact.currentTodos} todo / ${impact.currentTimeline} timeline` : "(\u7121)") },
        { type: "text", text: `  incoming: ${impact.incomingMemories} mem / ${impact.incomingTodos} todo / ${impact.incomingTimeline} timeline` },
        { type: "text", text: "  backup will create: " + (impact.backupWillCreateAt || "(\u7121\u8166\uFF0C\u7121\u9700\u5099\u4EFD)") },
        { type: "text", text: "  rootPath rewrite: " + (impact.rootPathRewrite && impact.rootPathRewrite.from) + " \u2192 " + (impact.rootPathRewrite && impact.rootPathRewrite.to) },
        { type: "text", text: "  confirmToken: " + d.confirmToken + " (5 \u5206\u9418\u5167\u50B3\u7D66 dryRun=false \u624D\u6703\u771F\u6B63\u57F7\u884C)" }
      ];
    }
    if (d.mode === "applied") {
      return [
        { type: "text", text: "dsh-project-brain: import APPLIED" },
        { type: "text", text: "  backup: " + (d.backupPath || "(\u7121)") },
        { type: "text", text: "  files restored: " + d.fileCount },
        { type: "text", text: "  " + (d.warning || "") }
      ];
    }
  }
  return [{ type: "text", text: "dsh-project-brain: import FAILED - " + (value.code || "") + ": " + (value.message || "") }];
}

// src/tools/cleanup-backups.js
import { defineTool as defineTool13 } from "@deepseek-ai/dsh-tools";
init_backup();
var baseOutputSchema9 = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
    code: { type: "string" },
    message: { type: "string" }
  }
};
function buildCleanupBackupsTool({ fs, sandboxPolicy }) {
  return defineTool13({
    name: "project_cleanup_backups",
    description: "dsh-project-brain: \u6E05\u7406 .project-brain.backup-<ts>/ \u5099\u4EFD\u76EE\u9304\u3002\u5169\u500B\u7B56\u7565\u540C\u6642\u751F\u6548\uFF1A\u4FDD\u7559\u6700\u8FD1 N \u500B\uFF08\u9810\u8A2D 3\uFF09+ \u522A\u9664\u8D85\u904E X \u6BEB\u79D2\u7684\uFF08\u9810\u8A2D 30 \u5929\uFF09\u3002\u5EFA\u8B70\u5728\u6BCF\u6B21\u532F\u5165/\u56DE\u6EFE\u5F8C\u8ABF\u4E00\u6B21\uFF0C\u907F\u514D\u5099\u4EFD\u7121\u9650\u5806\u7A4D\u3002",
    parameters: {
      path: { type: "string", description: "\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u9810\u8A2D\u5F9E session cwd \u63A8\u65B7\uFF09" },
      keepLast: { type: "number", description: "\u4FDD\u7559\u6700\u8FD1\u5E7E\u500B\uFF08\u9810\u8A2D 3\uFF09" },
      olderThanMs: { type: "number", description: "\u522A\u9664\u8D85\u904E\u591A\u5C11\u6BEB\u79D2\u7684\uFF08\u9810\u8A2D 30 \u5929 = 2592000000\uFF09" }
    },
    output: { schema: baseOutputSchema9, render: renderCleanup },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        if (projectPath === ".") {
          return { ok: false, code: "E_NO_PATH", message: "\u7121\u6CD5\u89E3\u6790\u5C08\u6848\u8DEF\u5F91\uFF08\u8ACB\u986F\u5F0F\u50B3 path\uFF09" };
        }
        const all = await listBackups({ projectPath });
        const result = await cleanupBackups({
          projectPath,
          keepLast: args && typeof args.keepLast === "number" ? args.keepLast : 3,
          olderThanMs: args && typeof args.olderThanMs === "number" ? args.olderThanMs : 30 * 24 * 60 * 60 * 1e3
        });
        return {
          ok: true,
          data: {
            beforeCount: all.length,
            candidates: result.candidates,
            deleted: result.deleted,
            deletedCount: result.deleted.length,
            kept: result.kept,
            keptCount: result.kept.length,
            message: `\u6E05\u7406\u5B8C\u6210\uFF1A\u522A\u9664 ${result.deleted.length} \u500B\uFF0C\u4FDD\u7559 ${result.kept.length} \u500B\u3002`
          }
        };
      } catch (e) {
        return {
          ok: false,
          code: e && e.code || "E_CLEANUP_FAILED",
          message: String(e && e.message || e)
        };
      }
    }
  });
}
function renderCleanup(_args, value) {
  if (!value || typeof value !== "object") {
    return [{ type: "text", text: "dsh-project-brain: cleanup FAILED - " + String(value) }];
  }
  if (value.ok) {
    const d = value.data || {};
    const lines = [
      { type: "text", text: "dsh-project-brain: cleanup OK" },
      { type: "text", text: `  before: ${d.beforeCount} backups, deleted ${d.deletedCount}, kept ${d.keptCount}` }
    ];
    if (d.deleted && d.deleted.length > 0) {
      for (const p of d.deleted.slice(0, 5)) {
        lines.push({ type: "text", text: "  - " + p });
      }
      if (d.deleted.length > 5) lines.push({ type: "text", text: `  ... and ${d.deleted.length - 5} more` });
    }
    return lines;
  }
  return [{ type: "text", text: "dsh-project-brain: cleanup FAILED - " + (value.code || "") + ": " + (value.message || "") }];
}

// src/tools/rollback-backup.js
import { defineTool as defineTool14 } from "@deepseek-ai/dsh-tools";
init_brain_files();
init_brain_files();
init_backup();
init_confirm_tokens();
var baseOutputSchema10 = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
    code: { type: "string" },
    message: { type: "string" }
  }
};
function emitPreviewChanged7(exec, projectPath) {
  try {
    const executor = exec && exec.ctx || null;
    if (executor && typeof executor.emit === "function") {
      executor.emit("project_brain/preview.changed", { projectPath });
    }
  } catch (e) {
  }
}
function buildRollbackBackupTool({ fs, sandboxPolicy }) {
  return defineTool14({
    name: "project_rollback_backup",
    description: "dsh-project-brain: \u628A\u7576\u524D\u8166\u56DE\u6EFE\u5230\u6307\u5B9A\u7684 .project-brain.backup-<ts>/ \u5099\u4EFD\u3002**\u5169\u6B65\u6A5F\u5236**\uFF1A\u5148 dryRun=true \u62FF confirmToken\uFF0C\u518D dryRun=false + token \u771F\u6B63\u57F7\u884C\u3002\u56DE\u6EFE\u524D\u6703\u5148\u628A\u7576\u524D\u8166\u518D\u5099\u4EFD\u4E00\u6B21\uFF08\u5F62\u6210\u5B8C\u6574\u6B77\u53F2\u93C8\uFF09\uFF0C\u7121\u9700\u50B3 bundle \u6A94\u6848\u3002",
    parameters: {
      path: { type: "string", description: "\u5C08\u6848\u6839\u8DEF\u5F91\uFF08\u9810\u8A2D\u5F9E session cwd \u63A8\u65B7\uFF09" },
      backupTimestamp: { type: "string", description: "\u5099\u4EFD\u6642\u9593\u6233\uFF0C\u683C\u5F0F yyyymmdd-hhmmss-mmm\uFF08\u5982 20260915-143022-345\uFF1B\u820A\u5099\u4EFD hhmm-mmm \u4ECD\u53EF\u7528\uFF09" },
      dryRun: { type: "boolean", description: "true=\u50C5\u9810\u89BD\uFF08\u9810\u8A2D false\uFF09" },
      confirmToken: { type: "string", description: "dryRun \u8FD4\u56DE\u7684 token\uFF1BdryRun=false \u6642\u5FC5\u586B" }
    },
    output: { schema: baseOutputSchema10, render: renderRollback },
    async execute(args, exec) {
      try {
        const projectPath = resolveProjectPath(args, exec, sandboxPolicy);
        if (projectPath === ".") {
          return { ok: false, code: "E_NO_PATH", message: "\u7121\u6CD5\u89E3\u6790\u5C08\u6848\u8DEF\u5F91\uFF08\u8ACB\u986F\u5F0F\u50B3 path\uFF09" };
        }
        const backupTimestamp = args && args.backupTimestamp;
        if (!backupTimestamp) {
          return { ok: false, code: "E_BACKUP_TIMESTAMP_REQUIRED", message: "backupTimestamp \u5FC5\u586B\uFF08yyyymmdd-hhmmss-mmm\uFF09" };
        }
        const isDryRun = !!(args && args.dryRun);
        const tokenStore = getTokenStore();
        if (isDryRun) {
          let preview;
          try {
            preview = await previewRollback({ projectPath, backupTimestamp });
          } catch (e) {
            return {
              ok: false,
              code: e && e.code || "E_BACKUP_INVALID",
              message: String(e && e.message || e)
            };
          }
          const confirmToken = tokenStore.issue({
            kind: "rollback",
            payload: { projectPath, backupTimestamp }
          });
          return {
            ok: true,
            data: {
              mode: "preview",
              backupTimestamp,
              sourceBackup: preview.sourceBackup,
              currentBrain: preview.currentBrain,
              willBackupCurrentTo: preview.willBackupCurrentTo,
              confirmToken,
              warning: preview.currentBrain && preview.currentBrain.exists ? "\u56DE\u6EFE\u524D\u6703\u5148\u628A\u7576\u524D\u8166\u5099\u4EFD\u5230 " + preview.willBackupCurrentTo + "\uFF0C\u53EF\u7E7C\u7E8C\u56DE\u6EFE\u3002" : "\u7576\u524D\u8166\u4E0D\u5B58\u5728\uFF0C\u56DE\u6EFE\u5F8C\u6703\u6210\u70BA\u7576\u524D\u8166\u3002"
            }
          };
        }
        const token = args && args.confirmToken;
        if (!token) {
          return { ok: false, code: "E_CONFIRM_TOKEN_REQUIRED", message: "dryRun=false \u5FC5\u9808\u50B3 confirmToken\uFF08\u5148 dryRun=true \u62FF\u5230 token\uFF09" };
        }
        const payload = tokenStore.consume(token, { kind: "rollback" });
        if (!payload) {
          return { ok: false, code: "E_CONFIRM_TOKEN_MISMATCH", message: "confirmToken \u7121\u6548\u3001\u5DF2\u904E\u671F\u6216\u578B\u5225\u4E0D\u5339\u914D\uFF08\u8ACB\u91CD\u65B0 dryRun\uFF09" };
        }
        if (payload.projectPath !== projectPath || payload.backupTimestamp !== backupTimestamp) {
          return { ok: false, code: "E_CONFIRM_TOKEN_MISMATCH", message: "confirmToken \u8207\u7576\u524D\u5F15\u6578\u4E0D\u5339\u914D\uFF08\u8ACB\u91CD\u65B0 dryRun\uFF09" };
        }
        let applied;
        try {
          applied = await applyRollback({ projectPath, backupTimestamp, triggerRescan: false });
        } catch (e) {
          return {
            ok: false,
            code: e && e.code || "E_ROLLBACK_FAILED",
            message: String(e && e.message || e)
          };
        }
        try {
          const now = Date.now();
          const event = {
            id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
            title: "\u56DE\u6EFE\u5230\u5099\u4EFD " + backupTimestamp,
            eventType: "rollback",
            occurredAt: now,
            payload: {
              restoredFrom: applied.restoredFrom,
              preRollbackBackupPath: applied.preRollbackBackupPath
            }
          };
          await appendJsonl(fs, brainPath2(projectPath, "timeline.jsonl"), event);
        } catch (e) {
        }
        emitPreviewChanged7(exec, projectPath);
        return {
          ok: true,
          data: {
            mode: "applied",
            backupTimestamp,
            restoredFrom: applied.restoredFrom,
            preRollbackBackupPath: applied.preRollbackBackupPath,
            rescanTriggered: false,
            warning: "\u56DE\u6EFE\u5B8C\u6210\u3002\u5EFA\u8B70\u624B\u52D5\u8ABF project_rescan \u91CD\u65B0\u6574\u7406\u67B6\u69CB\u8207\u7D71\u8A08\u3002"
          }
        };
      } catch (e) {
        return {
          ok: false,
          code: e && e.code || "E_ROLLBACK_FAILED",
          message: String(e && e.message || e)
        };
      }
    }
  });
}
function renderRollback(_args, value) {
  if (!value || typeof value !== "object") {
    return [{ type: "text", text: "dsh-project-brain: rollback FAILED - " + String(value) }];
  }
  if (value.ok) {
    const d = value.data || {};
    if (d.mode === "preview") {
      const sb = d.sourceBackup || {};
      const cb = d.currentBrain || {};
      return [
        { type: "text", text: "dsh-project-brain: rollback PREVIEW" },
        { type: "text", text: `  source backup: ${sb.backupName} (${sb.sizeBytes} bytes, ${sb.memCount} mem / ${sb.todoCount} todo / ${sb.timelineCount} timeline)` },
        { type: "text", text: `  current brain: ${cb.exists ? `${cb.memCount} mem / ${cb.todoCount} todo / ${cb.timelineCount} timeline` : "(\u7121)"}` },
        { type: "text", text: "  pre-rollback backup: " + (d.willBackupCurrentTo || "(\u7121\u9700)") },
        { type: "text", text: "  confirmToken: " + d.confirmToken + " (5 \u5206\u9418\u5167\u50B3\u7D66 dryRun=false)" }
      ];
    }
    if (d.mode === "applied") {
      return [
        { type: "text", text: "dsh-project-brain: rollback APPLIED" },
        { type: "text", text: "  restored from: " + d.restoredFrom },
        { type: "text", text: "  pre-rollback backup: " + (d.preRollbackBackupPath || "(\u7121)") },
        { type: "text", text: "  " + (d.warning || "") }
      ];
    }
  }
  return [{ type: "text", text: "dsh-project-brain: rollback FAILED - " + (value.code || "") + ": " + (value.message || "") }];
}

// src/host/sidebar/aggregator.js
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import path5 from "node:path";

// src/host/memory/session-graph.js
var FILE_SHOW = 5;
var THIN_AFTER = 40;
var KEEP_RECENT = 20;
var DETAIL_MAX_CHARS = 900;
var NO_SUMMARY_LABEL = "\u7A0B\u5F0F\u78BC\u6709\u8B8A\u66F4\uFF08\u7121\u6458\u8981\uFF09";
var INIT_LABEL = "\u5C08\u6848\u521D\u59CB\u5316";
function qualifiedSummary2(text) {
  const summary = String(text || "").trim();
  if (!summary) return "";
  if (isChangelogGenre("", summary) || isChangelogGenre(summary, summary)) return "";
  return summary;
}
function firstSentence(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const versions = [];
  const masked = raw.replace(/\bv?\d+(?:\.\d+)+\b/gi, (m) => {
    versions.push(m);
    return "" + (versions.length - 1) + "";
  });
  const parts = masked.split(/(?<=[。！？.!?])\s*/).filter(Boolean);
  const first = (parts[0] || masked).trim();
  return first.replace(/\u0001(\d+)\u0001/g, (_, i) => versions[Number(i)] || "");
}
var PATCH_TONE = /(?:\bpatch\b|\bhotfix\b|\brelease[-\s]?(?:fix|notes)?\b|\bfix(?:es|ed)?\b|修復|補丁|發版|驗收|改動說明|變更說明)/i;
function isVersionLedTitle(text) {
  const t = String(text || "").trim();
  const m = t.match(/^v?\d+(?:\.\d+)+\b(.*)$/i);
  if (!m) return false;
  const rest = String(m[1] || "").trim();
  if (!rest) return true;
  return PATCH_TONE.test(rest);
}
function isWeakGraphTitle(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  if (isChangelogGenre("", t) || isChangelogGenre(t, t)) return true;
  if (isVersionLedTitle(t)) return true;
  return false;
}
function usableTitleLabel(text) {
  if (isWeakGraphTitle(text)) return "";
  const sentence = firstSentence(text);
  const trimmed = String(sentence || "").trim();
  if (!trimmed) return "";
  if (/^v?\d+\.$/i.test(trimmed) || /v0\.$/.test(trimmed)) return "";
  return trimmed;
}
function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}
function stripMarkdown(text) {
  let out = String(text || "");
  out = out.replace(/```[\s\S]*?```/g, " ");
  out = out.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  out = out.replace(/^\s{0,3}>\s?/gm, "");
  out = out.replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/gm, "");
  out = out.replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, " ");
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  out = out.replace(/`+([^`]*)`+/g, "$1");
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/(?<![\w*])\*([^*\n]+)\*(?!\w)/g, "$1");
  out = out.replace(/(?<![\w_])__([^_]+)__(?![\w_])/g, "$1");
  out = out.replace(/~~([^~]+)~~/g, "$1");
  return normalizeText(out);
}
function clipDetail(text, limit) {
  const raw = normalizeText(text);
  if (raw.length <= limit) return raw;
  const head = raw.slice(0, limit);
  const lastStop = Math.max(
    head.lastIndexOf("\u3002"),
    head.lastIndexOf("\uFF01"),
    head.lastIndexOf("\uFF1F"),
    head.lastIndexOf("\uFF1B"),
    head.lastIndexOf("."),
    head.lastIndexOf("!"),
    head.lastIndexOf("?")
  );
  const cut = lastStop >= limit * 0.6 ? head.slice(0, lastStop + 1) : head.replace(/\s+\S*$/, "");
  return (cut || head).replace(/\s+$/, "") + "\u2026";
}
function restAfterFirstSentence(text) {
  const raw = String(text || "").trim();
  const first = firstSentence(raw);
  if (!first || raw === first) return "";
  if (raw.startsWith(first)) return raw.slice(first.length).trim();
  return "";
}
function bodyWithoutTitle(content, title, label) {
  let c = String(content || "").trim();
  for (const head of [title, label]) {
    const h = String(head || "").trim();
    if (!h) continue;
    if (normalizeText(c) === normalizeText(h)) return "";
    if (c.startsWith(h)) c = c.slice(h.length).replace(/^[\s:：.\-—]+/, "").trim();
  }
  return c;
}
function pickDetail(g, label, summary) {
  const rest = restAfterFirstSentence(summary);
  if (rest && normalizeText(rest) !== normalizeText(label)) {
    return clipDetail(stripMarkdown(rest), DETAIL_MAX_CHARS);
  }
  const lab = String(label || "").trim();
  const details = (g.details || []).slice().sort((a, b) => {
    const score = (d) => usableTitleLabel(d.title) === lab || d.title === lab ? 1 : 0;
    return score(b) - score(a);
  });
  for (const d of details) {
    const body = stripMarkdown(bodyWithoutTitle(d.content, d.title, label));
    if (!body) continue;
    return clipDetail(body, DETAIL_MAX_CHARS);
  }
  return "";
}
var SKIP_EVENT_TYPES = /* @__PURE__ */ new Set(["rescan", "export", "import", "rollback"]);
var SUBSTANTIVE_EVENT_TYPES = /* @__PURE__ */ new Set(["session_summary", "todo", "todo_update", "memory", "memory_supersede", "memory_rejected"]);
function dayKey(ts) {
  const n = Number(ts) || 0;
  if (!n) return "";
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return "";
  const p = (x) => x < 10 ? "0" + x : "" + x;
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function parseTodoId(event) {
  if (event && event.todoId) return String(event.todoId);
  const detail = String(event && event.detail || "");
  const fromDetail = detail.match(/(?:todoId|id)=(todo-[A-Za-z0-9._:-]+|[A-Za-z0-9._:-]+)/);
  if (fromDetail) return fromDetail[1];
  const title = String(event && event.title || "");
  const fromTitle = title.match(/\[(todo-[^\]]+)\]/);
  return fromTitle ? fromTitle[1] : "";
}
function isTodoDone(event) {
  if (event && event.todoStatus === "done") return true;
  if (/status=done/.test(String(event && event.detail || ""))) return true;
  return /^完成待辦/.test(String(event && event.title || ""));
}
function displayTitle(event) {
  let title = String(event && event.title || "").trim();
  title = title.replace(/^新增記憶\[[^\]]+\]：/, "");
  title = title.replace(/^新增待辦(?:\[[^\]]+\])?：/, "");
  title = title.replace(/^完成待辦(?:\[[^\]]+\])?：/, "");
  title = title.replace(/^更新待辦\[[^\]]+\]：/, "");
  return title.trim();
}
function sessionKey(event) {
  if (event && event.sessionId) return String(event.sessionId);
  if (event && event.eventType === "init") return "init";
  if (!event || SKIP_EVENT_TYPES.has(event.eventType)) return "";
  if (SUBSTANTIVE_EVENT_TYPES.has(event.eventType)) {
    const day = dayKey(event.occurredAt);
    return day ? "day:" + day : "";
  }
  return "";
}
function looksLikePath(token) {
  const t = String(token || "").trim();
  if (!t || /^\d+$/.test(t)) return false;
  return t.includes("/") || /\.[A-Za-z0-9]{1,8}$/.test(t);
}
function parseFiles(event) {
  if (Array.isArray(event && event.files)) {
    return event.files.map((f) => String(f).replace(/\\/g, "/")).filter(looksLikePath);
  }
  const detail = String(event && event.detail || "");
  const m = detail.match(/\bfiles=([^\s]+)/);
  if (!m) return [];
  return m[1].split(",").map((f) => f.trim()).filter(looksLikePath);
}
function parseTriggerFiles(event) {
  if (Array.isArray(event && event.triggerFiles)) {
    return event.triggerFiles.map((f) => String(f).replace(/\\/g, "/")).filter(Boolean);
  }
  return [];
}
function intersect(a, b) {
  const set = new Set(b);
  return a.some((x) => set.has(x));
}
function buildSessionGraph(brain) {
  const timeline = Array.isArray(brain && brain.timeline) ? brain.timeline.filter(Boolean) : [];
  const memories = Array.isArray(brain && brain.memories) ? brain.memories.filter(Boolean) : [];
  const groups = /* @__PURE__ */ new Map();
  function bucket(sessionId) {
    if (!sessionId) return null;
    let g = groups.get(sessionId);
    if (!g) {
      g = {
        sessionId,
        occurredAt: 0,
        summaries: [],
        files: [],
        titles: [],
        details: [],
        todoIds: /* @__PURE__ */ new Set(),
        todoOpened: /* @__PURE__ */ new Set(),
        todoDone: /* @__PURE__ */ new Set(),
        hasMemory: false,
        triggerFiles: [],
        architectureFull: false
      };
      groups.set(sessionId, g);
    }
    return g;
  }
  for (const event of timeline) {
    const sid = sessionKey(event);
    const g = bucket(sid);
    if (!g) continue;
    const at = Number(event.occurredAt) || 0;
    if (at && (!g.occurredAt || at < g.occurredAt)) g.occurredAt = at;
    if (at > (g.latestAt || 0)) g.latestAt = at;
    const files = parseFiles(event);
    for (const f of files) if (!g.files.includes(f)) g.files.push(f);
    if (event.eventType === "session_summary") {
      const q = qualifiedSummary2(event.summary);
      if (q) g.summaries.push({ text: q, occurredAt: at });
    }
    if (event.eventType === "todo" || event.eventType === "todo_update") {
      const id = parseTodoId(event);
      if (id) {
        g.todoIds.add(id);
        if (isTodoDone(event)) g.todoDone.add(id);
        else g.todoOpened.add(id);
      }
      const todoTitle = displayTitle(event);
      if (todoTitle) g.titles.push(todoTitle);
    }
    if (event.eventType === "memory" || event.eventType === "memory_supersede") {
      const memTitle = displayTitle(event);
      if (memTitle && !isWeakGraphTitle(memTitle)) {
        g.hasMemory = true;
        g.titles.push(memTitle);
      }
    }
    if (event.eventType === "memory_rejected") {
      const rejectedTitle = displayTitle(event);
      if (rejectedTitle) g.titles.push(rejectedTitle);
    }
    if (event.eventType === "rescan" || event.architectureMode === "full") {
      const triggers = parseTriggerFiles(event);
      g.triggerFiles = g.triggerFiles.concat(triggers);
      if (event.architectureMode === "full" || /architecture=/.test(String(event.detail || ""))) g.architectureFull = true;
    }
  }
  for (const m of memories) {
    if (!m) continue;
    const weak = isWeakGraphTitle(String(m.title || "")) || isChangelogGenre(String(m.title || ""), String(m.content || m.title || ""));
    let sid = m && m.source && m.source.sessionId ? String(m.source.sessionId) : "";
    if (!sid) {
      if (weak) continue;
      const day = dayKey(m.createdAt || m.updatedAt);
      sid = day ? "day:" + day : "";
    }
    const g = bucket(sid);
    if (!g) continue;
    const at = Number(m.createdAt || m.updatedAt) || 0;
    if (!weak) {
      g.hasMemory = true;
      if (m.title) g.titles.push(String(m.title));
      const content = String(m.content || "").trim();
      if (content) g.details.push({ title: String(m.title || ""), content, occurredAt: at });
    }
    if (at && (!g.occurredAt || at < g.occurredAt)) g.occurredAt = at;
    if (at > (g.latestAt || 0)) g.latestAt = at;
  }
  let collapsedEmptyCount = 0;
  const trunk = [];
  for (const g of groups.values()) {
    g.summaries.sort((a, b) => (b.occurredAt || 0) - (a.occurredAt || 0));
    const summary = g.summaries.length ? g.summaries[0].text : "";
    const hasFiles = g.files.length > 0;
    const hasTodo = g.todoIds.size > 0;
    const trunkOk = Boolean(summary || hasFiles || hasTodo || g.hasMemory || g.sessionId === "init");
    if (!trunkOk) {
      collapsedEmptyCount += 1;
      continue;
    }
    let label = firstSentence(summary);
    let labelFromSummary = Boolean(label);
    if (!label) {
      for (const t of g.titles || []) {
        const titled = usableTitleLabel(t);
        if (titled) {
          label = titled;
          break;
        }
      }
    }
    if (!label && g.sessionId === "init") label = INIT_LABEL;
    if (!label && hasFiles) label = NO_SUMMARY_LABEL;
    if (!label) label = firstSentence(summary) || g.sessionId;
    const detail = pickDetail(g, label, summary);
    const files = g.files.slice(0, FILE_SHOW);
    trunk.push({
      id: g.sessionId,
      sessionId: g.sessionId,
      occurredAt: g.latestAt || g.occurredAt || 0,
      label,
      detail,
      files,
      filesMore: Math.max(0, g.files.length - files.length),
      important: Boolean(labelFromSummary || hasFiles || g.todoDone.size || g.architectureFull),
      trunk: true,
      hidden: false,
      _todoOpened: g.todoOpened,
      _todoDone: g.todoDone,
      _allFiles: g.files,
      _triggerFiles: g.triggerFiles,
      _architectureFull: g.architectureFull,
      _labelFromSummary: labelFromSummary
    });
  }
  trunk.sort((a, b) => (a.occurredAt || 0) - (b.occurredAt || 0));
  const edges = [];
  for (let i = 1; i < trunk.length; i++) {
    edges.push({ from: trunk[i - 1].id, to: trunk[i].id, kind: "time", reason: "time" });
  }
  const byId = new Map(trunk.map((n) => [n.id, n]));
  const doneAt = /* @__PURE__ */ new Map();
  trunk.forEach((node, index) => {
    for (const todoId of node._todoDone) {
      if (!doneAt.has(todoId)) doneAt.set(todoId, []);
      doneAt.get(todoId).push(index);
    }
  });
  trunk.forEach((node, index) => {
    for (const todoId of node._todoOpened) {
      for (const j of doneAt.get(todoId) || []) {
        if (j > index) edges.push({ from: node.id, to: trunk[j].id, kind: "evidence", reason: "todo" });
      }
    }
  });
  for (let i = 1; i < trunk.length; i++) {
    const prev = trunk[i - 1];
    const cur = trunk[i];
    if (!cur._architectureFull) continue;
    if (intersect(cur._triggerFiles.length ? cur._triggerFiles : cur._allFiles, prev._allFiles)) {
      edges.push({ from: prev.id, to: cur.id, kind: "evidence", reason: "architecture" });
    }
  }
  for (const m of memories) {
    const newSid = m && m.source && m.source.sessionId ? String(m.source.sessionId) : "";
    const oldId = m && (m.source && m.source.supersedes || m.supersedes);
    if (!newSid || !oldId) continue;
    const old = memories.find((x) => x && x.id === oldId);
    const oldSid = old && old.source && old.source.sessionId ? String(old.source.sessionId) : "";
    if (oldSid && oldSid !== newSid && byId.has(oldSid) && byId.has(newSid)) {
      edges.push({ from: oldSid, to: newSid, kind: "evidence", reason: "supersede" });
    }
  }
  const seenEdge = /* @__PURE__ */ new Set();
  const uniqueEdges = [];
  for (const e of edges) {
    const key = e.kind + ":" + e.reason + ":" + e.from + "->" + e.to;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    uniqueEdges.push(e);
  }
  const evidenceEnds = /* @__PURE__ */ new Set();
  for (const e of uniqueEdges) {
    if (e.kind === "evidence") {
      evidenceEnds.add(e.from);
      evidenceEnds.add(e.to);
    }
  }
  for (const n of trunk) {
    n.important = Boolean(n.important || evidenceEnds.has(n.id));
  }
  let hiddenCount = 0;
  if (trunk.length > THIN_AFTER) {
    const keepFrom = Math.max(0, trunk.length - KEEP_RECENT);
    trunk.forEach((n, index) => {
      if (n.important || index >= keepFrom) return;
      n.hidden = true;
      hiddenCount += 1;
    });
  }
  const nodes = trunk.map((n) => {
    const copy = Object.assign({}, n);
    delete copy._todoOpened;
    delete copy._todoDone;
    delete copy._allFiles;
    delete copy._triggerFiles;
    delete copy._architectureFull;
    delete copy._labelFromSummary;
    delete copy.titles;
    delete copy.details;
    return copy;
  });
  return {
    nodes,
    edges: uniqueEdges,
    collapsedEmptyCount,
    hiddenCount
  };
}

// src/host/sidebar/aggregator.js
var CACHE_TTL_MS = 5e3;
var cache = /* @__PURE__ */ new Map();
function attachFamiliarity(data, parts) {
  const project = parts && parts.project || data && data.project || null;
  const brain = {
    project,
    architecture: parts && parts.architecture || data && data.architecture || null,
    timeline: parts && parts.timeline || data && data.timelineAll || [],
    memories: parts && parts.memories || data && data.memoriesAll || [],
    todos: parts && parts.todos || data && data.todos || [],
    architectureStale: Boolean(project && project.architectureStale)
  };
  if (data) {
    data.briefing = buildProjectBriefing(brain);
    data.sessionGraph = buildSessionGraph(brain);
  }
  return data;
}
function invalidateAggregatorCache(projectPath) {
  if (projectPath) {
    cache.delete(projectPath);
  } else {
    cache.clear();
  }
}
function readJsonSync(filePath) {
  if (!existsSync2(filePath)) return null;
  try {
    return JSON.parse(readFileSync2(filePath, "utf8"));
  } catch (e) {
    return { __error: String(e && e.message || e) };
  }
}
function readJsonlSync(filePath) {
  if (!existsSync2(filePath)) return [];
  const out = [];
  for (const line of readFileSync2(filePath, "utf8").split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      out.push(JSON.parse(s));
    } catch (e) {
    }
  }
  return out;
}
function readMemoriesHousekeptSync(filePath) {
  const memories = readJsonlSync(filePath);
  const hk = housekeepMemories(memories);
  return hk.changed ? hk.rows : memories;
}
function deriveFallbackPhase(p) {
  const now = Date.now();
  const ts = p && (p.updatedAt || p.lastScannedAt) || now;
  const ageMs2 = now - ts;
  if (ageMs2 < 6e4) {
    return { title: "Project Brain \u5DF2\u5C31\u7DD2", progress: { done: 1, total: 1 } };
  }
  if (ageMs2 < 24 * 36e5) {
    return { title: "\u4ECA\u65E5\u6D3B\u8E8D", progress: { done: 1, total: 2 } };
  }
  return { title: "\u7DAD\u8B77\u4E2D", progress: { done: 1, total: 3 } };
}
function derivePhase(p, todos) {
  const active = todos.filter((t) => t && t.status !== "cancelled");
  if (active.length === 0) return deriveFallbackPhase(p);
  const done = active.filter((t) => t.status === "done").length;
  const inProgress = active.filter((t) => t.status === "in_progress");
  const title = inProgress.length > 0 ? "\u9032\u884C\u4E2D\uFF1A" + inProgress[0].title : "\u5F85\u8FA6 " + (active.length - done) + " \u9805";
  return { title, progress: { done, total: active.length } };
}
function buildSidebarPreview(projectPath) {
  if (!projectPath) projectPath = ".";
  const cached = cache.get(projectPath);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }
  const brainDir = path5.join(projectPath, ".project-brain");
  const p = readJsonSync(path5.join(brainDir, "project.json"));
  const architecture = readJsonSync(path5.join(brainDir, "architecture.json"));
  const timeline = readJsonlSync(path5.join(brainDir, "timeline.jsonl"));
  const memories = readMemoriesHousekeptSync(path5.join(brainDir, "memory.jsonl"));
  const visibleMemories = memories.filter(isCoreMemory);
  const todos = readJsonlSync(path5.join(brainDir, "todo.jsonl"));
  let data;
  if (!p) {
    data = { initialized: false, empty: true, projectPath };
  } else if (p.__error) {
    data = { initialized: false, error: p.__error, projectPath };
  } else {
    const activity = recentTimeline(timeline, 3).map((e) => ({
      id: e.id,
      title: e.title,
      occurredAt: e.occurredAt,
      eventType: e.eventType
    }));
    const stats = todoStats(todos);
    data = {
      initialized: true,
      projectPath,
      project: {
        id: p.id,
        name: p.name,
        type: techStackToType(p.techStack),
        rootPath: p.rootPath || projectPath,
        lastUpdateAt: p.updatedAt || p.lastScannedAt || Date.now(),
        architectureStale: Boolean(p.architectureStale)
      },
      phase: derivePhase(p, todos),
      recentActivity: activity.length > 0 ? activity : p.lastScannedAt ? [{
        id: "scan",
        title: "\u5B8C\u6210 project_init \u6383\u63CF",
        occurredAt: p.lastScannedAt,
        eventType: "init"
      }] : [],
      memories: visibleMemories.slice().sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, 3),
      todos,
      architecture: architecture && !architecture.__error ? architecture : null,
      stats: {
        pendingTodos: stats.pendingTodos,
        completedTodos: stats.completedTodos,
        decisions: visibleMemories.filter((m) => m.type === "decision").length
      }
    };
    attachFamiliarity(data, { project: p, architecture: architecture && !architecture.__error ? architecture : null, timeline, memories, todos });
  }
  cache.set(projectPath, { ts: Date.now(), data });
  return data;
}
async function buildWorkspacePreview(fs, workspaceRoot) {
  if (!workspaceRoot) workspaceRoot = ".";
  const root = String(workspaceRoot).replace(/[\\/]+$/, "");
  async function readJson2(file) {
    try {
      const target = await fs.resolve(root + "/" + file);
      const text = await fs.readText(target);
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }
  async function readJsonl2(file) {
    let text;
    try {
      const target = await fs.resolve(root + "/" + file);
      text = await fs.readText(target);
    } catch (e) {
      return [];
    }
    const out = [];
    for (const line of String(text).split("\n")) {
      const s = line.trim();
      if (!s) continue;
      try {
        out.push(JSON.parse(s));
      } catch (e) {
      }
    }
    return out;
  }
  try {
    await persistHousekeep(fs, root, { writeTimeline: false });
  } catch (e) {
  }
  const [p, timelineAll, memoriesAll, todosAll, codegraph, architecture] = await Promise.all([
    readJson2(".project-brain/project.json"),
    readJsonl2(".project-brain/timeline.jsonl"),
    readJsonl2(".project-brain/memory.jsonl"),
    readJsonl2(".project-brain/todo.jsonl"),
    readJson2(".project-brain/codegraph.json"),
    readJson2(".project-brain/architecture.json")
  ]);
  if (!p) {
    return {
      generatedAt: Date.now(),
      initialized: false,
      workspaceRoot: root,
      project: null,
      phase: null,
      recentActivity: [],
      memories: [],
      memoriesAll: [],
      memoriesArchived: [],
      todos: [],
      timelineAll: [],
      architecture: null,
      stats: { pendingTodos: 0, completedTodos: 0, decisions: 0 }
    };
  }
  const timeline = (Array.isArray(timelineAll) ? timelineAll : []).filter(Boolean).slice().sort((a, b) => (b.occurredAt || 0) - (a.occurredAt || 0));
  const coreMemories = (Array.isArray(memoriesAll) ? memoriesAll : []).filter(isCoreMemory);
  const dormantMemories = (Array.isArray(memoriesAll) ? memoriesAll : []).filter((m) => m && m.status === "dormant");
  const visibleMemories = coreMemories;
  const recentActivity = timeline.slice(0, 5).map((e) => ({ id: e.id, title: e.title, occurredAt: e.occurredAt, eventType: e.eventType }));
  const memories = visibleMemories.slice().sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, 3);
  const stats = todoStats(todosAll);
  const inProgress = todosAll.filter((t) => t && t.status === "in_progress");
  const activeForPhase = todosAll.filter((t) => t && t.status !== "cancelled");
  const phase = activeForPhase.length > 0 ? {
    title: inProgress.length > 0 ? "\u9032\u884C\u4E2D\uFF1A" + inProgress[0].title : "\u5F85\u8FA6 " + stats.pendingTodos + " \u9805",
    progress: { done: stats.completedTodos, total: activeForPhase.length }
  } : {
    title: "\u5DF2\u6383\u63CF\uFF08" + (p.entrypoints ? p.entrypoints.length : 0) + " \u500B\u5165\u53E3\uFF09",
    progress: { done: 1, total: 1 }
  };
  const todosActive = activeTodos(todosAll);
  const todosDone = todosAll.filter((t) => t && t.status === "done");
  const todos = todosActive.concat(todosDone).slice(0, 50);
  const preview = {
    generatedAt: Date.now(),
    initialized: true,
    workspaceRoot: root,
    project: {
      id: p.id,
      name: p.name || "(unnamed)",
      type: techStackToType(p.techStack),
      rootPath: p.rootPath || root,
      description: sanitizeProjectDescription(p.description) || "",
      techStack: mergeTechStackWithArchitecture(p.techStack || {}, architecture),
      stack: mergeStackWithArchitecture(p.stack || {}, architecture),
      structure: p.structure || [],
      tooling: p.tooling || [],
      languages: p.languages || {},
      entrypoints: p.entrypoints || [],
      lastUpdateAt: p.updatedAt || p.lastScannedAt || Date.now(),
      architectureStale: Boolean(p.architectureStale)
    },
    phase,
    recentActivity: recentActivity.length > 0 ? recentActivity : p.lastScannedAt ? [{
      id: "scan",
      title: "\u5B8C\u6210 project_init \u6383\u63CF",
      occurredAt: p.lastScannedAt,
      eventType: "init"
    }] : [],
    memories,
    memoriesAll: coreMemories.concat(dormantMemories).slice().sort((a, b) => {
      const ac = isCoreMemory(a) ? 0 : 1;
      const bc = isCoreMemory(b) ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return (b.importance || 0) - (a.importance || 0);
    }).slice(0, 50),
    // 歸檔不是刪除：頁面要能看到它們才談得上「恢復」。
    memoriesArchived: (Array.isArray(memoriesAll) ? memoriesAll : []).filter((m) => m && (m.status === "archived" || m.status === "superseded")).slice().sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)).slice(0, 50),
    todos,
    timelineAll: timeline.slice(0, 50),
    codegraph,
    architecture,
    stats: {
      pendingTodos: stats.pendingTodos,
      completedTodos: stats.completedTodos,
      decisions: visibleMemories.filter((m) => m.type === "decision").length,
      archivedMemories: (Array.isArray(memoriesAll) ? memoriesAll : []).filter((m) => m && (m.status === "archived" || m.status === "superseded" || m.status === "deleted")).length
    }
  };
  attachFamiliarity(preview, { project: p, architecture, timeline, memories: memoriesAll, todos: todosAll });
  return preview;
}

// src/host/settings-probe.js
function fail(code, message, details) {
  return { ok: false, code, message, details: details || {} };
}
function ok(message, details) {
  return { ok: true, code: "OK", message, details: details || {} };
}
async function probeEmbedding({ config, resolveCredential, fetchImpl, signal } = {}) {
  const cfg = normalizeMemoryConfig(config);
  const endpoint = cfg.embeddingBaseURL ? embeddingEndpoint(cfg.embeddingBaseURL) : "";
  const model = cfg.embeddingModel || "";
  if (!cfg.vectorEnabled) {
    return fail("EMBEDDING_DISABLED", "\u5411\u91CF\u6AA2\u7D22\u672A\u555F\u7528\uFF0C\u958B\u555F\u958B\u95DC\u5F8C\u518D\u6E2C", { endpoint, model });
  }
  if (!cfg.embeddingBaseURL || !cfg.embeddingModel) {
    return fail("EMBEDDING_NOT_CONFIGURED", "\u9700\u8981\u540C\u6642\u586B\u5BEB Embedding \u5730\u5740\u548C\u6A21\u578B\u540D", { endpoint, model });
  }
  let apiKey = null;
  if (cfg.embeddingApiKeyEnv) {
    apiKey = await resolveEmbeddingApiKey(cfg.embeddingApiKeyEnv, resolveCredential);
    if (!apiKey) {
      const shown = isEmbeddingEnvRef(cfg.embeddingApiKeyEnv) ? cfg.embeddingApiKeyEnv : redactSecret(cfg.embeddingApiKeyEnv);
      return fail("EMBEDDING_CREDENTIAL_MISSING", isEmbeddingEnvRef(cfg.embeddingApiKeyEnv) ? "\u672C\u6A5F\u6C92\u6709\u74B0\u5883\u8B8A\u6578 " + shown + "\u3002\u8ACB\u5728\u7CFB\u7D71\u6216\u4F7F\u7528\u8005\u74B0\u5883\u8B8A\u6578\u4E2D\u914D\u7F6E\u540C\u540D\u9805\u4E26\u5B8C\u5168\u91CD\u555F DSH Desktop\uFF0C\u6216\u6539\u70BA\u76F4\u63A5\u586B\u5BEB API Key\u3002" : "\u672A\u89E3\u6790\u5230\u91D1\u9470\uFF0C\u8ACB\u76F4\u63A5\u586B\u5BEB API Key\u3002", {
        endpoint,
        model,
        envName: isEmbeddingEnvRef(cfg.embeddingApiKeyEnv) ? cfg.embeddingApiKeyEnv : void 0
      });
    }
  }
  const started = Date.now();
  try {
    const vectors = await fetchEmbeddings({
      texts: ["project-brain connectivity probe"],
      config: cfg,
      apiKey,
      signal,
      fetchImpl
    });
    const dimensions = vectors[0].length;
    const details = { endpoint, model, dimensions, latencyMs: Date.now() - started };
    if (cfg.embeddingDimensions && dimensions !== cfg.embeddingDimensions) {
      return fail(
        "EMBEDDING_DIMENSION_MISMATCH",
        "\u8FD4\u56DE\u7DAD\u5EA6 " + dimensions + " \u8207\u914D\u7F6E " + cfg.embeddingDimensions + " \u4E0D\u4E00\u81F4",
        Object.assign({}, details, { expected: cfg.embeddingDimensions })
      );
    }
    return ok("\u5411\u91CF\u9023\u901A\uFF0C\u7DAD\u5EA6 " + dimensions, details);
  } catch (error) {
    return fail(
      error && error.code || "EMBEDDING_FAILED",
      String(error && error.message || error),
      { endpoint, model, latencyMs: Date.now() - started }
    );
  }
}
async function probeSessionLlm({ llm, route, sessionId, timeoutMs } = {}) {
  if (!llm || typeof llm.stream !== "function") {
    return fail("LLM_SERVICE_UNAVAILABLE", "DSH \u672A\u628A\u6A21\u578B\u670D\u52D9\u66B4\u9732\u7D66\u5C08\u6848\u8166", {});
  }
  if (!route || !route.provider || !route.model) {
    return fail("LLM_SESSION_ROUTE_UNAVAILABLE", "\u7576\u524D\u6703\u8A71\u9084\u6C92\u6709\u6A21\u578B\u8DEF\u7531\uFF0C\u5148\u767C\u4E00\u689D\u8A0A\u606F\u5F8C\u518D\u6E2C", {});
  }
  const started = Date.now();
  const detailsBase = { provider: route.provider, model: route.model };
  try {
    const text = await streamLlmText(
      llm,
      route,
      "Reply with exactly the word PONG and nothing else.",
      sessionId,
      timeoutMs || 12e3,
      {
        system: "You are a connectivity probe. Reply with exactly PONG.",
        maxTokens: 16,
        purpose: "project-brain-probe",
        temperature: 0
      }
    );
    return ok("LLM \u9023\u901A " + route.provider + "/" + route.model, Object.assign({}, detailsBase, {
      latencyMs: Date.now() - started,
      sample: String(text || "").slice(0, 80)
    }));
  } catch (error) {
    return fail(
      error && error.code || "LLM_FAILED",
      String(error && error.message || error),
      Object.assign({}, detailsBase, { latencyMs: Date.now() - started })
    );
  }
}

// src/host/git/history.js
import { join as join2, relative, sep } from "node:path";
import { existsSync as existsSync3, readFileSync as readFileSync3, readdirSync as readdirSync2 } from "node:fs";
var MAX_FILES = 8;
function diffCommitTrees(gitDir, currentTreeHash, parentTreeHash) {
  const currentFiles = collectTreeFiles(gitDir, currentTreeHash);
  const parentFiles = parentTreeHash ? collectTreeFiles(gitDir, parentTreeHash) : {};
  const allPaths = /* @__PURE__ */ new Set([...Object.keys(currentFiles), ...Object.keys(parentFiles)]);
  const added = [];
  const modified = [];
  const removed = [];
  const files = [];
  for (const path7 of allPaths) {
    const cur = currentFiles[path7];
    const par = parentFiles[path7];
    if (par === void 0) {
      added.push(path7);
      files.push(path7);
    } else if (cur === void 0) {
      removed.push(path7);
      files.push(path7);
    } else if (cur !== par) {
      modified.push(path7);
      files.push(path7);
    }
  }
  return {
    files: files.slice(0, MAX_FILES),
    totalFiles: files.length,
    added: added.length,
    modified: modified.length,
    removed: removed.length,
    truncated: files.length > MAX_FILES
  };
}
var GIT_DIR_NAMES = [".git"];
function findGitDir(projectPath) {
  if (!projectPath) return null;
  for (const name2 of GIT_DIR_NAMES) {
    const candidate = join2(projectPath, name2);
    if (existsSync3(candidate)) {
      try {
        if (existsSync3(join2(candidate, "HEAD"))) return candidate;
      } catch (e) {
      }
    }
  }
  return null;
}
function readHeadsBranches(gitDir) {
  const out = [];
  const headsDir = join2(gitDir, "refs", "heads");
  if (!existsSync3(headsDir)) return out;
  const walk = (dir, prefix) => {
    let entries;
    try {
      entries = readdirSync2(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const entry of entries) {
      const full = join2(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, prefix + entry.name + "/");
      } else if (entry.isFile()) {
        try {
          const hash = readFileSync3(full, "utf8").trim();
          if (/^[0-9a-f]{40}$/i.test(hash)) {
            out.push({ name: prefix + entry.name, commit: hash.toLowerCase() });
          }
        } catch (e) {
        }
      }
    }
  };
  walk(headsDir, "");
  return out;
}
function readPackedBranches(gitDir) {
  const out = [];
  const path7 = join2(gitDir, "packed-refs");
  if (!existsSync3(path7)) return out;
  try {
    const content = readFileSync3(path7, "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (line.startsWith("#") || !line.trim()) continue;
      const m = line.match(/^([0-9a-f]{40})\s+refs\/heads\/(.+)$/);
      if (m) out.push({ name: m[2], commit: m[1].toLowerCase() });
    }
  } catch (e) {
  }
  return out;
}
function getGitBranches(projectPath) {
  const gitDir = findGitDir(projectPath);
  if (!gitDir) return { available: false, branches: [], currentBranch: null };
  const head = readHead(gitDir);
  const fromLoose = readHeadsBranches(gitDir);
  const fromPacked = readPackedBranches(gitDir);
  const map = /* @__PURE__ */ new Map();
  for (const b of fromPacked) map.set(b.name, b);
  for (const b of fromLoose) map.set(b.name, b);
  const branches = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  return {
    available: true,
    currentBranch: head && head.branch || null,
    branches
  };
}
function getGitHistory({ projectPath, limit = 50, branch = null } = {}) {
  const gitDir = findGitDir(projectPath);
  if (!gitDir) return { available: false, error: "not a git repository", commits: [] };
  const head = readHead(gitDir);
  if (!head || !head.commit) return { available: false, error: "no HEAD commit", commits: [] };
  const commits = [];
  const visited = /* @__PURE__ */ new Set();
  const max = Math.max(1, Math.min(500, Number(limit) || 50));
  let current = head.commit.toLowerCase();
  let truncated = false;
  while (current && !visited.has(current) && commits.length < max) {
    visited.add(current);
    const c = readCommitFull(gitDir, current);
    if (!c) {
      break;
    }
    const firstParent = c.parents && c.parents[0] || null;
    const extraParents = (c.parents || []).slice(1);
    let diff = { files: [], totalFiles: 0, added: 0, modified: 0, removed: 0, truncated: false };
    try {
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
    }
    commits.push({
      hash: c.hash,
      shortHash: c.shortHash,
      subject: c.subject || "",
      body: c.message && c.message.length > (c.subject || "").length ? c.message.slice((c.subject || "").length).replace(/^\s+/, "").slice(0, 400) : "",
      author: c.author || "",
      authorEmail: c.authorEmail || "",
      timestamp: Number(c.authorTimestamp) || 0,
      isoTime: c.authorTimestamp ? new Date(Number(c.authorTimestamp) * 1e3).toISOString() : "",
      firstParent,
      extraParents,
      isMerge: extraParents.length > 0,
      // 檔案變更（基於 tree diff）
      filesChanged: diff.files,
      filesChangedTotal: diff.totalFiles,
      filesAdded: diff.added,
      filesModified: diff.modified,
      filesRemoved: diff.removed,
      filesTruncated: diff.truncated
    });
    current = firstParent;
  }
  if (current && !visited.has(current) === false) {
    truncated = true;
  }
  return {
    available: true,
    currentBranch: head && head.branch || null,
    head: head.commit,
    total: commits.length,
    truncated,
    commits
  };
}
var WORKTREE_IGNORE_DIRS = /* @__PURE__ */ new Set([
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
  ".pnpm-store"
]);
var WORKTREE_IGNORE_SUFFIXES = [".log", ".bak", ".tmp", ".swp", ".swo"];
var WORKTREE_IGNORE_NAMES = /* @__PURE__ */ new Set([".DS_Store", "Thumbs.db"]);
function collectWorkTreeFiles(projectPath) {
  const out = /* @__PURE__ */ Object.create(null);
  if (!projectPath) return out;
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync2(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const entry of entries) {
      const name2 = entry.name;
      if (WORKTREE_IGNORE_NAMES.has(name2)) continue;
      if (WORKTREE_IGNORE_DIRS.has(name2)) continue;
      const full = join2(dir, name2);
      let isDir = entry.isDirectory();
      if (!isDir && entry.isSymbolicLink()) {
        continue;
      }
      if (!isDir && WORKTREE_IGNORE_SUFFIXES.some((suf) => name2.endsWith(suf))) continue;
      if (isDir) {
        walk(full);
      } else if (entry.isFile()) {
        let rel;
        try {
          rel = relative(projectPath, full).split(sep).join("/");
        } catch (e) {
          continue;
        }
        if (!rel || rel.startsWith("..")) continue;
        out[rel] = true;
      }
    }
  }
  walk(projectPath);
  return out;
}
function findReadableReferenceTree(gitDir, startCommitHash) {
  let current = startCommitHash;
  const visited = /* @__PURE__ */ new Set();
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
function getWorkTreeChanges({ projectPath, maxFiles = 50 } = {}) {
  const gitDir = findGitDir(projectPath);
  if (!gitDir) return { available: false, error: "not a git repository" };
  const head = readHead(gitDir);
  if (!head || !head.commit) return { available: false, error: "no HEAD commit" };
  const headCommit = readCommitFull(gitDir, head.commit);
  if (!headCommit) return { available: false, error: "cannot read HEAD commit" };
  let headTreeFiles = collectTreeFiles(gitDir, headCommit.tree);
  let reference = "head";
  let referenceCommit = head.commit;
  if (Object.keys(headTreeFiles).length === 0) {
    const fallback = findReadableReferenceTree(gitDir, head.commit);
    if (!fallback) {
      return {
        available: false,
        error: "HEAD tree \u4E0D\u53EF\u8B80\uFF08pack \u89E3\u6790\u9650\u5236\uFF09\uFF0C\u7121\u6CD5\u53EF\u9760\u6AA2\u6E2C\u5DE5\u4F5C\u6A39\u8B8A\u66F4"
      };
    }
    headTreeFiles = fallback.files;
    reference = "fallback";
    referenceCommit = fallback.commitHash;
  }
  const headPaths = Object.keys(headTreeFiles);
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
    deletedSample: deleted.slice(0, cap)
  };
}

// src/host/transfer/rpc-payload.js
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v) {
  return v == null ? "" : String(v);
}
function shapeImportPreviewData(preview, bundlePath, confirmToken) {
  const current = preview && preview.currentBrain || {};
  const incoming = preview && preview.incoming || {};
  const rewrite = preview && preview.rootPathRewrite || {};
  const manifest = preview && preview.manifest || {};
  const sourceProject = manifest.sourceProject || {};
  const currentExists = !!current.exists;
  const backupWillCreateAt = str(preview && preview.backupWillCreateAt);
  const sourceProjectRoot = str(sourceProject.rootPath || sourceProject.name);
  const rootPathFrom = str(rewrite.from);
  const rootPathTo = str(rewrite.to);
  const warning = currentExists ? "\u532F\u5165\u5C07\u8986\u84CB\u7576\u524D\u8166\uFF0C\u820A\u8166\u6703\u81EA\u52D5\u5099\u4EFD\u5230 " + (backupWillCreateAt || "\u672C\u5730\u5099\u4EFD\u76EE\u9304") : "\u9019\u662F\u8A72\u5C08\u6848\u9996\u6B21\u532F\u5165\uFF0C\u7121\u820A\u8166\u53EF\u5099\u4EFD\u3002";
  const impact = {
    currentBrainExists: currentExists,
    currentProjectId: str(current.projectId),
    currentMemories: num(current.memCount),
    currentTodos: num(current.todoCount),
    currentTimeline: num(current.timelineCount),
    currentArchitecture: !!current.archExists,
    incomingMemories: num(incoming.memCount),
    incomingTodos: num(incoming.todoCount),
    incomingTimeline: num(incoming.timelineCount),
    incomingProjectId: str(incoming.projectId),
    backupWillCreateAt,
    rootPathFrom,
    rootPathTo
  };
  return {
    mode: "preview",
    bundlePath: str(bundlePath),
    confirmToken: str(confirmToken),
    sourceProjectRoot,
    warning,
    currentBrainExists: impact.currentBrainExists,
    currentProjectId: impact.currentProjectId,
    currentMemories: impact.currentMemories,
    currentTodos: impact.currentTodos,
    currentTimeline: impact.currentTimeline,
    currentArchitecture: impact.currentArchitecture,
    incomingMemories: impact.incomingMemories,
    incomingTodos: impact.incomingTodos,
    incomingTimeline: impact.incomingTimeline,
    incomingProjectId: impact.incomingProjectId,
    backupWillCreateAt,
    rootPathFrom,
    rootPathTo,
    manifest: {
      schemaVersion: str(manifest.schemaVersion),
      pluginVersion: str(manifest.pluginVersion),
      exportedAt: str(manifest.exportedAt),
      sourceProjectRoot
    },
    impact
  };
}
function shapeRollbackPreviewData(preview, backupTimestamp, confirmToken) {
  const source = preview && preview.sourceBackup || {};
  const current = preview && preview.currentBrain || {};
  const currentExists = !!current.exists;
  const willBackupCurrentTo = str(preview && preview.willBackupCurrentTo);
  const warning = currentExists ? "\u56DE\u6EFE\u524D\u6703\u5148\u628A\u7576\u524D\u8166\u5099\u4EFD\u5230 " + (willBackupCurrentTo || "\u672C\u5730\u5099\u4EFD\u76EE\u9304") + "\uFF0C\u53EF\u7E7C\u7E8C\u56DE\u6EFE\u3002" : "\u7576\u524D\u8166\u4E0D\u5B58\u5728\uFF0C\u56DE\u6EFE\u5F8C\u6703\u6210\u70BA\u7576\u524D\u8166\u3002";
  return {
    mode: "preview",
    confirmToken: str(confirmToken),
    backupTimestamp: str(backupTimestamp),
    sourceBackupName: str(source.backupName),
    sourceBackupTs: str(source.ts || backupTimestamp),
    sourceMemCount: num(source.memCount),
    sourceTodoCount: num(source.todoCount),
    sourceTimelineCount: num(source.timelineCount),
    currentBrainExists: currentExists,
    currentMemories: num(current.memCount),
    currentTodos: num(current.todoCount),
    currentTimeline: num(current.timelineCount),
    willBackupCurrentTo,
    warning,
    sourceBackup: {
      ts: str(source.ts || backupTimestamp),
      backupName: str(source.backupName),
      backupPath: str(source.backupPath),
      memCount: num(source.memCount),
      todoCount: num(source.todoCount),
      timelineCount: num(source.timelineCount)
    },
    currentBrain: {
      exists: currentExists,
      memCount: num(current.memCount),
      todoCount: num(current.todoCount),
      timelineCount: num(current.timelineCount)
    }
  };
}

// src/host/memory/edit.js
var EDITABLE_STATUSES = ["active", "dormant"];
var MIN_EDITED_CONTENT_CHARS = 12;
var MAX_EDITED_TITLE_CHARS = 200;
var MAX_EDITED_CONTENT_CHARS = 4e3;
function fail2(code, message) {
  return { ok: false, code, message };
}
function findMemoryById(rows, idPrefix, { includeArchived = false } = {}) {
  const needle = String(idPrefix || "").trim();
  if (!needle) return fail2("E_NO_ID", "id \u5FC5\u586B");
  const pool = (rows || []).filter((m) => m && m.id && (includeArchived || isRetrievableMemory(m)));
  const matches = pool.filter((m) => m.id === needle || m.id.indexOf(needle) === 0);
  if (matches.length === 0) return fail2("E_NOT_FOUND", "\u672A\u627E\u5230 id=" + needle + " \u7684\u8A18\u61B6");
  if (matches.length > 1) return fail2("E_AMBIGUOUS_ID", "id=" + needle + " \u5339\u914D\u5230 " + matches.length + " \u689D\uFF0C\u8ACB\u63D0\u4F9B\u66F4\u7CBE\u78BA\u7684 id");
  return { ok: true, entry: matches[0] };
}
function normalizeTags(value, previous) {
  if (value === void 0) return previous;
  if (!Array.isArray(value)) return previous;
  const out = [];
  for (const tag of value) {
    const clean2 = String(tag == null ? "" : tag).trim().slice(0, 50);
    if (clean2 && out.indexOf(clean2) < 0) out.push(clean2);
    if (out.length >= 10) break;
  }
  return out;
}
function applyMemoryEdit(rows, { id, patch = {}, now = Date.now(), limits } = {}) {
  const found = findMemoryById(rows, id);
  if (!found.ok) return found;
  const target = found.entry;
  const next = Object.assign({}, target);
  if (patch.title !== void 0) {
    const title = String(patch.title).trim();
    if (!title) return fail2("E_NO_TITLE", "\u6A19\u984C\u4E0D\u80FD\u70BA\u7A7A");
    next.title = title.slice(0, MAX_EDITED_TITLE_CHARS);
  }
  if (patch.content !== void 0) {
    const content = String(patch.content).trim();
    if (content.length < MIN_EDITED_CONTENT_CHARS) {
      return fail2("E_CONTENT_TOO_SHORT", "\u6B63\u6587\u81F3\u5C11 " + MIN_EDITED_CONTENT_CHARS + " \u500B\u5B57\u5143");
    }
    next.content = content.slice(0, MAX_EDITED_CONTENT_CHARS);
  }
  if (patch.type !== void 0) {
    const type = normalizeMemoryType(patch.type);
    if (!type) return fail2("E_INVALID_TYPE", "\u8A18\u61B6\u578B\u5225\u4E0D\u5408\u6CD5");
    next.type = type;
  }
  if (patch.importance !== void 0) {
    const importance = Number(patch.importance);
    if (!Number.isFinite(importance) || importance < 0 || importance > 1) {
      return fail2("E_INVALID_IMPORTANCE", "\u91CD\u8981\u6027\u5FC5\u9808\u662F 0~1 \u4E4B\u9593\u7684\u6578\u5B57");
    }
    next.importance = Math.round(importance * 100) / 100;
  }
  if (patch.status !== void 0) {
    const status = String(patch.status).trim();
    if (EDITABLE_STATUSES.indexOf(status) < 0) {
      return fail2("E_INVALID_STATUS", "\u72C0\u614B\u53EA\u80FD\u662F " + EDITABLE_STATUSES.join(" / "));
    }
    next.status = status;
  }
  if (patch.pinned !== void 0) {
    const pinned = patch.pinned === true;
    if (pinned && target.pinned !== true) {
      const cap = maxPinnedCount(limits);
      const current = pinnedMemories(rows).filter((m) => m.id !== target.id).length;
      if (current >= cap) {
        return fail2("E_PIN_LIMIT", "\u7F6E\u9802\u6700\u591A " + cap + " \u689D\uFF0C\u8ACB\u5148\u53D6\u6D88\u5176\u4ED6\u7F6E\u9802");
      }
    }
    if (pinned) next.pinned = true;
    else delete next.pinned;
  }
  const tags = normalizeTags(patch.tags, target.tags);
  if (tags && tags.length) next.tags = tags;
  else delete next.tags;
  const unchanged = ["title", "content", "type", "importance", "status"].every((key) => next[key] === target[key]) && next.pinned === true === (target.pinned === true) && JSON.stringify(next.tags || []) === JSON.stringify(target.tags || []);
  if (unchanged) return { ok: true, changed: false, rows: (rows || []).slice(), entry: target };
  next.source = Object.assign({}, target.source || {}, {
    fingerprint: memoryFingerprint(next),
    editedBy: "user",
    editedAt: now
  });
  next.updatedAt = now;
  const replaced = (rows || []).map((m) => m && m.id === target.id ? next : m);
  const capped = enforceCoreCap(replaced, { pinnedIds: [target.id], now, limits });
  return { ok: true, changed: true, rows: capped.rows, entry: next, previous: target };
}
function applyMemoryStatus(rows, { id, status, reason = "", now = Date.now(), limits } = {}) {
  const found = findMemoryById(rows, id, { includeArchived: true });
  if (!found.ok) return found;
  const target = found.entry;
  const archiving = status === "archived";
  if (target.status === status) {
    return { ok: true, changed: false, rows: (rows || []).slice(), entry: target };
  }
  const next = Object.assign({}, target, { status, updatedAt: now, lastAccessedAt: now });
  if (archiving) {
    if (reason) next.archiveReason = reason;
  } else {
    delete next.archiveReason;
    delete next.supersededBy;
    delete next.supersededReason;
  }
  const replaced = (rows || []).map((m) => m && m.id === target.id ? next : m);
  if (status !== "active") return { ok: true, changed: true, rows: replaced, entry: next, previous: target };
  const capped = enforceCoreCap(replaced, { pinnedIds: [target.id], now, limits });
  return { ok: true, changed: true, rows: capped.rows, entry: next, previous: target };
}
function applyMemoryDelete(rows, { id } = {}) {
  const found = findMemoryById(rows, id, { includeArchived: true });
  if (!found.ok) return found;
  const target = found.entry;
  const remaining = (rows || []).filter((m) => !(m && m.id === target.id));
  const cleaned = remaining.map((m) => {
    if (!m || m.supersededBy !== target.id) return m;
    const copy = Object.assign({}, m);
    delete copy.supersededBy;
    return copy;
  });
  return { ok: true, changed: true, rows: cleaned, entry: target };
}

// src/host/rpc/sidebar.js
init_brain_files();
init_write_lock();
import { promises as fsp4 } from "node:fs";
import path6 from "node:path";
function sanitizeSettings(config) {
  const source = normalizeMemoryConfig(config);
  return {
    retrievalMode: source.retrievalMode,
    vectorEnabled: source.vectorEnabled,
    embeddingBaseURL: source.embeddingBaseURL,
    embeddingModel: source.embeddingModel,
    embeddingApiKeyEnv: source.embeddingApiKeyEnv,
    embeddingDimensions: source.embeddingDimensions == null ? 0 : source.embeddingDimensions,
    embeddingBatchSize: source.embeddingBatchSize,
    embeddingMaxIndexPerRun: source.embeddingMaxIndexPerRun,
    embeddingTimeoutMs: source.embeddingTimeoutMs,
    keywordWeight: source.keywordWeight,
    vectorWeight: source.vectorWeight,
    importanceWeight: source.importanceWeight,
    confidenceWeight: source.confidenceWeight,
    recencyWeight: source.recencyWeight,
    sessionSemanticMemoryEnabled: source.sessionSemanticMemoryEnabled,
    sessionSemanticMaxChars: source.sessionSemanticMaxChars,
    sessionSemanticMaxItems: source.sessionSemanticMaxItems,
    sessionSemanticTimeoutMs: source.sessionSemanticTimeoutMs,
    sessionIdleSummaryMs: source.sessionIdleSummaryMs,
    realtimeMemoryEnabled: source.realtimeMemoryEnabled,
    realtimeMemoryTimeoutMs: source.realtimeMemoryTimeoutMs,
    coreMaxItems: source.coreMaxItems,
    coreMaxTokens: source.coreMaxTokens,
    vacuumMemoryRetainDays: source.vacuumMemoryRetainDays,
    vacuumMemoryMinRetained: source.vacuumMemoryMinRetained,
    vacuumTimelineMaxEvents: source.vacuumTimelineMaxEvents,
    vacuumTimelineRetainDays: source.vacuumTimelineRetainDays,
    architectureEnabled: source.architectureEnabled,
    architectureLlmEnabled: source.architectureLlmEnabled,
    architectureLlmIncludeSource: source.architectureLlmIncludeSource,
    architectureMaxFiles: source.architectureMaxFiles,
    architectureMaxNodes: source.architectureMaxNodes,
    architectureLlmTimeoutMs: source.architectureLlmTimeoutMs
  };
}
var PROJECT_BRAIN_RPC_CHANNEL = "/project-brain";
function getCwdBySession(ctx, sessionId) {
  if (!sessionId) return null;
  let sessions;
  try {
    sessions = ctx.get ? ctx.get("sessions") : ctx.sessions;
  } catch (e) {
    sessions = void 0;
  }
  if (!sessions || typeof sessions.get !== "function") return null;
  try {
    const session = sessions.get(sessionId);
    if (!session) return null;
    return session.meta && session.meta.cwd || session.header && session.header.cwd || session.cwd || null;
  } catch (e) {
    return null;
  }
}
function getSession(ctx, sessionId) {
  if (!sessionId) return null;
  let sessions;
  try {
    sessions = ctx.get ? ctx.get("sessions") : ctx.sessions;
  } catch (e) {
    sessions = null;
  }
  try {
    return sessions && typeof sessions.get === "function" ? sessions.get(sessionId) : null;
  } catch (e) {
    return null;
  }
}
function rpcOk(value) {
  return { ok: true, value };
}
var DSH_ERROR_CODES = /* @__PURE__ */ new Set([
  "bad-request",
  "cancelled",
  "session-not-found",
  "model-unavailable",
  "session-conflict",
  "invalid-time-zone",
  "workspace-attach-failed",
  "workspace-not-found",
  "workspace-invalid-path",
  "workspace-name-conflict",
  "workspace-move-invalid",
  "directory-unreadable",
  "directory-exists",
  "directory-create-failed",
  "directory-picker-unavailable",
  "agent-preset-read-only",
  "agent-preset-locked",
  "agent-preset-conflict",
  "agent-preset-not-found",
  "agent-preset-invalid",
  "agent-busy",
  "attachment-error",
  "queue-item-not-found",
  "steer-unavailable",
  "command-error",
  "unknown-command",
  "settings-rejected",
  "settings-conflict",
  "credential-rejected",
  "model-discovery-failed",
  "title-invalid",
  "fork-unavailable",
  "subagent-parent-unavailable",
  "subagent-not-found",
  "subagent-catalog-diagnostic",
  "subagent-not-resumable",
  "subagent-unauthorized",
  "subagent-delivery-unavailable",
  "internal"
]);
function normalizeDshErrorCode(code, details) {
  if (typeof code === "string" && DSH_ERROR_CODES.has(code)) {
    return { code, details: details && typeof details === "object" ? details : {} };
  }
  const merged = Object.assign({}, details && typeof details === "object" ? details : {});
  if (typeof code === "string" && code.length > 0 && !merged.originalCode) merged.originalCode = code;
  return { code: "internal", details: merged };
}
function rpcError(code, message, details) {
  const normalized = normalizeDshErrorCode(code, details);
  return {
    ok: false,
    error: {
      code: normalized.code,
      message,
      details: normalized.details
    }
  };
}
var PROJECT_PATH_RETRY_DELAY_MS = 500;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function resolveRpcProjectPath(ctx, payload) {
  const sid = payload && payload.sessionId;
  const first = getCwdBySession(ctx, sid);
  if (first) return first;
  await sleep(PROJECT_PATH_RETRY_DELAY_MS);
  return getCwdBySession(ctx, sid);
}
function registerConnectionRpc({ connection, ctx, fs, sandboxPolicy, tools, logger, getMemoryConfig, updateSettings, settingsWritable, getLlm, resolveEmbeddingCredential }) {
  if (!connection || !connection.rpc || typeof connection.rpc.handle !== "function") {
    if (logger && typeof logger.warn === "function") {
      logger.warn("[dsh-project-brain] connection.rpc unavailable; runtime preview disabled");
    }
    return false;
  }
  connection.rpc.handle(
    PROJECT_BRAIN_RPC_CHANNEL,
    async (endpoint, payload) => {
      const projectPath = await resolveRpcProjectPath(ctx, payload || {});
      const session = getSession(ctx, payload && payload.sessionId);
      const architectureRuntime = {
        getMemoryConfig,
        getLlm,
        llmRoute: resolveSessionRoute(session),
        getLlmRoute: () => resolveSessionRoute(getSession(ctx, payload && payload.sessionId)),
        sessionId: payload && payload.sessionId
      };
      if (endpoint === "settings") {
        const rawAction = payload && payload.action;
        const action = rawAction === "update" || rawAction === "probe" ? rawAction : "get";
        const config = getMemoryConfig ? getMemoryConfig() : normalizeMemoryConfig({});
        const writable = settingsWritable ? settingsWritable() : false;
        if (action === "probe") {
          const target = payload && payload.target;
          const overlay = payload && payload.config && typeof payload.config === "object" ? payload.config : {};
          const merged = normalizeMemoryConfig(Object.assign({}, config, overlay));
          if (target === "embedding") {
            const probe = await probeEmbedding({
              config: merged,
              resolveCredential: resolveEmbeddingCredential
            });
            return rpcOk({ probe: Object.assign({ target: "embedding" }, probe) });
          }
          if (target === "llm") {
            const llm = getLlm ? getLlm() : null;
            const route = resolveSessionRoute(getSession(ctx, payload && payload.sessionId));
            const probe = await probeSessionLlm({
              llm,
              route,
              sessionId: payload && payload.sessionId,
              timeoutMs: 12e3
            });
            return rpcOk({ probe: Object.assign({ target: "llm" }, probe) });
          }
          return rpcError("bad-request", "\u672A\u77E5\u63A2\u6E2C\u76EE\u6A19\uFF0C\u61C9\u70BA embedding \u6216 llm", { target: target || null });
        }
        if (action === "get") {
          return rpcOk({
            writable,
            config: sanitizeSettings(config),
            retrieval: publicMemoryConfig(config)
          });
        }
        const patch = payload && payload.patch && typeof payload.patch === "object" ? payload.patch : null;
        if (!patch || Object.keys(patch).length === 0) {
          return rpcError("EMPTY_PATCH", "\u6C92\u6709\u53EF\u5132\u5B58\u7684\u6B04\u4F4D", {});
        }
        if (!updateSettings || typeof updateSettings !== "function") {
          return rpcError("SETTINGS_UNAVAILABLE", "\u7576\u524D\u57F7\u884C\u6642 settings \u670D\u52D9\u4E0D\u53EF\u7528\uFF0C\u914D\u7F6E\u70BA\u53EA\u8B80", { writable: false });
        }
        if (!writable) {
          return rpcError("SETTINGS_READONLY", "settings provider \u53EA\u8B80\uFF0C\u7121\u6CD5\u5132\u5B58", { writable: false });
        }
        try {
          const next = await updateSettings(patch);
          return rpcOk({
            writable,
            config: sanitizeSettings(next),
            retrieval: publicMemoryConfig(next)
          });
        } catch (error) {
          return rpcError(
            error && error.code || "SETTINGS_UPDATE_FAILED",
            String(error && error.message || error),
            { writable }
          );
        }
      }
      if (!projectPath) {
        return rpcError(
          "WORKSPACE_NOT_FOUND",
          "\u7121\u6CD5\u5F9E\u7576\u524D Session \u89E3\u6790 workspace \u8DEF\u5F91",
          { sessionId: payload && payload.sessionId ? payload.sessionId : null }
        );
      }
      if (endpoint === "preview") {
        const preview = await buildWorkspacePreview(fs, projectPath);
        preview.retrieval = publicMemoryConfig(getMemoryConfig ? getMemoryConfig() : {});
        return rpcOk({
          projectPath,
          preview
        });
      }
      if (endpoint === "init") {
        const result = await scanAndWrite(
          fs,
          sandboxPolicy,
          { path: projectPath, dryRun: false },
          "project_init",
          architectureRuntime
        );
        if (!result || !result.ok) {
          const error = result && result.data && result.data.error;
          return rpcError(
            error && error.code || "INIT_FAILED",
            error && error.message || "\u5C08\u6848\u5927\u8166\u521D\u59CB\u5316\u5931\u6557",
            { projectPath }
          );
        }
        invalidateAggregatorCache(projectPath);
        const preview = await buildWorkspacePreview(fs, projectPath);
        preview.retrieval = publicMemoryConfig(getMemoryConfig ? getMemoryConfig() : {});
        return rpcOk({
          projectPath,
          scan: result.data,
          preview
        });
      }
      if (endpoint === "suggest") {
        const useLLM = !(payload && payload.useLLM === false);
        const suggestTool = buildSuggestTool({
          fs,
          sandboxPolicy,
          getLlm: architectureRuntime.getLlm
        });
        const trustedPath = payload && typeof payload.workspacePath === "string" && payload.workspacePath.trim() ? payload.workspacePath : projectPath;
        const args = { path: trustedPath };
        if (!useLLM) args.useLLM = false;
        let toolResult;
        try {
          toolResult = await suggestTool.execute(args, {
            session,
            sessionId: payload && payload.sessionId,
            agent: ctx && ctx.agent || null,
            ctx
          });
        } catch (error) {
          return rpcError("SUGGEST_FAILED", String(error && error.message || error), { endpoint });
        }
        if (!toolResult || toolResult.ok === false) {
          const error = toolResult && toolResult.data && toolResult.data.error;
          return rpcError(
            error && error.code || "SUGGEST_FAILED",
            error && error.message || "\u667A\u6167\u7E8C\u63A5\u5931\u6557",
            { endpoint, projectPath: trustedPath }
          );
        }
        return rpcOk({
          projectPath: trustedPath,
          suggestion: toolResult.data
        });
      }
      if (endpoint === "git") {
        const limit = Math.max(1, Math.min(500, Number(payload && payload.limit) || 50));
        const branch = payload && typeof payload.branch === "string" && payload.branch.trim() ? payload.branch.trim() : null;
        try {
          const history = getGitHistory({ projectPath, limit, branch });
          const branches = getGitBranches(projectPath);
          let workTree = { available: false };
          try {
            workTree = getWorkTreeChanges({ projectPath, maxFiles: 50 });
          } catch (e) {
            workTree = { available: false, error: String(e && e.message || e) };
          }
          return rpcOk({
            projectPath,
            available: history.available === true,
            currentBranch: history.currentBranch || branches && branches.currentBranch || null,
            head: history.head || null,
            total: history.total || 0,
            commits: history.commits || [],
            branches: branches && branches.branches || [],
            workTree,
            error: history.error || null
          });
        } catch (error) {
          return rpcError(
            "GIT_HISTORY_FAILED",
            String(error && error.message || error),
            { endpoint, projectPath }
          );
        }
      }
      if (endpoint === "action") {
        const action = payload && typeof payload.action === "string" ? payload.action : "";
        const toolActions = {
          todos: { name: "project_todo_list", args: { limit: 50 }, mutates: false },
          dream: { name: "project_dream", args: { mode: "light", dryRun: true }, mutates: false },
          dreamCommit: { name: "project_dream", args: { mode: "light", dryRun: false }, mutates: true },
          overview: { name: "project_continue", args: {}, mutates: false }
        };
        if (action === "rescan") {
          const result2 = await scanAndWrite(
            fs,
            sandboxPolicy,
            { path: projectPath, dryRun: false },
            "project_rescan",
            architectureRuntime
          );
          if (!result2 || !result2.ok) {
            const error = result2 && result2.data && result2.data.error;
            return rpcError(
              error && error.code || "RESCAN_FAILED",
              error && error.message || "\u91CD\u65B0\u6383\u63CF\u5931\u6557",
              { action, projectPath }
            );
          }
          invalidateAggregatorCache(projectPath);
          const preview2 = await buildWorkspacePreview(fs, projectPath);
          preview2.retrieval = publicMemoryConfig(getMemoryConfig ? getMemoryConfig() : {});
          return rpcOk({
            action,
            projectPath,
            result: result2,
            preview: preview2
          });
        }
        const definition = toolActions[action];
        if (!definition) {
          return rpcError("ACTION_NOT_ALLOWED", "\u4E0D\u652F\u63F4\u7684 Project Brain \u64CD\u4F5C\uFF1A" + action, { action });
        }
        if (!tools || typeof tools.execute !== "function") {
          return rpcError("TOOLS_UNAVAILABLE", "DSH tools service unavailable", { action });
        }
        let result;
        try {
          result = await tools.execute({
            name: definition.name,
            args: Object.assign({}, definition.args, { path: projectPath })
          });
        } catch (error) {
          return rpcError(
            "ACTION_FAILED",
            String(error && error.message || error),
            { action, tool: definition.name }
          );
        }
        if (!result || result.ok === false) {
          const nested = result && result.data && result.data.error;
          return rpcError(
            nested && nested.code || result && result.code || "ACTION_FAILED",
            nested && nested.message || result && result.message || "\u64CD\u4F5C\u57F7\u884C\u5931\u6557",
            { action, tool: definition.name }
          );
        }
        if (definition.mutates) invalidateAggregatorCache(projectPath);
        const preview = await buildWorkspacePreview(fs, projectPath);
        preview.retrieval = publicMemoryConfig(getMemoryConfig ? getMemoryConfig() : {});
        return rpcOk({
          action,
          projectPath,
          result,
          preview
        });
      }
      if (endpoint === "memory.update" || endpoint === "memory.status" || endpoint === "memory.delete") {
        return handleMemoryMutation({
          endpoint,
          payload: payload || {},
          projectPath,
          fs,
          ctx,
          getMemoryConfig
        });
      }
      if (endpoint === "export.run") {
        let outputPath = payload && typeof payload.outputPath === "string" ? payload.outputPath : "";
        try {
          const { defaultBundleName: defaultBundleName2, writeBundleFile: writeBundleFile2 } = await Promise.resolve().then(() => (init_bundle(), bundle_exports));
          if (!outputPath) {
            let projectName = path6.basename(projectPath);
            try {
              const raw = await fsp4.readFile(path6.join(projectPath, ".project-brain", "project.json"), "utf8");
              const meta = JSON.parse(raw);
              if (meta && meta.name) projectName = String(meta.name);
            } catch (e) {
            }
            outputPath = path6.join(projectPath, "dist-backups", defaultBundleName2({ name: projectName }));
          }
          const includeCache = payload && payload.includeCache !== void 0 ? !!payload.includeCache : true;
          const written = await writeBundleFile2({
            projectPath,
            outputPath,
            includeCache
          });
          try {
            const { appendJsonl: appendJsonl2, brainPath: brainPath3 } = await Promise.resolve().then(() => (init_brain_files(), brain_files_exports));
            const now = Date.now();
            await appendJsonl2(fs, brainPath3(projectPath, "timeline.jsonl"), {
              id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
              title: "\u532F\u51FA bundle\uFF1A" + written.bundleName,
              eventType: "export",
              occurredAt: now,
              payload: {
                bundlePath: written.bundlePath,
                sizeBytes: written.sizeBytes,
                fileCount: written.fileCount
              }
            });
          } catch (e) {
          }
          invalidateAggregatorCache(projectPath);
          const preview = await buildWorkspacePreview(fs, projectPath);
          preview.retrieval = publicMemoryConfig(getMemoryConfig ? getMemoryConfig() : {});
          return rpcOk({
            projectPath,
            preview,
            bundlePath: written.bundlePath,
            bundleName: written.bundleName,
            defaultDirPath: written.defaultDirPath,
            sizeBytes: written.sizeBytes,
            result: {
              ok: true,
              data: {
                bundlePath: written.bundlePath,
                bundleName: written.bundleName,
                defaultDirPath: written.defaultDirPath,
                sizeBytes: written.sizeBytes,
                fileCount: written.fileCount
              }
            }
          });
        } catch (e) {
          return rpcError(
            e && e.code || "internal",
            String(e && e.message || e),
            { outputPath: outputPath || null, projectPath }
          );
        }
      }
      if (endpoint === "import.preview") {
        const bundlePath = payload && typeof payload.bundlePath === "string" ? payload.bundlePath : "";
        if (!bundlePath) return rpcError("bad-request", "bundlePath \u5FC5\u586B", {});
        try {
          const { previewBundle: previewBundle2 } = await Promise.resolve().then(() => (init_bundle(), bundle_exports));
          const { getTokenStore: getTokenStore2 } = await Promise.resolve().then(() => (init_confirm_tokens(), confirm_tokens_exports));
          const preview = await previewBundle2({ bundlePath, destProjectPath: projectPath });
          const confirmToken = getTokenStore2().issue({
            kind: "import",
            payload: { bundlePath, destProjectPath: projectPath }
          });
          const data = shapeImportPreviewData(preview, bundlePath, confirmToken);
          return rpcOk(Object.assign({ projectPath, result: { ok: true, data } }, data));
        } catch (e) {
          return rpcError(e && e.code || "internal", String(e && e.message || e), { bundlePath, projectPath });
        }
      }
      if (endpoint === "import.apply") {
        const bundlePath = payload && typeof payload.bundlePath === "string" ? payload.bundlePath : "";
        const confirmToken = payload && typeof payload.confirmToken === "string" ? payload.confirmToken : "";
        if (!bundlePath) return rpcError("bad-request", "bundlePath \u5FC5\u586B", {});
        if (!confirmToken) return rpcError("bad-request", "confirmToken \u5FC5\u586B\uFF08\u5148\u8ABF import.preview \u62FF token\uFF09", {});
        try {
          const { getTokenStore: getTokenStore2 } = await Promise.resolve().then(() => (init_confirm_tokens(), confirm_tokens_exports));
          const tokenPayload = getTokenStore2().consume(confirmToken, { kind: "import" });
          if (!tokenPayload) {
            return rpcError("bad-request", "confirmToken \u7121\u6548\u3001\u5DF2\u904E\u671F\u6216\u578B\u5225\u4E0D\u5339\u914D\uFF08\u8ACB\u91CD\u65B0\u9810\u89BD\uFF09", {});
          }
          if (tokenPayload.bundlePath !== bundlePath || tokenPayload.destProjectPath !== projectPath) {
            return rpcError("bad-request", "confirmToken \u8207\u7576\u524D\u5F15\u6578\u4E0D\u5339\u914D\uFF08\u8ACB\u91CD\u65B0\u9810\u89BD\uFF09", {});
          }
          const { applyBundle: applyBundle2 } = await Promise.resolve().then(() => (init_bundle(), bundle_exports));
          const applied = await applyBundle2({ bundlePath, destProjectPath: projectPath, triggerRescan: false });
          try {
            const { appendJsonl: appendJsonl2, brainPath: brainPath3 } = await Promise.resolve().then(() => (init_brain_files(), brain_files_exports));
            const now = Date.now();
            await appendJsonl2(fs, brainPath3(projectPath, "timeline.jsonl"), {
              id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
              title: applied.backupPath ? "\u532F\u5165 bundle\uFF08\u5DF2\u5099\u4EFD\u820A\u8166\u5230 " + path6.basename(applied.backupPath) + "\uFF09" : "\u532F\u5165 bundle\uFF08\u9996\u6B21\uFF09",
              eventType: "import",
              occurredAt: now,
              payload: {
                bundlePath,
                backupPath: applied.backupPath,
                sourceManifest: applied.sourceManifest
              }
            });
          } catch (e) {
          }
          const data = {
            mode: "applied",
            bundlePath,
            backupPath: applied.backupPath || "",
            fileCount: applied.fileCount || 0
          };
          const result = rpcOk(Object.assign({ projectPath, result: { ok: true, data } }, data));
          await attachRescanAndPreview({
            result,
            projectPath,
            fs,
            sandboxPolicy,
            architectureRuntime,
            getMemoryConfig
          });
          return result;
        } catch (e) {
          return rpcError(e && e.code || "internal", String(e && e.message || e), { bundlePath, projectPath });
        }
      }
      if (endpoint === "backup.list") {
        try {
          const { listBackups: listBackups2 } = await Promise.resolve().then(() => (init_backup(), backup_exports));
          const backups = await listBackups2({ projectPath });
          return rpcOk({ projectPath, backups });
        } catch (error) {
          return rpcError(
            error && error.code || "BACKUP_LIST_FAILED",
            String(error && error.message || error),
            { projectPath }
          );
        }
      }
      if (endpoint === "backup.cleanup") {
        const keepLast = payload && typeof payload.keepLast === "number" ? payload.keepLast : 3;
        const olderThanMs = payload && typeof payload.olderThanMs === "number" ? payload.olderThanMs : void 0;
        try {
          const { cleanupBackups: cleanupBackups2 } = await Promise.resolve().then(() => (init_backup(), backup_exports));
          const cleaned = await cleanupBackups2({ projectPath, keepLast, olderThanMs });
          const data = {
            keptCount: Array.isArray(cleaned.kept) ? cleaned.kept.length : 0,
            deletedCount: Array.isArray(cleaned.deleted) ? cleaned.deleted.length : 0,
            kept: cleaned.kept || [],
            deleted: cleaned.deleted || []
          };
          return rpcOk(Object.assign({ projectPath, result: { ok: true, data } }, data));
        } catch (e) {
          return rpcError(e && e.code || "internal", String(e && e.message || e), { projectPath });
        }
      }
      if (endpoint === "backup.rollback.preview") {
        const ts = payload && typeof payload.backupTimestamp === "string" ? payload.backupTimestamp : "";
        if (!ts) return rpcError("bad-request", "backupTimestamp \u5FC5\u586B", {});
        try {
          const { previewRollback: previewRollback2 } = await Promise.resolve().then(() => (init_backup(), backup_exports));
          const { getTokenStore: getTokenStore2 } = await Promise.resolve().then(() => (init_confirm_tokens(), confirm_tokens_exports));
          const preview = await previewRollback2({ projectPath, backupTimestamp: ts });
          const confirmToken = getTokenStore2().issue({
            kind: "rollback",
            payload: { projectPath, backupTimestamp: ts }
          });
          const data = shapeRollbackPreviewData(preview, ts, confirmToken);
          return rpcOk(Object.assign({ projectPath, result: { ok: true, data } }, data));
        } catch (e) {
          return rpcError(e && e.code || "internal", String(e && e.message || e), { projectPath });
        }
      }
      if (endpoint === "backup.rollback.apply") {
        const ts = payload && typeof payload.backupTimestamp === "string" ? payload.backupTimestamp : "";
        const confirmToken = payload && typeof payload.confirmToken === "string" ? payload.confirmToken : "";
        if (!ts) return rpcError("bad-request", "backupTimestamp \u5FC5\u586B", {});
        if (!confirmToken) return rpcError("bad-request", "confirmToken \u5FC5\u586B\uFF08\u5148\u8ABF backup.rollback.preview \u62FF token\uFF09", {});
        try {
          const { getTokenStore: getTokenStore2 } = await Promise.resolve().then(() => (init_confirm_tokens(), confirm_tokens_exports));
          const tokenPayload = getTokenStore2().consume(confirmToken, { kind: "rollback" });
          if (!tokenPayload) {
            return rpcError("bad-request", "confirmToken \u7121\u6548\u3001\u5DF2\u904E\u671F\u6216\u578B\u5225\u4E0D\u5339\u914D\uFF08\u8ACB\u91CD\u65B0\u9078\u64C7\uFF09", {});
          }
          if (tokenPayload.projectPath !== projectPath || tokenPayload.backupTimestamp !== ts) {
            return rpcError("bad-request", "confirmToken \u8207\u7576\u524D\u5F15\u6578\u4E0D\u5339\u914D\uFF08\u8ACB\u91CD\u65B0\u9078\u64C7\uFF09", {});
          }
          const { applyRollback: applyRollback2 } = await Promise.resolve().then(() => (init_backup(), backup_exports));
          const applied = await applyRollback2({ projectPath, backupTimestamp: ts, triggerRescan: false });
          try {
            const { appendJsonl: appendJsonl2, brainPath: brainPath3 } = await Promise.resolve().then(() => (init_brain_files(), brain_files_exports));
            const now = Date.now();
            await appendJsonl2(fs, brainPath3(projectPath, "timeline.jsonl"), {
              id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
              title: "\u56DE\u6EFE\u5230\u5099\u4EFD " + ts,
              eventType: "rollback",
              occurredAt: now,
              payload: {
                restoredFrom: applied.restoredFrom,
                preRollbackBackupPath: applied.preRollbackBackupPath
              }
            });
          } catch (e) {
          }
          const data = {
            mode: "applied",
            backupTimestamp: ts,
            restoredFrom: applied.restoredFrom || "",
            preRollbackBackupPath: applied.preRollbackBackupPath || ""
          };
          const result = rpcOk(Object.assign({ projectPath, result: { ok: true, data } }, data));
          await attachRescanAndPreview({
            result,
            projectPath,
            fs,
            sandboxPolicy,
            architectureRuntime,
            getMemoryConfig
          });
          return result;
        } catch (e) {
          return rpcError(e && e.code || "internal", String(e && e.message || e), { projectPath });
        }
      }
      if (endpoint === "export.openFolder") {
        const folderPath = payload && typeof payload.folderPath === "string" ? payload.folderPath : "";
        if (!folderPath) return rpcError("BAD_REQUEST", "folderPath \u5FC5\u586B", {});
        try {
          if (!/^([A-Za-z]:[\\/]|\/)/.test(folderPath) || folderPath.includes("..")) {
            return rpcError("BAD_REQUEST", "folderPath \u5FC5\u9808\u662F\u7D55\u5C0D\u8DEF\u5F91\u4E14\u4E0D\u542B ..", { folderPath });
          }
          let shellModule = null;
          let opened = false;
          try {
            const shell = ctx.get ? ctx.get("shell") : ctx.shell;
            if (shell && typeof shell.openPath === "function") {
              const r = await shell.openPath(folderPath);
              opened = r === "" || r === void 0 || r === null;
              if (!opened) {
                return rpcError("OPEN_FAILED", "shell.openPath \u8FD4\u56DE\u932F\u8AA4\uFF1A" + String(r), { folderPath });
              }
              return rpcOk({ opened: true, folderPath });
            }
          } catch (e) {
          }
          try {
            shellModule = await import("electron");
            if (shellModule && shellModule.shell && typeof shellModule.shell.openPath === "function") {
              const errMsg = await shellModule.shell.openPath(folderPath);
              if (errMsg) {
                return rpcError("OPEN_FAILED", errMsg, { folderPath });
              }
              return rpcOk({ opened: true, folderPath });
            }
          } catch (e) {
          }
          try {
            const { spawn } = await import("node:child_process");
            const isWin = process.platform === "win32";
            const cmd = isWin ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open";
            spawn(cmd, [folderPath], { detached: true, stdio: "ignore" }).unref();
            return rpcOk({ opened: true, folderPath, method: cmd });
          } catch (e) {
            return rpcError("OPEN_FAILED", "\u7121\u6CD5\u958B\u555F\u8CC7\u6599\u593E\uFF1A" + String(e && e.message || e), { folderPath });
          }
        } catch (e) {
          return rpcError("OPEN_FAILED", String(e && e.message || e), { folderPath });
        }
      }
      if (endpoint === "import.pickBundle") {
        try {
          let dialog = null;
          let BrowserWindow = null;
          try {
            const electron = await import("electron");
            const mod = electron && electron.default ? electron.default : electron;
            dialog = mod && mod.dialog;
            BrowserWindow = mod && mod.BrowserWindow;
          } catch (e) {
          }
          if (!dialog || typeof dialog.showOpenDialog !== "function") {
            return rpcError("directory-picker-unavailable", "\u7CFB\u7D71\u6A94\u6848\u9078\u64C7\u5668\u4E0D\u53EF\u7528\uFF0C\u8ACB\u8CBC\u4E0A zip \u7684\u5B8C\u6574\u8DEF\u5F91", {});
          }
          const win = BrowserWindow && typeof BrowserWindow.getFocusedWindow === "function" && BrowserWindow.getFocusedWindow() || BrowserWindow && typeof BrowserWindow.getAllWindows === "function" && (BrowserWindow.getAllWindows()[0] || null) || void 0;
          const picked = await dialog.showOpenDialog(win || void 0, {
            title: "\u9078\u64C7 Project Brain bundle",
            properties: ["openFile"],
            filters: [
              { name: "Brain bundle", extensions: ["zip"] },
              { name: "All files", extensions: ["*"] }
            ]
          });
          if (!picked || picked.canceled || !picked.filePaths || !picked.filePaths[0]) {
            return rpcOk({ canceled: true, bundlePath: null });
          }
          return rpcOk({ canceled: false, bundlePath: picked.filePaths[0] });
        } catch (e) {
          return rpcError("directory-picker-unavailable", "\u7121\u6CD5\u958B\u555F\u6A94\u6848\u9078\u64C7\u5668\uFF1A" + String(e && e.message || e), {});
        }
      }
      return rpcError("METHOD_NOT_FOUND", "\u672A\u77E5 Project Brain RPC \u65B9\u6CD5\uFF1A" + endpoint, { endpoint });
    },
    { authority: "loopback" }
  );
  return true;
}
var MEMORY_TIMELINE_EVENTS = {
  edit: { eventType: "memory_edit", verb: "\u7DE8\u8F2F\u8A18\u61B6" },
  archived: { eventType: "memory_archive", verb: "\u6B78\u6A94\u8A18\u61B6" },
  active: { eventType: "memory_restore", verb: "\u6062\u5FA9\u8A18\u61B6" },
  dormant: { eventType: "memory_archive", verb: "\u4F11\u7720\u8A18\u61B6" },
  delete: { eventType: "memory_delete", verb: "\u6C38\u4E45\u522A\u9664\u8A18\u61B6" }
};
async function handleMemoryMutation(args) {
  const { endpoint, projectPath, fs, ctx, getMemoryConfig } = args;
  const id = typeof args.payload.id === "string" ? args.payload.id.trim() : "";
  if (!id) return rpcError("bad-request", "id \u5FC5\u586B", { endpoint });
  const result = await withWriteLock(brainTxKey(projectPath, "memory.jsonl"), () => mutateMemoryFile(args, id));
  if (!result.ok) return rpcError(result.code || "internal", result.message || "\u8A18\u61B6\u64CD\u4F5C\u5931\u6557", { endpoint, id });
  const { outcome, changed, now, timelineKey } = result;
  if (changed) {
    const meta = MEMORY_TIMELINE_EVENTS[timelineKey] || MEMORY_TIMELINE_EVENTS.edit;
    try {
      await appendJsonl(fs, brainPath2(projectPath, "timeline.jsonl"), {
        id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
        title: meta.verb + "[" + outcome.entry.type + "]\uFF1A" + outcome.entry.title,
        eventType: meta.eventType,
        occurredAt: now,
        detail: "id=" + outcome.entry.id + " by=user"
      });
    } catch (e) {
    }
    invalidateAggregatorCache(projectPath);
    try {
      if (ctx && typeof ctx.emit === "function") {
        ctx.emit("project_brain/preview.changed", { projectPath });
      }
    } catch (e) {
    }
  }
  const preview = await buildWorkspacePreview(fs, projectPath);
  preview.retrieval = publicMemoryConfig(getMemoryConfig ? getMemoryConfig() : {});
  return rpcOk({
    projectPath,
    preview,
    changed,
    memory: endpoint === "memory.delete" ? null : outcome.entry,
    deletedId: endpoint === "memory.delete" && changed ? outcome.entry.id : null
  });
}
async function mutateMemoryFile({ endpoint, payload, projectPath, fs }, id) {
  const memoryFile = brainPath2(projectPath, "memory.jsonl");
  let rows;
  try {
    rows = await readJsonl(fs, memoryFile);
  } catch (e) {
    return { ok: false, code: "internal", message: "\u8B80\u53D6 memory.jsonl \u5931\u6557\uFF1A" + String(e && e.message || e) };
  }
  const now = Date.now();
  let outcome;
  let timelineKey;
  if (endpoint === "memory.update") {
    const patch = payload.patch && typeof payload.patch === "object" ? payload.patch : null;
    if (!patch) return { ok: false, code: "bad-request", message: "patch \u5FC5\u586B" };
    outcome = applyMemoryEdit(rows, { id, patch, now });
    timelineKey = "edit";
  } else if (endpoint === "memory.status") {
    const status = typeof payload.status === "string" ? payload.status : "";
    if (["active", "dormant", "archived"].indexOf(status) < 0) {
      return { ok: false, code: "bad-request", message: "status \u53EA\u80FD\u662F active / dormant / archived" };
    }
    const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 500) : "";
    outcome = applyMemoryStatus(rows, { id, status, reason, now });
    timelineKey = status;
  } else {
    if (payload.confirm !== true) {
      return { ok: false, code: "bad-request", message: "\u6C38\u4E45\u522A\u9664\u9700\u8981 confirm=true" };
    }
    outcome = applyMemoryDelete(rows, { id });
    timelineKey = "delete";
  }
  if (!outcome.ok) return { ok: false, code: outcome.code || "internal", message: outcome.message };
  if (outcome.changed === false) return { ok: true, outcome, changed: false, now, timelineKey };
  const wrote = await writeJsonl(fs, memoryFile, outcome.rows);
  if (!wrote) return { ok: false, code: "internal", message: "\u5BEB\u5165 memory.jsonl \u5931\u6557" };
  return { ok: true, outcome, changed: true, now, timelineKey };
}
async function attachRescanAndPreview({ result, projectPath, fs, sandboxPolicy, architectureRuntime, getMemoryConfig }) {
  invalidateAggregatorCache(projectPath);
  let rescanTriggered = false;
  let rescanError = null;
  try {
    const scan = await scanAndWrite(
      fs,
      sandboxPolicy,
      { path: projectPath, dryRun: false },
      "project_rescan",
      architectureRuntime
    );
    rescanTriggered = !!(scan && scan.ok);
    if (!rescanTriggered) {
      const err = scan && scan.data && scan.data.error;
      rescanError = err && (err.message || err.code) || scan && scan.message || "rescan failed";
    }
  } catch (e) {
    rescanError = String(e && e.message || e);
  }
  if (result && result.value && result.value.result && typeof result.value.result === "object") {
    result.value.result.rescanTriggered = rescanTriggered;
    if (rescanError) result.value.result.rescanError = rescanError;
  }
  try {
    const preview = await buildWorkspacePreview(fs, projectPath);
    preview.retrieval = publicMemoryConfig(getMemoryConfig ? getMemoryConfig() : {});
    if (result && result.value) result.value.preview = preview;
  } catch (e) {
  }
  return result;
}
function registerSidebarRpc({ harness, ctx, fs, tools, getDefaultProjectPath, logger }) {
  const disposers = [];
  if (!harness || typeof harness.handle !== "function") {
    (logger && typeof logger.warn === "function" ? logger : { warn: (m) => console.warn(m) }).warn("[dsh-project-brain] harness builtin unavailable, skip RPC registration (host-side features will not work; restart DSH to load normally)");
    return disposers;
  }
  const getPreviewDisposer = harness.handle("project_brain/sidebar.getPreview", async (args) => {
    let projectPath = null;
    try {
      if (args && args.sessionId) {
        projectPath = getCwdBySession(ctx, args.sessionId);
      }
    } catch (e) {
    }
    if (!projectPath) projectPath = getDefaultProjectPath();
    return buildSidebarPreview(projectPath);
  });
  disposers.push(getPreviewDisposer);
  const initDisposer = harness.handle("project_brain/initProject", async (args) => {
    if (!tools || typeof tools.execute !== "function") {
      return { ok: false, code: "E_NO_TOOLS", message: "tools service unavailable" };
    }
    const userArgs = Object.assign({}, args && args.args || {});
    if (!userArgs.path && userArgs.sessionId) {
      try {
        const resolved = getCwdBySession(ctx, userArgs.sessionId);
        if (resolved) {
          userArgs.path = resolved;
          if (ctx && ctx.logger && typeof ctx.logger.info === "function") {
            try {
              ctx.logger.info("[dsh-project-brain] initProject: sessionId " + String(userArgs.sessionId).slice(0, 12) + "\u2026 \u2192 cwd " + resolved);
            } catch (e) {
            }
          }
        }
      } catch (e) {
      }
    }
    try {
      const result = await tools.execute({
        name: "project_init",
        args: userArgs
      });
      return result;
    } catch (e) {
      return { ok: false, code: "E_INIT_FAILED", message: String(e && e.message || e) };
    }
  });
  disposers.push(initDisposer);
  const continueDisposer = harness.handle("project_brain/continueSession", async (args) => {
    if (!tools || typeof tools.execute !== "function") {
      return { ok: false, code: "E_NO_TOOLS", message: "tools service unavailable" };
    }
    try {
      const result = await tools.execute({
        name: "project_continue",
        args: args && args.args || {}
      });
      return { ok: true, data: result };
    } catch (e) {
      return { ok: false, code: "E_CONTINUE_FAILED", message: String(e && e.message || e) };
    }
  });
  disposers.push(continueDisposer);
  return disposers;
}

// src/host/injector.js
init_brain_files();
var projectCache = /* @__PURE__ */ new Map();
var sessionProjects = /* @__PURE__ */ new Map();
function cwdFrom(value) {
  if (!value || typeof value !== "object") return null;
  const candidates = [
    value.cwd,
    value.meta && value.meta.cwd,
    value.header && value.header.cwd,
    value.header && value.header.meta && value.header.meta.cwd
  ];
  for (const cwd of candidates) {
    if (typeof cwd === "string" && cwd.trim()) return cwd.trim();
  }
  return null;
}
function sessionFrom(value) {
  if (!value || typeof value !== "object") return null;
  return value.session || value.agent && value.agent.session || value.initiator && value.initiator.session || value.currentSession || null;
}
function sessionIdFrom(value) {
  if (!value || typeof value !== "object") return null;
  const session = sessionFrom(value);
  return value.sessionId || value.id || session && (session.id || session.meta && session.meta.id) || null;
}
function resolveContextProject(context, sessions) {
  const direct = cwdFrom(context) || cwdFrom(sessionFrom(context));
  if (direct) return direct;
  const sid = sessionIdFrom(context);
  if (sid && sessionProjects.has(sid)) return sessionProjects.get(sid);
  if (sid && sessions && typeof sessions.get === "function") {
    try {
      const cwd = cwdFrom(sessions.get(sid));
      if (cwd) return cwd;
    } catch (e) {
    }
  }
  if (projectCache.size === 1) return projectCache.keys().next().value;
  return null;
}
async function loadProjectDataForInjection(fs, projectPath) {
  try {
    const [project, memories, todos, timeline] = await Promise.all([
      readJson(fs, brainPath2(projectPath, "project.json")),
      readJsonl(fs, brainPath2(projectPath, "memory.jsonl")),
      readJsonl(fs, brainPath2(projectPath, "todo.jsonl")),
      readJsonl(fs, brainPath2(projectPath, "timeline.jsonl"))
    ]);
    return { project, memories: memories || [], todos: todos || [], timeline: timeline || [] };
  } catch (e) {
    return { project: null, memories: [], todos: [], timeline: [] };
  }
}
async function refreshCache(fs, projectPath) {
  if (!fs || !projectPath) return;
  try {
    await ensureHousekeepOnRead(fs, projectPath);
  } catch (e) {
  }
  const data = await loadProjectDataForInjection(fs, projectPath);
  if (!data.project || data.project.__error) {
    projectCache.delete(projectPath);
    return;
  }
  projectCache.set(projectPath, { data, ts: Date.now() });
}
function getCachedSection(projectPath) {
  const cached = projectPath ? projectCache.get(projectPath) : null;
  if (!cached || !cached.data) return null;
  const { project, memories, todos, timeline } = cached.data;
  return buildInjectionContext({ project, memories, todos, timeline });
}
function setupInjector(ctx, fs, sandboxPolicy) {
  if (!ctx) return;
  let systemPrompt = null;
  try {
    systemPrompt = ctx.get ? ctx.get("systemPrompt") : ctx.systemPrompt;
  } catch (e) {
    systemPrompt = null;
  }
  let sessions = null;
  try {
    sessions = ctx.get ? ctx.get("sessions") : ctx.sessions;
  } catch (e) {
    sessions = null;
  }
  const logger = (level, msg) => {
    try {
      if (ctx.logger && typeof ctx.logger[level] === "function") ctx.logger[level]("[dsh-project-brain] " + msg);
      else if (typeof console !== "undefined") console.log("[dsh-project-brain] " + msg);
    } catch (e) {
    }
  };
  if (systemPrompt && typeof systemPrompt.section === "function") {
    try {
      const section = {
        name: "project-brain-context",
        order: 100,
        // harness=-100, persona=0, tool guidance=100-199; 我們放在工具指引區間內
        text: (context) => {
          try {
            const projectPath = resolveContextProject(context, sessions);
            const md = getCachedSection(projectPath);
            if (!md) return "";
            return md;
          } catch (e) {
            return "";
          }
        }
      };
      const disposer = systemPrompt.section(section);
      if (typeof ctx.effect === "function") {
        try {
          ctx.effect(() => disposer, "dsh-project-brain:injector:section");
        } catch (e) {
        }
      }
      logger("info", "injector: systemPrompt section registered (v0.3.1: text \u6B04\u4F4D\u4FEE\u5FA9)");
    } catch (e) {
      logger("warn", "injector: section registration failed: " + String(e && e.message || e));
    }
  } else {
    logger("warn", "injector: systemPrompt service unavailable, skip section registration");
  }
  if (ctx.on) {
    try {
      ctx.on("agent/session-start", (payload) => {
        try {
          const session = sessionFrom(payload);
          let projectPath = cwdFrom(session) || cwdFrom(payload);
          const sid = sessionIdFrom(payload);
          if (!projectPath && sandboxPolicy) {
            projectPath = sandboxPolicy.workspaceRoot || null;
          }
          if (projectPath && fs) {
            if (sid) sessionProjects.set(sid, projectPath);
            refreshCache(fs, projectPath).catch((e) => logger("warn", "injector: refresh cache failed: " + String(e && e.message || e)));
            logger("info", "injector: session-start cached project=" + projectPath);
          } else {
            logger("info", "injector: session-start without projectPath, skip");
          }
        } catch (e) {
        }
      });
    } catch (e) {
      logger("warn", "injector: agent/session-start subscription failed: " + String(e && e.message || e));
    }
  }
  if (ctx.on) {
    try {
      ctx.on("project_brain/preview.changed", (payload) => {
        try {
          const projectPath = payload && payload.projectPath;
          if (projectPath && fs) {
            refreshCache(fs, projectPath).catch(() => {
            });
          }
        } catch (e) {
        }
      });
    } catch (e) {
    }
  }
}

// src/host/summarizer.js
init_brain_files();

// src/host/diff/session-window.js
import { existsSync as existsSync4, readdirSync as readdirSync3, statSync } from "node:fs";
import { join as join3, relative as relative2, sep as sep2 } from "node:path";
var MAX_WINDOW_MS = 14 * 864e5;
var MAX_COMMITS = 30;
var DEFAULT_MAX_FILES = 40;
function sessionWindowStart(brain, now = Date.now()) {
  const timeline = Array.isArray(brain && brain.timeline) ? brain.timeline : [];
  let last = 0;
  for (const e of timeline) {
    if (!e || e.eventType !== "session_summary") continue;
    const at = Number(e.occurredAt) || 0;
    if (at > last) last = at;
  }
  const project = brain && brain.project || {};
  const fallback = Number(project.lastScannedAt) || Number(project.createdAt) || 0;
  const picked = last || fallback || now - 864e5;
  return Math.max(picked, now - MAX_WINDOW_MS);
}
function walkWorkTree(projectPath, onFile) {
  const stack = [projectPath];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync3(dir, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const entry of entries) {
      const name2 = entry.name;
      if (WORKTREE_IGNORE_NAMES.has(name2) || WORKTREE_IGNORE_DIRS.has(name2)) continue;
      if (entry.isSymbolicLink()) continue;
      const full = join3(dir, name2);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (WORKTREE_IGNORE_SUFFIXES.some((suf) => name2.endsWith(suf))) continue;
      let rel;
      try {
        rel = relative2(projectPath, full).split(sep2).join("/");
      } catch (e) {
        continue;
      }
      if (!rel || rel.startsWith("..")) continue;
      onFile(rel, full);
    }
  }
}
function worktreeChangedSince(projectPath, sinceMs, now) {
  const out = [];
  walkWorkTree(projectPath, (rel, full) => {
    let stat = null;
    try {
      stat = statSync(full);
    } catch (e) {
      return;
    }
    const mtime = stat.mtimeMs;
    if (!(mtime > sinceMs && mtime <= now + 1e3)) return;
    const birth = Number(stat.birthtimeMs) || 0;
    out.push({ path: rel, born: Boolean(birth) && birth > sinceMs && birth <= now + 1e3 });
  });
  return out;
}
function diffTrees(gitDir, treeHash, parentTreeHash) {
  const cur = collectTreeFiles(gitDir, treeHash);
  const par = parentTreeHash ? collectTreeFiles(gitDir, parentTreeHash) : {};
  const out = [];
  const seen = /* @__PURE__ */ new Set([...Object.keys(cur), ...Object.keys(par)]);
  for (const path7 of seen) {
    const a = cur[path7];
    const b = par[path7];
    if (a === b) continue;
    if (b === void 0) out.push({ path: path7, type: "added" });
    else if (a === void 0) out.push({ path: path7, type: "removed" });
    else out.push({ path: path7, type: "modified" });
  }
  return out;
}
function detectSessionChanges({ projectPath, sinceMs, now = Date.now(), maxFiles = DEFAULT_MAX_FILES }) {
  const result = {
    files: [],
    changes: [],
    commits: [],
    windowStart: sinceMs,
    source: "worktree",
    truncated: false,
    error: ""
  };
  if (!projectPath) {
    result.error = "no project path";
    return result;
  }
  const byPath = /* @__PURE__ */ new Map();
  const note = (path7, type) => {
    const p = String(path7 || "").replace(/\\/g, "/");
    if (!p) return;
    const prev = byPath.get(p);
    if (!prev || type === "removed" || type === "added" && prev !== "removed") byPath.set(p, type);
  };
  const gitDir = join3(projectPath, ".git");
  let headTreeFiles = null;
  if (existsSync4(gitDir)) {
    try {
      const head = readHead(gitDir);
      const headCommit = head && head.commit ? readCommitFull(gitDir, head.commit) : null;
      if (headCommit) {
        headTreeFiles = collectTreeFiles(gitDir, headCommit.tree);
        result.source = "git+worktree";
        let cursor = headCommit;
        let depth = 0;
        while (cursor && depth < MAX_COMMITS) {
          const ts = (Number(cursor.committerTimestamp) || Number(cursor.authorTimestamp) || 0) * 1e3;
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
      result.error = String(e && e.message || e);
    }
  }
  for (const item of worktreeChangedSince(projectPath, sinceMs, now)) {
    const tracked = headTreeFiles ? Object.prototype.hasOwnProperty.call(headTreeFiles, item.path) : !item.born;
    note(item.path, tracked ? "modified" : "added");
  }
  const all = Array.from(byPath.entries()).map(([path7, type]) => ({ path: path7, type })).sort((a, b) => a.path.localeCompare(b.path));
  result.truncated = all.length > maxFiles;
  result.changes = all.slice(0, maxFiles);
  result.files = result.changes.map((c) => c.path);
  return result;
}

// src/host/memory/session-extractor.js
import { isAbsolute, normalize, sep as sep3 } from "node:path";
var ALLOWED_TYPES = /* @__PURE__ */ new Set(["decision", "requirement", "architecture", "bug", "lesson", "context", "preference"]);
function clean(value, limit) {
  return String(value == null ? "" : value).replace(/\u0000/g, "").trim().slice(0, limit);
}
function redactSessionText(value) {
  return clean(value, 2e5).replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, "[REDACTED_PRIVATE_KEY]").replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]").replace(/\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\s*[:=]\s*["']?[^\s"']{6,}["']?/gi, "$1=[REDACTED]").replace(/\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/g, "[REDACTED_TOKEN]");
}
function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((block) => block && block.type === "text").map((block) => block.text || "").join("\n");
}
function sessionMessageLines(session, perMessageChars = 6e3) {
  let messages = [];
  try {
    messages = session && typeof session.deriveMessages === "function" ? session.deriveMessages() : [];
  } catch (e) {
    return [];
  }
  return (Array.isArray(messages) ? messages : []).map((message) => {
    const role = message && message.role;
    if (role !== "user" && role !== "assistant") return "";
    const value = redactSessionText(textFromContent(message.content));
    return value ? `${role.toUpperCase()}: ${value.slice(0, perMessageChars)}` : "";
  }).filter(Boolean);
}
function boundedSessionTranscript(session, maxChars = 16e3, maxMessages = 0) {
  const all = sessionMessageLines(session);
  const parts = maxMessages > 0 ? all.slice(-maxMessages) : all;
  const selected = [];
  let used = 0;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    const remaining = maxChars - used;
    if (remaining <= 0) break;
    selected.unshift(part.slice(Math.max(0, part.length - remaining)));
    used += Math.min(part.length, remaining) + 2;
  }
  return selected.join("\n\n");
}
function safeRelatedFile(value) {
  const file = clean(value, 240).replace(/\\/g, "/");
  if (!file || isAbsolute(file) || file.startsWith("../") || file === "..") return null;
  const normalized = normalize(file).split(sep3).join("/");
  return normalized.startsWith("../") || normalized === ".." ? null : normalized;
}
function fingerprint(item) {
  return memoryFingerprint(item);
}
function evidenceMatchesTranscript(evidence, transcript) {
  if (!evidence || typeof evidence !== "string") return false;
  const evidenceText = evidence.trim().slice(0, 200);
  if (evidenceText.length < 6) return false;
  const normalize2 = (s) => String(s || "").replace(/\s+/g, "").replace(/[\s\p{P}]/gu, "").toLowerCase();
  const normEvidence = normalize2(evidenceText);
  const normTranscript = normalize2(transcript);
  if (normEvidence.length < 6) return false;
  if (normTranscript.includes(normEvidence)) return true;
  if (normEvidence.length > 30) {
    const windowSize = 30;
    for (let i = 0; i <= normEvidence.length - windowSize; i += 15) {
      if (normTranscript.includes(normEvidence.slice(i, i + windowSize))) return true;
    }
  }
  return false;
}
function sessionMemoryPrompt(transcript, maxItems, diffEvidence) {
  const parts = [
    "\u5F9E\u4E0B\u9762\u7684\u8EDF\u9AD4\u958B\u767C Session \u4E2D\u63D0\u53D6\u503C\u5F97\u8DE8\u6703\u8A71\u9577\u671F\u5132\u5B58\u7684\u5C08\u6848\u77E5\u8B58\uFF0C\u4E26\u7E3D\u7D50\u672C\u6B21\u6703\u8A71\u505A\u4E86\u4EC0\u9EBC\u3002",
    "\u53EA\u4FDD\u7559\u6709\u660E\u78BA\u8B49\u64DA\u7684\u67B6\u69CB\u6C7A\u7B56\u3001\u7A69\u5B9A\u9700\u6C42\u3001Bug \u6839\u56E0\u8207\u4FEE\u5FA9\u3001\u53EF\u8907\u7528\u6559\u8A13\u3001\u9577\u671F\u554F\u984C\u6216\u91CD\u8981\u5C08\u6848\u80CC\u666F\u3002",
    "\u4F7F\u7528\u8005\u660E\u78BA\u8868\u9054\u7684\u9577\u671F\u5354\u4F5C\u53E3\u5F91\u8207\u5DE5\u4F5C\u504F\u597D\uFF08\u8F38\u51FA\u7D50\u69CB\u3001\u6C89\u6FB1\u76EE\u6A19\u3001\u8A9E\u6C23\u8981\u6C42\u7B49\uFF09\u7528 type=preference \u8A18\u4E0B\u4F86\uFF0C\u5B83\u548C\u6280\u8853\u4E8B\u5BE6\u540C\u6A23\u91CD\u8981\u3002",
    "\u6BCF\u689D\u8A18\u61B6\u5FC5\u9808\u80FD\u812B\u96E2\u672C\u6B21\u5C0D\u8A71\u7368\u7ACB\u95B1\u8B80\uFF1A\u6B63\u6587\u88E1\u4E0D\u5141\u8A31\u51FA\u73FE\u300C\u9019\u500B / \u90A3\u500B / \u4E0A\u9762\u8AAA\u7684 / \u9019\u6A23 / this / that\u300D\u9019\u985E\u6307\u4EE3\u8A5E\uFF0C\u4E00\u5F8B\u66FF\u63DB\u6210\u5B83\u771F\u6B63\u6307\u7684\u6771\u897F\u3002",
    "\u5FFD\u7565\u5BD2\u6684\u3001\u81E8\u6642\u6B65\u9A5F\u3001\u547D\u4EE4\u8F38\u51FA\u3001\u672A\u78BA\u8A8D\u731C\u6E2C\u3001\u500B\u4EBA\u8CC7\u8A0A\u3001\u6191\u64DA\uFF1B\u6C92\u6709\u7A69\u5B9A\u77E5\u8B58\u6642 memories \u8FD4\u56DE\u7A7A\u9663\u5217\u3002",
    "summary \u7528 1\u20133 \u53E5\u8A71\u5BEB\u672C\u6B21\u505A\u6210\u4E86\u4EC0\u9EBC\u91CD\u8981\u7684\u4EE5\u53CA\u70BA\u4EC0\u9EBC\uFF0C\u4F5C\u70BA\u4E0B\u4E00\u500B Session \u7684\u7E8C\u63A5\u4E0A\u4E0B\u6587\uFF0C\u4E0D\u7DE8\u9020\u3002\u7981\u6B62\u5BEB\u6210\u300C\u6539\u4E86 N \u500B\u6A94\u6848\u300D\u3001\u9A57\u6536\u6E05\u55AE\u6216 changelog\u3002",
    `\u6700\u591A ${maxItems} \u689D\u8A18\u61B6\u3002\u53EA\u8F38\u51FA\u56B4\u683C JSON \u7269\u4EF6\uFF0C\u4E0D\u8981 Markdown\u3002`,
    "\u6BCF\u689D\u8A18\u61B6\u5FC5\u9808\u5E36 evidence\uFF1A\u539F\u6587\u4E2D\u80FD\u76F4\u63A5\u9A57\u8B49\u8A72\u8A18\u61B6\u7684\u9023\u7E8C\u7247\u6BB5\uFF08\u5EFA\u8B70 8-60 \u5B57\uFF09\uFF0C\u7528\u65BC grounding \u6821\u9A57\u3002",
    "\u5982\u679C\u67D0\u689D\u8A18\u61B6\u7121\u6CD5\u5728\u539F\u6587\u4E2D\u627E\u5230\u5C0D\u61C9\u8B49\u64DA\uFF0C\u8ACB\u964D\u4F4E confidence \u6216\u4E0D\u8F38\u51FA\u3002",
    "durable=true \u50C5\u7576\u8A72\u4E8B\u5BE6\u53BB\u6389\u65E5\u671F/\u7248\u672C\u865F\u5F8C\u4ECD\u70BA\u771F\uFF1Bchangelog\u3001\u672C\u6B21\u6539\u4E86\u54EA\u4E9B\u6A94\u6848\u3001\u6703\u8A71\u6D41\u6C34\u8CEC\u5FC5\u9808 durable=false\u3002",
    "title \u5BEB\u6210\u7AD9\u7ACB\u4E8B\u5BE6\u53E5\uFF08\u4F8B\u5982\u300C\u8DEF\u5F91\u4EE5 session cwd \u70BA\u6E96\u300D\uFF09\uFF0C\u4E0D\u8981\u5BEB\u6210 v1.2.0 patch \u6216\u9A57\u6536\u6E05\u55AE\u3002content \u7528 2\u20134 \u53E5\u628A what+why \u5BEB\u5B8C\u3002",
    "\u683C\u5F0F\uFF1A" + JSON.stringify({ summary: "\u672C\u6B21\u6703\u8A71\u7E3D\u7D50\uFF082-4 \u53E5\u8A71\uFF09", memories: [{ type: "decision|requirement|architecture|bug|lesson|preference", title: "\u7C21\u6F54\u6A19\u984C", content: "\u81EA\u5305\u542B\u7684\u4E8B\u5BE6\u8207\u7406\u7531", evidence: "\u539F\u6587\u7247\u6BB5\uFF088-60 \u5B57\uFF09", durable: true, importance: 0.8, confidence: 0.9, relatedFiles: ["\u76F8\u5C0D\u8DEF\u5F91"], tags: ["\u6A19\u7C64"], supersedes: null }] })
  ];
  if (diffEvidence && String(diffEvidence).trim()) {
    parts.push("\u3010git diff \u53C3\u8003\u8B49\u64DA\uFF08\u50C5\u8F14\u52A9\u6838\u5C0D\u6A94\u6848\u7D1A\u4E8B\u5BE6\uFF0C\u4E0D\u8981\u9010\u689D\u8907\u8FF0\u70BA\u8A18\u61B6\uFF09\u3011\n" + String(diffEvidence).trim());
  }
  parts.push("Session \u5C0D\u8A71\uFF1A\n" + transcript);
  return parts.join("\n");
}
async function extractSessionMemories({ session, llm, route, sessionId, existingMemories = [], config = {}, now = Date.now(), diffEvidence = "" } = {}) {
  if (config.sessionSemanticMemoryEnabled === false) return { status: "disabled", memories: [], summary: "" };
  if (!llm || typeof llm.stream !== "function") return { status: "llm_unavailable", memories: [], summary: "" };
  if (!route || !route.provider || !route.model) return { status: "route_unavailable", memories: [], summary: "" };
  const maxChars = Math.max(2e3, Math.min(4e4, Number(config.sessionSemanticMaxChars) || 16e3));
  const maxItems = Math.max(1, Math.min(8, Number(config.sessionSemanticMaxItems) || 4));
  const transcript = boundedSessionTranscript(session, maxChars);
  if (transcript.length < 40) return { status: "empty_transcript", memories: [], summary: "" };
  const text = await streamLlmText(llm, route, sessionMemoryPrompt(transcript, maxItems, diffEvidence), sessionId, Number(config.sessionSemanticTimeoutMs) || 3e4, {
    system: "Extract durable, evidence-based software-project memory as strict JSON only. Never reproduce credentials or personal data.",
    maxTokens: 2600,
    purpose: "project-session-memory"
  });
  const parsed = parseArchitectureJson(text);
  const summary = clean(parsed && parsed.summary, 2e3);
  const raw = Array.isArray(parsed && parsed.memories) ? parsed.memories : [];
  const known = new Set((existingMemories || []).filter(isRetrievableMemory).map(
    (item) => item && item.source && item.source.fingerprint ? String(item.source.fingerprint) : fingerprint(item || {})
  ));
  const memories = [];
  let groundedCount = 0;
  let ungroundedCount = 0;
  for (const item of raw.slice(0, maxItems)) {
    const type = normalizeMemoryType(item && item.type);
    const title = clean(item && item.title, 200);
    const content = redactSessionText(clean(item && item.content, 400));
    const evidence = clean(item && item.evidence, 200);
    if (!ALLOWED_TYPES.has(type) || !title || content.length < 20) continue;
    if (item && item.durable !== true) continue;
    const candidate = { type, title, content };
    const hash = fingerprint(candidate);
    if (known.has(hash)) continue;
    known.add(hash);
    let groundingConfidence = typeof item.confidence === "number" ? item.confidence : 0.7;
    let groundingPassed = true;
    if (evidence && evidence.length >= 6) {
      if (evidenceMatchesTranscript(evidence, transcript)) {
        groundedCount += 1;
      } else {
        groundingConfidence = Math.min(groundingConfidence, 0.4);
        ungroundedCount += 1;
        groundingPassed = false;
      }
    } else {
      groundingConfidence = Math.min(groundingConfidence, 0.55);
      ungroundedCount += 1;
      groundingPassed = false;
    }
    memories.push(makeMemoryEntry({
      ...candidate,
      importance: item.importance,
      confidence: groundingConfidence,
      relatedFiles: (Array.isArray(item.relatedFiles) ? item.relatedFiles : []).map(safeRelatedFile).filter(Boolean),
      tags: (Array.isArray(item.tags) ? item.tags : []).map((tag) => clean(tag, 50)).filter(Boolean),
      source: {
        kind: "session_semantic",
        fingerprint: hash,
        sessionId: sessionId || null,
        provider: route.provider,
        model: route.model,
        grounded: groundingPassed,
        evidence: evidence || null,
        ...item && item.supersedes ? { supersedes: String(item.supersedes) } : {}
      }
    }, now));
  }
  return { status: "completed", memories, summary, transcriptChars: transcript.length, grounded: groundedCount, ungrounded: ungroundedCount };
}

// src/host/summarizer.js
function sessionCwd(session) {
  if (!session) return null;
  try {
    if (typeof session.cwd === "string" && session.cwd.trim()) return session.cwd;
    if (session.meta && typeof session.meta.cwd === "string" && session.meta.cwd.trim()) return session.meta.cwd;
    if (session.header && typeof session.header.cwd === "string" && session.header.cwd.trim()) return session.header.cwd;
    if (session.header && session.header.meta && typeof session.header.meta.cwd === "string" && session.header.meta.cwd.trim()) return session.header.meta.cwd;
  } catch (e) {
  }
  return null;
}
var MIN_NEW_MESSAGES = 4;
function countSessionMessages(session) {
  try {
    const messages = session && typeof session.deriveMessages === "function" ? session.deriveMessages() : [];
    return Array.isArray(messages) ? messages.length : 0;
  } catch (e) {
    return 0;
  }
}
function lastSummarizedMessageCount(timeline, sessionId) {
  if (!sessionId) return null;
  const mine = (timeline || []).filter(
    (e) => e && e.eventType === "session_summary" && e.sessionId === sessionId
  );
  if (!mine.length) return null;
  return mine.reduce((max, e) => Math.max(max, Number(e.messageCount) || 0), 0);
}
function changeFingerprint(diff) {
  const files = (diff.files || []).filter(Boolean).slice().sort();
  const commits = (diff.commits || []).map((c) => c && (c.hash || c.id || c.commit || c.message || "")).filter(Boolean);
  const input = JSON.stringify([files, commits, diff.stat || ""]);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return "git-" + (hash >>> 0).toString(16).padStart(8, "0");
}
async function summarizeOne({ fs, projectPath, sessionId, session, llm, route, config = {}, logger }) {
  const log = (level, msg) => {
    try {
      const tag = "[dsh-project-brain] ";
      if (logger && typeof logger[level] === "function") logger[level](tag + msg);
      else if (typeof console !== "undefined") console.log(tag + msg);
    } catch (e) {
    }
  };
  const brain = await readBrain(fs, projectPath);
  if (!brain.project || brain.project.__error) {
    log("info", "summarizer: project not initialized, skip");
    return { skipped: "not_initialized", changedFiles: 0, files: [] };
  }
  const messageCount = countSessionMessages(session);
  const lastSummarized = lastSummarizedMessageCount(brain.timeline, sessionId);
  if (sessionId && lastSummarized !== null && messageCount - lastSummarized < MIN_NEW_MESSAGES) {
    log("info", "summarizer: only " + (messageCount - lastSummarized) + " new messages since last summary, skip " + sessionId);
    return { skipped: "no_new_messages", changedFiles: 0, files: [] };
  }
  const windowStart = sessionWindowStart(brain, Date.now());
  let diff;
  try {
    diff = detectSessionChanges({ projectPath, sinceMs: windowStart, now: Date.now() });
  } catch (e) {
    diff = { files: [], changes: [], commits: [], stat: "", error: String(e && e.message || e) };
  }
  if (diff.error) {
    log("info", "summarizer: session window degraded (" + diff.error + ")");
  }
  const changedFiles = (diff.files || []).filter(Boolean);
  const changeEntries = Array.isArray(diff.changes) ? diff.changes : [];
  diff.stat = changedFiles.length ? changedFiles.length + " files changed in session window" : "";
  const fingerprint2 = changedFiles.length ? changeFingerprint(diff) : null;
  const duplicateChange = Boolean(fingerprint2 && (brain.memories || []).some(
    (m) => m && m.source && m.source.kind === "session_summary" && m.source.fingerprint === fingerprint2
  ));
  const diffEvidence = changedFiles.length ? "\u6539\u52D5\u6A94\u6848\uFF1A\n" + changedFiles.map((f) => "- " + f).join("\n") + (diff.stat ? "\n\nstat:\n" + diff.stat : "") : "";
  const now = Date.now();
  const writes = [];
  let semantic = { status: "not_requested", memories: [], summary: "" };
  const admittedIds = [];
  try {
    semantic = await extractSessionMemories({ session, llm, route, sessionId, existingMemories: brain.memories, config, now: now + 1, diffEvidence });
    for (const entry of semantic.memories) {
      const grounded = !(entry.source && entry.source.grounded === false);
      if (!grounded && Number(entry.confidence) < 0.6) continue;
      const result = await admitMemory({
        fs,
        projectPath,
        candidate: {
          type: entry.type,
          title: entry.title,
          content: entry.content,
          importance: entry.importance,
          confidence: entry.confidence,
          relatedFiles: entry.relatedFiles,
          tags: entry.tags,
          source: entry.source,
          supersedes: entry.source && entry.source.supersedes
        },
        channel: "automatic",
        now: entry.createdAt || now,
        llmConfirm: {
          admit: true,
          type: entry.type,
          supersedes: entry.source && entry.source.supersedes
        },
        pinnedIds: admittedIds
      });
      if (result.ok && result.action === "insert" && result.id) {
        admittedIds.push(result.id);
      }
    }
    if (admittedIds.length) log("info", `summarizer: admitted ${admittedIds.length} semantic memories`);
    if (semantic.summary) log("info", "summarizer: session summary generated (" + semantic.summary.length + " chars)");
  } catch (e) {
    semantic = { status: "failed", memories: [], summary: "", error: String(e && e.message || e) };
    log("warn", "summarizer: semantic extraction degraded: " + semantic.error);
  }
  if (changedFiles.length > 0) {
    log("info", `summarizer: session window noted ${changedFiles.length} files (timeline only, no change memory)`);
  } else if (duplicateChange) {
    log("info", "summarizer: unchanged window already recorded (" + fingerprint2 + ")");
  } else {
    log("info", "summarizer: no file changes in session window");
  }
  const rawSummary = String(semantic.summary || "").trim();
  const summaryRejected = rawSummary && isChangelogGenre("", rawSummary) ? "changelog_genre" : "";
  const summary = summaryRejected ? "" : rawSummary;
  const timelineEntry = {
    id: "evt-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    title: "Session \u6458\u8981\u5B8C\u6210" + (changedFiles.length > 0 ? "\uFF08" + changedFiles.length + " \u6A94\u6848\u8B8A\u66F4\uFF0C" + admittedIds.length + " \u689D\u8A9E\u7FA9\u8A18\u61B6\uFF09" : "\uFF08" + admittedIds.length + " \u689D\u8A9E\u7FA9\u8A18\u61B6\uFF09"),
    eventType: "session_summary",
    occurredAt: now,
    detail: "sessionId=" + (sessionId || "?") + " changedFiles=" + changedFiles.length + " semanticMemories=" + admittedIds.length + " semanticStatus=" + semantic.status + (changedFiles.length ? " files=" + changedFiles.slice(0, 20).join(",") : ""),
    sessionId: sessionId || null,
    summary,
    // 下一次摘要靠它判斷「這段之後又聊了多少」，缺了就只能整段重摘。
    messageCount,
    files: changedFiles.slice(0, 20),
    changes: changeEntries.slice(0, 20),
    windowStart,
    summaryRejected: summaryRejected || void 0,
    changeFingerprint: fingerprint2,
    deduplicated: duplicateChange,
    semanticStatus: semantic.status,
    semanticMemories: admittedIds.length
  };
  writes.push(async () => {
    const ok2 = await appendJsonl(fs, brainPath2(projectPath, "timeline.jsonl"), timelineEntry);
    log(ok2 ? "info" : "warn", `summarizer: timeline event ${ok2 ? "appended" : "FAILED"} (${timelineEntry.id})`);
  });
  for (const write of writes) await write();
  let autoDreamResult = null;
  try {
    const hk = await persistHousekeep(fs, projectPath, { now: Date.now(), pinnedIds: admittedIds });
    autoDreamResult = {
      triggered: Boolean(hk && hk.changed),
      changed: Boolean(hk && hk.changed),
      actions: hk && hk.actions || [],
      archived: hk && hk.actions ? hk.actions.filter((a) => a.action === "archive_rule").length : 0,
      evicted: hk && hk.actions ? hk.actions.filter((a) => a.action === "evict_to_dormant").length : 0
    };
    if (autoDreamResult.triggered) log("info", "summarizer: housekeep changed memory.jsonl");
  } catch (e) {
    log("warn", "summarizer: housekeep failed: " + String(e && e.message || e));
  }
  try {
    if (typeof __require !== "undefined") {
    }
  } catch (e) {
  }
  return {
    changedFiles: changedFiles.length,
    files: changedFiles,
    changes: changeEntries,
    windowStart,
    entrypoints: brain.project && brain.project.entrypoints || [],
    fingerprint: fingerprint2,
    deduplicated: duplicateChange,
    semanticStatus: semantic.status,
    semanticMemories: admittedIds.length,
    summary,
    autoDream: autoDreamResult
  };
}
function describeSessionShape(value) {
  if (!value || typeof value !== "object") return String(typeof value);
  const own = Object.keys(value).slice(0, 12);
  const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(value) || {}).filter((k) => k !== "constructor").slice(0, 12);
  return "own[" + own.join(",") + "] proto[" + proto.join(",") + "]";
}
var IDLE_SUMMARY_MS = 5 * 60 * 1e3;
function resolveIdleSummaryMs(runtime) {
  let configured = NaN;
  try {
    configured = Number(runtime.getMemoryConfig && runtime.getMemoryConfig().sessionIdleSummaryMs);
  } catch (e) {
  }
  if (!Number.isFinite(configured) || configured <= 0) return IDLE_SUMMARY_MS;
  return Math.min(36e5, configured);
}
function createIdleSummaryScheduler(runSummary, idleMs = IDLE_SUMMARY_MS) {
  const pending = /* @__PURE__ */ new Map();
  function cancel(projectPath) {
    const entry = pending.get(projectPath);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(projectPath);
  }
  function schedule({ projectPath, session, sessionId }) {
    if (!projectPath) return;
    cancel(projectPath);
    const timer = setTimeout(() => {
      pending.delete(projectPath);
      try {
        runSummary({ projectPath, session, sessionId });
      } catch (e) {
      }
    }, idleMs);
    if (typeof timer.unref === "function") timer.unref();
    pending.set(projectPath, { timer, session, sessionId });
  }
  function flushAll() {
    for (const projectPath of [...pending.keys()]) {
      const entry = pending.get(projectPath);
      cancel(projectPath);
      try {
        runSummary({ projectPath, session: entry && entry.session, sessionId: entry && entry.sessionId });
      } catch (e) {
      }
    }
  }
  return { schedule, cancel, flushAll, size: () => pending.size };
}
function setupSummarizer(ctx, fs, sandboxPolicy, runtime = {}) {
  if (!ctx || typeof ctx.on !== "function") return;
  let logger = null;
  try {
    logger = ctx.logger || null;
  } catch (e) {
  }
  const log = (level, msg) => {
    try {
      const tag = "[dsh-project-brain] ";
      if (logger && typeof logger[level] === "function") logger[level](tag + msg);
      else if (typeof console !== "undefined") console.log(tag + msg);
    } catch (e) {
    }
  };
  const resolveSessionContext = (incoming) => {
    const sessionId = incoming && (incoming.id || incoming.meta && incoming.meta.id);
    let session = incoming;
    let projectPath = sessionCwd(incoming);
    if (projectPath && typeof incoming.deriveMessages === "function") {
      return { projectPath, session, sessionId };
    }
    try {
      const sessions = ctx.get ? ctx.get("sessions") : ctx.sessions;
      const live = sessions && typeof sessions.get === "function" && sessionId ? sessions.get(sessionId) : null;
      if (live) {
        session = live;
        projectPath = projectPath || sessionCwd(live);
      }
    } catch (e) {
    }
    return { projectPath: projectPath || null, session, sessionId };
  };
  const idleMs = resolveIdleSummaryMs(runtime);
  const scheduler = createIdleSummaryScheduler((job) => runSummary(job, "idle"), idleMs);
  log("info", "summarizer: subscribed to session/flush + session/disposed\uFF08\u7A7A\u9592 " + Math.round(idleMs / 1e3) + "s \u89F8\u767C\u6458\u8981\uFF09");
  const flushSeen = /* @__PURE__ */ new Set();
  ctx.on("session/flush", (incoming) => {
    try {
      const { projectPath, session, sessionId } = resolveSessionContext(incoming);
      if (!projectPath) {
        const key = "nocwd:" + (sessionId || "?");
        if (!flushSeen.has(key)) {
          flushSeen.add(key);
          log("warn", "summarizer: session/flush \u62FF\u4E0D\u5230 cwd\uFF0Cshape=" + describeSessionShape(incoming));
        }
        return;
      }
      if (!flushSeen.has("ok:" + projectPath)) {
        flushSeen.add("ok:" + projectPath);
        log("info", "summarizer: session/flush \u93C8\u8DEF\u5DF2\u901A\uFF0Ccwd=" + projectPath + " messages=" + countSessionMessages(session) + "\uFF08\u7A7A\u9592\u5F8C\u5C07\u6458\u8981\uFF09");
      }
      scheduler.schedule({ projectPath, session, sessionId });
    } catch (e) {
      log("warn", "summarizer: flush listener failed: " + String(e && e.message || e));
    }
  });
  ctx.on("session/disposed", (incoming) => {
    try {
      const { projectPath, session, sessionId } = resolveSessionContext(incoming);
      if (!projectPath) {
        log("info", "summarizer: session/disposed without cwd, skip");
        return;
      }
      scheduler.cancel(projectPath);
      runSummary({ projectPath, session, sessionId }, "disposed");
    } catch (e) {
      log("warn", "summarizer: disposed listener failed: " + String(e && e.message || e));
    }
  });
  function runSummary({ projectPath, session, sessionId }, trigger) {
    try {
      if (!projectPath) return;
      log("info", `summarizer: ${trigger} \u89F8\u767C\uFF0Ccwd=${projectPath}`);
      const work = summarizeOne({
        fs,
        projectPath,
        sessionId,
        session,
        logger,
        llm: runtime.getLlm ? runtime.getLlm() : null,
        route: resolveSessionRoute(session),
        config: runtime.getMemoryConfig ? runtime.getMemoryConfig() : {}
      }).then(async (r) => {
        const files = r && r.files || [];
        const refreshRuntime = {
          getMemoryConfig: runtime.getMemoryConfig,
          getLlm: runtime.getLlm,
          llmRoute: resolveSessionRoute(session),
          sessionId,
          triggerFiles: files.slice(0, 20)
        };
        if (files.length && sourceChangeFiles(files)) {
          try {
            const light = await scanAndWrite(fs, sandboxPolicy, { path: projectPath, dryRun: false }, "auto_light_refresh", Object.assign({}, refreshRuntime, { architectureMode: "light" }));
            if (!light || !light.ok) log("warn", "summarizer: light refresh failed");
          } catch (e) {
            log("warn", "summarizer: light refresh failed: " + String(e && e.message || e));
          }
        }
        const triggerOptions = { changes: r && r.changes || [], entrypoints: r && r.entrypoints || [] };
        if (files.length && architectureTriggerFiles(files, triggerOptions)) {
          let refreshedOk = false;
          try {
            const refreshed = await scanAndWrite(
              fs,
              sandboxPolicy,
              { path: projectPath, dryRun: false },
              "auto_architecture_refresh",
              Object.assign({}, refreshRuntime, { architectureMode: "full" })
            );
            refreshedOk = Boolean(refreshed && refreshed.ok && !(refreshed.data && refreshed.data.architecture && refreshed.data.architecture.error));
            if (!refreshedOk) log("warn", "summarizer: architecture auto-refresh failed");
          } catch (e) {
            log("warn", "summarizer: architecture auto-refresh failed: " + String(e && e.message || e));
          }
          if (!refreshedOk) {
            const marked = await markArchitectureStale(fs, sandboxPolicy, projectPath, true);
            log(marked ? "info" : "warn", "summarizer: architectureStale=true " + (marked ? "written" : "write FAILED"));
          }
        }
        try {
          if (ctx && typeof ctx.emit === "function") {
            ctx.emit("project_brain/preview.changed", { projectPath });
          }
        } catch (e) {
        }
        return r;
      }).catch((e) => log("warn", "summarizer: failed: " + String(e && e.message || e)));
      if (typeof ctx.effect === "function") {
        try {
          ctx.effect(() => work, "dsh-project-brain:summarizer");
        } catch (e) {
        }
      }
    } catch (e) {
      log("warn", "summarizer: run failed: " + String(e && e.message || e));
    }
  }
}

// src/host/realtime-memory.js
init_brain_files();
var STRONG_SIGNAL_PATTERNS = [
  /(?:記住|記一下|備忘|別忘了|長期記住)\s*[:：]?\s*([^。\n]{4,200})/,
  /以後\s*([^。\n]{2,80})\s*(?:要|請|一定)?\s*(?:做|處理|記得|注意)/,
  /(?:remember|note that|don't forget|never forget|long-term remember)\s*[:：]?\s*([^.\n]{4,200})/i,
  /\b(always|never)\s+([a-z][^.\n]{4,150})/i
];
var WEAK_SIGNAL_PATTERNS = [
  /(?:以後都|以後請|以後記得|下次記得|下次注意|約定|規則是|從今往後|今後)\s*[:：,，]?\s*([^。\n]{4,150})/,
  /(?:記住這個|注意這個|留意一下|請注意)\s*[:：,，]?\s*([^。\n]{4,150})/,
  /\b(going forward|from now on|henceforth|note this|bear in mind|keep in mind)\b\s*[:：,，]?\s*([^.]{4,150})/i,
  /\b(let'?s (?:always|never))\b\s+([^.]{4,150})/i
];
var NEGATIVE_CONTEXTS = [
  /\b(?:eslint|prettier|type:|noqa|tsconfig|build\s*error|報錯|編譯|執行)\b/i,
  /\b(?:commit|push|pr|merge|git|分支)\b/i
];
function cleanRememberContent(text) {
  return String(text || "").replace(/^[,，、;；:：\s]+/, "").replace(/[,，、;；:：\s]+$/, "").trim();
}
function rememberTitle(content) {
  const t = cleanRememberContent(content);
  if (!t) return "\u4F7F\u7528\u8005\u8A18\u4F4F\u7684\u9577\u671F\u7D04\u675F";
  return t.length > 40 ? t.slice(0, 40) + "\u2026" : t;
}
function detectSignal(messageText) {
  const text = String(messageText || "").trim();
  if (text.length < 6 || text.length > 2e3) return null;
  for (const re of STRONG_SIGNAL_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    let content = cleanRememberContent(m[1] || m[2] || m[0]);
    if (content.length < 4 || content.length > 500) continue;
    return { kind: "explicit_intent", strength: "strong", content, fullText: text };
  }
  if (NEGATIVE_CONTEXTS.some((re) => re.test(text))) return null;
  for (const re of WEAK_SIGNAL_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    let content = cleanRememberContent(m[1] || m[2] || m[0]);
    if (content.length < 4 || content.length > 500) continue;
    return { kind: "explicit_intent", strength: "weak", content, fullText: text };
  }
  return null;
}
function messageToText(message) {
  if (!message) return "";
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((block) => block && (block.type === "text" || typeof block.text === "string")).map((block) => String(block.text || "")).join("\n");
  }
  return "";
}
function sessionCwd2(session) {
  if (!session) return null;
  try {
    if (typeof session.cwd === "string" && session.cwd.trim()) return session.cwd.trim();
    if (session.meta && typeof session.meta.cwd === "string" && session.meta.cwd.trim()) return session.meta.cwd.trim();
    if (session.header && typeof session.header.cwd === "string" && session.header.cwd.trim()) return session.header.cwd.trim();
    if (session.header && session.header.meta && typeof session.header.meta.cwd === "string" && session.header.meta.cwd.trim()) return session.header.meta.cwd.trim();
  } catch (e) {
  }
  return null;
}
var projectState = /* @__PURE__ */ new Map();
var MAX_PER_SESSION = 5;
var MAX_REFINE_CALLS = 12;
var CONTEXT_HEAD_MESSAGES = 4;
var CONTEXT_TAIL_MESSAGES = 10;
var CONTEXT_MAX_CHARS = 7e3;
var CONTEXT_PER_MESSAGE_CHARS = 1200;
var CONTEXT_GAP_MARK = "\uFF08\u2026\u2026\u4E2D\u9593\u7701\u7565\u82E5\u5E72\u8F2A\u2026\u2026\uFF09";
var REFINE_TIMEOUT_MS = 2e4;
var SUPERSEDE_JACCARD = 0.72;
var REFINE_TYPES = /* @__PURE__ */ new Set(["preference", "decision", "requirement", "architecture", "bug", "lesson"]);
function contextWindow(session) {
  try {
    const lines = sessionMessageLines(session, CONTEXT_PER_MESSAGE_CHARS);
    if (lines.length === 0) return "";
    let selected;
    if (lines.length <= CONTEXT_HEAD_MESSAGES + CONTEXT_TAIL_MESSAGES) {
      selected = lines;
    } else {
      selected = lines.slice(0, CONTEXT_HEAD_MESSAGES).concat([CONTEXT_GAP_MARK]).concat(lines.slice(-CONTEXT_TAIL_MESSAGES));
    }
    let text = selected.join("\n\n");
    if (text.length > CONTEXT_MAX_CHARS) {
      const budget = Math.max(200, Math.floor(CONTEXT_MAX_CHARS / selected.length) - 8);
      text = selected.map((line) => line.length > budget ? line.slice(0, budget) + "\u2026" : line).join("\n\n");
    }
    return text;
  } catch (e) {
    return "";
  }
}
function refinePrompt(triggerText, transcript) {
  return [
    "\u4F7F\u7528\u8005\u5728\u5C0D\u8A71\u88E1\u660E\u78BA\u8981\u6C42\u300C\u8A18\u4F4F\u300D\u67D0\u4EF6\u4E8B\u3002\u628A\u5B83\u6574\u7406\u6210\u4E00\u689D\u80FD\u812B\u96E2\u672C\u6B21\u5C0D\u8A71\u7368\u7ACB\u95B1\u8B80\u7684\u9577\u671F\u8A18\u61B6\u3002",
    "",
    "\u4F7F\u7528\u8005\u539F\u8A71\uFF08\u89F8\u767C\u8A9E\uFF09\uFF1A",
    triggerText,
    "",
    "\u5C0D\u8A71\u4E0A\u4E0B\u6587\uFF08\u6309\u6642\u9593\u5148\u5F8C\u6392\u5217\uFF1B\u82E5\u51FA\u73FE\u7701\u7565\u6A19\u8A18\uFF0C\u8AAA\u660E\u4E2D\u9593\u8F2A\u6B21\u672A\u63D0\u4F9B\uFF0C\u4F46\u9996\u5C3E\u90FD\u5728\uFF09\uFF1A",
    transcript || "\uFF08\u7121\u4E0A\u4E0B\u6587\uFF09",
    "",
    "\u8981\u6C42\uFF1A",
    "1. \u6D88\u89E3\u5168\u90E8\u6307\u4EE3\u3002\u6B63\u6587\u88E1\u4E0D\u5141\u8A31\u51FA\u73FE\u300C\u9019\u500B / \u90A3\u500B / \u4E0A\u9762\u8AAA\u7684 / \u9019\u6A23 / this / that\u300D\uFF0C\u4E00\u5F8B\u66FF\u63DB\u6210\u4E0A\u4E0B\u6587\u88E1\u5B83\u771F\u6B63\u6307\u7684\u6771\u897F\uFF08\u76EE\u6A19\u3001\u53E3\u5F91\u3001\u6280\u8853\u9078\u578B\u3001\u6A94\u540D\u7B49\uFF09\u3002",
    "2. \u6B63\u6587\u5BEB what + why\uFF1A\u4F7F\u7528\u8005\u8981\u6C42\u7684\u662F\u4EC0\u9EBC\u3001\u9069\u7528\u7BC4\u570D\u548C\u539F\u56E0\uFF0C2\u20134 \u53E5\uFF0C\u81EA\u5305\u542B\u3002",
    "3. \u4F7F\u7528\u8005\u8AAA\u300C\u9019\u500B\u5C0D\u8A71\u7684\u7B2C\u4E00\u53E5\u300D\u300C\u6700\u958B\u59CB\u8AAA\u7684\u300D\u6642\uFF0C\u6307\u7684\u5C31\u662F\u4E0A\u9762\u4E0A\u4E0B\u6587\u88E1\u6700\u65E9\u90A3\u689D USER \u8A0A\u606F\uFF1B\u8AAA\u300C\u525B\u624D\u8AAA\u7684\u300D\u5247\u6307\u6700\u5F8C\u5E7E\u689D\u3002\u6309\u9019\u500B\u7406\u89E3\u53BB\u53D6\u5167\u5BB9\u3002",
    "4. \u53EA\u6709\u4E0A\u4E0B\u6587\u88E1\u78BA\u5BE6\u6C92\u6709\u53EF\u5C0D\u61C9\u7684\u5167\u5BB9\u6642\uFF0Cresolved \u624D\u8FD4\u56DE false\u3002\u4E0D\u8981\u56E0\u70BA\u4E0D\u78BA\u5B9A\u5C31\u653E\u68C4\uFF0C\u4E5F\u4E0D\u8981\u7DE8\u9020\u3002",
    "5. title \u5BEB\u6210\u7AD9\u7ACB\u4E8B\u5BE6\u53E5\uFF0C\u4E0D\u8981\u5BEB\u6210\u300C\u8A18\u4F4F XXX\u300D\u300C\u4F7F\u7528\u8005\u8981\u6C42 XXX\u300D\u3002",
    "6. type\uFF1A\u5C0D\u5354\u4F5C\u65B9\u5F0F\u3001\u8F38\u51FA\u7D50\u69CB\u3001\u9577\u671F\u53E3\u5F91\u7684\u8981\u6C42\u7528 preference\uFF1B\u6280\u8853\u9078\u578B\u7528 decision\uFF1B\u5176\u9918\u6309\u8A9E\u7FA9\u9078\u3002",
    "",
    "\u8F38\u51FA\u683C\u5F0F\uFF08\u56B4\u683C\u9075\u5B88\uFF09\uFF1A\u7B2C\u4E00\u500B\u5B57\u5143\u5FC5\u9808\u662F {\uFF0C\u6700\u5F8C\u4E00\u500B\u5B57\u5143\u5FC5\u9808\u662F }\u3002",
    "\u4E0D\u8981\u5BEB\u4EFB\u4F55\u89E3\u91CB\u3001\u524D\u8A00\u3001\u7D50\u8A9E\uFF0C\u4E0D\u8981\u7528 Markdown \u7A0B\u5F0F\u78BC\u584A\u5305\u88F9\u3002",
    JSON.stringify({ resolved: true, type: "preference", title: "\u7AD9\u7ACB\u4E8B\u5BE6\u53E5", content: "\u81EA\u5305\u542B\u7684 what + why", importance: 0.8 })
  ].join("\n");
}
function repairPrompt(rawText) {
  return [
    "\u4E0B\u9762\u9019\u6BB5\u8F38\u51FA\u672C\u61C9\u662F\u56B4\u683C JSON\uFF0C\u4F46\u7121\u6CD5\u89E3\u6790\u3002\u8ACB\u539F\u6A23\u63D0\u53D6\u5176\u4E2D\u7684\u8CC7\u8A0A\uFF0C\u91CD\u65B0\u8F38\u51FA\u70BA\u5408\u6CD5 JSON\u3002",
    "\u7B2C\u4E00\u500B\u5B57\u5143\u5FC5\u9808\u662F {\uFF0C\u6700\u5F8C\u4E00\u500B\u5B57\u5143\u5FC5\u9808\u662F }\uFF0C\u4E0D\u8981\u4EFB\u4F55\u89E3\u91CB\u6216\u7A0B\u5F0F\u78BC\u584A\u6A19\u8A18\u3002",
    "\u6B04\u4F4D\uFF1A" + JSON.stringify({ resolved: true, type: "preference", title: "", content: "", importance: 0.8 }),
    "",
    "\u539F\u59CB\u8F38\u51FA\uFF1A",
    String(rawText || "").slice(0, 2e3)
  ].join("\n");
}
async function refineSignal({ llm, route, sessionId, signal, transcript, timeoutMs, log }) {
  if (!llm || typeof llm.stream !== "function" || !route || !route.provider || !route.model) {
    return { status: "llm_unavailable", candidate: null };
  }
  const ask = (prompt) => streamLlmText(llm, route, prompt, sessionId, timeoutMs || REFINE_TIMEOUT_MS, {
    system: "Resolve every deictic reference using the provided conversation. Return strict JSON only, with no prose before or after.",
    maxTokens: 1e3,
    purpose: "project-memory-realtime-refine"
  });
  let text;
  try {
    text = await ask(refinePrompt(signal.fullText || signal.content, transcript));
  } catch (e) {
    log("warn", "realtime-memory: refine failed: " + String(e && e.message || e));
    return { status: "refine_failed", candidate: null };
  }
  if (isMockLlmPayload(text)) return { status: "llm_unavailable", candidate: null };
  let parsed;
  try {
    parsed = parseArchitectureJson(text);
  } catch (e) {
    log("info", "realtime-memory: refine output unparseable, retrying once");
    try {
      parsed = parseArchitectureJson(await ask(repairPrompt(text)));
    } catch (retryError) {
      return { status: "refine_unparseable", candidate: null, sample: String(text || "").slice(0, 160) };
    }
  }
  if (!parsed || parsed.resolved !== true) {
    return {
      status: "unresolved",
      candidate: null,
      sample: "\u6A21\u578B\u5224\u5B9A\u7121\u6CD5\u6D88\u89E3\uFF1B\u4E0A\u4E0B\u6587\u8996\u7A97 " + String(transcript || "").length + " \u5B57\u5143"
    };
  }
  const type = normalizeMemoryType(parsed.type);
  const title = cleanRememberContent(parsed.title).slice(0, 120);
  const content = cleanRememberContent(parsed.content).slice(0, 800);
  if (!REFINE_TYPES.has(type) || !title || content.length < 12) {
    return { status: "refine_invalid", candidate: null };
  }
  if (hasUnresolvedReference(title, content, { maxSelfContainedChars: 0 })) {
    return { status: "unresolved", candidate: null };
  }
  const importance = Number(parsed.importance);
  return {
    status: "refined",
    candidate: {
      type,
      title,
      content,
      importance: Number.isFinite(importance) ? Math.min(0.95, Math.max(0.5, importance)) : 0.8,
      confidence: 0.85,
      resolved: true
    }
  };
}
function fallbackCandidate(signal) {
  const cleaned = cleanRememberContent(signal && signal.content);
  if (cleaned.length < 12) return null;
  if (hasUnresolvedReference(rememberTitle(cleaned), cleaned, { maxSelfContainedChars: 0 })) return null;
  return {
    type: "preference",
    title: rememberTitle(cleaned),
    content: cleaned,
    importance: 0.7,
    confidence: 0.6,
    resolved: false
  };
}
var REJECT_REASON_TEXT = {
  unresolved_reference: "\u6C92\u80FD\u5F9E\u4E0A\u4E0B\u6587\u88E1\u8A8D\u51FA\u300C\u9019\u500B / \u90A3\u500B\u300D\u6307\u7684\u662F\u4EC0\u9EBC",
  needs_context: "\u7F3A\u5C11\u53EF\u7528\u7684\u4E0A\u4E0B\u6587\uFF0C\u7121\u6CD5\u6574\u7406\u6210\u81EA\u5305\u542B\u7684\u8A18\u61B6"
};
var REFINE_STATUS_TEXT = {
  llm_unavailable: "\u7576\u524D Session \u9084\u6C92\u6709\u53EF\u8907\u7528\u7684\u6A21\u578B\u8DEF\u7531\uFF0C\u5148\u5B8C\u6210\u4E00\u6B21\u6B63\u5E38\u5C0D\u8A71\u518D\u8A66",
  refine_failed: "\u6574\u7406\u8A18\u61B6\u6642\u6A21\u578B\u547C\u53EB\u5931\u6557\uFF08\u8D85\u6642\u6216\u4E2D\u65B7\uFF09",
  refine_unparseable: "\u6A21\u578B\u5169\u6B21\u90FD\u6C92\u6309\u8981\u6C42\u8FD4\u56DE JSON",
  refine_invalid: "\u6A21\u578B\u8FD4\u56DE\u7684\u5167\u5BB9\u4E0D\u5B8C\u6574\uFF0C\u7F3A\u5C11\u6A19\u984C\u6216\u6B63\u6587"
};
var REJECT_NEXT_STEP = "\u53EF\u4EE5\u88DC\u4E00\u53E5\u66F4\u5177\u9AD4\u7684\u8AAA\u6CD5\uFF0C\u6216\u7B49\u672C\u6B21\u6703\u8A71\u7D50\u675F\u5F8C\u81EA\u52D5\u6B78\u7D0D\u3002";
async function noteRejection({ fs, projectPath, sessionId, signal, reason, refineStatus, sample }) {
  const now = Date.now();
  const trigger = String(signal.fullText || signal.content || "").slice(0, 120);
  const why = REFINE_STATUS_TEXT[refineStatus] || REJECT_REASON_TEXT[reason] || reason;
  try {
    await appendJsonl(fs, brainPath2(projectPath, "timeline.jsonl"), {
      id: makeId("evt", now),
      title: "\u672A\u8A18\u4F4F\uFF1A" + trigger,
      eventType: "memory_rejected",
      occurredAt: now,
      sessionId: sessionId || null,
      detail: why + "\u3002" + REJECT_NEXT_STEP,
      rejectReason: reason,
      refineStatus: refineStatus || null,
      // 模型到底返回了什麼，排查時比任何描述都有用。
      ...sample ? { sample } : {}
    });
  } catch (e) {
  }
}
var WEAK_SOURCE_KIND = "user_intent_weak";
var REALTIME_SOURCE_KINDS = /* @__PURE__ */ new Set(["user_explicit", WEAK_SOURCE_KIND]);
function findSupersedable(memories, candidate) {
  let best = null;
  let bestScore = 0;
  for (const m of memories || []) {
    if (!isRetrievableMemory(m) || m.type !== candidate.type) continue;
    if (!(m.source && REALTIME_SOURCE_KINDS.has(m.source.kind))) continue;
    const score = titleJaccard(m.title, candidate.title);
    if (score >= SUPERSEDE_JACCARD && score > bestScore) {
      best = m;
      bestScore = score;
    }
  }
  return best;
}
function getProjectState(projectPath) {
  let st = projectState.get(projectPath);
  if (!st) {
    st = { seenFingerprints: /* @__PURE__ */ new Set(), count: 0, refineCalls: 0, sessionStartAt: Date.now() };
    projectState.set(projectPath, st);
  }
  if (Date.now() - st.sessionStartAt > 30 * 60 * 1e3) {
    st.seenFingerprints.clear();
    st.count = 0;
    st.refineCalls = 0;
    st.sessionStartAt = Date.now();
  }
  return st;
}
async function handleOne({ fs, projectPath, sessionId, signal, session, llm, route, config = {}, logger }) {
  const log = (level, msg) => {
    try {
      if (logger && typeof logger[level] === "function") logger[level]("[dsh-project-brain] " + msg);
    } catch (e) {
    }
  };
  if (!signal) return { skipped: "no_signal" };
  const weak = signal.strength !== "strong";
  const brain = await readBrain(fs, projectPath);
  if (!brain.project || brain.project.__error) {
    log("info", "realtime-memory: project not initialized, skip");
    return { skipped: "not_initialized" };
  }
  const st = getProjectState(projectPath);
  if (st.count >= MAX_PER_SESSION) {
    log("info", "realtime-memory: rate limit reached for " + projectPath + ", skip");
    return { skipped: "rate_limit" };
  }
  if (st.refineCalls >= MAX_REFINE_CALLS) {
    log("info", "realtime-memory: refine budget exhausted for " + projectPath + ", skip");
    return { skipped: "refine_budget" };
  }
  st.refineCalls += 1;
  const transcript = contextWindow(session);
  const refined = await refineSignal({
    llm,
    route,
    sessionId,
    signal,
    transcript,
    timeoutMs: Number(config.realtimeMemoryTimeoutMs) || REFINE_TIMEOUT_MS,
    log
  });
  let candidate = refined.candidate;
  if (!candidate) {
    if (weak) {
      log("info", "realtime-memory: weak signal not resolvable (" + refined.status + "), skip");
      return { skipped: "weak_unresolved", refineStatus: refined.status };
    }
    const reason = refined.status === "unresolved" ? "unresolved_reference" : null;
    if (reason) {
      log("info", "realtime-memory: reference unresolved, deferring to session summary");
      await noteRejection({
        fs,
        projectPath,
        sessionId,
        signal,
        reason,
        refineStatus: refined.status,
        sample: refined.sample
      });
      return { skipped: reason, refineStatus: refined.status, noted: true };
    }
    candidate = fallbackCandidate(signal);
    if (!candidate) {
      log("info", "realtime-memory: no self-contained fact (" + refined.status + "), deferring to session summary");
      await noteRejection({
        fs,
        projectPath,
        sessionId,
        signal,
        reason: "needs_context",
        refineStatus: refined.status,
        sample: refined.sample
      });
      return { skipped: "needs_context", refineStatus: refined.status, noted: true };
    }
  }
  if (weak) {
    candidate = Object.assign({}, candidate, {
      confidence: Math.min(candidate.confidence, 0.7),
      importance: Math.min(candidate.importance, 0.7)
    });
  }
  const prior = findSupersedable(brain.memories, candidate);
  const result = await admitMemory({
    fs,
    projectPath,
    candidate: {
      type: candidate.type,
      title: candidate.title,
      content: candidate.content,
      importance: candidate.importance,
      confidence: candidate.confidence,
      tags: ["realtime", "user_intent", weak ? "weak_signal" : "strong_signal"],
      source: {
        kind: weak ? WEAK_SOURCE_KIND : "user_explicit",
        sessionId: sessionId || null,
        signalKind: signal.kind,
        refined: candidate.resolved === true,
        trigger: String(signal.fullText || signal.content).slice(0, 200),
        ...prior ? { supersedes: prior.id } : {}
      }
    },
    // 強訊號是使用者點名要記的，准入沒得商量；弱訊號是從語氣裡推斷的，走常規通道，
    // 但內容已經由上面那次提煉產出，不再重複問一遍模型。
    channel: weak ? "automatic" : "user_explicit",
    ...weak ? { llmConfirm: { admit: true, type: candidate.type } } : {},
    now: Date.now()
  });
  if (!result.ok) {
    log("info", "realtime-memory: admit refused " + (result.code || "") + " " + (result.reason || ""));
    await noteRejection({
      fs,
      projectPath,
      sessionId,
      signal,
      reason: result.reason || result.code || "rejected",
      refineStatus: refined.status
    });
    return { skipped: result.code || "rejected", refineStatus: refined.status, result, noted: true };
  }
  if (result.action === "skip") {
    return { skipped: "duplicate", id: result.id };
  }
  st.count += 1;
  log("info", "realtime-memory: admitted [" + candidate.type + '] "' + candidate.title + '"' + (refined.status === "refined" ? " (refined)" : " (verbatim)") + (result.supersedesId ? " supersedes=" + result.supersedesId : ""));
  return { appended: true, entry: result.entry, id: result.id, refineStatus: refined.status, supersedesId: result.supersedesId || null };
}
function setupRealtimeMemory(ctx, fs, sandboxPolicy, runtime = {}) {
  if (!ctx || typeof ctx.on !== "function") return;
  void sandboxPolicy;
  let logger = null;
  try {
    logger = ctx.logger || null;
  } catch (e) {
  }
  const log = (level, msg) => {
    try {
      if (logger && typeof logger[level] === "function") logger[level]("[dsh-project-brain] " + msg);
      else if (typeof console !== "undefined") console.log("[dsh-project-brain] " + msg);
    } catch (e) {
    }
  };
  log("info", "realtime-memory: subscribed to agent/inbox/claimed");
  ctx.on("agent/inbox/claimed", (payload) => {
    try {
      const message = payload && payload.message;
      if (!message || message.role !== "user") return;
      const text = messageToText(message);
      if (!text) return;
      const session = payload.agent && payload.agent.session;
      const projectPath = sessionCwd2(session);
      if (!projectPath) return;
      const sessionId = session && (session.id || session.meta && session.meta.id);
      const signal = detectSignal(text);
      if (!signal) return;
      const config = runtime.getMemoryConfig ? runtime.getMemoryConfig() : {};
      if (config.realtimeMemoryEnabled === false) return;
      const work = handleOne({
        fs,
        projectPath,
        sessionId,
        signal,
        session,
        logger,
        config,
        llm: runtime.getLlm ? runtime.getLlm() : null,
        route: resolveSessionRoute(session)
      }).then(async (result) => {
        if (result && (result.appended || result.noted) && ctx && typeof ctx.emit === "function") {
          try {
            ctx.emit("project_brain/preview.changed", { projectPath });
          } catch (e) {
          }
        }
        return result;
      }).catch((e) => log("warn", "realtime-memory: handler failed: " + String(e && e.message || e)));
      if (typeof ctx.effect === "function") {
        try {
          ctx.effect(() => work, "dsh-project-brain:realtime-memory");
        } catch (e) {
        }
      }
    } catch (e) {
      log("warn", "realtime-memory: listener failed: " + String(e && e.message || e));
    }
  });
}

// src/index.js
import { readFileSync as readFileSync4 } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join as join4 } from "node:path";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
function readPluginVersion() {
  try {
    const pkg = JSON.parse(readFileSync4(join4(__dirname, "..", "package.json"), "utf8"));
    if (pkg.version) return String(pkg.version);
  } catch (e) {
  }
  return "1.4.0";
}
var PLUGIN_VERSION = readPluginVersion();
var name = "dsh-project-brain";
var inject = ["tools", "fs", "sandboxPolicy", "connection", "sessions", "llm"];
var apply = (ctx, config) => {
  try {
    return applyImpl(ctx, config);
  } catch (e) {
    if (ctx && ctx.logger && typeof ctx.logger.error === "function") {
      try {
        ctx.logger.error("[dsh-project-brain] apply fatal:", String(e && e.message || e));
      } catch {
      }
    }
  }
};
function applyImpl(ctx, config) {
  function safeGet(name2) {
    try {
      return ctx[name2];
    } catch (e) {
      return void 0;
    }
  }
  const fs = safeGet("fs");
  const tools = safeGet("tools");
  const sandboxPolicy = safeGet("sandboxPolicy");
  const connection = safeGet("connection");
  const llm = safeGet("llm");
  const memoryRuntime = createMemoryConfigRuntime(ctx, config);
  const llmRuntime = createLlmRuntime(ctx, llm);
  const getDefaultProjectPath = () => {
    try {
      const root = sandboxPolicy && sandboxPolicy.workspaceRoot;
      if (typeof root === "string" && root.trim() && !/[\\/]DSH Desktop\\.app/i.test(root)) {
        return root;
      }
    } catch (e) {
    }
    return ".";
  };
  if (!fs || !tools) {
    if (ctx.logger && typeof ctx.logger.error === "function") {
      ctx.logger.error("[dsh-project-brain] required services (fs, tools) unavailable");
    }
    return;
  }
  const toolBuilders = [
    buildProjectInitTool,
    buildProjectRescanTool,
    buildContinueTool,
    buildSuggestTool,
    buildStatusTool,
    buildMemoryAddTool,
    buildMemoryListTool,
    buildMemoryArchiveTool,
    buildMemorySupersedeTool,
    buildTodoAddTool,
    buildTodoListTool,
    buildTodoDoneTool,
    buildTodoUpdateTool,
    buildAskTool,
    buildDreamTool,
    buildDiffTool,
    buildProjectExportTool,
    buildProjectImportTool,
    buildCleanupBackupsTool,
    buildRollbackBackupTool
  ];
  let registered = 0;
  for (let i = 0; i < toolBuilders.length; i++) {
    try {
      const tool = toolBuilders[i]({
        fs,
        sandboxPolicy,
        getMemoryConfig: memoryRuntime.get,
        resolveEmbeddingCredential: memoryRuntime.resolveCredential,
        getLlm: llmRuntime.get,
        pluginVersion: PLUGIN_VERSION
      });
      const disposer = tools.register(tool);
      registered += 1;
      if (ctx.effect) {
        try {
          ctx.effect(() => disposer, "dsh-project-brain:tool:" + (tool && tool.name ? tool.name : i));
        } catch (e) {
        }
      }
    } catch (e) {
      if (ctx.logger) try {
        ctx.logger.warn("[dsh-project-brain] tool register failed:", String(e && e.message || e));
      } catch {
      }
    }
  }
  let harness;
  try {
    harness = ctx.get ? ctx.get("harness") : ctx.harness;
  } catch (e) {
    harness = void 0;
  }
  if (ctx.logger && typeof ctx.logger.info === "function") {
    try {
      ctx.logger.info("[dsh-project-brain] [diagnose] harness available: " + (!!harness && typeof harness.handle === "function"));
    } catch (e) {
    }
  }
  try {
    const rpcDisposers = registerSidebarRpc({
      harness,
      ctx,
      fs,
      tools,
      getDefaultProjectPath,
      logger: ctx.logger
    });
    for (let i = 0; i < rpcDisposers.length; i++) {
      try {
        if (ctx.effect) ctx.effect(rpcDisposers[i], "dsh-project-brain:rpc:register:" + i);
      } catch (e) {
        if (ctx.logger) try {
          ctx.logger.warn("[dsh-project-brain] rpc effect " + i + " failed:", String(e && e.message || e));
        } catch {
        }
      }
    }
  } catch (e) {
    if (ctx.logger) try {
      ctx.logger.warn("[dsh-project-brain] sidebar RPC registration failed:", String(e && e.message || e));
    } catch {
    }
  }
  let connectionRpcMounted = false;
  const mountConnectionRpc = (rpcCtx) => {
    if (connectionRpcMounted) return;
    let rpcConnection;
    try {
      rpcConnection = rpcCtx && rpcCtx.connection ? rpcCtx.connection : connection;
    } catch (e) {
      rpcConnection = connection;
    }
    try {
      const mounted = registerConnectionRpc({
        connection: rpcConnection,
        ctx,
        fs,
        sandboxPolicy,
        tools,
        logger: ctx.logger,
        getMemoryConfig: memoryRuntime.get,
        updateSettings: memoryRuntime.updateSettings,
        settingsWritable: memoryRuntime.settingsWritable,
        getLlm: llmRuntime.get,
        resolveEmbeddingCredential: memoryRuntime.resolveCredential
      });
      if (mounted) connectionRpcMounted = true;
    } catch (e) {
      if (ctx.logger) try {
        ctx.logger.warn("[dsh-project-brain] connection RPC registration failed:", String(e && e.message || e));
      } catch {
      }
    }
  };
  if (typeof ctx.inject === "function") {
    try {
      ctx.inject(["connection", "webServer"], mountConnectionRpc);
    } catch (e) {
      mountConnectionRpc(ctx);
    }
  } else {
    mountConnectionRpc(ctx);
  }
  try {
    if (ctx.on) {
      ctx.on("project_brain/preview.changed", (payload) => {
        try {
          invalidateAggregatorCache(payload && payload.projectPath);
        } catch (e) {
        }
      });
    }
  } catch (e) {
    if (ctx.logger) try {
      ctx.logger.warn("[dsh-project-brain] event subscription failed:", String(e && e.message || e));
    } catch {
    }
  }
  try {
    if (typeof ctx.inject === "function") {
      ctx.inject(["systemPrompt"], (promptCtx) => setupInjector(promptCtx, fs, sandboxPolicy));
    } else {
      setupInjector(ctx, fs, sandboxPolicy);
    }
  } catch (e) {
    if (ctx.logger) try {
      ctx.logger.warn("[dsh-project-brain] setupInjector failed:", String(e && e.message || e));
    } catch {
    }
  }
  try {
    setupSummarizer(ctx, fs, sandboxPolicy, {
      getMemoryConfig: memoryRuntime.get,
      getLlm: llmRuntime.get
    });
  } catch (e) {
    if (ctx.logger) try {
      ctx.logger.warn("[dsh-project-brain] setupSummarizer failed:", String(e && e.message || e));
    } catch {
    }
  }
  try {
    setupRealtimeMemory(ctx, fs, sandboxPolicy, {
      getMemoryConfig: memoryRuntime.get,
      getLlm: llmRuntime.get
    });
  } catch (e) {
    if (ctx.logger) try {
      ctx.logger.warn("[dsh-project-brain] setupRealtimeMemory failed:", String(e && e.message || e));
    } catch {
    }
  }
  if (ctx.logger && typeof ctx.logger.info === "function") {
    try {
      ctx.logger.info("[dsh-project-brain] host loaded (runtime RPC, tools registered: " + registered + ")");
    } catch {
    }
  }
}
export {
  Config,
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
