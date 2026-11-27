import { useMemo, useState } from 'react';
import { fsPidFromUrl } from './projectLink';
import {
  Card, Table, Tag, Button, Space, Typography, Modal, Form, Input, Select, DatePicker, message, Popconfirm, Statistic, Row, Col, Alert,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SolutionOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { nextSeq } from '../../core/seq';
import { ASIL_TAG_TEXT, ASIL_COLOR, INDEPENDENCE_LEVELS, INDEPENDENCE_SUGGEST } from '../../core/fs/data';
import type { FsConfirmMeasure, FsAsil, FsIndependence } from '../../core/types';

const { Title, Text } = Typography;
const TYPE_COLOR: Record<FsConfirmMeasure['type'], string> = { review: 'blue', audit: 'orange', assessment: 'purple' };
// FSA 结论三态 → i18n key（acceptance/conditional acceptance/rejection）
const OUTCOME_KEY: Record<string, string> = { acceptance: 'oAccept', 'conditional acceptance': 'oCond', rejection: 'oReject' };
const outcomeLabel = (t: (k: string) => string, v?: string) => (v && OUTCOME_KEY[v] ? t(`confirmPage.${OUTCOME_KEY[v]}`) : v || '—');

export default function ConfirmPage() {
  const { t } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  const [activePid, setActivePid] = useState<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FsConfirmMeasure | null>(null);
  const [form] = Form.useForm();
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? [];
  const fsProjects = useMemo(() => projects.filter((p) => p.fsEnabled), [projects]);
  const pid = fsPidFromUrl(fsProjects.map((p) => p.id!), activePid);
  const all = useLiveQuery(() => (pid != null ? db.fs_confirm_measures.where('projectId').equals(pid).toArray() : Promise.resolve([])), [pid]) ?? [];
  const rows = all.filter((x) => typeFilter === 'all' || x.type === typeFilter);

  const asilW = Form.useWatch('relatedAsil', form) as FsAsil | undefined;
  const sug = asilW ? INDEPENDENCE_SUGGEST[asilW] : undefined;

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ type: 'review', relatedAsil: 'D', status: 'planned', independence: INDEPENDENCE_SUGGEST.D });
    setOpen(true);
  };
  const openEdit = (it: FsConfirmMeasure) => {
    setEditing(it);
    form.setFieldsValue(it);
    setOpen(true);
  };

  const save = async () => {
    const v = await form.validateFields();
    const indep = v.independence || (sug ?? 'I1');
    const now = Date.now();
    const data = {
      type: v.type, title: v.title, scope: v.scope, relatedAsil: v.relatedAsil, independence: indep,
      status: v.status, dueDate: v.dueDate ? dayjs(v.dueDate).valueOf() : undefined,
      assignee: v.assignee, evidence: v.evidence, outcome: v.outcome,
    };
    if (editing?.id) {
      await db.fs_confirm_measures.update(editing.id, { ...data, updatedAt: now }, t('confirmPage.auditEdit', { id: editing.cmId }));
    } else {
      const cmId = await nextSeq(pid!, 'CM');
      await db.fs_confirm_measures.add({ projectId: pid!, cmId, ...data, createdAt: now, updatedAt: now }, t('confirmPage.auditNew', { id: cmId, type: v.type }));
    }
    setOpen(false);
    msg.success('✓');
  };
  const del = async (it: FsConfirmMeasure) => { await db.fs_confirm_measures.delete(it.id!, t('confirmPage.auditDel', { id: it.cmId })); };
  const setStatus = async (it: FsConfirmMeasure, next: FsConfirmMeasure['status'], summary: string) => {
    await db.fs_confirm_measures.update(it.id!, { status: next, updatedAt: Date.now() }, summary);
  };

  return (
    <Card>
      {msgCtx}
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Row align="middle" gutter={16}>
          <Col flex="auto">
            <Space align="center">
              <SolutionOutlined style={{ fontSize: 20, color: '#1b6ca8' }} />
              <Title level={4} style={{ margin: 0 }}>{t('confirmPage.title')}</Title>
              <Tag color="purple">ISO 26262:2018</Tag>
            </Space>
            <div><Text type="secondary">{t('confirmPage.sub')}</Text></div>
          </Col>
          <Col>{fsProjects.length ? <Select style={{ width: 240 }} value={pid} onChange={setActivePid} options={fsProjects.map((p) => ({ value: p.id!, label: p.name }))} /> : <Alert type="warning" showIcon message={t('fs.noProject')} />}</Col>
        </Row>
        {pid != null && (
          <>
            <Row gutter={12}>
              <Col span={4}><Card size="small"><Statistic title={t('confirmPage.statPlanned')} value={all.filter((x) => x.status === 'planned').length} valueStyle={{ fontSize: 18 }} /></Card></Col>
              <Col span={4}><Card size="small"><Statistic title={t('confirmPage.statDoing')} value={all.filter((x) => x.status === 'in_progress').length} valueStyle={{ fontSize: 18, color: '#fa8c16' }} /></Card></Col>
              <Col span={4}><Card size="small"><Statistic title={t('confirmPage.statClosed')} value={all.filter((x) => x.status === 'closed').length} valueStyle={{ fontSize: 18, color: '#52c41a' }} /></Card></Col>
              <Col span={12}>
                <Card size="small"><Text type="secondary" style={{ fontSize: 12 }}>{t('confirmPage.iHint')}</Text></Card>
              </Col>
            </Row>
            <Space wrap>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('confirmPage.new')}</Button>
              <Select style={{ width: 200 }} value={typeFilter} onChange={setTypeFilter}
                options={[{ value: 'all', label: t('confirmPage.type') + ': all' }, ...(['review', 'audit', 'assessment'] as const).map((v) => ({ value: v, label: t(`confirmPage.t${v.charAt(0).toUpperCase()}${v.slice(1)}`) }))]} />
            </Space>
            <Table<FsConfirmMeasure> rowKey="id" size="small" dataSource={rows} pagination={false} locale={{ emptyText: t('confirmPage.empty') }}
              columns={[
                { title: t('confirmPage.cmId'), dataIndex: 'cmId', width: 90, render: (v: string) => <Text code>{v}</Text> },
                { title: t('confirmPage.type'), dataIndex: 'type', width: 140, render: (v: FsConfirmMeasure['type']) => <Tag color={TYPE_COLOR[v]}>{t(`confirmPage.t${v.charAt(0).toUpperCase()}${v.slice(1)}`)}</Tag> },
                { title: t('confirmPage.scope'), dataIndex: 'title', ellipsis: true, render: (_: unknown, r) => <Space direction="vertical" size={0}><Text>{r.title}</Text><Text type="secondary" style={{ fontSize: 12 }}>{r.scope}</Text></Space> },
                { title: t('confirmPage.asil'), dataIndex: 'relatedAsil', width: 80, render: (v: FsAsil) => <Tag color={ASIL_COLOR[v]}>{ASIL_TAG_TEXT[v]}</Tag> },
                { title: t('confirmPage.indep'), dataIndex: 'independence', width: 60, render: (v: FsIndependence) => <Tag color="geekblue">{v}</Tag> },
                {
                  title: t('confirmPage.outcome'), dataIndex: 'outcome', width: 110,
                  render: (v: string | undefined) => v ? <Tag color={v.includes('reject') ? 'red' : v.includes('cond') ? 'orange' : 'green'}>{outcomeLabel(t, v)}</Tag> : '—',
                },
                { title: t('confirmPage.status'), dataIndex: 'status', width: 90, render: (v: string) => <Tag color={v === 'closed' ? 'green' : v === 'in_progress' ? 'orange' : 'default'}>{t(`confirmPage.s${v.split('_').map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join('')}`)}</Tag> },
                { title: t('confirmPage.due'), dataIndex: 'dueDate', width: 100, render: (v?: number) => v ? dayjs(v).format('YYYY-MM-DD') : '—' },
                { title: t('confirmPage.assignee'), dataIndex: 'assignee', width: 90, render: (v?: string) => v || '—' },
                {
                  title: '', key: 'op', width: 230,
                  render: (_: unknown, it) => (
                    <Space size={2}>
                      <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(it)}>{t('confirmPage.edit')}</Button>
                      {it.status === 'planned' && <Button size="small" type="link" onClick={() => setStatus(it, 'in_progress', t('confirmPage.auditBegin', { id: it.cmId }))}>{t('confirmPage.begin')}</Button>}
                      {it.status === 'in_progress' && <Button size="small" type="link" onClick={() => setStatus(it, 'closed', t('confirmPage.auditClose', { id: it.cmId, outcome: it.outcome || '—' }))}>{t('confirmPage.close')}</Button>}
                      {it.status === 'closed' && <Button size="small" type="link" onClick={() => setStatus(it, 'planned', t('confirmPage.reopen'))}>{t('confirmPage.reopen')}</Button>}
                      <Popconfirm title={t('confirmPage.del')} onConfirm={() => del(it)}>
                        <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
            />
          </>
        )}
      </Space>

      <Modal open={open} title={editing ? `${t('confirmPage.edit')} ${editing.cmId}` : t('confirmPage.new')} onCancel={() => setOpen(false)} onOk={save} width={640} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ relatedAsil: 'D', status: 'planned', independence: 'I1' }}>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="type" label={t('confirmPage.type')} rules={[{ required: true }]}><Select options={(['review', 'audit', 'assessment'] as const).map((v) => ({ value: v, label: t(`confirmPage.t${v.charAt(0).toUpperCase()}${v.slice(1)}`) }))} /></Form.Item></Col>
            <Col span={16}><Form.Item name="title" label={t('confirmPage.scope')} rules={[{ required: true }]}><Input placeholder={t('confirmPage.scopePh')} /></Form.Item></Col>
          </Row>
          <Form.Item name="scope" label={t('confirmPage.scope')}><Input.TextArea rows={2} placeholder={t('confirmPage.scopePh')} /></Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="relatedAsil" label={t('confirmPage.asil')} rules={[{ required: true }]}>
                <Select options={(['QM', 'A', 'B', 'C', 'D'] as FsAsil[]).map((a) => ({ value: a, label: ASIL_TAG_TEXT[a] }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="independence" label={t('confirmPage.indep')} extra={sug ? t('confirmPage.asilSuggest', { asil: asilW, indep: sug }) : undefined}>
                <Select options={INDEPENDENCE_LEVELS.map((x) => ({ value: x.value, label: `${x.value} · ${x.zh}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}><Form.Item name="status" label={t('confirmPage.status')}><Select options={(['planned', 'in_progress', 'closed'] as const).map((v) => ({ value: v, label: t(`confirmPage.s${v.split('_').map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join('')}`) }))} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="assignee" label={t('confirmPage.assignee')}><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="dueDate" label={t('confirmPage.due')}><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}>
              <Form.Item name="outcome" label={t('confirmPage.outcome')}>
                <Select allowClear options={['acceptance', 'conditional acceptance', 'rejection'].map((v) => ({ value: v, label: outcomeLabel(t, v) }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="evidence" label={t('confirmPage.evidence')}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
