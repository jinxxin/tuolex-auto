#!/usr/bin/env node
// i18n 字典一致性校验：zh.json 与 en.json 的 key 集合必须完全一致（缺漏即报错）
// 附加检查：en.json 值不应包含中文字符（防漏翻）；发现仅告警（品牌/术语可豁免场景先放行观察）
// 用法：node scripts/check-i18n-keys.mjs（建议挂到 build 前：node scripts/check-i18n-keys.mjs && tsc -b && vite build）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const zh = JSON.parse(fs.readFileSync(path.join(root, 'src/locales/zh.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(root, 'src/locales/en.json'), 'utf8'));

function flatten(o, prefix = '') {
  const out = new Set();
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') {
      for (const x of flatten(v, key)) out.add(x);
    } else {
      out.add(key);
    }
  }
  return out;
}
function walkValues(o, prefix = '', arr = []) {
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') walkValues(v, key, arr);
    else arr.push({ key, value: String(v) });
  }
  return arr;
}

const zhKeys = flatten(zh);
const enKeys = flatten(en);
const CJK = /[\u4e00-\u9fff]/;
let fail = false;

const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k));
const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));
if (missingInEn.length) {
  fail = true;
  console.error(`❌ en.json 缺少 ${missingInEn.length} 个 key（zh 有 en 无）：`);
  missingInEn.slice(0, 20).forEach((k) => console.error('   ' + k));
}
if (missingInZh.length) {
  fail = true;
  console.error(`❌ zh.json 缺少 ${missingInZh.length} 个 key（en 有 zh 无）：`);
  missingInZh.slice(0, 20).forEach((k) => console.error('   ' + k));
}

const zhOnlyCjk = walkValues(en, '').filter((x) => CJK.test(x.value) && x.value.length <= 40);
if (zhOnlyCjk.length) {
  console.warn(`⚠️ en.json 有 ${zhOnlyCjk.length} 个值含中文（可能漏翻，人工确认）：`);
  zhOnlyCjk.slice(0, 15).forEach((x) => console.warn(`   ${x.key} = ${x.value.slice(0, 50)}`));
}

console.log(`zh keys: ${zhKeys.size} | en keys: ${enKeys.size}`);
if (fail) {
  console.error('i18n 校验失败：请补齐缺失词条后再构建。');
  process.exit(1);
}
console.log('✅ i18n 字典一致');
