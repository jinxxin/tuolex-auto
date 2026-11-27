import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db';
import { writeAudit, hashOf } from '../core';
import { authRequired } from '../auth';
import { canAccessProject, isAdmin } from './projects';
import { doApply } from './signature';

// ============ 质量体系审批工作流 ============
// 变更控制 / 偏差 / CAPA 共用同一套审批流：
//   draft(草稿) → 提交审批 pending(待审批) → approve(审批通过，用户名+密码双要素电子签名) / reject(驳回)
// 审批动作全部落审计哈希链；审批通过自动生成电子签名记录（与记录内容哈希绑定）。

const router = Router();
router.use(authRequired);

const KINDS = ['change_controls', 'deviations', 'capas'] as const;
type Kind = (typeof KINDS)[number];

const KIND_LABEL: Record<Kind, string> = {
  change_controls: '变更控制',
  deviations: '偏差管理',
  capas: 'CAPA',
};

const KIND_NO: Record<Kind, string> = {
  change_controls: 'ccNo',
  deviations: 'devNo',
  capas: 'capaNo',
};

function isKind(k: string): k is Kind {
  return (KINDS as readonly string[]).includes(k);
}

async function loadRecord(kind: Kind, id: number) {
  const { rows } = await pool.query(`SELECT * FROM "${kind}" WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// 校验记录可见性：项目成员或 admin（change_controls/deviations/capas 以 systemId 关联项目）
async function assertAccess(userId: number, record: { systemId: number }) {
  if (await isAdmin(userId)) return;
  const ok = await canAccessProject(userId, record.systemId);
  if (!ok) throw Object.assign(new Error('无权操作该项目的数据'), { status: 403 });
}

// POST /api/quality/:kind/submit { id } —— 草稿 → 待审批
router.post('/:kind/submit', async (req, res) => {
  const kind = String(req.params.kind ?? '');
  if (!isKind(kind)) return res.status(400).json({ error: '未知质量记录类型' });
  const id = Number(req.body?.id);
  if (!id) return res.status(400).json({ error: '缺少记录 id' });
  try {
    const rec = await loadRecord(kind, id);
    if (!rec) return res.status(404).json({ error: '记录不存在' });
    await assertAccess(req.user!.id, rec);
    if (rec.approvalStatus !== 'draft') return res.status(400).json({ error: `当前状态（${rec.approvalStatus}）不可提交审批` });
    await pool.query(`UPDATE "${kind}" SET "approvalStatus" = 'pending', "updatedAt" = $1 WHERE id = $2`, [Date.now(), id]);
    await writeAudit({
      userId: req.user!.id, username: req.user!.username, action: 'SUBMIT',
      entityType: kind, entityId: id,
      summary: `${KIND_LABEL[kind]}「${rec.title}」提交审批（${rec[KIND_NO[kind]]}）`,
      before: rec, after: { ...rec, approvalStatus: 'pending', updatedAt: Date.now() },
    });
    res.json({ ok: true });
  } catch (e) {
    res.status((e as { status?: number }).status ?? 500).json({ error: (e as Error).message });
  }
});

// POST /api/quality/:kind/approve { id, username, password, comment? }
// 审批通过：用户名+密码双要素校验（Part 11 口径）→ 生成电子签名 → 状态 approved
router.post('/:kind/approve', async (req, res) => {
  const kind = String(req.params.kind ?? '');
  if (!isKind(kind)) return res.status(400).json({ error: '未知质量记录类型' });
  const id = Number(req.body?.id);
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  const comment = String(req.body?.comment ?? '');
  if (!id) return res.status(400).json({ error: '缺少记录 id' });
  if (!username || !password) return res.status(400).json({ error: '审批通过需输入用户名与密码（双要素电子签名）' });
  try {
    const rec = await loadRecord(kind, id);
    if (!rec) return res.status(404).json({ error: '记录不存在' });
    await assertAccess(req.user!.id, rec);
    if (rec.approvalStatus !== 'pending') return res.status(400).json({ error: `当前状态（${rec.approvalStatus}）不可审批通过` });

    // 双要素校验：用户名存在 + 密码正确（失败记 REJECT 审计）
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const signer = rows[0];
    if (!signer) {
      await writeAudit({
        userId: req.user!.id, username: req.user!.username, action: 'REJECT',
        entityType: kind, entityId: id,
        summary: `${KIND_LABEL[kind]}「${rec.title}」审批签名失败：签名用户 ${username} 不存在`,
        before: null, after: null,
      });
      return res.status(401).json({ error: '签名用户不存在' });
    }
    const ok = await bcrypt.compare(password, signer.passwordHash);
    if (!ok) {
      await writeAudit({
        userId: req.user!.id, username: req.user!.username, action: 'REJECT',
        entityType: kind, entityId: id,
        summary: `${KIND_LABEL[kind]}「${rec.title}」审批签名失败：密码错误，已拒绝并记录审计`,
        before: null, after: null,
      });
      return res.status(401).json({ error: '密码错误，审批签名已拒绝并记录审计' });
    }

    const signedAt = Date.now();
    const docHash = hashOf({ title: rec.title, version: String(rec.updatedAt ?? 1), content: { ...rec, approvalStatus: 'approved' } });
    const ins = await pool.query(
      `INSERT INTO signatures ("userId", username, "signerName", "signedAt", meaning, "docType", "docTitle", "docVersion", "docHash", status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'valid') RETURNING *`,
      [signer.id, signer.username, signer.name, signedAt, '批准（I Approve）', KIND_LABEL[kind], rec.title, String(rec.updatedAt ?? 1), docHash],
    );
    const sig = ins.rows[0];
    await pool.query(
      `UPDATE "${kind}" SET "approvalStatus" = 'approved', "approvedBy" = $1, "approvedAt" = $2, "signatureId" = $3, "reviewComment" = $4, "updatedAt" = $2 WHERE id = $5`,
      [signer.name, signedAt, sig.id, comment, id],
    );
    await writeAudit({
      userId: req.user!.id, username: req.user!.username, action: 'APPROVE',
      entityType: kind, entityId: id,
      summary: `${KIND_LABEL[kind]}「${rec.title}」审批通过（${signer.name}，电子签名 #${sig.id}）${comment ? '，意见：' + comment : ''}`,
      before: rec, after: { ...rec, approvalStatus: 'approved', approvedBy: signer.name, approvedAt: signedAt, signatureId: sig.id, reviewComment: comment },
    });
    await writeAudit({
      userId: signer.id, username: signer.username, action: 'SIGN',
      entityType: 'signatures', entityId: sig.id,
      summary: `电子签名：${KIND_LABEL[kind]}「${rec.title}」（审批通过）`,
      before: null, after: sig,
    });
    res.json({ ok: true, signature: sig });
  } catch (e) {
    res.status((e as { status?: number }).status ?? 500).json({ error: (e as Error).message });
  }
});

