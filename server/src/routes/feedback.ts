import { Router } from 'express';
import { pool } from '../db';
import { writeAudit } from '../core';
import { authRequired } from '../auth';

import { scanSensitive } from '../sensitive';
import { verifyCaptcha, issueCaptcha } from '../captcha';
import { clientIp, rateLimit } from '../guard';

// ============ 意见与建议（Feedback）+ 讨论 ============
// 流程：用户提交（pending）→ admin 发布（published）/ 撤回（withdrawn）→ 社区可见 + 追加讨论
// 权限：提交需登录；发布/撤回仅 admin；published 与讨论公开（Easy 社区经 nginx 反代访问）

const router = Router();

// 平台标识（由环境变量注入）
const PLATFORM = process.env.FEEDBACK_PLATFORM ?? 'easyauto';

// ---------- 公开：图形验证码（提交公开反馈/评论前获取） ----------
router.get('/captcha', (_req, res) => {
  res.json(issueCaptcha());
});

// ---------- 公开：已发布列表（含讨论） ----------
router.get('/published', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*,
              COALESCE((SELECT json_agg(c ORDER BY c.id ASC)
                        FROM feedback_comments c WHERE c.feedback_id = f.id), '[]') AS comments
       FROM feedback f WHERE f.status = 'published'
       ORDER BY f.pinned_at DESC NULLS LAST, f.published_at DESC`,
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ---------- 登录：我的建议 ----------
router.get('/mine', authRequired, async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM feedback WHERE author_id = $1 ORDER BY created_at DESC',
    [_req.user!.id],
  );
  res.json(rows);
});

// ---------- admin：全部建议 ----------
router.get('/admin', authRequired, async (req, res) => {
  if (req.user!.role !== 'admin') return res.status(403).json({ error: '仅管理员可见' });
  const status = String(req.query.status ?? '');
  const sql = status ? 'SELECT * FROM feedback WHERE status = $1 ORDER BY created_at DESC' : 'SELECT * FROM feedback ORDER BY created_at DESC';
  const { rows } = await pool.query(sql, status ? [status] : []);
  res.json(rows);
});

// ---------- 公开：单条 + 讨论 ----------
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query('SELECT * FROM feedback WHERE id = $1', [id]);
  if (!rows[0]) return res.status(404).json({ error: '建议不存在' });
  res.json(rows[0]);
});

// ---------- 公开：追加讨论（昵称 + 内容；限流 + 验证码 + 敏感词过滤） ----------
router.post('/:id/comments', async (req, res) => {
  const id = Number(req.params.id);
  const authorName = String(req.body?.authorName ?? '').trim().slice(0, 50);
  const content = String(req.body?.content ?? '').trim();
  if (!authorName) return res.status(400).json({ error: '请输入昵称' });
  if (!content) return res.status(400).json({ error: '请输入讨论内容' });
  if (content.length > 2000) return res.status(400).json({ error: '内容过长（最多 2000 字）' });
  const ip = clientIp(req);
  if (!rateLimit('cmt:' + ip, 10, 10 * 60 * 1000)) {
    return res.status(429).json({ error: '提交过于频繁，请稍后再试' });
  }
  if (!verifyCaptcha(req.body?.captchaToken, req.body?.captchaAnswer)) {
    return res.status(400).json({ error: '验证码不正确或已过期' });
  }
  const scan = scanSensitive(authorName, content);
  if (scan.hit) {
    await logBlocked(ip, 'comment', scan.matched, { feedbackId: id, content: content.slice(0, 200) });
    return res.status(400).json({ error: '内容包含敏感词，请修改后重试' });
  }
  const fb = await pool.query('SELECT id FROM feedback WHERE id = $1', [id]);
  if (!fb.rows[0]) return res.status(404).json({ error: '建议不存在' });
  const ins = await pool.query(
    `INSERT INTO feedback_comments (feedback_id, content, author_name, created_at, sensitive_hits, submit_ip)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [id, content, authorName, Date.now(), JSON.stringify(scan.matched), ip],
  );
  res.status(201).json(ins.rows[0]);
});

