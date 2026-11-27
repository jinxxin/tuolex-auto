import crypto from 'node:crypto';
import { pool } from './db';
import { writeAudit } from './core';

// ============ 演示项目「示例 · 某车型制动踏板信号（功能安全）」（幂等 + 可原地升级）============
// 口径说明：ISO 26262 只覆盖 E/E 系统；纯机械结构件不在 26262 范围内。
//   → 本演示聚焦「制动踏板位置信号」的 E/E 段（传感器 → 线束/连接器 → ECU 采样）。
// 说明：isDemo=true（试用 viewer 可见，只读）、fsEnabled=true。
// 幂等策略：用 vendor 作为版本标记（MARKER）。项目名/内容升级时改 MARKER → 启动自动原地重建（保留项目 id，深链不变）。
const NAME = '示例 · 某车型制动踏板信号（功能安全）';
const OLD_NAME = '示例 · 某车型制动踏板支架（功能安全）';
const MARKER = 'tuoleX FS demo · E/E（v2）';
const DESC = '演示数据：某车型「制动踏板位置信号」（E/E 系统：位置传感器 → 线束/连接器 → ECU 采样）的 HARA（危害分析与风险评估）与安全需求链（ISO 26262 功能安全全流程）。示例数据，不指向任何真实车型。纯机械结构件归结构/耐久口径，本演示聚焦 26262 管辖的 E/E 信号段。';
const FS_TABLES = ['fs_hazards', 'fs_safety_reqs', 'fs_fmeda', 'fs_fta', 'fs_dfa', 'fs_safety_cases', 'fs_confirm_measures', 'fs_plan_items', 'fs_reports'];

const T = (s: string) => Date.parse(s);
const sha = (o: unknown) => crypto.createHash('sha256').update(JSON.stringify(o), 'utf8').digest('hex');

export async function ensureBrakeDemoProject(): Promise<void> {
  const found = (await pool.query('SELECT id, vendor FROM projects WHERE name IN ($1,$2)', [NAME, OLD_NAME])).rows[0] as { id: number; vendor: string | null } | undefined;
  if (found && found.vendor === MARKER) return; // 已是最新

  const q = (t: string, v?: unknown[]) => pool.query(t, v);
  const now = Date.now();
  let pid: number;
  if (found) {
    pid = found.id; // 原地升级：保留 id（深链 ?project=<id> 不变）
    await q(`UPDATE projects SET name=$2, vendor=$3, "sysType"='其他', description=$4, "fsEnabled"=true, "isDemo"=true, "updatedAt"=$5 WHERE id=$1`,
      [pid, NAME, MARKER, DESC, now]);
    for (const t of FS_TABLES) await q(`DELETE FROM "${t}" WHERE "projectId"=$1`, [pid]);
    await q('DELETE FROM seqs WHERE "projectId"=$1', [pid]);
  } else {
    pid = (await q(
      `INSERT INTO projects (name,"sysType",status,vendor,description,phases,"stdVersion","processScope","processStatus","fsEnabled","fsSysType","isDemo","createdAt","updatedAt")
       VALUES ($1,'其他','init',$2,$3,'{}'::jsonb,'3.1','[]'::jsonb,'{}'::jsonb,true,NULL,true,$4,$4) RETURNING id`,
      [NAME, MARKER, DESC, now],
    )).rows[0].id as number;
  }

  await insertBrakeData(pid);
}

