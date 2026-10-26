// bundle.js — zip bundle 匯出 / 解析 / 應用 / 預覽
//
// 物理格式：標準 ZIP（deflate 壓縮 + CRC32），無加密。
// 檔案結構：
//   dsh-brain-<name>-<ts>.zip
//   ├── manifest.json           ← schemaVersion / pluginVersion / sourceProject / checksum / options
//   └── .project-brain/
//       ├── project.json
//       ├── memory.jsonl
//       ├── todo.jsonl
//       ├── timeline.jsonl
//       ├── architecture.json
//       └── cache/...
//
// 設計要點：
//   - 無第三方依賴：手寫 zip（Local File Header + Central Directory + EOCD），CRC32 也手寫
//   - 使用 deflate 壓縮（node:zlib.deflateRawSync）— bundle 體積 < .project-brain 的 60%
//   - 排除項：.grill/, node_modules/, .git/, tmp-*.txt, *.log, debug.log
//   - manifest schemaVersion=1（向後相容錨點）

import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { assertSafeProjectPath } from "../store/brain-files.js";

// bundle.js 直接用 node:fs（不走 DSH fs service）：
//   - bundle 操作都在已知專案路徑內的 .project-brain/，路徑由 assertSafeProjectPath 校驗
//   - 不需要 sandboxPolicy（write 路徑都是 projectPath 內）
//   - 相容 smoke 測試（沒有 DSH fs 例項）
//   - 與 src/host/rebuild-sync.js / scripts/smoke-*.mjs 的 node:fs 直連保持一致

