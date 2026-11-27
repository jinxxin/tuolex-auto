import { useMemo, useState } from 'react';
import {
  Card, Tabs, Tag, Space, Button, Table, Drawer, Descriptions, Typography, message,
  Form, Input, Select, Modal, Popconfirm, Checkbox, Progress, Alert, Divider, Timeline,
  Row, Col, type TableProps,
} from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, EditOutlined, SendOutlined, CheckOutlined,
  StopOutlined, SafetyCertificateOutlined, DeleteOutlined, VerifiedOutlined, FileSearchOutlined, TeamOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { createRecord, updateRecord, deleteRecord } from '../../core/repo';
import { verifySignature } from '../../core/signature';
import { useAuth } from '../../store/auth';
import SignatureModal from '../../components/SignatureModal';
import ProjectMembersModal from '../../components/ProjectMembersModal';
import { useTranslation } from 'react-i18next';
import AuditReadinessTab from './AuditReadinessTab';
import ReviewTab from './ReviewTab';
import ConfigTab from './ConfigTab';
import MetricTab from './MetricTab';
import { V_PHASES, VDOC_STATUS_META, PROJECT_STATUS_META, GENERIC_CHECKLIST } from '../../core/constants';
import dayjs from 'dayjs';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Project, VDoc, SignatureRecord } from '../../core/types';

const { Text, Paragraph } = Typography;
const DOC_TYPES = V_PHASES.map((p) => p.docType);

// 项目 Tab 分组（A 方案：14 Tab 分 4 组）
// 家族 IA：过程/V 模型模块已抽到菜单级「软件过程(A-SPICE)」组，此处移除
const TAB_GROUPS = [
  { key: 'quality', label: '质量与合规', children: ['audit2', 'review'] },
  { key: 'config', label: '配置与交付', children: ['config', 'metric', 'docs', 'checklist'] },
  { key: 'settings', label: '设置与集成', children: ['feishu', 'info'] },
];
// 展平：tabKey → 所属组
const TAB_GROUP_OF: Record<string, string> = Object.fromEntries(
  TAB_GROUPS.flatMap((g) => g.children.map((c) => [c, g.key])),
);
// 默认 Tab
const DEFAULT_TAB = 'docs';

