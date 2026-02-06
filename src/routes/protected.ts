import { Router, type Request, type Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';

import {
  countConversations,
  createTenantInvitation,
  createTenant,
  getConversationBySlug,
  getTenantInvitationByTokenHash,
  getTenantTree,
  getTenantUser,
  listTenantInvitations,
  type TenantWhatsappRow,
  markTenantInvitationStatus,
  getTenantWhatsappByTenant,
  listConversations,
  listTenantUsers,
  hasUserRoleInAnyTenant,
  revokeTenantInvitation,
  TenantRow,
  TenantInvitationRow,
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
import {
  requireSupabaseAuth,
  type SupabaseAuthenticatedRequest,
} from '../middlewares/supabaseAuth';
import { tenantTreeSchema } from '../lib/tenantTree';
import { getSupabaseAdmin } from '../lib/supabaseAdmin';
import { z } from 'zod';

export const protectedRouter = Router();

protectedRouter.use(requireSupabaseAuth);

const conversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const userUidParamsSchema = z.object({
  uid: z.string().uuid(),
});

type PublicUserResponse = {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
};

type TenantWhatsappPublicResponse = {
  id: string;
  tenant_id: string;
  phone_number_id: string;
  graph_version: string | null;
  has_access_token: boolean;
  has_verify_token: boolean;
  has_meta_app_secret: boolean;
  created_at: string;
};

type TenantInvitationPublicResponse = {
  id: string;
  tenant_id: string;
  email: string;
  role: TenantUserRole;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

function toTenantWhatsappPublicResponse(row: TenantWhatsappRow): TenantWhatsappPublicResponse {
  const record = row as TenantWhatsappRow & { graph_version?: string | null };
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    phone_number_id: row.phone_number_id,
    graph_version: record.graph_version ?? null,
    has_access_token: Boolean(row.access_token),
    has_verify_token: Boolean(row.verify_token),
    has_meta_app_secret: Boolean(row.meta_app_secret),
    created_at: row.created_at,
  };
}

function toTenantInvitationPublicResponse(row: TenantInvitationRow): TenantInvitationPublicResponse {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    email: row.email,
    role: row.role,
    status: row.status,
    invited_by: row.invited_by,
    expires_at: row.expires_at,
    accepted_at: row.accepted_at ?? null,
    created_at: row.created_at,
  };
}

function toPublicUserResponse(user: {
  id: string;
  email?: string | null;
  phone?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
}): PublicUserResponse {
  return {
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    created_at: user.created_at ?? null,
    last_sign_in_at: user.last_sign_in_at ?? null,
    email_confirmed_at: user.email_confirmed_at ?? null,
  };
}

protectedRouter.get('/me', (req: Request, res: Response) => {
  const { supabaseUser } = req as SupabaseAuthenticatedRequest;
  res.json({ ok: true, user: supabaseUser });
});

protectedRouter.get('/users/:uid', async (req: Request<{ uid: string }>, res: Response) => {
  const parsed = userUidParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: { message: 'invalid uid', issues: parsed.error.format() },
    });
    return;
  }

  try {
    const requesterId = toAuthRequest(req).supabaseUser.id;
    const isTenantAdmin = await hasUserRoleInAnyTenant(requesterId, 'tenant_admin');
    if (!isTenantAdmin) {
      res.status(403).json({ ok: false, error: { message: 'forbidden' } });
      return;
    }

    const supabase = await getSupabaseAdmin();
    const { data, error } = await supabase.auth.admin.getUserById(parsed.data.uid);
    if (error || !data?.user) {
      res.status(404).json({ ok: false, error: { message: 'user not found' } });
      return;
    }

    res.json({ ok: true, data: { user: toPublicUserResponse(data.user) } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'could not fetch user';
    res.status(500).json({ ok: false, error: { message } });
  }
});

