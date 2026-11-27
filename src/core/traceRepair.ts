// ============ 追溯自动修复（幂等，可重复执行）============
// 修复两类追溯问题：
//  1) seed 数据缺陷：6 条「验证覆盖」链被误建为 req→req（正确应为 req→tc），
//     删除错误链并按映射重建（SW-REQ-001→TC-IT-001 等）。
//  2) 追溯缺口自动补链：凡系统内存在匹配目标的关系一律建立
//     （SW-REQ-004 上游分配、SYS.5 验证覆盖、FMEA 风险缓解/验证控制、WP 关联）；
//     目标条目不存在的缺口如实报告（建议新建条目后重跑本函数，即自动建立）。
// 全部写操作走 createRecord/deleteRecord + writeAudit，留审计痕迹。

import { db } from './db';
import { createRecord, deleteRecord, type Actor } from './repo';
import { writeAudit } from './audit';
import type { TraceLink, LinkEntityType } from './types';

export interface RepairAction {
  from: string;      // 源条目展示名（编号）
  to: string;        // 目标条目展示名（编号）
  relType: string;
  note: string;      // 依据 / 建议
}

export interface RepairResult {
  fixed: RepairAction[];    // 修复的 seed 错误链（已删除）
  created: RepairAction[];  // 本次新建的追溯关系
  skipped: RepairAction[];  // 已存在，无需重复
  missing: RepairAction[];  // 目标条目不存在，无法自动建立
}

interface EntityRef { type: LinkEntityType; key: string; id: number; label: string; }
type Intent = { from: [LinkEntityType, string]; to: [LinkEntityType, string]; relType: string; note: string };

// seed 误建为 req→req 的假「验证覆盖」链（需删除）
const FAKE_LINKS: [string, string][] = [
  ['SW-REQ-001', 'SYS-REQ-002'],
  ['SW-REQ-002', 'SYS-REQ-003'],
  ['SW-REQ-002', 'SYS-REQ-004'],
  ['SW-REQ-003', 'SYS-REQ-005'],
  ['SW-REQ-005', 'SYS-ARCH-001'],
  ['SYS-REQ-003', 'SYS-ARCH-002'],
];

