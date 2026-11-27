import { useMemo, useState } from 'react';
import { fsPidFromUrl } from './projectLink';
import {
  Card, Row, Col, Statistic, Tag, Button, Space, Typography, Select, Alert, Progress, message, Dropdown, Table,
} from 'antd';
import {
  ThunderboltOutlined, DownloadOutlined, SafetyOutlined, ExperimentOutlined, FileProtectOutlined,
  SolutionOutlined, ScheduleOutlined, ApartmentOutlined, WarningOutlined, QuestionCircleOutlined, FileWordOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from '../../core/api';
import { useAuth } from '../../store/auth';
import { db } from '../../core/db';
import { findGaps } from '../../core/fs/chain';
import { exportFsAuditBundle } from '../../core/fs/auditBundle';
import { exportFsReport, type FsReportKind } from '../../core/fs/fsReport';
import HelpDrawer from './HelpDrawer';
import { ASIL_TAG_TEXT, ASIL_COLOR } from '../../core/fs/data';
import type { FsAsil, AuditLog } from '../../core/types';

const { Title, Text } = Typography;

// M5：EasyFuSa 域驾驶舱（各模块状态聚合 + 一键审计包导出）
export default function OverviewPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [msg, msgCtx] = message.useMessage();
  const [activePid, setActivePid] = useState<number | undefined>(undefined);
  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? [];
  const fsProjects = useMemo(() => projects.filter((p) => p.fsEnabled), [projects]);
  const pid = fsPidFromUrl(fsProjects.map((p) => p.id!), activePid);
  const pname = projects.find((p) => p.id === pid)?.name ?? '';

  const hazards = useLiveQuery(() => (pid != null ? db.fs_hazards.where('projectId').equals(pid).toArray() : Promise.resolve([])), [pid]) ?? [];
  const reqs = useLiveQuery(() => (pid != null ? db.fs_safety_reqs.where('projectId').equals(pid).toArray() : Promise.resolve([])), [pid]) ?? [];
  const fmedas = useLiveQuery(() => (pid != null ? db.fs_fmeda.where('projectId').equals(pid).toArray() : Promise.resolve([])), [pid]) ?? [];
  const ftas = useLiveQuery(() => (pid != null ? db.fs_fta.where('projectId').equals(pid).toArray() : Promise.resolve([])), [pid]) ?? [];
  const dfas = useLiveQuery(() => (pid != null ? db.fs_dfa.where('projectId').equals(pid).toArray() : Promise.resolve([])), [pid]) ?? [];
  const cases = useLiveQuery(() => (pid != null ? db.fs_safety_cases.where('projectId').equals(pid).toArray() : Promise.resolve([])), [pid]) ?? [];
  const confirms = useLiveQuery(() => (pid != null ? db.fs_confirm_measures.where('projectId').equals(pid).toArray() : Promise.resolve([])), [pid]) ?? [];
  const plans = useLiveQuery(() => (pid != null ? db.fs_plan_items.where('projectId').equals(pid).toArray() : Promise.resolve([])), [pid]) ?? [];
  const reports = useLiveQuery(() => (pid != null ? db.fs_reports.where('projectId').equals(pid).toArray() : Promise.resolve([])), [pid]) ?? [];

  // 聚合指标
  const m = useMemo(() => {
    const chainGaps = findGaps(reqs);
    const caseGaps = cases.flatMap((c) => (c.gaps || []).map((g) => ({ case: c.title, ...g })));
    const asilDist: Record<FsAsil, number> = { QM: 0, A: 0, B: 0, C: 0, D: 0 };
    for (const h of hazards) asilDist[h.asil] = (asilDist[h.asil] ?? 0) + 1;
    const fmedaPass = fmedas.filter((f) => f.metrics?.verdict === 'pass').length;
    const fmedaFail = fmedas.filter((f) => f.metrics?.verdict === 'fail').length;
    const dfaTotal = dfas.reduce((s, d) => s + (d.rows ?? []).length, 0);
    const decompCodes = reqs.filter((r) => r.asilDecomposed).map((r) => r.code);
    const dfaAllText = dfas.flatMap((d) => (d.rows ?? []).map((r) => `${r.refA} ${r.refB}`).join(' ')).join(' ');
    const decompCovered = decompCodes.filter((c) => dfaAllText.includes(c)).length;
    const solTotal = cases.reduce((s, c) => s + (c.nodes ?? []).filter((n) => n.kind === 'solution').length, 0);
    const solLinked = cases.reduce((s, c) => s + (c.nodes ?? []).filter((n) => n.kind === 'solution' && n.evidenceRef).length, 0);
    const confirmed = hazards.filter((h) => h.status === 'confirmed').length;
    const sgLinked = hazards.filter((h) => h.status === 'confirmed' && h.sgId != null).length;
    return {
      chainGaps, caseGaps, asilDist, fmedaPass, fmedaFail, dfaTotal, decompCovered, decompCodes,
      solTotal, solLinked, confirmed, sgLinked,
      haraDone: hazards.length ? Math.round((confirmed / hazards.length) * 100) : 0,
      chainDone: reqs.length ? Math.round((reqs.filter((r) => r.status !== 'draft').length / reqs.length) * 100) : 0,
      planDone: plans.length ? Math.round((plans.filter((p) => p.status === 'done' || p.status === 'na').length / plans.length) * 100) : 0,
    };
  }, [hazards, reqs, fmedas, ftas, dfas, cases, confirms, plans]);

  const doExport = async () => {
    const { writeAudit } = await import('../../core/audit');
    // 审计轨迹按 fs 实体逐表拉取（列表接口升序截断 500 的坑）
    const tables = ['fs_hazards', 'fs_safety_reqs', 'fs_fmeda', 'fs_fta', 'fs_dfa', 'fs_safety_cases', 'fs_confirm_measures', 'fs_plan_items'] as const;
    const audit: AuditLog[] = [];
    for (const tb of tables) {
      const logs = (await db.audit_logs.where('entityType').equals(tb).toArray()) as unknown as AuditLog[];
      audit.push(...logs);
    }
    await exportFsAuditBundle({
      projectId: pid!, projectName: pname, hazards, reqs, fmedas, ftas, dfas, cases, confirms, plans, audit,
    });
    await writeAudit({ userId: user?.id ?? 0, username: user?.username ?? 'unknown', action: 'EXPORT', entityType: 'fs_safety_cases', entityId: pid ?? 0, summary: `导出 EasyFuSa 审计包（${pname}）`, before: null, after: null });
    msg.success(t('chainPage.exportDone') || '审计包已导出');
  };

  const doReport = async (kind: FsReportKind) => {
    if (pid == null) return;
    await exportFsReport(kind, {
      projectId: pid, projectName: pname, hazards, reqs, fmedas, ftas, dfas, cases, confirms, plans,
      author: { id: user?.id ?? 0, username: user?.username ?? 'unknown', name: user?.name ?? '' },
    });
    msg.success(t('fsReport.done'));
  };

  const noFs = fsProjects.length === 0;
  const [helpOpen, setHelpOpen] = useState(false);
  const chainGapN = m.chainGaps.length;
  const caseGapN = m.caseGaps.length;

  return (
    <Card>
      {msgCtx}
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Row align="middle" gutter={16}>
          <Col flex="auto">
            <Space align="center">
              <ThunderboltOutlined style={{ fontSize: 22, color: '#1b6ca8' }} />
              <Title level={4} style={{ margin: 0 }}>EasyFuSa · {t('fs.brand')}</Title>
              <Tag color="purple">ISO 26262:2018</Tag>
              <Tag color="blue">{pname}</Tag>
            </Space>
            <div><Text type="secondary">{t('fsOverview.desc')}</Text></div>
          </Col>
          <Col>
            {!noFs && (
              <Space>
                <Select style={{ width: 240 }} value={pid} onChange={setActivePid} options={fsProjects.map((p) => ({ value: p.id!, label: p.name }))} />
                <Button icon={<QuestionCircleOutlined />} aria-label="fs-help" onClick={() => setHelpOpen(true)}>{t('fsHelp.open')}</Button>
                <Button type="primary" icon={<DownloadOutlined />} disabled={!hazards.length && !reqs.length} onClick={doExport}>{t('fsOverview.exportBundle')}</Button>
                <Dropdown trigger={['click']} menu={{
                  items: [
                    { key: 'hara', label: t('fsReport.hara') },
                    { key: 'fsc-tsc', label: t('fsReport.fscTsc') },
                    { key: 'fmeda', label: t('fsReport.fmeda') },
                    { key: 'safety-case', label: t('fsReport.safetyCase') },
                  ],
                  onClick: ({ key }) => doReport(key as FsReportKind),
                }}>
                  <Button icon={<FileWordOutlined />} disabled={!hazards.length && !reqs.length}>{t('fsReport.genBtn')}</Button>
                </Dropdown>
              </Space>
            )}
          </Col>
        </Row>

        {noFs && <Alert type="warning" showIcon message={t('fs.noProject')} />}
        {!noFs && pid != null && (
          <>
            {/* 概念阶段 */}
            <Row gutter={12}>
              <Col span={6}><Card size="small" title={`① ${t('fsOverview.stage1')}`}>
                <Row>
                  <Col span={12}><Statistic title={t('haraPage.statTotal')} value={hazards.length} valueStyle={{ fontSize: 20 }} /></Col>
                  <Col span={12}><Statistic title={t('fsOverview.confirmed2Sg')} value={`${m.confirmed}/${m.sgLinked}`} valueStyle={{ fontSize: 20 }} /></Col>
                </Row>
                <Progress percent={m.haraDone} size="small" status={m.haraDone === 100 ? 'success' : 'active'} />
                <Space size={2} style={{ marginTop: 4 }}>
                  {(['D', 'C', 'B', 'A', 'QM'] as FsAsil[]).map((a) => m.asilDist[a] > 0 && <Tag key={a} color={ASIL_COLOR[a]}>{ASIL_TAG_TEXT[a]} {m.asilDist[a]}</Tag>)}
                </Space>
              </Card></Col>
              <Col span={6}><Card size="small" title={`② ${t('fsOverview.stage2')}`}>
                <Row>
                  <Col span={6}><Statistic title="SG" value={reqs.filter((r) => r.kind === 'SG').length} valueStyle={{ fontSize: 18 }} /></Col>
                  <Col span={6}><Statistic title="FSC" value={reqs.filter((r) => r.kind === 'FSC').length} valueStyle={{ fontSize: 18 }} /></Col>
                  <Col span={6}><Statistic title="TSC" value={reqs.filter((r) => r.kind === 'TSC').length} valueStyle={{ fontSize: 18 }} /></Col>
                  <Col span={6}><Statistic title={t('fsOverview.swhw')} value={reqs.filter((r) => ['HW_SR', 'SW_SR', 'SYSTEM_SR', 'HSI'].includes(r.kind)).length} valueStyle={{ fontSize: 18 }} /></Col>
                </Row>
                <Progress percent={m.chainDone} size="small" />
                <div style={{ marginTop: 4 }}>{chainGapN > 0 ? <Tag color="red"><WarningOutlined /> {t('fsOverview.chainGap', { n: chainGapN })}</Tag> : <Tag color="green">{t('fsOverview.chainOk')}</Tag>}</div>
              </Card></Col>
              <Col span={6}><Card size="small" title={`③ ${t('fsOverview.stage3')}`}>
                <Row>
                  <Col span={12}><Statistic title={t('fsOverview.fmedaPass')} value={`${m.fmedaPass}/${fmedas.length}`} valueStyle={{ fontSize: 20, color: '#52c41a' }} /></Col>
                  <Col span={12}><Statistic title={t('fsOverview.fail')} value={m.fmedaFail} valueStyle={{ fontSize: 20, color: m.fmedaFail ? '#cf1322' : undefined }} /></Col>
                </Row>
                <Row style={{ marginTop: 6 }}>
                  <Col span={12}><Text style={{ fontSize: 12 }}>FTA {ftas.length} · DFA {m.dfaTotal}</Text></Col>
                  <Col span={12}><Text style={{ fontSize: 12 }}>{t('fsOverview.decompCov')} {m.decompCovered}/{m.decompCodes.length}</Text></Col>
                </Row>
              </Card></Col>
              <Col span={6}><Card size="small" title={`④ ${t('fsOverview.stage4')}`}>
                <Row>
                  <Col span={12}><Statistic title={t('fsOverview.caseEv')} value={`${m.solLinked}/${m.solTotal}`} valueStyle={{ fontSize: 20 }} /></Col>
                  <Col span={12}><Statistic title={t('fsOverview.confirmM')} value={confirms.filter((c) => c.status === 'closed').length + '/' + confirms.length} valueStyle={{ fontSize: 20 }} /></Col>
                </Row>
                <Progress percent={m.planDone} size="small" style={{ marginTop: 6 }} />
                <div style={{ marginTop: 4 }}>
                  {caseGapN > 0 ? <Tag color="orange"><WarningOutlined /> {t('fsOverview.caseLb')} {caseGapN}</Tag> : <Tag color="green">{t('fsOverview.caseGap0')}</Tag>}
                  <Tag>{plans.filter((p) => p.status === 'na').length} {t('fsOverview.naCut')}</Tag>
                </div>
              </Card></Col>
            </Row>

            {/* 缺口速览 + 工具入口 */}
            <Row gutter={12}>
              <Col span={12}>
                <Card size="small" title={<Space><SafetyOutlined /> {t('fsOverview.todo')}</Space>} extra={<Text type="secondary" style={{ fontSize: 12 }}>{t('fsOverview.todoHint')}</Text>}>
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    {chainGapN === 0 && caseGapN === 0 && <Text type="success">{t('fsOverview.allOk')}</Text>}
                    {m.chainGaps.slice(0, 3).map((g, i) => <div key={`c${i}`} style={{ cursor: 'pointer' }} onClick={() => { window.location.hash = '#/fs/safety-chain'; }}><WarningOutlined style={{ color: '#cf1322', marginRight: 6 }} /><Text style={{ fontSize: 13 }}>{t('fsOverview.chainLb')}：{g.node.code} — {t(`chainPage.gap${g.kind === 'no_verify' ? 'NoVerify' : g.kind === 'no_leaf' ? 'NoLeaf' : g.kind === 'no_tsc' ? 'NoTsc' : g.kind === 'no_fsc' ? 'NoFsc' : 'NoFsc'}`)}</Text></div>)}
                    {m.caseGaps.slice(0, 3).map((g, i) => <div key={`s${i}`} style={{ cursor: 'pointer' }} onClick={() => { window.location.hash = '#/fs/safety-case'; }}><WarningOutlined style={{ color: '#fa8c16', marginRight: 6 }} /><Text style={{ fontSize: 13 }}>{t('fsOverview.caseLb')}：{g.case} — {g.nodeId}</Text></div>)}
                    {hazards.filter((h) => h.status === 'confirmed' && h.sgId == null).length > 0 && (
                      <div style={{ cursor: 'pointer' }} onClick={() => { window.location.hash = '#/fs/hara'; }}><WarningOutlined style={{ color: '#fa8c16', marginRight: 6 }} /><Text style={{ fontSize: 13 }}>{hazards.filter((h) => h.status === 'confirmed' && h.sgId == null).length} {t('fsOverview.haraNoSg')}</Text></div>
                    )}
                  </Space>
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" title={<Space><ApartmentOutlined /> {t('fsOverview.modules')}</Space>}>
                  <Row gutter={[8, 8]}>
                    {[
                      { icon: <AlertIcon />, label: 'HARA', to: '/fs/hara', n: hazards.length },
                      { icon: <ApartmentOutlined />, label: t('menu.fsSafetyChain'), to: '/fs/safety-chain', n: reqs.length },
                      { icon: <ExperimentOutlined />, label: t('menu.fsAnalysis'), to: '/fs/analysis', n: fmedas.length + ftas.length + dfas.length },
                      { icon: <FileProtectOutlined />, label: t('menu.fsSafetyCase'), to: '/fs/safety-case', n: cases.length },
                      { icon: <SolutionOutlined />, label: t('menu.fsConfirm'), to: '/fs/confirm', n: confirms.length },
                      { icon: <ScheduleOutlined />, label: t('menu.fsPlan'), to: '/fs/plan', n: plans.length },
                    ].map((e) => (
                      <Col span={8} key={e.label}>
                        <Card size="small" hoverable onClick={() => { window.location.hash = `#/${e.to}`; }}>
                          <Space>{e.icon}<Text style={{ fontSize: 13 }}>{e.label}</Text><Tag>{e.n}</Tag></Space>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                </Card>
              </Col>
            </Row>

            {/* 正式评估报告台账（导出即冻结） */}
            <Row gutter={12}>
              <Col span={24}>
                <Card size="small" title={<Space><FileWordOutlined /> {t('fsReport.ledger')}</Space>}
                  extra={<Text type="secondary" style={{ fontSize: 12 }}>{t('fsReport.ledgerHint')}</Text>}>
                  {reports.length === 0
                    ? <Text type="secondary">{t('fsReport.empty')}</Text>
                    : <Table size="small" rowKey={(r) => r.id ?? 0} pagination={false}
                        dataSource={[...reports].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))}
                        columns={[
                          { title: t('fsReport.colKind'), dataIndex: 'kind', key: 'kind', width: 130, render: (k: string) => <Tag color="purple">{k}</Tag> },
                          { title: t('fsReport.colTitle'), dataIndex: 'title', key: 'title' },
                          { title: t('fsReport.colNo'), dataIndex: 'reportNo', key: 'reportNo', width: 230 },
                          { title: t('fsReport.colVersion'), dataIndex: 'version', key: 'version', width: 90 },
                          { title: t('fsReport.colHash'), dataIndex: 'snapshotHash', key: 'hash', width: 160, render: (v: string) => <Text code style={{ fontSize: 12 }}>{(v || '').slice(0, 16)}…</Text> },
                          { title: t('fsReport.colCreated'), dataIndex: 'createdAt', key: 'createdAt', width: 150, render: (v: number) => <Text type="secondary" style={{ fontSize: 12 }}>{v ? dayjs(v).format('YYYY-MM-DD HH:mm') : ''}</Text> },
                        ]} />}
                </Card>
              </Col>
            </Row>
          </>
        )}
      </Space>
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </Card>
  );
}

// 避免重复 import 冲突的小图标包装
import { AlertOutlined as AlertIcon } from '@ant-design/icons';
