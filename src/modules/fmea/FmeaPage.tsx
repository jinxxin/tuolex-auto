import { useMemo, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Modal, Form, Input, Select, InputNumber, message,
  Statistic, Row, Col, Popconfirm, Typography, Alert,
} from 'antd';
import {
  PlusOutlined, DownloadOutlined, DeleteOutlined, EditOutlined, CopyOutlined,
  WarningOutlined, FileExcelOutlined, SafetyCertificateOutlined, LinkOutlined, HistoryOutlined,
} from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { createRecord, updateRecord, deleteRecord } from '../../core/repo';
import { writeAudit } from '../../core/audit';
import { useAuth } from '../../store/auth';
import { useTranslation } from 'react-i18next';
import { riskLevel, FMEA_SCALE, templatesFor } from '../../core/fmea';
import { ASIL_TAG_TEXT, ASIL_COLOR } from '../../core/fs/data';
import type { FsAsil } from '../../core/types';
import type { FmeaTemplate } from '../../core/fmea';
import TraceLinkPanel from '../../components/TraceLinkPanel';
import { recordEntryVersion } from '../../core/history';
import EntryHistoryModal from '../trace/EntryHistoryModal';
import dayjs from 'dayjs';
import type { FmeaItem } from '../../core/types';

const { Text } = Typography;

