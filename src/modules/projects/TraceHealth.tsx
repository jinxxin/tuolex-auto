import { useMemo, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Modal, Select, Form, message, Typography, Alert, Progress, Tooltip, Empty,
} from 'antd';
import { LinkOutlined, CheckCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { createRecord } from '../../core/repo';
import { writeAudit } from '../../core/audit';
import { repairTraceLinks, type RepairResult, type RepairAction } from '../../core/traceRepair';
import { useAuth } from '../../store/auth';
import { useTranslation } from 'react-i18next';
import { V_LAYERS, normalizeVLayer, vLayerLabel } from '../../core/aspice/processes';
import { ENTITY_META, REL_TYPES } from '../../components/TraceLinkPanel';
import type { TraceLink, LinkEntityType } from '../../core/types';

const { Text, Paragraph } = Typography;

// ============ 追溯健康度扫描（A-SPICE 双向追溯 BP 合规检查）============
// 规则（按 V 模型层级）：
//   sys_req  外部来源可无上游，必须有下游（实现/分配/验证覆盖）＋建议验证覆盖
//   sys_arch / sw_req / sw_arch / dd / unit  必须双向（上游 + 下游）
//   sw_req / unit  必须/建议有「验证覆盖」链接（SWE.6 / SWE.4）
//   tc      必须有上游（被需求/单元覆盖）
//   fmea / wp  建议至少一条实体链接（风险缓解 / 关联）

interface LayerRule {
  needUp: boolean;      // 必须有上游来源
  needDown: boolean;    // 必须有下游去向
  needVerify: boolean;  // 必须有「验证覆盖」链接
}

const LAYER_RULES: Record<string, LayerRule> = {
  sys_req: { needUp: false, needDown: true, needVerify: true },
  sys_arch: { needUp: true, needDown: true, needVerify: false },
  sw_req: { needUp: true, needDown: true, needVerify: true },
  sw_arch: { needUp: true, needDown: true, needVerify: false },
  dd: { needUp: true, needDown: true, needVerify: false },
  unit: { needUp: true, needDown: true, needVerify: true },
};

export interface HealthIssue {
  key: string;
  entityType: LinkEntityType;
  entityId: number;
  label: string;        // 编号，如 SW-REQ-004
  title: string;        // 描述
  category: string;     // 分类显示名
  inCount: number;
  outCount: number;
  level: 'error' | 'warning';
  problem: string;      // 问题描述
  hint: string;         // 合规建议
  fix: { direction: 'from' | 'to'; relType: string; targetTypes: FixTarget[] } | null;
}

interface FixTarget {
  type: LinkEntityType;
  label: string;   // 如 软件需求
}

// 各实体「补链」推荐目标与关系（符合 V 链语义）
const FIX_RECOMMEND: Record<string, { direction: 'from' | 'to'; relType: string; targetTypes: FixTarget[] }> = {
  'sys_req:down': { direction: 'to', relType: '实现', targetTypes: [{ type: 'req', label: '系统架构元素（SYS-ARCH）' }, { type: 'tc', label: '测试用例' }] },
  'sys_req:verify': { direction: 'to', relType: '验证覆盖', targetTypes: [{ type: 'tc', label: '测试用例（SYS.5 系统合格性测试）' }] },
  'sys_arch:up': { direction: 'from', relType: '实现', targetTypes: [{ type: 'req', label: '系统需求（SYS-REQ）' }] },
  'sys_arch:down': { direction: 'to', relType: '分配', targetTypes: [{ type: 'req', label: '软件需求（SW-REQ）' }] },
  'sw_req:up': { direction: 'from', relType: '分配', targetTypes: [{ type: 'req', label: '系统架构元素（SYS-ARCH）' }] },
  'sw_req:down': { direction: 'to', relType: '实现', targetTypes: [{ type: 'req', label: '软件架构元素（SW-ARCH）' }, { type: 'tc', label: '测试用例' }] },
  'sw_req:verify': { direction: 'to', relType: '验证覆盖', targetTypes: [{ type: 'tc', label: '测试用例（SWE.6 合格性测试）' }] },
  'sw_arch:up': { direction: 'from', relType: '实现', targetTypes: [{ type: 'req', label: '软件需求（SW-REQ）' }] },
  'sw_arch:down': { direction: 'to', relType: '细化', targetTypes: [{ type: 'req', label: '详细设计（DD）' }] },
  'dd:up': { direction: 'from', relType: '细化', targetTypes: [{ type: 'req', label: '软件架构元素（SW-ARCH）' }] },
  'dd:down': { direction: 'to', relType: '实现', targetTypes: [{ type: 'req', label: '软件单元（UNIT）' }] },
  'unit:up': { direction: 'from', relType: '实现', targetTypes: [{ type: 'req', label: '详细设计（DD）' }] },
  'unit:verify': { direction: 'to', relType: '验证覆盖', targetTypes: [{ type: 'tc', label: '测试用例（SWE.4 单元测试）' }] },
  'tc:up': { direction: 'from', relType: '验证覆盖', targetTypes: [{ type: 'req', label: '需求/单元条目' }, { type: 'fmea', label: 'FMEA 风险' }] },
  'fmea:link': { direction: 'to', relType: '风险缓解', targetTypes: [{ type: 'req', label: '需求条目' }, { type: 'tc', label: '测试用例' }] },
  'wp:link': { direction: 'to', relType: '关联', targetTypes: [{ type: 'req', label: '需求条目' }, { type: 'tc', label: '测试用例' }, { type: 'fmea', label: 'FMEA 风险' }] },
};


interface Props {
  projectId: number;
}

// ============ 追溯健康度扫描面板 ============
export default function TraceHealth({ projectId }: Props) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const layerName = (k: string) => vLayerLabel(V_LAYERS.find((l) => l.key === k), i18n.language);
  const [msg, msgCtx] = message.useMessage();
  const actor = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };

  const reqs = useLiveQuery(() => db.req_items.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const tcs = useLiveQuery(() => db.test_cases.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const fmeas = useLiveQuery(() => db.fmea_items.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const wps = useLiveQuery(() => db.work_products.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const links = useLiveQuery(() => db.trace_links.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];

  // 补链弹窗状态
  const [fixOpen, setFixOpen] = useState(false);
  const [fixIssue, setFixIssue] = useState<HealthIssue | null>(null);
  const [fixForm] = Form.useForm();
  const fixTargetType = Form.useWatch('targetType', fixForm);

  // 一键修复状态
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null);

  // ---- 扫描 ----
  const { issues, summary } = useMemo(() => {
    const issues: HealthIssue[] = [];
    const activeReqs = reqs.filter((r) => r.status !== 'superseded');
    const activeTcs = tcs.filter((t) => t.status !== 'superseded');

    // 链接分组（任意方向）
    const inMap = new Map<string, number>();
    const outMap = new Map<string, number>();
    const verifyFrom = new Set<string>();
    const verifyTo = new Set<string>();
    for (const l of links) {
      const fk = `${l.fromType}:${l.fromId}`;
      const tk = `${l.toType}:${l.toId}`;
      outMap.set(fk, (outMap.get(fk) || 0) + 1);
      inMap.set(tk, (inMap.get(tk) || 0) + 1);
      if (l.relType === '验证覆盖') {
        verifyFrom.add(fk);
        verifyTo.add(tk);
      }
    }
    const inOf = (t: LinkEntityType, id: number) => inMap.get(`${t}:${id}`) || 0;
    const outOf = (t: LinkEntityType, id: number) => outMap.get(`${t}:${id}`) || 0;
    const hasVerify = (t: LinkEntityType, id: number) => verifyFrom.has(`${t}:${id}`) || verifyTo.has(`${t}:${id}`);

    // 需求条目：按 V 层规则检查
    for (const r of activeReqs) {
      const layer = normalizeVLayer(r.reqType);
      const rule = LAYER_RULES[layer];
      const id = r.id!;
      const base = {
        entityType: 'req' as LinkEntityType, entityId: id, label: r.reqId, title: r.desc,
        category: layerName(layer) || t('traceHealth.layerItem'), inCount: inOf('req', id), outCount: outOf('req', id),
      };
      const isolated = base.inCount === 0 && base.outCount === 0;
      if (rule) {
        if (isolated) {
          const rec = FIX_RECOMMEND[`${layer}:down`] || FIX_RECOMMEND['sw_req:down'];
          issues.push({
            ...base, key: `req-${id}-isolated`, level: 'error', problem: '完全孤立：无任何上游/下游追溯链接',
            hint: `${layerName(layer)}条目必须双向可追溯（A-SPICE ${layer === 'sys_req' ? 'SYS.2' : layer === 'sys_arch' ? 'SYS.3' : layer === 'sw_req' ? 'SWE.1' : layer === 'sw_arch' ? 'SWE.2' : 'SWE.3'} BP），补一条下游链即可`,
            fix: { ...rec, relType: layer === 'sys_arch' ? '分配' : '实现' },
          });
        } else {
          if (rule.needUp && base.inCount === 0) {
            const rec = FIX_RECOMMEND[`${layer}:up`];
            issues.push({
              ...base, key: `req-${id}-up`, level: 'error', problem: '缺上游来源（无入链）',
              hint: `应建立与上级条目的追溯（${rec ? rec.relType : '细化/分配'}），满足双向追溯 BP`,
              fix: rec ? { ...rec } : null,
            });
          }
          if (rule.needDown && base.outCount === 0) {
            const rec = FIX_RECOMMEND[`${layer}:down`];
            issues.push({
              ...base, key: `req-${id}-down`, level: 'error', problem: '缺下游去向（无出链）',
              hint: `应建立到下级条目/测试的追溯（${rec ? rec.relType : '实现/验证覆盖'}）`,
              fix: rec ? { ...rec } : null,
            });
          }
          if (rule.needVerify && base.outCount > 0 && !hasVerify('req', id)) {
            const rec = FIX_RECOMMEND[`${layer}:verify`];
            issues.push({
              ...base, key: `req-${id}-verify`, level: 'warning', problem: '无验证覆盖链接',
              hint: layer === 'unit'
                ? '单元应关联单元测试（SWE.4 验证覆盖），建议补链或登记待测'
                : layer === 'sys_req'
                  ? '系统需求应有系统级验证覆盖（SYS.5），建议补链或登记待测'
                  : '软件需求应有验证覆盖（SWE.6），建议补链或登记待测',
              fix: rec ? { ...rec } : null,
            });
          }
        }
      }
    }

    // 测试用例：必须有上游覆盖
    for (const t of activeTcs) {
      const id = t.id!;
      const base = {
        entityType: 'tc' as LinkEntityType, entityId: id, label: t.tcId, title: t.title,
        category: '测试用例', inCount: inOf('tc', id), outCount: outOf('tc', id),
      };
      if (base.inCount === 0 && base.outCount === 0) {
        issues.push({
          ...base, key: `tc-${id}-isolated`, level: 'error', problem: '孤儿测试：无任何追溯链接',
          hint: '无需求/单元支撑的测试建议删除，或建立「验证覆盖」入链（SWE.4/SWE.6/SYS.5 BP）',
          fix: { ...FIX_RECOMMEND['tc:up']! },
        });
      } else if (base.inCount === 0) {
        issues.push({
          ...base, key: `tc-${id}-up`, level: 'error', problem: '缺上游覆盖（无入链）',
          hint: '测试用例应可追溯到被验证的需求/单元（验证覆盖入链）',
          fix: { ...FIX_RECOMMEND['tc:up']! },
        });
      }
    }

    // FMEA：风险应关联需求/测试（A-SPICE 风险分析 → 需求/验证闭环）
    for (const f of fmeas) {
      const id = f.id!;
      const inC = inOf('fmea', id), outC = outOf('fmea', id);
      if (inC === 0 && outC === 0) {
        issues.push({
          key: `fmea-${id}-isolated`, entityType: 'fmea', entityId: id, label: `FMEA-${id}`, title: `${f.process}｜${f.failureMode}`,
          category: 'FMEA 风险', inCount: inC, outCount: outC, level: 'error',
          problem: 'FMEA 完全孤立：未关联任何需求/测试',
          hint: '失效模式应关联到受影响需求（风险缓解）与验证用例（验证控制），形成风险闭环',
          fix: { ...FIX_RECOMMEND['fmea:link']! },
        });
      }
    }

    // 工作产品：建议关联条目（过程关联 ≠ 实体追溯）
    for (const w of wps) {
      const id = w.id!;
      const inC = inOf('wp', id), outC = outOf('wp', id);
      if (inC === 0 && outC === 0) {
        issues.push({
          key: `wp-${id}-isolated`, entityType: 'wp', entityId: id, label: `${w.processCode} ${w.wpCode}`, title: w.title,
          category: '工作产品', inCount: inC, outCount: outC, level: 'warning',
          problem: '工作产品未关联条目',
          hint: '工作产品建议与支撑它的需求/测试条目建「关联」链（审计证据更完整）',
          fix: { ...FIX_RECOMMEND['wp:link']! },
        });
      }
    }

    const errors = issues.filter((i) => i.level === 'error').length;
    const warnings = issues.filter((i) => i.level === 'warning').length;
    const total = activeReqs.length + activeTcs.length + fmeas.length + wps.length;
    const healthy = total - issues.length;
    const healthScore = total ? Math.round(((total - errors) / total) * 100) : 100;
    return { issues, summary: { total, errors, warnings, healthy, healthScore } };
  }, [reqs, tcs, fmeas, wps, links]);

  // ---- 目标条目选项（按类型过滤 + 排除自身）----
  const targetOptions = useMemo(() => {
    if (!fixIssue) return [];
    const list: { value: string; label: string }[] = [];
    if (fixTargetType === 'req') {
      for (const r of reqs) {
        if (fixIssue.entityType === 'req' && r.id === fixIssue.entityId) continue;
        list.push({ value: `req:${r.id}`, label: `${r.reqId} ${r.desc.slice(0, 30)}` });
      }
    } else if (fixTargetType === 'tc') {
      for (const t of tcs) {
        if (fixIssue.entityType === 'tc' && t.id === fixIssue.entityId) continue;
        list.push({ value: `tc:${t.id}`, label: `${t.tcId} ${t.title.slice(0, 30)}` });
      }
    } else if (fixTargetType === 'fmea') {
      for (const f of fmeas) {
        if (fixIssue.entityType === 'fmea' && f.id === fixIssue.entityId) continue;
        list.push({ value: `fmea:${f.id}`, label: `RPN-${f.rpn} ${f.failureMode.slice(0, 30)}` });
      }
    } else if (fixTargetType === 'wp') {
      for (const w of wps) {
        if (fixIssue.entityType === 'wp' && w.id === fixIssue.entityId) continue;
        list.push({ value: `wp:${w.id}`, label: `${w.processCode} ${w.title.slice(0, 30)}` });
      }
    }
    return list;
  }, [fixIssue, fixTargetType, reqs, tcs, fmeas, wps]);

  const openFix = (issue: HealthIssue) => {
    setFixIssue(issue);
    fixForm.resetFields();
    const rec = issue.fix!;
    fixForm.setFieldsValue({ direction: rec.direction, targetType: rec.targetTypes[0].type, relType: rec.relType });
    setFixOpen(true);
  };

  const submitFix = async () => {
    if (!fixIssue) return;
    const v = await fixForm.validateFields();
    const [toType, toIdStr] = (v.target as string).split(':');
    const targetId = Number(toIdStr);
    const relType = v.relType;
    const direction: 'from' | 'to' = v.direction;
    const link: Omit<TraceLink, 'id'> = direction === 'from'
      ? { projectId, fromType: toType as LinkEntityType, fromId: targetId, toType: fixIssue.entityType, toId: fixIssue.entityId, relType, createdAt: Date.now(), createdBy: user?.name || '' }
      : { projectId, fromType: fixIssue.entityType, fromId: fixIssue.entityId, toType: toType as LinkEntityType, toId: targetId, relType, createdAt: Date.now(), createdBy: user?.name || '' };
    // 防重复
    const dup = links.find((l) => l.fromType === link.fromType && l.fromId === link.fromId && l.toType === link.toType && l.toId === link.toId);
    if (dup) { msg.warning(t('traceHealth.dupWarn')); return; }
    await createRecord<TraceLink>('trace_links', link, actor, t('traceHealth.auditFix', { label: fixIssue.label, rel: relType, target: targetId }));
    await writeAudit({
      userId: user?.id ?? 0, username: user?.username ?? 'unknown', action: 'LINK', entityType: 'trace_links', entityId: 0,
      summary: t('traceHealth.auditLog', { label: fixIssue.label, rel: relType, type: toType, target: targetId, problem: fixIssue.problem }),
      before: null, after: { ...link },
    });
    msg.success(t('traceHealth.fixDoneMsg'));
    setFixOpen(false);
  };

  // 一键修复：删除 seed 误建链 + 自动补齐可匹配的追溯关系（幂等，全部留审计）
  const runRepair = async () => {
    if (repairing) return;
    setRepairing(true);
    try {
      const res = await repairTraceLinks(projectId, actor);
      setRepairResult(res);
      if (res.created.length + res.fixed.length > 0) msg.success(t('traceHealth.repairDoneMsg', { fixed: res.fixed.length, created: res.created.length }));
      else if (res.missing.length > 0) msg.info(t('traceHealth.repairNoNewMsg', { missing: res.missing.length }));
    } catch (e) {
      msg.error(t('traceHealth.repairFailMsg', { err: (e as Error).message || e }));
    } finally {
      setRepairing(false);
    }
  };

  const columns = [
    { title: t('traceHealth.colLevel'), width: 70, render: (_: unknown, i: HealthIssue) =>
      i.level === 'error' ? <Tag color="red">{t('traceHealth.lvBlock')}</Tag> : <Tag color="orange">{t('traceHealth.lvSuggest')}</Tag> },
    { title: t('traceHealth.colType'), width: 100, render: (_: unknown, i: HealthIssue) =>
      <Tag color={ENTITY_META[i.entityType].color}>{i.category}</Tag> },
    { title: t('traceHealth.colItem'), width: 150, render: (_: unknown, i: HealthIssue) => (
      <Tooltip title={i.title}><Text strong>{i.label}</Text></Tooltip>
    ) },
    { title: t('traceHealth.colIn'), width: 60, align: 'center' as const, render: (_: unknown, i: HealthIssue) => <Text type={i.inCount ? undefined : 'danger'}>{i.inCount}</Text> },
    { title: t('traceHealth.colOut'), width: 60, align: 'center' as const, render: (_: unknown, i: HealthIssue) => <Text type={i.outCount ? undefined : 'danger'}>{i.outCount}</Text> },
    { title: t('traceHealth.colProblem'), width: 200, render: (_: unknown, i: HealthIssue) => <Text>{i.problem}</Text> },
    { title: t('traceHealth.colAdvice'), render: (_: unknown, i: HealthIssue) => <Text type="secondary" style={{ fontSize: 12 }}>{i.hint}</Text> },
    { title: t('common.actions'), width: 100, render: (_: unknown, i: HealthIssue) => i.fix
      ? <Button size="small" type="primary" ghost icon={<LinkOutlined />} onClick={() => openFix(i)}>{t('traceHealth.quickLink')}</Button>
      : <Text type="secondary" style={{ fontSize: 12 }}>—</Text> },
  ];

  return (
    <div>
      {msgCtx}
      {/* 健康度总览 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space size={32} wrap align="center">
          <div><Text type="secondary">{t('traceHealth.healthLabel')}</Text><div>
            <Progress type="circle" size={64} percent={summary.healthScore}
              strokeColor={summary.healthScore === 100 ? '#2f9e44' : summary.healthScore >= 80 ? '#fa8c16' : '#cf1322'} />
          </div></div>
          <div><Text type="secondary">{t('traceHealth.scanObjects')}</Text><div><Text strong style={{ fontSize: 20 }}>{summary.total}</Text> <Text type="secondary">{t('traceHealth.unitEntities')}</Text></div></div>
          <div><Text type="secondary">{t('traceHealth.fullyHealthy')}</Text><div><Tag color={summary.healthy === summary.total ? 'green' : 'default'}>{t('traceHealth.unitCount', { n: summary.healthy })}</Tag></div></div>
          <div><Text type="secondary">{t('traceHealth.blockIssuesLabel')}</Text><div><Tag color={summary.errors ? 'red' : 'green'}>{t('traceHealth.unitIssues', { n: summary.errors })}</Tag></div></div>
          <div><Text type="secondary">{t('traceHealth.warnIssuesLabel')}</Text><div><Tag color={summary.warnings ? 'orange' : 'green'}>{t('traceHealth.unitIssues', { n: summary.warnings })}</Tag></div></div>
        </Space>
      </Card>

      {issues.length > 0 ? (
        <Alert type={summary.errors ? 'warning' : 'info'} showIcon style={{ marginBottom: 12 }}
          message={summary.errors
            ? t('traceHealth.blockAlert', { n: summary.errors })
            : t('traceHealth.warnAlert', { n: summary.warnings })}
        />
      ) : (
        <Alert type="success" showIcon icon={<CheckCircleOutlined />} style={{ marginBottom: 12 }}
          message={t('traceHealth.goodAlert')} />
      )}

      <Space style={{ marginBottom: 12 }} wrap>
        <Button type="primary" icon={<ThunderboltOutlined />} loading={repairing} onClick={runRepair}>{t('traceHealth.repairBtn')}</Button>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('traceHealth.repairHint')}
        </Text>
      </Space>

      <Table<HealthIssue> rowKey="key" size="small" dataSource={issues} columns={columns}
        pagination={false} locale={{ emptyText: <Empty description={t('traceHealth.emptyTable')} /> }} />

      {/* 一键补链弹窗 */}
      <Modal open={fixOpen} onCancel={() => setFixOpen(false)} onOk={submitFix} okText={t('traceHealth.fixModalOk')}
        title={<Space><LinkOutlined />{t('traceHealth.quickLinkTitle', { label: fixIssue?.label })}</Space>} width={560}>
        {fixIssue && (<>
          <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
            <Paragraph style={{ margin: 0 }}><Text strong>{fixIssue.label}</Text> <Tag color={ENTITY_META[fixIssue.entityType].color}>{fixIssue.category}</Tag></Paragraph>
            <Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0' }}>{fixIssue.title}</Paragraph>
            <Text type="danger" style={{ fontSize: 12 }}>{fixIssue.problem}</Text>
          </Card>
          <Form form={fixForm} layout="vertical">
            <Form.Item name="direction" label={t('traceHealth.dirLabel')} rules={[{ required: true }]}>
              <Select options={[
                { value: 'to', label: t('traceHealth.dirTo') },
                { value: 'from', label: t('traceHealth.dirFrom') },
              ]} />
            </Form.Item>
            <Form.Item name="targetType" label={t('traceHealth.typeLabel')} rules={[{ required: true }]}>
              <Select options={(fixIssue.fix?.targetTypes || []).map((x) => ({ value: x.type, label: x.label }))} />
            </Form.Item>
            <Form.Item name="target" label={t('traceHealth.targetLabel')} rules={[{ required: true, message: t('traceHealth.targetRequired') }]}>
              <Select showSearch optionFilterProp="label" placeholder={t('traceHealth.targetPh')}
                options={targetOptions} notFoundContent={fixTargetType === 'tc' ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('traceHealth.noTcs')} /> : t('traceHealth.noTargets')} />
            </Form.Item>
            <Form.Item name="relType" label={t('traceHealth.relLabel')} rules={[{ required: true }]}>
              <Select options={REL_TYPES.map((r) => ({ value: r, label: r }))} />
            </Form.Item>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('traceHealth.auditNote')}
            </Text>
          </Form>
        </>)}
      </Modal>

      {/* 一键修复结果反馈 */}
      <Modal open={!!repairResult} onCancel={() => setRepairResult(null)} footer={null} width={780}
        title={<Space><CheckCircleOutlined />{t('traceHealth.repairResultTitle')}</Space>}>
        {repairResult && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert type="success" showIcon
              message={t('traceHealth.repairSummary', { created: repairResult.created.length, fixed: repairResult.fixed.length, skipped: repairResult.skipped.length, missing: repairResult.missing.length })} />
            {repairResult.fixed.length > 0 && <RepairSection title={t('traceHealth.secFixed')} data={repairResult.fixed} />}
            {repairResult.created.length > 0 && <RepairSection title={t('traceHealth.secCreated')} data={repairResult.created} />}
            {repairResult.missing.length > 0 && (
              <div>
                <Alert type="warning" showIcon
                  message={t('traceHealth.missingHint')} style={{ marginBottom: 8 }} />
                <RepairSection title={t('traceHealth.secMissing')} data={repairResult.missing} />
              </div>
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
}

// 修复结果分段表格
function RepairSection({ title, data }: { title: string; data: RepairAction[] }) {
  const { t } = useTranslation();
  const cols = [
    { title: t('traceHealth.colFrom'), width: 140, render: (_: unknown, r: RepairAction) => <Text strong>{r.from}</Text> },
    { title: t('traceHealth.colTo'), width: 140, render: (_: unknown, r: RepairAction) => <Text strong>{r.to}</Text> },
    { title: t('traceHealth.colRel'), width: 96, render: (_: unknown, r: RepairAction) => <Tag color="blue">{r.relType}</Tag> },
    { title: t('traceHealth.colNote'), render: (_: unknown, r: RepairAction) => <Text type="secondary" style={{ fontSize: 12 }}>{r.note}</Text> },
  ];
  return (
    <div>
      <Text strong>{title}{t('traceHealth.secCount', { n: data.length })}</Text>
      <Table<RepairAction> size="small" rowKey={(r) => `${r.from}>${r.to}>${r.relType}>${r.note}`}
        dataSource={data} columns={cols} pagination={false} style={{ marginTop: 8 }} />
    </div>
  );
}
