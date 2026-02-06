# WA Leads API

API para capturar leads por WhatsApp Cloud, persistir conversaciones en Supabase y responder con un árbol conversacional (texto, botones y listas).

## Características

- Webhook de WhatsApp Cloud con validación HMAC opcional por tenant.
- Motor de conversación basado en árbol con respuestas de texto, botones y listas.
- Persistencia en Supabase: conversaciones, deduplicación, tenants, miembros y credenciales.
- API protegida con JWT de Supabase.
- OpenAPI + Swagger UI disponible en desarrollo.

## Requisitos

- Node.js 20+
- Proyecto Supabase (URL, Service Role Key y Anon Key)
- Credenciales de WhatsApp Cloud (phone number id, access token, verify token, app secret)

## Instalación

```bash
npm install
```

## Ejecución

```bash
npm run dev
```

Producción:

```bash
npm run build
npm start
```

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `NODE_ENV` | `development` \| `test` \| `production` (default `development`) |
| `PORT` | Puerto del servidor (default 3000) |
| `LOG_LEVEL` | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent` |
| `WHATSAPP_GRAPH_VERSION` | Versión de la API (default `v24.0`) |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key de Supabase |
| `SUPABASE_ANON_KEY` | Anon Key de Supabase (para login con email/password) |

Crea un `.env` con estos valores o copia `.env.example` como base.

Ejemplo `.env.example` actual:

```bash
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
WHATSAPP_GRAPH_VERSION=v24.0
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
```

Nota: el backend también soporta `WHATSAPP_ACCESS_TOKEN` como fallback si el tenant no tiene token propio, pero no está en `.env.example`.

## Base de datos (Supabase)

Ejecuta `schema.sql` en el editor SQL de Supabase para crear las tablas y extensiones necesarias.

Tablas principales:

- `tenants`
- `tenant_whatsapp`
- `tenant_trees`
- `tenant_users`
- `conversations`
- `wa_inbound_dedupe`

## Flujo de configuración inicial

1. Ejecuta el esquema en Supabase (`schema.sql`).
2. Registra un usuario con `POST /auth/register` (o créalo directamente en Supabase Auth).
3. Inicia sesión con `POST /auth/sessions` para obtener el JWT.
4. Crea un tenant con `POST /api/v1/tenants` (puedes repetirlo para múltiples negocios).
5. Configura las credenciales de WhatsApp con `POST /api/v1/tenants/:tenantId/whatsapp`.
6. Registra el webhook de WhatsApp Cloud apuntando a `/webhooks/whatsapp`.
7. (Opcional) Define un árbol personalizado con `PUT /api/v1/tenants/:tenantId/tree`.

## Webhook de WhatsApp

- `GET /webhooks/whatsapp` valida el `hub.verify_token` contra el `verify_token` almacenado en `tenant_whatsapp`.
- `POST /webhooks/whatsapp` procesa mensajes entrantes y envía respuestas según el árbol configurado.
- Si el tenant tiene `meta_app_secret`, se valida el header `x-hub-signature-256`. Si no existe, no se valida firma.
- El `access_token` se toma del tenant; si no está definido, usa `WHATSAPP_ACCESS_TOKEN` como fallback.

## Árbol conversacional

El árbol por defecto vive en `src/bot/tree.ts`. Cada nodo define el tipo de respuesta y la transición. El API expone `GET /api/v1/tenants/:tenantId/tree` para consultarlo y `PUT /api/v1/tenants/:tenantId/tree` para guardarlo.

Ejemplo de estructura básica:

```json
{
  "tree": {
    "nodes": {
      "start": {
        "type": "list",
        "body": "¿Qué te interesa?",
        "saveAs": "service",
        "options": [
          { "id": "rent", "title": "Renta", "next": "date" }
        ]
      },
      "date": {
        "type": "text",
        "body": "¿Para qué fecha lo necesitas?",
        "saveAs": "date",
        "next": "done"
      },
      "done": {
        "type": "end",
        "body": "Gracias. Te contactamos pronto."
      }
    }
  }
}
```

Requisitos del árbol:

- Debe existir el nodo `start`.
- Todos los `next` deben apuntar a nodos válidos.
- Tipos soportados: `text`, `list`, `buttons`, `end`.

## Endpoints

Públicos:

- `GET /health` estado del servicio.
- `GET /privacy` aviso de privacidad.
- `POST /auth/register` registro con email/password (Supabase).
- `POST /auth/sessions` login con email/password (Supabase).
- `POST /auth/token` (deprecated, alias temporal de `/auth/sessions`).
- `GET /webhooks/whatsapp` verificación de webhook.
- `POST /webhooks/whatsapp` entrada de mensajes.

Protegidos (Bearer JWT de Supabase, versión actual `/api/v1`; `/api` queda como alias temporal deprecado):

- `GET /api/v1/me` datos del usuario autenticado.
- `GET /api/v1/users/:uid` obtiene información pública de un usuario por UID.
- `POST /api/v1/tenants` crea un tenant y asigna `tenant_admin` al creador.
- `GET /api/v1/tenants/:tenantId/conversations` lista conversaciones del tenant.
  Respuesta incluye `data.pagination` con `limit`, `offset`, `total`, `hasMore`.
- `GET /api/v1/tenants/:tenantId/conversations/:slug` obtiene una conversación por slug.
- `GET /api/v1/tenants/:tenantId/whatsapp` consulta credenciales del tenant.
- `POST /api/v1/tenants/:tenantId/whatsapp` crea o actualiza credenciales del tenant.
- `GET /api/v1/tenants/:tenantId/tree` obtiene el árbol del tenant.
- `PUT /api/v1/tenants/:tenantId/tree` crea o actualiza el árbol del tenant.
- `GET /api/v1/tenants/:tenantId/members` lista miembros del tenant.
- `POST /api/v1/tenants/:tenantId/members` agrega o actualiza miembros.

Documentación OpenAPI:

- `GET /docs` solo en `NODE_ENV=development`.
- El archivo fuente es `openapi.yaml`.

## Roles

- `tenant_admin`: administra credenciales, árbol y miembros.
- `agent`: puede listar miembros y ver conversaciones.
- `viewer`: lectura de conversaciones.

## Pruebas locales del webhook

1. Expón tu servidor con `ngrok` o `cloudflared`.
2. Configura el callback en Meta con la URL `/webhooks/whatsapp`.
3. Envía un mensaje al número de prueba y revisa los logs.

## Docker

```bash
docker build -t wa-leads-api .
docker run -p 3000:3000 --env-file .env wa-leads-api
```

## Render

El archivo `render.yaml` incluye el servicio web y variables base para despliegue.

## Scripts útiles

- `npm run dev` modo desarrollo.
- `npm run build` compila TypeScript.
- `npm start` inicia el servidor desde `dist/`.
- `npm run lint` ejecuta ESLint.
- `npm run format` aplica Prettier.
