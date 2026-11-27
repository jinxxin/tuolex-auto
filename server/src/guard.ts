// ============ 公开入口防护：客户端 IP + 内存滑动窗口限流 ============
import type { Request } from 'express';

const buckets = new Map<string, number[]>();

/** 取真实客户端 IP：优先 X-Real-IP，其次 XFF 首段（边缘代理覆盖写入），最后连接地址 */
export function clientIp(req: Request): string {
  const real = String(req.headers['x-real-ip'] ?? '').trim();
  if (real) return real;
  const xff = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const anyReq = req as unknown as { socket?: { remoteAddress?: string } };
  return xff || anyReq.socket?.remoteAddress || 'unknown';
}

/** 滑动窗口限流：key 在 windowMs 内最多 limit 次；返回 false 表示超限 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  // 轻量清理，避免 Map 无限增长
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
    }
  }
  return true;
}
