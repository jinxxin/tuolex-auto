import { useEffect, useMemo, useState } from 'react';
import { fsPidFromUrl } from './projectLink';
import {
  Card, Tree, Tag, Button, Space, Typography, Modal, Form, Input, Select, message, Popconfirm,
  Alert, Statistic, Row, Col, Radio, Empty, Tooltip, Badge,
} from 'antd';
import {
  PlusOutlined, ImportOutlined, SafetyOutlined, PartitionOutlined, WarningOutlined, EditOutlined,
  DeleteOutlined, EyeOutlined, ApartmentOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { apiFetch, useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { nextSeq } from '../../core/seq';
import { asilRank, DECOMPOSITIONS, decomposeValid, asilNotation } from '../../core/fs/asil';
import { ASIL_TAG_TEXT, ASIL_COLOR, FS_KIND_META } from '../../core/fs/data';
import { CHILD_KINDS, buildChainTree, findGaps, sgDraftFromHazard, type ChainGap } from '../../core/fs/chain';
import { packById, sgTextFromPack } from '../../core/fs/fsPacks';
import FsReqDrawer from './FsReqDrawer';
import type { FsSafetyReq, FsReqKind, FsAsil } from '../../core/types';

const { Title, Text } = Typography;

const SEQ_PREFIX: Record<FsReqKind, string> = {
  SG: 'SG', FSC: 'FSC', TSC: 'TSC', HSI: 'HSI', SYSTEM_SR: 'SY-SR', HW_SR: 'HW-SR', SW_SR: 'SW-SR',
};
const KIND_KEY = (k: FsReqKind) => `chainPage.${k.toLowerCase()}`;
const GAP_KEY: Record<ChainGap['kind'], string> = {
  no_sg: 'chainPage.gapNoFsc', no_fsc: 'chainPage.gapNoFsc', no_tsc: 'chainPage.gapNoTsc', no_leaf: 'chainPage.gapNoLeaf',
  no_verify: 'chainPage.gapNoVerify', asil_raise: 'chainPage.gapRaise', exceed_decomp: 'chainPage.gapExceed', orphan: 'chainPage.gapOrphan',
};

export default function SafetyChainPage() {
  const { t } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  const [activePid, setActivePid] = useState<number | undefined>(undefined);
  const [editing, setEditing] = useState<FsSafetyReq | null>(null);
  const [parentFor, setParentFor] = useState<FsSafetyReq | null>(null);   // 新增下级
  const [viewing, setViewing] = useState<FsSafetyReq | null>(null);
  const [decompTarget, setDecompTarget] = useState<FsSafetyReq | null>(null);
  const [haraOpen, setHaraOpen] = useState(false);
  const [haraSel, setHaraSel] = useState<number[]>([]);
  const [withSkeleton, setWithSkeleton] = useState(true);
  const [genBusy, setGenBusy] = useState(false);
  const [gapOpen, setGapOpen] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [form] = Form.useForm();
  const [decompForm] = Form.useForm();

  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? [];
  const fsProjects = useMemo(() => projects.filter((p) => p.fsEnabled), [projects]);
  const allReqs = useLiveQuery(() => db.fs_safety_reqs.toArray(), []) ?? [];
  const hazards = useLiveQuery(() => db.fs_hazards.toArray(), []) ?? [];

  const pid = fsPidFromUrl(fsProjects.map((p) => p.id!), activePid);
  const reqs = useMemo(() => (pid != null ? allReqs.filter((r) => r.projectId === pid) : []), [allReqs, pid]);
  const projHazards = useMemo(() => (pid != null ? hazards.filter((h) => h.projectId === pid) : []), [hazards, pid]);
  const gaps = useMemo(() => findGaps(reqs), [reqs]);

  const byId = new Map(reqs.filter((r) => r.id != null).map((r) => [r.id!, r]));
  const gapKindOf = (id: number) => gaps.find((g) => g.node.id === id);

  // 树数据
  const treeData = useMemo(() => {
    const { roots } = buildChainTree(reqs);
    const walk = (list: ReturnType<typeof buildChainTree>['roots']): unknown[] =>
      list.map((n) => ({ key: n.req.id, req: n.req, children: n.children.length ? walk(n.children) : undefined }));
    return walk(roots);
  }, [reqs]);

  const countKind = (k: FsReqKind) => reqs.filter((r) => r.kind === k).length;
  useEffect(() => { setExpandedKeys(reqs.map((r) => r.id!)); }, [reqs.length]);

  // ---------- 保存（新建 SG / 新增下级 / 编辑） ----------
  const [modalOpen, setModalOpen] = useState(false);
  const openCreateSg = () => {
    setEditing(null); setParentFor(null);
    form.resetFields();
    form.setFieldsValue({ kind: 'SG', asil: 'D', asilInherited: true, safetyRelated: true });
    setModalOpen(true);
  };

  const openAddChild = (p: FsSafetyReq) => {
    setParentFor(p); setEditing(null);
    form.resetFields();
    const firstKind = CHILD_KINDS[p.kind][0];
    form.setFieldsValue({ kind: firstKind, asil: p.asil, asilInherited: true, safetyRelated: true });
    setModalOpen(true);
  };
  const openEdit = (r: FsSafetyReq) => {
    setEditing(r); setParentFor(null);
    form.setFieldsValue(r);
    setModalOpen(true);
  };

  // 编辑 Modal 表单 watch（提级告警预览）
  const kind = Form.useWatch('kind', form) as FsReqKind | undefined;
  const asilV = Form.useWatch('asil', form) as FsAsil | undefined;
  const inherit = Form.useWatch('asilInherited', form) as boolean | undefined;
  const parentAsil = parentFor?.asil ?? (editing ? (editing.parentId != null ? byId.get(editing.parentId)?.asil : undefined) : undefined);
  const raiseWarn = !inherit && parentAsil != null && asilV != null && asilRank(asilV) > asilRank(parentAsil);

  const save = async () => {
    const v = await form.validateFields();
    if (pid == null) return;
    const now = Date.now();
    const version = (editing?.version ?? 0) + 1;
    const asil = v.asilInherited && parentAsil != null ? parentAsil : v.asil;
    if (!v.asilInherited && parentAsil != null && asilRank(asil) > asilRank(parentAsil)) {
      const ok = window.confirm(t('chainPage.asilRaiseWarn', { child: asil, parent: parentAsil }));
      if (!ok) return;
    }
    if (editing?.id) {
      await db.fs_safety_reqs.update(editing.id, {
        title: v.title, text: v.text, kind: v.kind, asil, asilInherited: !!v.asilInherited,
        verificationMethod: v.verificationMethod, sourceRef: v.sourceRef, safetyRelated: v.safetyRelated !== false,
        status: v.status, version, updatedAt: now,
      }, t('chainPage.auditEdit', { code: editing.code, version }));
      msg.success(t('chainPage.auditEdit', { code: editing.code, version }));
    } else {
      const kind2 = (v.kind ?? (parentFor ? CHILD_KINDS[parentFor.kind][0] : 'SG')) as FsReqKind;
      const prefix = SEQ_PREFIX[kind2];
      const code = await nextSeq(pid, prefix);
      await db.fs_safety_reqs.add({
        projectId: pid, code, kind: kind2, title: v.title, text: v.text,
        parentId: parentFor?.id, asil, asilInherited: !!v.asilInherited,
        sourceRef: v.sourceRef || (parentFor ? parentFor.code : undefined),
        verificationMethod: v.verificationMethod, safetyRelated: v.safetyRelated !== false,
        status: 'draft', version: 1, createdAt: now, updatedAt: now,
      }, t('chainPage.auditNew', { code, kind: t(KIND_KEY(kind2)), asil }));
      msg.success(t('chainPage.auditNew', { code, kind: t(KIND_KEY(kind2)), asil }));
    }
    setModalOpen(false);
  };

  // ---------- 从 HARA 生成 SG（二期 M1：勾选完整骨架 → 先 LLM 生成 SG→FSC→TSC，不可用则降级既有 SG 行为） ----------
  const haraCandidates = projHazards.filter((h) => h.status === 'confirmed' && (h.sgId == null || !byId.has(h.sgId)));

  /** 单条危害 → LLM 需求链文案；失败返回 null（调用方降级本地模板） */
  const chainTextsByAi = async (h: (typeof projHazards)[number]) => {
    try {
      const res = await apiFetch('/ai/fs/skeleton', {
        method: 'POST',
        body: JSON.stringify({ hazardTitle: h.title, hazardDesc: h.vehicleLevelHazard || h.situation }),
      });
      const d = await res.json();
      if (d?.source === 'llm' && d.sg && d.fsc && d.tsc) return { sg: String(d.sg), fsc: String(d.fsc), tsc: String(d.tsc) };
    } catch { /* 网络/超时：降级 */ }
    return null;
  };

  const genSg = async () => {
    if (pid == null || haraSel.length === 0 || genBusy) return;
    const picked = haraCandidates.filter((h) => h.id != null && haraSel.includes(h.id!));
    setGenBusy(true);
    const now = Date.now();
    const sgCodes: string[] = [];
    let aiUsed = 0;
    for (const h of picked) {
      const ai = withSkeleton ? await chainTextsByAi(h) : null;
      const asil = h.asil as FsAsil;
      const code = await nextSeq(pid, 'SG');
      let d: { title: string; text: string; asil: FsAsil };
      if (ai) d = { title: `SG：${h.title}`, text: ai.sg, asil };
      else {
        const pk = sgTextFromPack(packById(h.srcPack), h);
        d = pk ? { ...pk, asil } : sgDraftFromHazard(h.title, h.vehicleLevelHazard || h.situation, asil);
      }
      const id = await db.fs_safety_reqs.add({
        projectId: pid, code, kind: 'SG', title: d.title, text: d.text, asil: d.asil,
        asilInherited: false, sourceRef: h.hazId, safetyRelated: true,
        status: 'draft', version: 1, createdAt: now, updatedAt: now,
      }, t('chainPage.auditSgGen', { haz: h.hazId, code, asil: d.asil }) + (ai ? t('chainPage.aiSuffix') : ''));
      await db.fs_hazards.update(h.id!, { sgId: id, updatedAt: now }, t('chainPage.auditSgGen', { haz: h.hazId, code, asil: d.asil }));
      sgCodes.push(code);
      // AI 完整骨架：SG → FSC → TSC（ASIL 继承；sourceRef 链式）
      if (ai) {
        const fscCode = await nextSeq(pid, 'FSC');
        const fscId = await db.fs_safety_reqs.add({
          projectId: pid, code: fscCode, kind: 'FSC', title: `FSC：${h.title}`, text: ai.fsc,
          parentId: id, asil, asilInherited: true, sourceRef: code, safetyRelated: true,
          status: 'draft', version: 1, createdAt: now, updatedAt: now,
        }, t('chainPage.auditNew', { code: fscCode, kind: t('chainPage.fsc'), asil }));
        const tscCode = await nextSeq(pid, 'TSC');
        await db.fs_safety_reqs.add({
          projectId: pid, code: tscCode, kind: 'TSC', title: `TSC：${h.title}`, text: ai.tsc,
          parentId: fscId, asil, asilInherited: true, sourceRef: fscCode, safetyRelated: true,
          status: 'draft', version: 1, createdAt: now, updatedAt: now,
        }, t('chainPage.auditNew', { code: tscCode, kind: t('chainPage.tsc'), asil }));
        aiUsed++;
      }
    }
    msg.success(t('chainPage.genDone', { n: sgCodes.length, codes: sgCodes.join(', ') }));
    if (aiUsed) msg.info(t('chainPage.llmChainTtl'));
    setGenBusy(false);
    setHaraOpen(false); setHaraSel([]);
  };

  // ---------- ASIL 分解向导 ----------
  const [decompIdx, setDecompIdx] = useState(0);
  const openDecompose = (r: FsSafetyReq) => {
    setDecompTarget(r); setDecompIdx(0);
    decompForm.resetFields();
    decompForm.setFieldsValue({ independence: '' });
  };
  const decompCombos = decompTarget ? DECOMPOSITIONS[decompTarget.asil as Exclude<FsAsil, 'QM'>] : [];
  const combo = decompCombos[decompIdx];
  const doDecompose = async () => {
    const target = decompTarget;
    if (!target || target.asil === 'QM' || !combo) return;
    const vals = await decompForm.validateFields();
    if (!vals.independence) { msg.warning('请填写独立性声明'); return; }
    const base = target.asil as Exclude<FsAsil, 'QM'>;
    if (!decomposeValid(base, combo.map((p) => p.asil))) { msg.error(t('chainPage.decompInvalid')); return; }
    const kindPool = CHILD_KINDS[target.kind].filter((k) => k !== 'HSI');
    const now = Date.now();
    const codes: string[] = [];
    for (let i = 0; i < combo.length; i++) {
      const p = combo[i];
      const childKind = (vals[`kind_${i}`] as FsReqKind) || kindPool[i % Math.max(kindPool.length, 1)] || 'SW_SR';
      const note = vals[`note_${i}`] || `通道 ${i + 1}`;
      const code = await nextSeq(pid!, SEQ_PREFIX[childKind]);
      await db.fs_safety_reqs.add({
        projectId: pid!, code, kind: childKind, title: `${target.title}（${asilNotation(p.asil, base)}）`,
        text: `冗余路径 ${i + 1}：${note}。本路径按 ${asilNotation(p.asil, base)} 独立满足「${target.text}」。`,
        parentId: target.id, asil: p.asil, asilFrom: base, asilInherited: true,
        sourceRef: target.code, verificationMethod: '', safetyRelated: true,
        status: 'draft', version: 1, createdAt: now, updatedAt: now,
      }, t('chainPage.auditDecomp', { code: target.code, base, parts: asilNotation(p.asil, base) }));
      codes.push(`${code}(${asilNotation(p.asil, base)})`);
    }
    // 父记录分解信息 + 独立性声明（存 title 尾注？正式字段待 M4；记 audit summary 中）
    await db.fs_safety_reqs.update(target.id!, {
      asilDecomposed: { base, parts: combo.map((p) => ({ asil: p.asil, note: '' })) },
      updatedAt: now,
    }, t('chainPage.auditDecomp', { code: target.code, base, parts: codes.join('+') }) + ' · 独立性声明已记录');
    msg.success(t('chainPage.decompDone', { code: target.code, n: combo.length }));
    setDecompTarget(null);
  };

  const voidReq = async (r: FsSafetyReq) => {
    await db.fs_safety_reqs.update(r.id!, { status: 'superseded', version: (r.version ?? 1) + 1, updatedAt: Date.now() }, t('chainPage.auditVoid', { code: r.code }));
    msg.success(t('chainPage.auditVoid', { code: r.code }));
  };
  const delReq = async (r: FsSafetyReq) => {
    await db.fs_safety_reqs.delete(r.id!, t('chainPage.auditDel', { code: r.code }));
  };

  const gapText = (g: ChainGap) => {
    const base = t(GAP_KEY[g.kind]);
    return g.node ? `${base} · ${g.node.code}（${ASIL_TAG_TEXT[g.node.asil]}）` : base;
  };

  // 空态：无项目 / 无数据
  const noFs = fsProjects.length === 0;
  return (
    <Card>
      {msgCtx}
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Space align="center">
              <ApartmentOutlined style={{ fontSize: 20, color: '#1b6ca8' }} />
              <Title level={4} style={{ margin: 0 }}>{t('chainPage.title')}</Title>
              <Tag color="purple">ISO 26262:2018</Tag>
            </Space>
            <div><Text type="secondary">{t('chainPage.sub')}</Text></div>
          </Col>
          <Col>
            {!noFs ? (
              <Select style={{ width: 260 }} value={pid} onChange={(v) => setActivePid(v)}
                options={fsProjects.map((p) => ({ value: p.id!, label: p.name }))} />
            ) : <Alert type="warning" showIcon message={t('fs.noProject')} />}
          </Col>
        </Row>

        {!noFs && pid != null && (
          <>
            <Row gutter={12}>
              <Col span={5}><Card size="small"><Statistic title={t('chainPage.statSg')} value={countKind('SG')} valueStyle={{ fontSize: 20 }} /></Card></Col>
              <Col span={5}><Card size="small"><Statistic title={t('chainPage.statFsc')} value={countKind('FSC')} valueStyle={{ fontSize: 20 }} /></Card></Col>
              <Col span={5}><Card size="small"><Statistic title={t('chainPage.statTsc')} value={countKind('TSC')} valueStyle={{ fontSize: 20 }} /></Card></Col>
              <Col span={5}><Card size="small"><Statistic title={t('chainPage.statLeaf')} value={countKind('HW_SR') + countKind('SW_SR') + countKind('SYSTEM_SR') + countKind('HSI')} valueStyle={{ fontSize: 20 }} /></Card></Col>
              <Col span={4}>
                <Card size="small" onClick={() => gaps.length && setGapOpen(true)} style={{ cursor: gaps.length ? 'pointer' : 'default' }}>
                  <Statistic
                    title={t('chainPage.gaps')}
                    value={gaps.length}
                    valueStyle={{ fontSize: 20, color: gaps.length ? '#cf1322' : '#52c41a' }}
                    prefix={gaps.length ? <WarningOutlined /> : '✓'}
                  />
                </Card>
              </Col>
            </Row>

            <Space wrap>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateSg}>{t('chainPage.newSg')}</Button>
              <Button icon={<ImportOutlined />} onClick={() => { setHaraSel([]); setHaraOpen(true); }}>{t('chainPage.fromHara')}</Button>
              {haraCandidates.length > 0 && <Text type="secondary">{t('chainPage.sgFromHaraDesc')}（{haraCandidates.length}）</Text>}
            </Space>

            {reqs.length === 0 ? (
              <Empty description={t('chainPage.empty')} style={{ padding: '40px 0' }} />
            ) : (
              <Tree
                showLine={{ showLeafIcon: false }} blockNode
                expandedKeys={expandedKeys}
                onExpand={(keys) => setExpandedKeys(keys as React.Key[])}
                treeData={treeData as never[]}
                titleRender={(n: never) => {
                  const node = n as { key: number; req?: FsSafetyReq };
                  // 健壮性：优先用随树节点携带的 req；退回按 id 查；都取不到则跳过该节点（防白屏）
                  const r = node.req ?? byId.get(node.key);
                  if (!r) return null;
                  const g = gapKindOf(node.key);
                  return (
                    <Space size={6} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setViewing(r); }}>
                      {g && <Tooltip title={gapText(g)}><Badge status="error" /></Tooltip>}
                      <Tag color={FS_KIND_META[r.kind].color} style={{ marginRight: 0, minWidth: 58, textAlign: 'center', fontSize: 11 }}>{t(KIND_KEY(r.kind))}</Tag>
                      <Text code style={{ fontSize: 12 }}>{r.code}</Text>
                      <Text style={{ fontSize: 13 }}>{r.title || r.text.slice(0, 30)}</Text>
                      <Tag style={{ marginRight: 0 }} color={ASIL_COLOR[r.asil]}>
                        {r.asilFrom ? `${r.asil}(${r.asilFrom})` : r.asil}{r.asilDecomposed ? ' ⇄' : r.asilInherited ? ' ⤷' : ''}
                      </Tag>
                      <Space size={2} onClick={(e) => e.stopPropagation()}>
                        <Tooltip title={t('chainPage.openLabel')}><Button size="small" type="text" aria-label={t('chainPage.openLabel')} icon={<EyeOutlined />} onClick={() => setViewing(r)} /></Tooltip>
                        {CHILD_KINDS[r.kind].length > 0 && (
                          <Tooltip title={t('chainPage.addChildLabel')}><Button size="small" type="text" aria-label={t('chainPage.addChildLabel')} icon={<PlusOutlined />} onClick={() => openAddChild(r)} /></Tooltip>
                        )}
                        {r.kind !== 'SG' && r.asil !== 'QM' && (
                          <Tooltip title={t('chainPage.decomposeLabel')}><Button size="small" type="text" aria-label={t('chainPage.decomposeLabel')} icon={<PartitionOutlined />} onClick={() => openDecompose(r)} /></Tooltip>
                        )}
                        <Tooltip title={t('chainPage.editLabel')}><Button size="small" type="text" aria-label={t('chainPage.editLabel')} icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
                        {r.status !== 'superseded' && (
                          <Popconfirm title={t('chainPage.auditVoid', { code: r.code })} onConfirm={() => voidReq(r)}>
                            <Tooltip title={t('chainPage.void')}><Button size="small" type="text" danger icon={<SafetyOutlined />} /></Tooltip>
                          </Popconfirm>
                        )}
                        <Popconfirm title={t('chainPage.auditDel', { code: r.code })} onConfirm={() => delReq(r)}>
                          <Tooltip title={t('chainPage.del')}><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Tooltip>
                        </Popconfirm>
                      </Space>
                    </Space>
                  );
                }}
              />
            )}
          </>
        )}
      </Space>

      {/* 抽屉（工作项查看） */}
      <FsReqDrawer
        req={viewing} all={reqs}
        onClose={() => setViewing(null)}
        onEdit={openEdit}
        onDecompose={openDecompose}
      />

      {/* 新建/编辑 Modal */}
      <Modal open={modalOpen} title={editing ? `${t('chainPage.edit')} ${editing.code}` : parentFor ? `${t('chainPage.addChild')} · ${parentFor.code}` : t('chainPage.newSg')}
        onCancel={() => setModalOpen(false)} onOk={save} width={640} destroyOnClose>
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="kind" label={t('chainPage.childKind')} rules={[{ required: true }]}>
                <Select disabled={!!editing || (!!parentFor && CHILD_KINDS[parentFor.kind].length === 1)}
                  options={parentFor ? CHILD_KINDS[parentFor.kind].map((k) => ({ value: k, label: t(KIND_KEY(k)) }))
                    : (['SG'] as FsReqKind[]).map((k) => ({ value: k, label: t(KIND_KEY(k)) }))} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="title" label={t('chainPage.formTitle')} rules={[{ required: true }]}>
                <Input placeholder={t('chainPage.titlePh')} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="text" label={t('chainPage.text')} rules={[{ required: true, message: t('chainPage.textReq') }]}>
            <Input.TextArea rows={3} placeholder={t('chainPage.textPh')} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Space>
                <Form.Item name="asilInherited" valuePropName="checked" noStyle>
                  <Button type={inherit ? 'primary' : 'default'} onClick={() => form.setFieldValue('asilInherited', !inherit)} size="small">{t('chainPage.dInherit')}</Button>
                </Form.Item>
                {raiseWarn && <Text type="danger" style={{ fontSize: 12 }}>{t('chainPage.asilRaiseWarn', { child: asilV, parent: parentAsil })}</Text>}
              </Space>
            </Col>
            <Col span={12}>
              <Form.Item name="asil" label={t('chainPage.childAsil')} rules={[{ required: true }]}>
                <Select disabled={inherit} options={(['QM', 'A', 'B', 'C', 'D'] as FsAsil[]).map((a) => ({ value: a, label: ASIL_TAG_TEXT[a] }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="sourceRef" label={t('chainPage.sourceRef')}>
            <Input placeholder={t('chainPage.sourcePh')} />
          </Form.Item>
          {kind && ['SYSTEM_SR', 'HW_SR', 'SW_SR', 'HSI'].includes(kind) && (
            <Form.Item name="verificationMethod" label={t('chainPage.verify')} rules={[{ required: true, message: '叶子安全需求建议填写验证方法（链完整性）' }]}>
              <Input placeholder={t('chainPage.leafVerifyPh')} />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 从 HARA 生成 SG */}
      <Modal open={haraOpen} title={t('chainPage.sgFromHaraTitle')} onCancel={() => setHaraOpen(false)} width={640}
        footer={[
          <Button key="c" onClick={() => setHaraOpen(false)}>{t('chainPage.cancel')}</Button>,
          <Button key="o" type="primary" disabled={haraSel.length === 0 || genBusy} loading={genBusy} onClick={genSg}>{t('chainPage.gen', { n: haraSel.length })}</Button>,
        ]}>
        {haraCandidates.length === 0 ? <Empty description={t('chainPage.noHazards')} /> : (
          <Space direction="vertical" style={{ width: '100%' }}>
            <div><input type="checkbox" checked={withSkeleton} onChange={(e) => setWithSkeleton(e.target.checked)} /> {t('chainPage.fullSkeleton')}</div>
            <div><Text type="secondary" style={{ fontSize: 12 }}>{t('chainPage.llmChainNote')}</Text></div>
            {haraCandidates.map((h) => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Text strong>{h.hazId} · {h.title}</Text>
                  <div><Text type="secondary" style={{ fontSize: 12 }}>{h.situation}</Text></div>
                </div>
                <Tag color={ASIL_COLOR[h.asil]}>{ASIL_TAG_TEXT[h.asil]}</Tag>
                <Button size="small" type={haraSel.includes(h.id!) ? 'primary' : 'default'}
                  onClick={() => setHaraSel((p) => (p.includes(h.id!) ? p.filter((x) => x !== h.id) : [...p, h.id!]))}>
                  {haraSel.includes(h.id!) ? '✓' : '+'}
                </Button>
              </div>
            ))}
          </Space>
        )}
      </Modal>

      {/* 分解向导 */}
      <Modal open={!!decompTarget} title={t('chainPage.decomposeTitle')} onCancel={() => setDecompTarget(null)} width={680}
        footer={[
          <Button key="c" onClick={() => setDecompTarget(null)}>{t('chainPage.cancel')}</Button>,
          decompCombos.length > 1 && (
            <Radio.Group key="sel" value={decompIdx} onChange={(e) => setDecompIdx(e.target.value)} style={{ marginRight: 12 }}>
              {decompCombos.map((_, i) => <Radio.Button key={i} value={i}>方案 {i + 1}</Radio.Button>)}
            </Radio.Group>
          ),
          <Button key="o" type="primary" onClick={doDecompose}>{t('chainPage.decompConfirm')}（{combo?.length ?? 0}）</Button>,
        ]}>
        {decompTarget && combo && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Alert type="info" showIcon message={t('chainPage.decomposeDesc', { code: decompTarget.code, asil: decompTarget.asil })} />
            <div>
              <Text strong>{t('chainPage.decompPart', { i: decompIdx + 1, combo: combo.map((p) => asilNotation(p.asil, decompTarget.asil as Exclude<FsAsil, 'QM'>)).join(' + ') })}</Text>
              <div><Text type="secondary" style={{ fontSize: 12 }}>{t('chainPage.decompPartDesc', { base: decompTarget.asil })}</Text></div>
            </div>
            <Form form={decompForm} layout="vertical">
              {combo.map((p, i) => {
                const kindPool = CHILD_KINDS[decompTarget.kind].filter((k) => k !== 'HSI');
                const defaultKind = kindPool[i % Math.max(kindPool.length, 1)] || 'SW_SR';
                return (
                  <Space key={i} align="baseline" style={{ display: 'flex', width: '100%' }}>
                    <Form.Item name={`kind_${i}`} initialValue={defaultKind} style={{ width: 140 }}>
                      <Select options={kindPool.map((k) => ({ value: k, label: t(KIND_KEY(k)) }))} />
                    </Form.Item>
                    <Form.Item name={`note_${i}`} style={{ flex: 1 }} label={`${asilNotation(p.asil, decompTarget.asil as Exclude<FsAsil, 'QM'>)} · ${t('chainPage.decompNotePh')}`}>
                      <Input placeholder={p.note || `通道 ${i + 1}`} />
                    </Form.Item>
                  </Space>
                );
              })}
              <Form.Item name="independence" label={t('chainPage.decompIndep')} rules={[{ required: true, message: t('chainPage.decompIndep') }]}>
                <Input.TextArea rows={2} placeholder={t('chainPage.decompIndepPh')} />
              </Form.Item>
            </Form>
          </Space>
        )}
      </Modal>

      {/* 缺口明细 */}
      <Modal open={gapOpen} title={t('chainPage.gapModal', { n: gaps.length })} onCancel={() => setGapOpen(false)} footer={null} width={560}>
        <Space direction="vertical" style={{ width: '100%' }}>
          {gaps.map((g, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <WarningOutlined style={{ color: '#cf1322', marginTop: 4 }} />
              <div>
                <Text>{gapText(g)}</Text>
                {g.issue && <div><Text type="secondary" style={{ fontSize: 12 }}>{g.issue}</Text></div>}
              </div>
            </div>
          ))}
          {gaps.length === 0 && <Text type="success">{t('chainPage.noGap')}</Text>}
        </Space>
      </Modal>
    </Card>
  );
}
