import { Router } from 'express';
import { pool, isTable } from '../db';
import { writeAudit } from '../core';
import { authRequired } from '../auth';
import { canAccessProject, canManageProject, isAdmin } from './projects';

// ============ 通用数据访问 API ============
// 与前端 repo.ts 的接口形状对应：listAll / getById / createRecord / updateRecord / deleteRecord
// 所有写操作自动产生审计日志（服务端强制，客户端不可伪造操作者）。
// 项目级权限：项目及其数据仅对项目成员可见可访问（admin 例外）。

const router = Router();
router.use(authRequired);

// ============ 敏感表防护（qa D3）============
// viewer（演示/试用只读）账号：不可读 users / audit_logs / signatures
// 任意角色：users 的凭据列（passwordHash / certThumbprint）一律不下发
// 非 admin：不可通过通用接口写 users / audit_logs（用户管理走 /api/auth/users）
const VIEWER_DENY_TABLES = new Set(['users', 'audit_logs', 'signatures']);
const ADMIN_ONLY_WRITE = new Set(['users', 'audit_logs']);
const CREDENTIAL_COLUMNS = ['passwordHash', 'certThumbprint'];
function viewerDenied(table: string, role: string): boolean {
  return role === 'viewer' && VIEWER_DENY_TABLES.has(table);
}
function scrub(table: string, row: any): any {
  if (!row || table !== 'users') return row;
  const o: any = { ...row };
  for (const c of CREDENTIAL_COLUMNS) delete o[c];
  return o;
}
function scrubList(table: string, rows: any[]): any[] {
  return table === 'users' ? rows.map((r) => scrub(table, r)) : rows;
}

// 项目数据表 → 项目 ID 列名（systemId 即项目 ID，change_controls 特殊）
const PROJECT_SCOPE_TABLES: Record<string, string> = {
  req_items: 'projectId', test_cases: 'projectId', trace_links: 'projectId',
  fmea_items: 'projectId', vdocs: 'projectId', documents: 'projectId',
  work_products: 'projectId', reviews: 'projectId', assessments: 'projectId',
  config_items: 'projectId', baselines: 'projectId',
  change_controls: 'systemId', deviations: 'systemId', capas: 'systemId',
  plan_tasks: 'projectId', plan_milestones: 'projectId', plan_dependencies: 'projectId', plan_baselines: 'projectId', plan_assignments: 'projectId', plan_calendars: 'projectId',
  ebom_docs: 'projectId',
  // EasyFuSa 功能安全域（全部项目级表）
  fs_hazards: 'projectId', fs_safety_reqs: 'projectId', fs_fmeda: 'projectId', fs_fta: 'projectId',
  fs_dfa: 'projectId', fs_safety_cases: 'projectId', fs_confirm_measures: 'projectId', fs_plan_items: 'projectId', fs_reports: 'projectId',
  // EasyFuSa 工具资质
  tq_tools: 'projectId', tq_assessments: 'projectId', tq_measures: 'projectId',
};

// 取一条记录所属的项目 ID（非项目表返回 null）
async function projectIdFromRow(table: string, id: number): Promise<number | null> {
  const col = PROJECT_SCOPE_TABLES[table];
  if (!col) return null;
  const { rows } = await pool.query(`SELECT "${col}" AS pid FROM "${table}" WHERE id = $1`, [id]);
  return rows[0]?.pid ?? null;
}

// 列名白名单：只允许真实存在的列（防 SQL 注入）。缓存 60s，避免每个请求都查 information_schema。
const colCache = new Map<string, { ts: number; cols: Set<string> }>();
const COL_CACHE_TTL = 60_000;
async function columnNames(table: string): Promise<Set<string>> {
  const hit = colCache.get(table);
  if (hit && Date.now() - hit.ts < COL_CACHE_TTL) return hit.cols;
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    [table],
  );
  const cols = new Set(rows.map((r) => r.column_name));
  colCache.set(table, { ts: Date.now(), cols });
  return cols;
}

