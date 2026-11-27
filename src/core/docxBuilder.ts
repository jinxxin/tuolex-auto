import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, convertMillimetersToTwip } from 'docx';
import dayjs from 'dayjs';
import { db } from './db';
import { docSignatureItems } from './docSign';
import type { DocRecord, DocSection } from './types';

// ============ 在线文档 → 真实 Word 文件（.docx）============
// 由 exportDoc.ts 动态加载（按需分包，不拖慢首屏）

// 条目快照结构（与 DocRender 兼容）
interface EntrySnapLike {
  type?: string;
  id?: number;
  code?: string;
  title?: string;
  desc?: string;
  meta?: string;
  fields?: Record<string, string>;
  fieldLabels?: Record<string, string>;
}

const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' } as const;
const TABLE_BORDERS = {
  top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER,
  insideHorizontal: THIN_BORDER, insideVertical: THIN_BORDER,
};

// ---- TipTap JSON → docx 段落 ----

function runs(nodes: unknown[] | undefined): TextRun[] {
  return (nodes || []).map((n) => {
    const nd = n as { type?: string; text?: string; marks?: { type: string }[] };
    if (nd.type !== 'text') return new TextRun({ text: '' });
    const marks = nd.marks || [];
    const isCode = marks.some((m) => m.type === 'code');
    return new TextRun({
      text: nd.text ?? '',
      bold: marks.some((m) => m.type === 'bold'),
      italics: marks.some((m) => m.type === 'italic'),
      strike: marks.some((m) => m.type === 'strike'),
      font: isCode ? { name: 'Consolas', eastAsia: 'Consolas' } : undefined,
      color: isCode ? 'C7254E' : undefined,
    });
  });
}

function blocksFromJson(json: string | undefined): Paragraph[] {
  try {
    const doc = JSON.parse(json || '{}');
    const out: Paragraph[] = [];
    const walk = (node: { type?: string; content?: unknown[]; level?: number } | undefined, ctx?: { ordered: boolean; counter: number }) => {
      if (!node) return;
      const t = node.type;
      if (t === 'paragraph') out.push(new Paragraph({ children: runs(node.content), spacing: { after: 80 } }));
      else if (t === 'heading') {
        const lvl = Math.min(3, node.level || 1);
        out.push(new Paragraph({
          children: runs(node.content),
          spacing: { before: 260, after: 120 },
          heading: lvl === 1 ? HeadingLevel.HEADING_1 : lvl === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        }));
      } else if (t === 'bulletList') (node.content || []).forEach((li) => walk(li as never, { ordered: false, counter: 0 }));
      else if (t === 'orderedList') { let i = 1; (node.content || []).forEach((li) => walk(li as never, { ordered: true, counter: i++ })); }
      else if (t === 'listItem') {
        const prefix = ctx?.ordered ? `${ctx.counter}. ` : '• ';
        out.push(new Paragraph({ children: [new TextRun({ text: prefix }), ...runs(node.content)], indent: { left: 480 }, spacing: { after: 40 } }));
      } else if (t === 'blockquote') {
        out.push(new Paragraph({ children: runs(node.content), indent: { left: 480 }, shading: { type: ShadingType.CLEAR, fill: 'F4F8FB' } }));
      } else if (t === 'horizontalRule') {
        out.push(new Paragraph({ children: [new TextRun({ text: '──────────────────', color: '999999' })], spacing: { after: 80 } }));
      } else (node.content || []).forEach((c) => walk(c as never, ctx));
    };
    walk(doc);
    return out;
  } catch {
    return [new Paragraph({ text: '' })];
  }
}

function splitParagraphs(text: string): Paragraph[] {
  return (text || '').split('\n').map((line) => new Paragraph({ children: [new TextRun({ text: line })] }));
}

// ---- 条目快照 → docx 表格 ----

