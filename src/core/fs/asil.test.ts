// ============ ASIL 引擎单测（node:test + tsx）============
// 判定表值依据：内部领域笔记 §2.2（ISO 26262-3:2018 Table 4）
// 运行：npm run test:fs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  asilOf, asilOfRaw, asilRank, maxAsil, isNoteARegion,
  DECOMPOSITIONS, decomposeValid, isDecomposableKind, asilNotation,
  hwTargets, fmedaMetrics,
} from './asil';
import type { FsAsil } from '../types';

// ---------- 判定表全格断言（S1-S3 × E1-E4 × C1-C3 = 36 格） ----------
// 期望值直接录自标准 Table 4（笔记 §2.2）
const EXPECTED: Record<string, FsAsil> = {
  // S1
  'S1,E1,C1': 'QM', 'S1,E1,C2': 'QM', 'S1,E1,C3': 'QM',
  'S1,E2,C1': 'QM', 'S1,E2,C2': 'QM', 'S1,E2,C3': 'QM',
  'S1,E3,C1': 'QM', 'S1,E3,C2': 'QM', 'S1,E3,C3': 'A',
  'S1,E4,C1': 'QM', 'S1,E4,C2': 'A', 'S1,E4,C3': 'B',
  // S2
  'S2,E1,C1': 'QM', 'S2,E1,C2': 'QM', 'S2,E1,C3': 'QM',
  'S2,E2,C1': 'QM', 'S2,E2,C2': 'QM', 'S2,E2,C3': 'A',
  'S2,E3,C1': 'QM', 'S2,E3,C2': 'A', 'S2,E3,C3': 'B',
  'S2,E4,C1': 'A', 'S2,E4,C2': 'B', 'S2,E4,C3': 'C',
  // S3
  'S3,E1,C1': 'QM', 'S3,E1,C2': 'QM', 'S3,E1,C3': 'A',
  'S3,E2,C1': 'QM', 'S3,E2,C2': 'A', 'S3,E2,C3': 'B',
  'S3,E3,C1': 'A', 'S3,E3,C2': 'B', 'S3,E3,C3': 'C',
  'S3,E4,C1': 'B', 'S3,E4,C2': 'C', 'S3,E4,C3': 'D',
};

test('ASIL 判定表：36 格全量断言', () => {
  for (const [key, want] of Object.entries(EXPECTED)) {
    const [s, e, c] = key.split(',');
    assert.equal(asilOf(s as never, e as never, c as never), want, `格 ${key} 期望 ${want}`);
  }
});

test('全组合穷举：80 组合（36 格判定表 + 44 组 S0/E0/C0 短路）——笔记 §2.3 规格承诺', () => {
  const ss = ['S0', 'S1', 'S2', 'S3'] as const;
  const es = ['E0', 'E1', 'E2', 'E3', 'E4'] as const;
  const cs = ['C0', 'C1', 'C2', 'C3'] as const;
  let checked = 0;
  for (const s of ss) for (const e of es) for (const c of cs) {
    const got = asilOf(s, e, c);
    const want = EXPECTED[`${s},${e},${c}`] ?? (s === 'S0' || e === 'E0' || c === 'C0' ? 'QM' : undefined);
    if (want) { assert.equal(got, want, `${s}${e}${c} 期望 ${want}`); checked++; }
    else assert.ok(['QM', 'A', 'B', 'C', 'D'].includes(got), `${s}${e}${c} 输出非法 ${got}`);
  }
  assert.equal(checked, 80, `应断言 80 组合，实际 ${checked}`);
});

test('短路规则：S0/E0/C0 任意组合 → QM', () => {
  assert.equal(asilOf('S0', 'E4', 'C3'), 'QM');   // 无伤害再高暴露也 QM
  assert.equal(asilOf('S3', 'E0', 'C3'), 'QM');   // 不可信场景
  assert.equal(asilOf('S3', 'E4', 'C0'), 'QM');   // 总体可控
  assert.equal(asilOf('S0', 'E0', 'C0'), 'QM');
});

test('锚点案例（行业公开案例，笔记 §2.2）', () => {
  assert.equal(asilOf('S3', 'E4', 'C3'), 'D');   // AEB 该制动未制动
  assert.equal(asilOf('S2', 'E4', 'C3'), 'C');   // BMS 充电过流热失控（TI）
  assert.equal(asilOf('S3', 'E1', 'C3'), 'A');   // 注 a 默认
  assert.equal(asilOf('S3', 'E2', 'C3'), 'B');   // fusi 文字示例
  assert.equal(asilOf('S1', 'E4', 'C3'), 'B');
  assert.equal(asilOf('S2', 'E3', 'C2'), 'A');   // embitel 示例
});

test('注 a 区域识别（S3+E1+C3，6.4.3.11 低概率组合可论证 QM）', () => {
  assert.equal(isNoteARegion('S3', 'E1', 'C3'), true);
  assert.equal(isNoteARegion('S3', 'E2', 'C3'), false);
});

test('非法等级输入抛错', () => {
  assert.throws(() => asilOfRaw('S4', 'E1', 'C1'));
  assert.throws(() => asilOfRaw('S3', 'E5', 'C1'));
  assert.throws(() => asilOfRaw('S3', 'E1', 'C4'));
  assert.throws(() => asilOfRaw('x', 'E1', 'C1'));
});

