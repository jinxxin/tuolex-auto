import type { WpTemplate } from '../types';

// ============ WP 模板库（工作产品模板）============
// 依据 A-SPICE 3.1 各过程输出工作产品（WP）的结构与最佳实践整理。
// 生成 WP 文档时：text 章节 = 说明/方法/准则（可编辑），entries 章节 = 自动拉取 V 条目中心对应层条目填入。
// 注：模板为教学/演示级结构，正式交付前请按公司质量体系模板修订。

export const WP_TEMPLATES: Omit<WpTemplate, 'id' | 'active'>[] = [
  // ============ SYS.1 需求挖掘 ============
  {
    processCode: 'SYS.1', wpCode: '13-00', title: '用户需求规格（URS）', stdVersion: '3.1',
    intro: '本工作产品定义利益相关方/用户需求（SYS.1 输出），是需求分解的顶层输入：用户需求逐条分解为系统需求（SYS.2），形成完整需求树。',
    sections: [
      { id: 's1', title: '1. 目的与范围', kind: 'text', text: '## 1.1 目的\n描述系统的预期用途、用户群体与业务目标。\n\n## 1.2 范围\n功能范围、使用场景、不包含项。' },
      { id: 's2', title: '2. 用户需求条目', kind: 'entries', entryFilter: { reqType: 'user_req' }, desc: '自动拉取项目全部用户需求条目（UR-REQ-xxx）' },
      { id: 's3', title: '3. 需求分解说明', kind: 'text', text: '每条用户需求应分解为可验证的系统需求（SYS.2），分解关系见追溯矩阵；用户需求与系统需求保持双向追溯。' },
      { id: 's4', title: '4. 验收准则', kind: 'text', text: '- 每条用户需求已分解到至少一条系统需求（双向追溯）\n- 用户需求经利益相关方评审确认（SUP.4）' },
    ],
  },
  // ============ SYS 系统级 ============
  {
    processCode: 'SYS.2', wpCode: '13-04', title: '系统需求规格（SysRS）', stdVersion: '3.1',
    intro: '本工作产品定义系统需求（SYS.2 输出），是系统开发与验证的基线输入。每条系统需求可验证、可追溯，并在追溯矩阵中与软件需求及验证测试关联。',
    sections: [
      { id: 's1', title: '1. 目的与范围', kind: 'text', text: '## 1.1 目的\n描述系统在目标环境中的预期用途与边界。\n\n## 1.2 范围\n覆盖的功能范围、接口范围与不包含项。\n\n## 1.3 引用文件\n- 客户需求 / 招标技术规范\n- 相关标准（ISO 26262、IATF 16949 等）' },
      { id: 's2', title: '2. 用户需求（SYS.1）与系统需求条目', kind: 'entries', entryFilter: { reqType: ['user_req', 'sys_req', 'hw_req'] }, desc: '自动拉取用户需求（UR-REQ-xxx）、系统需求（SYS-REQ-xxx）与硬件需求（HW-REQ-xxx）条目' },
      { id: 's3', title: '3. 追溯矩阵（需求 → 软/硬件需求/测试）', kind: 'entries', entryFilter: { reqType: ['user_req', 'sys_req'] }, desc: '需求的追溯关系见追溯矩阵（每条系统需求应至少细化到软件需求或被测试覆盖）' },
      { id: 's4', title: '4. 验收准则', kind: 'text', text: '- 每条系统需求在追溯矩阵中有软件需求或测试用例覆盖（双向追溯）\n- 系统合格性测试（SYS.5）全部通过，无未关闭问题\n- 需求变更均经变更请求管理（SUP.9）' },
    ],
  },
  {
    processCode: 'SYS.3', wpCode: '13-08', title: '系统架构设计', stdVersion: '3.1',
    intro: '本工作产品定义系统架构（SYS.3 输出）：系统元素及其职责、接口与交互，将系统需求分配到系统元素。',
    sections: [
      { id: 's1', title: '1. 架构概述', kind: 'text', text: '## 1.1 架构视图\n描述系统级架构（硬件/软件/机械/人机接口划分）。\n\n## 1.2 设计约束\n成本、功耗、尺寸、法规、ASIL 等级等约束。' },
      { id: 's2', title: '2. 系统架构元素', kind: 'entries', entryFilter: { reqType: 'sys_arch' }, desc: '自动拉取系统架构元素条目（SYS-ARCH-xxx）' },
      { id: 's3', title: '3. 接口与交互', kind: 'text', text: '定义系统元素间接口（信号/协议/时序）与外部接口（传感器/执行器/整车）。\n\n## 评审要求\n架构设计须经联合评审（SUP.4）并记录评审结论与行动项。' },
      { id: 's4', title: '4. 追溯（架构 → 系统需求）', kind: 'entries', entryFilter: { reqType: 'sys_arch' }, desc: '每个架构元素应追溯到其实现的系统需求' },
    ],
  },
  {
    processCode: 'SYS.4', wpCode: '13-10', title: '系统集成测试计划', stdVersion: '3.1',
    intro: '本工作产品定义系统集成策略与集成测试计划（SYS.4 输出）。',
    sections: [
      { id: 's1', title: '1. 集成策略', kind: 'text', text: '集成顺序（自底向上/增量）、集成环境、准出准则。' },
      { id: 's2', title: '2. 集成测试用例', kind: 'entries', entryFilter: { tcPrefix: 'SIT' }, desc: '自动拉取系统集成测试用例（TC-SIT-xxx）' },
      { id: 's3', title: '3. 回归策略', kind: 'text', text: '变更后的回归测试范围与执行准则。' },
    ],
  },
  {
    processCode: 'SYS.5', wpCode: '13-18', title: '系统合格性测试计划', stdVersion: '3.1',
    intro: '本工作产品定义系统合格性测试策略与计划（SYS.5 输出），验证系统满足系统需求。',
    sections: [
      { id: 's1', title: '1. 测试策略', kind: 'text', text: '测试环境（整车在环/场地/道路）、场景库、验收准则。' },
      { id: 's2', title: '2. 合格性测试用例', kind: 'entries', entryFilter: { tcPrefix: 'SQT' }, desc: '自动拉取系统合格性测试用例（TC-SQT-xxx）' },
      { id: 's3', title: '3. 结论与放行准则', kind: 'text', text: '全部用例通过、无未关闭问题、残余风险可接受方可放行。' },
    ],
  },

  // ============ SWE 软件级 ============
  {
    processCode: 'SWE.1', wpCode: '17-04', title: '软件需求规格（SwRS）', stdVersion: '3.1',
    intro: '本工作产品定义软件需求（SWE.1 输出）：由系统需求分配而来，可验证、可实现，并与系统需求建立双向追溯。',
    sections: [
      { id: 's1', title: '1. 目的与范围', kind: 'text', text: '## 1.1 目的\n定义软件需求基线。\n\n## 1.2 范围\n软件子系统边界、运行环境（硬件/OS/中间件）。\n\n## 1.3 引用文件\n- 系统需求规格（SysRS）\n- 系统架构设计' },
      { id: 's2', title: '2. 软件需求条目', kind: 'entries', entryFilter: { reqType: 'sw_req' }, desc: '自动拉取项目全部软件需求条目（SW-REQ-xxx）' },
      { id: 's3', title: '3. 追溯矩阵', kind: 'entries', entryFilter: { reqType: 'sw_req' }, desc: '软件需求 ↔ 系统需求（细化/分配）↔ 测试用例（验证覆盖）' },
      { id: 's4', title: '4. 验收准则', kind: 'text', text: '- 每条软件需求可验证并定义验证方法\n- 需求评审（SUP.4）通过，行动项关闭\n- 需求变更经变更请求管理（SUP.9）' },
    ],
  },
  {
    processCode: 'SWE.2', wpCode: '17-08', title: '软件架构设计', stdVersion: '3.1',
    intro: '本工作产品定义软件架构（SWE.2 输出）：软件元素、职责、接口与交互，将软件需求分配到软件元素。',
    sections: [
      { id: 's1', title: '1. 架构概述', kind: 'text', text: '## 1.1 架构风格与分层\n模块化/分层/组件化说明。\n\n## 1.2 设计约束\n资源（内存/CPU）、实时性、安全相关约束（ASIL）。' },
      { id: 's2', title: '2. 软件架构元素', kind: 'entries', entryFilter: { reqType: 'sw_arch' }, desc: '自动拉取软件架构元素条目（SW-ARCH-xxx）' },
      { id: 's3', title: '3. 接口定义', kind: 'text', text: '定义软件元素间接口（函数/消息/数据接口）与外部接口（硬件抽象/通信）。\n\n## 评审要求\n架构设计须经联合评审（SUP.4），评审记录作为过程证据。' },
      { id: 's4', title: '4. 追溯（架构 → 软件需求）', kind: 'entries', entryFilter: { reqType: 'sw_arch' }, desc: '每个软件架构元素应追溯到其实现的软件需求' },
    ],
  },
  {
    processCode: 'SWE.3', wpCode: '17-10', title: '软件详细设计', stdVersion: '3.1',
    intro: '本工作产品定义软件单元级详细设计（SWE.3 输出）：算法、数据结构、接口与设计约束。',
    sections: [
      { id: 's1', title: '1. 设计概述', kind: 'text', text: '详细设计方法（结构化/面向对象）、设计准则（编码规范、可测试性）。' },
      { id: 's2', title: '2. 详细设计条目', kind: 'entries', entryFilter: { reqType: 'dd' }, desc: '自动拉取详细设计条目（DD-xxx）' },
      { id: 's3', title: '3. 软件单元清单', kind: 'entries', entryFilter: { reqType: 'unit' }, desc: '自动拉取软件单元条目（UNIT-xxx）' },
      { id: 's4', title: '4. 开发任务清单（不含代码实现）', kind: 'entries', entryFilter: { reqType: 'task' }, desc: '自动拉取任务条目（TASK-xxx，SWE.3 分解的开发任务）' },
      { id: 's5', title: '5. 设计约束与验证要求', kind: 'text', text: '- 单元应可独立验证（SWE.4）\n- 静态分析/代码规范检查结果作为证据\n- 开发任务闭合（TASK 状态=已完成）后方可进入单元验证' },
    ],
  },
  {
    processCode: 'SWE.4', wpCode: '17-16', title: '软件单元验证计划', stdVersion: '3.1',
    intro: '本工作产品定义软件单元验证方法、用例与准则（SWE.4 输出）。',
    sections: [
      { id: 's1', title: '1. 验证方法', kind: 'text', text: '单元测试（覆盖率要求）、静态分析、代码评审的组合策略。\n\n## 覆盖要求\n语句/分支覆盖率目标（如 ≥ 80%），MC/DC（安全相关）。' },
      { id: 's2', title: '2. 单元验证用例', kind: 'entries', entryFilter: { tcPrefix: 'UNIT' }, desc: '自动拉取单元验证测试用例（TC-UNIT-xxx）' },
      { id: 's3', title: '3. 准出准则', kind: 'text', text: '全部用例通过或偏差已评估；覆盖率达标；未关闭问题登记 SUP.8。' },
    ],
  },
  {
    processCode: 'SWE.5', wpCode: '17-20', title: '软件集成测试计划', stdVersion: '3.1',
    intro: '本工作产品定义软件集成策略与集成测试计划（SWE.5 输出）。',
    sections: [
      { id: 's1', title: '1. 集成策略', kind: 'text', text: '集成顺序（自底向上/大爆炸/持续集成）、构建环境、准出准则。' },
      { id: 's2', title: '2. 集成测试用例', kind: 'entries', entryFilter: { tcPrefix: 'IT' }, desc: '自动拉取软件集成测试用例（TC-IT-xxx）' },
      { id: 's3', title: '3. 回归策略', kind: 'text', text: '变更/缺陷修复后的回归测试范围。' },
    ],
  },
  {
    processCode: 'SWE.6', wpCode: '17-26', title: '软件合格性测试计划', stdVersion: '3.1',
    intro: '本工作产品定义软件合格性测试策略与计划（SWE.6 输出），在目标环境验证软件满足软件需求。',
    sections: [
      { id: 's1', title: '1. 测试策略', kind: 'text', text: '目标/模拟环境、测试数据、场景设计、验收准则。' },
      { id: 's2', title: '2. 合格性测试用例', kind: 'entries', entryFilter: { tcPrefix: 'QT' }, desc: '自动拉取软件合格性测试用例（TC-QT-xxx）' },
      { id: 's3', title: '3. 结论与放行准则', kind: 'text', text: '全部通过、无未关闭问题、与系统需求/软件需求双向追溯完整。' },
    ],
  },

  // ============ SUP 支持级 ============
  {
    processCode: 'SUP.1', wpCode: '08-04', title: '质量保证计划（QA Plan）', stdVersion: '3.1',
    intro: '本工作产品定义质量保证活动（SUP.1 输出）：QA 检查范围、活动安排与报告机制。',
    sections: [
      { id: 's1', title: '1. QA 范围与准则', kind: 'text', text: '- 过程符合性检查（对照项目过程范围）\n- 工作产品抽查（需求/设计/测试文档）\n- 不符合项登记与升级机制' },
      { id: 's2', title: '2. QA 活动计划', kind: 'text', text: '| 检查项 | 频率 | 负责人 |\n| --- | --- | --- |\n| 过程执行抽查 | 每里程碑 | QA |\n| 工作产品评审 | 每阶段 | QA |\n| 不符合项跟踪 | 每周 | QA |' },
      { id: 's3', title: '3. 报告机制', kind: 'text', text: 'QA 结果定期向项目管理（MAN.3）汇报；重大不符合项升级至管理层。' },
    ],
  },
  {
    processCode: 'SUP.4', wpCode: '08-46', title: '联合评审记录（Review Record）', stdVersion: '3.1',
    intro: '本工作产品记录联合评审（SUP.4）的结论与行动项，是过程证据的重要组成部分。',
    sections: [
      { id: 's1', title: '1. 评审信息', kind: 'text', text: '- 评审对象（工作产品/过程）\n- 评审日期与参加人（利益相关方）\n- 评审方式（会议/会签）' },
      { id: 's2', title: '2. 评审结论与行动项', kind: 'text', text: '| 编号 | 发现项 | 决议 | 责任人 | 截止 | 状态 |\n| --- | --- | --- | --- | --- | --- |\n|  |  |  |  |  |  |' },
      { id: 's3', title: '3. 行动项跟踪', kind: 'text', text: '行动项须跟踪至关闭，关闭记录作为下次评审输入。' },
    ],
  },
  {
    processCode: 'SUP.7', wpCode: '09-04', title: '配置管理计划（CM Plan）', stdVersion: '3.1',
    intro: '本工作产品定义配置管理策略（SUP.7 输出）：配置项、命名规则、基线策略与变更受控。',
    sections: [
      { id: 's1', title: '1. 配置管理策略', kind: 'text', text: '- 配置项识别（文档/源码/工具链/测试环境）\n- 命名与版本规则\n- 基线建立（需求基线/设计基线/发布基线）' },
      { id: 's2', title: '2. 变更与发布控制', kind: 'text', text: '- 配置项变更走变更请求管理（SUP.9）\n- 发布（SPL.2）前配置审计\n- 配置状态报告（定期）' },
    ],
  },
  {
    processCode: 'SUP.8', wpCode: '09-22', title: '问题报告（Problem Report）', stdVersion: '3.1',
    intro: '本工作产品记录问题（SUP.8 输出）：问题描述、根因分析、解决方案与关闭证据。',
    sections: [
      { id: 's1', title: '1. 问题描述', kind: 'text', text: '- 问题编号/发现人/发现阶段\n- 现象与复现步骤\n- 影响范围评估（严重度/优先级）' },
      { id: 's2', title: '2. 根因分析与解决方案', kind: 'text', text: '- 根因（5-Why / 鱼骨图）\n- 解决方案与验证结果\n- 关联变更请求（如需要走 SUP.9）' },
      { id: 's3', title: '3. 关闭准则', kind: 'text', text: '解决方案经验证有效、回归通过、状态经审批后关闭。' },
    ],
  },
  {
    processCode: 'SUP.9', wpCode: '09-30', title: '变更请求记录（Change Request）', stdVersion: '3.1',
    intro: '本工作产品记录变更请求（SUP.9 输出）：变更描述、影响分析、审批与实施跟踪。',
    sections: [
      { id: 's1', title: '1. 变更描述', kind: 'text', text: '- 变更请求编号/提出人/日期\n- 变更内容与动机\n- 关联需求/配置项（追溯链）' },
      { id: 's2', title: '2. 影响分析', kind: 'text', text: '- 受影响条目（走追溯图上下游：需求/设计/测试）\n- 风险与工作量评估\n- 是否需要补充验证/回归' },
      { id: 's3', title: '3. 审批与实施', kind: 'text', text: '- 评审结论（批准/拒绝）与批准人电子签名\n- 实施计划与验证结果\n- 变更状态跟踪至关闭' },
    ],
  },

  // ============ MAN 管理级 ============
  {
    processCode: 'MAN.3', wpCode: '04-04', title: '项目计划（Project Plan）', stdVersion: '3.1',
    intro: '本工作产品定义项目计划（MAN.3 输出）：范围、WBS、进度、资源与里程碑。',
    sections: [
      { id: 's1', title: '1. 项目范围与目标', kind: 'text', text: '- 项目目标与验收准则\n- 范围（含过程范围：SYS/SWE/SUP/MAN）\n- 假设与约束' },
      { id: 's2', title: '2. 进度与里程碑', kind: 'text', text: '| 里程碑 | 交付物 | 计划日期 | 状态 |\n| --- | --- | --- | --- |\n| 需求基线 | SysRS/SwRS |  |  |\n| 设计基线 | 架构/详细设计 |  |  |\n| 测试完成 | 测试报告 |  |  |\n| 发布 | 发布记录 |  |  |' },
      { id: 's3', title: '3. 资源与风险', kind: 'text', text: '人员职责（RACI）、工具链、风险摘要（详见 MAN.5 风险登记册）。' },
    ],
  },
  {
    processCode: 'MAN.5', wpCode: '04-32', title: '项目风险登记册（Risk Register）', stdVersion: '3.1',
    intro: '本工作产品登记项目风险（MAN.5 输出）：风险识别、分析、应对与状态跟踪。',
    sections: [
      { id: 's1', title: '1. 风险管理策略', kind: 'text', text: '风险准则（可能性×影响）、评估方法、应对策略（规避/缓解/转移/接受）。' },
      { id: 's2', title: '2. 风险条目', kind: 'entries', entryFilter: { fmea: true }, desc: '自动拉取项目 FMEA 风险条目（含 S/O/D/RPN）' },
      { id: 's3', title: '3. 风险状态跟踪', kind: 'text', text: '| 风险 | 等级 | 应对措施 | 责任人 | 状态 |\n| --- | --- | --- | --- | --- |\n|  |  |  |  |  |' },
    ],
  },
  {
    processCode: 'MAN.6', wpCode: '04-42', title: '度量报告（Measurement Report）', stdVersion: '3.1',
    intro: '本工作产品汇总过程与产品度量（MAN.6 输出），支持项目管理决策与过程改进。',
    sections: [
      { id: 's1', title: '1. 度量项定义', kind: 'text', text: '| 度量项 | 公式 | 数据源 | 目标 |\n| --- | --- | --- | --- |\n| 需求覆盖率 | 已覆盖/总数 | 追溯矩阵 | 100% |\n| 缺陷密度 | 缺陷/千行 | 问题记录 | ≤ X |\n| 测试通过率 | 通过/执行 | 测试记录 | ≥ 95% |\n| 进度偏差 | 计划-实际 | 项目计划 | ≤ 10% |' },
      { id: 's2', title: '2. 度量结果与趋势', kind: 'text', text: '采集本期数据，绘制趋势图并分析异常（过程改进输入 PIM.3）。' },
    ],
  },
];

// 按过程分组索引（供 UI 使用）
export const WP_TEMPLATES_BY_PROCESS = WP_TEMPLATES.reduce<Record<string, Omit<WpTemplate, 'id' | 'active'>[]>>((acc, t) => {
  (acc[t.processCode] = acc[t.processCode] || []).push(t);
  return acc;
}, {});
