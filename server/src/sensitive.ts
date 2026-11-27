// ============ 敏感词过滤（服务端强制；供社区提交/评论使用）============
// 算法：归一化（全角→半角、小写、去空白与常见分隔符）后做子串匹配；
//       可防「加 微 信」「加*微*信」一类的间隔绕过。
import { SENSITIVE_WORDS } from './sensitive-words';

const SEP = /[\s\u200b\u200c\u200d\u2060.,*_\-/\\|~`'"+:;!?，。、；：！？…·（）()[\]{}【】《》<>@#$%^&=]/;

/** 归一化：小写 + 全角 ASCII→半角 + 去除空白/标点等分隔符 */
export function normalizeForScan(s: string): string {
  let out = '';
  for (const ch of String(s ?? '')) {
    const code = ch.codePointAt(0) ?? 0;
    let c = ch;
    if (code >= 0xff01 && code <= 0xff5e) c = String.fromCharCode(code - 0xfee0); // 全角→半角
    else if (code === 0x3000) c = ' '; // 全角空格
    c = c.toLowerCase();
    if (SEP.test(c)) continue;
    out += c;
  }
  return out;
}

const NORMALIZED = SENSITIVE_WORDS
  .map((w) => ({ word: w, norm: normalizeForScan(w) }))
  .filter((x) => x.norm.length > 0);

export interface SensitiveResult {
  hit: boolean;
  matched: string[];
}

/** 扫描文本，返回命中词（已归一化词库的子串匹配） */
export function scanSensitive(...texts: (string | undefined | null)[]): SensitiveResult {
  const norm = normalizeForScan(texts.filter(Boolean).join('\n'));
  if (!norm) return { hit: false, matched: [] };
  const matched: string[] = [];
  for (const { word, norm: nw } of NORMALIZED) {
    if (norm.includes(nw)) matched.push(word);
  }
  return { hit: matched.length > 0, matched };
}
