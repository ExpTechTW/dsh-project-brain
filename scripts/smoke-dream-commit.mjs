// Dream / housekeep：禁止 Jaccard merge-and-drop；changelog 歸檔但保留行；超額 Core → dormant。

import { housekeepMemories } from "../src/host/memory/admit.js";
import { isCoreMemory, makeMemoryEntry } from "../src/host/store/brain-logic.js";

const now = Date.now();
const old = now - 60 * 86400000;

let pass = 0;
let fail = 0;
const check = (name, ok) => { if (ok) { console.log(`  [PASS] ${name}`); pass++; } else { console.log(`  [FAIL] ${name}`); fail++; } };

const similar = [
  makeMemoryEntry({ id: "mem-m1", type: "decision", title: "採用 build-time embed 走靜態 client 架構", content: "webServer live fetch 在 static plugin fiber 下不可用，詳細分析見設計文件。", importance: 0.7 }, now - 86400000),
  makeMemoryEntry({ id: "mem-m2", type: "decision", title: "採用 build-time embed 走靜態 client 架構", content: "同樣的長期架構約束，第二條正文也足夠長以通過規則門。", importance: 0.5 }, now - 86400000),
  makeMemoryEntry({ id: "mem-m3", type: "decision", title: "採用 build-time embed 走靜態 client 架構", content: "第三條仍然是同一條架構決策的重複表述，自動路徑不得刪除。", importance: 0.6 }, now - 86400000),
];
const changelog = makeMemoryEntry({
  id: "mem-c1", type: "change",
  title: "v1.2.0 patch #3：同步倉庫",
  content: "git 快進 main 並驗收 156/156，這是 changelog 不是長期事實。",
}, now);
const durable = makeMemoryEntry({
  id: "mem-h1", type: "lesson",
  title: "DSH host bundle 不會自動熱過載",
  content: "改 host 程式碼必須重啟 DSH Desktop，不要指望熱更新。",
  importance: 0.85,
}, now - 7 * 86400000);

console.log("=== similar titles are not deleted ===");
const similarHk = housekeepMemories(similar.concat([durable]), { now });
const similarIds = new Set(similarHk.rows.map((m) => m.id));
check("all similar rows kept", similarIds.has("mem-m1") && similarIds.has("mem-m2") && similarIds.has("mem-m3"));
check("no merge action applied", !(similarHk.actions || []).some((a) => a.action === "merge"));
check("similar titles reported as suggest_supersede", (similarHk.actions || []).some((a) => a.action === "suggest_supersede"));

console.log("=== changelog archived, row kept ===");
const ch = housekeepMemories([changelog, durable], { now });
const c1 = ch.rows.find((m) => m.id === "mem-c1");
check("changelog row still present", Boolean(c1));
check("changelog status archived", c1 && c1.status === "archived");
check("archiveReason backfill_rule", c1 && c1.archiveReason === "backfill_rule");
check("durable lesson stays core", isCoreMemory(ch.rows.find((m) => m.id === "mem-h1")));

console.log("=== cap evicts excess active, never deletes ===");
// 顯式給上限，測的是淘汰行為本身，不跟著預設配置走。
const CAP = { maxItems: 15, maxTokens: 800 };
const OVER = CAP.maxItems + 1;
const many = [];
for (let i = 0; i < OVER; i++) {
  many.push(makeMemoryEntry({
    id: "mem-cap-" + i,
    type: "decision",
    title: "長期決策 " + i,
    content: "這是一條仍然成立的專案決策，用來撐滿 Core 上限。編號 " + i,
    importance: i === 0 ? 0.2 : 0.8,
  }, now - (OVER - i) * 86400000));
}
const capped = housekeepMemories(many, { now, limits: CAP });
check("row count unchanged", capped.rows.length === OVER);
check("some dormant", capped.rows.some((m) => m.status === "dormant"));
check("core <= cap", capped.rows.filter(isCoreMemory).length <= CAP.maxItems);
check("lowest importance evicted", capped.rows.find((m) => m.id === "mem-cap-0").status === "dormant");

console.log("=== no-op does not claim change ===");
const again = housekeepMemories(capped.rows, { now, limits: CAP });
check("second housekeep unchanged", again.changed === false);

console.log("=== full mode must not vacuum archived ===");
const afterFull = housekeepMemories(ch.rows, { now });
check("archived changelog still on disk after housekeep", afterFull.rows.some((m) => m.id === "mem-c1" && m.status === "archived"));

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
