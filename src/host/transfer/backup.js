// backup.js — 本地備份管理：建立 / 列舉 / 清理 / 回滾
//
// 資料佈局（在專案根目錄下，與 .project-brain/ 平級）：
//   <projectRoot>/
//   ├── .project-brain/
//   └── .project-brain.backup-<yyyymmdd-hhmm>-<sss>/
//       └── （原 .project-brain/ 全部內容）
//
// 設計要點：
//   - 用 node:fs/promises（host 程序可訪問）做 rename（fs service 沒有 rename/remove）
//   - 備份目錄命名帶毫秒避免衝突
//   - 列舉時統計每條 backup 的體積 / 記錄數（用於 UI 展示）
//   - 清理支援兩種策略：keepLast（保留最近 N 個）+ olderThanMs（按時間）
//   - 回滾前先備份當前腦（確保可逆）

import { promises as fsp } from "node:fs";
import path from "node:path";
import { assertSafeProjectPath } from "../store/brain-files.js";
import { getTokenStore } from "./confirm-tokens.js";

// 直接用 node:fs（理由同 bundle.js）
async function readJsonlFile(filePath) {
  try {
    const text = await fsp.readFile(filePath, "utf8");
    const out = [];
    for (const line of text.split("\n")) {
      const s = line.trim();
      if (!s) continue;
      try { out.push(JSON.parse(s)); } catch (e) { /* skip */ }
    }
    return out;
  } catch (e) { return []; }
}

async function readJsonFile(filePath) {
  try {
    const text = await fsp.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch (e) { return { __error: String((e && e.message) || e) }; }
}

// 備份目錄名：
//   新：.project-brain.backup-yyyymmdd-hhmmss-mmm   （spec：20260915-143022-345）
//   舊：.project-brain.backup-yyyymmdd-hhmm-mmm     （v1.3.1 開發期漏了秒，列舉時仍識別）
const BACKUP_DIR_RE = /^\.project-brain\.backup-(\d{8})-(\d{6})-(\d{3})$/;
const BACKUP_DIR_RE_LEGACY = /^\.project-brain\.backup-(\d{8})-(\d{4})-(\d{3})$/;

/**
 * 生成備份目錄名（年月日 + 時分秒 + 毫秒，避免衝突）
 */
function generateBackupName(now = new Date()) {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `.project-brain.backup-${y}${mo}${d}-${h}${mi}${s}-${ms}`;
}

/**
 * 從目錄名提取 ts。新格式優先，舊 HHMM 格式相容。
 * 帶 `-<n>` 衝突字尾的名字返回 null（那種目錄回滾不了，必須避免生成）。
 */
function matchBackupDir(name) {
  if (typeof name !== "string") return null;
  const neu = name.match(BACKUP_DIR_RE);
  if (neu) return { ts: `${neu[1]}-${neu[2]}-${neu[3]}`, legacy: false };
  const old = name.match(BACKUP_DIR_RE_LEGACY);
  if (old) return { ts: `${old[1]}-${old[2]}-${old[3]}`, legacy: true };
  return null;
}

function extractTsFromDirName(name) {
  const m = matchBackupDir(name);
  return m ? m.ts : null;
}

/**
 * 建立備份：rename .project-brain/ → .project-brain.backup-<ts>/
 *
 * @param {{ projectPath: string, customTs?: string }} args
 *   customTs 用於回滾場景（指定時間戳避免衝突）；預設用當前時間
 * @returns {Promise<{ backupPath: string, backupName: string, ts: string, sizeBytes: number }>}
 */
export async function createBackup({ projectPath, customTs = null }) {
  const safe = assertSafeProjectPath(projectPath);
  const brainDir = path.join(safe, ".project-brain");

  let brainStat;
  try {
    brainStat = await fsp.stat(brainDir);
  } catch (e) {
    const err = new Error("當前專案無腦可備份（.project-brain 不存在）");
    err.code = "E_BRAIN_NOT_FOUND";
    throw err;
  }
  if (!brainStat.isDirectory()) {
    const err = new Error(".project-brain 不是目錄");
    err.code = "E_BRAIN_NOT_FOUND";
    throw err;
  }

  // 生成不衝突的目錄名
  let backupName = customTs ? `.project-brain.backup-${customTs}` : generateBackupName();
  let backupPath = path.join(safe, backupName);
  let attempt = 0;
  while (true) {
    try {
      await fsp.access(backupPath);
      attempt += 1;
      if (attempt > 50) {
        const err = new Error("備份目錄衝突次數過多，請稍後再試");
        err.code = "E_BACKUP_CONFLICT";
        throw err;
      }
      // 重名 → 加 1ms 再生成，絕不追加 -<n>（會破壞目錄名正則，回滾找不到）
      backupName = generateBackupName(new Date(Date.now() + attempt));
      backupPath = path.join(safe, backupName);
    } catch (e) {
      if (e && e.code === "E_BACKUP_CONFLICT") throw e;
      break; // access 拋 NOT_FOUND → 名字可用
    }
  }

  await fsp.mkdir(path.dirname(backupPath), { recursive: true });
  await fsp.rename(brainDir, backupPath);

  // 統計體積
  const sizeBytes = await dirSize(backupPath);

  return {
    backupName,
    backupPath,
    ts: extractTsFromDirName(backupName) || null,
    sizeBytes,
    createdAt: brainStat.mtimeMs || Date.now(),
  };
}

/**
 * 遞迴統計目錄體積（位元組）
 */
async function dirSize(dir) {
  let total = 0;
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (e) { return 0; }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      total += await dirSize(abs);
    } else if (e.isFile()) {
      try { total += (await fsp.stat(abs)).size; } catch (_) {}
    }
  }
  return total;
}

