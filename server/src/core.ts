import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from './db';

// ============ SHA-256 / 哈希 ============
export function sha256Hex(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export function hashOf(obj: unknown): string {
  return sha256Hex(JSON.stringify(obj));
}

// ============ 审计追踪（哈希链防篡改，与前端实现一致）============
// 每条日志记录 prevHash（上一条的哈希），并计算本条哈希。
// 用 advisory lock 串行化「读最后一条 → 写新条」，保证并发安全。
// 注意：哈希链要求全局串行写（prevHash 依赖链尾），锁不可分片，否则并发会读到同一链尾导致断链。
// client 可选：传入时在调用方事务内执行（业务写入与审计同事务原子）；不传则自开独立事务（向后兼容）。
export interface AuditEntry {
  userId: number;
  username: string;
  action: string;
  entityType: string;
  entityId: string | number;
  summary: string;
  before: unknown | null;
  after: unknown | null;
}

export async function writeAudit(entry: AuditEntry, ts = Date.now(), client?: PoolClient): Promise<number> {
  const q = client ?? (await pool.connect());
  const ownsClient = !client;
  try {
    if (ownsClient) await q.query('BEGIN');
    await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['easyauto-audit-chain']);
    const { rows } = await q.query('SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1');
    const prevHash = rows[0]?.hash ?? 'GENESIS';
    // 关键：entityId 统一字符串化（列类型 TEXT），否则写入时 number 与读回时的 string 序列化不一致，哈希链断裂
    const norm: AuditEntry = { ...entry, entityId: String(entry.entityId) };
    const body = JSON.stringify({ ...norm, ts, prevHash });
    const hash = sha256Hex(body);
    const ins = await q.query(
      `INSERT INTO audit_logs (ts, "userId", username, action, "entityType", "entityId", summary, before, after, "prevHash", hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [ts, entry.userId, entry.username, entry.action, entry.entityType, String(entry.entityId),
       entry.summary, JSON.stringify(entry.before), JSON.stringify(entry.after), prevHash, hash],
    );
    if (ownsClient) await q.query('COMMIT');
    return ins.rows[0].id as number;
  } catch (e) {
    if (ownsClient) await q.query('ROLLBACK');
    throw e;
  } finally {
    if (ownsClient) q.release();
  }
}

// 校验整条哈希链是否完整（审计演示：篡改会断链）
// 分页流式校验（keyset，每批 1000 条），避免全表载入内存；链越长也不会 OOM。
export async function verifyChain(): Promise<{ ok: boolean; brokenAt?: number; count: number }> {
  const BATCH = 1000;
  let prevHash = 'GENESIS';
  let count = 0;
  let lastId = 0;
  for (;;) {
    const { rows } = await pool.query(
      `SELECT id, "userId", username, action, "entityType", "entityId", summary, before, after, ts, "prevHash", hash
       FROM audit_logs WHERE id > $1 ORDER BY id ASC LIMIT $2`,
      [lastId, BATCH],
    );
    if (!rows.length) break;
    for (const log of rows) {
      count++;
      const body = JSON.stringify({
        userId: log.userId, username: log.username, action: log.action,
        entityType: log.entityType, entityId: log.entityId, summary: log.summary,
        before: log.before, after: log.after, ts: log.ts, prevHash,
      });
      const expect = sha256Hex(body);
      if (expect !== log.hash || log.prevHash !== prevHash) {
        return { ok: false, brokenAt: log.id as number, count };
      }
      prevHash = log.hash;
      lastId = log.id;
    }
  }
  return { ok: true, count };
}
