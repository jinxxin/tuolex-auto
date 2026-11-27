// ============ 数据层（PostgreSQL 后端）============
// 原为 IndexedDB(Dexie)，现切换到后端 API。接口形状保持兼容（get/add/put/delete/where/orderBy…）。
// 业务代码无需改动；写操作由服务端统一落审计日志。

import { TableClient, transaction } from './api';
import type {
  User, AuditLog, Regulation, Guide, Project, VDoc, SignatureRecord, ChangeControl, Deviation, Capa, FmeaItem,
  ReqItem, TestCase, TraceLink, SeqCounter, DocRecord, EntryVersion, DocVersion, EbomDoc,
  AspiceProcess, WorkProduct, ReviewRecord, Assessment, WpTemplate, ConfigItem, Baseline,
  FsHazard, FsSafetyReq, FsFmeda, FsFta, FsDfa, FsSafetyCase, FsConfirmMeasure, FsPlanItem, FsReport, FsCasePattern,
  TqTool, TqAssessment, TqMeasure,
  PlanTask, PlanMilestone, PlanDependency, PlanBaseline, PlanAssignment, PlanCalendar,
} from './types';

// 事务（兼容调用：db.transaction('rw', db.seqs, fn)）—— 后端保证原子性，前端直接执行
export async function dbTransaction<T>(mode: 'rw' | 'r', tables: unknown, fn: () => Promise<T>): Promise<T> {
  return transaction(mode, tables, fn);
}

export const db = {
  users: new TableClient<User>('users'),
  audit_logs: new TableClient<AuditLog>('audit_logs'),
  regulations: new TableClient<Regulation>('regulations'),
  guides: new TableClient<Guide>('guides'),
  projects: new TableClient<Project>('projects'),
  vdocs: new TableClient<VDoc>('vdocs'),
  signatures: new TableClient<SignatureRecord>('signatures'),
  change_controls: new TableClient<ChangeControl>('change_controls'),
  deviations: new TableClient<Deviation>('deviations'),
  capas: new TableClient<Capa>('capas'),
  fmea_items: new TableClient<FmeaItem>('fmea_items'),
  ebom_docs: new TableClient<EbomDoc>('ebom_docs'),
  req_items: new TableClient<ReqItem>('req_items'),
  test_cases: new TableClient<TestCase>('test_cases'),
  trace_links: new TableClient<TraceLink>('trace_links'),
  seqs: new TableClient<SeqCounter>('seqs'),
  documents: new TableClient<DocRecord>('documents'),
  entry_versions: new TableClient<EntryVersion>('entry_versions'),
  doc_versions: new TableClient<DocVersion>('doc_versions'),
  // A-SPICE 扩展表
  aspice_processes: new TableClient<AspiceProcess>('aspice_processes'),
  work_products: new TableClient<WorkProduct>('work_products'),
  reviews: new TableClient<ReviewRecord>('reviews'),
  assessments: new TableClient<Assessment>('assessments'),
  config_items: new TableClient<ConfigItem>('config_items'),
  baselines: new TableClient<Baseline>('baselines'),
  wp_templates: new TableClient<WpTemplate>('wp_templates'),
  // tuoleX FS 功能安全域
  fs_hazards: new TableClient<FsHazard>('fs_hazards'),
  fs_safety_reqs: new TableClient<FsSafetyReq>('fs_safety_reqs'),
  fs_fmeda: new TableClient<FsFmeda>('fs_fmeda'),
  fs_fta: new TableClient<FsFta>('fs_fta'),
  fs_dfa: new TableClient<FsDfa>('fs_dfa'),
  fs_safety_cases: new TableClient<FsSafetyCase>('fs_safety_cases'),
  fs_confirm_measures: new TableClient<FsConfirmMeasure>('fs_confirm_measures'),
  fs_plan_items: new TableClient<FsPlanItem>('fs_plan_items'),
  fs_reports: new TableClient<FsReport>('fs_reports'),
  fs_case_patterns: new TableClient<FsCasePattern>('fs_case_patterns'),
  // tuoleX FS 工具资质（Cl.11 TCL）
  tq_tools: new TableClient<TqTool>('tq_tools'),
  tq_assessments: new TableClient<TqAssessment>('tq_assessments'),
  tq_measures: new TableClient<TqMeasure>('tq_measures'),
  plan_tasks: new TableClient<PlanTask>('plan_tasks'),
  plan_milestones: new TableClient<PlanMilestone>('plan_milestones'),
  plan_dependencies: new TableClient<PlanDependency>('plan_dependencies'),
  plan_baselines: new TableClient<PlanBaseline>('plan_baselines'),
  plan_assignments: new TableClient<PlanAssignment>('plan_assignments'),
  plan_calendars: new TableClient<PlanCalendar>('plan_calendars'),
  transaction: dbTransaction,
};

export type DB = typeof db;
