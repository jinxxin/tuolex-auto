import { Router } from 'express';
import { pool } from '../db';
import { writeAudit } from '../core';
import { authRequired } from '../auth';

// ============ 项目成员 / 项目级权限 ============
// 规则：项目成员（owner/member）可访问项目及其数据；非成员不可见不可访问；
//       admin 全局可见（管理/审计需要）。owner 与 admin 可管理成员。

const router = Router();
router.use(authRequired);

// 是否管理员
export async function isAdmin(userId: number): Promise<boolean> {
  const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
  return rows[0]?.role === 'admin';
}

// 用户是否为项目成员（返回角色或 null）
export async function memberRoleOf(userId: number, projectId: number): Promise<string | null> {
  const { rows } = await pool.query(
    'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, userId],
  );
  return rows[0]?.role ?? null;
}

// 访问校验：admin 或成员通过；否则抛 403 语义（返回 false）
export async function canAccessProject(userId: number, projectId: number): Promise<boolean> {
  if (await isAdmin(userId)) return true;
  if ((await memberRoleOf(userId, projectId)) === null) return false;
  // viewer（试用只读）：仅可访问演示项目（isDemo）——防历史授权残留（qa O3）
  const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
  if (rows[0]?.role === 'viewer') {
    const p = await pool.query('SELECT "isDemo" FROM projects WHERE id = $1', [projectId]);
    if (p.rows[0]?.isDemo !== true) return false;
  }
  return true;
}

// 管理校验：admin 或 owner 通过
export async function canManageProject(userId: number, projectId: number): Promise<boolean> {
  if (await isAdmin(userId)) return true;
  const role = await memberRoleOf(userId, projectId);
  return role === 'owner';
}

// GET /api/projects/members/:projectId —— 成员列表（成员或 admin）
router.get('/members/:projectId', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!(await canAccessProject(req.user!.id, projectId))) {
    return res.status(404).json({ error: '项目不存在' });
  }
  const { rows } = await pool.query(
    `SELECT pm.user_id AS "userId", pm.role, u.username, u.name, u.active
     FROM project_members pm JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1 ORDER BY pm.role DESC, u.id ASC`,
    [projectId],
  );
  res.json(rows);
});

// PUT /api/projects/members/:projectId —— 全量设置成员（admin/owner）
// body: { members: [{ userId, role: 'owner'|'member' }] }
router.put('/members/:projectId', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!(await canManageProject(req.user!.id, projectId))) {
    return res.status(403).json({ error: '仅项目负责人或管理员可管理成员' });
  }
  const members = req.body?.members;
  if (!Array.isArray(members)) return res.status(400).json({ error: '缺少 members 数组' });
  if (members.length === 0) return res.status(400).json({ error: '项目至少需要一名成员' });
  // 校验用户存在 + 至少一个 owner
  const userIds = members.map((m) => Number(m.userId));
  if (userIds.some((id) => !Number.isInteger(id) || id <= 0)) return res.status(400).json({ error: '成员参数错误' });
  const owners = members.filter((m) => m.role === 'owner');
  if (owners.length === 0) return res.status(400).json({ error: '项目至少需要一名负责人（owner）' });
  const exist = await pool.query('SELECT id FROM users WHERE id = ANY($1)', [userIds]);
  if (exist.rowCount !== userIds.length) return res.status(400).json({ error: '存在无效用户' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM project_members WHERE project_id = $1', [projectId]);
    const now = Date.now();
    for (const m of members) {
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role, created_at, created_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [projectId, Number(m.userId), m.role === 'owner' ? 'owner' : 'member', now, req.user!.username],
      );
    }
    await client.query('COMMIT');
    await writeAudit({
      userId: req.user!.id, username: req.user!.username, action: 'UPDATE',
      entityType: 'projects', entityId: projectId,
      summary: `更新项目成员：${members.map((m) => `#${m.userId}(${m.role})`).join(', ')}`,
      before: null, after: { members },
    });
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

export default router;
