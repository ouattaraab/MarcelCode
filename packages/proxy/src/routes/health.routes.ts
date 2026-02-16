import { Router, Request, Response } from 'express';
import { getPrisma, getRedis } from '../config';

export const healthRoutes = Router();

healthRoutes.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

healthRoutes.get('/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, string> = {};

  try {
    await getPrisma().$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  try {
    const pong = await getRedis().ping();
    checks.redis = pong === 'PONG' ? 'ok' : 'error';
  } catch {
    checks.redis = 'error';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');
  res.status(allOk ? 200 : 503).json({ status: allOk ? 'ready' : 'degraded', checks });
});
