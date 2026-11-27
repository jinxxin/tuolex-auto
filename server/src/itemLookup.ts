// ============ EasyIPD · 单条数据查询（供小Z「这条数据怎么样」使用）============
// 与 metrics.ts 的分工：
//   metrics  = 「有哪些…」聚合问题（count + 前 N 条）
//   itemLookup = 「这条…怎么样」实体问题（精确定位一条，给出孤立判定/上下游/归属/状态）
// 铁律：只查库，不让模型产生事实；找不到就说找不到。

import { pool } from './db';

export interface ItemScope {
  userId: number;
  username: string;
  role: string;
  projectId?: number;
}

export interface ItemCandidate {
  id: number;
  project: { id: number; name: string };
  orphan: boolean;
  reqType: string;
  desc: string;
}

export interface ItemDetail {
  found: boolean;
  code: string;
  /** 同一项目内同编码出现多条（疑似重复录入） */
  duplicatesInProject?: number;
  /** 同一编码在多个项目里出现（编码只在项目内唯一） */
  ambiguous?: boolean;
  candidates?: ItemCandidate[];
  item?: {
    id: number;
    reqId: string;
    reqType: string;
    desc: string;
    status: string;
    version: number | null;
    assignee: string | null;
    updatedAt: string | null;
    project: { id: number; name: string };
  };
  trace?: {
    orphan: boolean;
    outgoing: { rel: string; toType: string; label: string }[];
    incoming: { rel: string; fromType: string; label: string }[];
  };
  product?: {
    linked: { id: number; name: string; kind: string } | null;
    projectProducts: { platform: number; series: number; sku: number };
    note: string;
  };
  link?: { href: string; label: string };
  error?: string;
}

/** 编码识别：REQ-X / DD-013 / HW-REQ-001 / IPD-ARCH-007 / CHG-20261023-02 / EV-010 …（宽匹配，命中后再查库校验） */
export const CODE_RE = /\b[A-Z][A-Z0-9]{1,9}(?:-[A-Z0-9]{1,10}){1,3}\b/i;

export function extractCode(q: string): string | null {
  const m = String(q).match(CODE_RE);
  return m ? m[0].toUpperCase() : null;
}

const REQ_TYPE_ZH: Record<string, string> = {
  user_req: '用户需求',
  sys_req: '系统需求',
  sw_req: '软件需求',
  sw_arch: '软件架构',
  dd: '详细设计',
  task: '开发任务',
  tc: '测试用例',
};

/** 用户可见项目 */
async function visibleProjectIds(scope: ItemScope): Promise<number[]> {
  if (scope.projectId) {
    if (scope.role === 'admin') return [scope.projectId];
    const r = await pool.query('SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2', [scope.projectId, scope.userId]);
    return r.rows.length ? [scope.projectId] : [];
  }
  if (scope.role === 'admin') {
    const r = await pool.query('SELECT id FROM projects');
    return r.rows.map((x: any) => Number(x.id));
  }
  const r = await pool.query('SELECT project_id FROM project_members WHERE user_id = $1', [scope.userId]);
  return r.rows.map((x: any) => Number(x.project_id));
}

/** 是否存在 productId 列（未来加了字段即可自动生效，无需改这里） */
let hasProductColCache: boolean | null = null;
async function hasProductColumn(): Promise<boolean> {
  if (hasProductColCache !== null) return hasProductColCache;
  try {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'req_items' AND column_name = 'productId'`,
    );
    hasProductColCache = r.rows.length > 0;
  } catch {
    hasProductColCache = false;
  }
  return hasProductColCache;
}

async function traceOf(id: number): Promise<{ orphan: boolean; outgoing: any[]; incoming: any[] }> {
  const out = await pool.query(
    `SELECT t.id, t."toType", t."toId", t."relType", r."reqId" AS "toCode", left(r."desc", 40) AS "toDesc"
       FROM trace_links t LEFT JOIN req_items r ON r.id = t."toId" AND t."toType" = 'req'
      WHERE t."fromId" = $1 AND t."fromType" = 'req' ORDER BY t.id LIMIT 8`,
    [id],
  );
  const inc = await pool.query(
    `SELECT t.id, t."fromType", t."fromId", t."relType", r."reqId" AS "fromCode", left(r."desc", 40) AS "fromDesc"
       FROM trace_links t LEFT JOIN req_items r ON r.id = t."fromId" AND t."fromType" = 'req'
      WHERE t."toId" = $1 AND t."toType" = 'req' ORDER BY t.id LIMIT 8`,
    [id],
  );
  const outgoing = out.rows.map((x: any) => ({
    rel: x.relType ?? 'trace',
    toType: x.toType,
    label: x.toType === 'req' ? `${x.toCode ?? '#' + x.toId} ${x.toDesc ?? ''}` : `测试用例 #${x.toId}`,
  }));
  const incoming = inc.rows.map((x: any) => ({
    rel: x.relType ?? 'trace',
    fromType: x.fromType,
    label: x.fromType === 'req' ? `${x.fromCode ?? '#' + x.fromId} ${x.fromDesc ?? ''}` : `#${x.fromId}`,
  }));
  return { orphan: outgoing.length === 0 && incoming.length === 0, outgoing, incoming };
}