export default function ProjectDetailPage() {
  const { id } = useParams();
  const pid = Number(id);
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [msg, msgCtx] = message.useMessage();

  const project = useLiveQuery(() => db.projects.get(pid), [pid]);
  const docs = useLiveQuery(() => db.vdocs.where('projectId').equals(pid).sortBy('id'), [pid]) ?? [];
  const signatures = useLiveQuery(() => db.signatures.toArray(), []) ?? [];

  const [docOpen, setDocOpen] = useState(false);
  const [detail, setDetail] = useState<VDoc | null>(null);
  const [sigOpen, setSigOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [sigAction, setSigAction] = useState<'approve' | 'reject'>('approve');
  const [sigDoc, setSigDoc] = useState<VDoc | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  const actor = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };
  const canApprove = user?.role === 'admin' || user?.role === 'qa' || user?.role === 'reviewer';

  // 签名记录按文档聚合
  const sigByDoc = useMemo(() => {
    const map: Record<number, SignatureRecord[]> = {};
    for (const s of signatures) {
      const key = Number(s.docTitle.split('#')[1]);
      void key;
      const m = docs.find((d) => d.id !== undefined && d.title === s.docTitle && d.version === s.docVersion);
      if (m?.id) (map[m.id] = map[m.id] || []).push(s);
    }
    return map;
  }, [signatures, docs]);

  if (!project) {
    return <Card><Alert type="info" message={t('detail.notFound')} action={<Button onClick={() => nav('/projects')}>{t('detail.backList')}</Button>} /></Card>;
  }

  const approvedCount = new Set(docs.filter((d) => d.status === 'approved').map((d) => d.docType)).size;
  const overall = Math.round((approvedCount / V_PHASES.length) * 100);

  // ---- 文档操作 ----
  const openCreate = (docType?: string) => {
    setCreateOpen(true);
    form.setFieldsValue({ docType: docType || 'URS', version: '1.0' });
  };

  const createDoc = async () => {
    const v = await form.validateFields();
    const now = Date.now();
    const docId = await createRecord<VDoc>('vdocs', {
      projectId: pid, docType: v.docType, title: v.title || `${v.docType} - ${project.name}`,
      version: v.version, status: 'draft', content: v.content || '',
      ownerId: user?.id ?? 0, signatureIds: [], createdAt: now, updatedAt: now,
    }, actor, t('detail.auditCreateDoc', { type: v.docType, title: v.title || `${v.docType} - ${project.name}`, v: v.version }));
    await updateRecord<Project>('projects', pid, { phases: { ...project.phases, [v.docType]: docId }, updatedAt: now }, actor, t('detail.auditLinkPhase', { type: v.docType }));
    msg.success(t('detail.docCreatedDraft'));
    setCreateOpen(false);
    // 刷新详情
    const created = await db.vdocs.get(docId);
    if (created) { setDetail(created); setDocOpen(true); }
  };

  const submitReview = async (d: VDoc) => {
    await updateRecord<VDoc>('vdocs', d.id!, { status: 'in_review', updatedAt: Date.now() }, actor, t('detail.auditSubmitReview', { type: d.docType, title: d.title, v: d.version }));
    msg.success(t('detail.submittedReview'));
  };

  const openSign = (d: VDoc, action: 'approve' | 'reject') => {
    setSigDoc(d);
    setSigAction(action);
    setSigOpen(true);
  };

  const onSigned = async (rec: SignatureRecord) => {
    if (!sigDoc) return;
    const now = Date.now();
    const newStatus = sigAction === 'approve' ? 'approved' : 'rejected';
    await updateRecord<VDoc>('vdocs', sigDoc.id!, {
      status: newStatus,
      signatureIds: [...(sigDoc.signatureIds || []), rec.id!],
      updatedAt: now,
    }, actor, sigAction === 'approve'
      ? t('detail.auditApproveDoc', { type: sigDoc.docType, title: sigDoc.title, v: sigDoc.version, meaning: rec.meaning })
      : t('detail.auditRejectDoc', { type: sigDoc.docType, title: sigDoc.title, v: sigDoc.version, meaning: rec.meaning }));
    msg.success(sigAction === 'approve' ? t('detail.approvedOk') : t('detail.rejectedOk'));
    setSigOpen(false);
    setDetail({ ...sigDoc, status: newStatus, signatureIds: [...(sigDoc.signatureIds || []), rec.id!] });
  };

  const editDoc = async (d: VDoc, content: string) => {
    await updateRecord<VDoc>('vdocs', d.id!, { content, updatedAt: Date.now() }, actor, t('detail.auditEditDoc', { type: d.docType, title: d.title }));
    msg.success(t('detail.docEditSaved'));
    setDetail({ ...d, content });
  };

  const bumpVersion = async (d: VDoc) => {
    const now = Date.now();
    await updateRecord<VDoc>('vdocs', d.id!, { status: 'superseded', updatedAt: now }, actor, t('detail.auditBump', { type: d.docType, title: d.title, v: d.version }));
    const nextVer = (parseFloat(d.version) + 1).toFixed(1);
    const newId = await createRecord<VDoc>('vdocs', {
      projectId: pid, docType: d.docType, title: d.title, version: nextVer,
      status: 'draft', content: d.content, ownerId: user?.id ?? 0, signatureIds: [],
      createdAt: now, updatedAt: now,
    }, actor, t('detail.auditBumpNew', { type: d.docType, title: d.title, v: nextVer }));
    await updateRecord<Project>('projects', pid, { phases: { ...project.phases, [d.docType]: newId }, updatedAt: now }, actor, t('detail.auditPhaseUpdated', { v: nextVer }));
    msg.success(t('detail.bumpedMsg', { v: nextVer }));
  };

  const removeDoc = async (d: VDoc) => {
    await deleteRecord('vdocs', d.id!, actor, t('detail.auditDelDoc', { type: d.docType, title: d.title, v: d.version }));
    msg.success(t('detail.deleted'));
    if (detail?.id === d.id) { setDocOpen(false); setDetail(null); }
  };

  // ---- 材料清单 ----
  const toggleCheck = async (key: string, checked: boolean) => {
    const cl = { ...(project.checklist || {}), [key]: checked };
    const label = GENERIC_CHECKLIST.find((i) => i.key === key)?.label || key;
    await updateRecord<Project>('projects', pid, { checklist: cl, updatedAt: Date.now() }, actor, checked ? t('detail.auditCheckDone', { label }) : t('detail.auditCheckUndone', { label }));
  };
  const checklistCount = Object.values(project.checklist || {}).filter(Boolean).length;
  const CATS = ['开发文档', '技术与商务', '过程与支持', '放行'];

  const statusLabel = (s: string) => t('proj.status.' + s);
  const docStatusLabel = (s: string) => t('detail.docSt.' + s);
  const catTitle = (cat: string) => cat === '开发文档' ? t('detail.checkCatDev') : cat === '技术与商务' ? t('detail.checkCatBiz') : cat === '过程与支持' ? t('detail.checkCatProc') : t('detail.checkCatRelease');

  const docCols: TableProps<VDoc>['columns'] = [
    { title: t('detail.colPhase'), dataIndex: 'docType', width: 80, render: (tt: string) => <Tag color="blue">{tt}</Tag> },
    { title: t('detail.colTitle'), dataIndex: 'title', ellipsis: true, render: (tt: string, d: VDoc) => <a onClick={() => { setDetail(d); setDocOpen(true); }}>{tt}</a> },
    { title: t('detail.colVersion'), dataIndex: 'version', width: 70 },
    { title: t('detail.colStatus'), dataIndex: 'status', width: 100, render: (s: string) => <Tag color={VDOC_STATUS_META[s].color}>{docStatusLabel(s)}</Tag> },
    { title: t('detail.colSig'), width: 90, render: (_, d) => (sigByDoc[d.id!]?.length || 0) > 0
      ? <Tag color="green" icon={<SafetyCertificateOutlined />}>{t('detail.sigCount', { n: sigByDoc[d.id!].length })}</Tag>
      : <Text type="secondary">—</Text> },
    { title: t('detail.colUpdated'), dataIndex: 'updatedAt', width: 110, render: (tt: number) => dayjs(tt).format('MM-DD HH:mm') },
    { title: t('detail.colActions'), width: 240, render: (_, d) => (
      <Space size={2}>
        <Button size="small" type="link" onClick={() => { setDetail(d); setDocOpen(true); }}>{t('detail.details')}</Button>
        {d.status === 'draft' && <>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => { setDetail(d); setDocOpen(true); }}>{t('common.edit')}</Button>
          <Button size="small" type="link" icon={<SendOutlined />} onClick={() => submitReview(d)}>{t('detail.submitReview')}</Button>
        </>}
        {d.status === 'in_review' && canApprove && <>
          <Button size="small" type="link" style={{ color: '#2f9e44' }} icon={<CheckOutlined />} onClick={() => openSign(d, 'approve')}>{t('detail.approveSign')}</Button>
          <Button size="small" type="link" danger icon={<StopOutlined />} onClick={() => openSign(d, 'reject')}>{t('detail.rejectSign')}</Button>
        </>}
        {d.status === 'rejected' && <>
          <Button size="small" type="link" icon={<SendOutlined />} onClick={() => submitReview(d)}>{t('detail.resubmit')}</Button>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => { setDetail(d); setDocOpen(true); }}>{t('common.edit')}</Button>
        </>}
        {d.status === 'approved' && <>
          <Button size="small" type="link" icon={<VerifiedOutlined />} onClick={() => { setDetail(d); setDocOpen(true); }}>{t('detail.verifySig')}</Button>
          <Button size="small" type="link" icon={<FileSearchOutlined />} onClick={() => bumpVersion(d)}>{t('detail.bump')}</Button>
        </>}
        {d.status === 'draft' && (
          <Popconfirm title={t('detail.delDocConfirm')} onConfirm={() => removeDoc(d)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        )}
      </Space>
    )},
  ];

  return (
    <div>
      {msgCtx}
      <Card
        title={<Space><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => nav('/projects')} /><Text strong style={{ fontSize: 16 }}>{project.name}</Text></Space>}
        extra={<Space>
          <Button size="small" icon={<TeamOutlined />} onClick={() => setMemberOpen(true)}>{t('detail.members')}</Button>
          <Tag color="blue">{project.sysType}</Tag>
          <Tag color="purple">ASPICE {project.stdVersion}</Tag>
          <Tag color={PROJECT_STATUS_META[project.status].color}>{statusLabel(project.status)}</Tag>
        </Space>}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space wrap>
            <Text type="secondary">{t('detail.vendorInline', { v: project.vendor || '—' })}</Text>
            <Text type="secondary">{t('detail.createdInline', { d: dayjs(project.createdAt).format('YYYY-MM-DD HH:mm') })}</Text>
            <Text type="secondary">{t('detail.overallProgress')}</Text>
            <Progress percent={overall} size="small" style={{ width: 180 }} />
          </Space>
          {project.status === 'init' && (
            <Button type="primary" size="small" icon={<CheckOutlined />} onClick={async () => {
              await updateRecord<Project>('projects', pid, { status: 'validation', updatedAt: Date.now() }, actor, t('detail.auditStartVal', { name: project.name }));
              msg.success(t('detail.validStarted'));
            }}>{t('detail.startValidation')}</Button>
          )}
          {project.status === 'validation' && (
            <Popconfirm title={t('detail.qualifyConfirm')} onConfirm={async () => {
              await updateRecord<Project>('projects', pid, { status: 'qualified', updatedAt: Date.now() }, actor, t('detail.auditQualified', { name: project.name }));
              msg.success(t('detail.qualifiedMsg'));
            }}>
              <Button type="primary" size="small" icon={<VerifiedOutlined />}>{t('detail.markQualified')}</Button>
            </Popconfirm>
          )}
          {project.status === 'archived' && (
            <Tag icon={<InboxOutlined />} color="gold" style={{ fontSize: 13, padding: '4px 12px' }}>{t('detail.archivedTag')}</Tag>
          )}
        </Space>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Space wrap style={{ marginBottom: 12 }}>
          {TAB_GROUPS.map((g) => {
            const activeInGroup = TAB_GROUP_OF[searchParams.get('tab') || DEFAULT_TAB] === g.key;
            return (
              <Button
                key={g.key}
                size="small"
                type={activeInGroup ? 'primary' : 'default'}
                onClick={() => setSearchParams({ tab: g.children[0] }, { replace: true })}
              >{t('detail.tabGroup.' + g.key)}</Button>
            );
          })}
        </Space>
        <Tabs
          activeKey={searchParams.get('tab') || DEFAULT_TAB}
          onChange={(k) => setSearchParams({ tab: k }, { replace: true })}
          items={[
            // ===== 质量与合规 =====
            { key: 'audit2', label: t('tabs.audit2'), children: <AuditReadinessTab project={project} /> },
            { key: 'review', label: t('detail.tabReview'), children: <ReviewTab project={project} /> },
            // ===== 配置与交付 =====
            { key: 'config', label: t('detail.tabConfig'), children: <ConfigTab project={project} /> },
            { key: 'metric', label: t('detail.tabMetric'), children: <MetricTab project={project} /> },
            { key: 'docs', label: t('detail.tabDocs', { n: docs.length }), children: (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Space wrap>
                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openCreate()}>{t('detail.newDoc')}</Button>
                  {DOC_TYPES.map((tt) => <Button key={tt} size="small" onClick={() => openCreate(tt)}>+ {tt}</Button>)}
                </Space>
                <Table<VDoc> rowKey="id" size="small" dataSource={docs} columns={docCols} pagination={false} />
              </Space>
            ) },
            { key: 'checklist', label: t('detail.tabChecklist', { done: checklistCount, total: GENERIC_CHECKLIST.length }), children: (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  <Progress
                    percent={Math.round((checklistCount / GENERIC_CHECKLIST.length) * 100)}
                    style={{ flex: 1, maxWidth: 480 }} strokeColor={{ '0%': '#2ea8ff', '100%': '#3dd6a8' }}
                  />
                  <Text type="secondary">{t('detail.checkDone', { done: checklistCount, total: GENERIC_CHECKLIST.length })}</Text>
                </div>
                <Row gutter={[16, 16]}>
                  {CATS.map((cat) => {
                    const items = GENERIC_CHECKLIST.filter((i) => i.cat === cat);
                    const done = items.filter((i) => !!project.checklist?.[i.key]).length;
                    return (
                      <Col span={12} key={cat}>
                        <Card
                          size="small"
                          title={<Space size={8}>
                            <span>{catTitle(cat)}</span>
                            <Text type="secondary" style={{ fontSize: 12 }}>{done}/{items.length}</Text>
                            <Progress percent={items.length ? Math.round((done / items.length) * 100) : 0} size="small" style={{ width: 80 }} />
                          </Space>}
                          style={{ height: '100%' }}
                        >
                          <Space direction="vertical" size={6} style={{ width: '100%' }}>
                            {items.map((i) => {
                              const checked = !!project.checklist?.[i.key];
                              return (
                                <div
                                  key={i.key}
                                  onClick={() => toggleCheck(i.key, !checked)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                                    background: checked ? 'rgba(46,168,255,.08)' : 'rgba(255,255,255,.02)',
                                    border: checked ? '1px solid rgba(46,168,255,.35)' : '1px solid rgba(255,255,255,.06)',
                                    transition: 'all .15s',
                                  }}
                                >
                                  <Checkbox checked={checked} onChange={() => toggleCheck(i.key, !checked)} />
                                  <span style={{ fontSize: 13, color: checked ? '#2ea8ff' : undefined, fontWeight: checked ? 600 : 400 }}>
                                    {i.label}
                                  </span>
                                  {checked && <CheckOutlined style={{ color: '#3dd6a8', marginLeft: 'auto', fontSize: 12 }} />}
                                </div>
                              );
                            })}
                          </Space>
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
              </div>
            ) },
            // ===== 设置与集成 =====
            { key: 'info', label: t('detail.tabInfo'), children: (
              <Descriptions column={2} bordered size="small">
                <Descriptions.Item label={t('detail.labelName')}>{project.name}</Descriptions.Item>
                <Descriptions.Item label={t('detail.labelSys')}>{project.sysType}</Descriptions.Item>
                <Descriptions.Item label={t('detail.labelStd')}>ASPICE {project.stdVersion}</Descriptions.Item>
                <Descriptions.Item label={t('detail.labelScopeCount')}>{t('detail.scopeCountInline', { n: project.processScope?.length || 0, list: project.processScope?.slice(0, 6).join(' / ') || '—' })}</Descriptions.Item>
                <Descriptions.Item label={t('detail.vendorDesc')}>{project.vendor || '—'}</Descriptions.Item>
                <Descriptions.Item label={t('detail.colStatus')}>{statusLabel(project.status)}</Descriptions.Item>
                <Descriptions.Item label={t('detail.labelCreated')}>{dayjs(project.createdAt).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
                <Descriptions.Item label={t('detail.labelDesc')} span={2}>{project.description || '—'}</Descriptions.Item>
              </Descriptions>
            ) },
          ]}
        />
      </Card>

      {/* 新建文档 */}
      <Modal open={createOpen} onCancel={() => setCreateOpen(false)} onOk={createDoc} title={t('detail.newDocTitle')} width={640}>
        <Form form={form} layout="vertical">
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="docType" label={t('detail.docTypeLabel')} rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={DOC_TYPES.map((tt) => ({ value: tt, label: tt }))} />
            </Form.Item>
            <Form.Item name="version" label={t('detail.docVersionLabel')} rules={[{ required: true }]} style={{ width: 120 }}>
              <Input placeholder="1.0" />
            </Form.Item>
          </Space>
          <Form.Item name="title" label={t('detail.docTitleLabel')}>
            <Input placeholder={t('detail.docTitlePh')} />
          </Form.Item>
          <Form.Item name="content" label={t('detail.docContentLabel')}>
            <Input.TextArea rows={10} placeholder={t('detail.docContentPh', { type: form.getFieldValue('docType') || 'URS' })} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 文档详情 */}
      <Drawer open={docOpen} onClose={() => setDocOpen(false)} width={760} title={detail ? t('detail.drawerTitle', { type: detail.docType, title: detail.title, v: detail.version }) : ''}>
        {detail && (<>
          <Descriptions column={3} size="small" bordered style={{ marginBottom: 12 }}>
            <Descriptions.Item label={t('detail.colPhase')}><Tag color="blue">{detail.docType}</Tag></Descriptions.Item>
            <Descriptions.Item label={t('detail.colStatus')}><Tag color={VDOC_STATUS_META[detail.status].color}>{docStatusLabel(detail.status)}</Tag></Descriptions.Item>
            <Descriptions.Item label={t('detail.colVersion')}>{detail.version}</Descriptions.Item>
            <Descriptions.Item label={t('detail.colCreatedBy')}>#{detail.ownerId}</Descriptions.Item>
            <Descriptions.Item label={t('detail.colUpdated')}>{dayjs(detail.updatedAt).format('MM-DD HH:mm:ss')}</Descriptions.Item>
            <Descriptions.Item label={t('detail.colHash')}><Text code style={{ fontSize: 11 }}>{t('detail.hashCalcNote')}</Text></Descriptions.Item>
          </Descriptions>

          <Paragraph style={{ whiteSpace: 'pre-wrap', background: '#f8fafc', padding: 12, borderRadius: 8, minHeight: 120 }}>
            {detail.content || t('detail.docEmpty')}
          </Paragraph>

          {(detail.status === 'draft' || detail.status === 'rejected') && (
            <div style={{ marginBottom: 12 }}>
              <Button type="primary" size="small" icon={<EditOutlined />} onClick={() => {
                Modal.confirm({
                  title: t('detail.editContentTitle'),
                  width: 640,
                  content: <Input.TextArea rows={8} defaultValue={detail.content} id="doc-edit-area" />,
                  onOk: async () => {
                    const el = document.getElementById('doc-edit-area') as HTMLTextAreaElement;
                    if (el) await editDoc(detail, el.value);
                  },
                });
              }}>{t('detail.editContent')}</Button>
              <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{t('detail.editHashNote')}</Text>
            </div>
          )}

          {detail.status === 'in_review' && canApprove && (
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message={t('detail.reviewAlertMsg')}
              action={<Space><Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => openSign(detail, 'approve')}>{t('detail.approve')}</Button>
              <Button size="small" danger icon={<StopOutlined />} onClick={() => openSign(detail, 'reject')}>{t('detail.reject')}</Button></Space>} />
          )}

          <Divider plain style={{ margin: '12px 0' }}>{t('detail.sigRecords')}</Divider>
          {(() => {
            const sigList = sigByDoc[detail.id!] || [];
            if (sigList.length === 0) return <Text type="secondary">{t('detail.noSignatures')}</Text>;
            return (
              <Timeline
                items={sigList.map((s) => ({
                  color: s.status === 'valid' ? 'green' : 'red',
                  children: (
                    <Space direction="vertical" size={4}>
                      <Space>
                        <SafetyCertificateOutlined style={{ color: '#1b6ca8' }} />
                        <Text strong>{s.signerName}（{s.username}）</Text>
                        <Tag color="purple">{s.meaning}</Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(s.signedAt).format('YYYY-MM-DD HH:mm:ss')}</Text>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 12 }}>{t('detail.hashLabel')}<Text code style={{ fontSize: 11 }}>{s.docHash.slice(0, 24)}…</Text></Text>
                      <SigVerify sigId={s.id!} currentContent={{ title: s.docTitle, version: s.docVersion, content: detail.content }} />
                    </Space>
                  ),
                }))}
              />
            );
          })()}
        </>)}
      </Drawer>

      {/* 项目成员管理 */}
      <ProjectMembersModal
        projectId={pid}
        projectName={project.name}
        open={memberOpen}
        onClose={() => setMemberOpen(false)}
      />

      {/* 电子签名审批弹窗 */}
      <SignatureModal
        open={sigOpen}
        onClose={() => setSigOpen(false)}
        onSuccess={onSigned}
        docInfo={sigDoc ? { docType: sigDoc.docType, docTitle: sigDoc.title, docVersion: sigDoc.version, docContent: sigDoc.content } : { docType: '', docTitle: '', docVersion: '', docContent: '' }}
      />
    </div>
  );
}

// 签名验证小组件：实时校验签名与当前内容哈希是否匹配
function SigVerify({ sigId, currentContent }: { sigId: number; currentContent: { title: string; version: string; content: string } }) {
  const { t } = useTranslation();
  const [result, setResult] = useState<{ valid: boolean; reason?: string } | null>(null);
  return (
    <Space size={8}>
      <Button size="small" type="link" style={{ fontSize: 12 }} onClick={async () => setResult(await verifySignature(sigId, currentContent))}>
        <VerifiedOutlined /> {t('detail.verifySig')}
      </Button>
      {result && (result.valid
        ? <Text style={{ color: '#2f9e44', fontSize: 12 }}>✅ {t('detail.sigValid')}</Text>
        : <Text style={{ color: '#e8590c', fontSize: 12 }}>⚠ {result.reason}</Text>)}
    </Space>
  );
}
