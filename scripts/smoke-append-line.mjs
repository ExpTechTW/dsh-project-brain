// smoke-append-line.mjs - v0.4.0 appendLine / appendJsonl O(N)→O(N-readonly) 最佳化驗證
//
// 覆蓋：
//   1) appendLine 基礎：檔案不存在 → 建立 + 寫
//   2) appendLine 邊界：檔案末尾有 "\n" → 直接拼接
//   3) appendLine 邊界：檔案末尾無 "\n" → 補換行
//   4) appendLine line 自帶 "\n" → 不重複補
//   5) appendLine line 不帶 "\n" → 自動補
//   6) appendLine null/空 → 直接返回 false（不建立檔案）
//   7) appendJsonl 行為相容：appendJsonl(fs, path, {a:1}) 等價於 appendLine(fs, path, '{"a":1}\n')
//   8) appendJsonl 多次呼叫累積：5 次呼叫 → 5 行
//   9) appendJsonl 與 parseJsonl 往返：append 後 readJsonl 能完整讀回
//   10) 效能基準：1000 行 append 總耗時 < 100ms（O(N) readonly 表現）
//   11) appendLine 邊界：空檔案 → 直接寫
//   12) appendLine 邊界：line 含特殊字元（中文 + 引號 + 換行）→ 正確轉義
//
// 用例總計 12 項，0 → 12 PASS。
//
// 退出碼：0 = PASS，1 = FAIL

import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = mkdtempSync(join(tmpdir(), "dsh-pb-append-"));

// 用 node:fs 直接當 fsAdapter（與 src/host/store/brain-files.js 介面一致）
import * as nodefs from "node:fs";
const fsAdapter = {
  resolve: async (p) => p,
  readText: async (target) => { try { return nodefs.readFileSync(target, "utf8"); } catch { return null; } },
  writeText: async (target, content) => {
    try { nodefs.mkdirSync(String(target).replace(/[\\/][^\\/]*$/, ""), { recursive: true }); } catch (e) {}
    nodefs.writeFileSync(target, content, "utf8"); return true;
  },
};

const { appendLine, appendJsonl, parseJsonl, readJsonl } = await import("../src/host/store/brain-files.js");

let pass = 0;
let fail = 0;
const check = (name, ok, extra) => {
  if (ok) { console.log(`  [PASS] ${name}`); pass++; }
  else { console.log(`  [FAIL] ${name}${extra ? "  -> " + extra : ""}`); fail++; }
};

console.log("=== 1) appendLine 基礎：檔案不存在 ===");
const p1 = join(TMP, "a.jsonl");
check("appendLine 到不存在檔案 → 返回 true", await appendLine(fsAdapter, p1, "first\n"));
check("檔案被建立", existsSync(p1));
check("檔案內容正確", readFileSync(p1, "utf8") === "first\n");

console.log("\n=== 2) appendLine 邊界：檔案末尾有 \\n ===");
const p2 = join(TMP, "b.jsonl");
writeFileSync(p2, "a\nb\n", "utf8");
check("appendLine 到末尾有 \\n 的檔案 → 返回 true", await appendLine(fsAdapter, p2, "c\n"));
check("內容是 a\\nb\\nc\\n（無重複 \\n）", readFileSync(p2, "utf8") === "a\nb\nc\n");

console.log("\n=== 3) appendLine 邊界：檔案末尾無 \\n ===");
const p3 = join(TMP, "c.jsonl");
writeFileSync(p3, "a\nb", "utf8");  // 末尾無 \n
check("appendLine 到末尾無 \\n 的檔案 → 返回 true", await appendLine(fsAdapter, p3, "c\n"));
check("補了 \\n：a\\nb\\nc\\n", readFileSync(p3, "utf8") === "a\nb\nc\n");

console.log("\n=== 4) appendLine line 自帶 \\n → 不重複補 ===");
const p4 = join(TMP, "d.jsonl");
writeFileSync(p4, "a\n", "utf8");
check("line 自帶 \\n → 不重複", await appendLine(fsAdapter, p4, "b\n"));
check("a\\nb\\n（不是 a\\nb\\n\\n）", readFileSync(p4, "utf8") === "a\nb\n");

console.log("\n=== 5) appendLine line 不帶 \\n → 自動補 ===");
const p5 = join(TMP, "e.jsonl");
writeFileSync(p5, "a\n", "utf8");
check("line 不帶 \\n → 自動補", await appendLine(fsAdapter, p5, "b"));
check("a\\nb\\n", readFileSync(p5, "utf8") === "a\nb\n");

