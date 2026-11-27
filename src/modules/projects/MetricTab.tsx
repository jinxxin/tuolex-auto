import { useEffect, useMemo, useRef } from 'react';
import { Card, Row, Col, Table, Tag, Typography, Alert, Space } from 'antd';
import * as echarts from 'echarts';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { V_LAYERS, normalizeVLayer, vLayerLabel } from '../../core/aspice/processes';
import { useTranslation } from 'react-i18next';
import type { Project } from '../../core/types';

const { Text } = Typography;

// ============ 过程度量（MAN.6）：过程 KPI 聚合与趋势 ============
// 从项目现有数据实时聚合：需求稳定性 / 追溯覆盖率 / 测试执行率 / 评审有效性 / 评估等级

interface Props { project: Project }

export default function MetricTab({ project }: Props) {
  const { t, i18n } = useTranslation();
  const pid = project.id!;
  const lineRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<HTMLDivElement>(null);

  const reqs = useLiveQuery(() => db.req_items.where('projectId').equals(pid).toArray(), [pid]) ?? [];
  const tcs = useLiveQuery(() => db.test_cases.where('projectId').equals(pid).toArray(), [pid]) ?? [];
  const links = useLiveQuery(() => db.trace_links.where('projectId').equals(pid).toArray(), [pid]) ?? [];
  const reviews = useLiveQuery(() => db.reviews.where('projectId').equals(pid).toArray(), [pid]) ?? [];
  const wps = useLiveQuery(() => db.work_products.where('projectId').equals(pid).toArray(), [pid]) ?? [];
  const assessments = useLiveQuery(() => db.assessments.where('projectId').equals(pid).toArray(), [pid]) ?? [];
  const fmeas = useLiveQuery(() => db.fmea_items.where('projectId').equals(pid).toArray(), [pid]) ?? [];

  // ---- KPI 计算 ----
  const kpi = useMemo(() => {
    const total = reqs.length;
    // 追溯覆盖：需求 → 测试 有链接的比例
    const linked = new Set<number>();
    for (const l of links) {
      if (l.fromType === 'req' && l.toType === 'tc') linked.add(l.fromId);
      if (l.toType === 'req' && l.fromType === 'tc') linked.add(l.toId);
    }
    const traceCoverage = total ? Math.round((linked.size / total) * 100) : 0;
    // 测试执行：已执行（非 not_run）/ 全部
    const executed = tcs.filter((t) => t.result && t.result !== 'not_run').length;
    const execRate = tcs.length ? Math.round((executed / tcs.length) * 100) : 0;
    const passed = tcs.filter((t) => t.result === 'pass').length;
    const passRate = executed ? Math.round((passed / executed) * 100) : 0;
    // 评审行动项闭环率
    let aiTotal = 0, aiClosed = 0;
    for (const r of reviews) for (const a of r.actionItems || []) { aiTotal++; if (a.status === 'closed') aiClosed++; }
    const reviewClosure = aiTotal ? Math.round((aiClosed / aiTotal) * 100) : 0;
    // 需求按 V 层分布
    const layerCount: Record<string, number> = {};
    for (const r of reqs) {
      const k = normalizeVLayer(r.reqType);
      layerCount[k] = (layerCount[k] || 0) + 1;
    }
    // 最新评估等级（按过程取最新）
    const latestByProc: Record<string, number> = {};
    for (const a of assessments) {
      const cur = latestByProc[a.processCode];
      if (cur === undefined || a.assessedAt > cur) latestByProc[a.processCode] = a.achievedLevel;
    }
    const assessedProcs = Object.keys(latestByProc);
    const avgLevel = assessedProcs.length ? assessedProcs.reduce((s, c) => s + latestByProc[c], 0) / assessedProcs.length : 0;
    // 风险：高优先级 FMEA 未关闭数（RPN≥100）
    const openHighRisks = fmeas.filter((f) => f.status === 'open' && (f.rpn || 0) >= 100).length;

    return {
      reqTotal: total, traceCoverage, tcTotal: tcs.length, execRate, passRate,
      reviewTotal: reviews.length, aiTotal, aiClosed, reviewClosure,
      wpTotal: wps.length, assessedProcs: assessedProcs.length, avgLevel, openHighRisks,
      layerCount,
    };
  }, [reqs, tcs, links, reviews, wps, assessments, fmeas]);

  // ---- 趋势数据：按日期聚合（测试执行/追溯覆盖/评审） ----
  const trend = useMemo(() => {
    const dayMap = new Map<string, { exec: number; pass: number; tc: number; links: number; reviews: number }>();
    for (const t of tcs) {
      const d = new Date(t.updatedAt || Date.now()).toISOString().slice(0, 10);
      const cur = dayMap.get(d) || { exec: 0, pass: 0, tc: 0, links: 0, reviews: 0 };
      cur.tc++;
      if (t.result === 'pass') cur.pass++;
      if (t.result && t.result !== 'not_run') cur.exec++;
      dayMap.set(d, cur);
    }
    const days = Array.from(dayMap.keys()).sort();
    return days.slice(-14).map((d) => {
      const c = dayMap.get(d)!;
      return { day: d.slice(5), execRate: c.tc ? Math.round((c.exec / c.tc) * 100) : 0, passRate: c.exec ? Math.round((c.pass / c.exec) * 100) : 0 };
    });
  }, [tcs]);

  // ---- 评估等级趋势（多轮平均） ----
  const levelTrend = useMemo(() => {
    const byDay = new Map<string, { sum: number; n: number }>();
    for (const a of assessments) {
      const d = new Date(a.assessedAt).toISOString().slice(0, 10);
      const cur = byDay.get(d) || { sum: 0, n: 0 };
      cur.sum += a.achievedLevel; cur.n++;
      byDay.set(d, cur);
    }
    return Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([day, v]) => ({
      day: day.slice(5), avg: +(v.sum / v.n).toFixed(2),
    }));
  }, [assessments]);

  // ---- 雷达：过程组覆盖 ----
  const groupRadar = useMemo(() => {
    const groups = ['SYS', 'SWE', 'SUP', 'MAN'];
    const scope = project.processScope || [];
    return groups.map((g) => {
      const procs = scope.filter((c) => c.startsWith(g));
      return { group: g, total: procs.length };
    });
  }, [project.processScope]);

  // 图表
  useEffect(() => {
    if (!lineRef.current || !trend.length) return;
    const chart = echarts.init(lineRef.current);
    chart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['测试执行率', '测试通过率'], textStyle: { color: '#ccc' } },
      xAxis: { type: 'category', data: trend.map((t) => t.day), axisLabel: { color: '#aaa' } },
      yAxis: { type: 'value', max: 100, axisLabel: { color: '#aaa' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      series: [
        { name: '测试执行率', type: 'line', smooth: true, data: trend.map((t) => t.execRate), lineStyle: { color: '#1b6ca8', width: 2 }, itemStyle: { color: '#1b6ca8' }, areaStyle: { color: 'rgba(27,108,168,.2)' } },
        { name: '测试通过率', type: 'line', smooth: true, data: trend.map((t) => t.passRate), lineStyle: { color: '#2f9e44', width: 2 }, itemStyle: { color: '#2f9e44' } },
      ],
    });
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); chart.dispose(); };
  }, [trend]);

  useEffect(() => {
    if (!radarRef.current || !levelTrend.length) return;
    const chart = echarts.init(radarRef.current);
    chart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['评估平均等级'], textStyle: { color: '#ccc' } },
      xAxis: { type: 'category', data: levelTrend.map((t) => t.day), axisLabel: { color: '#aaa' } },
      yAxis: { type: 'value', min: 0, max: 5, interval: 1, axisLabel: { color: '#aaa' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } } },
      series: [{ name: '评估平均等级', type: 'line', smooth: true, data: levelTrend.map((t) => t.avg), lineStyle: { color: '#6c7bff', width: 3 }, itemStyle: { color: '#6c7bff' }, areaStyle: { color: 'rgba(108,123,255,.25)' } }],
    });
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); chart.dispose(); };
  }, [levelTrend]);

  const layerRows = useMemo(() => V_LAYERS.map((l) => ({
    key: l.key, label: vLayerLabel(l, i18n.language), prefix: l.prefix, color: l.color, count: kpi.layerCount[l.key] || 0,
  })).filter((r) => r.count > 0), [kpi.layerCount, i18n.language]);

  return (
    <div>
      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message={t('metric.alertTitle')}
        description={t('metric.alertDesc')} />

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <KpiCard title={t('metric.kpiReq')} value={kpi.reqTotal} sub={t('metric.kpiReqSub', { pct: kpi.traceCoverage })} color="#1b6ca8" />
        <KpiCard title={t('metric.kpiTc')} value={kpi.tcTotal} sub={t('metric.kpiTcSub', { exec: kpi.execRate, pass: kpi.passRate })} color="#2f9e44" />
        <KpiCard title={t('metric.kpiAction')} value={`${kpi.aiClosed}/${kpi.aiTotal}`} sub={t('metric.kpiActionSub', { pct: kpi.reviewClosure, n: kpi.reviewTotal })} color="#fa8c16" />
        <KpiCard title={t('metric.kpiAssess')} value={kpi.assessedProcs} sub={t('metric.kpiAssessSub', { avg: kpi.avgLevel.toFixed(2) })} color="#531dab" />
      </Row>

      <Row gutter={[12, 12]}>
        <Col span={12}>
          <Card size="small" title={t('metric.trendTitle')}>
            {trend.length ? <div ref={lineRef} style={{ height: 260 }} /> : <Text type="secondary">{t('metric.noTestData')}</Text>}
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title={t('metric.levelTrendTitle')}>
            {levelTrend.length ? <div ref={radarRef} style={{ height: 260 }} /> : <Text type="secondary">{t('metric.noAssessData')}</Text>}
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col span={12}>
          <Card size="small" title={t('metric.vLayerTitle')}>
            <Table
              rowKey="key" size="small" pagination={false} dataSource={layerRows}
              columns={[
                { title: t('metric.colLayer'), dataIndex: 'label', render: (v, r) => <Space size={6}><Tag color={r.color} style={{ marginRight: 0 }}>{r.prefix}</Tag>{v}</Space> },
                { title: t('metric.colCount'), dataIndex: 'count', width: 100, align: 'center', render: (v) => <b>{v}</b> },
              ]}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title={t('metric.groupTitle')}>
            <Table
              rowKey="group" size="small" pagination={false}
              dataSource={groupRadar}
              columns={[
                { title: t('metric.colGroup'), dataIndex: 'group', render: (v) => <Tag color="geekblue">{v}</Tag> },
                { title: t('metric.colGroupCount'), dataIndex: 'total', width: 120, align: 'center', render: (v) => <b>{v}</b> },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" title={t('metric.healthTitle')} style={{ marginTop: 12 }}>
        <Space size={8} wrap>
          <HealthTag label={t('metric.hTrace')} value={kpi.traceCoverage} />
          <HealthTag label={t('metric.hExec')} value={kpi.execRate} />
          <HealthTag label={t('metric.hPass')} value={kpi.passRate} />
          <HealthTag label={t('metric.hAction')} value={kpi.reviewClosure} />
          <Tag color={kpi.openHighRisks ? 'red' : 'green'} style={{ padding: '4px 10px', fontSize: 13 }}>
            {kpi.openHighRisks ? t('metric.highRisk', { n: kpi.openHighRisks }) : t('metric.noRisk')}
          </Tag>
        </Space>
      </Card>
    </div>
  );

  function KpiCard({ title, value, sub, color }: { title: string; value: string | number; sub: string; color: string }) {
    return (
      <Col span={6}>
        <Card size="small" styles={{ body: { padding: '14px 16px' } }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{title}</Text>
          <div style={{ fontSize: 26, fontWeight: 800, color, margin: '4px 0 2px' }}>{value}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>{sub}</Text>
        </Card>
      </Col>
    );
  }

  function HealthTag({ label, value }: { label: string; value: number }) {
    const color = value >= 80 ? 'green' : value >= 50 ? 'orange' : 'red';
    return <Tag color={color} style={{ padding: '4px 10px', fontSize: 13 }}>{label} {value}%</Tag>;
  }
}
