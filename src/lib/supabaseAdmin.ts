import { env } from '../config/env';

import type { SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | undefined;

type SupabaseModule = typeof import('@supabase/supabase-js');

async function importSupabase(): Promise<SupabaseModule> {
  // Keep runtime import() when TypeScript emits CommonJS.
  return (await new Function("return import('@supabase/supabase-js')")()) as SupabaseModule;
}

export async function getSupabaseAdmin(): Promise<SupabaseClient> {
  if (cachedClient) return cachedClient;

  const { createClient } = await importSupabase();
  cachedClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cachedClient;
}
