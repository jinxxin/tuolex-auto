import { useMemo, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Select, Form, Input, Modal, Popconfirm, message,
  Drawer, Descriptions, Switch, Alert, Tabs, Divider,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, AuditOutlined, SendOutlined,
  CheckCircleOutlined, CloseCircleOutlined, SafetyCertificateOutlined, EyeOutlined,
} from '@ant-design/icons';
import { useLiveQuery, apiFetch, notifyDbChanged } from '../../core/api';
import { db } from '../../core/db';
import { createRecord, updateRecord, deleteRecord } from '../../core/repo';
import { nextSeq } from '../../core/seq';
import { useAuth } from '../../store/auth';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

// ============ 行业适配配置 ============
// A-SPICE 过程映射：变更请求（SUP.10）/ 问题解决（SUP.9）/ 配置管理（SUP.8）
// 文案经 i18n 翻译，见 locales qualitySys.*

// 审批状态（labelKey 复用 docs.status.*：草稿/审批中/已批准/已驳回）
const APPROVAL_META: Record<string, { labelKey: string; color: string }> = {
  draft: { labelKey: 'docs.status.draft', color: 'default' },
  pending: { labelKey: 'docs.status.in_review', color: 'gold' },
  approved: { labelKey: 'docs.status.approved', color: 'green' },
  rejected: { labelKey: 'docs.status.rejected', color: 'red' },
};

// 影响评估等级（复用 fmeaPage.level* 高/中/低）
const IMPACT_META: Record<string, { labelKey: string; color: string }> = {
  high: { labelKey: 'fmeaPage.levelHigh', color: 'red' },
  medium: { labelKey: 'fmeaPage.levelMid', color: 'orange' },
  low: { labelKey: 'fmeaPage.levelLow', color: 'green' },
};

const DEV_TYPE_META: Record<string, { labelKey: string; color: string }> = {
  critical: { labelKey: 'qualitySys.devCritical', color: 'red' },
  major: { labelKey: 'qualitySys.devMajor', color: 'orange' },
  minor: { labelKey: 'qualitySys.devMinor', color: 'blue' },
};

const SEVERITY_META: Record<string, { labelKey: string; color: string }> = {
  high: { labelKey: 'fmeaPage.levelHigh', color: 'red' },
  medium: { labelKey: 'fmeaPage.levelMid', color: 'orange' },
  low: { labelKey: 'fmeaPage.levelLow', color: 'green' },
};

const CC_STATUS_META: Record<string, { labelKey: string; color: string }> = {
  draft: { labelKey: 'docs.status.draft', color: 'default' },
  in_review: { labelKey: 'qualitySys.stReview', color: 'blue' },
  approved: { labelKey: 'docs.status.approved', color: 'green' },
  implemented: { labelKey: 'qualitySys.stImplemented', color: 'cyan' },
  closed: { labelKey: 'qualitySys.stClosed', color: 'default' },
  rejected: { labelKey: 'qualitySys.stRejected', color: 'red' },
};

const DEV_STATUS_META: Record<string, { labelKey: string; color: string }> = {
  open: { labelKey: 'qualitySys.stDevOpen', color: 'default' },
  investigating: { labelKey: 'qualitySys.stInvestigating', color: 'blue' },
  disposition: { labelKey: 'qualitySys.stDisposition', color: 'orange' },
  closed: { labelKey: 'qualitySys.stClosed', color: 'green' },
};

const CAPA_STATUS_META: Record<string, { labelKey: string; color: string }> = {
  open: { labelKey: 'qualitySys.stCapaOpen', color: 'default' },
  in_progress: { labelKey: 'qualitySys.stInProgress', color: 'blue' },
  verification: { labelKey: 'qualitySys.fldEffectiveness', color: 'orange' },
  closed: { labelKey: 'qualitySys.stClosed', color: 'green' },
};

const CAPA_SOURCE_META: Record<string, string> = {
  deviation: 'qualitySys.srcDeviation', audit: 'qualitySys.srcAudit', complaint: 'qualitySys.srcComplaint', other: 'qualitySys.srcOther',
};

type KindKey = 'change_controls' | 'deviations' | 'capas';

interface KindConfig {
  key: KindKey;
  tabKey: string;
  noField: string;
  noPrefix: string;
  titleKey: string;
  statusMeta: Record<string, { labelKey: string; color: string }>;
  createModal: { fields: React.ReactNode };
  columnsExtra: Record<string, unknown>[];
  detailExtra: (rec: any) => { labelKey: string; value: React.ReactNode }[];
  formInit: (projId: number) => Record<string, unknown>;
}

