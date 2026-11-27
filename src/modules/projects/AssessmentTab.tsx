import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, Table, Tag, Space, Button, Drawer, Modal, Typography, Alert, Select, Radio, Input, Segmented, Row, Col, Tooltip, message, Popconfirm, Empty } from 'antd';
import { AimOutlined, RadarChartOutlined, HistoryOutlined, DownloadOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import * as echarts from 'echarts';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { updateRecord } from '../../core/repo';
import { useAuth } from '../../store/auth';
import { useTranslation } from 'react-i18next';
import { CAPABILITY_LEVELS, PA_NAMES, PA_RATINGS, PROCESS_GROUPS } from '../../core/aspice/processes';
import type { Assessment, AspiceProcess, PaRating, Project, WorkProduct, ReviewRecord } from '../../core/types';

const { Text, Paragraph } = Typography;

// ============ 能力等级评估工作台（A-SPICE PAM：CL0-5 × PA × N/P/L/F）============
// 参考 Aspice-Audit 交互：热力图总览 + 雷达图报告 + 多轮评估趋势。
// 评分规则（ISO/IEC 33020 风格）：PA 评分 N=0/P=1/L=2/F=3；
// 达成某 CL = 该级全部 PA ≥ L(2)，且逐级累积（CL2 达成需先达成 CL1）。

const PA_SCORE: Record<PaRating, number> = { N: 0, P: 1, L: 2, F: 3 };

// 目标等级 → 需评分的 PA 集合（累积：CL2 = PA1.1 + PA2.1 + PA2.2）
function paOfLevel(level: number): readonly string[] {
  const cl = CAPABILITY_LEVELS.find((c) => c.level === level);
  return (cl && 'pa' in cl && cl.pa) || [];
}

function paScopeOf(level: number): string[] {
  const pas: string[] = [];
  for (let l = 1; l <= level; l++) pas.push(...paOfLevel(l));
  return pas;
}

// 计算达成等级（逐级累积判定）
function calcAchieved(scores: Record<string, PaRating>): number {
  let achieved = 0;
  for (let l = 1; l <= 5; l++) {
    const pa = paOfLevel(l);
    if (!pa.length) continue;
    const allPass = pa.every((p) => (PA_SCORE[scores[p] ?? 'N'] ?? 0) >= 2);
    if (!allPass) break;
    achieved = l;
  }
  return achieved;
}

function paAvg(scores: Record<string, PaRating>): number {
  const vals = Object.values(scores).map((v) => PA_SCORE[v] ?? 0);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// 多轮评估的 PA 评分对比矩阵（行=PA，列=轮次，首轮/末轮自动变化标记）
function paCompareRows(assessments: Assessment[]): { pa: string; r0?: PaRating; rN?: PaRating; [k: string]: unknown }[] {
  if (!assessments.length) return [];
  const first = assessments[0];
  const last = assessments[assessments.length - 1];
  const paSet = new Set<string>();
  for (const a of assessments) for (const pa of Object.keys(a.scores || {})) paSet.add(pa);
  return Array.from(paSet).map((pa) => {
    const row: { pa: string; r0?: PaRating; rN?: PaRating; [k: string]: unknown } = { pa };
    assessments.forEach((a, i) => { row[`r${i}`] = a.scores?.[pa]; });
    row.r0 = first.scores?.[pa];
    row.rN = last.scores?.[pa];
    return row;
  });
}

// 未达标 PA 的改进建议（缺口驱动，文案按语言取 key）
const ADVICE_KEYS: Record<string, string> = {
  'PA1.1': 'assess.advice.PA1.1',
  'PA2.1': 'assess.advice.PA2.1',
  'PA2.2': 'assess.advice.PA2.2',
  'PA3.1': 'assess.advice.PA3.1',
  'PA3.2': 'assess.advice.PA3.2',
  'PA4.1': 'assess.advice.PA4.1',
  'PA4.2': 'assess.advice.PA4.2',
  'PA5.1': 'assess.advice.PA5.1',
  'PA5.2': 'assess.advice.PA5.2',
};

interface Props { project: Project }

export default function AssessmentTab({ project }: Props) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.toLowerCase().startsWith('en');
  const actor = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };
  const pid = project.id!;
  const [msg, msgCtx] = message.useMessage();

  const processes = useLiveQuery(
    () => db.aspice_processes.where('stdVersion').equals(project.stdVersion).toArray(),
    [project.stdVersion],
  ) ?? [];
  const assessments = useLiveQuery(() => db.assessments.where('projectId').equals(pid).toArray(), [pid]) ?? [];
  const wps = useLiveQuery(() => db.work_products.where('projectId').equals(pid).toArray(), [pid]) ?? [];
  const reviews = useLiveQuery(() => db.reviews.where('projectId').equals(pid).toArray(), [pid]) ?? [];

  const [workbench, setWorkbench] = useState<AspiceProcess | null>(null);   // 评估工作台
  const [report, setReport] = useState<Assessment | null>(null);            // 单轮评估报告
  const [trend, setTrend] = useState<AspiceProcess | null>(null);           // 历史趋势抽屉

  const byCode = useMemo(() => {
    const m: Record<string, AspiceProcess> = {};
    for (const p of processes) m[p.code] = p;
    return m;
  }, [processes]);

  const scope = project.processScope || [];
  const pStatus = project.processStatus || {};

  // 每过程最新一次评估（热力图/总览用）
  const latestByProc = useMemo(() => {
    const m: Record<string, Assessment> = {};
    for (const a of assessments) {
      const cur = m[a.processCode];
      if (!cur || a.assessedAt > cur.assessedAt) m[a.processCode] = a;
    }
    return m;
  }, [assessments]);

  const assessedCount = scope.filter((c) => latestByProc[c]).length;
  const avgAchieved = scope.length ? scope.reduce((s, c) => s + (latestByProc[c]?.achievedLevel ?? 0), 0) / scope.length : 0;
  const targetMet = scope.filter((c) => latestByProc[c] && latestByProc[c].achievedLevel >= latestByProc[c].targetLevel).length;

  // 热力图：行=过程（按组），列=CL0-5
  const heatRows = useMemo(() => {
    const groups = ['SYS', 'SWE', 'SUP', 'MAN', 'ACQ', 'SPL', 'HWE', 'MCE', 'MSE', 'PIM', 'REU'];
    const rows: { code: string; name: string; group: string; latest?: Assessment }[] = [];
    for (const g of groups) {
      const procs = scope.map((c) => byCode[c]).filter((p): p is AspiceProcess => !!p && p.groupCode === g);
      if (!procs.length) continue;
      for (const p of procs) rows.push({ code: p.code, name: p.nameZh || p.name, group: g, latest: latestByProc[p.code] });
    }
    return rows;
  }, [scope, byCode, latestByProc]);

  const cellColor = (latest: Assessment | undefined, level: number): { bg: string; fg: string; label: string } => {
    if (!latest) return { bg: 'rgba(255,255,255,.04)', fg: '#666', label: '—' };
    if (level === 0) return { bg: 'rgba(255,255,255,.04)', fg: '#888', label: '·' };
    const achieved = latest.achievedLevel;
    if (level <= achieved) return { bg: 'rgba(47,158,68,.55)', fg: '#fff', label: '✓' };
    if (level === achieved + 1) return { bg: 'rgba(250,140,22,.45)', fg: '#fff', label: '△' };
    return { bg: 'rgba(255,255,255,.05)', fg: '#666', label: '' };
  };

  const openWorkbench = (p: AspiceProcess) => setWorkbench(p);
  const openReport = (a: Assessment) => setReport(a);
  const openTrend = (p: AspiceProcess) => setTrend(p);

  const canAssess = (p: AspiceProcess) => scope.includes(p.code);

  return (
    <div>
      {msgCtx}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={16}>
          <Col span={6}><StatCard title={t('assess.statAssessedProc')} value={`${assessedCount}/${scope.length}`} desc={t('assess.statAssessedDesc')} color="#2f9e44" /></Col>
          <Col span={6}><StatCard title={t('assess.statAvgLevel')} value={avgAchieved.toFixed(2)} desc={t('assess.statAvgDesc')} color="#1b6ca8" /></Col>
          <Col span={6}><StatCard title={t('assess.statTargetMet')} value={`${targetMet}/${assessedCount}`} desc={t('assess.statTargetDesc')} color="#fa8c16" /></Col>
          <Col span={6}><StatCard title={t('assess.statScale')} value="N/P/L/F" desc={t('assess.statScaleDesc')} color="#531dab" /></Col>
        </Row>
      </Card>

      <Alert
        type="info" showIcon style={{ marginBottom: 12 }}
        message={t('assess.alertTitle')}
        description={t('assess.alertDesc')}
      />

      <Card
        size="small"
        title={<Space><AimOutlined /> {t('assess.heatTitle')}<Text type="secondary" style={{ fontSize: 12 }}>{t('assess.heatHint')}</Text></Space>}
      >
        <Table
          rowKey="code" size="small" pagination={false}
          dataSource={heatRows}
          onRow={(r) => ({ onClick: () => byCode[r.code] && canAssess(byCode[r.code]) && openWorkbench(byCode[r.code]), style: { cursor: 'pointer' } })}
          columns={[
            { title: t('assess.colProcess'), dataIndex: 'code', width: 90, fixed: 'left',
              render: (_v: unknown, r) => <Space size={6}><Tag color={(PROCESS_GROUPS[r.group] as any)?.color || 'default'} style={{ marginRight: 0 }}>{r.group}</Tag><b>{r.code}</b></Space> },
            { title: t('assess.colProcessName'), dataIndex: 'name', width: 190, ellipsis: true, render: (_v: unknown, r) => <Space size={6}>{r.name}{!canAssess(byCode[r.code]!) && <Tag color="orange" style={{ marginRight: 0 }}>{t('assess.notEnabled')}</Tag>}</Space> },
            { title: t('assess.colStatus'), dataIndex: 'code', width: 90, render: (v: string) => { const st = pStatus[v] || 'not_started'; const meta = st === 'assessed' ? { label: t('assess.stAssessed'), color: 'success' } : st === 'in_progress' ? { label: t('assess.stInProgress'), color: 'processing' } : { label: t('assess.stNotStarted'), color: 'default' }; return <Tag color={meta.color}>{meta.label}</Tag>; } },
            ...CAPABILITY_LEVELS.map((cl) => ({
              title: <Tooltip title={`CL${cl.level} ${isEn ? cl.name : cl.nameZh}`}><span>CL{cl.level}</span></Tooltip>,
              dataIndex: 'code', width: 52, align: 'center' as const,
              render: (_: unknown, r: { code: string; latest?: Assessment }) => {
                const c = cellColor(r.latest, cl.level);
                return <div style={{ background: c.bg, color: c.fg, borderRadius: 4, height: 26, lineHeight: '26px', fontWeight: 600, fontSize: 12 }}>{c.label}</div>;
              },
            })),
            {
              title: t('assess.targetAchievedHdr'), dataIndex: 'code', width: 110, align: 'center',
              render: (_v: unknown, r) => r.latest
                ? <Space size={4}><Tag color="blue">{t('assess.tagTarget', { level: r.latest.targetLevel })}</Tag><Tag color={r.latest.achievedLevel >= r.latest.targetLevel ? 'green' : 'red'}>{t('assess.tagAchieved', { level: r.latest.achievedLevel })}</Tag></Space>
                : <Text type="secondary" style={{ fontSize: 12 }}>{t('assess.notAssessed')}</Text>,
            },
            {
              title: t('common.actions'), dataIndex: 'code', width: 160,
              render: (_v: unknown, r) => (
                <Space size={4} onClick={(e) => e.stopPropagation()}>
                  <Button size="small" type={r.latest ? 'default' : 'primary'} icon={<PlusOutlined />} disabled={!canAssess(byCode[r.code]!)} onClick={() => byCode[r.code] && openWorkbench(byCode[r.code])}>
                    {r.latest ? t('assess.reassessBtn') : t('assess.assessBtn')}
                  </Button>
                  {r.latest && <Button size="small" icon={<RadarChartOutlined />} onClick={() => openReport(r.latest!)}>{t('assess.reportBtn')}</Button>}
                  <Button size="small" icon={<HistoryOutlined />} disabled={!r.latest} onClick={() => byCode[r.code] && openTrend(byCode[r.code])}>{t('assess.trendBtn')}</Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      {/* 底部：最近评估记录 */}
      <Card size="small" title={<Space><HistoryOutlined /> {t('assess.recordListTitle')}</Space>} style={{ marginTop: 12 }}>
        {assessments.length === 0 ? (
          <Empty description={t('assess.emptyRecords')} />
        ) : (
          <Table
            rowKey="id" size="small" pagination={{ pageSize: 8 }} rowClassName="clickable-row"
            dataSource={[...assessments].sort((a, b) => b.assessedAt - a.assessedAt)}
            onRow={(a) => ({ onClick: () => openReport(a) })}
            columns={[
              { title: t('assess.colProcess'), dataIndex: 'processCode', width: 100, render: (v) => <b>{v}</b> },
              { title: t('assess.colProcessName'), dataIndex: 'processCode', width: 180, render: (v) => byCode[v]?.nameZh || v },
              { title: t('assess.colTargetCl'), dataIndex: 'targetLevel', width: 80, align: 'center', render: (v) => <Tag color="blue">CL{v}</Tag> },
              { title: t('assess.colAchievedCl'), dataIndex: 'achievedLevel', width: 80, align: 'center', render: (v) => <Tag color={v >= 2 ? 'green' : v === 1 ? 'orange' : 'red'}>CL{v}</Tag> },
              { title: t('assess.colPaAvg'), dataIndex: 'scores', width: 90, align: 'center', render: (s) => paAvg(s).toFixed(2) },
              { title: t('assess.colAssessedBy'), dataIndex: 'assessedBy', width: 100 },
              { title: t('assess.colTime'), dataIndex: 'assessedAt', width: 150, render: (v) => new Date(v).toLocaleString(isEn ? 'en-US' : 'zh-CN') },
              {
                title: t('common.actions'), dataIndex: 'id', width: 80,
                render: (_, a) => (
                  <Space size={4} onClick={(e) => e.stopPropagation()}>
                    <Button size="small" icon={<RadarChartOutlined />} onClick={() => openReport(a)}>{t('assess.reportBtn')}</Button>
                    <Popconfirm title={t('assess.delAssessTitle')} onConfirm={async () => { await db.assessments.delete(a.id!, t('assess.auditDelRecord', { code: a.processCode, level: a.achievedLevel })); msg.success(t('assess.deleted')); }}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Card>

      {workbench && (
        <AssessmentWorkbench
          project={project}
          process={workbench}
          wps={wps} reviews={reviews}
          latest={latestByProc[workbench.code]}
          onClose={() => setWorkbench(null)}
          actor={actor}
        />
      )}
      {report && <ReportModal assessment={report} process={byCode[report.processCode]} onClose={() => setReport(null)} />}
      {trend && (
        <TrendDrawer
          process={trend}
          assessments={assessments.filter((a) => a.processCode === trend.code).sort((a, b) => a.assessedAt - b.assessedAt)}
          onClose={() => setTrend(null)}
        />
      )}
    </div>
  );

  function StatCard({ title, value, desc, color }: { title: string; value: string; desc: string; color: string }) {
    return (
      <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
        <Text type="secondary" style={{ fontSize: 12 }}>{title}</Text>
        <div style={{ fontSize: 24, fontWeight: 800, color, margin: '4px 0 2px' }}>{value}</div>
        <Text type="secondary" style={{ fontSize: 11 }}>{desc}</Text>
      </Card>
    );
  }
}

// ============ 评估工作台（单过程：目标等级 → PA 评分 → 证据 → 保存）============
function AssessmentWorkbench({ project, process, wps, latest, onClose, actor }: {
  project: Project; process: AspiceProcess;
  wps: WorkProduct[]; reviews: ReviewRecord[]; latest?: Assessment; onClose: () => void; actor: { id: number; username: string };
}) {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.toLowerCase().startsWith('en');
  const [msg, msgCtx] = message.useMessage();
  const [targetLevel, setTargetLevel] = useState<number>(latest?.targetLevel ?? Math.min(3, process.code.startsWith('SYS') || process.code.startsWith('SWE') ? 3 : 2));
  const [scores, setScores] = useState<Record<string, PaRating>>(latest?.scores ?? {});
  const [evidence, setEvidence] = useState(latest?.evidence ?? '');
  const [notes, setNotes] = useState(latest?.notes ?? '');
  const [linkWps, setLinkWps] = useState<number[]>(latest?.evidenceLinks ?? []);
  const [saving, setSaving] = useState(false);

  const paScope = useMemo(() => paScopeOf(targetLevel), [targetLevel]);
  const achieved = useMemo(() => calcAchieved(scores), [scores]);
  const avg = useMemo(() => paAvg(scores), [scores]);

  // 变更目标等级时保留已有评分（更高等级自动扩展 PA 集）
  const setPa = (pa: string, v: PaRating) => setScores((s) => ({ ...s, [pa]: v }));

  const save = async () => {
    // 校验：目标等级内所有 PA 必须已评分
    const missing = paScope.filter((pa) => !scores[pa]);
    if (missing.length) {
      msg.warning(t('assess.missingPa', { n: missing.length, list: missing.join(' / ') }));
      return;
    }
    setSaving(true);
    try {
      const payload: Assessment = {
        projectId: project.id!,
        processCode: process.code,
        stdVersion: (project.stdVersion || '3.1') as '3.1' | '4.0',
        targetLevel,
        achievedLevel: achieved,
        scores,
        evidence: evidence.trim(),
        evidenceLinks: linkWps,
        notes: notes.trim(),
        assessedBy: actor.username,
        assessedAt: Date.now(),
      };
      // 多轮评估：每次保存都新增一条历史记录（保留趋势），不覆盖旧记录
      await db.assessments.add(payload, t('assess.auditNew', { code: process.code, target: targetLevel, achieved }));
      // 同步过程执行状态 → assessed
      const next = { ...(project.processStatus || {}), [process.code]: 'assessed' as const };
      await updateRecord<Project>('projects', project.id!, { processStatus: next, updatedAt: Date.now() }, actor, t('assess.auditDone', { code: process.code, achieved }));
      msg.success(t('assess.savedDone', { code: process.code, achieved }));
      onClose();
    } catch (e: any) {
      msg.error(t('assess.saveFail', { err: e?.message || e }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title={<Space><AimOutlined /> {t('assess.wbTitle')} — {process.code} {process.nameZh || process.name}<Tag color={(PROCESS_GROUPS[process.groupCode] as any)?.color || 'default'}>{process.groupCode}</Tag></Space>}
      width={760} open onClose={onClose} extra={<Space><Button onClick={onClose}>{t('common.cancel')}</Button><Button type="primary" loading={saving} onClick={save}>{t('assess.saveBtn')}</Button></Space>}
    >
      {msgCtx}
      <Paragraph type="secondary" style={{ fontSize: 12 }}>{process.purpose}</Paragraph>

      <Card size="small" title={t('assess.stepTarget')} style={{ marginBottom: 12 }}>
        <Segmented
          value={targetLevel}
          onChange={(v) => setTargetLevel(v as number)}
          options={CAPABILITY_LEVELS.slice(1).map((cl) => ({ value: cl.level, label: `CL${cl.level} ${isEn ? cl.name : cl.nameZh}` }))}
        />
        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('assess.paScopePrefix')}<b>{paScope.join(' / ')}</b>
          </Text>
        </div>
      </Card>

      <Card size="small" title={t('assess.stepPa')} style={{ marginBottom: 12 }}>
        <Alert type={achieved >= targetLevel ? 'success' : 'warning'} showIcon style={{ marginBottom: 12 }}
          message={achieved >= targetLevel
            ? t('assess.liveResultMet', { achieved, avg: avg.toFixed(2) })
            : t('assess.liveResultGap', { achieved, avg: avg.toFixed(2), target: targetLevel, hint: achieved === targetLevel - 1 ? t('assess.oneStepAway') : '' })} />
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {paScope.map((pa) => {
            const name = PA_NAMES[pa] || pa;
            const cur = scores[pa];
            return (
              <div key={pa} style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, padding: '10px 12px' }}>
                <Row align="middle">
                  <Col span={10}>
                    <Space size={6}>
                      <Tag color={cur ? (PA_SCORE[cur] >= 2 ? 'green' : PA_SCORE[cur] === 1 ? 'orange' : 'red') : 'default'}>{pa}</Tag>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{name.split(' ')[0]}</span>
                    </Space>
                    <div><Text type="secondary" style={{ fontSize: 11 }}>{name.split(' ').slice(1).join(' ')}</Text></div>
                  </Col>
                  <Col span={10}>
                    <Radio.Group
                      value={cur} size="small"
                      onChange={(e) => setPa(pa, e.target.value)}
                      options={PA_RATINGS.map((r) => ({ value: r.value, label: t('assess.ratingLabel', { value: r.value, score: r.score }) }))}
                      optionType="button" buttonStyle="solid"
                    />
                  </Col>
                  <Col span={4} style={{ textAlign: 'right' }}>
                    <Tooltip title={t(ADVICE_KEYS[pa] ?? '')}>
                      <Button size="small" type="text" icon={<AimOutlined />}>{t('assess.adviceLabel')}</Button>
                    </Tooltip>
                  </Col>
                </Row>
              </div>
            );
          })}
        </Space>
      </Card>

      <Card size="small" title={t('assess.stepEvidence')} style={{ marginBottom: 12 }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div>
            <Text style={{ fontSize: 12 }}>{t('assess.wpLinkLabel')}</Text>
            <Select
              mode="multiple" allowClear style={{ width: '100%', marginTop: 4 }} size="small"
              placeholder={t('assess.wpLinkPh')}
              value={linkWps}
              onChange={setLinkWps}
              options={wps.filter((w) => w.processCode === process.code).map((w) => ({ value: w.id!, label: `${w.wpCode} ${w.title}` }))}
            />
          </div>
          <div>
            <Text style={{ fontSize: 12 }}>{t('assess.evidenceLabel')}</Text>
            <Input.TextArea rows={3} style={{ marginTop: 4 }} placeholder={t('assess.evidencePh')} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
          </div>
          <div>
            <Text style={{ fontSize: 12 }}>{t('assess.notesLabel')}</Text>
            <Input.TextArea rows={2} style={{ marginTop: 4 }} placeholder={t('assess.notesPh')} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </Space>
      </Card>

      <Card size="small" title={t('assess.stepBpRef')}>
        {process.bps?.length ? (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {process.bps.map((bp) => (
              <div key={bp.id} style={{ fontSize: 12 }}>
                <Tag style={{ marginRight: 6 }}>{bp.id}</Tag><Text>{bp.name}</Text>
                <div style={{ marginLeft: 44, color: 'rgba(255,255,255,.45)', fontSize: 11 }}>{bp.desc}</div>
              </div>
            ))}
          </Space>
        ) : <Text type="secondary">{t('assess.noBp')}</Text>}
      </Card>
    </Drawer>
  );
}

// ============ 评估报告（雷达图 + 差距清单 + 导出）============
function ReportModal({ assessment, process, onClose }: { assessment: Assessment; process?: AspiceProcess; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.toLowerCase().startsWith('en');
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInst = useRef<echarts.ECharts | null>(null);
  const [msg, msgCtx] = message.useMessage();

  const paList = useMemo(() => Object.keys(assessment.scores || {}), [assessment]);
  const gaps = useMemo(() => paList.filter((pa) => PA_SCORE[assessment.scores[pa]] < 2), [paList, assessment.scores]);
  const avg = useMemo(() => paAvg(assessment.scores), [assessment.scores]);

  // Modal 内容懒挂载：首次打开（afterOpenChange）或 ref 就绪后初始化图表
  const renderChart = useCallback(() => {
    const el = chartRef.current;
    if (!el || !paList.length || chartInst.current) return;
    const chart = echarts.init(el);
    chartInst.current = chart;
    chart.setOption({
      tooltip: {},
      legend: { data: ['PA 得分'], textStyle: { color: '#ccc' }, top: 0 },
      radar: {
        indicator: paList.map((pa) => ({ name: pa, max: 3 })),
        radius: '65%',
        axisName: { color: '#ccc', fontSize: 11 },
        splitArea: { areaStyle: { color: ['rgba(255,255,255,.02)', 'rgba(255,255,255,.05)'] } },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.15)' } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.15)' } },
      },
      series: [{
        type: 'radar',
        data: [{
          value: paList.map((pa) => PA_SCORE[assessment.scores[pa]]),
          name: 'PA 得分',
          areaStyle: { color: 'rgba(108,123,255,.35)' },
          lineStyle: { color: '#6c7bff', width: 2 },
          itemStyle: { color: '#6c7bff' },
        }],
      }],
    });
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    (chart as any)._onResize = onResize;
  }, [paList, assessment]);

  // ref 就绪后立即尝试（forceRender 场景）；首次打开动画结束后 resize
  useEffect(() => { renderChart(); }, [renderChart]);
  useEffect(() => () => {
    window.removeEventListener('resize', (chartInst.current as any)?._onResize);
    chartInst.current?.dispose();
    chartInst.current = null;
  }, []);
  const onAfterOpen = (open: boolean) => {
    if (!open) return;
    renderChart();
    const timers = [150, 400, 800].map((t) => setTimeout(() => chartInst.current?.resize(), t));
    setTimeout(() => timers.forEach(clearTimeout), 1200);
  };

  const exportMd = () => {
    const lines: string[] = [
      t('assess.expTitle'),
      ``,
      t('assess.expProc', { name: `${process?.code || assessment.processCode} ${process?.nameZh || ''}` }),
      t('assess.expTime', { time: new Date(assessment.assessedAt).toLocaleString(isEn ? 'en-US' : 'zh-CN') }),
      t('assess.expBy', { by: assessment.assessedBy }),
      t('assess.expTarget', { level: assessment.targetLevel }),
      t('assess.expAchieved', { level: assessment.achievedLevel }),
      t('assess.expAvg', { avg: avg.toFixed(2) }),
      ``,
      t('assess.expScoreTitle'),
      ``,
      t('assess.expTableHdr'),
      `|---|---|---|`,
      ...paList.map((pa) => `| ${pa} | ${assessment.scores[pa]} | ${PA_SCORE[assessment.scores[pa]]} |`),
      ``,
      t('assess.expGapTitle'),
      ``,
      gaps.length ? gaps.map((pa) => t('assess.expGapItem', { pa, name: PA_NAMES[pa] || '', advice: ADVICE_KEYS[pa] ? t(ADVICE_KEYS[pa]) : t('assess.gapNoAdvice') })).join('\n') : t('assess.expNoGaps'),
      ``,
      t('assess.expEvidenceTitle'),
      ``,
      assessment.evidence || '-',
      ``,
      t('assess.expNotesTitle'),
      ``,
      assessment.notes || '-',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${t('assess.expFilePrefix')}_${assessment.processCode}_CL${assessment.achievedLevel}.md`;
    a.click(); URL.revokeObjectURL(url);
    msg.success(t('assess.reportExported'));
  };

  return (
    <Modal open forceRender afterOpenChange={onAfterOpen} title={<Space><RadarChartOutlined /> {t('assess.reportTitle')} — {assessment.processCode} {process?.nameZh || ''}</Space>} footer={null} width={680} onCancel={onClose}>
      {msgCtx}
      <Row gutter={16} style={{ marginBottom: 12 }}>
        <Col span={6}><MiniStat label={t('assess.miniTarget')} value={`CL${assessment.targetLevel}`} color="blue" /></Col>
        <Col span={6}><MiniStat label={t('assess.miniAchieved')} value={`CL${assessment.achievedLevel}`} color={assessment.achievedLevel >= assessment.targetLevel ? 'green' : 'red'} /></Col>
        <Col span={6}><MiniStat label={t('assess.miniAvg')} value={`${avg.toFixed(2)}/3`} color="#531dab" /></Col>
        <Col span={6}><MiniStat label={t('assess.miniGaps')} value={t('assess.gapCount', { n: gaps.length })} color={gaps.length ? 'orange' : 'green'} /></Col>
      </Row>
      <div ref={chartRef} style={{ height: 320 }} />
      <Card size="small" title={t('assess.gapCardTitle')} style={{ marginTop: 12 }}>
        {gaps.length === 0 ? (
          <Alert type="success" showIcon message={t('assess.allPassed')} />
        ) : (
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {gaps.map((pa) => (
              <div key={pa} style={{ borderLeft: '3px solid #fa8c16', padding: '4px 10px', background: 'rgba(250,140,22,.08)', borderRadius: 4 }}>
                <Text strong style={{ fontSize: 12 }}>{pa} {PA_NAMES[pa] || ''} {t('assess.currentScore', { rating: assessment.scores[pa], score: PA_SCORE[assessment.scores[pa]] })}</Text>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>{ADVICE_KEYS[pa] ? t(ADVICE_KEYS[pa]) : ''}</div>
              </div>
            ))}
          </Space>
        )}
      </Card>
      {assessment.evidence && <Card size="small" title={t('assess.evidenceLabel')} style={{ marginTop: 12 }}><Paragraph style={{ fontSize: 12, marginBottom: 0 }}>{assessment.evidence}</Paragraph></Card>}
      {assessment.notes && <Card size="small" title={t('assess.notesShort')} style={{ marginTop: 12 }}><Paragraph style={{ fontSize: 12, marginBottom: 0 }}>{assessment.notes}</Paragraph></Card>}
      <div style={{ textAlign: 'right', marginTop: 12 }}>
        <Button icon={<DownloadOutlined />} onClick={exportMd}>{t('assess.exportBtn')}</Button>
      </div>
    </Modal>
  );

  function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
    return (
      <Card size="small" styles={{ body: { padding: '10px 14px' } }}>
        <Text type="secondary" style={{ fontSize: 11 }}>{label}</Text>
        <div style={{ fontSize: 18, fontWeight: 800, color: color === 'blue' ? '#1b6ca8' : color === 'green' ? '#2f9e44' : color === 'red' ? '#cf1322' : color === 'orange' ? '#fa8c16' : color }}>{value}</div>
      </Card>
    );
  }
}

// ============ 历史趋势（多轮评估对比：等级曲线 + 雷达对比）============
function TrendDrawer({ process, assessments, onClose }: { process: AspiceProcess; assessments: Assessment[]; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.toLowerCase().startsWith('en');
  const chartRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<HTMLDivElement>(null);
  const chartInst = useRef<echarts.ECharts | null>(null);
  const radarInst = useRef<echarts.ECharts | null>(null);

  const renderLine = useCallback(() => {
    const el = chartRef.current;
    if (!el || assessments.length < 1 || chartInst.current) return;
    const chart = echarts.init(el);
    chartInst.current = chart;
    chart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['达成 CL', '目标 CL'], textStyle: { color: '#ccc' } },
      xAxis: { type: 'category', data: assessments.map((_, i) => `第 ${i + 1} 轮`), axisLabel: { color: '#aaa' }, axisLine: { lineStyle: { color: 'rgba(255,255,255,.2)' } } },
      yAxis: { type: 'value', min: 0, max: 5, interval: 1, axisLabel: { color: '#aaa' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      series: [
        { name: '达成 CL', type: 'line', data: assessments.map((a) => a.achievedLevel), smooth: true, lineStyle: { color: '#2f9e44', width: 3 }, itemStyle: { color: '#2f9e44' }, areaStyle: { color: 'rgba(47,158,68,.2)' } },
        { name: '目标 CL', type: 'line', data: assessments.map((a) => a.targetLevel), smooth: true, lineStyle: { color: '#1b6ca8', type: 'dashed' }, itemStyle: { color: '#1b6ca8' } },
      ],
    });
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    (chart as any)._onResize = onResize;
  }, [assessments]);

  // 雷达对比：最新 vs 首轮
  const renderRadar = useCallback(() => {
    const el = radarRef.current;
    if (!el || assessments.length < 2 || radarInst.current) return;
    const latest = assessments[assessments.length - 1];
    const first = assessments[0];
    const paAll = Array.from(new Set([...Object.keys(first.scores), ...Object.keys(latest.scores)]));
    const chart = echarts.init(el);
    radarInst.current = chart;
    chart.setOption({
      tooltip: {},
      legend: { data: ['首轮', '最新'], textStyle: { color: '#ccc' }, top: 0 },
      radar: {
        indicator: paAll.map((pa) => ({ name: pa, max: 3 })),
        radius: '62%',
        axisName: { color: '#ccc', fontSize: 11 },
        splitArea: { areaStyle: { color: ['rgba(255,255,255,.02)', 'rgba(255,255,255,.05)'] } },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,.15)' } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.15)' } },
      },
      series: [{
        type: 'radar',
        data: [
          { value: paAll.map((pa) => PA_SCORE[first.scores[pa]] ?? 0), name: '首轮', areaStyle: { color: 'rgba(255,255,255,.08)' }, lineStyle: { color: '#aaa', type: 'dashed' }, itemStyle: { color: '#aaa' } },
          { value: paAll.map((pa) => PA_SCORE[latest.scores[pa]] ?? 0), name: '最新', areaStyle: { color: 'rgba(108,123,255,.35)' }, lineStyle: { color: '#6c7bff', width: 2 }, itemStyle: { color: '#6c7bff' } },
        ],
      }],
    });
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    (chart as any)._onResize = onResize;
  }, [assessments]);

  useEffect(() => { renderLine(); renderRadar(); }, [renderLine, renderRadar]);
  useEffect(() => () => {
    window.removeEventListener('resize', (chartInst.current as any)?._onResize);
    window.removeEventListener('resize', (radarInst.current as any)?._onResize);
    chartInst.current?.dispose(); radarInst.current?.dispose();
    chartInst.current = null; radarInst.current = null;
  }, []);
  const onAfterOpen = (open: boolean) => {
    if (!open) return;
    renderLine(); renderRadar();
    const timers = [150, 400, 800].map((t) => setTimeout(() => { chartInst.current?.resize(); radarInst.current?.resize(); }, t));
    setTimeout(() => timers.forEach(clearTimeout), 1200);
  };

  return (
    <Drawer forceRender afterOpenChange={onAfterOpen} title={<Space><HistoryOutlined /> {t('assess.trendTitle')} — {process.code} {process.nameZh || process.name}</Space>} width={640} open onClose={onClose}>
      {assessments.length === 0 ? <Empty description={t('assess.noTrendData')} /> : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card size="small" title={t('assess.cardLevelTrend')}>
            <div ref={chartRef} style={{ height: 260 }} />
          </Card>
          {assessments.length >= 2 && (
            <Card size="small" title={t('assess.cardRadarCompare')}>
              <div ref={radarRef} style={{ height: 300 }} />
            </Card>
          )}
          <Card size="small" title={t('assess.cardRounds')}>
            <Table
              rowKey="id" size="small" pagination={false}
              dataSource={assessments}
              columns={[
                { title: t('assess.colRound'), dataIndex: 'assessedAt', width: 70, render: (_: unknown, __: unknown, i: number) => t('assess.roundNo', { n: i + 1 }) },
                { title: t('assess.target'), dataIndex: 'targetLevel', width: 60, align: 'center', render: (v) => <Tag color="blue">CL{v}</Tag> },
                { title: t('assess.achieved'), dataIndex: 'achievedLevel', width: 60, align: 'center', render: (v) => <Tag color={v >= 2 ? 'green' : v === 1 ? 'orange' : 'red'}>CL{v}</Tag> },
                { title: t('assess.colPaAvg'), dataIndex: 'scores', width: 80, align: 'center', render: (s) => paAvg(s).toFixed(2) },
                { title: t('assess.colAssessedBy'), dataIndex: 'assessedBy', width: 90 },
                { title: t('assess.colTime'), dataIndex: 'assessedAt', render: (v) => new Date(v).toLocaleString(isEn ? 'en-US' : 'zh-CN') },
              ]}
            />
            {assessments.length >= 2 && (
              <div style={{ marginTop: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>{t('assess.paCompareNote')}</Text>
                <Table
                  rowKey="pa" size="small" pagination={false} style={{ marginTop: 6 }}
                  dataSource={paCompareRows(assessments)}
                  columns={[
                    { title: 'PA', dataIndex: 'pa', width: 110, fixed: 'left', render: (v) => <Tag color="geekblue" style={{ marginRight: 0 }}>{v}</Tag> },
                    ...assessments.map((_, i) => ({
                      title: t('assess.roundNo', { n: i + 1 }), dataIndex: `r${i}`, width: 90, align: 'center' as const,
                      render: (v: PaRating | undefined) => v ? <Tag color={PA_SCORE[v] >= 2 ? 'green' : PA_SCORE[v] === 1 ? 'orange' : 'red'}>{v}</Tag> : <Text type="secondary">—</Text>,
                    })),
                    ...(assessments.length >= 2 ? [{
                      title: t('assess.colChange'), dataIndex: 'pa', width: 90, align: 'center' as const,
                      render: (_: unknown, row: { r0?: PaRating; rN?: PaRating }) => {
                        const a = row.r0, b = row.rN;
                        if (!a || !b || a === b) return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
                        const up = PA_SCORE[b] > PA_SCORE[a];
                        return <Tag color={up ? 'green' : 'red'} style={{ fontWeight: 700 }}>{a} → {b}{up ? ' ↑' : ' ↓'}</Tag>;
                      },
                    }] : []),
                  ]}
                />
              </div>
            )}
          </Card>
        </Space>
      )}
    </Drawer>
  );
}
