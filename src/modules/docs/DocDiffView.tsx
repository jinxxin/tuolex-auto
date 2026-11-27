import { useMemo } from 'react';
import { Tag, Typography, Divider, Empty } from 'antd';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { lineDiff, textOfJson } from '../../core/history';
import { parseJson } from './DocRender';
import type { DocRecord, DocSection } from '../../core/types';

const { Title, Text } = Typography;

type DiffPart = { value: string; added?: boolean; removed?: boolean };

interface EntryDiffModel {
  code: string;
  title: string;
  status: 'same' | 'added' | 'removed' | 'changed';
  fields?: { field: string; label: string; before: string; after: string }[];
  metaA?: string;
  metaB?: string;
}

interface SectionDiffModel {
  sectionId: string;
  title: string;
  status: 'same' | 'only_a' | 'only_b' | 'changed';
  parts?: DiffPart[];          // text 章节行级 diff
  entryDiffs?: EntryDiffModel[];
  introParts?: DiffPart[];
  outroParts?: DiffPart[];
}

interface SnapLike {
  code?: string; title?: string; desc?: string; meta?: string;
  fields?: Record<string, string>; fieldLabels?: Record<string, string>;
}

const ENTRY_ICON: Record<string, string> = { req: '📄', tc: '🧪', fmea: '⚠️', vdoc: '📁' };

// ============ 并排页面视图版本对比 ============
export default function DocDiffView({ docA, docB }: { docA: DocRecord; docB: DocRecord }) {
  const { t } = useTranslation();
  const model = useMemo(() => buildModel(docA.sections, docB.sections), [docA, docB]);
  const changedCount = model.filter((m) => m.status !== 'same').length;

  if (changedCount === 0) {
    return <Empty description={t('docDiff.identical')} />;
  }

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 16 }}>
      <div style={{ flex: '0 0 46%', minWidth: 380 }}>
        <DiffPage doc={docA} side="left" model={model} />
      </div>
      <div style={{ flex: '0 0 46%', minWidth: 380 }}>
        <DiffPage doc={docB} side="right" model={model} />
      </div>
    </div>
  );
}

