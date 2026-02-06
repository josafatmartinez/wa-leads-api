import 'dotenv/config';

import { createServer } from './server';
import { env } from './config/env';
import pino from 'pino';

function createLogger() {
  if (env.NODE_ENV === 'development') {
    return pino({
      level: env.LOG_LEVEL,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      },
    });
  }

  return pino({ level: env.LOG_LEVEL });
}

const logger = createLogger();
const app = createServer({ logger });

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV, version: env.APP_VERSION }, 'server listening');
});
