// ============ 服务配置（环境变量优先，docker-compose 注入）============
import { randomBytes } from 'node:crypto';

const envSecret = process.env.JWT_SECRET;
if (!envSecret) {
  console.warn('[config] JWT_SECRET 未设置，本次启动使用随机密钥（重启后所有会话失效）。生产环境请显式配置。');
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  pg: {
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? 'tuolex_auto',
    user: process.env.PGUSER ?? 'tuolex',
    password: process.env.PGPASSWORD ?? 'tuolex',
  },
  jwtSecret: envSecret || randomBytes(32).toString('hex'),
  jwtExpires: process.env.JWT_EXPIRES ?? '12h',
  // 允许的前端来源（CORS）
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:8087').split(','),
};
