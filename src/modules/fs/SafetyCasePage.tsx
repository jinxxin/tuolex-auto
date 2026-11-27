import { useMemo, useState } from 'react';
import { fsPidFromUrl } from './projectLink';
import {
  Card, Table, Tag, Button, Space, Typography, Modal, Input, Select, Drawer, Alert, message, Popconfirm, Tooltip, Switch, Badge,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ScanOutlined, LinkOutlined, AuditOutlined, FileProtectOutlined, RobotOutlined,
  AppstoreOutlined, ExportOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { apiFetch, useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import { useAuth } from '../../store/auth';
import { GSN_ELEMENTS, CASE_SKELETONS } from '../../core/fs/data';
import type { FsSafetyCase, FsCaseNode, FsCaseNodeKind, LinkEntityType, FsCasePattern } from '../../core/types';

const { Text } = Typography;
const nid = () => `N${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const KIND_COLOR: Record<FsCaseNodeKind, string> = {
  goal: 'red', strategy: 'orange', solution: 'green', context: 'cyan', assumption: 'gold', justification: 'purple',
};
const KIND_SHAPE: Record<FsCaseNodeKind, string> = {
  goal: '▭', strategy: '▱', solution: '●', context: '▢', assumption: '◯', justification: '◯J',
};

interface TreeCaseNode { n: FsCaseNode; children: TreeCaseNode[] }
const buildTree = (nodes: FsCaseNode[]): TreeCaseNode[] => {
  const byId = new Map<string, FsCaseNode>();
  for (const x of nodes) byId.set(x.id, x);
  const map = new Map<string, TreeCaseNode>();
  for (const x of nodes) map.set(x.id, { n: x, children: [] });
  const roots: TreeCaseNode[] = [];
  for (const x of nodes) {
    if (x.parentId && map.has(x.parentId)) map.get(x.parentId)!.children.push(map.get(x.id)!);
    else roots.push(map.get(x.id)!);
  }
  return roots;
};
const flatten = (roots: TreeCaseNode[]): FsCaseNode[] => {
  const out: FsCaseNode[] = [];
  const walk = (t: TreeCaseNode) => { out.push(t.n); t.children.forEach(walk); };
  roots.forEach(walk);
  return out;
};
const blankNode = (kind: FsCaseNodeKind, parentId?: string): FsCaseNode =>
  ({ id: nid(), kind, text: '', parentId, undeveloped: kind === 'goal' || kind === 'strategy' });

// 占位符提取（模式库：{{键}}）
const PLACEHOLDER_RE = /\{\{\s*([\w\u4e00-\u9fff-]+)\s*\}\}/g;
const extractPlaceholders = (nodes: FsCaseNode[]): string[] => {
  const set = new Set<string>();
  for (const n of nodes) { PLACEHOLDER_RE.lastIndex = 0; let m: RegExpExecArray | null; while ((m = PLACEHOLDER_RE.exec(n.text || ''))) set.add(m[1]); }
  return [...set];
};

// ---------- 证据选择器 ----------
const EV_TYPES: { type: LinkEntityType | 'assessment' | 'review'; label: string }[] = [
  { type: 'fs_req', label: 'FS 需求' }, { type: 'fs_hazard', label: 'HARA 危害' },
  { type: 'fs_fmeda', label: 'FMEDA' }, { type: 'fs_fta', label: 'FTA' }, { type: 'fs_dfa', label: 'DFA' },
  { type: 'req', label: 'A-SPICE 需求' }, { type: 'tc', label: '测试用例' }, { type: 'fmea', label: 'FMEA' },
  { type: 'vdoc', label: '验证文档' }, { type: 'wp', label: '工作产品' },
];

async function loadEvRows(pid: number, type: LinkEntityType | 'assessment' | 'review') {
  switch (type) {
    case 'fs_req': return db.fs_safety_reqs.where('projectId').equals(pid).toArray();
    case 'fs_hazard': return db.fs_hazards.where('projectId').equals(pid).toArray();
    case 'fs_fmeda': return db.fs_fmeda.where('projectId').equals(pid).toArray();
    case 'fs_fta': return db.fs_fta.where('projectId').equals(pid).toArray();
    case 'fs_dfa': return db.fs_dfa.where('projectId').equals(pid).toArray();
    case 'req': return db.req_items.where('projectId').equals(pid).toArray();
    case 'tc': return db.test_cases.where('projectId').equals(pid).toArray();
    case 'fmea': return db.fmea_items.where('projectId').equals(pid).toArray();
    case 'vdoc': return db.vdocs.where('projectId').equals(pid).toArray();
    case 'wp': return db.work_products.where('projectId').equals(pid).toArray();
    default: return [];
  }
}

function useEvOptions(pid: number, type: LinkEntityType | 'assessment' | 'review') {
  // 单一 hook 调用：按 type 选择数据表，避免条件式 hook 顺序问题
  const rows = useLiveQuery(
    () => loadEvRows(pid, type).then((r) => r as unknown as Record<string, unknown>[]),
    [pid, type],
  ) ?? [];

  return rows.map((r) => {
    const id = r.id as number;
    switch (type) {
      case 'fs_req': return { value: `fs_req:${id}`, label: `${String(r.code ?? '')} ${String(r.text ?? '').slice(0, 30)}` };
      case 'fs_hazard': return { value: `fs_hazard:${id}`, label: `${String(r.hazId ?? '')} ${String(r.title ?? '').slice(0, 30)}` };
      case 'fs_fmeda': return { value: `fs_fmeda:${id}`, label: `${String(r.fmedaId ?? '')} ${String(r.item ?? '')}` };
      case 'fs_fta': return { value: `fs_fta:${id}`, label: `${String(r.ftaId ?? '')} ${String(r.topEvent ?? '')}` };
      case 'fs_dfa': return { value: `fs_dfa:${id}`, label: `${String(r.dfaId ?? '')} ${String(r.scope ?? '')}` };
      case 'req': return { value: `req:${id}`, label: `${String(r.reqId ?? '')} ${String(r.desc ?? '').slice(0, 30)}` };
      case 'tc': return { value: `tc:${id}`, label: `${String(r.tcId ?? '')} ${String(r.title ?? '').slice(0, 30)}` };
      case 'fmea': return { value: `fmea:${id}`, label: `RPN ${String(r.rpn ?? '')} ${String(r.failureMode ?? '').slice(0, 26)}` };
      case 'vdoc': return { value: `vdoc:${id}`, label: `${String(r.docType ?? 'VDoc')} ${String(r.title ?? '').slice(0, 26)}` };
      case 'wp': return { value: `wp:${id}`, label: String(r.title ?? '').slice(0, 40) };
      default: return { value: '', label: '' };
    }
  });
}

// ---------- 缺口扫描 ----------
export function scanCaseGaps(nodes: FsCaseNode[]): { nodeId: string; kind: 'no_ev' | 'no_child' | 'undeveloped' | 'orphan'; node: FsCaseNode }[] {
  const ids = new Set(nodes.map((x) => x.id));
  const gaps: ReturnType<typeof scanCaseGaps> = [];
  for (const x of nodes) {
    const kids = nodes.filter((c) => c.parentId === x.id);
    if (x.parentId && !ids.has(x.parentId)) gaps.push({ nodeId: x.id, kind: 'orphan', node: x });
    if (x.kind === 'goal' && kids.length === 0 && !x.evidenceRef && !x.awayGoal) gaps.push({ nodeId: x.id, kind: 'undeveloped', node: x });
    if (x.kind === 'strategy' && kids.length === 0 && !x.awayGoal) gaps.push({ nodeId: x.id, kind: 'no_child', node: x });
    if (x.kind === 'solution' && !x.evidenceRef && !x.awayGoal) gaps.push({ nodeId: x.id, kind: 'no_ev', node: x });
  }
  return gaps;
}

// ---------- 递归节点编辑器 ----------
function CaseNodeEditor({ node, onChange, depth, pid, t, me, caseMap }: {
  node: TreeCaseNode; onChange: (n: TreeCaseNode) => void; depth: number; pid: number;
  t: (k: string, v?: Record<string, unknown>) => string; me: { id: number; username: string };
  caseMap: Record<number, FsSafetyCase>;
}) {
  const [pickOpen, setPickOpen] = useState(false);
  const [pickType, setPickType] = useState<LinkEntityType | 'assessment' | 'review'>('fs_req');
  const [pickVal, setPickVal] = useState<string>();
  const [awayOpen, setAwayOpen] = useState(false);
  const [awayCase, setAwayCase] = useState<number>();
  const [awayNode, setAwayNode] = useState<string>();
  const evOpts = useEvOptions(pid, pickType);
  const n = node.n;
  const away = n.awayGoal;
  const refCase = away ? caseMap[away.caseId] : undefined;
  const refNode = refCase && away ? (refCase.nodes || []).find((x) => x.id === away.nodeId) : undefined;
  const awayChanged = !!away && (!refNode || refNode.text !== away.refText || (refCase?.version ?? '') !== away.refVersion);
  const markReviewed = () => { if (!away || !refCase || !refNode) return; set({ awayGoal: { ...away, refText: refNode.text, refVersion: refCase.version, reviewedAt: Date.now(), reviewedBy: me.username } }); };
  const set = (patch: Partial<FsCaseNode>) => onChange({ ...node, n: { ...n, ...patch } });
  const childOn = (i: number) => (c: TreeCaseNode) => onChange({ ...node, children: node.children.map((x, j) => (j === i ? c : x)) });
  const del = () => onChange({ ...node, n: { ...n, text: '__DEL__' } });
  const approve = async () => {
    await db.fs_safety_cases.toArray(); // noop: 审计由保存动作统一写；此处仅本地标记
    set({ approvedBy: me.username, approvedAt: Date.now() });
  };

  return (
    <div style={{ marginLeft: depth * 26, borderLeft: depth ? '1px dashed #d9d9d9' : undefined, paddingLeft: depth ? 8 : 0 }}>
      <Space size={6} style={{ display: 'flex', width: '100%', marginBottom: 4 }}>
        <Tag color={KIND_COLOR[n.kind]} style={{ minWidth: 92, textAlign: 'center', marginRight: 0, fontSize: 11 }}>
          {KIND_SHAPE[n.kind]} {t(`safetyCasePage.k${n.kind.charAt(0).toUpperCase()}${n.kind.slice(1)}`)}
        </Tag>
        <Select size="small" style={{ width: 118 }} value={n.kind}
          onChange={(v) => set({ kind: v, undeveloped: v === 'goal' || v === 'strategy' ? n.undeveloped : undefined })}
          options={GSN_ELEMENTS.map((g) => ({ value: g.kind, label: t(`safetyCasePage.k${g.kind.charAt(0).toUpperCase()}${g.kind.slice(1)}`) }))} />
        <Input size="small" data-testid="case-text" style={{ flex: 1, maxWidth: 380 }} value={n.text} placeholder={t('safetyCasePage.casePh')}
          onChange={(e) => set({ text: e.target.value })} />
        {n.kind === 'goal' && (
          <Tooltip title={t('safetyCasePage.undeveloped')}>
            <Switch size="small" checked={!!n.undeveloped} onChange={(v) => set({ undeveloped: v })} />
          </Tooltip>
        )}
        {n.kind === 'solution' && (
          <Button size="small" aria-label="case-link-ev" type={n.evidenceRef ? 'primary' : 'default'} ghost={!!n.evidenceRef} icon={<LinkOutlined />} onClick={() => setPickOpen(true)}>
            {n.evidenceRef ? t('safetyCasePage.evLinked', { label: n.evidenceRef.type }) : t('safetyCasePage.evPick')}
          </Button>
        )}
        {n.kind === 'goal' && (
          <Tooltip title={t('safetyCasePage.approve')}>
            <Button size="small" type="text" icon={<AuditOutlined />} disabled={!!n.approvedAt} onClick={approve} />
          </Tooltip>
        )}
        <Tooltip title={t('safetyCasePage.awayTip')}>
          <Button size="small" aria-label="case-away" type={away ? 'primary' : 'default'} ghost={!!away} icon={<ExportOutlined />} onClick={() => setAwayOpen(true)} />
        </Tooltip>
        {away && <Tag color={awayChanged ? 'red' : 'blue'} style={{ fontSize: 10 }}>↗ {away.caseTitle}#{away.nodeId}{awayChanged ? ' ⚠' : ''}</Tag>}
        {away && awayChanged && <Button size="small" type="link" onClick={markReviewed}>{t('safetyCasePage.awayReview')}</Button>}
        {n.approvedAt && <Tag color="green" style={{ fontSize: 10 }}>{t('safetyCasePage.approvedTag')} {n.approvedBy}</Tag>}
        <Tooltip title={t('safetyCasePage.addNode')}>
          <Button size="small" aria-label="case-add-child" icon={<PlusOutlined />} onClick={() => { const k = n.kind === 'goal' ? 'strategy' : n.kind === 'strategy' ? 'solution' : 'solution'; onChange({ ...node, children: [...node.children, { n: blankNode(k, n.id), children: [] }] }); }} />
        </Tooltip>
        {depth > 0 && <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={del} />}
      </Space>
      {node.children.map((c, i) => <CaseNodeEditor key={c.n.id} node={c} onChange={childOn(i)} depth={depth + 1} pid={pid} t={t} me={me} caseMap={caseMap} />)}

      {/* 证据选择 */}
      <Modal open={pickOpen} title={t('safetyCasePage.evPick')} onCancel={() => setPickOpen(false)} width={520}
        onOk={() => {
          if (!pickVal) return;
          const [ty, id] = pickVal.split(':');
          set({ evidenceRef: { type: ty as LinkEntityType, id: Number(id) }, undeveloped: false });
          setPickOpen(false);
        }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select style={{ width: '100%' }} placeholder={t('safetyCasePage.evType')} value={pickType}
            onChange={(v) => { setPickType(v); setPickVal(undefined); }}
            options={EV_TYPES.map((x) => ({ value: x.type, label: x.label }))} />
          <Select style={{ width: '100%' }} showSearch placeholder={t('safetyCasePage.evTarget')} value={pickVal}
            onChange={setPickVal} options={evOpts} optionFilterProp="label" />
          {n.evidenceRef && <Button size="small" danger onClick={() => { set({ evidenceRef: undefined }); setPickVal(undefined); }}>{t('safetyCasePage.clearEv')}</Button>}
        </Space>
      </Modal>

      {/* 模块化引用（Away Goal）：引用另一安全案例的已论证节点 */}
      <Modal open={awayOpen} title={t('safetyCasePage.awayPick')} onCancel={() => setAwayOpen(false)} width={560}
        onOk={() => {
          if (!awayCase || !awayNode) return;
          const rc = caseMap[awayCase]; const rn = (rc?.nodes || []).find((x) => x.id === awayNode);
          if (!rc || !rn) return;
          set({ awayGoal: { caseId: awayCase, caseTitle: rc.title, nodeId: awayNode, refText: rn.text, refVersion: rc.version, reviewedAt: Date.now(), reviewedBy: me.username }, undeveloped: false });
          setAwayOpen(false); setAwayCase(undefined); setAwayNode(undefined);
        }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('safetyCasePage.awayHint')}</Text>
          <Select style={{ width: '100%' }} placeholder={t('safetyCasePage.awayCase')} value={awayCase} showSearch optionFilterProp="label"
            onChange={(v) => { setAwayCase(v); setAwayNode(undefined); }}
            options={Object.values(caseMap).filter((c) => c.id != null).map((c) => ({ value: c.id!, label: `${c.title} (v${c.version})` }))} />
          <Select style={{ width: '100%' }} placeholder={t('safetyCasePage.awayNode')} value={awayNode} showSearch optionFilterProp="label"
            onChange={setAwayNode}
            options={(awayCase ? (caseMap[awayCase]?.nodes || []) : []).map((x) => ({ value: x.id, label: `${x.id} [${x.kind}] ${(x.text || '').slice(0, 36)}` }))} />
          {away && <Button size="small" danger onClick={() => { set({ awayGoal: undefined }); setAwayCase(undefined); setAwayNode(undefined); }}>{t('safetyCasePage.awayClear')}</Button>}
        </Space>
      </Modal>
    </div>
  );
}

export default function SafetyCasePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [msg, msgCtx] = message.useMessage();
  const [activePid, setActivePid] = useState<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FsSafetyCase | null>(null);
  const [title, setTitle] = useState('');
  const [ver, setVer] = useState('1.0');
  const [st, setSt] = useState<FsSafetyCase['status']>('draft');
  const [roots, setRoots] = useState<TreeCaseNode[]>([]);
  const [gaps, setGaps] = useState<ReturnType<typeof scanCaseGaps>>([]);
  const [gapOpen, setGapOpen] = useState(false);
  const [skelBusy, setSkelBusy] = useState(false);
  const [patOpen, setPatOpen] = useState(false);
  const [patName, setPatName] = useState('');
  const [patDesc, setPatDesc] = useState('');
  const [applyPat, setApplyPat] = useState<FsCasePattern | null>(null);
  const [phVals, setPhVals] = useState<Record<string, string>>({});
  const me = { id: user?.id ?? 0, username: user?.username ?? 'unknown' };

  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? [];
  const fsProjects = useMemo(() => projects.filter((p) => p.fsEnabled), [projects]);
  const pid = fsPidFromUrl(fsProjects.map((p) => p.id!), activePid);
  const cases = useLiveQuery(() => (pid != null ? db.fs_safety_cases.where('projectId').equals(pid).toArray() : Promise.resolve([])), [pid]) ?? [];
  const patterns = useLiveQuery(() => db.fs_case_patterns.orderBy('id').toArray(), []) ?? [];
  const awayCaseMap = useMemo(() => { const m: Record<number, FsSafetyCase> = {}; for (const c of cases) if (c.id != null && c.id !== editing?.id) m[c.id] = c; return m; }, [cases, editing]);

  const stripDel = (trees: TreeCaseNode[]): TreeCaseNode[] => trees
    .filter((x) => x.n.text !== '__DEL__')
    .map((x) => ({ n: x.n, children: stripDel(x.children) }));

  const openCreate = () => {
    setEditing(null); setTitle(''); setVer('1.0'); setSt('draft');
    setRoots([{ n: blankNode('goal'), children: [] }]);
    setOpen(true);
  };
  const openEdit = async (it: FsSafetyCase) => {
    const full = (await db.fs_safety_cases.get(it.id!)) ?? it;
    setEditing(it); setTitle(full.title); setVer(full.version); setSt(full.status);
    setRoots(buildTree(full.nodes || []));
    setOpen(true);
  };

  const scan = () => {
    const g = scanCaseGaps(flatten(stripDel(roots)));
    setGaps(g);
    if (g.length === 0) msg.success(t('safetyCasePage.scanNone'));
    else setGapOpen(true);
  };

  const save = async () => {
    const nodes = flatten(stripDel(roots));
    const clean = nodes; // 草稿期允许空文本占位节点（缺口扫描揪出，保存不强制）
    if (clean.length === 0) { msg.warning(t('safetyCasePage.minOneNode')); return; }
    const gapsData = scanCaseGaps(clean).map((g) => ({ nodeId: g.nodeId, issue: g.kind }));
    const now = Date.now();
    if (editing?.id) {
      await db.fs_safety_cases.update(editing.id, {
        title, version: ver, status: st, nodes: clean, gaps: gapsData, updatedAt: now,
      }, t('safetyCasePage.auditEdit', { title, version: ver }));
    } else {
      await db.fs_safety_cases.add({
        projectId: pid!, title, version: ver, nodes: clean, gaps: gapsData, status: 'draft', createdAt: now, updatedAt: now,
      }, t('safetyCasePage.auditNew', { title }));
    }
    setOpen(false);
    msg.success('✓');
  };

  const del = async (it: FsSafetyCase) => { await db.fs_safety_cases.delete(it.id!, t('safetyCasePage.auditDel', { title: it.title })); };

  // ---------- 生成论证骨架（二期 M1：先 LLM → 降级本地 CASE_SKELETONS） ----------
  const genSkeleton = async () => {
    if (skelBusy) return;
    const firstGoal = roots.length === 1 ? roots[0].n.text.trim() : '';
    const goalText = firstGoal || title.trim();
    setSkelBusy(true);
    let strategies: { text: string; solutions: string[] }[] | null = null;
    try {
      const res = await apiFetch('/ai/fs/case', {
        method: 'POST', body: JSON.stringify({ goalText: goalText || undefined }),
      });
      const d = await res.json();
      if (d?.source === 'llm' && Array.isArray(d.strategies) && d.strategies.length) {
        strategies = d.strategies.map((x: { text?: string; solutions?: string[] }) => ({
          text: String(x?.text ?? '').trim(),
          solutions: (Array.isArray(x?.solutions) ? x.solutions : []).map((s: unknown) => String(s).trim()).filter(Boolean),
        })).filter((x: { text: string }) => x.text);
      }
    } catch { /* 降级 */ }
    setSkelBusy(false);
    if (strategies?.length) {
      const gid = nid();
      const g: TreeCaseNode = {
        n: { id: gid, kind: 'goal', text: (goalText || t('safetyCasePage.defGoal')).slice(0, 300), undeveloped: false },
        children: strategies.map((st) => {
          const sid = nid();
          return {
            n: { id: sid, kind: 'strategy', text: st.text, parentId: gid, undeveloped: false },
            children: st.solutions.map((sol) => ({ n: { id: nid(), kind: 'solution', text: sol, parentId: sid }, children: [] })),
          };
        }),
      };
      // 空首 goal（无文本无子节点）→ 就地填充；否则追加新 root（与内置模板行为一致）
      setRoots((p) => {
        const first = p[0];
        if (p.length === 1 && first.children.length === 0 && !first.n.text.trim()) return [g];
        return [...p, g];
      });
      msg.info(t('safetyCasePage.llmSkelNote'));
    } else {
      // 本地内置骨架（原行为：追加）
      const sk = CASE_SKELETONS[0];
      const gid = nid();
      const g: TreeCaseNode = { n: { id: gid, kind: 'goal', text: sk.goalText }, children: sk.strategies.map((st) => {
        const sid = nid();
        return { n: { id: sid, kind: 'strategy', text: st.text, parentId: gid }, children: st.solutions.map((sol) => ({ n: { id: nid(), kind: 'solution', text: sol, parentId: sid }, children: [] })) };
      }) };
      setRoots((p) => [...p, g]);
      if (goalText) msg.info(t('safetyCasePage.llmSkelErr'));
    }
  };

  const advance = async (it: FsSafetyCase) => {
    const next: FsSafetyCase['status'] = it.status === 'draft' ? 'under_review' : 'approved';
    await db.fs_safety_cases.update(it.id!, { status: next, updatedAt: Date.now() }, t('safetyCasePage.statusTo', { next }));
  };
  const savePattern = async () => {
    const nodes = flatten(stripDel(roots));
    if (!nodes.length) { msg.warning(t('safetyCasePage.minOneNode')); return; }
    if (!patName.trim()) { msg.warning(t('safetyCasePage.patNeedName')); return; }
    const now = Date.now();
    await db.fs_case_patterns.add({ name: patName.trim(), description: patDesc.trim() || undefined, tags: [], nodes, placeholders: extractPlaceholders(nodes), createdBy: me.username, createdAt: now, updatedAt: now }, t('safetyCasePage.auditPatSave', { name: patName.trim() }));
    setPatName(''); setPatDesc('');
    msg.success(t('safetyCasePage.patSaved'));
  };
  const delPattern = async (p: FsCasePattern) => { await db.fs_case_patterns.delete(p.id!, t('safetyCasePage.auditPatDel', { name: p.name })); msg.success('✓'); };
  const doApplyPattern = () => {
    if (!applyPat) return;
    const sub = (txt: string) => (txt || '').replace(PLACEHOLDER_RE, (_m, k) => phVals[k] ?? `{{${k}}}`);
    const idMap = new Map<string, string>();
    for (const x of applyPat.nodes) idMap.set(x.id, nid());
    const cloned: FsCaseNode[] = applyPat.nodes.map((x) => ({ ...x, id: idMap.get(x.id)!, text: sub(x.text), parentId: x.parentId ? idMap.get(x.parentId) : undefined, approvedAt: undefined, approvedBy: undefined }));
    setRoots((p) => [...p, ...buildTree(cloned)]);
    msg.success(t('safetyCasePage.patApplied', { name: applyPat.name }));
    setApplyPat(null); setPhVals({});
  };

  const linkCount = (it: FsSafetyCase) => (it.nodes || []).filter((x) => x.kind === 'solution' && x.evidenceRef).length;
  const solCount = (it: FsSafetyCase) => (it.nodes || []).filter((x) => x.kind === 'solution').length;

  const gapText = (k: string) => t(`safetyCasePage.gap${k === 'no_ev' ? 'SolutionNoEv' : k === 'no_child' ? 'StrategyNoChild' : k === 'undeveloped' ? 'UndevelopedGoal' : 'OrphanNode'}`);

  return (
    <Card>
      {msgCtx}
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space align="center">
            <FileProtectOutlined style={{ fontSize: 20, color: '#1b6ca8' }} />
            <Typography.Title level={4} style={{ margin: 0 }}>{t('safetyCasePage.title')}</Typography.Title>
            <Tag color="purple">ISO 26262:2018</Tag>
          </Space>
          {fsProjects.length > 0
            ? <Select style={{ width: 260 }} value={pid} onChange={(v) => setActivePid(v)} options={fsProjects.map((p) => ({ value: p.id!, label: p.name }))} />
            : <Alert type="warning" showIcon message={t('fs.noProject')} />}
        </Space>
        {pid != null && (
          <>
            <Space wrap>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('safetyCasePage.new')}</Button>
              <Text type="secondary" style={{ fontSize: 12 }}>{t('safetyCasePage.sub')}</Text>
            </Space>
            <Table<FsSafetyCase> rowKey="id" size="small" dataSource={cases} pagination={false} locale={{ emptyText: t('safetyCasePage.empty') }}
              columns={[
                { title: t('safetyCasePage.caseTitle'), dataIndex: 'title', ellipsis: true },
                { title: t('safetyCasePage.version'), dataIndex: 'version', width: 70 },
                { title: t('safetyCasePage.nodesN'), key: 'n', width: 90, render: (_: unknown, it) => <Tag>{(it.nodes || []).length}</Tag> },
                {
                  title: t('safetyCasePage.evidenceCoverage'), key: 'ev', width: 180,
                  render: (_: unknown, it) => {
                    const s = solCount(it);
                    const liveGaps = scanCaseGaps(it.nodes || []).length;
                    return s > 0
                      ? <Tag color={liveGaps ? 'orange' : 'green'}>{linkCount(it)}/{s} {t('safetyCasePage.evCovNote')}</Tag>
                      : <Tag>—</Tag>;
                  },
                },
                {
                  title: t('safetyCasePage.gapN'), key: 'g', width: 80,
                  render: (_: unknown, it) => {
                    const live = scanCaseGaps(it.nodes || []).length;
                    return live > 0 ? <Badge count={live}><Tag color="red" style={{ marginRight: 0 }}>!</Tag></Badge> : <Tag color="green">0</Tag>;
                  },
                },
                { title: t('safetyCasePage.status'), dataIndex: 'status', width: 100, render: (v: string) => <Tag color={v === 'approved' ? 'green' : v === 'under_review' ? 'blue' : 'gold'}>{t(`safetyCasePage.${v}`)}</Tag> },
                { title: t('safetyCasePage.version'), dataIndex: 'updatedAt', width: 120, render: (v: number) => dayjs(v).format('MM-DD HH:mm') },
                {
                  title: '', key: 'op', width: 230,
                  render: (_: unknown, it) => (
                    <Space size={2}>
                      <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(it)}>{t('safetyCasePage.edit')}</Button>
                      {it.status !== 'approved' && <Button size="small" type="link" onClick={() => advance(it)}>{it.status === 'draft' ? '→ ' + t('safetyCasePage.under_review') : '→ ' + t('safetyCasePage.approved')}</Button>}
                      <Popconfirm title={t('safetyCasePage.del')} onConfirm={() => del(it)}>
                        <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
            />
          </>
        )}
      </Space>

      <Drawer open={open} width={880} title={editing ? `${t('safetyCasePage.edit')} ${editing.title}` : t('safetyCasePage.new')} onClose={() => setOpen(false)}
        extra={<Space><Button icon={<AppstoreOutlined />} onClick={() => setPatOpen(true)}>{t('safetyCasePage.patterns')}</Button><Button icon={<ScanOutlined />} onClick={scan}>{t('safetyCasePage.scan')}</Button><Button type="primary" aria-label="fs-save" onClick={save}>{t('safetyCasePage.save')}</Button></Space>} destroyOnClose>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap>
            <Input style={{ width: 340 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('safetyCasePage.caseTitle')} addonBefore={t('safetyCasePage.caseTitle')} />
            <Input style={{ width: 80 }} value={ver} onChange={(e) => setVer(e.target.value)} addonBefore="v" />
            <Select style={{ width: 130 }} value={st} onChange={setSt} options={(['draft', 'under_review', 'approved'] as const).map((v) => ({ value: v, label: t(`safetyCasePage.${v}`) }))} />
            <Button icon={<PlusOutlined />} onClick={() => setRoots((p) => [...p, { n: blankNode('goal'), children: [] }])}>{t('safetyCasePage.addRoot')}</Button>
            <Button aria-label="case-skeleton" loading={skelBusy} icon={skelBusy ? undefined : <RobotOutlined />} onClick={genSkeleton}>{t('safetyCasePage.skeleton')}</Button>
          </Space>
          <Alert type="info" showIcon message={t('safetyCasePage.goals') + ' → ' + t('safetyCasePage.kStrategy') + ' → ' + t('safetyCasePage.kSolution')} />
          <div style={{ maxHeight: '62vh', overflow: 'auto' }}>
            {roots.map((r, i) => <CaseNodeEditor key={r.n.id} node={r} onChange={(c) => setRoots((p) => p.map((x, j) => (j === i ? c : x)))} depth={0} pid={pid!} t={t} me={me} caseMap={awayCaseMap} />)}
          </div>
        </Space>
      </Drawer>

      <Drawer open={patOpen} width={680} title={t('safetyCasePage.patterns')} onClose={() => setPatOpen(false)}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Card size="small" title={t('safetyCasePage.patSaveTitle')}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Input value={patName} onChange={(e) => setPatName(e.target.value)} placeholder={t('safetyCasePage.patName')} />
              <Input.TextArea rows={2} value={patDesc} onChange={(e) => setPatDesc(e.target.value)} placeholder={t('safetyCasePage.patDesc')} />
              <Button type="primary" onClick={savePattern}>{t('safetyCasePage.patSave')}</Button>
            </Space>
          </Card>
          {patterns.length === 0
            ? <Text type="secondary">{t('safetyCasePage.patEmpty')}</Text>
            : <Table size="small" rowKey={(r) => r.id ?? 0} dataSource={patterns} pagination={false}
                columns={[
                  { title: t('safetyCasePage.patColName'), dataIndex: 'name', key: 'name' },
                  { title: t('safetyCasePage.patColNodes'), key: 'n', width: 70, render: (_: unknown, p: FsCasePattern) => <Tag>{(p.nodes || []).length}</Tag> },
                  { title: t('safetyCasePage.patColPh'), key: 'ph', width: 190, render: (_: unknown, p: FsCasePattern) => (p.placeholders || []).length ? (p.placeholders || []).map((k) => <Tag key={k} style={{ fontSize: 11 }}>{`{{${k}}}`}</Tag>) : <Text type="secondary">—</Text> },
                  { title: '', key: 'op', width: 150, render: (_: unknown, p: FsCasePattern) => (
                    <Space size={2}>
                      <Button size="small" type="link" icon={<PlusOutlined />} onClick={() => { setApplyPat(p); setPhVals({}); }}>{t('safetyCasePage.patApply')}</Button>
                      <Popconfirm title={t('safetyCasePage.del')} onConfirm={() => delPattern(p)}><Button size="small" type="link" danger icon={<DeleteOutlined />} /></Popconfirm>
                    </Space>
                  ) },
                ]} />}
        </Space>
      </Drawer>

      <Modal open={!!applyPat} title={t('safetyCasePage.patApplyTitle', { name: applyPat?.name ?? '' })} onCancel={() => setApplyPat(null)} onOk={doApplyPattern} okText={t('safetyCasePage.patApply')} cancelText={t('common.cancel')}>
        {(applyPat?.placeholders || []).length === 0
          ? <Text type="secondary">{t('safetyCasePage.patNoPh')}</Text>
          : (applyPat?.placeholders || []).map((k) => (
            <div key={k} style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 12 }}>{`{{${k}}}`}</Text>
              <Input value={phVals[k] ?? ''} onChange={(e) => setPhVals((p) => ({ ...p, [k]: e.target.value }))} placeholder={k} />
            </div>
          ))}
      </Modal>

      <Modal open={gapOpen} title={t('safetyCasePage.scanTitle', { n: gaps.length })} onCancel={() => setGapOpen(false)} footer={null} width={560}>
        <Space direction="vertical" style={{ width: '100%' }}>
          {gaps.map((g, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <Badge status="error" />
              <div><Text>{gapText(g.kind)}</Text><div><Text type="secondary" style={{ fontSize: 12 }}>{g.node.text.slice(0, 60) || g.node.id}</Text></div></div>
            </div>
          ))}
          {gaps.length === 0 && <Text type="success">{t('safetyCasePage.noGap')}</Text>}
        </Space>
      </Modal>
    </Card>
  );
}