function entryTable(e: EntrySnapLike): Table {
  const labels = e.fieldLabels || {};
  const keys = Object.keys(labels);
  const vals = e.fields || {};
  const rows: TableRow[] = [];
  rows.push(new TableRow({
    tableHeader: true,
    children: [new TableCell({
      columnSpan: 2,
      shading: { type: ShadingType.CLEAR, fill: 'F0F5FA' },
      children: [new Paragraph({ children: [new TextRun({ text: `${e.code || ''}  ${e.title || ''}`, bold: true })] })],
    })],
  }));
  if (keys.length > 0) {
    keys.forEach((k) => rows.push(new TableRow({
      children: [
        new TableCell({ width: { size: 26, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, fill: 'FAFBFD' }, children: [new Paragraph({ children: [new TextRun({ text: labels[k], bold: true, color: '595959', size: 20 })] })] }),
        new TableCell({ width: { size: 74, type: WidthType.PERCENTAGE }, children: splitParagraphs(String(vals[k] ?? '')) }),
      ],
    })));
  } else if (e.desc) {
    rows.push(new TableRow({ children: [new TableCell({ columnSpan: 2, children: splitParagraphs(e.desc) })] }));
  }
  if (e.meta) rows.push(new TableRow({ children: [new TableCell({ columnSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: e.meta, color: '8C8C8C', size: 18 })] })] })] }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows, borders: TABLE_BORDERS });
}

// ---- 章节 → docx 子项 ----

async function resolveSnapshots(sections: DocSection[]): Promise<DocSection[]> {
  const needResolve = sections.some((s) => s.type === 'entries' && (!(s.snapshot as unknown[] | undefined)?.length) && (s.refs || []).length > 0);
  if (!needResolve) return sections;
  const [reqs, tcs, fmeas] = await Promise.all([db.req_items.toArray(), db.test_cases.toArray(), db.fmea_items.toArray()]);
  return sections.map((s) => {
    if (s.type !== 'entries' || (s.snapshot as unknown[] | undefined)?.length || !s.refs?.length) return s;
    const snaps = s.refs.map((r): EntrySnapLike | null => {
      if (r.type === 'req') {
        const it = reqs.find((x) => x.id === r.id);
        if (!it) return null;
        return { type: 'req', code: it.reqId, title: it.desc.slice(0, 40), desc: it.desc, meta: `${it.priority}优先级${it.sourceReg !== '—' ? ' · ' + it.sourceReg : ''}${it.version ? ' · v' + it.version : ''}`, fields: { desc: it.desc }, fieldLabels: { desc: '需求描述' } };
      }
      if (r.type === 'tc') {
        const it = tcs.find((x) => x.id === r.id);
        if (!it) return null;
        return { type: 'tc', code: it.tcId, title: it.title, desc: `${it.steps}\n预期：${it.expected}`, meta: `结果：${it.result}${it.version ? ' · v' + it.version : ''}`, fields: { steps: it.steps, expected: it.expected }, fieldLabels: { steps: '测试步骤', expected: '预期结果' } };
      }
      const it = fmeas.find((x) => x.id === r.id);
      if (!it) return null;
      return { type: 'fmea', code: `RPN-${it.rpn}`, title: it.failureMode, desc: `影响：${it.effect}\n原因：${it.cause}`, meta: `风险等级 ${it.rpn >= 100 ? '高' : it.rpn >= 50 ? '中' : '低'}${it.version ? ' · v' + it.version : ''}`, fields: { failureMode: it.failureMode, effect: it.effect }, fieldLabels: { failureMode: '失效模式', effect: '潜在影响' } };
    }).filter((x): x is EntrySnapLike => !!x);
    return { ...s, snapshot: snaps };
  });
}

// ---- docx 主体 ----

