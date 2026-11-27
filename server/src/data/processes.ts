// 类型内联（后端独立编译）
type P = { id?: number; code: string; name: string; nameZh: string; groupCode: string; stdVersion: '3.1' | '4.0'; purpose: string; bps: { id: string; name: string; desc: string }[]; wps: { id: string; name: string; desc: string }[]; active?: boolean; only40?: boolean };

// ============ A-SPICE 过程参考模型（PRM）种子数据 ============
// 依据：VDA Automotive SPICE 3.1（PAM 2017，32 过程）+ 4.0（PAM 2023，45 过程）公开资料
// 注意：BP（基础实践）/WP（工作产品）为教学/演示级整理，正式商业使用请以 VDA QMC 官方 PAM 文档为准核对。
// 结构：3.1 全部 32 过程（含 BP/WP）；4.0 新增/语义变更的过程以 stdVersion='4.0' 单独存储，可切换。



export const ASPICE_PROCESSES_31: P[] = [
  // ============ SYS 系统级 ============
  {
    code: 'SYS.1', name: 'Requirements Elicitation', nameZh: '需求挖掘', groupCode: 'SYS', stdVersion: '3.1',
    purpose: '收集、挖掘并跟踪利益相关方的需求与期望，建立用户/系统需求基线，作为系统开发与验证的输入。',
    bps: [
      { id: 'SYS.1.BP1', name: 'Identify stakeholders', desc: '识别项目相关利益相关方及其对系统的期望' },
      { id: 'SYS.1.BP2', name: 'Elicit stakeholder requirements', desc: '通过访谈/评审/原型等方式持续挖掘并跟踪需求' },
      { id: 'SYS.1.BP3', name: 'Define system requirements', desc: '将利益相关方需求转化为系统需求（含约束条件）' },
      { id: 'SYS.1.BP4', name: 'Analyze requirements', desc: '分析需求的完整性、一致性、可行性与可验证性' },
      { id: 'SYS.1.BP5', name: 'Structure requirements', desc: '对需求进行分类、唯一标识并建立层级结构' },
      { id: 'SYS.1.BP6', name: 'Communicate requirements', desc: '与利益相关方沟通并达成需求共识' },
    ],
    wps: [
      { id: '13-00', name: 'Stakeholder Requirements', desc: '利益相关方需求清单' },
      { id: '13-04', name: 'System Requirements', desc: '系统需求集合（初始）' },
      { id: '13-50', name: 'Communication Records', desc: '需求沟通/评审记录' },
    ],
  },
  {
    code: 'SYS.2', name: 'System Requirements Analysis', nameZh: '系统需求分析', groupCode: 'SYS', stdVersion: '3.1',
    purpose: '将利益相关方需求转换为技术系统需求集，确保需求可验证、可实现并建立双向可追溯性。',
    bps: [
      { id: 'SYS.2.BP1', name: 'Specify system requirements', desc: '指定可验证、无歧义、原子化的系统需求（唯一标识）' },
      { id: 'SYS.2.BP2', name: 'Structure system requirements', desc: '对系统需求结构化组织并分配优先级' },
      { id: 'SYS.2.BP3', name: 'Analyze system requirements', desc: '分析需求的技术可行性、完整性、一致性' },
      { id: 'SYS.2.BP4', name: 'Analyze impact on operating environment', desc: '分析系统需求对运行环境（接口/硬件/人机）的影响' },
      { id: 'SYS.2.BP5', name: 'Ensure verifiability', desc: '确保每条系统需求可验证（定义验证方法）' },
      { id: 'SYS.2.BP6', name: 'Establish bidirectional traceability', desc: '建立系统需求与利益相关方需求的双向追溯' },
      { id: 'SYS.2.BP7', name: 'Ensure consistency', desc: '确保系统需求之间及与利益相关方需求的一致性' },
      { id: 'SYS.2.BP8', name: 'Communicate system requirements', desc: '向受影响方沟通系统需求并达成共识' },
    ],
    wps: [
      { id: '13-04', name: 'System Requirements Specification (SysRS)', desc: '系统需求规格说明书' },
      { id: '13-50', name: 'Communication Records', desc: '需求沟通记录' },
      { id: '15-50', name: 'Traceability Matrix', desc: '需求追溯矩阵' },
      { id: '13-52', name: 'Review Records', desc: '需求评审记录' },
    ],
  },
  {
    code: 'SYS.3', name: 'System Architectural Design', nameZh: '系统架构设计', groupCode: 'SYS', stdVersion: '3.1',
    purpose: '建立系统架构，将系统需求分配到系统元素（硬件/软件/机械/人机接口），定义接口与交互。',
    bps: [
      { id: 'SYS.3.BP1', name: 'Describe system architecture', desc: '描述系统架构（系统元素、职责、接口、交互）' },
      { id: 'SYS.3.BP2', name: 'Define responsibilities', desc: '定义每个系统元素的职责' },
      { id: 'SYS.3.BP3', name: 'Define interfaces', desc: '定义系统元素间的接口（内外）' },
      { id: 'SYS.3.BP4', name: 'Refine architecture', desc: '逐级细化系统架构到可分配粒度' },
      { id: 'SYS.3.BP5', name: 'Analyze architecture', desc: '分析架构的静态/动态行为、可行性、可测试性' },
      { id: 'SYS.3.BP6', name: 'Establish bidirectional traceability', desc: '建立系统架构与系统需求的双向追溯' },
      { id: 'SYS.3.BP7', name: 'Ensure consistency', desc: '确保架构设计与需求、元素间的一致性' },
      { id: 'SYS.3.BP8', name: 'Communicate architecture', desc: '向受影响方沟通架构设计' },
    ],
    wps: [
      { id: '13-08', name: 'System Architectural Design', desc: '系统架构设计文档' },
      { id: '15-50', name: 'Traceability Matrix', desc: '架构-需求追溯矩阵' },
      { id: '13-52', name: 'Review Records', desc: '架构评审记录' },
    ],
  },
  {
    code: 'SYS.4', name: 'System Integration and Integration Test', nameZh: '系统集成与集成测试', groupCode: 'SYS', stdVersion: '3.1',
    purpose: '按集成策略将系统元素集成为完整系统，验证系统元素间的交互是否满足架构设计与系统需求。',
    bps: [
      { id: 'SYS.4.BP1', name: 'Specify integration strategy', desc: '制定系统集成策略（顺序/环境/准则）' },
      { id: 'SYS.4.BP2', name: 'Specify integration test strategy', desc: '制定集成测试策略（含回归测试）' },
      { id: 'SYS.4.BP3', name: 'Specify integration test cases', desc: '设计集成测试用例（基于架构交互）' },
      { id: 'SYS.4.BP4', name: 'Execute integration tests', desc: '按计划执行集成与集成测试，记录结果' },
      { id: 'SYS.4.BP5', name: 'Establish bidirectional traceability', desc: '建立集成测试用例与架构/需求的双向追溯' },
      { id: 'SYS.4.BP6', name: 'Summarize results', desc: '汇总集成测试结果并评估是否符合验收准则' },
      { id: 'SYS.4.BP7', name: 'Ensure consistency', desc: '确保集成测试与架构、需求的一致性' },
    ],
    wps: [
      { id: '13-10', name: 'System Integration Test Plan', desc: '系统集成测试计划' },
      { id: '13-14', name: 'System Integration Test Report', desc: '系统集成测试报告' },
      { id: '15-50', name: 'Traceability Matrix', desc: '追溯矩阵' },
    ],
  },
  {
    code: 'SYS.5', name: 'System Qualification Test', nameZh: '系统合格性测试', groupCode: 'SYS', stdVersion: '3.1',
    purpose: '在目标/模拟环境中验证完整系统满足系统需求，提供系统合格性证据。',
    bps: [
      { id: 'SYS.5.BP1', name: 'Specify qualification test strategy', desc: '制定合格性测试策略（含回归与验收准则）' },
      { id: 'SYS.5.BP2', name: 'Specify qualification test cases', desc: '设计合格性测试用例（覆盖系统需求）' },
      { id: 'SYS.5.BP3', name: 'Execute qualification tests', desc: '执行合格性测试并记录结果' },
      { id: 'SYS.5.BP4', name: 'Establish bidirectional traceability', desc: '建立测试用例与系统需求的双向追溯' },
      { id: 'SYS.5.BP5', name: 'Summarize results', desc: '汇总测试结果，评估系统合格性' },
      { id: 'SYS.5.BP6', name: 'Ensure consistency', desc: '确保测试与需求一致性' },
    ],
    wps: [
      { id: '13-18', name: 'System Qualification Test Plan', desc: '系统合格性测试计划' },
      { id: '13-22', name: 'System Qualification Test Report', desc: '系统合格性测试报告' },
      { id: '15-50', name: 'Traceability Matrix', desc: '追溯矩阵' },
    ],
  },

  // ============ SWE 软件级 ============
  {
    code: 'SWE.1', name: 'Software Requirements Analysis', nameZh: '软件需求分析', groupCode: 'SWE', stdVersion: '3.1',
    purpose: '将系统需求中分配给软件的部分转换为软件需求集，确保可验证、可实现并建立双向可追溯性。',
    bps: [
      { id: 'SWE.1.BP1', name: 'Specify software requirements', desc: '指定可验证、无歧义、原子化的软件需求（唯一标识）' },
      { id: 'SWE.1.BP2', name: 'Structure software requirements', desc: '结构化组织软件需求并分配优先级' },
      { id: 'SWE.1.BP3', name: 'Analyze software requirements', desc: '分析软件需求的技术可行性、完整性、一致性' },
      { id: 'SWE.1.BP4', name: 'Analyze impact on operating environment', desc: '分析软件需求对运行环境（硬件/接口/时序）的影响' },
      { id: 'SWE.1.BP5', name: 'Verify software requirements', desc: '确保每条软件需求可验证（定义验证方法）' },
      { id: 'SWE.1.BP6', name: 'Establish bidirectional traceability', desc: '建立软件需求与系统需求的双向追溯' },
      { id: 'SWE.1.BP7', name: 'Ensure consistency', desc: '确保软件需求间及与系统需求的一致性' },
      { id: 'SWE.1.BP8', name: 'Communicate software requirements', desc: '向受影响方沟通软件需求并达成共识' },
    ],
    wps: [
      { id: '17-04', name: 'Software Requirements Specification (SwRS)', desc: '软件需求规格说明书' },
      { id: '15-50', name: 'Traceability Matrix', desc: '需求追溯矩阵' },
      { id: '13-52', name: 'Review Records', desc: '需求评审记录' },
    ],
  },
  {
    code: 'SWE.2', name: 'Software Architectural Design', nameZh: '软件架构设计', groupCode: 'SWE', stdVersion: '3.1',
    purpose: '建立软件架构，将软件需求分配到软件元素，定义接口与交互，支持可测试性与可维护性。',
    bps: [
      { id: 'SWE.2.BP1', name: 'Describe software architecture', desc: '描述软件架构（元素、职责、接口、交互）' },
      { id: 'SWE.2.BP2', name: 'Define responsibilities', desc: '定义每个软件元素的职责' },
      { id: 'SWE.2.BP3', name: 'Define interfaces', desc: '定义软件元素间的接口（内外）' },
      { id: 'SWE.2.BP4', name: 'Refine software architecture', desc: '逐级细化软件架构到单元可分配粒度' },
      { id: 'SWE.2.BP5', name: 'Analyze software architecture', desc: '分析架构可行性（静态/动态/时序/资源）' },
      { id: 'SWE.2.BP6', name: 'Establish bidirectional traceability', desc: '建立软件架构与软件需求的双向追溯' },
      { id: 'SWE.2.BP7', name: 'Ensure consistency', desc: '确保架构设计与需求、元素间一致性' },
      { id: 'SWE.2.BP8', name: 'Communicate software architecture', desc: '向受影响方沟通架构设计' },
    ],
    wps: [
      { id: '17-08', name: 'Software Architectural Design', desc: '软件架构设计文档' },
      { id: '15-50', name: 'Traceability Matrix', desc: '架构-需求追溯矩阵' },
      { id: '13-52', name: 'Review Records', desc: '架构评审记录' },
    ],
  },
  {
    code: 'SWE.3', name: 'Software Detailed Design and Unit Construction', nameZh: '软件详细设计与单元构建', groupCode: 'SWE', stdVersion: '3.1',
    purpose: '细化软件架构到软件单元级别，完成单元详细设计并实现（编码），建立单元级追溯。',
    bps: [
      { id: 'SWE.3.BP1', name: 'Specify detailed design', desc: '细化设计每个软件单元（算法/数据结构/接口）' },
      { id: 'SWE.3.BP2', name: 'Develop software units', desc: '实现软件单元（编码、静态检查）' },
      { id: 'SWE.3.BP3', name: 'Establish traceability', desc: '建立单元与架构/需求的双向追溯' },
      { id: 'SWE.3.BP4', name: 'Ensure consistency', desc: '确保详细设计与架构、单元实现的一致性' },
      { id: 'SWE.3.BP5', name: 'Communicate detailed design', desc: '沟通详细设计给相关方' },
    ],
    wps: [
      { id: '17-10', name: 'Software Detailed Design', desc: '软件详细设计文档' },
      { id: '17-12', name: 'Software Units (Source Code)', desc: '软件单元源代码' },
      { id: '17-14', name: 'Static Analysis Results', desc: '静态分析结果' },
    ],
  },
  {
    code: 'SWE.4', name: 'Software Unit Verification', nameZh: '软件单元验证', groupCode: 'SWE', stdVersion: '3.1',
    purpose: '验证软件单元满足详细设计与需求，包括单元测试与静态验证，提供单元级质量证据。',
    bps: [
      { id: 'SWE.4.BP1', name: 'Specify unit verification methods', desc: '定义单元验证方法（测试/评审/静态分析）' },
      { id: 'SWE.4.BP2', name: 'Specify unit verification cases', desc: '设计单元验证用例（含边界/异常输入）' },
      { id: 'SWE.4.BP3', name: 'Execute unit verification', desc: '执行单元验证并记录结果' },
      { id: 'SWE.4.BP4', name: 'Establish traceability', desc: '建立验证结果与单元、设计元素的追溯' },
      { id: 'SWE.4.BP5', name: 'Summarize unit verification results', desc: '汇总验证结果，评估单元符合性' },
      { id: 'SWE.4.BP6', name: 'Establish bidirectional traceability', desc: '建立单元与验证用例的双向追溯' },
      { id: 'SWE.4.BP7', name: 'Ensure consistency', desc: '确保验证活动与设计的一致性' },
    ],
    wps: [
      { id: '17-16', name: 'Software Unit Verification Plan', desc: '单元验证计划' },
      { id: '17-18', name: 'Software Unit Verification Report', desc: '单元验证报告' },
      { id: '15-50', name: 'Traceability Matrix', desc: '追溯矩阵' },
    ],
  },
  {
    code: 'SWE.5', name: 'Software Integration and Integration Test', nameZh: '软件集成与集成测试', groupCode: 'SWE', stdVersion: '3.1',
    purpose: '按集成策略将软件单元集成为软件组件/完整软件，验证元素间交互满足架构设计。',
    bps: [
      { id: 'SWE.5.BP1', name: 'Specify software integration strategy', desc: '制定软件集成策略（顺序/环境/准则）' },
      { id: 'SWE.5.BP2', name: 'Specify integration test strategy', desc: '制定集成测试策略（含回归）' },
      { id: 'SWE.5.BP3', name: 'Specify integration test cases', desc: '设计集成测试用例（基于架构交互）' },
      { id: 'SWE.5.BP4', name: 'Execute integration tests', desc: '执行集成与集成测试，记录结果' },
      { id: 'SWE.5.BP5', name: 'Establish bidirectional traceability', desc: '建立集成测试与架构/需求的双向追溯' },
      { id: 'SWE.5.BP6', name: 'Summarize results', desc: '汇总集成测试结果' },
      { id: 'SWE.5.BP7', name: 'Ensure consistency', desc: '确保集成测试与架构、需求的一致性' },
    ],
    wps: [
      { id: '17-20', name: 'Software Integration Test Plan', desc: '软件集成测试计划' },
      { id: '17-24', name: 'Software Integration Test Report', desc: '软件集成测试报告' },
      { id: '15-50', name: 'Traceability Matrix', desc: '追溯矩阵' },
    ],
  },
  {
    code: 'SWE.6', name: 'Software Qualification Test', nameZh: '软件合格性测试', groupCode: 'SWE', stdVersion: '3.1',
    purpose: '在目标/模拟环境中验证完整软件满足软件需求，提供软件合格性证据。',
    bps: [
      { id: 'SWE.6.BP1', name: 'Specify qualification test strategy', desc: '制定合格性测试策略（含回归与验收准则）' },
      { id: 'SWE.6.BP2', name: 'Specify qualification test cases', desc: '设计合格性测试用例（覆盖软件需求）' },
      { id: 'SWE.6.BP3', name: 'Execute qualification tests', desc: '执行合格性测试并记录结果' },
      { id: 'SWE.6.BP4', name: 'Establish bidirectional traceability', desc: '建立测试用例与软件需求的双向追溯' },
      { id: 'SWE.6.BP5', name: 'Summarize results', desc: '汇总测试结果，评估软件合格性' },
      { id: 'SWE.6.BP6', name: 'Ensure consistency', desc: '确保测试与需求一致性' },
    ],
    wps: [
      { id: '17-26', name: 'Software Qualification Test Plan', desc: '软件合格性测试计划' },
      { id: '17-28', name: 'Software Qualification Test Report', desc: '软件合格性测试报告' },
      { id: '15-50', name: 'Traceability Matrix', desc: '追溯矩阵' },
    ],
  },

  // ============ SUP 支持级 ============
  {
    code: 'SUP.1', name: 'Quality Assurance', nameZh: '质量保证', groupCode: 'SUP', stdVersion: '3.1',
    purpose: '提供独立的质量保证，确保工作产品与过程符合既定计划与要求，及时识别并报告偏差。',
    bps: [
      { id: 'SUP.1.BP1', name: 'Develop QA plan', desc: '制定质量保证计划（范围/活动/准则）' },
      { id: 'SUP.1.BP2', name: 'Coordinate QA activities', desc: '协调 QA 活动与项目计划' },
      { id: 'SUP.1.BP3', name: 'Execute QA activities', desc: '执行质量保证活动（过程/产品检查）' },
      { id: 'SUP.1.BP4', name: 'Identify deviations', desc: '识别过程与产品偏差并沟通' },
      { id: 'SUP.1.BP5', name: 'Ensure compliance', desc: '确保活动与计划、要求一致' },
      { id: 'SUP.1.BP6', name: 'Record QA activities', desc: '记录质量保证活动与结果' },
      { id: 'SUP.1.BP7', name: 'Report results', desc: '向管理层报告 QA 结果' },
    ],
    wps: [
      { id: '08-04', name: 'Quality Assurance Plan', desc: '质量保证计划' },
      { id: '08-06', name: 'Quality Assurance Report', desc: '质量保证报告' },
      { id: '08-10', name: 'Non-compliance Records', desc: '不符合项记录' },
    ],
  },
  {
    code: 'SUP.2', name: 'Verification', nameZh: '验证', groupCode: 'SUP', stdVersion: '3.1',
    purpose: '提供独立验证，确认工作产品满足其指定要求（评审/测试/分析等方式）。',
    bps: [
      { id: 'SUP.2.BP1', name: 'Develop verification strategy', desc: '制定验证策略（验证项/方法/环境）' },
      { id: 'SUP.2.BP2', name: 'Establish verification environment', desc: '建立并维护验证环境' },
      { id: 'SUP.2.BP3', name: 'Perform verification', desc: '执行验证活动' },
      { id: 'SUP.2.BP4', name: 'Record verification results', desc: '记录验证结果' },
      { id: 'SUP.2.BP5', name: 'Analyze verification results', desc: '分析结果与预期的符合性' },
      { id: 'SUP.2.BP6', name: 'Communicate results', desc: '沟通验证结果与纠正需求' },
    ],
    wps: [
      { id: '08-30', name: 'Verification Plan', desc: '验证计划' },
      { id: '08-32', name: 'Verification Results', desc: '验证结果报告' },
    ],
  },
  {
    code: 'SUP.4', name: 'Joint Review', nameZh: '联合评审', groupCode: 'SUP', stdVersion: '3.1',
    purpose: '在项目各阶段开展联合评审，确保利益相关方对工作产品的共识，识别并解决分歧。',
    bps: [
      { id: 'SUP.4.BP1', name: 'Define review scope', desc: '定义评审范围与形式（时间/参加人/议程）' },
      { id: 'SUP.4.BP2', name: 'Prepare review', desc: '准备评审材料并分发' },
      { id: 'SUP.4.BP3', name: 'Execute review', desc: '组织评审，利益相关方参与并决策' },
      { id: 'SUP.4.BP4', name: 'Record results', desc: '记录评审结果（决议/行动项/问题）' },
      { id: 'SUP.4.BP5', name: 'Track action items', desc: '跟踪行动项直至关闭' },
      { id: 'SUP.4.BP6', name: 'Communicate results', desc: '向受影响方沟通评审结果' },
    ],
    wps: [
      { id: '08-44', name: 'Review Plan', desc: '评审计划' },
      { id: '08-46', name: 'Review Record', desc: '评审记录（结论/行动项）' },
      { id: '08-48', name: 'Action Item List', desc: '行动项清单' },
    ],
  },
  {
    code: 'SUP.5', name: 'Risk Management', nameZh: '风险管理', groupCode: 'SUP', stdVersion: '3.1',
    purpose: '持续识别、分析、评估、应对与监控项目/技术风险（过程级风险管理）。',
    bps: [
      { id: 'SUP.5.BP1', name: 'Define risk criteria', desc: '定义风险接受准则与评估方法' },
      { id: 'SUP.5.BP2', name: 'Identify risks', desc: '识别项目与产品风险' },
      { id: 'SUP.5.BP3', name: 'Analyze risks', desc: '分析风险发生的可能性与影响' },
      { id: 'SUP.5.BP4', name: 'Evaluate risks', desc: '对照准则评估风险等级' },
      { id: 'SUP.5.BP5', name: 'Develop risk treatment', desc: '制定风险应对措施' },
      { id: 'SUP.5.BP6', name: 'Implement and monitor', desc: '实施应对并监控有效性' },
      { id: 'SUP.5.BP7', name: 'Communicate risks', desc: '沟通风险状态' },
    ],
    wps: [
      { id: '08-60', name: 'Risk Management Plan', desc: '风险管理计划' },
      { id: '08-62', name: 'Risk Register', desc: '风险登记册' },
    ],
  },
  {
    code: 'SUP.7', name: 'Configuration Management', nameZh: '配置管理', groupCode: 'SUP', stdVersion: '3.1',
    purpose: '建立并维护配置项及其版本的完整性，支持基线管理与变更受控（3.1 语义）。',
    bps: [
      { id: 'SUP.7.BP1', name: 'Define configuration strategy', desc: '定义配置管理策略（项/命名/基线规则）' },
      { id: 'SUP.7.BP2', name: 'Identify configuration items', desc: '识别配置项（文档/源码/工具链）' },
      { id: 'SUP.7.BP3', name: 'Establish configuration system', desc: '建立配置管理系统与存储库' },
      { id: 'SUP.7.BP4', name: 'Control configuration items', desc: '对配置项变更受控并建立基线' },
      { id: 'SUP.7.BP5', name: 'Record configuration status', desc: '记录配置项状态与历史' },
      { id: 'SUP.7.BP6', name: 'Verify configuration integrity', desc: '验证配置项完整性（审计）' },
      { id: 'SUP.7.BP7', name: 'Report configuration status', desc: '报告配置状态' },
    ],
    wps: [
      { id: '09-04', name: 'Configuration Management Plan', desc: '配置管理计划' },
      { id: '09-06', name: 'Configuration Item List', desc: '配置项清单' },
      { id: '09-08', name: 'Configuration Baseline', desc: '配置基线' },
      { id: '09-10', name: 'Configuration Status Report', desc: '配置状态报告' },
    ],
  },
  {
    code: 'SUP.8', name: 'Problem Resolution Management', nameZh: '问题解决管理', groupCode: 'SUP', stdVersion: '3.1',
    purpose: '确保问题被识别、分析、管理并控制到解决（3.1 语义：问题管理）。',
    bps: [
      { id: 'SUP.8.BP1', name: 'Define problem resolution strategy', desc: '定义问题管理策略（分类/优先级/流程）' },
      { id: 'SUP.8.BP2', name: 'Identify and record problems', desc: '识别并登记问题（描述/重现/影响）' },
      { id: 'SUP.8.BP3', name: 'Analyze problems', desc: '分析问题根因与影响范围' },
      { id: 'SUP.8.BP4', name: 'Resolve problems', desc: '制定并实施解决方案' },
      { id: 'SUP.8.BP5', name: 'Track and close problems', desc: '跟踪问题状态直至关闭' },
      { id: 'SUP.8.BP6', name: 'Communicate status', desc: '沟通问题状态' },
    ],
    wps: [
      { id: '09-20', name: 'Problem Resolution Strategy', desc: '问题解决策略' },
      { id: '09-22', name: 'Problem Report', desc: '问题报告（登记/分析/解决/关闭）' },
    ],
  },
  {
    code: 'SUP.9', name: 'Change Request Management', nameZh: '变更请求管理', groupCode: 'SUP', stdVersion: '3.1',
    purpose: '确保变更请求被识别、分析、评审、批准并受控实施（3.1 语义：变更管理）。',
    bps: [
      { id: 'SUP.9.BP1', name: 'Define change strategy', desc: '定义变更管理策略（分类/权限/流程）' },
      { id: 'SUP.9.BP2', name: 'Identify and record change requests', desc: '识别并登记变更请求' },
      { id: 'SUP.9.BP3', name: 'Analyze change impact', desc: '分析变更影响（可行性/风险/成本/追溯链）' },
      { id: 'SUP.9.BP4', name: 'Review and approve/reject', desc: '评审并批准或拒绝变更' },
      { id: 'SUP.9.BP5', name: 'Implement changes', desc: '实施已批准变更' },
      { id: 'SUP.9.BP6', name: 'Track changes', desc: '跟踪变更状态直至关闭' },
      { id: 'SUP.9.BP7', name: 'Communicate status', desc: '沟通变更状态' },
    ],
    wps: [
      { id: '09-30', name: 'Change Request Record', desc: '变更请求记录' },
      { id: '09-32', name: 'Change Impact Analysis', desc: '变更影响分析' },
      { id: '09-34', name: 'Change Status Report', desc: '变更状态报告' },
    ],
  },

  // ============ MAN 管理级 ============
  {
    code: 'MAN.3', name: 'Project Management', nameZh: '项目管理', groupCode: 'MAN', stdVersion: '3.1',
    purpose: '计划、监控并控制项目活动与资源，达成项目目标并满足客户/组织要求。',
    bps: [
      { id: 'MAN.3.BP1', name: 'Define project scope', desc: '定义项目范围与目标' },
      { id: 'MAN.3.BP2', name: 'Define activities and tasks', desc: '定义项目活动与任务（WBS）' },
      { id: 'MAN.3.BP3', name: 'Plan project', desc: '制定项目计划（进度/资源/预算/里程碑）' },
      { id: 'MAN.3.BP4', name: 'Assign responsibilities', desc: '分配职责与授权' },
      { id: 'MAN.3.BP5', name: 'Monitor project', desc: '监控进度/资源/成本/风险' },
      { id: 'MAN.3.BP6', name: 'Handle issues', desc: '处理偏差并采取纠正措施' },
      { id: 'MAN.3.BP7', name: 'Report project status', desc: '定期汇报项目状态' },
      { id: 'MAN.3.BP8', name: 'Ensure quality of deliverables', desc: '确保交付物质量符合要求' },
      { id: 'MAN.3.BP9', name: 'Manage lessons learned', desc: '管理经验教训' },
    ],
    wps: [
      { id: '04-04', name: 'Project Plan', desc: '项目计划' },
      { id: '04-06', name: 'Project Status Report', desc: '项目状态报告' },
      { id: '04-08', name: 'Work Breakdown Structure', desc: '工作分解结构' },
    ],
  },
  {
    code: 'MAN.5', name: 'Risk Management', nameZh: '风险管理（项目级）', groupCode: 'MAN', stdVersion: '3.1',
    purpose: '持续识别、分析、评估、应对并监控项目风险（项目级风险登记与管理）。',
    bps: [
      { id: 'MAN.5.BP1', name: 'Define risk management strategy', desc: '定义风险管理策略与准则' },
      { id: 'MAN.5.BP2', name: 'Identify risks', desc: '识别项目风险' },
      { id: 'MAN.5.BP3', name: 'Analyze risks', desc: '分析风险可能性与影响' },
      { id: 'MAN.5.BP4', name: 'Evaluate risks', desc: '评估风险等级并排序' },
      { id: 'MAN.5.BP5', name: 'Develop risk mitigation', desc: '制定风险应对措施' },
      { id: 'MAN.5.BP6', name: 'Implement mitigation', desc: '实施应对措施' },
      { id: 'MAN.5.BP7', name: 'Monitor effectiveness', desc: '监控措施有效性' },
      { id: 'MAN.5.BP8', name: 'Communicate risks', desc: '沟通项目风险状态' },
    ],
    wps: [
      { id: '04-30', name: 'Risk Management Plan', desc: '风险管理计划' },
      { id: '04-32', name: 'Risk Register', desc: '项目风险登记册' },
    ],
  },
  {
    code: 'MAN.6', name: 'Measurement', nameZh: '度量', groupCode: 'MAN', stdVersion: '3.1',
    purpose: '定义并采集过程与产品度量数据，支持项目管理决策与过程改进。',
    bps: [
      { id: 'MAN.6.BP1', name: 'Define measurement scope', desc: '定义度量目标与范围（关联信息需求）' },
      { id: 'MAN.6.BP2', name: 'Define measures', desc: '定义度量项（指标/公式/数据源）' },
      { id: 'MAN.6.BP3', name: 'Collect data', desc: '采集度量数据' },
      { id: 'MAN.6.BP4', name: 'Analyze data', desc: '分析度量数据并解释结果' },
      { id: 'MAN.6.BP5', name: 'Communicate results', desc: '沟通度量结果' },
      { id: 'MAN.6.BP6', name: 'Evaluate measurement process', desc: '评估度量过程本身的有效性' },
    ],
    wps: [
      { id: '04-40', name: 'Measurement Plan', desc: '度量计划' },
      { id: '04-42', name: 'Measurement Results', desc: '度量结果报告' },
    ],
  },

  // ============ ACQ 采购级（3.1 常用子集）============
  {
    code: 'ACQ.2', name: 'Supplier Selection', nameZh: '供应商选择', groupCode: 'ACQ', stdVersion: '3.1',
    purpose: '评估并选择满足技术、质量与交付要求的供应商。',
    bps: [
      { id: 'ACQ.2.BP1', name: 'Define supplier selection criteria', desc: '定义供应商选择准则' },
      { id: 'ACQ.2.BP2', name: 'Evaluate potential suppliers', desc: '评估候选供应商（能力/业绩/过程）' },
      { id: 'ACQ.2.BP3', name: 'Select supplier', desc: '选择供应商并记录理由' },
    ],
    wps: [
      { id: '01-04', name: 'Supplier Selection Criteria', desc: '供应商选择准则' },
      { id: '01-06', name: 'Supplier Evaluation Results', desc: '供应商评估结果' },
    ],
  },
  {
    code: 'ACQ.3', name: 'Contract Agreement', nameZh: '合同协议', groupCode: 'ACQ', stdVersion: '3.1',
    purpose: '与供应商达成包含技术要求、质量要求与验收准则的合同协议。',
    bps: [
      { id: 'ACQ.3.BP1', name: 'Define contract requirements', desc: '定义合同需求（范围/质量/交付）' },
      { id: 'ACQ.3.BP2', name: 'Negotiate contract', desc: '谈判并达成合同协议' },
      { id: 'ACQ.3.BP3', name: 'Record agreement', desc: '记录并批准合同协议' },
    ],
    wps: [
      { id: '01-10', name: 'Contract', desc: '合同协议' },
      { id: '01-14', name: 'Quality Requirements', desc: '质量要求（含 ASPICE 等级）' },
    ],
  },
  {
    code: 'ACQ.4', name: 'Supplier Monitoring', nameZh: '供应商监控', groupCode: 'ACQ', stdVersion: '3.1',
    purpose: '监控供应商绩效与过程能力，确保符合合同与质量要求。',
    bps: [
      { id: 'ACQ.4.BP1', name: 'Define monitoring criteria', desc: '定义监控准则与频率' },
      { id: 'ACQ.4.BP2', name: 'Monitor supplier', desc: '监控供应商交付/质量/过程' },
      { id: 'ACQ.4.BP3', name: 'Handle deviations', desc: '处理供应商偏差并升级' },
      { id: 'ACQ.4.BP4', name: 'Report status', desc: '报告供应商状态' },
    ],
    wps: [
      { id: '01-20', name: 'Supplier Monitoring Results', desc: '供应商监控结果' },
      { id: '01-22', name: 'Supplier Status Report', desc: '供应商状态报告' },
    ],
  },
  {
    code: 'ACQ.11', name: 'Technical Requirements', nameZh: '技术需求', groupCode: 'ACQ', stdVersion: '3.1',
    purpose: '定义并维护采购项目的技术需求（工程与技术层面）。',
    bps: [
      { id: 'ACQ.11.BP1', name: 'Define technical requirements', desc: '定义采购技术需求' },
      { id: 'ACQ.11.BP2', name: 'Maintain technical requirements', desc: '维护需求变更与版本' },
    ],
    wps: [{ id: '01-50', name: 'Technical Requirements', desc: '采购技术需求文档' }],
  },
  {
    code: 'ACQ.12', name: 'Legal and Administrative Requirements', nameZh: '法律与行政需求', groupCode: 'ACQ', stdVersion: '3.1',
    purpose: '定义并维护采购的法律与行政要求（合规/许可/出口管制等）。',
    bps: [{ id: 'ACQ.12.BP1', name: 'Define legal requirements', desc: '定义法律与行政要求' }],
    wps: [{ id: '01-52', name: 'Legal Requirements', desc: '法律与行政要求清单' }],
  },
  {
    code: 'ACQ.13', name: 'Project Requirements', nameZh: '项目需求', groupCode: 'ACQ', stdVersion: '3.1',
    purpose: '定义并维护采购项目的项目级需求（进度/资源/成本/质量）。',
    bps: [{ id: 'ACQ.13.BP1', name: 'Define project requirements', desc: '定义采购项目需求' }],
    wps: [{ id: '01-54', name: 'Project Requirements', desc: '采购项目需求文档' }],
  },
  {
    code: 'ACQ.14', name: 'Request for Proposals', nameZh: '需求申请（RFP）', groupCode: 'ACQ', stdVersion: '3.1',
    purpose: '向潜在供应商发布包含技术/项目/法律需求的招标请求（RFP）。',
    bps: [{ id: 'ACQ.14.BP1', name: 'Prepare RFP', desc: '编制并发布招标需求书' }],
    wps: [{ id: '01-56', name: 'Request for Proposals', desc: '招标需求书（RFP）' }],
  },
  {
    code: 'ACQ.15', name: 'Supplier Qualification', nameZh: '供应商资质', groupCode: 'ACQ', stdVersion: '3.1',
    purpose: '评估供应商的质量管理体系与过程能力（如 ASPICE 评级）以确定合作资格。',
    bps: [
      { id: 'ACQ.15.BP1', name: 'Define qualification criteria', desc: '定义供应商资质准则（含过程等级要求）' },
      { id: 'ACQ.15.BP2', name: 'Assess supplier capability', desc: '评估供应商过程能力（审核/评级）' },
      { id: 'ACQ.15.BP3', name: 'Record qualification', desc: '记录资质评定结论' },
    ],
    wps: [{ id: '01-60', name: 'Supplier Qualification Record', desc: '供应商资质评定记录' }],
  },

  // ============ SPL 供应级 ============
  {
    code: 'SPL.1', name: 'Supplier Tendering', nameZh: '供应商投标', groupCode: 'SPL', stdVersion: '3.1',
    purpose: '响应客户招标需求，提交包含技术/项目/法律承诺的投标方案。',
    bps: [
      { id: 'SPL.1.BP1', name: 'Analyze RFP', desc: '分析招标需求书' },
      { id: 'SPL.1.BP2', name: 'Prepare tender', desc: '编制投标方案（技术/质量/进度/成本）' },
      { id: 'SPL.1.BP3', name: 'Submit tender', desc: '提交投标并跟进' },
    ],
    wps: [{ id: '02-04', name: 'Tender', desc: '投标方案' }],
  },
  {
    code: 'SPL.2', name: 'Product Release', nameZh: '产品发布', groupCode: 'SPL', stdVersion: '3.1',
    purpose: '控制产品/软件发布的发布条件（版本、验证状态、批准），确保发布物受控可追溯。',
    bps: [
      { id: 'SPL.2.BP1', name: 'Define release strategy', desc: '定义发布策略与发布准则' },
      { id: 'SPL.2.BP2', name: 'Prepare release', desc: '准备发布包（版本/基线/验证证据）' },
      { id: 'SPL.2.BP3', name: 'Approve release', desc: '审批发布（授权人）' },
      { id: 'SPL.2.BP4', name: 'Deliver release', desc: '交付发布并记录' },
    ],
    wps: [
      { id: '02-10', name: 'Release Plan', desc: '发布计划' },
      { id: '02-12', name: 'Release Record', desc: '发布记录（含验证证据）' },
    ],
  },
];