protectedRouter.get(
  '/tenants/:tenantId/conversations',
  async (req: Request<{ tenantId: string }>, res: Response) => {
    const tenantId = req.params.tenantId;
    const membership = await requireTenantRole(toAuthRequest(req), res, tenantId, [
      'tenant_admin',
      'agent',
      'viewer',
    ] as TenantUserRole[]);
    if (!membership) return;
    const query = conversationsQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({
        ok: false,
        error: { message: 'invalid query params', issues: query.error.format() },
      });
      return;
    }

    const { limit, offset } = query.data;
    try {
      const [conversations, total] = await Promise.all([
        listConversations({ tenantId, limit, offset }),
        countConversations({ tenantId }),
      ]);
      res.json({
        ok: true,
        data: {
          conversations,
          pagination: {
            limit,
            offset,
            total,
            hasMore: offset + conversations.length < total,
          },
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'could not list conversations';
      res.status(500).json({ ok: false, error: { message } });
    }
  },
);

protectedRouter.get(
  '/tenants/:tenantId/conversations/:slug',
  async (req: Request<{ tenantId: string; slug: string }>, res: Response) => {
    const tenantId = req.params.tenantId;
    const slug = req.params.slug;
    const membership = await requireTenantRole(toAuthRequest(req), res, tenantId, [
      'tenant_admin',
      'agent',
      'viewer',
    ] as TenantUserRole[]);
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
  },
);

protectedRouter.get(
  '/tenants/:tenantId/whatsapp',
  async (req: Request<{ tenantId: string }>, res: Response) => {
    const tenantId = req.params.tenantId;
    const membership = await requireTenantRole(toAuthRequest(req), res, tenantId, [
      'tenant_admin',
    ] as TenantUserRole[]);
    if (!membership) return;

    try {
      const tenantWhatsapp = await getTenantWhatsappByTenant(tenantId);
      if (!tenantWhatsapp) {
        res.status(404).json({ ok: false, error: { message: 'tenant whatsapp info not found' } });
        return;
      }
      res.json({ ok: true, data: { tenantWhatsapp: toTenantWhatsappPublicResponse(tenantWhatsapp) } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'could not fetch tenant whatsapp info';
      res.status(500).json({ ok: false, error: { message } });
    }
  },
);

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
    await upsertTenantUser({
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

protectedRouter.post(
  '/tenants/:tenantId/whatsapp',
  async (req: Request<{ tenantId: string }>, res: Response) => {
    const tenantId = req.params.tenantId;
    const membership = await requireTenantRole(toAuthRequest(req), res, tenantId, [
      'tenant_admin',
    ] as TenantUserRole[]);
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
      res
        .status(201)
        .json({ ok: true, data: { tenantWhatsapp: toTenantWhatsappPublicResponse(tenantWhatsapp) } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'could not save tenant';
      res.status(500).json({ ok: false, error: { message } });
    }
  },
);

protectedRouter
  .route('/tenants/:tenantId/tree')
  .get(async (req: Request<{ tenantId: string }>, res: Response) => {
    const tenantId = req.params.tenantId;
    const membership = await requireTenantRole(toAuthRequest(req), res, tenantId, [
      'tenant_admin',
    ] as TenantUserRole[]);
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
  .put(async (req: Request<{ tenantId: string }>, res: Response) => {
    const tenantId = req.params.tenantId;
    const membership = await requireTenantRole(toAuthRequest(req), res, tenantId, [
      'tenant_admin',
    ] as TenantUserRole[]);
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

const tenantInvitationCreateSchema = z.object({
  email: z.string().email(),
  role: z.enum(TENANT_USER_ROLES).default('agent'),
  expiresInHours: z.coerce.number().int().min(1).max(24 * 14).default(72),
});

const tenantInvitationAcceptParamsSchema = z.object({
  token: z.string().min(20),
});

const tenantInvitationParamsSchema = z.object({
  tenantId: z.string().uuid(),
  invitationId: z.string().uuid(),
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

protectedRouter.get(
  '/tenants/:tenantId/members',
  async (req: Request<{ tenantId: string }>, res: Response) => {
    const tenantId = req.params.tenantId;
    const membership = await requireTenantRole(toAuthRequest(req), res, tenantId, [
      'tenant_admin',
      'agent',
    ] as TenantUserRole[]);
    if (!membership) return;

    try {
      const members = await listTenantUsers(tenantId);
      res.json({ ok: true, data: { members } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'could not list members';
      res.status(500).json({ ok: false, error: { message } });
    }
  },
);

protectedRouter.post(
  '/tenants/:tenantId/members',
  async (req: Request<{ tenantId: string }>, res: Response) => {
    const tenantId = req.params.tenantId;
    const membership = await requireTenantRole(toAuthRequest(req), res, tenantId, [
      'tenant_admin',
    ] as TenantUserRole[]);
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
  },
);

protectedRouter.get(
  '/tenants/:tenantId/invitations',
  async (req: Request<{ tenantId: string }>, res: Response) => {
    const tenantId = req.params.tenantId;
    const membership = await requireTenantRole(toAuthRequest(req), res, tenantId, [
      'tenant_admin',
    ] as TenantUserRole[]);
    if (!membership) return;

    try {
      const invitations = await listTenantInvitations(tenantId);
      const now = Date.now();
      const normalizedInvitations = await Promise.all(
        invitations.map(async (invitation) => {
          if (invitation.status === 'pending' && new Date(invitation.expires_at).getTime() <= now) {
            const expired = await markTenantInvitationStatus(invitation.id, 'expired');
            return expired ?? invitation;
          }
          return invitation;
        }),
      );

      res.json({
        ok: true,
        data: { invitations: normalizedInvitations.map(toTenantInvitationPublicResponse) },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'could not list invitations';
      res.status(500).json({ ok: false, error: { message } });
    }
  },
);

protectedRouter.post(
  '/tenants/:tenantId/invitations',
  async (req: Request<{ tenantId: string }>, res: Response) => {
    const tenantId = req.params.tenantId;
    const authReq = toAuthRequest(req);
    const membership = await requireTenantRole(authReq, res, tenantId, ['tenant_admin'] as TenantUserRole[]);
    if (!membership) return;

    const parsed = tenantInvitationCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: { message: 'invalid payload', issues: parsed.error.format() },
      });
      return;
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + parsed.data.expiresInHours * 60 * 60 * 1000).toISOString();

    try {
      const invitation = await createTenantInvitation({
        tenant_id: tenantId,
        email: parsed.data.email,
        role: parsed.data.role,
        token_hash: tokenHash,
        invited_by: authReq.supabaseUser.id,
        expires_at: expiresAt,
      });

      res.status(201).json({
        ok: true,
        data: {
          invitation: toTenantInvitationPublicResponse(invitation),
          inviteToken: rawToken,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'could not create invitation';
      if (message.includes('tenant_invitations_pending_tenant_email_unique')) {
        res.status(409).json({
          ok: false,
          error: { message: 'there is already a pending invitation for this email' },
        });
        return;
      }
      res.status(500).json({ ok: false, error: { message } });
    }
  },
);

protectedRouter.delete(
  '/tenants/:tenantId/invitations/:invitationId',
  async (req: Request<{ tenantId: string; invitationId: string }>, res: Response) => {
    const parsedParams = tenantInvitationParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({
        ok: false,
        error: { message: 'invalid params', issues: parsedParams.error.format() },
      });
      return;
    }

    const { tenantId, invitationId } = parsedParams.data;
    const membership = await requireTenantRole(toAuthRequest(req), res, tenantId, ['tenant_admin'] as TenantUserRole[]);
    if (!membership) return;

    try {
      const invitation = await revokeTenantInvitation(tenantId, invitationId);
      if (!invitation) {
        res.status(404).json({ ok: false, error: { message: 'pending invitation not found' } });
        return;
      }
      res.json({ ok: true, data: { invitation: toTenantInvitationPublicResponse(invitation) } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'could not revoke invitation';
      res.status(500).json({ ok: false, error: { message } });
    }
  },
);

protectedRouter.post(
  '/invitations/:token/accept',
  async (req: Request<{ token: string }>, res: Response) => {
    const parsed = tenantInvitationAcceptParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: { message: 'invalid token', issues: parsed.error.format() },
      });
      return;
    }

    const authReq = toAuthRequest(req);
    const authEmail = (authReq.supabaseUser.email ?? '').toLowerCase().trim();
    if (!authEmail) {
      res.status(400).json({ ok: false, error: { message: 'authenticated user has no email' } });
      return;
    }

    const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');

    try {
      const invitation = await getTenantInvitationByTokenHash(tokenHash);
      if (!invitation) {
        res.status(404).json({ ok: false, error: { message: 'invitation not found' } });
        return;
      }

      if (invitation.email.toLowerCase() !== authEmail) {
        res.status(403).json({ ok: false, error: { message: 'invitation email does not match authenticated user' } });
        return;
      }

      if (invitation.status !== 'pending') {
        res.status(409).json({ ok: false, error: { message: `invitation is already ${invitation.status}` } });
        return;
      }

      if (new Date(invitation.expires_at).getTime() <= Date.now()) {
        await markTenantInvitationStatus(invitation.id, 'expired');
        res.status(410).json({ ok: false, error: { message: 'invitation has expired' } });
        return;
      }

      const member = await upsertTenantUser({
        tenant_id: invitation.tenant_id,
        supabase_user_id: authReq.supabaseUser.id,
        role: invitation.role,
      });
      const acceptedAt = new Date().toISOString();
      const acceptedInvitation = await markTenantInvitationStatus(
        invitation.id,
        'accepted',
        acceptedAt,
      );

      res.json({
        ok: true,
        data: {
          member,
          invitation: toTenantInvitationPublicResponse(acceptedInvitation ?? invitation),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'could not accept invitation';
      res.status(500).json({ ok: false, error: { message } });
    }
  },
);
