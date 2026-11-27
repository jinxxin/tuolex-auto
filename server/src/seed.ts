import { pool } from './db';
import { ALL_PROCESSES } from './data/processes';
import { WP_TEMPLATES } from './data/wpTemplates';
import { ensureBrakeDemoProject } from './seedBrakeDemo';

// ============ 种子数据（首次启动自动写入，幂等）============
// 只灌过程库与 WP 模板；不预置任何账号、不预置标准/法规正文。

let seedPromise: Promise<void> | null = null;
export function seedIfNeeded(): Promise<void> {
  if (!seedPromise) seedPromise = doSeed();
  return seedPromise;
}

async function doSeed(): Promise<void> {
  await ensurePlanDemo();
  const now = Date.now();

  // ---- A-SPICE 过程库（幂等）----
  const procCnt = (await pool.query('SELECT COUNT(*)::int AS n FROM aspice_processes')).rows[0].n;
  if (procCnt === 0) {
    for (const p of ALL_PROCESSES) {
      await pool.query(
        `INSERT INTO aspice_processes (code, name, "nameZh", "groupCode", "stdVersion", purpose, bps, wps, active, "only40")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [p.code, p.name, p.nameZh, p.groupCode, p.stdVersion, p.purpose,
         JSON.stringify(p.bps), JSON.stringify(p.wps), p.active ?? true, p.only40 ?? null],
      );
    }
  }

  // ---- WP 模板库（幂等）----
  const wpTplCnt = (await pool.query('SELECT COUNT(*)::int AS n FROM wp_templates')).rows[0].n;
  if (wpTplCnt === 0) {
    for (const t of WP_TEMPLATES) {
      await pool.query(
        `INSERT INTO wp_templates ("processCode", "wpCode", title, "stdVersion", intro, sections, active)
         VALUES ($1,$2,$3,$4,$5,$6,true)`,
        [t.processCode, t.wpCode, t.title, t.stdVersion, t.intro, JSON.stringify(t.sections)],
      );
    }
  }

  // ---- 示例项目（仅当无项目时；SEED_DEMO=false 可跳过）----
  const demoOn = !['0', 'false', 'off', 'no'].includes(String(process.env.SEED_DEMO ?? 'true').trim().toLowerCase());
  const projCnt = (await pool.query('SELECT COUNT(*)::int AS n FROM projects')).rows[0].n;
  if (projCnt === 0 && demoOn) {
    const scope = ['SYS.1', 'SYS.2', 'SYS.3', 'SYS.4', 'SYS.5', 'SWE.1', 'SWE.2', 'SWE.3', 'SWE.4', 'SWE.5', 'SWE.6', 'SUP.1', 'SUP.2', 'SUP.4', 'SUP.5', 'SUP.7', 'SUP.8', 'SUP.9', 'MAN.3', 'MAN.5', 'MAN.6'];
    const proj = await pool.query(
      `INSERT INTO projects (name, "sysType", status, vendor, description, phases, "stdVersion", "processScope", "processStatus", "createdAt", "updatedAt", "isDemo")
       VALUES ($1,$2,$3,$4,$5,'{}',$6,$7,$8,$9,$9,true) RETURNING id`,
      ['ADAS 前视摄像头域控制器（ADC）软件项目', 'ADAS', 'validation', '示例 Tier1 供应商',
       '前视摄像头域控制器软件在研项目（演示）。覆盖系统需求分析、软件需求、架构、单元/集成/合格性测试与支持过程，目标 SWE/SYS 过程能力等级 CL2-CL3。',
       '3.1', JSON.stringify(scope), JSON.stringify(Object.fromEntries(scope.map((c) => [c, c === 'SWE.1' ? 'in_progress' : 'not_started']))), now],
    );
    const pid = proj.rows[0].id as number;
    await ensureDemoData(pid);
  }

  // 功能安全演示项目（虚构数据；SEED_DEMO=false 时跳过）
  if (demoOn) await ensureBrakeDemoProject();

  // WP 示例文档补建（幂等）
  await ensureWpSampleDocs();
  await ensureProjectMembers();
}

// 工作产品关联文档（幂等：无 docId 或文档缺失时补建）
async function ensureWpSampleDocs(): Promise<void> {
  const wps = (await pool.query('SELECT * FROM work_products')).rows;
  for (const w of wps) {
    if (w.docId) {
      const d = await pool.query('SELECT id FROM documents WHERE id = $1', [w.docId]);
      if (d.rows[0]) continue;
    }
    const proj = await pool.query('SELECT id, name FROM projects WHERE id = $1', [w.projectId]);
    if (!proj.rows[0]) continue;
    const now = Date.now();
    const doc = await pool.query(
      `INSERT INTO documents (title, "docType", "projectId", version, status, "signatureIds", history, sections, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,1,'draft','[]',$4,$5,$6,$6) RETURNING id`,
      [
        `${w.title} — ${proj.rows[0].name}`, w.processCode, w.projectId,
        JSON.stringify([{ version: 1, date: now, by: '系统（示例数据）', note: `WP 示例文档（${w.wpCode}）` }]),
        JSON.stringify([
          { id: `sec-${w.id}`, title: '1. 说明', type: 'text', content: JSON.stringify({ type: 'doc', content: [
            { type: 'paragraph', content: [{ type: 'text', text: `本工作产品为示例数据（${w.wpCode} ${w.title}）。\n\n${w.desc || ''}\n\n正式使用时请通过「工作产品」Tab 从模板一键生成（自动填入 V 条目）。` }] },
          ] }) },
        ]),
        now,
      ],
    );
    await pool.query('UPDATE work_products SET "docId" = $1 WHERE id = $2', [doc.rows[0].id, w.id]);
  }
}

// 演示数据（需求/测试/追溯/FMEA/工作产品/在线文档）—— 幂等
async function ensureDemoData(pid: number): Promise<void> {
  const now = Date.now();
  const reqCnt = (await pool.query('SELECT COUNT(*)::int AS n FROM req_items')).rows[0].n;
  if (reqCnt === 0) {
    const reqSeeds = [
      // 系统需求（SYS.2）
      { reqId: 'SYS-REQ-001', reqType: 'sys_req', desc: '系统应支持前视摄像头原始图像采集，帧率≥30fps，分辨率≥1920×1080', priority: '高', sourceReg: 'SYS.2 / 客户需求', status: 'approved' },
      { reqId: 'SYS-REQ-002', reqType: 'sys_req', desc: '系统应实现目标检测（车辆/行人/两轮车），检测距离≥150m（车辆）', priority: '高', sourceReg: 'SYS.2 / 客户需求', status: 'approved' },
      { reqId: 'SYS-REQ-003', reqType: 'sys_req', desc: '系统应输出 AEB/ACC 等驾驶辅助控制请求，延迟≤100ms', priority: '高', sourceReg: 'SYS.2 / ISO 26262', status: 'approved' },
      { reqId: 'SYS-REQ-004', reqType: 'sys_req', desc: '系统应满足 ASIL B 功能安全等级要求（安全相关输出）', priority: '高', sourceReg: 'ISO 26262', status: 'approved' },
      { reqId: 'SYS-REQ-005', reqType: 'sys_req', desc: '系统应支持 OTA 固件升级，升级失败可回滚', priority: '中', sourceReg: 'SYS.2 / 客户需求', status: 'draft' },
      // 系统架构元素（SYS.3）
      { reqId: 'SYS-ARCH-001', reqType: 'sys_arch', desc: '系统元素：前视摄像头模组（含 ISP），提供原始图像流', priority: '高', sourceReg: '实现 SYS-REQ-001', status: 'approved' },
      { reqId: 'SYS-ARCH-002', reqType: 'sys_arch', desc: '系统元素：域控制器（SoC+安全 MCU），承载感知/决策/控制软件', priority: '高', sourceReg: '实现 SYS-REQ-002/003', status: 'approved' },
      { reqId: 'SYS-ARCH-003', reqType: 'sys_arch', desc: '系统元素：车辆接口（CAN/以太网），与执行器及整车通信', priority: '高', sourceReg: '实现 SYS-REQ-003', status: 'draft' },
      // 软件需求（SWE.1）
      { reqId: 'SW-REQ-001', reqType: 'sw_req', desc: '软件应提供图像采集模块，管理摄像头驱动与帧缓冲，异常时上报', priority: '高', sourceReg: '分配 SYS-ARCH-001', status: 'approved' },
      { reqId: 'SW-REQ-002', reqType: 'sw_req', desc: '软件应实现目标检测推理（神经网络），支持模型参数热更新', priority: '高', sourceReg: '分配 SYS-ARCH-002', status: 'approved' },
      { reqId: 'SW-REQ-003', reqType: 'sw_req', desc: '软件应实现决策与控制请求输出，超时/异常时进入安全状态', priority: '高', sourceReg: '分配 SYS-ARCH-002 / ASIL B', status: 'approved' },
      { reqId: 'SW-REQ-004', reqType: 'sw_req', desc: '软件应实现诊断服务（UDS）与故障存储', priority: '中', sourceReg: '客户诊断规范', status: 'draft' },
      { reqId: 'SW-REQ-005', reqType: 'sw_req', desc: '软件应支持 OTA 升级管理器：校验、备份、回滚', priority: '中', sourceReg: '分配 SYS-ARCH-002', status: 'draft' },
      // 软件架构元素（SWE.2）
      { reqId: 'SW-ARCH-001', reqType: 'sw_arch', desc: '软件元素：感知模块（图像采集+目标检测），输出目标列表', priority: '高', sourceReg: '实现 SW-REQ-001/002', status: 'approved' },
      { reqId: 'SW-ARCH-002', reqType: 'sw_arch', desc: '软件元素：决策模块（AEB/ACC 决策），输出控制请求', priority: '高', sourceReg: '实现 SW-REQ-003', status: 'approved' },
      { reqId: 'SW-ARCH-003', reqType: 'sw_arch', desc: '软件元素：执行模块（CAN 通信/安全状态机），下发执行器', priority: '高', sourceReg: '实现 SW-REQ-003', status: 'draft' },
      { reqId: 'SW-ARCH-004', reqType: 'sw_arch', desc: '软件元素：诊断与 OTA 模块（UDS/升级管理）', priority: '中', sourceReg: '实现 SW-REQ-004/005', status: 'draft' },
      // 详细设计（SWE.3）
      { reqId: 'DD-001', reqType: 'dd', desc: '目标检测推理流程设计：图像预处理→模型推理→后处理（NMS/阈值），含模型热更新接口', priority: '高', sourceReg: '细化 SW-ARCH-001', status: 'draft' },
      { reqId: 'DD-002', reqType: 'dd', desc: 'AEB 决策算法设计：碰撞时间 TTC 计算、制动请求分级、驾驶员意图抑制', priority: '高', sourceReg: '细化 SW-ARCH-002', status: 'draft' },
      { reqId: 'DD-003', reqType: 'dd', desc: '安全状态机设计：正常/降级/安全停止三态，看门狗超时迁移逻辑', priority: '高', sourceReg: '细化 SW-ARCH-003 / ASIL B', status: 'draft' },
      // 软件单元（SWE.3）
      { reqId: 'UNIT-001', reqType: 'unit', desc: '单元：图像帧缓冲管理（环形缓冲，丢帧统计）', priority: '高', sourceReg: '实现 DD-001', status: 'draft' },
      { reqId: 'UNIT-002', reqType: 'unit', desc: '单元：TTC 计算与制动分级（纯函数，可单元测试）', priority: '高', sourceReg: '实现 DD-002', status: 'draft' },
    ];
    const reqIds: number[] = [];
    for (const r of reqSeeds) {
      const ins = await pool.query(
        `INSERT INTO req_items ("projectId", "docId", "reqId", "reqType", "desc", priority, "sourceReg", status, "createdAt", "updatedAt")
         VALUES ($1,0,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id`,
        [pid, r.reqId, r.reqType, r.desc, r.priority, r.sourceReg, r.status, now],
      );
      reqIds.push(ins.rows[0].id);
    }

    const tcSeeds = [
      { tcId: 'TC-UNIT-001', title: 'TTC 计算单元测试（边界）', steps: '1. 输入静止目标 TTC 计算 2. 输入高速接近目标 3. 输入无效数据', expected: 'TTC 计算正确；无效数据返回安全默认值', result: 'pass', executedBy: '李工（软件工程师）', evidence: '单元测试报告 #U-001', status: 'approved' },
      { tcId: 'TC-IT-001', title: '图像采集模块集成测试', steps: '1. 连接摄像头 2. 采集 1000 帧 3. 校验帧率与丢帧率', expected: '帧率≥30fps，丢帧率<0.1%，异常上报正确', result: 'pass', executedBy: '李工（软件工程师）', evidence: '集成测试记录 #IT-001', status: 'approved' },
      { tcId: 'TC-IT-002', title: '检测模块与决策模块集成', steps: '1. 注入模拟目标 2. 校验检测→决策链路 3. 校验端到端延迟', expected: '端到端延迟≤100ms，目标传递无丢失', result: 'not_run', executedBy: null, evidence: '', status: 'draft' },
      { tcId: 'TC-QT-001', title: '目标检测合格性测试（场景库）', steps: '1. 运行标准场景库（白天/夜晚/雨雾） 2. 统计检出率', expected: '检出率≥95%，误报率≤1/1000 帧（验收准则）', result: 'not_run', executedBy: null, evidence: '', status: 'draft' },
      { tcId: 'TC-QT-002', title: 'AEB 功能合格性测试（HIL）', steps: '1. HIL 环境注入目标车 2. 触发 AEB 3. 校验制动请求', expected: 'AEB 触发时间与减速度满足性能指标，无安全失效', result: 'pass', executedBy: '张工（系统工程师）', evidence: 'HIL 测试报告 #QT-002', status: 'approved' },
      { tcId: 'TC-QT-003', title: 'OTA 升级与回滚测试', steps: '1. 注入损坏固件 2. 校验校验失败 3. 触发回滚', expected: '校验失败自动回滚，系统恢复可用', result: 'fail', executedBy: '李工（软件工程师）', evidence: '发现：回滚后参数区未重置，已登记问题 PRB-001', status: 'approved' },
      { tcId: 'TC-SQT-001', title: '系统合格性测试：AEB 完整场景（整车在环）', steps: '1. 整车在环注入前车 2. 触发 AEB 3. 校验整车制动响应与报警', expected: 'AEB 触发、制动请求下发整车、无安全失效', result: 'not_run', executedBy: null, evidence: '', status: 'draft' },
    ];
    const tcIds: number[] = [];
    for (const t of tcSeeds) {
      const ins = await pool.query(
        `INSERT INTO test_cases ("projectId", "docId", "tcId", title, steps, expected, result, "executedBy", evidence, status, "createdAt", "updatedAt")
         VALUES ($1,0,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id`,
        [pid, t.tcId, t.title, t.steps, t.expected, t.result, t.executedBy, t.evidence, t.status, now],
      );
      tcIds.push(ins.rows[0].id);
    }

    // 编号计数器
    const seqs = [['SYS-REQ', 5], ['SYS-ARCH', 3], ['SW-REQ', 5], ['SW-ARCH', 4], ['DD', 3], ['UNIT', 2], ['TC', 7]];
    for (const [prefix, seq] of seqs) {
      await pool.query('INSERT INTO seqs ("projectId", prefix, seq) VALUES ($1,$2,$3)', [pid, prefix, seq]);
    }

    // 追溯链接：完整 V 链（索引对应 reqSeeds/tcSeeds 顺序）
    const links: [number, number, string, 'req' | 'tc'][] = [
      [0, 5, '实现', 'req'], [1, 6, '实现', 'req'], [2, 6, '实现', 'req'], [3, 6, '安全约束', 'req'], [2, 7, '实现', 'req'], [4, 6, '实现', 'req'],
      [5, 8, '分配', 'req'], [6, 9, '分配', 'req'], [6, 10, '分配', 'req'], [7, 10, '分配', 'req'], [6, 12, '分配', 'req'],
      [8, 13, '实现', 'req'], [9, 13, '实现', 'req'], [10, 14, '实现', 'req'], [10, 15, '实现', 'req'], [11, 16, '实现', 'req'], [12, 16, '实现', 'req'],
      [13, 17, '细化', 'req'], [14, 18, '细化', 'req'], [15, 19, '细化', 'req'],
      [17, 20, '实现', 'req'], [18, 21, '实现', 'req'],
      [21, 0, '验证覆盖', 'tc'],
      [8, 1, '验证覆盖', 'tc'], [9, 2, '验证覆盖', 'tc'], [9, 3, '验证覆盖', 'tc'], [10, 4, '验证覆盖', 'tc'], [12, 5, '验证覆盖', 'tc'],
      [2, 6, '验证覆盖', 'tc'],
    ];
    for (const [ri, ti, rel, toType] of links) {
      await pool.query(
        `INSERT INTO trace_links ("projectId", "fromType", "fromId", "toType", "toId", "relType", "createdAt", "createdBy")
         VALUES ($1,'req',$2,$3,$4,$5,$6,'系统（示例数据）')`,
        [pid, reqIds[ri], toType, toType === 'tc' ? tcIds[ti] : reqIds[ti], rel, now],
      );
    }

    // FMEA 技术风险（AIAG-VDA 风格）
    const fmeaCnt = (await pool.query('SELECT COUNT(*)::int AS n FROM fmea_items')).rows[0].n;
    if (fmeaCnt === 0) {
      const fseeds = [
        { process: '感知', failureMode: '摄像头图像在强逆光/隧道场景下过曝', effect: '目标检测失效，AEB 漏触发，危及行车安全', cause: 'ISP 参数固定无动态调节；场景覆盖不足', severity: 9, occurrence: 4, detection: 4, rpn: 144, action: 'ISP 动态曝光策略 + 场景库补充逆光用例（TC-QT-001 扩展）', owner: '感知组', status: 'open' },
        { process: '决策控制', failureMode: '决策模块输出超时/异常', effect: '控制请求丢失，系统无响应', cause: '任务调度死锁；看门狗未覆盖', severity: 8, occurrence: 3, detection: 5, rpn: 120, action: '看门狗+安全状态机（SW-003 安全状态要求），增加异常注入测试', owner: '软件组', status: 'open' },
        { process: 'OTA', failureMode: 'OTA 升级失败导致系统不可用', effect: '车辆售后返厂，用户投诉', cause: '固件校验缺失；回滚机制缺陷（已发现 PRB-001）', severity: 6, occurrence: 3, detection: 3, rpn: 54, action: '校验+回滚完善（TC-QT-003 回归）', owner: '软件组', status: 'open' },
        { process: '通信', failureMode: 'CAN 通信丢帧/延迟', effect: '控制请求延迟超限', cause: '总线负载过高；调度优先级错误', severity: 7, occurrence: 2, detection: 4, rpn: 56, action: '总线负载分析 + 优先级优化 + HIL 验证', owner: '系统组', status: 'open' },
      ];
      for (const f of fseeds) {
        await pool.query(
          `INSERT INTO fmea_items ("projectId", process, "failureMode", effect, cause, severity, occurrence, detection, rpn, action, owner, status, "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [pid, f.process, f.failureMode, f.effect, f.cause, f.severity, f.occurrence, f.detection, f.rpn, f.action, f.owner, f.status, now],
        );
      }
    }

    // 工作产品示例
    const wpCnt = (await pool.query('SELECT COUNT(*)::int AS n FROM work_products')).rows[0].n;
    if (wpCnt === 0) {
      const wps = [
        { processCode: 'SWE.1', wpCode: '17-04', title: '软件需求规格（SwRS）— ADC 软件', status: 'approved', desc: 'SW-001~SW-005 软件需求集合，含追溯与验证方法', createdBy: '李工（软件工程师）' },
        { processCode: 'SWE.2', wpCode: '17-08', title: '软件架构设计 — 感知/决策/执行三层架构', status: 'reviewed', desc: '模块划分、接口定义（感知→决策→执行）、任务调度', createdBy: '李工（软件工程师）' },
        { processCode: 'SWE.6', wpCode: '17-26', title: '软件合格性测试计划', status: 'draft', desc: '场景库测试策略、验收准则（检出率/误报率）', createdBy: '张工（系统工程师）' },
        { processCode: 'SYS.2', wpCode: '13-04', title: '系统需求规格（SysRS）— ADC', status: 'approved', desc: 'SYS-001~SYS-005 系统需求集合', createdBy: '张工（系统工程师）' },
        { processCode: 'SYS.3', wpCode: '13-08', title: '系统架构设计 — 传感器/域控/执行器', status: 'draft', desc: '摄像头选型、域控制器接口、执行器接口', createdBy: '张工（系统工程师）' },
      ];
      for (const w of wps) {
        await pool.query(
          `INSERT INTO work_products ("projectId", "processCode", "wpCode", title, status, "desc", "createdBy", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [pid, w.processCode, w.wpCode, w.title, w.status, w.desc, w.createdBy, now],
        );
      }
    }

    // 在线文档示例（系统需求规格，引用系统需求条目）
    const docCnt = (await pool.query('SELECT COUNT(*)::int AS n FROM documents')).rows[0].n;
    if (docCnt === 0) {
      const sysReqs = (await pool.query(`SELECT * FROM req_items WHERE "projectId" = $1 AND "reqType" IN ('sys_req','sys')`, [pid])).rows;
      const docNow = Date.now();
      const proj = (await pool.query('SELECT name FROM projects WHERE id = $1', [pid])).rows[0];
      await pool.query(
        `INSERT INTO documents (title, "docType", "projectId", version, status, "signatureIds", history, sections, "createdAt", "updatedAt")
         VALUES ($1,'SYS.2',$2,1,'draft','[]',$3,$4,$5,$5)`,
        [
          `${proj.name} — 系统需求规格（SysRS）`, pid,
          JSON.stringify([{ version: 1, date: docNow, by: '系统（示例数据）', note: '创建文档' }]),
          JSON.stringify([
            { id: 'sec-summary', title: '1. 目的与范围', type: 'text', content: JSON.stringify({ type: 'doc', content: [
              { type: 'paragraph', content: [{ type: 'text', text: '本文件定义 ADAS 前视摄像头域控制器的系统需求，是系统开发与验证（SYS.2→SYS.5）的基线输入。需求满足 A-SPICE SYS.2 双向可追溯要求，并引用 ISO 26262 功能安全约束。' }] },
            ] }) },
            { id: 'sec-detail', title: '2. 系统需求条目', type: 'entries', refs: sysReqs.map((r: { id: number }) => ({ type: 'req', id: r.id })), snapshot: [] },
            { id: 'sec-accept', title: '3. 验收准则', type: 'text', content: JSON.stringify({ type: 'doc', content: [
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '每条系统需求在追溯矩阵中有软件需求或测试用例覆盖（双向追溯）' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'SYS.5 系统合格性测试全部通过，无未关闭问题' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'SWE/SYS 关键过程能力等级达成项目目标（CL2-CL3）' }] }] },
              ] },
            ] }) },
          ]),
          docNow,
        ],
      );
    }
  }
}

// 演示项目成员：全部演示用户设为成员（幂等；正式使用请按需管理）
// 注意：排除 viewer（试用只读账号）——试用账号仅应在演示项目(isDemo)中，由编排接口单独授权（qa O3）
async function ensureProjectMembers(): Promise<void> {
  const { rows: projs } = await pool.query('SELECT id FROM projects');
  const { rows: usrs } = await pool.query("SELECT id FROM users WHERE role <> 'viewer'");
  const pmNow = Date.now();
  for (const proj of projs) {
    for (const u of usrs) {
      await pool.query(
        `INSERT INTO project_members (project_id, user_id, role, created_at, created_by)
         VALUES ($1,$2,'member',$3,'seed') ON CONFLICT (project_id, user_id) DO NOTHING`,
        [proj.id, u.id, pmNow],
      );
    }
  }
}

// ============ 项目管理·计划中枢演示数据（tuoleX auto 领域：软件过程 A-SPICE）============
async function ensurePlanDemo(): Promise<void> {
  const proj = await pool.query('SELECT id FROM projects ORDER BY id ASC LIMIT 1');
  if (!proj.rows[0]) return;
  const pid = proj.rows[0].id as number;
  const cnt = (await pool.query('SELECT COUNT(*)::int AS n FROM plan_tasks WHERE "projectId"=$1', [pid])).rows[0].n;
  if (cnt > 0) return;
  const now = Date.now();
  const D = (s: string) => Date.parse(s + 'T00:00:00+08:00');
  type T = { code: string; name: string; phase: string; owner?: string; s: string; e: string; progress: number; status: string; critical?: boolean; parent?: string; group?: boolean; est?: number };
  const tasks: T[] = [
    { code: 'G-SYS', name: '系统需求 (SYS)', phase: 'SYS', s: '2026-06-01', e: '2026-07-10', progress: 100, status: 'done', group: true },
    { code: 'G-REQ', name: '软件需求 (SWE.1)', phase: 'REQ', s: '2026-07-05', e: '2026-08-20', progress: 100, status: 'done', group: true },
    { code: 'G-ARC', name: '软件架构 (SWE.2)', phase: 'ARC', s: '2026-08-15', e: '2026-10-10', progress: 70, status: 'doing', group: true },
    { code: 'G-UNIT', name: '软件单元 (SWE.3/4)', phase: 'UNIT', s: '2026-10-01', e: '2026-12-10', progress: 10, status: 'doing', group: true },
    { code: 'G-INT', name: '软件集成 (SWE.5)', phase: 'INT', s: '2026-12-01', e: '2027-01-20', progress: 0, status: 'todo', group: true },
    { code: 'G-QUAL', name: '合格测试 (SWE.6)', phase: 'QUAL', s: '2027-01-15', e: '2027-03-01', progress: 0, status: 'todo', group: true },
    { code: 'T-SYS01', name: '系统需求分析', phase: 'SYS', owner: '系统工程师', s: '2026-06-01', e: '2026-07-10', progress: 100, status: 'done', parent: 'G-SYS', est: 80 },
    { code: 'T-REQ01', name: '软件需求规范', phase: 'REQ', owner: '李工', s: '2026-07-05', e: '2026-08-10', progress: 100, status: 'done', critical: true, parent: 'G-REQ', est: 120 },
    { code: 'T-REQ02', name: '需求追溯矩阵 (RTM)', phase: 'REQ', owner: '李工', s: '2026-07-25', e: '2026-08-20', progress: 100, status: 'done', parent: 'G-REQ', est: 40 },
    { code: 'T-ARC01', name: '软件架构设计', phase: 'ARC', owner: '李工', s: '2026-08-15', e: '2026-09-30', progress: 80, status: 'doing', critical: true, parent: 'G-ARC', est: 160 },
    { code: 'T-ARC02', name: '接口与组件设计', phase: 'ARC', owner: '王工', s: '2026-09-01', e: '2026-10-10', progress: 60, status: 'doing', parent: 'G-ARC', est: 120 },
    { code: 'T-UNIT01', name: '软件单元实现', phase: 'UNIT', owner: '李工', s: '2026-10-01', e: '2026-11-20', progress: 15, status: 'doing', critical: true, parent: 'G-UNIT', est: 240 },
    { code: 'T-UNIT02', name: '软件单元测试', phase: 'UNIT', owner: '测试组', s: '2026-10-20', e: '2026-12-10', progress: 0, status: 'todo', parent: 'G-UNIT', est: 120 },
    { code: 'T-INT01', name: '软件集成测试', phase: 'INT', owner: '测试组', s: '2026-12-01', e: '2027-01-20', progress: 0, status: 'todo', critical: true, parent: 'G-INT', est: 160 },
    { code: 'T-QUAL01', name: '软件合格测试', phase: 'QUAL', owner: '测试组', s: '2027-01-15', e: '2027-02-20', progress: 0, status: 'todo', critical: true, parent: 'G-QUAL', est: 160 },
    { code: 'T-QUAL02', name: '变更与问题闭环', phase: 'QUAL', owner: '质量部', s: '2027-01-20', e: '2027-03-01', progress: 0, status: 'todo', parent: 'G-QUAL', est: 60 },
  ];
  let seq = 0;
  for (const t of tasks) {
    await pool.query(
      `INSERT INTO plan_tasks ("projectId",code,name,"phaseCode",owner,"startMs","endMs","baseStartMs","baseEndMs",progress,status,critical,deps,"parentCode","isGroup",seq,"estimateHours",tags,assignees,refs,"createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'[]',$13,$14,$15,$16,'[]','[]','[]',$17,$17)`,
      [pid, t.code, t.name, t.phase, t.owner ?? null, D(t.s), D(t.e), D(t.s), D(t.e), t.progress, t.status, t.critical ?? false, t.parent ?? null, t.group ?? false, seq++, t.est ?? null, now],
    );
  }
  type M = { code: string; name: string; type: string; phase: string; d: string; status: string; desc: string; body: string; deliv?: { name: string; done: boolean }[] };
  const ms: M[] = [
    { code: 'M-SYS', name: '系统需求评审', type: 'TR', phase: 'SYS', d: '2026-07-10', status: 'done', desc: '系统需求完整、可追溯至客户需求。', body: '技术评审组' },
    { code: 'M-REQ', name: '软件需求评审', type: 'TR', phase: 'REQ', d: '2026-08-20', status: 'done', desc: '软件需求覆盖系统需求，RTM 建立。', body: '技术评审组' },
    { code: 'M-ARC', name: '架构评审', type: 'TR', phase: 'ARC', d: '2026-10-10', status: 'now', desc: '架构满足需求，接口定义清晰。', body: '技术评审组', deliv: [{ name: '软件架构文档', done: true }, { name: '接口设计', done: false }] },
    { code: 'M-UNIT', name: '单元验证完成', type: 'DCP', phase: 'UNIT', d: '2026-12-10', status: 'todo', desc: '单元实现与单元测试完成。', body: 'ASPICE 评估组' },
    { code: 'M-INT', name: '集成测试完成', type: 'DCP', phase: 'INT', d: '2027-01-20', status: 'todo', desc: '集成测试通过，接口验证完成。', body: 'ASPICE 评估组' },
    { code: 'M-QUAL', name: '合格测试放行', type: 'DCP', phase: 'QUAL', d: '2027-03-01', status: 'todo', desc: '合格测试通过，软件放行。', body: '质量负责人', deliv: [{ name: '合格测试报告', done: false }, { name: '放行批准单', done: false }] },
  ];
  for (const m of ms) {
    await pool.query(
      `INSERT INTO plan_milestones ("projectId",code,name,type,"phaseCode","dateMs",status,description,"milestoneType",deliverables,"decisionBody",refs,"createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'gate',$9::jsonb,$10,'[]',$11,$11)`,
      [pid, m.code, m.name, m.type, m.phase, D(m.d), m.status, m.desc, JSON.stringify(m.deliv ?? []), m.body, now],
    );
  }
  const deps: [string, string][] = [['T-SYS01', 'T-REQ01'], ['T-REQ01', 'T-ARC01'], ['T-ARC01', 'T-UNIT01'], ['T-UNIT01', 'T-INT01'], ['T-INT01', 'T-QUAL01']];
  for (const [f, t] of deps) {
    await pool.query('INSERT INTO plan_dependencies ("projectId","fromCode","toCode",type,"lagMs","createdAt","updatedAt") VALUES ($1,$2,$3,$4,0,$5,$5)', [pid, f, t, 'FS', now]);
  }
  await pool.query("INSERT INTO plan_calendars (\"projectId\",name,\"weekendOff\",holidays,\"updatedAt\") VALUES ($1,'默认日历',true,'[]',$2)", [pid, now]);
  console.log('[seed] tuoleX auto 已补计划中枢演示数据（软件过程 A-SPICE）');
}