// ============ 4.0 新增/语义变更过程 ============
export const ASPICE_PROCESSES_40_ONLY: P[] = [
  {
    code: 'HWE.1', name: 'Hardware Requirements Analysis', nameZh: '硬件需求分析', groupCode: 'HWE', stdVersion: '4.0', only40: true,
    purpose: '将系统需求中分配给硬件部分转换为硬件需求集，建立双向可追溯性。',
    bps: [
      { id: 'HWE.1.BP1', name: 'Specify hardware requirements', desc: '指定可验证的硬件需求' },
      { id: 'HWE.1.BP2', name: 'Structure hardware requirements', desc: '结构化组织硬件需求' },
      { id: 'HWE.1.BP3', name: 'Establish bidirectional traceability', desc: '建立与系统需求的双向追溯' },
    ],
    wps: [{ id: '19-04', name: 'Hardware Requirements Specification', desc: '硬件需求规格' }],
  },
  {
    code: 'HWE.2', name: 'Hardware Design', nameZh: '硬件设计', groupCode: 'HWE', stdVersion: '4.0', only40: true,
    purpose: '设计硬件架构与详细设计，将硬件需求分配到硬件元素。',
    bps: [
      { id: 'HWE.2.BP1', name: 'Describe hardware design', desc: '描述硬件设计（原理图/布局/接口）' },
      { id: 'HWE.2.BP2', name: 'Establish bidirectional traceability', desc: '建立与硬件需求的双向追溯' },
    ],
    wps: [{ id: '19-08', name: 'Hardware Design', desc: '硬件设计文档' }],
  },
  {
    code: 'HWE.3', name: 'Verification against Hardware Design', nameZh: '硬件设计验证', groupCode: 'HWE', stdVersion: '4.0', only40: true,
    purpose: '验证硬件实现符合硬件设计（静态/仿真/样件测试）。',
    bps: [{ id: 'HWE.3.BP1', name: 'Verify against design', desc: '按设计验证硬件实现' }],
    wps: [{ id: '19-12', name: 'Hardware Verification Report', desc: '硬件验证报告' }],
  },
  {
    code: 'HWE.4', name: 'Verification against Hardware Requirements', nameZh: '硬件需求验证', groupCode: 'HWE', stdVersion: '4.0', only40: true,
    purpose: '验证硬件实现满足硬件需求（合格性测试）。',
    bps: [{ id: 'HWE.4.BP1', name: 'Verify against requirements', desc: '按需求验证硬件实现' }],
    wps: [{ id: '19-14', name: 'Hardware Qualification Report', desc: '硬件合格性报告' }],
  },
  {
    code: 'MCE.1', name: 'Mechanical Component Requirements Analysis', nameZh: '机械组件需求分析', groupCode: 'MCE', stdVersion: '4.0', only40: true,
    purpose: '将系统需求中分配给机械组件的部分转换为机械组件需求。',
    bps: [{ id: 'MCE.1.BP1', name: 'Analyze mechanical component requirements', desc: '分析并指定机械组件需求' }],
    wps: [{ id: '20-04', name: 'Mechanical Component Requirements', desc: '机械组件需求' }],
  },
  {
    code: 'MCE.2', name: 'Mechanical Component Design', nameZh: '机械组件设计', groupCode: 'MCE', stdVersion: '4.0', only40: true,
    purpose: '设计机械组件（3D 模型/图纸/材料）。',
    bps: [{ id: 'MCE.2.BP1', name: 'Design mechanical component', desc: '设计机械组件' }],
    wps: [{ id: '20-08', name: 'Mechanical Component Design', desc: '机械组件设计' }],
  },
  {
    code: 'MCE.3', name: 'Mechanical Component Sample Production', nameZh: '机械组件样件生产', groupCode: 'MCE', stdVersion: '4.0', only40: true,
    purpose: '生产机械组件样件用于验证。',
    bps: [{ id: 'MCE.3.BP1', name: 'Produce samples', desc: '生产样件' }],
    wps: [{ id: '20-10', name: 'Mechanical Samples', desc: '机械样件' }],
  },
  {
    code: 'MCE.4', name: 'Test against Mechanical Component Design', nameZh: '机械组件设计验证', groupCode: 'MCE', stdVersion: '4.0', only40: true,
    purpose: '测试样件符合机械组件设计。',
    bps: [{ id: 'MCE.4.BP1', name: 'Test against design', desc: '按设计测试样件' }],
    wps: [{ id: '20-12', name: 'Component Test Report', desc: '组件测试报告' }],
  },
  {
    code: 'MCE.5', name: 'Test against Mechanical Component Requirements', nameZh: '机械组件需求验证', groupCode: 'MCE', stdVersion: '4.0', only40: true,
    purpose: '测试样件满足机械组件需求。',
    bps: [{ id: 'MCE.5.BP1', name: 'Test against requirements', desc: '按需求测试样件' }],
    wps: [{ id: '20-14', name: 'Component Qualification Report', desc: '组件合格性报告' }],
  },
  {
    code: 'MSE.1', name: 'Mechanical System Requirements Analysis', nameZh: '机械系统需求分析', groupCode: 'MSE', stdVersion: '4.0', only40: true,
    purpose: '分析并指定机械系统需求。',
    bps: [{ id: 'MSE.1.BP1', name: 'Analyze mechanical system requirements', desc: '分析机械系统需求' }],
    wps: [{ id: '21-04', name: 'Mechanical System Requirements', desc: '机械系统需求' }],
  },
  {
    code: 'MSE.2', name: 'Mechanical System Architectural Design', nameZh: '机械系统架构设计', groupCode: 'MSE', stdVersion: '4.0', only40: true,
    purpose: '设计机械系统架构（组件布局与接口）。',
    bps: [{ id: 'MSE.2.BP1', name: 'Design mechanical system architecture', desc: '设计机械系统架构' }],
    wps: [{ id: '21-08', name: 'Mechanical System Architecture', desc: '机械系统架构' }],
  },
  {
    code: 'MSE.3', name: 'Mechanical System Integration and Integration Test', nameZh: '机械系统集成与集成测试', groupCode: 'MSE', stdVersion: '4.0', only40: true,
    purpose: '集成机械组件并验证组件间交互。',
    bps: [{ id: 'MSE.3.BP1', name: 'Integrate and test', desc: '集成机械系统并测试交互' }],
    wps: [{ id: '21-12', name: 'Mechanical Integration Test Report', desc: '机械集成测试报告' }],
  },
  {
    code: 'MSE.4', name: 'Mechanical System Qualification Test', nameZh: '机械系统合格性测试', groupCode: 'MSE', stdVersion: '4.0', only40: true,
    purpose: '验证机械系统满足机械系统需求。',
    bps: [{ id: 'MSE.4.BP1', name: 'Qualification test', desc: '执行机械系统合格性测试' }],
    wps: [{ id: '21-14', name: 'Mechanical Qualification Test Report', desc: '机械合格性测试报告' }],
  },
  {
    code: 'PIM.3', name: 'Process Improvement', nameZh: '过程改进', groupCode: 'PIM', stdVersion: '4.0', only40: true,
    purpose: '基于度量与评估结果持续改进组织过程（4.0 新增）。',
    bps: [
      { id: 'PIM.3.BP1', name: 'Analyze process performance', desc: '分析过程绩效数据' },
      { id: 'PIM.3.BP2', name: 'Identify improvement opportunities', desc: '识别改进机会' },
      { id: 'PIM.3.BP3', name: 'Implement improvements', desc: '实施并评估改进' },
    ],
    wps: [{ id: '22-04', name: 'Process Improvement Plan', desc: '过程改进计划' }],
  },
  {
    code: 'REU.2', name: 'Reuse Program Management', nameZh: '复用管理', groupCode: 'REU', stdVersion: '4.0', only40: true,
    purpose: '管理可复用资产的识别、评估与使用（4.0 新增）。',
    bps: [{ id: 'REU.2.BP1', name: 'Manage reuse program', desc: '管理复用资产库与使用' }],
    wps: [{ id: '23-04', name: 'Reuse Program Plan', desc: '复用管理计划' }],
  },
  // 4.0 SUP 语义变更：文档管理 / 配置管理 / 问题解决 / 变更请求（编号与 3.1 不同）
  {
    code: 'SUP.7', name: 'Documentation Management', nameZh: '文档管理', groupCode: 'SUP', stdVersion: '4.0', only40: true,
    purpose: '管理项目文档的创建、维护与发布（4.0 语义：SUP.7 由配置管理改为文档管理）。',
    bps: [
      { id: 'SUP.7.BP1', name: 'Plan documentation', desc: '计划文档结构与模板' },
      { id: 'SUP.7.BP2', name: 'Create and maintain documents', desc: '创建并维护文档（版本/发布）' },
    ],
    wps: [{ id: '09-04', name: 'Documentation Plan', desc: '文档管理计划' }],
  },
  {
    code: 'SUP.8', name: 'Configuration Management', nameZh: '配置管理', groupCode: 'SUP', stdVersion: '4.0', only40: true,
    purpose: '建立并维护配置项与基线，确保配置完整性（4.0 语义：配置管理移至 SUP.8）。',
    bps: [
      { id: 'SUP.8.BP1', name: 'Define configuration strategy', desc: '定义配置管理策略' },
      { id: 'SUP.8.BP2', name: 'Identify configuration items', desc: '识别配置项' },
      { id: 'SUP.8.BP3', name: 'Control baselines', desc: '建立并控制配置基线' },
      { id: 'SUP.8.BP4', name: 'Verify configuration integrity', desc: '验证配置完整性' },
    ],
    wps: [{ id: '09-06', name: 'Configuration Baseline', desc: '配置基线' }],
  },
  {
    code: 'SUP.9', name: 'Problem Resolution Management', nameZh: '问题解决管理', groupCode: 'SUP', stdVersion: '4.0', only40: true,
    purpose: '确保问题被识别、分析并控制到解决（4.0 语义：问题解决管理为 SUP.9，支持敏捷问题流）。',
    bps: [
      { id: 'SUP.9.BP1', name: 'Identify and record problems', desc: '识别并登记问题' },
      { id: 'SUP.9.BP2', name: 'Analyze and resolve problems', desc: '分析根因并解决' },
      { id: 'SUP.9.BP3', name: 'Track problems', desc: '跟踪至关闭' },
    ],
    wps: [{ id: '09-22', name: 'Problem Report', desc: '问题报告' }],
  },
  {
    code: 'SUP.10', name: 'Change Request Management', nameZh: '变更请求管理', groupCode: 'SUP', stdVersion: '4.0', only40: true,
    purpose: '确保变更请求被分析、评审并受控实施（4.0 语义：变更请求管理为 SUP.10）。',
    bps: [
      { id: 'SUP.10.BP1', name: 'Record change requests', desc: '登记变更请求' },
      { id: 'SUP.10.BP2', name: 'Analyze impact', desc: '分析变更影响' },
      { id: 'SUP.10.BP3', name: 'Approve/reject and implement', desc: '评审批准并实施' },
      { id: 'SUP.10.BP4', name: 'Track changes', desc: '跟踪变更至关闭' },
    ],
    wps: [{ id: '09-30', name: 'Change Request Record', desc: '变更请求记录' }],
  },
];

