// brain-files.js - .project-brain/ 檔案訪問層（基於 DSH fs 服務介面卡）
// 供 Host tools 使用；與 scripts/*.mjs（node:fs 直連）保持相同資料格式。
//
// DSH fs 服務介面（tools 實際可用面）：
//   fs.resolve(path, { cwd? }) -> target
//   fs.readText(target) / fs.writeText(target, content)
//   fs.listDir(target)
// 本模組只依賴 resolve/readText/writeText（+ 可選 mkdir），全部容錯。
//
// fs 只有覆蓋寫，所以每次 append 都是讀全文再寫全文。writeText / appendLine
// 都按路徑序列化，保證單個檔案上的寫入不會互相覆蓋。

import { withWriteLock } from "./write-lock.js";

export function assertSafeProjectPath(projectPath) {
  const rawBase = typeof projectPath === "string" ? projectPath.trim() : "";
  if (!rawBase || rawBase === "." || rawBase.includes("\u0000") || rawBase === "/" || /^[A-Za-z]:[\\/]?$/.test(rawBase)
    || /[\\/]Programs[\\/]DSH Desktop$/i.test(rawBase) || /[\\/]DSH Desktop\.app(?:[\\/]|$)/.test(rawBase)) {
    const error = new Error("Refusing Project Brain access without a concrete workspace root");
    error.code = "E_UNSAFE_PROJECT_PATH";
    throw error;
  }
  return rawBase.replace(/[\\/]+$/, "");
}

export function brainPath(projectPath, file) {
  const base = assertSafeProjectPath(projectPath);
  const relativeFile = String(file || "").replace(/\\/g, "/");
  if (!relativeFile || relativeFile.startsWith("/") || relativeFile.split("/").includes("..")) {
    const error = new Error("Refusing Project Brain path outside .project-brain");
    error.code = "E_UNSAFE_BRAIN_FILE";
    throw error;
  }
  return base + "/.project-brain/" + relativeFile;
}

export async function readText(fs, path) {
  try {
    const target = await fs.resolve(path);
    return await fs.readText(target);
  } catch (e) {
    return null;
  }
}

// v0.3.7：預設取 danger-full-access policy
//   如果呼叫方沒傳 writePolicy 且 fs 上有 sandboxPolicy（host fiber），
//   自動解析 danger-full-access mode（繞過 workspace 路徑限制）。
//   node fs adapter（測試/CLI 指令碼）無 sandboxPolicy → 返回 null（不限）。
function resolveWritePolicy(fs, writePolicy) {
  if (writePolicy) return writePolicy;
  try {
    const sp = fs && (fs.sandboxPolicy || (fs.ctx && fs.ctx.sandboxPolicy));
    if (sp && typeof sp.resolve === "function") {
      try { return sp.resolve({ mode: "danger-full-access" }); } catch (e) {}
    }
  } catch (e) {}
  return null;
}

// 不加鎖的底層覆蓋寫。只有已經持有同一把檔案鎖的呼叫方（appendLine）可以直接用它。
async function writeTextRaw(fs, path, content, writePolicy) {
  const policy = resolveWritePolicy(fs, writePolicy);
  try {
    try {
      const idx = path.lastIndexOf("/");
      if (idx > 0 && typeof fs.mkdir === "function") {
        const dirTarget = await fs.resolve(path.slice(0, idx));
        if (policy && fs.mkdir.length >= 2) {
          try { await fs.mkdir(dirTarget, { recursive: true }, { sandboxPolicy: policy }); } catch (e) {}
        } else if (policy) {
          try { await fs.mkdir(dirTarget, { recursive: true }); } catch (e) {}
        } else {
          try { await fs.mkdir(dirTarget, { recursive: true }); } catch (e) {}
        }
      }
    } catch (e) { /* ignore */ }
    const target = await fs.resolve(path);
    // fs.writeText(target, content, expected?, signal?, sandboxPolicy?)
    // 顯式傳 policy 作為第 5 引數
    if (policy) {
      try { await fs.writeText(target, content, undefined, undefined, policy); return true; }
      catch (e) { /* fallthrough: try without policy */ }
    }
    await fs.writeText(target, content);
    return true;
  } catch (e) {
    return false;
  }
}

export async function writeText(fs, path, content, writePolicy) {
  return withWriteLock(path, () => writeTextRaw(fs, path, content, writePolicy));
}

