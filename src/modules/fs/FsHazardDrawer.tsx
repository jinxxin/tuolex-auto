import { Drawer, Descriptions, Tag, Timeline, Space, Button, Typography, Divider } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { ASIL_TAG_TEXT, ASIL_COLOR, SEVERITY_OPTIONS, EXPOSURE_OPTIONS, CONTROLLABILITY_OPTIONS } from '../../core/fs/data';
import type { FsHazard, AuditLog } from '../../core/types';

const { Text, Title } = Typography;

// HARA 条目工作项详情（点击条目打开查看；字段定义 + 覆写留痕 + 审计轨迹）
export default function FsHazardDrawer({
  hazard, onClose, onEdit,
}: { hazard: FsHazard | null; onClose: () => void; onEdit: (h: FsHazard) => void }) {
  const { t } = useTranslation();
  const logs = useLiveQuery(
    () => db.audit_logs.where('entityType').equals('fs_hazards').toArray(),
    [hazard?.id],
  ) ?? [];
  const trail = logs
    .filter((l: AuditLog) => l.entityType === 'fs_hazards' && String(l.entityId) === String(hazard?.id))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 8);

  const def = (arr: { value: string; zh: string; en: string }[], v?: string) =>
    arr.find((x) => x.value === v);
  const sev = def(SEVERITY_OPTIONS, hazard?.severity);
  const exp = def(EXPOSURE_OPTIONS, hazard?.exposure);
  const con = def(CONTROLLABILITY_OPTIONS, hazard?.controllability);
  const actLabel = (a: string) => (a === 'CREATE' ? '创建' : a === 'UPDATE' ? '更新' : a === 'DELETE' ? '删除' : a);

  return (
    <Drawer
      open={!!hazard} onClose={onClose} width={560}
      title={
        hazard ? (
          <Space>
            <Text code style={{ fontSize: 14 }}>{hazard.hazId}</Text>
            <Text strong>{hazard.title}</Text>
            <Tag color={ASIL_COLOR[hazard.asil]}>{ASIL_TAG_TEXT[hazard.asil]}{hazard.asilManual ? ' ✎' : ''}</Tag>
          </Space>
        ) : null
      }
      extra={hazard && <Button type="primary" icon={<EditOutlined />} onClick={() => { onClose(); onEdit(hazard); }}>{t('haraPage.edit')}</Button>}
    >
      {hazard && (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Descriptions column={1} size="small" bordered
            items={[
              { key: 'status', label: t('haraPage.status'), children: hazard.status === 'confirmed' ? <Tag color="green">{t('haraPage.confirmed')}</Tag> : hazard.status === 'superseded' ? <Tag>{t('haraPage.superseded')}</Tag> : <Tag color="gold">{t('haraPage.draft')}</Tag> },
              { key: 'title', label: t('haraPage.titleC'), children: hazard.title },
              { key: 'hazard', label: t('haraPage.hazard'), children: hazard.vehicleLevelHazard || '—' },
              { key: 'scene', label: t('haraPage.scene'), children: hazard.situation || '—' },
              {
                key: 'sec', label: t('haraPage.sec'),
                children: (
                  <Space direction="vertical" size={4}>
                    <Space size={4}><Tag>{hazard.severity}</Tag><Tag>{hazard.exposure}</Tag><Tag>{hazard.controllability}</Tag></Space>
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.65)' }}>
                      <div><b>{hazard.severity}</b> · {sev?.zh}（{sev?.en}）</div>
                      <div><b>{hazard.exposure}</b> · {exp?.zh}（{exp?.en}）</div>
                      <div><b>{hazard.controllability}</b> · {con?.zh}（{con?.en}）</div>
                    </div>
                  </Space>
                ),
              },
              {
                key: 'asil', label: t('haraPage.asil'),
                children: hazard.asilManual
                  ? <Space direction="vertical" size={2}><Tag color={ASIL_COLOR[hazard.asil]}>{ASIL_TAG_TEXT[hazard.asil]}（人工覆写）</Tag><Text type="secondary" style={{ fontSize: 12 }}>{t('haraPage.manualReasonL')}：{hazard.asilManualReason}</Text></Space>
                  : <Tag color={ASIL_COLOR[hazard.asil]}>{ASIL_TAG_TEXT[hazard.asil]}（{t('haraPage.calc', { asil: hazard.asil })}）</Tag>,
              },
              {
                key: 'rationale', label: t('haraPage.rationale'),
                children: hazard.rationale || <Text type="secondary">—</Text>,
              },
              {
                key: 'meta', label: t('haraDrawer.meta'),
                children: (
                  <Space direction="vertical" size={2}>
                    <Text style={{ fontSize: 12 }}>{t('haraDrawer.version')}：v{hazard.version ?? 1}</Text>
                    <Text style={{ fontSize: 12 }}>{t('haraDrawer.created')}：{dayjs(hazard.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Text>
                    <Text style={{ fontSize: 12 }}>{t('haraDrawer.updated')}：{dayjs(hazard.updatedAt).format('YYYY-MM-DD HH:mm:ss')}</Text>
                  </Space>
                ),
              },
            ]}
          />

          <Divider style={{ margin: '4px 0' }} plain>{t('haraDrawer.trail')}</Divider>
          {trail.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 12 }}>{t('haraDrawer.noTrail')}</Text>
          ) : (
            <Timeline
              items={trail.map((l) => ({
                color: l.action === 'DELETE' ? 'red' : l.action === 'UPDATE' ? 'orange' : 'blue',
                children: (
                  <Space direction="vertical" size={0}>
                    <Text style={{ fontSize: 13 }}><b>{actLabel(l.action)}</b> · {l.username} · {dayjs(l.ts).format('MM-DD HH:mm:ss')}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{l.summary}</Text>
                  </Space>
                ),
              }))}
            />
          )}
          <Title level={5} style={{ marginTop: 8 }}>{t('haraDrawer.next')}</Title>
          <Text type="secondary">{t('haraDrawer.nextDesc')}</Text>
        </Space>
      )}
    </Drawer>
  );
}
