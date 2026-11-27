// ============ EasyFuSa ASIL 引擎（纯函数，无 IO）============
// 领域依据：docs/EasyFuSa-领域知识笔记.md §2.2（ISO 26262-3:2018 Table 4，多源交叉验证）
// §4.2（26262-9 分解表）§5.3（26262-5 硬件度量目标值）
// 所有判定表数值以本文件为唯一实现来源；UI 只读对照视图读取 fs/data.ts

import type { FsAsil, FsSeverity, FsExposure, FsControllability } from '../types';

export const ASIL_ORDER: FsAsil[] = ['QM', 'A', 'B', 'C', 'D'];
export const SEVERITIES: FsSeverity[] = ['S0', 'S1', 'S2', 'S3'];
export const EXPOSURES: FsExposure[] = ['E0', 'E1', 'E2', 'E3', 'E4'];
export const CONTROLLABILITIES: FsControllability[] = ['C0', 'C1', 'C2', 'C3'];

/** ASIL 等级秩（QM=-1 … D=3）；用于「取最高」「单调性」等比较 */
export function asilRank(a: FsAsil): number {
  return ASIL_ORDER.indexOf(a) - 1;
}

/** 取一组 ASIL 的最高级（SG 合并规则：合并取最高，领域笔记 §1.4-3） */
export function maxAsil(list: FsAsil[]): FsAsil {
  return list.reduce((hi, a) => (asilRank(a) > asilRank(hi) ? a : hi), 'QM');
}

/**
 * ISO 26262-3:2018 Table 4 — ASIL determination
 * S1-S3 × E1-E4 × C1-C3；S0/E0/C0 短路 QM（不进 ASIL 路径）
 * 注 a（6.4.3.11）：S3+E1+C3 默认 A；若多低概率情境组合总暴露 < E1，可论证 QM（人工覆写路径）
 */
const MATRIX: Record<Exclude<FsSeverity, 'S0'>, Record<Exclude<FsExposure, 'E0'>, Record<Exclude<FsControllability, 'C0'>, FsAsil>>> = {
  S1: {
    E1: { C1: 'QM', C2: 'QM', C3: 'QM' },
    E2: { C1: 'QM', C2: 'QM', C3: 'QM' },
    E3: { C1: 'QM', C2: 'QM', C3: 'A' },
    E4: { C1: 'QM', C2: 'A', C3: 'B' },
  },
  S2: {
    E1: { C1: 'QM', C2: 'QM', C3: 'QM' },
    E2: { C1: 'QM', C2: 'QM', C3: 'A' },
    E3: { C1: 'QM', C2: 'A', C3: 'B' },
    E4: { C1: 'A', C2: 'B', C3: 'C' },
  },
  S3: {
    E1: { C1: 'QM', C2: 'QM', C3: 'A' }, // C3 格 = 注 a 默认 A（低概率组合可论证 QM）
    E2: { C1: 'QM', C2: 'A', C3: 'B' },
    E3: { C1: 'A', C2: 'B', C3: 'C' },
    E4: { C1: 'B', C2: 'C', C3: 'D' },
  },
};

/** 注 a 例外是否可适用（S3+E1+C3）——UI 提示用，不作为默认计算 */
export function isNoteARegion(s: FsSeverity, e: FsExposure, c: FsControllability): boolean {
  return s === 'S3' && e === 'E1' && c === 'C3';
}

function isSeverity(s: string): s is FsSeverity { return (SEVERITIES as string[]).includes(s); }
function isExposure(e: string): e is FsExposure { return (EXPOSURES as string[]).includes(e); }
function isControllability(c: string): c is FsControllability { return (CONTROLLABILITIES as string[]).includes(c); }

/** 等级输入校验：非法等级抛错（S4/E5/C4 等）；throw 后入参收窄为合法联合 */
export function assertClasses(s: string, e: string, c: string): void {
  if (!isSeverity(s)) throw new Error(`非法 Severity 等级: ${s}（应为 S0-S3）`);
  if (!isExposure(e)) throw new Error(`非法 Exposure 等级: ${e}（应为 E0-E4）`);
  if (!isControllability(c)) throw new Error(`非法 Controllability 等级: ${c}（应为 C0-C3）`);
}

/**
 * ASIL 定级核心（纯函数）
 * 短路：S0/E0/C0 → QM（S0 无伤害、E0 不可信场景、C0 总体可控，均不产生安全要求路径）
 */
export function asilOf(s: FsSeverity, e: FsExposure, c: FsControllability): FsAsil {
  if (s === 'S0' || e === 'E0' || c === 'C0') return 'QM';
  return MATRIX[s][e][c];
}

/** 字符串入参版（表单提交用，含校验）；assertClasses 抛错后 cast 安全 */
export function asilOfRaw(s: string, e: string, c: string): FsAsil {
  assertClasses(s, e, c);
  return asilOf(s as FsSeverity, e as FsExposure, c as FsControllability);
}

