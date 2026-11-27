import { diffLines, diffWords } from 'diff';
import { db } from './db';
import type { DocSection } from './types';

// ============ 版本历史与差异对比 ============

// TipTap JSON → 纯文本（对比用）
export function textOfJson(jsonStr?: string): string {
  try {
    const doc = jsonStr ? JSON.parse(jsonStr) : null;
    if (!doc) return '';
    const parts: string[] = [];
    const walk = (node: { type?: string; text?: string; content?: unknown[] } | undefined) => {
      if (!node) return;
      if (node.type === 'text') parts.push(node.text ?? '');
      if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'listItem' || node.type === 'blockquote') parts.push('\n');
      (node.content || []).forEach((c) => walk(c as { type?: string; text?: string; content?: unknown[] }));
    };
    walk(doc);
    return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
  } catch { return ''; }
}

// 字段级变更（仅字符串字段参与 diff）
export function fieldChanges(before: Record<string, unknown>, after: Record<string, unknown>): { field: string; before: string; after: string }[] {
  const out: { field: string; before: string; after: string }[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const b = before[k];
    const a = after[k];
    if (typeof b === 'string' || typeof a === 'string') {
      const bs = b == null ? '' : String(b);
      const as = a == null ? '' : String(a);
      if (bs !== as) out.push({ field: k, before: bs, after: as });
    }
  }
  return out;
}

// 记录条目版本（在条目内容更新且版本升版时调用）
export async function recordEntryVersion(
  type: 'req' | 'tc' | 'fmea',
  id: number,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  actor: { id: number; username: string; name?: string },
  note: string,
): Promise<void> {
  const changes = fieldChanges(before, after);
  if (changes.length === 0) return;
  await db.entry_versions.add({
    entityType: type,
    entityId: id,
    version: (after.version as number) || 1,
    snapshot: after,
    changedAt: Date.now(),
    changedBy: actor.name || actor.username,
    note,
    changes,
  });
}

// 保存文档版本快照（每次保存全量）
export async function saveDocVersion(doc: { id?: number; title: string; sections: DocSection[]; version: number }, savedBy: string, note: string): Promise<void> {
  if (!doc.id) return;
  await db.doc_versions.add({
    docId: doc.id,
    version: doc.version,
    title: doc.title,
    sections: doc.sections,
    savedAt: Date.now(),
    savedBy,
    note,
  });
}

// 行级 diff（jsdiff）：返回高亮片段
export function lineDiff(before: string, after: string): { value: string; added?: boolean; removed?: boolean }[] {
  return diffLines(before, after);
}

// 词级 diff
export function wordDiff(before: string, after: string): { value: string; added?: boolean; removed?: boolean }[] {
  return diffWords(before, after);
}

// 对比两个文档版本（章节级 + 内容级）
export interface SectionCompare {
  sectionId: string;
  title: string;
  status: 'same' | 'only_a' | 'only_b' | 'changed';
  textDiff?: { value: string; added?: boolean; removed?: boolean }[];
}

export function compareDocSections(a: DocSection[], b: DocSection[]): SectionCompare[] {
  const out: SectionCompare[] = [];
  const ids = new Set([...a.map((s) => s.id), ...b.map((s) => s.id)]);
  for (const id of ids) {
    const sa = a.find((s) => s.id === id);
    const sb = b.find((s) => s.id === id);
    if (!sa && sb) { out.push({ sectionId: id, title: sb.title, status: 'only_b' }); continue; }
    if (sa && !sb) { out.push({ sectionId: id, title: sa.title, status: 'only_a' }); continue; }
    if (!sa || !sb) continue;
    if (sa.title !== sb.title) { out.push({ sectionId: id, title: `${sb.title}`, status: 'changed', textDiff: lineDiff(sa.title, sb.title) }); continue; }
    // 同章节：按类型比较内容
    const ta = sectionText(sa);
    const tb = sectionText(sb);
    if (ta === tb) { out.push({ sectionId: id, title: sa.title, status: 'same' }); }
    else { out.push({ sectionId: id, title: sa.title, status: 'changed', textDiff: lineDiff(ta, tb) }); }
  }
  return out;
}

// 章节 → 对比文本（text: 纯文本；entries: 条目标识+字段拼接；toc: 忽略）
function sectionText(s: DocSection): string {
  if (s.type === 'text') return textOfJson(s.content);
  if (s.type === 'entries') {
    const refs = (s.refs || []).map((r) => `${r.type}:${r.id}`).join(',');
    const snap = (s.snapshot as { code?: string; title?: string; desc?: string; fields?: Record<string, string> }[] | undefined) || [];
    const body = snap.map((e) => `${e.code} ${e.title}\n${Object.values(e.fields || {}).join('\n')}`).join('\n---\n');
    return `[条目引用:${refs}]\n${body}`;
  }
  return '';
}
