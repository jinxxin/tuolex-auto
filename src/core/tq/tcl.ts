// ============ tuoleX FS 工具资质：TCL 判定引擎（ISO 26262-8:2018 Cl.11.4.5）============
// TI（Tool Impact）:
//   TI1 = 工具出错不会引入/漏检安全相关错误 → 恒 TCL1
//   TI2 = 可能引入或漏检安全相关错误
// TD（Tool error Detection，质量保障措施防止/检出工具错误输出的置信度）:
//   TD1 高 / TD2 中 / TD3 低或无
// 判定矩阵（Cl.11.4.5）：TI1→TCL1；TI2+TD1→TCL1；TI2+TD2→TCL2；TI2+TD3→TCL3
import type { TqTi, TqTd, TqTcl, TqMethod, FsAsil } from '../types';

export function tclOf(ti: TqTi, td: TqTd): TqTcl {
  if (ti === 'TI1') return 'TCL1';
  if (td === 'TD1') return 'TCL1';
  if (td === 'TD2') return 'TCL2';
  return 'TCL3';
}

export function needsQualification(tcl: TqTcl): boolean {
  return tcl !== 'TCL1';
}

/** ASIL 分组：C/D 为高，A/B/QM 为低（仅用于 TCL3 措施取向参考；TCL2 参考 Table 5 中 C 与 A/B 同档、D 单列） */
export type TqAsilGroup = 'low' | 'high';
export function asilGroup(asil?: FsAsil): TqAsilGroup {
  return asil === 'C' || asil === 'D' ? 'high' : 'low';
}

/** 资质措施建议（Cl.11.4.6 Table 5/6，含 ASIL 维度）：
 *  - TCL1：无需资质
 *  - TCL2（Table 5）：ASIL A/B/C → ICFU + EDP；ASIL D → VST + EDP
 *  - TCL3（Table 6）：ASIL A/B → EDP + ICFU；ASIL C/D → VST + DSS
 *  依据：ISO 26262-8:2018 Cl.11.4.6；LDRA 技术简报 Table 5 片段（C 与 A/B 同档、D 为 VST ++）+ Heicon 等多源。
 *  注：仅返回推荐取向（优先级排序）；各方法 ×ASIL 的 ++/+ 原表精度待标准原文逐格核准（领域笔记 §12）。
 *  未传 asil 时按最低档（A/B）处理。 */
export function suggestMethods(tcl: TqTcl, asil?: FsAsil): TqMethod[] {
  if (tcl === 'TCL1') return [];
  if (tcl === 'TCL2') return asil === 'D' ? ['VST', 'EDP'] : ['ICFU', 'EDP'];
  return asil === 'C' || asil === 'D' ? ['VST', 'DSS'] : ['EDP', 'ICFU'];
}

/** 覆写后的生效 TCL */
export function effectiveTcl(ti: TqTi, td: TqTd, override?: TqTcl): TqTcl {
  return override ?? tclOf(ti, td);
}

export const TI_LEVELS: { value: TqTi; label: string }[] = [
  { value: 'TI1', label: 'TI1' },
  { value: 'TI2', label: 'TI2' },
];
export const TD_LEVELS: { value: TqTd; label: string }[] = [
  { value: 'TD1', label: 'TD1' },
  { value: 'TD2', label: 'TD2' },
  { value: 'TD3', label: 'TD3' },
];
export const TQ_METHODS: TqMethod[] = ['ICFU', 'EDP', 'VST', 'DSS'];
export const ASIL_ORDER: FsAsil[] = ['QM', 'A', 'B', 'C', 'D'];
