import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db';
import { writeAudit } from '../core';
import { signToken, authRequired } from '../auth';

const router = Router();

// ============ 本地认证（社区版唯一认证方式）============
// 账号只存在于本机数据库；首次启动通过 /setup 创建管理员，无出厂默认密码。
// 不依赖任何外部认证服务，断网可用。

type LoginResult =
  | { ok: true; user: { id: number; username: string; name: string; role: string } }
  | { ok: false; status: number; error: string };

async function verifyLocal(username: string, password: string): Promise<LoginResult> {
  const { rows } = await pool.query(
    'SELECT id, username, name, role, active, "passwordHash" FROM users WHERE username = $1',
    [username],
  );
  const u = rows[0];
  if (!u || !u.active) return { ok: false, status: 401, error: '账号或密码错误' };
  const hash = String(u.passwordHash ?? '');
  if (!hash) return { ok: false, status: 401, error: '该账号尚未设置密码，请联系管理员' };
  const ok = await bcrypt.compare(password, hash);
  if (!ok) return { ok: false, status: 401, error: '账号或密码错误' };
  return { ok: true, user: { id: u.id, username: u.username, name: u.name, role: u.role } };
}

// GET /api/auth/setup-state —— 首次部署是否需要创建管理员
router.get('/setup-state', async (_req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  res.json({ needsSetup: (rows[0]?.n ?? 0) === 0 });
});

// POST /api/auth/setup { username, password, name } —— 仅当库中无任何用户时可用
router.post('/setup', async (req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  if ((rows[0]?.n ?? 0) > 0) return res.status(409).json({ error: '系统已初始化，请直接登录' });
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  const name = String(req.body?.name ?? '').trim() || username;
  if (!/^[A-Za-z0-9_.@+-]{3,60}$/.test(username)) return res.status(400).json({ error: '用户名需 3–60 位，可用字母/数字/下划线' });
  if (password.length < 8) return res.status(400).json({ error: '密码至少 8 位' });
  const hash = await bcrypt.hash(password, 10);
  const now = Date.now();
  const ins = await pool.query(
    `INSERT INTO users (username, name, role, "passwordHash", active, "createdAt")
     VALUES ($1,$2,'admin',$3,true,$4) RETURNING id, username, name, role`,
    [username, name, hash, now],
  );
  const u = ins.rows[0];
  await writeAudit({ userId: u.id, username, action: 'CREATE', entityType: 'users', entityId: u.id, summary: '初始化管理员账号', before: null, after: { username, role: 'admin' } });
  res.status(201).json({ ok: true, user: u });
});

// POST /api/auth/login { username, password }
router.post('/login', async (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!username || !password) return res.status(400).json({ error: '缺少用户名或密码' });

  const r = await verifyLocal(username, password);
  if (!r.ok) {
    await writeAudit({ userId: 0, username, action: 'LOGIN', entityType: 'users', entityId: 0, summary: `登录失败：${r.error}`, before: null, after: null });
    return res.status(r.status).json({ error: r.error });
  }

  const user = (await pool.query('SELECT id, username, name, role, active, "certId", lang FROM users WHERE id = $1', [r.user.id])).rows[0];
  if (!user || !user.active) return res.status(401).json({ error: '账号已停用' });
  await writeAudit({ userId: user.id, username: user.username, action: 'LOGIN', entityType: 'users', entityId: user.id, summary: '登录成功', before: null, after: null });
  const safe = { id: user.id, username: user.username, name: user.name, role: user.role, active: user.active, certId: user.certId ?? null, lang: user.lang ?? 'zh' };
  res.json({ token: signToken({ id: user.id, username: user.username, name: user.name, role: user.role }), user: safe });
});

// GET /api/auth/me
router.get('/me', authRequired, async (req, res) => {
  const { rows } = await pool.query('SELECT id, username, name, role, active, "certId", lang FROM users WHERE id = $1', [req.user!.id]);
  if (!rows[0] || !rows[0].active) return res.status(401).json({ error: '会话无效' });
  res.json(rows[0]);
});

// PUT /api/auth/lang { lang } —— 用户界面语言偏好（写库 + 审计留痕）
router.put('/lang', authRequired, async (req, res) => {
  const lang = String(req.body?.lang ?? '');
  if (lang !== 'zh' && lang !== 'en') return res.status(400).json({ error: '缺少 lang 参数' });
  await pool.query('UPDATE users SET lang = $1 WHERE id = $2', [lang, req.user!.id]);
  await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'LANG', entityType: 'users', entityId: req.user!.id, summary: lang === 'zh' ? '界面语言切换为中文' : 'Interface language switched to English', before: null, after: null });
  res.json({ ok: true, lang });
});

// ============ 用户管理（本机账号，仅管理员）============

function requireAdmin(req: any, res: any): boolean {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: '需要管理员权限' });
    return false;
  }
  return true;
}

