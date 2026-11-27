import { useState } from 'react';
import { Modal, Table, Tag, Space, Button, Typography, Empty, Alert, Timeline } from 'antd';
import { HistoryOutlined, DiffOutlined } from '@ant-design/icons';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { DiffView } from '../docs/DocHistoryDrawer';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import type { EntryVersion } from '../../core/types';

const { Text } = Typography;

const FIELD_KEY: Record<string, string> = {
  desc: 'entryHist.field.desc', steps: 'entryHist.field.steps', expected: 'entryHist.field.expected',
  failureMode: 'entryHist.field.failureMode', effect: 'entryHist.field.effect', cause: 'entryHist.field.cause', action: 'entryHist.field.action',
};

interface Props {
  entityType: 'req' | 'tc' | 'fmea';
  entityId: number;
  entityLabel: string;   // REQ-001
  open: boolean;
  onClose: () => void;
}

// ============ 条目版本历史：每次修改的变更信息 + 字段级高亮 ============
export default function EntryHistoryModal({ entityType, entityId, entityLabel, open, onClose }: Props) {
  const { t } = useTranslation();
  const versions = useLiveQuery(
    () => db.entry_versions.where('[entityType+entityId]').equals([entityType, entityId]).sortBy('version'),
    [entityType, entityId],
  ) ?? [];
  const [selected, setSelected] = useState<EntryVersion | null>(null);
  const [comparePrev, setComparePrev] = useState(false);

  const fieldLabel = (k: string) => t(FIELD_KEY[k] || k);

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={760}
      title={<Space><HistoryOutlined />{t('entryHist.title', { label: entityLabel })}</Space>}>
      {versions.length === 0 && (
        <Empty description={t('entryHist.empty')} />
      )}
      {versions.length > 0 && (
        <>
          <Alert type="info" showIcon style={{ marginBottom: 12 }}
            message={t('entryHist.alertInfo')} />
          <Table<EntryVersion>
            rowKey="id" size="small" dataSource={[...versions].reverse()} pagination={false}
            columns={[
              { title: t('entryHist.colVersion'), dataIndex: 'version', width: 70, render: (v) => <Tag color="cyan">v{v}</Tag> },
              { title: t('entryHist.colTime'), dataIndex: 'changedAt', width: 150, render: (v) => dayjs(v).format('MM-DD HH:mm:ss') },
              { title: t('entryHist.colBy'), dataIndex: 'changedBy', width: 110 },
              { title: t('entryHist.colFields'), width: 120, render: (_, v) => v.changes.map((c) => <Tag key={c.field} color="orange">{fieldLabel(c.field)}</Tag>) },
              { title: t('entryHist.colSource'), dataIndex: 'note', ellipsis: true },
              { title: t('common.actions'), width: 140, render: (_, v) => (
                <Space size={4}>
                  <Button size="small" type="link" icon={<DiffOutlined />} onClick={() => { setSelected(v); setComparePrev(true); }}>{t('entryHist.viewChange')}</Button>
                  <Button size="small" type="link" onClick={() => { setSelected(v); setComparePrev(false); }}>{t('entryHist.detail')}</Button>
                </Space>
              )},
            ]}
          />
        </>
      )}

      {/* 变更详情 */}
      <Modal open={!!selected} onCancel={() => setSelected(null)} footer={null} width={680}
        title={selected ? <Space>{t('entryHist.detailTitle', { label: entityLabel })} <Tag color="cyan">v{selected.version}</Tag>{t('entryHist.detailMeta', { time: dayjs(selected.changedAt).format('YYYY-MM-DD HH:mm:ss'), by: selected.changedBy })}</Space> : ''}>
        {selected && (
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>{t('entryHist.srcText', { note: selected.note || '—' })}</Text>
            {comparePrev ? (
              <div style={{ marginTop: 12 }}>
                {selected.changes.map((c) => (
                  <div key={c.field} style={{ marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 6, padding: 10 }}>
                    <Tag color="orange">{fieldLabel(c.field)}</Tag>
                    <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>{t('entryHist.fieldChangeHint')}</Text>
                    <div style={{ marginTop: 6 }}>
                      <DiffView before={c.before} after={c.after} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <Timeline items={selected.changes.map((c) => ({
                  color: 'orange',
                  children: (
                    <div>
                      <Text strong>{fieldLabel(c.field)}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{t('entryHist.verRange', { from: Math.max(selected.version - 1, 0), to: selected.version })}</Text>
                      <div style={{ marginTop: 6 }}>
                        <div style={{ background: '#fff1f0', padding: '4px 8px', borderRadius: 4, fontSize: 13 }}><Text type="secondary" style={{ fontSize: 12 }}>{t('entryHist.oldVal')}</Text>{c.before}</div>
                        <div style={{ background: '#f6ffed', padding: '4px 8px', borderRadius: 4, fontSize: 13, marginTop: 4 }}><Text type="secondary" style={{ fontSize: 12 }}>{t('entryHist.newVal')}</Text>{c.after}</div>
                      </div>
                    </div>
                  ),
                }))} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </Modal>
  );
}