export const ALL_PROCESSES: P[] = [...ASPICE_PROCESSES_31, ...ASPICE_PROCESSES_40_ONLY];

// 过程组显示信息
export const PROCESS_GROUPS: Record<string, { name: string; nameZh: string; color: string }> = {
  SYS: { name: 'System Engineering', nameZh: '系统级（V 模型左侧）', color: '#1b6ca8' },
  SWE: { name: 'Software Engineering', nameZh: '软件级（V 模型核心）', color: '#0ca678' },
  SUP: { name: 'Supporting Processes', nameZh: '支持级', color: '#722ed1' },
  MAN: { name: 'Management Processes', nameZh: '管理级', color: '#fa8c16' },
  ACQ: { name: 'Acquisition', nameZh: '采购级', color: '#cf1322' },
  SPL: { name: 'Supply', nameZh: '供应级', color: '#eb2f96' },
  HWE: { name: 'Hardware Engineering', nameZh: '硬件级（4.0）', color: '#08979c' },
  MCE: { name: 'Mechanical Components', nameZh: '机械组件（4.0）', color: '#d4b106' },
  MSE: { name: 'Mechanical Systems', nameZh: '机械系统（4.0）', color: '#9f8f00' },
  PIM: { name: 'Process Improvement', nameZh: '过程改进（4.0）', color: '#531dab' },
  REU: { name: 'Reuse', nameZh: '复用（4.0）', color: '#5c6b7a' },
};

