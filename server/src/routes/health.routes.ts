import { Router, Request, Response } from 'express';
import { checkDatabaseConnection } from '../config/supabase.js';

const router = Router();

router.get('/health', async (req: Request, res: Response) => {
  const dbStatus = await checkDatabaseConnection();

  res.status(dbStatus.connected ? 200 : 503).json({
    status: dbStatus.connected ? 'ok' : 'degraded',
    service: 'jumble-sale-nodejs-api',
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      provider: 'Supabase PostgreSQL',
      connected: dbStatus.connected,
      latencyMs: dbStatus.latencyMs,
      error: dbStatus.error || null,
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
