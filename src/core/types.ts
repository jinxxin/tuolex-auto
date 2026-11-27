// ============ 核心领域模型 ============

export type Role = 'admin' | 'qa' | 'it' | 'reviewer' | 'viewer';

export interface User {
  id?: number;
  username: string;
  name: string;
  role: Role;
  passwordHash: string; // 演示环境用 SHA-256；生产环境应使用 bcrypt/argon2 并由后端保管
  active: boolean;
  createdAt: number;
  // 电子签名扩展（预留，对接数字证书/TSA 时使用）
  certId?: string;        // 数字证书 ID（预留）
  certThumbprint?: string;
  lang?: 'zh' | 'en';     // 用户界面语言偏好（后端 users.lang，默认 zh）
}

// 审计日志（哈希链防篡改）
export interface AuditLog {
  id?: number;
  ts: number;
  userId: number;
  username: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'SIGN' | 'LOGIN' | 'CONFIRM' | 'EXPORT' | 'REJECT' | 'TEST' | 'LINK';
  entityType: string;
  entityId: string | number;
  summary: string;
  before: unknown | null;
  after: unknown | null;
  prevHash: string; // 上一条日志哈希，形成链
  hash: string;     // 本条日志哈希
}

// 标准库条目（ASPICE / ISO 26262 / IATF 16949 / ISO 9001）
export type RegStatus = 'draft' | 'pending_confirm' | 'confirmed' | 'archived';
export type StdAgency = 'VDA' | 'ISO' | 'IATF' | 'SAE' | 'AIAG' | 'OTHER';

// 标准/要求库条目
export interface Regulation {
  id?: number;
  agency: StdAgency;
  title: string;
  docType: string;      // 标准 / 指南 / 行业规范
  version: string;
  publishDate: string;  // YYYY-MM-DD
  status: RegStatus;
  source: string;       // 来源链接
  summary: string;
  keywords: string[];
  content: string;      // 全文/要点
  confirmedBy?: string; // 半人工确认人
  confirmedAt?: number;
  createdAt: number;
  updatedAt: number;
}

// 指南文档（引用法规为外键）
export interface Guide {
  id?: number;
  title: string;
  version: string;
  regIds: number[];     // 引用的法规
  content: string;
  status: 'draft' | 'published';
  updatedAt: number;
}

// 验证项目（V 模型）
export type ProjectStatus = 'init' | 'validation' | 'qualified' | 'retired' | 'archived';
export type SystemType = 'ECU' | 'ADAS' | 'BMS' | '域控制器' | '网关' | '传感器' | '车载信息娱乐' | '其他';

// A-SPICE 标准版本
export type AspiceStdVersion = '3.1' | '4.0';

export interface Project {
  id?: number;
  name: string;
  sysType: SystemType;
  status: ProjectStatus;
  vendor: string;
  description: string;
  // 兼容旧字段（历史迁移）
  gampClass?: 1 | 3 | 4 | 5;
  phases?: Record<string, number>;
  checklist?: Record<string, boolean>;
  // A-SPICE：标准版本（3.1 为主，4.0 可切换）
  stdVersion: AspiceStdVersion;
  // tuoleX FS：功能安全域开关（fsEnabled 项目隐藏 ASPICE 过程区，专项客户视图）
  fsEnabled?: boolean;
  fsVersion?: string;     // 如 '26262:2018'（预留多版本）
  fsSysType?: string | null; // 产品域（行业包 id，如 steering/brake/…；HARA 模板库预选）
  // 项目启用的过程 ID 列表（如 ['SYS.1','SYS.2','SWE.1'...]）
  processScope: string[];
  // 过程执行状态（processId -> not_started | in_progress | assessed）
  processStatus?: Record<string, ProcessExecStatus>;
  createdAt: number;
  updatedAt: number;
}

export type ProcessExecStatus = 'not_started' | 'in_progress' | 'assessed';

// 验证文档
export interface VDoc {
  id?: number;
  projectId: number;
  docType: 'SysRS' | 'SwRS' | 'SwAD' | 'SwDD' | 'UnitTest' | 'IT' | 'QT' | 'SysTest' | '其他';
  title: string;
  version: string;
  status: 'draft' | 'in_review' | 'approved' | 'rejected' | 'superseded';
  content: string;
  ownerId: number;
  signatureIds: number[];
  createdAt: number;
  updatedAt: number;
}

