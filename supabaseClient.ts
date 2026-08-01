import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Environment variables are injected at build time by Vercel (free tier)
// or read from a local .env.local file during development.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly in dev so misconfiguration is caught early, but avoid
  // throwing during static export/build when env vars may not be present.
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.warn(
      '[Odd Saint] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Add them to .env.local before running the app.'
    );
  }
}

// Single shared client instance (singleton) — avoids re-instantiating
// the SDK on every render, keeping memory usage low on mobile devices.
export const supabase: SupabaseClient = createClient(
  supabaseUrl ?? '',
  supabaseAnonKey ?? '',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

/** Convenience helper: get the currently signed-in user, or null. */
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

/** Convenience helper: sign out and clear the local session. */
export async function signOut() {
  await supabase.auth.signOut();
}
