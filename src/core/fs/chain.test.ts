// ============ 安全需求链引擎单测（node:test + tsx） ============
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canAttach, buildChainTree, collect, findGaps, asilTransitionValid, sgDraftFromHazard,
} from './chain';
import type { FsSafetyReq } from '../types';

const mk = (id: number, kind: FsSafetyReq['kind'], code: string, asil: FsSafetyReq['asil'], parentId?: number, extra: Partial<FsSafetyReq> = {}): FsSafetyReq => ({
  id, projectId: 1, kind, code, text: `${code} 正文`, asil, parentId,
  safetyRelated: true, status: 'draft', version: 1, asilInherited: false, createdAt: 0, updatedAt: 0, ...extra,
});

test('层级允许关系', () => {
  assert.equal(canAttach('SG', 'FSC'), true);
  assert.equal(canAttach('SG', 'TSC'), false);
  assert.equal(canAttach('FSC', 'TSC'), true);
  assert.equal(canAttach('TSC', 'SW_SR'), true);
  assert.equal(canAttach('TSC', 'FSC'), false);
  assert.equal(canAttach('SW_SR', 'SW_SR'), false);
});

test('建树 + 孤儿检测', () => {
  const sg = mk(1, 'SG', 'SG-001', 'D');
  const fsc = mk(2, 'FSC', 'FSC-001', 'D', 1);
  const tsc = mk(3, 'TSC', 'TSC-001', 'D', 2);
  const sw = mk(4, 'SW_SR', 'SW-SR-001', 'D', 3);
  const orphan = mk(5, 'FSC', 'FSC-002', 'C', 999);
  const { roots, orphans } = buildChainTree([sg, fsc, tsc, sw, orphan]);
  assert.equal(roots.length, 1);
  assert.equal(orphans.length, 1);
  assert.equal(collect(roots)[0].req.code, 'SG-001');
  assert.equal(collect(roots).length, 4);
});

test('结构缺口：SG 无 FSC / FSC 无 TSC / TSC 无叶子 / 叶子无验证方法', () => {
  // 四棵独立树，分别触发四类缺口
  const treeA = [mk(1, 'SG', 'SG-001', 'D')];                                                  // SG 无 FSC
  const treeB = [mk(2, 'SG', 'SG-002', 'D'), mk(3, 'FSC', 'FSC-001', 'D', 2)];                 // FSC 无 TSC
  const treeC = [mk(4, 'SG', 'SG-003', 'D'), mk(5, 'FSC', 'FSC-002', 'D', 4), mk(6, 'TSC', 'TSC-001', 'D', 5)]; // TSC 无叶子
  const treeD = [mk(7, 'SG', 'SG-004', 'D'), mk(8, 'FSC', 'FSC-003', 'D', 7), mk(9, 'TSC', 'TSC-002', 'D', 8),
    mk(10, 'SW_SR', 'SW-SR-001', 'D', 9)];                                                    // 叶子无 verificationMethod
  const kinds = findGaps([...treeA, ...treeB, ...treeC, ...treeD]).map((g) => g.kind).sort();
  assert.ok(kinds.includes('no_fsc'), `缺 no_fsc: ${kinds}`);
  assert.ok(kinds.includes('no_tsc'), `缺 no_tsc: ${kinds}`);
  assert.ok(kinds.includes('no_leaf'), `缺 no_leaf: ${kinds}`);
  assert.ok(kinds.includes('no_verify'), `缺 no_verify: ${kinds}`);
  // 补全后无结构缺口
  const full = [
    mk(11, 'SG', 'SG-005', 'D'), mk(12, 'FSC', 'FSC-004', 'D', 11), mk(13, 'TSC', 'TSC-003', 'D', 12),
    mk(14, 'SW_SR', 'SW-SR-002', 'D', 13, { verificationMethod: '评审+测试' }),
  ];
  assert.equal(findGaps(full).filter((g) => g.kind !== 'no_verify').length, 0);
});

test('ASIL 提级检测（未分解链上子高于父）', () => {
  const sg = mk(1, 'SG', 'SG-001', 'B');
  const fsc = mk(2, 'FSC', 'FSC-001', 'D', 1); // 提级 D>B
  const gaps = findGaps([sg, fsc]);
  assert.ok(gaps.some((g) => g.kind === 'asil_raise'));
  assert.equal(asilTransitionValid(sg, fsc).ok, false);
});

test('分解约束：父分解后子须在 parts 内', () => {
  const tsc = mk(3, 'TSC', 'TSC-001', 'D', undefined, { asilDecomposed: { base: 'D', parts: [{ asil: 'B', note: '通道1' }, { asil: 'B', note: '通道2' }] } });
  const okChild = mk(4, 'HW_SR', 'HW-SR-001', 'B', 3, { asilInherited: true });
  const badChild = mk(5, 'SW_SR', 'SW-SR-001', 'D', 3); // 超出 B(D) 约束
  assert.equal(asilTransitionValid(tsc, okChild).ok, true);
  assert.equal(asilTransitionValid(tsc, badChild).ok, false);
});

test('SG 草稿生成（从已确认危害）', () => {
  const d = sgDraftFromHazard('AEB 应制动未制动（高速追尾）', '车辆与前方障碍物发生碰撞', 'D');
  assert.equal(d.asil, 'D');
  assert.ok(d.text.includes('碰撞'));
  assert.equal(d.title.startsWith('SG：'), true);
});
