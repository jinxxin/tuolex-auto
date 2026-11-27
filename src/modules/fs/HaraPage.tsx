import { useMemo, useState } from 'react';
import { fsPidFromUrl } from './projectLink';
import {
  Card, Table, Tag, Button, Space, Typography, Modal, Form, Input, Select, Switch, message,
  Popconfirm, Alert, Statistic, Row, Col, Tooltip,
} from 'antd';
import { PlusOutlined, ImportOutlined, FileExcelOutlined, TableOutlined, SafetyOutlined, RobotOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { apiFetch, useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { useAuth } from '../../store/auth';
import { nextSeq } from '../../core/seq';
import { asilOfRaw, isNoteARegion } from '../../core/fs/asil';
import FsHazardDrawer from './FsHazardDrawer';
import FsPackPicker from './FsPackPicker';
import { ASIL_TAG_TEXT, ASIL_COLOR, SEVERITY_OPTIONS, EXPOSURE_OPTIONS, CONTROLLABILITY_OPTIONS } from '../../core/fs/data';
import { FS_PACKS, packById } from '../../core/fs/fsPacks';
import { exportHaraSheet } from '../../core/fs/haraReport';
import { AsilMatrixModal } from '../../core/fs/AsilMatrixModal';
import type { FsHazard, FsAsil, FsSeverity, FsExposure, FsControllability } from '../../core/types';

const { Title, Text } = Typography;

// 二期 M1：LLM 生成 HARA 草稿（先 LLM；不可用降级模板库 FsPackPicker）——定级永远由引擎算，AI 无定级权
interface AiHazardDraft { title: string; vehicleLevelHazard: string; situation: string; severity: string; exposure: string; controllability: string; rationale: string; key: string; fromAi: boolean }

const asilOfAny = (s?: string, e?: string, c?: string) => {
  try { return s && e && c ? asilOfRaw(s, e, c) : 'QM'; } catch { return 'QM'; }
};

export default function HaraPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [msg, msgCtx] = message.useMessage();
  const [open, setOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const [aiDrafts, setAiDrafts] = useState<AiHazardDraft[]>([]);
  const [aiSel, setAiSel] = useState<string[]>([]);
  const [aiForm] = Form.useForm();
  const [editing, setEditing] = useState<FsHazard | null>(null);
  const [viewing, setViewing] = useState<FsHazard | null>(null);
  const [form] = Form.useForm();
  const [activePid, setActivePid] = useState<number | undefined>(undefined);

  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? [];
  const fsProjects = useMemo(() => projects.filter((p) => p.fsEnabled), [projects]);
  const hazards = useLiveQuery(() => db.fs_hazards.toArray(), []) ?? [];

  const pid = fsPidFromUrl(fsProjects.map((p) => p.id!), activePid);
  const curProject = projects.find((p) => p.id === pid);
  const rows = useMemo(() => (pid != null ? hazards.filter((h) => h.projectId === pid) : []), [hazards, pid]);
  const sorted = useMemo(() => [...rows].sort((a, b) => a.hazId.localeCompare(b.hazId, undefined, { numeric: true })), [rows]);

  const actor = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };
  const projectName = projects.find((p) => p.id === pid)?.name || '';
  const count = (f: (h: FsHazard) => unknown) => rows.filter(f).length;

  // ---------- 表单 S/E/C 实时 ASIL ----------
  const s = Form.useWatch('severity', form) as FsSeverity | undefined;
  const e = Form.useWatch('exposure', form) as FsExposure | undefined;
  const c = Form.useWatch('controllability', form) as FsControllability | undefined;
  const manual = Form.useWatch('asilManual', form) as boolean | undefined;
  const computed = s && e && c ? (() => { try { return asilOfRaw(s, e, c); } catch { return undefined; } })() : undefined;
  const noteARegion = !!(s && e && c && isNoteARegion(s, e, c));

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ severity: 'S2', exposure: 'E3', controllability: 'C2', asilManual: false, asil: 'QM', status: 'draft', version: 1 });
    setOpen(true);
  };
  const openEdit = (i: FsHazard) => {
    setEditing(i);
    form.setFieldsValue(i);
    setOpen(true);
  };

  const save = async () => {
    const v = await form.validateFields();
    if (pid == null) return;
    const finalAsil: FsAsil = v.asilManual && v.asil ? v.asil : (computed ?? 'QM');
    if (v.asilManual && !v.asilManualReason) {
      msg.warning(t('haraPage.manualReasonL') + ' *');
      return;
    }
    const now = Date.now();
    if (editing?.id) {
      const version = (editing.version ?? 1) + 1;
      await db.fs_hazards.update(editing.id, {
        title: v.title, vehicleLevelHazard: v.vehicleLevelHazard, situation: v.situation,
        severity: v.severity, exposure: v.exposure, controllability: v.controllability,
        asil: finalAsil, asilManual: !!v.asilManual, asilManualReason: v.asilManual ? v.asilManualReason : undefined,
        rationale: v.rationale, status: v.status ?? editing.status, version, updatedAt: now,
      }, t('haraPage.saved', { version }));
      msg.success(t('haraPage.saved', { version }));
    } else {
      const hazId = await nextSeq(pid, 'HAZ');
      await db.fs_hazards.add({
        projectId: pid, hazId, title: v.title, vehicleLevelHazard: v.vehicleLevelHazard,
        situation: v.situation, severity: v.severity, exposure: v.exposure, controllability: v.controllability,
        asil: finalAsil, asilManual: !!v.asilManual, asilManualReason: v.asilManual ? v.asilManualReason : undefined,
        status: 'draft', rationale: v.rationale, version: 1, createdAt: now, updatedAt: now,
      }, t('haraPage.added', { id: hazId }));
      msg.success(t('haraPage.added', { id: hazId }));
    }
    setOpen(false);
  };

  const confirmRow = async (i: FsHazard) => {
    if (!i.rationale?.trim()) { msg.warning(t('haraPage.confirmNeedRationale')); return; }
    await db.fs_hazards.update(i.id!, { status: 'confirmed', version: (i.version ?? 1) + 1, updatedAt: Date.now() }, t('haraPage.confirmedMsg', { id: i.hazId, asil: i.asil }));
    msg.success(t('haraPage.confirmedMsg', { id: i.hazId, asil: i.asil }));
  };
  const voidRow = async (i: FsHazard) => {
    await db.fs_hazards.update(i.id!, { status: 'superseded', version: (i.version ?? 1) + 1, updatedAt: Date.now() }, t('haraPage.voided', { id: i.hazId }));
    msg.success(t('haraPage.voided', { id: i.hazId }));
  };
  const delRow = async (i: FsHazard) => {
    await db.fs_hazards.delete(i.id!, t('haraPage.deleted'));
  };

  const selRows = pid != null ? rows : [];

  // ---------- 产品域（fsSysType）保存：模板库预选 ----------
  const setProjectDomain = async (v: string | undefined) => {
    if (pid == null) return;
    await db.projects.update(pid, { fsSysType: v || null, updatedAt: Date.now() },
      t('haraPage.domainAudit', { sys: v || t('haraPage.domainNone') }));
    msg.success(t('haraPage.domainSaved', { sys: v ? (packById(v)?.sysType ?? v) : t('haraPage.domainNone') }));
  };


  // ---------- AI 生成（二期 M1：LLM 优先 → 内置包降级；ASIL 由引擎算） ----------
  const openAi = () => { aiForm.resetFields(); setAiErr(''); setAiDrafts([]); setAiSel([]); setAiOpen(true); };
  const runAi = async () => {
    if (pid == null) return;
    const v = await aiForm.validateFields();
    if (!v.item?.trim()) { msg.warning(t('haraPage.aiItemL') + ' *'); return; }
    setAiBusy(true); setAiErr(''); setAiDrafts([]); setAiSel([]);
    try {
      const res = await apiFetch('/ai/fs/hara', {
        method: 'POST',
        body: JSON.stringify({ item: v.item.trim(), sysType: v.sysType?.trim() || undefined }),
      });
      const d = await res.json();
      if (d?.source === 'llm' && Array.isArray(d.hazards) && d.hazards.length) {
        setAiDrafts(d.hazards.map((h: AiHazardDraft, i: number) => ({ ...h, key: `llm-${i}`, fromAi: true })));
        setAiSel(d.hazards.map((_: unknown, i: number) => `llm-${i}`));
      } else {
        // 降级：模板库（FsPackPicker inline）——不再平铺内置包
        setAiErr(d?.error ? String(d.error) : t('haraPage.aiErrGeneric'));
      }
    } catch (e) {
      setAiErr(String((e as Error).message || e));
    }
    setAiBusy(false);
  };
  const importAiSel = async () => {
    if (!pid || aiSel.length === 0) return;
    const picked = aiDrafts.filter((x) => aiSel.includes(x.key));
    const now = Date.now();
    const created: string[] = [];
    for (const h of picked) {
      const hazId = await nextSeq(pid, 'HAZ');
      const asil = asilOfAny(h.severity, h.exposure, h.controllability);
      await db.fs_hazards.add({
        projectId: pid, hazId, title: h.title, vehicleLevelHazard: h.vehicleLevelHazard,
        situation: h.situation, severity: h.severity as FsSeverity, exposure: h.exposure as FsExposure,
        controllability: h.controllability as FsControllability,
        asil, asilManual: false, status: 'draft',
        rationale: h.rationale || (h.fromAi ? 'AI 生成，需工程确认' : '内置模板，需工程确认'),
        version: 1, createdAt: now, updatedAt: now,
      }, h.fromAi ? t('haraPage.auditAi', { id: hazId }) : t('haraPage.auditPack', { id: hazId }));
      created.push(hazId);
    }
    msg.success(t('haraPage.aiAddedN', { n: created.length, ids: created.join(', ') }));
    setAiOpen(false);
  };

  return (
    <Card>
      {msgCtx}
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        {/* 头部：标题 + 项目选择 */}
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Space align="center">
              <SafetyOutlined style={{ fontSize: 20, color: '#1b6ca8' }} />
              <Title level={4} style={{ margin: 0 }}>{t('haraPage.title')}</Title>
              <Tag color="purple">ISO 26262:2018</Tag>
            </Space>
            <div><Text type="secondary">{t('haraPage.sub')}</Text></div>
          </Col>
          <Col>
            {fsProjects.length > 0 ? (
              <Select
                style={{ width: 260 }} value={pid} placeholder={t('fs.selectProject')}
                onChange={(v) => setActivePid(v)}
                options={fsProjects.map((p) => ({ value: p.id!, label: p.name }))}
              />
            ) : (
              <Alert type="warning" showIcon message={t('fs.noProject')} />
            )}
          </Col>
        </Row>

        {pid == null ? null : (
          <>
            {/* 统计卡 */}
            <Row gutter={12}>
              {[
                { label: t('haraPage.statTotal'), value: selRows.length },
                { label: t('haraPage.statConfirmed'), value: count((h) => h.status === 'confirmed') },
                { label: t('haraPage.statAsilHigh'), value: count((h) => ['B', 'C', 'D'].includes(h.asil)) },
                { label: t('haraPage.statManual'), value: count((h) => h.asilManual) },
              ].map((s) => (
                <Col span={6} key={s.label}><Card size="small"><Statistic title={s.label} value={s.value} valueStyle={{ fontSize: 22 }} /></Card></Col>
              ))}
            </Row>

            {/* 操作条 */}
            <Space wrap>
              <Select
                style={{ width: 200 }} size="middle" allowClear
                data-testid="fs-domain-select"
                placeholder={t('haraPage.domainPh')}
                value={curProject?.fsSysType ?? undefined}
                onChange={(v) => setProjectDomain(v)}
                options={FS_PACKS.map((p) => ({ value: p.id, label: `${p.sysType}（${p.hazards.length}）` }))}
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('haraPage.add')}</Button>
              <Button icon={<ImportOutlined />} onClick={() => setTplOpen(true)}>{t('haraPage.fromTpl')}</Button>
              <Button type="primary" ghost icon={<RobotOutlined />} onClick={openAi}>{t('haraPage.aiGen')}</Button>
              <Button icon={<TableOutlined />} onClick={() => setRefOpen(true)}>{t('haraPage.ref')}</Button>
              <Button icon={<FileExcelOutlined />} onClick={() => exportHaraSheet({ projectId: pid, projectName, rows: sorted, actor, t })}>{t('haraPage.export')}</Button>
              <Text type="secondary">{t('haraPage.noteA')}</Text>
            </Space>

            {/* 危害表格 */}
            <Table<FsHazard>
              rowKey="id" size="small" dataSource={sorted} pagination={{ pageSize: 20, showSizeChanger: false }}
              locale={{ emptyText: t('haraPage.empty') }}
              onRow={(r) => ({
                onClick: (e) => {
                  const tgt = e.target as HTMLElement;
                  if (tgt.closest('button,a,.ant-tag,input,.ant-select,.ant-popover')) return;
                  setViewing(r);
                },
                style: { cursor: 'pointer' },
              })}
              columns={[
                { title: t('haraPage.hazId'), dataIndex: 'hazId', width: 90,
                  render: (v: string, r) => (
                    <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setViewing(r)}>
                      <Text code underline>{v}</Text>
                    </Button>
                  ) },
                {
                  title: t('haraPage.titleC'), dataIndex: 'title', width: 260,
                  render: (_: unknown, r) => (
                    <Space direction="vertical" size={0}>
                      <Text strong>{r.title}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{r.vehicleLevelHazard}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{r.situation}</Text>
                    </Space>
                  ),
                },
                {
                  title: t('haraPage.sec'), key: 'sec', width: 130,
                  render: (_: unknown, r) => <Space size={4}><Tag>{r.severity}</Tag><Tag>{r.exposure}</Tag><Tag>{r.controllability}</Tag></Space>,
                },
                {
                  title: t('haraPage.asil'), dataIndex: 'asil', width: 110,
                  render: (v: FsAsil, r) => (
                    <Tooltip title={r.asilManual ? `${t('haraPage.manual', { asil: v })}: ${r.asilManualReason}` : t('haraPage.calc', { asil: v })}>
                      <Tag color={ASIL_COLOR[v]} style={{ marginRight: 0 }}>{ASIL_TAG_TEXT[v]}{r.asilManual ? ' ✎' : ''}</Tag>
                    </Tooltip>
                  ),
                },
                {
                  title: t('haraPage.status'), dataIndex: 'status', width: 90,
                  render: (v: string) => v === 'confirmed' ? <Tag color="green">{t('haraPage.confirmed')}</Tag> : v === 'superseded' ? <Tag>{t('haraPage.superseded')}</Tag> : <Tag color="gold">{t('haraPage.draft')}</Tag>,
                },
                {
                  title: t('haraPage.src'), key: 'src', width: 130,
                  render: (_: unknown, r) => {
                    const pk = packById(r.srcPack);
                    return r.srcPack && pk ? <Tag color="geekblue" style={{ marginRight: 0 }}>{pk.sysType}</Tag> : <span style={{ color: '#bbb' }}>—</span>;
                  },
                },
                { title: t('haraPage.updated'), dataIndex: 'updatedAt', width: 150, render: (v: number) => dayjs(v).format('YYYY-MM-DD HH:mm') },
                {
                  title: t('haraPage.actions'), key: 'op', width: 250,
                  render: (_: unknown, r) => (
                    <Space size={4}>
                      <Button size="small" onClick={() => openEdit(r)}>{t('haraPage.edit')}</Button>
                      {r.status !== 'confirmed' && r.status !== 'superseded' && (
                        <Button size="small" type="primary" ghost onClick={() => confirmRow(r)}>{t('haraPage.confirm')}</Button>
                      )}
                      {r.status !== 'superseded' && (
                        <Button size="small" onClick={() => voidRow(r)}>{t('haraPage.void')}</Button>
                      )}
                      <Popconfirm title={t('haraPage.delConfirm', { id: r.hazId })} onConfirm={() => delRow(r)}>
                        <Button size="small" danger>{t('haraPage.del')}</Button>
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
            />
          </>
        )}
      </Space>

      {/* 条目工作项详情（点击打开查看） */}
      <FsHazardDrawer hazard={viewing} onClose={() => setViewing(null)} onEdit={openEdit} />

      {/* 新增/编辑 Modal */}
      <Modal open={open} title={editing ? t('haraPage.editTitle') : t('haraPage.addTitle')} onCancel={() => setOpen(false)} onOk={save} width={720} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ severity: 'S2', exposure: 'E3', controllability: 'C2', asilManual: false }}>
          <Form.Item name="title" label={t('haraPage.titleC')} rules={[{ required: true }]}>
            <Input placeholder={t('haraPage.titlePh')} />
          </Form.Item>
          <Form.Item name="vehicleLevelHazard" label={t('haraPage.hazard')}>
            <Input />
          </Form.Item>
          <Form.Item name="situation" label={t('haraPage.scene')} rules={[{ required: true }]}>
            <Input placeholder={t('haraPage.scenePh')} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="severity" label={t('haraPage.sL')} rules={[{ required: true }]}>
                <Select options={SEVERITY_OPTIONS.map((o) => ({ value: o.value, label: `${o.value} · ${o.zh}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="exposure" label={t('haraPage.eL')} rules={[{ required: true }]}>
                <Select options={EXPOSURE_OPTIONS.map((o) => ({ value: o.value, label: `${o.value} · ${o.zh}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="controllability" label={t('haraPage.cL')} rules={[{ required: true }]}>
                <Select options={CONTROLLABILITY_OPTIONS.map((o) => ({ value: o.value, label: `${o.value} · ${o.zh}` }))} />
              </Form.Item>
            </Col>
          </Row>

          {/* 实时 ASIL 引擎结果 */}
          <Space align="center" style={{ marginBottom: 12 }}>
            <Text>{t('haraPage.asilL')}：</Text>
            {computed ? <Tag color={ASIL_COLOR[computed]} style={{ fontSize: 14 }}>{ASIL_TAG_TEXT[computed]}</Tag> : <Tag>—</Tag>}
            {noteARegion && <Text type="warning" style={{ fontSize: 12 }}>{t('haraPage.noteA')}</Text>}
            <Form.Item name="asilManual" valuePropName="checked" noStyle>
              <Switch size="small" /> <Text type="secondary">{t('haraPage.manualL')}</Text>
            </Form.Item>
            {manual && (
              <>
                <Form.Item name="asil" noStyle rules={[{ required: true }]}>
                  <Select style={{ width: 110 }} options={(['QM', 'A', 'B', 'C', 'D'] as FsAsil[]).map((a) => ({ value: a, label: ASIL_TAG_TEXT[a] }))} />
                </Form.Item>
                <Form.Item name="asilManualReason" noStyle rules={[{ required: true, message: t('haraPage.manualReasonL') }]}>
                  <Input style={{ width: 260 }} placeholder={t('haraPage.manualReasonPh')} />
                </Form.Item>
              </>
            )}
          </Space>

          <Form.Item name="rationale" label={t('haraPage.rationale')} rules={[{ required: false }]}>
            <Input.TextArea rows={3} placeholder={t('haraPage.rationalePh')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 模板库 Modal（二期 M2：行业包左包右条目，项目域预选） */}
      <FsPackPicker
        key={`lib-${pid ?? 'none'}-${curProject?.fsSysType ?? 'none'}`}
        pid={pid}
        preselect={curProject?.fsSysType ?? null}
        open={tplOpen}
        onClose={() => setTplOpen(false)}
        onImported={(m) => msg.success(m)}
      />

      {/* AI 生成 Modal（二期 M1） */}
      <Modal open={aiOpen} title={t('haraPage.aiGen')} onCancel={() => setAiOpen(false)} width={720} footer={null} destroyOnClose>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert type="info" showIcon message={t('haraPage.aiGenDesc')} />
          <Form form={aiForm} layout="vertical">
            <Form.Item name="item" label={t('haraPage.aiItemL')} rules={[{ required: true, message: t('haraPage.aiItemL') }]}>
              <Input.TextArea rows={2} placeholder={t('haraPage.aiItemPh')} />
            </Form.Item>
            <Row gutter={12}>
              <Col span={14}>
                <Form.Item name="sysType" label={t('haraPage.aiSysTypeL')}>
                  <Input placeholder={t('haraPage.aiSysTypePh')} />
                </Form.Item>
              </Col>
              <Col span={10} style={{ textAlign: 'right' }}>
                <div style={{ height: 24 }} />
                <Button type="primary" icon={<RobotOutlined />} loading={aiBusy} onClick={runAi}>{t('haraPage.aiRun')}</Button>
              </Col>
            </Row>
          </Form>

          {aiBusy && <Alert type="info" showIcon message={t('haraPage.aiLoading')} />}
          {!aiBusy && aiErr && (
            <Alert type="warning" showIcon message={t('haraPage.aiUnavailable', { err: aiErr })}
              description={t('haraPage.aiFallbackHint')} />
          )}
          {!aiBusy && aiErr && aiDrafts.length === 0 && (
            <FsPackPicker
              key={`ai-${pid ?? 'none'}-${curProject?.fsSysType ?? 'none'}`}
              pid={pid}
              preselect={curProject?.fsSysType ?? null}
              inline
              onImported={(m) => msg.success(m)}
            />
          )}
          {!aiBusy && aiDrafts.length > 0 && (
            <>
              <Text strong>{t('haraPage.aiResultTtl', { n: aiDrafts.length })}</Text>
              <div style={{ maxHeight: '46vh', overflow: 'auto' }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  {aiDrafts.map((h) => {
                    const a = asilOfAny(h.severity, h.exposure, h.controllability);
                    const sel = aiSel.includes(h.key);
                    return (
                      <div key={h.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, border: sel ? '1px solid #91caff' : '1px solid #f0f0f0', borderRadius: 6, padding: 8, background: sel ? '#f0f7ff' : undefined }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Space size={6} wrap>
                            {h.fromAi && <Tag color="purple" style={{ marginRight: 0 }}>{t('haraPage.aiNeedConfirm')}</Tag>}
                            <Text strong style={{ overflowWrap: 'anywhere' }}>{h.title}</Text>
                          </Space>
                          {h.vehicleLevelHazard && <div style={{ overflowWrap: 'anywhere' }}><Text type="secondary" style={{ fontSize: 12 }}>{t('haraPage.hazard')}: {h.vehicleLevelHazard}</Text></div>}
                          <div style={{ overflowWrap: 'anywhere' }}><Text type="secondary" style={{ fontSize: 12 }}>{t('haraPage.scene')}: {h.situation}</Text></div>
                          <div style={{ overflowWrap: 'anywhere' }}><Text type="secondary" style={{ fontSize: 12 }}>{t('haraPage.rationale')}: {h.rationale}</Text></div>
                        </div>
                        <Space size={4} direction="vertical" align="end">
                          <Space size={2}><Tag>{h.severity}</Tag><Tag>{h.exposure}</Tag><Tag>{h.controllability}</Tag></Space>
                          <Tag color={ASIL_COLOR[a]}>{ASIL_TAG_TEXT[a]}</Tag>
                          <Button size="small" type={sel ? 'primary' : 'default'}
                            onClick={() => setAiSel((p) => (sel ? p.filter((x) => x !== h.key) : [...p, h.key]))}>
                            {sel ? '✓' : '+'}
                          </Button>
                        </Space>
                      </div>
                    );
                  })}
                </Space>
              </div>
              <Space>
                <Text type="secondary">{t('haraPage.aiSelN', { n: aiSel.length })}</Text>
                <Button disabled={aiSel.length === 0} onClick={() => setAiSel(aiDrafts.map((x) => x.key))}>{t('haraPage.aiImportAll')}</Button>
                <Button type="primary" disabled={aiSel.length === 0} onClick={importAiSel}>{t('haraPage.aiImport', { n: aiSel.length })}</Button>
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>{t('haraPage.aiAllHint')}</Text>
            </>
          )}
          {!aiBusy && !aiErr && aiDrafts.length === 0 && <Text type="secondary">{t('haraPage.aiNone')}</Text>}
        </Space>
      </Modal>

      {/* 判定表只读对照 */}
      <AsilMatrixModal open={refOpen} onClose={() => setRefOpen(false)} />
    </Card>
  );
}
