import { useState } from 'react';
import { Card, Table, Tag, Space, Button, Alert, Drawer, Descriptions, Typography, Input } from 'antd';
import { CheckCircleOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { verifyChain } from '../../core/audit';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { AuditLog } from '../../core/types';

const { Text } = Typography;

const ACTION_COLOR: Record<string, string> = {
  CREATE: 'blue', UPDATE: 'geekblue', DELETE: 'red', SIGN: 'purple',
  LOGIN: 'default', CONFIRM: 'green', EXPORT: 'cyan', REJECT: 'orange', TEST: 'magenta', LINK: 'gold',
};

export default function AuditPage() {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<AuditLog | null>(null);
  const [kw, setKw] = useState('');

  const logs = useLiveQuery(() => db.audit_logs.orderBy('id').reverse().limit(500).toArray(), []) ?? [];
  const chain = useLiveQuery(() => verifyChain(), []);
  const [checking, setChecking] = useState(false);

  const rows = logs.filter((l) => !kw || (l.username + l.summary + l.entityType).toLowerCase().includes(kw.toLowerCase()));

  const json = (v: unknown) => v == null ? '—' : JSON.stringify(v, null, 2).slice(0, 3000);

  return (
    <Card title={t('auditPage.title')} extra={<Button icon={<ReloadOutlined />} loading={checking} onClick={async () => { setChecking(true); await verifyChain(); setChecking(false); }}>{t('auditPage.recheck')}</Button>}>
      {chain ? (
        chain.ok ? (
          <Alert type="success" showIcon icon={<CheckCircleOutlined />} style={{ marginBottom: 16 }}
            message={t('auditPage.chainOk', { n: logs.length })} />
        ) : (
          <Alert type="error" showIcon style={{ marginBottom: 16 }}
            message={t('auditPage.chainBroken', { id: chain.brokenAt })} />
        )
      ) : null}

      <Space style={{ marginBottom: 16 }}>
        <Input.Search placeholder={t('auditPage.searchPh')} allowClear style={{ width: 280 }} onSearch={setKw} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('auditPage.chainHint')}
        </Text>
      </Space>

      <Table<AuditLog>
        rowKey="id" size="small" dataSource={rows} pagination={{ pageSize: 20, showTotal: (n) => t('auditPage.total', { n }) }} scroll={{ x: 900 }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 60 },
          { title: t('auditPage.colTime'), dataIndex: 'ts', width: 160, render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm:ss') },
          { title: t('auditPage.colUser'), dataIndex: 'username', width: 100 },
          { title: t('auditPage.colAction'), dataIndex: 'action', width: 90, render: (a) => <Tag color={ACTION_COLOR[a]}>{a}</Tag> },
          { title: t('auditPage.colEntity'), dataIndex: 'entityType', width: 110 },
          { title: t('auditPage.colSummary'), dataIndex: 'summary', ellipsis: true },
          { title: t('auditPage.colHash'), dataIndex: 'hash', width: 110, render: (h) => <Text code style={{ fontSize: 11 }}>{h.slice(0, 10)}…</Text> },
          { title: '', width: 60, render: (_, r) => <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => setDetail(r)}>{t('auditPage.detail')}</Button> },
        ]}
      />

      <Drawer open={!!detail} onClose={() => setDetail(null)} width={640} title={t('auditPage.detailTitle', { id: detail?.id })}>
        {detail && (<>
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label={t('auditPage.colTime')}>{dayjs(detail.ts).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
            <Descriptions.Item label={t('auditPage.colUser')}>{t('auditPage.userFmt', { name: detail.username, uid: detail.userId })}</Descriptions.Item>
            <Descriptions.Item label={t('auditPage.colAction')}><Tag color={ACTION_COLOR[detail.action]}>{detail.action}</Tag></Descriptions.Item>
            <Descriptions.Item label={t('auditPage.colEntity')}>{detail.entityType} #{detail.entityId}</Descriptions.Item>
            <Descriptions.Item label={t('auditPage.colSummary')} span={2}>{detail.summary}</Descriptions.Item>
            <Descriptions.Item label={t('auditPage.before')} span={2}><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 240, overflow: 'auto' }}>{json(detail.before)}</pre></Descriptions.Item>
            <Descriptions.Item label={t('auditPage.after')} span={2}><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 240, overflow: 'auto' }}>{json(detail.after)}</pre></Descriptions.Item>
            <Descriptions.Item label={t('auditPage.prevHash')}><Text code style={{ fontSize: 11 }}>{detail.prevHash}</Text></Descriptions.Item>
            <Descriptions.Item label={t('auditPage.curHash')}><Text code style={{ fontSize: 11 }}>{detail.hash}</Text></Descriptions.Item>
          </Descriptions>
        </>)}
      </Drawer>
    </Card>
  );
}
