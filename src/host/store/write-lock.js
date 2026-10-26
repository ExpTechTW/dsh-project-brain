// write-lock.js — 按 key 序列化寫入序列。
//
// 為什麼需要：DSH 的 fs 只有覆蓋寫，appendLine 是「讀全文 → 拼接 → 寫全文」，
// admit / housekeep / 人工編輯則是「讀整表 → 改 → 寫整表」。兩個併發的序列
// 會各自基於舊快照寫回，後寫的把先寫的抹掉，而且沒有任何報錯。
//
// 兩層 key，獲取順序永遠是「事務鎖 → 檔案鎖」，且兩者 key 不同，不會互相死鎖：
//   - 事務鎖 brainTxKey(projectPath, file)：包住整個讀-改-寫序列
//   - 檔案鎖 path：包住單次 append / 覆蓋寫
//
// 持鎖期間不要呼叫任何可能再取同一把鎖的函式（典型的是 buildWorkspacePreview →
// persistHousekeep）。真這麼寫了會被下面的重入檢測當場攔下，而不是靜默掛起。

import { AsyncLocalStorage } from "node:async_hooks";

const chains = new Map();

// 記錄當前非同步呼叫鏈已經持有哪些 key。持鎖期間再取同一把鎖 = 自己等自己，
// 表現是「操作其實成功了，但呼叫方永遠收不到返回」——最難查的那種 bug。
// 與其掛死，不如當場拋錯把呼叫路徑暴露出來。
const heldKeys = new AsyncLocalStorage();

export function withWriteLock(key, task) {
  const k = String(key || "default");
  const held = heldKeys.getStore();
  if (held && held.has(k)) {
    return Promise.reject(Object.assign(
      new Error("write-lock re-entered, would deadlock: " + k),
      { code: "E_WRITE_LOCK_REENTRY" },
    ));
  }
  const nextHeld = new Set(held || []);
  nextHeld.add(k);
  const run = () => heldKeys.run(nextHeld, task);

  const prev = chains.get(k);
  // 佇列空時直接跑，省掉一次微任務跳轉——序列呼叫是最常見的路徑。
  const result = prev ? prev.then(run) : (async () => run())();
  // 鏈上只傳遞「已完成」訊號併吞掉錯誤，否則一次失敗會毒化後面排隊的所有任務。
  // 順手清空閒置的 key，避免長時間執行後 Map 裡堆滿已完成的鏈。
  let tail;
  const settle = () => {
    if (chains.get(k) === tail) chains.delete(k);
  };
  tail = result.then(settle, settle);
  chains.set(k, tail);
  return result;
}

export function brainTxKey(projectPath, file) {
  return String(projectPath || "") + "::tx::" + String(file || "memory.jsonl");
}

// 僅供測試斷言用：正常執行時佇列應該很快排空。
export function pendingLockCount() {
  return chains.size;
}