// 电子签名记录（电子签核 / 数据完整性）
export interface SignatureRecord {
  id?: number;
  userId: number;
  username: string;
  signerName: string;
  signedAt: number;
  meaning: string;      // 签名含义声明，如 "批准(I Approve)" / "审核(I Reviewed)" / "证明(I Certify)"
  docType: string;
  docTitle: string;
  docVersion: string;
  docHash: string;      // 被签内容的哈希（内容与签名绑定）
  certId?: string;      // 数字证书（预留）
  tsaUrl?: string;      // 时间戳服务（预留）
  tsaToken?: string;
  status: 'valid' | 'revoked';
}

// ============ A-SPICE 过程参考模型（PRM）============

export type AspiceProcessGroupCode = 'ACQ' | 'SPL' | 'SYS' | 'SWE' | 'SUP' | 'MAN' | 'HWE' | 'MCE' | 'MSE' | 'PIM' | 'REU';

export interface AspiceBP {
  id: string;      // 如 SWE.1.BP1
  name: string;    // 英文名
  desc: string;    // 描述
}

export interface AspiceWP {
  id: string;      // 如 15-50（VDA WP 编号）或 SWE.1.WP1
  name: string;    // 工作产品名，如 Software Requirements Specification
  desc: string;
}

// 过程（3.1 = 32 个，4.0 = 45 个）
export interface AspiceProcess {
  id?: number;
  code: string;          // SWE.1
  name: string;          // Software Requirements Analysis
  nameZh: string;        // 软件需求分析
  groupCode: AspiceProcessGroupCode;
  stdVersion: '3.1' | '4.0';
  purpose: string;       // 过程目的（PAM 原文/翻译）
  bps: AspiceBP[];       // 基础实践（Base Practices）
  wps: AspiceWP[];       // 输出工作产品（Work Products）
  active: boolean;       // 默认启用
  // 4.0 特有标记
  only40?: boolean;
}

// ============ 工作产品 / 评审 / 评估（项目实例）============

export type WpStatus = 'draft' | 'reviewed' | 'approved';

// 项目工作产品实例（对应过程库 WP 或自定义）
export interface WorkProduct {
  id?: number;
  projectId: number;
  processCode: string;   // 所属过程 SWE.1
  wpCode: string;        // 过程库 WP 编号或自定义
  title: string;
  status: WpStatus;
  docId?: number;        // 关联在线文档
  desc: string;
  createdBy: string;
  updatedAt: number;
}

// 联合评审记录（SUP.4）
export interface ReviewRecord {
  id?: number;
  projectId: number;
  title: string;         // 如 SWE.1 需求评审
  processCode: string;
  date: number;
  attendees: string[];   // 参加人
  conclusion: string;    // 评审结论
  actionItems: ActionItem[]; // 行动项（含状态，闭环跟踪）
  wpIds: number[];       // 关联工作产品
  createdBy: string;
  createdAt: number;
}

// 评审行动项（SUP.4 闭环跟踪）
export interface ActionItem {
  id: string;        // 唯一标识（时间戳+序号）
  text: string;      // 行动项内容
  owner: string;     // 负责人
  dueDate: number;   // 期限
  status: 'open' | 'in_progress' | 'closed';  // 状态
  closedAt?: number;
}

// 配置项（SUP.7/8 配置管理）
export interface ConfigItem {
  id?: number;
  projectId: number;
  ciCode: string;     // 配置项编号（如 CI-001）
  name: string;
  kind: string;       // 文档/源码/需求/测试/工具
  version: string;    // 当前版本
  status: string;     // draft / baselined / released / obsolete
  owner: string;
  desc?: string;
  createdBy: string;
  updatedAt: number;
}

// 基线（SUP.7/8）
export interface Baseline {
  id?: number;
  projectId: number;
  code: string;       // 如 BL-1.0
  name: string;       // 如 需求基线 v1.0
  ciIds: number[];    // 包含的配置项
  status: string;     // draft / released
  note?: string;
  createdBy: string;
  createdAt: number;
}

// 能力等级评估（CL0-5，PA 评分）—— Phase 2 使用
export type PaRating = 'N' | 'P' | 'L' | 'F'; // N=未达到 P=部分 L=大部分 F=完全

