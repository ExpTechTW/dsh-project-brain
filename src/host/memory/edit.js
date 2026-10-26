// edit.js — 人工維護記憶的純邏輯層（編輯 / 歸檔 / 恢復 / 永久刪除）。
//
// 與 admit.js 的分工：admit 管「機器寫入」，要過規則門和模型確認；
// 這裡管「人工修正」，使用者是權威，只攔明顯壞掉的輸入（空標題、正文過短、非法列舉）。
// 全部是純函式：接收 rows，返回新 rows，IO 由呼叫方（RPC / tool）負責。

import { enforceCoreCap, maxPinnedCount, memoryFingerprint, pinnedMemories } from "./admit.js";
import { isRetrievableMemory, normalizeMemoryType } from "../store/brain-logic.js";

// 人工可直接切換的狀態。archived 走歸檔動作，superseded 由 supersede 鏈維護，都不在表單裡。
export const EDITABLE_STATUSES = ["active", "dormant"];
export const RESTORABLE_STATUSES = ["archived", "superseded", "deleted"];
export const MIN_EDITED_CONTENT_CHARS = 12;
export const MAX_EDITED_TITLE_CHARS = 200;
export const MAX_EDITED_CONTENT_CHARS = 4000;

function fail(code, message) {
  return { ok: false, code, message };
}

// id 可以給字首（UI 傳完整 id，tool 可能只給前幾位）。includeArchived 決定歸檔條目算不算命中。
export function findMemoryById(rows, idPrefix, { includeArchived = false } = {}) {
  const needle = String(idPrefix || "").trim();
  if (!needle) return fail("E_NO_ID", "id 必填");
  const pool = (rows || []).filter((m) => m && m.id && (includeArchived || isRetrievableMemory(m)));
  const matches = pool.filter((m) => m.id === needle || m.id.indexOf(needle) === 0);
  if (matches.length === 0) return fail("E_NOT_FOUND", "未找到 id=" + needle + " 的記憶");
  if (matches.length > 1) return fail("E_AMBIGUOUS_ID", "id=" + needle + " 匹配到 " + matches.length + " 條，請提供更精確的 id");
  return { ok: true, entry: matches[0] };
}

function normalizeTags(value, previous) {
  if (value === undefined) return previous;
  if (!Array.isArray(value)) return previous;
  const out = [];
  for (const tag of value) {
    const clean = String(tag == null ? "" : tag).trim().slice(0, 50);
    if (clean && out.indexOf(clean) < 0) out.push(clean);
    if (out.length >= 10) break;
  }
  return out;
}

// 只接受表單裡那幾個欄位；id / createdAt / source.kind 一律保留，改錯字不該變成另一條記憶。
export function applyMemoryEdit(rows, { id, patch = {}, now = Date.now(), limits } = {}) {
  const found = findMemoryById(rows, id);
  if (!found.ok) return found;
  const target = found.entry;

  const next = Object.assign({}, target);

  if (patch.title !== undefined) {
    const title = String(patch.title).trim();
    if (!title) return fail("E_NO_TITLE", "標題不能為空");
    next.title = title.slice(0, MAX_EDITED_TITLE_CHARS);
  }
  if (patch.content !== undefined) {
    const content = String(patch.content).trim();
    if (content.length < MIN_EDITED_CONTENT_CHARS) {
      return fail("E_CONTENT_TOO_SHORT", "正文至少 " + MIN_EDITED_CONTENT_CHARS + " 個字元");
    }
    next.content = content.slice(0, MAX_EDITED_CONTENT_CHARS);
  }
  if (patch.type !== undefined) {
    const type = normalizeMemoryType(patch.type);
    if (!type) return fail("E_INVALID_TYPE", "記憶型別不合法");
    next.type = type;
  }
  if (patch.importance !== undefined) {
    const importance = Number(patch.importance);
    if (!Number.isFinite(importance) || importance < 0 || importance > 1) {
      return fail("E_INVALID_IMPORTANCE", "重要性必須是 0~1 之間的數字");
    }
    next.importance = Math.round(importance * 100) / 100;
  }
  if (patch.status !== undefined) {
    const status = String(patch.status).trim();
    if (EDITABLE_STATUSES.indexOf(status) < 0) {
      return fail("E_INVALID_STATUS", "狀態只能是 " + EDITABLE_STATUSES.join(" / "));
    }
    next.status = status;
  }
  if (patch.pinned !== undefined) {
    const pinned = patch.pinned === true;
    if (pinned && target.pinned !== true) {
      // 置頂配額留一半給自動寫入，否則淘汰時挑不出victim，置頂這條保證就形同虛設。
      const cap = maxPinnedCount(limits);
      const current = pinnedMemories(rows).filter((m) => m.id !== target.id).length;
      if (current >= cap) {
        return fail("E_PIN_LIMIT", "置頂最多 " + cap + " 條，請先取消其他置頂");
      }
    }
    if (pinned) next.pinned = true;
    else delete next.pinned;
  }
  const tags = normalizeTags(patch.tags, target.tags);
  if (tags && tags.length) next.tags = tags;
  else delete next.tags;

  const unchanged = ["title", "content", "type", "importance", "status"].every((key) => next[key] === target[key])
    && (next.pinned === true) === (target.pinned === true)
    && JSON.stringify(next.tags || []) === JSON.stringify(target.tags || []);
  if (unchanged) return { ok: true, changed: false, rows: (rows || []).slice(), entry: target };

  // fingerprint 是 type+title+content 的雜湊，正文改了不重算的話去重會認錯人。
  next.source = Object.assign({}, target.source || {}, {
    fingerprint: memoryFingerprint(next),
    editedBy: "user",
    editedAt: now,
  });
  next.updatedAt = now;

  const replaced = (rows || []).map((m) => (m && m.id === target.id ? next : m));
  // 手動啟用一條記憶時，該被擠出 Core 的是別人，不是它自己。
  const capped = enforceCoreCap(replaced, { pinnedIds: [target.id], now, limits });
  return { ok: true, changed: true, rows: capped.rows, entry: next, previous: target };
}

export function applyMemoryStatus(rows, { id, status, reason = "", now = Date.now(), limits } = {}) {
  // 歸檔態的條目也要能被命中，否則「恢復」和「重複歸檔」都會撞上 E_NOT_FOUND。
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
    // 恢復時把歸檔/替換的痕跡清掉，否則 housekeep 下一輪又按舊理由把它歸回去。
    delete next.archiveReason;
    delete next.supersededBy;
    delete next.supersededReason;
  }

  const replaced = (rows || []).map((m) => (m && m.id === target.id ? next : m));
  if (status !== "active") return { ok: true, changed: true, rows: replaced, entry: next, previous: target };
  const capped = enforceCoreCap(replaced, { pinnedIds: [target.id], now, limits });
  return { ok: true, changed: true, rows: capped.rows, entry: next, previous: target };
}

// 物理刪行。會打斷 supersededBy 指向鏈，所以呼叫方必須做二次確認。
export function applyMemoryDelete(rows, { id } = {}) {
  const found = findMemoryById(rows, id, { includeArchived: true });
  if (!found.ok) return found;
  const target = found.entry;
  const remaining = (rows || []).filter((m) => !(m && m.id === target.id));
  // 被刪掉的那條如果是別人的替代者，留著懸空指標會讓 UI 顯示「已被替換」卻找不到替代者。
  const cleaned = remaining.map((m) => {
    if (!m || m.supersededBy !== target.id) return m;
    const copy = Object.assign({}, m);
    delete copy.supersededBy;
    return copy;
  });
  return { ok: true, changed: true, rows: cleaned, entry: target };
}
