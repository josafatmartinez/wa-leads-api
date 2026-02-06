-- Schema necesario para la app WA Leads API
-- Crea las tablas que utiliza el código para persistir inbounds, contactos de WhatsApp y conversaciones.

create extension if not exists "pgcrypto";

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists tenant_trees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  tree jsonb not null default '{"nodes": {}}'::jsonb,
  name text not null default 'default',
  version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_trees_tenant_unique unique (tenant_id),
  constraint tenant_trees_tree_is_object check (jsonb_typeof(tree) = 'object')
);

create table if not exists tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  supabase_user_id text not null,
  role text not null default 'agent',
  created_at timestamptz not null default now(),
  constraint tenant_users_unique unique (tenant_id, supabase_user_id),
  constraint tenant_users_role_check check (role in ('tenant_admin', 'agent', 'viewer'))
);

create table if not exists tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null check (length(trim(email)) > 0),
  role text not null default 'agent',
  token_hash text not null unique check (length(trim(token_hash)) > 0),
  status text not null default 'pending',
  invited_by text not null check (length(trim(invited_by)) > 0),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tenant_invitations_role_check check (role in ('tenant_admin', 'agent', 'viewer')),
  constraint tenant_invitations_status_check check (status in ('pending', 'accepted', 'revoked', 'expired')),
  constraint tenant_invitations_expiration_check check (expires_at > created_at),
  constraint tenant_invitations_accepted_at_check check (
    accepted_at is null or accepted_at >= created_at
  )
);

-- Identifica cada tenant y sus credenciales de WhatsApp Cloud.
create table if not exists tenant_whatsapp (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  phone_number_id text not null unique,
  access_token text,
  verify_token text,
  meta_app_secret text,
  created_at timestamptz not null default now(),
  constraint tenant_whatsapp_phone_number_not_blank check (length(trim(phone_number_id)) > 0)
);

-- Evita procesar mensajes entrantes duplicados.
create table if not exists wa_inbound_dedupe (
  message_id text primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Rastrea el estado de la conversación con cada cliente.
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_phone text not null check (length(trim(customer_phone)) > 0),
  current_node text,
  answers jsonb not null default '{}'::jsonb,
  slug text,
  handoff_to_human boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_inbound_at timestamptz,
  constraint conversations_tenant_customer_unique unique (tenant_id, customer_phone),
  constraint conversations_tenant_slug_unique unique (tenant_id, slug)
);

create index if not exists conversations_tenant_idx on conversations (tenant_id);
create index if not exists conversations_updated_at_idx on conversations (updated_at desc);
create index if not exists conversations_tenant_updated_at_idx on conversations (tenant_id, updated_at desc);
create index if not exists wa_inbound_dedupe_tenant_idx on wa_inbound_dedupe (tenant_id);
create index if not exists tenant_users_supabase_user_role_idx
  on tenant_users (supabase_user_id, role);
create index if not exists tenant_whatsapp_tenant_created_at_idx on tenant_whatsapp (tenant_id, created_at desc);
create index if not exists tenant_invitations_tenant_created_at_idx
  on tenant_invitations (tenant_id, created_at desc);
create unique index if not exists tenant_invitations_pending_tenant_email_unique
  on tenant_invitations (tenant_id, lower(email))
  where status = 'pending';
create unique index if not exists tenant_whatsapp_verify_token_unique
  on tenant_whatsapp (verify_token)
  where verify_token is not null;
