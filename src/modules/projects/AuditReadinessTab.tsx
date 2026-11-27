import { useMemo } from 'react';
import { Card, Table, Tag, Space, Progress, Alert, Button, Typography, Tooltip, message } from 'antd';
import { CheckCircleOutlined, WarningOutlined, CloseCircleOutlined, DownloadOutlined } from '@ant-design/icons';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { useTranslation } from 'react-i18next';
import { V_LAYERS } from '../../core/aspice/processes';
import type { Project } from '../../core/types';

const { Text } = Typography;

// ============ 审计就绪面板（A-SPICE 能力等级 CL2：已管理）============
// 覆盖必要过程：工程过程 SYS.1-5 + SWE.1-6，支持过程 SUP.1/4/7/8/9 + MAN.3。
// 每过程从 5 个维度收集证据：过程执行状态 / 条目（输入） / 测试追溯覆盖 / WP 交付 / 评审记录。
// CL2 关注：过程有管理（PA2.1 绩效管理：计划、监控、报告）+ 工作产品受管理（PA2.2：配置/评审/追溯）。

interface ProcMeta { code: string; name: string; kind: '工程' | '支持' | '管理'; layers: string[]; verify?: boolean }
const PROC_META: ProcMeta[] = [
  { code: 'SYS.1', name: '需求挖掘', kind: '工程', layers: ['user_req'] },
  { code: 'SYS.2', name: '系统需求分析', kind: '工程', layers: ['sys_req'] },
  { code: 'SYS.3', name: '系统架构设计', kind: '工程', layers: ['sys_arch', 'hw_req'] },
  { code: 'SYS.4', name: '系统集成测试', kind: '工程', layers: [], verify: true },
  { code: 'SYS.5', name: '系统合格性测试', kind: '工程', layers: [], verify: true },
  { code: 'SWE.1', name: '软件需求分析', kind: '工程', layers: ['sw_req'] },
  { code: 'SWE.2', name: '软件架构设计', kind: '工程', layers: ['sw_arch'] },
  { code: 'SWE.3', name: '软件详细设计与单元构建', kind: '工程', layers: ['dd', 'unit', 'task'] },
  { code: 'SWE.4', name: '单元验证', kind: '工程', layers: [], verify: true },
  { code: 'SWE.5', name: '软件集成验证', kind: '工程', layers: [], verify: true },
  { code: 'SWE.6', name: '软件合格性测试', kind: '工程', layers: [], verify: true },
  { code: 'SUP.1', name: '质量保证', kind: '支持', layers: [] },
  { code: 'SUP.4', name: '联合评审', kind: '支持', layers: [] },
  { code: 'SUP.7', name: '配置管理', kind: '支持', layers: [] },
  { code: 'SUP.8', name: '问题解决管理', kind: '支持', layers: [] },
  { code: 'SUP.9', name: '变更请求管理', kind: '支持', layers: [] },
  { code: 'MAN.3', name: '项目管理', kind: '管理', layers: [] },
];

const ST = { ok: 'ok', partial: 'partial', miss: 'miss' } as const;
type St = (typeof ST)[keyof typeof ST];

// 展示用 labelKey 映射（由组件内 t() 解析成当前语言）
const KIND_LABEL: Record<ProcMeta['kind'], string> = {
  '工程': 'auditReady.kindEng',
  '支持': 'auditReady.kindSup',
  '管理': 'auditReady.kindMgmt',
};
const ST_LABEL: Record<string, string> = {
  not_started: 'auditReady.stNotStarted',
  in_progress: 'auditReady.stInProgress',
  assessed: 'auditReady.stAssessed',
};

