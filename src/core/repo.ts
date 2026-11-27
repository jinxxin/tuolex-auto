import { db } from './db';

// ============ 通用数据访问层（PostgreSQL 后端）============
// 与旧 IndexedDB 实现接口完全一致；审计日志由服务端强制落库。

export interface Actor {
  id: number;
  username: string;
}

export type TableName = 'regulations' | 'guides' | 'projects' | 'vdocs' | 'change_controls' | 'fmea_items' | 'users' | 'req_items' | 'test_cases' | 'trace_links' | 'documents' | 'work_products' | 'aspice_processes' | 'reviews' | 'assessments' | 'wp_templates' | 'config_items' | 'baselines' | 'plan_tasks' | 'plan_milestones' | 'plan_dependencies' | 'plan_baselines' | 'plan_assignments' | 'plan_calendars';

function tableOf(name: TableName) {
  return db[name] as any;
}

export async function listAll<T>(name: TableName): Promise<T[]> {
  return tableOf(name).orderBy('id').toArray();
}

export async function getById<T>(name: TableName, id: number): Promise<T | undefined> {
  return tableOf(name).get(id);
}

export async function createRecord<T extends { id?: number }>(
  name: TableName,
  data: T,
  _actor: Actor,
  summary: string,
): Promise<number> {
  return tableOf(name).add(data, summary);
}

export async function updateRecord<T extends { id?: number }>(
  name: TableName,
  id: number,
  patch: Partial<T>,
  _actor: Actor,
  summary: string,
): Promise<void> {
  await tableOf(name).update(id, patch, summary);
}

export async function deleteRecord(
  name: TableName,
  id: number,
  _actor: Actor,
  summary: string,
): Promise<void> {
  await tableOf(name).delete(id, summary);
}