// 单个版本页面（差异在对应侧高亮）
function DiffPage({ doc, side, model }: { doc: DocRecord; side: 'left' | 'right'; model: SectionDiffModel[] }) {
  const { t } = useTranslation();
  const isLeft = side === 'left';
  return (
    <div className="doc-page" style={{ padding: '32px 36px', fontSize: 13.5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Title level={4} style={{ margin: 0, color: isLeft ? '#a8071a' : '#237804' }}>
          {isLeft ? '◀ ' + t('docDiff.old') : t('docDiff.new') + ' ▶'}
        </Title>
        <Tag color={isLeft ? 'red' : 'green'}>v{doc.version}</Tag>
      </div>
      <Title level={2} style={{ textAlign: 'center', margin: '0 0 4px', color: '#0b2545', fontSize: 20 }}>{doc.title}</Title>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>{t('docDiff.savedAt', { date: dayjs(doc.updatedAt).format('YYYY-MM-DD HH:mm') })} · {doc.history[0]?.by}</Text>
      </div>
      <Divider style={{ margin: '0 0 16px' }} />

      {doc.sections.map((sec) => {
        const m = model.find((x) => x.sectionId === sec.id);
        if (!m) return null;
        // 对方版本才有的章节：本侧显示占位
        if ((m.status === 'only_b' && isLeft) || (m.status === 'only_a' && !isLeft)) {
          return (
            <div key={sec.id} style={{ marginBottom: 20, padding: '10px 14px', background: '#fafafa', border: '1px dashed #d9d9d9', borderRadius: 6 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{m.status === 'only_b' ? t('docDiff.secOnlyB', { title: m.title }) : t('docDiff.secOnlyA', { title: m.title })}</Text>
            </div>
          );
        }
        return (
          <div key={sec.id} style={{ marginBottom: 22 }}>
            <Title level={4} style={{ color: '#0b2545', marginBottom: 6, fontSize: 16 }}>{sec.title}</Title>
            <SectionDiff sec={sec} model={m} side={side} />
          </div>
        );
      })}
    </div>
  );
}

// 章节差异渲染
function SectionDiff({ sec, model, side }: { sec: DocSection; model: SectionDiffModel; side: 'left' | 'right' }) {
  const { t } = useTranslation();
  if (sec.type === 'text') {
    return <TextDiffBlock parts={model.parts || []} side={side} />;
  }
  if (sec.type === 'entries') {
    return (
      <div>
        {model.introParts && model.introParts.length > 0 && <TextDiffBlock parts={model.introParts} side={side} prefix={t('docDiff.introPrefix')} />}
        {(model.entryDiffs || []).map((ed) => <EntryDiffCard key={ed.code} ed={ed} side={side} />)}
        {model.outroParts && model.outroParts.length > 0 && <TextDiffBlock parts={model.outroParts} side={side} prefix={t('docDiff.outroPrefix')} />}
      </div>
    );
  }
  return null;
}

// 条目差异卡片
function EntryDiffCard({ ed, side }: { ed: EntryDiffModel; side: 'left' | 'right' }) {
  const { t } = useTranslation();
  const isLeft = side === 'left';
  if ((ed.status === 'added' && isLeft) || (ed.status === 'removed' && !isLeft)) {
    return (
      <div style={{ border: '1px dashed #d9d9d9', borderRadius: 4, padding: '6px 10px', margin: '6px 0', background: '#fafafa' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>{ed.status === 'added' ? t('docDiff.entryAdded', { code: ed.code, title: ed.title }) : t('docDiff.entryRemoved', { code: ed.code, title: ed.title })}</Text>
      </div>
    );
  }
  const changed = ed.status === 'changed';
  const borderColor = changed ? (isLeft ? '#ffccc7' : '#d9f7be') : 'transparent';
  const bgColor = changed ? (isLeft ? '#fff2f0' : '#f6ffed') : '#f8fafc';
  return (
    <div className="doc-entry" style={{ borderColor, background: bgColor, borderWidth: changed ? 2 : 1 }}>
      <div className="entry-head">
        {ENTRY_ICON[ed.code.startsWith('TC') ? 'tc' : ed.code.startsWith('RPN') ? 'fmea' : 'req']} {ed.code}
        <span style={{ fontWeight: 500, color: '#1b6ca8' }}>{ed.title}</span>
        {changed && <Tag color={isLeft ? 'red' : 'green'} style={{ marginLeft: 6 }}>{isLeft ? t('docDiff.tagModified') : t('docDiff.tagAfter')}</Tag>}
        {ed.status === 'added' && !isLeft && <Tag color="green" style={{ marginLeft: 6 }}>{t('docDiff.added')}</Tag>}
        {ed.status === 'removed' && isLeft && <Tag color="red" style={{ marginLeft: 6 }}>{t('docDiff.removed')}</Tag>}
      </div>
      {changed && ed.fields ? (
        <div className="entry-desc">
          {ed.fields.map((f) => (
            <div key={f.field} style={{ margin: '4px 0' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{f.label}（{t(isLeft ? 'docDiff.oldContent' : 'docDiff.newContent')}）：</Text>
              <div style={{ whiteSpace: 'pre-wrap', background: isLeft ? '#fff1f0' : '#f6ffed', padding: '3px 8px', borderRadius: 4, fontSize: 13 }}>
                {isLeft ? f.before : f.after}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="entry-desc">{' '}</div>
      )}
      {(isLeft ? ed.metaA : ed.metaB) && <div className="entry-meta">{isLeft ? ed.metaA : ed.metaB}</div>}
    </div>
  );
}



// 文本差异块：左侧显示旧内容（删除红），右侧显示新内容（新增绿）
function TextDiffBlock({ parts, side, prefix }: { parts: DiffPart[]; side: 'left' | 'right'; prefix?: string }) {
  const { t } = useTranslation();
  const isLeft = side === 'left';
  return (
    <div className="doc-editor" style={{ fontSize: 13 }}>
      {prefix && <Text type="secondary" style={{ fontSize: 11 }}>{prefix}</Text>}
      {parts.map((p, i) => {
        const show = isLeft ? !p.added : !p.removed;
        if (!show) {
          return (
            <div key={i} style={{ background: '#fafafa', color: '#bfbfbf', padding: '2px 6px', borderRadius: 3, margin: '2px 0', fontSize: 12 }}>
              {isLeft ? t('docDiff.placeholderAdded') : t('docDiff.placeholderRemoved')}
            </div>
          );
        }
        return (
          <div key={i} className={p.added ? 'diff-added' : p.removed ? 'diff-removed' : 'diff-unchanged'}
            style={{ padding: '1px 6px', borderRadius: 3, margin: '1px 0' }}>
            {p.value.split('\n').map((l, j) => <div key={j} style={{ minHeight: 18 }}>{l || '\u00A0'}</div>)}
          </div>
        );
      })}
    </div>
  );
}

// ============ 构建章节级对比模型 ============
function buildModel(a: DocSection[], b: DocSection[]): SectionDiffModel[] {
  const out: SectionDiffModel[] = [];
  const ids = new Set([...a.map((s) => s.id), ...b.map((s) => s.id)]);
  for (const id of ids) {
    const sa = a.find((s) => s.id === id);
    const sb = b.find((s) => s.id === id);
    if (!sa && sb) { out.push({ sectionId: id, title: sb.title, status: 'only_b' }); continue; }
    if (sa && !sb) { out.push({ sectionId: id, title: sa.title, status: 'only_a' }); continue; }
    if (!sa || !sb) continue;
    if (sa.type === 'text') {
      const ta = textOfJson(sa.content);
      const tb = textOfJson(sb.content);
      out.push({ sectionId: id, title: sa.title, status: ta === tb ? 'same' : 'changed', parts: lineDiff(ta, tb) });
    } else if (sa.type === 'entries') {
      const model: SectionDiffModel = { sectionId: id, title: sa.title, status: 'same' };
      const introA = textOfJson(sa.intro); const introB = textOfJson(sb.intro);
      if (introA !== introB) { model.status = 'changed'; model.introParts = lineDiff(introA, introB); }
      const outroA = textOfJson(sa.outro); const outroB = textOfJson(sb.outro);
      if (outroA !== outroB) { model.status = 'changed'; model.outroParts = lineDiff(outroA, outroB); }
      model.entryDiffs = entryDiffs((sa.snapshot as SnapLike[]) || [], (sb.snapshot as SnapLike[]) || []);
      if (model.entryDiffs.some((e) => e.status !== 'same')) model.status = 'changed';
      out.push(model);
    } else {
      out.push({ sectionId: id, title: sa.title, status: 'same' });
    }
  }
  return out;
}

// 条目快照 diff（按 code 匹配）
function entryDiffs(aSnaps: SnapLike[], bSnaps: SnapLike[]): EntryDiffModel[] {
  const out: EntryDiffModel[] = [];
  const codes = new Set([...aSnaps.map((s) => s.code), ...bSnaps.map((s) => s.code)]);
  for (const code of codes) {
    if (!code) continue;
    const ea = aSnaps.find((s) => s.code === code);
    const eb = bSnaps.find((s) => s.code === code);
    if (!ea && eb) { out.push({ code, title: eb.title || '', status: 'added', metaB: eb.meta }); continue; }
    if (ea && !eb) { out.push({ code, title: ea.title || '', status: 'removed', metaA: ea.meta }); continue; }
    if (!ea || !eb) continue;
    const fa = ea.fields || (ea.desc ? { desc: ea.desc } : {});
    const fb = eb.fields || (eb.desc ? { desc: eb.desc } : {});
    const labels = eb.fieldLabels || ea.fieldLabels || { desc: '内容' };
    const fields: EntryDiffModel['fields'] = [];
    for (const k of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
      const va = fa[k] || ''; const vb = fb[k] || '';
      if (va !== vb) fields.push({ field: k, label: labels[k] || k, before: va, after: vb });
    }
    out.push(fields.length
      ? { code, title: eb.title || '', status: 'changed', fields, metaA: ea.meta, metaB: eb.meta }
      : { code, title: eb.title || '', status: 'same' });
  }
  return out;
}

// 供外部引用（避免未使用警告）
void parseJson;
