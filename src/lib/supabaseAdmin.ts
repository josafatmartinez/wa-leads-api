import { env } from '../config/env';

import type { SupabaseClient } from '@supabase/supabase-js';

let cachedAdminClient: SupabaseClient | undefined;
let cachedAnonClient: SupabaseClient | undefined;

type SupabaseModule = typeof import('@supabase/supabase-js');

async function importSupabase(): Promise<SupabaseModule> {
  // Keep runtime import() when TypeScript emits CommonJS.
  return (await new Function("return import('@supabase/supabase-js')")()) as SupabaseModule;
}

function createClient(apiKey: string) {
  return importSupabase().then(({ createClient }) =>
    createClient(env.SUPABASE_URL, apiKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }),
  );
}

export async function getSupabaseAdmin(): Promise<SupabaseClient> {
  if (cachedAdminClient) return cachedAdminClient;
  cachedAdminClient = await createClient(env.SUPABASE_SERVICE_ROLE_KEY);
  return cachedAdminClient;
}

export async function getSupabaseAnonClient(): Promise<SupabaseClient> {
  if (cachedAnonClient) return cachedAnonClient;
  cachedAnonClient = await createClient(env.SUPABASE_ANON_KEY);
  return cachedAnonClient;
}