async function insertBrakeData(pid: number): Promise<void> {
  const q = (t: string, v?: unknown[]) => pool.query(t, v);
  const DT = {
    proj: T('2026-10-06T09:20:00+08:00'), h1: T('2026-10-06T09:35:00+08:00'),
    h2: T('2026-10-06T09:50:00+08:00'), h3: T('2026-10-06T09:56:00+08:00'),
    t1: T('2026-10-07T15:30:00+08:00'), t2: T('2026-10-08T09:30:00+08:00'),
    ovr: T('2026-10-07T14:30:00+08:00'), rev: T('2026-10-07T14:52:00+08:00'),
    t0: T('2026-10-07T10:05:00+08:00'),
  };
  const uid = async (username: string) => (await q('SELECT id FROM users WHERE username=$1', [username])).rows[0]?.id ?? 0;
  const zhang = await uid('zhang'); const wang = await uid('wang');
  const R: Record<string, number> = {}; const H: Record<string, number> = {};

  // ---- 安全目标 / 需求链（SG→FSC→TSC→HW-SR） ----
  const mkReq = async (code: string, kind: string, title: string, text: string, parentCode: string | null, asil: string, srcRef: string | null, vmethod: string | null, asilFrom: string | null, status: string, decomp: unknown = null, at = DT.t0) => {
    const r = await q(
      `INSERT INTO fs_safety_reqs ("projectId",code,kind,title,text,"parentId","sourceRef",asil,"asilInherited","asilDecomposed","asilFrom","safetyRelated","verificationMethod",status,version,"createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10,true,$11,$12,1,$13,$13) RETURNING id`,
      [pid, code, kind, title, text, parentCode ? R[parentCode] ?? null : null, srcRef, asil, JSON.stringify(decomp), asilFrom, vmethod, status, at],
    );
    R[code] = r.rows[0].id;
    const row = (await q('SELECT * FROM fs_safety_reqs WHERE id=$1', [R[code]])).rows[0];
    await writeAudit({ userId: zhang, username: 'zhang', action: 'CREATE', entityType: 'fs_safety_reqs', entityId: R[code], summary: `新增安全需求 ${code}（${kind}，ASIL ${asil}）`, before: null, after: row }, at);
    return R[code];
  };
  await mkReq('SG-001', 'SG', '避免因制动踏板位置信号失效导致行车制动功能丧失', '应避免因制动踏板位置信号失效（丢失/不可信）导致行车制动功能丧失。ASIL D。', null, 'D', 'HARA HE-01', null, null, 'approved');
  await mkReq('SG-002', 'SG', '避免因踏板信号误判导致非预期制动/制动不足', '应避免因制动踏板信号误判（漂移/错误/开关失效）导致非预期制动或制动不足。ASIL C。', null, 'C', 'HARA HE-02 / HE-03', null, null, 'approved');
  await mkReq('FSC-001', 'FSC', '制动踏板位置信号功能安全概念', '采用双路冗余位置传感 + 信号有效性校验，避免位置信号失效导致行车制动丧失；失效时进入安全状态。继承 SG-001，ASIL D。', 'SG-001', 'D', 'SG-001', null, null, 'approved');
  const tsc1 = await mkReq('TSC-001', 'TSC', '位置信号双通道技术要求', '位置信号采用两条独立传感/信号链；两通道交叉校验，任一路丢失或不可信即判定信号失效并进入安全状态。', 'FSC-001', 'D', 'FSC-001', '台架试验 + 故障注入测试', null, 'approved',
    { base: 'D', parts: [{ asil: 'B', note: '通道 1 · 位置传感器与信号链（含供电/线束/ADC）' }, { asil: 'B', note: '通道 2 · 独立位置传感器与信号链' }] });
  await mkReq('HW-SR-001', 'HW_SR', '通道 1：位置传感器与信号链要求', '通道 1 位置传感器输出有效、范围可信；供电与信号线束满足短路/断路诊断覆盖。', 'TSC-001', 'B', 'TSC-001 分解（通道 1）', '台架试验 + 故障注入（开路/短路）', 'D', 'approved');
  await mkReq('HW-SR-002', 'HW_SR', '通道 2：独立位置传感器与信号链要求', '通道 2 与通道 1 物理/供电独立；交叉比对不一致时置信号不可信。', 'TSC-001', 'B', 'TSC-001 分解（通道 2）', '双通道一致性试验 + 独立性 DFA', 'D', 'draft');
  await mkReq('FSC-002', 'FSC', '踏板信号一致性功能安全概念', '通过位置信号与力/开关信号的一致性校验与合理性判断，避免制动意图误判。继承 SG-002，ASIL C。', 'SG-002', 'C', 'SG-002', null, null, 'approved');
  await mkReq('TSC-002', 'TSC', '信号一致性与合理性技术要求', '位置信号与踏板力/开关信号应满足一致性判据；不一致时抑制非预期制动/报警并降级。', 'FSC-002', 'C', 'FSC-002', null, null, 'draft');
  await mkReq('HW-SR-003', 'HW_SR', '力/开关信号电路要求', '制动灯开关与踏板力信号电路应可诊断（断路/短路/抖动），并提供冗余判定。', 'TSC-002', 'C', 'TSC-002', '开关电路诊断测试 + 一致性验证', null, 'draft');

  // ---- HARA（3 条 E/E；HE-01 带覆写留痕） ----
  const mkHaz = async (hazId: string, title: string, vh: string, sit: string, s: string, e: string, c: string, asil: string, sgCode: string | null, at: number) => {
    const r = await q(
      `INSERT INTO fs_hazards ("projectId","hazId",title,"vehicleLevelHazard",situation,severity,exposure,controllability,asil,"asilManual","sgId",refs,status,rationale,version,"createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11,'confirmed',$12,1,$13,$13) RETURNING id`,
      [pid, hazId, title, vh, sit, s, e, c, asil, sgCode ? R[sgCode] : null, JSON.stringify(['ISO 26262-3:2018 Table 4']), `依据 ISO 26262-3:2018 Table 4：${s}+${e}+${c} → ${asil}`, at],
    );
    H[hazId] = r.rows[0].id;
    const row = (await q('SELECT * FROM fs_hazards WHERE id=$1', [H[hazId]])).rows[0];
    await writeAudit({ userId: zhang, username: 'zhang', action: 'CREATE', entityType: 'fs_hazards', entityId: H[hazId], summary: `创建 HARA 条目 ${hazId}「${title}」（${s} / ${e} / ${c} → ASIL ${asil}，引擎判定）`, before: null, after: row }, at);
    return H[hazId];
  };
  const h1 = await mkHaz('HE-01', '制动踏板位置信号丢失', '行车制动功能丧失', '行车制动过程中（高速 / 紧急制动）', 'S3', 'E4', 'C3', 'D', 'SG-001', DT.h1);
  await mkHaz('HE-02', '制动踏板位置信号漂移 / 错误', '非预期制动 / 制动力偏差', '行车制动 / 滑行减速工况', 'S3', 'E4', 'C2', 'C', 'SG-002', DT.h2);
  await mkHaz('HE-03', '制动踏板力 / 开关信号失效', '制动意图误判（漏触发 / 误触发）', '紧急制动 / 日常驾驶', 'S2', 'E4', 'C3', 'C', 'SG-002', DT.h3);

  // HE-01 覆写留痕（审计：改前/改后 + 人 + 时间 + 理由）
  const h1row = (await q('SELECT * FROM fs_hazards WHERE id=$1', [h1])).rows[0];
  const beforeOvr = { ...h1row };
  const afterOvr = { ...h1row, controllability: 'C2', asil: 'C', asilManual: true, asilManualReason: '评审复核，可控性重新评估', rationale: '拟按“信号丢失可由驾驶员感知并降级”论证 C2。', version: 2, updatedAt: DT.ovr };
  await q(`UPDATE fs_hazards SET controllability='C2', asil='C', "asilManual"=true, "asilManualReason"=$2, rationale=$3, version=2, "updatedAt"=$4 WHERE id=$1`, [h1, afterOvr.asilManualReason, afterOvr.rationale, DT.ovr]);
  await writeAudit({ userId: wang, username: 'wang', action: 'UPDATE', entityType: 'fs_hazards', entityId: h1, summary: '人工覆写 ASIL：D → C（可控性 C3 → C2）；理由：评审复核，可控性重新评估', before: beforeOvr, after: afterOvr }, DT.ovr);
  const beforeRev = { ...afterOvr };
  const finalRationale = '复查结论：信号丢失时驾驶员无法可靠区分“无制动请求”与“信号失效”，可控性不成立 → 维持 C3，定级 ASIL D。';
  const afterRev = { ...h1row, controllability: 'C3', asil: 'D', asilManual: false, asilManualReason: null, rationale: finalRationale, version: 3, updatedAt: DT.rev };
  await q(`UPDATE fs_hazards SET controllability='C3', asil='D', "asilManual"=false, "asilManualReason"=NULL, rationale=$2, version=3, "updatedAt"=$3 WHERE id=$1`, [h1, finalRationale, DT.rev]);
  await writeAudit({ userId: wang, username: 'wang', action: 'UPDATE', entityType: 'fs_hazards', entityId: h1, summary: '撤销人工覆写，恢复引擎判定：C → D（可控性 C2 → C3）；复查：信号丢失与无请求不可区分，维持 C3、定级 ASIL D', before: beforeRev, after: afterRev }, DT.rev);

  // ---- 安全分析：FMEDA / FTA / DFA（E/E） ----
  const fmRows = [
    { id: 'r1', component: '踏板位置传感器（通道 1）', failureMode: '输出丢失 / 卡滞', effect: '位置信号丢失', safetyRelated: true, lambda: 0.5, distribution: 100, diagnosticCoverage: 99, faultType: 'singlePoint', mitigation: '双通道交叉校验 + 范围/梯度合理性校验' },
    { id: 'r2', component: 'ECU 采样 / ADC（信号调理）', failureMode: '采样通道失效', effect: '信号不可信', safetyRelated: true, lambda: 0.2, distribution: 100, diagnosticCoverage: 98, faultType: 'singlePoint', mitigation: 'ADC 自检 + 双通道比对' },
    { id: 'r3', component: '传感器供电 / 稳压', failureMode: '供电丢失 / 漂移', effect: '通道失效', safetyRelated: true, lambda: 2.0, distribution: 100, diagnosticCoverage: 90, faultType: 'latent', mitigation: '独立供电 + 电压监控' },
    { id: 'r4', component: '信号线束 / 连接器', failureMode: '断路 / 短路 / 接触不良', effect: '信号丢失 / 漂移', safetyRelated: true, lambda: 1.0, distribution: 100, diagnosticCoverage: 88, faultType: 'latent', mitigation: '双绞屏蔽 + 开短路诊断' },
    { id: 'r5', component: '制动灯开关电路', failureMode: '触点抖动 / 粘连', effect: '开关信号错误（可探测）', safetyRelated: true, lambda: 30, distribution: 100, diagnosticCoverage: 95, faultType: 'safe', mitigation: '去抖判据 + 一致性校验' },
    { id: 'r6', component: '踏板力/行程冗余信号通道', failureMode: '通道偏差（可探测）', effect: '可用性下降', safetyRelated: true, lambda: 40, distribution: 100, diagnosticCoverage: 92, faultType: 'safe', mitigation: '冗余比对 + 降级策略' },
    { id: 'r7', component: 'EMC 屏蔽 / 滤波', failureMode: '干扰（无功能影响）', effect: '噪声（不影响判定）', safetyRelated: true, lambda: 30, distribution: 100, diagnosticCoverage: 0, faultType: 'noEffect', mitigation: 'EMC 设计 + 滤波' },
  ];
  const tot = fmRows.reduce((s, r) => s + r.lambda, 0);
  const spf = fmRows.filter((r) => r.faultType === 'singlePoint').reduce((s, r) => s + r.lambda, 0);
  const lat = fmRows.filter((r) => r.faultType === 'latent').reduce((s, r) => s + r.lambda, 0);
  const spfm = 1 - spf / tot, lfm = 1 - lat / (tot - spf), pmhf = spf + lat;
  const targets = { pmhfFit: 10, spfmPct: 99, lfmPct: 90 };
  const verdict = spfm * 100 >= targets.spfmPct && lfm * 100 >= targets.lfmPct && pmhf <= targets.pmhfFit ? 'pass' : 'fail';
  const fmedaId = (await q(
    `INSERT INTO fs_fmeda ("projectId","fmedaId","targetRef",asil,item,rows,metrics,status,version,"createdAt","updatedAt")
     VALUES ($1,'FMEDA-001',$2,'D','制动踏板位置信号链（硬件架构度量）',$3,$4,'approved',1,$5,$5) RETURNING id`,
    [pid, JSON.stringify({ type: 'fs_req', id: tsc1 }), JSON.stringify(fmRows), JSON.stringify({ spfm, lfm, pmhf, targets, verdict }), DT.t2],
  )).rows[0].id;

  const ftaTree = { id: 'T', label: '制动踏板位置信号丢失致行车制动功能丧失', gate: 'OR', children: [
    { id: 'G1', label: '位置传感器失效', gate: 'OR', children: [
      { id: 'B1', label: '通道 1 传感器失效', basic: { lambda: 0.3, source: 'FMEDA r1' } },
      { id: 'B2', label: '通道 2 传感器失效', basic: { lambda: 0.3, source: 'FMEDA r1' } },
      { id: 'B3', label: '传感器供电失效', basic: { lambda: 0.2, source: 'FMEDA r3' } } ] },
    { id: 'G2', label: '信号传输失效', gate: 'OR', children: [
      { id: 'B4', label: '线束断路 / 短路', basic: { lambda: 0.4, source: 'FMEDA r4' } },
      { id: 'B5', label: '连接器接触不良', basic: { lambda: 0.3, source: 'FMEDA r4' } } ] },
    { id: 'G3', label: 'ECU 输入处理失效（需同时）', gate: 'AND', children: [
      { id: 'B6', label: 'ADC / 采样通道失效', basic: { lambda: 0.2 } },
      { id: 'B7', label: '信号有效性校验失效', basic: { lambda: 0.2 } } ] },
  ] };
  await q(`INSERT INTO fs_fta ("projectId","ftaId","topEvent","topAsil","rootRef",tree,status,"createdAt","updatedAt")
    VALUES ($1,'FTA-001','制动踏板位置信号丢失致行车制动功能丧失','D',$2,$3,'reviewed',$4,$4)`,
    [pid, JSON.stringify({ type: 'fs_hazard', id: h1 }), JSON.stringify(ftaTree), DT.t2]);

  const dfaRows = [
    { id: 'r1', refA: '位置传感器（通道 1）', refB: '位置传感器（通道 2）', mechanism: 'commonCause', couplingDetail: '共享供电、壳体外壳与邻近磁场环境（TSC-001 分解独立性论证）', analysis: '两通道若共享供电/环境耦合可能同时失效；TSC-001 分解（B(D)+B(D)）依赖二者独立性', mitigation: '独立供电与信号链 + 物理隔离 + 一致性校验' },
    { id: 'r2', refA: '位置传感器', refB: 'ECU 采样通道', mechanism: 'cascading', couplingDetail: '传感器输出异常级联至 ECU 采样判定', analysis: '级联失效：传感器失效可致采样判定错误', mitigation: '范围/梯度合理性校验 + 双通道比对' },
    { id: 'r3', refA: '信号线束', refB: '连接器', mechanism: 'interaction', couplingDetail: '连接处接触与线束走线相互影响', analysis: '接口处相互影响可能放大偶发失效', mitigation: '接插件选型与线束固定专项验证' },
  ];
  const dfaId = (await q(`INSERT INTO fs_dfa ("projectId","dfaId",scope,asil,rows,status,"createdAt","updatedAt")
    VALUES ($1,'DFA-001','制动踏板位置信号链（独立性论证）','D',$2,'reviewed',$3,$3) RETURNING id`, [pid, JSON.stringify(dfaRows), DT.t2])).rows[0].id;

  // ---- 确认措施 ----
  await q(`INSERT INTO fs_confirm_measures ("projectId","cmId",type,title,scope,"relatedAsil",independence,evidence,status,"createdAt","updatedAt")
    VALUES ($1,'CM-001','review','确认评审：制动踏板位置信号危险分析与定级复核','SG-001','D','I3','评审记录 CR-2026-101','closed',$2,$2)`, [pid, DT.ovr]);
  await q(`INSERT INTO fs_confirm_measures ("projectId","cmId",type,title,scope,"relatedAsil",independence,evidence,status,"createdAt","updatedAt")
    VALUES ($1,'CM-002','assessment','功能安全评估：信号链（传感器/线束/ECU）验证证据充分性','SG-001','D','I3','评估报告 FSA-2026-011','in_progress',$2,$2)`, [pid, DT.t2]);
  await q(`INSERT INTO fs_confirm_measures ("projectId","cmId",type,title,scope,"relatedAsil",independence,evidence,status,"createdAt","updatedAt")
    VALUES ($1,'CM-003','review','确认评审：踏板信号误判危害与 SG-002 复核','SG-002','C','I2','评审记录 CR-2026-102','closed',$2,$2)`, [pid, DT.t1]);

  // ---- Safety Case（GSN 树 + 证据回链） ----
  const nodes = [
    { id: 'N01', kind: 'goal', text: '制动踏板位置信号满足 ISO 26262:2018 功能安全要求（ASIL D）' },
    { id: 'N02', kind: 'context', text: '相关项：某车型制动踏板位置信号（位置传感器 → 线束/连接器 → ECU 采样）', parentId: 'N01' },
    { id: 'N03', kind: 'strategy', text: '结合 HARA 与安全需求链，将位置信号相关危害降低至可接受水平', parentId: 'N01' },
    { id: 'N04', kind: 'goal', text: 'SG-001：避免因制动踏板位置信号失效导致行车制动功能丧失（ASIL D）', parentId: 'N03' },
    { id: 'N05', kind: 'solution', text: 'HARA 报告（HE-01～HE-03）', parentId: 'N04', evidenceRef: { type: 'fs_hazard', id: h1 } },
    { id: 'N06', kind: 'solution', text: '安全需求链 SG-001→FSC-001→TSC-001（含 ASIL 分解 B(D)+B(D)）', parentId: 'N04', evidenceRef: { type: 'fs_req', id: tsc1 } },
    { id: 'N07', kind: 'solution', text: 'FMEDA 硬件度量达标（SPFM 99.3% / LFM 97.1% / PMHF 3.7 FIT）', parentId: 'N04', evidenceRef: { type: 'fs_fmeda', id: fmedaId } },
    { id: 'N08', kind: 'goal', text: 'SG-002：避免因踏板信号误判导致非预期制动/制动不足（ASIL C）', parentId: 'N03' },
    { id: 'N09', kind: 'solution', text: 'DFA 相关失效分析（双通道独立性论证）', parentId: 'N08', evidenceRef: { type: 'fs_dfa', id: dfaId } },
    { id: 'N10', kind: 'assumption', text: '整车侧信号接口定义与装配按规范执行（生产控制）', parentId: 'N03' },
    { id: 'N11', kind: 'justification', text: '确认措施独立性按 I3 选取（ISO 26262-9:2018）', parentId: 'N03' },
  ];
  await q(`INSERT INTO fs_safety_cases ("projectId",title,version,nodes,gaps,status,"createdAt","updatedAt")
    VALUES ($1,'制动踏板位置信号 Safety Case','1.0',$2,'[]'::jsonb,'under_review',$3,$3)`, [pid, JSON.stringify(nodes), DT.t2]);

  // ---- 安全计划 ----
  const plans: [string, string, string, string, string, string][] = [
    ['PL-001', 'phCon', '相关项定义与边界确定', '相关项定义书', 'D', 'done'],
    ['PL-002', 'phCon', '危害分析与风险评估（HARA）', 'HARA 报告', 'D', 'done'],
    ['PL-003', 'phCon', '功能安全概念（FSC）', 'FSC 报告', 'D', 'done'],
    ['PL-004', 'phSys', '技术安全概念（TSC）', 'TSC 报告', 'D', 'in_progress'],
    ['PL-005', 'phSys', '系统安全需求分配与追溯', '安全需求链 / 追溯矩阵', 'D', 'in_progress'],
    ['PL-006', 'phHw', '信号链硬件设计与失效分析', '硬件设计说明 + FMEDA', 'D', 'in_progress'],
    ['PL-007', 'phHw', '硬件架构度量（SPFM/LFM/PMHF）', 'FMEDA 报告', 'D', 'done'],
    ['PL-008', 'phSw', '软件安全需求（信号校验/诊断）', '软件安全需求规格', 'D', 'planned'],
    ['PL-009', 'phVal', '集成与安全验证（故障注入）', '台架 / HIL 验证报告', 'D', 'planned'],
    ['PL-010', 'phVal', '功能安全确认评审（FSA）', 'FSA 报告', 'D', 'planned'],
    ['PL-011', 'phCon', '安全计划编制', '安全计划', 'D', 'done'],
    ['PL-012', 'phSw', '软件安全分析（信号校验/诊断逻辑）', '软件安全分析报告', 'D', 'planned'],
  ];
  let i = 0;
  for (const [plId, phase, task, deliverable, asil, status] of plans) {
    i++;
    await q(`INSERT INTO fs_plan_items ("projectId","plId",phase,task,deliverable,asil,status,"naReason",owner,"createdAt","updatedAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'张工',$9,$9)`,
      [pid, plId, phase, task, deliverable, asil, status, status === 'na' ? '不适用' : null, DT.t2 - i * 60000]);
  }

  // ---- 正式评估报告台账（2 份） ----
  const snapOf = async (kind: string, reportNo: string, version: string) => ({
    kind, projectId: pid, projectName: NAME, reportNo, version,
    hazards: (await q('SELECT * FROM fs_hazards WHERE "projectId"=$1', [pid])).rows,
    reqs: (await q('SELECT * FROM fs_safety_reqs WHERE "projectId"=$1', [pid])).rows,
    fmedas: (await q('SELECT * FROM fs_fmeda WHERE "projectId"=$1', [pid])).rows,
    ftas: (await q('SELECT * FROM fs_fta WHERE "projectId"=$1', [pid])).rows,
    dfas: (await q('SELECT * FROM fs_dfa WHERE "projectId"=$1', [pid])).rows,
    cases: (await q('SELECT * FROM fs_safety_cases WHERE "projectId"=$1', [pid])).rows,
    confirms: (await q('SELECT * FROM fs_confirm_measures WHERE "projectId"=$1', [pid])).rows,
    plans: (await q('SELECT * FROM fs_plan_items WHERE "projectId"=$1', [pid])).rows,
    generatedAt: DT.t2,
  });
  const reports = [
    { kind: 'hara', title: '危害分析与风险评估报告', no: `HARA-${pid}-20261007-1530`, ver: 'v1.0', at: DT.t1, by: '张工（系统工程师）', uid: zhang, uname: 'zhang' },
    { kind: 'safety-case', title: '安全案例报告', no: `SAFETY-CASE-${pid}-20261008-0930`, ver: 'v1.0', at: DT.t2, by: '王经理（质量/审核）', uid: wang, uname: 'wang' },
  ];
  for (const rp of reports) {
    const snapshot = await snapOf(rp.kind, rp.no, rp.ver);
    const hash = sha(snapshot);
    await q(`INSERT INTO fs_reports ("projectId",kind,"reportNo",title,version,"snapshotHash",snapshot,"createdBy","createdAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [pid, rp.kind, rp.no, rp.title, rp.ver, hash, JSON.stringify(snapshot), rp.by, rp.at]);
    await writeAudit({ userId: rp.uid, username: rp.uname, action: 'EXPORT', entityType: 'fs_reports', entityId: pid, summary: `导出 ${rp.title}（${rp.no}）· 快照 ${hash.slice(0, 12)}`, before: null, after: { reportNo: rp.no, version: rp.ver, snapshotHash: hash } }, rp.at);
  }

  // ---- 序号计数器 ----
  await q(`INSERT INTO seqs ("projectId",prefix,seq) VALUES ($1,'HAZ',3),($1,'SG',2),($1,'FSC',2),($1,'TSC',2),($1,'HW-SR',3),($1,'FMEDA',1),($1,'FTA',1),($1,'DFA',1),($1,'CM',3),($1,'PL',12)`, [pid]);
}