// 全部意图链：重建 seed 验证链 + 补齐缺口 + 声明无目标的缺口（目标存在则自动建）
function buildIntents(): Intent[] {
  const intents: Intent[] = [
    // ---- ① seed 验证覆盖链重建（删假链后按正确映射重建）----
    { from: ['req', 'SW-REQ-001'], to: ['tc', 'TC-IT-001'], relType: '验证覆盖', note: 'SWE.5 集成验证（seed 修复重建）' },
    { from: ['req', 'SW-REQ-002'], to: ['tc', 'TC-IT-002'], relType: '验证覆盖', note: 'SWE.5 集成验证（seed 修复重建）' },
    { from: ['req', 'SW-REQ-002'], to: ['tc', 'TC-QT-001'], relType: '验证覆盖', note: 'SWE.6 合格性验证（seed 修复重建）' },
    { from: ['req', 'SW-REQ-003'], to: ['tc', 'TC-QT-002'], relType: '验证覆盖', note: 'SWE.6 AEB 功能合格性（seed 修复重建）' },
    { from: ['req', 'SW-REQ-005'], to: ['tc', 'TC-QT-003'], relType: '验证覆盖', note: 'SWE.6 OTA 合格性（seed 修复重建）' },
    { from: ['req', 'SYS-REQ-003'], to: ['tc', 'TC-SQT-001'], relType: '验证覆盖', note: 'SYS.5 系统合格性（seed 修复重建）' },
    // ---- ② 缺口补链（目标存在）----
    { from: ['req', 'SYS-ARCH-002'], to: ['req', 'SW-REQ-004'], relType: '分配', note: 'SW-REQ-004 缺上游：诊断服务属域控制器承载软件' },
    { from: ['req', 'SYS-REQ-002'], to: ['tc', 'TC-SQT-001'], relType: '验证覆盖', note: 'SYS.5：目标检测→AEB 整车在环场景' },
    { from: ['req', 'SYS-REQ-004'], to: ['tc', 'TC-SQT-001'], relType: '验证覆盖', note: 'SYS.5：整车在环校验无安全失效（ASIL B）' },
    { from: ['fmea', '感知'], to: ['tc', 'TC-QT-001'], relType: '验证控制', note: '感知 FMEA 缓解措施：逆光用例扩展（TC-QT-001）' },
    { from: ['fmea', '决策控制'], to: ['req', 'SW-REQ-003'], relType: '风险缓解', note: '决策 FMEA：看门狗+安全状态机（SW-REQ-003）' },
    { from: ['fmea', 'OTA'], to: ['tc', 'TC-QT-003'], relType: '验证控制', note: 'OTA FMEA 缓解措施：校验+回滚回归（TC-QT-003）' },
    { from: ['fmea', '通信'], to: ['req', 'SYS-REQ-003'], relType: '风险缓解', note: '通信 FMEA：CAN 丢帧威胁控制请求延迟≤100ms' },
    // ---- ③ 工作产品关联（支撑条目）----
    { from: ['wp', 'SWE.1:17-04'], to: ['req', 'SW-REQ-001'], relType: '关联', note: 'SwRS 支撑条目' },
    { from: ['wp', 'SWE.1:17-04'], to: ['req', 'SW-REQ-002'], relType: '关联', note: 'SwRS 支撑条目' },
    { from: ['wp', 'SWE.1:17-04'], to: ['req', 'SW-REQ-003'], relType: '关联', note: 'SwRS 支撑条目' },
    { from: ['wp', 'SWE.1:17-04'], to: ['req', 'SW-REQ-004'], relType: '关联', note: 'SwRS 支撑条目' },
    { from: ['wp', 'SWE.1:17-04'], to: ['req', 'SW-REQ-005'], relType: '关联', note: 'SwRS 支撑条目' },
    { from: ['wp', 'SWE.2:17-08'], to: ['req', 'SW-ARCH-001'], relType: '关联', note: '软件架构设计支撑条目' },
    { from: ['wp', 'SWE.2:17-08'], to: ['req', 'SW-ARCH-002'], relType: '关联', note: '软件架构设计支撑条目' },
    { from: ['wp', 'SWE.2:17-08'], to: ['req', 'SW-ARCH-003'], relType: '关联', note: '软件架构设计支撑条目' },
    { from: ['wp', 'SWE.2:17-08'], to: ['req', 'SW-ARCH-004'], relType: '关联', note: '软件架构设计支撑条目' },
    { from: ['wp', 'SWE.6:17-26'], to: ['tc', 'TC-QT-001'], relType: '关联', note: 'SWE.6 合格性测试计划覆盖' },
    { from: ['wp', 'SWE.6:17-26'], to: ['tc', 'TC-QT-002'], relType: '关联', note: 'SWE.6 合格性测试计划覆盖' },
    { from: ['wp', 'SWE.6:17-26'], to: ['tc', 'TC-QT-003'], relType: '关联', note: 'SWE.6 合格性测试计划覆盖' },
    { from: ['wp', 'SYS.2:13-04'], to: ['req', 'SYS-REQ-001'], relType: '关联', note: 'SysRS 支撑条目' },
    { from: ['wp', 'SYS.2:13-04'], to: ['req', 'SYS-REQ-002'], relType: '关联', note: 'SysRS 支撑条目' },
    { from: ['wp', 'SYS.2:13-04'], to: ['req', 'SYS-REQ-003'], relType: '关联', note: 'SysRS 支撑条目' },
    { from: ['wp', 'SYS.2:13-04'], to: ['req', 'SYS-REQ-004'], relType: '关联', note: 'SysRS 支撑条目' },
    { from: ['wp', 'SYS.2:13-04'], to: ['req', 'SYS-REQ-005'], relType: '关联', note: 'SysRS 支撑条目' },
    { from: ['wp', 'SYS.3:13-08'], to: ['req', 'SYS-ARCH-001'], relType: '关联', note: '系统架构设计支撑条目' },
    { from: ['wp', 'SYS.3:13-08'], to: ['req', 'SYS-ARCH-002'], relType: '关联', note: '系统架构设计支撑条目' },
    { from: ['wp', 'SYS.3:13-08'], to: ['req', 'SYS-ARCH-003'], relType: '关联', note: '系统架构设计支撑条目' },
    // ---- ④ 无匹配目标（建议新建条目后重跑）----
    { from: ['req', 'SW-REQ-004'], to: ['tc', 'TC-IT-003'], relType: '验证覆盖', note: 'SW-REQ-004 无验证覆盖：建议新建诊断服务测试用例 TC-IT-003' },
    { from: ['req', 'SW-ARCH-004'], to: ['req', 'DD-004'], relType: '细化', note: 'SW-ARCH-004 缺下游：建议新建诊断/OTA 详细设计 DD-004' },
    { from: ['req', 'DD-003'], to: ['req', 'UNIT-003'], relType: '实现', note: 'DD-003 缺下游：建议新建安全状态机单元 UNIT-003' },
    { from: ['req', 'UNIT-001'], to: ['tc', 'TC-UNIT-002'], relType: '验证覆盖', note: 'UNIT-001 无单元测试：建议新建帧缓冲单元测试 TC-UNIT-002' },
    { from: ['req', 'SYS-REQ-001'], to: ['tc', 'TC-SQT-002'], relType: '验证覆盖', note: 'SYS-REQ-001 无系统级验证：建议新建图像质量系统测试 TC-SQT-002' },
    { from: ['req', 'SYS-REQ-005'], to: ['tc', 'TC-SQT-003'], relType: '验证覆盖', note: 'SYS-REQ-005 无系统级验证：建议新建 OTA 整车场景测试 TC-SQT-003' },
  ];
  return intents;
}

