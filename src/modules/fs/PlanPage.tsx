import { useMemo, useState } from 'react';
import { fsPidFromUrl } from './projectLink';
import {
  Card, Table, Tag, Button, Space, Typography, Modal, Form, Input, Select, DatePicker, message, Popconfirm, Alert, Row, Col, Statistic,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ScheduleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { nextSeq } from '../../core/seq';
import { ASIL_TAG_TEXT, ASIL_COLOR } from '../../core/fs/data';
import type { FsPlanItem, FsAsil } from '../../core/types';

const { Title, Text } = Typography;
const PHASES = ['phCon', 'phSys', 'phHw', 'phSw', 'phVal'];
const ST_COLOR: Record<FsPlanItem['status'], string> = { planned: 'default', in_progress: 'orange', done: 'green', na: 'red' };

export default function PlanPage() {
  const { t } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  const [activePid, setActivePid] = useState<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FsPlanItem | null>(null);
  const [form] = Form.useForm();
  const [phaseFilter, setPhaseFilter] = useState<string>('all');

  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? [];
  const fsProjects = useMemo(() => projects.filter((p) => p.fsEnabled), [projects]);
  const pid = fsPidFromUrl(fsProjects.map((p) => p.id!), activePid);
  const all = useLiveQuery(() => (pid != null ? db.fs_plan_items.where('projectId').equals(pid).toArray() : Promise.resolve([])), [pid]) ?? [];
  const rows = all.filter((x) => phaseFilter === 'all' || x.phase === phaseFilter);

  const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ phase: 'phCon', asil: 'D', status: 'planned' }); setOpen(true); };
  const openEdit = (it: FsPlanItem) => { setEditing(it); form.setFieldsValue({ ...it, phase: PHASES.includes(it.phase) ? it.phase : undefined }); setOpen(true); };

  const stW = Form.useWatch('status', form) as FsPlanItem['status'] | undefined;
  const save = async () => {
    const v = await form.validateFields();
    if (v.status === 'na' && !v.naReason) { msg.warning(t('planPage.naReq')); return; }
    const now = Date.now();
    const data = {
      phase: v.phase, task: v.task, deliverable: v.deliverable, asil: v.asil,
      status: v.status, naReason: v.status === 'na' ? v.naReason : undefined,
      owner: v.owner, dueDate: v.dueDate ? dayjs(v.dueDate).valueOf() : undefined,
    };
    if (editing?.id) {
      await db.fs_plan_items.update(editing.id, { ...data, updatedAt: now }, t('planPage.auditEdit', { id: editing.plId }));
    } else {
      const plId = await nextSeq(pid!, 'PL');
      await db.fs_plan_items.add({ projectId: pid!, plId, ...data, createdAt: now, updatedAt: now }, t('planPage.auditNew', { id: plId, task: v.task }));
    }
    setOpen(false);
    msg.success('✓');
  };
  const del = async (it: FsPlanItem) => { await db.fs_plan_items.delete(it.id!, t('planPage.auditDel', { id: it.plId })); };
  const setSt = async (it: FsPlanItem, next: FsPlanItem['status']) => {
    await db.fs_plan_items.update(it.id!, { status: next, updatedAt: Date.now() }, `${it.plId} status → ${next}`);
  };

  return (
    <Card>
      {msgCtx}
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Row align="middle" gutter={16}>
          <Col flex="auto">
            <Space align="center">
              <ScheduleOutlined style={{ fontSize: 20, color: '#1b6ca8' }} />
              <Title level={4} style={{ margin: 0 }}>{t('planPage.title')}</Title>
              <Tag color="purple">ISO 26262:2018</Tag>
            </Space>
            <div><Text type="secondary">{t('planPage.sub')}</Text></div>
          </Col>
          <Col>{fsProjects.length ? <Select style={{ width: 240 }} value={pid} onChange={setActivePid} options={fsProjects.map((p) => ({ value: p.id!, label: p.name }))} /> : <Alert type="warning" showIcon message={t('fs.noProject')} />}</Col>
        </Row>
        {pid != null && (
          <>
            <Row gutter={12}>
              <Col span={4}><Card size="small"><Statistic title={t('planPage.statPlanned')} value={all.filter((x) => x.status === 'planned').length} valueStyle={{ fontSize: 18 }} /></Card></Col>
              <Col span={4}><Card size="small"><Statistic title={t('planPage.statDoing')} value={all.filter((x) => x.status === 'in_progress').length} valueStyle={{ fontSize: 18, color: '#fa8c16' }} /></Card></Col>
              <Col span={4}><Card size="small"><Statistic title={t('planPage.statDone')} value={all.filter((x) => x.status === 'done').length} valueStyle={{ fontSize: 18, color: '#52c41a' }} /></Card></Col>
              <Col span={4}><Card size="small"><Statistic title={t('planPage.statNa')} value={all.filter((x) => x.status === 'na').length} valueStyle={{ fontSize: 18, color: '#999' }} /></Card></Col>
              <Col span={8}><Card size="small"><Text type="secondary" style={{ fontSize: 12 }}>{t('planPage.naReq')}</Text></Card></Col>
            </Row>
            <Space wrap>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('planPage.new')}</Button>
              <Select style={{ width: 200 }} value={phaseFilter} onChange={setPhaseFilter}
                options={[{ value: 'all', label: 'all' }, ...PHASES.map((p) => ({ value: p, label: t(`planPage.${p}`) }))]} />
            </Space>
            <Table<FsPlanItem> rowKey="id" size="small" dataSource={rows} pagination={false} locale={{ emptyText: t('planPage.empty') }}
              columns={[
                { title: t('planPage.plId'), dataIndex: 'plId', width: 80, render: (v: string) => <Text code>{v}</Text> },
                { title: t('planPage.phase'), dataIndex: 'phase', width: 110, render: (v: string) => <Tag color="blue">{PHASES.includes(v) ? t(`planPage.${v}`) : v}</Tag> },
                { title: t('planPage.task'), dataIndex: 'task', ellipsis: true },
                { title: t('planPage.deliverable'), dataIndex: 'deliverable', width: 160, render: (v?: string) => v || '—' },
                { title: t('planPage.asil'), dataIndex: 'asil', width: 80, render: (v: FsAsil) => <Tag color={ASIL_COLOR[v]}>{ASIL_TAG_TEXT[v]}</Tag> },
                {
                  title: t('planPage.status'), dataIndex: 'status', width: 100,
                  render: (v: FsPlanItem['status'], it) => (
                    <Space size={2}>
                      <Tag color={ST_COLOR[v]}>{t(`planPage.s${v.split('_').map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join('')}`)}</Tag>
                      {v === 'na' && it.naReason && <Text type="secondary" style={{ fontSize: 10 }} title={it.naReason}>?</Text>}
                    </Space>
                  ),
                },
                { title: t('planPage.owner'), dataIndex: 'owner', width: 80, render: (v?: string) => v || '—' },
                { title: t('planPage.due'), dataIndex: 'dueDate', width: 100, render: (v?: number) => v ? dayjs(v).format('MM-DD') : '—' },
                {
                  title: '', key: 'op', width: 220,
                  render: (_: unknown, it) => (
                    <Space size={2}>
                      <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(it)}>{t('planPage.edit')}</Button>
                      {it.status === 'planned' && <Button size="small" type="link" onClick={() => setSt(it, 'in_progress')}>{t('planPage.statDoing')}→</Button>}
                      {it.status === 'in_progress' && <Button size="small" type="link" onClick={() => setSt(it, 'done')}>{t('planPage.statDone')}→</Button>}
                      {it.status !== 'na' && <Button size="small" type="link" danger onClick={() => setSt(it, 'na')}>{t('planPage.sNa')}</Button>}
                      {it.status === 'na' && <Button size="small" type="link" onClick={() => setSt(it, 'planned')}>↺</Button>}
                      <Popconfirm title={t('planPage.del')} onConfirm={() => del(it)}>
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

      <Modal open={open} title={editing ? `${t('planPage.edit')} ${editing.plId}` : t('planPage.new')} onCancel={() => setOpen(false)} onOk={save} width={640} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ phase: 'phCon', asil: 'D', status: 'planned' }}>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="phase" label={t('planPage.phase')} rules={[{ required: true }]}><Select options={PHASES.map((p) => ({ value: p, label: t(`planPage.${p}`) }))} /></Form.Item></Col>
            <Col span={16}><Form.Item name="task" label={t('planPage.task')} rules={[{ required: true }]}><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={14}><Form.Item name="deliverable" label={t('planPage.deliverable')}><Input /></Form.Item></Col>
            <Col span={5}><Form.Item name="asil" label={t('planPage.asil')}><Select options={(['QM', 'A', 'B', 'C', 'D'] as FsAsil[]).map((a) => ({ value: a, label: ASIL_TAG_TEXT[a] }))} /></Form.Item></Col>
            <Col span={5}><Form.Item name="status" label={t('planPage.status')}><Select options={(['planned', 'in_progress', 'done', 'na'] as FsPlanItem['status'][]).map((v) => ({ value: v, label: t(`planPage.s${v.split('_').map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join('')}`) }))} /></Form.Item></Col>
          </Row>
          {stW === 'na' && <Form.Item name="naReason" label={t('planPage.naReason')} rules={[{ required: true, message: t('planPage.naReq') }]}><Input.TextArea rows={2} /></Form.Item>}
          <Row gutter={12}>
            <Col span={12}><Form.Item name="owner" label={t('planPage.owner')}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="dueDate" label={t('planPage.due')}><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
}
