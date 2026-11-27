import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Select, Form, Input, Modal, Popconfirm, message, Typography, Tooltip,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ProfileOutlined, ExperimentOutlined } from '@ant-design/icons';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { createRecord, updateRecord, deleteRecord } from '../../core/repo';
import { nextSeq } from '../../core/seq';
import { relatedReqIds, syncTcLinks } from '../../core/tcLinks';
import { useAuth } from '../../store/auth';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { V_LAYERS, normalizeVLayer, vLayerLabel } from '../../core/aspice/processes';
import dayjs from 'dayjs';
import type { ReqItem, TestCase } from '../../core/types';

const { Text } = Typography;

const REQ_STATUS_META: Record<string, { color: string }> = {
  draft: { color: 'default' },
  approved: { color: 'green' },
  superseded: { color: 'purple' },
};
const TC_RESULT_META: Record<string, { color: string }> = {
  not_run: { color: 'default' },
  pass: { color: 'green' },
  fail: { color: 'red' },
  na: { color: 'orange' },
};
const TC_STATUS_META: Record<string, { color: string }> = {
  draft: { color: 'default' },
  approved: { color: 'green' },
  superseded: { color: 'purple' },
};

// ============ 工作项列表（全局条目中心）============
// 汇总所有项目的需求条目（V 模型左侧）与验证活动/测试用例（V 模型右侧），
// 统一视图 + 任意类型新建 / 编辑 / 删除。
export default function WorkItemsPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  const actor = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };
  const statusLabel = (s: string) => (REQ_STATUS_META[s] || TC_STATUS_META[s]) ? t('workItems.status.' + s) : s;
  const resultLabel = (s: string) => (TC_RESULT_META[s] ? t('workItems.tcResult.' + s) : s);

  const projects = useLiveQuery(() => db.projects.orderBy('id').toArray(), []) ?? [];
  const reqs = useLiveQuery(() => db.req_items.toArray(), []) ?? [];
  const tcs = useLiveQuery(() => db.test_cases.toArray(), []) ?? [];

  const [projFilter, setProjFilter] = useState<number | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // 新建/编辑状态
  const [open, setOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<ReqItem | null>(null);
  const [editingTc, setEditingTc] = useState<TestCase | null>(null);
  const [kind, setKind] = useState<'req' | 'tc'>('req');
  const [layer, setLayer] = useState<string>(V_LAYERS[0].key);
  const [form] = Form.useForm();

  // 当前项目需求（供验证活动关联选择）
  const currentReqs = reqs.filter((r) => r.projectId === (editingTc?.projectId ?? Number(form.getFieldValue('projectId') ?? 0)) && r.status !== 'superseded');
  const projName = (id: number) => projects.find((p) => p.id === id)?.name ?? `#${id}`;
  const layerMeta = (t?: string) => V_LAYERS.find((l) => l.key === normalizeVLayer(t));

  // 合并行
  const rows = useMemo(() => {
    const out: {
      key: string; kind: 'req' | 'tc'; id: number; projectId: number; code: string; title: string;
      layer: string; layerLabel: string; layerColor: string; priority?: string; result?: string;
      status: string; statusLabel: string; statusColor: string; updatedAt: number; raw: ReqItem | TestCase;
    }[] = [];
    for (const r of reqs) {
      if (r.status === 'superseded') continue;
      const meta = layerMeta(r.reqType);
      out.push({
        key: `req-${r.id}`, kind: 'req', id: r.id!, projectId: r.projectId, code: r.reqId, title: r.desc,
        layer: normalizeVLayer(r.reqType), layerLabel: meta ? vLayerLabel(meta, i18n.language) : t('workItems.layerReq'), layerColor: meta?.color ?? '#1b6ca8',
        priority: r.priority, status: r.status, statusLabel: statusLabel(r.status),
        statusColor: REQ_STATUS_META[r.status]?.color ?? 'default', updatedAt: r.updatedAt ?? 0, raw: r,
      });
    }
    for (const tc of tcs) {
      if (tc.status === 'superseded') continue;
      out.push({
        key: `tc-${tc.id}`, kind: 'tc', id: tc.id!, projectId: tc.projectId, code: tc.tcId, title: tc.title,
        layer: 'tc', layerLabel: t('workItems.tcKind'), layerColor: '#2f9e44',
        result: tc.result, status: tc.status, statusLabel: statusLabel(tc.status),
        statusColor: TC_STATUS_META[tc.status]?.color ?? 'default', updatedAt: tc.updatedAt ?? 0, raw: tc,
      });
    }
    return out;
  }, [reqs, tcs, t, i18n.language]);

  const filtered = rows.filter((r) => {
    if (projFilter !== 'all' && r.projectId !== projFilter) return false;
    if (typeFilter !== 'all' && r.layer !== typeFilter) return false;
    return true;
  });

  const openCreate = (k: 'req' | 'tc') => {
    setKind(k);
    setEditingReq(null);
    setEditingTc(null);
    form.resetFields();
    if (k === 'req') {
      setLayer(V_LAYERS[0].key);
      form.setFieldsValue({ priority: '中', status: 'draft' });
    } else {
      form.setFieldsValue({ result: 'not_run', status: 'draft', relatedReqIds: [] });
    }
    setOpen(true);
  };

  const openEdit = async (row: (typeof rows)[number]) => {
    if (row.kind === 'req') {
      setKind('req');
      setEditingReq(row.raw as ReqItem);
      setEditingTc(null);
      setLayer(normalizeVLayer((row.raw as ReqItem).reqType));
      form.setFieldsValue({ ...(row.raw as ReqItem) });
    } else {
      setKind('tc');
      setEditingTc(row.raw as TestCase);
      setEditingReq(null);
      const ids = await relatedReqIds(row.projectId, row.id);
      form.setFieldsValue({ ...(row.raw as TestCase), relatedReqIds: ids });
    }
    setOpen(true);
  };

  // 深链：/workitems?focus=req:8 或 tc:8 → 自动打开该条目详情
  const [searchParams, setSearchParams] = useSearchParams();
  const focusDone = useRef(false);
  useEffect(() => {
    if (focusDone.current) return;
    const f = searchParams.get('focus');
    if (!f) return;
    const [k, idStr] = f.split(':');
    const id = Number(idStr);
    if ((k !== 'req' && k !== 'tc') || !id) return;
    const row = rows.find((r) => r.kind === k && r.id === id);
    if (!row) return;
    focusDone.current = true;
    setProjFilter('all');
    setTypeFilter('all');
    void openEdit(row);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const save = async () => {
    const v = await form.validateFields();
    const now = Date.now();
    if (kind === 'req') {
      if (editingReq?.id) {
        await updateRecord<ReqItem>('req_items', editingReq.id, { ...v, reqType: layer, updatedAt: now }, actor, t('workItems.auditEdit', { code: editingReq.reqId }));
        msg.success(t('workItems.saved'));
      } else {
        const meta = V_LAYERS.find((l) => l.key === layer)!;
        const reqId = await nextSeq(Number(v.projectId), meta.prefix);
        await createRecord<ReqItem>('req_items', {
          ...v, reqId, projectId: Number(v.projectId), docId: 0, reqType: layer, status: 'draft', createdAt: now, updatedAt: now,
        }, actor, t('workItems.auditNewReq', { id: reqId, layer: vLayerLabel(meta, i18n.language), desc: v.desc.slice(0, 30) }));
        msg.success(t('workItems.newReqDone', { id: reqId }));
      }
    } else {
      const related = v.relatedReqIds ?? [];
      const body = { ...v };
      delete (body as Record<string, unknown>).relatedReqIds;
      let savedTcId: number;
      let savedProjectId: number;
      if (editingTc?.id) {
        await updateRecord<TestCase>('test_cases', editingTc.id, { ...body, updatedAt: now }, actor, t('workItems.auditEdit', { code: editingTc.tcId }));
        savedTcId = editingTc.id;
        savedProjectId = editingTc.projectId;
        msg.success(t('workItems.saved'));
      } else {
        const tcId = await nextSeq(Number(v.projectId), 'TC');
        await createRecord<TestCase>('test_cases', {
          ...body, tcId, projectId: Number(v.projectId), docId: 0, status: 'draft', createdAt: now, updatedAt: now,
        }, actor, t('workItems.auditNewTc', { id: tcId, title: v.title.slice(0, 24) }));
        msg.success(t('workItems.newTcDone', { id: tcId }));
        const all = await db.test_cases.where('projectId').equals(Number(v.projectId)).toArray();
        savedTcId = all.find((x) => x.tcId === tcId)?.id ?? 0;
        savedProjectId = Number(v.projectId);
      }
      const r = await syncTcLinks(savedProjectId, savedTcId, related, actor);
      if (r.added > 0) msg.success(t('workItems.linkDone', { n: r.added }));
    }
    setOpen(false);
  };

  const remove = async (row: (typeof rows)[number]) => {
    if (row.kind === 'req') {
      await deleteRecord('req_items', row.id, actor, t('workItems.auditDel', { code: row.code }));
    } else {
      await deleteRecord('test_cases', row.id, actor, t('workItems.auditDel', { code: row.code }));
    }
    msg.success(t('workItems.deleted'));
  };

  const columns = [
    {
      title: t('workItems.colType'), width: 110,
      render: (_: unknown, r: (typeof rows)[number]) => r.kind === 'tc'
        ? <Tag color="#2f9e44" icon={<ExperimentOutlined />}>{t('workItems.tcKind')}</Tag>
        : <Tag color={r.layerColor}>{r.layerLabel}</Tag>,
    },
    { title: t('workItems.colCode'), width: 120, render: (_: unknown, r: (typeof rows)[number]) => <Text strong style={{ color: r.layerColor }}>{r.code}</Text> },
    { title: t('workItems.colDesc'), ellipsis: true, render: (_: unknown, r: (typeof rows)[number]) => <Tooltip title={r.title}><span>{r.title}</span></Tooltip> },
    { title: t('workItems.colProj'), width: 200, ellipsis: true, render: (_: unknown, r: (typeof rows)[number]) => <Text type="secondary" style={{ fontSize: 12 }}>{projName(r.projectId)}</Text> },
    {
      title: t('workItems.colPrioResult'), width: 100,
      render: (_: unknown, r: (typeof rows)[number]) => r.kind === 'req'
        ? (r.priority === '高' ? <Tag color="red">高</Tag> : r.priority === '中' ? <Tag color="orange">中</Tag> : <Tag>低</Tag>)
        : <Tag color={TC_RESULT_META[r.result || 'not_run']?.color}>{resultLabel(r.result || 'not_run')}</Tag>,
    },
    { title: t('workItems.colStatus'), width: 90, render: (_: unknown, r: (typeof rows)[number]) => <Tag color={r.statusColor}>{r.statusLabel}</Tag> },
    { title: t('workItems.colUpdated'), width: 110, render: (_: unknown, r: (typeof rows)[number]) => r.updatedAt ? dayjs(r.updatedAt).format('MM-DD HH:mm') : '—' },
    {
      title: t('common.actions'), width: 120,
      render: (_: unknown, r: (typeof rows)[number]) => (
        <Space size={0}>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title={t('workItems.delConfirm', { code: r.code })} onConfirm={() => remove(r)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={<Space><ProfileOutlined />{t('workItems.title')}</Space>}
      extra={
        <Space>
          <Button icon={<PlusOutlined />} onClick={() => openCreate('req')}>{t('workItems.newReq')}</Button>
          <Button type="primary" icon={<ExperimentOutlined />} onClick={() => openCreate('tc')}>{t('workItems.newTc')}</Button>
        </Space>
      }
    >
      {msgCtx}
      <Space style={{ marginBottom: 12 }} wrap>
        <Text type="secondary">{t('workItems.filterProj')}</Text>
        <Select
          style={{ width: 260 }} value={projFilter} onChange={setProjFilter}
          options={[{ value: 'all', label: t('workItems.allProj') }, ...projects.map((p) => ({ value: p.id!, label: p.name }))]}
        />
        <Text type="secondary">{t('workItems.filterType')}</Text>
        <Select
          style={{ width: 200 }} value={typeFilter} onChange={setTypeFilter}
          options={[
            { value: 'all', label: t('workItems.allTypes') },
            ...V_LAYERS.map((l) => ({ value: l.key, label: `${vLayerLabel(l, i18n.language)}${(i18n.language || '').toLowerCase().startsWith('en') ? ' (' : '（'}${l.prefix}-xxx${(i18n.language || '').toLowerCase().startsWith('en') ? ')' : '）'}` })),
            { value: 'tc', label: t('workItems.tcTypeOpt') },
          ]}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('workItems.counts', { n: filtered.length, req: filtered.filter((r) => r.kind === 'req').length, tc: filtered.filter((r) => r.kind === 'tc').length })}
        </Text>
      </Space>
      <Table<(typeof rows)[number]>
        rowKey="key" size="small" dataSource={filtered} columns={columns}
        pagination={{ pageSize: 20 }} scroll={{ x: 1100 }}
      />

      {/* 新建/编辑 */}
      <Modal
        open={open} onCancel={() => setOpen(false)} onOk={save} width={640}
        title={kind === 'req'
          ? (editingReq ? t('workItems.editReq', { id: editingReq.reqId }) : t('workItems.newReqTitle'))
          : (editingTc ? t('workItems.editTc', { id: editingTc.tcId }) : t('workItems.newTcTitle'))}
      >
        <Form form={form} layout="vertical">
          {!editingReq && !editingTc && (
            <Form.Item name="projectId" label={t('workItems.projLabel')} rules={[{ required: true, message: t('workItems.projRequired') }]}>
              <Select options={projects.map((p) => ({ value: p.id!, label: p.name }))} placeholder={t('workItems.projPh')} />
            </Form.Item>
          )}
          {kind === 'req' ? (
            <>
              <Form.Item label={t('workItems.layerLabel')}>
                <Select
                  value={layer}
                  onChange={(v: string) => { setLayer(v); if (!editingReq) form.setFieldsValue({ sourceReg: '—' }); }}
                  options={V_LAYERS.map((l) => ({ value: l.key, label: `${l.label}（${l.prefix}-xxx）` }))}
                />
              </Form.Item>
              <Space size={16} style={{ display: 'flex' }}>
                <Form.Item name="priority" label={t('workItems.prioLabel')} style={{ width: 120 }}>
                  <Select options={['高', '中', '低'].map((p) => ({ value: p, label: p }))} />
                </Form.Item>
                <Form.Item name="sourceReg" label={t('workItems.sourceLabel')} style={{ flex: 1 }}>
                  <Input placeholder={t('workItems.sourcePh')} />
                </Form.Item>
              </Space>
              <Form.Item name="desc" label={t('workItems.descLabel')} rules={[{ required: true, message: t('workItems.descRequired') }]}>
                <Input.TextArea rows={4} placeholder={t('workItems.descPh')} />
              </Form.Item>
              <Text type="secondary" style={{ fontSize: 12 }}>{t('workItems.reqIdHint', { prefix: V_LAYERS.find((l) => l.key === layer)?.prefix })}</Text>
            </>
          ) : (
            <>
              <Form.Item name="title" label={t('workItems.tcTitleLabel')} rules={[{ required: true, message: t('workItems.tcTitleRequired') }]}>
                <Input placeholder={t('workItems.tcTitlePh')} />
              </Form.Item>
              <Form.Item name="steps" label={t('workItems.stepsLabel')}>
                <Input.TextArea rows={3} placeholder={t('workItems.stepsPh')} />
              </Form.Item>
              <Form.Item name="expected" label={t('workItems.expLabel')}>
                <Input.TextArea rows={2} placeholder={t('workItems.expPh')} />
              </Form.Item>
              <Space size={16} style={{ display: 'flex' }}>
                <Form.Item name="result" label={t('workItems.resultLabel')} style={{ width: 140 }}>
                  <Select options={Object.entries(TC_RESULT_META).map(([v]) => ({ value: v, label: resultLabel(v) }))} />
                </Form.Item>
                <Form.Item name="status" label={t('workItems.colStatus')} style={{ width: 120 }}>
                  <Select options={Object.entries(TC_STATUS_META).map(([v]) => ({ value: v, label: statusLabel(v) }))} />
                </Form.Item>
              </Space>
              <Form.Item name="evidence" label={t('workItems.evidenceLabel')}>
                <Input placeholder={t('workItems.evidencePh')} />
              </Form.Item>
              <Form.Item name="relatedReqIds" label={t('workItems.relatedLabel')}>
                <Select
                  mode="multiple" allowClear showSearch optionFilterProp="label"
                  placeholder={t('workItems.relatedPh')}
                  options={currentReqs.map((r) => ({ value: r.id!, label: `${r.reqId} ${r.desc.slice(0, 40)}` }))}
                />
              </Form.Item>
              <Text type="secondary" style={{ fontSize: 12 }}>{t('workItems.tcIdHint')}</Text>
            </>
          )}
        </Form>
      </Modal>
    </Card>
  );
}
