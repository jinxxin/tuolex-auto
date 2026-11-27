// ============ A-SPICE 项目通用模板常量 ============

// V 模型阶段（Automotive SPICE）—— 顺序即开发验证流程
export const V_PHASES: { docType: string; label: string; desc: string }[] = [
  { docType: 'SysRS', label: '系统需求', desc: '系统需求分析（SYS.2）：需求挖掘、分类、双向可追溯' },
  { docType: 'SwRS', label: '软件需求', desc: '软件需求分析（SWE.1）：软件需求规格、验证准则' },
  { docType: 'SwAD', label: '软件架构', desc: '软件架构设计（SWE.2）：模块划分、接口定义' },
  { docType: 'SwDD', label: '详细设计', desc: '详细设计与实现（SWE.3）：单元设计、代码实现' },
  { docType: 'UnitTest', label: '单元验证', desc: '单元验证（SWE.4）：单元测试计划与执行' },
  { docType: 'IT', label: '集成验证', desc: '软件集成与集成验证（SWE.5）：集成测试' },
  { docType: 'QT', label: '合格性验证', desc: '软件合格性验证（SWE.6）：验收场景测试' },
  { docType: 'SysTest', label: '系统验证', desc: '系统合格性验证（SYS.4/SYS.5）：整车在环/系统测试' },
];

// 工作产品清单（A-SPICE 过程工作产品，含 SWE/SYS 关键输出物）
export const GENERIC_CHECKLIST: { key: string; label: string; cat: '开发文档' | '技术与商务' | '过程与支持' | '放行' }[] = [
  { key: 'sysrs', label: '系统需求规格（SysRS）', cat: '开发文档' },
  { key: 'swrs', label: '软件需求规格（SwRS）', cat: '开发文档' },
  { key: 'swad', label: '软件架构设计（SwAD）', cat: '开发文档' },
  { key: 'swdd', label: '详细设计说明（SwDD）', cat: '开发文档' },
  { key: 'testplan', label: '验证测试计划（Unit/IT/QT）', cat: '开发文档' },
  { key: 'trace', label: '双向追溯矩阵（需求↔测试）', cat: '开发文档' },
  { key: 'review', label: '联合评审记录（SUP.4）', cat: '过程与支持' },
  { key: 'config', label: '配置管理记录（SUP.8）', cat: '过程与支持' },
  { key: 'problem', label: '问题解决记录（SUP.9）', cat: '过程与支持' },
  { key: 'chgreq', label: '变更请求记录（SUP.10）', cat: '过程与支持' },
  { key: 'supplier', label: '供应商评估报告', cat: '技术与商务' },
  { key: 'arch', label: '系统/软件架构图与接口定义', cat: '技术与商务' },
  { key: 'toolchain', label: '开发与测试工具链清单', cat: '技术与商务' },
  { key: 'migration', label: '数据迁移方案与验证', cat: '技术与商务' },
  { key: 'metric', label: '过程度量数据（进度/规模/缺陷）', cat: '过程与支持' },
  { key: 'estimate', label: '估算与计划（MAN.3）', cat: '过程与支持' },
  { key: 'monitor', label: '项目监控记录（MAN.5）', cat: '过程与支持' },
  { key: 'training', label: '培训计划与培训记录', cat: '过程与支持' },
  { key: 'assessment', label: '能力等级评估报告（CL0-5）', cat: '放行' },
  { key: 'release', label: '发布放行批准（质量/管理层电子签核）', cat: '放行' },
];

// 系统类型选项（汽车电子）
export const SYSTEM_TYPES = ['ECU', 'ADAS', 'BMS', '域控制器', '网关', '传感器', '车载信息娱乐', '其他'] as const;

// 文档状态元信息
export const VDOC_STATUS_META: Record<string, { color: string; label: string }> = {
  draft: { color: 'default', label: '草稿' },
  in_review: { color: 'orange', label: '审批中' },
  approved: { color: 'green', label: '已批准' },
  rejected: { color: 'red', label: '已驳回' },
  superseded: { color: 'purple', label: '已升版' },
};

export const PROJECT_STATUS_META: Record<string, { color: string; label: string }> = {
  init: { color: 'default', label: '立项' },
  validation: { color: 'processing', label: '验证中' },
  qualified: { color: 'success', label: '已验证合格' },
  retired: { color: 'default', label: '已退役' },
  archived: { color: 'gold', label: '已存档' },
};
