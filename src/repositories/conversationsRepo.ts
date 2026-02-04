import { getSupabaseAdmin } from '../lib/supabaseAdmin';
import type { TenantTreeDefinition } from '../lib/tenantTree';

export type TenantWhatsappRow = {
  id: string;
  tenant_id: string;
  phone_number_id: string;
  verify_token: string | null;
  meta_app_secret: string | null;
  access_token: string | null;
  created_at: string;
};

export type TenantWhatsappInsert = {
  tenant_id: string;
  phone_number_id: string;
  verify_token?: string | null;
  meta_app_secret?: string | null;
  access_token?: string | null;
};

export const TENANT_USER_ROLES = ['tenant_admin', 'agent', 'viewer'] as const;
export type TenantUserRole = (typeof TENANT_USER_ROLES)[number];

export type WaInboundDedupeRow = {
  message_id: string;
  tenant_id: string;
  created_at: string;
};

export type ConversationRow = {
  tenant_id: string;
  customer_phone: string;
  id?: string;
  created_at?: string;
  updated_at?: string | null;
  last_inbound_at?: string | null;
  current_node?: string | null;
  answers?: Record<string, unknown> | null;
  slug?: string | null;
  handoff_to_human?: boolean | null;
};

export type UpsertConversationPayload = Pick<ConversationRow, 'tenant_id' | 'customer_phone'> &
  Partial<
    Pick<
      ConversationRow,
      'current_node' | 'answers' | 'slug' | 'handoff_to_human' | 'last_inbound_at' | 'updated_at'
    >
  >;

export type UpdateConversationPatch = Partial<
  Pick<
    ConversationRow,
    'current_node' | 'answers' | 'slug' | 'handoff_to_human' | 'last_inbound_at' | 'updated_at'
  >
>;

function formatErrorContext(context: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return `${context}: ${message}`;
}

export async function findTenantByPhoneNumberId(
  phoneNumberId: string,
): Promise<TenantWhatsappRow | null> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('tenant_whatsapp')
    .select('*')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();

  if (error) throw new Error(formatErrorContext('findTenantByPhoneNumberId failed', error));
  return (data as TenantWhatsappRow | null) ?? null;
}

export async function findTenantByVerifyToken(
  token: string,
): Promise<TenantWhatsappRow | null> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('tenant_whatsapp')
    .select('*')
    .eq('verify_token', token)
    .maybeSingle();

  if (error) throw new Error(formatErrorContext('findTenantByVerifyToken failed', error));
  return (data as TenantWhatsappRow | null) ?? null;
}

export async function isDuplicateMessage(messageId: string): Promise<boolean> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('wa_inbound_dedupe')
    .select('message_id')
    .eq('message_id', messageId)
    .maybeSingle();

  if (error) throw new Error(formatErrorContext('isDuplicateMessage failed', error));
  return Boolean(data?.message_id);
}

export async function markMessageProcessed(messageId: string, tenantId: string): Promise<void> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from('wa_inbound_dedupe')
    .insert({ message_id: messageId, tenant_id: tenantId });

  if (error) throw new Error(formatErrorContext('markMessageProcessed failed', error));
}

export async function getConversation(
  tenantId: string,
  customerPhone: string,
): Promise<ConversationRow | null> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_phone', customerPhone)
    .maybeSingle();

  if (error) throw new Error(formatErrorContext('getConversation failed', error));
  return (data as ConversationRow | null) ?? null;
}

export async function upsertConversation(
  payload: UpsertConversationPayload,
): Promise<ConversationRow> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .upsert(payload, { onConflict: 'tenant_id,customer_phone' })
    .select('*')
    .single();

  if (error) throw new Error(formatErrorContext('upsertConversation failed', error));
  if (!data) throw new Error('upsertConversation failed: missing data');
  return data as ConversationRow;
}

export async function updateConversation(
  tenantId: string,
  customerPhone: string,
  patch: UpdateConversationPatch,
): Promise<ConversationRow | null> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('customer_phone', customerPhone)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(formatErrorContext('updateConversation failed', error));
  return (data as ConversationRow | null) ?? null;
}

