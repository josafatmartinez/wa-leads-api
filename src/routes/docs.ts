import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';

import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';

let cachedSpec: object | null = null;

function loadSpec() {
  if (cachedSpec) return cachedSpec;
  const specPath = path.resolve('openapi.yaml');
  const raw = fs.readFileSync(specPath, 'utf8');
  cachedSpec = YAML.parse(raw);
  return cachedSpec;
}

export function createDocsRouter() {
  const router = Router();
  router.use(
    '/',
    swaggerUi.serve,
    (req, res, next) => {
      const document = loadSpec();
      const host = `${req.protocol}://${req.get('host')}`;
      const specWithHost = {
        ...document,
        servers: [
          {
            url: host,
            description: 'Detected host from request',
          },
        ],
      };
      return swaggerUi.setup(specWithHost)(req, res, next);
    },
  );
  return router;
}
