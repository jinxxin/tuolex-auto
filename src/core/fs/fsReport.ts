import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, BorderStyle,
} from 'docx';
import dayjs from 'dayjs';
import { db } from '../db';
import { writeAudit } from '../audit';
import { ASIL_TAG_TEXT } from './data';
import type { FsHazard, FsSafetyReq, FsFmeda, FsFta, FsDfa, FsSafetyCase, FsConfirmMeasure, FsPlanItem } from '../types';

// ============ tuoleX FS 正式评估报告导出（二期 M3）============
// 四类报告：HARA / FSC-TSC / FMEDA / Safety Case（docx）
// 结构对齐评估机构口径：封面 + 文档控制表 + 修订记录 + 参与者签名表 + 引用文件 + 正文 + 证据索引（详见 内部领域笔记）
// 导出即冻结：数据快照 SHA-256 存 fs_reports + EXPORT 审计（哈希链）

export type FsReportKind = 'hara' | 'fsc-tsc' | 'fmeda' | 'safety-case';

export interface FsReportCtx {
  projectId: number;
  projectName: string;
  hazards: FsHazard[];
  reqs: FsSafetyReq[];
  fmedas: FsFmeda[];
  ftas: FsFta[];
  dfas: FsDfa[];
  cases: FsSafetyCase[];
  confirms: FsConfirmMeasure[];
  plans: FsPlanItem[];
  author: { id: number; username: string; name: string };
}

const TPL_VERSION = 'TPL-tuolex-fs-1.0';
const REPORT_META: Record<FsReportKind, { code: string; titleZh: string; titleEn: string; refs: string[] }> = {
  hara: {
    code: 'HARA', titleZh: '危害分析与风险评估报告', titleEn: 'Hazard Analysis and Risk Assessment Report',
    refs: ['ISO 26262:2018 Part 3（概念阶段）', 'ISO 26262:2018 Part 8（支持过程）'],
  },
  'fsc-tsc': {
    code: 'FSC-TSC', titleZh: '功能安全概念与技术安全概念报告', titleEn: 'Functional & Technical Safety Concept Report',
    refs: ['ISO 26262:2018 Part 4 Clause 6/7（系统层）', 'ISO 26262:2018 Part 9（ASIL 导向分析）'],
  },
  fmeda: {
    code: 'FMEDA', titleZh: '硬件失效模式、影响与诊断分析报告', titleEn: 'Hardware FMEDA Report',
    refs: ['ISO 26262:2018 Part 5（硬件层）', 'ISO 26262-10（失效分类 Figure 9）'],
  },
  'safety-case': {
    code: 'SAFETY-CASE', titleZh: '安全案例报告', titleEn: 'Safety Case Report',
    refs: ['ISO 26262:2018 Part 2 Clause 6.4.13（安全案例）', 'Part 10 Clause 5.3.1 / Part 2 Annex C（确认评审）'],
  },
};

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' } as const;
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideHorizontal: BORDER, insideVertical: BORDER };

function h1(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 120 }, children: [new TextRun({ text, bold: true, size: 28 })] });
}
function p(text: string): Paragraph {
  return new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text, size: 20 })] });
}
function cell(text: string | number, opts: { header?: boolean; width?: number } = {}): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.header ? { fill: 'EEF3F8' } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({ children: [new TextRun({ text: String(text ?? ''), size: 18, bold: !!opts.header })] })],
  });
}
function table(headers: string[], rows: (string | number)[][], widths?: number[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDERS,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((x, i) => cell(x, { header: true, width: widths?.[i] })) }),
      ...rows.map((r) => new TableRow({ children: r.map((v, i) => cell(v, { width: widths?.[i] })) })),
    ],
  });
}
function kvTable(pairs: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDERS,
    rows: pairs.map(([k, v]) => new TableRow({ children: [cell(k, { header: true, width: 22 }), cell(v, { width: 78 })] })),
  });
}

