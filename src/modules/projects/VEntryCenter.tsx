import { useMemo, useState } from 'react';
import { Card, Tag, Space, Button, Modal, Form, Input, Select, message, Popconfirm, Typography, Progress, Tooltip, Empty, Segmented, Tree, Checkbox, Alert } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, LinkOutlined, HistoryOutlined, SafetyCertificateOutlined, NodeIndexOutlined, ExperimentOutlined, ApartmentOutlined, TableOutlined } from '@ant-design/icons';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { createRecord, updateRecord, deleteRecord } from '../../core/repo';
import { nextSeq } from '../../core/seq';
import { recordEntryVersion } from '../../core/history';
import { relatedReqIds, syncTcLinks } from '../../core/tcLinks';
import TraceLinkPanel from '../../components/TraceLinkPanel';
import EntryHistoryModal from '../trace/EntryHistoryModal';
import { useAuth } from '../../store/auth';
import { useTranslation } from 'react-i18next';
import { V_LAYERS, normalizeVLayer, CHILD_LAYER_MAP, vLayerLabel } from '../../core/aspice/processes';
import { templatesForLayer, genTestCasesForReq, verifyProcessFor } from '../../core/tcTemplates';
import type { ReqItem, TestCase } from '../../core/types';

const { Text } = Typography;

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  approved: { label: '已批准', color: 'green' },
  superseded: { label: '已废弃', color: 'purple' },
};

const TASK_STATUS_META: Record<string, { label: string; color: string }> = {
  todo: { label: '待办', color: 'default' },
  in_progress: { label: '进行中', color: 'blue' },
  done: { label: '已完成', color: 'green' },
};