/**
 * 列舉所有備份目錄，按 ts 倒序
 */
export async function listBackups({ projectPath }) {
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
    } catch (_) { /* 不完整的備份也算，標記 projectExists=false */ }
    out.push({
      ts,
      backupName: e.name,
      backupPath,
      sizeBytes,
      memCount,
      todoCount,
      timelineCount,
      projectExists,
      createdAt,
    });
  }
  out.sort((a, b) => (b.ts > a.ts ? 1 : b.ts < a.ts ? -1 : 0));
  return out;
}

/**
 * 清理備份
 *
 * @param {{ projectPath: string, keepLast?: number, olderThanMs?: number }} args
 *   - keepLast: 保留最近 N 個（按 ts 倒序）；預設 3
 *   - olderThanMs: 刪除 createdAt 超過此毫秒數的；預設 30 天
 *   兩者取交集：既不在"最近 N"也滿足"超過 X 毫秒"才刪
 */
export async function cleanupBackups({
  projectPath,
  keepLast = 3,
  olderThanMs = 30 * 24 * 60 * 60 * 1000,
}) {
  const safe = assertSafeProjectPath(projectPath);
  const all = await listBackups({ projectPath: safe });
  const now = Date.now();
  const candidates = [];
  const kept = [];
  for (let i = 0; i < all.length; i++) {
    const b = all[i];
    const isRecent = i < keepLast;
    const isOld = (now - (b.createdAt || 0)) > olderThanMs;
    if (isRecent && !isOld) {
      kept.push(b);
    } else {
      candidates.push(b);
    }
  }
  // 預設仍保留 keepLast 個（即使老的也保留）
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
      // 刪除失敗跳過
    }
  }
  return {
    candidates: candidates.map((b) => b.backupPath),
    deleted: deleted.map((b) => b.backupPath),
    kept: kept.map((b) => b.backupPath),
  };
}

/**
 * 預覽回滾：檢查 backup 是否存在、讀取元資訊、計算 pre-rollback backup 路徑
 */