async function sha256(text: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // 非安全上下文降级（长度校验用）
    let h = 0; for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return 'fallback-' + Math.abs(h).toString(16);
  }
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// 四类报告正文
function bodyHara(ctx: FsReportCtx): (Paragraph | Table)[] {
  const { hazards, reqs } = ctx;
  const out: (Paragraph | Table)[] = [];
  out.push(h1('1. 危害事件分析与风险评估'));
  out.push(p('依据 ISO 26262-3 对相关项/要素进行危害分析与风险评估，S/E/C 三参数分级与 ASIL 判定见下表（ASIL 由平台判定引擎按标准 Table 4 计算，人工覆写须留理由）。'));
  out.push(table(
    ['编号', '危害事件', '车辆级危害', '运行场景', 'S', 'E', 'C', 'ASIL', '覆写理由', '状态'],
    hazards.map((h) => [h.hazId, h.title, h.vehicleLevelHazard, h.situation, h.severity, h.exposure, h.controllability, ASIL_TAG_TEXT[h.asil], h.asilManual ? (h.asilManualReason ?? '（未填）') : '', h.status]),
    [7, 18, 15, 15, 4, 4, 4, 6, 18, 7],
  ));
  out.push(h1('2. 安全目标与 ASIL 分配'));
  const sgs = reqs.filter((r) => r.kind === 'SG');
  out.push(p(`共定义安全目标 ${sgs.length} 条，用于控制上述危害事件。`));
  out.push(table(
    ['编号', '安全目标', 'ASIL', '验证方法', '状态'],
    sgs.map((r) => [r.code, r.title || r.text, r.asilFrom ? `${r.asil}(${r.asilFrom})` : r.asil, r.verificationMethod ?? '', r.status]),
    [10, 52, 10, 20, 8],
  ));
  return out;
}

function bodyFscTsc(ctx: FsReportCtx): (Paragraph | Table)[] {
  const { reqs } = ctx;
  const out: (Paragraph | Table)[] = [];
  const codeOf = (id?: number) => reqs.find((x) => x.id === id)?.code ?? '';
  const kOrder: [string, string][] = [['FSC', '功能安全概念（FSC）'], ['TSC', '技术安全概念（TSC）'], ['SYSTEM_SR', '系统安全需求'], ['HW_SR', '硬件安全需求'], ['SW_SR', '软件安全需求'], ['HSI', '软硬件接口（HSI）']];
  out.push(h1('1. 需求链与 ASIL 传播'));
  out.push(p('安全目标 → FSC → TSC → 系统/硬件/软件安全需求沿链分配，ASIL 沿链传播（X(Y) 表示分解后等级 X、原级 Y；硬件度量与确认措施独立性按原级 Y 取值）。'));
  for (const [kind, label] of kOrder) {
    const list = reqs.filter((r) => r.kind === kind);
    if (!list.length) continue;
    out.push(new Paragraph({ spacing: { before: 160, after: 60 }, children: [new TextRun({ text: label, bold: true, size: 22 })] }));
    out.push(table(
      ['编号', '标题/正文', 'ASIL', '父级', '来源', '验证方法', '状态'],
      list.map((r) => [r.code, r.title || r.text, r.asilFrom ? `${r.asil}(${r.asilFrom})` : r.asil, codeOf(r.parentId), r.sourceRef ?? '', r.verificationMethod ?? '', r.status]),
      [10, 40, 8, 10, 12, 14, 6],
    ));
  }
  out.push(h1('2. 追溯矩阵'));
  const sgList = reqs.filter((r) => r.kind === 'SG');
  out.push(table(
    ['安全目标(SG)', 'FSC', 'TSC', '系统/硬件/软件安全需求'],
    sgList.map((sg) => {
      const fscs = reqs.filter((r) => r.parentId === sg.id && r.kind === 'FSC');
      const tscs = reqs.filter((r) => fscs.some((f) => f.id === r.parentId) && r.kind === 'TSC');
      const srs = reqs.filter((r) => tscs.some((tc) => tc.id === r.parentId));
      return [sg.code, fscs.map((x) => x.code).join(', ') || '—', tscs.map((x) => x.code).join(', ') || '—', srs.map((x) => x.code).join(', ') || '—'];
    }),
    [16, 20, 20, 44],
  ));
  return out;
}

