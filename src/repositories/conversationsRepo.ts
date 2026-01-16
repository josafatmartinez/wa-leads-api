import { getSupabaseAdmin } from '../lib/supabaseAdmin';

export type TenantWhatsappRow = {
  id: string;
  tenant_id: string;
  phone_number_id: string;
  access_token: string | null;
  graph_version: string | null;
  created_at: string;
};

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