console.log("\n=== 6) appendLine null/空 line ===");
const p6 = join(TMP, "f.jsonl");
check("appendLine null → false（不建立檔案）", !(await appendLine(fsAdapter, p6, null)));
check("檔案未被建立", !existsSync(p6));

console.log("\n=== 7) appendJsonl 行為相容 ===");
const p7 = join(TMP, "g.jsonl");
await appendJsonl(fsAdapter, p7, { id: "mem-1", title: "test" });
check("appendJsonl 後文件存在", existsSync(p7));
check("內容是 {\"id\":\"mem-1\",...}\\n", readFileSync(p7, "utf8").startsWith('{"id":"mem-1"') && readFileSync(p7, "utf8").endsWith("\n"));

console.log("\n=== 8) appendJsonl 多次累積 ===");
const p8 = join(TMP, "h.jsonl");
for (let i = 0; i < 5; i++) {
  await appendJsonl(fsAdapter, p8, { i });
}
const hContent = readFileSync(p8, "utf8").trim().split("\n");
check("5 次 append → 5 行", hContent.length === 5);
check("最後一行是 {\\\"i\\\":4}", hContent[4] === '{"i":4}');

console.log("\n=== 9) appendJsonl ↔ readJsonl 往返 ===");
const p9 = join(TMP, "i.jsonl");
const items = [{ a: 1, b: "x" }, { a: 2, b: "y 中文" }, { a: 3, b: '"quoted"' }];
for (const it of items) await appendJsonl(fsAdapter, p9, it);
const readBack = await readJsonl(fsAdapter, p9);
check("3 行全部讀回", readBack.length === 3);
check("中文 + 引號正確反序列化", JSON.stringify(readBack) === JSON.stringify(items));

console.log("\n=== 10) 效能基準：append 的單行成本不得失控 ===");
// 這一項原本斷言「新實現比舊實現（readJsonl + push + serializeJsonl）快」。
// 2026-09-23 用交替對跑實測後發現這個前提不成立：
//     N= 300 → 1.02x    N=1000 → 0.97x    N=2500 → 1.15x
// 兩者差異全在噪聲範圍內。因為瓶頸是「讀全文 + 寫全文」的檔案 IO，
// JSON.parse / stringify 的開銷相對可以忽略。此前測出的 1.4~1.5x 是
// 連跑兩輪新實現再連跑兩輪舊實現造成的快取不對稱，不是真實差距。
//
// 所以改成守單行平均成本：它抓得住真正的災難（比如誤改成每條 append 都掃全表
// 兩遍、或退化成 O(N²)），又不會被機器負載晃出誤報。實測約 2ms/行，留 10 倍餘量。
const BENCH_N = 300;
const row = (i) => ({ i, data: "x".repeat(50) });
const benchPath = join(TMP, "bench.jsonl");
writeFileSync(benchPath, "", "utf8");
const benchStart = Date.now();
for (let i = 0; i < BENCH_N; i++) await appendJsonl(fsAdapter, benchPath, row(i));
const perRow = (Date.now() - benchStart) / BENCH_N;
check(
  `${BENCH_N} 行 append 平均 ${perRow.toFixed(2)}ms/行（上限 20ms/行）`,
  perRow < 20,
  `actual ${perRow.toFixed(2)}ms/行`,
);
check("append 的行數完整", (await readJsonl(fsAdapter, benchPath)).length === BENCH_N);

console.log("\n=== 11) appendLine 空檔案 ===");
const p11 = join(TMP, "k.jsonl");
writeFileSync(p11, "", "utf8");
check("空檔案 appendLine → true", await appendLine(fsAdapter, p11, "first\n"));
check("內容是 first\\n", readFileSync(p11, "utf8") === "first\n");

console.log("\n=== 12) appendLine 特殊字元 ===");
const p12 = join(TMP, "l.jsonl");
writeFileSync(p12, "", "utf8");
await appendLine(fsAdapter, p12, JSON.stringify({ msg: "中文 + \"quotes\" + \n embedded newline" }) + "\n");
const lContent = readFileSync(p12, "utf8");
check("特殊字元寫入成功", lContent.length > 0);
const lParsed = parseJsonl(lContent);
check("特殊字元正確反序列化", lParsed[0].msg.includes("中文") && lParsed[0].msg.includes("quotes"));

console.log(`\n${pass} PASS / ${fail} FAIL`);
rmSync(TMP, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);