import express, { type Request } from 'express';
import type { Logger } from 'pino';

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
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  app.get('/', (_req, res) => res.redirect('/health'));
  app.use('/health', healthRouter);
  app.use('/privacy', privacyRouter);
  app.use('/auth', authRouter);
  app.use('/api', protectedRouter);
  if (env.NODE_ENV === 'development') {
    app.use('/docs', createDocsRouter());
  }
  app.use('/webhooks/whatsapp', createWhatsappRouter(logger.child({ scope: 'whatsapp-webhook' })));

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: { message: 'Not Found' } });
  });

  app.use(errorHandler(logger));
  return app;
}
