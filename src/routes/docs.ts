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
  router.get('/openapi.json', (req, res) => {
    const document = loadSpec() as Record<string, unknown>;
    const forwardedProto = req.header('x-forwarded-proto');
    const protocol = forwardedProto?.split(',')[0]?.trim() || req.protocol;
    const host = req.get('host');
    const origin = host ? `${protocol}://${host}` : undefined;

    const dynamicDocument = {
      ...document,
      servers: origin
        ? [{ url: origin, description: 'Current host' }]
        : ((document.servers as unknown[]) ?? []),
    };

    res.json(dynamicDocument);
  });

  router.use(
    '/',
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      swaggerOptions: {
        url: '/docs/openapi.json',
      },
    }),
  );
  return router;
}
