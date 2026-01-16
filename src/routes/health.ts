import { Router } from 'express';
import { env } from '../config/env';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    version: env.APP_VERSION,
  });
});
