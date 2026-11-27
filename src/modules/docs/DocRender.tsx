import { Typography, Empty, Divider } from 'antd';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { DocRecord, DocSection, LinkEntityType } from '../../core/types';

const { Title, Text } = Typography;

// 只读渲染 TipTap JSON
interface JsonNode { type?: string; content?: JsonNode[]; text?: string; level?: number; marks?: { type: string }[] }

export function parseJson(s?: string): JsonNode {
  try { return s ? JSON.parse(s) : { type: 'doc' }; } catch { return { type: 'doc' }; }
}

function RenderJson({ json }: { json: JsonNode }) {
  if (!json) return null;
  const children = renderChildren(json.content);
  if (json.type === 'paragraph') return <p>{children}</p>;
  if (json.type === 'heading') return <div>{children}</div>;
  if (json.type === 'bulletList') return <ul>{children}</ul>;
  if (json.type === 'orderedList') return <ol>{children}</ol>;
  if (json.type === 'listItem') return <li>{children}</li>;
  if (json.type === 'blockquote') return <blockquote>{children}</blockquote>;
  if (json.type === 'horizontalRule') return <hr />;
  if (json.type === 'text') {
    let t: React.ReactNode = json.text;
    for (const m of json.marks || []) {
      if (m.type === 'bold') t = <strong>{t}</strong>;
      if (m.type === 'italic') t = <em>{t}</em>;
      if (m.type === 'strike') t = <s>{t}</s>;
      if (m.type === 'code') t = <code>{t}</code>;
    }
    return <>{t}</>;
  }
  return <>{children}</>;
}

function renderChildren(children: JsonNode[] | undefined): React.ReactNode {
  if (!children) return null;
  return children.map((c, i) => <RenderJson key={i} json={c} />);
}

const ENTRY_ICON: Record<LinkEntityType, React.ReactNode> = {
  req: <span style={{ color: '#1b6ca8' }}>📄</span>,
  tc: <span style={{ color: '#0ca678' }}>🧪</span>,
  fmea: <span style={{ color: '#cf1322' }}>⚠️</span>,
  vdoc: <span style={{ color: '#722ed1' }}>📁</span>,
  wp: <span style={{ color: '#08979c' }}>📎</span>,
  fs_hazard: <span style={{ color: '#fa541c' }}>🛡️</span>, fs_req: <span style={{ color: '#fa541c' }}>🛡️</span>,
  fs_fmeda: <span style={{ color: '#fa541c' }}>🛡️</span>, fs_fta: <span style={{ color: '#fa541c' }}>🛡️</span>,
  fs_dfa: <span style={{ color: '#fa541c' }}>🛡️</span>, fs_case: <span style={{ color: '#fa541c' }}>🛡️</span>,
  fs_confirm: <span style={{ color: '#fa541c' }}>🛡️</span>, fs_plan: <span style={{ color: '#fa541c' }}>🛡️</span>,
};

interface EntrySnapLike {
  type?: string; id?: number; code?: string; title?: string; desc?: string; meta?: string;
  fields?: Record<string, string>; fieldLabels?: Record<string, string>;
}

// 条目快照渲染（兼容新旧结构）
function EntryBlock({ e }: { e: EntrySnapLike }) {
  const labels = e.fieldLabels || {};
  const keys = Object.keys(labels);
  const vals = e.fields || {};
  const text = keys.length > 0 ? keys.map((k) => vals[k]).join('\n') : (e.desc || '');
  const meta = e.meta || '';
  return (
    <div className="doc-entry">
      <div className="entry-head">{ENTRY_ICON[(e.type || 'req') as LinkEntityType]} {e.code} <span style={{ fontWeight: 500, color: '#1b6ca8' }}>{e.title}</span></div>
      <div className="entry-desc">{text}</div>
      {meta && <div className="entry-meta">{meta}</div>}
    </div>
  );
}

// 章节只读渲染
function SectionView({ sec }: { sec: DocSection }) {
  const { t } = useTranslation();
  if (sec.type === 'text') return <div className="doc-editor"><RenderJson json={parseJson(sec.content)} /></div>;
  if (sec.type === 'entries') {
    const snaps = (sec.snapshot as EntrySnapLike[]) || [];
    return (
      <div>
        {sec.intro && <div className="doc-editor"><RenderJson json={parseJson(sec.intro)} /></div>}
        {snaps.length === 0 ? <Empty description={t('docEditor.noEntries')} image={Empty.PRESENTED_IMAGE_SIMPLE} /> : snaps.map((e, i) => <EntryBlock key={i} e={e} />)}
        {sec.outro && <div className="doc-editor"><RenderJson json={parseJson(sec.outro)} /></div>}
      </div>
    );
  }
  // toc
  return (
    <div>
      <Text type="secondary">{t('docEditor.addTocSec')}</Text>
    </div>
  );
}

// ============ 完整文档只读视图（历史预览 / 导出用）============
export default function DocRender({ doc }: { doc: DocRecord }) {
  const { t } = useTranslation();
  return (
    <div className="doc-page">
      <Title level={2} style={{ textAlign: 'center', margin: '0 0 8px', color: '#0b2545' }}>{doc.title}</Title>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>{doc.docType} · v{doc.version} · {t('docEditor.revisedOn', { date: dayjs(doc.updatedAt).format('YYYY-MM-DD') })}</Text>
      </div>
      <Divider style={{ margin: '0 0 20px' }} />
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24, fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f0f5fa' }}>
            {[t('docEditor.hdrVersion'), t('docEditor.hdrDate'), t('docEditor.hdrBy'), t('docEditor.hdrNote')].map((h) => <th key={h} style={{ border: '1px solid #d9d9d9', padding: '6px 10px', textAlign: 'left' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {[...(doc.history || [])].reverse().map((h) => (
            <tr key={h.version}>
              <td style={{ border: '1px solid #d9d9d9', padding: '6px 10px' }}>v{h.version}</td>
              <td style={{ border: '1px solid #d9d9d9', padding: '6px 10px' }}>{dayjs(h.date).format('YYYY-MM-DD HH:mm')}</td>
              <td style={{ border: '1px solid #d9d9d9', padding: '6px 10px' }}>{h.by}</td>
              <td style={{ border: '1px solid #d9d9d9', padding: '6px 10px' }}>{h.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {doc.sections.map((s: DocSection) => (
        <div key={s.id} style={{ marginBottom: 28, breakInside: 'avoid' }}>
          <Title level={4} style={{ color: '#0b2545', marginBottom: 8 }}>{s.title}</Title>
          <SectionView sec={s} />
        </div>
      ))}
    </div>
  );
}
