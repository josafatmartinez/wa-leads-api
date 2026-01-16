import type { ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({ ok: false, error: { message: 'Bad Request', issues: err.issues } });
      return;
    }

    const message = err instanceof Error ? err.message : 'Internal Server Error';
    logger.error({ err }, 'request error');
    res.status(500).json({ ok: false, error: { message } });
  };
}
