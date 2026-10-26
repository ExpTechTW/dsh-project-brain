// access.js — 記錄記憶被檢索命中的時間。
//
// 沒有這個回寫，lastAccessedAt 永遠只在歸檔/替換時被寫一次，
// 於是一條反覆被 project_ask 查到的 dormant 記憶會一直沉著：
// 排序看的是 updatedAt，淘汰看的是 importance，兩邊都感知不到「常用」。

import { brainPath, readJsonl, writeJsonl } from "../store/brain-files.js";
import { brainTxKey, withWriteLock } from "../store/write-lock.js";

// 同一條記憶在這個視窗內重複命中只記一次，避免一輪對話裡連續幾次 ask
// 就把整個 memory.jsonl 重寫好幾遍。
export const ACCESS_THROTTLE_MS = 5 * 60 * 1000;
const MAX_ACCESS_COUNT = 9999;

export function applyAccessTouch(rows, ids, now = Date.now(), throttleMs = ACCESS_THROTTLE_MS) {
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
      accessCount: Math.min(MAX_ACCESS_COUNT, (Number(m.accessCount) || 0) + 1),
    });
  });
  return { changed: touched.length > 0, rows: next, touched };
}

// 檢索是隻讀操作，這裡的寫入不該讓 ask 失敗。呼叫方直接忽略返回的 error 即可。
export async function recordMemoryAccess({ fs, projectPath, ids, now = Date.now() } = {}) {
  if (!fs || !projectPath || !ids || ids.length === 0) return { changed: false, touched: [] };
  try {
    return await withWriteLock(brainTxKey(projectPath, "memory.jsonl"), async () => {
      const file = brainPath(projectPath, "memory.jsonl");
      const rows = await readJsonl(fs, file);
      const result = applyAccessTouch(rows, ids, now);
      if (!result.changed) return { changed: false, touched: [] };
      const wrote = await writeJsonl(fs, file, result.rows);
      return { changed: wrote, touched: result.touched };
    });
  } catch (e) {
    return { changed: false, touched: [], error: String((e && e.message) || e) };
  }
}