export async function listConversations({
  tenantId,
  limit = 25,
  offset = 0,
}: {
  tenantId?: string;
  limit?: number;
  offset?: number;
}): Promise<ConversationRow[]> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { from, to } = buildRange(offset, limit);
  let builder = supabaseAdmin.from('conversations').select('*');
  if (tenantId) {
    builder = builder.eq('tenant_id', tenantId);
  }
  const { data, error } = await builder.range(from, to);
  if (error) throw new Error(formatErrorContext('listConversations failed', error));
  return (data as ConversationRow[] | null) ?? [];
}

function buildRange(offset: number, limit: number) {
  const normalizedOffset = Math.max(0, offset);
  const normalizedLimit = Math.max(1, limit);
  return { from: normalizedOffset, to: normalizedOffset + normalizedLimit - 1 };
}

export async function getConversationBySlug(
  tenantId: string,
  slug: string,
): Promise<ConversationRow | null> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw new Error(formatErrorContext('getConversationBySlug failed', error));
  return (data as ConversationRow | null) ?? null;
}

export async function getTenantWhatsappByTenant(
  tenantId: string,
): Promise<TenantWhatsappRow | null> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('tenant_whatsapp')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .maybeSingle();

  if (error) throw new Error(formatErrorContext('getTenantWhatsappByTenant failed', error));
  return (data as TenantWhatsappRow | null) ?? null;
}

export async function upsertTenantWhatsapp(
  payload: TenantWhatsappInsert,
): Promise<TenantWhatsappRow> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('tenant_whatsapp')
    .upsert(payload, { onConflict: 'phone_number_id' })
    .select('*')
    .single();

  if (error) throw new Error(formatErrorContext('upsertTenantWhatsapp failed', error));
  if (!data) throw new Error('upsertTenantWhatsapp failed: missing data');
  return data as TenantWhatsappRow;
}

export type TenantTreeRow = {
  id: string;
  tenant_id: string;
  tree: TenantTreeDefinition;
  name: string;
  version: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantTreePayload = {
  tenant_id: string;
  tree: TenantTreeDefinition;
  name?: string;
  version?: string | null;
};

export type TenantUserRow = {
  id: string;
  tenant_id: string;
  supabase_user_id: string;
  role: TenantUserRole;
  created_at: string;
};

export type TenantUserPayload = {
  tenant_id: string;
  supabase_user_id: string;
  role: TenantUserRole;
};

export type TenantRow = {
  id: string;
  name: string;
  created_at: string;
};

export async function getTenantTree(tenantId: string): Promise<TenantTreeRow | null> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('tenant_trees')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) throw new Error(formatErrorContext('getTenantTree failed', error));
  return (data as TenantTreeRow | null) ?? null;
}

export async function upsertTenantTree(payload: TenantTreePayload): Promise<TenantTreeRow> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('tenant_trees')
    .upsert(
      {
        ...payload,
        updated_at: new Date().toISOString(),
        tree: payload.tree,
      },
      { onConflict: 'tenant_id' },
    )
    .select('*')
    .single();

  if (error) throw new Error(formatErrorContext('upsertTenantTree failed', error));
  if (!data) throw new Error('upsertTenantTree failed: missing data');
  return data as TenantTreeRow;
}

export async function getTenantUser(
  tenantId: string,
  supabaseUserId: string,
): Promise<TenantUserRow | null> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('tenant_users')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('supabase_user_id', supabaseUserId)
    .maybeSingle();

  if (error) throw new Error(formatErrorContext('getTenantUser failed', error));
  return (data as TenantUserRow | null) ?? null;
}

export async function listTenantUsers(tenantId: string): Promise<TenantUserRow[]> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('tenant_users')
    .select('*')
    .eq('tenant_id', tenantId);

  if (error) throw new Error(formatErrorContext('listTenantUsers failed', error));
  return (data as TenantUserRow[] | null) ?? [];
}

export async function upsertTenantUser(payload: TenantUserPayload): Promise<TenantUserRow> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('tenant_users')
    .upsert(payload, { onConflict: 'tenant_id,supabase_user_id' })
    .select('*')
    .single();

  if (error) throw new Error(formatErrorContext('upsertTenantUser failed', error));
  if (!data) throw new Error('upsertTenantUser failed: missing data');
  return data as TenantUserRow;
}

export async function createTenant(name: string): Promise<TenantRow> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .insert({ name })
    .select('*')
    .single();

  if (error) throw new Error(formatErrorContext('createTenant failed', error));
  if (!data) throw new Error('createTenant failed: missing data');
  return data as TenantRow;
}
