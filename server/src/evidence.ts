import crypto from 'crypto';
import { pool } from './db';

// ============ 证据集摘要（合规基线用）============
// 原则：基线哈希必须只由「证据内容」决定，不能掺时间戳等易变量。
//  - 同一份数据重复计算 → 哈希必须相同（可重复）
//  - 任意一条记录内容被改 → 哈希必须变化（可检测），即使条数不变
//  - 分表摘要保留 → 校验时能说清「哪个对象类型变了」
//
// 算法：对每个 project 作用域的表，逐行 canonical 序列化后 sha256，表级摘要再汇总成根哈希。
//       canonical = 键排序、剔除易变字段（时间戳类），保证跨进程/跨时间稳定。

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

// 证据集规则版本：规则（排除表/易变字段/算法）变化时递增；
// 基线记录该版本，复核时版本不一致只给"规则已变更"提示，不判为数据被篡改。
export const EVIDENCE_RULES_VERSION = '2026-10-22.1';

/** 不参与证据集摘要的字段：写入时机，不代表业务内容 */
const VOLATILE_KEYS = new Set([
  'createdAt', 'updatedAt', 'changedAt', 'frozenAt', 'ts', 'signedAt',
]);

/**
 * 不参与证据集的表：
 * - 审计/会话/反馈/成员/序列：过程元数据，不属于"受控证据内容"
 * - 版本历史：当前快照已含内容，历史由 doc_versions/审计链单独保全（避免重复计入与无限增长）
 * - 计划类：过程数据，非产品证据（不同行业口径不同，移除后如需纳入可按平台声明）
 */
const EXCLUDED_TABLES = new Set([
  'audit_logs', 'sessions', 'seqs',
  'feedback', 'feedback_comments',
  'project_members', 'users',
  'entry_versions', 'doc_versions', 'documents_history',
  'signatures',
  'plan_tasks', 'plan_milestones', 'plan_dependencies',
  'plan_baselines', 'plan_assignments', 'plan_calendars',
  'report_exports', // 导出行为记录：过程元数据，不属于受控证据内容
  'ipd_project_state', // 阶段/门禁当前状态：流程状态，非受控证据
]);

/** 单表行级过滤：基线自身（vdocs.docType=BASELINE）不计入，否则每建一次基线都会改变证据集 */
const ROW_FILTERS: Record<string, (row: Record<string, unknown>) => boolean> = {
  vdocs: (row) => row.docType !== 'BASELINE',
};

export interface TableDigest {
  table: string;
  count: number;
  hash: string;
}

export interface EvidenceDigest {
  algorithm: 'sha256-merkle/v1';
  hash: string;
  totalRows: number;
  tables: TableDigest[];
}

export function canonical(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => !VOLATILE_KEYS.has(k)).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
  }
  return JSON.stringify(String(v));
}

/** 找出所有同时具备 projectId 与 id 的业务表（平台无关，新增表自动纳入证据集） */
async function evidenceTables(): Promise<string[]> {
  const { rows } = await pool.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name IN ('projectId', 'id')
      GROUP BY table_name
     HAVING COUNT(DISTINCT column_name) = 2
      ORDER BY table_name`,
  );
  return rows
    .map((r) => r.table_name)
    .filter((t) => !EXCLUDED_TABLES.has(t));
}

export async function computeEvidenceDigest(projectId: number): Promise<EvidenceDigest> {
  const names = await evidenceTables();
  const tables: TableDigest[] = [];
  let totalRows = 0;

  for (const name of names) {
    const ident = `"${name.replace(/"/g, '""')}"`;
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT * FROM ${ident} WHERE "projectId" = $1 ORDER BY "id"`,
      [projectId],
    );
    const filter = ROW_FILTERS[name];
    const kept = filter ? rows.filter(filter) : rows;
    if (kept.length === 0) continue; // 空表不参与，避免"建表即改哈希"
    const rowHashes = kept.map((r) => sha256(canonical(r)));
    tables.push({ table: name, count: kept.length, hash: sha256(rowHashes.join('')) });
    totalRows += kept.length;
  }

  tables.sort((a, b) => a.table.localeCompare(b.table));
  const root = sha256(tables.map((t) => `${t.table}:${t.hash}`).join('|'));
  return { algorithm: 'sha256-merkle/v1', hash: root, totalRows, tables };
}

export interface DigestDiff {
  table: string;
  storedCount: number;
  currentCount: number;
  storedHash: string;
  currentHash: string;
}

export function diffDigest(storedTables: TableDigest[], current: TableDigest[]): DigestDiff[] {
  const map = new Map(current.map((t) => [t.table, t]));
  const out: DigestDiff[] = [];
  for (const s of storedTables) {
    const c = map.get(s.table);
    if (!c || c.hash !== s.hash) {
      out.push({
        table: s.table,
        storedCount: s.count,
        currentCount: c?.count ?? 0,
        storedHash: s.hash,
        currentHash: c?.hash ?? '',
      });
    }
  }
  const storedNames = new Set(storedTables.map((t) => t.table));
  for (const c of current) {
    if (!storedNames.has(c.table)) {
      out.push({
        table: c.table,
        storedCount: 0,
        currentCount: c.count,
        storedHash: '',
        currentHash: c.hash,
      });
    }
  }
  return out;
}
