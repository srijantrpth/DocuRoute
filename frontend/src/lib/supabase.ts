import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env, supabaseConfigured } from "./env";

/**
 * Null until the keys are present, so the app can render a setup notice instead of
 * crashing on a blank .env. Every call site guards on `supabaseConfigured`.
 */
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "docuroute.auth",
      },
    })
  : null;

export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
