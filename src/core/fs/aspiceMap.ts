// ============ EasyFuSa ↔ A-SPICE 映射（层级承接规则） ============
// 分析依据（2026-09-09）：
//  - ISO 26262 概念层（SG/FSC）与系统/硬件/软件层（TSC→SR）逐级细化；
//  - A-SPICE 的 req_items（V 层 user_req/sys_req/sys_arch/hw_req/sw_req/sw_arch/dd/unit/task）承接系统/软件工程需求；
//  - 26262 Part 6 软件安全需求与 A-SPICE SWE.1 的 safety-related 软件需求同构（最典型映射）；
//  - A-SPICE 4.0 HWE.1 硬件需求分析承接 26262-5 硬件安全需求；3.1 项目落 V 层 hw_req。
// 用途：FS 需求建链时按 kind 推荐默认承接层（可切全部层）；Guide 与 UI 提示同源。
import type { FsReqKind, VLayer } from '../types';

export interface FsAspiceMap {
  kind: FsReqKind;
  layer: VLayer | 'none';      // 推荐承接层；'none' = 不建议直链 req（SG）
  process: string;             // A-SPICE 过程语境
  rationale: string;           // 映射理由（Guide/UI 提示）
}

export const FS_ASPICE_MAP: FsAspiceMap[] = [
  {
    kind: 'SG',
    layer: 'none',
    process: 'SYS.1（上游）',
    rationale: '安全目标为整车危害层要求，A-SPICE req_items 不含该层；建议链接测试用例/验证文档，或经 FSC 向下承接。',
  },
  {
    kind: 'FSC',
    layer: 'sys_req',
    process: 'SYS.1 / SYS.2',
    rationale: '功能安全概念（FSR）细化后对应系统需求中的 safety-related 部分。',
  },
  {
    kind: 'TSC',
    layer: 'sys_req',
    process: 'SYS.2 / SYS.3',
    rationale: '技术安全概念（TSR）落系统技术需求；偏架构的措施可切 sys_arch（SYS.3）。',
  },
  {
    kind: 'SYSTEM_SR',
    layer: 'sys_req',
    process: 'SYS.2',
    rationale: '系统安全需求与 SYS.2 系统需求条目同层承接。',
  },
  {
    kind: 'HW_SR',
    layer: 'hw_req',
    process: 'HWE.1 / V 层 hw_req',
    rationale: '硬件安全需求对应硬件需求分析（A-SPICE 4.0 HWE.1；3.1 项目落 hw_req 层）。',
  },
  {
    kind: 'SW_SR',
    layer: 'sw_req',
    process: 'SWE.1',
    rationale: '软件安全需求 ↔ SWE.1 的 safety-related 软件需求（26262 Part 6 与 SWE.1 同构，最典型映射）。',
  },
  {
    kind: 'HSI',
    layer: 'sys_arch',
    process: 'SYS.3 / SWE.1',
    rationale: '软硬件接口规格常落在系统架构接口需求（sys_arch）或软件接口条目（sw_req）。',
  },
];

export function fsMapOf(kind: FsReqKind): FsAspiceMap {
  return FS_ASPICE_MAP.find((m) => m.kind === kind) ?? FS_ASPICE_MAP[0];
}

/** 链接默认关系类型：FS 安全需求 → A-SPICE 条目 = 细化/实现承接 */
export const FS_LINK_REL = '细化';