async function readJsonFile(filePath) {
  try {
    const text = await fsp.readFile(filePath, "utf8");
    let t = text;
    if (typeof t === "string" && t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
    return JSON.parse(t);
  } catch (e) {
    return { __error: String((e && e.message) || e) };
  }
}

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

const BUNDLE_SCHEMA_VERSION = 1;
const BUNDLE_EXCLUDED_TOP_DIRS = new Set([
  "node_modules", ".git", ".grill", "dist", "build",
  ".next", ".turbo", ".cache", "out", "coverage",
  ".pnpm-store",
]);
const BUNDLE_EXCLUDED_FILES = [
  /^tmp-.*\.txt$/i, /^debug\.log$/i, /\.log$/i, /\.tmp$/i,
];

// ─── CRC32（zip 必備，標準多項式 0xEDB88320） ───
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// DOS 時間（zip 用，解析度 2 秒）
function dosTime(date = new Date()) {
  const t = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((date.getSeconds() / 2) & 0x1F);
  const d = (((date.getFullYear() - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0x0F) << 5) | (date.getDate() & 0x1F);
  return { time: t & 0xFFFF, date: d & 0xFFFF };
}

// ─── 收集待打包檔案清單 ───
function sanitizeProjectName(name) {
  return String(name || "project")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60) || "project";
}

function tsString(date = new Date()) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${y}${mo}${d}-${h}${mi}`;
}

/**
 * 遞迴收集 .project-brain/ 下所有需要打包的檔案
 * 返回 [{ relPath: ".project-brain/project.json", absPath, size, sha256 }]
 */
async function collectBrainFiles(projectPath, { includeCache = true } = {}) {
  const base = path.join(projectPath, ".project-brain");
  const out = [];

  async function walk(dirAbs, relBase) {
    let entries;
    try {
      entries = await fsp.readdir(dirAbs, { withFileTypes: true });
    } catch (e) {
      return; // 目錄不存在則跳過（不拋錯）
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        // 隱藏檔案 / 隱藏目錄：跳過 .DS_Store, .DS-Backup, . 開頭 backup
        // 例外：.project-brain 內的子檔案都是合法的，不會有 . 開頭的；這裡只跳過 .DS_Store 等
        if (entry.name === ".DS_Store") continue;
        if (entry.name.startsWith(".backup")) continue;
      }
      const abs = path.join(dirAbs, entry.name);
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;

      // 排除 cache/（若 includeCache=false）
      if (!includeCache && rel.split("/")[0] === "cache") continue;

      // 排除特定檔名
      if (BUNDLE_EXCLUDED_FILES.some((rx) => rx.test(entry.name))) continue;

      if (entry.isDirectory()) {
        await walk(abs, rel);
      } else if (entry.isFile()) {
        try {
          const stat = await fsp.stat(abs);
          const buf = await fsp.readFile(abs);
          const sha = createHash("sha256").update(buf).digest("hex");
          out.push({
            relPath: `.project-brain/${rel}`,
            absPath: abs,
            size: stat.size,
            sha256: sha,
            _buf: buf, // 內部用，外部不匯出
          });
        } catch (e) { /* skip unreadable */ }
      }
    }
  }

  await walk(base, "");
  return out;
}

// ─── Zip 寫入器 ───
class ZipWriter {
  constructor() {
    /** @type {Buffer[]} */
    this.chunks = [];
    /** @type {{ name: string, crc: number, size: number, compSize: number, offset: number, mtime: {time:number, date:number}, isDir: boolean }[]} */
    this.central = [];
    this.offset = 0;
  }

  _push(buf) {
    this.chunks.push(buf);
    this.offset += buf.length;
  }

  addFile(name, data, mtime = new Date()) {
    const nameBuf = Buffer.from(name, "utf8");
    const dt = dosTime(mtime);
    const crc = crc32(data);
    const raw = Buffer.from(data); // copy（data 可能是共享 Buffer）
    const compressed = deflateRawSync(raw, { level: 6 });
    // 極端情況下壓縮後更大（極小檔案），fallback 到 store
    const useDeflate = compressed.length < raw.length;
    const compData = useDeflate ? compressed : raw;
    const method = useDeflate ? 8 : 0;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);   // signature
    localHeader.writeUInt16LE(20, 4);            // version needed
    localHeader.writeUInt16LE(0x0800, 6);        // general purpose bit flag: UTF-8 names
    localHeader.writeUInt16LE(method, 8);        // compression method
    localHeader.writeUInt16LE(dt.time, 10);      // last mod time
    localHeader.writeUInt16LE(dt.date, 12);      // last mod date
    localHeader.writeUInt32LE(crc, 14);          // CRC32
    localHeader.writeUInt32LE(compData.length, 18); // compressed size
    localHeader.writeUInt32LE(raw.length, 22);   // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // file name length
    localHeader.writeUInt16LE(0, 28);            // extra field length

    const headerOffset = this.offset;
    this._push(localHeader);
    this._push(nameBuf);
    this._push(compData);

    this.central.push({
      name, nameBuf, crc, size: raw.length, compSize: compData.length,
      offset: headerOffset, mtime: dt, method,
    });
  }

  finalize() {
    const cdStart = this.offset;
    let cdSize = 0;
    for (const e of this.central) {
      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0);          // signature
      cd.writeUInt16LE(20, 4);                   // version made by
      cd.writeUInt16LE(20, 6);                   // version needed
      cd.writeUInt16LE(0x0800, 8);               // general purpose bit flag: UTF-8 names
      cd.writeUInt16LE(e.method, 10);            // compression method
      cd.writeUInt16LE(e.mtime.time, 12);
      cd.writeUInt16LE(e.mtime.date, 14);
      cd.writeUInt32LE(e.crc, 16);
      cd.writeUInt32LE(e.compSize, 20);
      cd.writeUInt32LE(e.size, 24);
      cd.writeUInt16LE(e.nameBuf.length, 28);    // file name length
      cd.writeUInt16LE(0, 30);                   // extra field length
      cd.writeUInt16LE(0, 32);                   // file comment length
      cd.writeUInt16LE(0, 34);                   // disk number start
      cd.writeUInt16LE(0, 36);                   // internal file attributes
      cd.writeUInt32LE(0, 38);                   // external file attributes
      cd.writeUInt32LE(e.offset, 42);            // relative offset of local header
      this._push(cd);
      this._push(e.nameBuf);
      cdSize += cd.length + e.nameBuf.length;
    }

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);                    // disk number
    eocd.writeUInt16LE(0, 6);                    // disk with cd
    eocd.writeUInt16LE(this.central.length, 8);  // entries on disk
    eocd.writeUInt16LE(this.central.length, 10); // total entries
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdStart, 16);
    eocd.writeUInt16LE(0, 20);                   // comment length
    this._push(eocd);

    return Buffer.concat(this.chunks);
  }
}

// ─── Zip 解析器（最小化：只讀 EOCD + Central Directory，提取檔案資料） ───
async function parseZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) {
    throw new Error("E_BUNDLE_INVALID: not a zip file");
  }
  // 找 EOCD（從末尾搜 signature 0x06054b50）
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("E_BUNDLE_INVALID: EOCD not found");

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdSize = buf.readUInt32LE(eocdOffset + 12);
  const cdStart = buf.readUInt32LE(eocdOffset + 16);

  // 遍歷 Central Directory
  const entries = [];
  let p = cdStart;
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) {
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
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");
    entries.push({ name, method, crc, compSize, size, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  // 提取每個 entry 的檔案資料
  const files = [];
  for (const e of entries) {
    // 讀 Local File Header
    const lhSig = buf.readUInt32LE(e.localOffset);
    if (lhSig !== 0x04034b50) throw new Error("E_BUNDLE_INVALID: bad local header");
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
    // 校驗 CRC32
    const actualCrc = crc32(data);
    if (actualCrc !== e.crc) {
      throw new Error(`E_BUNDLE_INVALID: CRC32 mismatch on ${e.name}`);
    }
    files.push({ name: e.name, data, size: e.size, crc: e.crc });
  }

  return files;
}

function isSafeBundleEntry(name) {
  const n = String(name || "").replace(/\\/g, "/");
  if (n === "manifest.json") return true;
  if (!n.startsWith(".project-brain/")) return false;
  const rest = n.slice(".project-brain/".length);
  if (!rest) return false;
  const parts = rest.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return false;
  if (/^[A-Za-z]:/.test(rest) || rest.startsWith("/")) return false;
  return true;
}

/**
 * 構造 bundle zip 的 Buffer（不寫盤）
 */
export async function buildBundleBuffer({ projectPath, pluginVersion, includeCache = true }) {
  const safePath = assertSafeProjectPath(projectPath);
  const projectMeta = await readJsonFile(path.join(safePath, ".project-brain", "project.json"));
  if (!projectMeta || projectMeta.__error) {
    const err = new Error("專案未初始化，請先呼叫 project_init");
    err.code = "E_BRAIN_NOT_FOUND";
    throw err;
  }

  const files = await collectBrainFiles(safePath, { includeCache });
  if (files.length === 0) {
    const err = new Error(".project-brain 目錄為空");
    err.code = "E_BRAIN_EMPTY";
    throw err;
  }

  // 構建 manifest
  const checksum = { algorithm: "sha256", files: {} };
  for (const f of files) {
    // manifest 裡的 path 用相對 .project-brain 的路徑（不帶字首）
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
      lastScannedAt: projectMeta.lastScannedAt || projectMeta.updatedAt || null,
    },
    checksum,
    options: { includeCache },
    fileCount: files.length,
  };

  // 構建 zip
  const zw = new ZipWriter();
  const mtime = new Date(exportedAt);
  // manifest 必須先入 zip（約定俗成）
  zw.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"), mtime);
  for (const f of files) {
    zw.addFile(f.relPath, f._buf, mtime);
  }
  const buf = zw.finalize();

  return {
    buffer: buf,
    manifest,
    fileCount: files.length,
    sizeBytes: buf.length,
  };
}

/**
 * 預設 bundle 檔名
 */
export function defaultBundleName(projectMeta) {
  const name = sanitizeProjectName(projectMeta && projectMeta.name);
  return `dsh-brain-${name}-${tsString()}.zip`;
}

/**
 * 打包並寫到磁碟。Dashboard RPC 必須走這條路徑：
 * tools.execute 在 DSH Connection 裡可以返回 ok 卻不真正跑 tool.execute，
 * 結果就是「匯出成功 / 未寫出檔案」。
 */
export async function writeBundleFile({ projectPath, outputPath, pluginVersion, includeCache = true }) {
  if (!outputPath || typeof outputPath !== "string") {
    const err = new Error("outputPath 必填");
    err.code = "E_BUNDLE_WRITE_FAILED";
    throw err;
  }
  const built = await buildBundleBuffer({ projectPath, pluginVersion, includeCache });
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(outputPath, built.buffer);
  let st;
  try {
    st = await fsp.stat(outputPath);
  } catch (e) {
    const err = new Error("zip 寫入後無法讀取：" + outputPath + "（" + String((e && e.message) || e) + "）");
    err.code = "E_BUNDLE_WRITE_FAILED";
    throw err;
  }
  if (!st.isFile() || st.size <= 0) {
    const err = new Error("zip 寫入後文件無效：" + outputPath);
    err.code = "E_BUNDLE_WRITE_FAILED";
    throw err;
  }
  return {
    bundlePath: outputPath,
    bundleName: path.basename(outputPath),
    defaultDirPath: path.dirname(outputPath),
    sizeBytes: st.size,
    fileCount: built.fileCount,
    manifest: built.manifest,
  };
}

/**
 * 解析 bundle：讀 zip → 校驗 manifest → 校驗 checksum
 * @returns {Promise<{ manifest, files: Map<string, Buffer> }>}
 */
export async function parseBundle(bundlePath) {
  let buf;
  try {
    buf = await fsp.readFile(bundlePath);
  } catch (e) {
    const err = new Error(`bundle 檔案不存在或不可讀：${bundlePath}`);
    err.code = "E_BUNDLE_NOT_FOUND";
    throw err;
  }

  let files;
  try {
    files = await parseZip(buf);
  } catch (e) {
    const err = new Error("bundle 檔案損壞或格式無效");
    err.code = "E_BUNDLE_INVALID";
    err.detail = e.message;
    throw err;
  }

  const manifestEntry = files.find((f) => f.name === "manifest.json");
  if (!manifestEntry) {
    const err = new Error("bundle 缺少 manifest.json");
    err.code = "E_BUNDLE_INVALID";
    err.detail = "manifest.json not found";
    throw err;
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestEntry.data.toString("utf8"));
  } catch (e) {
    const err = new Error("bundle manifest.json 解析失敗");
    err.code = "E_BUNDLE_INVALID";
    err.detail = e.message;
    throw err;
  }

  if (!manifest.schemaVersion || manifest.schemaVersion > BUNDLE_SCHEMA_VERSION) {
    const err = new Error(
      `bundle 由更新版本 dsh-project-brain v${manifest.pluginVersion || "?"} 匯出，` +
      `當前外掛僅支援 schemaVersion<=${BUNDLE_SCHEMA_VERSION}，請先升級外掛再匯入。`
    );
    err.code = "E_BUNDLE_SCHEMA_UNSUPPORTED";
    err.detail = `bundle.schemaVersion=${manifest.schemaVersion}, supported<=${BUNDLE_SCHEMA_VERSION}`;
    throw err;
  }

  // 校驗每個檔案的 sha256
  const fileMap = new Map();
  for (const f of files) {
    const zipName = String(f.name || "").replace(/\\/g, "/");
    if (!isSafeBundleEntry(zipName)) {
      const err = new Error("bundle 含有非法路徑（禁止寫到 .project-brain/ 之外）：" + zipName);
      err.code = "E_BUNDLE_INVALID";
      err.detail = "zip-slip:" + zipName;
      throw err;
    }
    if (zipName === "manifest.json") continue;
    const sha = createHash("sha256").update(f.data).digest("hex");
    const relInside = zipName.replace(/^\.project-brain\//, "");
    const expected = manifest.checksum && manifest.checksum.files && manifest.checksum.files[relInside];
    if (expected && expected !== sha) {
      const err = new Error(`bundle 檔案 ${relInside} 校驗和不一致`);
      err.code = "E_BUNDLE_CHECKSUM_MISMATCH";
      err.detail = `expected=${expected}, actual=${sha}`;
      throw err;
    }
    fileMap.set(zipName, f.data);
  }

  // 校驗 project.json 是否在 manifest checksum 中
  if (!fileMap.has(".project-brain/project.json")) {
    const err = new Error("bundle 缺少 .project-brain/project.json");
    err.code = "E_BUNDLE_INVALID";
    err.detail = "project.json not found";
    throw err;
  }

  return { manifest, files: fileMap };
}

/**
 * 預覽：解析 bundle + 讀當前腦 → 返回 impact
 */
export async function previewBundle({ bundlePath, destProjectPath }) {
  const safeDest = assertSafeProjectPath(destProjectPath);
  const { manifest, files } = await parseBundle(bundlePath);

  const currentBrain = {
    exists: false,
    projectId: null,
    memCount: 0,
    todoCount: 0,
    timelineCount: 0,
    archExists: false,
  };

  try {
    const currentProject = await readJsonFile(path.join(safeDest, ".project-brain", "project.json"));
    if (currentProject && !currentProject.__error) {
      currentBrain.exists = true;
      currentBrain.projectId = currentProject.id || null;
      const mems = await readJsonlFile(path.join(safeDest, ".project-brain", "memory.jsonl"));
      const todos = await readJsonlFile(path.join(safeDest, ".project-brain", "todo.jsonl"));
      const tline = await readJsonlFile(path.join(safeDest, ".project-brain", "timeline.jsonl"));
      currentBrain.memCount = mems.length;
      currentBrain.todoCount = todos.length;
      currentBrain.timelineCount = tline.length;
      try {
        await fsp.access(path.join(safeDest, ".project-brain", "architecture.json"));
        currentBrain.archExists = true;
      } catch (e) {}
    }
  } catch (e) { /* 讀不到就當作空 */ }

  const incomingProjectBuf = files.get(".project-brain/project.json");
  let incomingProject = null;
  try {
    incomingProject = JSON.parse(incomingProjectBuf.toString("utf8"));
  } catch (e) {}
  const incomingMemBuf = files.get(".project-brain/memory.jsonl");
  const incomingMemCount = incomingMemBuf
    ? incomingMemBuf.toString("utf8").split("\n").filter((l) => l.trim()).length
    : 0;
  const incomingTodoBuf = files.get(".project-brain/todo.jsonl");
  const incomingTodoCount = incomingTodoBuf
    ? incomingTodoBuf.toString("utf8").split("\n").filter((l) => l.trim()).length
    : 0;
  const incomingTimelineBuf = files.get(".project-brain/timeline.jsonl");
  const incomingTimelineCount = incomingTimelineBuf
    ? incomingTimelineBuf.toString("utf8").split("\n").filter((l) => l.trim()).length
    : 0;

  return {
    manifest,
    currentBrain,
    incoming: {
      projectId: incomingProject ? incomingProject.id : null,
      memCount: incomingMemCount,
      todoCount: incomingTodoCount,
      timelineCount: incomingTimelineCount,
    },
    rootPathRewrite: {
      from: incomingProject ? incomingProject.rootPath : null,
      to: safeDest,
    },
    backupWillCreateAt: currentBrain.exists
      ? path.join(safeDest, (await import("./backup.js")).generateBackupName())
      : null,
  };
}

/**
 * 應用 bundle：備份 → 解壓 → 改寫 rootPath → 觸發 rescan
 */
export async function applyBundle({
  bundlePath,
  destProjectPath,
  backupPath = null,
  triggerRescan = true,
}) {
  const safeDest = assertSafeProjectPath(destProjectPath);
  const { manifest, files } = await parseBundle(bundlePath);

  const brainDir = path.join(safeDest, ".project-brain");
  let actualBackupPath = null;
  let rescanTriggered = false;

  // 1) 備份當前腦（若存在）——走 backup.js，目錄名才能被 list/rollback 識別
  const brainExists = await fsp.stat(brainDir).then(() => true).catch(() => false);
  if (brainExists) {
    const { createBackup } = await import("./backup.js");
    const r = await createBackup({ projectPath: safeDest });
    actualBackupPath = r.backupPath;
  }

  // 2) 寫新腦
  await fsp.mkdir(brainDir, { recursive: true });
  for (const [relPath, data] of files.entries()) {
    const zipName = String(relPath || "").replace(/\\/g, "/");
    if (!isSafeBundleEntry(zipName) || zipName === "manifest.json") continue;
    if (!zipName.startsWith(".project-brain/")) continue;
    const relInside = zipName.replace(/^\.project-brain\//, "");
    const abs = path.join(brainDir, relInside);
    const resolved = path.resolve(abs);
    const brainRoot = path.resolve(brainDir) + path.sep;
    if (resolved !== path.resolve(brainDir) && !resolved.startsWith(brainRoot)) continue;
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, data);
  }

  // 3) 改寫 project.json.rootPath
  const projectPath = path.join(brainDir, "project.json");
  try {
    const projBuf = await fsp.readFile(projectPath, "utf8");
    const proj = JSON.parse(projBuf);
    proj.rootPath = safeDest;
    proj.updatedAt = Date.now();
    if (!proj.lastScannedAt) proj.lastScannedAt = proj.updatedAt;
    await fsp.writeFile(projectPath, JSON.stringify(proj, null, 2));
  } catch (e) {
    // 改寫失敗不算致命，import 已經完成
  }

  // 4) rescan 觸發（非同步，不拋錯）
  if (triggerRescan) {
    rescanTriggered = true; // 標記已觸發（實際由呼叫方排程）
  }

  return {
    backupPath: actualBackupPath,
    rescanTriggered,
    fileCount: files.size,
    sourceManifest: {
      schemaVersion: manifest.schemaVersion,
      pluginVersion: manifest.pluginVersion,
      sourceProjectId: manifest.sourceProject && manifest.sourceProject.id,
      sourceRootPath: manifest.sourceProject && manifest.sourceProject.rootPath,
    },
  };
}

// 暴露給 smoke 測試的內部函式
export const _internal = {
  crc32,
  ZipWriter,
  parseZip,
  collectBrainFiles,
  dosTime,
  sanitizeProjectName,
  tsString,
  isSafeBundleEntry,
};
