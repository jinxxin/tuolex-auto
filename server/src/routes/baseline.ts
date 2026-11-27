import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db';
import { writeAudit } from '../core';
import { authRequired } from '../auth';
import { canAccessProject } from './projects';
import { computeEvidenceDigest, diffDigest, EVIDENCE_RULES_VERSION, type TableDigest } from '../evidence';

// ============ M-G 合规基线（快照 + 签名强制绑定）============
// 基线 = 对项目关键证据集做哈希快照，并以电子签名批准（缺签名不得建立基线）
const router = Router();

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

router.get('/', authRequired, async (req, res, next) => {
  try {
    const projectId = Number(req.query.projectId);
    if (!projectId) { res.status(400).json({ error: '缺少 projectId' }); return; }
    if (!(await canAccessProject(req.user!.id, projectId))) { res.status(403).json({ error: '无权访问该项目' }); return; }
    const { rows } = await pool.query(
      `SELECT * FROM vdocs WHERE "projectId"=$1 AND "docType"='BASELINE' ORDER BY id DESC`,
      [projectId],
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', authRequired, async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const projectId = Number(b.projectId);
    const signatureId = Number(b.signatureId);
    if (!projectId) { res.status(400).json({ error: '缺少 projectId' }); return; }
    if (!signatureId) { res.status(400).json({ error: '必须有电子签名（signatureId）才能建立基线' }); return; }
    if (!(await canAccessProject(req.user!.id, projectId))) { res.status(403).json({ error: '无权访问该项目' }); return; }
    const sig = await pool.query('SELECT * FROM signatures WHERE id=$1', [signatureId]);
    if (!sig.rowCount) { res.status(400).json({ error: '签名不存在' }); return; }

    // 默认：对项目证据集做内容摘要（逐行哈希 → 分表哈希 → 根哈希；不含时间戳，可重复可复核）
    // 若提供 content（如《可追溯性分析报告》数据）：按该报告内容哈希
    const kind = typeof b.kind === 'string' ? b.kind : 'baseline';
    const digest = b.content ? null : await computeEvidenceDigest(projectId);
    const hash = b.content ? sha256(JSON.stringify(b.content)) : digest!.hash;
    const now = Date.now();
    const prevRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM vdocs WHERE "projectId"=$1 AND "docType"='BASELINE'`,
      [projectId],
    );
    const version = `BL-${new Date(now).toISOString().slice(0, 10).replace(/-/g, '')}-${((prevRes.rows[0]?.n as number) ?? 0) + 1}`;
    const { rows } = await pool.query(
      `INSERT INTO vdocs ("projectId","docType",title,version,status,content,"ownerId","signatureIds","createdAt","updatedAt")
       VALUES ($1,'BASELINE',$2,$3,'approved',$4,$5,$6,$7,$7) RETURNING *`,
      [projectId, b.title || `合规基线 ${version}`, version,
       JSON.stringify(digest
         ? { hash, algorithm: digest.algorithm, kind, totalRows: digest.totalRows, tables: digest.tables, rulesVersion: EVIDENCE_RULES_VERSION }
         : { hash, kind, report: true, rulesVersion: EVIDENCE_RULES_VERSION }),
       req.user!.id, JSON.stringify([signatureId]), now],
    );
    await writeAudit({
      userId: req.user!.id, username: req.user!.username, action: 'CONFIRM',
      entityType: 'vdocs', entityId: rows[0].id,
      summary: `建立合规基线 ${version}（hash ${hash.slice(0, 12)}…，签名 #${signatureId}）`,
      before: null, after: rows[0],
    });
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// POST /api/baseline/verify { id } —— 复核基线：重算当前证据集摘要并与基线快照比对
// 返回 valid=true/false/null(旧版)，以及发生变化的对象类型与条数（能说清"哪里变了"）
router.post('/verify', authRequired, async (req, res, next) => {
  try {
    const id = Number(req.body?.id);
    if (!id) { res.status(400).json({ error: '缺少基线 id' }); return; }
    const { rows } = await pool.query(`SELECT * FROM vdocs WHERE id=$1 AND "docType"='BASELINE'`, [id]);
    const doc = rows[0];
    if (!doc) { res.status(404).json({ error: '基线不存在' }); return; }
    if (!(await canAccessProject(req.user!.id, doc.projectId))) {
      res.status(403).json({ error: '无权访问该项目' }); return;
    }
    let content: Record<string, unknown> = {};
    try { content = JSON.parse(String(doc.content ?? '{}')); } catch { content = {}; }
    const storedTables = content.tables as TableDigest[] | undefined;
    if (content.algorithm !== 'sha256-merkle/v1' || !Array.isArray(storedTables)) {
      res.json({
        valid: null, legacy: true, storedHash: content.hash ?? null,
        reason: '旧版基线只记录条数，无法复核内容；请重新建立基线',
      });
      return;
    }
    if (content.report) {
      res.json({ valid: null, report: true, storedHash: content.hash, reason: '该基线基于报告内容，请在报告导出页核验' });
      return;
    }
    const current = await computeEvidenceDigest(Number(doc.projectId));
    const changedTables = diffDigest(storedTables, current.tables);
    const storedRules = typeof content.rulesVersion === 'string' ? content.rulesVersion : null;
    if (storedRules && storedRules !== EVIDENCE_RULES_VERSION) {
      res.json({
        valid: null, rulesChanged: true,
        storedRulesVersion: storedRules, currentRulesVersion: EVIDENCE_RULES_VERSION,
        storedHash: content.hash, currentHash: current.hash, totalRows: current.totalRows, changedTables,
      });
      return;
    }
    res.json({
      valid: changedTables.length === 0 && content.hash === current.hash,
      storedHash: content.hash,
      currentHash: current.hash,
      totalRows: current.totalRows,
      changedTables,
    });
  } catch (e) { next(e); }
});

export default router;
