import { apiFetch } from './api';

// ============ 编号计数器（服务端事务 + 行锁，并发安全）============
// 规则：编号由系统自动分配、不可修改；删除/废弃的编号直接跳过，不允许重新使用。
export async function nextSeq(projectId: number, prefix: string, pad = 3): Promise<string> {
  const res = await apiFetch('/seq/next', {
    method: 'POST',
    body: JSON.stringify({ projectId, prefix, pad }),
  });
  const body = await res.json();
  return body.seq as string;
}