export default function FmeaPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  const [projectId, setProjectId] = useState<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FmeaItem | null>(null);
  const [form] = Form.useForm();
  const [linkPanel, setLinkPanel] = useState<FmeaItem | null>(null);
  const [histPanel, setHistPanel] = useState<FmeaItem | null>(null);

  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? [];
  const items = useLiveQuery(() => db.fmea_items.orderBy('id').toArray(), []) ?? [];
  const testCases = useLiveQuery(() => db.test_cases.toArray(), []) ?? [];

  const actor = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };

  // 风险等级文案（数据值 高/中/低 → 本地化显示）
  const lvLabel = (lv: string) => t(lv === '高' ? 'fmeaPage.levelHigh' : lv === '中' ? 'fmeaPage.levelMid' : 'fmeaPage.levelLow');

  // 默认选中第一个项目
  const activePid = projectId ?? projects[0]?.id;
  const rows = useMemo(
    () => items.filter((i) => i.projectId === activePid).sort((a, b) => b.rpn - a.rpn),
    [items, activePid],
  );
  const projectTcs = useMemo(() => testCases.filter((t) => t.projectId === activePid), [testCases, activePid]);

  const highCount = rows.filter((i) => riskLevel(i.rpn).level === '高').length;
  const avgRpn = rows.length ? Math.round(rows.reduce((s, i) => s + i.rpn, 0) / rows.length) : 0;
  const openCount = rows.filter((i) => i.status === 'open').length;

  const s = Form.useWatch('severity', form);
  const o = Form.useWatch('occurrence', form);
  const d = Form.useWatch('detection', form);
  const liveRpn = (s ?? 1) * (o ?? 1) * (d ?? 1);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ severity: 5, occurrence: 3, detection: 3, status: 'open' });
    setOpen(true);
  };

  const openEdit = (i: FmeaItem) => {
    setEditing(i);
    form.setFieldsValue(i);
    setOpen(true);
  };

  const save = async () => {
    const v = await form.validateFields();
    const rpn = v.severity * v.occurrence * v.detection;
    const data = { ...v, rpn, projectId: activePid ?? projects[0]?.id ?? 0, linkedTcIds: v.linkedTcIds || [] };
    if (editing?.id) {
      const nextV = (editing.version ?? 1) + 1;
      await updateRecord<FmeaItem>('fmea_items', editing.id, { ...data, version: nextV, updatedAt: Date.now() }, actor, t('fmeaPage.auditEdit', { process: v.process, mode: v.failureMode, rpn, v: nextV }));
      await recordEntryVersion('fmea', editing.id, { failureMode: editing.failureMode, effect: editing.effect, cause: editing.cause, action: editing.action }, { failureMode: v.failureMode, effect: v.effect, cause: v.cause, action: v.action, version: nextV }, actor, t('fmeaPage.entryEditNote'));
      msg.success(t('fmeaPage.saved'));
    } else {
      await createRecord<FmeaItem>('fmea_items', data, actor, t('fmeaPage.auditNew', { process: v.process, mode: v.failureMode, rpn }));
      msg.success(t('fmeaPage.added'));
    }
    setOpen(false);
  };

  const addFromTemplate = async (tpl: FmeaTemplate) => {
    await createRecord<FmeaItem>('fmea_items', {
      ...tpl, projectId: activePid ?? projects[0]?.id ?? 0, action: '', owner: tpl.owner, status: 'open',
    }, actor, t('fmeaPage.auditFromTpl', { mode: tpl.failureMode, rpn: tpl.rpn }));
    msg.success(t('fmeaPage.fromTplMsg'));
  };

  const remove = async (i: FmeaItem) => {
    await deleteRecord('fmea_items', i.id!, actor, t('fmeaPage.auditDel', { mode: i.failureMode }));
  };

  const toggleClose = async (i: FmeaItem) => {
    const next = i.status === 'open' ? 'closed' : 'open';
    await updateRecord<FmeaItem>('fmea_items', i.id!, { status: next }, actor, next === 'closed' ? t('fmeaPage.auditClose', { mode: i.failureMode }) : t('fmeaPage.auditReopen', { mode: i.failureMode }));
  };

  // ---- Excel 导出（需求 7：以 Excel 格式做 FMEA 分析）----
  const exportExcel = async () => {
    const header = ['序号', '流程/功能', '失效模式', '潜在影响', '潜在原因', '严重度S', '发生度O', '探测度D', 'RPN', '风险等级', '建议措施', '责任人', '状态', '更新时间'];
    const body = rows.map((i, idx) => [
      idx + 1, i.process, i.failureMode, i.effect, i.cause,
      i.severity, i.occurrence, i.detection, i.rpn, riskLevel(i.rpn).level, i.action, i.owner,
      i.status === 'open' ? '开放' : '已关闭',
      dayjs(i.updatedAt || Date.now()).format('YYYY-MM-DD HH:mm'),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 30 }, { wch: 32 }, { wch: 28 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 6 }, { wch: 8 }, { wch: 30 }, { wch: 12 }, { wch: 8 }, { wch: 16 }];

    // 评分标准说明页
    const scaleRows: (string | number)[][] = [['FMEA 评分标准（ICH Q9 / GAMP 5）'], []];
    for (const dim of FMEA_SCALE) {
      scaleRows.push([dim.dim, '评分', '说明']);
      for (const [score, desc] of dim.values) scaleRows.push(['', score, desc]);
      scaleRows.push([]);
    }
    scaleRows.push(['风险等级判定'], ['RPN ≥ 100', '高风险：必须采取控制措施并补充验证活动/测试覆盖'], ['RPN 50-99', '中风险：评估并采取缓解措施'], ['RPN < 50', '低风险：可接受，持续监控']);
    const ws2 = XLSX.utils.aoa_to_sheet(scaleRows);
    ws2['!cols'] = [{ wch: 24 }, { wch: 8 }, { wch: 60 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'FMEA 分析');
    XLSX.utils.book_append_sheet(wb, ws2, '评分标准');
    const projName = projects.find((p) => p.id === activePid)?.name || '项目';
    XLSX.writeFile(wb, `FMEA_${projName}_${dayjs().format('YYYYMMDD')}.xlsx`);
    await writeAudit({ userId: user?.id ?? 0, username: user?.username ?? 'unknown', action: 'EXPORT', entityType: 'fmea_items', entityId: activePid ?? 0, summary: t('fmeaPage.auditExport', { name: projName, n: rows.length }), before: null, after: null });
    msg.success(t('fmeaPage.excelDone'));
  };

  const cols = [
    { title: t('fmeaPage.process'), dataIndex: 'process', width: 110 },
    { title: t('fmeaPage.failureMode'), dataIndex: 'failureMode', width: 220, ellipsis: true },
    { title: t('fmeaPage.effect'), dataIndex: 'effect', ellipsis: true },
    { title: t('fmeaPage.cause'), dataIndex: 'cause', ellipsis: true },
    { title: 'S', dataIndex: 'severity', width: 42, align: 'center' as const },
    { title: 'O', dataIndex: 'occurrence', width: 42, align: 'center' as const },
    { title: 'D', dataIndex: 'detection', width: 42, align: 'center' as const },
    { title: 'RPN', dataIndex: 'rpn', width: 64, align: 'center' as const,
      render: (r: number) => { const lv = riskLevel(r); return <Tag color={lv.color}><b>{r}</b> {lvLabel(lv.level)}</Tag>; } },
    { title: t('fmeaPage.asilCol'), dataIndex: 'asil', width: 90, align: 'center' as const,
      render: (a: string | undefined) => a && ['A','B','C','D'].includes(a)
        ? <Tag color={ASIL_COLOR[a as FsAsil]}>{ASIL_TAG_TEXT[a as FsAsil]}</Tag>
        : <Text type="secondary">—</Text> },
    { title: t('fmeaPage.action'), dataIndex: 'action', ellipsis: true, render: (a: string) => a || <Text type="secondary">—</Text> },
    { title: t('fmeaPage.coverage'), width: 110, render: (_: unknown, i: FmeaItem) => {
      const n = (i.linkedTcIds || []).length;
      const high = riskLevel(i.rpn).level === '高';
      if (n === 0) return high ? <Tag color="red">{t('fmeaPage.noCoverageHigh')}</Tag> : <Tag>{t('fmeaPage.notLinked')}</Tag>;
      return <Tag color="green" icon={<SafetyCertificateOutlined />}>{t('fmeaPage.coverageN', { n })}</Tag>;
    } },
    { title: t('fmeaPage.owner'), dataIndex: 'owner', width: 90 },
    { title: t('fmeaPage.colStatus'), dataIndex: 'status', width: 80, render: (st: string) => st === 'open' ? <Tag color="orange">{t('fmeaPage.statusOpen')}</Tag> : <Tag color="green">{t('fmeaPage.statusClosed')}</Tag> },
    { title: t('fmeaPage.colActions'), width: 210, render: (_: unknown, i: FmeaItem) => (
      <Space size={2}>
        <Button size="small" type="link" icon={<HistoryOutlined />} onClick={() => setHistPanel(i)}>{t('fmeaPage.history')}</Button>
        <Button size="small" type="link" icon={<LinkOutlined />} onClick={() => setLinkPanel(i)}>{t('fmeaPage.trace')}</Button>
        <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(i)}>{t('common.edit')}</Button>
        <Button size="small" type="link" onClick={() => toggleClose(i)}>{i.status === 'open' ? t('fmeaPage.btnClose') : t('fmeaPage.btnReopen')}</Button>
        <Popconfirm title={t('fmeaPage.delTitle')} onConfirm={() => remove(i)}>
          <Button size="small" type="link" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    )},
  ];

  return (
    <Card title={t('fmeaPage.title')} extra={<Space>
      <Button icon={<DownloadOutlined />} onClick={exportExcel} disabled={rows.length === 0}><FileExcelOutlined /> {t('fmeaPage.exportExcel')}</Button>
      <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('fmeaPage.addItem')}</Button>
    </Space>}>
      {msgCtx}
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          style={{ width: 260 }} value={activePid}
          onChange={setProjectId}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          placeholder={t('fmeaPage.selectProject')}
        />
        <Text type="secondary">{t('fmeaPage.driveNote')}</Text>
      </Space>

      {rows.filter((i) => riskLevel(i.rpn).level === '高').length > 0 && (
        <Alert type="warning" showIcon icon={<WarningOutlined />} style={{ marginBottom: 12 }}
          message={t('fmeaPage.highAlert', { n: highCount })} />
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title={t('fmeaPage.statItems')} value={rows.length} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title={t('fmeaPage.statHigh')} value={highCount} valueStyle={{ color: highCount ? '#cf1322' : undefined }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title={t('fmeaPage.statAvg')} value={avgRpn} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title={t('fmeaPage.statOpen')} value={openCount} /></Card></Col>
      </Row>

      <Space wrap style={{ marginBottom: 12 }}>
        <Text strong>{t('fmeaPage.tplNote')}</Text>
        {templatesFor(projects.find((p) => p.id === activePid)?.sysType).map((tpl) => (
          <Button key={tpl.failureMode} size="small" icon={<CopyOutlined />} onClick={() => addFromTemplate(tpl)}>
            {tpl.process}
          </Button>
        ))}
      </Space>

      <Table<FmeaItem> rowKey="id" size="small" dataSource={rows} columns={cols} pagination={{ pageSize: 10, showTotal: (total) => t('fmeaPage.total', { n: total }) }} scroll={{ x: 1300 }} />

      <Modal open={open} onCancel={() => setOpen(false)} onOk={save} title={editing ? t('fmeaPage.editItem') : t('fmeaPage.addItem')} width={680}>
        <Form form={form} layout="vertical">
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="process" label={t('fmeaPage.process')} rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input placeholder={t('fmeaPage.phProcess')} />
            </Form.Item>
            <Form.Item name="owner" label={t('fmeaPage.owner')} style={{ width: 140 }}>
              <Input placeholder="IT / QA" />
            </Form.Item>
          </Space>
          <Form.Item name="failureMode" label={t('fmeaPage.labelFailureMode')} rules={[{ required: true }]}>
            <Input placeholder={t('fmeaPage.phFailureMode')} />
          </Form.Item>
          <Form.Item name="effect" label={t('fmeaPage.labelEffect')} rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder={t('fmeaPage.phEffect')} />
          </Form.Item>
          <Form.Item name="cause" label={t('fmeaPage.labelCause')} rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder={t('fmeaPage.phCause')} />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="severity" label={t('fmeaPage.labelSeverity')} rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={1} max={10} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="occurrence" label={t('fmeaPage.labelOccurrence')} rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={1} max={10} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="detection" label={t('fmeaPage.labelDetection')} rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={1} max={10} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Alert
            type={riskLevel(liveRpn).level === '高' ? 'error' : riskLevel(liveRpn).level === '中' ? 'warning' : 'success'}
            showIcon style={{ marginBottom: 12 }}
            message={`${t('fmeaPage.rpnLive', { rpn: liveRpn, level: lvLabel(riskLevel(liveRpn).level) })}${riskLevel(liveRpn).level === '高' ? t('fmeaPage.rpnHighReq') : ''}`}
          />
          <Form.Item name="action" label={t('fmeaPage.labelAction')}>
            <Input.TextArea rows={2} placeholder={t('fmeaPage.phAction')} />
          </Form.Item>
          <Form.Item name="linkedTcIds" label={t('fmeaPage.linkTcLabel')}>
            <Select mode="multiple" allowClear placeholder={t('fmeaPage.linkTcPh')}
              options={projectTcs.map((t) => ({ value: t.id, label: `${t.tcId} ${t.title}` }))} />
          </Form.Item>
          {riskLevel(liveRpn).level === '高' && (
            <Alert type="warning" showIcon style={{ marginBottom: 12 }}
              message={t('fmeaPage.highLinkAlert')} />
          )}
        </Form>
      </Modal>

      {/* 条目版本历史 */}
      {histPanel && (
        <EntryHistoryModal entityType="fmea" entityId={histPanel.id!} entityLabel={`RPN-${histPanel.rpn} ${histPanel.failureMode.slice(0, 12)}`}
          open={!!histPanel} onClose={() => setHistPanel(null)} />
      )}

      {/* 通用追溯面板 */}
      {linkPanel && (
        <TraceLinkPanel
          projectId={activePid ?? 0} entityType="fmea" entityId={linkPanel.id!}
          entityLabel={`RPN-${linkPanel.rpn} ${linkPanel.failureMode.slice(0, 12)}`}
          open={!!linkPanel} onClose={() => setLinkPanel(null)}
        />
      )}
    </Card>
  );
}
