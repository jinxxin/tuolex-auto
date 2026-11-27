import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import type { TFunction } from 'i18next';
import type { FsHazard, FsAsil, FsSeverity, FsExposure, FsControllability } from '../types';
import { asilOf } from './asil';
import { SEVERITY_OPTIONS, EXPOSURE_OPTIONS, CONTROLLABILITY_OPTIONS } from './data';

// ============ HARA 工作表导出（Excel：数据页 + 判定表说明页 + 参数定义页） ============
// 审计：EXPORT 动作在页面调用方落库（writeAudit 由 core/audit 提供，页面层封装）

export interface HaraExportCtx {
  projectId: number;
  projectName: string;
  rows: FsHazard[];
  actor: { id: number; username: string };
  t: TFunction;
}

function asilCell(s: FsSeverity, e: FsExposure, c: FsControllability): FsAsil {
  if (s === 'S0' || e === 'E0' || c === 'C0') return 'QM';
  return asilOf(s, e, c);
}

export async function exportHaraSheet(ctx: HaraExportCtx): Promise<void> {
  const { projectId, projectName, rows, actor, t } = ctx;
  const { writeAudit } = await import('../audit');

  // ---- Sheet 1：HARA 数据 ----
  const header = ['编号', '危害事件', '车辆级危害', '运行场景', 'S', 'E', 'C', 'ASIL', '人工覆写', '覆写原因', '定级理由', '状态', '更新时间'];
  const body = rows.map((i) => [
    i.hazId, i.title, i.vehicleLevelHazard, i.situation,
    i.severity, i.exposure, i.controllability, i.asil,
    i.asilManual ? '是' : '', i.asilManualReason ?? '', i.rationale ?? '',
    i.status === 'confirmed' ? '已确认' : i.status === 'superseded' ? '已作废' : '草稿',
    dayjs(i.updatedAt || Date.now()).format('YYYY-MM-DD HH:mm'),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws['!cols'] = [{ wch: 10 }, { wch: 34 }, { wch: 22 }, { wch: 30 }, { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 8 }, { wch: 9 }, { wch: 20 }, { wch: 40 }, { wch: 8 }, { wch: 16 }];

  // ---- Sheet 2：ASIL 判定表（36 格 + 注 a）----
  const mat: (string | number)[][] = [['ASIL 判定表（ISO 26262-3:2018 Table 4）'], []];
  mat.push(['S', 'E', 'C1', 'C2', 'C3']);
  for (const s of ['S1', 'S2', 'S3'] as FsSeverity[]) {
    for (const e of ['E1', 'E2', 'E3', 'E4'] as FsExposure[]) {
      mat.push([s, e, asilCell(s, e, 'C1'), asilCell(s, e, 'C2'), asilCell(s, e, 'C3')]);
    }
  }
  mat.push([]);
  mat.push(['注：S0/E0/C0 短路 → QM；S3+E1+C3 默认 A，若组合低概率情境总暴露 < E1 可论证 QM（26262-3 6.4.3.11，人工覆写留痕）']);
  mat.push(['本表为工具辅助，最终 ASIL 属工程判断。']);
  const ws2 = XLSX.utils.aoa_to_sheet(mat);
  ws2['!cols'] = [{ wch: 6 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];

  // ---- Sheet 3：参数定义 ----
  const defs: (string | number)[][] = [
    ['Severity S0-S3（伤害严重度）', '等级', '含义'],
    ...SEVERITY_OPTIONS.map((o) => ['', o.value, o.zh]),
    [], ['Exposure E0-E4（场景暴露频率——非故障频率）', '等级', '含义'],
    ...EXPOSURE_OPTIONS.map((o) => ['', o.value, o.zh]),
    [], ['Controllability C0-C3（驾驶员平均可控性）', '等级', '含义'],
    ...CONTROLLABILITY_OPTIONS.map((o) => ['', o.value, o.zh]),
    [], ['说明'], ['HARA 不考虑 item 内部安全机制；保守定级（有疑取高）；ASIL 属 Safety Goal 不在部件。'],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(defs);
  ws3['!cols'] = [{ wch: 36 }, { wch: 8 }, { wch: 60 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'HARA');
  XLSX.utils.book_append_sheet(wb, ws2, 'ASIL 判定表');
  XLSX.utils.book_append_sheet(wb, ws3, '参数定义');
  XLSX.writeFile(wb, `HARA_${projectName}_${dayjs().format('YYYYMMDD')}.xlsx`);

  await writeAudit({
    userId: actor.id, username: actor.username, action: 'EXPORT',
    entityType: 'fs_hazards', entityId: projectId,
    summary: t('haraPage.exportAudit', { name: projectName, n: rows.length }),
    before: null, after: null,
  });
}

// 判定表全量单元格（供 MatrixModal 与未来 HARA 报告复用）
export const ASIL_MATRIX_ROWS: { s: FsSeverity; e: FsExposure; c1: FsAsil; c2: FsAsil; c3: FsAsil }[] = (
  ['S1', 'S2', 'S3'] as FsSeverity[]
).flatMap((s) => (['E1', 'E2', 'E3', 'E4'] as FsExposure[]).map((e) => ({
  s, e, c1: asilCell(s, e, 'C1'), c2: asilCell(s, e, 'C2'), c3: asilCell(s, e, 'C3'),
})));
