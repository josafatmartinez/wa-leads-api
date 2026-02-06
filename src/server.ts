import express, { type Request, type Response } from 'express';
import type { Logger } from 'pino';
import { randomUUID } from 'node:crypto';

import { healthRouter } from './routes/health';
import { privacyRouter } from './routes/privacy';
import { createWhatsappRouter } from './routes/whatsapp';
import { authRouter } from './routes/auth';
import { protectedRouter } from './routes/protected';
import { createDocsRouter } from './routes/docs';
import { errorHandler } from './middlewares/errorHandler';
import { env } from './config/env';

type CreateServerOptions = {
  logger: Logger;
};

export function createServer({ logger }: CreateServerOptions) {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    express.json({
      limit: '1mb',
      verify: (req: Request, _res: Response, buf: Buffer) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  app.use((req: Request, res: Response, next) => {
    const requestId = req.header('x-request-id') || randomUUID();
    res.setHeader('x-request-id', requestId);
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const details = {
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
      };

      if (res.statusCode >= 500) {
        logger.error(details, 'HTTP 5xx');
      } else if (res.statusCode >= 400) {
        logger.warn(details, 'HTTP 4xx');
      } else {
        logger.info(details, 'HTTP OK');
      }
    });

    next();
  });

  app.get('/', (_req: Request, res: Response) => res.redirect('/health'));
  app.use('/health', healthRouter);
  app.use('/privacy', privacyRouter);
  app.use('/auth', authRouter);
  app.use(
    '/api',
    (req: Request, res: Response, next) => {
      if (!req.originalUrl.startsWith('/api/v1/')) {
        res.setHeader('Deprecation', 'true');
        res.setHeader('Sunset', 'Wed, 31 Dec 2026 23:59:59 GMT');
      }
      next();
    },
    protectedRouter,
  );
  app.use('/api/v1', protectedRouter);
  if (env.NODE_ENV === 'development') {
    app.use('/docs', createDocsRouter());
  }
  app.use('/webhooks/whatsapp', createWhatsappRouter(logger.child({ scope: 'whatsapp-webhook' })));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ ok: false, error: { message: 'Not Found' } });
  });

  app.use(errorHandler(logger));
  return app;
}
