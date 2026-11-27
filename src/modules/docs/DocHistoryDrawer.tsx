import { useState } from 'react';
import { Modal, Drawer, Table, Tag, Space, Button, Select, Typography, Tabs, Alert, message } from 'antd';
import { EyeOutlined, DiffOutlined, HistoryOutlined, FileWordOutlined } from '@ant-design/icons';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { useTranslation } from 'react-i18next';
import DocRender from './DocRender';
import DocDiffView from './DocDiffView';
import { lineDiff } from '../../core/history';

import dayjs from 'dayjs';
import type { DocVersion, DocRecord as DocRecordLike } from '../../core/types';

const { Text } = Typography;

// ============ 行级差异高亮 ============
export function DiffView({ before, after }: { before: string; after: string }) {
  const parts = lineDiff(before, after);
  return (
    <div className="diff-view">
      {parts.map((p, i) => (
        <div key={i} className={p.added ? 'diff-added' : p.removed ? 'diff-removed' : 'diff-unchanged'}>
          {p.value.split('\n').map((l, j) => <div key={j} style={{ minHeight: 18 }}>{l || '\u00A0'}</div>)}
        </div>
      ))}
    </div>
  );
}

// ============ 文档历史：版本列表 + 完整预览 + 任意两版对比 ============
export default function DocHistoryDrawer({ docId, open, onClose }: { docId: number; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  const versions = useLiveQuery(() => db.doc_versions.where('docId').equals(docId).sortBy('version'), [docId]) ?? [];
  const doc = useLiveQuery(() => db.documents.get(docId), [docId]);

  const [previewV, setPreviewV] = useState<DocVersion | null>(null);
  const [v1, setV1] = useState<number | null>(null);
  const [v2, setV2] = useState<number | null>(null);
  const [compareResult, setCompareResult] = useState<{ docA: DocRecordLike; docB: DocRecordLike } | null>(null);

  const allVersions = [...versions, ...(doc ? [{ id: -1, docId, version: doc.version, title: doc.title, sections: doc.sections, savedAt: doc.updatedAt, savedBy: t('docHistory.currentBy'), note: t('docHistory.currentNote') } as DocVersion] : [])].sort((a, b) => a.version - b.version);

  const asDocRecord = (v: DocVersion) => ({
    id: docId,
    title: v.title,
    docType: doc?.docType || '',
    projectId: doc?.projectId,
    sections: v.sections,
    version: v.version,
    status: 'draft' as const,
    signatureIds: [],
    history: [{ version: v.version, date: v.savedAt, by: v.savedBy, note: v.note }],
    createdAt: doc?.createdAt ?? v.savedAt,
    updatedAt: v.savedAt,
  });

  const doCompare = () => {
    if (!v1 || !v2 || v1 === v2) { msg.warning(t('docHistory.pickTwo')); return; }
    const a = allVersions.find((v) => v.version === v1);
    const b = allVersions.find((v) => v.version === v2);
    if (!a || !b) return;
    setCompareResult({ docA: asDocRecord(a), docB: asDocRecord(b) });
  };

  return (
    <>
      <Drawer open={open} onClose={() => { onClose(); setPreviewV(null); setCompareResult(null); }} width={960} title={<Space><HistoryOutlined />{t('docHistory.title')}</Space>}>
        {msgCtx}
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message={t('docHistory.alertInfo', { n: allVersions.length })} />
        <Tabs
          items={[
            { key: 'list', label: t('docHistory.tabList'), children: (
              <Table<DocVersion>
                rowKey="id" size="small" dataSource={[...allVersions].reverse()} pagination={false}
                columns={[
                  { title: t('docHistory.colVersion'), dataIndex: 'version', width: 80, render: (v) => <Tag color={v === doc?.version ? 'green' : 'cyan'}>v{v}</Tag> },
                  { title: t('docHistory.colSavedAt'), dataIndex: 'savedAt', width: 150, render: (t) => dayjs(t).format('YYYY-MM-DD HH:mm:ss') },
                  { title: t('docHistory.colBy'), dataIndex: 'savedBy', width: 110 },
                  { title: t('docHistory.colNote'), dataIndex: 'note', ellipsis: true },
                  { title: t('docHistory.colActions'), width: 150, render: (_, v) => (
                    <Space size={4}>
                      <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => setPreviewV(v)}>{t('docHistory.fullPreview')}</Button>
                      <Button size="small" type="link" icon={<DiffOutlined />} onClick={() => setPreviewV(null)}>{t('docHistory.compare')}</Button>
                    </Space>
                  )},
                ]}
              />
            ) },
            { key: 'compare', label: t('docHistory.tabCompare'), children: (
              <div>
                <Space style={{ marginBottom: 12 }}>
                  <Select style={{ width: 140 }} placeholder={t('docHistory.verAPh')} value={v1} onChange={setV1}
                    options={allVersions.map((v) => ({ value: v.version, label: `v${v.version}` }))} />
                  <Text type="secondary">{t('docHistory.compare')}</Text>
                  <Select style={{ width: 140 }} placeholder={t('docHistory.verBPh')} value={v2} onChange={setV2}
                    options={allVersions.map((v) => ({ value: v.version, label: `v${v.version}` }))} />
                  <Button type="primary" size="small" onClick={doCompare} disabled={!v1 || !v2}>{t('docHistory.startCompare')}</Button>
                  <Button size="small" onClick={() => { setV1(null); setV2(null); setCompareResult(null); }}>{t('docHistory.clear')}</Button>
                </Space>
                {compareResult && (
                  <Alert type="info" showIcon style={{ marginBottom: 12 }}
                    message={t('docHistory.compareAlert', { a: v1, b: v2 })} />
                )}
                {compareResult && <DocDiffView docA={compareResult.docA} docB={compareResult.docB} />}
              </div>
            ) },
          ]}
        />
      </Drawer>

      {/* 历史版本完整预览 */}
      <Modal open={!!previewV} onCancel={() => setPreviewV(null)} footer={null} width={900}
        title={previewV ? <Space><FileWordOutlined />{t('docHistory.previewTitle', { title: previewV.title })} <Tag color="cyan">v{previewV.version}</Tag></Space> : ''}>
        {previewV && (
          <div style={{ maxHeight: '70vh', overflow: 'auto', background: '#e9edf2', padding: 16, borderRadius: 8 }}>
            <DocRender doc={asDocRecord(previewV)} />
          </div>
        )}
      </Modal>
    </>
  );
}


