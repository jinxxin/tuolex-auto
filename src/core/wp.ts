import { db } from './db';
import { createRecord } from './repo';
import { uid } from '../modules/docs/DocsPage';
import type { WpTemplate, WpTemplateSection, DocRecord, DocSection, LinkEntityType, WorkProduct, Project } from './types';

// ============ WP 生成引擎：模板 → 在线文档（条目自动填充）============
// 1. 按模板章节生成文档：text 章节（Markdown → TipTap）、entries 章节（按 filter 拉取 V 条目/测试/风险并锁定快照）
// 2. 登记 work_products 记录（wpCode/title/status/docId）
// 3. 产出文档可直接编辑、导出 docx/PDF —— 即认证机构/审计可见的工作产品

// ---- Markdown 简化 → TipTap JSON（# 标题 / - 列表 / 普通段落 / 表格行转段落）----
export function mdToTipTap(md: string): string {
  const lines = (md || '').split('\n');
  const content: unknown[] = [];
  let listBuffer: { type: string; content: unknown[] }[] = [];
  const flushList = () => {
    if (listBuffer.length === 0) return;
    const ordered = listBuffer[0].type === 'orderedList';
    content.push({ type: ordered ? 'orderedList' : 'bulletList', content: listBuffer.map((li) => ({ type: 'listItem', content: [{ type: 'paragraph', content: li.content }] })) });
    listBuffer = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushList(); continue; }
    // 表格行 → 段落（保留原样，供文档编辑器进一步处理）
    if (/^\|.*\|$/.test(line.trim()) && /^\|[-:\s|]+\|$/.test(lines[lines.indexOf(raw) + 1] || '')) { flushList(); continue; }
    if (/^\|.*\|$/.test(line.trim())) { flushList(); content.push({ type: 'paragraph', content: [{ type: 'text', text: line.trim() }] }); continue; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { flushList(); content.push({ type: 'heading', attrs: { level: h[1].length }, content: [{ type: 'text', text: h[2] }] }); continue; }
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) { listBuffer.push({ type: 'bulletList', content: [{ type: 'text', text: li[1] }] }); continue; }
    const oi = line.match(/^\d+[.、]\s+(.*)$/);
    if (oi) { listBuffer.push({ type: 'orderedList', content: [{ type: 'text', text: oi[1] }] }); continue; }
    flushList();
    content.push({ type: 'paragraph', content: [{ type: 'text', text: line.trim() }] });
  }
  flushList();
  return JSON.stringify({ type: 'doc', content });
}

// ---- 条目快照（与文档视图 EntryCard 结构一致，保存时锁定内容）----
export interface EntrySnap {
  type: LinkEntityType;
  id: number;
  code: string;
  title: string;
  desc: string;
  meta: string;
  fields: Record<string, string>;
  fieldLabels: Record<string, string>;
}

export async function buildSnapshots(refs: { type: LinkEntityType; id: number }[]): Promise<EntrySnap[]> {
  const out: EntrySnap[] = [];
  const [reqs, tcs, fmeas] = await Promise.all([db.req_items.toArray(), db.test_cases.toArray(), db.fmea_items.toArray()]);
  for (const r of refs) {
    if (r.type === 'req') {
      const it = reqs.find((x) => x.id === r.id);
      if (it) out.push({
        type: 'req', id: it.id!, code: it.reqId, title: it.desc.slice(0, 40), desc: it.desc,
        meta: `${it.priority}优先级${it.sourceReg !== '—' ? ' · ' + it.sourceReg : ''}${it.version ? ' · v' + it.version : ''}`,
        fields: { desc: it.desc }, fieldLabels: { desc: '条目描述' },
      });
    } else if (r.type === 'tc') {
      const it = tcs.find((x) => x.id === r.id);
      if (it) out.push({
        type: 'tc', id: it.id!, code: it.tcId, title: it.title, desc: `${it.steps}\n预期：${it.expected}`,
        meta: `结果：${it.result === 'pass' ? '通过' : it.result === 'fail' ? '失败' : it.result === 'na' ? '不适用' : '未执行'}${it.version ? ' · v' + it.version : ''}`,
        fields: { steps: it.steps, expected: it.expected }, fieldLabels: { steps: '测试步骤', expected: '预期结果' },
      });
    } else if (r.type === 'fmea') {
      const it = fmeas.find((x) => x.id === r.id);
      if (it) out.push({
        type: 'fmea', id: it.id!, code: `RPN-${it.rpn}`, title: it.failureMode, desc: `影响：${it.effect}\n原因：${it.cause}`,
        meta: `风险等级 ${it.rpn >= 100 ? '高' : it.rpn >= 50 ? '中' : '低'}`,
        fields: { failureMode: it.failureMode, effect: it.effect }, fieldLabels: { failureMode: '失效模式', effect: '潜在影响' },
      });
    }
  }
  return out;
}

