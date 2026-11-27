import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Modal, Descriptions, Tag, Typography, Space, Empty, Alert, Segmented, Row, Col, Input, Button, message } from 'antd';
import { AimOutlined, UndoOutlined, ExpandOutlined, ShrinkOutlined } from '@ant-design/icons';
import * as echarts from 'echarts';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { riskLevel } from '../../core/fmea';
import type { TestCase, TraceLink, LinkEntityType } from '../../core/types';

const { Text } = Typography;

interface Props {
  projectId: number;
}

interface GraphNode {
  name: string;
  value?: string;
  color: string;
  kind: 'root' | 'req' | 'tc' | 'result' | 'risk' | 'link';
  detail?: Record<string, string>;
  children?: GraphNode[];
}

// 执行结果展示（labelKey 由组件内 t() 解析成当前语言；颜色固定）
const RESULT_LABEL: Record<string, { labelKey: string; color: string }> = {
  not_run: { labelKey: 'traceMatrix.resNotRun', color: '#bfbfbf' },
  pass: { labelKey: 'traceMatrix.resPass', color: '#2f9e44' },
  fail: { labelKey: 'traceMatrix.resFail', color: '#cf1322' },
  na: { labelKey: 'traceMatrix.resNa', color: '#fa8c16' },
};

// 节点详情弹窗：detail 对象的中文键 → i18n key（渲染处 t() 解析）
const DETAIL_LABEL_KEY: Record<string, string> = {
  项目: 'traceGraph.dProject', 系统类型: 'traceGraph.dSysType', 状态: 'traceGraph.dStatus',
  需求: 'traceGraph.dReq', 描述: 'traceGraph.dDesc', 优先级: 'traceGraph.dPri', 法规来源: 'traceGraph.dSource',
  用例: 'traceGraph.dTcId', 标题: 'traceGraph.dTitle', 结果: 'traceGraph.dResult',
  执行人: 'traceGraph.dExec', 证据: 'traceGraph.dEvidence', 关联追溯: 'traceGraph.dRelTrace',
  失效模式: 'traceGraph.dFMode', 影响: 'traceGraph.dEffect', RPN: 'traceGraph.dRpn', 等级: 'traceGraph.dLevel', 措施: 'traceGraph.dAction',
  方向: 'traceGraph.dDir', 关系类型: 'traceGraph.dRelType', 对方: 'traceGraph.dOther',
};