export interface Assessment {
  id?: number;
  projectId: number;
  processCode: string;
  stdVersion: '3.1' | '4.0';
  targetLevel: number;            // 目标等级（如 3）
  achievedLevel: number;          // 达成等级 0-5
  scores: Record<string, PaRating>; // PA1.1..PA5.2 -> 评级
  evidence: string;               // 证据说明（关联 WP/评审/度量）
  evidenceLinks?: number[];       // 关联证据 ID 列表（WP 为主）
  notes: string;
  assessedBy: string;
  assessedAt: number;
}

// ============ 工作产品模板（WP 模板库）============
// 每个 A-SPICE 过程的 WP 输出物都有模板；生成 WP 文档时自动把 V 条目中心对应条目填入模板，
// 输出可供认证机构/审计人员直接查看的正式工作产品（可导出 docx/PDF）。

export interface WpTemplateSection {
  id: string;
  title: string;
  kind: 'text' | 'entries';
  // kind=text：说明文本（Markdown 简化语法，生成时转 TipTap）
  text?: string;
  // kind=entries：条目拉取规则（从 V 条目中心按层/前缀筛选）
  entryFilter?: {
    reqType?: VLayer | VLayer[];  // 按条目层（user_req/sys_req/sys_arch/hw_req/sw_req/sw_arch/dd/unit/task），支持多选
    tcPrefix?: string;     // 按测试编号前缀（UNIT/IT/QT/SIT/SQT）
    fmea?: boolean;        // 风险条目
  };
  desc?: string;           // 章节说明（生成时作为 intro 展示）
}

export interface WpTemplate {
  id?: number;
  processCode: string;     // 所属过程 SWE.1
  wpCode: string;          // 过程库 WP 编号（如 17-04）
  title: string;           // 模板标题：软件需求规格（SwRS）
  stdVersion: '3.1' | '4.0';
  intro: string;           // 文档头部说明（目的/范围）
  sections: WpTemplateSection[];
  active: boolean;
}

// 变更控制 / 偏差 / CAPA（质量体系，含审批工作流）
export type ApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface ApprovalFields {
  approvalStatus: ApprovalStatus;
  approvedBy?: string;
  approvedAt?: number;
  signatureId?: number;
  reviewComment?: string;
}

