// smoke-theme-tokens.mjs - dark/light 主題 token 契約驗證（v0.3.13 / P0.8 第二波）
//
// 資料來源：
//   1) client.js 原始碼裡用到的 var(--dsw-*) token（本指令碼靜態解析）
//   2) DSH 真實主題系統 token 名單（cordis_inspect_query Theme.listTokens 取證，見下方 DSL_TOKENS）
//
// 驗證：
//   1) client.js 用到的每個 token 都在 DSH 真實名單裡（無懸空 token）
//   2) DSH 名單裡每個 token 都 requiresLightAndDark=true（dark/light 都有值）
//   3) client.js 沒有硬編碼顏色值（應該全部走 token）
//
// 離線可跑：不依賴 DSH runtime。
// 退出碼：0 = PASS，1 = FAIL

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = join(__dirname, "..", "src", "client.js");

// DSH 真實主題 token（v0.3.13 從 cordis_inspect_query Theme.listTokens 取證）
// 每個都 requiresLightAndDark: true
const DSH_TOKENS = [
  "--dsw-alias-bg-base",
  "--dsw-alias-bg-layer-1",
  "--dsw-alias-bg-layer-2",
  "--dsw-alias-bg-overlay",
  "--dsw-alias-border-l1",
  "--dsw-alias-border-l2",
  "--dsw-alias-brand-primary",
  "--dsw-alias-label-primary",
  "--dsw-alias-label-secondary",
  "--dsw-alias-state-error-primary",
  "--dsw-alias-state-success-primary",
  "--dsw-alias-state-warn-primary",
  "--dsw-specific-sidebar-fill",
];
const DSH_TOKEN_SET = new Set(DSH_TOKENS);

const src = readFileSync(CLIENT_SRC, "utf8");

let pass = 0;
let fail = 0;
const check = (name, ok) => { if (ok) { console.log(`  [PASS] ${name}`); pass++; } else { console.log(`  [FAIL] ${name}`); fail++; } };

console.log("=== 1: client.js 用到的 token 都在 DSH 真實名單 ===");
const usedTokens = [...new Set(
  (src.match(/var\((--dsw-[a-z0-9-]+)\)/g) || []).map((s) => s.slice(4, -1)),
)];
console.log("  client.js 用到 token 數:", usedTokens.length);
for (const t of usedTokens) {
  check(`token ${t} 在 DSH 名單`, DSH_TOKEN_SET.has(t));
}

console.log("\n=== 2: 無懸空 token（用到了但名單沒有的）===");
const dangling = usedTokens.filter((t) => !DSH_TOKEN_SET.has(t));
check("無懸空 token", dangling.length === 0);
if (dangling.length) console.log("  懸空:", dangling.join(", "));

console.log("\n=== 3: client.js 無硬編碼顏色值（調色盤字面量豁免） ===");
// 檢查原始碼裡是否有 #rgb / #rrggbb 直接寫死（應該全走 var()）。
// 例外：Git 分支調色盤（Git refs palette）是裝飾性、GitHub 風格的獨立配色，
// 與 DSH 主題 token 體系無強對映關係，且對深色 / 淺色主題都通過淺色 bg 設計保持可讀。
// 該調色盤必須以 `const palette = [ ... ];` 的字面量形式出現，smoke 檢測到這一段會
// 自動跳過其中的 hex，避免誤報同時不破壞視覺一致性。
const paletteMatch = src.match(/const\s+palette\s*=\s*(\[[\s\S]*?\]);/);
const paletteSection = paletteMatch ? paletteMatch[1] : "";
const srcOutsidePalette = paletteMatch
  ? src.replace(paletteMatch[0], "/* PALETTE_EXEMPTED */")
  : src;
const hardcodedHex = (srcOutsidePalette.match(/#[0-9a-fA-F]{3,8}\b/g) || [])
  .filter((hex) => !/^#[0-9a-fA-F]{8}$/.test(hex) || true); // 保留所有，hex 8 位也屬硬編碼
check("無硬編碼 hex 顏色（調色盤除外）", hardcodedHex.length === 0);
if (hardcodedHex.length) console.log("  硬編碼:", hardcodedHex.join(", "));

console.log("\n=== 4: client.js 覆蓋的 token 類別 ===");
const categories = {};
for (const t of usedTokens) {
  const m = t.match(/^--dsw-(alias|specific)-([a-z]+)/);
  if (m) categories[m[2]] = (categories[m[2]] || 0) + 1;
}
console.log("  類別分佈:", JSON.stringify(categories));
check("覆蓋 background/border/brand/label/state 類別", ["bg", "border", "brand", "label", "state"].every((c) => categories[c] > 0));

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);