// POST /api/quality/:kind/reject { id, comment } —— 驳回（需填写意见）
router.post('/:kind/reject', async (req, res) => {
  const kind = String(req.params.kind ?? '');
  if (!isKind(kind)) return res.status(400).json({ error: '未知质量记录类型' });
  const id = Number(req.body?.id);
  const comment = String(req.body?.comment ?? '').trim();
  if (!id) return res.status(400).json({ error: '缺少记录 id' });
  if (!comment) return res.status(400).json({ error: '驳回必须填写审批意见' });
  try {
    const rec = await loadRecord(kind, id);
    if (!rec) return res.status(404).json({ error: '记录不存在' });
    await assertAccess(req.user!.id, rec);
    if (rec.approvalStatus !== 'pending') return res.status(400).json({ error: `当前状态（${rec.approvalStatus}）不可驳回` });
    await pool.query(
      `UPDATE "${kind}" SET "approvalStatus" = 'rejected', "reviewComment" = $1, "updatedAt" = $2 WHERE id = $3`,
      [comment, Date.now(), id],
    );
    await writeAudit({
      userId: req.user!.id, username: req.user!.username, action: 'REJECT',
      entityType: kind, entityId: id,
      summary: `${KIND_LABEL[kind]}「${rec.title}」审批驳回，意见：${comment}`,
      before: rec, after: { ...rec, approvalStatus: 'rejected', reviewComment: comment, updatedAt: Date.now() },
    });
    res.json({ ok: true });
  } catch (e) {
    res.status((e as { status?: number }).status ?? 500).json({ error: (e as Error).message });
  }
});

export default router;