export interface ChangeControl extends ApprovalFields {
  id?: number;
  ccNo: string;
  title: string;
  systemId: number;
  impact: 'high' | 'medium' | 'low';
  status: 'draft' | 'in_review' | 'approved' | 'implemented' | 'closed' | 'rejected';
  desc?: string;
  requireRevalidation: boolean;
  proposedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Deviation extends ApprovalFields {
  id?: number;
  devNo: string;
  systemId: number;
  title: string;
  description?: string;
  devType: 'critical' | 'major' | 'minor';
  severity: 'high' | 'medium' | 'low';
  detectedAt?: number;
  detectedBy?: string;
  disposition?: string;
  rootCause?: string;
  correctiveAction?: string;
  status: 'open' | 'investigating' | 'disposition' | 'closed';
  createdAt: number;
  updatedAt: number;
}

export interface Capa extends ApprovalFields {
  id?: number;
  capaNo: string;
  systemId: number;
  title: string;
  sourceType: 'deviation' | 'audit' | 'complaint' | 'other';
  sourceRef?: string;
  description?: string;
  rootCause?: string;
  correctiveAction?: string;
  preventiveAction?: string;
  effectiveness?: string;
  status: 'open' | 'in_progress' | 'verification' | 'closed';
  createdAt: number;
  updatedAt: number;
}

// EBOM（STEP 装配树，tuoleX auto）
export interface EbomNode {
  id?: string;          // 节点唯一标识（文档内，如 n1/n2…）
  name: string;
  count: number;
  children?: EbomNode[];
}

export interface EbomDoc {
  id?: number;
  projectId: number;
  name: string;
  sourceFile?: string;
  sourceSize?: number;
  version: string;
  tree: EbomNode[];
  stats?: { products: number; assemblies: number; leafCount: number; totalQty: number };
  /** STEP 原文（后端 GET /ebom/:id 返回；用于共享到 BOM 服务） */
  sourceContent?: string;
  status: 'draft' | 'released';
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface FmeaItem {
  id?: number;
  projectId: number;
  process: string;      // 流程/功能
  failureMode: string;  // 失效模式
  effect: string;       // 影响
  cause: string;        // 原因
  severity: number;     // 严重度 1-10
  occurrence: number;   // 发生度 1-10
  detection: number;    // 探测度 1-10
  rpn: number;          // RPN = S*O*D
  action: string;       // 措施
  owner: string;
  status: 'open' | 'closed';
  updatedAt?: number;
  linkedTcIds?: number[]; // 关联测试用例（风险控制措施 → 验证覆盖）
  asil?: FsAsil;        // 可选 ASIL 标注（tuoleX FS 安全分析升级；QM/A/B/C/D）
  version?: number;     // 条目版本
}

// ============ 条目级双向追溯（Traceability Matrix）============

// 需求条目（按 A-SPICE V 模型层级：系统需求 / 系统架构 / 软件需求 / 软件架构 / 详细设计 / 单元）
export type VLayer = 'user_req' | 'sys_req' | 'sys_arch' | 'hw_req' | 'sw_req' | 'sw_arch' | 'dd' | 'unit' | 'task' | 'other';
export type ReqType = VLayer; // 兼容旧引用名

export interface ReqItem {
  id?: number;
  projectId: number;
  docId: number;        // 来源文档（可为 0）
  reqId: string;        // 如 UR-REQ-001 / SYS-REQ-001 / SYS-ARCH-001 / HW-REQ-001 / SW-REQ-001 / SW-ARCH-001 / DD-001 / UNIT-001 / TASK-001
  reqType: VLayer;      // V 模型层级（需求树节点层：user_req/sys_req/sys_arch/hw_req/sw_req/sw_arch/dd/unit/task）
  parentId?: number;    // 需求树父节点（空=顶层）；跨层分解链（user_req→sys_req→sw_req→dd→task…）
  desc: string;         // 条目描述
  priority: '高' | '中' | '低';
  sourceReg: string;    // 来源/依据，如 ISO 26262 / 客户需求 / 追溯 SWE.1
  status: 'draft' | 'approved' | 'superseded';
  // 任务条目（reqType=task）：开发任务状态与负责人
  taskStatus?: 'todo' | 'in_progress' | 'done';
  assignee?: string;    // 任务负责人
  aiBatch?: string;     // AI 智能搭建草稿批次（非空=未确认草稿，不纳入正式视图）
  version?: number;     // 条目版本（文档视图编辑会升版）
  createdAt: number;
  updatedAt: number;
}

// 测试用例（OQ/PQ 协议结构化，含执行记录）
export interface TestCase {
  id?: number;
  projectId: number;
  docId: number;        // 来源文档（OQ/PQ 协议）
  tcId: string;         // 如 TC-OQ-001
  title: string;
  steps: string;        // 步骤
  expected: string;     // 预期结果
  result: 'not_run' | 'pass' | 'fail' | 'na';
  executedBy?: string;  // 执行人
  executedAt?: number;  // 执行时间
  evidence?: string;    // 证据说明/附件描述
  status: 'draft' | 'approved' | 'superseded';
  version?: number;     // 条目版本
  aiBatch?: string;     // AI 智能搭建草稿批次
  createdAt: number;
  updatedAt: number;
}

// 可追溯实体类型（含 tuoleX FS 功能安全实体，M1 起逐步接入追溯/文档引用）
export type LinkEntityType = 'req' | 'tc' | 'fmea' | 'vdoc' | 'wp'
  | 'fs_hazard' | 'fs_req' | 'fs_fmeda' | 'fs_fta' | 'fs_dfa' | 'fs_case' | 'fs_confirm' | 'fs_plan';

// 追溯链接（通用多对多：任意实体间，双向）
export interface TraceLink {
  id?: number;
  projectId: number;
  fromType: LinkEntityType;
  fromId: number;
  toType: LinkEntityType;
  toId: number;
  relType: string;      // 关系类型：依赖 / 验证覆盖 / 风险缓解 / 前置依赖 / 关联 …
  createdAt: number;
  createdBy: string;
  aiBatch?: string;     // AI 智能搭建草稿批次
}

// 条目版本历史（每次修改保存的字段级变更）
export interface EntryVersion {
  id?: number;
  entityType: 'req' | 'tc' | 'fmea';
  entityId: number;
  version: number;
  snapshot: Record<string, unknown>;  // 该版本字段快照
  changedAt: number;
  changedBy: string;
  note: string;
  changes: { field: string; before: string; after: string }[];  // 字段级变更（用于高亮）
}

// 文档版本快照（每次保存全量，支持历史预览与版本对比）
export interface DocVersion {
  id?: number;
  docId: number;
  version: number;
  title: string;
  sections: DocSection[];
  savedAt: number;
  savedBy: string;
  note: string;
}

// 编号计数器（项目内前缀自增，删除/废弃不复用）
export interface SeqCounter {
  id?: number;
  projectId: number;
  prefix: string;       // REQ / TC
  seq: number;          // 已分配的最大序号
}

// ============ 在线文档（Word 风格文档视图）============

// 章节类型：自由文本 / 条目引用 / 目录
export type DocSectionType = 'text' | 'entries' | 'toc';

// 文档章节
export interface DocSection {
  id: string;                        // 章节唯一 ID
  title: string;
  type: DocSectionType;
  content?: string;                  // text 章节：TipTap JSON 字符串
  refs?: { type: LinkEntityType; id: number }[];  // entries 章节：引用的条目
  snapshot?: unknown;                // entries 章节：保存时的条目快照
  intro?: string;                    // entries 章节：引用条目上方的说明文字（TipTap JSON）
  outro?: string;                    // entries 章节：引用条目下方的说明文字（TipTap JSON）
}

// 修订记录条目
export interface DocHistoryItem {
  version: number;
  date: number;
  by: string;
  note: string;
}

// 在线文档（通用文档 + 验证文档；章节有序可拖拽；版本化可签名）
export interface DocRecord {
  id?: number;
  title: string;
  docType: string;       // URS / OQ / SOP / 培训记录 / 自定义
  projectId?: number;    // 通用文档可不关联项目
  sections: DocSection[];
  version: number;
  status: 'draft' | 'approved' | 'superseded';
  signatureIds: number[];
  history: DocHistoryItem[];
  createdAt: number;
  updatedAt: number;
}

// ============ tuoleX FS 功能安全域（ISO 26262:2018）============
// 领域依据：内部领域笔记（ASIL 判定表 §2.2 / 分解表 §4.2 / 硬件度量 §5 / GSN §6.4）
// 命名：ISO 术语优先英文缩写（ASIL/HARA/SG/FSC/TSC…），中文展示为辅

export type FsAsil = 'QM' | 'A' | 'B' | 'C' | 'D';
export type FsSeverity = 'S0' | 'S1' | 'S2' | 'S3';
export type FsExposure = 'E0' | 'E1' | 'E2' | 'E3' | 'E4';
export type FsControllability = 'C0' | 'C1' | 'C2' | 'C3';
export type FsIndependence = 'I0' | 'I1' | 'I2' | 'I3';  // 26262 独立性等级（领域笔记 §6.2）

// HARA 危害事件条目（危害 × 运行场景 → S/E/C → ASIL）
export interface FsHazard {
  id?: number;
  projectId: number;
  hazId: string;             // HAZ-001（seq 生成）
  title: string;             // 危害标题
  vehicleLevelHazard: string; // 车辆级危害描述
  situation: string;         // 运行场景
  severity: FsSeverity;
  exposure: FsExposure;
  controllability: FsControllability;
  asil: FsAsil;              // 引擎自动算；人工覆写需 asilManual+reason 留痕
  asilManual?: boolean;
  asilManualReason?: string; // 覆写原因必填（审计）
  sgId?: number;             // 对应安全目标（fs_safety_reqs id）
  srcPack?: string;          // 来源行业包 id（模板库导入标注；链生成句式/审计追溯用）
  refs?: string[];           // 依据引用（SOTIF/客户/法规…）
  status: 'draft' | 'confirmed' | 'superseded';
  rationale?: string;        // 定级理由（HARA 报告必备）
  version?: number;
  createdAt: number;
  updatedAt: number;
}

// 安全需求链节点类型（层级约定：SG ← FSC ← TSC ← HSI；TSC 下挂 SYSTEM_SR/HW_SR/SW_SR）
export type FsReqKind = 'SG' | 'FSC' | 'TSC' | 'HSI' | 'SYSTEM_SR' | 'HW_SR' | 'SW_SR';

// 安全需求链（单表树形；ASIL 沿链传播，X(Y) 分解记号）
export interface FsSafetyReq {
  id?: number;
  projectId: number;
  code: string;              // SG-001 / FSC-001 / TSC-001 / HW-SR-001 / SW-SR-001
  kind: FsReqKind;
  title?: string;
  text: string;              // 需求正文（无歧义/可验证——模板提示）
  parentId?: number;         // 上级节点（树形）
  sourceRef?: string;        // 来源（标准条款/上级需求）
  asil: FsAsil;
  asilInherited: boolean;    // true=继承自上级（引擎标注）
  asilFrom?: Exclude<FsAsil, 'QM'>;  // 分解原级 Y：X(Y) 记号展示；硬件度量/确认措施独立性按 Y 取（笔记 §4.3）
  asilDecomposed?: { base: FsAsil; parts: { asil: FsAsil; note: string }[] };
  // base = 分解前原级 Y（展示 X(Y)；硬件度量目标与确认措施独立性均按原级 Y——领域笔记 §4.3）
  safetyRelated: boolean;    // 是否安全相关（false=QM 并行管理）
  verificationMethod?: string;
  status: 'draft' | 'approved' | 'superseded';
  aiBatch?: string;          // AI 草稿批次（复用确认机制）
  version?: number;
  createdAt: number;
  updatedAt: number;
}

// FMEDA 行（失效数据，引擎自动汇总度量）
export interface FsFmedaRow {
  id: string;                // r1/r2…
  component: string;
  failureMode: string;
  effect: string;
  safetyRelated: boolean;    // 是否安全相关（QM 部分排除在计算外）
  lambda: number;            // 失效率 FIT（1E-9/h）
  distribution: number;      // 失效分布占比 %
  diagnosticCoverage: number; // 诊断覆盖率 DC %
  faultType: 'singlePoint' | 'latent' | 'safe' | 'noEffect';  // 引擎辅助分类
  mitigation: string;        // 安全机制/措施
}

export interface FsFmedaMetrics {
  pmhf: number;              // 1/h
  spfm: number;              // %
  lfm: number;               // %
  targets?: { pmhfFit: number; spfmPct: number; lfmPct: number } | null;  // 按 ASIL 内建目标（分解后按原级，FIT/%）；A/QM 无定量目标为 null
  verdict?: 'pass' | 'fail' | 'na';
}

// FMEDA 分析（硬件失效模式与诊断分析 → 硬件架构度量）
export interface FsFmeda {
  id?: number;
  projectId: number;
  fmedaId: string;           // FMEDA-001
  targetRef?: { type: 'fs_req' | 'req' | 'vdoc'; id: number };  // 分析对象
  asil: FsAsil;              // 目标 ASIL（度量判定基准；若关联分解需求=原级）
  item: string;              // 分析项
  rows: FsFmedaRow[];
  metrics?: FsFmedaMetrics;  // 引擎计算结果
  status: 'draft' | 'reviewed' | 'approved';
  version?: number;
  createdAt: number;
  updatedAt: number;
}

// 故障树节点（AND/OR 门树，JSON 存）
export interface FsFtaNode {
  id: string;
  label: string;
  gate?: 'AND' | 'OR';
  children?: FsFtaNode[];
  basic?: { lambda?: number; source?: string };
}

export interface FsFta {
  id?: number;
  projectId: number;
  ftaId: string;             // FTA-001
  topEvent: string;          // 顶事件
  topAsil: FsAsil;
  rootRef?: { type: 'fs_hazard' | 'fs_req'; id: number };
  tree: FsFtaNode;
  status: 'draft' | 'reviewed';
  createdAt: number;
  updatedAt: number;
}

// DFA（相关失效分析）行：元素对 × 耦合机制 → 独立性论证（ASIL 分解/免干扰必查）
export type FsDfaMechanism = 'cascading' | 'commonCause' | 'interaction';  // 级联/共同原因/交互
export interface FsDfaRow {
  id: string;
  refA: string;              // 元素/失效 A
  refB: string;              // 元素/失效 B
  mechanism: FsDfaMechanism;
  couplingDetail: string;    // 耦合机制（共享电源/时钟/软件/环境…）
  analysis: string;          // 影响与独立性结论
  mitigation: string;        // 防护或「无需，已独立」
}

export interface FsDfa {
  id?: number;
  projectId: number;
  dfaId: string;             // DFA-001
  scope: string;
  asil: FsAsil;
  rows: FsDfaRow[];
  status: 'draft' | 'reviewed';
  createdAt: number;
  updatedAt: number;
}

// Safety Case：GSN 论证树（扁平存 + parentId；evidence 节点=Solution 挂平台证据）
export type FsCaseNodeKind = 'goal' | 'strategy' | 'solution' | 'context' | 'assumption' | 'justification';
export interface FsCaseNode {
  id: string;                // N01…
  kind: FsCaseNodeKind;
  text: string;
  parentId?: string;
  evidenceRef?: { type: LinkEntityType | 'assessment' | 'review'; id: number };
  undeveloped?: boolean;     // ◇ 未展开——缺口扫描对象
  approvedBy?: string;       // 节点签核
  approvedAt?: number;
  awayGoal?: FsAwayGoal;     // 模块化引用（引用另一安全案例的节点；GSN away goal）
}

// 模块化引用（GSN away goal）：引用另一案例的已论证节点
// refText/refVersion 为建立引用时的快照，用于「被引用方修订 → 引用方提示复核」
export interface FsAwayGoal {
  caseId: number;            // 被引用案例 id
  caseTitle: string;         // 被引用案例标题（快照）
  nodeId: string;            // 被引用节点 id
  refText: string;           // 被引用节点文本（建立引用时快照）
  refVersion: string;        // 被引用案例版本（建立引用时快照）
  reviewedAt?: number;       // 最近复核时间
  reviewedBy?: string;
}

export interface FsSafetyCase {
  id?: number;
  projectId: number;
  title: string;
  version: string;
  nodes: FsCaseNode[];
  gaps?: { nodeId: string; issue: string }[];
  status: 'draft' | 'under_review' | 'approved';
  createdAt: number;
  updatedAt: number;
}

// ============ Safety Case 论证模式库（二期 M4，2026-09-19）============
// 可复用论证骨架：nodes 文本可含 {{占位}} 占位符，应用时填參实例化
export interface FsCasePattern {
  id?: number;
  name: string;
  description?: string;
  tags?: string[];
  nodes: FsCaseNode[];       // 骨架（nodes 文本含 {{占位}}）
  placeholders?: string[];   // 占位符键列表（保存时从文本提取）
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

// 确认措施（CR/Audit/FSA 三分法；independence 按 I0-I3）
export interface FsConfirmMeasure {
  id?: number;
  projectId: number;
  cmId: string;              // CM-001
  type: 'audit' | 'assessment' | 'review';
  title: string;
  scope: string;
  relatedAsil: FsAsil;
  independence: FsIndependence;  // UI 按 ASIL 提示典型值（领域笔记 §6.2）
  evidence?: string;         // 结论/报告（可挂 vdoc）
  outcome?: string;          // FSA/评估结论（assessment 用）：acceptance / conditional / rejection + 说明
  status: 'planned' | 'in_progress' | 'closed';
  dueDate?: number;
  assignee?: string;
  createdAt: number;
  updatedAt: number;
}

// 安全计划条目（Part 2 生命周期裁剪）
export interface FsPlanItem {
  id?: number;
  projectId: number;
  plId: string;              // PL-001
  phase: string;             // 生命周期阶段
  task: string;
  deliverable: string;
  asil: FsAsil;
  status: 'planned' | 'in_progress' | 'done' | 'na';  // na=裁剪（留 naReason）
  naReason?: string;
  owner?: string;
  dueDate?: number;
  createdAt: number;
  updatedAt: number;
}

// ============ tuoleX FS 正式评估报告（二期 M3，2026-09-19）============
export type FsReportKind = 'hara' | 'fsc-tsc' | 'fmeda' | 'safety-case';
export interface FsReport {
  id?: number;
  projectId: number;
  kind: FsReportKind;
  reportNo: string;
  title: string;
  version: string;
  snapshotHash: string;      // 数据快照 SHA-256（导出即冻结）
  snapshot?: unknown;        // 数据快照（可回源）
  createdBy: string;
  createdAt: number;
}

// ============ tuoleX FS 工具资质（ISO 26262-8:2018 Cl.11 · TCL）============
export type TqTi = 'TI1' | 'TI2';                    // Tool Impact
  export type TqTd = 'TD1' | 'TD2' | 'TD3';          // Tool error Detection
export type TqTcl = 'TCL1' | 'TCL2' | 'TCL3';        // Tool Confidence Level
export type TqMethod = 'ICFU' | 'EDP' | 'VST' | 'DSS';  // 资质措施（Cl.11.4.6）
export type TqMeasureStatus = 'todo' | 'doing' | 'done';
export type TqToolStatus = 'draft' | 'assessed';

export interface TqTool {
  id?: number;
  projectId: number;
  code: string;              // TQ-001
  name: string;
  vendor?: string;
  version?: string;
  intendedUse: string;       // 预期用途（TCL 与用途绑定）
  lifecyclePhase?: string;   // 生命周期阶段
  toolType?: string;         // 工具类型（管理/分析/生成/验证…）
  owner?: string;
  status: TqToolStatus;
  createdAt: number;
  updatedAt: number;
}

export interface TqAssessment {
  id?: number;
  projectId: number;
  code: string;              // TQA-001
  toolId: number;            // 关联 tq_tools.id
  scenario: string;          // 用途场景
  ti: TqTi;
  td: TqTd;
  tcl: TqTcl;                // 引擎自动判定；人工可覆写（overrideTcl+overrideReason 留痕）
  rationale?: string;        // 判定依据
  asilTarget?: FsAsil;       // 项目 ASIL 目标
  overrideTcl?: TqTcl;
  overrideReason?: string;
  conclusion?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TqMeasure {
  id?: number;
  projectId: number;
  assessmentId: number;      // 关联 tq_assessments.id
  method: TqMethod;
  description?: string;
  evidence?: string;
  status: TqMeasureStatus;
  createdAt: number;
  updatedAt: number;
}

// ============ 项目管理 · 计划中枢（tuoleX auto 领域：软件过程 A-SPICE）============
export type PhaseCode = 'SYS' | 'REQ' | 'ARC' | 'UNIT' | 'INT' | 'QUAL';
export type PlanTaskStatus = 'todo' | 'doing' | 'review' | 'done';
export interface PlanRef { type: string; id: number; code?: string }
export interface PlanTask {
  id?: number; projectId: number; code: string; name: string; phaseCode: PhaseCode;
  owner?: string; startMs: number; endMs: number; baseStartMs?: number; baseEndMs?: number;
  progress: number; status: PlanTaskStatus; critical: boolean; deps: string[];
  parentCode?: string; isGroup: boolean; seq: number; createdAt: number; updatedAt: number;
  description?: string; priority?: string; actualStartMs?: number; actualEndMs?: number;
  estimateHours?: number; scheduleConstraint?: string; progressMode?: string;
  tags?: string[]; assignees?: string[]; refs?: PlanRef[];
}
export type PlanMilestoneStatus = 'done' | 'now' | 'late' | 'todo';
export interface PlanMilestone {
  id?: number; projectId: number; code: string; name: string; type: 'DCP' | 'TR';
  phaseCode: PhaseCode; dateMs: number; status: PlanMilestoneStatus; createdAt: number; updatedAt: number;
  description?: string; milestoneType?: string; deliverables?: { name: string; done?: boolean }[];
  decisionBody?: string; decisionBy?: string; actualDateMs?: number; refs?: PlanRef[];
}
export interface PlanDependency {
  id?: number; projectId: number; fromCode: string; toCode: string;
  type: 'FS' | 'SS' | 'FF' | 'SF'; lagMs: number; createdAt: number; updatedAt: number;
}
export interface PlanBaseline {
  id?: number; projectId: number; name: string; version: number; frozenAt: number; frozenBy: string;
  snapshot: { tasks?: PlanTask[]; milestones?: PlanMilestone[]; deps?: PlanDependency[] }; note?: string;
}
export interface PlanAssignment {
  id?: number; projectId: number; taskCode: string; name: string; role?: string; percent: number; hours?: number;
}
export interface PlanCalendar {
  id?: number; projectId: number; name: string; weekendOff: boolean; holidays: string[]; updatedAt: number;
}