export async function lookupItem(code: string, scope: ItemScope): Promise<ItemDetail> {
  const ids = await visibleProjectIds(scope);
  const base: ItemDetail = { found: false, code };
  if (!ids.length) return { ...base, error: 'no_project' };

  const r = await pool.query(
    `SELECT r.id, r."reqId", r."reqType", r."desc", r.status, r.version, r.assignee, r."updatedAt", r."projectId",
            p.name AS "projectName"
       FROM req_items r LEFT JOIN projects p ON p.id = r."projectId"
      WHERE upper(r."reqId") = upper($1) AND r."projectId" = ANY($2::int[])
      ORDER BY r."projectId", r.id LIMIT 5`,
    [code, ids],
  );
  if (!r.rows.length) return base;
  // 编码只在项目内唯一：多个项目都有同名编码时，不能随便挑一条回答
  const distinctProjects = Array.from(new Set(r.rows.map((x: any) => Number(x.projectId))));
  if (r.rows.length > 1 && distinctProjects.length > 1) {
    const candidates: ItemCandidate[] = [];
    for (const x of r.rows) {
      const t = await traceOf(Number(x.id));
      candidates.push({
        id: Number(x.id),
        project: { id: Number(x.projectId), name: x.projectName ?? `#${x.projectId}` },
        orphan: t.orphan,
        reqType: x.reqType ?? '',
        desc: x.desc ?? '',
      });
    }
    return { found: true, code, ambiguous: true, candidates };
  }
  // 同一项目内出现多条同编码（疑似重复录入）：取最新一条，并把重复数带出去提醒
  const row = r.rows.length > 1 ? r.rows.slice().sort((a: any, b: any) => Number(b.id) - Number(a.id))[0] : r.rows[0];
  const duplicatesInProject = r.rows.length;

  const trace = await traceOf(Number(row.id));

  // 产品归属：有 productId 列就查；没有就如实说「未挂产品」，并给出项目下的产品结构计数
  let linked: { id: number; name: string; kind: string } | null = null;
  if (await hasProductColumn()) {
    const pr = await pool.query(
      `SELECT p.id, p.name, p.kind FROM req_items r JOIN products p ON p.id = r."productId" WHERE r.id = $1`,
      [row.id],
    );
    if (pr.rows[0]) linked = { id: Number(pr.rows[0].id), name: pr.rows[0].name, kind: pr.rows[0].kind };
  }
  const counts = { platform: 0, series: 0, sku: 0 };
  try {
    const pc = await pool.query(
      `SELECT kind, COUNT(*)::int AS n FROM products WHERE "projectId" = $1 GROUP BY kind`,
      [row.projectId],
    );
    for (const x of pc.rows) {
      if (x.kind in counts) (counts as any)[x.kind] = Number(x.n);
    }
  } catch {
    // 该平台没有 products 表（非 IPD/家电模型）：产品归属一律「未挂产品」
  }
  const totalProducts = counts.platform + counts.series + counts.sku;
  const note = linked
    ? `已挂产品：${linked.name}（${linked.kind}）`
    : totalProducts === 0
      ? '未挂产品；该项目本身未维护产品结构（products 为空），所以无法答到 SKU 级'
      : `未挂产品；该项目有 ${counts.platform} 平台 / ${counts.series} 系列 / ${counts.sku} SKU，但这条需求还没关联到具体产品`;

  return {
    found: true,
    code,
    duplicatesInProject: duplicatesInProject > 1 ? duplicatesInProject : undefined,
    item: {
      id: Number(row.id),
      reqId: row.reqId,
      reqType: row.reqType ?? '',
      desc: row.desc ?? '',
      status: row.status ?? '',
      version: row.version ?? null,
      assignee: row.assignee ?? null,
      // < 2000-01-01 的时间戳视为脏值（0/1 等占位）
      updatedAt: (() => { const ts = Number(row.updatedAt); return Number.isFinite(ts) && ts > 946684800000 ? new Date(ts).toISOString() : null; })(),
      project: { id: Number(row.projectId), name: row.projectName ?? `#${row.projectId}` },
    },
    trace,
    product: { linked, projectProducts: counts, note },
    link: { href: '#/process/trace', label: '追溯链' },
  };
}