// ============ 图形化追溯（ECharts，多层：URS→需求→测试→结果 + 风险→测试）============
export default function TraceGraph({ projectId }: Props) {
  const { t } = useTranslation();
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [detail, setDetail] = useState<GraphNode | null>(null);
  const [mode, setMode] = useState<'tree' | 'graph'>('tree');
  // 聚焦追溯：输入编号后显示「祖先链 → 目标 → 后代」完整双向追溯链
  const [focus, setFocus] = useState<{ node: GraphNode; path: GraphNode[] } | null>(null);
  // 展开控制：默认 4 层，可一键展开全部 / 恢复默认
  const [expandAll, setExpandAll] = useState(false);
  const expandedRef = useRef<Set<string>>(new Set());

  const reqItems = useLiveQuery(() => db.req_items.where('projectId').equals(projectId).sortBy('id'), [projectId]) ?? [];
  const testCases = useLiveQuery(() => db.test_cases.where('projectId').equals(projectId).sortBy('id'), [projectId]) ?? [];
  const links = useLiveQuery(() => db.trace_links.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const fmeaItems = useLiveQuery(() => db.fmea_items.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);

  const tcById = useMemo(() => new Map(testCases.map((t) => [t.id, t])), [testCases]);
  const reqTcs = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const l of links) {
      if (l.fromType === 'req' && l.toType === 'tc') {
        if (!map.has(l.fromId)) map.set(l.fromId, []);
        map.get(l.fromId)!.push(l.toId);
      }
      if (l.fromType === 'tc' && l.toType === 'req') {
        if (!map.has(l.toId)) map.set(l.toId, []);
        map.get(l.toId)!.push(l.fromId);
      }
    }
    return map;
  }, [links]);

  const treeData = useMemo<GraphNode>(() => {
    const children: GraphNode[] = [];
    for (const r of reqItems) {
      const tcs = (reqTcs.get(r.id!) || []).map((tcId) => tcById.get(tcId)).filter(Boolean) as TestCase[];
      const tcNodes: GraphNode[] = tcs.map((tc) => {
        const tcRels = relChildNodes('tc', tc.id!, links, reqItems, testCases, fmeaItems, t);
        const resLabel = RESULT_LABEL[tc.result] ? t(RESULT_LABEL[tc.result].labelKey) : tc.result;
        return {
          name: tc.tcId,
          value: tc.title,
          color: RESULT_LABEL[tc.result]?.color ?? '#bfbfbf',
          kind: 'tc',
          detail: {
            用例: tc.tcId, 标题: tc.title, 结果: resLabel,
            执行人: tc.executedBy || '—', 证据: tc.evidence || '—',
            ...(tcRels.length ? { 关联追溯: tcRels.map((c) => `${c.name}（${c.value}）`).join('；') } : {}),
          },
          children: [{
            name: `${t('traceGraph.nodeResult')}${resLabel}`,
            color: RESULT_LABEL[tc.result]?.color ?? '#bfbfbf',
            kind: 'result',
            detail: { 结果: resLabel, 执行人: tc.executedBy || '—' },
          }, ...tcRels],
        };
      });
      const relChildren = relChildNodes('req', r.id!, links, reqItems, testCases, fmeaItems, t);
      children.push({
        name: r.reqId,
        value: r.desc,
        color: r.priority === '高' ? '#cf1322' : r.priority === '中' ? '#fa8c16' : '#8c8c8c',
        kind: 'req',
        detail: {
          需求: r.reqId, 描述: r.desc, 优先级: r.priority, 法规来源: r.sourceReg, 状态: r.status,
          ...(relChildren.length ? { 关联追溯: relChildren.map((c) => `${c.name}（${c.value}）`).join('；') } : {}),
        },
        children: [...tcNodes, ...relChildren],
      });
    }
    for (const f of fmeaItems) {
      const lv = riskLevel(f.rpn);
      const tcs = (f.linkedTcIds || []).map((id) => tcById.get(id)).filter(Boolean) as TestCase[];
      children.push({
        name: `${t('traceGraph.nodeRisk')}${f.rpn}`,
        value: f.failureMode,
        color: lv.level === '高' ? '#a8071a' : lv.level === '中' ? '#d46b08' : '#237804',
        kind: 'risk',
        detail: { 失效模式: f.failureMode, 影响: f.effect, RPN: String(f.rpn), 等级: lv.level, 措施: f.action || '—' },
        children: [
          ...tcs.map((tc) => {
            const resLabel = RESULT_LABEL[tc.result] ? t(RESULT_LABEL[tc.result].labelKey) : tc.result;
            return {
              name: tc.tcId,
              value: tc.title,
              color: RESULT_LABEL[tc.result]?.color ?? '#bfbfbf',
              kind: 'tc' as const,
              detail: { 用例: tc.tcId, 标题: tc.title, 结果: resLabel },
            };
          }),
          ...relChildNodes('fmea', f.id!, links, reqItems, testCases, fmeaItems, t),
        ],
      });
    }
    return {
      name: project?.name || t('traceGraph.projectFallback', { id: projectId }),
      color: '#1b6ca8',
      kind: 'root',
      detail: { 项目: project?.name || '', 系统类型: project?.sysType || '', 状态: project?.status || '' },
      children,
    };
  }, [reqItems, testCases, links, fmeaItems, reqTcs, tcById, project, projectId, t]);

  // 按编号查找节点路径（DFS）：返回从 root 到目标（含目标）的祖先路径
  const findPath = useMemo(() => {
    return (query: string): GraphNode[] | null => {
      const q = query.trim().toUpperCase().replace(/-/g, '');
      if (!q) return null;
      let found: GraphNode[] | null = null;
      const walk = (n: GraphNode, trail: GraphNode[]): boolean => {
        const trail2 = [...trail, n];
        const name = n.name.toUpperCase().replace(/-/g, '');
        if (name === q || name.startsWith(q) || n.name.toUpperCase().includes(query.trim().toUpperCase())) {
          found = trail2;
          return true;
        }
        for (const c of n.children || []) if (walk(c, trail2)) return true;
        return false;
      };
      walk(treeData, []);
      return found;
    };
  }, [treeData]);

  // 聚焦追溯：输入编号 → 显示父级链路 + 下游追溯链
  const onSearch = (value: string) => {
    if (!value.trim()) { setFocus(null); return; }
    const path = findPath(value);
    if (path && path.length > 0) {
      const node = path[path.length - 1];
      setFocus({ node, path });
      const parentChain = path.length > 1 ? path.slice(0, -1).map((n) => n.name).join(' → ') : t('traceGraph.rootParen');
      message.success(t('traceGraph.focused', { node: node.name, chain: parentChain, n: countNodes(node) - 1 }));
    } else {
      message.warning(t('traceGraph.notFound', { q: value.trim() }));
    }
  };

  // 聚焦树：祖先链仅保留通往目标的唯一分支，目标节点保留全部后代
  const root = useMemo(() => {
    if (!focus) return treeData;
    return buildFocusedTree(focus.path);
  }, [focus, treeData]);

  // 维护「已展开」节点集合：默认展开 4 层（深度 0..3 的父节点），展开全部时全部标记
  useEffect(() => {
    const set = new Set<string>();
    const walk = (n: GraphNode, depth: number) => {
      if (n.children?.length && (expandAll || depth < 3)) set.add(n.name);
      for (const c of n.children || []) walk(c, depth + 1);
    };
    walk(root, 0);
    expandedRef.current = set;
  }, [root, expandAll]);

  // 通用追溯边（任意实体互链，供关系图展示）：type:id -> name
  const extraLinks = useMemo(() => {
    const nameOf = (type: string, id: number) => entityName(type as LinkEntityType, id, reqItems, testCases, fmeaItems, true, t);
    return links
      .filter((l) => !(l.fromType === 'req' && l.toType === 'tc') && !(l.fromType === 'tc' && l.toType === 'req'))
      .map((l) => ({ source: nameOf(l.fromType, l.fromId), target: nameOf(l.toType, l.toId), relType: l.relType }))
      .filter((e) => e.source && e.target && e.source !== e.target);
  }, [links, reqItems, testCases, fmeaItems, t]);

  useEffect(() => {
    if (!chartRef.current) return;
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }
    const chart = chartInstance.current;

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'item',
        formatter: (p: unknown) => {
          const d = (p as { data?: GraphNode })?.data;
          return d ? `<b>${d.name}</b>${d.value ? `<br/>${d.value}` : ''}` : '';
        },
      },
      series: (mode === 'tree' ? [treeSeries(root, expandedRef.current, expandAll ? 0 : 3)] : [graphSeries(root, extraLinks)]) as echarts.SeriesOption[],
    };
    chart.setOption(option, true);
    chart.off('click');
    chart.on('click', (params: unknown) => {
      const d = (params as { data?: GraphNode })?.data;
      if (d?.detail) setDetail(d);
    });
    // 展开/收起事件：同步符号集合（展开 ⊕ 消失）
    if (mode === 'tree') {
      chart.off('treeExpandAndCollapse');
      chart.on('treeExpandAndCollapse', (params: unknown) => {
        const p = params as { name?: string; collapsed?: boolean };
        if (!p.name) return;
        if (p.collapsed) expandedRef.current.delete(p.name);
        else expandedRef.current.add(p.name);
      });
    }
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [root, mode, expandAll]);

  useEffect(() => () => { chartInstance.current?.dispose(); chartInstance.current = null; }, []);

  const hasData = reqItems.length > 0 || fmeaItems.length > 0;

  return (
    <Card size="small" styles={{ body: { padding: 12 } }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 8 }} gutter={[8, 8]}>
        <Col flex="auto">
          <Space wrap>
            <Segmented value={mode} onChange={(v) => setMode(v as 'tree' | 'graph')}
              options={[{ label: t('traceGraph.modeTree'), value: 'tree' }, { label: t('traceGraph.modeGraph'), value: 'graph' }]} />
            <Input.Search
              placeholder={t('traceGraph.searchPh')}
              allowClear style={{ width: 340 }} enterButton={<AimOutlined />}
              onSearch={onSearch}
            />
            <Button size="small" icon={expandAll ? <ShrinkOutlined /> : <ExpandOutlined />}
              onClick={() => setExpandAll(!expandAll)}>
              {expandAll ? t('traceGraph.restoreDefault') : t('traceGraph.expandAll')}
            </Button>
            {focus && (
              <Button size="small" icon={<UndoOutlined />} onClick={() => setFocus(null)}>
                {t('traceGraph.backOverview')}
              </Button>
            )}
          </Space>
        </Col>
      </Row>
      {focus && (
        <Alert type="success" showIcon style={{ marginBottom: 8 }}
          message={t('traceGraph.focusAlert', {
            node: focus.node.name,
            chain: focus.path.length > 1 ? focus.path.slice(0, -1).map((n) => n.name).join(' → ') : t('traceGraph.rootParen'),
            n: countNodes(focus.node) - 1,
          })} />
      )}
      <Text type="secondary" style={{ fontSize: 12 }}>
        {t('traceGraph.legendPrefix')}<Tag color="#cf1322">{t('traceGraph.legendHighPri')}</Tag><Tag color="#fa8c16">{t('traceGraph.legendMidPri')}</Tag>
        <Tag color="#a8071a">{t('traceGraph.legendHighRisk')}</Tag><Tag color="#2f9e44">{t('traceGraph.legendTcPass')}</Tag><Tag color="#cf1322">{t('traceGraph.legendTcFail')}</Tag><Tag color="#bfbfbf">{t('traceGraph.legendNotRun')}</Tag>
      </Text>
      {mode === 'tree' && (
        <Alert type="info" showIcon style={{ margin: '8px 0' }}
          message={t('traceGraph.treeInfo')} />
      )}
      {!hasData
        ? <Empty description={t('traceGraph.emptyData')} />
        : <div ref={chartRef} style={{ height: 560, width: '100%' }} />}

      <Modal open={!!detail} onCancel={() => setDetail(null)} footer={null} title={t('traceGraph.modalTitle', { name: detail?.name })} width={560}>
        {detail?.detail && (
          <Descriptions column={1} bordered size="small">
            {Object.entries(detail.detail).map(([k, v]) => (
              <Descriptions.Item key={k} label={DETAIL_LABEL_KEY[k] ? t(DETAIL_LABEL_KEY[k]) : k}><Text style={{ whiteSpace: 'pre-wrap' }}>{v}</Text></Descriptions.Item>
            ))}
          </Descriptions>
        )}
      </Modal>
    </Card>
  );
}