// GET /api/auth/users —— 本地用户列表
router.get('/users', authRequired, async (_req, res) => {
  const { rows } = await pool.query('SELECT id, username, name, role, active, lang, "createdAt" FROM users ORDER BY id');
  res.json(rows);
});

// POST /api/auth/users { username, name, password, role }
router.post('/users', authRequired, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const username = String(req.body?.username ?? '').trim();
  const name = String(req.body?.name ?? '').trim() || username;
  const password = String(req.body?.password ?? '');
  const role = String(req.body?.role ?? 'qa');
  if (!/^[A-Za-z0-9_.@+-]{3,60}$/.test(username)) return res.status(400).json({ error: '用户名需 3–60 位' });
  if (password.length < 8) return res.status(400).json({ error: '密码至少 8 位' });
  if (!['admin', 'qa', 'it', 'reviewer', 'viewer'].includes(role)) return res.status(400).json({ error: '角色不合法' });
  const exists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  if (exists.rows[0]) return res.status(409).json({ error: '用户名已存在' });
  const hash = await bcrypt.hash(password, 10);
  const now = Date.now();
  const ins = await pool.query(
    `INSERT INTO users (username, name, role, "passwordHash", active, "createdAt") VALUES ($1,$2,$3,$4,true,$5) RETURNING id, username, name, role, active`,
    [username, name, role, hash, now],
  );
  await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'CREATE', entityType: 'users', entityId: ins.rows[0].id, summary: `新建用户 ${username}（${role}）`, before: null, after: { username, role } });
  res.status(201).json(ins.rows[0]);
});

// PUT /api/auth/users/:id { name?, role?, active? }
router.put('/users/:id', authRequired, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id 不合法' });
  const cur = await pool.query('SELECT id, username, name, role, active FROM users WHERE id = $1', [id]);
  if (!cur.rows[0]) return res.status(404).json({ error: '用户不存在' });
  const name = req.body?.name == null ? cur.rows[0].name : String(req.body.name).trim();
  const role = req.body?.role == null ? cur.rows[0].role : String(req.body.role);
  const active = req.body?.active == null ? cur.rows[0].active : !!req.body.active;
  if (!['admin', 'qa', 'it', 'reviewer', 'viewer'].includes(role)) return res.status(400).json({ error: '角色不合法' });
  if (id === req.user!.id && (!active || role !== 'admin')) return res.status(400).json({ error: '不能停用自己或移除自己的管理员角色' });
  await pool.query('UPDATE users SET name = $1, role = $2, active = $3, "updatedAt" = $4 WHERE id = $5', [name, role, active, Date.now(), id]);
  await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'UPDATE', entityType: 'users', entityId: id, summary: `更新用户 ${cur.rows[0].username}`, before: cur.rows[0], after: { name, role, active } });
  res.json({ ok: true });
});

// POST /api/auth/reset-password { userId?, newPassword }（管理员重置；缺 userId 时改自己）
router.post('/reset-password', authRequired, async (req, res) => {
  const target = Number(req.body?.userId ?? req.user!.id);
  if (target !== req.user!.id && req.user!.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  const newPassword = String(req.body?.newPassword ?? '');
  if (newPassword.length < 8) return res.status(400).json({ error: '新密码至少 8 位' });
  const hash = await bcrypt.hash(newPassword, 10);
  const r = await pool.query('UPDATE users SET "passwordHash" = $1, "updatedAt" = $2 WHERE id = $3 RETURNING username', [hash, Date.now(), target]);
  if (!r.rows[0]) return res.status(404).json({ error: '用户不存在' });
  await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'UPDATE', entityType: 'users', entityId: target, summary: `重置密码：${r.rows[0].username}`, before: null, after: null });
  res.json({ ok: true });
});

// POST /api/auth/change-password —— 修改自己的密码
router.post('/change-password', authRequired, async (req, res) => {
  const oldPassword = String(req.body?.oldPassword ?? '');
  const newPassword = String(req.body?.newPassword ?? '');
  if (!oldPassword) return res.status(400).json({ error: '请输入旧密码' });
  if (newPassword.length < 8) return res.status(400).json({ error: '新密码至少 8 位' });

  const { rows } = await pool.query('SELECT "passwordHash" FROM users WHERE id = $1', [req.user!.id]);
  const hash = String(rows[0]?.passwordHash ?? '');
  if (!hash || !(await bcrypt.compare(oldPassword, hash))) {
    return res.status(401).json({ error: '旧密码不正确' });
  }
  const next = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET "passwordHash" = $1, "updatedAt" = $2 WHERE id = $3', [next, Date.now(), req.user!.id]);
  await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'UPDATE', entityType: 'users', entityId: req.user!.id, summary: '修改密码成功', before: null, after: null });
  res.json({ ok: true });
});

export default router;
