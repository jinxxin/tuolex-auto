import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import type { FsHazard, FsSafetyReq, FsFmeda, FsFta, FsDfa, FsSafetyCase, FsConfirmMeasure, FsPlanItem, AuditLog } from '../types';
import { ASIL_TAG_TEXT } from './data';

// ============ EasyFuSa 审计包导出（单 xlsx 多 sheet：全部 FS 工作产品 + 审计轨迹） ============
export interface BundleCtx {
  projectId: number;
  projectName: string;
  hazards: FsHazard[]; reqs: FsSafetyReq[]; fmedas: FsFmeda[]; ftas: FsFta[]; dfas: FsDfa[];
  cases: FsSafetyCase[]; confirms: FsConfirmMeasure[]; plans: FsPlanItem[];
  audit: AuditLog[];
}

const aoa = (rows: (string | number)[][], widths: number[]) => {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map((w) => ({ wch: w }));
  return ws;
};

export async function exportFsAuditBundle(ctx: BundleCtx): Promise<void> {
  const { projectName, hazards, reqs, fmedas, ftas, dfas, cases, confirms, plans, audit } = ctx;
  const wb = XLSX.utils.book_new();
  const dt = (t?: number) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '');

  const sh = (name: string, ws: XLSX.WorkSheet) => XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));

  // 1) 危害
  sh('HARA', aoa([
    ['编号', '危害事件', '车辆级危害', '场景', 'S', 'E', 'C', 'ASIL', '覆写', '理由', '状态', 'SG 关联', '更新'],
    ...hazards.map((h) => [h.hazId, h.title, h.vehicleLevelHazard, h.situation, h.severity, h.exposure, h.controllability, ASIL_TAG_TEXT[h.asil], h.asilManual ? '是' : '', h.asilManualReason ?? '', h.status, h.sgId ?? '', dt(h.updatedAt)]),
  ], [10, 34, 22, 28, 5, 5, 5, 10, 6, 22, 8, 10, 16]));

  // 2) 安全需求链
  sh('安全需求链', aoa([
    ['编号', '类型', 'ASIL', '继承', '父级', '来源', '标题', '正文', '验证方法', '状态'],
    ...reqs.map((r) => [r.code, r.kind, r.asilFrom ? `${r.asil}(${r.asilFrom})` : r.asil, r.asilInherited ? '继承' : '', r.parentId != null ? reqs.find((x) => x.id === r.parentId)?.code ?? '' : '', r.sourceRef ?? '', r.title ?? '', r.text, r.verificationMethod ?? '', r.status]),
  ], [12, 12, 10, 6, 12, 10, 26, 46, 16, 8]));

  // 3) FMEDA
  sh('FMEDA', aoa([
    ['编号', '分析对象', '目标ASIL', '行', 'SPFM%', 'LFM%', 'PMHF(FIT)', '判定', '状态'],
    ...fmedas.map((f) => {
      const m = f.metrics;
      return [f.fmedaId, f.item, ASIL_TAG_TEXT[f.asil], (f.rows || []).length,
        m ? (m.spfm * 100).toFixed(1) : '', m ? (m.lfm * 100).toFixed(1) : '', m ? m.pmhf.toFixed(1) : '',
        m ? (m.verdict === 'pass' ? '达标' : m.verdict === 'fail' ? '未达标' : '无目标') : '', f.status];
    }),
  ], [10, 26, 10, 6, 10, 10, 12, 10, 8]));
  // FMEDA 明细
  const fmRows: (string | number)[][] = [['FMEDA 编号', '元件', '失效模式', '分类', 'λFIT', 'DC%', '安全相关', '安全机制']];
  for (const f of fmedas) for (const r of f.rows || []) fmRows.push([f.fmedaId, r.component, r.failureMode, r.faultType, r.lambda, r.diagnosticCoverage, r.safetyRelated ? '是' : '', r.mitigation]);
  sh('FMEDA 明细', aoa(fmRows, [12, 16, 24, 12, 8, 8, 10, 26]));

  // 4) FTA / 5) DFA
  sh('FTA', aoa([['编号', '顶事件', 'ASIL', '状态', '更新'], ...ftas.map((f) => [f.ftaId, f.topEvent, ASIL_TAG_TEXT[f.topAsil], f.status, dt(f.updatedAt)])], [10, 40, 10, 10, 16]));
  const dfaRows: (string | number)[][] = [['DFA 编号', '范围', '元素A', '元素B', '机制', '耦合细节', '防护']];
  for (const d of dfas) for (const r of d.rows || []) dfaRows.push([d.dfaId, d.scope, r.refA, r.refB, r.mechanism, r.couplingDetail, r.mitigation]);
  sh('DFA', aoa(dfaRows, [10, 22, 20, 20, 14, 30, 24]));

  // 6) Safety Case（节点展开）
  const caseRows: (string | number)[][] = [['案例', '节点', '类型', '内容', '证据', '签核', '◇']];
  for (const c of cases) for (const n of c.nodes || []) caseRows.push([c.title, n.id, n.kind, n.text, n.evidenceRef ? `${n.evidenceRef.type}#${n.evidenceRef.id}` : '', n.approvedBy ?? '', n.undeveloped ? '◇' : '']);
  sh('Safety Case', aoa(caseRows, [24, 10, 12, 48, 18, 10, 6]));

  // 7) 确认措施 / 8) 计划
  sh('确认措施', aoa([
    ['编号', '类型', '标题', 'ASIL', '独立性', '结论', '状态', '负责人', '期限'],
    ...confirms.map((c) => [c.cmId, c.type, c.title, ASIL_TAG_TEXT[c.relatedAsil], c.independence, c.outcome ?? '', c.status, c.assignee ?? '', c.dueDate ? dayjs(c.dueDate).format('YYYY-MM-DD') : '']),
  ], [10, 12, 30, 8, 10, 18, 10, 10, 12]));
  sh('安全计划', aoa([
    ['编号', '阶段', '任务', '交付物', 'ASIL', '状态', '裁剪理由', '负责人', '期限'],
    ...plans.map((p) => [p.plId, p.phase, p.task, p.deliverable ?? '', ASIL_TAG_TEXT[p.asil], p.status, p.status === 'na' ? p.naReason ?? '' : '', p.owner ?? '', p.dueDate ? dayjs(p.dueDate).format('YYYY-MM-DD') : '']),
  ], [10, 12, 30, 20, 8, 12, 24, 10, 12]));

  // 9) 审计轨迹（本模块相关，最近 200）
  const auditRows: (string | number)[][] = [['时间', '用户', '动作', '实体', 'ID', '摘要']];
  const fsTables = ['fs_hazards', 'fs_safety_reqs', 'fs_fmeda', 'fs_fta', 'fs_dfa', 'fs_safety_cases', 'fs_confirm_measures', 'fs_plan_items'];
  audit.filter((l) => fsTables.includes(l.entityType)).sort((a, b) => b.ts - a.ts).slice(0, 200).forEach((l) => auditRows.push([dt(l.ts), l.username, l.action, l.entityType, String(l.entityId), l.summary]));
  sh('审计轨迹', aoa(auditRows, [18, 10, 10, 18, 10, 60]));

  XLSX.writeFile(wb, `EasyFuSa_审计包_${projectName}_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`);
}