// 记录类型图标（SVG path，24x24 坐标系，ECharts path:// 符号）
const SYMBOL_PATHS: Record<string, string> = {
  root: 'path://M20,6H4c-1.1,0-2,0.9-2,2v10c0,1.1,0.9,2,2,2h16c1.1,0,2-0.9,2-2V8C22,6.9,21.1,6,20,6z M10,12H4V9h6V12z M20,12h-6V9h6V12z', // 文件夹：项目
  req: 'path://M14,2H6C4.9,2,4,2.9,4,4v16c0,1.1,0.9,2,2,2h12c1.1,0,2-0.9,2-2V8L14,2z M16,18H8v-2h8V18z M16,14H8v-2h8V14z M13,9V3.5L18.5,9H13z', // 文档：需求
  tc: 'path://M12,2C6.48,2,2,6.48,2,12s4.48,10,10,10s10-4.48,10-10S17.52,2,12,2z M10,17l-5-5l1.41-1.41L10,14.17l7.59-7.59L19,8L10,17z', // 对勾圆：测试用例
  fmea: 'path://M12,2L1,21h22L12,2z M13,17h-2v-2h2V17z M13,13h-2V7h2V13z', // 警示三角：风险
  link: 'path://M10.59,13.41c0.41,0.39,0.41,1.03,0,1.42c-1.42,1.42-3.76,1.42-5.18,0c-0.39-0.39-0.39-1.03,0-1.42l2.83-2.83c0.39-0.39,1.03-0.39,1.42,0l0.71,0.71l1.41-1.41l-0.71-0.71c-1.15-1.15-3.01-1.15-4.16,0l-2.83,2.83C1.64,13.54,1.64,15.4,2.79,16.55l0.01,0.01C3.94,17.7,5.8,17.7,6.95,16.55l0.71-0.71l-1.41-1.41l-0.71,0.71c-0.59,0.59-1.54,0.59-2.12,0c-0.59-0.59-0.59-1.54,0-2.12l2.83-2.83c0.59-0.59,1.54-0.59,2.12,0c0.3,0.3,0.44,0.68,0.44,1.06c0,0.32-0.11,0.63-0.32,0.88l1.41,1.41l0.71-0.71c0.39-0.39,0.39-1.03,0-1.42c-0.39-0.39-1.03-0.39-1.42,0l-0.01,0.01C11.61,12.38,11.61,13.25,12.34,13.98l0.25,0.25L13.75,12.8l-0.25-0.25C13.25,12.61,13.25,12.07,13.66,11.66z', // 链接链：关联
};