// ---------- 敏感词命中留痕（拦截日志，供溯源；失败不影响主流程） ----------
async function logBlocked(
  ip: string, kind: string, matched: string[], extra: Record<string, unknown>,
): Promise<void> {
  try {
    await writeAudit({
      userId: 0, username: '社区访客', action: 'REJECT',
      entityType: 'feedback', entityId: 0,
      summary: `敏感词拦截（${kind}）：${matched.slice(0, 5).join('、')}`,
      before: null, after: { ip, matched, ...extra },
    });
  } catch { /* ignore */ }
}

// ---------- 公开：社区提交意见和建议（匿名；限流 + 验证码 + 敏感词过滤；入库 pending 待审核） ----------
router.post('/public', async (req, res) => {
  const title = String(req.body?.title ?? '').trim().slice(0, 100);
  const content = String(req.body?.content ?? '').trim();
  const rawCat = String(req.body?.category ?? 'suggestion');
  const category = ['suggestion', 'bug', 'idea'].includes(rawCat) ? rawCat : 'suggestion';
  const authorName = String(req.body?.authorName ?? '').trim().slice(0, 50) || '匿名用户';
  if (!content) return res.status(400).json({ error: '请填写意见或建议内容' });
  if (content.length < 5) return res.status(400).json({ error: '内容太短（至少 5 个字）' });
  if (content.length > 5000) return res.status(400).json({ error: '内容过长（最多 5000 字）' });
  const ip = clientIp(req);
  if (!rateLimit('pub:' + ip, 5, 10 * 60 * 1000)) {
    return res.status(429).json({ error: '提交过于频繁，请稍后再试' });
  }
  if (!verifyCaptcha(req.body?.captchaToken, req.body?.captchaAnswer)) {
    return res.status(400).json({ error: '验证码不正确或已过期' });
  }
  const scan = scanSensitive(authorName, title, content);
  if (scan.hit) {
    await logBlocked(ip, 'suggestion', scan.matched, { title, content: content.slice(0, 200) });
    return res.status(400).json({ error: '内容包含敏感词，请修改后重试' });
  }
  const ins = await pool.query(
    `INSERT INTO feedback (platform, title, content, category, author_id, author_name, status, created_at, source, sensitive_hits, submit_ip)
     VALUES ($1,$2,$3,$4,NULL,$5,'pending',$6,'community',$7,$8) RETURNING *`,
    [PLATFORM, title, content, category, authorName, Date.now(), JSON.stringify(scan.matched), ip],
  );
  await writeAudit({
    userId: 0, username: '社区访客',
    action: 'CREATE', entityType: 'feedback', entityId: ins.rows[0].id,
    summary: `社区提交意见和建议：${title || content.slice(0, 30)}`,
    before: null, after: { id: ins.rows[0].id, platform: PLATFORM, title, category, authorName, ip },
  });
  res.status(201).json({ ok: true, id: ins.rows[0].id, message: '已提交，等待审核' });
});

// ---------- 登录：提交建议 ----------
router.post('/', authRequired, async (req, res) => {
  const content = String(req.body?.content ?? '').trim();
  const title = String(req.body?.title ?? '').trim().slice(0, 100);
  const category = String(req.body?.category ?? 'suggestion').trim();
  if (!content) return res.status(400).json({ error: '请填写建议内容' });
  if (content.length > 5000) return res.status(400).json({ error: '内容过长（最多 5000 字）' });
  const ins = await pool.query(
    `INSERT INTO feedback (platform, title, content, category, author_id, author_name, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,'pending',$7) RETURNING *`,
    [PLATFORM, title, content, category, req.user!.id, req.user!.username, Date.now()],
  );
  await writeAudit({
    userId: req.user!.id, username: req.user!.username, action: 'CREATE',
    entityType: 'feedback', entityId: ins.rows[0].id,
    summary: `提交意见和建议：${title || content.slice(0, 30)}`, before: null, after: ins.rows[0],
  });
  res.status(201).json(ins.rows[0]);
});

