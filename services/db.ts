import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Creates and returns an administrative Supabase client using the service role key.
 * This bypasses RLS policies and is strictly for secure server-side operations.
 */
export function getAdminDbClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      'getAdminDbClient: expected NEXT_PUBLIC_SUPABASE_URL, got undefined',
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      'getAdminDbClient: expected SUPABASE_SERVICE_ROLE_KEY, got undefined',
    );
  }

  // Set persistSession false to prevent token leakage in server environment
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}