// 按节点类型取符号
function symbolOf(kind?: string): string {
  return (kind && SYMBOL_PATHS[kind]) || 'circle';
}

// 递归为节点内嵌 itemStyle.color —— tree 系列 symbol 颜色不认 color 回调，必须内嵌到数据里
function applyColors(node: GraphNode): Record<string, unknown> {
  return {
    ...node,
    itemStyle: { color: node.color },
    children: (node.children || []).map(applyColors),
  };
}

// 截断标题（超长显示部分信息，保证美观）
function truncate(s: string, n: number): string {
  const clean = s.replace(/[{}]/g, '');
  return clean.length > n ? clean.slice(0, n) + '…' : clean;
}

// 节点 label：编号 + 标题两行（第二行浅色小字，超长截断）
// 有未展开子节点时在编号后显示 ⊕ 符号，提示后面还有更深追溯数据
function nodeLabel(p: unknown, expanded?: Set<string>): string {
  const d = (p as { data?: GraphNode })?.data;
  if (!d) return '';
  const hasHidden = (d.children?.length ?? 0) > 0 && !(expanded?.has(d.name));
  const name = hasHidden ? `${d.name} ⊕` : d.name;
  const title = d.value ? truncate(d.value, 11) : '';
  return title ? `{name|${name}}\n{title|${title}}` : `{name|${name}}`;
}

