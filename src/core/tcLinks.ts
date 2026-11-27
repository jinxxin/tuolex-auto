import { db } from './db';
import { createRecord, deleteRecord, type Actor } from './repo';
import type { TraceLink } from './types';

// ============ 验证活动 ↔ 需求 关联（追溯：测试用例 verifies 需求）============
// 关系方向存在两种历史写法：
//   · 旧：req →tc（relType「验证覆盖」）
//   · 语义（M-A 归一后）：verification(tc) →design_input(req)（relType「verifies」）
// 本模块统一「双向兼容」读取，避免归一方向后工作项/编辑表单显示「无关联需求」。

const isReqType = (t: string) => t === 'req' || t === 'design_input';
const isTcType = (t: string) => t === 'tc' || t === 'verification';
// 该边是否表示「某需求 ↔ 该测试用例」
const isTcReqLink = (l: TraceLink, tcId: number): boolean =>
  (isTcType(l.fromType) && l.fromId === tcId && isReqType(l.toType)) ||
  (isTcType(l.toType) && l.toId === tcId && isReqType(l.fromType));
// 从边里取出「需求」一侧的 id
const reqIdOf = (l: TraceLink): number => (isTcType(l.fromType) ? l.toId : l.fromId);

export async function relatedReqIds(projectId: number, tcId: number): Promise<number[]> {
  const links = await db.trace_links.where('projectId').equals(projectId).toArray();
  return links.filter((l) => isTcReqLink(l, tcId)).map(reqIdOf);
}

export async function syncTcLinks(
  projectId: number,
  tcId: number,
  reqIds: number[],
  actor: Actor,
): Promise<{ added: number; removed: number }> {
  const links = await db.trace_links.where('projectId').equals(projectId).toArray();
  const existing = links.filter((l) => isTcReqLink(l, tcId));
  const existingReqIds = new Set(existing.map(reqIdOf));
  const want = new Set(reqIds);

  let removed = 0;
  for (const l of existing) {
    const rid = reqIdOf(l);
    if (!want.has(rid)) {
      await deleteRecord('trace_links', l.id!, actor, `取消关联需求：TC #${tcId} 不再覆盖 REQ #${rid}`);
      removed++;
    }
  }

  let added = 0;
  for (const rid of reqIds) {
    if (!existingReqIds.has(rid)) {
      // 采用语义方向：tc(verification) → req(design_input)，relType『verifies』（与 M-A 证据图谱一致）
      await createRecord<TraceLink>('trace_links', {
        projectId, fromType: 'tc', fromId: tcId, toType: 'req', toId: rid,
        relType: 'verifies', createdAt: Date.now(), createdBy: actor.username,
      }, actor, `关联验证覆盖：TC #${tcId} → REQ #${rid}`);
      added++;
    }
  }
  return { added, removed };
}
