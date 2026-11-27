// ============ EasyFuSa 安全需求链引擎（纯函数，无 IO） ============
// 层级：SG ← FSC ← TSC ← (HSI | SYSTEM_SR | HW_SR | SW_SR)
// 规则依据：docs/EasyFuSa-领域知识笔记.md §1.4/§3/§4
//  - ASIL 沿需求链传播；SG 不可分解；分解后子树不得高于分解等级
//  - 子需求 ASIL 高于父级 = 提级（异常，SG 为源头最高）
import type { FsSafetyReq, FsReqKind, FsAsil } from '../types';
import { asilRank } from './asil';

export interface FsTreeNode {
  req: FsSafetyReq;
  children: FsTreeNode[];
}

/** 层级允许关系：父 kind → 允许的子 kind 列表 */
export const CHILD_KINDS: Record<FsReqKind, FsReqKind[]> = {
  SG: ['FSC'],
  FSC: ['TSC'],
  TSC: ['HSI', 'SYSTEM_SR', 'HW_SR', 'SW_SR'],
  HSI: [],
  SYSTEM_SR: [],
  HW_SR: [],
  SW_SR: [],
};

export const ROOT_KINDS: FsReqKind[] = ['SG'];
export const LEAF_KINDS: FsReqKind[] = ['HSI', 'SYSTEM_SR', 'HW_SR', 'SW_SR'];

/** kind 层级序（用于完整性排序/展示）；越小越靠上游 */
export const KIND_ORDER: FsReqKind[] = ['SG', 'FSC', 'TSC', 'SYSTEM_SR', 'HW_SR', 'SW_SR', 'HSI'];

/** 需求可否作为某父级的子级 */
export function canAttach(parent: FsReqKind, child: FsReqKind): boolean {
  return CHILD_KINDS[parent]?.includes(child) ?? false;
}

/** 由平铺数组建树（孤儿：非顶层且找不到父 → 按顶层处理并标记? 返回 roots + orphans） */
export function buildChainTree(reqs: FsSafetyReq[]): { roots: FsTreeNode[]; orphans: FsSafetyReq[] } {
  const byId = new Map<number, FsSafetyReq>();
  for (const r of reqs) if (r.id != null) byId.set(r.id, r);
  const nodeMap = new Map<number, FsTreeNode>();
  for (const r of reqs) nodeMap.set(r.id!, { req: r, children: [] });
  const orphans: FsSafetyReq[] = [];
  for (const r of reqs) {
    const node = nodeMap.get(r.id!)!;
    if (r.parentId != null && nodeMap.has(r.parentId)) {
      nodeMap.get(r.parentId)!.children.push(node);
    } else if (r.parentId != null && !nodeMap.has(r.parentId)) {
      orphans.push(r); // 父被删/悬空
    }
  }
  const roots = reqs.filter((r) => r.parentId == null).map((r) => nodeMap.get(r.id!)!);
  roots.forEach((n) => n.children.sort((a, b) => KIND_ORDER.indexOf(a.req.kind) - KIND_ORDER.indexOf(b.req.kind)));
  return { roots, orphans };
}

/** 遍历树收集全部节点 */
export function collect(nodes: FsTreeNode[]): FsTreeNode[] {
  const out: FsTreeNode[] = [];
  const walk = (n: FsTreeNode) => { out.push(n); n.children.forEach(walk); };
  nodes.forEach(walk);
  return out;
}

export type GapKind = 'no_sg' | 'no_fsc' | 'no_tsc' | 'no_leaf' | 'no_verify' | 'asil_raise' | 'exceed_decomp' | 'orphan';
export interface ChainGap {
  kind: GapKind;
  node: FsSafetyReq;
  issue: string; // 页面展示用（i18n key 由 kind 映射，issue 补充细节）
}

/** 链完整性/一致性缺口扫描（结构级） */
export function findGaps(reqs: FsSafetyReq[]): ChainGap[] {
  const { roots, orphans } = buildChainTree(reqs);
  const gaps: ChainGap[] = [];
  for (const o of orphans) gaps.push({ kind: 'orphan', node: o, issue: `parentId=${o.parentId}` });

  const byId = new Map<number, FsTreeNode>();
  for (const n of collect(roots)) byId.set(n.req.id!, n);

  for (const n of collect(roots)) {
    const r = n.req;
    const kids = n.children.map((c) => c.req);
    // 结构承接缺口
    if (r.kind === 'SG' && !kids.some((k) => k.kind === 'FSC')) gaps.push({ kind: 'no_fsc', node: r, issue: '' });
    if (r.kind === 'FSC' && !kids.some((k) => k.kind === 'TSC')) gaps.push({ kind: 'no_tsc', node: r, issue: '' });
    if (r.kind === 'TSC' && !kids.some((k) => LEAF_KINDS.includes(k.kind))) gaps.push({ kind: 'no_leaf', node: r, issue: '' });
    // 叶子安全需求缺验证方法建议
    if (LEAF_KINDS.includes(r.kind) && !r.verificationMethod) gaps.push({ kind: 'no_verify', node: r, issue: '' });
    // ASIL 一致性
    for (const k of kids) {
      if (k.asilInherited) continue; // 继承标记=按引擎规则，跳过结构检查
      if (asilRank(k.asil) > asilRank(r.asil)) {
        gaps.push({ kind: r.asilDecomposed ? 'exceed_decomp' : 'asil_raise', node: k, issue: `child=${k.code}(${k.asil}) > parent=${r.code}(${r.asil})` });
      }
    }
  }
  return gaps;
}

/** 单点校验：child 相对 parent 的 ASIL 是否合规（parent 分解过则受 parts 约束） */
export function asilTransitionValid(parent: FsSafetyReq, child: FsSafetyReq): { ok: boolean; reason?: string } {
  if (child.asilInherited) return { ok: true };
  if (parent.asilDecomposed) {
    const allowed = parent.asilDecomposed.parts.map((p) => p.asil);
    if (!allowed.includes(child.asil)) {
      return { ok: false, reason: `parent ${parent.code} 已分解（允许 ${allowed.join('/')}），子需求 ${child.code} ASIL=${child.asil} 超出` };
    }
    return { ok: true };
  }
  if (asilRank(child.asil) > asilRank(parent.asil)) {
    return { ok: false, reason: `子需求 ${child.code} ASIL(${child.asil}) 高于父级 ${parent.code}(${parent.asil})` };
  }
  return { ok: true };
}

/** 已确认危害 → 生成 SG 草稿（text 模板）；返回草稿（页面落库 + 回写 hazard.sgId） */
export function sgDraftFromHazard(hazTitle: string, hazardDesc: string, asil: FsAsil): {
  title: string; text: string; asil: FsAsil;
} {
  const clean = (hazardDesc || hazTitle || '相关危害').trim();
  return {
    title: `SG：${hazTitle}`,
    text: `系统应防止因「${clean}」导致的伤害或不合理风险，通过检测、减轻或规避措施将残余风险控制在可接受水平。`,
    asil,
  };
}
