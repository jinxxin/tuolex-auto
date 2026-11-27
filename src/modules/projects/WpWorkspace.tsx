import { useMemo, useState } from 'react';
import { Card, Tag, Space, Button, Typography, Empty, Modal, message, Table, List } from 'antd';
import { FileWordOutlined, ThunderboltOutlined, EyeOutlined, EditOutlined, AimOutlined } from '@ant-design/icons';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { generateWp } from '../../core/wp';
import { PROCESS_GROUPS, V_LAYERS, vLayerLabel } from '../../core/aspice/processes';
import { useAuth } from '../../store/auth';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { Project, WpTemplate } from '../../core/types';

const { Text } = Typography;

// ============ 工作产品（WP）工作台 ============
// 选择过程 → 该过程的 WP 模板 → 一键生成文档（自动填充 V 条目）→ 编辑/导出 → 审计交付
export default function WpWorkspace({ project }: { project: Project }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const { t, i18n } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  const actor = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };

  const templates = useLiveQuery(() => db.wp_templates.where('stdVersion').equals(project.stdVersion).toArray(), [project.stdVersion]) ?? [];
  const wps = useLiveQuery(() => db.work_products.where('projectId').equals(project.id!).sortBy('updatedAt'), [project.id]) ?? [];
  const docs = useLiveQuery(() => db.documents.where('projectId').equals(project.id!).toArray(), [project.id]) ?? [];

  const [selProc, setSelProc] = useState<string | null>(project.processScope?.[0] || null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [preview, setPreview] = useState<WpTemplate | null>(null);

  // 项目 scope 内的过程（有模板的）
  const procOptions = useMemo(() => {
    const withTpl = new Set(templates.map((t) => t.processCode));
    return (project.processScope || []).filter((c) => withTpl.has(c)).sort();
  }, [templates, project.processScope]);

  const procTemplates = useMemo(() => templates.filter((t) => t.processCode === selProc), [templates, selProc]);

  // 项目已有 WP 文档（含模板信息）
  const wpDocs = useMemo(() => {
    return wps.map((w) => ({ wp: w, doc: docs.find((d) => d.id === w.docId) })).sort((a, b) => (b.wp.updatedAt || 0) - (a.wp.updatedAt || 0));
  }, [wps, docs]);

  const gen = async (tpl: WpTemplate) => {
    setGenerating(tpl.wpCode);
    try {
      const docId = await generateWp(project, tpl, actor, user?.name || '');
      msg.success(t('wp.genOk', { title: tpl.title }));
      nav(`/docs/${docId}`);
    } catch (e) {
      msg.error(t('wp.genFail', { err: e instanceof Error ? e.message : String(e) }));
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div>
      {msgCtx}
      <Alert2 />
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* 左：过程选择 */}
        <Card size="small" style={{ width: 250, flexShrink: 0 }} title={t('wp.procTitle')}>
          <List
            size="small" dataSource={procOptions}
            renderItem={(code) => {
              const p = templates.find((tpl) => tpl.processCode === code);
              const count = templates.filter((tpl) => tpl.processCode === code).length;
              const group = PROCESS_GROUPS[code.split('.')[0]] || { color: '#666' };
              return (
                <List.Item
                  onClick={() => setSelProc(code)}
                  style={{ cursor: 'pointer', padding: '6px 8px', borderRadius: 6, background: selProc === code ? '#e6f4ff' : 'transparent', borderLeft: `3px solid ${group.color}`, marginBottom: 4 }}
                >
                  <Space size={6}>
                    <Text strong style={{ fontSize: 13 }}>{code}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{p?.title ? code.split('.')[0] : ''}</Text>
                    <Tag style={{ fontSize: 10 }}>{count} WP</Tag>
                  </Space>
                </List.Item>
              );
            }}
          />
          {procOptions.length === 0 && <Empty description={t('wp.emptyScope')} image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        </Card>

        {/* 右：WP 模板列表 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Card size="small" title={selProc ? t('wp.tplTitle', { code: selProc, n: procTemplates.length }) : t('wp.tplSelectTitle')}>
            {procTemplates.length === 0 ? (
              <Empty description={t('wp.noTpl')} />
            ) : (
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {procTemplates.map((tpl) => {
                  const entrySecs = (tpl.sections ?? []).filter((s) => s.kind === 'entries');
                  const filters = entrySecs.map((s) => s.entryFilter?.reqType || s.entryFilter?.tcPrefix || (s.entryFilter?.fmea ? t('wp.risk') : '')).filter(Boolean);
                  const filtersZh = filters.map((f) => {
                    const layer = V_LAYERS.find((l) => l.key === f);
                    return layer ? vLayerLabel(layer, i18n.language) : f;
                  });
                  return (
                    <div key={tpl.wpCode} style={{ border: '1px solid #e3eaf2', borderRadius: 10, padding: '12px 14px', background: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <FileWordOutlined style={{ color: '#1b6ca8', fontSize: 18 }} />
                        <Text strong style={{ fontSize: 14, color: '#0b2545' }}>{tpl.title}</Text>
                        <Tag color="cyan">{tpl.wpCode}</Tag>
                        <Tag>{t('wp.sectionCount', { n: tpl.sections?.length ?? 0 })}</Tag>
                        {filtersZh.length > 0 && <Tag color="geekblue">{t('wp.autoFill')}{filtersZh.join(' / ')}</Tag>}
                        <span style={{ flex: 1 }} />
                        <Button size="small" onClick={() => setPreview(tpl)}>{t('wp.previewTpl')}</Button>
                        <Button size="small" type="primary" icon={<ThunderboltOutlined />} loading={generating === tpl.wpCode} onClick={() => gen(tpl)}>{t('wp.genBtn')}</Button>
                      </div>
                      <Text type="secondary" style={{ fontSize: 12.5, display: 'block', marginTop: 6 }}>{tpl.intro}</Text>
                    </div>
                  );
                })}
              </Space>
            )}
          </Card>

          {/* 已生成的 WP 文档 */}
          <Card size="small" style={{ marginTop: 12 }} title={t('wp.generatedTitle', { n: wpDocs.length })}>
            {wpDocs.length === 0 ? (
              <Empty description={t('wp.noWp')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Table
                rowKey={(r) => r.wp.id!} size="small" dataSource={wpDocs} pagination={false}
                columns={[
                  { title: t('wp.colWp'), render: (_, r) => <Space size={6}><Tag color="cyan">{r.wp.wpCode}</Tag><Text strong>{r.wp.title}</Text></Space> },
                  { title: t('wp.colProc'), dataIndex: ['wp', 'processCode'], width: 90, render: (v: string) => <Tag color="geekblue">{v}</Tag> },
                  { title: t('wp.colRefs'), width: 100, render: (_, r) => {
                    const secs = (r.doc?.sections ?? []).filter((s: { type: string }) => s.type === 'entries');
                    const n = secs.reduce((acc: number, s: { refs?: unknown[] }) => acc + (s.refs?.length || 0), 0);
                    return n > 0 ? <Tag color="green">{t('wp.refsCount', { n })}</Tag> : <Text type="secondary">—</Text>;
                  } },
                  { title: t('wp.colStatus'), width: 90, render: (_, r) => r.wp.status === 'approved' ? <Tag color="green">{t('wp.status.approved')}</Tag> : r.wp.status === 'reviewed' ? <Tag color="orange">{t('wp.status.reviewed')}</Tag> : <Tag>{t('wp.status.draft')}</Tag> },
                  { title: t('wp.colActions'), width: 170, render: (_, r) => (
                    <Space size={2}>
                      <Button size="small" type="link" icon={<EyeOutlined />} disabled={!r.doc} onClick={() => r.doc?.id && nav(`/docs/${r.doc.id}?view=1`)}>{t('wp.preview')}</Button>
                      <Button size="small" type="link" icon={<EditOutlined />} disabled={!r.doc} onClick={() => r.doc?.id && nav(`/docs/${r.doc.id}`)}>{t('common.edit')}</Button>
                    </Space>
                  ) },
                ]}
              />
            )}
          </Card>
        </div>
      </div>

      {/* 模板预览 */}
      <Modal open={!!preview} onCancel={() => setPreview(null)} footer={null} width={680} title={preview ? t('wp.previewTitle', { title: preview.title, code: preview.wpCode }) : ''}>
        {preview && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div style={{ background: '#f6f9fc', padding: '10px 14px', borderRadius: 8 }}>
              <Text strong style={{ fontSize: 13 }}>{t('wp.tplIntroLabel')}</Text>
              <div style={{ fontSize: 13, marginTop: 4 }}>{preview.intro}</div>
            </div>
            {preview.sections.map((s) => (
              <div key={s.id} style={{ border: '1px solid #e3eaf2', borderRadius: 8, padding: '10px 14px' }}>
                <Space size={8}>
                  <Tag color={s.kind === 'entries' ? 'geekblue' : 'default'}>{s.kind === 'entries' ? t('wp.sectionEntries') : t('wp.sectionText')}</Tag>
                  <Text strong style={{ fontSize: 13 }}>{s.title}</Text>
                </Space>
                {s.kind === 'entries' ? (
                  <div style={{ fontSize: 12.5, color: '#666', marginTop: 6 }}>
                    {t('wp.entriesHint', { d: s.desc || t('wp.autoPull') })}
                  </div>
                ) : (
                  <div style={{ fontSize: 12.5, color: '#666', marginTop: 6, whiteSpace: 'pre-wrap', maxHeight: 140, overflow: 'auto' }}>{s.text}</div>
                )}
              </div>
            ))}
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('wp.afterGenNote')}
            </Text>
          </Space>
        )}
      </Modal>
    </div>
  );
}

function Alert2() {
  const { t } = useTranslation();
  return (
    <div style={{ background: '#e6f7ff', border: '1px solid #91caff', borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 12.5, color: '#003a8c' }}>
      <AimOutlined /> {t('wp.alertNote')}
    </div>
  );
}
