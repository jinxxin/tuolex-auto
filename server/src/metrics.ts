// ============ tuoleX auto · 完整性问题指标（供数据问答使用）============
// 每个指标 = 一条确定性 SQL + 明确口径（v1）+ 快照时间；只返回 count + 前 N 条明细。
// 权限：只统计当前用户可见项目（admin 全量）。
// 未纳入的指标（有原因）：CAPA 系表无 projectId（systemId 体系），无法按项目精确裁剪，暂不做，避免给出错误归属。

import { pool } from './db';

export interface MetricScope { userId: number; username: string; role: string; projectId?: number }
export interface MetricItem { title: string; reason?: string; link?: { href: string; label: string } }
export interface MetricResult {
  name: string; label: string; count: number; items: MetricItem[];
  definition: string; generatedAt: string;
  scope: { projectIds: number[]; projectId: number | null; user: string; role: string };
  error?: string;
}

const LIMIT = 10;
const short = (s: unknown, n = 60): string => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };

async function accessibleProjects(scope: MetricScope): Promise<number[]> {
  if (scope.projectId) {
    if (scope.role === 'admin') return [scope.projectId];
    const r = await pool.query('SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2', [scope.projectId, scope.userId]);
    return r.rows.length ? [scope.projectId] : [];
  }
  if (scope.role === 'admin') { const r = await pool.query('SELECT id FROM projects ORDER BY id'); return r.rows.map((x: any) => Number(x.id)); }
  const r = await pool.query('SELECT project_id FROM project_members WHERE user_id = $1 ORDER BY project_id', [scope.userId]);
  return r.rows.map((x: any) => Number(x.project_id));
}

interface Def { name: string; label: string; definition: string; page: { href: string; label: string }; run: (ids: number[]) => Promise<{ count: number; items: MetricItem[] }> }

