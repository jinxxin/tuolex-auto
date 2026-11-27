// TCL 判定引擎单测（ISO 26262-8:2018 Cl.11.4.5 矩阵 + 措施建议）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tclOf, needsQualification, suggestMethods, effectiveTcl, asilGroup } from './tcl';
import type { TqTi, TqTd, TqTcl } from '../types';

test('TCL 判定矩阵：TI1 恒 TCL1', () => {
  for (const td of ['TD1', 'TD2', 'TD3'] as TqTd[]) {
    assert.equal(tclOf('TI1', td), 'TCL1');
  }
});

test('TCL 判定矩阵：TI2 按 TD 升级', () => {
  assert.equal(tclOf('TI2', 'TD1'), 'TCL1');
  assert.equal(tclOf('TI2', 'TD2'), 'TCL2');
  assert.equal(tclOf('TI2', 'TD3'), 'TCL3');
});

test('穷举 2×3=6 组合与标准一致', () => {
  const expect: Record<string, TqTcl> = {
    'TI1-TD1': 'TCL1', 'TI1-TD2': 'TCL1', 'TI1-TD3': 'TCL1',
    'TI2-TD1': 'TCL1', 'TI2-TD2': 'TCL2', 'TI2-TD3': 'TCL3',
  };
  let n = 0;
  for (const ti of ['TI1', 'TI2'] as TqTi[]) {
    for (const td of ['TD1', 'TD2', 'TD3'] as TqTd[]) {
      assert.equal(tclOf(ti, td), expect[`${ti}-${td}`], `${ti}+${td}`);
      n++;
    }
  }
  assert.equal(n, 6);
});

test('needsQualification：仅 TCL1 免资质', () => {
  assert.equal(needsQualification('TCL1'), false);
  assert.equal(needsQualification('TCL2'), true);
  assert.equal(needsQualification('TCL3'), true);
});

test('措施建议：TCL1 空；且随 ASIL 变化', () => {
  assert.deepEqual(suggestMethods('TCL1'), []);
  assert.deepEqual(suggestMethods('TCL1', 'D'), []);
  // TCL2：A/B/C 偏 ICFU+EDP；D 偏 VST
  assert.deepEqual(suggestMethods('TCL2', 'A'), ['ICFU', 'EDP']);
  assert.deepEqual(suggestMethods('TCL2', 'B'), ['ICFU', 'EDP']);
  assert.deepEqual(suggestMethods('TCL2', 'C'), ['ICFU', 'EDP']);
  assert.deepEqual(suggestMethods('TCL2', 'D'), ['VST', 'EDP']);
  // TCL3：高 ASIL 偏 VST+DSS
  assert.deepEqual(suggestMethods('TCL3', 'D'), ['VST', 'DSS']);
  assert.deepEqual(suggestMethods('TCL3', 'B'), ['EDP', 'ICFU']);
  // 默认（未传 asil）按低处理
  assert.deepEqual(suggestMethods('TCL3'), ['EDP', 'ICFU']);
});

test('asilGroup：A/B/QM 低，C/D 高', () => {
  assert.equal(asilGroup('A'), 'low');
  assert.equal(asilGroup('B'), 'low');
  assert.equal(asilGroup('QM'), 'low');
  assert.equal(asilGroup('C'), 'high');
  assert.equal(asilGroup('D'), 'high');
});

test('effectiveTcl：人工覆写优先', () => {
  assert.equal(effectiveTcl('TI2', 'TD3'), 'TCL3');
  assert.equal(effectiveTcl('TI2', 'TD3', 'TCL2'), 'TCL2');
});
