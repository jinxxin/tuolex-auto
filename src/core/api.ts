// ============ 后端 API 客户端 ============
// 模拟 Dexie Table 的接口形状，让业务代码无感切换到 PostgreSQL 后端。
// 响应式：写操作触发 db-changed 事件，useLiveQuery 自动重新查询。

import { useEffect, useState } from 'react';
import { apiErrorMsg } from './apiErrors';
import { isEn } from '../i18n';

export const TOKEN_KEY = 'tuolex_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ============ fetch 封装（带 token / 401 处理）============
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  // BASE_URL 跟随 vite base（方案A 路径前缀 /csv/ 等；过渡到子域方案B 时自动变 /，零改动）
  const res = await fetch(`${import.meta.env.BASE_URL}api${path}`, { ...options, headers });
  if (res.status === 401) {
    // 区分「会话过期」与「业务失败」（如登录密码错误）：
    // 服务端 authRequired 中间件固定返回「未登录或会话已过期」；其他 401 为业务错误，透传真实原因
    let bodyErr = '';
    try { bodyErr = ((await res.json()) as { error?: string })?.error ?? ''; } catch { /* ignore */ }
    if (bodyErr === '未登录或会话已过期' || !bodyErr) {
      clearToken();
      window.dispatchEvent(new Event('auth-expired'));
    }
    throw new ApiError(401, apiErrorMsg(bodyErr || '未登录或会话已过期', 401, isEn()));
  }
  if (!res.ok) {
    let msg = `请求失败 (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch { /* ignore */ }
    throw new ApiError(res.status, apiErrorMsg(msg, res.status, isEn()));
  }
  return res;
}

// ============ 响应式事件总线 ============
type Listener = () => void;
const listeners = new Set<Listener>();

export function notifyDbChanged(): void {
  listeners.forEach((l) => { try { l(); } catch { /* ignore */ } });
}

export function subscribeDbChanged(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

// ============ useLiveQuery（模拟 dexie-react-hooks）============
export function useLiveQuery<T>(
  querier: () => Promise<T>,
  deps: readonly unknown[] = [],
): T | undefined {
  const [result, setResult] = useState<T | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      querier()
        .then((r) => { if (!cancelled) setResult(r); })
        .catch((e) => { if (!cancelled) console.error('[api] liveQuery 失败:', e); });
    };
    run();
    const unsub = subscribeDbChanged(run);
    return () => { cancelled = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps]);

  return result;
}

// ============ 查询构造 ============
export interface QuerySpec {
  table: string;
  where?: Record<string, unknown>;
  orderBy?: string;
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  sortBy?: string; // 前端排序（复合键 sortBy）
}

async function runQuery(spec: QuerySpec): Promise<any[]> {
  const qs = new URLSearchParams();
  if (spec.where && Object.keys(spec.where).length) qs.set('where', JSON.stringify(spec.where));
  if (spec.orderBy) qs.set('orderBy', spec.orderBy);
  if (spec.dir) qs.set('dir', spec.dir);
  if (spec.limit !== undefined) qs.set('limit', String(spec.limit));
  if (spec.offset) qs.set('offset', String(spec.offset));
  const res = await apiFetch(`/data/${spec.table}?${qs.toString()}`);
  let rows = (await res.json()) as any[];
  if (spec.sortBy) rows = rows.sort((a, b) => (a[spec.sortBy!] ?? 0) > (b[spec.sortBy!] ?? 0) ? 1 : -1);
  return rows;
}

// ============ 表客户端 ============
export class TableClient<T extends { id?: number }> {
  table: string;

  constructor(table: string) {
    this.table = table;
  }

  async get(id: number): Promise<T | undefined> {
    const res = await apiFetch(`/data/${this.table}/${id}`);
    return (await res.json()) as T;
  }

  async add(data: T, summary = '新增记录'): Promise<number> {
    const res = await apiFetch(`/data/${this.table}`, {
      method: 'POST',
      body: JSON.stringify({ data, summary }),
    });
    const row = (await res.json()) as T & { id: number };
    notifyDbChanged();
    return row.id;
  }

  async put(data: T, summary = '更新记录'): Promise<number> {
    if (data.id != null) {
      const res = await apiFetch(`/data/${this.table}/${data.id}`, {
        method: 'PUT',
        body: JSON.stringify({ data, summary }),
      });
      const row = (await res.json()) as T & { id: number };
      notifyDbChanged();
      return row.id;
    }
    return this.add(data, summary);
  }

  async update(id: number, changes: Partial<T>, summary = '更新记录'): Promise<void> {
    const current = await this.get(id);
    if (!current) throw new Error(`记录不存在: ${this.table}#${id}`);
    await this.put({ ...current, ...changes, id }, summary);
  }

  async delete(id: number, summary = '删除记录'): Promise<void> {
    await apiFetch(`/data/${this.table}/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ summary }),
    });
    notifyDbChanged();
  }

  async count(where?: Record<string, unknown>): Promise<number> {
    const qs = new URLSearchParams();
    if (where && Object.keys(where).length) qs.set('where', JSON.stringify(where));
    const res = await apiFetch(`/data/${this.table}/count?${qs.toString()}`);
    const body = await res.json();
    return body.count as number;
  }

  async toArray(): Promise<T[]> {
    return runQuery({ table: this.table }) as Promise<T[]>;
  }

  async bulkAdd(items: T[], summary = '批量新增'): Promise<number[]> {
    const ids: number[] = [];
    // 串行提交（后端每行自动审计，避免并发争用审计链锁）
    for (const item of items) {
      ids.push(await this.add(item, summary));
    }
    return ids;
  }

  where(field: string): WhereClause<T> {
    return new WhereClause<T>(this, field);
  }

  orderBy(field: string): OrderClause<T> {
    return new OrderClause<T>(this, field);
  }
}

// where('[a+b]').equals([x,y])
export class WhereClause<T extends { id?: number }> {
  private client: TableClient<T>;
  private field: string;

  constructor(client: TableClient<T>, field: string) {
    this.client = client;
    this.field = field;
  }

  private fields(): string[] {
    return this.field.startsWith('[') && this.field.endsWith(']')
      ? this.field.slice(1, -1).split('+').map((s) => s.trim())
      : [this.field];
  }

  equals(value: unknown): WhereResult<T> {
    const fs = this.fields();
    const where: Record<string, unknown> = {};
    if (fs.length > 1 && Array.isArray(value)) {
      (value as unknown[]).forEach((v, i) => { where[fs[i]] = v; });
    } else {
      where[fs[0]] = value;
    }
    return new WhereResult<T>(this.client, where);
  }

  anyOf(values: unknown[]): WhereResult<T> {
    const fs = this.fields();
    const where: Record<string, unknown> = { [fs[0]]: values };
    return new WhereResult<T>(this.client, where);
  }
}

export class WhereResult<T extends { id?: number }> {
  private client: TableClient<T>;
  private spec: QuerySpec;
  private predicate?: (item: T) => boolean;

  constructor(client: TableClient<T>, where: Record<string, unknown>, predicate?: (item: T) => boolean) {
    this.client = client;
    this.spec = { table: client.table, where };
    this.predicate = predicate;
  }

  // 内存过滤（兼容 Dexie 的 where().filter()）
  filter(pred: (item: T) => boolean): WhereResult<T> {
    const prev = this.predicate;
    return new WhereResult<T>(this.client, this.spec.where ?? {}, prev ? (x) => prev(x) && pred(x) : pred);
  }

  private async raw(): Promise<T[]> {
    let rows = await runQuery(this.spec) as T[];
    if (this.predicate) rows = rows.filter(this.predicate);
    return rows;
  }

  async toArray(): Promise<T[]> {
    return this.raw();
  }

  async first(): Promise<T | undefined> {
    const rows = await this.raw();
    return rows[0] as T | undefined;
  }

  async count(): Promise<number> {
    if (this.predicate) return (await this.raw()).length;
    const res = await apiFetch(`/data/${this.client.table}/count?where=${encodeURIComponent(JSON.stringify(this.spec.where ?? {}))}`);
    const body = await res.json();
    return body.count as number;
  }

  sortBy(field: string): Promise<T[]> {
    return runQuery({ ...this.spec, sortBy: field }) as Promise<T[]>;
  }
}

export class OrderClause<T extends { id?: number }> {
  private spec: QuerySpec;

  constructor(_client: TableClient<T>, field: string) {
    this.spec = { table: _client.table, orderBy: field, dir: 'asc' };
  }

  async toArray(): Promise<T[]> {
    return runQuery(this.spec) as Promise<T[]>;
  }

  reverse(): OrderClause<T> {
    this.spec = { ...this.spec, dir: this.spec.dir === 'asc' ? 'desc' : 'asc' };
    return this;
  }

  async last(): Promise<T | undefined> {
    const rows = await runQuery({ ...this.spec, dir: 'desc', limit: 1 });
    return rows[0] as T | undefined;
  }

  limit(n: number): OrderClause<T> {
    this.spec = { ...this.spec, limit: n };
    return this;
  }
}

// ============ 事务模拟（后端保证原子性，前端直接执行）============
export async function transaction<T>(
  _mode: 'rw' | 'r',
  _tables: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  return fn();
}