// ============ ASIL 分解（26262-9:2018 Clause 5；领域笔记 §4.2） ============
// 仅 safety requirements 可分解（SG 不可分解）；结果标 X(Y)；两路及以上同逻辑
export const DECOMPOSITIONS: Record<Exclude<FsAsil, 'QM'>, { asil: FsAsil; note?: string }[][]> = {
  D: [
    [{ asil: 'B' }, { asil: 'B' }],                                   // 默认方案：双冗余 B(D)+B(D)（行业最常用、争议最小）
    [{ asil: 'C' }, { asil: 'A' }],
    [{ asil: 'D' }, { asil: 'QM', note: 'QM(D) 路径须论证独立性；部分评估机构持保留意见' }],
  ],
  C: [
    [{ asil: 'B' }, { asil: 'A' }],                                   // 默认方案：B(C)+A(C)
    [{ asil: 'C' }, { asil: 'QM', note: '同 D 级保留意见：QM(C) 须独立论证' }],
  ],
  B: [
    [{ asil: 'A' }, { asil: 'A' }],                                   // 默认方案：A(B)+A(B)
    [{ asil: 'B' }, { asil: 'QM', note: '同 D 级保留意见：QM(B) 须独立论证' }],
  ],
  A: [
    [{ asil: 'A' }, { asil: 'QM', note: '同 D 级保留意见：QM(A) 须独立论证' }],
  ],
};

/** 需求层级是否可分解（SG 不可分解——领域铁律 §1.4-7） */
export function isDecomposableKind(kind: string): boolean {
  return kind !== 'SG';
}

/** 校验某分解组合相对原级的合法性（供向导实时校验） */
export function decomposeValid(original: FsAsil, parts: FsAsil[]): boolean {
  if (original === 'QM') return parts.every((p) => p === 'QM');
  const cand = parts.map((p) => p).sort().join(',');
  return DECOMPOSITIONS[original].some((combo) => combo.map((x) => x.asil).sort().join(',') === cand);
}

/** 生成 X(Y) 记号（分解原级 from 必为非 QM，如 'B(D)'；QM 元素级 → 'QM(D)'） */
export function asilNotation(level: FsAsil, from: Exclude<FsAsil, 'QM'>): string {
  return `${level}(${from})`;
}

// ============ 硬件架构度量目标值（26262-5；领域笔记 §5.3） ============
// 适用 ASIL B/C/D（A 与 QM 无定量目标）；1 FIT = 1E-9/h
// 分解后元素按分解前原级取目标（领域笔记 §4.3-6）
export interface HwTargets { pmhfFit: number; spfmPct: number; lfmPct: number; }
export const HW_TARGETS: Record<'B' | 'C' | 'D', HwTargets> = {
  B: { pmhfFit: 100, spfmPct: 90, lfmPct: 60 },
  C: { pmhfFit: 100, spfmPct: 97, lfmPct: 80 },
  D: { pmhfFit: 10, spfmPct: 99, lfmPct: 90 },
};

/** 取度量目标；A/QM 无定量要求返回 null */
export function hwTargets(asil: FsAsil): HwTargets | null {
  return asil === 'B' || asil === 'C' || asil === 'D' ? HW_TARGETS[asil] : null;
}

/**
 * FMEDA 度量引擎（简化模型；26262-5 Annex C 线性近似，TI 算例验证——领域笔记 §5.2/§5.4）
 * rows 语义：每行给出安全相关失效率（FIT）与分类归属
 *   spfFit：单点+残余合计（无覆盖或 DC 残余）  latentFit：潜伏合计
 * 返回 SPFM/LFM/PMHF 与达标判定（辅助，不替代工程结论）
 */
export function fmedaMetrics(
  totalSafetyFit: number, spfFit: number, latentFit: number,
  asil: FsAsil,
): { spfm: number; lfm: number; pmhf: number; targets: HwTargets | null; verdict: 'pass' | 'fail' | 'na' } {
  if (totalSafetyFit <= 0) {
    return { spfm: 100, lfm: 100, pmhf: 0, targets: hwTargets(asil), verdict: 'na' };
  }
  const spfm = 1 - spfFit / totalSafetyFit;
  const lfm = 1 - latentFit / (totalSafetyFit - spfFit > 0 ? totalSafetyFit - spfFit : totalSafetyFit);
  const pmhf = spfFit + latentFit; // FIT
  const t = hwTargets(asil);
  if (!t) return { spfm, lfm, pmhf, targets: null, verdict: 'na' };
  const ok = spfm * 100 >= t.spfmPct - 1e-9 && lfm * 100 >= t.lfmPct - 1e-9 && pmhf <= t.pmhfFit + 1e-9;
  return { spfm, lfm, pmhf, targets: t, verdict: ok ? 'pass' : 'fail' };
}
