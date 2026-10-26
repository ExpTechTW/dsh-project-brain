// scripts/verify-language-usage.mjs — 臨時驗證指令碼（與 src/client.js 內聯 helper 同語義）
// v1.1.x-fix：語言使用率歸一化（按檔案數降序 + 百分比 + 長尾聚合）
// 目的：在不打包 client.js 的情況下驗證 formatLanguagesUsage 的語義
// 真實函式定義在 src/client.js；本指令碼複製實現用於離線驗證，失敗說明邏輯漂移。

function formatLanguagesUsage(languages, opts) {
  const obj = languages && typeof languages === "object" ? languages : {};
  const entries = Object.entries(obj)
    .filter(([, c]) => Number(c) > 0)
    .map(([lang, count]) => ({ lang: String(lang), count: Number(count) || 0 }))
    .sort((a, b) => b.count - a.count || a.lang.localeCompare(b.lang));
  const total = entries.reduce((s, e) => s + e.count, 0);
  const topN = opts && Number.isFinite(opts.topN) ? Math.max(1, opts.topN | 0) : 8;
  const mergeTail = opts && opts.mergeTail === false ? false : true;
  const head = entries.slice(0, topN);
  const tailList = entries.slice(topN);
  const withPct = (e) => Object.assign({}, e, { percent: total > 0 ? (e.count / total) * 100 : 0 });
  const top = head.map(withPct);
  let tail = null;
  if (mergeTail && tailList.length > 0) {
    const tailCount = tailList.reduce((s, e) => s + e.count, 0);
    tail = { count: tailCount, percent: total > 0 ? (tailCount / total) * 100 : 0, languages: tailList.length };
  } else if (!mergeTail && tailList.length > 0) {
    for (const e of tailList) top.push(withPct(e));
  }
  return { top, tail, total, distinctCount: entries.length };
}

// ─── 真實資料：dsh-project-brain 倉庫當前 .project-brain/project.json 的 languages 欄位 ───
const realCase = { javascript: 72, c: 1, go: 1, java: 2, python: 1, rust: 1 };

const cases = [
  {
    name: "真實場景：dsh-project-brain 6 種語言（無長尾）",
    input: realCase,
    expected: {
      distinctCount: 6,
      total: 78,
      top: [
        { lang: "javascript", count: 72, percent: 92.3 },
        { lang: "java", count: 2, percent: 2.6 },
        { lang: "c", count: 1, percent: 1.3 },
        { lang: "go", count: 1, percent: 1.3 },
        { lang: "python", count: 1, percent: 1.3 },
        { lang: "rust", count: 1, percent: 1.3 },
      ],
      tail: null,
    },
  },
  {
    name: "長尾聚合：10 種語言，topN=8",
    input: { js: 100, ts: 50, py: 30, go: 20, java: 15, rs: 12, c: 10, rb: 8, php: 5, swift: 3 },
    expected: {
      distinctCount: 10,
      total: 253,
      topLen: 8,
      tail: { count: 5 + 3, percent: ((5 + 3) / 253) * 100, languages: 2 },
    },
  },
  {
    name: "空輸入",
    input: {},
    expected: { distinctCount: 0, total: 0, top: [], tail: null },
  },
  {
    name: "null/undefined 輸入",
    input: null,
    expected: { distinctCount: 0, total: 0, top: [], tail: null },
  },
  {
    name: "mergeTail=false：全展開",
    input: { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1, h: 1, i: 1 },
    opts: { topN: 3, mergeTail: false },
    expected: { distinctCount: 9, topLen: 9, tail: null },
  },
  {
    name: "零計數項被過濾",
    input: { js: 10, py: 0, ts: 5 },
    expected: { distinctCount: 2, total: 15 },
  },
];

let pass = 0, fail = 0;
function near(a, b, tol) { return Math.abs(a - b) < (tol || 0.2); }

for (const c of cases) {
  const r = formatLanguagesUsage(c.input, c.opts);
  let ok = true;
  let why = "";
  if (c.expected.distinctCount !== undefined && r.distinctCount !== c.expected.distinctCount) {
    ok = false; why += `distinctCount ${r.distinctCount} != ${c.expected.distinctCount}; `;
  }
  if (c.expected.total !== undefined && r.total !== c.expected.total) {
    ok = false; why += `total ${r.total} != ${c.expected.total}; `;
  }
  if (c.expected.topLen !== undefined && r.top.length !== c.expected.topLen) {
    ok = false; why += `topLen ${r.top.length} != ${c.expected.topLen}; `;
  }
  if (c.expected.top !== undefined) {
    for (let i = 0; i < c.expected.top.length; i++) {
      const exp = c.expected.top[i];
      const got = r.top[i];
      if (!got) { ok = false; why += `top[${i}] missing; `; continue; }
      if (got.lang !== exp.lang) { ok = false; why += `top[${i}].lang ${got.lang} != ${exp.lang}; `; }
      if (got.count !== exp.count) { ok = false; why += `top[${i}].count ${got.count} != ${exp.count}; `; }
      if (!near(got.percent, exp.percent)) { ok = false; why += `top[${i}].percent ${got.percent.toFixed(2)} != ${exp.percent}; `; }
    }
  }
  if (c.expected.tail === null && r.tail !== null) {
    ok = false; why += `tail expected null got ${JSON.stringify(r.tail)}; `;
  } else if (c.expected.tail !== undefined && c.expected.tail !== null) {
    if (!r.tail) { ok = false; why += `tail missing; `; }
    else {
      if (r.tail.count !== c.expected.tail.count) { ok = false; why += `tail.count ${r.tail.count} != ${c.expected.tail.count}; `; }
      if (!near(r.tail.percent, c.expected.tail.percent)) { ok = false; why += `tail.percent ${r.tail.percent.toFixed(2)} != ${c.expected.tail.percent}; `; }
      if (r.tail.languages !== c.expected.tail.languages) { ok = false; why += `tail.languages ${r.tail.languages} != ${c.expected.tail.languages}; `; }
    }
  }
  if (ok) { pass++; console.log("PASS:", c.name); }
  else { fail++; console.error("FAIL:", c.name, "-", why, "\n  got:", JSON.stringify(r)); }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);