const LABEL_RICH = {
  name: { fontSize: 11, fontWeight: 600, color: '#333', lineHeight: 13, backgroundColor: 'rgba(255,255,255,0.8)', padding: [1, 4], borderRadius: 3 },
  title: { fontSize: 9, color: '#8c8c8c', lineHeight: 12, backgroundColor: 'rgba(255,255,255,0.8)', padding: [0, 4], borderRadius: 3 },
};

// 树图配置
function treeSeries(root: GraphNode, expanded?: Set<string>, depth = 3) {
  return {
    type: 'tree',
    data: [applyColors(root)],
    orient: 'LR',
    top: '4%', left: '3%', bottom: '6%', right: '22%',
    // ECharts 回调签名：(value, params) —— 第一个是节点值，第二个才是节点参数对象
    symbol: (_value: unknown, params: unknown) => symbolOf((params as { data?: GraphNode })?.data?.kind),
    symbolSize: (_value: unknown, params: unknown) => {
      const kind = (params as { data?: GraphNode })?.data?.kind;
      return kind === 'root' ? 20 : kind === 'req' || kind === 'risk' ? 14 : kind === 'tc' ? 12 : kind === 'link' ? 9 : 8;
    },
    initialTreeDepth: depth,
    expandAndCollapse: true,
    roam: true,
    label: {
      position: 'left', verticalAlign: 'middle', align: 'right', fontSize: 11,
      formatter: (p: unknown) => nodeLabel(p, expanded),
      rich: LABEL_RICH,
    },
    leaves: { label: { position: 'right', align: 'left', formatter: (p: unknown) => nodeLabel(p, expanded), rich: LABEL_RICH } },
    lineStyle: { color: '#c5d3e0', width: 1.2 },
    itemStyle: { color: (p: unknown) => (p as { data?: GraphNode })?.data?.color ?? '#1b6ca8' },
    emphasis: { focus: 'descendant', lineStyle: { width: 2 } },
  };
}

// 关系图配置
function graphSeries(root: GraphNode, extra: { source: string; target: string; relType: string }[] = []) {
  const data = graphData(root);
  const nameSet = new Set(data.map((d) => d.name));
  const extraLinks = extra
    .filter((e) => nameSet.has(e.source) && nameSet.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }));
  return {
    type: 'graph',
    layout: 'force',
    roam: true,
    draggable: true,
    force: { repulsion: 420, edgeLength: 130, gravity: 0.08 },
    symbol: (params: unknown) => symbolOf((params as { data?: GraphNode })?.data?.kind),
    symbolSize: (params: unknown) => {
      const kind = (params as { data?: GraphNode })?.data?.kind;
      return kind === 'root' ? 22 : kind === 'req' || kind === 'risk' ? 15 : kind === 'tc' ? 13 : kind === 'link' ? 10 : 9;
    },
    label: { show: true, fontSize: 11, position: 'bottom', formatter: nodeLabel, rich: LABEL_RICH },
    lineStyle: { color: '#b8c7d6', width: 1.2, curveness: 0.1 },
    itemStyle: { color: (p: unknown) => (p as { data?: GraphNode })?.data?.color ?? '#1b6ca8' },
    data,
    links: [...graphLinks(root), ...extraLinks],
  };
}

// 关系图数据（扁平节点；按 name 去重 —— graph 系列要求节点唯一）
type GraphDataNode = GraphNode & { itemStyle: { color: string } };

