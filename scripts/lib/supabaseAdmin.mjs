// ---------------------------------------------------------------------------
// Service-role Supabase client — used ONLY by the backend scripts running in
// GitHub Actions. The service role key bypasses Row Level Security, which is
// exactly why it must never be shipped to the browser or committed to the
// repo — it lives solely as a GitHub Actions secret (SUPABASE_SERVICE_ROLE_KEY).
// ---------------------------------------------------------------------------
import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. ' +
        'Add both as GitHub Actions secrets.'
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