export async function previewRollback({ projectPath, backupTimestamp }) {
  const safe = assertSafeProjectPath(projectPath);
  if (!backupTimestamp || !matchBackupDir(`.project-brain.backup-${backupTimestamp}`)) {
    const err = new Error(`備份時間戳格式無效：${backupTimestamp}（期望 yyyymmdd-hhmmss-mmm，相容舊版 hhmm-mmm）`);
    err.code = "E_BACKUP_INVALID";
    throw err;
  }
  const backupName = `.project-brain.backup-${backupTimestamp}`;
  const backupPath = path.join(safe, backupName);

  let backupStat;
  try {
    backupStat = await fsp.stat(backupPath);
  } catch (e) {
    const err = new Error(`備份不存在：${backupName}`);
    err.code = "E_BACKUP_NOT_FOUND";
    throw err;
  }
  if (!backupStat.isDirectory()) {
    const err = new Error(`備份不是目錄：${backupName}`);
    err.code = "E_BACKUP_INVALID";
    throw err;
  }

  // 校驗 backup 完整性
  const mems = await readJsonlFile(path.join(backupPath, "memory.jsonl"));
  const todos = await readJsonlFile(path.join(backupPath, "todo.jsonl"));
  const tline = await readJsonlFile(path.join(backupPath, "timeline.jsonl"));
  const projectMeta = await readJsonFile(path.join(backupPath, "project.json"));
  if (!projectMeta || projectMeta.__error) {
    const err = new Error(`備份缺少或損壞 project.json：${backupName}`);
    err.code = "E_BACKUP_INVALID";
    throw err;
  }

  // 當前腦資訊
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
        lastUpdateAt: stat.mtimeMs || null,
      };
    }
  } catch (e) {
    currentBrain = { exists: false };
  }

  // 計算"先備份當前腦"的目錄名
  const willBackupCurrentTo = currentBrain && currentBrain.exists
    ? path.join(safe, generateBackupName())
    : null;

  return {
    sourceBackup: {
      ts: backupTimestamp,
      backupName,
      backupPath,
      createdAt: backupStat.mtimeMs || null,
      sizeBytes: await dirSize(backupPath),
      memCount: mems.length,
      todoCount: todos.length,
      timelineCount: tline.length,
    },
    currentBrain,
    willBackupCurrentTo,
  };
}

/**
 * 應用回滾：
 *   1) 若當前腦存在 → 先備份一次（pre-rollback backup）
 *   2) 刪除當前腦
 *   3) rename backup → 當前腦
 *   4) 觸發 rescan（標記，由呼叫方排程）
 */
export async function applyRollback({ projectPath, backupTimestamp, triggerRescan = true }) {
  const safe = assertSafeProjectPath(projectPath);
  const preview = await previewRollback({ projectPath: safe, backupTimestamp });

  let preRollbackBackupPath = null;
  const brainDir = path.join(safe, ".project-brain");

  // 1) pre-rollback backup
  if (preview.currentBrain && preview.currentBrain.exists) {
    const r = await createBackup({ projectPath: safe });
    preRollbackBackupPath = r.backupPath;
  }

  // 2) 確保當前腦不存在（可能被 backup 後 rename 走了）
  try {
    await fsp.access(brainDir);
    // 還在 → 刪除
    await fsp.rm(brainDir, { recursive: true, force: true });
  } catch (e) {
    // 不存在，跳過
  }

  // 3) rename backup → 當前腦
  await fsp.rename(preview.sourceBackup.backupPath, brainDir);

  return {
    restoredFrom: preview.sourceBackup.backupPath,
    preRollbackBackupPath,
    rescanTriggered: !!triggerRescan,
  };
}

// 暴露 confirmToken 入口（在 transfer/bundle.js 複用此模式）
export async function issueRollbackConfirmToken({ projectPath, backupTimestamp }) {
  const preview = await previewRollback({ projectPath, backupTimestamp });
  return getTokenStore().issue({ kind: "rollback", payload: { backupTimestamp, preview } });
}

export async function issueImportConfirmToken({ bundlePath, destProjectPath }) {
  const { previewBundle } = await import("./bundle.js");
  const preview = await previewBundle({ bundlePath, destProjectPath });
  return getTokenStore().issue({
    kind: "import",
    payload: { bundlePath, destProjectPath, preview },
  });
}

export { generateBackupName, extractTsFromDirName, matchBackupDir, BACKUP_DIR_RE, BACKUP_DIR_RE_LEGACY };