function fmt(ts?: number): string {
  return ts ? dayjs(ts).format('YYYY-MM-DD HH:mm') : '—';
}

export default function QualitySystemPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.toLowerCase().startsWith('en');
  const [msg, msgCtx] = message.useMessage();
  const [tab, setTab] = useState<KindKey>('change_controls');
  const actor = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };

  const projects = useLiveQuery(() => db.projects.orderBy('id').toArray(), []) ?? [];
  const ccs = useLiveQuery(() => db.change_controls.toArray(), []) ?? [];
  const devs = useLiveQuery(() => db.deviations.toArray(), []) ?? [];
  const capas = useLiveQuery(() => db.capas.toArray(), []) ?? [];

  const projName = (id: number) => projects.find((p) => p.id === id)?.name ?? `#${id}`;

  // ===== 表单状态 =====
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form] = Form.useForm();

  // ===== 审批状态 =====
  const [approveRec, setApproveRec] = useState<any | null>(null);
  const [rejectRec, setRejectRec] = useState<any | null>(null);
  const [signForm] = Form.useForm();
  const [rejectForm] = Form.useForm();
  const [detail, setDetail] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const configs: Record<KindKey, KindConfig> = useMemo(() => ({
    change_controls: {
      key: 'change_controls', tabKey: 'qualitySys.tabCc', noField: 'ccNo', noPrefix: 'CC', titleKey: 'qualitySys.kindCc',
      statusMeta: CC_STATUS_META,
      createModal: { fields: (
        <>
          <Form.Item name="title" label={t('qualitySys.fldCcTitle')} rules={[{ required: true }]}>
            <Input placeholder={t('qualitySys.phCcTitle')} />
          </Form.Item>
          <Form.Item name="systemId" label={t('qualitySys.fldSystemCc')} rules={[{ required: true }]}>
            <Select options={projects.map((p) => ({ value: p.id!, label: p.name }))} placeholder={t('qualitySys.phSysCc')} />
          </Form.Item>
          <Form.Item name="impact" label={t('qualitySys.fldImpact')} rules={[{ required: true }]}>
            <Select options={[
              { value: 'high', label: t('qualitySys.impactOptHigh') },
              { value: 'medium', label: t('qualitySys.impactOptMid') },
              { value: 'low', label: t('qualitySys.impactOptLow') },
            ]} />
          </Form.Item>
          <Form.Item name="requireRevalidation" label={t('qualitySys.fldReval')} valuePropName="checked" initialValue={false}>
            <Switch checkedChildren={t('qualitySys.switchNeed')} unCheckedChildren={t('qualitySys.switchNoNeed')} />
          </Form.Item>
          <Form.Item name="status" label={t('qualitySys.fldImplStatus')} initialValue="draft">
            <Select options={Object.entries(CC_STATUS_META).map(([v, m]) => ({ value: v, label: t(m.labelKey) }))} />
          </Form.Item>
          <Form.Item name="desc" label={t('qualitySys.fldChangeDesc')}>
            <Input.TextArea rows={3} placeholder={t('qualitySys.phChangeDesc')} />
          </Form.Item>
        </>
      ) },
      columnsExtra: [
        { title: t('qualitySys.colImpact'), dataIndex: 'impact', width: 80, render: (v: string) => <Tag color={IMPACT_META[v]?.color}>{IMPACT_META[v] ? t(IMPACT_META[v].labelKey) : v}</Tag> },
        { title: t('qualitySys.colReval'), dataIndex: 'requireRevalidation', width: 90, render: (v: boolean) => v ? <Tag color="orange">{t('qualitySys.needYes')}</Tag> : <Tag>{t('qualitySys.needNo')}</Tag> },
      ],
      detailExtra: (rec) => [
        { labelKey: 'qualitySys.fldImpact', value: IMPACT_META[rec.impact] ? t(IMPACT_META[rec.impact].labelKey) : rec.impact },
        { labelKey: 'qualitySys.fldNeedReval', value: rec.requireRevalidation ? t('qualitySys.needYes') : t('qualitySys.needNo') },
        { labelKey: 'qualitySys.fldChangeDesc', value: rec.desc || '—' },
        { labelKey: 'qualitySys.fldProposedBy', value: rec.proposedBy || '—' },
      ],
      formInit: (projId) => ({ impact: 'medium', requireRevalidation: false, status: 'draft', systemId: projId }),
    },
    deviations: {
      key: 'deviations', tabKey: 'qualitySys.tabDev', noField: 'devNo', noPrefix: 'ISS', titleKey: 'qualitySys.kindDev',
      statusMeta: DEV_STATUS_META,
      createModal: { fields: (
        <>
          <Form.Item name="title" label={t('qualitySys.fldDevTitle')} rules={[{ required: true }]}>
            <Input placeholder={t('qualitySys.phDevTitle')} />
          </Form.Item>
          <Form.Item name="systemId" label={t('qualitySys.fldSystem')} rules={[{ required: true }]}>
            <Select options={projects.map((p) => ({ value: p.id!, label: p.name }))} placeholder={t('qualitySys.phSys')} />
          </Form.Item>
          <Form.Item name="devType" label={t('qualitySys.fldDevType')} rules={[{ required: true }]}>
            <Select options={Object.entries(DEV_TYPE_META).map(([v, m]) => ({ value: v, label: t(m.labelKey) }))} />
          </Form.Item>
          <Form.Item name="severity" label={t('qualitySys.fldSeverity')} rules={[{ required: true }]}>
            <Select options={Object.entries(SEVERITY_META).map(([v, m]) => ({ value: v, label: t(m.labelKey) }))} />
          </Form.Item>
          <Form.Item name="detectedAt" label={t('qualitySys.fldDetectedAt')}>
            <Input placeholder={t('qualitySys.phDetectedAt')} />
          </Form.Item>
          <Form.Item name="detectedBy" label={t('qualitySys.fldDetectedBy')}>
            <Input placeholder={t('qualitySys.phDetectedBy')} />
          </Form.Item>
          <Form.Item name="description" label={t('qualitySys.fldDescription')}>
            <Input.TextArea rows={3} placeholder={t('qualitySys.phDesc')} />
          </Form.Item>
        </>
      ) },
      columnsExtra: [
        { title: t('qualitySys.colType'), dataIndex: 'devType', width: 90, render: (v: string) => <Tag color={DEV_TYPE_META[v]?.color}>{DEV_TYPE_META[v] ? t(DEV_TYPE_META[v].labelKey) : v}</Tag> },
        { title: t('qualitySys.colSeverity'), dataIndex: 'severity', width: 80, render: (v: string) => <Tag color={SEVERITY_META[v]?.color}>{SEVERITY_META[v] ? t(SEVERITY_META[v].labelKey) : v}</Tag> },
      ],
      detailExtra: (rec) => [
        { labelKey: 'qualitySys.fldDevType', value: DEV_TYPE_META[rec.devType] ? t(DEV_TYPE_META[rec.devType].labelKey) : rec.devType },
        { labelKey: 'qualitySys.fldSeverity', value: SEVERITY_META[rec.severity] ? t(SEVERITY_META[rec.severity].labelKey) : rec.severity },
        { labelKey: 'qualitySys.fldDetectedAt', value: rec.detectedAt || '—' },
        { labelKey: 'qualitySys.fldDetectedBy', value: rec.detectedBy || '—' },
        { labelKey: 'qualitySys.fldDescription', value: rec.description || '—' },
        { labelKey: 'qualitySys.fldDisposition', value: rec.disposition || '—' },
        { labelKey: 'qualitySys.fldRootCause', value: rec.rootCause || '—' },
        { labelKey: 'qualitySys.fldCorrective', value: rec.correctiveAction || '—' },
      ],
      formInit: (projId) => ({ devType: 'minor', severity: 'medium', status: 'open', systemId: projId }),
    },
    capas: {
      key: 'capas', tabKey: 'qualitySys.tabCapa', noField: 'capaNo', noPrefix: 'PRM', titleKey: 'qualitySys.kindCapa',
      statusMeta: CAPA_STATUS_META,
      createModal: { fields: (
        <>
          <Form.Item name="title" label={t('qualitySys.fldCapaTitle')} rules={[{ required: true }]}>
            <Input placeholder={t('qualitySys.phCapaTitle')} />
          </Form.Item>
          <Form.Item name="systemId" label={t('qualitySys.fldSystem')} rules={[{ required: true }]}>
            <Select options={projects.map((p) => ({ value: p.id!, label: p.name }))} placeholder={t('qualitySys.phSys')} />
          </Form.Item>
          <Form.Item name="sourceType" label={t('qualitySys.fldSource')} initialValue="deviation">
            <Select options={Object.entries(CAPA_SOURCE_META).map(([v, lk]) => ({ value: v, label: t(lk) }))} />
          </Form.Item>
          <Form.Item name="sourceRef" label={t('qualitySys.fldSourceNo')}>
            <Input placeholder={t('qualitySys.phSourceRef')} />
          </Form.Item>
          <Form.Item name="description" label={t('qualitySys.fldDescription')}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="rootCause" label={t('qualitySys.fldRootCause')}>
            <Input.TextArea rows={2} placeholder={t('qualitySys.phRootCause')} />
          </Form.Item>
          <Form.Item name="correctiveAction" label={t('qualitySys.fldCorrective')}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="preventiveAction" label={t('qualitySys.fldPreventive')}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </>
      ) },
      columnsExtra: [
        { title: t('qualitySys.fldSource'), dataIndex: 'sourceType', width: 90, render: (v: string) => CAPA_SOURCE_META[v] ? t(CAPA_SOURCE_META[v]) : v },
        { title: t('qualitySys.fldSourceNo'), dataIndex: 'sourceRef', width: 110, render: (v?: string) => v || '—' },
      ],
      detailExtra: (rec) => [
        { labelKey: 'qualitySys.fldSource', value: CAPA_SOURCE_META[rec.sourceType] ? t(CAPA_SOURCE_META[rec.sourceType]) : rec.sourceType },
        { labelKey: 'qualitySys.fldSourceNo', value: rec.sourceRef || '—' },
        { labelKey: 'qualitySys.fldDescription', value: rec.description || '—' },
        { labelKey: 'qualitySys.fldRootCause', value: rec.rootCause || '—' },
        { labelKey: 'qualitySys.fldCorrective', value: rec.correctiveAction || '—' },
        { labelKey: 'qualitySys.fldPreventive', value: rec.preventiveAction || '—' },
        { labelKey: 'qualitySys.fldEffectiveness', value: rec.effectiveness || '—' },
      ],
      formInit: (projId) => ({ sourceType: 'deviation', status: 'open', systemId: projId }),
    },
  }), [projects, t]);

  const cfg = configs[tab];
  const rows: any[] = tab === 'change_controls' ? ccs : tab === 'deviations' ? devs : capas;
  const countOf = (c: KindConfig) => tab === c.key ? rows.length : c.key === 'change_controls' ? ccs.length : c.key === 'deviations' ? devs.length : capas.length;

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue(cfg.formInit(projects[0]?.id ?? 0));
    setOpen(true);
  };

  const openEdit = (rec: any) => {
    if (rec.approvalStatus === 'approved') { msg.warning(t('qualitySys.lockedWarn')); return; }
    setEditing(rec);
    form.resetFields();
    form.setFieldsValue({ ...rec, detectedAt: rec.detectedAt ? dayjs(rec.detectedAt).format('YYYY-MM-DD HH:mm') : undefined });
    setOpen(true);
  };

  const save = async () => {
    const vals = await form.validateFields();
    const now = Date.now();
    if (vals.detectedAt && typeof vals.detectedAt === 'string') {
      const dt = dayjs(vals.detectedAt);
      vals.detectedAt = dt.isValid() ? dt.valueOf() : vals.detectedAt;
    }
    try {
      if (editing) {
        await updateRecord(cfg.key as any, editing.id, { ...editing, ...vals, updatedAt: now }, actor, t('qualitySys.auditUpd', { kind: t(cfg.titleKey) }));
      } else {
        const no = await nextSeq(Number(vals.systemId), cfg.noPrefix, 3);
        await createRecord(cfg.key as any, {
          ...vals, [cfg.noField]: no, proposedBy: user?.name ?? user?.username ?? '',
          createdAt: now, updatedAt: now, approvalStatus: 'draft',
        }, actor, t('qualitySys.auditNew', { kind: t(cfg.titleKey) }));
      }
      msg.success(editing ? t('qualitySys.msgSaved') : t('qualitySys.msgCreated'));
      setOpen(false);
    } catch (e) {
      msg.error((e as Error).message);
    }
  };

  const remove = async (rec: any) => {
    try {
      await deleteRecord(cfg.key as any, rec.id, actor, t('qualitySys.auditDel', { kind: t(cfg.titleKey), title: rec.title }));
      msg.success(t('qualitySys.msgDeleted'));
    } catch (e) {
      msg.error((e as Error).message);
    }
  };

  // ===== 审批动作 =====
  const submitForApproval = async (rec: any) => {
    try {
      await apiFetch(`/quality/${cfg.key}/submit`, { method: 'POST', body: JSON.stringify({ id: rec.id }) });
      notifyDbChanged();
      msg.success(t('qualitySys.msgSubmitted'));
    } catch (e) {
      msg.error((e as Error).message);
    }
  };

  const doApprove = async () => {
    const vals = await signForm.validateFields();
    setSubmitting(true);
    try {
      await apiFetch(`/quality/${cfg.key}/approve`, {
        method: 'POST',
        body: JSON.stringify({ id: approveRec.id, username: vals.username, password: vals.password, comment: vals.comment }),
      });
      notifyDbChanged();
      msg.success(t('qualitySys.msgApproved'));
      setApproveRec(null);
      signForm.resetFields();
    } catch (e) {
      msg.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const doReject = async () => {
    const vals = await rejectForm.validateFields();
    setSubmitting(true);
    try {
      await apiFetch(`/quality/${cfg.key}/reject`, {
        method: 'POST',
        body: JSON.stringify({ id: rejectRec.id, comment: vals.comment }),
      });
      notifyDbChanged();
      msg.success(t('qualitySys.msgRejected'));
      setRejectRec(null);
      rejectForm.resetFields();
    } catch (e) {
      msg.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const baseColumns: Record<string, unknown>[] = [
    { title: t('qualitySys.colNo'), dataIndex: 'ccNo', width: 100, render: (_: unknown, rec: any) => rec[cfg.noField] },
    { title: t('qualitySys.colTitle'), dataIndex: 'title', ellipsis: true },
    { title: t('qualitySys.fldSystem'), dataIndex: 'systemId', width: 140, render: (v: number) => projName(v) },
    ...cfg.columnsExtra,
    { title: t('qualitySys.colStatus'), dataIndex: 'status', width: 90, render: (v: string) => <Tag color={cfg.statusMeta[v]?.color}>{cfg.statusMeta[v] ? t(cfg.statusMeta[v].labelKey) : v}</Tag> },
    { title: t('qualitySys.colApproval'), dataIndex: 'approvalStatus', width: 90, render: (v: string) => <Tag color={APPROVAL_META[v]?.color}>{APPROVAL_META[v] ? t(APPROVAL_META[v].labelKey) : v}</Tag> },
    { title: t('qualitySys.colUpdated'), dataIndex: 'updatedAt', width: 130, render: (v: number) => fmt(v) },
    {
      title: t('common.actions'), width: 250, fixed: 'right',
      render: (_: unknown, rec: any) => (
        <Space size={4} wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail(rec)}>{t('qualitySys.btnDetail')}</Button>
          {rec.approvalStatus === 'draft' && (
            <>
              <Button size="small" type="primary" ghost icon={<SendOutlined />} onClick={() => submitForApproval(rec)}>{t('qualitySys.btnSubmit')}</Button>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(rec)}>{t('common.edit')}</Button>
              <Popconfirm title={t('qualitySys.delConfirm')} onConfirm={() => remove(rec)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </>
          )}
          {rec.approvalStatus === 'pending' && (
            <>
              <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => { setApproveRec(rec); signForm.resetFields(); }}>{t('qualitySys.btnApprove')}</Button>
              <Button size="small" danger ghost icon={<CloseCircleOutlined />} onClick={() => { setRejectRec(rec); rejectForm.resetFields(); }}>{t('qualitySys.btnReject')}</Button>
            </>
          )}
          {rec.approvalStatus === 'rejected' && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(rec)}>{t('qualitySys.btnResubmit')}</Button>
          )}
        </Space>
      ),
    },
  ];

  const approvalDesc = (rec: any) => [
    { labelKey: 'qualitySys.fldApprovalStatus', value: APPROVAL_META[rec.approvalStatus] ? t(APPROVAL_META[rec.approvalStatus].labelKey) : rec.approvalStatus },
    { labelKey: 'qualitySys.fldApprover', value: rec.approvedBy || '—' },
    { labelKey: 'qualitySys.fldApprovedAt', value: fmt(rec.approvedAt) },
    { labelKey: 'qualitySys.fldSignatureId', value: rec.signatureId ? `#${rec.signatureId}` : '—' },
    { labelKey: 'qualitySys.fldComment', value: rec.reviewComment || '—' },
  ];

  return (
    <Card>
      {msgCtx}
      <Alert type="info" showIcon icon={<AuditOutlined />} style={{ marginBottom: 16 }} message={t('qualitySys.banner')} />
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as KindKey)}
        items={Object.values(configs).map((c) => ({
          key: c.key,
          label: `${t(c.tabKey)}${isEn ? ' (' : '（'}${countOf(c)}${isEn ? ')' : '）'}`,
        }))}
        tabBarExtraContent={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('qualitySys.newBtn', { kind: t(cfg.titleKey) })}</Button>}
      />

      <Table<any>
        rowKey="id" size="middle" dataSource={rows} scroll={{ x: 1100 }}
        pagination={{ pageSize: 10, showTotal: (total) => t('qualitySys.total', { n: total }) }}
        columns={baseColumns}
      />

      {/* 新建 / 编辑 */}
      <Modal
        title={editing ? t('qualitySys.editRecord', { kind: t(cfg.titleKey) }) : t('qualitySys.newRecord', { kind: t(cfg.titleKey) })} open={open} onOk={save} onCancel={() => setOpen(false)}
        width={640} okText={t('common.save')} cancelText={t('common.cancel')}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          {cfg.createModal.fields}
        </Form>
      </Modal>

      {/* 审批通过（双要素电子签名） */}
      <Modal
        title={<Space><SafetyCertificateOutlined />{t('qualitySys.approveTitle', { no: approveRec?.[cfg.noField], title: approveRec?.title })}</Space>}
        open={!!approveRec} onOk={doApprove} onCancel={() => setApproveRec(null)} confirmLoading={submitting}
        okText={t('qualitySys.approveOk')} cancelText={t('common.cancel')} width={480}
      >
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message={t('qualitySys.eSigAlert')} />
        <Form form={signForm} layout="vertical">
          <Form.Item name="username" label={t('qualitySys.fldApproverUser')} rules={[{ required: true }]}>
            <Input placeholder={t('qualitySys.phUser')} />
          </Form.Item>
          <Form.Item name="password" label={t('qualitySys.fldApproverPwd')} rules={[{ required: true }]}>
            <Input.Password placeholder={t('qualitySys.phPwd')} />
          </Form.Item>
          <Form.Item name="comment" label={t('qualitySys.fldComment')}>
            <Input.TextArea rows={2} placeholder={t('qualitySys.phOptional')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 驳回 */}
      <Modal
        title={<Space><CloseCircleOutlined style={{ color: '#ff4d4f' }} />{t('qualitySys.rejectTitle', { no: rejectRec?.[cfg.noField], title: rejectRec?.title })}</Space>}
        open={!!rejectRec} onOk={doReject} onCancel={() => setRejectRec(null)} confirmLoading={submitting}
        okText={t('qualitySys.rejectOk')} cancelText={t('common.cancel')} width={480}
      >
        <Form form={rejectForm} layout="vertical">
          <Form.Item name="comment" label={t('qualitySys.fldRejectComment')} rules={[{ required: true, message: t('qualitySys.rejectRequired') }]}>
            <Input.TextArea rows={3} placeholder={t('qualitySys.rejectPh')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情 */}
      <Drawer title={t('qualitySys.recordDetail', { kind: t(cfg.titleKey), no: detail?.[cfg.noField] ?? '' })} open={!!detail} onClose={() => setDetail(null)} width={560}>
        {detail && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('qualitySys.colTitle')}>{detail.title}</Descriptions.Item>
            <Descriptions.Item label={t('qualitySys.fldSystem')}>{projName(detail.systemId)}</Descriptions.Item>
            <Descriptions.Item label={t('qualitySys.colStatus')}>
              <Tag color={cfg.statusMeta[detail.status]?.color}>{cfg.statusMeta[detail.status] ? t(cfg.statusMeta[detail.status].labelKey) : detail.status}</Tag>
            </Descriptions.Item>
            {cfg.detailExtra(detail).map((d) => (
              <Descriptions.Item label={t(d.labelKey)} key={d.labelKey}>{d.value}</Descriptions.Item>
            ))}
            <Descriptions.Item label={t('qualitySys.fldCreatedAt')}>{fmt(detail.createdAt)}</Descriptions.Item>
            <Descriptions.Item label={t('qualitySys.colUpdated')}>{fmt(detail.updatedAt)}</Descriptions.Item>
          </Descriptions>
        )}
        <Divider style={{ margin: '16px 0 8px' }}>{t('qualitySys.drawerApproval')}</Divider>
        {detail && (
          <Descriptions column={1} size="small" bordered>
            {approvalDesc(detail).map((d) => (
              <Descriptions.Item label={t(d.labelKey)} key={d.labelKey}>{d.value}</Descriptions.Item>
            ))}
          </Descriptions>
        )}
      </Drawer>
    </Card>
  );
}
