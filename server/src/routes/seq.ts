import { Router } from 'express';
import { pool } from '../db';
import { authRequired } from '../auth';

const router = Router();
router.use(authRequired);

// POST /api/seq/next { projectId, prefix, pad }
// 编号计数器：事务内行锁（SELECT ... FOR UPDATE），并发安全；删除/废弃不复用
router.post('/next', async (req, res) => {
  const projectId = Number(req.body?.projectId);
  const prefix = String(req.body?.prefix ?? '').trim();
  const pad = Number(req.body?.pad ?? 3);
  if (!projectId || !prefix) return res.status(400).json({ error: '缺少 projectId 或 prefix' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id, seq FROM seqs WHERE "projectId" = $1 AND prefix = $2 FOR UPDATE',
      [projectId, prefix],
    );
    const next = (rows[0]?.seq ?? 0) + 1;
    if (rows[0]) {
      await client.query('UPDATE seqs SET seq = $1 WHERE id = $2', [next, rows[0].id]);
    } else {
      await client.query('INSERT INTO seqs ("projectId", prefix, seq) VALUES ($1, $2, $3)', [projectId, prefix, next]);
    }
    await client.query('COMMIT');
    res.json({ seq: `${prefix}-${String(next).padStart(pad, '0')}` });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

export default router;