// 能力等级与过程属性（评估模型，Phase 2 使用）
export const CAPABILITY_LEVELS = [
  { level: 0, name: 'Incomplete', nameZh: '不完全' },
  { level: 1, name: 'Performed', nameZh: '已执行', pa: ['PA1.1'] },
  { level: 2, name: 'Managed', nameZh: '已管理', pa: ['PA2.1', 'PA2.2'] },
  { level: 3, name: 'Established', nameZh: '已建立', pa: ['PA3.1', 'PA3.2'] },
  { level: 4, name: 'Predictable', nameZh: '可预测', pa: ['PA4.1', 'PA4.2'] },
  { level: 5, name: 'Innovating', nameZh: '创新', pa: ['PA5.1', 'PA5.2'] },
] as const;

export const PA_NAMES: Record<string, string> = {
  'PA1.1': '过程执行 Process Performance',
  'PA2.1': '绩效管理 Performance Management',
  'PA2.2': '工作产品管理 Work Product Management',
  'PA3.1': '过程定义 Process Definition',
  'PA3.2': '过程部署 Process Deployment',
  'PA4.1': '过程测量 Process Measurement',
  'PA4.2': '过程控制 Process Control',
  'PA5.1': '过程创新 Process Innovation',
  'PA5.2': '创新实施 Innovation Implementation',
};

