import { useMemo, useState } from 'react';
import { Card, Table, Tag, Space, Button, Drawer, Typography, Select, Input, DatePicker, Form, message, Popconfirm, Progress, Alert } from 'antd';
import { PlusOutlined, TeamOutlined, CheckCircleOutlined, ClockCircleOutlined, DeleteOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { createRecord, updateRecord, deleteRecord } from '../../core/repo';
import { useAuth } from '../../store/auth';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { Project, ReviewRecord, ActionItem, AspiceProcess } from '../../core/types';

const { Text } = Typography;

// ============ 联合评审（SUP.4）：评审计划/会议记录/参加人/行动项闭环 ============
// 评审发起 → 记录结论 → 行动项跟踪（open → in_progress → closed）→ 全部闭环后评审视为关闭

interface Props { project: Project }

// 展示用 labelKey 映射（由组件内 t() 解析成当前语言）
const ACTION_STATUS: Record<ActionItem['status'], { labelKey: string; color: string }> = {
  open: { labelKey: 'review.actOpen', color: 'orange' },
  in_progress: { labelKey: 'review.actInProgress', color: 'processing' },
  closed: { labelKey: 'review.actClosed', color: 'green' },
};

const PROCESS_CHOICES = ['SYS.1', 'SYS.2', 'SYS.3', 'SYS.4', 'SYS.5', 'SWE.1', 'SWE.2', 'SWE.3', 'SWE.4', 'SWE.5', 'SWE.6', 'SUP.4', 'MAN.3'];

export default function ReviewTab({ project }: Props) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const actor = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };
  const pid = project.id!;
  const [msg, msgCtx] = message.useMessage();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ReviewRecord | null>(null);
  const [form] = Form.useForm();

  const reviews = useLiveQuery(() => db.reviews.where('projectId').equals(pid).toArray(), [pid]) ?? [];
  const wps = useLiveQuery(() => db.work_products.where('projectId').equals(pid).toArray(), [pid]) ?? [];
  const processes = useLiveQuery(() => db.aspice_processes.where('stdVersion').equals(project.stdVersion).toArray(), [project.stdVersion]) ?? [];

  const byCode = useMemo(() => {
    const m: Record<string, AspiceProcess> = {};
    for (const p of processes) m[p.code] = p;
    return m;
  }, [processes]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ date: dayjs() });
    setOpen(true);
  };
  const openEdit = (r: ReviewRecord) => {
    setEditing(r);
    form.setFieldsValue({
      ...r,
      date: dayjs(r.date),
      attendees: r.attendees || [],
      wpIds: r.wpIds || [],
      actionItems: (r.actionItems || []).map((a) => ({ ...a })),
    });
    setOpen(true);
  };

  const save = async () => {
    const v = await form.validateFields();
    const now = Date.now();
    const actionItems: ActionItem[] = (v.actionItems || []).filter((a: ActionItem) => a.text?.trim()).map((a: ActionItem) => ({
      id: a.id || `ai-${now}-${Math.random().toString(36).slice(2, 6)}`,
      text: a.text.trim(),
      owner: a.owner || user?.name || '',
      dueDate: a.dueDate ? dayjs(a.dueDate).valueOf() : 0,
      status: a.status || 'open',
      closedAt: a.status === 'closed' ? now : undefined,
    }));
    const payload = {
      projectId: pid,
      title: v.title,
      processCode: v.processCode,
      date: dayjs(v.date).valueOf(),
      attendees: v.attendees || [],
      conclusion: v.conclusion || '',
      actionItems,
      wpIds: v.wpIds || [],
      createdBy: actor.username,
      createdAt: editing?.createdAt || now,
    };
    if (editing?.id) {
      await updateRecord<ReviewRecord>('reviews', editing.id, { ...payload, createdBy: editing.createdBy, createdAt: editing.createdAt }, actor, t('review.auditEdit', { title: v.title }));
      msg.success(t('review.saved'));
    } else {
      await createRecord<ReviewRecord>('reviews', payload, actor, t('review.auditCreate', { title: v.title }));
      msg.success(t('review.created'));
    }
    setOpen(false);
  };

  const setActionStatus = async (r: ReviewRecord, ai: ActionItem, status: ActionItem['status']) => {
    const items = (r.actionItems || []).map((a) => a.id === ai.id ? { ...a, status, closedAt: status === 'closed' ? Date.now() : undefined } : a);
    await updateRecord<ReviewRecord>('reviews', r.id!, { actionItems: items }, actor, t('review.auditStatus', { text: ai.text.slice(0, 20), status: t(ACTION_STATUS[status].labelKey) }));
    msg.success(t('review.marked', { status: t(ACTION_STATUS[status].labelKey) }));
  };

  const remove = async (r: ReviewRecord) => {
    await deleteRecord('reviews', r.id!, actor, t('review.auditDel', { title: r.title }));
    msg.success(t('review.deleted'));
  };

  // 行动项闭环率统计
  const stats = useMemo(() => {
    let total = 0, closed = 0;
    for (const r of reviews) for (const a of r.actionItems || []) { total++; if (a.status === 'closed') closed++; }
    return { total, closed, pct: total ? Math.round((closed / total) * 100) : 100 };
  }, [reviews]);

  return (
    <div>
      {msgCtx}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space size={24}>
          <span><Text type="secondary">{t('review.totalLabel')}</Text> <b style={{ fontSize: 18 }}>{reviews.length}</b></span>
          <span><Text type="secondary">{t('review.actTotalLabel')}</Text> <b style={{ fontSize: 18 }}>{stats.total}</b>{t('review.parenL')}<Tag color="green">{t('review.closedTag', { n: stats.closed })}</Tag><Tag color="orange">{t('review.openTag', { n: stats.total - stats.closed })}</Tag>{t('review.parenR')}</span>
          <span style={{ width: 200 }}><Progress percent={stats.pct} size="small" strokeColor="#2f9e44" /></span>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('review.createBtn')}</Button>
        </Space>
      </Card>

      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message={t('review.alertTitle')}
        description={t('review.alertDesc')} />

      <Card size="small" title={<Space><TeamOutlined /> {t('review.listTitle')}</Space>}>
        <Table
          rowKey="id" size="small" pagination={false}
          dataSource={[...reviews].sort((a, b) => b.date - a.date)}
          columns={[
            { title: t('review.colReview'), dataIndex: 'title', render: (v, r) => <Space size={6}><b>{v}</b><Tag color="blue">{r.processCode}</Tag></Space> },
            { title: t('review.colProcess'), dataIndex: 'processCode', width: 80, render: (v) => byCode[v]?.nameZh || v },
            { title: t('review.colDate'), dataIndex: 'date', width: 110, render: (v) => dayjs(v).format('YYYY-MM-DD') },
            { title: t('review.attendees'), dataIndex: 'attendees', width: 160, render: (v: string[]) => (v || []).map((a) => <Tag key={a} style={{ marginRight: 4 }}>{a}</Tag>) },
            { title: t('review.colConclusion'), dataIndex: 'conclusion', ellipsis: true, render: (v) => v || <Text type="secondary">—</Text> },
            {
              title: t('review.colActions'), dataIndex: 'actionItems', width: 140,
              render: (_: unknown, r) => {
                const items = r.actionItems || [];
                const openCount = items.filter((a) => a.status !== 'closed').length;
                return <Space size={4}>{items.length ? <Tag color={openCount ? 'orange' : 'green'}>{openCount ? t('review.aiOpen', { n: items.length, open: openCount }) : t('review.aiAllClosed', { n: items.length })}</Tag> : <Text type="secondary">{t('review.noItems')}</Text>}</Space>;
              },
            },
            {
              title: t('common.actions'), dataIndex: 'id', width: 140,
              render: (_, r) => (
                <Space size={4}>
                  <Button size="small" onClick={() => openEdit(r)}>{t('review.detailBtn')}</Button>
                  <Popconfirm title={t('review.delTitle')} onConfirm={() => remove(r)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        title={editing ? t('review.detailTitle', { title: editing.title }) : t('review.createTitle')}
        width={720} open={open} onClose={() => setOpen(false)}
        extra={<Space><Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button type="primary" onClick={save}>{t('common.save')}</Button></Space>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label={t('review.titleLabel')} rules={[{ required: true, message: t('review.titleRequired') }]}>
            <Input placeholder={t('review.titlePh')} />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="processCode" label={t('review.colProcess')} rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={PROCESS_CHOICES.map((c) => ({ value: c, label: `${c} ${byCode[c]?.nameZh || ''}` }))} placeholder={t('review.processPh')} />
            </Form.Item>
            <Form.Item name="date" label={t('review.dateLabel')} rules={[{ required: true }]} style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="attendees" label={t('review.attendees')}>
            <Select mode="tags" placeholder={t('review.attendeesPh')} tokenSeparators={[',']} open={false} suffixIcon={null} />
          </Form.Item>
          <Form.Item name="wpIds" label={t('review.wpLabel')}>
            <Select mode="multiple" allowClear placeholder={t('review.wpPh')}
              options={wps.map((w) => ({ value: w.id!, label: `${w.wpCode} ${w.title}` }))} />
          </Form.Item>
          <Form.Item name="conclusion" label={t('review.conclusionLabel')}>
            <Input.TextArea rows={3} placeholder={t('review.conclusionPh')} />
          </Form.Item>
          <Form.Item label={t('review.actionLabel')}>
            <Form.List name="actionItems">
              {(fields, { add, remove }) => (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {fields.map((f) => (
                    <Space key={f.key} align="start" style={{ display: 'flex' }} size={8}>
                      <Form.Item name={[f.name, 'text']} rules={[{ required: true, message: t('review.itemContent') }]} style={{ flex: 3, marginBottom: 0 }}>
                        <Input placeholder={t('review.itemTextPh')} />
                      </Form.Item>
                      <Form.Item name={[f.name, 'owner']} style={{ flex: 1.2, marginBottom: 0 }}>
                        <Input placeholder={t('review.itemOwnerPh')} />
                      </Form.Item>
                      <Form.Item name={[f.name, 'dueDate']} style={{ flex: 1.4, marginBottom: 0 }}>
                        <DatePicker placeholder={t('review.itemDuePh')} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name={[f.name, 'status']} initialValue="open" hidden><Input /></Form.Item>
                      <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(f.name)} />
                    </Space>
                  ))}
                  <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ status: 'open' })}>{t('review.addActionBtn')}</Button>
                </Space>
              )}
            </Form.List>
          </Form.Item>
        </Form>

        {editing && (editing.actionItems || []).length > 0 && (
          <Card size="small" title={t('review.statusCardTitle')} style={{ marginTop: 12 }}>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              {(editing.actionItems || []).map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: '1px solid rgba(255,255,255,.08)', borderRadius: 6 }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{a.text}</span>
                  <Tag>{a.owner}</Tag>
                  {a.dueDate ? <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(a.dueDate).format('MM-DD')}</Text> : null}
                  <Tag color={ACTION_STATUS[a.status].color}>{t(ACTION_STATUS[a.status].labelKey)}</Tag>
                  {a.status !== 'closed' && (
                    <Button size="small" type="primary" ghost icon={<CheckCircleOutlined />} onClick={() => setActionStatus(editing, a, 'closed')}>{t('review.closeBtn')}</Button>
                  )}
                  {a.status === 'open' && (
                    <Button size="small" icon={<ClockCircleOutlined />} onClick={() => setActionStatus(editing, a, 'in_progress')}>{t('review.startBtn')}</Button>
                  )}
                </div>
              ))}
            </Space>
          </Card>
        )}
      </Drawer>
    </div>
  );
}
