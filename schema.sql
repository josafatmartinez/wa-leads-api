-- Schema necesario para la app WA Leads API
-- Crea las tablas que utiliza el código para persistir inbounds, contactos de WhatsApp y conversaciones.

create extension if not exists "pgcrypto";

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
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
  constraint tenant_trees_tenant_unique unique (tenant_id)
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

-- Identifica cada tenant y sus credenciales de WhatsApp Cloud.
create table if not exists tenant_whatsapp (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  phone_number_id text not null unique,
  access_token text,
  verify_token text,
  meta_app_secret text,
  created_at timestamptz not null default now()
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
  customer_phone text not null,
  current_node text,
  answers jsonb,
  slug text,
  handoff_to_human boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  last_inbound_at timestamptz,
  constraint conversations_tenant_customer_unique unique (tenant_id, customer_phone),
  constraint conversations_tenant_slug_unique unique (tenant_id, slug)
);

create index if not exists conversations_tenant_idx on conversations (tenant_id);
create index if not exists wa_inbound_dedupe_tenant_idx on wa_inbound_dedupe (tenant_id);