// 列表查询排除的大字段（详情接口 GET /:id 仍返回全字段；避免列表页拉回 MB 级无用内容）
const LIST_EXCLUDE_COLUMNS: Record<string, string[]> = {
  vdocs: ['content'],
  regulations: ['content'],
  // 注意：sections 不能排除——DocsPage/WpWorkspace 列表渲染用 d.sections.length，排除会导致页面崩溃（8/29 性能优化踩坑）
  documents: ['history'],
  entry_versions: ['snapshot'],
  doc_versions: ['sections'],
  ebom_docs: ['sourceContent'],
  // EasyFuSa：fmeda metrics/dfa rows/case nodes 列表均需展示统计，不做投影排除（大 JSONB 后续按列细分优化）
  fs_fta: ['tree'],
};

// 归一化查询值：JSONB 列需要参数化传入；int8/bool 直接传
function jsonbIfNeeded(col: string, value: unknown, cols: Set<string>): unknown {
  // 数组 / 对象 / null 一律按 JSONB 处理（JSONB 列在 PG 里会自动转换，text 列会报错 → 调用方负责字段类型正确）
  return value;
}

// 参数化安全：对象/数组统一 JSON.stringify（pg 驱动会把 JS 数组当 PG 数组参数，导致 [] → {} 错误）
function sqlVal(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

// GET /api/data/:table?where={}&orderBy=id&dir=asc&limit=100&offset=0
router.get('/:table', async (req, res) => {
  const { table } = req.params;
  if (!isTable(table)) return res.status(400).json({ error: '未知表' });
  if (viewerDenied(table, req.user!.role)) return res.status(403).json({ error: '演示账号无权访问该数据' });
  try {
    const cols = await columnNames(table);
    const whereRaw = req.query.where ? JSON.parse(String(req.query.where)) : {};
    const orderBy = String(req.query.orderBy ?? 'id');
    const dir = String(req.query.dir ?? 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const limit = Math.min(Number(req.query.limit ?? 500), 5000);
    const offset = Number(req.query.offset ?? 0);

    if (!cols.has(orderBy)) return res.status(400).json({ error: `未知排序字段: ${orderBy}` });

    const conds: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(whereRaw)) {
      if (!cols.has(key)) return res.status(400).json({ error: `未知过滤字段: ${key}` });
      if (Array.isArray(val)) {
        // 复合键 IN：where('[a+b]') 传 ['x','y'] → a=$n AND b=$n+1
        if (val.length === 0) continue;
        conds.push(`"${key}" IN (${val.map((_, i) => `$${vals.length + i + 1}`).join(',')})`);
        vals.push(...val);
      } else {
        conds.push(`"${key}" = $${vals.length + 1}`);
        vals.push(jsonbIfNeeded(key, val, cols));
      }
    }
    // 项目权限：projects 列表仅返回成员项目（admin 全部）；项目数据表按 projectId 校验成员
    if (table === 'projects' && !(await isAdmin(req.user!.id))) {
      // viewer（试用只读）仅可见演示项目（isDemo）；其他成员按成员集（qa O3）
      const vw = req.user!.role === 'viewer';
      conds.push(vw
        ? `"isDemo" = true AND id IN (SELECT project_id FROM project_members WHERE user_id = $${vals.length + 1})`
        : `id IN (SELECT project_id FROM project_members WHERE user_id = $${vals.length + 1})`);
      vals.push(req.user!.id);
    } else {
      const pidCol = PROJECT_SCOPE_TABLES[table];
      if (pidCol && whereRaw[pidCol] !== undefined && !(await isAdmin(req.user!.id))) {
        const pid = Number(whereRaw[pidCol]);
        if (!Number.isInteger(pid) || !(await canAccessProject(req.user!.id, pid))) {
          return res.status(404).json({ error: '项目不存在' });
        }
      }
    }
    const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    // 列表投影：排除大字段，减少传输与解析（白名单列，安全）
    const exclude = LIST_EXCLUDE_COLUMNS[table];
    const selectCols = exclude
      ? [...cols].filter((c) => !exclude.includes(c)).map((c) => `"${c}"`).join(',')
      : '*';
    const { rows } = await pool.query(
      `SELECT ${selectCols} FROM "${table}" ${whereSql} ORDER BY "${orderBy}" ${dir} LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`,
      [...vals, limit, offset],
    );
    res.json(scrubList(table, rows));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/data/:table/count?where={}  （必须注册在 /:id 之前）
router.get('/:table/count', async (req, res) => {
  const { table } = req.params;
  if (!isTable(table)) return res.status(400).json({ error: '未知表' });
  if (viewerDenied(table, req.user!.role)) return res.status(403).json({ error: '演示账号无权访问该数据' });
  try {
    const cols = await columnNames(table);
    const whereRaw = req.query.where ? JSON.parse(String(req.query.where)) : {};
    const conds: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(whereRaw)) {
      if (!cols.has(key)) return res.status(400).json({ error: `未知过滤字段: ${key}` });
      if (Array.isArray(val)) {
        if (val.length === 0) continue;
        conds.push(`"${key}" IN (${val.map((_, i) => `$${vals.length + i + 1}`).join(',')})`);
        vals.push(...val);
      } else {
        conds.push(`"${key}" = $${vals.length + 1}`);
        vals.push(val);
      }
    }
    const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM "${table}" ${whereSql}`, vals);
    res.json({ count: rows[0].n });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/data/:table/:id
router.get('/:table/:id', async (req, res) => {
  const { table, id } = req.params;
  if (!isTable(table)) return res.status(400).json({ error: '未知表' });
  const numId = Number(id);
  // 项目权限：projects 详情与项目数据记录仅成员可访问（admin 例外）
  if (!(await isAdmin(req.user!.id))) {
    if (table === 'projects') {
      if (!(await canAccessProject(req.user!.id, numId))) return res.status(404).json({ error: '项目不存在' });
    } else {
      const pidCol = PROJECT_SCOPE_TABLES[table];
      if (pidCol) {
        const { rows: prow } = await pool.query(`SELECT "${pidCol}" AS pid FROM "${table}" WHERE id = $1`, [numId]);
        if (prow[0]?.pid != null && !(await canAccessProject(req.user!.id, prow[0].pid))) {
          return res.status(404).json({ error: '记录不存在' });
        }
      }
    }
  }
  if (viewerDenied(table, req.user!.role)) return res.status(403).json({ error: '演示账号无权访问该数据' });
  const { rows } = await pool.query(`SELECT * FROM "${table}" WHERE id = $1`, [numId]);
  if (!rows[0]) return res.status(404).json({ error: '记录不存在' });
  res.json(scrub(table, rows[0]));
});

// POST /api/data/:table  body: { data, summary }
// 业务写入与审计写入同一事务（原子）：变更成功则审计必成功，失败则一起回滚。
router.post('/:table', async (req, res) => {
  const { table } = req.params;
  if (!isTable(table)) return res.status(400).json({ error: '未知表' });
  const data = req.body?.data;
  const summary = req.body?.summary ?? '新增记录';
  if (ADMIN_ONLY_WRITE.has(table) && req.user!.role !== 'admin') return res.status(403).json({ error: '用户与审计数据仅管理员可写' });
  if (!data || typeof data !== 'object') return res.status(400).json({ error: '缺少 data' });
  // 权限预检（事务外只读，失败直接 4xx，不浪费事务）
  if (table !== 'projects') {
    const pidCol = PROJECT_SCOPE_TABLES[table];
    if (pidCol && data[pidCol] !== undefined && !(await isAdmin(req.user!.id))) {
      const pid = Number(data[pidCol]);
      if (!Number.isInteger(pid) || !(await canAccessProject(req.user!.id, pid))) {
        return res.status(404).json({ error: '项目不存在' });
      }
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cols = await columnNames(table);
    const keys = Object.keys(data).filter((k) => cols.has(k) && k !== 'id');
    const vals = keys.map((k) => sqlVal(data[k]));
    const ins = await client.query(
      `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(',')})
       VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
      vals,
    );
    const id = ins.rows[0].id as number;
    // 创建项目自动登记创建者为 owner（同事务）
    if (table === 'projects') {
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role, created_at, created_by)
         VALUES ($1,$2,'owner',$3,$4) ON CONFLICT (project_id, user_id) DO NOTHING`,
        [id, req.user!.id, Date.now(), req.user!.username],
      );
    }
    const { rows } = await client.query(`SELECT * FROM "${table}" WHERE id = $1`, [id]);
    await writeAudit({
      userId: req.user!.id, username: req.user!.username, action: 'CREATE',
      entityType: table, entityId: id, summary, before: null, after: rows[0],
    }, Date.now(), client);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* 连接可能已坏 */ }
    res.status(500).json({ error: (e as Error).message });
  } finally {
    client.release();
  }
});

// PUT /api/data/:table/:id  body: { data, summary }  （data 为合并后的完整记录）
// 行锁（FOR UPDATE）防并发快照错位；业务+审计同事务原子。
router.put('/:table/:id', async (req, res) => {
  const { table, id } = req.params;
  if (!isTable(table)) return res.status(400).json({ error: '未知表' });
  const data = req.body?.data;
  const summary = req.body?.summary ?? '更新记录';
  if (ADMIN_ONLY_WRITE.has(table) && req.user!.role !== 'admin') return res.status(403).json({ error: '用户与审计数据仅管理员可写' });
  if (!data || typeof data !== 'object') return res.status(400).json({ error: '缺少 data' });
  const numId = Number(id);
  // 权限预检（事务外只读）
  if (table === 'projects' && !(await canManageProject(req.user!.id, numId))) {
    return res.status(403).json({ error: '仅项目负责人或管理员可编辑项目' });
  } else if (table !== 'projects') {
    const pidCol = PROJECT_SCOPE_TABLES[table];
    if (pidCol) {
      const { rows: prow } = await pool.query(`SELECT "${pidCol}" AS pid FROM "${table}" WHERE id = $1`, [numId]);
      if (prow[0]?.pid != null && !(await canAccessProject(req.user!.id, prow[0].pid))) {
        return res.status(404).json({ error: '记录不存在' });
      }
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cols = await columnNames(table);
    const keys = Object.keys(data).filter((k) => cols.has(k) && k !== 'id');
    if (keys.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: '没有可更新字段' }); }
    // 行锁 + 读取 before：并发更新同一记录时快照不串位
    const before = await client.query(`SELECT * FROM "${table}" WHERE id = $1 FOR UPDATE`, [numId]);
    if (!before.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: '记录不存在' }); }
    const vals = keys.map((k) => sqlVal(data[k]));
    await client.query(
      `UPDATE "${table}" SET ${keys.map((k, i) => `"${k}" = $${i + 1}`).join(',')} WHERE id = $${keys.length + 1}`,
      [...vals, numId],
    );
    const { rows } = await client.query(`SELECT * FROM "${table}" WHERE id = $1`, [numId]);
    await writeAudit({
      userId: req.user!.id, username: req.user!.username, action: 'UPDATE',
      entityType: table, entityId: numId, summary, before: before.rows[0], after: rows[0],
    }, Date.now(), client);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* 连接可能已坏 */ }
    res.status(500).json({ error: (e as Error).message });
  } finally {
    client.release();
  }
});

// DELETE /api/data/:table/:id  body: { summary }
// 行锁 + 业务/审计同事务原子。
router.delete('/:table/:id', async (req, res) => {
  const { table, id } = req.params;
  if (!isTable(table)) return res.status(400).json({ error: '未知表' });
  const numId = Number(id);
  const summary = req.body?.summary ?? '删除记录';
  if (ADMIN_ONLY_WRITE.has(table) && req.user!.role !== 'admin') return res.status(403).json({ error: '用户与审计数据仅管理员可写' });
  // 权限预检（事务外只读）
  if (table === 'projects' && !(await canManageProject(req.user!.id, numId))) {
    return res.status(403).json({ error: '仅项目负责人或管理员可删除项目' });
  } else if (table !== 'projects') {
    const pidCol = PROJECT_SCOPE_TABLES[table];
    if (pidCol) {
      const { rows: prow } = await pool.query(`SELECT "${pidCol}" AS pid FROM "${table}" WHERE id = $1`, [numId]);
      if (prow[0]?.pid != null && !(await canAccessProject(req.user!.id, prow[0].pid))) {
        return res.status(404).json({ error: '记录不存在' });
      }
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(`SELECT * FROM "${table}" WHERE id = $1 FOR UPDATE`, [numId]);
    if (!before.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: '记录不存在' }); }
    await client.query(`DELETE FROM "${table}" WHERE id = $1`, [numId]);
    await writeAudit({
      userId: req.user!.id, username: req.user!.username, action: 'DELETE',
      entityType: table, entityId: numId, summary, before: before.rows[0], after: null,
    }, Date.now(), client);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* 连接可能已坏 */ }
    res.status(500).json({ error: (e as Error).message });
  } finally {
    client.release();
  }
});

export default router;
