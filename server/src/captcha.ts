// ============ 图形验证码（本地签发 + 本地校验，无状态）============
// token = base64url(body).hmac(body)，body 含算式、过期时间与一次性 jti。
// 密钥取 CAPTCHA_SECRET，未配置时本进程随机（重启后旧 token 失效，可接受）。
import crypto from 'crypto';

const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || crypto.randomBytes(32).toString('hex');
const usedNonces = new Map<string, number>();

function hmac(s: string): string {
  return crypto.createHmac('sha256', CAPTCHA_SECRET).update(s).digest('hex').slice(0, 32);
}
function pruneNonces(): void {
  const now = Date.now();
  for (const [k, exp] of usedNonces) if (exp < now) usedNonces.delete(k);
}

/** 签发一条验证码：token 给前端原样带回，question 用于展示 */
export function issueCaptcha(): { token: string; question: string } {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const body = Buffer.from(
    JSON.stringify({ a, b, exp: Date.now() + 5 * 60 * 1000, jti: crypto.randomUUID() }),
    'utf8',
  ).toString('base64url');
  return { token: `${body}.${hmac(body)}`, question: `${a} + ${b} = ?` };
}

export function verifyCaptcha(token: unknown, answer: unknown): boolean {
  if (!token || typeof token !== 'string') return false;
  const [body, sig] = token.split('.');
  if (!body || !sig || hmac(body) !== sig) return false;
  try {
    const { a, b, exp, jti } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof exp !== 'number' || Date.now() > exp) return false;
    if (Number(answer) !== Number(a) + Number(b)) return false;
    pruneNonces();
    if (jti && usedNonces.has(jti)) return false; // 一次性
    if (jti) usedNonces.set(jti, exp);
    return true;
  } catch {
    return false;
  }
}
