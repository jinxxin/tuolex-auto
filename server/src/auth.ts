import type { NextFunction, Request, Response } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from './config';

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: config.jwtExpires } as SignOptions);
}

export function authRequired(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: '未登录或会话已过期' });
    return;
  }
  try {
    req.user = jwt.verify(token, config.jwtSecret) as AuthUser;
    next();
  } catch {
    res.status(401).json({ error: '未登录或会话已过期' });
  }
}


/** 演示账号（viewer）只读：拦截一切写操作（GET/HEAD/OPTIONS 放行） */
export function viewerReadonly(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  // 自助接口放行（qa D6）：改本人密码 / 界面语言偏好
  const url = String(req.originalUrl || '');
  // 数据问答是只读语义（POST 但不落业务数据）：viewer/试用账号也要能用
  if (url.indexOf('/api/assist/') > -1) { next(); return; }
  if (url.indexOf('/auth/change-password') > -1 || url.indexOf('/auth/lang') > -1) {
    next();
    return;
  }
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (token) {
    try {
      const p = jwt.verify(token, config.jwtSecret) as AuthUser;
      if (p.role === 'viewer') {
        res.status(403).json({ error: '演示账号为只读权限，如需编辑请使用正式账号或联系管理员' });
        return;
      }
    } catch {
      // 无效/过期 token 交由后续 authRequired 处理
    }
  }
  next();
}
