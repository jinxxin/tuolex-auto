import express from 'express';
import cors from 'cors';
import { config } from './config';
import { viewerReadonly } from './auth';
import { initSchema } from './db';
import { seedIfNeeded } from './seed';
import crudRoutes from './routes/crud';
import authRoutes from './routes/auth';
import seqRoutes from './routes/seq';
import auditRoutes from './routes/audit';
import signatureRoutes from './routes/signature';
import feedbackRoutes from './routes/feedback';
import projectsRoutes from './routes/projects';
import baselineRoutes from './routes/baseline';
import qualityRoutes from './routes/quality';

async function main() {
  await initSchema();
  await seedIfNeeded();
  console.log('[tuolex-auto] 数据库就绪');

  const app = express();
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '50mb' }));

  // 演示账号（viewer）全局只读守卫
  app.use('/api', viewerReadonly);

  app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'tuolex-auto-server' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/data', crudRoutes);
  app.use('/api/seq', seqRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/signatures', signatureRoutes);
  app.use('/api/feedback', feedbackRoutes);
  app.use('/api/projects', projectsRoutes);
  app.use('/api/quality', qualityRoutes);
  app.use('/api/baseline', baselineRoutes);
    // 共享 BOM（只读，经委托 token 调 BOM 服务）
      
  // 统一错误处理
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[tuolex-auto] 未捕获错误:', err);
    res.status(500).json({ error: err.message });
  });

  app.listen(config.port, () => {
    console.log(`[tuolex-auto] 监听 http://0.0.0.0:${config.port}`);
  });
}

main().catch((e) => {
  console.error('[tuolex-auto] 启动失败:', e);
  process.exit(1);
});
