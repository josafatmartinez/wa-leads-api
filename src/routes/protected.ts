import { Router, type Request, type Response } from 'express';

import {
  createTenant,
  getConversationBySlug,
  getTenantTree,
  getTenantUser,
  getTenantWhatsappByTenant,
  listConversations,
  listTenantUsers,
  TenantRow,
  TenantTreePayload,
  TenantUserPayload,
  TenantUserRole,
  TenantUserRow,
  TenantWhatsappInsert,
  TENANT_USER_ROLES,
  upsertTenantTree,
  upsertTenantUser,
  upsertTenantWhatsapp,
} from '../repositories/conversationsRepo';
import { requireSupabaseAuth, type SupabaseAuthenticatedRequest } from '../middlewares/supabaseAuth';
import { tenantTreeSchema } from '../lib/tenantTree';
import { z } from 'zod';

export const protectedRouter = Router();

protectedRouter.use(requireSupabaseAuth);

protectedRouter.get('/me', (req: Request, res: Response) => {
  const { supabaseUser } = req as SupabaseAuthenticatedRequest;
  res.json({ ok: true, user: supabaseUser });
});

protectedRouter.get('/tenants/:tenantId/conversations', async (req: Request<{ tenantId: string }>, res: Response) => {
  const tenantId = req.params.tenantId;
  const membership = await requireTenantRole(
    toAuthRequest(req),
    res,
    tenantId,
    ['tenant_admin', 'agent', 'viewer'] as TenantUserRole[],
  );
  if (!membership) return;
  const limit = Number(req.query.limit ?? 25);
  const offset = Number(req.query.offset ?? 0);
  try {
    const conversations = await listConversations({ tenantId, limit, offset });
    res.json({ ok: true, data: { conversations } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'could not list conversations';
    res.status(500).json({ ok: false, error: { message } });
  }
});

protectedRouter.get(
  '/tenants/:tenantId/conversations/:slug',
  async (req: Request<{ tenantId: string; slug: string }>, res: Response) => {
  const tenantId = req.params.tenantId;
  const slug = req.params.slug;
  const membership = await requireTenantRole(
    toAuthRequest(req),
    res,
    tenantId,
    ['tenant_admin', 'agent', 'viewer'] as TenantUserRole[],
  );
  if (!membership) return;

  try {
    const conversation = await getConversationBySlug(tenantId, slug);
    if (!conversation) {
      res.status(404).json({ ok: false, error: { message: 'conversation not found' } });
      return;
    }
    res.json({ ok: true, data: { conversation } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'could not fetch conversation';
    res.status(500).json({ ok: false, error: { message } });
  }
});

protectedRouter.get('/tenants/:tenantId/whatsapp', async (req: Request<{ tenantId: string }>, res: Response) => {
  const tenantId = req.params.tenantId;
  try {
    const tenantWhatsapp = await getTenantWhatsappByTenant(tenantId);
    if (!tenantWhatsapp) {
      res.status(404).json({ ok: false, error: { message: 'tenant whatsapp info not found' } });
      return;
    }
    res.json({ ok: true, data: { tenantWhatsapp } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'could not fetch tenant whatsapp info';
    res.status(500).json({ ok: false, error: { message } });
  }
});

const tenantCreateSchema = z.object({
  name: z.string().min(1),
});

const tenantWhatsappSchema = z.object({
  phoneNumberId: z.string().min(1),
  accessToken: z.string().min(1).optional(),
  verifyToken: z.string().min(1).optional(),
  metaAppSecret: z.string().min(1).optional(),
});

protectedRouter.post('/tenants', async (req: Request, res: Response) => {
  const parsed = tenantCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: { message: 'invalid payload', issues: parsed.error.format() },
    });
    return;
  }

  try {
    const tenant: TenantRow = await createTenant(parsed.data.name);
    const membership = await upsertTenantUser({
      tenant_id: tenant.id,
      supabase_user_id: toAuthRequest(req).supabaseUser.id,
      role: 'tenant_admin',
    });
    res.status(201).json({ ok: true, data: { tenant } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'could not create tenant';
    res.status(500).json({ ok: false, error: { message } });
  }
});

protectedRouter.post('/tenants/:tenantId/whatsapp', async (req: Request<{ tenantId: string }>, res: Response) => {
  const tenantId = req.params.tenantId;
  const membership = await requireTenantRole(
    toAuthRequest(req),
    res,
    tenantId,
    ['tenant_admin'] as TenantUserRole[],
  );
  if (!membership) return;
  const parsed = tenantWhatsappSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: { message: 'invalid payload', issues: parsed.error.format() },
    });
    return;
  }

  const payload: TenantWhatsappInsert = {
    tenant_id: tenantId,
    phone_number_id: parsed.data.phoneNumberId,
    access_token: parsed.data.accessToken ?? null,
    verify_token: parsed.data.verifyToken ?? null,
    meta_app_secret: parsed.data.metaAppSecret ?? null,
  };

  try {
    const tenantWhatsapp = await upsertTenantWhatsapp(payload);
    res.status(201).json({ ok: true, data: { tenantWhatsapp } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'could not save tenant';
    res.status(500).json({ ok: false, error: { message } });
  }
});

protectedRouter
  .route('/tenants/:tenantId/tree')
  .get(async (req, res) => {
    const tenantId = req.params.tenantId;
    const membership = await requireTenantRole(
      toAuthRequest(req),
      res,
      tenantId,
      ['tenant_admin'] as TenantUserRole[],
    );
    if (!membership) return;
    try {
      const tenantTree = await getTenantTree(tenantId);
      if (!tenantTree) {
        res.status(404).json({ ok: false, error: { message: 'tree not found' } });
        return;
      }
      res.json({ ok: true, data: { tenantTree } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'could not fetch tree';
      res.status(500).json({ ok: false, error: { message } });
    }
  })
  .put(async (req, res) => {
    const tenantId = req.params.tenantId;
    const membership = await requireTenantRole(
      toAuthRequest(req),
      res,
      tenantId,
      ['tenant_admin'] as TenantUserRole[],
    );
    if (!membership) return;
    const parsed = tenantTreeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: { message: 'invalid payload', issues: parsed.error.format() },
      });
      return;
    }

    const payload: TenantTreePayload = {
      tenant_id: tenantId,
      tree: parsed.data.tree,
      name: parsed.data.name ?? 'default',
      version: parsed.data.version ?? null,
    };

    try {
      const tenantTree = await upsertTenantTree(payload);
      res.json({ ok: true, data: { tenantTree } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'could not save tree';
      res.status(500).json({ ok: false, error: { message } });
    }
  });

const toAuthRequest = (req: Request): SupabaseAuthenticatedRequest =>
  req as unknown as SupabaseAuthenticatedRequest;

const tenantMemberSchema = z.object({
  supabaseUserId: z.string().min(1),
  role: z.enum(TENANT_USER_ROLES),
});

async function requireTenantRole(
  req: SupabaseAuthenticatedRequest,
  res: Response,
  tenantId: string,
  allowedRoles: TenantUserRole[],
): Promise<TenantUserRow | null> {
  const supabaseUserId = req.supabaseUser.id;
  if (!supabaseUserId) {
    res.status(403).json({ ok: false, error: { message: 'user id missing' } });
    return null;
  }

  try {
    const membership = await getTenantUser(tenantId, supabaseUserId);
    if (!membership || !allowedRoles.includes(membership.role)) {
      res.status(403).json({ ok: false, error: { message: 'forbidden' } });
      return null;
    }
    return membership;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'could not verify membership';
    res.status(500).json({ ok: false, error: { message } });
    return null;
  }
}

protectedRouter.get('/tenants/:tenantId/members', async (req: Request<{ tenantId: string }>, res: Response) => {
  const tenantId = req.params.tenantId;
  const membership = await requireTenantRole(
    toAuthRequest(req),
    res,
    tenantId,
    ['tenant_admin', 'agent'] as TenantUserRole[],
  );
  if (!membership) return;

  try {
    const members = await listTenantUsers(tenantId);
    res.json({ ok: true, data: { members } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'could not list members';
    res.status(500).json({ ok: false, error: { message } });
  }
});

protectedRouter.post('/tenants/:tenantId/members', async (req: Request<{ tenantId: string }>, res: Response) => {
  const tenantId = req.params.tenantId;
  const membership = await requireTenantRole(
    toAuthRequest(req),
    res,
    tenantId,
    ['tenant_admin'] as TenantUserRole[],
  );
  if (!membership) return;

  const parsed = tenantMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: { message: 'invalid payload', issues: parsed.error.format() },
    });
    return;
  }

  const payload: TenantUserPayload = {
    tenant_id: tenantId,
    supabase_user_id: parsed.data.supabaseUserId,
    role: parsed.data.role,
  };

  try {
    const member = await upsertTenantUser(payload);
    res.status(201).json({ ok: true, data: { member } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'could not upsert member';
    res.status(500).json({ ok: false, error: { message } });
  }
});
