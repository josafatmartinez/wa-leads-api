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
  const document = loadSpec();
  router.use('/', swaggerUi.serve, swaggerUi.setup(document));
  return router;
}