// ---------- admin：发布 ----------
router.put('/:id/publish', authRequired, async (req, res) => {
  if (req.user!.role !== 'admin') return res.status(403).json({ error: '仅管理员可发布' });
  const id = Number(req.params.id);
  const { rows } = await pool.query(
    `UPDATE feedback SET status='published', published_at=$2, published_by=$3 WHERE id=$1 AND status IN ('pending','withdrawn') RETURNING *`,
    [id, Date.now(), req.user!.username],
  );
  if (!rows[0]) return res.status(400).json({ error: '建议不存在或状态不可发布' });
  await writeAudit({
    userId: req.user!.id, username: req.user!.username, action: 'CONFIRM',
    entityType: 'feedback', entityId: id,
    summary: `发布建议：${rows[0].title || rows[0].content.slice(0, 30)}`, before: null, after: rows[0],
  });
  res.json(rows[0]);
});

// ---------- admin：撤回 ----------
router.put('/:id/withdraw', authRequired, async (req, res) => {
  if (req.user!.role !== 'admin') return res.status(403).json({ error: '仅管理员可撤回' });
  const id = Number(req.params.id);
  const { rows } = await pool.query(
    `UPDATE feedback SET status='withdrawn', withdrawn_at=$2, withdrawn_by=$3 WHERE id=$1 AND status='published' RETURNING *`,
    [id, Date.now(), req.user!.username],
  );
  if (!rows[0]) return res.status(400).json({ error: '建议不存在或状态不可撤回' });
  await writeAudit({
    userId: req.user!.id, username: req.user!.username, action: 'REJECT',
    entityType: 'feedback', entityId: id,
    summary: `撤回建议：${rows[0].title || rows[0].content.slice(0, 30)}`, before: null, after: rows[0],
  });
  res.json(rows[0]);
});

// ---------- admin：置顶（全局仅一条） ----------
router.put('/:id/pin', authRequired, async (req, res) => {
  if (req.user!.role !== 'admin') return res.status(403).json({ error: '仅管理员可置顶' });
  const id = Number(req.params.id);
  // 仅已发布的建议可置顶
  const fb = await pool.query('SELECT * FROM feedback WHERE id = $1', [id]);
  if (!fb.rows[0]) return res.status(404).json({ error: '建议不存在' });
  if (fb.rows[0].status !== 'published') return res.status(400).json({ error: '仅已发布的建议可置顶' });
  // 只能置顶一条：检查是否已有其他置顶
  const pinned = await pool.query('SELECT id, title FROM feedback WHERE pinned_at IS NOT NULL AND id <> $1', [id]);
  if (pinned.rows[0]) return res.status(400).json({ error: `已有置顶建议「${pinned.rows[0].title || '未命名'}」，请先解除置顶` });
  const { rows } = await pool.query(
    'UPDATE feedback SET pinned_at = $2 WHERE id = $1 RETURNING *',
    [id, Date.now()],
  );
  await writeAudit({
    userId: req.user!.id, username: req.user!.username, action: 'CONFIRM',
    entityType: 'feedback', entityId: id,
    summary: `置顶建议：${rows[0].title || rows[0].content.slice(0, 30)}`, before: null, after: rows[0],
  });
  res.json(rows[0]);
});

// ---------- admin：解除置顶 ----------
router.put('/:id/unpin', authRequired, async (req, res) => {
  if (req.user!.role !== 'admin') return res.status(403).json({ error: '仅管理员可解除置顶' });
  const id = Number(req.params.id);
  const { rows } = await pool.query(
    'UPDATE feedback SET pinned_at = NULL WHERE id = $1 AND pinned_at IS NOT NULL RETURNING *',
    [id],
  );
  if (!rows[0]) return res.status(400).json({ error: '该建议当前未置顶' });
  await writeAudit({
    userId: req.user!.id, username: req.user!.username, action: 'REJECT',
    entityType: 'feedback', entityId: id,
    summary: `解除置顶：${rows[0].title || rows[0].content.slice(0, 30)}`, before: null, after: rows[0],
  });
  res.json(rows[0]);
});

export default router;
