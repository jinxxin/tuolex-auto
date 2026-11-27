import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal, Table, Tag, Space, Button, Select, Input, Form, message, Popconfirm, Typography, Empty, Alert } from 'antd';
import {
  PlusOutlined, DeleteOutlined, ArrowRightOutlined, ArrowLeftOutlined,
  FileTextOutlined, ExperimentOutlined, WarningOutlined, FileOutlined, SafetyOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from '../core/api';
import { db } from '../core/db';
import { createRecord, deleteRecord } from '../core/repo';
import { writeAudit } from '../core/audit';
import { useAuth } from '../store/auth';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { TraceLink, LinkEntityType } from '../core/types';

const { Text } = Typography;

const FS_ENT = { labelKey: 'traceLink.entFs', color: 'volcano', icon: <SafetyOutlined /> };

export const ENTITY_META: Record<LinkEntityType, { labelKey: string; color: string; icon: ReactNode }> = {
  req: { labelKey: 'traceLink.entReq', color: 'blue', icon: <FileTextOutlined /> },
  tc: { labelKey: 'traceLink.entTc', color: 'cyan', icon: <ExperimentOutlined /> },
  fmea: { labelKey: 'traceLink.entFmea', color: 'red', icon: <WarningOutlined /> },
  vdoc: { labelKey: 'traceLink.entVdoc', color: 'purple', icon: <FileOutlined /> },
  wp: { labelKey: 'traceLink.entWp', color: 'cyan', icon: <FileTextOutlined /> },
  // tuoleX FS（M1 追溯接入时细分各实体 label/icon）
  fs_hazard: FS_ENT, fs_req: FS_ENT, fs_fmeda: FS_ENT, fs_fta: FS_ENT,
  fs_dfa: FS_ENT, fs_case: FS_ENT, fs_confirm: FS_ENT, fs_plan: FS_ENT,
};

// 关系类型（按实体对给出默认，可自定义）
// V 链语义：细化/分解/实现/分配/验证覆盖（A-SPICE 双向追溯）
export const REL_TYPES = [
  '细化', '分解', '实现', '分配', '验证覆盖', '依赖', '风险缓解', '验证控制', '前置依赖', '关联', '定义来源', '依据文档', '控制措施',
];

export function defaultRelType(a: LinkEntityType, b: LinkEntityType): string {
  const key = `${a}:${b}`;
  const map: Record<string, string> = {
    'req:req': '细化', 'req:tc': '验证覆盖', 'req:fmea': '风险缓解', 'req:vdoc': '定义来源',
    'tc:tc': '前置依赖', 'tc:fmea': '验证控制', 'tc:vdoc': '依据文档',
    'fmea:fmea': '关联', 'fmea:vdoc': '控制措施',
    'vdoc:req': '定义来源', 'vdoc:tc': '依据文档', 'vdoc:fmea': '控制措施',
  };
  return map[key] || '关联';
}

interface Props {
  projectId: number;
  entityType: LinkEntityType;
  entityId: number;
  entityLabel: string;    // 如 REQ-003
  open: boolean;
  onClose: () => void;
}

// ============ 通用追溯链接面板（任意条目间手动建立双向追溯）============
export default function TraceLinkPanel({ projectId, entityType, entityId, entityLabel, open, onClose }: Props) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  const actor = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };
  const [linkOpen, setLinkOpen] = useState(false);
  const [form] = Form.useForm();
  const targetType = Form.useWatch('toType', form);

  const reqs = useLiveQuery(() => db.req_items.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const tcs = useLiveQuery(() => db.test_cases.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const fmeas = useLiveQuery(() => db.fmea_items.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const vdocs = useLiveQuery(() => db.vdocs.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  // tuoleX FS 实体（fs 需求/危害/分析/案例——双向追溯显示与建链目标）
  const fsReqs = useLiveQuery(() => db.fs_safety_reqs.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const fsHazards = useLiveQuery(() => db.fs_hazards.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const fsFmedas = useLiveQuery(() => db.fs_fmeda.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const fsFtas = useLiveQuery(() => db.fs_fta.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const fsDfas = useLiveQuery(() => db.fs_dfa.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];

  const outLinks = useLiveQuery(
    () => db.trace_links.where('[projectId+fromType+fromId]').equals([projectId, entityType, entityId]).toArray(),
    [projectId, entityType, entityId],
  ) ?? [];
  const inLinks = useLiveQuery(
    () => db.trace_links.where('[projectId+toType+toId]').equals([projectId, entityType, entityId]).toArray(),
    [projectId, entityType, entityId],
  ) ?? [];

  // 实体名称映射
  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reqs) map.set(`req:${r.id}`, `${r.reqId} ${r.desc.slice(0, 20)}`);
    for (const t of tcs) map.set(`tc:${t.id}`, `${t.tcId} ${t.title.slice(0, 20)}`);
    for (const f of fmeas) map.set(`fmea:${f.id}`, `RPN-${f.rpn} ${f.failureMode.slice(0, 20)}`);
    for (const v of vdocs) map.set(`vdoc:${v.id}`, `${v.docType} ${v.title.slice(0, 20)} v${v.version}`);
    for (const r of fsReqs) map.set(`fs_req:${r.id}`, `${r.code} ${r.title ?? ''} ${r.text.slice(0, 12)}`);
    for (const h of fsHazards) map.set(`fs_hazard:${h.id}`, `${h.hazId} ${h.title.slice(0, 24)}`);
    for (const f of fsFmedas) map.set(`fs_fmeda:${f.id}`, `${f.fmedaId} ${f.item.slice(0, 20)}`);
    for (const f of fsFtas) map.set(`fs_fta:${f.id}`, `${f.ftaId} ${f.topEvent.slice(0, 20)}`);
    for (const d of fsDfas) map.set(`fs_dfa:${d.id}`, `${d.dfaId} ${d.scope.slice(0, 20)}`);
    return map;
  }, [reqs, tcs, fmeas, vdocs, fsReqs, fsHazards, fsFmedas, fsFtas, fsDfas]);

  const targetOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const push = (type: LinkEntityType, list: { id?: number; label: string }[]) => {
      for (const it of list) {
        if (it.id === entityId && type === entityType) continue; // 排除自身
        opts.push({ value: `${type}:${it.id}`, label: it.label });
      }
    };
    push('req', reqs.map((r) => ({ id: r.id, label: `${r.reqId} ${r.desc.slice(0, 30)}` })));
    push('tc', tcs.map((t) => ({ id: t.id, label: `${t.tcId} ${t.title.slice(0, 30)}` })));
    push('fmea', fmeas.map((f) => ({ id: f.id, label: `RPN-${f.rpn} ${f.failureMode.slice(0, 30)}` })));
    push('vdoc', vdocs.map((v) => ({ id: v.id, label: `${v.docType} ${v.title.slice(0, 30)} v${v.version}` })));
    push('fs_req', fsReqs.map((r) => ({ id: r.id, label: `${r.code} ${r.title ?? ''} ${r.text.slice(0, 18)}` })));
    push('fs_hazard', fsHazards.map((h) => ({ id: h.id, label: `${h.hazId} ${h.title.slice(0, 26)}` })));
    push('fs_fmeda', fsFmedas.map((f) => ({ id: f.id, label: `${f.fmedaId} ${f.item.slice(0, 24)}` })));
    push('fs_fta', fsFtas.map((f) => ({ id: f.id, label: `${f.ftaId} ${f.topEvent.slice(0, 24)}` })));
    push('fs_dfa', fsDfas.map((d) => ({ id: d.id, label: `${d.dfaId} ${d.scope.slice(0, 24)}` })));
    return opts;
  }, [reqs, tcs, fmeas, vdocs, fsReqs, fsHazards, fsFmedas, fsFtas, fsDfas, entityType, entityId]);

  const alreadyLinked = useMemo(() => {
    const set = new Set<string>();
    for (const l of [...outLinks, ...inLinks]) set.add(`${l.fromType}:${l.fromId}->${l.toType}:${l.toId}`);
    for (const l of [...outLinks, ...inLinks]) set.add(`${l.toType}:${l.toId}->${l.fromType}:${l.fromId}`);
    return set;
  }, [outLinks, inLinks]);

  const createLink = async () => {
    const v = await form.validateFields();
    const [toType, toIdStr] = (v.toEntity as string).split(':');
    const toId = Number(toIdStr);
    const relType = v.relType || defaultRelType(entityType, toType as LinkEntityType);
    const key = `${entityType}:${entityId}->${toType}:${toId}`;
    if (alreadyLinked.has(key)) { msg.warning(t('traceLink.alreadyLinked')); return; }
    const targetName = nameOf.get(`${toType}:${toId}`) || toId;
    await createRecord<TraceLink>('trace_links', {
      projectId, fromType: entityType, fromId: entityId,
      toType: toType as LinkEntityType, toId, relType,
      createdAt: Date.now(), createdBy: user?.name || '',
    }, actor, t('traceLink.auditCreate', { from: entityLabel, rel: relType, to: targetName }));
    await writeAudit({ userId: user?.id ?? 0, username: user?.username ?? 'unknown', action: 'LINK', entityType: 'trace_links', entityId: 0, summary: t('traceLink.auditManual', { from: entityLabel, rel: relType, to: targetName }), before: null, after: { fromType: entityType, fromId: entityId, toType, toId, relType } });
    msg.success(t('traceLink.linkedOk'));
    setLinkOpen(false);
    form.resetFields();
  };

  const removeLink = async (l: TraceLink) => {
    const other = l.fromId === entityId && l.fromType === entityType
      ? nameOf.get(`${l.toType}:${l.toId}`) || `${l.toType}#${l.toId}`
      : nameOf.get(`${l.fromType}:${l.fromId}`) || `${l.fromType}#${l.fromId}`;
    await deleteRecord('trace_links', l.id!, actor, t('traceLink.auditRemove', { from: entityLabel, other }));
  };

  const rows = [
    ...outLinks.map((l) => ({ ...l, dir: 'out' as const })),
    ...inLinks.map((l) => ({ ...l, dir: 'in' as const })),
  ].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={720}
      title={t('traceLink.title', { label: entityLabel, type: t(ENTITY_META[entityType].labelKey) })}>
      {msgCtx}
      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message={t('traceLink.alertInfo')} />
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setLinkOpen(true); }}>{t('traceLink.addLink')}</Button>
        <Text type="secondary" style={{ fontSize: 12 }}>{t('traceLink.count', { n: rows.length })}</Text>
      </Space>
      {rows.length === 0
        ? <Empty description={t('traceLink.empty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        : <Table<TraceLink & { dir: 'out' | 'in' }>
            rowKey={(r) => `${r.id}-${r.dir}`} size="small" dataSource={rows} pagination={false}
            columns={[
              { title: t('traceLink.colDir'), width: 80, render: (_, r) => r.dir === 'out'
                ? <Tag icon={<ArrowRightOutlined />} color="blue">{t('traceLink.out')}</Tag>
                : <Tag icon={<ArrowLeftOutlined />} color="green">{t('traceLink.in')}</Tag> },
              { title: t('traceLink.colOther'), render: (_, r) => {
                const other = r.dir === 'out'
                  ? nameOf.get(`${r.toType}:${r.toId}`)
                  : nameOf.get(`${r.fromType}:${r.fromId}`);
                const meta = ENTITY_META[r.dir === 'out' ? r.toType : r.fromType];
                return <Space><Tag color={meta.color} icon={meta.icon}>{t(meta.labelKey)}</Tag><Text>{other || '—'}</Text></Space>;
              } },
              { title: t('traceLink.colRel'), dataIndex: 'relType', width: 100, render: (rel: string) => <Tag color="gold">{rel}</Tag> },
              { title: t('traceLink.colByTime'), width: 150, render: (_, r) => <Text type="secondary" style={{ fontSize: 12 }}>{r.createdBy}<br />{dayjs(r.createdAt).format('MM-DD HH:mm')}</Text> },
              { title: '', width: 60, render: (_, r) => (
                <Popconfirm title={t('traceLink.removeConfirm')} onConfirm={() => removeLink(r)}>
                  <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              )},
            ]}
          />}

      <Modal open={linkOpen} onCancel={() => setLinkOpen(false)} onOk={createLink} okText={t('traceLink.createOk')} title={t('traceLink.addTitle')} width={480} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item label={t('traceLink.currentItem')}>
            <Input value={t('traceLink.currentFmt', { label: entityLabel, type: t(ENTITY_META[entityType].labelKey) })} disabled />
          </Form.Item>
          <Form.Item name="toType" label={t('traceLink.targetType')} rules={[{ required: true }]}>
            <Select options={Object.entries(ENTITY_META).map(([v, m]) => ({ value: v, label: `${t(m.labelKey)} ${m.icon ? ' ' : ''}` }))}
              optionRender={(o) => <Space>{ENTITY_META[o.value as LinkEntityType].icon}{o.label}</Space>}
              onChange={() => form.setFieldsValue({ toEntity: undefined, relType: undefined })} />
          </Form.Item>
          <Form.Item name="toEntity" label={t('traceLink.targetItem')} rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" placeholder={t('traceLink.targetItemPh')}
              options={targetType ? targetOptions.filter((o) => o.value.startsWith(`${targetType}:`)) : []} />
          </Form.Item>
          <Form.Item name="relType" label={t('traceLink.relType')} rules={[{ required: true }]}>
            <Select showSearch options={REL_TYPES.map((rel) => ({ value: rel, label: rel }))}
              placeholder={t('traceLink.relTypePh')} />
          </Form.Item>
        </Form>
      </Modal>
    </Modal>
  );
}