export default function AuditReadinessTab({ project }: { project: Project }) {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.toLowerCase().startsWith('en');
  const [msg, msgCtx] = message.useMessage();
  const pid = project.id!;

  const reqs = useLiveQuery(() => db.req_items.where('projectId').equals(pid).filter((r) => !r.aiBatch).toArray(), [pid]) ?? [];
  const tcs = useLiveQuery(() => db.test_cases.where('projectId').equals(pid).filter((t) => !t.aiBatch).toArray(), [pid]) ?? [];
  const links = useLiveQuery(() => db.trace_links.where('projectId').equals(pid).toArray(), [pid]) ?? [];
  const wps = useLiveQuery(() => db.work_products.where('projectId').equals(pid).toArray(), [pid]) ?? [];
  const reviews = useLiveQuery(() => db.reviews.where('projectId').equals(pid).toArray(), [pid]) ?? [];
  const ccs = useLiveQuery(() => db.change_controls.where('projectId').equals(pid).toArray(), [pid]) ?? [];
  const devs = useLiveQuery(() => db.deviations.where('projectId').equals(pid).toArray(), [pid]) ?? [];
  const docs = useLiveQuery(() => db.documents.where('projectId').equals(pid).toArray(), [pid]) ?? [];

  const processStatus = project.processStatus ?? {};

  // req → 测试覆盖（验证覆盖 relType）
  const reqCovered = useMemo(() => {
    const set = new Set<number>();
    for (const l of links) {
      if (l.fromType === 'req' && l.toType === 'tc' && l.relType?.includes('验证覆盖')) set.add(l.fromId);
      if (l.toType === 'req' && l.fromType === 'tc' && l.relType?.includes('验证覆盖')) set.add(l.toId);
    }
    return set;
  }, [links]);

  const rows = useMemo(() => PROC_META.map((p) => {
    const st = processStatus[p.code] ?? 'not_started';
    const layerItems = p.layers.length ? reqs.filter((r) => {
      const k = V_LAYERS.find((l) => l.key === normalize(r.reqType))?.key;
      return p.layers.includes(k ?? '');
    }) : [];
    const covered = layerItems.filter((r) => reqCovered.has(r.id!)).length;
    const covPct = layerItems.length ? Math.round((covered / layerItems.length) * 100) : 0;
    const wpCount = wps.filter((w) => w.processCode === p.code).length;
    const reviewCount = reviews.filter((r) => r.processCode === p.code).length;
    // 验证过程：看测试执行率（全项目 TC）
    const execPct = tcs.length ? Math.round((tcs.filter((t) => t.result !== 'not_run').length / tcs.length) * 100) : 0;
    // 就绪判定
    let state: St;
    if (p.verify) {
      state = execPct >= 80 ? ST.ok : execPct > 0 ? ST.partial : ST.miss;
    } else if (p.layers.length) {
      const hasInput = layerItems.length > 0;
      const managed = st === 'in_progress' || st === 'assessed';
      state = hasInput && covPct >= 80 && managed ? ST.ok : hasInput && (covPct > 0 || managed) ? ST.partial : ST.miss;
    } else {
      // 支持/管理过程：有 WP 或记录即视为已启动
      const evidence = wpCount + reviewCount + (p.code === 'SUP.8' ? devs.length : 0) + (p.code === 'SUP.9' ? ccs.length : 0) + (p.code === 'SUP.4' ? reviewCount : 0) + (p.code === 'SUP.7' ? docs.length : 0);
      state = evidence > 0 ? ST.ok : ST.partial;
    }
    return {
      code: p.code, name: p.name, kind: p.kind, st, layerItems: layerItems.length,
      covPct: p.verify ? execPct : covPct, wpCount, reviewCount, state,
    };
  }), [processStatus, reqs, reqCovered, wps, reviews, tcs, ccs, devs, docs]);

  const stateCount = useMemo(() => {
    const c = { ok: 0, partial: 0, miss: 0 };
    for (const r of rows) c[r.state]++;
    return c;
  }, [rows]);
  const readiness = rows.length ? Math.round((stateCount.ok / rows.length) * 100) : 0;

  const issues = rows.filter((r) => r.state !== 'ok');

  const exportMd = () => {
    const lines: string[] = [];
    lines.push(t('auditReady.expTitle'));
    lines.push('');
    lines.push(t('auditReady.expProj', { name: project.name }));
    lines.push(t('auditReady.expStd', { std: project.stdVersion, n: (project.processScope || []).length }));
    lines.push(t('auditReady.expGen', { time: new Date().toLocaleString(isEn ? 'en-US' : 'zh-CN') }));
    lines.push(t('auditReady.expReady', { pct: readiness, ok: stateCount.ok, total: rows.length }));
    lines.push('');
    lines.push(`| ${[t('auditReady.colProcess'), t('auditReady.colName'), t('auditReady.colKind'), t('auditReady.colStatus'), t('auditReady.colItems'), t('auditReady.colCov'), 'WP', t('auditReady.colRev'), t('auditReady.colReady')].join(' | ')} |`);
    lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
    for (const r of rows) {
      lines.push(`| ${r.code} | ${r.name} | ${t(KIND_LABEL[r.kind])} | ${t(ST_LABEL[r.st])} | ${r.layerItems} | ${r.covPct}% | ${r.wpCount} | ${r.reviewCount} | ${r.state === 'ok' ? '✅' : r.state === 'partial' ? '⚠️' : '❌'} |`);
    }
    lines.push('');
    if (issues.length) {
      lines.push(t('auditReady.expOpen', { n: issues.length }));
      lines.push('');
      for (const r of issues) lines.push(t('auditReady.expOpenItem', {
        code: r.code, name: r.name,
        missing: r.state === 'miss' ? t('auditReady.wordMissing') : t('auditReady.wordPartial'),
        cov: r.covPct, wp: r.wpCount, rev: r.reviewCount,
      }));
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${t('auditReady.expFilePrefix')}_${project.name}_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    msg.success(t('auditReady.exported'));
  };

  return (
    <div>
      {msgCtx}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space size={24} wrap align="center">
          <div style={{ width: 120 }}>
            <Progress type="circle" percent={readiness} size={88} strokeColor={readiness >= 80 ? '#2f9e44' : readiness >= 50 ? '#fa8c16' : '#cf1322'} format={(p) => `${p}%`} />
          </div>
          <div style={{ flex: 1, minWidth: 320 }}>
            <Text strong style={{ fontSize: 15 }}>{t('auditReady.title')}</Text>
            <div style={{ marginTop: 6 }}>
              <Tag color="green">{t('auditReady.tagOk', { n: stateCount.ok })}</Tag>
              <Tag color="orange">{t('auditReady.tagPartial', { n: stateCount.partial })}</Tag>
              <Tag color="red">{t('auditReady.tagMiss', { n: stateCount.miss })}</Tag>
            </div>
            <Text type="secondary" style={{ fontSize: 12.5, display: 'block', marginTop: 4 }}>
              {t('auditReady.desc')}
            </Text>
          </div>
          <Button icon={<DownloadOutlined />} onClick={exportMd}>{t('auditReady.exportBtn')}</Button>
        </Space>
      </Card>

      {issues.length > 0 && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 12 }}
          message={t('auditReady.alert', { n: issues.length, miss: issues.filter((i) => i.state === 'miss').length })}
          description={<span>{issues.slice(0, 6).map((r) => `${r.code} ${r.name}`).join(isEn ? ', ' : '、')}{issues.length > 6 ? t('auditReady.alertMore', { n: issues.length }) : ''}</span>}
        />
      )}

      <Table
        rowKey="code" size="small" pagination={false}
        dataSource={rows}
        columns={[
          { title: t('auditReady.colProcess'), width: 90, render: (_, r) => <Text strong style={{ color: '#0b2545' }}>{r.code}</Text> },
          { title: t('auditReady.colName'), dataIndex: 'name', render: (v, r) => <Space size={6}><Tag color={r.kind === '工程' ? 'blue' : r.kind === '支持' ? 'cyan' : 'geekblue'} style={{ fontSize: 10 }}>{t(KIND_LABEL[r.kind])}</Tag>{v}</Space> },
          { title: t('auditReady.colStatus'), width: 100, render: (_, r) => {
            const m: Record<string, { color: string }> = { not_started: { color: 'default' }, in_progress: { color: 'blue' }, assessed: { color: 'green' } };
            const mm = m[r.st] ?? m.not_started;
            return <Tag color={mm.color}>{t(ST_LABEL[r.st])}</Tag>;
          } },
          { title: t('auditReady.colItems'), width: 70, align: 'right', render: (_, r) => (r.layerItems ? <Text strong>{r.layerItems}</Text> : <Text type="secondary">—</Text>) },
          { title: t('auditReady.colCov'), width: 110, render: (_, r) => (
            <Tooltip title={r.covPct >= 80 ? t('auditReady.covOk') : t('auditReady.covLow')}>
              <Progress percent={r.covPct} size="small" strokeColor={r.covPct >= 80 ? '#2f9e44' : r.covPct > 0 ? '#fa8c16' : '#cf1322'} format={() => `${r.covPct}%`} />
            </Tooltip>
          ) },
          { title: 'WP', width: 60, align: 'right', render: (_, r) => (r.wpCount ? <Tag color="geekblue">{r.wpCount}</Tag> : <Text type="secondary">0</Text>) },
          { title: t('auditReady.colRev'), width: 60, align: 'right', render: (_, r) => (r.reviewCount ? <Tag color="purple">{r.reviewCount}</Tag> : <Text type="secondary">0</Text>) },
          { title: t('auditReady.colReady'), width: 90, render: (_, r) => r.state === 'ok'
            ? <Tag icon={<CheckCircleOutlined />} color="success">{t('auditReady.stateOk')}</Tag>
            : r.state === 'partial' ? <Tag icon={<WarningOutlined />} color="warning">{t('auditReady.statePartial')}</Tag> : <Tag icon={<CloseCircleOutlined />} color="error">{t('auditReady.stateMiss')}</Tag> },
        ]}
      />
    </div>
  );
}

function normalize(t?: string): string {
  if (!t) return 'other';
  if (t === 'sys') return 'sys_req';
  if (t === 'sw') return 'sw_req';
  return t;
}
