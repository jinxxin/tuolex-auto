import { Router } from 'express';
import { pool } from '../db';
import { writeAudit, verifyChain } from '../core';
import { authRequired } from '../auth';

const router = Router();
router.use(authRequired);

// GET /api/audit/list?orderBy=ts&dir=desc&limit=200
router.get('/list', async (req, res) => {
  const orderBy = String(req.query.orderBy ?? 'id');
  const dir = String(req.query.dir ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Number(req.query.limit ?? 500), 2000);
  const offset = Number(req.query.offset ?? 0);
  const { rows } = await pool.query(
    `SELECT * FROM audit_logs ORDER BY "${orderBy}" ${dir} LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  res.json(rows);
});

// GET /api/audit/count
router.get('/count', async (_req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM audit_logs');
  res.json({ count: rows[0].n });
});

// POST /api/audit/log —— 业务动作审计（如 LINK/TEST/EXPORT/CONFIRM 等专用动作）
router.post('/log', async (req, res) => {
  const { action, entityType, entityId, summary, before, after } = req.body ?? {};
  if (!action || !entityType || !summary) return res.status(400).json({ error: '缺少审计参数' });
  try {
    const id = await writeAudit({
      userId: req.user!.id, username: req.user!.username, action: String(action),
      entityType: String(entityType), entityId: entityId ?? 0, summary: String(summary),
      before: before ?? null, after: after ?? null,
    });
    res.status(201).json({ id });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/audit/verify —— 哈希链完整性校验
router.get('/verify', async (req, res) => {
  const result = await verifyChain();
  // 校验动作本身也留痕
  await writeAudit({
    userId: req.user!.id, username: req.user!.username, action: 'CONFIRM',
    entityType: 'audit_logs', entityId: 0,
    summary: `审计哈希链校验：${result.ok ? `通过（共 ${result.count} 条）` : `断裂于 #${result.brokenAt}`}`,
    before: null, after: result,
  });
  res.json(result);
});

export default router;