export async function buildDocxBlob(doc: DocRecord): Promise<Blob> {
  const sections = await resolveSnapshots(doc.sections);
  const children: (Paragraph | Table)[] = [];

  // 标题
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: doc.title, bold: true, size: 36 })] }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({ text: `${doc.docType} · v${doc.version} · 修订于 ${dayjs(doc.updatedAt).format('YYYY-MM-DD')} · ${doc.status === 'approved' ? '已批准' : '草稿'}`, color: '808080', size: 18 })],
  }));

  // 修订记录表
  children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun({ text: '修订记录', bold: true, size: 26 })] }));
  const revRows: TableRow[] = [
    new TableRow({ tableHeader: true, children: ['版本', '日期', '修订人', '说明'].map((h) => new TableCell({ shading: { type: ShadingType.CLEAR, fill: 'F0F5FA' }, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })) }),
    ...[...(doc.history || [])].reverse().map((h) => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: `v${h.version}` })] }),
        new TableCell({ children: [new Paragraph({ text: dayjs(h.date).format('YYYY-MM-DD HH:mm') })] }),
        new TableCell({ children: [new Paragraph({ text: h.by || '—' })] }),
        new TableCell({ children: [new Paragraph({ text: h.note || '—' })] }),
      ],
    })),
  ];
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: revRows, borders: TABLE_BORDERS }));

  // 章节
  for (const sec of sections) {
    children.push(new Paragraph({ spacing: { before: 320, after: 120 }, children: [new TextRun({ text: sec.title, bold: true, size: 28, color: '0B2545' })] }));
    if (sec.type === 'text') {
      children.push(...blocksFromJson(sec.content));
    } else if (sec.type === 'entries') {
      if (sec.intro) children.push(...blocksFromJson(sec.intro));
      const snaps = (sec.snapshot as EntrySnapLike[]) || [];
      if (snaps.length === 0) children.push(new Paragraph({ children: [new TextRun({ text: '（无引用条目）', color: '999999' })] }));
      else snaps.forEach((e) => { children.push(entryTable(e)); children.push(new Paragraph({ text: '' })); });
      if (sec.outro) children.push(...blocksFromJson(sec.outro));
    } else {
      const tocItems = sections.filter((s) => s.type !== 'toc' && s.id !== sec.id);
      tocItems.forEach((s, i) => children.push(new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${s.title}` })] })));
    }
  }

  // 签署记录
  const sigs = await docSignatureItems(doc);
  children.push(new Paragraph({ spacing: { before: 360, after: 120 }, children: [new TextRun({ text: '审批与签署记录', bold: true, size: 26, color: '0B2545' })] }));
  if (sigs.length === 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: '（暂无签署记录）', color: '999999' })] }));
  } else {
    const sigRows: TableRow[] = [
      new TableRow({ tableHeader: true, children: ['签名人', '签名含义', '时间', '状态', '内容哈希（SHA-256）'].map((h) => new TableCell({ shading: { type: ShadingType.CLEAR, fill: 'F0F5FA' }, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })) }),
      ...sigs.map((s) => new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ text: s.signerName })] }),
          new TableCell({ children: [new Paragraph({ text: s.meaning })] }),
          new TableCell({ children: [new Paragraph({ text: dayjs(s.signedAt).format('YYYY-MM-DD HH:mm') })] }),
          new TableCell({ children: [new Paragraph({ text: s.valid ? '有效' : `失效：${s.reason || ''}` })] }),
          new TableCell({ children: [new Paragraph({ text: s.docHash.slice(0, 16) + '…' })] }),
        ],
      })),
    ];
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: sigRows, borders: TABLE_BORDERS }));
    if (doc.status === 'approved') children.push(new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: `✓ 本文件已批准（v${doc.version}）。批准后内容锁定，修改会使签名失效。`, color: '237804', size: 18 })] }));
  }

  const file = new Document({
    styles: { default: { document: { run: { font: { name: 'SimSun', eastAsia: 'SimSun' }, size: 21 } } } },
    sections: [{ properties: { page: { margin: { top: convertMillimetersToTwip(20), bottom: convertMillimetersToTwip(20), left: convertMillimetersToTwip(24), right: convertMillimetersToTwip(24) } } }, children }],
  });
  return Packer.toBlob(file);
}