function bodyFmeda(ctx: FsReportCtx): (Paragraph | Table)[] {
  const { fmedas } = ctx;
  const out: (Paragraph | Table)[] = [];
  out.push(h1('1. 度量汇总'));
  out.push(p('硬件架构度量按 ISO 26262-5 计算：SPFM（单点故障度量）、LFM（潜伏故障度量）、PMHF（随机硬件失效概率，单位 FIT），并按目标 ASIL 判定达标。'));
  out.push(table(
    ['编号', '分析对象', '目标 ASIL', 'SPFM%', 'LFM%', 'PMHF(FIT)', '判定', '状态'],
    fmedas.map((f) => {
      const m = f.metrics;
      return [f.fmedaId, f.item, ASIL_TAG_TEXT[f.asil], m ? (m.spfm * 100).toFixed(1) : '', m ? (m.lfm * 100).toFixed(1) : '', m ? m.pmhf.toFixed(1) : '', m ? (m.verdict === 'pass' ? '达标' : m.verdict === 'fail' ? '未达标' : '无目标') : '', f.status];
    }),
    [10, 26, 9, 9, 9, 11, 10, 8],
  ));
  out.push(h1('2. 失效明细'));
  for (const f of fmedas) {
    out.push(new Paragraph({ spacing: { before: 160, after: 60 }, children: [new TextRun({ text: `${f.fmedaId} · ${f.item}`, bold: true, size: 22 })] }));
    out.push(table(
      ['元件', '失效模式', '影响', '分类', 'λ(FIT)', '分布%', 'DC%', '安全相关', '安全机制'],
      (f.rows ?? []).map((r) => [r.component, r.failureMode, r.effect, r.faultType, r.lambda, r.distribution, r.diagnosticCoverage, r.safetyRelated ? '是' : '否', r.mitigation]),
      [12, 16, 16, 9, 8, 7, 7, 8, 17],
    ));
  }
  if (!fmedas.length) out.push(p('（暂无 FMEDA 记录）'));
  return out;
}

function bodySafetyCase(ctx: FsReportCtx): (Paragraph | Table)[] {
  const { cases, confirms } = ctx;
  const out: (Paragraph | Table)[] = [];
  out.push(h1('1. 安全论证（GSN）'));
  out.push(p('安全案例以 GSN（Goal Structuring Notation）组织论证：Goal（主张）/ Strategy（策略）/ Solution（证据）/ Context（上下文）/ Assumption（假设）/ Justification（论证理由）。'));
  for (const c of cases) {
    out.push(new Paragraph({ spacing: { before: 160, after: 60 }, children: [new TextRun({ text: `${c.title}（v${c.version} · ${c.status}）`, bold: true, size: 22 })] }));
    out.push(table(
      ['节点', '类型', '内容', '上级', '证据', '签核', '未展开'],
      (c.nodes ?? []).map((n) => [n.id, n.kind, n.text, n.parentId ?? '', n.evidenceRef ? `${n.evidenceRef.type}#${n.evidenceRef.id}` : '', n.approvedBy ?? '', n.undeveloped ? '◇' : '']),
      [7, 9, 40, 8, 14, 10, 7],
    ));
    if ((c.gaps ?? []).length) {
      out.push(p(`缺口（${c.gaps!.length}）：` + c.gaps!.map((g) => `${g.nodeId} ${g.issue}`).join('；')));
    }
  }
  if (!cases.length) out.push(p('（暂无安全案例记录）'));
  out.push(h1('2. 确认措施（Confirmation Measures）'));
  out.push(table(
    ['编号', '类型', '标题', 'ASIL', '独立性', '结论', '状态'],
    confirms.map((c) => [c.cmId, c.type, c.title, ASIL_TAG_TEXT[c.relatedAsil], c.independence, c.outcome ?? '', c.status]),
    [8, 9, 34, 7, 8, 24, 10],
  ));
  return out;
}

const BODY_BUILDERS: Record<FsReportKind, (ctx: FsReportCtx) => (Paragraph | Table)[]> = {
  hara: bodyHara, 'fsc-tsc': bodyFscTsc, fmeda: bodyFmeda, 'safety-case': bodySafetyCase,
};

function evidenceIndex(ctx: FsReportCtx, kind: FsReportKind): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  out.push(h1('附录：证据索引'));
  out.push(p('本报告结论对应的平台内工作产品记录（可回源追溯，均带哈希链审计轨迹）。'));
  const rows: (string | number)[][] = [];
  const push = (type: string, id: unknown, title: string) => rows.push([type, String(id ?? ''), title]);
  if (kind === 'hara' || kind === 'safety-case') ctx.hazards.forEach((h) => push('fs_hazards', h.hazId, h.title));
  if (kind === 'fsc-tsc') ctx.reqs.forEach((r) => push('fs_safety_reqs', r.code, r.title || r.text));
  if (kind === 'fmeda') ctx.fmedas.forEach((f) => push('fs_fmeda', f.fmedaId, f.item));
  if (kind === 'safety-case') { ctx.cases.forEach((c) => push('fs_safety_cases', c.id, c.title)); ctx.confirms.forEach((c) => push('fs_confirm_measures', c.cmId, c.title)); }
  out.push(table(['来源表', '记录', '标题'], rows, [24, 16, 60]));
  return out;
}

