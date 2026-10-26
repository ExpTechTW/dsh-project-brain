// confirm-tokens.js — 記憶體級 confirmToken 儲存（dryRun → apply 兩步機制）
//
// 用法：
//   const tokenStore = createTokenStore({ ttlMs: 5 * 60 * 1000 });
//   const token = tokenStore.issue({ kind: "import", payload: {...} });
//   tokenStore.consume(token, { kind: "import" });  // 校驗通過返回 payload，否則返回 null
//
// 設計：
//   - 記憶體級（重啟失效，呼叫方需重新 dryRun）
//   - 5 分鐘 TTL（預設），過期自動清理
//   - 一次性（consume 後刪除）
//   - 繫結 kind（"import" / "rollback"），不同操作不互通
//   - 32-char hex（node:crypto randomBytes）

import { randomBytes } from "node:crypto";

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 分鐘

export function createTokenStore({ ttlMs = DEFAULT_TTL_MS } = {}) {
  /** @type {Map<string, { kind: string, payload: any, createdAt: number }>} */
  const store = new Map();

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
      store.delete(token); // 一次性
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
      // 順帶清理過期
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
    },
  };
}

// 單例：程序級共享一個 store（多個 Tool 協作）
let _singleton = null;
export function getTokenStore() {
  if (!_singleton) _singleton = createTokenStore();
  return _singleton;
}

// 測試 / 重新初始化（僅供單測使用）
export function _resetTokenStoreForTest() {
  _singleton = createTokenStore();
}
