import 'dotenv/config';

import { createServer } from './server';
import { env } from './config/env';
import pino from 'pino';

const logger = pino({ level: env.LOG_LEVEL });
const app = createServer({ logger });

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV, version: env.APP_VERSION }, 'server listening');
});
