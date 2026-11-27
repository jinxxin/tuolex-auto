import { apiFetch } from './api';
import { sha256Hex } from './audit';
import type { SignatureRecord, User } from './types';

// ============ 密码（兼容旧逻辑；登录已由服务端 bcrypt 校验）============
export async function hashPassword(pwd: string, salt = 'csvhub-demo'): Promise<string> {
  return sha256Hex(`${salt}::${pwd}`);
}

export async function verifyPassword(user: User, pwd: string): Promise<boolean> {
  const h = await hashPassword(pwd);
  return h === user.passwordHash;
}

// ============ 电子签名（电子签核）============
// 签名记录、内容哈希、审计均由服务端完成（server/src/routes/signature.ts）。

// 当前登录用户签名（userId/username 以服务端会话为准）
export async function applySignature(params: {
  meaning: string;
  docType: string;
  docTitle: string;
  docVersion: string;
  docContent: unknown;
}): Promise<SignatureRecord> {
  const res = await apiFetch('/signatures/apply', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function verifySignature(id: number, currentContent: unknown): Promise<{
  valid: boolean; rec?: SignatureRecord; reason?: string;
}> {
  const res = await apiFetch('/signatures/verify', {
    method: 'POST',
    body: JSON.stringify({ id, content: currentContent }),
  });
  return res.json();
}

// 用户名+密码双要素签名（Part 11 演示）
export async function signWithPasswordCheck(
  username: string,
  pwd: string,
  params: { meaning: string; docType: string; docTitle: string; docVersion: string; docContent: unknown },
): Promise<SignatureRecord> {
  const res = await apiFetch('/signatures/sign-with-password', {
    method: 'POST',
    body: JSON.stringify({ username, password: pwd, ...params }),
  });
  return res.json();
}
