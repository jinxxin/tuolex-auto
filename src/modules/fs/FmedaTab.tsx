import { useMemo, useState } from 'react';
import {
  Card, Table, Tag, Button, Space, Typography, Form, Input, Select, Switch, InputNumber,
  Drawer, Alert, Statistic, Row, Col, message, Popconfirm, Tooltip,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, RobotOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { apiFetch, useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { nextSeq } from '../../core/seq';
import { fmedaMetrics, hwTargets } from '../../core/fs/asil';
import { ASIL_TAG_TEXT, ASIL_COLOR, FMEDA_ROW_TEMPLATES } from '../../core/fs/data';
import type { FsFmeda, FsFmedaRow, FsAsil } from '../../core/types';

const { Text } = Typography;
const rowId = () => `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

export default function FmedaTab({ pid }: { pid: number }) {
  const { t } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FsFmeda | null>(null);
  const [form] = Form.useForm();
  const [rows, setRows] = useState<FsFmedaRow[]>([]);
  const [tplBusy, setTplBusy] = useState(false);
  const items = useLiveQuery(() => db.fs_fmeda.where('projectId').equals(pid).toArray(), [pid]) ?? [];

  const asilW = Form.useWatch('asil', form) as FsAsil | undefined;

  // 引擎实时度量（26262-5 C.2 简化模型，口径见领域笔记 §5.1）：
  // 分子 = singlePoint(SPF/RF) + latent(MPF-L) 全额；分母 total = 全部 safetyRelated 行（含 safe/MPF-D，QM 行 safetyRelated=false 排除）
  const metrics = useMemo(() => {
    const safety = rows.filter((r) => r.safetyRelated);
    const total = safety.reduce((s, r) => s + (r.lambda || 0), 0);
    const spf = safety.filter((r) => r.faultType === 'singlePoint').reduce((s, r) => s + (r.lambda || 0), 0);
    const latent = safety.filter((r) => r.faultType === 'latent').reduce((s, r) => s + (r.lambda || 0), 0);
    return fmedaMetrics(total, spf, latent, asilW ?? 'D');
  }, [rows, asilW]);

  const upd = (idx: number, patch: Partial<FsFmedaRow>) => {
    setRows((p) => p.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ asil: 'D', status: 'draft' });
    setRows([defaultRow()]);
    setOpen(true);
  };
  const openEdit = async (it: FsFmeda) => {
    const full = (await db.fs_fmeda.get(it.id!)) ?? it;   // 列表投影排除 rows/metrics，编辑拉全量
    setEditing(it);
    form.setFieldsValue(full);
    setRows((full.rows || []).length ? full.rows : [defaultRow()]);
    setOpen(true);
  };
  const defaultRow = (): FsFmedaRow => ({
    id: rowId(), component: '', failureMode: '', effect: '', safetyRelated: true,
    lambda: 0, distribution: 100, diagnosticCoverage: 0,
    faultType: 'singlePoint', mitigation: '',
  });

  const save = async () => {
    const v = await form.validateFields();
    const clean = rows.filter((r) => r.component?.trim());
    if (clean.length === 0) { msg.warning(t('analysisPage.fmNoRows')); return; }
    const now = Date.now();
    const metricData = metrics;
    if (editing?.id) {
      await db.fs_fmeda.update(editing.id, {
        item: v.item, asil: v.asil, status: v.status, rows: clean, metrics: metricData,
        version: (editing.version ?? 1) + 1, updatedAt: now,
      }, t('analysisPage.auditEdit', { id: editing.fmedaId, version: (editing.version ?? 1) + 1 }));
    } else {
      const fmedaId = await nextSeq(pid, 'FMEDA');
      await db.fs_fmeda.add({
        projectId: pid, fmedaId, item: v.item, asil: v.asil, status: v.status, rows: clean,
        metrics: metricData, version: 1, createdAt: now, updatedAt: now,
      }, t('analysisPage.auditNew', { id: fmedaId }));
    }
    setOpen(false);
    msg.success(editing ? t('analysisPage.auditEdit', { id: editing.fmedaId, version: 1 }) : '✓');
  };

  const del = async (it: FsFmeda) => {
    await db.fs_fmeda.delete(it.id!, t('analysisPage.auditDel', { id: it.fmedaId }));
  };

  const verdictTag = (it: FsFmeda) => {
    const m = it.metrics;
    if (!m || m.verdict === 'na') return <Tag>{t('analysisPage.fmNa')}</Tag>;
    return m.verdict === 'pass' ? <Tag color="green">{t('analysisPage.fmPass')}</Tag> : <Tag color="red">{t('analysisPage.fmFail')}</Tag>;
  };

  // ---------- 常见失效模板（二期 M1：先 LLM 建议 → 不可用降级本地模板） ----------
  const rowTplShape = (x: { component: string; failureMode: string; effect: string; lambda: number; faultType: FsFmedaRow['faultType']; mitigation: string }): FsFmedaRow => ({
    id: rowId(), component: x.component, failureMode: x.failureMode, effect: x.effect, safetyRelated: true,
    lambda: Number(x.lambda) >= 0 ? Math.min(Number(x.lambda), 100000) : 0, distribution: 100, diagnosticCoverage: 0,
    faultType: x.faultType || 'singlePoint', mitigation: x.mitigation ?? '',
  });
  const addTplRows = async () => {
    if (tplBusy) return;
    const item = (form.getFieldValue('item') as string || '').trim();
    let llmRows: { component: string; failureMode: string; effect: string; lambda: number; faultType: FsFmedaRow['faultType']; mitigation: string }[] | null = null;
    if (item) {
      setTplBusy(true);
      try {
        const res = await apiFetch('/ai/fs/fmeda', { method: 'POST', body: JSON.stringify({ item }) });
        const d = await res.json();
        if (d?.source === 'llm' && Array.isArray(d.rows) && d.rows.length) llmRows = d.rows;
      } catch { /* 降级 */ }
      setTplBusy(false);
    }
    if (llmRows) {
      setRows((p) => [...p, ...llmRows!.map(rowTplShape)]);
      msg.info(t('analysisPage.fmAiRows', { n: llmRows.length }));
      return;
    }
    // 本地模板（原行为）
    const picked = Object.entries(FMEDA_ROW_TEMPLATES)
      .filter(([k]) => item.includes(k) || (k === '看门狗' && item.includes('WD')))
      .flatMap(([, rs]) => rs);
    const list = (picked.length ? picked : Object.values(FMEDA_ROW_TEMPLATES).flat()) as ReturnType<typeof rowTplShape>[];
    setRows((p) => [...p, ...list.map(rowTplShape)]);
  };

  const tg = hwTargets(asilW ?? 'QM');
  const passed = items.filter((i) => i.metrics?.verdict === 'pass').length;
  const failed = items.filter((i) => i.metrics?.verdict === 'fail').length;

  return (
    <div>
      {msgCtx}
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Space wrap>
          <Button type="primary" aria-label="fmeda-new" icon={<PlusOutlined />} onClick={openCreate}>{t('analysisPage.new')}</Button>
          <Statistic title={t('analysisPage.fmStatTotal')} value={items.length} valueStyle={{ fontSize: 18 }} style={{ marginLeft: 24 }} />
          <Statistic title={t('analysisPage.fmStatPass')} value={passed} valueStyle={{ fontSize: 18, color: '#52c41a' }} />
          <Statistic title={t('analysisPage.fmStatFail')} value={failed} valueStyle={{ fontSize: 18, color: '#cf1322' }} />
        </Space>
        <Table<FsFmeda>
          rowKey="id" size="small" dataSource={items} pagination={false}
          locale={{ emptyText: t('analysisPage.empty') }}
          columns={[
            { title: 'ID', dataIndex: 'fmedaId', width: 110, render: (v: string) => <Text code>{v}</Text> },
            { title: t('analysisPage.fmItem'), dataIndex: 'item', ellipsis: true },
            { title: t('analysisPage.fmAsil'), dataIndex: 'asil', width: 90, render: (a: FsAsil) => <Tag color={ASIL_COLOR[a]}>{ASIL_TAG_TEXT[a]}</Tag> },
            {
              title: t('analysisPage.fmMetric'), key: 'metrics', width: 220,
              render: (_: unknown, it) => it.metrics
                ? <Space direction="vertical" size={0}><Text style={{ fontSize: 12 }}>SPFM {(it.metrics.spfm * 100).toFixed(1)}% · LFM {(it.metrics.lfm * 100).toFixed(1)}% · PMHF {it.metrics.pmhf.toFixed(1)} FIT</Text>{verdictTag(it)}</Space>
                : <Tag>—</Tag>,
            },
            { title: t('analysisPage.fmStatus'), dataIndex: 'status', width: 100, render: (v: string) => <Tag color={v === 'approved' ? 'green' : v === 'reviewed' ? 'blue' : 'gold'}>{v}</Tag> },
            { title: t('analysisPage.fmTarget'), dataIndex: 'updatedAt', width: 130, render: (v: number) => dayjs(v).format('MM-DD HH:mm') },
            {
              title: t('analysisPage.edit'), key: 'op', width: 110,
              render: (_: unknown, it) => (
                <Space size={2}>
                  <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(it)}>{t('analysisPage.edit')}</Button>
                  <Popconfirm title={t('analysisPage.del')} onConfirm={() => del(it)}>
                    <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Space>

      <Drawer open={open} width={980} title={editing ? `${t('analysisPage.edit')} ${editing.fmedaId}` : t('analysisPage.new')} onClose={() => setOpen(false)}
        extra={<Button type="primary" aria-label="fs-save" onClick={save}>{t('analysisPage.save')}</Button>} destroyOnClose>
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={10}><Form.Item name="item" label={t('analysisPage.fmTarget')} rules={[{ required: true }]}><Input placeholder="如：BMS 主控板 / AEB 控制器" /></Form.Item></Col>
            <Col span={6}>
              <Form.Item name="asil" label={t('analysisPage.fmAsilPick')} rules={[{ required: true }]}>
                <Select options={(['B', 'C', 'D', 'A', 'QM'] as FsAsil[]).map((a) => ({ value: a, label: ASIL_TAG_TEXT[a] }))} />
              </Form.Item>
            </Col>
            <Col span={4}><Form.Item name="status" label={t('analysisPage.fmStatus')}><Select options={['draft', 'reviewed', 'approved'].map((v) => ({ value: v, label: v }))} /></Form.Item></Col>
            <Col span={4}><Tooltip title={t('analysisPage.fmAsilPh')}><Tag style={{ marginTop: 30 }}>X(Y) 原级 → 度量目标</Tag></Tooltip></Col>
          </Row>
        </Form>

        <Alert type="info" showIcon message={t('analysisPage.fmClassHint')} style={{ marginBottom: 8 }} />

        <Table<FsFmedaRow>
          rowKey="id" size="small" pagination={false} dataSource={rows}
          locale={{ emptyText: t('analysisPage.empty') }}
          footer={() => (
            <Space>
              <Button size="small" icon={<PlusOutlined />} onClick={() => setRows((p) => [...p, defaultRow()])}>{t('analysisPage.fmAddRow')}</Button>
              <Button size="small" aria-label="fmeda-row-tpl" loading={tplBusy} icon={tplBusy ? undefined : <RobotOutlined />} onClick={addTplRows}>{t('analysisPage.rowTpl')}{!tplBusy && <span>（{Object.values(FMEDA_ROW_TEMPLATES).flat().length}）</span>}</Button>
            </Space>
          )}
          columns={[
            { title: t('analysisPage.fmColComponent'), key: 'component', width: 170,
              render: (_: unknown, r, i) => <Input size="small" value={r.component} placeholder="MCU/电源/传感器…" onChange={(e) => upd(i, { component: e.target.value })} /> },
            { title: t('analysisPage.fmColFm'), key: 'fm', width: 170,
              render: (_: unknown, r, i) => <Input size="small" value={r.failureMode} placeholder="失效模式" onChange={(e) => upd(i, { failureMode: e.target.value })} /> },
            { title: t('analysisPage.fmColClass'), key: 'faultType', width: 130,
              render: (_: unknown, r, i) => (
                <Select size="small" style={{ width: '100%' }} value={r.faultType}
                  onChange={(v) => upd(i, { faultType: v })}
                  options={([
                    { value: 'singlePoint', label: t('analysisPage.fmClassSpf') },
                    { value: 'latent', label: t('analysisPage.fmClassLatent') },
                    { value: 'safe', label: t('analysisPage.fmClassSafe') },
                    { value: 'noEffect', label: t('analysisPage.fmClassNo') },
                  ])} />
              ) },
            { title: 'λ FIT', key: 'lambda', width: 90,
              render: (_: unknown, r, i) => <InputNumber size="small" min={0} style={{ width: '100%' }} value={r.lambda} onChange={(v) => upd(i, { lambda: v ?? 0 })} /> },
            { title: 'DC %', key: 'dc', width: 80,
              render: (_: unknown, r, i) => <InputNumber size="small" min={0} max={100} style={{ width: '100%' }} value={r.diagnosticCoverage} onChange={(v) => upd(i, { diagnosticCoverage: v ?? 0 })} /> },
            { title: t('analysisPage.fmColSrel'), key: 'srel', width: 90,
              render: (_: unknown, r, i) => <Switch size="small" checked={r.safetyRelated} onChange={(v) => upd(i, { safetyRelated: v })} /> },
            { title: t('analysisPage.fmColMit'), key: 'mit', ellipsis: true,
              render: (_: unknown, r, i) => <Input size="small" value={r.mitigation} placeholder="安全机制（看门狗/冗余…）" onChange={(e) => upd(i, { mitigation: e.target.value })} /> },
            { title: '', key: 'del', width: 40,
              render: (_: unknown, _r, i) => <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setRows((p) => p.filter((_, x) => x !== i))} /> },
          ]}
        />

        {/* 实时度量结果 */}
        <Row gutter={12} style={{ marginTop: 16 }}>
          <Col span={4}><Card size="small" title={t('analysisPage.fmSpfm')}><Text style={{ fontSize: 18 }}>{(metrics.spfm * 100).toFixed(1)}%</Text></Card></Col>
          <Col span={4}><Card size="small" title={t('analysisPage.fmLfm')}><Text style={{ fontSize: 18 }}>{(metrics.lfm * 100).toFixed(1)}%</Text></Card></Col>
          <Col span={4}><Card size="small" title={t('analysisPage.fmPmhf')}><Text style={{ fontSize: 18 }}>{metrics.pmhf.toFixed(1)} FIT</Text></Card></Col>
          <Col span={4}>
            <Card size="small" title={t('analysisPage.fmVerdict')}>
              {metrics.verdict === 'pass' ? <Tag color="green" style={{ fontSize: 14 }}>{t('analysisPage.fmPass')}</Tag>
                : metrics.verdict === 'fail' ? <Tag color="red" style={{ fontSize: 14 }}>{t('analysisPage.fmFail')}</Tag>
                  : <Tag style={{ fontSize: 14 }}>{t('analysisPage.fmNa')}</Tag>}
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" title={`${t('analysisPage.fmMetric')} · ${ASIL_TAG_TEXT[asilW ?? 'D']}`}>
              {tg
                ? <Text style={{ fontSize: 12 }}>{t('analysisPage.fmTargets', { pmhf: tg.pmhfFit, spfm: tg.spfmPct, lfm: tg.lfmPct })}</Text>
                : <Text style={{ fontSize: 12 }}>{t('analysisPage.fmNa')}</Text>}
            </Card>
          </Col>
        </Row>
        <Text type="secondary" style={{ fontSize: 12 }}>{t('analysisPage.fmCalcNote')}</Text>
      </Drawer>
    </div>
  );
}
