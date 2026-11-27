import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db';
import { writeAudit, hashOf } from '../core';
import { authRequired } from '../auth';
import { isAdmin } from './projects';

const router = Router();
router.use(authRequired);

// 通用：创建签名记录 + 审计（供 apply / sign-with-password / quality 审批复用）
export async function doApply(user: { id: number; username: string; name: string }, params: {
  meaning: string; docType: string; docTitle: string; docVersion: string; docContent: unknown;
}) {
  const docHash = hashOf({ title: params.docTitle, version: params.docVersion, content: params.docContent });
  const signedAt = Date.now();
  const ins = await pool.query(
    `INSERT INTO signatures ("userId", username, "signerName", "signedAt", meaning, "docType", "docTitle", "docVersion", "docHash", status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'valid') RETURNING *`,
    [user.id, user.username, user.name, signedAt, params.meaning, params.docType, params.docTitle, params.docVersion, docHash],
  );
  const rec = ins.rows[0];
  await writeAudit({
    userId: user.id, username: user.username, action: 'SIGN',
    entityType: 'signatures', entityId: rec.id,
    summary: `电子签名：${params.docType}「${params.docTitle}」v${params.docVersion}，含义：${params.meaning}`,
    before: null, after: rec,
  });
  return rec;
}

// POST /api/signatures/apply —— 当前登录用户签名
router.post('/apply', async (req, res) => {
  const { meaning, docType, docTitle, docVersion, docContent } = req.body ?? {};
  if (!meaning || !docType || !docTitle || !docVersion) return res.status(400).json({ error: '缺少签名参数' });
  try {
    const rec = await doApply({ id: req.user!.id, username: req.user!.username, name: req.user!.name }, {
      meaning, docType, docTitle, docVersion, docContent,
    });
    res.status(201).json(rec);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/signatures/verify { id, content }
router.post('/verify', async (req, res) => {
  const id = Number(req.body?.id);
  const content = req.body?.content;
  if (!id) return res.status(400).json({ error: '缺少签名 id' });
  const { rows } = await pool.query('SELECT * FROM signatures WHERE id = $1', [id]);
  const rec = rows[0];
  if (!rec) return res.json({ valid: false, reason: '签名记录不存在' });
  if (rec.status !== 'valid') return res.json({ valid: false, rec, reason: '签名已撤销' });
  const nowHash = hashOf({ title: rec.docTitle, version: rec.docVersion, content });
  if (nowHash !== rec.docHash) return res.json({ valid: false, rec, reason: '记录内容已被修改，签名失效（哈希不匹配）' });
  res.json({ valid: true, rec });
});

// POST /api/signatures/sign-with-password —— 用户名+密码双要素签名（Part 11 演示）
router.post('/sign-with-password', async (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  const { meaning, docType, docTitle, docVersion, docContent } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: '缺少用户名或密码' });
  if (!meaning || !docType || !docTitle || !docVersion) return res.status(400).json({ error: '缺少签名参数' });

  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = rows[0];
  if (!user) {
    await writeAudit({ userId: 0, username, action: 'REJECT', entityType: 'signatures', entityId: 0, summary: '签名失败：用户不存在', before: null, after: null });
    return res.status(401).json({ error: '用户不存在' });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    await writeAudit({ userId: user.id, username: user.username, action: 'REJECT', entityType: 'signatures', entityId: 0, summary: '签名失败：密码错误，签名已拒绝并记录审计', before: null, after: null });
    return res.status(401).json({ error: '密码错误，签名已拒绝并记录审计' });
  }
  const rec = await doApply({ id: user.id, username: user.username, name: user.name }, {
    meaning, docType, docTitle, docVersion, docContent,
  });
  res.status(201).json(rec);
});

// ============ 签名中心 ============

// GET /api/signatures/list?docType=&status=&limit=&offset= —— admin 看全部，普通用户只看自己的
router.get('/list', async (req, res) => {
  const { docType, status } = req.query;
  const limit = Math.min(Number(req.query.limit ?? 200), 2000);
  const offset = Number(req.query.offset ?? 0);
  const conds: string[] = [];
  const vals: unknown[] = [];
  if (!(await isAdmin(req.user!.id))) {
    conds.push(`"userId" = $${vals.length + 1}`);
    vals.push(req.user!.id);
  }
  if (docType) { conds.push(`"docType" = $${vals.length + 1}`); vals.push(String(docType)); }
  if (status) { conds.push(`status = $${vals.length + 1}`); vals.push(String(status)); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM signatures ${where} ORDER BY id DESC LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`,
    [...vals, limit, offset],
  );
  const cnt = await pool.query(`SELECT COUNT(*)::int AS n FROM signatures ${where}`, vals);
  res.json({ rows, total: cnt.rows[0].n });
});

// GET /api/signatures/:id —— 签名详情（本人或 admin）
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: '缺少签名 id' });
  const { rows } = await pool.query('SELECT * FROM signatures WHERE id = $1', [id]);
  const rec = rows[0];
  if (!rec) return res.status(404).json({ error: '签名记录不存在' });
  if (rec.userId !== req.user!.id && !(await isAdmin(req.user!.id))) {
    return res.status(403).json({ error: '无权查看他人签名记录' });
  }
  res.json(rec);
});

// POST /api/signatures/revoke —— 撤销签名（仅 admin，valid → revoked，留审计）
router.post('/revoke', async (req, res) => {
  if (!(await isAdmin(req.user!.id))) return res.status(403).json({ error: '仅管理员可撤销签名' });
  const id = Number(req.body?.id);
  if (!id) return res.status(400).json({ error: '缺少签名 id' });
  const { rows } = await pool.query('SELECT * FROM signatures WHERE id = $1', [id]);
  const rec = rows[0];
  if (!rec) return res.status(404).json({ error: '签名记录不存在' });
  if (rec.status !== 'valid') return res.status(400).json({ error: '签名已撤销，无需重复操作' });
  await pool.query("UPDATE signatures SET status = 'revoked' WHERE id = $1", [id]);
  await writeAudit({
    userId: req.user!.id, username: req.user!.username, action: 'REVOKE',
    entityType: 'signatures', entityId: id,
    summary: `撤销电子签名：${rec.docType}「${rec.docTitle}」v${rec.docVersion}（原签名人 ${rec.signerName}）`,
    before: rec, after: { ...rec, status: 'revoked' },
  });
  res.json({ ok: true });
});

export default router;