export const PA_RATINGS = [
  { value: 'N', label: 'N — 未达到 (Not achieved)', score: 0 },
  { value: 'P', label: 'P — 部分达到 (Partially achieved)', score: 1 },
  { value: 'L', label: 'L — 大部分达到 (Largely achieved)', score: 2 },
  { value: 'F', label: 'F — 完全达到 (Fully achieved)', score: 3 },
] as const;

// ============ V 模型条目层级（每个过程层的条目化对象）============
// 各层条目在「V 模型条目中心」统一创建/跟踪，跨层通过追溯链接（trace_links）形成完整 V 链：
// SYS-REQ →(实现) SYS-ARCH →(分配) SW-REQ →(实现) SW-ARCH →(细化) DD →(实现) UNIT →(验证) TC →(回归) …
export interface VLayerMeta {
  key: string;          // reqType 值
  label: string;        // 显示名
  prefix: string;       // 编号前缀（nextSeq 自动编号）
  process: string;      // 所属 A-SPICE 过程
  processName: string;  // 过程名
  color: string;
  desc: string;
  oldKeys?: string[];   // 兼容旧值（sys/sw）
}

export const V_LAYERS: VLayerMeta[] = [
  { key: 'sys_req', label: '系统需求', prefix: 'SYS-REQ', process: 'SYS.2', processName: '系统需求分析', color: '#1b6ca8', desc: 'SYS.2 输出：可验证、可追溯的系统需求条目', oldKeys: ['sys'] },
  { key: 'sys_arch', label: '系统架构元素', prefix: 'SYS-ARCH', process: 'SYS.3', processName: '系统架构设计', color: '#08979c', desc: 'SYS.3 输出：系统元素（硬件/软件/机械/接口）及其职责', oldKeys: [] },
  { key: 'sw_req', label: '软件需求', prefix: 'SW-REQ', process: 'SWE.1', processName: '软件需求分析', color: '#0ca678', desc: 'SWE.1 输出：由系统需求分配而来的软件需求条目', oldKeys: ['sw'] },
  { key: 'sw_arch', label: '软件架构元素', prefix: 'SW-ARCH', process: 'SWE.2', processName: '软件架构设计', color: '#531dab', desc: 'SWE.2 输出：软件元素（模块/组件）及其接口', oldKeys: [] },
  { key: 'dd', label: '详细设计', prefix: 'DD', process: 'SWE.3', processName: '软件详细设计与单元构建', color: '#fa8c16', desc: 'SWE.3 输出：软件单元级详细设计（算法/数据结构/接口）', oldKeys: ['dd'] },
  { key: 'unit', label: '软件单元', prefix: 'UNIT', process: 'SWE.3', processName: '软件详细设计与单元构建', color: '#d4b106', desc: 'SWE.3 输出：可独立验证的软件单元（函数/类/模块）', oldKeys: [] },
];

// 过程 → 条目层映射（过程卡片显示条目数用）
export const PROCESS_LAYER_MAP: Record<string, string[]> = {
  'SYS.2': ['sys_req'],
  'SYS.3': ['sys_arch'],
  'SWE.1': ['sw_req'],
  'SWE.2': ['sw_arch'],
  'SWE.3': ['dd', 'unit'],
};

// 兼容旧 reqType 值 → 新 VLayer
export function normalizeVLayer(t?: string): string {
  if (!t) return 'sys_req';
  const hit = V_LAYERS.find((l) => l.key === t || (l.oldKeys || []).includes(t));
  return hit ? hit.key : 'other';
}
