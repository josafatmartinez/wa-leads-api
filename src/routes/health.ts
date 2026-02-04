import { Router, type Request, type Response } from 'express';
import { env } from '../config/env';

export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    version: env.APP_VERSION,
  });
});