export const METRIC_DEFS: Def[] = [
  {
    name: 'req_orphans',
    label: '孤立需求',
    definition: "v1 · req_items 既无出链也无入链（trace_links 中 fromType/toType = 'req' 两端均未出现）",
    page: { href: '#/process/trace', label: '追溯' },
    run: async (ids) => {
      const where = `r."projectId" = ANY($1::int[]) AND NOT EXISTS (
        SELECT 1 FROM trace_links t
         WHERE (t."fromId" = r.id AND t."fromType" = 'req')
            OR (t."toId" = r.id AND t."toType" = 'req'))`;
      const c = await pool.query(`SELECT COUNT(*)::int AS n FROM req_items r WHERE ${where}`, [ids]);
      const r = await pool.query(`SELECT r.id, r."projectId", r."reqId", r."reqType", r."desc" FROM req_items r WHERE ${where} ORDER BY r."projectId", r.id LIMIT ${LIMIT}`, [ids]);
      return { count: c.rows[0]?.n ?? 0, items: r.rows.map((x: any) => ({ title: `${x.reqId}（${x.reqType}）${short(x.desc, 40)}`, reason: `项目 #${x.projectId} · 无任何追溯链`, link: { href: '#/process/trace', label: '去补链' } })) };
    },
  },
  {
    name: 'tc_orphans',
    label: '无关联测试用例',
    definition: "v1 · test_cases 未被任何 trace_links 以 toType='tc' 指向",
    page: { href: '#/process/trace', label: '追溯' },
    run: async (ids) => {
      const where = `tc."projectId" = ANY($1::int[]) AND NOT EXISTS (
        SELECT 1 FROM trace_links t WHERE t."toType" = 'tc' AND t."toId" = tc.id)`;
      const c = await pool.query(`SELECT COUNT(*)::int AS n FROM test_cases tc WHERE ${where}`, [ids]);
      const r = await pool.query(`SELECT tc.id, tc."projectId", tc."tcId", tc.title FROM test_cases tc WHERE ${where} ORDER BY tc."projectId", tc.id LIMIT ${LIMIT}`, [ids]);
      return { count: c.rows[0]?.n ?? 0, items: r.rows.map((x: any) => ({ title: `${x.tcId} ${short(x.title, 40)}`, reason: `项目 #${x.projectId} · 未被任何需求引用`, link: { href: '#/process/trace', label: '去关联' } })) };
    },
  },
  {
    name: 'overdue_tasks',
    label: '逾期任务',
    definition: "v1 · plan_tasks.status <> 'done' 且 endMs 早于当前时间",
    page: { href: '#/plan/board', label: '计划看板' },
    run: async (ids) => {
      const where = `t."projectId" = ANY($1::int[]) AND t.status <> 'done' AND t."endMs" IS NOT NULL AND t."endMs" < $2`;
      const now = Date.now();
      const c = await pool.query(`SELECT COUNT(*)::int AS n FROM plan_tasks t WHERE ${where}`, [ids, now]);
      const r = await pool.query(`SELECT t.id, t."projectId", t.code, t.name, t.status, t."endMs" FROM plan_tasks t WHERE ${where} ORDER BY t."endMs" LIMIT ${LIMIT}`, [ids, now]);
      return { count: c.rows[0]?.n ?? 0, items: r.rows.map((x: any) => ({ title: `${x.code} ${short(x.name, 36)}`, reason: `项目 #${x.projectId} · 逾期（截止 ${new Date(Number(x.endMs)).toISOString().slice(0, 10)}）`, link: { href: '#/plan/board', label: '去处理' } })) };
    },
  },
  {
    name: 'unsigned_docs',
    label: '未定稿文档',
    definition: "v1 · vdocs.status <> 'approved'（草稿/评审中均算未定稿，尚无生效签名）",
    page: { href: '#/docs', label: '在线文档' },
    run: async (ids) => {
      const where = `v."projectId" = ANY($1::int[]) AND v.status <> 'approved'`;
      const c = await pool.query(`SELECT COUNT(*)::int AS n FROM vdocs v WHERE ${where}`, [ids]);
      const r = await pool.query(`SELECT v.id, v."projectId", v.title, v.status, v.version FROM vdocs v WHERE ${where} ORDER BY v."projectId", v.id LIMIT ${LIMIT}`, [ids]);
      return { count: c.rows[0]?.n ?? 0, items: r.rows.map((x: any) => ({ title: `${short(x.title, 40)}`, reason: `项目 #${x.projectId} · 状态 ${x.status} · v${x.version}`, link: { href: '#/docs', label: '去定稿' } })) };
    },
  },

];

export const METRIC_NAMES = METRIC_DEFS.map((d) => d.name);

export async function runMetric(name: string, scope: MetricScope): Promise<MetricResult | null> {
  const def = METRIC_DEFS.find((d) => d.name === name);
  if (!def) return null;
  const projectIds = await accessibleProjects(scope);
  const base: MetricResult = {
    name: def.name, label: def.label, count: 0, items: [], definition: def.definition,
    generatedAt: new Date().toISOString(),
    scope: { projectIds, projectId: scope.projectId ?? null, user: scope.username, role: scope.role },
  };
  if (!projectIds.length) return base;
  try { const r = await def.run(projectIds); return { ...base, count: r.count, items: r.items }; }
  catch (e) { return { ...base, error: (e as Error).message }; }
}

export async function runOverview(scope: MetricScope): Promise<{ rows: MetricResult[]; total: number; projectIds: number[] }> {
  const rows: MetricResult[] = [];
  for (const d of METRIC_DEFS) { const r = await runMetric(d.name, scope); if (r) rows.push(r); }
  return { rows, total: rows.reduce((n, r) => n + (r.error ? 0 : r.count), 0), projectIds: rows[0]?.scope.projectIds ?? [] };
}

export function metricPage(name: string): { href: string; label: string } | null {
  return METRIC_DEFS.find((d) => d.name === name)?.page ?? null;
}