// v0.4.0：appendLine — 直接追加單行內容到檔案末尾（避免 O(N) 反序列化）
//   DSH fs service 沒暴露原生 appendFile，但 writeText 是覆蓋寫。
//   最佳化方案：先 readText 拿當前內容（跳過 parseJsonl 反序列化），補換行，
//   再調 writeText 寫"原文 + 新內容"。大檔案下仍 O(N) 但避開 JSON.parse/stringify CPU 開銷。
//   注意：仍非真 O(1)；要 O(1) 必須用 shell service spawn 子程序調 node:fs.appendFileSync（DSH Desktop sandbox 可能攔截）。
//
// 行為保證：
//   - 檔案不存在 → 直接 writeText(line)
//   - 檔案末尾有 "\n" → 直接 writeText(oldContent + line)
//   - 檔案末尾無 "\n" → writeText(oldContent + "\n" + line)（修補換行）
//   - line 必須自帶 "\n" 結尾（appendJsonl 呼叫方保證）
export async function appendLine(fs, path, line, writePolicy) {
  if (line == null) return false;
  // 確保 line 以 \n 結尾（但不強制要求 — 相容空行）
  const normalizedLine = String(line).endsWith("\n") ? String(line) : String(line) + "\n";
  // 讀全文和寫全文之間不能插進別的寫入，否則併發 append 會互相覆蓋。
  return withWriteLock(path, async () => {
    try {
      const target = await fs.resolve(path);
      let existing = null;
      try { existing = await fs.readText(target); } catch (e) { /* 檔案不存在或不可讀 → 當作空 */ }
      let next;
      if (existing == null || existing === "") {
        // 檔案不存在或空 → 直接寫 line
        next = normalizedLine;
      } else if (existing.endsWith("\n")) {
        // 檔案末尾有換行 → 直接拼接
        next = existing + normalizedLine;
      } else {
        // 檔案末尾無換行 → 補換行（邊界保護）
        next = existing + "\n" + normalizedLine;
      }
      // 已經持有這把檔案鎖，必須走不加鎖的底層寫，否則自己等自己。
      return writeTextRaw(fs, path, next, writePolicy);
    } catch (e) {
      return false;
    }
  });
}

export function parseJsonl(text) {
  if (!text) return [];
  // 去 BOM（UTF-8 BOM 0xFEFF 或 \\r），trim 也清不掉的字元
  let t = String(text);
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  const out = [];
  for (const line of t.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try { out.push(JSON.parse(s)); } catch (e) { /* skip bad line */ }
  }
  return out;
}

export function serializeJsonl(items) {
  if (!items || items.length === 0) return "";
  return items.map((i) => JSON.stringify(i)).join("\n") + "\n";
}

export async function readJsonl(fs, path) {
  return parseJsonl(await readText(fs, path));
}

// v0.4.0：appendJsonl — 寫一條 JSONL entry（用 appendLine 最佳化版本）
//   舊實現：readJsonl（O(N) parse）+ push + serializeJsonl + writeText（O(N) serialize）= O(N) + 2× 反序列化開銷
//   新實現：appendLine（只 readText 拿原內容 + 直接拼接新行）= O(N) 一次讀 + 一次寫，避開 JSON parse/stringify
//   行為相容：呼叫方無需改動；檔案格式不變；併發安全（DSH 單執行緒 host fiber serialize 呼叫）
export async function appendJsonl(fs, path, entry, writePolicy) {
  return appendLine(fs, path, JSON.stringify(entry) + "\n", writePolicy);
}

// 覆蓋寫整個 jsonl（dream commit / batch archive 用）
// items 已按呼叫方要求排好；不主動 normalize / sort。
export async function writeJsonl(fs, path, items, writePolicy) {
  return writeText(fs, path, serializeJsonl(items || []), writePolicy);
}

export async function readJson(fs, path) {
  const text = await readText(fs, path);
  if (text == null) return null;
  // 去 BOM（\uFEFF）
  let t = text;
  if (typeof t === "string" && t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  try {
    return JSON.parse(t);
  } catch (e) {
    return { __error: String((e && e.message) || e) };
  }
}

export async function writeJson(fs, path, obj, writePolicy) {
  return writeText(fs, path, JSON.stringify(obj, null, 2), writePolicy);
}

// 一次讀齊 .project-brain 四類資料（project / timeline / memory / todo）
export async function readBrain(fs, projectPath) {
  const [project, timeline, memories, todos] = await Promise.all([
    readJson(fs, brainPath(projectPath, "project.json")),
    readJsonl(fs, brainPath(projectPath, "timeline.jsonl")),
    readJsonl(fs, brainPath(projectPath, "memory.jsonl")),
    readJsonl(fs, brainPath(projectPath, "todo.jsonl")),
  ]);
  return { projectPath: projectPath, project: project, timeline: timeline, memories: memories, todos: todos };
}