// ---- 按模板条目规则拉取项目条目 ----
export async function matchEntries(projectId: number, filter?: WpTemplateSection['entryFilter']): Promise<{ type: LinkEntityType; id: number }[]> {
  if (!filter) return [];
  if (filter.reqType) {
    const items = await db.req_items.where('projectId').equals(projectId).toArray();
    const want = Array.isArray(filter.reqType) ? filter.reqType : [filter.reqType];
    const hit = items.filter((r) => {
      if (r.aiBatch) return false; // AI 草稿不进入 WP
      const t = String(r.reqType || '');
      const cur = t === 'sys' ? 'sys_req' : t === 'sw' ? 'sw_req' : t;
      return (want as string[]).includes(cur);
    });
    return hit.map((r) => ({ type: 'req' as LinkEntityType, id: r.id! }));
  }
  if (filter.tcPrefix) {
    const tcs = await db.test_cases.where('projectId').equals(projectId).toArray();
    const hit = tcs.filter((t) => {
      if (t.aiBatch) return false; // AI 草稿不进入 WP
      return new RegExp(`^TC-${filter.tcPrefix}`, 'i').test(t.tcId);
    });
    return hit.map((t) => ({ type: 'tc' as LinkEntityType, id: t.id! }));
  }
  if (filter.fmea) {
    const fmeas = await db.fmea_items.where('projectId').equals(projectId).toArray();
    return fmeas.map((f) => ({ type: 'fmea' as LinkEntityType, id: f.id! }));
  }
  return [];
}

// ---- 生成 WP 文档 ----
export async function generateWp(project: Project, template: WpTemplate, actor: { id: number; username: string }, createdBy: string): Promise<number> {
  const now = Date.now();
  const sections: DocSection[] = [];

  for (const sec of template.sections) {
    if (sec.kind === 'text') {
      sections.push({
        id: uid(),
        title: sec.title,
        type: 'text',
        content: mdToTipTap(sec.text || ''),
      });
    } else {
      const refs = await matchEntries(project.id!, sec.entryFilter);
      sections.push({
        id: uid(),
        title: sec.title,
        type: 'entries',
        refs,
        snapshot: await buildSnapshots(refs),
        intro: sec.desc ? mdToTipTap(sec.desc) : undefined,
      });
    }
  }

  const title = `${template.title} — ${project.name}`;
  const docId = await createRecord<DocRecord>('documents', {
    title,
    docType: template.processCode,
    projectId: project.id,
    sections,
    version: 1,
    status: 'draft',
    signatureIds: [],
    history: [{ version: 1, date: now, by: createdBy, note: `由 WP 模板生成：${template.wpCode} ${template.title}` }],
    createdAt: now,
    updatedAt: now,
  }, actor, `生成工作产品：${template.title}（${template.wpCode}）`);

  // 登记工作产品实例
  await createRecord<WorkProduct>('work_products', {
    projectId: project.id!,
    processCode: template.processCode,
    wpCode: template.wpCode,
    title: template.title,
    status: 'draft',
    docId,
    desc: `由模板生成（${now}），内含 ${sections.filter((s) => s.type === 'entries').reduce((n, s) => n + (s.refs?.length || 0), 0)} 条条目引用`,
    createdBy,
    updatedAt: now,
  }, actor, `登记工作产品实例：${template.wpCode} ${template.title}`);

  return docId;
}

// 供 ProcessTab/其他模块引用：统计某过程已有 WP 数量
export async function wpCountOf(projectId: number, processCode: string): Promise<number> {
  return db.work_products.where('projectId').equals(projectId).filter((w) => w.processCode === processCode).count();
}