async function indexEntities(projectId: number): Promise<Map<string, EntityRef>> {
  const byKey = new Map<string, EntityRef>();
  const put = (type: LinkEntityType, key: string, id: number, label: string) => byKey.set(`${type}:${key}`, { type, key, id, label });
  const reqs = await db.req_items.where('projectId').equals(projectId).toArray();
  for (const r of reqs) if (r.id) put('req', r.reqId, r.id, r.reqId);
  const tcs = await db.test_cases.where('projectId').equals(projectId).toArray();
  for (const t of tcs) if (t.id) put('tc', t.tcId, t.id, t.tcId);
  const fmeas = await db.fmea_items.where('projectId').equals(projectId).toArray();
  for (const f of fmeas) if (f.id) put('fmea', f.process, f.id, `FMEA-${f.id}（${f.process}）`);
  const wps = await db.work_products.where('projectId').equals(projectId).toArray();
  for (const w of wps) if (w.id) put('wp', `${w.processCode}:${w.wpCode}`, w.id, `${w.processCode} ${w.wpCode}`);
  return byKey;
}

/** 幂等执行追溯修复：删除 seed 假链 → 按意图补链（目标不存在则记入 missing） */
export async function repairTraceLinks(projectId: number, actor: Actor): Promise<RepairResult> {
  const result: RepairResult = { fixed: [], created: [], skipped: [], missing: [] };
  const idx = await indexEntities(projectId);
  const links = await db.trace_links.where('projectId').equals(projectId).toArray();
  const exists = (fromType: LinkEntityType, fromId: number, toType: LinkEntityType, toId: number, relType: string) =>
    links.some((l) => l.fromType === fromType && l.fromId === fromId && l.toType === toType && l.toId === toId && l.relType === relType);
  const reqIdOf = (reqId: string) => idx.get(`req:${reqId}`)?.id;

  // 1) 删除 seed 误建假链（仅删 relType=验证覆盖 且目标误为 req 的链，不动真正的「实现/分配」链）
  for (const [fk, tk] of FAKE_LINKS) {
    const fid = reqIdOf(fk);
    const tid = reqIdOf(tk);
    if (fid === undefined || tid === undefined) continue;
    const bad = links.find((l) => l.relType === '验证覆盖' && l.fromType === 'req' && l.fromId === fid && l.toType === 'req' && l.toId === tid);
    if (bad && bad.id) {
      await deleteRecord('trace_links', bad.id, actor, `修复 seed 数据缺陷：删除误建链 ${fk} —验证覆盖→ ${tk}（应为 req→tc）`);
      result.fixed.push({ from: fk, to: tk, relType: '验证覆盖', note: 'seed 缺陷链已删除（原误建为 req→req）' });
    }
  }

  // 2) 意图链：目标存在则建（防重复），不存在则报告
  for (const it of buildIntents()) {
    const from = idx.get(`${it.from[0]}:${it.from[1]}`);
    const to = idx.get(`${it.to[0]}:${it.to[1]}`);
    if (!from || !to) {
      result.missing.push({ from: it.from[1], to: it.to[1], relType: it.relType, note: it.note });
      continue;
    }
    if (exists(from.type, from.id, to.type, to.id, it.relType)) {
      result.skipped.push({ from: from.label, to: to.label, relType: it.relType, note: it.note });
      continue;
    }
    await createRecord<TraceLink>('trace_links', {
      projectId, fromType: from.type, fromId: from.id, toType: to.type, toId: to.id,
      relType: it.relType, createdAt: Date.now(), createdBy: actor.username,
    }, actor, `追溯修复：${from.label} —${it.relType}→ ${to.label}`);
    await writeAudit({
      userId: actor.id, username: actor.username, action: 'LINK', entityType: 'trace_links', entityId: 0,
      summary: `追溯修复补链：${from.label} —${it.relType}→ ${to.label}（${it.note}）`,
      before: null, after: { projectId, fromType: from.type, fromId: from.id, toType: to.type, toId: to.id, relType: it.relType },
    });
    result.created.push({ from: from.label, to: to.label, relType: it.relType, note: it.note });
  }
  return result;
}
