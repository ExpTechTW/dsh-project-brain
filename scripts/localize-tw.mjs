#!/usr/bin/env node
// 把 repo 內所有中文文案由簡體轉成繁體（臺灣用語），使用 OpenCC s2twp。
// Usage: node scripts/localize-tw.mjs [--dry]
import * as OpenCC from 'opencc-js';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const convert = OpenCC.Converter({ from: 'cn', to: 'twp' });
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/;

const SKIP_DIRS = new Set(['node_modules', '.git', 'lib', 'opencc-js']);
const SKIP_FILES = new Set(['LICENSE']);
const EXTS = new Set(['.js', '.mjs', '.md', '.yml', '.yaml', '.json', '.ts']);

const targets = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full);
    if (rel.startsWith('node_modules') || rel.startsWith('.git')) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      walk(full);
      continue;
    }
    if (SKIP_FILES.has(name)) continue;
    if (!EXTS.has(extname(name))) continue;
    targets.push(full);
  }
}
walk(ROOT);

const dry = process.argv.includes('--dry');
let changed = 0;
let totalChars = 0;
for (const file of targets) {
  // 不處理建置產物與 lockfile
  if (/package-lock\.json$/.test(file)) continue;
  if (/(^|\/)dsh-project-brain\/lib\//.test(relative(ROOT, file))) continue;
  const before = readFileSync(file, 'utf8');
  if (!CJK.test(before)) continue;
  const after = convert(before);
  if (after === before) continue;
  changed += 1;
  let n = 0;
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) n++;
  totalChars += n;
  if (!dry) writeFileSync(file, after);
  console.log(`${dry ? '[dry] ' : ''}${relative(ROOT, file)} (${n} chars)`);
}
console.log(`\n${dry ? '[dry] would change' : 'changed'} ${changed} files, ${totalChars} chars`);