test('单调性抽查：C3 结果不弱于 C2、E4 不弱于 E3（风险不降级方向）', () => {
  for (const s of ['S1', 'S2', 'S3'] as const) {
    for (const e of ['E1', 'E2', 'E3', 'E4'] as const) {
      for (const c of ['C1', 'C2'] as const) {
        const lo = asilRank(asilOf(s, e, c));
        const hi = asilRank(asilOf(s, e, c === 'C1' ? 'C2' : 'C3'));
        assert.ok(hi >= lo, `${s}${e} C 递增不应降级`);
      }
    }
  }
});

test('maxAsil：SG 合并取最高', () => {
  assert.equal(maxAsil(['QM', 'B', 'A']), 'B');
  assert.equal(maxAsil(['C', 'D', 'B']), 'D');
  assert.equal(maxAsil(['QM', 'QM']), 'QM');
});

// ---------- 分解（26262-9 Clause 5；笔记 §4.2） ----------
test('分解合法性：合法组合通过', () => {
  assert.equal(decomposeValid('D', ['B', 'B']), true);
  assert.equal(decomposeValid('D', ['C', 'A']), true);
  assert.equal(decomposeValid('D', ['D', 'QM']), true);
  assert.equal(decomposeValid('C', ['B', 'A']), true);
  assert.equal(decomposeValid('B', ['A', 'A']), true);
  assert.equal(decomposeValid('B', ['B', 'QM']), true);   // B(B)+QM(B) 合法（表 1 含；QM(X) 需独立性论证）
  assert.equal(decomposeValid('A', ['A', 'QM']), true);
});

test('分解合法性：非法组合拒绝', () => {
  assert.equal(decomposeValid('D', ['B', 'C']), false);   // 两路需同构于表
  assert.equal(decomposeValid('D', ['A', 'A']), false);
  assert.equal(decomposeValid('C', ['A', 'A']), false);
  assert.equal(decomposeValid('D', ['D', 'A']), false);
});

test('SG 不可分解；SG 以下层级可分解', () => {
  assert.equal(isDecomposableKind('SG'), false);
  assert.equal(isDecomposableKind('FSC'), true);
  assert.equal(isDecomposableKind('TSC'), true);
  assert.equal(isDecomposableKind('SW_SR'), true);
});

test('X(Y) 记号', () => {
  assert.equal(asilNotation('B', 'D'), 'B(D)');
  assert.equal(asilNotation('QM', 'D'), 'QM(D)');
  assert.equal(asilNotation('A', 'B'), 'A(B)');
});

test('分解表完整性：D 三种、C 两种、B 两种、A 一种', () => {
  assert.equal(DECOMPOSITIONS.D.length, 3);
  assert.equal(DECOMPOSITIONS.C.length, 2);
  assert.equal(DECOMPOSITIONS.B.length, 2);
  assert.equal(DECOMPOSITIONS.A.length, 1);
});

// ---------- 硬件度量目标值（笔记 §5.3） ----------
test('目标值表：B/C/D', () => {
  assert.deepEqual(hwTargets('B'), { pmhfFit: 100, spfmPct: 90, lfmPct: 60 });
  assert.deepEqual(hwTargets('C'), { pmhfFit: 100, spfmPct: 97, lfmPct: 80 });
  assert.deepEqual(hwTargets('D'), { pmhfFit: 10, spfmPct: 99, lfmPct: 90 });
  assert.equal(hwTargets('A'), null);   // A/QM 无定量要求
  assert.equal(hwTargets('QM'), null);
});

test('TI 算例回归（笔记 §5.4）：总 131 FIT、SPF+RF 1.5、潜伏 20 → 98.8% / 84.5% / 21.5 FIT', () => {
  const m = fmedaMetrics(131, 1.5, 20, 'D');
  assert.ok(Math.abs(m.spfm * 100 - 98.8) < 0.1, `SPFM=${m.spfm}`);
  assert.ok(Math.abs(m.lfm * 100 - 84.5) < 0.1, `LFM=${m.lfm}`);
  assert.ok(Math.abs(m.pmhf - 21.5) < 0.01, `PMHF=${m.pmhf}`);
  assert.equal(m.verdict, 'fail');       // 未达 D 级（SPFM<99 / LFM<90）
});

test('度量达标两态：达标 pass / 不达标 fail / A 级 na', () => {
  // D 级达标示例（安全相关 1000 FIT，SPF+RF 2 FIT，潜伏 50 FIT → SPFM 99.8 / LFM ~94.9 / PMHF 52 > 10 → PMHF 不达标）
  const d1 = fmedaMetrics(1000, 2, 50, 'D');
  assert.equal(d1.verdict, 'fail');      // PMHF 52 FIT > 10
  const d2 = fmedaMetrics(1000, 2, 5, 'D');
  assert.equal(d2.verdict, 'pass');      // SPFM 99.8≥99 LFM 99.5≥90 PMHF 7≤10
  const a = fmedaMetrics(1000, 500, 100, 'A');
  assert.equal(a.verdict, 'na');         // A 无定量目标
});