export async function exportFsReport(kind: FsReportKind, ctx: FsReportCtx): Promise<void> {
  const meta = REPORT_META[kind];
  const now = Date.now();
  const dateStr = dayjs(now).format('YYYY-MM-DD');
  const reportNo = `${meta.code}-${ctx.projectId}-${dayjs(now).format('YYYYMMDD-HHmm')}`;
  const version = 'v1.0';

  const snapshot = {
    kind, projectId: ctx.projectId, projectName: ctx.projectName, reportNo, version,
    hazards: ctx.hazards, reqs: ctx.reqs, fmedas: ctx.fmedas, ftas: ctx.ftas, dfas: ctx.dfas,
    cases: ctx.cases, confirms: ctx.confirms, plans: ctx.plans, generatedAt: now,
  };
  const snapshotHash = await sha256(JSON.stringify(snapshot));

  const doc = new Document({
    creator: 'tuoleX auto',
    title: `${meta.titleZh} · ${ctx.projectName}`,
    sections: [{
      children: [
        // 封面
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 200 }, children: [new TextRun({ text: meta.titleZh, bold: true, size: 44 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: meta.titleEn, size: 22, color: '666666' })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: `相关项 / 对象：${ctx.projectName}`, size: 22 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: `报告编号：${reportNo}    版本：${version}    ${dateStr}`, size: 20, color: '666666' })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300 }, children: [new TextRun({ text: 'ISO 26262:2018 功能安全', size: 18, color: '888888' })] }),
        new Paragraph({ pageBreakBefore: true, children: [] }),

        // 文档控制表
        h1('文档控制'),
        kvTable([
          ['报告编号', reportNo],
          ['报告类型', `${meta.titleZh}（${meta.code}）`],
          ['对象', ctx.projectName],
          ['版本', version],
          ['日期', dateStr],
          ['状态', 'Final'],
          ['模板版本', TPL_VERSION],
          ['编制', ctx.author.name || ctx.author.username],
        ]),
        h1('修订记录'),
        table(['版本', '日期', '变更说明', '编制'], [[version, dateStr, '初版发布', ctx.author.name || ctx.author.username]], [10, 16, 58, 16]),
        h1('参与者与签核'),
        table(
          ['角色', '姓名', '签名', '日期'],
          [['编制（Author）', ctx.author.name || ctx.author.username, '', dateStr], ['审核（Reviewer）', '', '', ''], ['批准（Approver）', '', '', '']],
          [22, 26, 26, 26],
        ),
        h1('引用文件'),
        table(['编号', '文件'], meta.refs.map((r, i) => [`[R${i + 1}]`, r] as [string, string]), [10, 90]),

        // 正文
        ...BODY_BUILDERS[kind](ctx),

        // 证据索引
        ...evidenceIndex(ctx, kind),

        // 内容哈希
        h1('报告完整性'),
        p(`本报告数据快照经 SHA-256 摘要绑定：${snapshotHash}`),
        p(`导出时间：${dayjs(now).format('YYYY-MM-DD HH:mm:ss')}　导出人：${ctx.author.name || ctx.author.username}`),
        p('该摘要与平台审计哈希链中的 EXPORT 记录一致，可用于完整性校验。'),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveBlob(blob, `${meta.code}_${ctx.projectName}_${dayjs(now).format('YYYYMMDD_HHmm')}.docx`);

  // 冻结 + 审计
  await db.fs_reports.add({
    projectId: ctx.projectId, kind, reportNo, title: meta.titleZh, version,
    snapshotHash, snapshot, createdBy: ctx.author.name || ctx.author.username, createdAt: now,
  } as never, `生成 ${meta.titleZh}（${ctx.projectName}）· 快照 ${snapshotHash.slice(0, 12)}`);

  await writeAudit({
    userId: ctx.author.id, username: ctx.author.username, action: 'EXPORT',
    entityType: 'fs_reports', entityId: ctx.projectId,
    summary: `导出 ${meta.titleZh}（${reportNo}）`,
    before: null, after: { reportNo, version, snapshotHash },
  });
}
