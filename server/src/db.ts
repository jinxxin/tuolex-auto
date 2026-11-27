import pg from 'pg';
import { config } from './config';

// int8 → number（JS number 精确表示毫秒时间戳）
pg.types.setTypeParser(20, (v) => (v === null ? v : parseInt(v, 10)));

export const pool = new pg.Pool({
  host: config.pg.host,
  port: config.pg.port,
  database: config.pg.database,
  user: config.pg.user,
  password: config.pg.password,
  max: 10,
});

// ============ Schema（16 张表，与前端 Dexie 表一一对应）============
// 约定：camelCase 列名（免字段映射）、JSONB 存嵌套结构、int8 存毫秒时间戳
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  "createdAt" BIGINT NOT NULL,
  "certId" TEXT,
  "certThumbprint" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  ts BIGINT NOT NULL,
  "userId" INT NOT NULL DEFAULT 0,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  summary TEXT NOT NULL,
  before JSON,
  after JSON,
  "prevHash" TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(ts);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs("entityType", "entityId");

CREATE TABLE IF NOT EXISTS regulations (
  id SERIAL PRIMARY KEY,
  agency TEXT NOT NULL,
  title TEXT NOT NULL,
  "docType" TEXT NOT NULL,
  version TEXT NOT NULL,
  "publishDate" TEXT,
  status TEXT NOT NULL,
  source TEXT,
  summary TEXT,
  keywords JSONB,
  content TEXT,
  "confirmedBy" TEXT,
  "confirmedAt" BIGINT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS guides (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  version TEXT NOT NULL,
  "regIds" JSONB,
  content TEXT,
  status TEXT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  "sysType" TEXT NOT NULL,
  "gampClass" INT,
  status TEXT NOT NULL,
  vendor TEXT,
  description TEXT,
  phases JSONB,
  checklist JSONB,
  "stdVersion" TEXT,
  "processScope" JSONB,
  "processStatus" JSONB,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS vdocs (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  "docType" TEXT NOT NULL,
  title TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL,
  content TEXT,
  "ownerId" INT NOT NULL DEFAULT 0,
  "signatureIds" JSONB,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vdocs_project ON vdocs("projectId");

CREATE TABLE IF NOT EXISTS signatures (
  id SERIAL PRIMARY KEY,
  "userId" INT NOT NULL,
  username TEXT NOT NULL,
  "signerName" TEXT NOT NULL,
  "signedAt" BIGINT NOT NULL,
  meaning TEXT NOT NULL,
  "docType" TEXT NOT NULL,
  "docTitle" TEXT NOT NULL,
  "docVersion" TEXT NOT NULL,
  "docHash" TEXT NOT NULL,
  "certId" TEXT,
  "tsaUrl" TEXT,
  "tsaToken" TEXT,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS change_controls (
  id SERIAL PRIMARY KEY,
  "ccNo" TEXT NOT NULL,
  title TEXT NOT NULL,
  "systemId" INT NOT NULL,
  impact TEXT NOT NULL,
  status TEXT NOT NULL,
  "desc" TEXT,
  "requireRevalidation" BOOLEAN NOT NULL DEFAULT false,
  "proposedBy" TEXT,
  "approvalStatus" TEXT NOT NULL DEFAULT 'draft',
  "approvedBy" TEXT,
  "approvedAt" BIGINT,
  "signatureId" INT,
  "reviewComment" TEXT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS deviations (
  id SERIAL PRIMARY KEY,
  "devNo" TEXT NOT NULL,
  "systemId" INT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  "devType" TEXT NOT NULL DEFAULT 'minor',
  severity TEXT NOT NULL DEFAULT 'medium',
  "detectedAt" BIGINT,
  "detectedBy" TEXT,
  disposition TEXT,
  "rootCause" TEXT,
  "correctiveAction" TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  "approvalStatus" TEXT NOT NULL DEFAULT 'draft',
  "approvedBy" TEXT,
  "approvedAt" BIGINT,
  "signatureId" INT,
  "reviewComment" TEXT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dev_system ON deviations("systemId");

CREATE TABLE IF NOT EXISTS capas (
  id SERIAL PRIMARY KEY,
  "capaNo" TEXT NOT NULL,
  "systemId" INT NOT NULL,
  title TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'deviation',
  "sourceRef" TEXT,
  description TEXT,
  "rootCause" TEXT,
  "correctiveAction" TEXT,
  "preventiveAction" TEXT,
  effectiveness TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  "approvalStatus" TEXT NOT NULL DEFAULT 'draft',
  "approvedBy" TEXT,
  "approvedAt" BIGINT,
  "signatureId" INT,
  "reviewComment" TEXT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_capa_system ON capas("systemId");

CREATE TABLE IF NOT EXISTS ebom_docs (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  name TEXT NOT NULL,
  "sourceFile" TEXT,
  "sourceSize" INT,
  version TEXT NOT NULL DEFAULT 'A',
  tree JSONB NOT NULL,
  stats JSONB,
  "sourceContent" TEXT,
  mesh JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  "createdBy" TEXT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ebom_project ON ebom_docs("projectId");

CREATE TABLE IF NOT EXISTS fmea_items (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  process TEXT NOT NULL,
  "failureMode" TEXT NOT NULL,
  effect TEXT,
  cause TEXT,
  severity INT NOT NULL,
  occurrence INT NOT NULL,
  detection INT NOT NULL,
  rpn INT NOT NULL,
  action TEXT,
  owner TEXT,
  status TEXT NOT NULL,
  "updatedAt" BIGINT,
  "linkedTcIds" JSONB,
  version INT
);
CREATE INDEX IF NOT EXISTS idx_fmea_project ON fmea_items("projectId");

CREATE TABLE IF NOT EXISTS req_items (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  "docId" INT NOT NULL,
  "reqId" TEXT NOT NULL,
  "reqType" TEXT,
  "desc" TEXT NOT NULL,
  priority TEXT NOT NULL,
  "sourceReg" TEXT,
  status TEXT NOT NULL,
  version INT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
-- 需求树（2026-08-19）：父节点 + 任务条目状态/负责人
ALTER TABLE req_items ADD COLUMN IF NOT EXISTS "parentId" INT;
ALTER TABLE req_items ADD COLUMN IF NOT EXISTS "taskStatus" TEXT;
ALTER TABLE req_items ADD COLUMN IF NOT EXISTS "assignee" TEXT;
-- AI 智能搭建（2026-08-19）：草稿批次标记（未确认=不纳入正式视图）
ALTER TABLE req_items ADD COLUMN IF NOT EXISTS "aiBatch" TEXT;
CREATE INDEX IF NOT EXISTS idx_req_project ON req_items("projectId");

CREATE TABLE IF NOT EXISTS test_cases (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  "docId" INT NOT NULL,
  "tcId" TEXT NOT NULL,
  title TEXT NOT NULL,
  steps TEXT,
  expected TEXT,
  result TEXT NOT NULL,
  "executedBy" TEXT,
  "executedAt" BIGINT,
  evidence TEXT,
  status TEXT NOT NULL,
  version INT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
-- AI 智能搭建：草稿批次标记
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS "aiBatch" TEXT;
CREATE INDEX IF NOT EXISTS idx_tc_project ON test_cases("projectId");

CREATE TABLE IF NOT EXISTS trace_links (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  "fromType" TEXT NOT NULL,
  "fromId" INT NOT NULL,
  "toType" TEXT NOT NULL,
  "toId" INT NOT NULL,
  "relType" TEXT,
  "createdAt" BIGINT NOT NULL,
  "createdBy" TEXT
);
-- AI 智能搭建：草稿批次标记（追溯链接随批次）
ALTER TABLE trace_links ADD COLUMN IF NOT EXISTS "aiBatch" TEXT;
CREATE INDEX IF NOT EXISTS idx_trace_project ON trace_links("projectId");
CREATE INDEX IF NOT EXISTS idx_trace_from ON trace_links("projectId", "fromType", "fromId");
CREATE INDEX IF NOT EXISTS idx_trace_to ON trace_links("projectId", "toType", "toId");

CREATE TABLE IF NOT EXISTS seqs (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  prefix TEXT NOT NULL,
  seq INT NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seqs_key ON seqs("projectId", prefix);

CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  "docType" TEXT NOT NULL,
  "projectId" INT,
  sections JSONB,
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  "signatureIds" JSONB,
  history JSONB,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents("projectId");

CREATE TABLE IF NOT EXISTS entry_versions (
  id SERIAL PRIMARY KEY,
  "entityType" TEXT NOT NULL,
  "entityId" INT NOT NULL,
  version INT NOT NULL,
  snapshot JSONB,
  "changedAt" BIGINT NOT NULL,
  "changedBy" TEXT,
  note TEXT,
  changes JSONB
);
CREATE INDEX IF NOT EXISTS idx_entry_versions_key ON entry_versions("entityType", "entityId");

CREATE TABLE IF NOT EXISTS doc_versions (
  id SERIAL PRIMARY KEY,
  "docId" INT NOT NULL,
  version INT NOT NULL,
  title TEXT NOT NULL,
  sections JSONB,
  "savedAt" BIGINT NOT NULL,
  "savedBy" TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_doc_versions_doc ON doc_versions("docId");

-- ============ A-SPICE 扩展表（tuoleX auto）============
CREATE TABLE IF NOT EXISTS aspice_processes (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  "nameZh" TEXT,
  "groupCode" TEXT NOT NULL,
  "stdVersion" TEXT NOT NULL,
  purpose TEXT,
  bps JSONB,
  wps JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  "only40" BOOLEAN
);
CREATE INDEX IF NOT EXISTS idx_aspice_code ON aspice_processes(code);

CREATE TABLE IF NOT EXISTS work_products (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  "processCode" TEXT NOT NULL,
  "wpCode" TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  "docId" INT,
  "desc" TEXT,
  "createdBy" TEXT,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wp_project ON work_products("projectId");

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  title TEXT NOT NULL,
  "processCode" TEXT NOT NULL,
  date BIGINT NOT NULL,
  attendees JSONB,
  conclusion TEXT,
  "actionItems" JSONB,
  "wpIds" JSONB,
  "createdBy" TEXT,
  "createdAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews("projectId");

CREATE TABLE IF NOT EXISTS config_items (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  "ciCode" TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  owner TEXT,
  "desc" TEXT,
  "createdBy" TEXT,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_config_items_project ON config_items("projectId");

CREATE TABLE IF NOT EXISTS baselines (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  "ciIds" JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  note TEXT,
  "createdBy" TEXT,
  "createdAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_baselines_project ON baselines("projectId");

CREATE TABLE IF NOT EXISTS assessments (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  "processCode" TEXT NOT NULL,
  "stdVersion" TEXT NOT NULL,
  "targetLevel" INT NOT NULL,
  "achievedLevel" INT NOT NULL,
  scores JSONB,
  evidence TEXT,
  "evidenceLinks" JSONB,
  notes TEXT,
  "assessedBy" TEXT,
  "assessedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assessments_project ON assessments("projectId");

CREATE TABLE IF NOT EXISTS wp_templates (
  id SERIAL PRIMARY KEY,
  "processCode" TEXT NOT NULL,
  "wpCode" TEXT NOT NULL,
  title TEXT NOT NULL,
  "stdVersion" TEXT NOT NULL,
  intro TEXT,
  sections JSONB,
  active BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_wptemplates_code ON wp_templates("processCode");

-- ============ 意见与建议（Feedback）+ 讨论 ============
CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'suggestion',
  author_id INT NOT NULL,
  author_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at BIGINT NOT NULL,
  published_at BIGINT,
  published_by TEXT,
  withdrawn_at BIGINT,
  withdrawn_by TEXT,
  pinned_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, published_at);
CREATE INDEX IF NOT EXISTS idx_feedback_author ON feedback(author_id);

CREATE TABLE IF NOT EXISTS feedback_comments (
  id SERIAL PRIMARY KEY,
  feedback_id INT NOT NULL,
  content TEXT NOT NULL,
  author_name TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fbcomments_fb ON feedback_comments(feedback_id);

-- ============ 项目成员（项目级权限控制） ============
CREATE TABLE IF NOT EXISTS project_members (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',  -- owner / member
  created_at BIGINT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pm_unique ON project_members(project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_pm_user ON project_members(user_id);

-- ============ 平台 AI 配置（用户可配，单行） ============
CREATE TABLE IF NOT EXISTS ai_configs (
  id SERIAL PRIMARY KEY,
  "baseUrl" TEXT,
  model TEXT,
  "apiKey" TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" BIGINT,
  "updatedBy" TEXT
);

-- ============ tuoleX FS 功能安全域（ISO 26262）8 表 ============
CREATE TABLE IF NOT EXISTS fs_hazards (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  "hazId" TEXT NOT NULL,
  title TEXT NOT NULL,
  "vehicleLevelHazard" TEXT,
  situation TEXT,
  severity TEXT NOT NULL DEFAULT 'S1',
  exposure TEXT NOT NULL DEFAULT 'E1',
  controllability TEXT NOT NULL DEFAULT 'C1',
  asil TEXT NOT NULL DEFAULT 'QM',
  "asilManual" BOOLEAN NOT NULL DEFAULT false,
  "asilManualReason" TEXT,
  "sgId" INT,
  refs JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  rationale TEXT,
  version INT NOT NULL DEFAULT 1,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fs_hazards_pid ON fs_hazards("projectId");

CREATE TABLE IF NOT EXISTS fs_safety_reqs (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  code TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT,
  text TEXT NOT NULL,
  "parentId" INT,
  "sourceRef" TEXT,
  asil TEXT NOT NULL DEFAULT 'QM',
  "asilInherited" BOOLEAN NOT NULL DEFAULT false,
  "asilDecomposed" JSONB,
  "safetyRelated" BOOLEAN NOT NULL DEFAULT true,
  "verificationMethod" TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  "aiBatch" TEXT,
  version INT NOT NULL DEFAULT 1,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fs_reqs_pid ON fs_safety_reqs("projectId");
CREATE INDEX IF NOT EXISTS idx_fs_reqs_parent ON fs_safety_reqs("parentId");

CREATE TABLE IF NOT EXISTS fs_fmeda (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  "fmedaId" TEXT NOT NULL,
  "targetRef" JSONB,
  asil TEXT NOT NULL DEFAULT 'D',
  item TEXT,
  rows JSONB,
  metrics JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  version INT NOT NULL DEFAULT 1,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fs_fmeda_pid ON fs_fmeda("projectId");

CREATE TABLE IF NOT EXISTS fs_fta (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  "ftaId" TEXT NOT NULL,
  "topEvent" TEXT NOT NULL,
  "topAsil" TEXT NOT NULL DEFAULT 'D',
  "rootRef" JSONB,
  tree JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fs_fta_pid ON fs_fta("projectId");

CREATE TABLE IF NOT EXISTS fs_dfa (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  "dfaId" TEXT NOT NULL,
  scope TEXT,
  asil TEXT NOT NULL DEFAULT 'D',
  rows JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fs_dfa_pid ON fs_dfa("projectId");

CREATE TABLE IF NOT EXISTS fs_safety_cases (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  title TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  nodes JSONB,
  gaps JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fs_cases_pid ON fs_safety_cases("projectId");

CREATE TABLE IF NOT EXISTS fs_confirm_measures (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  "cmId" TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  scope TEXT,
  "relatedAsil" TEXT NOT NULL DEFAULT 'QM',
  independence TEXT NOT NULL DEFAULT 'I1',
  evidence TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  "dueDate" BIGINT,
  assignee TEXT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fs_cm_pid ON fs_confirm_measures("projectId");

CREATE TABLE IF NOT EXISTS fs_plan_items (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  "plId" TEXT NOT NULL,
  phase TEXT NOT NULL,
  task TEXT NOT NULL,
  deliverable TEXT,
  asil TEXT NOT NULL DEFAULT 'QM',
  status TEXT NOT NULL DEFAULT 'planned',
  "naReason" TEXT,
  owner TEXT,
  "dueDate" BIGINT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fs_plan_pid ON fs_plan_items("projectId");

-- tuoleX FS 正式评估报告（二期 M3）：导出即冻结（快照 + SHA-256）
CREATE TABLE IF NOT EXISTS fs_reports (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  kind TEXT NOT NULL,
  "reportNo" TEXT NOT NULL,
  title TEXT NOT NULL,
  version TEXT NOT NULL,
  "snapshotHash" TEXT NOT NULL,
  snapshot JSONB,
  "createdBy" TEXT NOT NULL,
  "createdAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fs_reports_pid ON fs_reports("projectId");

-- Safety Case 论证模式库（二期 M4）：可复用推理骨架（平台级，不绑定项目）
CREATE TABLE IF NOT EXISTS fs_case_patterns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  tags JSONB NOT NULL DEFAULT '[]',
  nodes JSONB NOT NULL DEFAULT '[]',
  placeholders JSONB NOT NULL DEFAULT '[]',
  "createdBy" TEXT NOT NULL,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);

-- tuoleX FS 工具资质（ISO 26262-8:2018 Cl.11 TCL）
CREATE TABLE IF NOT EXISTS tq_tools (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  vendor TEXT,
  version TEXT,
  "intendedUse" TEXT NOT NULL,
  "lifecyclePhase" TEXT,
  "toolType" TEXT,
  owner TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tq_tools_pid ON tq_tools("projectId");
CREATE TABLE IF NOT EXISTS tq_assessments (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  code TEXT NOT NULL,
  "toolId" INT NOT NULL,
  scenario TEXT NOT NULL,
  ti TEXT NOT NULL,
  td TEXT NOT NULL,
  tcl TEXT NOT NULL,
  rationale TEXT,
  "asilTarget" TEXT,
  "overrideTcl" TEXT,
  "overrideReason" TEXT,
  conclusion TEXT,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tq_assess_pid ON tq_assessments("projectId");
CREATE INDEX IF NOT EXISTS idx_tq_assess_tool ON tq_assessments("toolId");
CREATE TABLE IF NOT EXISTS tq_measures (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  "assessmentId" INT NOT NULL,
  method TEXT NOT NULL,
  description TEXT,
  evidence TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tq_meas_pid ON tq_measures("projectId");
CREATE INDEX IF NOT EXISTS idx_tq_meas_assess ON tq_measures("assessmentId");

-- ============ 项目管理：计划中枢（软件过程 A-SPICE）============
CREATE TABLE IF NOT EXISTS plan_tasks (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  "phaseCode" TEXT NOT NULL DEFAULT 'SYS',
  owner TEXT,
  "startMs" BIGINT NOT NULL,
  "endMs" BIGINT NOT NULL,
  "baseStartMs" BIGINT,
  "baseEndMs" BIGINT,
  progress INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'todo',
  critical BOOLEAN NOT NULL DEFAULT false,
  deps JSONB NOT NULL DEFAULT '[]',
  "parentCode" TEXT,
  "isGroup" BOOLEAN NOT NULL DEFAULT false,
  seq INT NOT NULL DEFAULT 0,
  description TEXT,
  priority TEXT,
  "actualStartMs" BIGINT,
  "actualEndMs" BIGINT,
  "estimateHours" NUMERIC,
  "scheduleConstraint" TEXT,
  "progressMode" TEXT NOT NULL DEFAULT 'manual',
  tags JSONB NOT NULL DEFAULT '[]',
  assignees JSONB NOT NULL DEFAULT '[]',
  refs JSONB NOT NULL DEFAULT '[]',
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_tasks_project ON plan_tasks("projectId");

CREATE TABLE IF NOT EXISTS plan_milestones (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'TR',
  "phaseCode" TEXT NOT NULL,
  "dateMs" BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  description TEXT,
  "milestoneType" TEXT NOT NULL DEFAULT 'gate',
  deliverables JSONB NOT NULL DEFAULT '[]',
  "decisionBody" TEXT,
  "decisionBy" TEXT,
  "actualDateMs" BIGINT,
  refs JSONB NOT NULL DEFAULT '[]',
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_ms_project ON plan_milestones("projectId");

CREATE TABLE IF NOT EXISTS plan_dependencies (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  "fromCode" TEXT NOT NULL,
  "toCode" TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'FS',
  "lagMs" BIGINT NOT NULL DEFAULT 0,
  "createdAt" BIGINT NOT NULL,
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_dep_project ON plan_dependencies("projectId");

CREATE TABLE IF NOT EXISTS plan_baselines (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  name TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  "frozenAt" BIGINT NOT NULL,
  "frozenBy" TEXT NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}',
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_plan_bl_project ON plan_baselines("projectId");

CREATE TABLE IF NOT EXISTS plan_assignments (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  "taskCode" TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  percent INT NOT NULL DEFAULT 100,
  hours NUMERIC
);
CREATE INDEX IF NOT EXISTS idx_plan_asg_project ON plan_assignments("projectId");

CREATE TABLE IF NOT EXISTS plan_calendars (
  id SERIAL PRIMARY KEY,
  "projectId" INT NOT NULL,
  name TEXT NOT NULL DEFAULT '默认日历',
  "weekendOff" BOOLEAN NOT NULL DEFAULT true,
  holidays JSONB NOT NULL DEFAULT '[]',
  "updatedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_cal_project ON plan_calendars("projectId");
`;

// 表白名单（防注入：路由层只允许操作这些表）
export const TABLES = [
  'users', 'audit_logs', 'regulations', 'guides', 'projects', 'vdocs', 'signatures',
  'change_controls', 'deviations', 'capas', 'fmea_items', 'req_items', 'test_cases', 'trace_links', 'seqs',
  'documents', 'entry_versions', 'doc_versions',
  'aspice_processes', 'work_products', 'reviews', 'assessments', 'wp_templates',
  'config_items', 'baselines',
  'feedback', 'feedback_comments', 'project_members', 'ebom_docs',
  // tuoleX FS 功能安全域
  'fs_hazards', 'fs_safety_reqs', 'fs_fmeda', 'fs_fta', 'fs_dfa', 'fs_safety_cases', 'fs_confirm_measures', 'fs_plan_items', 'fs_reports',
  // Safety Case 论证模式库（平台级）
  'fs_case_patterns',
  // tuoleX FS 工具资质（ISO 26262-8 Cl.11 TCL）
  'tq_tools', 'tq_assessments', 'tq_measures',
  // 注意：ai_configs（含 apiKey 明文）不进表白名单——仅 admin 专用路由 /api/ai/config 可读写，
  // 若进 TABLES 则 crud /api/data/ai_configs 会对所有登录用户开放（无项目过滤）→ 密钥泄露
  'plan_tasks', 'plan_milestones', 'plan_dependencies', 'plan_baselines', 'plan_assignments', 'plan_calendars',
] as const;

export type TableName = (typeof TABLES)[number];

export function isTable(name: string): name is TableName {
  return (TABLES as readonly string[]).includes(name);
}

export async function initSchema(): Promise<void> {
  await pool.query(SCHEMA);
  // 增量迁移：用户界面语言偏好（auth 路由 SELECT/INSERT 依赖，缺列会导致登录崩溃）
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS lang TEXT NOT NULL DEFAULT 'zh'");
  // 增量迁移：演示项目标记（试用账号只入演示项目，只读）
  await pool.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false');
  await pool.query(`UPDATE projects SET "isDemo" = true WHERE "isDemo" = false AND (description LIKE '%演示%' OR description LIKE '%示例项目%')`);
  // 法规表 publishDate 排序索引（TEXT 列 B-tree；类型改 DATE 属后续数据治理项）
  await pool.query('CREATE INDEX IF NOT EXISTS idx_reg_publish ON regulations("publishDate")');
  // 增量迁移：旧库补 pinned_at（置顶）列
  await pool.query('ALTER TABLE feedback ADD COLUMN IF NOT EXISTS pinned_at BIGINT');
  // 增量迁移：tuoleX FS M2——fs_hazards 来源包标注 / projects 产品域（fsSysType=行业包 id）
  await pool.query('ALTER TABLE fs_hazards ADD COLUMN IF NOT EXISTS "srcPack" TEXT');
  await pool.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS "fsSysType" TEXT');
  // 增量迁移：change_controls 审批工作流字段
  await pool.query('ALTER TABLE change_controls ADD COLUMN IF NOT EXISTS "proposedBy" TEXT');
  await pool.query('ALTER TABLE change_controls ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT NOT NULL DEFAULT \'draft\'');
  await pool.query('ALTER TABLE change_controls ADD COLUMN IF NOT EXISTS "approvedBy" TEXT');
  await pool.query('ALTER TABLE change_controls ADD COLUMN IF NOT EXISTS "approvedAt" BIGINT');
  await pool.query('ALTER TABLE change_controls ADD COLUMN IF NOT EXISTS "signatureId" INT');
  await pool.query('ALTER TABLE change_controls ADD COLUMN IF NOT EXISTS "reviewComment" TEXT');
  // 增量迁移：社区公开提交（2026-10-01）—— 允许匿名（author_id 可空）+ 审核溯源列
  await pool.query('ALTER TABLE feedback ALTER COLUMN author_id DROP NOT NULL');
  await pool.query("ALTER TABLE feedback ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'platform'");
  await pool.query('ALTER TABLE feedback ADD COLUMN IF NOT EXISTS sensitive_hits JSONB');
  await pool.query('ALTER TABLE feedback ADD COLUMN IF NOT EXISTS submit_ip TEXT');
  await pool.query('ALTER TABLE feedback_comments ADD COLUMN IF NOT EXISTS sensitive_hits JSONB');
  await pool.query('ALTER TABLE feedback_comments ADD COLUMN IF NOT EXISTS submit_ip TEXT');
  // 增量迁移：ebom_docs 原始 STEP 内容（3D 预览用）
  await pool.query('ALTER TABLE ebom_docs ADD COLUMN IF NOT EXISTS "sourceContent" TEXT');
  await pool.query('ALTER TABLE ebom_docs ADD COLUMN IF NOT EXISTS mesh JSONB');
  // 增量迁移：assessments 关联证据（WP ID 列表）
  await pool.query('ALTER TABLE assessments ADD COLUMN IF NOT EXISTS "evidenceLinks" JSONB');
  // 增量迁移：fs_confirm_measures 评估结论（FSA 三态）
  await pool.query('ALTER TABLE fs_confirm_measures ADD COLUMN IF NOT EXISTS outcome TEXT');
  // 增量迁移：fmea_items 可选 ASIL 标注（安全分析升级）
  await pool.query('ALTER TABLE fmea_items ADD COLUMN IF NOT EXISTS asil TEXT');
  // 增量迁移：fs_safety_reqs 分解原级（X(Y) 记号与按原级取度量/独立性）
  await pool.query('ALTER TABLE fs_safety_reqs ADD COLUMN IF NOT EXISTS "asilFrom" TEXT');
  // 增量迁移：projects 启用 tuoleX FS 功能安全域（fsEnabled 项目隐藏 ASPICE 过程区）
  await pool.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS "fsEnabled" BOOLEAN NOT NULL DEFAULT false');
  await pool.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS "fsVersion" TEXT');
}