// ============ V 模型条目中心：按层条目化创建 / 跟踪 / 跨层追溯 ============
// 系统需求 → 系统架构 → 软件需求 → 软件架构 → 详细设计 → 单元
// 每层条目自动编号（SYS-REQ-001 …），跨层可建追溯链接（细化/分解/实现/验证覆盖），形成完整 V 链。
export default function VEntryCenter({ projectId }: { projectId: number }) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  const actor = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };

  const items = useLiveQuery(() => db.req_items.where('projectId').equals(projectId).sortBy('id'), [projectId]) ?? [];
  const links = useLiveQuery(() => db.trace_links.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];

  const [open, setOpen] = useState(false);
  const [layer, setLayer] = useState<string>('user_req');
  const [editing, setEditing] = useState<ReqItem | null>(null);
  const [parentLayer, setParentLayer] = useState<string | null>(null);   // 添加子条目时的父层（限定合法子层）
  const [parentId, setParentId] = useState<number | null>(null);         // 添加子条目时的父节点 id
  const [form] = Form.useForm();
  const [linkPanel, setLinkPanel] = useState<{ id: number; label: string } | null>(null);
  const [histPanel, setHistPanel] = useState<{ id: number; label: string } | null>(null);
  // 视图模式：树 / 列表
  const [view, setView] = useState<'tree' | 'list'>('tree');
  // 生成测试用例：单条需求（tcGenTarget）或整层批量（tcGenLayer）
  const [tcGenTarget, setTcGenTarget] = useState<ReqItem | null>(null);
  const [tcGenLayer, setTcGenLayer] = useState<string | null>(null);
  const [tcTplSel, setTcTplSel] = useState<string[]>([]);
  const [tcGenerating, setTcGenerating] = useState(false);

  // ---- 验证活动（测试用例）----
  const tcs = useLiveQuery(() => db.test_cases.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const [tcOpen, setTcOpen] = useState(false);
  const [editingTc, setEditingTc] = useState<TestCase | null>(null);
  const [tcForm] = Form.useForm();

  const openCreateTc = () => {
    setEditingTc(null);
    tcForm.resetFields();
    tcForm.setFieldsValue({ result: 'not_run', status: 'draft', relatedReqIds: [] });
    setTcOpen(true);
  };

  const saveTc = async () => {
    const v = await tcForm.validateFields();
    const now = Date.now();
    const related = v.relatedReqIds ?? [];
    const body = { ...v };
    delete (body as Record<string, unknown>).relatedReqIds;
    let savedId: number;
    if (editingTc?.id) {
      await updateRecord<TestCase>('test_cases', editingTc.id, { ...body, updatedAt: now }, actor, t('ventry.auditEditTc', { id: editingTc.tcId }));
      savedId = editingTc.id;
      msg.success(t('ventry.saved'));
    } else {
      const tcId = await nextSeq(projectId, 'TC');
      await createRecord<TestCase>('test_cases', {
        ...body, tcId, projectId, docId: 0, status: 'draft', createdAt: now, updatedAt: now,
      }, actor, t('ventry.auditNewTc', { id: tcId, title: v.title.slice(0, 24) }));
      msg.success(t('ventry.created', { id: tcId }));
      const all = await db.test_cases.where('projectId').equals(projectId).toArray();
      savedId = all.find((t2) => t2.tcId === tcId)?.id ?? 0;
    }
    const r = await syncTcLinks(projectId, savedId, related, actor);
    if (r.added > 0) msg.success(t('ventry.tcLinked', { n: r.added }));
    setTcOpen(false);
  };

  const removeTc = async (tc: TestCase) => {
    await deleteRecord('test_cases', tc.id!, actor, t('ventry.auditDelTc', { id: tc.tcId }));
    for (const l of links.filter((x) => (x.fromType === 'tc' && x.fromId === tc.id) || (x.toType === 'tc' && x.toId === tc.id))) {
      await deleteRecord('trace_links', l.id!, actor, t('ventry.auditLinkGone', { id: tc.tcId }));
    }
    msg.success(t('ventry.deleted'));
  };

  const TC_RESULT_META: Record<string, { label: string; color: string }> = {
    not_run: { label: '未执行', color: 'default' },
    pass: { label: '通过', color: 'green' },
    fail: { label: '失败', color: 'red' },
    na: { label: '不适用', color: 'orange' },
  };

  const itStatusLabel = (s: string) => t('ventry.st.' + s);
  const taskLabel = (s: string) => t('ventry.task.' + s);
  const resultLabel = (s: string) => t('ventry.res.' + s);



  const byLayer = useMemo(() => {
    const map: Record<string, ReqItem[]> = {};
    for (const it of items) {
      const k = normalizeVLayer(it.reqType);
      (map[k] = map[k] || []).push(it);
    }
    return map;
  }, [items]);

  // 需求树：parentId 挂父，无父的按层分组置顶（层顺序 = V_LAYERS 顺序）
  interface TreeNode { key: string; it: ReqItem; children: TreeNode[] }
  const treeData = useMemo<TreeNode[]>(() => {
    const nodeMap = new Map<number, TreeNode>();
    for (const it of items) {
      nodeMap.set(it.id!, { key: String(it.id!), it, children: [] });
    }
    const roots: TreeNode[] = [];
    const layerOrder = (t?: string) => {
      const i = V_LAYERS.findIndex((l) => l.key === normalizeVLayer(t));
      return i < 0 ? 99 : i;
    };
    for (const it of items) {
      const node = nodeMap.get(it.id!)!;
      if (it.parentId && nodeMap.has(it.parentId)) {
        nodeMap.get(it.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    const sortNodes = (ns: TreeNode[]) => {
      ns.sort((a, b) => layerOrder(a.it.reqType) - layerOrder(b.it.reqType) || (a.it.id! - b.it.id!));
      for (const n of ns) sortNodes(n.children);
    };
    sortNodes(roots);
    return roots;
  }, [items]);

  // 生成测试用例（单条需求）
  const runGenForReq = async (req: ReqItem, tplIds: string[]) => {
    setTcGenerating(true);
    try {
      const { added, tcIds } = await genTestCasesForReq(projectId, req, tplIds, actor, user?.name || '');
      msg.success(t('ventry.tcGenReqDone', { id: req.reqId, n: added, ids: tcIds.join('、') }));
    } catch (e) {
      msg.error(t('ventry.tcGenFail', { err: e instanceof Error ? e.message : String(e) }));
    } finally {
      setTcGenerating(false);
      setTcGenTarget(null);
      setTcGenLayer(null);
    }
  };

  // 生成测试用例（整层批量）
  const runGenForLayer = async (layerKey: string, tplIds: string[]) => {
    const targets = items.filter((r) => normalizeVLayer(r.reqType) === layerKey && r.status !== 'superseded');
    if (!targets.length) { msg.warning(t('ventry.layerNoItems')); setTcGenLayer(null); return; }
    setTcGenerating(true);
    try {
      let total = 0; const allIds: string[] = [];
      for (const r of targets) {
        const res = await genTestCasesForReq(projectId, r, tplIds, actor, user?.name || '');
        total += res.added; allIds.push(...res.tcIds);
      }
      msg.success(t('ventry.tcGenLayerDone', { n: targets.length, layer: vLayerLabel(V_LAYERS.find((l) => l.key === layerKey), i18n.language), total }));
    } catch (e) {
      msg.error(t('ventry.tcGenFail', { err: e instanceof Error ? e.message : String(e) }));
    } finally {
      setTcGenerating(false);
      setTcGenTarget(null);
      setTcGenLayer(null);
    }
  };

  const openGenModal = (req: ReqItem) => {
    setTcGenTarget(req);
    setTcGenLayer(null);
    setTcTplSel(templatesForLayer(normalizeVLayer(req.reqType)).map((t) => t.id));
  };
  const openGenLayerModal = (layerKey: string) => {
    setTcGenLayer(layerKey);
    setTcGenTarget(null);
    setTcTplSel(templatesForLayer(layerKey).map((t) => t.id));
  };
  const genLayerKey = tcGenLayer ?? (tcGenTarget ? normalizeVLayer(tcGenTarget.reqType) : null);
  const genTpls = genLayerKey ? templatesForLayer(genLayerKey) : [];

  const linkCount = useMemo(() => {
    const map: Record<number, number> = {};
    for (const l of links) {
      if (l.fromType === 'req') map[l.fromId] = (map[l.fromId] || 0) + 1;
      if (l.toType === 'req') map[l.toId] = (map[l.toId] || 0) + 1;
    }
    return map;
  }, [links]);

  const totalItems = items.length;
  const totalLinks = links.length;

  const openCreate = (ly?: string, pid?: number, pLayer?: string) => {
    const base = ly ?? (pLayer ? CHILD_LAYER_MAP[pLayer]?.[0] : 'user_req') ?? 'user_req';
    setLayer(base);
    setParentId(pid ?? null);
    setParentLayer(pLayer ?? null);
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ priority: '中', status: 'draft', sourceReg: '—', taskStatus: 'todo' });
    setOpen(true);
  };

  const save = async () => {
    const v = await form.validateFields();
    const now = Date.now();
    if (editing?.id) {
      const nextV = (editing.version ?? 1) + 1;
      await updateRecord<ReqItem>('req_items', editing.id, { ...v, version: nextV, updatedAt: now }, actor, t('ventry.auditEditItem', { id: editing.reqId, v: nextV }));
      await recordEntryVersion('req', editing.id, { desc: editing.desc }, { desc: v.desc, version: nextV }, actor, t('ventry.historyNote'));
      msg.success(t('ventry.saved'));
    } else {
      const meta = V_LAYERS.find((l) => l.key === layer)!;
      const reqId = await nextSeq(projectId, meta.prefix);
      await createRecord<ReqItem>('req_items', {
        ...v, reqId, projectId, docId: 0, reqType: layer as ReqItem['reqType'],
        ...(parentId ? { parentId } : {}),
        status: 'draft', createdAt: now, updatedAt: now,
      }, actor, t('ventry.auditNewItem', { id: reqId, label: vLayerLabel(meta, i18n.language), desc: v.desc.slice(0, 30) }));
      msg.success(t('ventry.created', { id: reqId }));
    }
    setOpen(false);
  };

  const remove = async (r: ReqItem) => {
    await deleteRecord('req_items', r.id!, actor, t('ventry.auditDelItem', { id: r.reqId }));
    for (const l of links.filter((x) => (x.fromType === 'req' && x.fromId === r.id) || (x.toType === 'req' && x.toId === r.id))) {
      await deleteRecord('trace_links', l.id!, actor, t('ventry.auditLinkGone', { id: r.reqId }));
    }
    msg.success(t('ventry.deleted'));
  };

  const supersede = async (r: ReqItem) => {
    await updateRecord<ReqItem>('req_items', r.id!, { status: 'superseded', updatedAt: Date.now() }, actor, t('ventry.auditSupersede', { id: r.reqId }));
    msg.success(t('ventry.superseded', { id: r.reqId }));
  };

  const renderTreeTitle = (node: { it: ReqItem }) => {
    const it = node.it;
    const meta = V_LAYERS.find((l) => l.key === normalizeVLayer(it.reqType));
    const childLayers = CHILD_LAYER_MAP[normalizeVLayer(it.reqType)] || [];
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, color: meta?.color }}>{it.reqId}</span>
        <span style={{ maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle' }}>{it.desc}</span>
        {it.reqType === 'task' && it.taskStatus && <Tag style={{ fontSize: 10 }} color={TASK_STATUS_META[it.taskStatus]?.color}>{TASK_STATUS_META[it.taskStatus] ? taskLabel(it.taskStatus) : ''}</Tag>}
        {it.assignee && <Tag style={{ fontSize: 10 }} color="geekblue">{it.assignee}</Tag>}
        {it.status === 'superseded' && <Tag style={{ fontSize: 10 }} color="purple">{t('ventry.st.superseded')}</Tag>}
        <span style={{ marginLeft: 4 }}>
          {childLayers.length > 0 && <Button size="small" type="link" icon={<PlusOutlined />} onClick={(e) => { e.stopPropagation(); openCreate(undefined, it.id!, normalizeVLayer(it.reqType)); }}>{t('ventry.decompBtn')}</Button>}
          <Button size="small" type="link" icon={<ExperimentOutlined />} style={{ color: '#2f9e44' }} onClick={(e) => { e.stopPropagation(); openGenModal(it); }}>{t('ventry.tcBtn')}</Button>
          <Button size="small" type="link" icon={<LinkOutlined />} onClick={(e) => { e.stopPropagation(); setLinkPanel({ id: it.id!, label: it.reqId }); }}>{t('ventry.linkBtn')}</Button>
          <Button size="small" type="link" icon={<HistoryOutlined />} onClick={(e) => { e.stopPropagation(); setHistPanel({ id: it.id!, label: it.reqId }); }}>{t('ventry.historyBtn')}</Button>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); setEditing(it); setLayer(normalizeVLayer(it.reqType)); setParentId(null); setParentLayer(null); form.setFieldsValue(it); setOpen(true); }} />
          {it.status !== 'superseded' && (
            <Popconfirm title={t('ventry.supersedeConfirm', { id: it.reqId })} onConfirm={() => supersede(it)}>
              <Button size="small" type="link" icon={<SafetyCertificateOutlined />} style={{ color: '#8c6d1f' }} onClick={(e) => e.stopPropagation()} />
            </Popconfirm>
          )}
          <Popconfirm title={t('ventry.delItemConfirm')} onConfirm={() => remove(it)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
          </Popconfirm>
        </span>
      </span>
    );
  };

  const renderLayer = (meta: (typeof V_LAYERS)[number]) => {
    const list = byLayer[meta.key] || [];
    return (
      <div key={meta.key} style={{ border: '1px solid #e3eaf2', borderTop: `3px solid ${meta.color}`, borderRadius: 10, background: '#fff', padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <NodeIndexOutlined style={{ color: meta.color }} />
          <Text strong style={{ fontSize: 15, color: '#0b2545' }}>{vLayerLabel(meta, i18n.language)}</Text>
          <Tag color="geekblue" style={{ fontSize: 11 }}>{meta.process} {(i18n.language || '').toLowerCase().startsWith('en') ? (meta.processNameEn || meta.processName) : meta.processName}</Tag>
          <Tag style={{ fontSize: 11 }}>{t('ventry.autoSeq', { prefix: meta.prefix })}</Tag>
          <span style={{ flex: 1 }} />
          <Button size="small" icon={<ExperimentOutlined />} style={{ color: '#2f9e44' }} onClick={() => openGenLayerModal(meta.key)}>{t('ventry.batchGen')}</Button>
          <Button size="small" type="primary" ghost icon={<PlusOutlined />} onClick={() => openCreate(meta.key)}>{t('ventry.newInLayer', { label: vLayerLabel(meta, i18n.language) })}</Button>
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>{meta.desc}</Text>
        {list.length === 0 ? (
          <Empty description={t('ventry.noLayerItems', { label: vLayerLabel(meta, i18n.language) })} image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '12px 0' }} />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f7fafc' }}>
                {[t('ventry.hId'), t('ventry.hDesc'), t('ventry.hPriority'), t('ventry.hSource'), t('ventry.hTraceChain'), t('ventry.hStatus'), t('ventry.hActions')].map((h) => (
                  <th key={h} style={{ border: '1px solid #e6edf4', padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#0b2545' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} style={{ background: r.status === 'superseded' ? '#fafafa' : '#fff' }}>
                  <td style={{ border: '1px solid #e6edf4', padding: '6px 10px', fontWeight: 600, color: meta.color, whiteSpace: 'nowrap' }}>{r.reqId}</td>
                  <td style={{ border: '1px solid #e6edf4', padding: '6px 10px' }}>
                    <Tooltip title={r.desc}><span>{r.desc.length > 60 ? r.desc.slice(0, 60) + '…' : r.desc}</span></Tooltip>
                    {r.version && r.version > 1 && <Tag style={{ fontSize: 10, marginLeft: 6 }}>v{r.version}</Tag>}
                    {r.parentId && <Tag style={{ fontSize: 10, marginLeft: 4 }} color="cyan">{t('ventry.childTag')}</Tag>}
                    {r.reqType === 'task' && r.taskStatus && <Tag style={{ fontSize: 10, marginLeft: 4 }} color={TASK_STATUS_META[r.taskStatus]?.color}>{TASK_STATUS_META[r.taskStatus] ? taskLabel(r.taskStatus) : ''}</Tag>}
                  </td>
                  <td style={{ border: '1px solid #e6edf4', padding: '6px 10px' }}>{r.priority === '高' ? <Tag color="red">高</Tag> : r.priority === '中' ? <Tag color="orange">中</Tag> : <Tag>低</Tag>}</td>
                  <td style={{ border: '1px solid #e6edf4', padding: '6px 10px', color: '#666', fontSize: 12 }}>{r.sourceReg || '—'}</td>
                  <td style={{ border: '1px solid #e6edf4', padding: '6px 10px' }}>
                    {(linkCount[r.id!] || 0) > 0 ? <Tag color="green">{t('ventry.linksCount', { n: linkCount[r.id!] })}</Tag> : <Tag color="red">{t('ventry.linkNone')}</Tag>}
                  </td>
                  <td style={{ border: '1px solid #e6edf4', padding: '6px 10px' }}>
                    <Tag color={STATUS_META[r.status].color}>{itStatusLabel(r.status)}</Tag>
                  </td>
                  <td style={{ border: '1px solid #e6edf4', padding: '6px 10px', whiteSpace: 'nowrap' }}>
                    <Space size={0}>
                      <Button size="small" type="link" icon={<LinkOutlined />} onClick={() => setLinkPanel({ id: r.id!, label: r.reqId })}>{t('ventry.linkBtn')}</Button>
                      <Button size="small" type="link" icon={<HistoryOutlined />} onClick={() => setHistPanel({ id: r.id!, label: r.reqId })}>{t('ventry.historyBtn')}</Button>
                      <Button size="small" type="link" icon={<ExperimentOutlined />} style={{ color: '#2f9e44' }} onClick={() => openGenModal(r)}>{t('ventry.genTc')}</Button>
                      <Button size="small" type="link" icon={<EditOutlined />} onClick={() => { setEditing(r); setLayer(normalizeVLayer(r.reqType)); setParentId(null); setParentLayer(null); form.setFieldsValue(r); setOpen(true); }} />
                      {r.status !== 'superseded' && (
                        <Popconfirm title={t('ventry.supersedeConfirm', { id: r.reqId })} onConfirm={() => supersede(r)}>
                          <Button size="small" type="link" icon={<SafetyCertificateOutlined />} style={{ color: '#8c6d1f' }} />
                        </Popconfirm>
                      )}
                      <Popconfirm title={t('ventry.delItemConfirm')} onConfirm={() => remove(r)}>
                        <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  return (
    <div>
      {msgCtx}
      {/* 统计 */}
      <Card size="small" style={{ marginBottom: 14 }}>
        <Space size={28} wrap>
          <div><Text type="secondary">{t('ventry.statItems')}</Text><div><Text strong style={{ fontSize: 20 }}>{totalItems}</Text></div></div>
          <div><Text type="secondary">{t('ventry.statLinks')}</Text><div><Text strong style={{ fontSize: 20, color: '#1b6ca8' }}>{totalLinks}</Text></div></div>
          {V_LAYERS.map((l) => {
            const n = (byLayer[l.key] || []).length;
            return (
              <div key={l.key}>
                <Text type="secondary" style={{ fontSize: 12 }}>{vLayerLabel(l, i18n.language)}</Text>
                <div><Tag color={n > 0 ? 'blue' : 'default'} style={{ fontSize: 13 }}>{n}</Tag></div>
              </div>
            );
          })}
        </Space>
        <div style={{ marginTop: 8, fontSize: 12.5, color: '#8c8c8c' }}>
          <Progress percent={totalItems ? Math.round((totalLinks / Math.max(totalItems * 1.5, 1)) * 100) : 0} size="small" format={() => t('ventry.chainHealth')} />
        </div>
      </Card>

      {/* 视图切换 */}
      <Space style={{ marginBottom: 12 }} align="center">
        <Segmented
          value={view}
          onChange={(v) => setView(v as 'tree' | 'list')}
          options={[
            { value: 'tree', label: (<Space size={4}><ApartmentOutlined />{t('ventry.viewTree')}</Space>) },
            { value: 'list', label: (<Space size={4}><TableOutlined />{t('ventry.viewList')}</Space>) },
          ]}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>{t('ventry.newTopItem')}</Button>
      </Space>

      {/* 需求树视图 */}
      {view === 'tree' && (
        <Card size="small" style={{ marginBottom: 14 }} title={<Space size={8}><ApartmentOutlined style={{ color: '#0b7285' }} /><Text strong style={{ fontSize: 15, color: '#0b2545' }}>{t('ventry.treeTitle')}</Text><Tag color="blue">{t('ventry.treeTag')}</Tag></Space>} extra={<Text type="secondary" style={{ fontSize: 12 }}>{t('ventry.treeHint')}</Text>}>
          {treeData.length === 0 ? (
            <Empty description={t('ventry.treeEmpty')} image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '16px 0' }} />
          ) : (
            <Tree
              defaultExpandAll
              showLine={{ showLeafIcon: false }}
              selectable={false}
              treeData={treeData as never}
              titleRender={renderTreeTitle as never}
            />
          )}
        </Card>
      )}

      {/* V 形层级说明 */}
      {view === 'list' && (
      <div style={{ textAlign: 'center', marginBottom: 14, fontSize: 12.5, color: '#66788c' }}>
        {t('ventry.vChainHead')}<b>用户需求(SYS.1)</b> →<Text type="secondary">{t('ventry.relDecomp')}</Text>→ <b>系统需求(SYS.2)</b> →<Text type="secondary">{t('ventry.relImpl')}</Text>→ <b>系统架构(SYS.3)</b> →<Text type="secondary">{t('ventry.relAlloc')}</Text>→ <b>软/硬件需求(SWE.1/HWE.1)</b> →<Text type="secondary">{t('ventry.relImpl')}</Text>→ <b>软件架构(SWE.2)</b> →<Text type="secondary">{t('ventry.relDetail')}</Text>→ <b>详细设计/任务(SWE.3)</b> →<Text type="secondary">{t('ventry.relCover')}</Text>→ <b>{t('ventry.tcWord')}</b>（SWE.4/5/6、SYS.4/5）
      </div>
      )}

      {/* 分层条目（列表视图） */}
      {view === 'list' && V_LAYERS.map(renderLayer)}


      {/* 验证活动（V 模型右侧：测试用例） */}
      <Card
        size="small"
        title={<Space size={8}><ExperimentOutlined style={{ color: '#2f9e44' }} /><Text strong style={{ fontSize: 15, color: '#0b2545' }}>{t('ventry.tcCardTitle')}</Text><Tag color="green">{t('ventry.tcRightTag')}</Tag></Space>}
        extra={<Button size="small" type="primary" ghost icon={<PlusOutlined />} onClick={openCreateTc}>{t('ventry.newTc')}</Button>}
        style={{ marginTop: 4 }}
      >
        {tcs.length === 0 ? (
          <Empty description={t('ventry.noTc')} image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '12px 0' }} />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4, fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f7fafc' }}>
                {[t('ventry.hId'), t('ventry.hTitle'), t('ventry.hExpected'), t('ventry.hResult'), t('ventry.hStatus'), t('ventry.hTrace'), t('ventry.hActions')].map((h) => (
                  <th key={h} style={{ border: '1px solid #e6edf4', padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#0b2545' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tcs.map((tc) => (
                <tr key={tc.id}>
                  <td style={{ border: '1px solid #e6edf4', padding: '6px 10px', fontWeight: 600, color: '#2f9e44', whiteSpace: 'nowrap' }}>{tc.tcId}</td>
                  <td style={{ border: '1px solid #e6edf4', padding: '6px 10px' }}>{tc.title}</td>
                  <td style={{ border: '1px solid #e6edf4', padding: '6px 10px', color: '#666', fontSize: 12 }}>{tc.expected || '—'}</td>
                  <td style={{ border: '1px solid #e6edf4', padding: '6px 10px' }}>
                    <Tag color={TC_RESULT_META[tc.result]?.color}>{TC_RESULT_META[tc.result] ? resultLabel(tc.result) : ''}</Tag>
                  </td>
                  <td style={{ border: '1px solid #e6edf4', padding: '6px 10px' }}>
                    <Tag color={STATUS_META[tc.status]?.color}>{STATUS_META[tc.status] ? itStatusLabel(tc.status) : ''}</Tag>
                  </td>
                  <td style={{ border: '1px solid #e6edf4', padding: '6px 10px' }}>
                    {(linkCount[tc.id!] || 0) > 0 ? <Tag color="green">{t('ventry.linksCount', { n: linkCount[tc.id!] })}</Tag> : <Tag color="red">{t('ventry.linkNone')}</Tag>}
                  </td>
                  <td style={{ border: '1px solid #e6edf4', padding: '6px 10px', whiteSpace: 'nowrap' }}>
                    <Space size={0}>
                      <Button size="small" type="link" icon={<LinkOutlined />} onClick={() => setLinkPanel({ id: tc.id!, label: tc.tcId })}>{t('ventry.linkBtn')}</Button>
                      <Button size="small" type="link" icon={<EditOutlined />} onClick={async () => { setEditingTc(tc); tcForm.setFieldsValue(tc); const ids = await relatedReqIds(projectId, tc.id!); tcForm.setFieldsValue({ relatedReqIds: ids }); setTcOpen(true); }} />
                      <Popconfirm title={t('ventry.delTcConfirm')} onConfirm={() => removeTc(tc)}>
                        <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>


      {/* 新建/编辑 Modal */}
      <Modal open={open} onCancel={() => setOpen(false)} onOk={save} title={editing ? t('ventry.editItemTitle', { id: editing.reqId }) : parentLayer ? t('ventry.newChildTitle', { parent: vLayerLabel(V_LAYERS.find((l) => l.key === parentLayer), i18n.language) || parentLayer }) : t('ventry.newTopItem')} width={600}>
        <Form form={form} layout="vertical">
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item label={t('ventry.layerLabel')} style={{ flex: 1 }}>
              <Select
                value={layer}
                disabled={!!editing}
                onChange={(v) => { setLayer(v); if (!editing) form.setFieldsValue({ sourceReg: '—' }); }}
                options={
                  editing
                    ? V_LAYERS.filter((l) => l.key === normalizeVLayer(editing.reqType))
                    : parentLayer
                      ? V_LAYERS.filter((l) => (CHILD_LAYER_MAP[parentLayer] || []).includes(l.key))
                      : V_LAYERS
                }
              />
            </Form.Item>
            <Form.Item name="priority" label={t('ventry.priorityLabel')} style={{ width: 110 }}>
              <Select options={['高', '中', '低'].map((p) => ({ value: p, label: p }))} />
            </Form.Item>
          </Space>
          <Form.Item name="sourceReg" label={t('ventry.sourceLabel')}>
            <Input placeholder={t('ventry.sourcePh')} />
          </Form.Item>
          <Form.Item name="desc" label={t('ventry.descLabel')} rules={[{ required: true, message: t('ventry.descRequired') }]}>
            <Input.TextArea rows={4} placeholder={t('ventry.descPh')} />
          </Form.Item>
          {layer === 'task' && (
            <Space size={16} style={{ display: 'flex' }}>
              <Form.Item name="taskStatus" label={t('ventry.taskStatusLabel')} style={{ width: 160 }}>
                <Select options={Object.entries(TASK_STATUS_META).map(([v]) => ({ value: v, label: taskLabel(v) }))} />
              </Form.Item>
              <Form.Item name="assignee" label={t('ventry.assigneeLabel')} style={{ flex: 1 }}>
                <Input placeholder={t('ventry.assigneePh')} />
              </Form.Item>
            </Space>
          )}
          {!parentLayer && !editing && (
            <Alert type="info" showIcon style={{ marginBottom: 8 }} message={t('ventry.newChildHint')} />
          )}
          {editing && (
            <Text type="secondary" style={{ fontSize: 12 }}>{t('ventry.editNote', { id: editing.reqId, old: editing.version ?? 1, next: (editing.version ?? 1) + 1 })}</Text>
          )}
        </Form>
      </Modal>


      {/* 验证活动新建/编辑 */}
      <Modal open={tcOpen} onCancel={() => setTcOpen(false)} onOk={saveTc} title={editingTc ? t('ventry.editTcTitle', { id: editingTc.tcId }) : t('ventry.newTcTitle')} width={600}>
        <Form form={tcForm} layout="vertical">
          <Form.Item name="title" label={t('ventry.tcTitleLabel')} rules={[{ required: true, message: t('ventry.tcTitleRequired') }]}>
            <Input placeholder={t('ventry.tcTitlePh')} />
          </Form.Item>
          <Form.Item name="steps" label={t('ventry.tcStepsLabel')}>
            <Input.TextArea rows={3} placeholder={t('ventry.tcStepsPh')} />
          </Form.Item>
          <Form.Item name="expected" label={t('ventry.tcExpectedLabel')}>
            <Input.TextArea rows={2} placeholder={t('ventry.tcExpectedPh')} />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="result" label={t('ventry.tcResultLabel')} style={{ width: 140 }}>
              <Select options={Object.entries(TC_RESULT_META).map(([v]) => ({ value: v, label: resultLabel(v) }))} />
            </Form.Item>
            <Form.Item name="evidence" label={t('ventry.tcEvidenceLabel')} style={{ flex: 1 }}>
              <Input placeholder={t('ventry.tcEvidencePh')} />
            </Form.Item>
          </Space>
          <Form.Item name="relatedReqIds" label={t('ventry.tcRelatedLabel')}>
            <Select
              mode="multiple" allowClear showSearch optionFilterProp="label"
              placeholder={t('ventry.tcRelatedPh')}
              options={items.filter((r) => r.status !== 'superseded').map((r) => ({
                value: r.id!, label: `${r.reqId} ${r.desc.slice(0, 40)}`,
              }))}
            />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('ventry.tcNote')}</Text>
        </Form>
      </Modal>

      {/* 生成测试用例 Modal（单条 / 整层批量） */}
      <Modal
        open={!!(tcGenTarget || tcGenLayer)}
        onCancel={() => { setTcGenTarget(null); setTcGenLayer(null); }}
        onOk={() => {
          if (!genLayerKey) return;
          if (tcGenTarget) runGenForReq(tcGenTarget, tcTplSel);
          else if (tcGenLayer) runGenForLayer(tcGenLayer, tcTplSel);
        }}
        confirmLoading={tcGenerating}
        title={tcGenTarget ? t('ventry.genForReqTitle', { id: tcGenTarget.reqId }) : tcGenLayer ? t('ventry.genForLayerTitle', { label: vLayerLabel(V_LAYERS.find((l) => l.key === tcGenLayer), i18n.language) || tcGenLayer }) : ''}
        width={680}
      >
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          message={t('ventry.genAlertTitle')}
          description={t('ventry.genAlertDesc', { from: tcGenTarget ? `${tcGenTarget.reqId}（${tcGenTarget.desc.slice(0, 40)}）` : t('ventry.allLayerItems'), proc: genLayerKey ? verifyProcessFor(genLayerKey) : '—' })}
        />
        <Checkbox.Group value={tcTplSel} onChange={(v) => setTcTplSel(v as string[])} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {genTpls.map((tpl) => (
            <Checkbox key={tpl.id} value={tpl.id} style={{ display: 'block' }}>
              <Tag color="green">{tpl.process}</Tag><Tag>{tpl.kind}</Tag> {tpl.title.replaceAll('{req}', tcGenTarget ? (tcGenTarget.desc.length > 24 ? tcGenTarget.desc.slice(0, 24) + '…' : tcGenTarget.desc) : t('ventry.layerReqs'))}
            </Checkbox>
          ))}
        </Checkbox.Group>
      </Modal>

      {/* 追溯面板 / 历史 */}
      {linkPanel && (
        <TraceLinkPanel
          projectId={projectId} entityType="req" entityId={linkPanel.id}
          entityLabel={linkPanel.label} open={!!linkPanel} onClose={() => setLinkPanel(null)}
        />
      )}
      {histPanel && (
        <EntryHistoryModal entityType="req" entityId={histPanel.id} entityLabel={histPanel.label}
          open={!!histPanel} onClose={() => setHistPanel(null)} />
      )}
    </div>
  );
}