function graphData(root: GraphNode): GraphDataNode[] {
  const map = new Map<string, GraphDataNode>();
  const walk = (node: GraphNode) => {
    if (!map.has(node.name)) map.set(node.name, { ...node, children: undefined, itemStyle: { color: node.color } });
    for (const c of node.children || []) walk(c);
  };
  walk(root);
  return [...map.values()];
}

function graphLinks(root: GraphNode): { source: string; target: string }[] {
  const out: { source: string; target: string }[] = [];
  const seen = new Set<string>();
  const walk = (node: GraphNode) => {
    for (const c of node.children || []) {
      const key = `${node.name}->${c.name}`;
      if (!seen.has(key)) { seen.add(key); out.push({ source: node.name, target: c.name }); }
      walk(c);
    }
  };
  walk(root);
  return out;
}

// 某实体的非层级关联子节点（kind='link'，紫色 🔗）
// 排除 req↔tc 层级边（树主结构已表达）
function relChildNodes(
  meType: LinkEntityType, meId: number, links: TraceLink[],
  reqs: { id?: number; reqId: string; desc: string }[],
  tcs: { id?: number; tcId: string; title: string }[],
  fmeas: { id?: number; rpn: number; failureMode: string }[],
  tr?: (key: string) => string,
): GraphNode[] {
  const out: GraphNode[] = [];
  const isLevelEdge = (l: TraceLink) =>
    (l.fromType === 'req' && l.toType === 'tc') || (l.fromType === 'tc' && l.toType === 'req');
  const pushRel = (dir: '出向' | '入向', otherType: LinkEntityType, otherId: number, relType: string) => {
    if (isLevelEdge({ fromType: meType, fromId: meId, toType: otherType, toId: otherId } as TraceLink)) return;
    const otherName = entityName(otherType, otherId, reqs, tcs, fmeas, true, tr);
    const dirLabel = tr ? tr(dir === '出向' ? 'traceGraph.dirOut' : 'traceGraph.dirIn') : dir;
    out.push({
      name: `🔗 ${dirLabel} ${otherName}`,
      value: relType,
      color: '#722ed1',
      kind: 'link',
      detail: { 方向: dirLabel, 关系类型: relType, 对方: entityName(otherType, otherId, reqs, tcs, fmeas, false, tr) },
    });
  };
  for (const l of links) {
    if (l.fromType === meType && l.fromId === meId) pushRel('出向', l.toType, l.toId, l.relType);
    if (l.toType === meType && l.toId === meId) pushRel('入向', l.fromType, l.fromId, l.relType);
  }
  return out;
}

// 实体名解析（type:id -> 展示名）
function entityName(type: LinkEntityType, id: number,
  reqs: { id?: number; reqId: string; desc: string }[],
  tcs: { id?: number; tcId: string; title: string }[],
  fmeas: { id?: number; rpn: number; failureMode: string }[],
  short = false,
  tr?: (key: string) => string,
): string {
  if (type === 'req') { const r = reqs.find((x) => x.id === id); return r ? `${r.reqId}${short ? '' : ' ' + r.desc.slice(0, 16)}` : `${type}#${id}`; }
  if (type === 'tc') { const t = tcs.find((x) => x.id === id); return t ? `${t.tcId}${short ? '' : ' ' + t.title.slice(0, 16)}` : `${type}#${id}`; }
  if (type === 'fmea') { const f = fmeas.find((x) => x.id === id); return f ? (tr ? `${tr('traceGraph.nodeRisk')}${f.rpn}` : `风险 RPN-${f.rpn}`) : `${type}#${id}`; }
  return `${type}#${id}`;
}

// 统计子树节点数
function countNodes(node: GraphNode): number {
  let n = 1;
  for (const c of node.children || []) n += countNodes(c);
  return n;
}

// 构建聚焦树：祖先链只保留通往目标的唯一分支，目标节点保留全部后代
// path 为从 root 到目标（含目标）的节点数组
function buildFocusedTree(path: GraphNode[]): GraphNode {
  if (path.length <= 1) return path[0];
  const root: GraphNode = { ...path[0], children: [] };
  let cur = root;
  for (let i = 1; i < path.length; i++) {
    const isTarget = i === path.length - 1;
    const node: GraphNode = {
      ...path[i],
      children: isTarget ? path[i].children : [],
    };
    cur.children = [node];
    cur = node;
  }
  return root;
}

// 供类型引用
export type { GraphNode as TraceGraphNode };
export { RESULT_LABEL as TraceResultLabel };
