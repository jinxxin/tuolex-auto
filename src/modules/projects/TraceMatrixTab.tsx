import { useMemo, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Modal, Form, Input, Select, message,
  Popconfirm, Progress, Typography, Alert, Tooltip, Tabs, Empty,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, LinkOutlined,
  ExperimentOutlined, CheckCircleOutlined, MinusCircleOutlined,
  FileSearchOutlined, SafetyCertificateOutlined, ApartmentOutlined, HistoryOutlined, HeartOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { createRecord, updateRecord, deleteRecord } from '../../core/repo';
import { writeAudit } from '../../core/audit';
import { nextSeq } from '../../core/seq';
import { recordEntryVersion } from '../../core/history';
import TraceGraph from './TraceGraph';
import TraceHealth from './TraceHealth';
import TraceLinkPanel from '../../components/TraceLinkPanel';
import EntryHistoryModal from '../trace/EntryHistoryModal';
import { useAuth } from '../../store/auth';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { ReqItem, TestCase, TraceLink } from '../../core/types';

const { Text, Paragraph } = Typography;

// 展示用 labelKey 映射（由组件内 t() 解析成当前语言）
const RESULT_META: Record<TestCase['result'], { color: string; labelKey: string }> = {
  not_run: { color: 'default', labelKey: 'traceMatrix.resNotRun' },
  pass: { color: 'green', labelKey: 'traceMatrix.resPass' },
  fail: { color: 'red', labelKey: 'traceMatrix.resFail' },
  na: { color: 'orange', labelKey: 'traceMatrix.resNa' },
};

interface Props {
  projectId: number;
}

// ============ 追溯矩阵（条目级双向追溯 + 测试执行记录）============
export default function TraceMatrixTab({ projectId }: Props) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.toLowerCase().startsWith('en');
  const [msg, msgCtx] = message.useMessage();
  const actor = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };

  const reqItems = useLiveQuery(() => db.req_items.where('projectId').equals(projectId).sortBy('id'), [projectId]) ?? [];
  const testCases = useLiveQuery(() => db.test_cases.where('projectId').equals(projectId).sortBy('id'), [projectId]) ?? [];
  const links = useLiveQuery(() => db.trace_links.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const vdocs = useLiveQuery(() => db.vdocs.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];

  // ---- 表单状态 ----
  const [reqOpen, setReqOpen] = useState(false);
  const [reqEditing, setReqEditing] = useState<ReqItem | null>(null);
  const [reqForm] = Form.useForm();
  const [tcOpen, setTcOpen] = useState(false);
  const [tcEditing, setTestCase] = useState<TestCase | null>(null);
  const [tcForm] = Form.useForm();
  const [execOpen, setExecOpen] = useState(false);
  const [execTc, setExecTc] = useState<TestCase | null>(null);
  const [execForm] = Form.useForm();
  // 通用追溯面板：任意条目互链
  const [linkPanel, setLinkPanel] = useState<{ type: 'req' | 'tc'; id: number; label: string } | null>(null);
  // 条目版本历史
  const [histPanel, setHistPanel] = useState<{ type: 'req' | 'tc'; id: number; label: string } | null>(null);

  // ---- 统计 ----
  const stats = useMemo(() => {
    const activeReqs = reqItems.filter((r) => r.status !== 'superseded');
    const activeTcs = testCases.filter((t) => t.status !== 'superseded');
    const reqTcLinks = links.filter((l) => l.fromType === 'req' && l.toType === 'tc');
    const linkedReq = new Set(reqTcLinks.map((l) => l.fromId as number));
    const linkedTc = new Set(reqTcLinks.map((l) => l.toId as number));
    const coverage = activeReqs.length ? Math.round((activeReqs.filter((r) => linkedReq.has(r.id!)).length / activeReqs.length) * 100) : 0;
    const executed = activeTcs.filter((t) => t.result !== 'not_run');
    const execRate = activeTcs.length ? Math.round((executed.length / activeTcs.length) * 100) : 0;
    const passRate = executed.length ? Math.round((executed.filter((t) => t.result === 'pass').length / executed.length) * 100) : 0;
    const orphanReqs = activeReqs.filter((r) => !linkedReq.has(r.id!));
    const orphanTcs = activeTcs.filter((t) => !linkedTc.has(t.id!));
    return { linkedReq, linkedTc, coverage, execRate, passRate, orphanReqs, orphanTcs };
  }, [reqItems, testCases, links]);

  const linkSet = useMemo(() => new Set(
    links.filter((l) => l.fromType === 'req' && l.toType === 'tc').map((l) => `${l.fromId}:${l.toId}`),
  ), [links]);

  const ursDoc = vdocs.find((d) => (d.docType === 'SysRS' || d.docType === 'SwRS') && d.status !== 'superseded');
  const oqDoc = vdocs.find((d) => (d.docType === 'IT' || d.docType === 'QT' || d.docType === 'SysTest') && d.status !== 'superseded');

  // ---- 需求条目 CRUD（编号自动自增、不可修改、删除/废弃不复用）----
  const saveReq = async () => {
    const v = await reqForm.validateFields();
    const now = Date.now();
    if (reqEditing?.id) {
      const nextV = (reqEditing.version ?? 1) + 1;
      await updateRecord<ReqItem>('req_items', reqEditing.id, { ...v, version: nextV, updatedAt: now }, actor, t('traceMatrix.auditEditReq', { id: reqEditing.reqId, v: nextV }));
      await recordEntryVersion('req', reqEditing.id, { desc: reqEditing.desc }, { desc: v.desc, version: nextV }, actor, t('traceMatrix.uiEdit'));
      msg.success(t('traceMatrix.saved'));
    } else {
      const reqId = await nextSeq(projectId, 'REQ');
      await createRecord<ReqItem>('req_items', {
        ...v, reqId, projectId, docId: v.docId ?? ursDoc?.id ?? 0, reqType: 'sys_req', status: 'draft', createdAt: now, updatedAt: now,
      }, actor, t('traceMatrix.auditNewReq', { id: reqId, desc: v.desc.slice(0, 30) }));
      msg.success(t('traceMatrix.addedId', { id: reqId }));
    }
    setReqOpen(false);
  };

  const removeReq = async (r: ReqItem) => {
    // 同时清除相关追溯链接
    await deleteRecord('req_items', r.id!, actor, t('traceMatrix.auditDelReq', { id: r.reqId }));
    for (const l of links.filter((x) => (x.fromType === 'req' && x.fromId === r.id) || (x.toType === 'req' && x.toId === r.id))) {
      await deleteRecord('trace_links', l.id!, actor, t('traceMatrix.auditLinkBroken', { id: r.reqId }));
    }
  };

  // 从 URS 文档提取需求条目（编号走计数器，不复用）
  const extractFromUrs = async () => {
    if (!ursDoc) { msg.warning(t('traceMatrix.noUrs')); return; }
    const content = ursDoc.content;
    const found: { num: string; desc: string }[] = [];
    const re1 = /^\s*[-*]\s+(\d+(?:\.\d+)*)\s+(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = re1.exec(content))) found.push({ num: m[1], desc: m[2].trim() });
    if (found.length === 0) { msg.warning(t('traceMatrix.parseFail')); return; }
    const now = Date.now();
    let added = 0;
    for (const f of found) {
      const reqId = await nextSeq(projectId, 'REQ');
      const desc = f.desc;
      const priority: ReqItem['priority'] = /安全|ASIL|验收|追溯|保留|性能/.test(desc) ? '高' : '中';
      const sourceReg = /Part\s*11/.test(desc) ? 'ISO 26262'
        : /Annex/.test(desc) ? 'EU GMP Annex 11'
        : /ISO 26262|功能安全/.test(desc) ? 'ISO 26262'
        : /ALCOA|数据完整性/.test(desc) ? '数据完整性要求'
        : '—';
      await createRecord<ReqItem>('req_items', {
        projectId, docId: ursDoc.id!, reqId, desc, priority, sourceReg, reqType: 'sys_req', status: 'draft', createdAt: now, updatedAt: now,
      }, actor, t('traceMatrix.auditExtract', { id: reqId, desc: desc.slice(0, 24) }));
      added++;
    }
    msg.success(t('traceMatrix.extractOk', { n: added }));
  };

  // ---- 测试用例 CRUD（编号规则同上）----
  const saveTc = async () => {
    const v = await tcForm.validateFields();
    const now = Date.now();
    if (tcEditing?.id) {
      const nextV = (tcEditing.version ?? 1) + 1;
      await updateRecord<TestCase>('test_cases', tcEditing.id, { ...v, version: nextV, updatedAt: now }, actor, t('traceMatrix.auditEditTc', { id: tcEditing.tcId, v: nextV }));
      await recordEntryVersion('tc', tcEditing.id, { steps: tcEditing.steps, expected: tcEditing.expected }, { steps: v.steps, expected: v.expected, version: nextV }, actor, t('traceMatrix.uiEdit'));
      msg.success(t('traceMatrix.saved'));
    } else {
      const tcId = await nextSeq(projectId, 'TC');
      await createRecord<TestCase>('test_cases', {
        ...v, tcId, projectId, docId: v.docId ?? oqDoc?.id ?? 0, result: 'not_run', status: 'draft', createdAt: now, updatedAt: now,
      }, actor, t('traceMatrix.auditNewTc', { id: tcId, title: v.title.slice(0, 24) }));
      msg.success(t('traceMatrix.addedId', { id: tcId }));
    }
    setTcOpen(false);
  };

  const removeTc = async (tc: TestCase) => {
    await deleteRecord('test_cases', tc.id!, actor, t('traceMatrix.auditDelTc', { id: tc.tcId }));
    for (const l of links.filter((x) => (x.fromType === 'tc' && x.fromId === tc.id) || (x.toType === 'tc' && x.toId === tc.id))) {
      await deleteRecord('trace_links', l.id!, actor, t('traceMatrix.auditLinkBroken', { id: tc.tcId }));
    }
  };

  // 执行测试（记录执行结果 → 双向追溯闭环）
  const runExec = async () => {
    if (!execTc) return;
    const v = await execForm.validateFields();
    const now = Date.now();
    await updateRecord<TestCase>('test_cases', execTc.id!, {
      result: v.result, evidence: v.evidence || '', executedBy: user?.name, executedAt: now, updatedAt: now,
    }, actor, t('traceMatrix.auditExec', { id: execTc.tcId, result: t(RESULT_META[v.result as TestCase['result']].labelKey) }) + (v.result === 'fail' ? t('traceMatrix.execFailSuffix') : ''));
    await writeAudit({ userId: user?.id ?? 0, username: user?.username ?? 'unknown', action: 'TEST', entityType: 'test_cases', entityId: execTc.id!, summary: t('traceMatrix.auditExecLog', { id: execTc.tcId, result: t(RESULT_META[v.result as TestCase['result']].labelKey), user: user?.name }), before: { result: execTc.result }, after: { result: v.result, evidence: v.evidence } });
    if (v.result === 'fail') msg.warning(t('traceMatrix.execFailWarn'));
    else msg.success(t('traceMatrix.execOk'));
    setExecOpen(false);
  };

  // 废弃（编号不复用，历史追溯保留）
  const supersedeReq = async (r: ReqItem) => {
    await updateRecord<ReqItem>('req_items', r.id!, { status: 'superseded', updatedAt: Date.now() }, actor, t('traceMatrix.auditSupReq', { id: r.reqId }));
    msg.success(t('traceMatrix.supOk', { id: r.reqId }));
  };
  const supersedeTc = async (tc: TestCase) => {
    await updateRecord<TestCase>('test_cases', tc.id!, { status: 'superseded', updatedAt: Date.now() }, actor, t('traceMatrix.auditSupTc', { id: tc.tcId }));
    msg.success(t('traceMatrix.supOk', { id: tc.tcId }));
  };

  // ---- 追溯链接（双向）----
  const toggleLink = async (req: ReqItem, tc: TestCase) => {
    const key = `${req.id}:${tc.id}`;
    if (linkSet.has(key)) {
      const l = links.find((x) => x.fromType === 'req' && x.toType === 'tc' && x.fromId === req.id! && x.toId === tc.id!);
      if (l) await deleteRecord('trace_links', l.id!, actor, t('traceMatrix.auditUnlink', { a: req.reqId, b: tc.tcId }));
      msg.success(t('traceMatrix.unlinked', { a: req.reqId, b: tc.tcId }));
    } else {
      await createRecord<TraceLink>('trace_links', {
        projectId, fromType: 'req', fromId: req.id!, toType: 'tc', toId: tc.id!,
        relType: '验证覆盖', createdAt: Date.now(), createdBy: user?.name || '',
      }, actor, t('traceMatrix.auditLink', { a: req.reqId, b: tc.tcId }));
      await writeAudit({ userId: user?.id ?? 0, username: user?.username ?? 'unknown', action: 'LINK', entityType: 'trace_links', entityId: 0, summary: t('traceMatrix.auditLinkLog', { a: req.reqId, adesc: req.desc.slice(0, 20), b: tc.tcId, bdesc: tc.title.slice(0, 20) }), before: null, after: { fromType: 'req', fromId: req.id, toType: 'tc', toId: tc.id } });
      msg.success(t('traceMatrix.linked', { a: req.reqId, b: tc.tcId }));
    }
  };

  // ---- 矩阵表格 ----
  const matrixCols = useMemo(() => {
    const base = [
      { title: t('traceMatrix.reqItemsLabel'), dataIndex: 'reqId', width: 90, fixed: 'left' as const, render: (v: string, r: ReqItem) => <a onClick={() => { setReqEditing(r); reqForm.setFieldsValue(r); setReqOpen(true); }}>{v}</a> },
      { title: t('traceMatrix.descLabel'), dataIndex: 'desc', width: 260, ellipsis: true,
        render: (v: string, r: ReqItem) => (
          <Tooltip title={<div style={{ maxWidth: 400 }}><Paragraph style={{ margin: 0 }}>{v}</Paragraph><Text type="secondary" style={{ fontSize: 11 }}>{t('traceMatrix.srcPrefix')}{r.sourceReg}</Text></div>}>
            <span>{v}</span>
          </Tooltip>
        ) },
      { title: t('traceMatrix.priorityLabel'), dataIndex: 'priority', width: 70, render: (p: string) => p === '高' ? <Tag color="red">{t('traceMatrix.priHigh')}</Tag> : p === '中' ? <Tag color="orange">{t('traceMatrix.priMid')}</Tag> : <Tag>{t('traceMatrix.priLow')}</Tag> },
    ];
    const tcCols = testCases.map((tc) => ({
      title: <Tooltip title={`${tc.title}\n${tc.steps.slice(0, 60)}…`}><span>{tc.tcId}</span></Tooltip>,
      width: 86, align: 'center' as const,
      render: (_: unknown, req: ReqItem) => {
        const linked = linkSet.has(`${req.id}:${tc.id}`);
        const icon = linked ? <CheckCircleOutlined style={{ color: '#2f9e44' }} /> : <MinusCircleOutlined style={{ color: '#d9d9d9' }} />;
        return (
          <Popconfirm
            title={linked ? t('traceMatrix.unlinkConfirm', { a: req.reqId, b: tc.tcId }) : t('traceMatrix.linkConfirm', { a: req.reqId, b: tc.tcId })}
            onConfirm={() => toggleLink(req, tc)} okText={t('common.confirm')} cancelText={t('common.cancel')}
          >
            <Tooltip title={linked ? t('traceMatrix.linkedHint', { title: tc.title }) : t('traceMatrix.clickLinkHint', { title: tc.title })}>
              <span style={{ cursor: 'pointer', fontSize: 16 }}>{icon}</span>
            </Tooltip>
          </Popconfirm>
        );
      },
    }));
    return [...base, ...tcCols];
  }, [testCases, linkSet, reqForm, t]);

  const reqCols = [
    { title: t('traceMatrix.colId'), dataIndex: 'reqId', width: 90 },
    { title: t('traceMatrix.descLabel'), dataIndex: 'desc', ellipsis: true },
    { title: t('traceMatrix.priorityLabel'), dataIndex: 'priority', width: 80, render: (p: string) => p === '高' ? <Tag color="red">{t('traceMatrix.priHigh')}</Tag> : p === '中' ? <Tag color="orange">{t('traceMatrix.priMid')}</Tag> : <Tag>{t('traceMatrix.priLow')}</Tag> },
    { title: t('traceMatrix.srcLabel'), dataIndex: 'sourceReg', width: 150, ellipsis: true },
    { title: t('traceMatrix.colCoverTests'), width: 100, render: (_: unknown, r: ReqItem) => {
      const n = links.filter((l) => (l.fromType === 'req' && l.fromId === r.id) || (l.toType === 'req' && l.toId === r.id)).length;
      return n > 0 ? <Tag color="green">{t('traceMatrix.reqLinkedCount', { n })}</Tag> : <Tag color="red">{t('traceMatrix.uncovered')}</Tag>;
    } },
    { title: t('traceMatrix.colStatus'), dataIndex: 'status', width: 80, render: (s: string) => s === 'approved' ? <Tag color="green">{t('traceMatrix.stApproved')}</Tag> : s === 'superseded' ? <Tag color="purple">{t('traceMatrix.stSuperseded')}</Tag> : <Tag>{t('traceMatrix.stDraft')}</Tag> },
    { title: t('common.actions'), width: 190, render: (_: unknown, r: ReqItem) => (
      <Space size={2}>
        <Button size="small" type="link" icon={<HistoryOutlined />} onClick={() => setHistPanel({ type: 'req', id: r.id!, label: r.reqId })}>{t('traceMatrix.histBtn')}</Button>
        <Button size="small" type="link" icon={<LinkOutlined />} onClick={() => setLinkPanel({ type: 'req', id: r.id!, label: r.reqId })}>{t('traceMatrix.linkBtn')}</Button>
        <Button size="small" type="link" icon={<EditOutlined />} onClick={() => { setReqEditing(r); reqForm.setFieldsValue(r); setReqOpen(true); }} />
        {r.status !== 'superseded' && (
          <Popconfirm title={t('traceMatrix.supTitle', { id: r.reqId })} onConfirm={() => supersedeReq(r)}>
            <Button size="small" type="link" icon={<SafetyCertificateOutlined />} style={{ color: '#8c6d1f' }}>{t('traceMatrix.supersedeBtn')}</Button>
          </Popconfirm>
        )}
        <Popconfirm title={t('traceMatrix.delReqTitle')} onConfirm={() => removeReq(r)}>
          <Button size="small" type="link" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    )},
  ];

  const tcColsFull = [
    { title: t('traceMatrix.colId'), dataIndex: 'tcId', width: 100 },
    { title: t('traceMatrix.colTcTitle'), dataIndex: 'title', ellipsis: true },
    { title: t('traceMatrix.colSteps'), dataIndex: 'steps', ellipsis: true },
    { title: t('traceMatrix.colExpected'), dataIndex: 'expected', ellipsis: true },
    { title: t('traceMatrix.colCoverReqs'), width: 110, render: (_: unknown, tc: TestCase) => {
      const n = links.filter((l) => (l.fromType === 'tc' && l.fromId === tc.id) || (l.toType === 'tc' && l.toId === tc.id)).length;
      return n > 0 ? <Tag color="green">{t('traceMatrix.tcLinkedCount', { n })}</Tag> : <Tag color="red">{t('traceMatrix.orphanTc')}</Tag>;
    } },
    { title: t('traceMatrix.colResult'), dataIndex: 'result', width: 90, render: (r: TestCase['result']) => <Tag color={RESULT_META[r].color}>{t(RESULT_META[r].labelKey)}</Tag> },
    { title: t('traceMatrix.colExecByTime'), width: 130, render: (_: unknown, tc: TestCase) => tc.executedAt
      ? <Text type="secondary" style={{ fontSize: 12 }}>{tc.executedBy}<br />{dayjs(tc.executedAt).format('MM-DD HH:mm')}</Text>
      : <Text type="secondary">—</Text> },
    { title: t('common.actions'), width: 230, render: (_: unknown, tc: TestCase) => (
      <Space size={2}>
        <Button size="small" type="link" icon={<HistoryOutlined />} onClick={() => setHistPanel({ type: 'tc', id: tc.id!, label: tc.tcId })}>{t('traceMatrix.histBtn')}</Button>
        <Button size="small" type="link" icon={<LinkOutlined />} onClick={() => setLinkPanel({ type: 'tc', id: tc.id!, label: tc.tcId })}>{t('traceMatrix.linkBtn')}</Button>
        <Button size="small" type="link" icon={<ExperimentOutlined />} onClick={() => { setExecTc(tc); execForm.setFieldsValue({ result: tc.result === 'not_run' ? 'pass' : tc.result, evidence: tc.evidence }); setExecOpen(true); }}>{t('traceMatrix.execBtn')}</Button>
        <Button size="small" type="link" icon={<EditOutlined />} onClick={() => { setTestCase(tc); tcForm.setFieldsValue(tc); setTcOpen(true); }} />
        {tc.status !== 'superseded' && (
          <Popconfirm title={t('traceMatrix.supTitle', { id: tc.tcId })} onConfirm={() => supersedeTc(tc)}>
            <Button size="small" type="link" icon={<SafetyCertificateOutlined />} style={{ color: '#8c6d1f' }}>{t('traceMatrix.supersedeBtn')}</Button>
          </Popconfirm>
        )}
        <Popconfirm title={t('traceMatrix.delTcTitle')} onConfirm={() => removeTc(tc)}>
          <Button size="small" type="link" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    )},
  ];

  return (
    <div>
      {msgCtx}
      {/* 统计面板 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space size={32} wrap>
          <div><Text type="secondary">{t('traceMatrix.reqItemsLabel')}</Text><div><Text strong style={{ fontSize: 20 }}>{reqItems.length}</Text></div></div>
          <div><Text type="secondary">{t('traceMatrix.tcItemsLabel')}</Text><div><Text strong style={{ fontSize: 20 }}>{testCases.length}</Text></div></div>
          <div><Text type="secondary">{t('traceMatrix.covLabel')}</Text><div><Progress type="circle" size={56} percent={stats.coverage} strokeColor={stats.coverage === 100 ? '#2f9e44' : stats.coverage >= 70 ? '#fa8c16' : '#cf1322'} /></div></div>
          <div><Text type="secondary">{t('traceMatrix.execLabel')}</Text><div><Progress type="circle" size={56} percent={stats.execRate} /></div></div>
          <div><Text type="secondary">{t('traceMatrix.passLabel')}</Text><div><Progress type="circle" size={56} percent={stats.passRate} strokeColor="#2f9e44" /></div></div>
          <div><Text type="secondary">{t('traceMatrix.orphanReqLabel')}</Text><div><Tag color={stats.orphanReqs.length ? 'red' : 'green'}>{t('traceMatrix.orphanCount', { n: stats.orphanReqs.length })}</Tag></div></div>
          <div><Text type="secondary">{t('traceMatrix.orphanTcLabel')}</Text><div><Tag color={stats.orphanTcs.length ? 'red' : 'green'}>{t('traceMatrix.orphanCount', { n: stats.orphanTcs.length })}</Tag></div></div>
        </Space>
      </Card>

      {(stats.orphanReqs.length > 0 || stats.orphanTcs.length > 0) && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message={[
            stats.orphanReqs.length > 0 ? t('traceMatrix.unrecReqs', { list: stats.orphanReqs.map((r) => r.reqId).join(isEn ? ', ' : '、') }) : '',
            stats.orphanTcs.length > 0 ? t('traceMatrix.orphanTcsMsg', { list: stats.orphanTcs.map((tc) => tc.tcId).join(isEn ? ', ' : '、') }) : '',
          ].filter(Boolean).join(isEn ? '; ' : '；')}
        />
      )}

      <Tabs
        items={[
          { key: 'req', label: t('traceMatrix.tabReq', { n: reqItems.length }), children: (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Space>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { setReqEditing(null); reqForm.resetFields(); setReqOpen(true); }}>{t('traceMatrix.addReqBtn')}</Button>
                <Button size="small" icon={<FileSearchOutlined />} onClick={extractFromUrs} disabled={!ursDoc}>{t('traceMatrix.extractBtn')}</Button>
                <Text type="secondary" style={{ fontSize: 12 }}>{t('traceMatrix.reqHint')}</Text>
              </Space>
              <Table<ReqItem> rowKey="id" size="small" dataSource={reqItems} columns={reqCols} pagination={false} />
            </Space>
          ) },
          { key: 'tc', label: t('traceMatrix.tabTc', { n: testCases.length }), children: (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Space>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { setTestCase(null); tcForm.resetFields(); setTcOpen(true); }}>{t('traceMatrix.addTcBtn')}</Button>
                <Text type="secondary" style={{ fontSize: 12 }}>{t('traceMatrix.tcHint')}</Text>
              </Space>
              <Table<TestCase> rowKey="id" size="small" dataSource={testCases} columns={tcColsFull} pagination={false} />
            </Space>
          ) },
          { key: 'matrix', label: t('traceMatrix.tabMatrix', { pct: stats.coverage }), children: (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Alert type="info" showIcon icon={<LinkOutlined />} style={{ marginBottom: 4 }}
                message={t('traceMatrix.matrixInfo')} />
              {reqItems.length === 0 || testCases.length === 0
                ? <Empty description={t('traceMatrix.matrixEmpty')} />
                : <Table rowKey="id" size="small" dataSource={reqItems} columns={matrixCols}
                    pagination={false} scroll={{ x: 260 + testCases.length * 86 }} />}
            </Space>
          ) },
          { key: 'graph', label: <Space size={4}><ApartmentOutlined />{t('traceMatrix.tabGraph')}</Space>, children: (
            <TraceGraph projectId={projectId} />
          ) },
          { key: 'health', label: <Space size={4}><HeartOutlined />{t('traceMatrix.tabHealth')}</Space>, children: (
            <TraceHealth projectId={projectId} />
          ) },
        ]}
      />

      {/* 需求条目表单 */}
      <Modal open={reqOpen} onCancel={() => setReqOpen(false)} onOk={saveReq} title={reqEditing ? t('traceMatrix.editReqTitle', { id: reqEditing.reqId }) : t('traceMatrix.newReqTitle')} width={560}>
        <Form form={reqForm} layout="vertical" initialValues={{ priority: '中', status: 'draft' }}>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="reqId" label={t('traceMatrix.colId')} style={{ width: 150 }}>
              <Input disabled placeholder={reqEditing ? undefined : t('traceMatrix.autoIdPh')} />
            </Form.Item>
            <Form.Item name="priority" label={t('traceMatrix.priorityLabel')} style={{ width: 120 }}>
              <Select options={[
                { value: '高', label: t('traceMatrix.priHigh') },
                { value: '中', label: t('traceMatrix.priMid') },
                { value: '低', label: t('traceMatrix.priLow') },
              ]} />
            </Form.Item>
            <Form.Item name="sourceReg" label={t('traceMatrix.srcLabel')} style={{ flex: 1 }}>
              <Input placeholder={t('traceMatrix.srcPh')} />
            </Form.Item>
          </Space>
          <Form.Item name="desc" label={t('traceMatrix.descLabel')} rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder={t('traceMatrix.reqDescPh')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 测试用例表单 */}
      <Modal open={tcOpen} onCancel={() => setTcOpen(false)} onOk={saveTc} title={tcEditing ? t('traceMatrix.editTcTitle', { id: tcEditing.tcId }) : t('traceMatrix.newTcTitle')} width={640}>
        <Form form={tcForm} layout="vertical">
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="tcId" label={t('traceMatrix.colId')} style={{ width: 160 }}>
              <Input disabled placeholder={tcEditing ? undefined : t('traceMatrix.autoIdPh')} />
            </Form.Item>
            <Form.Item name="title" label={t('traceMatrix.colTcTitle')} rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </Space>
          <Form.Item name="steps" label={t('traceMatrix.colSteps')} rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder={t('traceMatrix.stepsPh')} />
          </Form.Item>
          <Form.Item name="expected" label={t('traceMatrix.colExpected')} rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder={t('traceMatrix.expectedPh')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 条目版本历史 */}
      {histPanel && (
        <EntryHistoryModal entityType={histPanel.type} entityId={histPanel.id} entityLabel={histPanel.label}
          open={!!histPanel} onClose={() => setHistPanel(null)} />
      )}

      {/* 通用追溯面板 */}
      {linkPanel && (
        <TraceLinkPanel
          projectId={projectId} entityType={linkPanel.type} entityId={linkPanel.id}
          entityLabel={linkPanel.label} open={!!linkPanel} onClose={() => setLinkPanel(null)}
        />
      )}

      {/* 测试执行弹窗 */}
      <Modal open={execOpen} onCancel={() => setExecOpen(false)} onOk={runExec} okText={t('traceMatrix.submitExec')}
        title={execTc ? <Space><ExperimentOutlined />{t('traceMatrix.execTitle', { id: execTc.tcId })}</Space> : ''} width={560}>
        {execTc && (<>
          <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
            <Text strong>{execTc.title}</Text>
            <Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 0' }}>{t('traceMatrix.stepPrefix')}{execTc.steps}</Paragraph>
            <Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>{t('traceMatrix.expPrefix')}{execTc.expected}</Paragraph>
          </Card>
          <Form form={execForm} layout="vertical">
            <Form.Item name="result" label={t('traceMatrix.resultLabel')} rules={[{ required: true }]}>
              <Select options={[
                { value: 'pass', label: t('traceMatrix.passOpt') },
                { value: 'fail', label: t('traceMatrix.failOpt') },
                { value: 'na', label: t('traceMatrix.naOpt') },
              ]} />
            </Form.Item>
            <Form.Item name="evidence" label={t('traceMatrix.evidenceLabel')}>
              <Input.TextArea rows={3} placeholder={t('traceMatrix.evidencePh')} />
            </Form.Item>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('traceMatrix.execNote', { user: user?.name })}
            </Text>
          </Form>
        </>)}
      </Modal>
    </div>
  );
}
