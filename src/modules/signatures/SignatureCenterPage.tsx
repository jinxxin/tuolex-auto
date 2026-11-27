import { useEffect, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Select, Input, Popconfirm, message, Typography,
  Descriptions, Alert, Tabs, Drawer,
} from 'antd';
import {
  ReloadOutlined, SafetyCertificateOutlined, SearchOutlined, CheckCircleOutlined,
  CloseCircleOutlined, FileProtectOutlined, ClockCircleOutlined, IdcardOutlined,
} from '@ant-design/icons';
import { apiFetch } from '../../core/api';
import { useAuth } from '../../store/auth';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { SignatureRecord } from '../../core/types';

const { Text, Paragraph } = Typography;

const DOC_TYPE_COLOR: Record<string, string> = {
  在线文档: 'blue', '变更控制': 'orange', '偏差管理': 'gold', '问题管理': 'gold', CAPA: 'purple', '问题解决': 'purple', 审批: 'green', 其他: 'default',
};

function fmt(ts: number): string {
  return dayjs(ts).format('YYYY-MM-DD HH:mm:ss');
}

export default function SignatureCenterPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  const [rows, setRows] = useState<SignatureRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [docType, setDocType] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [detail, setDetail] = useState<SignatureRecord | null>(null);

  // 验证
  const [vId, setVId] = useState('');
  const [vContent, setVContent] = useState('');
  const [vResult, setVResult] = useState<{ valid: boolean; reason?: string; rec?: SignatureRecord } | null>(null);
  const [verifying, setVerifying] = useState(false);

  const isAdmin = user?.role === 'admin';

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (docType) qs.set('docType', docType);
      if (status) qs.set('status', status);
      const res = await apiFetch(`/signatures/list?${qs.toString()}`);
      const body = await res.json();
      setRows(body.rows);
      setTotal(body.total);
    } catch (e) {
      msg.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [docType, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const revoke = async (rec: SignatureRecord) => {
    try {
      await apiFetch('/signatures/revoke', { method: 'POST', body: JSON.stringify({ id: rec.id }) });
      msg.success(t('signCenter.revokeOk'));
      load();
    } catch (e) {
      msg.error((e as Error).message);
    }
  };

  const verify = async () => {
    if (!vId.trim()) { msg.warning(t('signCenter.idRequired')); return; }
    setVerifying(true);
    try {
      const res = await apiFetch('/signatures/verify', {
        method: 'POST',
        body: JSON.stringify({ id: Number(vId), content: vContent ? JSON.parse(vContent) : {} }),
      });
      setVResult(await res.json());
    } catch (e) {
      msg.error((e as Error).message);
      setVResult(null);
    } finally {
      setVerifying(false);
    }
  };

  const columns = [
    { title: t('signCenter.id'), dataIndex: 'id', width: 90, render: (v: number) => `#${v}` },
    { title: t('signCenter.docType'), dataIndex: 'docType', width: 100, render: (v: string) => <Tag color={DOC_TYPE_COLOR[v] ?? 'default'}>{v}</Tag> },
    { title: t('signCenter.docTitle'), dataIndex: 'docTitle', ellipsis: true },
    { title: t('signCenter.docVersion'), dataIndex: 'docVersion', width: 70 },
    { title: t('signCenter.signer'), dataIndex: 'signerName', width: 100 },
    { title: t('signCenter.signedAt'), dataIndex: 'signedAt', width: 150, render: (v: number) => fmt(v) },
    { title: t('signCenter.meaning'), dataIndex: 'meaning', width: 150, ellipsis: true },
    { title: t('signCenter.status'), dataIndex: 'status', width: 80, render: (v: string) => v === 'valid' ? <Tag color="green">{t('signCenter.statusValid')}</Tag> : <Tag color="red">{t('signCenter.statusRevoked')}</Tag> },
    {
      title: t('common.actions'), width: 130, fixed: 'right',
      render: (_: unknown, rec: SignatureRecord) => (
        <Space size={4}>
          <Button size="small" onClick={() => setDetail(rec)}>{t('signCenter.detail')}</Button>
          {isAdmin && rec.status === 'valid' && (
            <Popconfirm title={t('signCenter.revokeTitle')} onConfirm={() => revoke(rec)}>
              <Button size="small" danger>{t('signCenter.revoke')}</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card>
      {msgCtx}
      <Tabs
        items={[
          {
            key: 'records',
            label: t('signCenter.tabRecords'),
            children: (
              <>
                <Space style={{ marginBottom: 16 }}>
                  <Select
                    allowClear placeholder={t('signCenter.docType')} style={{ width: 140 }} value={docType || undefined}
                    onChange={(v) => setDocType(v ?? '')}
                    options={Object.keys(DOC_TYPE_COLOR).map((k) => ({ value: k, label: k }))}
                  />
                  <Select
                    allowClear placeholder={t('signCenter.status')} style={{ width: 110 }} value={status || undefined}
                    onChange={(v) => setStatus(v ?? '')}
                    options={[{ value: 'valid', label: t('signCenter.statusValid') }, { value: 'revoked', label: t('signCenter.statusRevoked') }]}
                  />
                  <Button icon={<ReloadOutlined />} onClick={load}>{t('signCenter.refresh')}</Button>
                  <Text type="secondary" style={{ fontSize: 12 }}>{t('signCenter.countHint', { n: total })}</Text>
                </Space>
                <Table<SignatureRecord>
                  rowKey="id" size="middle" dataSource={rows} loading={loading} scroll={{ x: 1000 }}
                  pagination={{ pageSize: 15, total, showTotal: (n) => t('signCenter.total', { n }) }}
                  columns={columns as any}
                />
              </>
            ),
          },
          {
            key: 'verify',
            label: t('signCenter.tabVerify'),
            children: (
              <>
                <Alert type="info" showIcon icon={<FileProtectOutlined />} style={{ marginBottom: 16 }}
                  message={t('signCenter.verifyInfo')} />
                <Space align="start" style={{ marginBottom: 16 }} wrap>
                  <Input prefix={<SafetyCertificateOutlined />} placeholder={t('signCenter.verifyIdPh')} style={{ width: 180 }}
                    value={vId} onChange={(e) => setVId(e.target.value)} />
                  <Input.TextArea placeholder={t('signCenter.verifyContentPh')} style={{ width: 420 }} rows={3}
                    value={vContent} onChange={(e) => setVContent(e.target.value)} />
                  <Button type="primary" icon={<SearchOutlined />} loading={verifying} onClick={verify}>{t('signCenter.verifyBtn')}</Button>
                </Space>
                {vResult && (
                  vResult.valid ? (
                    <Alert type="success" showIcon icon={<CheckCircleOutlined />}
                      message={t('signCenter.verifyOk')}
                      description={vResult.rec ? t('signCenter.verifyOkDesc', { name: vResult.rec.signerName, user: vResult.rec.username, type: vResult.rec.docType, title: vResult.rec.docTitle, ver: vResult.rec.docVersion, time: fmt(vResult.rec.signedAt) }) : undefined} />
                  ) : (
                    <Alert type="error" showIcon icon={<CloseCircleOutlined />}
                      message={t('signCenter.verifyBad', { reason: vResult.reason ?? t('signCenter.reasonUnknown') })} />
                  )
                )}
              </>
            ),
          },
          {
            key: 'reserved',
            label: t('signCenter.tabReserved'),
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size={16}>
                <Card size="small" title={<Space><IdcardOutlined />{t('signCenter.certTitle')}</Space>} extra={<Tag>{t('signCenter.reservedTag')}</Tag>}>
                  <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    {t('signCenter.certDesc')}
                  </Paragraph>
                </Card>
                <Card size="small" title={<Space><ClockCircleOutlined />{t('signCenter.tsaTitle')}</Space>} extra={<Tag>{t('signCenter.reservedTag')}</Tag>}>
                  <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    {t('signCenter.tsaDesc')}
                  </Paragraph>
                </Card>
              </Space>
            ),
          },
        ]}
      />

      {/* 详情 */}
      <Drawer title={t('signCenter.detailTitle', { id: detail?.id ?? '' })} open={!!detail} onClose={() => setDetail(null)} width={560}>
        {detail && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('signCenter.id')}>#{detail.id}</Descriptions.Item>
            <Descriptions.Item label={t('signCenter.docType')}>{detail.docType}</Descriptions.Item>
            <Descriptions.Item label={t('signCenter.docTitle')}>{detail.docTitle}</Descriptions.Item>
            <Descriptions.Item label={t('signCenter.docVersion')}>{detail.docVersion}</Descriptions.Item>
            <Descriptions.Item label={t('signCenter.signer')}>{t('signCenter.signerFmt', { name: detail.signerName, user: detail.username })}</Descriptions.Item>
            <Descriptions.Item label={t('signCenter.signedAt')}>{fmt(detail.signedAt)}</Descriptions.Item>
            <Descriptions.Item label={t('signCenter.meaning')}>{detail.meaning}</Descriptions.Item>
            <Descriptions.Item label={t('signCenter.contentHash')}>{detail.docHash}</Descriptions.Item>
            <Descriptions.Item label={t('signCenter.status')}>{detail.status === 'valid' ? <Tag color="green">{t('signCenter.statusValid')}</Tag> : <Tag color="red">{t('signCenter.statusRevoked')}</Tag>}</Descriptions.Item>
            <Descriptions.Item label={t('signCenter.cert')}>{detail.certId || t('signCenter.certUnbound')}</Descriptions.Item>
            <Descriptions.Item label={t('signCenter.tsa')}>{detail.tsaUrl || t('signCenter.tsaNotIntegrated')}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </Card>
  );
}
